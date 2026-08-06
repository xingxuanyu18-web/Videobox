// ==================== AI Config ====================

export interface AIConfig {
  provider: 'ollama' | 'deepseek' | 'openai' | 'custom'
  apiKey: string
  baseUrl: string
  model: string
  maxTokens: number
  timeout: number
  retry: number
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  maxTokens: 4096,
  timeout: 300000,
  retry: 2,
}

export const OLLAMA_CONFIG: Partial<AIConfig> = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:4b',
}

// ==================== Chat Types ====================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  max_tokens: number
  temperature: number
}

// ==================== Pipeline Inputs ====================

export interface RewriteInput {
  /** 原始文案（必填） */
  originalCopy: string
  /** 产品/品牌信息（选填） */
  productInfo?: string
  /** 改写偏好方向（选填，不填则三个方向各出一条） */
  preferredDirection?: 'pain_point' | 'scene' | 'crowd'
  /** 额外要求（选填） */
  extraRequirements?: string
}

export interface GenerateInput {
  /** 产品/服务（必填） */
  product: string
  /** 目标人群（必填） */
  targetAudience: string
  /** 核心卖点（必填） */
  sellingPoints: string
  /** 营销目标（选填） */
  marketingGoal?: string
  /** 调性风格（选填） */
  tone?: string
}

// ==================== Pipeline Progress ====================

export type PipelineMode = 'rewrite' | 'generate'

export interface PipelineProgress {
  mode: PipelineMode
  step: string
  stepIndex: number
  totalSteps: number
  status: 'running' | 'completed' | 'error'
  message: string
  results?: string[]
  error?: string
}

// ==================== IPC Channel Names ====================

export const COPYWRITING_CHANNELS = {
  REWRITE: 'copywriting:rewrite',
  GENERATE: 'copywriting:generate',
  GET_CONFIG: 'copywriting:getConfig',
  SAVE_CONFIG: 'copywriting:saveConfig',
  TEST_CONNECTION: 'copywriting:testConnection',
  PROGRESS: 'copywriting:progress',
} as const
