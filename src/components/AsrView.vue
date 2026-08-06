<template>
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Panel - Controls -->
    <section class="w-[55%] flex flex-col bg-surface relative">
      <div class="flex-1 overflow-y-auto px-8 py-6">
        <div class="max-w-xl mx-auto w-full flex flex-col gap-6">
          <!-- Title -->
          <div class="flex flex-col gap-1">
            <h1 class="font-headline text-2xl font-bold leading-tight text-on-surface">语音识别转字幕</h1>
            <p class="text-on-surface-variant text-sm">拖入文件或粘贴链接，自动生成字幕</p>
          </div>

          <!-- Mode Switch -->
          <div class="flex bg-bg-card rounded-xl p-1 gap-1 border border-border-subtle">
            <button
              class="flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
              :class="asrMode === 'file' ? 'bg-primary text-on-primary shadow-glow-primary' : 'text-text-muted hover:text-text-secondary'"
              @click="asrMode = 'file'"
            >本地文件</button>
            <button
              class="flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
              :class="asrMode === 'url' ? 'bg-primary text-on-primary shadow-glow-primary' : 'text-text-muted hover:text-text-secondary'"
              @click="asrMode = 'url'"
            >在线链接</button>
          </div>

          <!-- URL Mode -->
          <template v-if="asrMode === 'url'">
            <div class="flex flex-col gap-3">
              <div class="relative glow-ring rounded-2xl">
                <textarea
                  v-model="urlInput"
                  class="w-full h-22 glass-card p-3.5 text-text-primary placeholder:text-text-muted resize-none text-sm transition-all duration-300 focus:shadow-glow-primary"
                  placeholder="粘贴视频链接，自动下载音频并生成字幕..."
                />
              </div>
              <button
                class="w-full flex items-center justify-center gap-2 rounded-xl h-11 font-bold text-sm transition-all duration-300 gradient-primary text-white shadow-glow-primary hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                :disabled="!urlInput || isProcessing"
                @click="processUrl"
              >
                <span v-if="urlLoading" class="material-symbols-outlined text-[18px] animate-spin">sync</span>
                <span v-else class="material-symbols-outlined text-[18px]">link</span>
                <span>{{ urlLoading ? '下载并识别中...' : '开始识别链接' }}</span>
              </button>
            </div>
          </template>

          <!-- File Mode -->
          <template v-else>
          <div class="flex gap-3">
            <div class="flex-1 flex flex-col gap-1.5">
              <span class="text-[10px] font-bold text-outline uppercase tracking-wider">ASR 引擎</span>
              <div class="grid grid-cols-2 gap-1.5">
                <label
                  v-for="engine in engines"
                  :key="engine.name"
                  class="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors border"
                  :class="[
                    engine.locked
                      ? 'opacity-50 cursor-not-allowed bg-surface-container-lowest border-outline-variant/20'
                      : selectedEngine === engine.name
                        ? 'bg-surface-container-highest/50 border-primary/30'
                        : 'bg-surface-container-lowest border-outline-variant/20 hover:border-primary/40'
                  ]"
                  @click="!engine.locked && (selectedEngine = engine.name)"
                >
                  <div class="size-3.5 rounded-full border-4 flex-shrink-0"
                    :class="selectedEngine === engine.name && !engine.locked ? 'border-primary bg-surface' : 'border-outline-variant bg-surface'" />
                  <span class="text-xs font-semibold text-on-surface">{{ engine.label }}</span>
                  <MaterialIcon v-if="engine.locked" name="lock" :size="12" class="text-outline ml-auto" />
                </label>
              </div>
            </div>
            <div class="w-24 flex flex-col gap-1.5">
              <span class="text-[10px] font-bold text-outline uppercase tracking-wider">格式</span>
              <label
                v-for="fmt in availableFormats"
                :key="fmt"
                class="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors border"
                :class="selectedFormat === fmt
                  ? 'bg-surface-container-highest/50 border-primary/30'
                  : 'bg-surface-container-lowest border-outline-variant/20 hover:border-primary/40'"
                @click="selectedFormat = fmt"
              >
                <div class="size-3.5 rounded-full border-4 flex-shrink-0"
                  :class="selectedFormat === fmt ? 'border-primary bg-surface' : 'border-outline-variant bg-surface'" />
                <span class="text-xs font-semibold text-on-surface">{{ fmt }}</span>
              </label>
            </div>
          </div>

          <!-- File Drop Zone -->
          <div class="flex flex-col gap-3">
            <div class="flex gap-3">
              <div
                class="flex-1 bg-surface-container-highest rounded-md p-3 text-on-surface placeholder:text-outline-variant font-body text-sm border-2 border-dashed border-outline-variant/30 transition-all"
                @dragover.prevent
                @drop.prevent="handleDrop"
              >
                <div v-if="fileList.length === 0" class="flex flex-col items-center justify-center h-24 text-on-surface-variant">
                  <MaterialIcon name="video_file" :size="36" class="mb-2 opacity-40" />
                  <p class="text-sm">拖拽视频/音频文件到此处</p>
                  <p class="text-xs mt-1 opacity-60">支持 MP4, MOV, AVI, MKV, MP3, WAV 等格式</p>
                </div>
                <div v-else class="max-h-24 overflow-y-auto">
                  <div v-for="(f, i) in fileList" :key="i" class="text-xs text-on-surface py-0.5 flex items-center gap-2">
                    <MaterialIcon name="video_file" :size="14" class="text-primary flex-shrink-0" />
                    <span class="truncate">{{ f.fileName }}</span>
                    <button class="ml-auto text-on-surface-variant hover:text-error" @click="fileList.splice(i, 1)">
                      <MaterialIcon name="close" :size="12" />
                    </button>
                  </div>
                </div>
              </div>
              <button
                class="px-4 bg-surface-container-highest text-on-surface font-headline font-semibold text-sm rounded-md hover:bg-surface-variant transition-colors border border-outline-variant/10"
                @click="selectFiles"
              >
                选择视频
              </button>
            </div>
          </div>

          </template>

          <!-- Process Button (file mode only) -->
          <button v-if="asrMode === 'file'"
            class="w-full flex items-center justify-center gap-2 rounded-xl h-12 font-headline font-bold text-base shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 text-on-primary-fixed gradient-btn-orange disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="fileList.length === 0 || isProcessing"
            @click="startProcessing"
          >
            <MaterialIcon v-if="isProcessing" name="sync" :size="24" class="animate-spin" />
            <MaterialIcon v-else name="mic" :size="24" />
            <span>{{ isProcessing ? '处理中...' : '开始语音识别' }}</span>
          </button>

          <!-- Trial / Upgrade Banner -->
          <div v-if="licenseStatus && (licenseStatus.tier === 'trial' || licenseStatus.tier === 'free')"
            class="flex items-center gap-3 p-3 rounded-lg"
            :class="licenseStatus.tier === 'trial' ? 'bg-tertiary-container/30 border border-tertiary/20' : 'bg-surface-container-highest border border-outline-variant/20'"
          >
            <MaterialIcon name="stars" :size="20" class="text-tertiary flex-shrink-0" />
            <div class="flex-1">
              <p v-if="licenseStatus.tier === 'trial'" class="text-xs text-on-surface">
                🎁 试用中：还剩 <strong>{{ licenseStatus.trialRemaining?.asr || 0 }}</strong> 次语音识别
              </p>
              <p v-else class="text-xs text-on-surface">
                今日剩余 <strong>{{ dailyAsrRemaining }}</strong> 次 / 仅 B 接口可用
              </p>
            </div>
            <button
              class="px-3 py-1.5 text-[11px] font-semibold bg-primary text-on-primary rounded-md hover:bg-primary/90 transition-colors"
              @click="goToLicense"
            >
              升级 Pro
            </button>
          </div>
        </div>
      </div>

      <!-- Processing Progress Bar -->
      <div
        v-if="isProcessing"
        class="sticky bottom-0 left-0 w-full bg-surface-container-low/95 backdrop-blur-md border-t border-outline-variant/15 px-8 py-3.5 z-20"
      >
        <div class="max-w-xl mx-auto flex flex-col gap-2">
          <div class="flex justify-between items-center text-[12px] font-semibold">
            <div class="flex items-center gap-2 text-primary">
              <MaterialIcon name="sync" :size="16" class="animate-spin" />
              <span class="tracking-wide">正在识别: {{ currentProcessingFile }}</span>
            </div>
            <span class="font-mono text-primary font-bold">{{ completedCount }}/{{ fileList.length }}</span>
          </div>
          <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
            <div
              class="h-full bg-[#FFB347] rounded-full transition-all duration-500"
              :style="{ width: ((completedCount / fileList.length) * 100) + '%' }" />
          </div>
        </div>
      </div>
    </section>

    <!-- Right Panel - Subtitle Preview -->
    <section class="w-[45%] bg-surface-container-low flex flex-col pt-6 px-6 pb-6 border-l border-outline-variant/10">
      <!-- Tab: Tasks / Subtitle -->
      <div class="flex items-center gap-4 mb-4">
        <button class="text-sm font-bold pb-2 border-b-2 transition-colors"
          :class="rightTab === 'tasks' ? 'text-primary border-primary' : 'text-text-muted border-transparent hover:text-text-secondary'"
          @click="rightTab = 'tasks'">识别任务</button>
        <button class="text-sm font-bold pb-2 border-b-2 transition-colors"
          :class="rightTab === 'subtitle' ? 'text-primary border-primary' : 'text-text-muted border-transparent hover:text-text-secondary'"
          @click="rightTab = 'subtitle'">字幕预览</button>
        <button
          class="ml-auto p-1 text-text-muted hover:text-text-primary rounded transition-colors"
          @click="rightTab === 'tasks' ? clearCompleted() : (selectedSubtitle = '')"
        >
          <MaterialIcon name="clear_all" :size="16" />
        </button>
      </div>

      <!-- Tasks View -->
      <div v-if="rightTab === 'tasks'" class="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
        <div v-if="tasks.length === 0" class="flex flex-col items-center justify-center py-12 text-on-surface-variant">
          <MaterialIcon name="mic" :size="48" class="mb-3 opacity-30" />
          <p class="text-sm">暂无识别任务</p>
          <p class="text-xs mt-1 opacity-70">添加文件或链接后开始识别</p>
        </div>
        <div v-for="task in tasks" :key="task.id"
          class="flex items-center gap-3 p-3 rounded-md border transition-all cursor-pointer"
          :class="task.status === 'completed' ? 'bg-surface-container-highest/60 border-outline-variant/5 hover:border-primary/30' : 'bg-surface-container-lowest border-outline-variant/10 opacity-70'"
          @click="previewSubtitle(task)"
        >
          <MaterialIcon :name="task.status === 'completed' ? 'check_circle' : 'error'" :size="20"
            :class="task.status === 'completed' ? 'text-primary' : 'text-error'" />
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-on-surface truncate">{{ task.fileName }}</p>
            <p class="text-[10px] text-on-surface-variant">{{ task.engine || '字幕提取' }} · {{ task.status === 'completed' ? '点击预览' : task.error }}</p>
          </div>
          <button class="p-1 text-text-muted hover:text-error" @click.stop="removeTask(task.id)">
            <MaterialIcon name="close" :size="14" />
          </button>
        </div>
      </div>

      <!-- Subtitle Preview -->
      <div v-else class="flex-1 overflow-hidden flex flex-col">
        <div v-if="!selectedSubtitle" class="flex flex-col items-center justify-center py-12 text-on-surface-variant flex-1">
          <MaterialIcon name="subtitles" :size="48" class="mb-3 opacity-30" />
          <p class="text-sm">暂无字幕预览</p>
          <p class="text-xs mt-1 opacity-70">完成识别后点击任务查看字幕</p>
        </div>
        <template v-else>
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs text-text-muted">可编辑字幕文本（纯文案，无时间线）</span>
            <button class="text-xs text-primary hover:text-primary-hover transition-colors font-medium" @click="copySubtitle">复制全文</button>
          </div>
          <textarea
            v-model="editableSubtitle"
            class="flex-1 w-full resize-none text-sm text-text-primary bg-bg-card rounded-xl p-4 border border-border-subtle focus:border-primary/40 focus:outline-none leading-relaxed transition-colors"
            placeholder="字幕内容..."
          ></textarea>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import MaterialIcon from './icons/MaterialIcon.vue'
