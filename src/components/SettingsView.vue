<template>
  <div class="flex-1 flex flex-col bg-surface p-8 overflow-y-auto">
    <div class="max-w-2xl mx-auto w-full flex flex-col gap-6 pb-8">
      <!-- Header -->
      <div>
        <h1 class="font-headline text-2xl font-bold leading-tight text-on-surface">设置</h1>
        <p class="text-on-surface-variant text-sm mt-1">配置下载偏好和应用程序选项</p>
      </div>

      <div class="flex flex-col gap-6">
        <!-- Download Settings -->
        <div class="bg-surface-container-low rounded-lg p-6 border border-outline-variant/10">
          <h2 class="font-headline text-base font-bold text-on-surface mb-4 flex items-center gap-2">
            <MaterialIcon name="download" :size="20" class="text-primary" />
            下载设置
          </h2>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-on-surface">默认下载目录</label>
              <div class="flex gap-2">
                <input v-model="settings.downloadDir" type="text" readonly class="flex-1 px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" />
                <button class="px-4 py-2 bg-surface-container-highest text-on-surface rounded-md text-sm font-medium hover:bg-surface-variant transition-colors border border-outline-variant/20" @click="selectDownloadDir">选择目录</button>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-on-surface">文件名模板</label>
              <input v-model="settings.filenameTemplate" type="text" class="px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" placeholder="%(title)s.%(ext)s" />
              <p class="text-[11px] text-on-surface-variant">可用变量: %(title)s - 标题, %(id)s - 视频ID, %(uploader)s - 上传者</p>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-on-surface">Cookies 文件</label>
              <div class="flex gap-2">
                <input v-model="settings.cookiesFile" type="text" readonly placeholder="选择 cookies.txt 文件（用于 YouTube 登录）" class="flex-1 px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" />
                <button class="px-4 py-2 bg-surface-container-highest text-on-surface rounded-md text-sm font-medium hover:bg-surface-variant transition-colors border border-outline-variant/20" @click="selectCookiesFile">选择文件</button>
                <button v-if="settings.cookiesFile" class="px-4 py-2 bg-error-container text-on-error-container rounded-md text-sm font-medium hover:bg-error transition-colors hover:text-on-error border border-outline-variant/20" @click="clearCookiesFile">清除</button>
              </div>
              <p class="text-[11px] text-on-surface-variant">用于下载B站和YouTube 视频。可使用 Chrome 扩展 "Get cookies.txt" 导出</p>
            </div>
          </div>
        </div>

        <!-- Quality Settings -->
        <div class="bg-surface-container-low rounded-lg p-6 border border-outline-variant/10">
          <h2 class="font-headline text-base font-bold text-on-surface mb-4 flex items-center gap-2">
            <MaterialIcon name="high_quality" :size="20" class="text-primary" />
            画质偏好
          </h2>
          <div class="flex flex-col gap-3">
            <label v-for="quality in qualityOptions" :key="quality.value" class="flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors hover:bg-surface-container-highest">
              <div class="size-4 rounded-full border-2 flex items-center justify-center" :class="settings.preferredQuality === quality.value ? 'border-primary' : 'border-outline-variant'">
                <div v-if="settings.preferredQuality === quality.value" class="size-2 rounded-full bg-primary" />
              </div>
              <input v-model="settings.preferredQuality" type="radio" :value="quality.value" class="hidden" />
              <span class="text-sm text-on-surface">{{ quality.label }}</span>
            </label>
          </div>
        </div>

        <!-- AI Copywriting Settings -->
        <div class="bg-surface-container-low rounded-lg p-6 border border-outline-variant/10">
          <h2 class="font-headline text-base font-bold text-on-surface mb-4 flex items-center gap-2">
            <MaterialIcon name="smart_toy" :size="20" class="text-primary" />
            AI 文案配置
          </h2>

          <div class="flex flex-col gap-4">
            <!-- Provider -->
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-on-surface">AI 提供商</label>
              <select v-model="aiConfig.provider" class="px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" @change="onProviderChange">
                <option value="ollama">本地模型 (Ollama) — 免费 · 无需 API Key</option>
                <option value="deepseek">DeepSeek — 需 API Key</option>
                <option value="openai">OpenAI — 需 API Key</option>
                <option value="custom">自定义 OpenAI 兼容接口 — 需 API Key</option>
              </select>
            </div>

            <!-- ====== Ollama Panel ====== -->
            <template v-if="aiConfig.provider === 'ollama'">
              <!-- Ready -->
              <div v-if="ollamaStatus === 'ready' && setupState === 'idle'" class="p-3 rounded-xl border border-success/20 bg-success/5 flex items-center gap-3">
                <span class="material-symbols-outlined text-[20px] text-success">check_circle</span>
                <div>
                  <p class="text-sm font-semibold text-success">本地模型已就绪</p>
                  <p class="text-2xs text-text-secondary">模型 {{ ollamaModelName }} 已安装，AI 文案功能无需联网即可使用</p>
                </div>
                <div class="flex-1"></div>
                <button class="px-3 py-1.5 rounded-md text-2xs font-medium bg-surface-variant text-on-surface hover:bg-bg-highlight transition-colors border border-outline-variant/20" @click="refreshOllamaStatus">刷新</button>
              </div>

              <!-- Setup in Progress -->
              <div v-else-if="setupState !== 'idle'" class="p-4 rounded-xl border border-primary/20 bg-primary-subtle flex flex-col gap-4">
                <div class="flex items-center gap-3">
                  <span v-if="setupState === 'running'" class="material-symbols-outlined text-[22px] text-primary animate-spin">sync</span>
                  <span v-else-if="setupState === 'done'" class="material-symbols-outlined text-[22px] text-success">check_circle</span>
                  <span v-else class="material-symbols-outlined text-[22px] text-error">error</span>
                  <div>
                    <p class="text-sm font-semibold text-on-surface">{{ setupTitle }}</p>
                    <p class="text-xs text-text-secondary mt-0.5">{{ setupMessage }}</p>
                  </div>
                </div>
                <div v-if="setupState === 'running'" class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                      <div class="h-full bg-primary rounded-full transition-all duration-500" :style="{ width: setupPercent + '%' }"></div>
                    </div>
                    <span class="text-xs text-primary font-mono">{{ setupPercent }}%</span>
                  </div>
                  <div class="flex gap-1.5">
                    <span v-for="s in setupSteps" :key="s.key" class="w-2 h-2 rounded-full transition-colors" :class="s.status === 'completed' ? 'bg-success' : s.status === 'running' ? 'bg-primary animate-pulse' : s.status === 'error' ? 'bg-error' : 'bg-bg-highlight'" :title="s.label"></span>
                  </div>
                </div>
                <button v-if="setupState === 'error'" class="self-start px-4 py-2 rounded-lg text-xs font-bold gradient-primary text-on-primary transition-all hover:brightness-110" @click="startOneClickSetup">重试</button>
              </div>

              <!-- Not Ready — One-Click -->
              <div v-else class="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-highest flex flex-col gap-4">
                <div class="flex items-start gap-3">
                  <span class="material-symbols-outlined text-[22px] mt-0.5 flex-shrink-0" :class="ollamaStatus === 'ready' ? 'text-success' : 'text-warning'">info</span>
                  <div>
                    <p class="text-sm font-semibold text-on-surface">{{ ollamaStatusText }}</p>
                    <p class="text-xs text-text-secondary mt-1">
                      <template v-if="ollamaStatus === 'not_installed'">需要安装 Ollama 并下载本地 AI 模型。全程自动，无需手动操作。</template>
                      <template v-else-if="ollamaStatus === 'not_running'">Ollama 已安装但服务未运行，将自动启动。</template>
                      <template v-else>需要下载本地模型 <strong class="text-primary">{{ ollamaModelName }}</strong>（约 2.5 GB），下载后可离线使用。</template>
                    </p>
                  </div>
                </div>
                <button class="w-full py-3 rounded-xl text-sm font-bold gradient-primary text-on-primary transition-all hover:brightness-110 active:scale-[0.98] shadow-glow-primary flex items-center justify-center gap-2" @click="startOneClickSetup">
                  <span class="material-symbols-outlined text-[20px]">bolt</span>
                  一键配置本地模型
                </button>
                <details class="group">
                  <summary class="text-2xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors select-none">手动配置</summary>
                  <div class="mt-2 flex flex-col gap-1.5 pl-1">
                    <button class="text-2xs text-text-muted hover:text-primary transition-colors text-left" @click="openOllamaSite">· 下载 Ollama 安装程序</button>
                    <button class="text-2xs text-text-muted hover:text-primary transition-colors text-left" @click="refreshOllamaStatus">· 刷新检测状态</button>
                    <button v-if="ollamaStatus === 'need_pull'" class="text-2xs text-text-muted hover:text-primary transition-colors text-left" @click="startPullModelOnly">· 仅下载模型</button>
                  </div>
                </details>
              </div>
            </template>

            <!-- ====== Cloud Provider ====== -->
            <template v-else>
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-on-surface">API 地址</label>
                <input v-model="aiConfig.baseUrl" type="text" class="px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" :placeholder="defaultBaseUrl" />
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-on-surface">API Key</label>
                <div class="flex gap-2">
                  <input v-model="aiConfig.apiKey" :type="showApiKey ? 'text' : 'password'" class="flex-1 px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" placeholder="sk-xxxxxxxx" />
                  <button class="px-3 py-2 bg-surface-container-highest text-on-surface rounded-md text-sm font-medium hover:bg-surface-variant transition-colors border border-outline-variant/20" @click="showApiKey = !showApiKey">
                    <span class="material-symbols-outlined text-[18px]">{{ showApiKey ? 'visibility_off' : 'visibility' }}</span>
                  </button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-on-surface">模型</label>
                <input v-model="aiConfig.model" type="text" class="px-3 py-2 bg-surface-container-highest border border-outline-variant/20 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/40" :placeholder="defaultModel" />
              </div>
              <div class="flex items-center gap-3">
                <button class="px-4 py-2 bg-surface-container-highest text-on-surface rounded-md text-sm font-medium hover:bg-surface-variant transition-colors border border-outline-variant/20 flex items-center gap-1.5" :disabled="!aiConfig.apiKey || testLoading" @click="testConnection">
                  <span v-if="testLoading" class="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  <span v-else class="material-symbols-outlined text-[16px]">network_ping</span>
                  测试连接
                </button>
                <span v-if="testResult" class="text-xs" :class="testResult.success ? 'text-success' : 'text-error'">{{ testResult.message }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- Save Button -->
        <button class="w-full flex items-center justify-center gap-2 rounded-xl h-12 font-headline font-bold text-base shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 text-on-primary-fixed gradient-btn-orange" @click="saveSettings">
          <MaterialIcon name="save" :size="20" />
          <span>保存设置</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import MaterialIcon from './icons/MaterialIcon.vue'

interface Settings {
  downloadDir: string
  filenameTemplate: string
  preferredQuality: string
  cookiesFile: string
}

const settings = ref<Settings>({
  downloadDir: '',
  filenameTemplate: '%(title)s.%(ext)s',
  preferredQuality: 'best',
  cookiesFile: '',
})

const ytdlpVersion = ref('检测中...')

// ==================== AI Config ====================

const showApiKey = ref(false)
const testLoading = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const aiConfig = reactive({
  provider: 'ollama',
  apiKey: '',
  baseUrl: '',
  model: '',
})

const defaultBaseUrl = 'https://api.deepseek.com'
const defaultModel = 'deepseek-chat'

// ==================== Ollama State ====================

const ollamaStatus = ref<'checking' | 'not_installed' | 'not_running' | 'need_pull' | 'ready'>('checking')
const ollamaModelName = ref('qwen3:4b')

const setupState = ref<'idle' | 'running' | 'done' | 'error'>('idle')
const setupPercent = ref(0)
const setupMessage = ref('')
const setupSteps = ref([
  { key: 'checking', label: '检测', status: 'pending' },
  { key: 'downloading_installer', label: '下载', status: 'pending' },
  { key: 'installing', label: '安装', status: 'pending' },
  { key: 'starting_service', label: '启动', status: 'pending' },
  { key: 'pulling_model', label: '模型', status: 'pending' },
])

const setupTitle = computed(() => {
  if (setupState.value === 'running') return '正在配置本地模型...'
  if (setupState.value === 'done') return '配置完成！'
  if (setupState.value === 'error') return '配置失败'
  return ''
})

const ollamaStatusText = computed(() => {
  switch (ollamaStatus.value) {
    case 'not_installed': return '未检测到 Ollama'
    case 'not_running': return 'Ollama 服务未运行'
    case 'need_pull': return '需要下载 AI 模型'
    default: return ''
  }
})

let setupCleanup: (() => void) | null = null

// ==================== Methods ====================

function onProviderChange() {
  testResult.value = null
  if (aiConfig.provider === 'ollama') {
    refreshOllamaStatus()
  } else if (aiConfig.provider === 'deepseek') {
    aiConfig.baseUrl = 'https://api.deepseek.com'
    aiConfig.model = 'deepseek-chat'
  } else if (aiConfig.provider === 'openai') {
    aiConfig.baseUrl = 'https://api.openai.com/v1'
    aiConfig.model = 'gpt-3.5-turbo'
  }
}

async function refreshOllamaStatus() {
  ollamaStatus.value = 'checking'
  try {
    const api = (window as any).electronAPI.copywriting
    const result = await api.ollamaDetect()
    if (!result.ollamaFound) ollamaStatus.value = 'not_installed'
    else if (!result.ollamaRunning) ollamaStatus.value = 'not_running'
    else if (!result.modelInstalled) { ollamaStatus.value = 'need_pull'; ollamaModelName.value = result.modelName }
    else { ollamaStatus.value = 'ready'; ollamaModelName.value = result.modelName }
  } catch { ollamaStatus.value = 'not_installed' }
}

async function openOllamaSite() {
  try { await (window as any).electronAPI.copywriting.ollamaOpenSite() }
  catch { window.open('https://ollama.com/download/windows', '_blank') }
}

async function startOneClickSetup() {
  setupState.value = 'running'
  setupPercent.value = 0
  setupMessage.value = '正在初始化...'
  setupSteps.value.forEach(s => { s.status = 'pending' })

  const stepKeyOrder = ['checking', 'downloading_installer', 'installing', 'starting_service', 'pulling_model']

  setupCleanup = (window as any).electronAPI.copywriting.onOllamaSetupProgress(
    (data: { step: string; status: string; percent?: number; message: string; error?: string }) => {
      const stepIdx = stepKeyOrder.indexOf(data.step)
      if (stepIdx >= 0) {
        setupSteps.value[stepIdx].status = data.status === 'completed' ? 'completed' : data.status === 'error' ? 'error' : 'running'
        for (let i = 0; i < stepIdx; i++) {
          if (setupSteps.value[i].status !== 'error') setupSteps.value[i].status = 'completed'
        }
      }
      if (data.percent !== undefined) setupPercent.value = data.percent
      setupMessage.value = data.message
      if (data.step === 'done' && data.status === 'completed') { setupState.value = 'done'; setupPercent.value = 100; ollamaStatus.value = 'ready' }
      if (data.status === 'error' && data.step !== 'pulling_model') { setupState.value = 'error'; setupMessage.value = data.error || data.message }
    }
  )

  try {
    const result = await (window as any).electronAPI.copywriting.ollamaOneClickSetup(ollamaModelName.value)
    if (result.success) { setupState.value = 'done'; ollamaStatus.value = 'ready' }
    else { setupState.value = 'error'; setupMessage.value = result.error || '配置失败' }
  } catch (e: any) { setupState.value = 'error'; setupMessage.value = e.message || '配置失败' }
  finally { if (setupCleanup) { setupCleanup(); setupCleanup = null } }
}

async function startPullModelOnly() {
  setupState.value = 'running'; setupPercent.value = 0; setupMessage.value = '正在下载模型...'
  setupCleanup = (window as any).electronAPI.copywriting.onOllamaPullProgress(
    (data: { status: string; percent?: number; message: string }) => {
      if (data.percent !== undefined) setupPercent.value = data.percent
      setupMessage.value = data.message
    }
  )
  try {
    const result = await (window as any).electronAPI.copywriting.ollamaPullModel(ollamaModelName.value)
    if (result.success) { setupState.value = 'done'; ollamaStatus.value = 'ready' }
    else { setupState.value = 'error'; setupMessage.value = result.error || '下载失败' }
  } catch (e: any) { setupState.value = 'error'; setupMessage.value = e.message || '下载失败' }
  finally { if (setupCleanup) { setupCleanup(); setupCleanup = null } }
}

async function testConnection() {
  testLoading.value = true; testResult.value = null
  try {
    const result = await (window as any).electronAPI.copywriting.testConnection({
      provider: aiConfig.provider, apiKey: aiConfig.apiKey,
      baseUrl: aiConfig.baseUrl || defaultBaseUrl, model: aiConfig.model || defaultModel,
      maxTokens: 10, timeout: 15000, retry: 0,
    })
    testResult.value = { success: result.success, message: result.success ? '连接成功' : (result.error || '连接失败') }
  } catch { testResult.value = { success: false, message: '连接失败，请检查网络' } }
  finally { testLoading.value = false }
}

const qualityOptions = [
  { value: 'best', label: '最佳画质 (推荐)' },
  { value: '1080p', label: '1080P 高清' },
  { value: '720p', label: '720P 标清' },
  { value: '480p', label: '480P 流畅' },
]

async function selectDownloadDir() {
  const dir = await window.electronAPI.dialog.selectFolder()
  if (dir) { settings.value.downloadDir = dir; localStorage.setItem('settings', JSON.stringify(settings.value)) }
}

async function selectCookiesFile() {
  const file = await window.electronAPI.dialog.selectFile()
  if (file) { settings.value.cookiesFile = file; localStorage.setItem('settings', JSON.stringify(settings.value)) }
}

function clearCookiesFile() {
  settings.value.cookiesFile = ''
  localStorage.setItem('settings', JSON.stringify(settings.value))
}

function saveSettings() {
  localStorage.setItem('settings', JSON.stringify(settings.value))
  ;(window as any).electronAPI.copywriting.saveConfig({
    provider: aiConfig.provider, apiKey: aiConfig.apiKey || '',
    baseUrl: aiConfig.provider === 'ollama' ? 'http://localhost:11434/v1' : (aiConfig.baseUrl || defaultBaseUrl),
    model: aiConfig.provider === 'ollama' ? ollamaModelName.value : (aiConfig.model || defaultModel),
  }).catch(() => {})
  alert('设置已保存')
}

async function loadSettings() {
  const saved = localStorage.getItem('settings')
  if (saved) { const parsed = JSON.parse(saved); settings.value = { ...settings.value, ...parsed } }
  if (!settings.value.downloadDir) settings.value.downloadDir = await window.electronAPI.app.getDefaultDownloadDir()
  try {
    const ai = await (window as any).electronAPI.copywriting.getConfig()
    if (ai) { aiConfig.provider = ai.provider || 'ollama'; aiConfig.apiKey = ai.apiKey || ''; aiConfig.baseUrl = ai.baseUrl || ''; aiConfig.model = ai.model || '' }
  } catch {}
  if (aiConfig.provider === 'ollama') refreshOllamaStatus()
  try { ytdlpVersion.value = '已安装' } catch { ytdlpVersion.value = '未知' }
}

onMounted(() => { loadSettings() })
</script>
