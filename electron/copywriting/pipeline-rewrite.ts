import type { AIConfig, RewriteInput, PipelineProgress } from './types'
import { chat } from './api'

type ProgressCallback = (progress: PipelineProgress) => void

const TOTAL_STEPS = 5

export async function runRewritePipeline(
  config: AIConfig,
  input: RewriteInput,
  onProgress: ProgressCallback
): Promise<{ results: string[] }> {
  // ===== Step 1: analyze_original =====
  emitProgress(onProgress, 'rewrite', 'analyze_original', 1, TOTAL_STEPS, 'running', '正在分析原文结构...')

  const analysisPrompt = buildAnalyzePrompt(input)
  const analysis = await chat(analysisPrompt, config, 0.7)

  emitProgress(onProgress, 'rewrite', 'analyze_original', 1, TOTAL_STEPS, 'completed', '原文分析完成')

  // ===== Step 2: rewrite_strategy =====
  emitProgress(onProgress, 'rewrite', 'rewrite_strategy', 2, TOTAL_STEPS, 'running', '正在制定改写策略...')

  const strategyPrompt = buildStrategyPrompt(input, analysis)
  const strategy = await chat(strategyPrompt, config, 0.7)

  emitProgress(onProgress, 'rewrite', 'rewrite_strategy', 2, TOTAL_STEPS, 'completed', '改写策略制定完成')

  // ===== Step 3: 三路并行改写 =====
  emitProgress(onProgress, 'rewrite', 'parallel_rewrites', 3, TOTAL_STEPS, 'running', '正在生成三条改写文案...')

  const [painDraft, sceneDraft, crowdDraft] = await Promise.all([
    chat(buildPainPointPrompt(input, strategy), config, 0.8),
    chat(buildScenePrompt(input, strategy), config, 0.8),
    chat(buildCrowdPrompt(input, strategy), config, 0.8),
  ])

  emitProgress(onProgress, 'rewrite', 'parallel_rewrites', 3, TOTAL_STEPS, 'completed', '三条改写文案生成完成')

  // ===== Step 4: finalise_rewrites =====
  emitProgress(onProgress, 'rewrite', 'finalise_rewrites', 4, TOTAL_STEPS, 'running', '正在审校优化...')

  const finalPrompt = buildFinalisePrompt(input, strategy, painDraft, sceneDraft, crowdDraft)
  const finalText = await chat(finalPrompt, config, 0.5)

  emitProgress(onProgress, 'rewrite', 'finalise_rewrites', 4, TOTAL_STEPS, 'completed', '审校完成')

  // ===== Step 5: 解析最终结果 =====
  emitProgress(onProgress, 'rewrite', 'parse_results', 5, TOTAL_STEPS, 'running', '正在整理结果...')

  const results = parseFinalOutput(finalText, painDraft, sceneDraft, crowdDraft)

  emitProgress(onProgress, 'rewrite', 'parse_results', 5, TOTAL_STEPS, 'completed', '改写完成', results)

  return { results }
}

// ==================== Prompt Builders ====================

function buildAnalyzePrompt(input: RewriteInput) {
  const productSection = input.productInfo
    ? `\n产品/品牌信息：${input.productInfo}`
    : ''
  const extraSection = input.extraRequirements
    ? `\n额外要求：${input.extraRequirements}`
    : ''

  return [
    {
      role: 'system' as const,
      content: `你是一位千川信息流文案分析专家。请对以下原始文案进行结构化分析。

请完成以下分析：
- 文案结构拆解（开头钩子 / 中间论证 / 结尾CTA）
- 开头钩子效果评估（是否能在3秒内抓住注意力）
- 痛点/场景/人群角度的运用分析
- CTA 的自然度和转化力
- 合规风险排查（极限词、过度承诺、违规表述）
- 可优化点（至少3个具体方向）
- 必须保留的优点（至少2个有效元素）

输出格式为结构化要点，每项简洁表达。`,
    },
    {
      role: 'user' as const,
      content: `请分析以下千川信息流文案：\n\n${input.originalCopy}${productSection}${extraSection}`,
    },
  ]
}

function buildStrategyPrompt(input: RewriteInput, analysis: string) {
  const extraSection = input.extraRequirements
    ? `\n额外要求：${input.extraRequirements}`
    : ''

  return [
    {
      role: 'system' as const,
      content: `你是一位千川投放策略专家。基于以下原文案分析报告和用户需求，制定一份精准的改写策略。

请制定改写策略，包含：
- 保留元素清单（原文案中必须保留的有效信息/话术/关键词）
- 优化方向（至少3个具体优化点，按优先级排列）
- 结构框架（明确开头→中间→结尾各段的改写方向，保留原文案核心结构）
- 三种角度切入点（痛点型/场景型/人群共鸣型各一句话概括方向）

注意：改写应保留原文案的核心结构框架（开头钩子→中间论证→结尾CTA），在表达方式、语气、合规性上优化，而非推翻重写。`,
    },
    {
      role: 'user' as const,
      content: `原文分析：\n${analysis}\n\n原始文案：\n${input.originalCopy}${extraSection}`,
    },
  ]
}

