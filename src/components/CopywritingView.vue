<template>
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Panel - Input -->
    <section class="w-[45%] flex-shrink-0 flex flex-col bg-surface relative">
      <div class="flex-1 overflow-y-auto px-6 py-5">
        <div class="max-w-xl mx-auto w-full flex flex-col gap-5">
          <!-- Title -->
          <div class="flex flex-col gap-1">
            <h1 class="font-headline text-2xl font-bold leading-tight text-on-surface">AI 文案创作</h1>
            <p class="text-on-surface-variant text-sm">改写已有文案或生成全新千川信息流文案</p>
          </div>

          <!-- Mode Switch -->
          <div class="flex bg-bg-card rounded-xl p-1 gap-1 border border-border-subtle">
            <button
              class="flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
              :class="mode === 'rewrite' ? 'bg-primary text-on-primary shadow-glow-primary' : 'text-text-muted hover:text-text-secondary'"
              @click="switchMode('rewrite')"
            >文案改写</button>
            <button
              class="flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
              :class="mode === 'generate' ? 'bg-primary text-on-primary shadow-glow-primary' : 'text-text-muted hover:text-text-secondary'"
              @click="switchMode('generate')"
            >文案生成</button>
          </div>

          <!-- Rewrite Mode Input -->
          <template v-if="mode === 'rewrite'">
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  原始文案 <span class="text-error text-xs">*必填</span>
                </label>
                <textarea
                  v-model="rewriteInput.originalCopy"
                  class="w-full h-28 bg-surface-container-highest border border-outline-variant/20 rounded-xl p-3 text-text-primary placeholder:text-text-muted resize-none text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                  placeholder="粘贴需要改写的千川信息流文案..."
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface">产品/品牌信息 <span class="text-text-muted text-xs font-normal">选填</span></label>
                <input
                  v-model="rewriteInput.productInfo"
                  class="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-text-primary placeholder:text-text-muted text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                  placeholder="产品名称、类别、主要功能等，帮助 AI 更精准改写"
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface">改写偏好方向 <span class="text-text-muted text-xs font-normal">选填</span></label>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="dir in rewriteDirections"
                    :key="dir.value"
                    class="px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border"
                    :class="rewriteInput.preferredDirection === dir.value
                      ? 'bg-primary-subtle border-primary/30 text-primary'
                      : 'bg-surface-container-lowest border-outline-variant/20 text-text-secondary hover:border-primary/40'"
                    @click="rewriteInput.preferredDirection = rewriteInput.preferredDirection === dir.value ? '' : dir.value"
                  >{{ dir.label }}</button>
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface">额外要求 <span class="text-text-muted text-xs font-normal">选填</span></label>
                <input
                  v-model="rewriteInput.extraRequirements"
                  class="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-text-primary placeholder:text-text-muted text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                  placeholder="字数限制、语气风格、需保留的关键词等"
                />
              </div>
            </div>
          </template>

          <!-- Generate Mode Input -->
          <template v-if="mode === 'generate'">
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  产品/服务 <span class="text-error text-xs">*必填</span>
                </label>
                <textarea
                  v-model="generateInput.product"
                  class="w-full h-20 bg-surface-container-highest border border-outline-variant/20 rounded-xl p-3 text-text-primary placeholder:text-text-muted resize-none text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                  placeholder="描述你要推广的产品或服务..."
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  目标人群 <span class="text-error text-xs">*必填</span>
                </label>
                <input
                  v-model="generateInput.targetAudience"
                  class="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-text-primary placeholder:text-text-muted text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                  placeholder="目标用户群体的年龄、性别、兴趣等..."
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  核心卖点 <span class="text-error text-xs">*必填</span>
                </label>
                <textarea
                  v-model="generateInput.sellingPoints"
                  class="w-full h-16 bg-surface-container-highest border border-outline-variant/20 rounded-xl p-3 text-text-primary placeholder:text-text-muted resize-none text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                  placeholder="产品的核心卖点或独特优势..."
                />
              </div>

              <div class="flex gap-3">
                <div class="flex-1 flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-on-surface">营销目标 <span class="text-text-muted text-xs font-normal">选填</span></label>
                  <input
                    v-model="generateInput.marketingGoal"
                    class="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-text-primary placeholder:text-text-muted text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none"
                    placeholder="提升销量 / 获取客资 / App下载"
                  />
                </div>
                <div class="flex-1 flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-on-surface">调性风格 <span class="text-text-muted text-xs font-normal">选填</span></label>
                  <select
                    v-model="generateInput.tone"
                    class="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-text-primary text-sm transition-all duration-300 focus:border-primary/40 focus:outline-none bg-surface"
                  >
                    <option value="">默认风格</option>
                    <option value="促销紧迫感">促销紧迫感</option>
                    <option value="种草测评">种草测评</option>
                    <option value="情感共鸣">情感共鸣</option>
                    <option value="专业权威">专业权威</option>
                    <option value="轻松搞笑">轻松搞笑</option>
                  </select>
                </div>
              </div>
            </div>
          </template>

          <!-- Submit Button -->
          <button
            class="w-full flex items-center justify-center gap-2 rounded-xl h-11 font-bold text-sm transition-all duration-300 gradient-primary text-white shadow-glow-primary hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            :disabled="!canSubmit || isProcessing"
            @click="startPipeline"
          >
            <span v-if="isProcessing" class="material-symbols-outlined text-[18px] animate-spin">sync</span>
            <span v-else class="material-symbols-outlined text-[18px]">{{ mode === 'rewrite' ? 'edit_note' : 'auto_awesome' }}</span>
            <span>{{ buttonText }}</span>
          </button>

          <!-- License / Usage Banner -->
          <div v-if="showLicenseBanner" class="flex items-center gap-3 p-3 rounded-xl border"
            :class="licenseTier === 'trial' ? 'bg-accent-subtle border-accent/20' : 'bg-bg-elevated border-border-subtle'">
            <span class="material-symbols-outlined text-[18px] flex-shrink-0"
              :class="licenseTier === 'trial' ? 'text-accent' : 'text-text-muted'">stars</span>
            <div class="flex-1">
              <p class="text-xs text-on-surface">
                <template v-if="licenseTier === 'trial'">试用中：还剩 <strong class="text-accent">{{ trialRemaining }}</strong> 次</template>
                <template v-else>今日剩余 <strong class="text-primary">{{ dailyRemaining }}</strong> 次免费使用</template>
              </p>
            </div>
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-semibold gradient-primary text-on-primary transition-all hover:brightness-110"
              @click="goToLicense"
            >升级 Pro</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Right Panel - Output -->
    <section class="flex-1 flex flex-col bg-surface-container-lowest border-l border-border-subtle min-w-0">

      <!-- === Detail View (clicked a result card) === -->
      <template v-if="selectedResult !== null">
        <div class="flex flex-col h-full">
          <div class="flex items-center gap-2 px-5 py-3 border-b border-border-subtle">
            <button
              class="p-1.5 rounded-lg hover:bg-bg-highlight text-text-muted hover:text-text-primary transition-colors"
              @click="selectedResult = null"
            >
              <span class="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <span class="px-2 py-0.5 rounded-md text-2xs font-bold uppercase tracking-wider"
              :class="selectedBadgeClass">
              {{ selectedLabel }}
            </span>
            <span class="flex-1"></span>
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-primary transition-colors flex items-center gap-1"
              @click="copyOne(results[selectedResult])"
            >
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              复制
            </button>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4">
            <p class="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{{ results[selectedResult] }}</p>
          </div>
        </div>
      </template>

      <!-- === List View === -->
      <template v-else>
        <!-- Pipeline Progress -->
        <div v-if="isProcessing || pipelineSteps.length > 0" class="px-5 py-5 border-b border-border-subtle">
          <div class="flex items-center gap-2 mb-4">
            <span class="material-symbols-outlined text-[18px] text-primary">account_tree</span>
            <h3 class="text-xs font-bold text-text-muted uppercase tracking-wider">执行链路</h3>
            <span v-if="isProcessing" class="ml-auto flex items-center gap-1.5 text-2xs text-text-muted">
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              {{ activeStepLabel }}
            </span>
          </div>

          <!-- Horizontal Pipeline -->
          <div class="flex items-start gap-0">
            <template v-for="(step, index) in pipelineSteps" :key="step.step">
              <!-- Step Node -->
              <div class="flex flex-col items-center gap-1.5 relative" :style="{ flex: '1 1 0', minWidth: '0' }">
                <!-- Status Circle -->
                <div
                  class="relative flex items-center justify-center rounded-full transition-all duration-500"
                  :class="stepCircleClass(step)"
                >
                  <template v-if="step.status === 'completed'">
                    <span class="material-symbols-outlined text-white" :style="{ fontSize: stepCircleSize }">check</span>
                    <div class="absolute inset-0 rounded-full" :class="step.status === 'completed' ? 'bg-success/20 animate-ping' : ''" style="animation-duration: 0.6s; animation-iteration-count: 1;"></div>
                  </template>
                  <template v-else-if="step.status === 'running'">
                    <span class="material-symbols-outlined text-white animate-spin" :style="{ fontSize: stepCircleSize }">sync</span>
                    <div class="absolute -inset-1 rounded-full bg-primary/20 animate-pulse"></div>
                  </template>
                  <template v-else-if="step.status === 'error'">
                    <span class="material-symbols-outlined text-white" :style="{ fontSize: stepCircleSize }">close</span>
                  </template>
                  <template v-else>
                    <span class="text-xs font-bold" :class="step.status === 'pending' ? 'text-text-muted' : 'text-text-disabled'" :style="{ fontSize: stepCircleFontSize }">{{ step.stepIndex }}</span>
                  </template>
                </div>

                <!-- Step Label -->
                <span
                  class="text-2xs font-semibold text-center leading-tight transition-colors duration-300 px-0.5"
                  :class="stepLabelClass(step)"
                >{{ stepLabel(step) }}</span>

                <!-- Brief status text -->
                <span
                  class="text-3xs text-center leading-tight transition-colors duration-300"
                  :class="step.status === 'running' ? 'text-primary' : step.status === 'completed' ? 'text-success' : 'text-text-muted'"
                >{{ stepSubtext(step) }}</span>
              </div>

              <!-- Arrow Connector -->
              <div
                v-if="index < pipelineSteps.length - 1"
                class="flex items-center flex-shrink-0 pt-[12px]"
                :style="{ width: '16px' }"
              >
                <div class="flex-1 flex items-center">
                  <div class="flex-1 h-px rounded-full transition-colors duration-500"
                    :class="arrowLineClass(index)"
                  ></div>
                  <div class="transition-colors duration-500" :class="arrowHeadClass(index)">
                    <svg width="6" height="8" viewBox="0 0 6 8"><path d="M0 0l6 4-6 4z" fill="currentColor"/></svg>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Overall progress bar -->
          <div class="mt-4 h-1 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-700 ease-out"
              :class="progressBarClass"
              :style="{ width: overallProgress + '%' }"
            ></div>
          </div>

          <!-- Error Banner -->
          <div v-if="pipelineError" class="mt-3 p-3 rounded-lg bg-error-container border border-error/20 flex items-start gap-2">
            <span class="material-symbols-outlined text-[16px] text-error flex-shrink-0 mt-0.5">warning</span>
            <p class="text-xs text-error leading-relaxed">{{ pipelineError }}</p>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <!-- Empty State -->
          <div v-if="!isProcessing && results.length === 0 && !pipelineError" class="h-full flex flex-col items-center justify-center gap-3">
            <span class="material-symbols-outlined text-[44px] text-text-muted">auto_awesome</span>
            <p class="text-sm text-text-muted text-center">AI 生成的文案将在这里显示</p>
            <p class="text-2xs text-text-muted text-center">输入信息后点击按钮开始创作</p>
          </div>

          <!-- Results List (preview cards) -->
          <div v-if="results.length > 0" class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-on-surface">{{ mode === 'rewrite' ? '改写结果' : '生成结果' }}</h3>
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-primary transition-colors flex items-center gap-1"
                @click="copyAll"
              >
                <span class="material-symbols-outlined text-[14px]">content_copy</span>
                复制全部
              </button>
            </div>

            <div
              v-for="(result, index) in results"
              :key="index"
              class="glass-card p-4 transition-card hover:border-primary/20 cursor-pointer group"
              @click="selectedResult = index"
            >
              <div class="flex items-center gap-2 mb-2.5">
                <span class="px-2 py-0.5 rounded-md text-2xs font-bold uppercase tracking-wider"
                  :class="index === 0 ? 'bg-error-container text-error' : index === 1 ? 'bg-primary-subtle text-primary' : 'bg-accent-subtle text-accent'">
                  {{ mode === 'rewrite' ? rewriteLabels[index] : '版本 ' + (index + 1) }}
                </span>
                <div class="flex-1"></div>
                <span class="material-symbols-outlined text-[14px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">open_in_full</span>
                <button
                  class="p-1.5 rounded-lg hover:bg-bg-highlight text-text-muted hover:text-primary transition-all"
                  @click.stop="copyOne(result)"
                  title="复制"
                >
                  <span class="material-symbols-outlined text-[15px]">content_copy</span>
                </button>
              </div>
              <p class="text-sm text-on-surface leading-relaxed line-clamp-3">{{ result }}</p>
              <p class="text-2xs text-text-muted mt-2">点击展开查看全文 →</p>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

