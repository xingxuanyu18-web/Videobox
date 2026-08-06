/**
 * Videobox Activation API — Cloudflare Worker
 *
 * Routes:
 *   POST /api/activate          — Validate key + bind device
 *   POST /api/verify            — Check license validity
 *   POST /api/devices           — List devices for a key
 *   POST /api/deactivate-device — Remove a device binding
 *   POST /api/purchase          — Generate a key
 *   POST /api/webhook/mianbaoduo — Payment webhook from 面包多
 *   GET  /api/health            — Health check
 */

import { verifyKey, generateKey } from './key-generator'
import { ActivationStore, ActivationRecord } from './storage'
import { SUBSCRIPTION_PLANS, codeToDays, planToCode } from './plan-codes'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function err(message: string, status = 400): Response {
  return json({ success: false, message }, status)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname
    const store = env.VIDEOBOX_ACTIVATIONS ? new ActivationStore(env.VIDEOBOX_ACTIVATIONS) : null
    const SECRET = env.LICENSE_SECRET || 'videobox-dev-secret-placeholder'

    try {
      switch (path) {
        case '/api/activate': return handleActivate(request, SECRET, store)
        case '/api/verify': return handleVerify(request, SECRET, store)
        case '/api/devices': return handleGetDevices(request, SECRET, store)
        case '/api/deactivate-device': return handleDeactivateDevice(request, SECRET, store)
        case '/api/purchase': return handlePurchase(request, SECRET, store)
        case '/api/webhook/mianbaoduo': return handleMianbaoduoWebhook(request, SECRET, store)
        case '/api/health': return handleHealth(store)
      }

      // Non-API paths: serve landing page HTML from KV
      if (env.VIDEOBOX_SITE_HTML) {
        const html = await env.VIDEOBOX_SITE_HTML.get('site-html', 'text')
        if (html) {
          return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
          })
        }
      }

      // Fallback: site not configured
      return new Response('Videobox API is running. Visit /api/health for status.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS },
      })
    } catch (e) {
      console.error('Unhandled error:', e)
      return err('服务器内部错误', 500)
    }
  },
}

// ==================== Route Handlers ====================

async function handleActivate(req: Request, secret: string, store: ActivationStore | null): Promise<Response> {
  const { key, machineId, deviceLabel } = await req.json() as Record<string, string>
  if (!key || !machineId) return err('缺少参数 (key, machineId)')

  const result = await verifyKey(key, secret)
  if (!result.valid) return err(result.reason || '激活码无效')

  const upperKey = key.trim().toUpperCase()

  // No KV store — dev/testing mode (returns success for any valid key)
  if (!store) {
    return json({
      success: true,
      tier: result.tier,
      expiresAt: result.tier === 'premium' ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
      maxDevices: result.tier === 'pro' ? 2 : 3,
      message: `激活成功！${result.tier === 'pro' ? 'Pro 买断版' : 'Premium 订阅版'} (KV未配置)`,
    })
  }

  const record = await store.getByKey(upperKey)
  if (!record) return err('激活码未找到，请联系客服')
  if (record.revoked) return err('激活码已被撤销')
  if (record.expiresAt && new Date() > new Date(record.expiresAt)) return err('订阅已过期，请续费')

  // Re-activation on same machine — update label
  const existingDevice = record.devices.find((d) => d.machineId === machineId)
  if (existingDevice) {
    existingDevice.label = deviceLabel || existingDevice.label
    existingDevice.activatedAt = new Date().toISOString()
    await store.save(record)
    return json({
      success: true, tier: record.tier, expiresAt: record.expiresAt,
      maxDevices: record.maxDevices, message: '重新激活成功',
    })
  }

  // Check device limit
  if (record.devices.length >= record.maxDevices) {
    return err(`设备数量已达上限 (${record.maxDevices}台)。如需解绑旧设备，请在已激活设备上操作或联系客服。`)
  }

  // Register new device
  record.devices.push({
    machineId,
    activatedAt: new Date().toISOString(),
    label: deviceLabel || `设备 ${record.devices.length + 1}`,
  })
  await store.save(record)
  await store.addMachineBinding(machineId, upperKey)

  const tierLabel = record.tier === 'pro' ? 'Pro 买断版' : 'Premium 订阅版'
  return json({
    success: true, tier: record.tier, expiresAt: record.expiresAt,
    maxDevices: record.maxDevices, message: `激活成功！${tierLabel}`,
  })
}

async function handleVerify(req: Request, secret: string, store: ActivationStore | null): Promise<Response> {
  const { machineId, licenseKey } = await req.json() as Record<string, string>
  if (!licenseKey) return json({ valid: false })

  if (!store) {
    const result = await verifyKey(licenseKey, secret)
    return json({
      valid: result.valid, tier: result.tier || null,
      expiresAt: result.tier === 'premium' ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
    })
  }

  const record = await store.getByKey(licenseKey.toUpperCase())
  if (!record) {
    const result = await verifyKey(licenseKey, secret)
    if (result.valid) return json({ valid: true, tier: result.tier, expiresAt: null })
    return json({ valid: false, reason: 'not_found' })
  }

  if (record.revoked) return json({ valid: false, reason: 'revoked' })
  if (machineId && !record.devices.find((d) => d.machineId === machineId)) {
    return json({ valid: false, reason: 'device_mismatch' })
  }
  if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
    return json({ valid: false, reason: 'expired' })
  }

  return json({ valid: true, tier: record.tier, expiresAt: record.expiresAt, maxDevices: record.maxDevices })
}

