/**
 * 批量激活码生成工具
 *
 * Usage:
 *   npx tsx scripts/generate-keys.ts --tier premium --plan monthly --count 50 --maxDevices 3
 *   npx tsx scripts/generate-keys.ts --tier premium --plan annual --count 10 --maxDevices 3
 *
 * Key CODE:
 *   PRO = Pro buyout (lifetime)
 *   PR1 = Premium monthly   (30d)
 *   PR2 = Premium quarterly (90d)
 *   PR3 = Premium semi-annual (180d)
 *   PR4 = Premium annual    (365d)
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const SUBSCRIPTION_PLANS: Record<string, { label: string; days: number; price: string; code: string }> = {
  monthly:     { label: '月付', days: 30,  price: '19.9', code: 'PR1' },
  quarterly:   { label: '季付', days: 90,  price: '49.9', code: 'PR2' },
  semi_annual: { label: '半年付', days: 180, price: '79.9', code: 'PR3' },
  annual:      { label: '年付', days: 365, price: '119.9', code: 'PR4' },
}

function codeToDays(code: string): number {
  if (code === 'PRO') return 0
  if (code === 'PRE') return 30
  const m = code.match(/^PR(\d)$/)
  if (m) return [0, 30, 90, 180, 365][parseInt(m[1])] || 30
  return 30
}

interface Options {
  tier: 'pro' | 'premium'
  plan: string
  count: number
  maxDevices: number
  output: string
  secret: string
  append: boolean
}

function parseArgs(): Options {
  const args = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }

  const tier = get('tier') || 'pro'
  if (tier !== 'pro' && tier !== 'premium') {
    console.error('Error: --tier must be "pro" or "premium"')
    process.exit(1)
  }

  const plan = get('plan') || 'monthly'
  const count = parseInt(get('count') || '10', 10)
  const defaultMaxDevices = tier === 'pro' ? 2 : 3
  const maxDevices = parseInt(get('maxDevices') || String(defaultMaxDevices), 10)
  const secret = get('secret') || process.env.VIDEOBOX_LICENSE_SECRET || 'videobox-dev-secret-placeholder'
  const defaultOutput = `keys-${tier}-${plan}-${new Date().toISOString().split('T')[0]}.csv`
  const output = get('output') || defaultOutput
  const append = args.includes('--append')

  return { tier: tier as 'pro' | 'premium', plan, count, maxDevices, output, secret, append }
}

function randomSegment(): string {
  const bytes = crypto.randomBytes(4)
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('')
}

interface KeyData {
  key: string
  tier: string
  code: string
  plan: string
  durationDays: number
  maxDevices: number
  expiresAt: string
  createdAt: string
}

function generateKey(tier: 'pro' | 'premium', plan: string, maxDevices: number, secret: string): KeyData {
  const seg1 = randomSegment()
  const seg2 = randomSegment()
  const seg3 = randomSegment()
  const seg4 = randomSegment()

  let code: string, durationDays: number
  if (tier === 'pro') {
    code = 'PRO'
    durationDays = 0
  } else {
    code = SUBSCRIPTION_PLANS[plan]?.code || 'PR1'
    durationDays = codeToDays(code)
  }

  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${secret}`
  const sig = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 8).toUpperCase()
  const key = `VB-${seg1}-${seg2}-${seg3}-${seg4}-${code}-${sig}`

  const expiresAt = durationDays > 0
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
    : 'never'

  return { key, tier, code, plan, durationDays, maxDevices, expiresAt, createdAt: new Date().toISOString() }
}

function writeCSV(filepath: string, keys: KeyData[], append: boolean): void {
  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const header = 'key,tier,code,plan,durationDays,maxDevices,expiresAt,createdAt\n'
  const rows = keys.map((k) => `${k.key},${k.tier},${k.code},${k.plan},${k.durationDays},${k.maxDevices},${k.expiresAt},${k.createdAt}`).join('\n')
  if (append && fs.existsSync(filepath)) {
    fs.appendFileSync(filepath, rows + '\n', 'utf-8')
  } else {
    fs.writeFileSync(filepath, header + rows + '\n', 'utf-8')
  }
}

function writeKVJSON(filepath: string, keys: KeyData[]): void {
  const records: Record<string, object> = {}
  for (const k of keys) {
    records[`key:${k.key}`] = {
      key: k.key, tier: k.tier, code: k.code, plan: k.plan,
      maxDevices: k.maxDevices, devices: [], createdAt: k.createdAt,
      expiresAt: k.expiresAt === 'never' ? null : k.expiresAt, revoked: false,
    }
  }
  fs.writeFileSync(filepath, JSON.stringify(records, null, 2), 'utf-8')
}

function main(): void {
  const opts = parseArgs()
  console.log(`\n  Videobox Key Generator`)
  const planInfo = opts.tier === 'premium' ? SUBSCRIPTION_PLANS[opts.plan] : null
  console.log(`  Tier: ${opts.tier}  Plan: ${opts.tier === 'premium' ? `${opts.plan} (${planInfo?.code}, ${planInfo?.days}d)` : 'lifetime'}`)
  console.log(`  Count: ${opts.count}  Max Devices: ${opts.maxDevices}`)

  const keys: KeyData[] = []
  for (let i = 0; i < opts.count; i++) {
    keys.push(generateKey(opts.tier, opts.plan, opts.maxDevices, opts.secret))
    if ((i + 1) % 10 === 0 || i === opts.count - 1) {
      process.stdout.write(`\r  Generating... ${i + 1}/${opts.count}`)
    }
  }

  const csvPath = path.resolve(opts.output)
  writeCSV(csvPath, keys, opts.append)
  console.log(`\n  CSV: ${csvPath}`)

  const jsonPath = csvPath.replace(/\.csv$/, '.kv.json')
  writeKVJSON(jsonPath, keys)
  console.log(`  KV:  ${jsonPath}`)

  console.log(`\n  Preview:`)
  keys.slice(0, 3).forEach((k) => console.log(`    ${k.key}  (${k.code} ${k.durationDays > 0 ? k.durationDays + 'd' : 'lifetime'} max ${k.maxDevices} devices)`))
  if (keys.length > 3) console.log(`    ... +${keys.length - 3} more`)
  console.log(`\n  Import: wrangler kv:bulk put --namespace-id=<ID> ${jsonPath}\n`)
}

main()