import type { AsrEngine, AsrTask, LicenseStatus } from '../types'

// State
const asrMode = ref<'file' | 'url'>('file')
const rightTab = ref<'tasks' | 'subtitle'>('tasks')
const selectedEngine = ref('Bcut')
const selectedFormat = ref('SRT')
const urlInput = ref('')
const urlLoading = ref(false)
const selectedSubtitle = ref('')
const editableSubtitle = ref('')
const engines = ref<AsrEngine[]>([])
const availableFormats = ref<string[]>(['SRT'])
const fileList = ref<{ filePath: string; fileName: string }[]>([])
const tasks = ref<AsrTask[]>([])
const isProcessing = ref(false)
const currentProcessingFile = ref('')
const completedCount = ref(0)
const licenseStatus = ref<LicenseStatus | null>(null)
const dailyAsrRemaining = ref(3)

// Load data on mount
onMounted(async () => {
  await refreshAsrLicense()
})

async function refreshAsrLicense() {
  try {
    const [engs, status, usage] = await Promise.all([
      window.electronAPI.asr.getEngines(),
      window.electronAPI.license.getStatus(),
      window.electronAPI.license.getDailyUsage(),
    ])
    engines.value = engs
    licenseStatus.value = status
    availableFormats.value = status.limits.exportFormats
    if (usage.limit != null && status.tier !== 'premium' && status.tier !== 'pro') {
      dailyAsrRemaining.value = Math.max(0, usage.limit - usage.asrProcessings)
    } else {
      dailyAsrRemaining.value = -1 // 不限次数
    }
  } catch (e) {
    // Fallback defaults
    engines.value = [
      { name: 'Bcut', label: 'B 接口 (必剪)', available: true, locked: false },
      { name: 'JianYing', label: 'J 接口 (剪映)', available: true, locked: true },
      { name: 'KuaiShou', label: 'K 接口 (快手)', available: true, locked: true },
    ]
  }
}

