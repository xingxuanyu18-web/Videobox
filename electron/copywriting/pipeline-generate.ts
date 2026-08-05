import type { AIConfig, GenerateInput, PipelineProgress } from './types'
import { chat } from './api'

type ProgressCallback = (progress: PipelineProgress) => void

const TOTAL_STEPS = 3

export async function runGeneratePipeline(
  config: AIConfig,
  input: GenerateInput,
  onProgress: ProgressCallback
): Promise<{ results: string[] }> {
  // ===== Step 1: creative_strategy =====
  emitProgress(onProgress, 'generate', 'creative_strategy', 1, TOTAL_STEPS, 'running', '正在制定创意策略...')

  const strategyPrompt = buildCreativeStrategyPrompt(input)
  const strategy = await chat(strategyPrompt, config, 0.7)

  emitProgress(onProgress, 'generate', 'creative_strategy', 1, TOTAL_STEPS, 'completed', '创意策略制定完成')

  // ===== Step 2: write_copies =====
  emitProgress(onProgress, 'generate', 'write_copies', 2, TOTAL_STEPS, 'running', '正在撰写三条文案...')

  const copyPrompt = buildWriteCopiesPrompt(strategy)
  const drafts = await chat(copyPrompt, config, 0.8)

  emitProgress(onProgress, 'generate', 'write_copies', 2, TOTAL_STEPS, 'completed', '三条文案撰写完成')

  // ===== Step 3: review_optimize =====
  emitProgress(onProgress, 'generate', 'review_optimize', 3, TOTAL_STEPS, 'running', '正在审校优化...')

  const reviewPrompt = buildReviewOptimizePrompt(input, strategy, drafts)
  const finalText = await chat(reviewPrompt, config, 0.5)

  emitProgress(onProgress, 'generate', 'review_optimize', 3, TOTAL_STEPS, 'completed', '审校完成')

  // 解析最终结果
  const results = parseFinalCopies(finalText, drafts)

  emitProgress(onProgress, 'generate', 'review_optimize', 3, TOTAL_STEPS, 'completed', '文案生成完成', results)

  return { results }
}

// ==================== Prompt Builders ====================

function buildCreativeStrategyPrompt(input: GenerateInput) {
  const goalSection = input.marketingGoal ? `\n营销目标：${input.marketingGoal}` : ''
  const toneSection = input.tone ? `\n期望调性：${input.tone}` : ''

  return [
    {
      role: 'system' as const,
      content: `你是一位专业的抖音千川信息流广告创意策略师。请基于以下项目信息，为千川信息流广告制定详细的创意策略。

请输出一份结构化策略，包含：
1. 目标受众的抖音使用习惯和内容偏好
2. 推荐的文案钩子类型（如痛点前置、数字吸引、剧情反转等）
3. 核心卖点提炼与关键词建议
4. 行动号召（CTA）方案
5. 三个差异化的文案方向（简要说明每条的核心切入角度）`,
    },
    {
      role: 'user' as const,
      content: `产品/服务：${input.product}\n目标人群：${input.targetAudience}\n核心卖点：${input.sellingPoints}${goalSection}${toneSection}`,
    },
  ]
}

function buildWriteCopiesPrompt(strategy: string) {
  return [
    {
      role: 'system' as const,
      content: `你是一位专业的抖音千川信息流文案创作者。请根据以下创意策略，撰写3条不同的抖音千川信息流文案。

要求：
- 每条文案100-300字
- 开头必须有强吸引力钩子（3-5秒内抓住注意力）
- 清晰呈现核心卖点
- 包含明确的行动号召
- 遵守抖音广告规范，避免极限词和虚假承诺
- 三个版本风格应明显不同，对应策略中给出的三个方向

先标注每条文案的适用方向，再附上文案正文。三条文案用三个等号（===）隔开。`,
    },
    {
      role: 'user' as const,
      content: `创意策略：\n${strategy}`,
    },
  ]
}

function buildReviewOptimizePrompt(
  input: GenerateInput,
  strategy: string,
  drafts: string
) {
  return [
    {
      role: 'system' as const,
      content: `你是一位资深的千川广告创意策略师。请审查并优化以下千川信息流文案草稿，确保其具备高点击率与转化潜力，并完全符合千川广告政策。

优化方向：
- 强化钩子的吸引力
- 让行动号召更直接有力
- 删除任何可能触发审核的违规或夸大表述
- 保证每条文案的差异化和记忆点

输出优化后的最终3条文案，每条用三个等号（===）隔开，格式如下：
[方向名称]
[优化后的文案内容]

只输出最终成品本身：不要开场白、不要复盘或说明、不要向用户提问。`,
    },
    {
      role: 'user' as const,
      content: `产品信息：${input.product}\n目标人群：${input.targetAudience}\n核心卖点：${input.sellingPoints}\n\n创意策略：\n${strategy}\n\n文案草稿：\n${drafts}`,
    },
  ]
}

// ==================== Output Parser ====================

function parseFinalCopies(finalText: string, drafts: string): string[] {
  // 尝试用 === 分隔
  const parts = finalText.split(/={3,}/).map((s) => s.trim()).filter(Boolean)

  if (parts.length >= 3) {
    return parts.slice(0, 3).map(cleanCopy)
  }

  // 尝试用空行分隔
  const doubleNewline = finalText.split(/\n{2,}/).filter((s) => s.trim().length > 20)
  if (doubleNewline.length >= 3) {
    return doubleNewline.slice(0, 3).map(cleanCopy)
  }

  // 兜底：使用草稿
  const draftParts = drafts.split(/={3,}/).map((s) => s.trim()).filter(Boolean)
  if (draftParts.length >= 3) {
    return draftParts.slice(0, 3).map(cleanCopy)
  }

  return [cleanCopy(finalText)]
}

function cleanCopy(text: string): string {
  return text
    .replace(/^[#\-\*\d\.\s]+/, '')
    .replace(/^方向[一二三][：:].*?\n/, '')
    .replace(/^【.*?】\s*/, '')
    .trim()
}

// ==================== Helpers ====================

function emitProgress(
  onProgress: ProgressCallback,
  mode: 'generate',
  step: string,
  stepIndex: number,
  totalSteps: number,
  status: 'running' | 'completed' | 'error',
  message: string,
  results?: string[]
) {
  onProgress({ mode, step, stepIndex, totalSteps, status, message, results })
}
