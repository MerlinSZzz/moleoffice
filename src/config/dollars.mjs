// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Dollar caps use whole cents and safe integer arithmetic, not exponents or rounded fractions. */
export function dollarsWithWholeCents(raw) {
  if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/.test(raw)) return null
  const [whole, fraction = ''] = raw.split('.')
  if (/[1-9]/.test(fraction.slice(2))) return null
  const cents = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'))
  const dollars = Number(raw)
  return Number.isSafeInteger(cents) && Number.isFinite(dollars) ? dollars : null
}
