<template>
  <div class="flex-1 flex overflow-hidden">
    <section class="flex-1 flex flex-col bg-surface">
      <div class="flex-1 overflow-y-auto px-8 py-6">
        <div class="max-w-2xl mx-auto w-full flex flex-col gap-8">
          <!-- Title -->
          <div class="flex flex-col gap-1">
            <h1 class="font-headline text-2xl font-bold leading-tight text-on-surface">许可证管理</h1>
            <p class="text-on-surface-variant text-sm">管理你的 Videobox 许可证和订阅</p>
          </div>

          <!-- Current Status Card -->
          <div class="p-6 rounded-xl border-2" :class="statusCardClass">
            <div class="flex items-center gap-4">
              <div class="size-12 rounded-full flex items-center justify-center" :class="statusIconBg">
                <MaterialIcon :name="statusIcon" :size="28" :class="statusIconColor" />
              </div>
              <div class="flex-1">
                <h2 class="font-headline text-lg font-bold text-on-surface">{{ statusTitle }}</h2>
                <p class="text-sm text-on-surface-variant mt-0.5">{{ statusDescription }}</p>
              </div>
              <div v-if="tier === 'trial'" class="text-right">
                <p class="text-2xl font-bold text-tertiary">{{ trialDownloads || 0 }}</p>
                <p class="text-[10px] text-on-surface-variant">剩余下载次数</p>
                <p class="text-2xl font-bold text-tertiary mt-1">{{ trialAsr || 0 }}</p>
                <p class="text-[10px] text-on-surface-variant">剩余ASR次数</p>
              </div>
            </div>
          </div>

          <!-- Pricing Plans -->
          <div>
            <h3 class="font-headline text-base font-bold text-on-surface mb-4">升级方案</h3>
            <div class="grid grid-cols-2 gap-4 items-stretch">
              <!-- Pro Plan -->
              <div class="p-6 rounded-2xl border transition-all flex flex-col"
                :class="tier === 'pro' ? 'border-primary bg-primary-container/10 shadow-glow-primary' : 'border-border-subtle bg-bg-card hover:border-border-default'"
              >
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-lg font-extrabold text-text-primary">Pro</h4>
                  <span class="text-2xs font-bold text-primary bg-primary-subtle px-2.5 py-1 rounded-full">买断</span>
                </div>
                <p class="text-xs text-text-muted mb-4">一次付费，终身使用</p>
                <div class="mb-5">
                  <span class="text-4xl font-extrabold text-primary">¥99</span>
                  <span class="text-sm text-text-muted ml-1">/ 永久</span>
                </div>
                <ul class="space-y-2.5 mb-6 flex-1">
                  <li v-for="f in proFeatures" :key="f" class="flex items-center gap-2.5 text-xs text-text-secondary">
                    <span class="text-primary text-xs">•</span>{{ f }}
                  </li>
                </ul>
                <button
                  v-if="tier !== 'pro'"
                  class="w-full py-3 rounded-xl font-bold text-sm bg-primary text-on-primary hover:bg-primary-hover transition-all duration-200 active:scale-[0.98]"
                  @click="goToActivationPage('pro')"
                >购买 Pro</button>
                <button v-else
                  class="w-full py-3 rounded-xl font-bold text-sm bg-primary-subtle text-primary cursor-default"
                  disabled>已激活 ✓</button>
              </div>

              <!-- Premium Plan -->
              <div class="p-6 rounded-2xl border transition-all flex flex-col"
                :class="tier === 'premium' ? 'border-primary bg-primary-container/10 shadow-glow-primary' : 'border-border-subtle bg-bg-card hover:border-border-default'"
              >
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-lg font-extrabold text-text-primary">Premium</h4>
                  <span class="text-2xs font-bold text-on-primary bg-primary px-2.5 py-1 rounded-full">推荐</span>
                </div>
                <p class="text-xs text-text-muted mb-4">持续解锁最新功能</p>
                <div class="mb-5">
                  <span class="text-4xl font-extrabold text-primary">¥19</span>
                  <span class="text-sm text-text-muted ml-1">/ 月</span>
                </div>
                <ul class="space-y-2.5 mb-6 flex-1">
                  <li v-for="f in premiumFeatures" :key="f" class="flex items-center gap-2.5 text-xs text-text-secondary">
                    <span class="text-primary text-xs">•</span>{{ f }}
                  </li>
                </ul>
                <button
                  v-if="tier !== 'premium'"
                  class="w-full py-3 rounded-xl font-bold text-sm bg-primary text-on-primary hover:bg-primary-hover transition-all duration-200 active:scale-[0.98]"
                  @click="goToActivationPage('premium')"
                >订阅 Premium</button>
                <button v-else
                  class="w-full py-3 rounded-xl font-bold text-sm bg-primary-subtle text-primary cursor-default"
                  disabled>已订阅 ✓</button>
              </div>
            </div>
          </div>

          <!-- Already have key -->
          <div class="text-center">
            <button
              class="text-xs text-text-muted hover:text-primary transition-colors"
              @click="showActivationInput = showActivationInput ? null : 'manual'"
            >
              {{ showActivationInput ? '收起' : '已有激活码？点此输入' }}
            </button>
          </div>

          <!-- Activation Input -->
          <div v-if="showActivationInput" class="p-4 rounded-lg bg-surface-container-high border border-outline-variant/20 animate-fade-in">
            <h4 class="font-headline text-sm font-bold text-on-surface mb-3">输入激活码</h4>
            <div class="flex gap-3">
              <input
                v-model="activationKey"
                type="text"
                placeholder="VB-XXXX-XXXX-XXXX-PRO"
                class="flex-1 bg-surface-container-highest rounded-md px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:border-primary focus:outline-none"
                @keyup.enter="activate"
              />
              <button
                class="px-6 py-2 rounded-md font-headline font-semibold text-sm bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
                :disabled="!activationKey || isActivating"
                @click="activate"
              >
                {{ isActivating ? '验证中...' : '激活' }}
              </button>
            </div>
            <p v-if="activationError" class="text-xs text-error mt-2">{{ activationError }}</p>
            <p v-if="activationSuccess" class="text-xs text-primary mt-2">{{ activationSuccess }}</p>
          </div>

          <!-- Feature Comparison Table -->
          <div>
            <h3 class="font-headline text-base font-bold text-on-surface mb-4">功能对比</h3>
            <div class="overflow-hidden rounded-xl border border-border-subtle">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-bg-elevated">
                    <th class="text-left px-5 py-3 font-semibold text-text-secondary">功能</th>
                    <th class="text-center px-4 py-3 font-semibold text-text-secondary">免费版</th>
                    <th class="text-center px-4 py-3 font-semibold text-primary bg-primary-subtle">Pro</th>
                    <th class="text-center px-4 py-3 font-semibold text-primary bg-primary-subtle">Premium</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle">
                  <tr v-for="(row, i) in comparisonRows" :key="row.feature" :class="i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-elevated'">
                    <td class="px-5 py-3 text-text-primary">{{ row.feature }}</td>
                    <td class="text-center px-4 py-3 text-text-muted">{{ row.free }}</td>
                    <td class="text-center px-4 py-3 text-primary font-semibold">{{ row.pro }}</td>
                    <td class="text-center px-4 py-3 text-primary font-semibold">{{ row.premium }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import MaterialIcon from './icons/MaterialIcon.vue'

const tier = ref<string>('free')
const trialDownloads = ref(0)
const trialAsr = ref(0)
const showActivationInput = ref<string | null>(null)
const activationKey = ref('')
const isActivating = ref(false)
const activationError = ref('')
const activationSuccess = ref('')

const proFeatures = [
  '无限次视频下载 + 4K 超清',
  '全部 ASR 引擎 + 批量处理',
  'SRT / ASS / TXT 全格式字幕',
  '1 年免费版本更新',
  '无水印高速下载通道',
]
const premiumFeatures = [
  '包含 Pro 全部功能',
  'AI 字幕智能优化 (50次/月)',
  'AI 多语言实时翻译 (30次/月)',
  '持续版本更新 + 新功能优先',
  '专属技术支持通道',
]

const comparisonRows = [
  { feature: '视频下载', free: '每日 3 次', pro: '无限', premium: '无限' },
  { feature: '最高清晰度', free: '720p', pro: '4K', premium: '4K' },
  { feature: 'ASR 引擎', free: '1 个', pro: '全部', premium: '全部' },
  { feature: '批量处理', free: '—', pro: '✓', premium: '✓' },
  { feature: '字幕格式', free: 'SRT', pro: '全部', premium: '全部' },
  { feature: 'AI 字幕优化', free: '—', pro: '—', premium: '50次/月' },
  { feature: 'AI 翻译', free: '—', pro: '—', premium: '30次/月' },
  { feature: '版本更新', free: '基础', pro: '1年', premium: '持续' },
]

const statusCardClass = computed(() => ({
  'border-tertiary/30 bg-tertiary-container/10': tier.value === 'trial',
  'border-outline-variant/20 bg-surface-container-low': tier.value === 'free',
  'border-primary/30 bg-primary-container/10': tier.value === 'pro',
  'border-tertiary/30 bg-tertiary-container/20': tier.value === 'premium',
}))

const statusIconBg = computed(() => ({
  'bg-tertiary-container': tier.value === 'trial' || tier.value === 'premium',
  'bg-surface-container-highest': tier.value === 'free',
  'bg-primary-container': tier.value === 'pro',
}))

const statusIcon = computed(() => {
  if (tier.value === 'trial') return 'stars'
  if (tier.value === 'pro') return 'verified'
  if (tier.value === 'premium') return 'diamond'
  return 'account_circle'
})

const statusIconColor = computed(() => ({
  'text-tertiary': tier.value === 'trial' || tier.value === 'premium',
  'text-on-surface-variant': tier.value === 'free',
  'text-primary': tier.value === 'pro',
}))

const statusTitle = computed(() => {
  if (tier.value === 'trial') return '试用中'
  if (tier.value === 'pro') return 'Pro 买断版'
  if (tier.value === 'premium') return 'Premium 订阅版'
  return '免费版'
})

const statusDescription = computed(() => {
  if (tier.value === 'trial') return `试用 Pro 全部功能，还剩 ${trialDownloads.value} 次下载和 ${trialAsr.value} 次 ASR`
  if (tier.value === 'pro') return '永久解锁所有高级功能'
  if (tier.value === 'premium') return '订阅有效期内享受所有功能 + AI 增值服务'
  return '基础功能，每日有限额'
})

const ACTIVATION_PAGE_URL = 'https://videobox.app'

function goToActivationPage(plan: string) {
  window.electronAPI?.shell?.openExternal?.(`${ACTIVATION_PAGE_URL}?plan=${plan}`)
}

onMounted(async () => {
  try {
    const status = await window.electronAPI.license.getStatus()
    tier.value = status.tier
    if (status.trialRemaining) {
      trialDownloads.value = status.trialRemaining.downloads
      trialAsr.value = status.trialRemaining.asr
    }
  } catch {
    // use defaults
  }
})

async function activate() {
  if (!activationKey.value || isActivating.value) return
  isActivating.value = true
  activationError.value = ''
  activationSuccess.value = ''

  try {
    const result = await window.electronAPI.license.activate(activationKey.value)
    if (result.success) {
      activationSuccess.value = result.message
      tier.value = result.tier || 'pro'
      showActivationInput.value = null
      activationKey.value = ''
    } else {
      activationError.value = result.message
    }
  } catch {
    activationError.value = '无法连接到激活服务器'
  } finally {
    isActivating.value = false
  }
}
</script>