function buildPainPointPrompt(input: RewriteInput, strategy: string) {
  return [
    {
      role: 'system' as const,
      content: `你是一位擅长痛点共鸣的抖音千川文案写手。请根据以下改写策略和原始输入，对原文案进行痛点型改写。

要求：
- 保留原文案的核心结构框架和有效元素，在此基础上优化
- 强化痛点直击角度，开头3秒内戳中用户核心痛点
- 优化表达方式和语气，使其更真实、有代入感
- 字数：120–200字，适合30–40秒口播
- 包含自然的CTA（如点击下方链接/购物车）
- 避免极限词、过度承诺、不合规表述
- 仅输出一条完整改写文案，不附加任何说明`,
    },
    {
      role: 'user' as const,
      content: `原始文案：\n${input.originalCopy}\n\n改写策略：\n${strategy}`,
    },
  ]
}

function buildScenePrompt(input: RewriteInput, strategy: string) {
  return [
    {
      role: 'system' as const,
      content: `你是一位擅长场景化短视频叙事的内容创作者。请根据以下改写策略和原始输入，对原文案进行场景型改写。

要求：
- 保留原文案的核心结构框架和有效元素，在此基础上优化
- 强化使用场景代入感，以真实生活场景自然引出产品
- 优化表达方式，使其更生活化、自然
- 字数：120–200字，适合30–40秒口播
- 包含自然的CTA（如点击购物车/评论区链接）
- 避免极限词、过度承诺、不合规表述
- 仅输出一条完整改写文案，不附加任何说明`,
    },
    {
      role: 'user' as const,
      content: `原始文案：\n${input.originalCopy}\n\n改写策略：\n${strategy}`,
    },
  ]
}

function buildCrowdPrompt(input: RewriteInput, strategy: string) {
  return [
    {
      role: 'system' as const,
      content: `你是一位擅长圈层语言和人群心理的抖音文案专家。请根据以下改写策略和原始输入，对原文案进行人群共鸣型改写。

要求：
- 保留原文案的核心结构框架和有效元素，在此基础上优化
- 强化目标人群身份共鸣感，使用该人群熟悉的语言风格
- 营造"我们这样的人都在用"或"终于有人懂我们了"的认同感
- 字数：120–200字，适合30–40秒口播
- 包含自然的CTA
- 避免极限词、过度承诺、不合规表述
- 仅输出一条完整改写文案，不附加任何说明`,
    },
    {
      role: 'user' as const,
      content: `原始文案：\n${input.originalCopy}\n\n改写策略：\n${strategy}`,
    },
  ]
}

function buildFinalisePrompt(
  input: RewriteInput,
  strategy: string,
  painDraft: string,
  sceneDraft: string,
  crowdDraft: string
) {
  return [
    {
      role: 'system' as const,
      content: `你是一位千川投放效果优化师，负责将三条不同风格的改写文案整合优化为最终发布版本。

请完成以下工作：
- 逐条优化，保留各自的核心风格，但强化千川流量规则（避免极限词、过度承诺、不合规表述）
- 对比原文案，确保改写版保留了原文的有效元素和核心信息
- 统一每条文案的开头格式：一条为"痛点抓眼型"，一条为"场景代入型"，一条为"人群识别型"，并在每条前标注类型
- 每条文案最终字数控制在120–200字之间
- 确保每条都包含明确的行动呼吁（CTA），且CTA位置自然不突兀

最终输出三条完整的改写文案，每条用三个等号（===）隔开。只输出文案，不输出任何额外说明。`,
    },
    {
      role: 'user' as const,
      content: `三条改写草稿：\n痛点型：${painDraft}\n场景型：${sceneDraft}\n人群共鸣型：${crowdDraft}\n\n原始文案：\n${input.originalCopy}\n\n改写策略：\n${strategy}`,
    },
  ]
}

// ==================== Output Parser ====================

function parseFinalOutput(
  finalText: string,
  painDraft: string,
  sceneDraft: string,
  crowdDraft: string
): string[] {
  // 尝试用 === 分隔
  const parts = finalText.split(/={3,}/).map((s) => s.trim()).filter(Boolean)

  if (parts.length >= 3) {
    return parts.slice(0, 3).map(cleanVersion)
  }

  // 尝试用空行分隔
  const doubleNewline = finalText.split(/\n{2,}/).filter((s) => s.trim().length > 20)
  if (doubleNewline.length >= 3) {
    return doubleNewline.slice(0, 3).map(cleanVersion)
  }

  // 兜底：使用原始三条草稿
  return [cleanVersion(painDraft), cleanVersion(sceneDraft), cleanVersion(crowdDraft)]
}

function cleanVersion(text: string): string {
  return text
    .replace(/^(痛点抓眼型|场景代入型|人群识别型|痛点型|场景型|人群共鸣型)[：:]\s*/i, '')
    .replace(/^[#\-\*\d\.\s]+/, '')
    .trim()
}

// ==================== Helpers ====================

function emitProgress(
  onProgress: ProgressCallback,
  mode: 'rewrite',
  step: string,
  stepIndex: number,
  totalSteps: number,
  status: 'running' | 'completed' | 'error',
  message: string,
  results?: string[]
) {
  onProgress({ mode, step, stepIndex, totalSteps, status, message, results })
}