// 激活后刷新
window.addEventListener('license:activated', () => refreshAsrLicense())

async function selectFiles() {
  const files = await window.electronAPI.dialog.selectVideo()
  for (const file of files) {
    addFile(file)
  }
}

function addFile(filePath: string) {
  const fileName = filePath.split('\\').pop() || filePath
  if (!fileList.value.find(f => f.filePath === filePath)) {
    fileList.value.push({ filePath, fileName })
  }
}

function handleDrop(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (!files) return
  for (let i = 0; i < files.length; i++) {
    const file = files[i] as any
    const filePath = file.path || file.name
    addFile(filePath)
  }
}

async function startProcessing() {
  if (isProcessing.value || fileList.value.length === 0) return

  isProcessing.value = true
  completedCount.value = 0
  tasks.value = fileList.value.map(f => ({
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    filePath: f.filePath,
    fileName: f.fileName,
    engine: selectedEngine.value,
    exportFormat: selectedFormat.value,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  }))

  for (let i = 0; i < tasks.value.length; i++) {
    const task = tasks.value[i]
    task.status = 'processing'
    currentProcessingFile.value = task.fileName

    try {
      console.log('[ASR UI] Calling process:', task.filePath, task.engine, task.exportFormat)
      const result = await window.electronAPI.asr.process(task.filePath, task.engine, task.exportFormat)
      console.log('[ASR UI] Success:', result)
      task.status = 'completed'
      task.resultPath = result.savePath
    } catch (e: any) {
      console.error('[ASR UI] IPC Error:', e)
      console.error('[ASR UI] Error message:', e.message)
      console.error('[ASR UI] Error stack:', e.stack)
      task.status = 'error'
      task.error = parseError(e.message || '未知错误')
    }

    completedCount.value = i + 1

    // Refresh license status after each ASR use
    try {
      const status = await window.electronAPI.license.getStatus()
      licenseStatus.value = status
    } catch {}
  }

  isProcessing.value = false
  fileList.value = []
}

