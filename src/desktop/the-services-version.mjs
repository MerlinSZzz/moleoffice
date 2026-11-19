// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW THE SERVICE THAT ANSWERS COMPARES WITH THIS WINDOW, BY VERSION.
 *
 * A service keeps running when Mole Office is replaced by a newer copy. The newer copy's window then finds a healthy
 * service that runs the older version. Before this module, it opened that service as its own, and the person worked
 * in the older version without knowing. The service's health check says which version it runs, and the self-check
 * carries that to the window (src/config/the-self-check.mjs). This module decides whether that service is older
 * than the window, the same, newer, or not compared at all. It holds nothing of Electron; src/desktop/main.mjs
 * acts on what it decides.
 *
 * ONLY A MISSING FIELD IS READ AS OLDER WITHOUT A VERSION. A healthy answer whose health check has no `version` field
 * comes from a service made before services said their version, so it is older than any window that reads the field.
 * Nothing else that is missing is guessed at. A version of null, a version that is present but is not a string, a
 * version that is not a version, and a window that knows no version of its own are compared with nothing, and the
 * window then does what it did before it compared versions. An unhealthy answer with no field is not compared
 * either, because its health check may have failed before it could say anything.
 *
 * AN ANSWER THAT SERVES ANOTHER CHECKOUT, OR WAITS FOR ITS DATABASE UPDATE, IS NOT COMPARED. The window shows its own
 * page for each, and the version of that service says nothing about this window.
 *
 * Versions are compared by the precedence of Semantic Versioning 2.0.0, section 11.
 */

/**
 * A VERSION, as Semantic Versioning 2.0.0 writes one: three numbers, then an optional pre-release after a hyphen, then
 * optional build metadata after a plus sign. No number has a leading zero, and nothing comes before the first number.
 */
const A_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/

/**
 * Two numbers written in digits with no leading zero, compared. The longer one is larger, so a number of any size
 * is compared exactly.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compareNumbers(a, b) {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1
  return a === b ? 0 : a < b ? -1 : 1
}

/**
 * Two identifiers of a pre-release, compared. Two numbers compare as numbers. A number comes before a word. Two words
 * compare by their characters' order in ASCII.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
function compareIdentifiers(a, b) {
  const aIsANumber = /^\d+$/.test(a)
  const bIsANumber = /^\d+$/.test(b)
  if (aIsANumber && bIsANumber) return compareNumbers(a, b)
  if (aIsANumber !== bIsANumber) return aIsANumber ? -1 : 1
  return a === b ? 0 : a < b ? -1 : 1
}

/**
 * COMPARE TWO VERSIONS by Semantic Versioning's precedence. The three numbers decide first. A version with a
 * pre-release comes before the same version without one. Two pre-releases compare identifier by identifier, and when
 * one runs out first, it is the earlier. Build metadata decides nothing.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1 | null} -1 when a comes before b, 1 when after, 0 when neither; null when either is not a version
 */
export function compareVersions(a, b) {
  const one = A_VERSION.exec(a)
  const other = A_VERSION.exec(b)
  if (one === null || other === null) return null
  for (const at of [1, 2, 3]) {
    const order = compareNumbers(one[at] ?? '', other[at] ?? '')
    if (order !== 0) return order
  }
  const ones = one[4]?.split('.') ?? []
  const others = other[4]?.split('.') ?? []
  if (ones.length === 0 || others.length === 0) return ones.length === others.length ? 0 : ones.length === 0 ? 1 : -1
  for (let at = 0; at < Math.min(ones.length, others.length); at++) {
    const order = compareIdentifiers(ones[at] ?? '', others[at] ?? '')
    if (order !== 0) return order
  }
  return ones.length === others.length ? 0 : ones.length < others.length ? -1 : 1
}

/**
 * @typedef {{ is: 'older', service: string | null, window: string } | { is: 'same' } | { is: 'newer', service: string, window: string } | { is: 'not compared', why: string }} HowTheVersionsCompare
 * `service` is null for an older service that is from before services said their version.
 */

/**
 * HOW THE SERVICE THAT ANSWERS COMPARES WITH THIS WINDOW, from what the self-check found and the window's own version.
 *
 * @param {import('../config/the-self-check.mjs').WhatAnswers} found
 * @param {string | null} windowVersion the version this window runs (`theVersion` in src/config/settings.mjs)
 * @returns {HowTheVersionsCompare}
 */
export function howTheServicesVersionCompares(found, windowVersion) {
  if (found.answer !== 'healthy' && found.answer !== 'unhealthy') {
    return { is: 'not compared', why: `the self-check answered ${found.answer}, and only a healthy or unhealthy office is compared` }
  }
  if (found.answer === 'unhealthy' && found.updateWaiting === true) {
    return { is: 'not compared', why: 'the service waits for its database update, and the window opens its page for that' }
  }
  if (found.servesFor !== undefined) {
    return { is: 'not compared', why: `the service runs from ${found.servesFor.stableCheckout} for the checkout at ${found.servesFor.developmentCheckout}` }
  }
  if (windowVersion === null) return { is: 'not compared', why: 'this window knows no version of its own' }
  if (!A_VERSION.test(windowVersion)) return { is: 'not compared', why: `this window's own version, "${windowVersion}", is not a version` }
  if (!('version' in found)) {
    if (found.answer === 'healthy') return { is: 'older', service: null, window: windowVersion }
    return { is: 'not compared', why: 'the service is unhealthy, and its health check said no version' }
  }
  const service = found.version ?? null
  if (service === null) return { is: 'not compared', why: 'the service said its version is null: its bundle recorded none' }
  if (typeof service !== 'string') {
    return { is: 'not compared', why: `the service said a version this window cannot read: ${String(service)}` }
  }
  const order = compareVersions(service, windowVersion)
  if (order === null) return { is: 'not compared', why: `the service said its version is "${service}", which is not a version` }
  if (order === 0) return { is: 'same' }
  return order < 0 ? { is: 'older', service, window: windowVersion } : { is: 'newer', service, window: windowVersion }
}
