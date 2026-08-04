<template>
  <div class="flex-1 bg-surface overflow-y-auto">
    <div class="max-w-2xl mx-auto px-6 py-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="font-headline text-2xl font-bold text-on-surface">关于 Videobox</h1>
      </div>

      <!-- App Info Card -->
      <div class="bg-gradient-to-br from-primary/5 to-tertiary/10 rounded-2xl p-6 mb-6 border border-outline-variant/10">
        <div class="flex items-center gap-4">
          <!-- App Icon -->
          <div class="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg class="w-9 h-9 text-primary" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z" fill="currentColor"/>
            </svg>
          </div>

          <!-- App Info -->
          <div class="flex-1 min-w-0">
            <h2 class="font-headline text-xl font-bold text-on-surface">Videobox</h2>
            <p class="text-on-surface-variant text-sm mt-0.5">v{{ appVersion }}</p>
            <p class="text-on-surface-variant text-xs mt-1">全平台视频下载 + 智能语音识别字幕</p>
          </div>

          <!-- Update Button with Status -->
          <div class="flex items-center gap-2">
            <!-- Install Now Button (显示在下载完成后) -->
            <button
              v-if="updateReady"
              class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors shrink-0"
              @click="installUpdate"
            >
              <MaterialIcon name="restart_alt" :size="16" />
              <span>安装并重启</span>
            </button>

            <!-- Check / Downloading Button -->
            <button
              v-else
              class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="checkingUpdate || downloading"
              @click="checkUpdate"
            >
              <MaterialIcon
                :name="checkingUpdate ? 'sync' : downloading ? 'download' : 'update'"
                :size="16"
                :class="{ 'animate-spin': checkingUpdate || downloading }"
              />
              <span>{{ checkingUpdate ? '检测中' : downloading ? `下载中 ${downloadProgress}%` : '检测更新' }}</span>
            </button>
          </div>
        </div>

        <!-- Update Result -->
        <div v-if="updateMessage" class="mt-4 pt-4 border-t border-outline-variant/20 space-y-3">
          <!-- Progress Bar (during download) -->
          <div v-if="downloading" class="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
            <div
              class="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              :style="{ width: downloadProgress + '%' }"
            ></div>
          </div>

          <!-- Status Message + Action -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm" :class="updateMessageClass">
              <MaterialIcon
                :name="
                  checkingUpdate ? 'sync' :
                  downloading ? 'download' :
                  updateReady ? 'check_circle' :
                  isLatest ? 'check_circle' : 'info'
                "
                :size="16"
                :class="{ 'animate-spin': checkingUpdate || downloading }"
              />
              <span>{{ updateMessage }}</span>
            </div>

            <!-- Fallback: manual download link (if auto-download failed) -->
            <button
              v-if="downloadUrl && !isLatest && !downloading && !updateReady"
              @click="openExternal(downloadUrl)"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <MaterialIcon name="open_in_new" :size="14" />
              <span>前往下载</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="bg-surface-container-low rounded-xl p-5 mb-6 border border-outline-variant/10">
        <h3 class="font-headline text-base font-bold text-on-surface mb-3">产品介绍</h3>
        <p class="text-sm text-on-surface-variant leading-relaxed">
          Videobox 是一款集<strong class="text-on-surface">视频下载</strong>与<strong class="text-on-surface">语音识别字幕生成</strong>于一体的桌面工具。
          基于 YT-DLP 引擎支持全球 1000+ 网站视频下载，同时内置多个 ASR 引擎，可将音视频文件自动转换为
          SRT/ASS/TXT 字幕文件，无需 GPU 或复杂配置。
        </p>
      </div>

      <!-- Feature List -->
      <div class="bg-surface-container-low rounded-xl p-5 mb-6 border border-outline-variant/10">
        <h3 class="font-headline text-base font-bold text-on-surface mb-4">核心功能</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex items-start gap-2.5">
            <MaterialIcon name="smart_display" :size="18" class="text-primary mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-on-surface">全平台视频下载</p>
              <p class="text-xs text-on-surface-variant mt-0.5">抖音、B站、YouTube、小红书、Instagram 等</p>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <MaterialIcon name="mic" :size="18" class="text-primary mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-on-surface">语音识别转字幕</p>
              <p class="text-xs text-on-surface-variant mt-0.5">必剪、剪映、快手多引擎，SRT/ASS/TXT 导出</p>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <MaterialIcon name="high_quality" :size="18" class="text-primary mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-on-surface">4K 高清下载</p>
              <p class="text-xs text-on-surface-variant mt-0.5">支持多清晰度选择，包括 4K 超清</p>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <MaterialIcon name="speed" :size="18" class="text-primary mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-on-surface">批量处理</p>
              <p class="text-xs text-on-surface-variant mt-0.5">多线程并发下载与识别，效率翻倍</p>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <MaterialIcon name="translate" :size="18" class="text-primary mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-on-surface">多音轨多字幕</p>
              <p class="text-xs text-on-surface-variant mt-0.5">YouTube 多语言音轨选择，字幕下载</p>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <MaterialIcon name="cookie" :size="18" class="text-primary mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium text-on-surface">Cookie 支持</p>
              <p class="text-xs text-on-surface-variant mt-0.5">导入浏览器 Cookie，下载需登录内容</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tech Stack -->
      <div class="mb-6">
        <h3 class="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-3">技术栈</h3>
        <div class="flex flex-wrap gap-2">
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Electron</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Vue 3</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">TypeScript</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Tailwind CSS</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">YT-DLP</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Puppeteer</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">FFmpeg</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Node.js</span>
        </div>
      </div>

      <!-- ASR Engines -->
      <div class="mb-6">
        <h3 class="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-3">ASR 引擎支持</h3>
        <div class="flex flex-wrap gap-2">
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Bcut 必剪</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">JianYing 剪映</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">KuaiShou 快手</span>
        </div>
      </div>

      <!-- Supported Platforms -->
      <div class="mb-6">
        <h3 class="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-3">支持的视频平台</h3>
        <div class="flex flex-wrap gap-2">
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">抖音</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Bilibili</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">YouTube</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">小红书</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Instagram</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">快手</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Twitter/X</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">Facebook</span>
          <span class="text-xs px-3 py-1.5 bg-surface-container-low rounded-lg text-on-surface border border-outline-variant/10">+ 1000+ 网站</span>
        </div>
      </div>

      <!-- External Links -->
      <div class="space-y-3 mb-6">
        <button
          @click="openExternal('mailto:support@videobox.app')"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-low hover:bg-surface-container-highest transition-colors group border border-outline-variant/10 text-left"
        >
          <div class="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center group-hover:bg-surface transition-colors">
            <MaterialIcon name="mail" :size="18" class="text-on-surface" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-on-surface">联系与反馈</p>
            <p class="text-xs text-on-surface-variant">support@videobox.app</p>
          </div>
          <MaterialIcon name="arrow_forward_ios" :size="14" class="text-on-surface-variant" />
        </button>
      </div>

      <!-- License -->
      <div class="flex items-center justify-between py-4 border-t border-outline-variant/20">
        <div class="flex items-center gap-2">
          <MaterialIcon name="gavel" :size="16" class="text-on-surface-variant" />
          <span class="text-sm text-on-surface-variant">开源协议</span>
        </div>
        <span class="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">MIT License</span>
      </div>

      <!-- Copyright -->
      <div class="text-center pt-4 pb-2">
        <p class="text-xs text-on-surface-variant/60">Videobox — 融合 AsrTools 与 Videdown</p>
        <p class="text-xs text-on-surface-variant/40 mt-1">© 2026 Videobox</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MaterialIcon from './icons/MaterialIcon.vue'

