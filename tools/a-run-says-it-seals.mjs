#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DOES A RUN SAY IT SEALS? The one copy of the rule the secretary's seal-wait used as a shell grep (kGtBA49SnhLf, 9 November
 * 2026; run A). The launcher's finish asks it before it seals a run on its command's clean exit (tools/sandbox-start.mjs,
 * "6. seal it on exit"), and anybody can ask it from a shell:
 *
 *   node tools/a-run-says-it-seals.mjs <run id> [--api <address>]     prints seals | holds | silent, and the message it read
 *
 * WHICH MESSAGE IS READ: the newest one created since the run began, sent by the agent the run serves, with the run's
 * starter among its recipients. No such message reads as silent: a run that said nothing has not said it seals.
 *
 * WHAT IT SAYS, in this order (case does not matter):
 * - HOLDS, whatever else it says, when it says it does not seal: "I do not seal", "I don't seal", "I am not sealing", "do NOT
 *   seal this / run / round". The list is narrow on purpose: "If main has moved, I will not seal" is a condition beside a
 *   seal, not a hold (9 October 2026).
 * - SEALS when it says so: "seal next / now / last", "sealing next ...", "I seal", "will seal", "sealing", "I am / I'm / we are
 *   done", "that I am done", "round <id> is done", "round <id> (<words>) is done", "seal of <commit> follows".
 * - SILENT otherwise.
 * The patterns are the secretary's own, as its grep held them, so the two never differ.
 */

import { fetchAFullList } from './a-full-list-read.mjs'

export const HOLDS = /I do not seal|I don.t seal|I am not sealing|do NOT seal (this|run|round)/i
export const SEALS =
  /seal(ing)? (next|now|last)|I seal|will seal|sealing|(I am|I.m|we are) done|that I am done|round [0-9a-z]+ is done|round [0-9a-z]+ \([^)]{1,40}\) is done|seal of [0-9a-f]{7,40} follows/i

/** 'holds' | 'seals' | 'silent' for one message's words (its title and its body, read together). */
export function whatItSays(words) {
  if (typeof words !== 'string' || words.trim() === '') return 'silent'
  if (HOLDS.test(words)) return 'holds'
  return SEALS.test(words) ? 'seals' : 'silent'
}

/**
 * THE RUN'S LAST WORD TO ITS STARTER, from the messages the run's agent sent (as the message pool answers them): the newest one
 * sent at or after `since` (its sentAt), sent by one of `agentIds`, with one of `starterIds` among its recipients; null when there is none.
 * Times are compared as the office writes them, its own local wall-clock stamps ('YYYY-MM-DD HH:MM:SS', or the same with a T),
 * which sort as text when both come from that one office.
 * MESSAGES OF ONE SECOND are told apart by the pool's own order, which is newest moment first and then the order the rows
 * were stored (NEWEST_FIRST in src/server/lib/messages.ts): of two sent in the same second, the later in the list was
 * stored later, so it is the last word. "I seal next." followed in that second by "Not done" reads as not done.
 */
export function theLastWordToTheStarter(messages, { agentIds, starterIds, since }) {
  const from = new Set(agentIds.filter((one) => typeof one === 'string' && one !== ''))
  const to = new Set(starterIds.filter((one) => typeof one === 'string' && one !== ''))
  const at = (one) => String(one?.sentAt ?? one?.createdAt ?? '').replace('T', ' ')
  const after = typeof since === 'string' ? since.replace('T', ' ') : ''
  const kept = (Array.isArray(messages) ? messages : [])
    .map((one, place) => ({ one, place }))
    .filter(({ one }) => from.has(one?.sentBy?.id) && Array.isArray(one?.to) && one.to.some((who) => to.has(who?.id)) && at(one) >= after)
  kept.sort((a, b) => (at(a.one) < at(b.one) ? 1 : at(a.one) > at(b.one) ? -1 : b.place - a.place))
  return kept[0]?.one ?? null
}

/**
 * THE MESSAGES THE RUN'S AGENT SENT, READ PAGE BY PAGE UNTIL THE LAST WORD IS KNOWN (10 November 2026). One page of the newest
 * 50 was read before: a run whose agent had sent 50 messages since its word, to anybody, read as silent. The pool answers
 * newest first and names the next page as its request, 'GET /api/messages?…&offset=<n>' (?sender=, &limit=, `next`). Reading stops at the first page whose
 * oldest message is older than the run's start, or older than the last word found so far: a message of the same second on the
 * next page was stored later, so it could still be the last word. `readAPage(path)` answers a page's body or throws.
 * { messages, complete: true }, or { messages, complete: false, why } when PAGES_AT_MOST pages did not settle it.
 */
