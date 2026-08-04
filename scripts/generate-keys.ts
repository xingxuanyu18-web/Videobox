/**
 * 批量激活码生成工具
 *
 * Usage:
 *   npx ts-node scripts/generate-keys.ts --tier pro --count 100 --maxDevices 2
 *   npx ts-node scripts/generate-keys.ts --tier premium --count 50 --maxDevices 3 --duration 30
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

interface Options {
  tier: 'pro' | 'premium'
  count: number
  maxDevices: number
  duration: number
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

  const count = parseInt(get('count') || '10', 10)
  const defaultMaxDevices = tier === 'pro' ? 2 : 3
  const maxDevices = parseInt(get('maxDevices') || String(defaultMaxDevices), 10)
  const duration = parseInt(get('duration') || '30', 10)
  const secret = get('secret') || process.env.VIDEOBOX_LICENSE_SECRET || 'videobox-dev-secret-placeholder'
  const defaultOutput = `keys-${tier}-${new Date().toISOString().split('T')[0]}.csv`
  const output = get('output') || defaultOutput
  const append = args.includes('--append')

  return { tier: tier as 'pro' | 'premium', count, maxDevices, duration, output, secret, append }
}

function randomSegment(): string {
  const bytes = crypto.randomBytes(4)
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('')
}

interface KeyData {
  key: string
  tier: string
  maxDevices: number
  expiresAt: string
  createdAt: string
}

function generateKey(tier: 'pro' | 'premium', maxDevices: number, secret: string, durationDays: number): KeyData {
  const seg1 = randomSegment()
  const seg2 = randomSegment()
  const seg3 = randomSegment()
  const seg4 = randomSegment()
  const code = tier === 'pro' ? 'PRO' : 'PRE'

  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${secret}`
  const sig = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 8).toUpperCase()
  const key = `VB-${seg1}-${seg2}-${seg3}-${seg4}-${code}-${sig}`

  const expiresAt = tier === 'premium'
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
    : 'never'

  return { key, tier, maxDevices, expiresAt, createdAt: new Date().toISOString() }
}

function writeCSV(filepath: string, keys: KeyData[], append: boolean): void {
  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const header = 'key,tier,maxDevices,expiresAt,createdAt\n'
  const rows = keys.map((k) => `${k.key},${k.tier},${k.maxDevices},${k.expiresAt},${k.createdAt}`).join('\n')
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
      key: k.key, tier: k.tier, maxDevices: k.maxDevices,
      devices: [], createdAt: k.createdAt,
      expiresAt: k.expiresAt === 'never' ? null : k.expiresAt,
      revoked: false,
    }
  }
  fs.writeFileSync(filepath, JSON.stringify(records, null, 2), 'utf-8')
}

function main(): void {
  const opts = parseArgs()
  console.log(`\n  Videobox Key Generator`)
  console.log(`  Tier: ${opts.tier}  Count: ${opts.count}  Max Devices: ${opts.maxDevices}`)
  console.log(`  Duration: ${opts.tier === 'premium' ? `${opts.duration} days` : 'lifetime'}`)

  const keys: KeyData[] = []
  for (let i = 0; i < opts.count; i++) {
    keys.push(generateKey(opts.tier, opts.maxDevices, opts.secret, opts.duration))
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
  keys.slice(0, 3).forEach((k) => console.log(`    ${k.key}  (max ${k.maxDevices} devices)`))
  if (keys.length > 3) console.log(`    ... +${keys.length - 3} more`)
  console.log(`\n  Import: wrangler kv:bulk put --namespace-id=<ID> ${jsonPath}\n`)
}

main()
