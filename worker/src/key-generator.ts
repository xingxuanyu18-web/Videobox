/**
 * Key Generator - generates Videobox activation keys
 *
 * Algorithm: VB-SEG1-SEG2-SEG3-SEG4-CODE-SIGNATURE
 * SIGNATURE = SHA256(SEG1-SEG2-SEG3-SEG4-CODE-SECRET) truncated to 8 hex chars
 *
 * CODE:
 *   PRO   = Pro buyout (lifetime, no expiry)
 *   PR1   = Premium monthly   (30 days)
 *   PR2   = Premium quarterly (90 days)
 *   PR3   = Premium semi-annual (180 days)
 *   PR4   = Premium annual    (365 days)
 *   PRE   = Legacy Premium (mapped to 30 days for backward compat)
 *
 * Duration is encoded in the CODE so offline activation knows the exact expiry.
 */

import { codeToDays, planToCode, SUBSCRIPTION_PLANS } from './plan-codes'
export { codeToDays, planToCode, SUBSCRIPTION_PLANS }

// Characters excluded: I, L, O, 0, 1 to avoid confusion
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomSegment(length = 4): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('')
}

export interface GeneratedKey {
  key: string
  tier: 'pro' | 'premium'
  code: string           // PRO | PR1 | PR2 | PR3 | PR4
  durationDays: number   // 0 = lifetime
  maxDevices: number
  expiresAt: string | null
  segments: string[]
}

/**
 * Generate a single activation key.
 * @param tier  'pro' or 'premium'
 * @param maxDevices  number of devices allowed
 * @param secret  signing secret
 * @param durationDays  for premium: subscription duration in days (ignored for pro)
 * @param plan  optional: plan id for premium (monthly/quarterly/semi_annual/annual)
 */
export async function generateKey(
  tier: 'pro' | 'premium',
  maxDevices: number,
  secret: string,
  durationDays = 30,
  plan?: string
): Promise<GeneratedKey> {
  const seg1 = randomSegment()
  const seg2 = randomSegment()
  const seg3 = randomSegment()
  const seg4 = randomSegment()

  let code: string
  let actualDays: number

  if (tier === 'pro') {
    code = 'PRO'
    actualDays = 0
  } else {
    code = plan ? planToCode(plan) : 'PR1'
    actualDays = codeToDays(code)
  }

  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${secret}`
  const hash = await sha256Hex(payload)
  const sig = hash.substring(0, 8).toUpperCase()

  const key = `VB-${seg1}-${seg2}-${seg3}-${seg4}-${code}-${sig}`

  const expiresAt = actualDays > 0
    ? new Date(Date.now() + actualDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  return {
    key,
    tier,
    code,
    durationDays: actualDays,
    maxDevices,
    expiresAt,
    segments: [seg1, seg2, seg3, seg4],
  }
}

export interface VerifyResult {
  valid: boolean
  tier?: 'pro' | 'premium'
  code?: string
  durationDays?: number
  reason?: string
}

export async function verifyKey(key: string, secret: string): Promise<VerifyResult> {
  const parts = key.trim().toUpperCase().split('-')
  if (parts.length !== 7 || parts[0] !== 'VB') {
    return { valid: false, reason: '格式无效' }
  }

  const [, seg1, seg2, seg3, seg4, code, sig] = parts

  // Accept all valid codes: PRO, PRE (legacy), PR1-PR4
  if (code !== 'PRO' && code !== 'PRE' && !code.match(/^PR[1-4]$/)) {
    return { valid: false, reason: '类型无效' }
  }

  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${secret}`
  const hash = await sha256Hex(payload)
  const expected = hash.substring(0, 8).toUpperCase()

  if (sig !== expected) {
    return { valid: false, reason: '激活码无效' }
  }

  const tier = code === 'PRO' ? ('pro' as const) : ('premium' as const)
  const durationDays = codeToDays(code)

  return { valid: true, tier, code, durationDays }
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