function parseError(msg: string): string {
  if (msg.startsWith('TRIAL_EXHAUSTED:')) return '试用次数已用完'
  if (msg.startsWith('DAILY_LIMIT:')) return '今日免费次数已用完'
  if (msg.startsWith('ENGINE_LOCKED:')) return '该引擎需升级'
  return msg.substring(0, 50)
}

function removeTask(id: string) {
  tasks.value = tasks.value.filter(t => t.id !== id)
}

function clearCompleted() {
  tasks.value = tasks.value.filter(t => t.status !== 'completed')
}

function openFile(filePath: string) {
  window.electronAPI.shell.openPath(filePath)
}

// 从分享文案中提取 URL（复刻 DownloadView 逻辑）
function extractUrl(text: string): string {
  const cleanText = text.replace(/锟斤拷|锟|斤|拷/g, '').trim()
  const douyinMatch = cleanText.match(/https:\/\/v\.douyin\.com\/[a-zA-Z0-9_\-]+/i)
  if (douyinMatch) return douyinMatch[0]
  const xhsMatch = cleanText.match(/https:\/\/www\.xiaohongshu\.com\/discovery\/item\/[a-zA-Z0-9]+[^\s`]*/i)
  if (xhsMatch) return xhsMatch[0]
  const biliMatch = cleanText.match(/https:\/\/www\.bilibili\.com\/video\/[a-zA-Z0-9]+[^\s`]*/i)
  if (biliMatch) return biliMatch[0]
  const b23Match = cleanText.match(/https:\/\/b23\.tv\/[a-zA-Z0-9]+/i)
  if (b23Match) return b23Match[0]
  const ytMatch = cleanText.match(/https:\/\/(www\.)?(youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+)/i)
  if (ytMatch) return ytMatch[0]
  const igMatch = cleanText.match(/https:\/\/(www\.)?instagram\.com\/[^\s]+/i)
  if (igMatch) return igMatch[0]
  const generalMatch = cleanText.match(/https?:\/\/[^\s一-龥]+/i)
  if (generalMatch) return generalMatch[0]
  return cleanText
}

