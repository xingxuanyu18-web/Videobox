/**
 * Key Generator - generates Videobox activation keys
 * Algorithm: VB-SEG1-SEG2-SEG3-SEG4-CODE-SIGNATURE
 * SIGNATURE = SHA256(SEG1-SEG2-SEG3-SEG4-CODE-SECRET) truncated to 8 hex chars
 */

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
  maxDevices: number
  expiresAt: string | null
  segments: string[]  // the 4 random segments for verification
  code: 'PRO' | 'PRE'
}

export async function generateKey(
  tier: 'pro' | 'premium',
  maxDevices: number,
  secret: string,
  premiumDurationDays = 30
): Promise<GeneratedKey> {
  const seg1 = randomSegment()
  const seg2 = randomSegment()
  const seg3 = randomSegment()
  const seg4 = randomSegment()
  const code = tier === 'pro' ? ('PRO' as const) : ('PRE' as const)

  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${secret}`
  const hash = await sha256Hex(payload)
  const sig = hash.substring(0, 8).toUpperCase()

  const key = `VB-${seg1}-${seg2}-${seg3}-${seg4}-${code}-${sig}`

  const expiresAt = tier === 'premium'
    ? new Date(Date.now() + premiumDurationDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  return {
    key,
    tier,
    maxDevices,
    expiresAt,
    segments: [seg1, seg2, seg3, seg4],
    code,
  }
}

export interface VerifyResult {
  valid: boolean
  tier?: 'pro' | 'premium'
  reason?: string
}

export async function verifyKey(key: string, secret: string): Promise<VerifyResult> {
  const parts = key.trim().toUpperCase().split('-')
  if (parts.length !== 7 || parts[0] !== 'VB') {
    return { valid: false, reason: '格式无效' }
  }

  const [, seg1, seg2, seg3, seg4, code, sig] = parts

  if (code !== 'PRO' && code !== 'PRE') {
    return { valid: false, reason: '类型无效' }
  }

  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${secret}`
  const hash = await sha256Hex(payload)
  const expected = hash.substring(0, 8).toUpperCase()

  if (sig !== expected) {
    return { valid: false, reason: '激活码无效' }
  }

  const tier = code === 'PRO' ? ('pro' as const) : ('premium' as const)
  return { valid: true, tier }
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
