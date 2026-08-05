export interface VideoFormat {
  formatId: string
  quality: string
  ext: string
  filesize?: number
  width?: number
  height?: number
  fps?: number
  hasAudio?: boolean
  url?: string  // 直接下载链接（用于抖音等平台）
}

export interface VideoInfo {
  id: string
  title: string
  description?: string
  thumbnail: string
  duration?: number
  uploader?: string
  webpageUrl: string
  formats: VideoFormat[]
}

export interface DownloadTask {
  id: string
  url: string
  videoInfo: VideoInfo
  selectedFormat: VideoFormat
  outputDir: string
  status: 'pending' | 'downloading' | 'merging' | 'completed' | 'error'
  progress: number
  downloadedSize?: string
  totalSize?: string
  speed?: string
  eta?: string
  error?: string
  filePath?: string
  statusMessage?: string
  createdAt: string
}

export interface HistoryRecord {
  id: string
  title: string
  thumbnail: string
  url: string
  filePath: string
  format: string
  quality: string
  fileSize?: string
  createdAt: string
}

export type TabType = 'download' | 'asr' | 'copywriting' | 'history' | 'license' | 'about' | 'settings'

// ==================== ASR Types ====================

export interface AsrEngine {
  name: string
  label: string
  available: boolean
  locked?: boolean
}

export interface AsrTask {
  id: string
  filePath: string
  fileName: string
  engine: string
  exportFormat: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
  resultPath?: string
  resultText?: string
  createdAt: string
}

// ==================== License Types ====================

export interface LicenseStatus {
  tier: 'trial' | 'free' | 'pro' | 'premium'
  trialRemaining: { downloads: number; asr: number } | null
  trialExhausted: boolean
  licenseInfo: {
    tier: string
    activatedAt: string
    expiresAt: string | null
  } | null
  limits: {
    dailyDownloads: number | null
    exportFormats: string[]
    engines: string[]
    canBatch: boolean
    canFullQuality: boolean
  }
}

// ==================== Copywriting Types ====================

export type CopywritingMode = 'rewrite' | 'generate'

export interface CopywritingInput {
  mode: CopywritingMode
}

export interface RewriteInput extends CopywritingInput {
  mode: 'rewrite'
  originalCopy: string
  productInfo?: string
  preferredDirection?: string
  extraRequirements?: string
}

export interface GenerateInput extends CopywritingInput {
  mode: 'generate'
  product: string
  targetAudience: string
  sellingPoints: string
  marketingGoal?: string
  tone?: string
}

export interface AIConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

export interface PipelineProgress {
  mode: 'rewrite' | 'generate'
  step: string
  stepIndex: number
  totalSteps: number
  status: 'running' | 'completed' | 'error'
  message: string
  results?: string[]
  error?: string
}
