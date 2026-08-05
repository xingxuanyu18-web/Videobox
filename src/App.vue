<template>
  <div class="flex w-full h-screen text-text-primary relative" style="background: radial-gradient(ellipse at 50% 0%, #1A1508 0%, #0A0800 40%, #000000 100%)">
    <!-- Drag region for custom titlebar -->
    <div class="fixed top-0 left-0 right-0 h-9 z-50" style="-webkit-app-region: drag"></div>
    <!-- Sidebar -->
    <aside class="w-56 flex-shrink-0 flex flex-col border-r border-border-subtle select-none relative z-10 pt-9" style="background: linear-gradient(180deg, #050505 0%, #000000 50%, #050300 100%)">
      <!-- Logo -->
      <div class="flex items-center gap-3 px-5 py-5 border-b border-border-subtle">
        <div class="size-9 rounded-xl flex items-center justify-center shadow-glow-primary" style="background:#FDC941">
          <svg class="size-5" viewBox="0 0 32 32" fill="none">
            <path d="M6 4L16 12L6 20V4Z" fill="#000000" opacity="0.9"/>
            <path d="M16 12L26 4V20L16 12Z" fill="#000000" opacity="0.6"/>
            <rect x="6" y="22" width="20" height="4" rx="2" fill="#000000" opacity="0.7"/>
          </svg>
        </div>
        <div>
          <h1 class="font-bold text-sm text-text-primary tracking-tight">VIDEOBOX</h1>
          <p class="text-2xs text-text-muted">Media Toolbox</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 flex flex-col gap-1 px-3 py-4">
        <button
          v-for="item in navItems"
          :key="item.key"
          @click="currentTab = item.key"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group"
          :class="currentTab === item.key
            ? 'bg-primary-subtle text-primary font-semibold'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated font-medium'"
        >
          <span class="material-symbols-outlined text-[20px]" :class="currentTab === item.key ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'">
            {{ item.icon }}
          </span>
          <span>{{ item.label }}</span>
          <div v-if="currentTab === item.key" class="ml-auto size-1.5 rounded-full bg-primary shadow-glow-primary"></div>
        </button>
      </nav>

      <!-- Bottom: License Badge -->
      <div class="px-3 py-4 border-t border-border-subtle">
        <button
          @click="currentTab = 'license'"
          class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 group"
          :class="licenseBadgeClass"
        >
          <span class="size-2 rounded-full flex-shrink-0" :class="licenseDotClass"></span>
          <span class="text-xs font-medium">{{ licenseBadgeText }}</span>
          <span class="ml-auto text-2xs text-text-muted">{{ licenseBadgeAction }}</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex overflow-hidden">
      <DownloadView v-show="currentTab === 'download'" />
      <AsrView v-show="currentTab === 'asr'" />
      <CopywritingView v-show="currentTab === 'copywriting'" />
      <HistoryView v-show="currentTab === 'history'" />
      <LicenseView v-show="currentTab === 'license'" />
      <AboutView v-show="currentTab === 'about'" />
      <SettingsView v-show="currentTab === 'settings'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DownloadView from './components/DownloadView.vue'
import AsrView from './components/AsrView.vue'
import HistoryView from './components/HistoryView.vue'
import CopywritingView from './components/CopywritingView.vue'
import LicenseView from './components/LicenseView.vue'
import AboutView from './components/AboutView.vue'
import SettingsView from './components/SettingsView.vue'

const currentTab = ref('download')
const licenseTier = ref('free')

const navItems = [
  { key: 'download', label: '视频下载', icon: 'download' },
  { key: 'asr', label: '语音识别', icon: 'mic' },
  { key: 'copywriting', label: 'AI 文案', icon: 'edit_note' },
  { key: 'history', label: '任务历史', icon: 'history' },
  { key: 'about', label: '关于', icon: 'info' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

const licenseBadgeClass = computed(() => {
  if (licenseTier.value === 'pro') return 'bg-primary-subtle hover:bg-primary-subtle'
  if (licenseTier.value === 'premium') return 'bg-accent-subtle hover:bg-accent-subtle'
  if (licenseTier.value === 'trial') return 'bg-accent-subtle hover:bg-accent-subtle'
  return 'bg-bg-elevated hover:bg-bg-highlight'
})

const licenseDotClass = computed(() => {
  if (licenseTier.value === 'pro') return 'bg-primary shadow-glow-primary'
  if (licenseTier.value === 'premium') return 'bg-accent shadow-glow-accent'
  if (licenseTier.value === 'trial') return 'bg-accent animate-pulse'
  return 'bg-text-muted'
})

const licenseBadgeText = computed(() => {
  if (licenseTier.value === 'pro') return 'Pro 永久版'
  if (licenseTier.value === 'premium') return 'Premium 订阅'
  if (licenseTier.value === 'trial') return '试用中'
  return '免费版'
})

const licenseBadgeAction = computed(() => {
  if (licenseTier.value === 'free' || licenseTier.value === 'trial') return '升级 →'
  return ''
})

onMounted(async () => {
  try {
    const status = await window.electronAPI?.license?.getStatus?.()
    if (status) licenseTier.value = status.tier
  } catch {}
})

// Event listeners
window.addEventListener('navigate-to-settings', () => { currentTab.value = 'settings' })
window.addEventListener('navigate-to-license', () => { currentTab.value = 'license' })
</script>
