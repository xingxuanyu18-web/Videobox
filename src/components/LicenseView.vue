<template>
  <div class="flex-1 flex overflow-hidden">
    <section class="flex-1 flex flex-col bg-surface">
      <div class="flex-1 overflow-y-auto px-8 py-6">
        <div class="max-w-3xl mx-auto w-full flex flex-col gap-8">
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
                <div v-if="tier === 'premium' && subscriptionLabel" class="flex items-center gap-2 mt-0.5">
                  <span class="px-2 py-0.5 rounded-md text-2xs font-bold text-tertiary bg-tertiary-container/30">{{ subscriptionLabel }}</span>
                  <span v-if="renewalDays !== null && renewalDays > 0" class="text-xs" :class="renewalDays <= 7 ? 'text-error' : 'text-on-surface-variant'">
                    剩余 <strong :class="renewalDays <= 7 ? 'text-error' : 'text-tertiary'">{{ renewalDays }}</strong> 天
                  </span>
                </div>
                <p class="text-sm text-on-surface-variant mt-0.5">{{ statusDescription }}</p>
              </div>
              <div v-if="tier === 'trial'" class="text-right">
                <p class="text-2xl font-bold text-tertiary">{{ trialDownloads || 0 }}</p>
                <p class="text-[10px] text-on-surface-variant">剩余下载次数</p>
                <p class="text-2xl font-bold text-tertiary mt-1">{{ trialAsr || 0 }}</p>
                <p class="text-[10px] text-on-surface-variant">剩余ASR次数</p>
              </div>
            </div>
            <!-- Renewal Notice -->
            <div v-if="renewalExpired" class="mt-4 p-3 rounded-lg bg-error-container border border-error/20">
              <p class="text-xs text-error font-medium">⚠ 订阅已过期，请续费恢复 Premium 功能</p>
            </div>
            <div v-else-if="tier === 'premium' && renewalDays !== null && renewalDays <= 7" class="mt-4 p-3 rounded-lg bg-warning-container border border-warning/20">
              <p class="text-xs text-warning font-medium">⏰ 订阅将在 {{ renewalDays }} 天后到期，建议续费</p>
            </div>
          </div>

          <!-- Pricing Plans -->
          <div>
            <h3 class="font-headline text-base font-bold text-on-surface mb-4">订阅方案</h3>

            <!-- Subscription Plans -->
            <div class="p-5 rounded-2xl border transition-all"
              :class="tier === 'premium' ? 'border-primary bg-primary-container/10 shadow-glow-primary' : 'border-border-subtle bg-bg-card'"
            >
              <div class="flex items-center gap-3 mb-4">
                <h4 class="text-lg font-extrabold text-text-primary">Premium 订阅版</h4>
                <span class="text-2xs font-bold text-on-primary bg-primary px-2.5 py-1 rounded-full">推荐</span>
                <span class="text-xs text-text-muted">全部高级功能 + AI 增值服务 + 持续更新</span>
              </div>
              <div class="grid grid-cols-4 gap-3 mb-4">
                <div v-for="p in subscriptionPlans" :key="p.id"
                  class="p-4 rounded-xl border text-center cursor-pointer transition-all"
                  :class="selectedPlan === p.id
                    ? 'border-primary bg-primary-container/10 shadow-glow-primary'
                    : 'border-border-subtle bg-bg-elevated hover:border-border-default'"
                  @click="selectedPlan = p.id"
                >
                  <p class="text-xs font-bold text-text-primary mb-1">{{ p.label }}</p>
                  <p class="text-2xl font-extrabold text-primary">¥{{ p.price }}</p>
                  <p class="text-2xs text-text-muted mt-0.5">{{ p.unitPrice }}</p>
                  <div v-if="p.saving" class="mt-2 inline-block px-2 py-0.5 rounded-full text-2xs font-bold text-success bg-success/10">{{ p.saving }}</div>
                </div>
              </div>
              <button
                v-if="tier !== 'premium'"
                class="w-full py-3 rounded-xl font-bold text-sm bg-primary text-on-primary hover:bg-primary-hover transition-all duration-200 active:scale-[0.98]"
                @click="goToActivationPage(selectedPlan)"
              >订阅 Premium · ¥{{ selectedPlanPrice }}/{{ selectedPlanLabel }}</button>
              <button v-else
                class="w-full py-3 rounded-xl font-bold text-sm bg-primary-subtle text-primary cursor-default"
                disabled>已订阅 ✓</button>
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
                placeholder="VB-XXXX-XXXX-XXXX-PR1"
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
            <div class="mt-2">
              <input
                v-model="deviceLabel"
                type="text"
                placeholder="设备名称（可选，如：我的台式机）"
                class="w-full bg-surface-container-highest rounded-md px-3 py-1.5 text-xs text-on-surface border border-outline-variant/20 focus:border-primary focus:outline-none"
              />
            </div>
            <p v-if="activationError" class="text-xs text-error mt-2">{{ activationError }}</p>
            <p v-if="activationSuccess" class="text-xs text-primary mt-2">{{ activationSuccess }}</p>
          </div>

          <!-- Device Management -->
          <div v-if="tier === 'premium'" class="p-5 rounded-xl border border-border-subtle bg-bg-card">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-headline text-sm font-bold text-on-surface">设备管理</h3>
              <span class="text-xs text-on-surface-variant">{{ devices.length }} / {{ maxDevices }} 台设备</span>
            </div>
            <div v-if="isLoadingDevices" class="text-xs text-on-surface-variant py-2">加载中...</div>
            <div v-else-if="devices.length === 0" class="text-xs text-on-surface-variant py-2">暂无设备信息</div>
            <div v-else class="space-y-2">
              <div v-for="d in devices" :key="d.machineId" class="flex items-center justify-between py-2 px-3 rounded-md bg-surface-container-low">
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium text-on-surface truncate">{{ d.label }}</p>
                  <p class="text-2xs text-on-surface-variant mt-0.5">激活于 {{ formatDate(d.activatedAt) }}</p>
                </div>
                <button
                  class="ml-3 text-2xs text-error hover:text-error/80 transition-colors disabled:opacity-50 px-2 py-1 rounded hover:bg-error/10"
                  :disabled="deactivatingMachineId === d.machineId"
                  @click="deactivateDevice(d.machineId)"
                >
                  {{ deactivatingMachineId === d.machineId ? '解绑中...' : '解绑' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Feature Comparison Table -->
          <div>
            <h3 class="font-headline text-base font-bold text-on-surface mb-4">功能对比</h3>
            <div class="overflow-x-auto rounded-xl border border-border-subtle">
              <table class="w-full text-xs min-w-[700px]">
                <thead>
                  <tr class="bg-bg-elevated">
                    <th class="text-left px-3 py-3 font-semibold text-text-secondary sticky left-0 bg-bg-elevated">功能</th>
                    <th class="text-center px-2 py-3 font-semibold text-text-secondary">免费版</th>
                    <th class="text-center px-2 py-3 font-semibold text-tertiary bg-tertiary-container/10">月付</th>
                    <th class="text-center px-2 py-3 font-semibold text-tertiary bg-tertiary-container/10">季付</th>
                    <th class="text-center px-2 py-3 font-semibold text-tertiary bg-tertiary-container/10">半年付</th>
                    <th class="text-center px-2 py-3 font-semibold text-tertiary bg-tertiary-container/10">年付</th>
                  </tr>
                  <tr class="bg-bg-elevated">
                    <th class="text-left px-3 py-1.5 text-2xs text-text-muted sticky left-0 bg-bg-elevated">价格</th>
                    <th class="text-center px-2 py-1.5 text-2xs text-text-muted">¥0</th>
                    <th class="text-center px-2 py-1.5 text-2xs text-tertiary font-bold bg-tertiary-container/10">¥19.9</th>
                    <th class="text-center px-2 py-1.5 text-2xs text-tertiary font-bold bg-tertiary-container/10">¥49.9</th>
                    <th class="text-center px-2 py-1.5 text-2xs text-tertiary font-bold bg-tertiary-container/10">¥79.9</th>
                    <th class="text-center px-2 py-1.5 text-2xs text-tertiary font-bold bg-tertiary-container/10">¥119.9</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle">
                  <tr v-for="(row, i) in comparisonRows" :key="row.feature" :class="i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-elevated'">
                    <td class="px-3 py-2.5 text-text-primary font-medium sticky left-0" :class="i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-elevated'">{{ row.feature }}</td>
                    <td class="text-center px-2 py-2.5 text-text-muted">{{ row.free }}</td>
                    <td class="text-center px-2 py-2.5 text-text-secondary bg-tertiary-container/5">{{ row.premium }}</td>
                    <td class="text-center px-2 py-2.5 text-text-secondary bg-tertiary-container/5">{{ row.premium }}</td>
                    <td class="text-center px-2 py-2.5 text-text-secondary bg-tertiary-container/5">{{ row.premium }}</td>
                    <td class="text-center px-2 py-2.5 text-text-secondary bg-tertiary-container/5">{{ row.premium }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-2xs text-text-muted mt-2 text-center">所有 Premium 订阅方案功能一致，仅价格与时长不同 · 季付省 ¥9.8 · 半年付省 ¥39.5 · 年付省 ¥118.9</p>
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
const renewalDays = ref<number | null>(null)
const renewalExpired = ref(false)
const subscriptionLabel = ref<string>('')
const showActivationInput = ref<string | null>(null)
const activationKey = ref('')
const isActivating = ref(false)
const activationError = ref('')
const activationSuccess = ref('')
const selectedPlan = ref('monthly')

const subscriptionPlans = [
  { id: 'monthly', label: '月付', price: '19.9', unitPrice: '¥19.9/月', saving: '', duration: 30 },
  { id: 'quarterly', label: '季付', price: '49.9', unitPrice: '≈¥16.6/月', saving: '省 ¥9.8', duration: 90 },
  { id: 'semi_annual', label: '半年付', price: '79.9', unitPrice: '≈¥13.3/月', saving: '省 ¥39.5', duration: 180 },
  { id: 'annual', label: '年付', price: '119.9', unitPrice: '≈¥10.0/月', saving: '省 ¥118.9', duration: 365 },
]

const premiumFeatures = [
  '无限次视频下载 + 4K 超清',
  '全部 ASR 引擎 + 批量处理',
  'SRT / ASS / TXT 全格式字幕',
  '无限次 AI 文案创作',
  'AI 字幕智能优化 (50次/月)',
  'AI 多语言实时翻译 (30次/月)',
  '持续版本更新 + 新功能优先',
  '专属技术支持通道',
]

const comparisonRows = [
  { feature: '视频下载', free: '每日 3 次', premium: '无限' },
  { feature: '最高清晰度', free: '720p', premium: '4K' },
  { feature: 'ASR 引擎', free: '1 个', premium: '全部' },
  { feature: '批量处理', free: '—', premium: '✓' },
  { feature: '字幕格式', free: 'SRT', premium: '全部' },
  { feature: 'AI 文案改写', free: '每日 2 次', premium: '无限' },
  { feature: 'AI 文案生成', free: '每日 2 次', premium: '无限' },
  { feature: 'AI 字幕优化', free: '—', premium: '50次/月' },
  { feature: 'AI 翻译', free: '—', premium: '30次/月' },
  { feature: '版本更新', free: '基础', premium: '持续' },
]

const statusCardClass = computed(() => ({
  'border-tertiary/30 bg-tertiary-container/10': tier.value === 'trial',
  'border-outline-variant/20 bg-surface-container-low': tier.value === 'free',
  'border-tertiary/30 bg-tertiary-container/20': tier.value === 'premium',
}))

const statusIconBg = computed(() => ({
  'bg-tertiary-container': tier.value === 'trial' || tier.value === 'premium',
  'bg-surface-container-highest': tier.value === 'free',
}))

const statusIcon = computed(() => {
  if (tier.value === 'trial') return 'stars'
  if (tier.value === 'premium') return 'diamond'
  return 'account_circle'
})

const statusIconColor = computed(() => ({
  'text-tertiary': tier.value === 'trial' || tier.value === 'premium',
  'text-on-surface-variant': tier.value === 'free',
}))

const renewalLabel = computed(() => {
  if (tier.value !== 'premium') return ''
  const days = renewalDays.value
  if (days === null) return 'Premium 订阅版'
  if (days > 0) return `Premium 订阅版 · 剩余 ${days} 天`
  return 'Premium 已过期'
})

const statusTitle = computed(() => {
  if (tier.value === 'trial') return '试用中'
  if (tier.value === 'premium') return renewalLabel.value
  return '免费版'
})

const statusDescription = computed(() => {
  if (tier.value === 'trial') return `试用全部功能，还剩 ${trialDownloads.value} 次下载和 ${trialAsr.value} 次 ASR`
  if (tier.value === 'premium') return '订阅有效期内享受全部功能 + AI 增值服务'
  return '基础功能，每日有限额'
})

const selectedPlanPrice = computed(() => {
  return subscriptionPlans.find(p => p.id === selectedPlan.value)?.price || '19.9'
})
const selectedPlanLabel = computed(() => {
  return subscriptionPlans.find(p => p.id === selectedPlan.value)?.label || '月'
})

const ACTIVATION_PAGE_URL = 'https://videobox-site.pages.dev'
const deviceLabel = ref('')
const devices = ref<Array<{ machineId: string; activatedAt: string; label: string }>>([])
const maxDevices = ref(0)
const isLoadingDevices = ref(false)
const deactivatingMachineId = ref<string | null>(null)

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
    if (status.renewalStatus) {
      renewalDays.value = status.renewalStatus.daysRemaining
      renewalExpired.value = status.renewalStatus.expired
    }
    // 订阅方案标签
    if (status.licenseInfo?.plan) {
      subscriptionLabel.value = planLabel(status.licenseInfo.plan)
    } else if (status.tier === 'premium') {
      subscriptionLabel.value = '月付订阅'
    }
    await loadDevices()
  } catch {
    // use defaults
  }
})

