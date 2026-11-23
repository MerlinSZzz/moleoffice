// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY PAGE'S DOORS, AND THE ONE WAY IT OPENS A SIGN-IN'S ADDRESS. Wave 13u, round 242.
 *
 * The key page (pages/SetUpAToolPage.tsx) asks four doors of src/server/api/terminal-harnesses.ts: whether the tool is
 * signed in, the key, the sign-in, and the sign-in's code. The key and the code go in the request's body and nowhere
 * else: never in an address, a header or a log. moleOfficeRequest writes down only a request's path.
 */

import type { SignedIn, SignInCodeGiven, SignInStarted } from '@shared/harnesses.ts'
import { moleOfficeRequest } from '../api.ts'
import { theBridge, whereAWebPageOpens } from './web-page.ts'

/** What the signed-in door answers: the tool's own status, and whether a sign-in the office started for it is running. */
export interface TheSignedInReading {
  harness: string
  signedIn: SignedIn
  signingIn: boolean
}

/** What the key door answers once the tool's own login has read the key. */
export interface TheKeyGiven {
  harness: string
  provider: string | null
  signedIn: SignedIn
}

const asJson = { 'content-type': 'application/json' }

/** Whether one tool is signed in, as its own status command says. Not installed is one of its answers. */
export function theSignedInReading(tool: string): Promise<TheSignedInReading> {
  return moleOfficeRequest<TheSignedInReading>(`/api/harnesses/${encodeURIComponent(tool)}/signed-in`)
}

/** Give the key the person typed to the tool's own login. The caller drops the key as soon as this is called. */
export function giveTheKey(tool: string, provider: string | null, key: string): Promise<TheKeyGiven> {
  return moleOfficeRequest<TheKeyGiven>(`/api/harnesses/${encodeURIComponent(tool)}/key`, {
    method: 'POST',
    headers: asJson,
    body: JSON.stringify(provider === null ? { key } : { provider, key }),
  })
}

/** Start the tool's own account sign-in. A second press while one is running answers that one. */
export function startTheSignIn(tool: string): Promise<SignInStarted> {
  return moleOfficeRequest<SignInStarted>(`/api/harnesses/${encodeURIComponent(tool)}/sign-in`, { method: 'POST' })
}

/** Give the sign-in the press started the code its sign-in page showed the person, once. */
export function giveTheSignInItsCode(tool: string, signIn: string, code: string): Promise<SignInCodeGiven> {
  return moleOfficeRequest<SignInCodeGiven>(`/api/harnesses/${encodeURIComponent(tool)}/sign-in/code`, {
    method: 'POST',
    headers: asJson,
    body: JSON.stringify({ signIn, code }),
  })
}

/**
 * OPEN A SIGN-IN'S ADDRESS, and say whether it opened. In the desktop app the bridge asks the system's browser, which
 * opens only an https address (src/desktop/the-web-page.mjs). In a browser it opens in a new tab, and the new tab is
 * given no way back to this page. A browser that blocked the tab answers null, and that is a failure, not an open.
 * The window with no bridge opens nothing.
 */
export async function openTheSignInAddress(address: string): Promise<boolean> {
  const where = whereAWebPageOpens()
  if (where === 'no bridge') return false
  if (where === 'the window') return (await theBridge()?.openHttpsOutside(address)) === true
  const tab = window.open(address, '_blank')
  if (tab === null) return false
  tab.opener = null
  return true
}
