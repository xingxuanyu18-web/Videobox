/**
 * LicenseManager - 许可证管理核心
 * 管理用户等级、激活验证、许可证持久化
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as os from 'os'

// ==================== 类型定义 ====================

export type UserTier = 'trial' | 'free' | 'pro' | 'premium'

export interface LicenseInfo {
  tier: UserTier
  activatedAt: string       // ISO date string
  expiresAt: string | null  // null = 永久 (Pro), string = 订阅到期日
  machineId: string
  licenseKey: string | null
}

export interface TrialInfo {
  machineId: string
  firstSeenAt: string
  downloadsUsed: number
  asrUsed: number
  totalDownloadLimit: number
  totalAsrLimit: number
}

export interface DailyUsage {
  date: string        // YYYY-MM-DD
  downloads: number
  asrProcessings: number
}

// ==================== 配置 ====================

const TRIAL_DOWNLOAD_LIMIT = 5
const TRIAL_ASR_LIMIT = 5
const FREE_DAILY_DOWNLOADS = 3
const FREE_DAILY_ASR = 3

// ==================== 工具函数 ====================

function getMachineId(): string {
  const hostname = os.hostname()
  const cpus = os.cpus()
  const cpuModel = cpus[0]?.model || 'unknown'
  const raw = `${hostname}-${cpuModel}-${os.platform()}-${os.arch()}`
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16)
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

function getEncryptionKey(): Buffer {
  const raw = getMachineId() + 'videobox-license-salt-2024'
  return crypto.createHash('sha256').update(raw).digest()
}

// ==================== LicenseManager ====================

export class LicenseManager {
  private userDataPath: string
  private licensePath: string
  private trialPath: string
  private dailyUsagePath: string
  private currentLicense: LicenseInfo | null = null
  private currentTrial: TrialInfo | null = null
  private todayUsage: DailyUsage | null = null

  // 激活服务器 URL
  static ACTIVATION_SERVER = 'https://videobox-activation.example.com/api'

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath
    this.licensePath = path.join(userDataPath, 'license.dat')
    this.trialPath = path.join(userDataPath, 'trial.dat')
    this.dailyUsagePath = path.join(userDataPath, 'daily_usage.json')

    // 确保目录存在
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    this.load()
  }

  // ==================== 加载/保存 ====================

  private load(): void {
    // 加载许可证
    if (fs.existsSync(this.licensePath)) {
      try {
        const encrypted = fs.readFileSync(this.licensePath, 'utf-8')
        const key = getEncryptionKey()
        const data = decryptData(encrypted, key) as unknown as LicenseInfo
        if (data.machineId === getMachineId()) {
          this.currentLicense = data
        }
      } catch {
        this.currentLicense = null
      }
    }

    // 加载试用信息
    if (fs.existsSync(this.trialPath)) {
      try {
        const encrypted = fs.readFileSync(this.trialPath, 'utf-8')
        const key = getEncryptionKey()
        this.currentTrial = decryptData(encrypted, key) as unknown as TrialInfo
      } catch {
        this.currentTrial = null
      }
    }

    // 加载每日使用量
    if (fs.existsSync(this.dailyUsagePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dailyUsagePath, 'utf-8'))
        this.todayUsage = data
      } catch {
        this.todayUsage = null
      }
    }

    // 初始化试用
    if (!this.currentTrial) {
      this.currentTrial = {
        machineId: getMachineId(),
        firstSeenAt: new Date().toISOString(),
        downloadsUsed: 0,
        asrUsed: 0,
        totalDownloadLimit: TRIAL_DOWNLOAD_LIMIT,
        totalAsrLimit: TRIAL_ASR_LIMIT
      }
      this.saveTrial()
    }
  }

  private saveLicense(): void {
    if (!this.currentLicense) return
    const key = getEncryptionKey()
    const encrypted = encryptData(this.currentLicense as unknown as Record<string, unknown>, key)
    fs.writeFileSync(this.licensePath, encrypted, 'utf-8')
  }

  private saveTrial(): void {
    if (!this.currentTrial) return
    const key = getEncryptionKey()
    const encrypted = encryptData(this.currentTrial as unknown as Record<string, unknown>, key)
    fs.writeFileSync(this.trialPath, encrypted, 'utf-8')
  }

  private saveDailyUsage(): void {
    fs.writeFileSync(this.dailyUsagePath, JSON.stringify(this.todayUsage, null, 2), 'utf-8')
  }

  // ==================== 许可证状态查询 ====================

  getTier(): UserTier {
    // 1. 如果有有效许可证，返回对应等级
    if (this.currentLicense) {
      if (this.currentLicense.tier === 'premium' && this.currentLicense.expiresAt) {
        const now = new Date()
        const expires = new Date(this.currentLicense.expiresAt)
        if (now < expires) return 'premium'
        // 过期，降级
        this.currentLicense = null
        this.saveLicense()
      } else if (this.currentLicense.tier === 'pro') {
        return 'pro'
      }
    }

    // 2. 检查试用
    if (this.currentTrial) {
      const remaining = this.getRemainingTrial()
      if (remaining.downloads > 0 || remaining.asr > 0) {
        return 'trial'
      }
    }

    // 3. 免费版
    return 'free'
  }

  getLicenseInfo(): LicenseInfo | null {
    return this.currentLicense
  }

  getTrialInfo(): TrialInfo | null {
    return this.currentTrial
  }

  getRemainingTrial(): { downloads: number; asr: number } {
    if (!this.currentTrial) return { downloads: 0, asr: 0 }
    return {
      downloads: Math.max(0, this.currentTrial.totalDownloadLimit - this.currentTrial.downloadsUsed),
      asr: Math.max(0, this.currentTrial.totalAsrLimit - this.currentTrial.asrUsed)
    }
  }

  isTrialExhausted(): boolean {
    const r = this.getRemainingTrial()
    return r.downloads <= 0 && r.asr <= 0
  }

  // ==================== 功能权限检查 ====================

  canDownloadFullQuality(): boolean {
    return ['trial', 'pro', 'premium'].includes(this.getTier())
  }

  canUseAllEngines(): boolean {
    return ['trial', 'pro', 'premium'].includes(this.getTier())
  }

  canBatchProcess(): boolean {
    return ['trial', 'pro', 'premium'].includes(this.getTier())
  }

  getExportFormats(): string[] {
    const tier = this.getTier()
    if (tier === 'free') return ['SRT']
    return ['SRT', 'TXT', 'ASS']
  }

  getAvailableAsrEngines(): string[] {
    const tier = this.getTier()
    if (tier === 'free') return ['Bcut']
    return ['Bcut', 'JianYing', 'KuaiShou']
  }

  getDailyLimit(): number | null {
    const tier = this.getTier()
    if (tier === 'pro' || tier === 'premium') return null // 无限
    return FREE_DAILY_DOWNLOADS
  }

  // ==================== 使用量跟踪 ====================

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0]
  }

  private ensureTodayUsage(): void {
    const today = this.getTodayKey()
    if (!this.todayUsage || this.todayUsage.date !== today) {
      this.todayUsage = { date: today, downloads: 0, asrProcessings: 0 }
      this.saveDailyUsage()
    }
  }

  canDownloadToday(): boolean {
    const tier = this.getTier()
    this.ensureTodayUsage()

    if (tier === 'trial') {
      const r = this.getRemainingTrial()
      return r.downloads > 0
    }
    if (tier === 'pro' || tier === 'premium') return true

    // Free
    return (this.todayUsage?.downloads || 0) < FREE_DAILY_DOWNLOADS
  }

  canProcessAsrToday(): boolean {
    const tier = this.getTier()
    this.ensureTodayUsage()

    if (tier === 'trial') {
      const r = this.getRemainingTrial()
      return r.asr > 0
    }
    if (tier === 'pro' || tier === 'premium') return true

    // Free
    return (this.todayUsage?.asrProcessings || 0) < FREE_DAILY_ASR
  }

  recordDownload(): void {
    this.ensureTodayUsage()
    if (this.todayUsage) {
      this.todayUsage.downloads++
      this.saveDailyUsage()
    }
    if (this.currentTrial && this.getTier() === 'trial') {
      this.currentTrial.downloadsUsed++
      this.saveTrial()
    }
  }

  recordAsrProcessing(): void {
    this.ensureTodayUsage()
    if (this.todayUsage) {
      this.todayUsage.asrProcessings++
      this.saveDailyUsage()
    }
    if (this.currentTrial && this.getTier() === 'trial') {
      this.currentTrial.asrUsed++
      this.saveTrial()
    }
  }

  getDailyUsage(): { downloads: number; asrProcessings: number; limit: number | null } {
    this.ensureTodayUsage()
    return {
      downloads: this.todayUsage?.downloads || 0,
      asrProcessings: this.todayUsage?.asrProcessings || 0,
      limit: this.getDailyLimit()
    }
  }

  // ==================== 激活 ====================

  async activate(licenseKey: string): Promise<{ success: boolean; tier?: UserTier; message: string }> {
    const machineId = getMachineId()

    // 1. 先尝试本地离线验证
    const localResult = this.verifyLocal(licenseKey)
    if (localResult.valid && localResult.tier) {
      this.currentLicense = {
        tier: localResult.tier,
        activatedAt: new Date().toISOString(),
        expiresAt: null, // 本地验证默认永久
        machineId,
        licenseKey
      }
      this.saveLicense()
      const tierLabel = localResult.tier === 'pro' ? 'Pro 买断版' : 'Premium 订阅版'
      return { success: true, tier: localResult.tier, message: `激活成功！已解锁 ${tierLabel}` }
    }
    if (localResult.reason && localResult.reason !== '格式无效' && localResult.reason !== '类型无效') {
      return { success: false, message: localResult.reason }
    }

    // 2. 本地验证失败，尝试服务器验证
    try {
      const resp = await fetch(`${LicenseManager.ACTIVATION_SERVER}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey, machineId })
      })
      const data = await resp.json()
      if (!data.success) {
        return { success: false, message: data.message || '激活码无效' }
      }
      this.currentLicense = {
        tier: data.tier,
        activatedAt: new Date().toISOString(),
        expiresAt: data.expiresAt || null,
        machineId,
        licenseKey
      }
      this.saveLicense()
      return { success: true, tier: data.tier, message: `激活成功！等级: ${data.tier}` }
    } catch (e) {
      return { success: false, message: '无法连接服务器，请检查输入是否正确' }
    }
  }

  async verifyOnline(): Promise<boolean> {
    if (!this.currentLicense) return false
    if (this.currentLicense.tier === 'pro') return true
    // Premium 订阅需要定期验证
    try {
      const resp = await fetch(`${LicenseManager.ACTIVATION_SERVER}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: getMachineId(),
          licenseKey: this.currentLicense.licenseKey
        })
      })
      const data = await resp.json()
      if (!data.valid) {
        this.currentLicense = null
        this.saveLicense()
        return false
      }
      if (data.expiresAt) {
        this.currentLicense.expiresAt = data.expiresAt
        this.saveLicense()
      }
      return true
    } catch {
      if (this.currentLicense.expiresAt) {
        const expires = new Date(this.currentLicense.expiresAt)
        const grace = new Date()
        grace.setDate(grace.getDate() - 7)
        return expires > grace
      }
      return true
    }
  }

  /** 本地离线验证激活码 */
  private verifyLocal(key: string): { valid: boolean; tier?: UserTier; reason?: string } {
    const parts = key.trim().toUpperCase().split('-')
    if (parts.length !== 7 || parts[0] !== 'VB') {
      return { valid: false, reason: '格式无效' }
    }
    const [_, seg1, seg2, seg3, seg4, code, sig] = parts
    if (code !== 'PRO' && code !== 'PRE') {
      return { valid: false, reason: '类型无效' }
    }
    // 本地签名校验
    const SECRET = 'videobox-2026-gold-key-secret'
    const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${SECRET}`
    const expected = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 8).toUpperCase()
    if (sig !== expected) {
      return { valid: false, reason: '激活码无效' }
    }
    const tier: UserTier = code === 'PRO' ? 'pro' : 'premium'
    return { valid: true, tier }
  }
}
