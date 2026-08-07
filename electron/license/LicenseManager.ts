/**
 * LicenseManager - 许可证管理核心
 *
 * Phase 1 Upgrade:
 *   - 激活验证改为服务端优先（移除客户端签名校验）
 *   - 强化机器码：MAC + 硬盘序列号 + 用户名
 *   - PBKDF2 加密许可证文件 + 安装级随机盐
 *   - 多设备支持：maxDevices 字段
 *   - 7 天离线宽限期
 *   - Pro 也需要定期在线验证
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as os from 'os'
import { request, HttpResponse } from '../core/http'

export type UserTier = 'trial' | 'free' | 'pro' | 'premium'

export interface LicenseInfo {
  tier: UserTier
  plan: string | null
  activatedAt: string
  expiresAt: string | null
  machineId: string
  licenseKey: string | null
  maxDevices: number
  deviceLabel: string
  serverVerified: boolean
  lastVerifiedAt: string | null
}

export interface TrialInfo {
  machineId: string
  firstSeenAt: string
  downloadsUsed: number
  asrUsed: number
  copywritingUsed: number
  totalDownloadLimit: number
  totalAsrLimit: number
  totalCopywritingLimit: number
}

export interface DailyUsage {
  date: string
  downloads: number
  asrProcessings: number
  copywritingUses: number
}

export interface DeviceInfo {
  machineId: string
  activatedAt: string
  label: string
}

const TRIAL_DOWNLOAD_LIMIT = 5
const TRIAL_ASR_LIMIT = 5
export const TRIAL_COPYWRITING_LIMIT = 2
export const FREE_DAILY_COPYWRITING_LIMIT = 2
const FREE_DAILY_DOWNLOADS = 3
const FREE_DAILY_ASR = 3
const OFFLINE_GRACE_DAYS = 7

function getMachineId(): string {
  const components: string[] = []
  components.push(os.hostname())
  components.push(os.platform(), os.arch())
  try {
    const nets = os.networkInterfaces()
    for (const name of Object.keys(nets)) {
      const iface = nets[name]?.find(
        (n) => !n.internal && n.mac !== '00:00:00:00:00:00'
      )
      if (iface) { components.push(iface.mac); break }
    }
  } catch { /* degrade */ }
  try {
    if (os.platform() === 'win32') {
      const { execSync } = require('child_process')
      const result = execSync('wmic diskdrive get serialnumber', { timeout: 5000 }).toString()
      const serial = result.split('\n')[1]?.trim()
      if (serial) components.push(serial)
    }
  } catch { /* degrade */ }
  try { components.push(os.userInfo().username) } catch { /* degrade */ }
  const fingerprint = components.filter(Boolean).join('|') + '|videobox-v2-salt'
  return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 32)
}

function getInstallSalt(userDataPath: string): string {
  const saltPath = path.join(userDataPath, '.install_salt')
  if (fs.existsSync(saltPath)) {
    return fs.readFileSync(saltPath, 'utf-8')
  }
  const salt = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(saltPath, salt, 'utf-8')
  return salt
}