// ==================== Mode ====================

const mode = ref<'rewrite' | 'generate'>('rewrite')

const rewriteDirections = [
  { value: 'pain_point', label: '痛点直击' },
  { value: 'scene', label: '场景代入' },
  { value: 'crowd', label: '人群共鸣' },
]

const rewriteLabels = ['痛点抓眼型', '场景代入型', '人群识别型']

function switchMode(newMode: 'rewrite' | 'generate') {
  mode.value = newMode
  results.value = []
  pipelineSteps.value = []
  pipelineError.value = ''
  selectedResult.value = null
}

// ==================== Inputs ====================

const rewriteInput = reactive({
  originalCopy: '',
  productInfo: '',
  preferredDirection: '',
  extraRequirements: '',
})

const generateInput = reactive({
  product: '',
  targetAudience: '',
  sellingPoints: '',
  marketingGoal: '',
  tone: '',
})

const canSubmit = computed(() => {
  if (mode.value === 'rewrite') return rewriteInput.originalCopy.trim().length > 0
  return generateInput.product.trim().length > 0 &&
    generateInput.targetAudience.trim().length > 0 &&
    generateInput.sellingPoints.trim().length > 0
})

const buttonText = computed(() => {
  if (isProcessing.value) return mode.value === 'rewrite' ? '改写中...' : '生成中...'
  return mode.value === 'rewrite' ? '开始改写' : '开始生成'
})

