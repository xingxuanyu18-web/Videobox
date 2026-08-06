export { chat } from './api'
export { runRewritePipeline } from './pipeline-rewrite'
export { runGeneratePipeline } from './pipeline-generate'
export {
  isOllamaRunning,
  isOllamaInstalled,
  findOllamaExe,
  startOllamaService,
  listModels,
  hasModel,
  pullModel,
  autoDetect,
  oneClickSetup,
  RECOMMENDED_MODEL,
} from './local-llm'
export type {
  OllamaModel,
  PullProgress,
  AutoSetupResult,
} from './local-llm'
export type {
  AIConfig,
  ChatMessage,
  RewriteInput,
  GenerateInput,
  PipelineProgress,
  PipelineMode,
} from './types'
export { DEFAULT_AI_CONFIG, OLLAMA_CONFIG, COPYWRITING_CHANNELS } from './types'
