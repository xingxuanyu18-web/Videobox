/**
 * Shared plan ↔ code mapping.
 * Used by key-generator, worker index, scripts, and client-side LicenseManager.
 *
 * CODE:
 *   PRO = Pro buyout (lifetime)
 *   PR1 = Premium monthly   (30 days)
 *   PR2 = Premium quarterly (90 days)
 *   PR3 = Premium semi-annual (180 days)
 *   PR4 = Premium annual    (365 days)
 *   PRE = Legacy premium (backward compat → treated as 30 days)
 */

export const SUBSCRIPTION_PLANS: Record<string, { label: string; days: number; price: string; code: string }> = {
  monthly:     { label: '月付', days: 30,  price: '19.9', code: 'PR1' },
  quarterly:   { label: '季付', days: 90,  price: '49.9', code: 'PR2' },
  semi_annual: { label: '半年付', days: 180, price: '79.9', code: 'PR3' },
  annual:      { label: '年付', days: 365, price: '119.9', code: 'PR4' },
}

/** Map a subscription plan id to its key code. */
export function planToCode(plan: string): string {
  return SUBSCRIPTION_PLANS[plan]?.code || 'PR1'
}

/** Get the plan id for a given key code. */
export function codeToPlan(code: string): string {
  for (const [plan, info] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (info.code === code) return plan
  }
  return 'monthly'
}

/** Get the duration (days) for a given key code. */
export function codeToDays(code: string): number {
  // PRO = lifetime
  if (code === 'PRO') return 0
  // Legacy PRE = 30 days
  if (code === 'PRE') return 30
  // PR1-PR4
  const m = code.match(/^PR(\d)$/)
  if (m) {
    const days = [0, 30, 90, 180, 365]
    return days[parseInt(m[1])] || 30
  }
  return 30
}

/** Premium code description for UI. */
export function codeToLabel(code: string): string {
  switch (code) {
    case 'PRO': return 'Pro 永久买断'
    case 'PRE': return 'Premium 月付'
    case 'PR1': return 'Premium 月付'
    case 'PR2': return 'Premium 季付'
    case 'PR3': return 'Premium 半年付'
    case 'PR4': return 'Premium 年付'
    default: return 'Premium 订阅'
  }
}
