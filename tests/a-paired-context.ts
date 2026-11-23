// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER CONTEXT PAIRED AS THE PERSON, WITH THE TWO HALVES OF A DEVICE KEY, THE WAY A BROWSER IS PAIRED.
 *
 * A browser proves it is the person with two halves of one device key: a cookie half the browser keeps and page
 * JavaScript cannot read, and a header half the page keeps in its own storage and sends on its own calls. Neither half
 * alone is the person. Before this, a browser test set the person's whole key as a cookie, and that cookie is no key
 * any more.
 *
 * `pairTheContext` presses the office's pairing door through the context's own request, so the cookie half lands in
 * the context's cookie store exactly as the press's answer sets it. It then keeps the header half in the page's
 * storage, under the name the page reads it from, before any page of the context runs a script. So every page the
 * context opens afterwards is paired, as a browser is after the press.
 *
 * `makeTheContextThePerson` is for an office that may offer no pairing on this computer. A Mac checkout outside the
 * installed app is one: there the office finds no program that sent a request, so its press refuses every browser. The
 * function first reads the pairing door with no key. Where the office offers pairing, it pairs the context with
 * `pairTheContext`. Where it offers none, it presses once all the same, and takes only a 403 as the refusal it expects.
 * It then puts the person's key, which the caller read and gave it, in a header on every request the context's pages
 * make. It answers which of the two ways it took. It reads no key itself.
 *
 * It starts no process.
 *
 * THE HALVES AND THE KEY ARE NEVER PRINTED. The header half is given back for a test that sends it on a call of its
 * own; no assertion should quote it. No error here quotes an answer that holds a half or the key.
 */

import type { BrowserContext } from 'playwright'

/** The name the context gives itself at the press. A made-up label, never a secret. */
export const A_TEST_BROWSERS_NAME = 'A test browser'

/** What the press gave the context: the header half, kept in the page's storage. The cookie half is in its cookies. */
export interface APairedContext {
  headerHalf: string
}

/**
 * Pair the context as the person through the office at `api`, and keep the header half where its pages read it. The
 * press is answered on this computer's own listener, so `api` is the office's loopback address.
 */
export async function pairTheContext(context: BrowserContext, api: string, device = A_TEST_BROWSERS_NAME): Promise<APairedContext> {
  const { DEVICE_HALF_KEY } = await import('../src/web/lib/the-device-half.ts')
  const pressed = await context.request.post(`${api}/api/office/pairing`, { data: { device } })
  if (pressed.status() !== 200) throw new Error(`the pairing press answered ${String(pressed.status())}, so the context is not paired`)
  const answer = (await pressed.json()) as { deviceHalf?: unknown }
  if (typeof answer.deviceHalf !== 'string' || answer.deviceHalf === '') throw new Error('the pairing press answered no header half')
  const headerHalf = answer.deviceHalf
  await context.addInitScript(
    ({ key, half }) => {
      window.localStorage.setItem(key, half)
    },
    { key: DEVICE_HALF_KEY, half: headerHalf },
  )
  return { headerHalf }
}

/**
 * How a context was made the person: paired by the press, with the header half the press answered, or carrying the
 * person's key, with the sentence that says why.
 */
export type HowTheContextIsThePerson = { way: 'paired by the press'; headerHalf: string } | { way: "the person's key"; because: string }

/**
 * Make the context the person on the office at `api`, which is the office's loopback address. Where the office offers
 * pairing on this computer, the context is paired by the press. Where it offers none, the press must answer 403, and
 * the context then carries `thePersonsKey`, the key header the caller read from the office's key file.
 */
export async function makeTheContextThePerson(
  context: BrowserContext,
  api: string,
  thePersonsKey: Record<string, string>,
  device = A_TEST_BROWSERS_NAME,
): Promise<HowTheContextIsThePerson> {
  const read = await context.request.get(`${api}/api/office/pairing`)
  if (read.status() !== 200) throw new Error(`the pairing read answered ${String(read.status())}, so whether this office offers pairing is not known`)
  const pairing = (await read.json()) as { paired?: unknown; offered?: unknown }
  if (pairing.paired !== false) {
    throw new Error(`the pairing read with no key answered paired ${what(pairing.paired)}, where it must answer false`)
  }
  if (pairing.offered !== true && pairing.offered !== false) {
    throw new Error(`the pairing read answered offered ${what(pairing.offered)}, where it must answer true or false`)
  }
  if (pairing.offered) return { way: 'paired by the press', ...(await pairTheContext(context, api, device)) }
  const pressed = await context.request.post(`${api}/api/office/pairing`, { data: { device } })
  if (pressed.status() === 200) throw new Error('this office says it offers no pairing on this computer, and its press paired the context')
  if (pressed.status() !== 403) {
    throw new Error(`this office offers no pairing on this computer, and its press answered ${String(pressed.status())} where a refusal is 403`)
  }
  await context.setExtraHTTPHeaders(thePersonsKey)
  return { way: "the person's key", because: 'This office offers no pairing on this computer, and its press answered 403.' }
}

/** A value of the pairing read, as an error says it. The read holds no half and no key. */
function what(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value)
}

/**
 * Give a second context the pairing of the first: its cookies and the header half its pages read. A context that only
 * copied the cookies would hold one half, and one half is not the person.
 */
export async function carryThePairing(from: BrowserContext, to: BrowserContext, paired: APairedContext): Promise<void> {
  const { DEVICE_HALF_KEY } = await import('../src/web/lib/the-device-half.ts')
  await to.addCookies(await from.cookies())
  await to.addInitScript(
    ({ key, half }) => {
      window.localStorage.setItem(key, half)
    },
    { key: DEVICE_HALF_KEY, half: paired.headerHalf },
  )
}