// ==================== Processing State ====================

const isProcessing = ref(false)
const pipelineSteps = ref<{ step: string; status: string; message: string; stepIndex: number; totalSteps: number }[]>([])
const pipelineError = ref('')
const results = ref<string[]>([])

// Detail view state
const selectedResult = ref<number | null>(null)

// ==================== Pipeline Visual Helpers ====================

const STEP_NAMES: Record<string, string> = {
  analyze_original: '分析原文',
  rewrite_strategy: '制定策略',
  parallel_rewrites: '并行改写',
  finalise_rewrites: '审校优化',
  parse_results: '整理结果',
  creative_strategy: '创意策略',
  write_copies: '撰写文案',
  review_optimize: '审校优化',
}

const STEP_SUBTEXTS: Record<string, string> = {
  analyze_original: '解构文案框架与合规检查',
  rewrite_strategy: '制定优化方向与切入点',
  parallel_rewrites: '痛点·场景·人群三路并发',
  finalise_rewrites: '逐条精修与合规复查',
  parse_results: '格式化最终输出',
  creative_strategy: '受众分析 + 钩子方案',
  write_copies: '差异化三版并行创作',
  review_optimize: '合规复查 + 钩子强化',
}

const stepCircleSize = '18px'
const stepCircleFontSize = '12px'