function encryptData(data: Record<string, unknown>, key: Buffer): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(JSON.stringify(data), 'utf-8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decryptData(encrypted: string, key: Buffer): Record<string, unknown> {
  const parts = encrypted.split(':')
  if (parts.length !== 2) throw new Error('Invalid encrypted data')
  const iv = Buffer.from(parts[0], 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(parts[1], 'hex', 'utf-8')
  decrypted += decipher.final('utf-8')
  return JSON.parse(decrypted)
}

export class LicenseManager {
  private userDataPath: string
  private licensePath: string
  private trialPath: string
  private dailyUsagePath: string
  private currentLicense: LicenseInfo | null = null
  private currentTrial: TrialInfo | null = null
  private todayUsage: DailyUsage | null = null

  static ACTIVATION_SERVER = 'https://videobox-api.videobox-api.workers.dev/api'
  static SITE_URL = 'https://videobox-site.pages.dev'

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath
    this.licensePath = path.join(userDataPath, 'license.dat')
    this.trialPath = path.join(userDataPath, 'trial.dat')
    this.dailyUsagePath = path.join(userDataPath, 'daily_usage.json')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    this.load()
  }

  private getEncryptionKey(): Buffer {
    const raw = getMachineId() + getInstallSalt(this.userDataPath) + 'videobox-license-salt-v2'
    return crypto.pbkdf2Sync(raw, 'videobox-pbkdf2-salt-v2', 100000, 32, 'sha256')
  }

  private load(): void {
    if (fs.existsSync(this.licensePath)) {
      try {
        const encrypted = fs.readFileSync(this.licensePath, 'utf-8')
        const key = this.getEncryptionKey()
        const data = decryptData(encrypted, key)
        const currentId = getMachineId()
        if (data.machineId === currentId || (data as any).machineId === currentId.substring(0, 16)) {
          this.currentLicense = {
            tier: (data as any).tier || 'free',
            plan: (data as any).plan || null,
            activatedAt: (data as any).activatedAt || new Date().toISOString(),
            expiresAt: (data as any).expiresAt || null,
            machineId: currentId,
            licenseKey: (data as any).licenseKey || null,
            maxDevices: (data as any).maxDevices || 1,
            deviceLabel: (data as any).deviceLabel || '',
            serverVerified: (data as any).serverVerified !== false,
            lastVerifiedAt: (data as any).lastVerifiedAt || null,
          }
        }
      } catch {
        try {
          const encrypted = fs.readFileSync(this.licensePath, 'utf-8')
          const oldKey = crypto.createHash('sha256')
            .update(getMachineId().substring(0, 16) + 'videobox-license-salt-2024')
            .digest()
          const data = decryptData(encrypted, oldKey)
          if (data.machineId === getMachineId().substring(0, 16)) {
            this.currentLicense = {
              tier: (data as any).tier || 'free',
              plan: (data as any).plan || null,
              activatedAt: (data as any).activatedAt || new Date().toISOString(),
              expiresAt: (data as any).expiresAt || null,
              machineId: getMachineId(),
              licenseKey: (data as any).licenseKey || null,
              maxDevices: (data as any).maxDevices || 1,
              deviceLabel: '',
              serverVerified: true,
              lastVerifiedAt: null,
            }
            this.saveLicense()
          }
        } catch { this.currentLicense = null }
      }
    }
    if (fs.existsSync(this.trialPath)) {
      try {
        const encrypted = fs.readFileSync(this.trialPath, 'utf-8')
        const key = this.getEncryptionKey()
        this.currentTrial = decryptData(encrypted, key) as unknown as TrialInfo
      } catch {
        try {
          const encrypted = fs.readFileSync(this.trialPath, 'utf-8')
          const oldKey = crypto.createHash('sha256')
            .update(getMachineId().substring(0, 16) + 'videobox-license-salt-2024')
            .digest()
          this.currentTrial = decryptData(encrypted, oldKey) as unknown as TrialInfo
          this.saveTrial()
        } catch { this.currentTrial = null }
      }
    }
    if (fs.existsSync(this.dailyUsagePath)) {
      try { this.todayUsage = JSON.parse(fs.readFileSync(this.dailyUsagePath, 'utf-8')) }
      catch { this.todayUsage = null }
    }
    if (!this.currentTrial) {
      this.currentTrial = {
        machineId: getMachineId(), firstSeenAt: new Date().toISOString(),
        downloadsUsed: 0, asrUsed: 0, copywritingUsed: 0,
        totalDownloadLimit: TRIAL_DOWNLOAD_LIMIT, totalAsrLimit: TRIAL_ASR_LIMIT,
        totalCopywritingLimit: TRIAL_COPYWRITING_LIMIT,
      }
      this.saveTrial()
    } else {
      // 迁移旧试用数据：补充新增字段
      let migrated = false
      if (this.currentTrial.copywritingUsed === undefined) {
        this.currentTrial.copywritingUsed = 0
        migrated = true
      }
      if (this.currentTrial.totalCopywritingLimit === undefined) {
        this.currentTrial.totalCopywritingLimit = TRIAL_COPYWRITING_LIMIT
        migrated = true
      }
      if (migrated) this.saveTrial()
    }
  }

  private saveLicense(): void {
    if (!this.currentLicense) return
    const key = this.getEncryptionKey()
    const encrypted = encryptData(this.currentLicense as unknown as Record<string, unknown>, key)
    fs.writeFileSync(this.licensePath, encrypted, 'utf-8')
  }

  private saveTrial(): void {
    if (!this.currentTrial) return
    const key = this.getEncryptionKey()
    const encrypted = encryptData(this.currentTrial as unknown as Record<string, unknown>, key)
    fs.writeFileSync(this.trialPath, encrypted, 'utf-8')
  }

  private saveDailyUsage(): void {
    fs.writeFileSync(this.dailyUsagePath, JSON.stringify(this.todayUsage, null, 2), 'utf-8')
  }

  getTier(): UserTier {
    if (this.currentLicense) {
      if (this.currentLicense.tier === 'premium' && this.currentLicense.expiresAt) {
        if (new Date() < new Date(this.currentLicense.expiresAt)) return 'premium'
        this.currentLicense = null; this.saveLicense()
      } else if (this.currentLicense.tier === 'pro') {
        return 'pro'
      }
    }
    if (this.currentTrial) {
      const r = this.getRemainingTrial()
      if (r.downloads > 0 || r.asr > 0) return 'trial'
    }
    return 'free'
  }

  getLicenseInfo(): LicenseInfo | null { return this.currentLicense }
  getTrialInfo(): TrialInfo | null { return this.currentTrial }

  getRemainingTrial(): { downloads: number; asr: number; copywriting: number } {
    if (!this.currentTrial) return { downloads: 0, asr: 0, copywriting: 0 }
    return {
      downloads: Math.max(0, this.currentTrial.totalDownloadLimit - this.currentTrial.downloadsUsed),
      asr: Math.max(0, this.currentTrial.totalAsrLimit - this.currentTrial.asrUsed),
      copywriting: Math.max(0, this.currentTrial.totalCopywritingLimit - this.currentTrial.copywritingUsed),
    }
  }

  isTrialExhausted(): boolean {
    const r = this.getRemainingTrial()
    return r.downloads <= 0 && r.asr <= 0 && r.copywriting <= 0
  }

  canDownloadFullQuality(): boolean { return ['trial', 'pro', 'premium'].includes(this.getTier()) }
  canUseAllEngines(): boolean { return ['trial', 'pro', 'premium'].includes(this.getTier()) }
  canBatchProcess(): boolean { return ['trial', 'pro', 'premium'].includes(this.getTier()) }

  getExportFormats(): string[] {
    return this.getTier() === 'free' ? ['SRT'] : ['SRT', 'TXT', 'ASS']
  }

  getAvailableAsrEngines(): string[] {
    return this.getTier() === 'free' ? ['Bcut'] : ['Bcut', 'JianYing', 'KuaiShou']
  }

  getDailyLimit(): number | null {
    const tier = this.getTier()
    return (tier === 'pro' || tier === 'premium') ? null : FREE_DAILY_DOWNLOADS
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0]
  }

  private ensureTodayUsage(): void {
    const today = this.getTodayKey()
    if (!this.todayUsage || this.todayUsage.date !== today) {
      this.todayUsage = { date: today, downloads: 0, asrProcessings: 0, copywritingUses: 0 }
      this.saveDailyUsage()
    }
  }

  canDownloadToday(): boolean {
    const tier = this.getTier()
    this.ensureTodayUsage()
    if (tier === 'trial') return this.getRemainingTrial().downloads > 0
    if (tier === 'pro' || tier === 'premium') return true
    return (this.todayUsage?.downloads || 0) < FREE_DAILY_DOWNLOADS
  }

  canProcessAsrToday(): boolean {
    const tier = this.getTier()
    this.ensureTodayUsage()
    if (tier === 'trial') return this.getRemainingTrial().asr > 0
    if (tier === 'pro' || tier === 'premium') return true
    return (this.todayUsage?.asrProcessings || 0) < FREE_DAILY_ASR
  }

  recordDownload(): void {
    const tier = this.getTier()
    // Premium/Pro 不限制次数，不需要记录
    if (tier === 'pro' || tier === 'premium') return
    this.ensureTodayUsage()
    if (this.todayUsage) { this.todayUsage.downloads++; this.saveDailyUsage() }
    if (this.currentTrial && tier === 'trial') {
      this.currentTrial.downloadsUsed++; this.saveTrial()
    }
  }

  recordAsrProcessing(): void {
    const tier = this.getTier()
    if (tier === 'pro' || tier === 'premium') return
    this.ensureTodayUsage()
    if (this.todayUsage) { this.todayUsage.asrProcessings++; this.saveDailyUsage() }
    if (this.currentTrial && tier === 'trial') {
      this.currentTrial.asrUsed++; this.saveTrial()
    }
  }

  recordCopywritingUse(): void {
    const tier = this.getTier()
    if (tier === 'pro' || tier === 'premium') return
    this.ensureTodayUsage()
    if (this.todayUsage) { this.todayUsage.copywritingUses++; this.saveDailyUsage() }
    if (this.currentTrial && tier === 'trial') {
      this.currentTrial.copywritingUsed++; this.saveTrial()
    }
  }

  getDailyUsage(): { downloads: number; asrProcessings: number; copywritingUses: number; limit: number | null } {
    this.ensureTodayUsage()
    return {
      downloads: this.todayUsage?.downloads || 0,
      asrProcessings: this.todayUsage?.asrProcessings || 0,
      copywritingUses: this.todayUsage?.copywritingUses || 0,
      limit: this.getDailyLimit(),
    }
  }

  // ==================== Plan Codes ====================
  // PRO = lifetime, PR1=30d, PR2=90d, PR3=180d, PR4=365d, PRE=30d (legacy)

  static codeToDays(code: string): number {
    if (code === 'PRO') return 0
    if (code === 'PRE') return 30
    const m = code.match(/^PR(\d)$/)
    if (m) return [0, 30, 90, 180, 365][parseInt(m[1])] || 30
    return 30
  }

  static codeToLabel(code: string): string {
    switch (code) {
      case 'PRO': return 'Pro 永久买断'
      case 'PRE': return '月付订阅'
      case 'PR1': return '月付订阅'
      case 'PR2': return '季付订阅'
      case 'PR3': return '半年付订阅'
      case 'PR4': return '年付订阅'
      default: return 'Premium 订阅'
    }
  }

  /** Map a key code to plan id for storage */
  static codeToPlanLabel(code: string): string {
    switch (code) {
      case 'PRO': return 'pro'
      case 'PR2': return 'quarterly'
      case 'PR3': return 'semi_annual'
      case 'PR4': return 'annual'
      case 'PR1': case 'PRE': default: return 'monthly'
    }
  }

  /** Plan id → Chinese label */
  static planToLabel(plan: string): string {
    switch (plan) {
      case 'pro': return 'Pro 永久买断'
      case 'monthly': return '月付订阅'
      case 'quarterly': return '季付订阅'
      case 'semi_annual': return '半年付订阅'
      case 'annual': return '年付订阅'
      default: return 'Premium 订阅'
    }
  }

  static isValidKeyFormat(key: string): boolean {
    return /^VB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-(PRO|PRE|PR[1-4])-[A-F0-9]{8}$/i.test(key.trim())
  }

  static tierFromKey(key: string): UserTier | null {
    const parts = key.trim().toUpperCase().split('-')
    if (parts.length !== 7) return null
    const code = parts[5]
    if (code === 'PRO') return 'pro'
    if (code === 'PRE' || code.match(/^PR[1-4]$/)) return 'premium'
    return null
  }

  /** Premium 订阅剩余天数（null = 非 premium 或无过期时间） */
  getDaysRemaining(): number | null {
    if (!this.currentLicense || !this.currentLicense.expiresAt) return null
    const ms = new Date(this.currentLicense.expiresAt).getTime() - Date.now()
    return Math.max(0, Math.ceil(ms / 86400000))
  }

  /** 是否需要提示续费（剩余 ≤ 7 天） */
  needsRenewalNotice(): boolean {
    if (this.currentLicense?.tier !== 'premium') return false
    const days = this.getDaysRemaining()
    return days !== null && days <= 7
  }

  /** 续费状态信息 */
  getRenewalStatus(): { tier: UserTier; label: string; plan: string; daysRemaining: number | null; expired: boolean; needsRenewal: boolean } {
    const tier = this.getTier()
    const days = this.getDaysRemaining()
    const plan = this.currentLicense?.plan || ''
    let label = ''
    let expired = false

    if (this.currentLicense?.tier === 'premium') {
      if (days !== null && days > 0) {
        label = `${LicenseManager.planToLabel(plan)} · 剩余 ${days} 天`
      } else if (days === 0) {
        expired = true
        label = '订阅已过期，请续费'
      }
    } else if (tier === 'pro') {
      label = 'Pro 永久买断'
    } else {
      label = '免费版'
    }

    return {
      tier,
      label,
      plan,
      daysRemaining: days,
      expired,
      needsRenewal: days !== null && days <= 7,
    }
  }

  /**
   * 激活许可证 — 离线优先策略
   *   1. 先本地验证签名
   *   2. 本地通过 → 立即激活（不等待网络）
   *   3. 后台尝试联网验证（如果连得上）
   */
  async activate(licenseKey: string, deviceLabel?: string): Promise<{ success: boolean; tier?: UserTier; plan?: string; message: string }> {
    const machineId = getMachineId()
    if (!LicenseManager.isValidKeyFormat(licenseKey)) {
      return { success: false, message: '激活码格式无效' }
    }

    // 1. 本地验证（优先，毫秒级完成）
    const local = LicenseManager.verifyLocal(licenseKey)
    if (local.valid && local.tier) {
      const result = this.activateLocal(local.tier, machineId, licenseKey, deviceLabel, local.durationDays)
      // 2. 后台尝试联网绑定设备（不阻塞用户）
      this.silentServerActivate(licenseKey, machineId, deviceLabel)
      return result
    }

    // 本地验证失败，尝试联网（可能是生产环境的 secret 不同）
    try {
      const resp = await request(`${LicenseManager.ACTIVATION_SERVER}/activate`, {
        method: 'POST',
        body: { key: licenseKey.trim(), machineId, deviceLabel },
      })
      const data = resp.data
      if (!data.success) {
        return { success: false, message: data.message || '激活码无效' }
      }
      const plan = data.plan || (data.tier === 'pro' ? 'pro' : 'monthly')
      this.currentLicense = {
        tier: data.tier,
        plan,
        activatedAt: new Date().toISOString(),
        expiresAt: data.expiresAt || null,
        machineId,
        licenseKey: licenseKey.trim().toUpperCase(),
        maxDevices: data.maxDevices || 1,
        deviceLabel: deviceLabel || '',
        serverVerified: true,
        lastVerifiedAt: new Date().toISOString(),
      }
      this.saveLicense()
      const label = LicenseManager.codeToLabel(licenseKey.trim().toUpperCase().split('-')[5] || '')
      const days = data.durationDays ?? LicenseManager.codeToDays(licenseKey.trim().toUpperCase().split('-')[5] || '')
      const suffix = data.tier === 'premium' ? ` · ${days}天` : ''
      return { success: true, tier: data.tier, plan, message: `激活成功！${label}${suffix}` }
    } catch {
      return { success: false, message: '激活码无效，请检查后重试' }
    }
  }

  /** 后台静默联网绑定设备（不阻塞用户，失败也不影响使用） */
  private async silentServerActivate(licenseKey: string, machineId: string, deviceLabel?: string): Promise<void> {
    try {
      const resp = await request(`${LicenseManager.ACTIVATION_SERVER}/activate`, {
        method: 'POST',
        body: { key: licenseKey.trim(), machineId, deviceLabel },
      })
      const data = resp.data
      if (data.success && this.currentLicense) {
        this.currentLicense.serverVerified = true
        this.currentLicense.lastVerifiedAt = new Date().toISOString()
        this.saveLicense()
      }
    } catch {
      // 联网失败不影响使用
    }
  }

  /** 本地激活（离线兜底），从 key code 中提取精确有效期 */
  private activateLocal(tier: UserTier, machineId: string, licenseKey: string, deviceLabel?: string, durationDays?: number): { success: boolean; tier?: UserTier; plan?: string; message: string } {
    let expiresAt: string | null = null
    if (tier === 'premium') {
      const days = durationDays ?? 30
      expiresAt = new Date(Date.now() + days * 86400000).toISOString()
    }

    const code = licenseKey.trim().toUpperCase().split('-')[5] || ''
    const plan = code === 'PRO' ? 'pro' : (LicenseManager.codeToPlanLabel(code))

    this.currentLicense = {
      tier,
      plan,
      activatedAt: new Date().toISOString(),
      expiresAt,
      machineId,
      licenseKey: licenseKey.trim().toUpperCase(),
      maxDevices: tier === 'pro' ? 5 : 3,
      deviceLabel: deviceLabel || '',
      serverVerified: false,
      lastVerifiedAt: null,
    }
    this.saveLicense()

    const label = LicenseManager.codeToLabel(code)
    const inDays = durationDays ?? LicenseManager.codeToDays(code)
    const suffix = tier === 'premium' ? ` · ${inDays}天` : ''
    return { success: true, tier, plan, message: `激活成功！${label}${suffix} (离线验证)` }
  }

  /** 本地验证激活码签名 + 提取有效期（用于服务器不可用时的离线兜底） */
  static verifyLocal(key: string): { valid: boolean; tier?: UserTier; code?: string; durationDays?: number; reason?: string } {
    const DEFAULT_SECRET = 'videobox-dev-secret-placeholder'
    const parts = key.trim().toUpperCase().split('-')
    if (parts.length !== 7 || parts[0] !== 'VB') {
      return { valid: false, reason: '格式无效' }
    }
    const [, seg1, seg2, seg3, seg4, code, sig] = parts
    if (code !== 'PRO' && code !== 'PRE' && !code.match(/^PR[1-4]$/)) {
      return { valid: false, reason: '类型无效' }
    }
    const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${DEFAULT_SECRET}`
    const expected = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 8).toUpperCase()
    if (sig !== expected) {
      return { valid: false, reason: '激活码无效' }
    }
    const tier = code === 'PRO' ? ('pro' as const) : ('premium' as const)
    const durationDays = LicenseManager.codeToDays(code)
    return { valid: true, tier, code, durationDays }
  }

  async verifyOnline(): Promise<boolean> {
    if (!this.currentLicense?.licenseKey) return false
    try {
      const resp = await request(`${LicenseManager.ACTIVATION_SERVER}/verify`, {
        method: 'POST',
        body: { machineId: getMachineId(), licenseKey: this.currentLicense.licenseKey },
      })
      const data = resp.data
      if (!data.valid) {
        if (this.currentLicense.lastVerifiedAt) {
          const lastCheck = new Date(this.currentLicense.lastVerifiedAt)
          const grace = new Date(); grace.setDate(grace.getDate() - OFFLINE_GRACE_DAYS)
          if (lastCheck > grace) return true
        }
        this.currentLicense = null; this.saveLicense()
        return false
      }
      this.currentLicense.serverVerified = true
      this.currentLicense.lastVerifiedAt = new Date().toISOString()
      if (data.expiresAt) this.currentLicense.expiresAt = data.expiresAt
      if (data.maxDevices) this.currentLicense.maxDevices = data.maxDevices
      this.saveLicense()
      return true
    } catch {
      if (this.currentLicense.lastVerifiedAt) {
        const lastCheck = new Date(this.currentLicense.lastVerifiedAt)
        const grace = new Date(); grace.setDate(grace.getDate() - OFFLINE_GRACE_DAYS)
        return lastCheck > grace
      }
      if (this.currentLicense.expiresAt) {
        const grace = new Date(); grace.setDate(grace.getDate() - OFFLINE_GRACE_DAYS)
        return new Date(this.currentLicense.expiresAt) > grace
      }
      return true
    }
  }

  async getDevices(): Promise<{ devices: DeviceInfo[]; maxDevices: number } | null> {
    if (!this.currentLicense?.licenseKey) return null
    try {
      const resp = await request(`${LicenseManager.ACTIVATION_SERVER}/devices`, {
        method: 'POST',
        body: { key: this.currentLicense.licenseKey },
      })
      const data = resp.data
      if (data.success) {
        return { devices: data.devices as DeviceInfo[], maxDevices: data.maxDevices as number }
      }
      return null
    } catch {
      return {
        devices: [{
          machineId: this.currentLicense.machineId,
          activatedAt: this.currentLicense.activatedAt,
          label: this.currentLicense.deviceLabel || '当前设备',
        }],
        maxDevices: this.currentLicense.maxDevices || 1,
      }
    }
  }

  async deactivateDevice(machineId: string): Promise<{ success: boolean; message: string }> {
    if (!this.currentLicense?.licenseKey) return { success: false, message: '未激活' }
    try {
      const resp = await request(`${LicenseManager.ACTIVATION_SERVER}/deactivate-device`, {
        method: 'POST',
        body: { key: this.currentLicense.licenseKey, machineId },
      })
      const data = resp.data
      return { success: data.success, message: data.message || '' }
    } catch { return { success: false, message: '无法连接服务器' } }
  }

  static getCurrentMachineId(): string { return getMachineId() }
  static setActivationServer(url: string): void { LicenseManager.ACTIVATION_SERVER = url }
}