export const A_PAGE_OF_MESSAGES = 100
export const PAGES_AT_MOST = 10
export async function theAgentsMessagesSince(readAPage, record, starterIds) {
  const data = record?.data ?? {}
  const agent = data.servingAgentId ?? data.servingAgent
  const agentIds = [data.servingAgentId, data.servingAgent].filter((one) => typeof one === 'string')
  const since = (typeof data.startedAt === 'string' ? data.startedAt : typeof record?.createdAt === 'string' ? record.createdAt : '').replace('T', ' ')
  const at = (one) => String(one?.sentAt ?? one?.createdAt ?? '').replace('T', ' ')
  const messages = []
  let path = `/api/messages?sender=${encodeURIComponent(`agent:${agent}`)}&limit=${String(A_PAGE_OF_MESSAGES)}&full=1`
  for (let pages = 0; pages < PAGES_AT_MOST; pages += 1) {
    const page = await readAPage(path)
    const these = page?.messages ?? page?.page ?? []
    messages.push(...these)
    const oldest = these.at(-1)
    const word = theLastWordToTheStarter(messages, { agentIds, starterIds, since })
    if (these.length === 0 || at(oldest) < since || (word !== null && at(oldest) < at(word)) || typeof page?.next !== 'string') return { messages, complete: true }
    // THE POOL NAMES THE NEXT PAGE AS ITS REQUEST, 'GET /api/messages?…' (theNextPage in src/server/api/messages.ts), not as a
    // path: the method is taken off, and only a request of the same door is followed (the inspector, vynMLPwuEjnE).
    path = page.next.replace(/^GET\s+/, '')
    if (!path.startsWith('/api/messages?')) return { messages, complete: false, why: `the pool named its next page as ${JSON.stringify(page.next)}, which is not a request of GET /api/messages` }
  }
  return { messages, complete: false, why: `its agent sent more than ${String(PAGES_AT_MOST * A_PAGE_OF_MESSAGES)} messages since the run began, and its last word to its starter is not among the newest of them` }
}

/** What the run says, from its record, the messages its agent sent, and its starter's ids: { says, message }. */
export function whatTheRunSays(record, messages, starterIds) {
  const data = record?.data ?? {}
  const agentIds = [data.servingAgentId, data.servingAgent].filter((one) => typeof one === 'string')
  const since = typeof data.startedAt === 'string' ? data.startedAt : typeof record?.createdAt === 'string' ? record.createdAt : ''
  const message = theLastWordToTheStarter(messages, { agentIds, starterIds, since })
  return { says: message === null ? 'silent' : whatItSays(`${message.title ?? ''}\n${message.body ?? ''}`), message: message?.id ?? null }
}

// THE COMMAND LINE: read the run, its agent's messages and its starter's ids (from the session that started it) from the office, as the caller. The address and the
// workspace come from src/config/settings.mjs (tools/where-is-the-api.mjs), and the caller's name and key from
// for-agents/agent-key.mjs, the one place a tool builds them (tests/one-configuration-source.test.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const run = args.find((one) => !one.startsWith('--'))
  const { whereIsTheApi } = await import('./where-is-the-api.mjs')
  const { readSettingHere } = await import('../src/config/settings.mjs')
  const { anAgentsToolHeaders } = await import('../for-agents/agent-key.mjs')
  const api = whereIsTheApi(args.includes('--api') ? args[args.indexOf('--api') + 1] : undefined)
  if (!run) {
    console.error('Usage: node tools/a-run-says-it-seals.mjs <run id> [--api <address>]')
    process.exit(2)
  }
  const me = readSettingHere('MOLE_OFFICE_AGENT').value
  const workspace = readSettingHere('MOLE_OFFICE_WORKSPACE').value
  const headers = { ...anAgentsToolHeaders({ self: me }), ...(typeof workspace === 'string' && workspace !== '' ? { 'x-mole-office-workspace': workspace } : {}) }
  const get = async (path) => {
    // THE POOL'S WORDS ARE ASKED FOR BY NAME; an older office's 400 is retried without the word.
    const answer = await fetchAFullList(fetch, `${api}${path}`, { headers })
    if (!answer.ok) throw new Error(`GET ${path} answered ${answer.status}`)
    return answer.json()
  }
  try {
    const record = (await get(`/api/records/${encodeURIComponent(run)}`)).record
    const agent = record?.data?.servingAgentId ?? record?.data?.servingAgent
    // A RUN THAT NAMES NO AGENT IT SERVES cannot be answered for: no message can be its last word (the inspector, eB1A_TQHPBWu).
    if (typeof agent !== 'string' || agent === '') throw new Error(`run ${run} names no agent it serves`)
    // ITS STARTER IS THE AGENT ITS STARTING SESSION SERVES, never whoever asks (10 November 2026): a run's message to the
    // caller was read as its word to its starter when the caller was somebody else, an inspector or a secretary.
    const parent = typeof record?.data?.parentAttachment === 'string' ? (await get(`/api/records/${encodeURIComponent(record.data.parentAttachment)}`)).record : null
    const starterIds = [parent?.data?.servingAgentId, parent?.data?.servingAgent].filter((one) => typeof one === 'string' && one !== '')
    if (starterIds.length === 0) throw new Error(`run ${run} names no session that started it with an agent it serves, so it has no starter to have spoken to`)
    const read = await theAgentsMessagesSince(get, record, starterIds)
    if (!read.complete) throw new Error(read.why)
    const said = whatTheRunSays(record, read.messages, starterIds)
    console.log(`${said.says}${said.message === null ? '' : ` (message ${said.message})`}`)
  } catch (why) {
    console.error(`It could not be read: ${why instanceof Error ? why.message : String(why)}`)
    process.exit(1)
  }
}
