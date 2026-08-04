/**
 * Videobox Activation Server
 *
 * Serves the activation landing page + provides license verification API.
 * Run: node server.js
 * Port: 8788
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8788;
const SECRET = process.env.VIDEOBOX_LICENSE_SECRET || 'videobox-dev-secret-placeholder';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Key verification (same algorithm as LicenseManager.verifyLocal)
function verifyKey(key) {
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 7 || parts[0] !== 'VB') {
    return { valid: false, reason: '格式无效' };
  }
  const [_, seg1, seg2, seg3, seg4, code, sig] = parts;
  if (code !== 'PRO' && code !== 'PRE') {
    return { valid: false, reason: '类型无效' };
  }
  const payload = `${seg1}-${seg2}-${seg3}-${seg4}-${code}-${SECRET}`;
  const expected = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 8).toUpperCase();
  if (sig !== expected) {
    return { valid: false, reason: '激活码无效' };
  }
  const tier = code === 'PRO' ? 'pro' : 'premium';
  const expiresAt = tier === 'premium'
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  return { valid: true, tier, expiresAt };
}

// In-memory store
const activations = new Map();

// POST /api/activate - validate and record activation
app.post('/api/activate', (req, res) => {
  const { key, machineId } = req.body;
  if (!key || !machineId) {
    return res.json({ success: false, message: '缺少参数' });
  }
  const upperKey = key.trim().toUpperCase();
  if (activations.has(upperKey)) {
    const existing = activations.get(upperKey);
    if (existing.machineId !== machineId) {
      return res.json({ success: false, message: '此激活码已在其他设备使用' });
    }
    return res.json({ success: true, tier: existing.tier, expiresAt: existing.expiresAt, message: '重新激活成功' });
  }
  const result = verifyKey(key);
  if (!result.valid) {
    return res.json({ success: false, message: result.reason });
  }
  activations.set(upperKey, { machineId, tier: result.tier, expiresAt: result.expiresAt, activatedAt: new Date().toISOString() });
  return res.json({ success: true, tier: result.tier, expiresAt: result.expiresAt, message: `激活成功！${result.tier === 'pro' ? 'Pro' : 'Premium'}` });
});

// POST /api/verify - check license validity
app.post('/api/verify', (req, res) => {
  const { machineId, licenseKey } = req.body;
  if (!licenseKey) return res.json({ valid: false });
  const activation = activations.get(licenseKey.toUpperCase());
  if (!activation) {
    const result = verifyKey(licenseKey);
    if (result.valid) return res.json({ valid: true, tier: result.tier, expiresAt: result.expiresAt });
    return res.json({ valid: false });
  }
  if (activation.machineId !== machineId) return res.json({ valid: false, reason: 'device_mismatch' });
  if (activation.expiresAt && new Date() > new Date(activation.expiresAt)) return res.json({ valid: false, reason: 'expired' });
  return res.json({ valid: true, tier: activation.tier, expiresAt: activation.expiresAt });
});

// POST /api/purchase - generate key (simulate purchase)
app.post('/api/purchase', (req, res) => {
  const { plan } = req.body;
  if (!plan || !['pro', 'premium'].includes(plan)) {
    return res.json({ success: false, message: '无效方案' });
  }
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  const code = plan === 'pro' ? 'PRO' : 'PRE';
  const body = `${seg()}-${seg()}-${seg()}-${seg()}-${code}`;
  const payload = `${body}-${SECRET}`;
  const sig = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 8).toUpperCase();
  const key = `VB-${body}-${sig}`;
  return res.json({ success: true, key });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activations: activations.size });
});

app.listen(PORT, () => {
  console.log(`\n  Videobox Activation Server`);
  console.log(`  Page:  http://localhost:${PORT}`);
  console.log(`  API:   http://localhost:${PORT}/api\n`);
});