function planLabel(plan: string): string {
  switch (plan) {
    case 'monthly': return '月付订阅'
    case 'quarterly': return '季付订阅'
    case 'semi_annual': return '半年付订阅'
    case 'annual': return '年付订阅'
    case 'pro': return 'Pro 永久买断'
    default: return 'Premium 订阅'
  }
}

async function loadDevices() {
  if (tier.value !== 'premium') return
  try {
    isLoadingDevices.value = true
    const result = await window.electronAPI.license.getDevices()
    if (result) {
      devices.value = result.devices
      maxDevices.value = result.maxDevices
    }
  } catch {
    // offline - no device list
  } finally {
    isLoadingDevices.value = false
  }
}

async function deactivateDevice(machineId: string) {
  deactivatingMachineId.value = machineId
  try {
    const result = await window.electronAPI.license.deactivateDevice(machineId)
    if (result.success) {
      await loadDevices()
    } else {
      activationError.value = result.message
    }
  } catch {
    activationError.value = '无法连接服务器'
  } finally {
    deactivatingMachineId.value = null
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function activate() {
  if (!activationKey.value || isActivating.value) return
  isActivating.value = true
  activationError.value = ''
  activationSuccess.value = ''

  try {
    const result = await window.electronAPI.license.activate(activationKey.value, deviceLabel.value || undefined)
    if (result.success) {
      activationSuccess.value = result.message
      tier.value = result.tier || 'premium'
      subscriptionLabel.value = planLabel(result.plan || 'monthly')
      showActivationInput.value = null
      // 通知 App.vue 和其他视图刷新许可证状态
      window.dispatchEvent(new CustomEvent('license:activated'))
      activationKey.value = ''
      deviceLabel.value = ''
      await loadDevices()
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