function stepLabel(step: { step: string; message: string }) {
  return STEP_NAMES[step.step] || step.message
}

function stepSubtext(step: { step: string; status: string }) {
  if (step.status === 'completed') return '✓ 完成'
  if (step.status === 'running') return '执行中···'
  if (step.status === 'error') return '失败'
  return STEP_SUBTEXTS[step.step] || ''
}

function stepCircleClass(step: { status: string }) {
  const base = 'w-9 h-9 flex-shrink-0 '
  switch (step.status) {
    case 'completed': return base + 'bg-success shadow-sm'
    case 'running': return base + 'bg-primary shadow-glow-primary scale-110'
    case 'error': return base + 'bg-error shadow-sm'
    default: return base + 'bg-surface-container-highest border border-border-subtle'
  }
}

function stepLabelClass(step: { status: string }) {
  switch (step.status) {
    case 'completed': return 'text-success'
    case 'running': return 'text-primary font-bold'
    case 'error': return 'text-error'
    default: return 'text-text-muted'
  }
}

function arrowLineClass(index: number) {
  const curr = pipelineSteps.value[index]
  const next = pipelineSteps.value[index + 1]
  if (!curr || !next) return 'bg-border-subtle'
  if (curr.status === 'completed' && next.status !== 'pending') return 'bg-success'
  if (curr.status === 'completed') return 'bg-primary/50'
  return 'bg-border-subtle'
}