const appVersion = ref('1.0.0')

const isLatest = ref(true)
const checkingUpdate = ref(false)
const downloadProgress = ref(0)
const downloading = ref(false)
const updateReady = ref(false)
const updateMessage = ref('')
const updateMessageClass = ref('')
const latestVersion = ref('')
const releaseNotes = ref('')
const downloadUrl = ref('')
let removeStatusListener: (() => void) | null = null

onMounted(async () => {
  try {
    const version = await window.electronAPI?.app?.getVersion?.()
    if (version) {
      appVersion.value = version
    }
  } catch (error) {
    console.error('获取版本号失败:', error)
  }

  // 监听主进程推送的更新状态事件
  removeStatusListener = window.electronAPI?.onUpdateStatus?.((data) => {
    switch (data.status) {
      case 'checking':
        checkingUpdate.value = true
        updateMessage.value = '正在检测更新...'
        updateMessageClass.value = 'text-on-surface-variant'
        break

      case 'available':
        checkingUpdate.value = false
        isLatest.value = false
        latestVersion.value = data.version || ''
        releaseNotes.value = data.releaseNotes || ''
        updateMessage.value = `发现新版本 v${data.version}，正在下载...`
        updateMessageClass.value = 'text-blue-600'
        // 自动下载已由 electron-updater 触发
        downloading.value = true
        break

      case 'no-update':
        checkingUpdate.value = false
        isLatest.value = true
        updateMessage.value = '当前已是最新版本 v' + appVersion.value
        updateMessageClass.value = 'text-green-600'
        downloading.value = false
        break

      case 'downloading':
        downloading.value = true
        downloadProgress.value = data.percent || 0
        updateMessage.value = `正在下载更新 ${data.percent}%`
        updateMessageClass.value = 'text-blue-600'
        break

      case 'downloaded':
        checkingUpdate.value = false
        downloading.value = false
        downloadProgress.value = 100
        updateReady.value = true
        isLatest.value = false
        latestVersion.value = data.version || latestVersion.value
        updateMessage.value = `v${data.version} 已下载完毕，点击安装`
        updateMessageClass.value = 'text-green-600'
        break

      case 'error':
        checkingUpdate.value = false
        downloading.value = false
        updateMessage.value = '检测失败：' + (data.error || '网络错误')
        updateMessageClass.value = 'text-red-600'
        break
    }
  })
})

