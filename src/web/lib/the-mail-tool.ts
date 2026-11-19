// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL'S DOORS, AS THE PERSON'S SETTINGS PAGE ASKS THEM (the plan
 * 9y8_m1dheYm_). The mail tool (tools/mail-the-summonses.mjs) keeps the
 * person's list of addresses and which account it sends from, and answers on 127.0.0.1 on this computer. This page asks
 * it directly, so no address passes through the office
 * . Where it answers, and its secret, come from the person's own door on the office
 * (GET /api/office/mail-tool, `page`), which hands them out to the person alone.
 *
 * THE SECRET RIDES IN A HEADER, never the address, and no cookie is sent. The tool answers a page of the office's own
 * origin alone.
 *
 * THE TOOL ANSWERS ONLY ON THE COMPUTER IT RUNS ON: 127.0.0.1 is this computer to the browser, so a page opened from
 * another device reaches nothing there. `onTheToolsComputer` says which it is, so the panel can say so instead of
 * failing. On this computer the office serves Settings from 127.0.0.1, so the page and the tool are both on its
 * loopback addresses, which the browser lets ask each other; a page from any other address would need the browser's
 * local-network permission, and the panel does not try.
 */

import { THE_SECRET_HEADER, whereTheToolIs, type WhereTheToolIs } from '@shared/the-mail-tool.ts'
export { THE_SECRET_HEADER, whereTheToolIs, type WhereTheToolIs }

/** Whether this page is open on the computer the tool runs on, where 127.0.0.1 reaches it. */
export function onTheToolsComputer(hostname: string = window.location.hostname): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
}

/** Why an account cannot send, as the tool says it. */
export type WhyItCannotSend = 'no address' | 'no mail server' | 'asks a password' | 'not encrypted' | 'log in again'

/** Why a send did not happen, as the tool says it. */
export type WhyNotSent = 'no account' | 'pick one' | 'login refused' | 'server not reached' | 'account or token'

/** One letter of a test, and what became of it. */
export interface ALetter {
  to: string
  outcome: 'sent' | 'refused' | 'later'
}

/** The tool as GET /state answers it: data and codes, which this page words. */
export interface TheToolsState {
  reading: 'works' | 'refused' | 'none' | 'unknown'
  officeAnswers: boolean
  roundAt: string | null
  lastMailed: { title: string; at: string } | null
  accounts: {
    usable: { id: string; address: string; provider: string }[]
    unusable: { name: string; provider: string; reason: WhyItCannotSend }[]
  } | null
  sender:
    | { account: { id: string; address: string; provider: string }; reason: null; count: number }
    | { account: null; reason: 'no account' | 'pick one'; count: number }
    | null
  addresses: string[]
  mostAddresses: number
  lastSend: { at: string; reason: WhyNotSent | null } | null
  lastTest: { at: string; outcome: 'sent' | 'not sent' | 'empty list'; reason: WhyNotSent | null; letters: ALetter[] } | null
  /** What the office, the account reader and the mail server said, in their own English, for developer mode. */
  details: {
    key: string
    office: string
    accounts: string
    server: string
    lastSend: string
    lastTest: string
    letters: { to: string; says: string }[]
    events: string[]
  }
}

/** What saving the list came to. */
export type AddressesDone =
  | { saved: true; addresses: string[] }
  | { saved: false; reason: 'not an address'; which: string }
  | { saved: false; reason: 'too many'; count: number; most: number }

/** A door that refused, or a tool that did not answer: `refused` is the tool's code, null when nothing answered. */
export class TheToolDidNotAnswer extends Error {
  constructor(
    readonly status: number | null,
    readonly refused: string | null,
    says: string,
  ) {
    super(says === '' ? 'the mail tool did not answer' : says)
  }
}

async function ask<T>(where: WhereTheToolIs, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${where.origin}${path}`, {
      method,
      headers: { [THE_SECRET_HEADER]: where.secret, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
  } catch (err) {
    throw new TheToolDidNotAnswer(null, null, err instanceof Error ? err.message : String(err))
  }
  const answer = (await response.json().catch(() => null)) as { refused?: unknown; says?: unknown } | null
  if (!response.ok) {
    throw new TheToolDidNotAnswer(
      response.status,
      typeof answer?.refused === 'string' ? answer.refused : null,
      typeof answer?.says === 'string' ? answer.says : '',
    )
  }
  return answer as T
}

/** The tool's four doors. */
export const theTool = {
  state: (where: WhereTheToolIs) => ask<TheToolsState>(where, 'GET', '/state'),
  saveTheAddresses: (where: WhereTheToolIs, typed: string) =>
    ask<{ done: AddressesDone; state: TheToolsState }>(where, 'POST', '/addresses', { addresses: typed }),
  pickTheAccount: (where: WhereTheToolIs, id: string) =>
    ask<{ done: { picked: boolean }; state: TheToolsState }>(where, 'POST', '/account', { id }),
  sendATest: (where: WhereTheToolIs) => ask<{ done: { tested: boolean }; state: TheToolsState }>(where, 'POST', '/test', {}),
}