function arrowHeadClass(index: number) {
  const curr = pipelineSteps.value[index]
  const next = pipelineSteps.value[index + 1]
  if (!curr || !next) return 'text-border-subtle'
  if (curr.status === 'completed' && next.status !== 'pending') return 'text-success'
  if (curr.status === 'completed') return 'text-primary/50'
  return 'text-border-subtle'
}

const progressBarClass = computed(() => {
  const lastStep = pipelineSteps.value[pipelineSteps.value.length - 1]
  if (!lastStep) return 'bg-surface-container-highest'
  if (pipelineError.value) return 'bg-error'
  if (lastStep.status === 'completed') return 'bg-gradient-to-r from-primary to-success'
  if (lastStep.status === 'running') return 'bg-primary'
  return 'bg-primary/30'
})

const overallProgress = computed(() => {
  if (pipelineSteps.value.length === 0) return 0
  const total = pipelineSteps.value.length
  let progress = 0
  for (const s of pipelineSteps.value) {
    if (s.status === 'completed') progress += 1
    if (s.status === 'running') progress += 0.5
  }
  return Math.round((progress / total) * 100)
})

const activeStepLabel = computed(() => {
  const running = pipelineSteps.value.find(s => s.status === 'running')
  if (!running) return ''
  return `处理中···`
})

const selectedLabel = computed(() => {
  if (selectedResult.value === null) return ''
  if (mode.value === 'rewrite') return rewriteLabels[selectedResult.value] || ''
  return `版本 ${selectedResult.value + 1}`
})

const selectedBadgeClass = computed(() => {
  if (selectedResult.value === null) return ''
  if (selectedResult.value === 0) return 'bg-error-container text-error'
  if (selectedResult.value === 1) return 'bg-primary-subtle text-primary'
  return 'bg-accent-subtle text-accent'
})

let progressCleanup: (() => void) | null = null

// ==================== License State ====================

const licenseTier = ref('free')
const trialRemaining = ref(2)
const dailyRemaining = ref(2)

const showLicenseBanner = computed(() => {
  return licenseTier.value === 'trial' || licenseTier.value === 'free'
})

function goToLicense() {
  window.dispatchEvent(new CustomEvent('navigate-to-license'))
}

// ==================== Pipeline ====================