onUnmounted(() => {
  removeStatusListener?.()
})

async function checkUpdate() {
  // 防止重复点击
  if (checkingUpdate.value || downloading.value) return

  checkingUpdate.value = true
  updateMessage.value = ''
  downloadUrl.value = ''

  try {
    const result = await window.electronAPI?.checkForUpdates?.()
    if (result?.error) {
      isLatest.value = true
      updateMessage.value = '检测失败：' + result.error
      updateMessageClass.value = 'text-red-600'
      checkingUpdate.value = false
    } else if (result?.hasUpdate) {
      // update-available 事件会进一步处理 UI
      // checkForUpdates 只告诉我们有更新，下载进度通过 onUpdateStatus 推送
      isLatest.value = false
      latestVersion.value = result.version || ''
      releaseNotes.value = result.releaseNotes || ''
      downloadUrl.value = result.downloadUrl || ''
      // 状态会由 onUpdateStatus 回调进一步更新
    } else {
      // 无更新的情况
      isLatest.value = true
      appVersion.value = result?.currentVersion || appVersion.value
      updateMessage.value = '当前已是最新版本 v' + appVersion.value
      updateMessageClass.value = 'text-green-600'
      checkingUpdate.value = false
    }
  } catch (error) {
    isLatest.value = true
    updateMessage.value = '检测失败，请检查网络连接'
    updateMessageClass.value = 'text-red-600'
    checkingUpdate.value = false
  }
}

function installUpdate() {
  window.electronAPI?.installUpdate?.()
}

async function openExternal(url: string) {
  try {
    await window.electronAPI.shell.openExternal(url)
  } catch (error) {
    // 静默处理
  }
}
</script>
