// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HEADER HALF OF THIS BROWSER'S DEVICE KEY, KEPT IN THIS PAGE'S STORAGE.
 *
 * The pairing press and the ask door answer the header half once (src/server/api/office.ts). The page keeps it here,
 * and every request the page makes to the office sends it in `DEVICE_HALF_HEADER`. The cookie half is a cookie page
 * JavaScript cannot read, so a script that reads this storage holds one half and no key.
 *
 * A STORAGE THAT REFUSES TO KEEP IT IS SAID. A profile that throws on `localStorage` cannot keep the half. The keep then
 * throws, and the page shows that fault, so it never says paired while the browser holds only the cookie half. A read
 * that throws is read as no half: the request then carries none, and the office answers it as a browser that is not
 * paired.
 */
import { DEVICE_HALF_HEADER, DEVICE_HALF_KEY } from '../../config/key-header.mjs'

export { DEVICE_HALF_KEY }

/** Keep the header half the press, the ask door or the move answered. */
function keepTheDeviceHalf(half: string): void {
  window.localStorage.setItem(DEVICE_HALF_KEY, half)
}

/** The presses out now that set the cookie half, each settled once its header half is kept or it failed. */
const pressesOut = new Set<Promise<void>>()
/** The requests those presses send, which are never held. */
const thePressesOwnRequests = new WeakSet<RequestInit>()

/**
 * A PRESS THAT SETS THE COOKIE HALF HOLDS THE PAGE'S OTHER REQUESTS UNTIL ITS HEADER HALF IS KEPT. The pairing press, the
 * ask door and the move each set the cookie half in their answer's headers and answer the header half in its body. The
 * browser keeps the cookie as soon as the headers arrive, and the page keeps the header half only once the body is read.
 * A request sent between the two would carry the cookie half alone, and the office refuses one half of a device key
 * (src/server/lib/keyheader.ts). After the move, the page would then take that refusal for a browser that is not paired.
 *
 * So every request of this page waits, by `theHoldOnThisRequest`, while such a press is out. The press's own request,
 * `press`, is not held, and nor is the same request asked again. When the press fails or is refused, the held requests go
 * as they would have gone, and nothing is asked again or hidden. Each tab holds only its own requests: another open tab
 * shares the header half in localStorage, but not this hold.
 */
export async function aPressThatSetsTheCookieHalf<T extends { deviceHalf: string }>(
  press: RequestInit,
  send: (press: RequestInit) => Promise<T>,
): Promise<T> {
  thePressesOwnRequests.add(press)
  let done = (): void => undefined
  const out = new Promise<void>((settle) => {
    done = () => settle()
  })
  pressesOut.add(out)
  try {
    const answer = await send(press)
    keepTheDeviceHalf(answer.deviceHalf)
    return answer
  } finally {
    pressesOut.delete(out)
    done()
  }
}

/**
 * THE WAIT THAT HOLDS A REQUEST WHILE A PRESS THAT SETS THE COOKIE HALF IS OUT, or undefined when nothing holds it: no
 * such press is out, or `init` is that press's own request.
 *
 * A REQUEST NOTHING HOLDS GOES AT ONCE, with no wait at all, as it went before there was a hold. So a caller awaits the
 * answer only when it is a wait: `if (heldByAPress !== undefined) await heldByAPress`. This function is not async, and a
 * caller never awaits undefined, because either would still yield: every request would then go a turn later than its
 * caller asked for it, and a caller that looks for its fetch at once would find none.
 */
export function theHoldOnThisRequest(init?: RequestInit): Promise<void> | undefined {
  if (init !== undefined && thePressesOwnRequests.has(init)) return undefined
  if (pressesOut.size === 0) return undefined
  return untilNoPressIsOut()
}

/** Wait until no press that sets the cookie half is out, including one sent while another is out. */
async function untilNoPressIsOut(): Promise<void> {
  while (pressesOut.size > 0) await Promise.all(pressesOut)
}

/** The header half this page keeps, or null because it keeps none. */
export function theDeviceHalf(): string | null {
  try {
    const half = window.localStorage.getItem(DEVICE_HALF_KEY)
    return half === null || half === '' ? null : half
  } catch {
    return null
  }
}

/**
 * THE HEADERS OF A REQUEST THAT SENDS THE COOKIE HALF, WITH THE HEADER HALF BESIDE IT, when this page keeps one. The two
 * halves go together: one alone is refused, so a request that omits the cookie never sends the header half. A caller
 * adds it where the request's credentials are decided, and never into a name a request is shared by.
 */
export function withTheDeviceHalf(headers: Headers): Headers {
  const half = theDeviceHalf()
  if (half !== null) headers.set(DEVICE_HALF_HEADER, half)
  return headers
}