async function startPipeline() {
  console.log('[COPYWRITING-VUE] startPipeline() called, mode=' + mode.value)
  if (isProcessing.value) { console.log('[COPYWRITING-VUE] already processing, skip'); return }

  // 立即显示 loading 状态，避免点击后"没有反应"
  isProcessing.value = true
  console.log('[COPYWRITING-VUE] isProcessing=true')
  pipelineError.value = ''
  results.value = []
  pipelineSteps.value = []
  selectedResult.value = null

  // Step 1: 检查配置
  try {
    console.log('[COPYWRITING-VUE] calling getConfig...')
    const config = await (window as any).electronAPI.copywriting.getConfig()
    console.log('[COPYWRITING-VUE] getConfig result:', JSON.stringify(config))
    if (!config.hasKey && config.provider !== 'ollama') {
      console.log('[COPYWRITING-VUE] no API key, abort')
      pipelineError.value = '请先在设置中配置 AI API Key，或切换到本地模型'
      isProcessing.value = false
      return
    }
  } catch (e: any) {
    console.log('[COPYWRITING-VUE] getConfig failed:', e.message)
    pipelineError.value = '无法获取 AI 配置，请检查设置'
    isProcessing.value = false
    return
  }

  // Step 2: 监听进度
  console.log('[COPYWRITING-VUE] setting up progress listener')
  progressCleanup = (window as any).electronAPI.copywriting.onProgress(
    (data: { step: string; stepIndex: number; totalSteps: number; status: string; message: string; results?: string[]; error?: string }) => {
      const entry = { step: data.step, status: data.status, message: data.message, stepIndex: data.stepIndex, totalSteps: data.totalSteps }
      const existingIdx = pipelineSteps.value.findIndex(s => s.step === data.step)
      if (existingIdx >= 0) {
        pipelineSteps.value[existingIdx] = entry
      } else {
        pipelineSteps.value.push(entry)
      }
      // Sort by stepIndex to maintain pipeline order
      pipelineSteps.value.sort((a, b) => a.stepIndex - b.stepIndex)
      pipelineSteps.value = [...pipelineSteps.value]

      if (data.results && data.results.length > 0) {
        results.value = data.results
      }
      if (data.error) {
        pipelineError.value = data.error
      }
    }
  )

  // Step 3: 执行 pipeline
  try {
    if (mode.value === 'rewrite') {
      console.log('[COPYWRITING-VUE] calling IPC rewrite...')
      const rewriteRes = await (window as any).electronAPI.copywriting.rewrite({
        originalCopy: rewriteInput.originalCopy,
        productInfo: rewriteInput.productInfo || undefined,
        preferredDirection: rewriteInput.preferredDirection || undefined,
        extraRequirements: rewriteInput.extraRequirements || undefined,
      })
      console.log('[COPYWRITING-VUE] rewrite returned:', JSON.stringify({ hasResults: !!rewriteRes?.results, count: rewriteRes?.results?.length }))
      if (rewriteRes.results) results.value = rewriteRes.results
    } else {
      console.log('[COPYWRITING-VUE] calling IPC generate...')
      const genRes = await (window as any).electronAPI.copywriting.generate({
        product: generateInput.product,
        targetAudience: generateInput.targetAudience,
        sellingPoints: generateInput.sellingPoints,
        marketingGoal: generateInput.marketingGoal || undefined,
        tone: generateInput.tone || undefined,
      })
      console.log('[COPYWRITING-VUE] generate returned:', JSON.stringify({ hasResults: !!genRes?.results, count: genRes?.results?.length }))
      if (genRes.results) results.value = genRes.results
    }
    refreshLicense()
  } catch (e: any) {
    console.log('[COPYWRITING-VUE] pipeline error:', e.message)
    const msg = e.message || '操作失败'
    if (msg.startsWith('DAILY_LIMIT:')) {
      pipelineError.value = msg.replace('DAILY_LIMIT:', '')
    } else if (msg.startsWith('TRIAL_EXHAUSTED:')) {
      pipelineError.value = msg.replace('TRIAL_EXHAUSTED:', '')
    } else {
      pipelineError.value = msg
    }
  } finally {
    isProcessing.value = false
    if (progressCleanup) { progressCleanup(); progressCleanup = null }
  }
}

// ==================== Copy ====================

async function copyOne(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    try { await (window as any).electronAPI.clipboard.writeText(text) } catch {}
  }
}

async function copyAll() {
  await copyOne(results.value.join('\n\n---\n\n'))
}

// ==================== License ====================

async function refreshLicense() {
  try {
    const status = await (window as any).electronAPI.license.getStatus()
    if (status) {
      licenseTier.value = status.tier
      if (status.trialRemaining) {
        trialRemaining.value = status.trialRemaining.copywriting ?? 2
      }
      // Premium 不显示次数限制
      if (status.tier === 'premium' || status.tier === 'pro') {
        dailyRemaining.value = -1
      } else {
        try {
          const usage = await (window as any).electronAPI.license.getDailyUsage()
          dailyRemaining.value = Math.max(0, 2 - (usage.copywritingUses ?? 0))
        } catch {}
      }
    }
  } catch {}
}

// 激活后刷新
window.addEventListener('license:activated', () => refreshLicense())

// ==================== Lifecycle ====================

onMounted(() => { refreshLicense() })

onUnmounted(() => {
  if (progressCleanup) { progressCleanup(); progressCleanup = null }
})
</script>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