async function processUrl() {
  if (!urlInput.value || urlLoading.value) return

  // 提取纯 URL
  const cleanUrl = extractUrl(urlInput.value)
  urlInput.value = cleanUrl

  urlLoading.value = true
  isProcessing.value = true

  const taskId = Date.now().toString()
  const task: AsrTask = {
    id: taskId,
    filePath: cleanUrl,
    fileName: '链接: ' + cleanUrl.substring(0, 50) + '...',
    engine: selectedEngine.value,
    exportFormat: selectedFormat.value,
    status: 'processing',
    createdAt: new Date().toISOString(),
  }
  tasks.value.unshift(task)

  try {
    const result = await window.electronAPI.asr.processUrl(cleanUrl, selectedEngine.value, selectedFormat.value)
    task.status = 'completed'
    task.resultPath = result.savePath
    task.resultText = result.resultText
    selectedSubtitle.value = result.resultText
    editableSubtitle.value = stripSrt(result.resultText)
    rightTab.value = 'subtitle'
  } catch (e: any) {
    task.status = 'error'
    task.error = e.message?.substring(0, 60) || '处理失败'
  }

  urlInput.value = ''
  urlLoading.value = false
  isProcessing.value = false
}

// 去除 SRT 时间线和序号，只保留纯文案
function stripSrt(raw: string): string {
  return raw
    .replace(/^\d+\s*$/gm, '')           // 序号
    .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\s*$/gm, '') // 时间线
    .replace(/\n{3,}/g, '\n\n')           // 合并多余空行
    .trim()
}

function copySubtitle() {
  navigator.clipboard.writeText(editableSubtitle.value)
}

function previewSubtitle(task: AsrTask) {
  if (task.status === 'completed' && task.resultText) {
    selectedSubtitle.value = task.resultText
    editableSubtitle.value = stripSrt(task.resultText)
    rightTab.value = 'subtitle'
  }
}

function goToLicense() {
  window.dispatchEvent(new CustomEvent('navigate-to-license'))
}
</script>