async function handleGetDevices(req: Request, secret: string, store: ActivationStore | null): Promise<Response> {
  const { key } = await req.json() as Record<string, string>
  if (!key) return err('缺少参数 (key)')
  if (!store) return json({ success: true, devices: [], maxDevices: 2 })

  const result = await verifyKey(key, secret)
  if (!result.valid) return err(result.reason || '激活码无效')

  const record = await store.getByKey(key.toUpperCase())
  if (!record) return json({ success: true, devices: [], maxDevices: 0 })

  return json({ success: true, devices: record.devices, maxDevices: record.maxDevices, tier: record.tier })
}

async function handleDeactivateDevice(req: Request, secret: string, store: ActivationStore | null): Promise<Response> {
  const { key, machineId } = await req.json() as Record<string, string>
  if (!key || !machineId) return err('缺少参数 (key, machineId)')
  if (!store) return json({ success: true, message: '设备已解绑 (KV未配置)' })

  const result = await verifyKey(key, secret)
  if (!result.valid) return err(result.reason || '激活码无效')

  const record = await store.getByKey(key.toUpperCase())
  if (!record) return err('激活码未找到')

  const before = record.devices.length
  record.devices = record.devices.filter((d) => d.machineId !== machineId)
  if (record.devices.length === before) return err('未找到该设备绑定')

  await store.save(record)
  await store.removeMachineBinding(machineId, key.toUpperCase())

  return json({ success: true, message: '设备已解绑', remainingDevices: record.devices.length })
}

async function handlePurchase(req: Request, secret: string, store: ActivationStore | null): Promise<Response> {
  const { plan = 'pro', maxDevices } = await req.json() as { plan?: string; maxDevices?: number }

  let tier: 'pro' | 'premium'
  let durationDays: number

  if (plan === 'pro') {
    tier = 'pro'
    durationDays = 0
  } else if (SUBSCRIPTION_PLANS[plan]) {
    tier = 'premium'
    durationDays = SUBSCRIPTION_PLANS[plan].days
  } else {
    return err('无效方案: ' + plan)
  }

  const devices = maxDevices || (tier === 'pro' ? 2 : 3)
  const generated = await generateKey(tier, devices, secret, durationDays, plan)

  if (store) {
    const record: ActivationRecord = {
      key: generated.key, tier: generated.tier, plan, code: generated.code,
      maxDevices: generated.maxDevices,
      devices: [], createdAt: new Date().toISOString(),
      expiresAt: generated.expiresAt, revoked: false,
    }
    await store.storeGeneratedKey(record)
  }

  return json({ success: true, key: generated.key, tier: generated.tier, maxDevices: generated.maxDevices, plan, durationDays: generated.durationDays, code: generated.code, expiresAt: generated.expiresAt })
}

async function handleMianbaoduoWebhook(req: Request, secret: string, store: ActivationStore | null): Promise<Response> {
  const body = await req.json() as { order_id?: string; product_id?: string; pay_status?: string }
  if (body.pay_status !== 'success') return json({ success: false, message: '支付未完成' })

  // product_id can be 'pro', 'monthly', 'quarterly', 'semi_annual', or 'annual'
  const plan = body.product_id || 'pro'
  let tier: 'pro' | 'premium'
  let durationDays: number

  if (plan === 'pro') {
    tier = 'pro'
    durationDays = 0
  } else if (SUBSCRIPTION_PLANS[plan]) {
    tier = 'premium'
    durationDays = SUBSCRIPTION_PLANS[plan].days
  } else {
    return err('无效商品: ' + plan)
  }

  const maxDevices = tier === 'pro' ? 2 : 3
  const generated = await generateKey(tier, maxDevices, secret, durationDays, plan)

  if (store) {
    const record: ActivationRecord = {
      key: generated.key, tier: generated.tier, maxDevices: generated.maxDevices,
      devices: [], createdAt: new Date().toISOString(), expiresAt: generated.expiresAt,
      purchaseOrderId: body.order_id, plan, code: generated.code, revoked: false,
    }
    await store.storeGeneratedKey(record)
  }

  return json({ success: true, key: generated.key, tier: generated.tier, plan, durationDays: generated.durationDays, code: generated.code })
}

async function handleHealth(store: ActivationStore | null): Promise<Response> {
  const totalKeys = store ? await store.getTotalKeysGenerated() : 0
  return json({
    status: 'ok',
    mode: store ? 'kv' : 'memory',
    totalKeysGenerated: totalKeys,
    timestamp: new Date().toISOString(),
  })
}

interface Env {
  VIDEOBOX_ACTIVATIONS?: KVNamespace
  VIDEOBOX_SITE_HTML?: KVNamespace
  LICENSE_SECRET?: string
}
