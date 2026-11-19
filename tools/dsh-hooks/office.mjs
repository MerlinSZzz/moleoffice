// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PLACE THE OFFICE'S RUN HOOKS ASK MOLE OFFICE SOMETHING: dsh's three, and the two a Claude Code run in a sandbox
 * runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `session-start.mjs`, `post-tool-use.mjs` and `stop.mjs` all have to say the same four things: who
 * this run is, where the office is, which headers every request carries, and what one message reads
 * as once it is attached. USER.md's ninth invariant says one fact is worked out in one place, so
 * the identity, the headers, the request, the envelope and the read of what is unseen live here and
 * the three scripts call them. A second copy of any of them is how the three come to disagree.
 *
 * THE SAME HOLDS FOR THE TWO CLAUDE CODE HOOKS. `claude-code-step.mjs` hands over unseen messages with the hand-over
 * dsh's PostToolUse uses, and `claude-code-stop.mjs` holds a stop by the rules dsh's `stop.mjs` follows
 * (whatHoldsTheStop and holdOrLetGo). The stop's reason gives each unseen message's block, as the hand-over does. So
 * the two runtimes hand over the same words and hold a stop for the same reasons.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A HOOK AND NOT A RUN
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here files a session, a process row or a record. A hand-over marks its messages delivered
 * through the read door and moves the groups' news read points; it never marks a message seen.
 * Reading is the recipient's own act. A hook is not a run. Attached message ids and the count of a
 * stop's holds in a row share a scratch file under the directory the hook runs in, never in the office.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOOR IT READS UNSEEN MESSAGES FROM, AND WHY THAT ONE
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/messages?only=waiting-for-me` is the office's immediate answer to "the messages
 * addressed to me that I have not marked seen". It is not the waiter's own door
 * (`GET /api/handles/<handle>/waiting`, which holds the answer up to thirty seconds); that door
 * answers only the rows still `queued`, so a message something had already handed over but nobody
 * had marked seen would be missed by it. `waiting-for-me` is the delivery mark read as it is
 * written — a delivery to this agent whose mark is not `seen` — and it carries the whole message,
 * body and sender and project, so one request answers everything the envelope needs. It is scoped
 * to the project the workspace header names, which is the project this run works in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS WHEN IT FAILS, AND WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * A hook must never stop a run by failing. A failed message read or an identity the runner did not
 * export ends with ONE sentence on stderr and nothing on stdout, so the agent goes on. A read that
 * gave nothing usable says what the office said to it (`whatTheOfficeSaid`):
 * that it did not answer only when nothing answered, and the status it answered otherwise
 * (problem Z1UaYRGkHBxa). No key is ever printed, and no message body is ever rewritten: `messageBlock` puts the
 * office's own envelope in front of the body and copies the body through untouched. Failed group
 * news is said on stderr while the messages themselves are still attached. Scratch-state failure
 * also attaches anyway, with one sentence on stderr saying the messages may be attached again,
 * because repeating them is better than losing them.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { whereIsTheApi } from '../where-is-the-api.mjs'
import { KEY_HEADER } from '../../src/config/key-header.mjs'
import { theOfficeKey } from '../../src/config/office-key.mjs'
import { theRunsKeyFromItsOfficeToolFile } from '../../src/config/run-permissions.mjs'
import { anAgentsToolHeaders, theAgentKey } from '../sandbox-common.mjs'
// THE ENVELOPE IS THE OFFICE'S OWN DECLARATION, read rather than retyped. The waiter and the run
// prompt build the same three lines from here, so a bridge that copies them cannot drift from them.
import { readAFullList } from '../a-full-list-read.mjs'
import { DELIVERY_ENVELOPE, deliveryEnvelope, theMessageAnAgentReads, theRoutedLineFor } from '../../src/shared/messages.ts'
import { THE_GROUPS_NEWS_AT_A_HAND_OVER } from '../../src/shared/group-news.ts'

/** How long one request may take before this hook gives up and lets the agent go on. */
export const REQUEST_TIMEOUT_MS = 5000

/** One word from the closed list every request to the office carries. */
const PURPOSE = 'module-work'

/**
 * The identity the runner exported, or null because one of the three was not set.
 *
 * `MOLE_OFFICE_AGENT` is the handle this run answers as, `MOLE_OFFICE_SESSION` is the session
 * record its own run is filed under, and `MOLE_OFFICE_WORKSPACE` is the project it works in. A
 * missing one is a real answer — this run was not started by the runner that exports them — and it
 * is not guessed from `.env`, because the checkout's own agent is not necessarily this run's.
 */
export function identity() {
  const handle = process.env['MOLE_OFFICE_AGENT']
  const session = process.env['MOLE_OFFICE_SESSION']
  const workspace = process.env['MOLE_OFFICE_WORKSPACE']
  if (typeof handle !== 'string' || handle === '') return null
  if (typeof session !== 'string' || session === '') return null
  if (typeof workspace !== 'string' || workspace === '') return null
  return { handle, session, workspace }
}

/**
 * Where Mole Office is. `MOLE_OFFICE_API` in the environment wins, which is the first thing
 * `whereIsTheApi` reads, and the checkout's own declaration answers when nothing set it.
 */
export function apiAddress() {
  return whereIsTheApi()
}

/**
 * The headers every request carries: which project, which agent, which session, and a key when this
 * run has one. The key is sent and never printed.
 *
 * THE AGENT'S OWN KEY FIRST. Who the request is from, and the agent's own key when MOLE_AGENT_KEY is
 * set, come from `anAgentsToolHeaders` in tools/sandbox-common.mjs, the one place every agent's tool
 * builds them. The key goes under this run's own handle.
 *
 * A CLAUDE CODE RUN'S KEY IS NOT IN ITS ENVIRONMENT, so it is read from the run's office tool configuration
 * (theRunsKeyFromItsOfficeTool, problem RJradfGfKxlq). The launcher takes MOLE_AGENT_KEY out of Claude Code's environment
 * unless the run starts runs, and the hooks run in that environment. Since the key window closed on 28 September 2026 the
 * office refuses every read a listener carries under an agent's name with no key: the unseen messages and the run's own
 * record among them. Only the participant card still answered, so a supervisor's stop was let go with its messages
 * unread, 260 times in the sandboxes' transcripts from 29 September to 4 October.
 *
 * ONLY WHEN THE AGENT HOLDS NO KEY does the office's own key go instead, when this machine has the
 * key file, as before. THIS FALLBACK GOES ONCE EACH AGENT HOLDS ITS OWN KEY.
 *
 * A SANDBOX HAS NO KEY FILE, ON PURPOSE (acceptance finding 13). The key file holds the person's key beside the office's,
 * so sandboxes/mole-office-dev no longer mounts it. A hook running there with no key of the run's sends the agent's
 * headers alone, and since the close every read it makes is refused and said as such (whatTheOfficeSaid).
 */
export function theHeaders(id, extra = {}) {
  const runsKey = theAgentKey() === null ? theRunsKeyFromItsOfficeTool(id) : null
  const named = anAgentsToolHeaders({ self: id.handle, withoutAKey: id.handle, ...(runsKey === null ? {} : { key: runsKey }) })
  const officeKey = named[KEY_HEADER] === undefined ? theOfficeKey().key : null
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': id.workspace,
    ...named,
    'x-mole-office-session': id.session,
    'x-mole-office-purpose': PURPOSE,
    ...(officeKey === null ? {} : { [KEY_HEADER]: officeKey }),
    ...extra,
  }
}

/**
 * A CLAUDE CODE RUN'S OWN KEY, from the office tool configuration its launcher wrote, or null (problem RJradfGfKxlq).
 * Read by the one reading the use line also uses (theRunsKeyFromItsOfficeToolFile, beside the code that writes the
 * file): only from a file that is this run's own, names this very agent and run, and nobody else may read or write. It
 * is read at the moment of use and never printed. A hook says nothing of why there is no key: its request then goes
 * without one, and the office's refusal is said as such (whatTheOfficeSaid).
 */
export function theRunsKeyFromItsOfficeTool(id) {
  return theRunsKeyFromItsOfficeToolFile(process.env, { agent: id.handle, session: id.session }).key
}

/**
 * One request to the office. Answers `{status, body}` or null when nothing answered at all.
 *
 * A body that will not parse is null rather than thrown: a door that answered a page of HTML where
 * JSON was expected is a door this call could not use, and the caller says so in its one sentence.
 */
export async function ask(api, path, options = {}) {
  const { method = 'GET', body, headers } = options
  try {
    const res = await fetch(`${api}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    let parsed = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    return { ok: res.ok, status: res.status, body: parsed }
  } catch {
    return null
  }
}

/** Read the event payload the bridge wrote on stdin, so the writer never blocks on a full pipe. */
export async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * THE DOOR THAT ANSWERS WHICH MESSAGES ADDRESSED TO THIS AGENT ARE UNSEEN, IN THIS PROJECT. Declared once, because the
 * hand-over and the stop's reason both read the messages from it.
 */
export const THE_UNSEEN_DOOR = '/api/messages?only=waiting-for-me'

/**
 * WHAT THE OFFICE SAID TO A READ THAT GAVE NOTHING USABLE, as the opening of a sentence (problem Z1UaYRGkHBxa). "Did not
 * answer" only when nothing answered; "answered" with the status when it answered, which is what a refusal is, as the
 * office's answer to a run's key once the run has ended. Every could-not sentence of these hooks opens with it.
 */
export function whatTheOfficeSaid(api, answer) {
  // THE HOOK'S OWN SENTENCE ABOUT A FAILED READ IS PRINTED, in brackets after what the office said. A read the hook
  // judged a fault, or one that marked messages before it failed, says so in `because`, and dropping it would print a
  // 200 as the whole story. A failure with no answer at all carries no status, only its `because`.
  const because = typeof answer?.because === 'string' && answer.because !== '' ? ` (${answer.because})` : ''
  if (answer === null || typeof answer.status !== 'number') return `Mole Office did not answer at ${api}${because}`
  if (answer.ok) return `Mole Office answered ${String(answer.status)} at ${api} with nothing this hook could read${because}`
  return `Mole Office answered ${String(answer.status)} at ${api}${because}`
}

/**
 * THE MESSAGES ADDRESSED TO THIS AGENT THAT ARE UNSEEN, as `{ messages }`, or `{ failed }` with what the office said
 * when they could not be read (null when nothing answered).
 *
 * An empty list and a failed read are different facts. The first is nothing waiting. The second is nothing known, and
 * the caller says it out loud rather than treating it as nothing waiting.
 *
 * A hand-over marks each message delivered. A plain read leaves the delivery mark as it is. Neither marks a message
 * seen. Every read here leaves the run's held messages held (leaveHeld=1), because a hook reads after each step and the
 * run's own read sends them. It asks for that only of an office that took this run's turn report, because an office that
 * holds nothing refuses the word.
 */
/** How many unseen messages one page of the hook's read asks for. The door answers a page when no `limit` is sent. */
export const UNSEEN_MESSAGES_PER_PAGE = 1000

export async function unseenMessages(api, id, markDelivered = false) {
  const leaveHeld = theRunReportsItsTurns(id) ? '&leaveHeld=1' : ''
  // THE HOOK READS THE WHOLE ENTRY: it prints the words. The path a message names stays the plain one.
  // ONE PAGE AT A TIME: the door answers a page now. The hook needs every waiting message, so it follows the door's
  // own `next`. A message that arrives between two pages moves the offsets by one, so a message already collected is
  // dropped by id. A message that leaves the list between two pages, because it was marked seen elsewhere or deleted,
  // moves the offsets the other way, so the next page skips one message. That message is not lost: it is still unseen,
  // and the next read lists it. The walk stops at an empty page, when the door names no next page, or once it has
  // collected more than the first page said matched: a page count that grew while the walk ran must not keep it walking.
  // A WALK THAT FAILS AFTER THE DOOR MARKED MESSAGES SAYS SO (line 13n): `markDelivered=1` marks each page's messages
  // delivered as that page is answered, and no door marks a set of ids delivered with the same reason after the walk.
  // A failed walk prints none of them, so its failure says how many this read marked and did not show.
  let path = `${THE_UNSEEN_DOOR}&full=1&limit=${String(UNSEEN_MESSAGES_PER_PAGE)}${leaveHeld}${markDelivered ? '&markDelivered=1' : ''}`
  const messages = []
  const collected = new Set()
  let matched = null
  let markedSoFar = 0
  const failing = (failed, because = null) => {
    const marked = markedSoFar === 0
      ? null
      : `This read marked ${String(markedSoFar)} ${markedSoFar === 1 ? 'message' : 'messages'} delivered before it failed and showed none of them; they are still unseen, so the next read lists them.`
    const said = [because, marked].filter((one) => one !== null).join(' ')
    if (said === '') return { failed }
    if (failed === null) return { failed: { ok: false, because: said } }
    return { failed: { ...failed, ...(because === null ? {} : { ok: false }), because: said } }
  }
  while (path !== null) {
    const seen = await readAFullList((one) => ask(api, one, { headers: theHeaders(id) }), path)
    if (seen === null || seen.status !== 200) return failing(seen)
    if (Array.isArray(seen.body?.markedDelivered)) markedSoFar += seen.body.markedDelivered.length
    const page = seen.body?.messages
    if (!Array.isArray(page)) return failing(seen)
    // A NARROW ANSWER IS NOT GUESSED AT: the envelope below prints each message's words, so a read that
    // arrived without them is a failed read and not a message with nothing in it.
    if (page.some((one) => one === null || typeof one !== 'object' || !('body' in one))) return failing(seen)
    // A PAGE THAT CONTRADICTS ITSELF IS A FAULT, NOT SOMETHING TO READ PAST (the coordinator, A7O8b5Zy04RX): left 0 with a
    // next page, or left above 0 with none, says the door cannot count what it is paging. The whole read fails with
    // the sentence that says which, as a failed page does.
    const left = seen.body?.left
    const namesANext = typeof seen.body?.next === 'string' && seen.body.next !== ''
    if (typeof left === 'number' && ((left === 0 && namesANext) || (left > 0 && !namesANext))) {
      const because = left === 0
        ? 'The page said left 0 and named a next page; a page that contradicts itself is a fault.'
        : 'The page said left above 0 and named no next page; a page that contradicts itself is a fault.'
      return failing(seen, because)
    }
    // A NEXT THIS HOOK CANNOT FOLLOW IS A FAULT TOO, NOT THE END OF THE LIST: the door named a page, so ending the walk
    // here would return what was collected as if it were every message. The whole read fails with the next named.
    const next = seen.body?.next
    if (typeof next === 'string' && next !== '' && !next.startsWith('GET /api/messages?')) {
      return failing(seen, `The page named a next page this hook could not follow: ${next}`)
    }
    if (matched === null && typeof seen.body?.matched === 'number') matched = seen.body.matched
    if (page.length === 0) break
    for (const one of page) {
      const idOfMessage = typeof one.id === 'string' ? one.id : null
      if (idOfMessage !== null && collected.has(idOfMessage)) continue
      if (idOfMessage !== null) collected.add(idOfMessage)
      messages.push(one)
    }
    if (matched !== null && messages.length > matched) break
    path = typeof next === 'string' && next !== '' ? next.slice(4) : null
  }
  return { messages }
}

/**
 * THE DOOR A RUN SAYS ITS TURN STARTED OR ENDED AT. Once a run has said either, Mole Office holds the messages it
 * writes in a turn and sends them together, one message to each set of readers, when the turn ends.
 */
export const THE_TURN_DOOR = '/api/drafts/turn'

/**
 * THE RUN SAYS ITS TURN STARTED OR ENDED, with the run's own key, and the scratch file remembers that it did. Answers
 * null when the office took it, or the one sentence that says it did not. Held messages the office could not send are
 * named too, since the run that wrote them was told they were held.
 *
 * A START REFUSED 403 IS NOT SAID. The office refuses a key that is not a run's own, and then sends that run's messages
 * at once, as before, and each write's own answer says it was sent (201, not 202). Nothing the run wrote waits.
 */
export async function sayTheTurn(api, id, turn, who) {
  const said = await ask(api, THE_TURN_DOOR, { method: 'POST', body: { turn }, headers: theHeaders(id) })
  if (turn === 'started' && said?.status === 403) return null
  if (said === null || said.status !== 200) {
    return turn === 'started'
      ? `${who}: ${whatTheOfficeSaid(api, said)} when this run said its turn started, so its messages are sent at once and not held.\n`
      : `${who}: ${whatTheOfficeSaid(api, said)} when this run said its turn ended, so what it held in this turn was not sent now.\n`
  }
  writeTheState({ ...readTheState(), turnsReportedBy: id.session })
  const notSent = Array.isArray(said.body?.notSent) ? said.body.notSent.map((one) => one?.draft).filter((one) => typeof one === 'string') : []
  if (notSent.length === 0) return null
  return `${who}: Mole Office could not send ${String(notSent.length)} held message(s) at the end of this turn; draft(s) ${notSent.join(', ')} say why.\n`
}

/** Whether this run has said a turn started or ended, as the scratch file remembers. */
export function theRunReportsItsTurns(id) {
  return readTheState()?.turnsReportedBy === id.session
}

/**
 * ONCE IN A RUN, WHEN THE RUN HAS NOT YET SAID IT REPORTS ITS TURNS: say its turn started. The try is remembered either
 * way, so a refusal is said once and not after every step. Answers what sayTheTurn answers, or null when it was not
 * tried.
 */
export async function sayTheTurnStartedOnce(api, id, who) {
  const kept = readTheState()
  if (kept?.turnsReportedBy === id.session || kept?.turnStartTriedBy === id.session) return null
  writeTheState({ ...kept, turnStartTriedBy: id.session })
  return sayTheTurn(api, id, 'started', who)
}

/**
 * Who sent one wire message, in the words the message pool door handed over with it (problem
 * ynGL0myEnAbi). The office reads the sender's name in its registries, and the waiter and the run
 * prompt are given the same words. Where the entry carries none, the line keeps the stored sender
 * and says the office did not name it.
 */
export function whoSentIt(message) {
  if (typeof message?.whoSentIt === 'string') return message.whoSentIt
  return DELIVERY_ENVELOPE.aSenderTheOfficeDidNotName(message?.sentBy)
}

/**
 * ONE MESSAGE AS THE AGENT READS IT: the office's envelope, a blank line, the body.
 *
 * The body is copied through exactly as the wire carried it. Nothing here trims it, wraps it or
 * paraphrases it — invariant 8 of USER.md and chapter 7.
 *
 * THE FOURTH ENVELOPE LINE SAYS SO WHEN THE OFFICE GAVE THIS AGENT THE WORDS BECAUSE THE ADDRESSEE
 * COULD NOT BE REACHED. The wire message carries the office's own `routed`
 * entries, and the one matcher decides whether this agent is one of the `to` participants. It is
 * null when this agent is the addressee.
 */
export function messageBlock(message, me) {
  const envelope = deliveryEnvelope({
    // Keep the pool door's group, as item 5 of a decision and 13n's ExgRp9L2BdPC say.
    fromGroup: message?.fromGroup ?? null,
    from: whoSentIt(message),
    // HOW THE SENDER ASKS TO BE ADDRESSED, in the words the pool door handed over, or null because the
    // sender set no part or the entry carries none: no line then.
    addressTheSender: typeof message?.howToAddressTheSender === 'string' ? message.howToAddressTheSender : null,
    inProject: typeof message?.workspaceId === 'string' ? message.workspaceId : '',
    message: typeof message?.id === 'string' ? message.id : '',
    routedLine: theRoutedLineFor(message ?? {}, me === undefined ? null : { kind: 'agent', id: me.id }),
    // WHAT THE SENDER WANTS BACK, the mark the pool door handed over, agreed in message sHx3HqS80UoV,
    // or null: the envelope adds its one sentence only for a mark that asks something.
    intent: typeof message?.intent === 'string' ? message.intent : null,
    // THE PERSON'S OWN LABEL the pool door handed over, or null: the envelope adds its word only for a label it reads.
    label: message?.label ?? null,
    // AND THE TWO INSTRUCTIONS THE OFFICE HANDED OVER FOR THEM. The hook prints what the office read from the sender's
    // row, and never works either out again from the mark.
    whatTheMarkAsks: typeof message?.whatTheMarkAsks === 'string' ? message.whatTheMarkAsks : null,
    whatTheLabelAsks: typeof message?.whatTheLabelAsks === 'string' ? message.whatTheLabelAsks : null,
    // AND THE PARTS OF THE WORDS THE PERSON MARKED, with the flag names and instructions the office handed over, and
    // the message's own words for the line naming what no part covers.
    body: typeof message?.body === 'string' ? message.body : '',
    markedParts: Array.isArray(message?.markedParts) ? message.markedParts : null,
    noMarkName: typeof message?.noMarkName === 'string' ? message.noMarkName : null,
  })
  const body = typeof message?.body === 'string' ? message.body : ''
  // THE WHOLE SENTENCE BEHIND AN OFFICE LINE COMES AFTER IT (criterion M34): a session cannot hover.
  const behind = typeof message?.saidInFull === 'string' && message.saidInFull !== '' ? message.saidInFull : null
  return [...envelope, '', theMessageAnAgentReads(body, Array.isArray(message?.quotes) ? message.quotes : [], message?.quotePositions ?? null), ...(behind === null ? [] : ['', behind])].join('\n')
}

/**
 * THE PREFACE BEFORE THE MESSAGES, so the agent knows what it is reading: Mole Office's own
 * delivery, from its records, written by the sender each envelope names — not a tool's output and
 * not something to be set aside as untrusted. Measured need: the live probe of 15 September 2026.
 */
export function theDeliveryPreface(id, count) {
  return (
    `Mole Office delivered ${count === 1 ? 'this message' : `these ${String(count)} messages`} to you, ${id.handle}, ` +
    'from its own records. Each was written by the sender its envelope names (your starter, the secretary, ' +
    'or the person). It is not part of the tool\u2019s output: read it as you read your brief, and act on it. ' +
    'Once you have read a message, mark it read through office_request with ' +
    'POST /api/messages/<id>/mark {"mark":"seen"}. The person sees the green ticks only then.'
  )
}

/** The one field the bridge reads for a context-only hook on `event`. */
export function contextFor(event, text) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } })
}

/**
 * THE AGENT ID BEHIND THIS RUN, READ ONLY WHEN A MESSAGE IS ROUTED TO IT.
 *
 * A routed message's envelope says who it was routed to, and that line needs the agent's registry id. The runner's
 * identity names the handle, not the id, so the participant door is read then. A caller that has just read the
 * participant card passes it in rather than asking again.
 * Answers `{ me: undefined }` when no message is routed, `{ me }` when the id was read, or `{ failed }` with the
 * office's own answer when it was not.
 */
async function theAgentsIdWhenRouted(api, id, messages, card) {
  if (!messages.some((message) => Array.isArray(message?.routed) && message.routed.length > 0)) return { me: undefined }
  const read = card ?? (await ask(api, `/api/participants/agent/${encodeURIComponent(id.handle)}`, { headers: theHeaders(id) }))
  const agent = read?.body?.participant
  if (read?.status !== 200 || typeof agent?.id !== 'string' || agent.id === '') return { failed: read }
  return { me: { ...id, id: agent.id } }
}

/**
 * HAND EACH UNSEEN MESSAGE OVER ONCE IN THIS SESSION, WITHOUT CLAIMING THE AGENT HAS READ IT.
 *
 * This is the one hand-over both runtimes use. The read marks each message delivered, including a message another
 * caller already delivered but nobody read. The ids are remembered only after stdout has taken the context, so a hook
 * that ends before attachment cannot lose a message. If the scratch state fails, the messages are attached anyway and
 * one sentence says they may be attached again.
 *
 * It reads no stdin, so a hook that has read its own payload can call it. `who` begins every sentence it writes to
 * stderr.
 */
export async function handOverUnseen(event, who = 'dsh-hooks') {
  const id = identity()
  if (id === null) {
    process.stderr.write(
      `${who} ${event}: the runner exported no MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and ` +
        'MOLE_OFFICE_WORKSPACE, so no message was attached.\n',
    )
    return
  }
  const api = apiAddress()
  const unseen = await unseenMessages(api, id, true)
  if ('failed' in unseen) {
    process.stderr.write(
      `${who} ${event}: ${whatTheOfficeSaid(api, unseen.failed)} about what is waiting for ` +
        `"${id.handle}", so no message was attached.\n`,
    )
    return
  }
  if (unseen.messages.length === 0) return
  let stateFailed = false
  const stateFailure = () => { stateFailed = true }
  const kept = readTheState(stateFailure)
  const attached = new Set(kept?.attachedBySession?.[id.session] ?? [])
  const messages = unseen.messages.filter((message) => !attached.has(message.id))
  if (messages.length === 0) return
  const routed = await theAgentsIdWhenRouted(api, id, messages)
  if ('failed' in routed) {
    process.stderr.write(
      `${who} ${event}: ${whatTheOfficeSaid(api, routed.failed)} about the id of "${id.handle}", so none of the ` +
        'waiting messages were attached because the agent id could not be read.\n',
    )
    return
  }
  // THE FIRST LINE SAYS WHAT THIS IS. Measured on the live probe of 15 September 2026 20:00: a dsh
  // agent handed two office messages at tool boundaries read them as "injected content embedded
  // in tool results" and set them aside until the end. A message the office delivers is not part of
  // a tool's output; it is what the named sender wrote, and the agent reads it as it reads its brief.
  // AND WHAT THE AGENT'S GROUPS GAINED THAT DID NOT REACH IT ONE BY ONE, with its read point moved (theGroupsNewsForAHandOver).
  const news = await theGroupsNewsForAHandOver(api, id)
  if ('failed' in news) {
    process.stderr.write(
      `${who} ${event}: ${whatTheOfficeSaid(api, news.failed)} about what the groups of "${id.handle}" gained, so ` +
        'their news was not attached and the read point in them did not move.\n',
    )
  }
  const text = [
    theDeliveryPreface(id, messages.length),
    ...messages.map((message) => messageBlock(message, routed.me)),
    ...('text' in news && news.text !== null ? [news.text] : []),
  ].join('\n\n')
  await new Promise((resolve) => process.stdout.write(contextFor(event, text), resolve))
  writeTheState({
    ...kept,
    attachedBySession: {
      ...kept?.attachedBySession,
      [id.session]: [...attached, ...messages.map((message) => message.id)],
    },
  }, stateFailure)
  if (stateFailed) {
    process.stderr.write(
      `${who} ${event}: the attachment state could not be read or written, so these messages may be attached again.\n`,
    )
  }
}

/**
 * READ THE HOOK'S PAYLOAD, THEN HAND OVER EACH UNSEEN MESSAGE ONCE IN THIS SESSION.
 *
 * dsh's SessionStart and PostToolUse call this. A hook that has already read its own payload, as the Claude Code step
 * hook does, calls handOverUnseen instead.
 */
export async function attachUnseen(event) {
  await readStdin()
  await handOverUnseen(event)
}

/**
 * WHAT THE AGENT'S GROUPS GAINED THAT DID NOT REACH IT ONE BY ONE, for a hand-over, with its read point in each group
 * moved to now (message RFv1V8oxkYGF; criterion GM4): `{ text }`, the door's printed text or null when no group has
 * anything left, or `{ failed }` with what the office said. A group message that @s members reaches only them, so the rest
 * learn of it here; every message with a delivery to this agent is handed over by itself, so the door leaves it out.
 */
export async function theGroupsNewsForAHandOver(api, id) {
  const read = await ask(api, THE_GROUPS_NEWS_AT_A_HAND_OVER, { headers: theHeaders(id) })
  const groups = read?.body?.summary?.groups
  if (read === null || read.status !== 200 || !Array.isArray(groups) || typeof read.body?.text !== 'string') return { failed: read }
  return { text: groups.length === 0 ? null : read.body.text }
}

/**
 * THE WORKERS THIS ONE STARTED OR WHOSE RUNS IT PARENTS, STILL IN STATE running, as `{ running }`, or `{ failed }` with what the
 * office said to the read that failed when that could not be worked out.
 *
 * ONE READ. `GET /api/handles/<handle>/running-workers?session=<session>` answers both questions at
 * once: which of the agents this handle started have a run in state running, and which child runs
 * under this session are still running. The office reads it in a few statements whatever the number
 * of workers: the registry rows of the workers, each one's record in this project, and this
 * project's running session rows through the partial index `records_session_running_idx`. A worker
 * is named when a running row is bound to its record by `ranAs`, which is the binding the profile's
 * own runs reading uses; a child is named when its `parentAttachment` is this session and nothing
 * has closed it. Each handle appears once. The office's own note says what it read.
 *
 * BEFORE THIS the hook read the whole roster, then one profile for every worker, then the children
 * of this run and one record per open child, one after another. One profile is about 2.1 seconds and
 * 1,750 statements on the live office, and one supervisor had 74 workers: the office answered nobody
 * for about 2.5 minutes at one end of turn.
 *
 * A FAILED READ IS THE HONEST ANSWER WHEN A READ FAILS. A worker whose runs could not be read might
 * be running, and answering "none running" would be a guess. The caller then allows the stop and
 * says in one sentence that it could not tell, and what the office said.
 */
export async function runningWorkers(api, id) {
  const read = await ask(
    api,
    `/api/handles/${encodeURIComponent(id.handle)}/running-workers?session=${encodeURIComponent(id.session)}`,
    { headers: theHeaders(id) },
  )
  if (read === null || read.status !== 200 || !Array.isArray(read.body?.running)) return { failed: read }
  const running = []
  for (const one of read.body.running) {
    if (one === null || typeof one !== 'object' || typeof one.handle !== 'string') return { failed: read }
    running.push({ handle: one.handle, name: typeof one.name === 'string' ? one.name : one.handle })
  }
  return { running }
}

/**
 * WHETHER THIS RUN'S OWN RECORD STILL SAYS IT RUNS, WITH NO SEAL, as `{ unfinished }`, or `{ failed }` with what the office
 * said when that could not be read (problem UbG6k-7jGLa5).
 * A one-turn session (claude -p, or dsh through run-agent.sh) that ends its turn while its run is unfinished is ended,
 * and the background work it started ends with it. A run that says `running` and has no seal is one whose agent has not
 * said it is done.
 */
export async function ownRunUnfinished(api, id) {
  const read = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, { headers: theHeaders(id) })
  if (read === null || read.status !== 200) return { failed: read }
  const data = read.body?.record?.data
  if (data === null || typeof data !== 'object') return { failed: read }
  return { unfinished: data.state === 'running' && (data.sealedTip === undefined || data.sealedTip === null) }
}

/**
 * HOW MANY TIMES IN A ROW THE SAME SIGHT MAY HOLD A STOP. Three, and chapter 9's cost is the reason: each hold is another
 * full model turn, so this is the smallest number that lets an agent read its inbox, read the reports and answer, or
 * wait for its background work and say it is done.
 */
export const HOLDS_IN_A_ROW = 3

/** The scratch file for the stop count and each session's attached ids, under the workspace the hook runs in. */
function theStateFile() {
  return join(process.cwd(), '.logs', 'dsh-hooks-stop.json')
}

/** The local memory, or null when absent; a hand-over also says when existing state could not be read. */
function readTheState(onFailure = () => {}) {
  try {
    const held = JSON.parse(readFileSync(theStateFile(), 'utf8'))
    if (held === null || typeof held !== 'object' || Array.isArray(held)) throw new Error('Invalid scratch state')
    const sessions = held.attachedBySession
    if (sessions !== undefined && (sessions === null || typeof sessions !== 'object' || Array.isArray(sessions) ||
      !Object.values(sessions).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')))) {
      throw new Error('Invalid attachment state')
    }
    return held
  } catch (error) {
    if (error?.code !== 'ENOENT') onFailure()
    return null
  }
}

/** A failed write costs the next hook its memory, never the run; a hand-over says so through its callback. */
function writeTheState(state, onFailure = () => {}) {
  try {
    mkdirSync(dirname(theStateFile()), { recursive: true })
    writeFileSync(theStateFile(), JSON.stringify(state))
  } catch {
    onFailure()
  }
}

/**
 * THE REASON A STOP IS HELD FOR UNSEEN MESSAGES: the sentence naming them, each message's block, and how to mark them
 * read. The blocks are the ones a hand-over gives, so the run reads the same words either way.
 */
function theMessageReason(messages, me) {
  const ids = messages.map((message) => message.id)
  const list = ids.join(', ')
  return (
    `There ${ids.length === 1 ? 'is' : 'are'} ${String(ids.length)} unseen ` +
    `${ids.length === 1 ? 'message' : 'messages'} addressed to you in Mole Office: ${list}.\n\n` +
    messages.map((message) => messageBlock(message, me)).join('\n\n') +
    `\n\nRead ${ids.length === 1 ? 'it' : 'them'} and mark each one read through office_request with ` +
    'POST /api/messages/<id>/mark {"mark":"seen"} before you stop.'
  )
}

/**
 * The one sentence that names the running workers and tells it what to do. IT NAMES THE DOOR, because "your inbox" read
 * as GET /api/agent/inbox finds none of a worker's messages: GET /api/handles/<handle>/waiting lists the message records
 * still queued for the supervisor, in every project.
 */
function theWorkerReason(handles, handle) {
  return (
    `These agents you started still have a run in state running: ${handles.join(', ')}. Read the messages ` +
    `waiting for you at GET /api/handles/${handle}/waiting and the workers’ reports before you stop.`
  )
}

/** The one sentence for a run whose own record says it still runs, unsealed (problem UbG6k-7jGLa5). */
function theOwnRunReason(session) {
  return (
    `Your run ${session} still says running, and it is not sealed. If work you started in the background still runs, ` +
    'wait for it before you end your turn: ending it now ends that work too. If you are done, file your report and ' +
    'say your run is finished before you stop.'
  )
}

/**
 * WHAT HOLDS THIS RUN'S STOP, AND WHY: the rules both runtimes' stop hooks follow, in one place (message
 * ro57jzXSPCR3). Read in order; the first that applies holds.
 *   - A supervisor: a message addressed to it that is unseen, then an agent it started that still has a run in state
 *     running.
 *   - Any agent, worker or supervisor: its own run still running and unsealed (problem UbG6k-7jGLa5). A one-turn session
 *     that ended its turn to wait for background work was ended with that work; this keeps it going instead.
 * Answers `{ hold: { fingerprint, reason } }`, `{ hold: null }` to let it stop, or `{ couldNotTell: sentence }` when a
 * read gave nothing usable, which lets it stop and says what the office said. `who` begins every such sentence.
 *
 * A SUPERVISOR'S READ THAT FAILED DOES NOT LET IT GO BY ITSELF (problem RJradfGfKxlq; messages GdSoXrDumLmp and
 * 1s5mFLOPSg-4). The rules after it are still read, so its own run still running holds it, and the reason names what
 * this hook could not read so the run reads it itself. Only when nothing holds is it let go, with one sentence naming
 * every read that failed.
 */
export async function whatHoldsTheStop(api, id, who) {
  const card = await ask(api, `/api/participants/agent/${encodeURIComponent(id.handle)}`, { headers: theHeaders(id) })
  if (card === null || card.status !== 200) {
    return { couldNotTell: `${who}: ${whatTheOfficeSaid(api, card)} about the card "${id.handle}" holds, so the stop was allowed.\n` }
  }
  /** The reads that gave nothing usable: what the office said and about what, and for a hold's reason what to read and where. */
  const unread = []
  if (card.body?.participant?.roleReadAs === 'supervisor') {
    // THE READ MARKS EACH MESSAGE DELIVERED, as a hand-over does, and never seen: reading is the recipient's own act.
    const unseen = await unseenMessages(api, id, true)
    if ('failed' in unseen) {
      unread.push({
        said: whatTheOfficeSaid(api, unseen.failed),
        about: `what is waiting for "${id.handle}"`,
        what: 'what is waiting for you',
        where: `read it yourself at GET ${THE_UNSEEN_DOOR}&full=1`,
      })
    } else if (unseen.messages.length > 0) {
      const routed = await theAgentsIdWhenRouted(api, id, unseen.messages, card)
      if ('failed' in routed) {
        unread.push({
          said: whatTheOfficeSaid(api, routed.failed),
          about: `the id behind a routed message addressed to "${id.handle}"`,
          what: 'the id behind a routed message',
          where: `read the message yourself at GET ${THE_UNSEEN_DOOR}&full=1`,
        })
      } else {
        const ids = unseen.messages.map((message) => message.id)
        return {
          hold: {
            fingerprint: `messages:${[...ids].sort().join(',')}`,
            reason: theMessageReason(unseen.messages, routed.me),
          },
        }
      }
    }
    const workers = await runningWorkers(api, id)
    if ('failed' in workers) {
      unread.push({
        said: whatTheOfficeSaid(api, workers.failed),
        about: `the agents "${id.handle}" started`,
        what: 'which agents you started still run',
        where: `read your workers’ reports and GET /api/handles/${id.handle}/waiting yourself`,
      })
    } else if (workers.running.length > 0) {
      const handles = workers.running.map((worker) => worker.handle)
      return {
        hold: { fingerprint: `workers:${[...handles].sort().join(',')}`, reason: theWorkerReason(handles, id.handle) + whatThisHookCouldNotRead(unread) },
      }
    }
  }
  const own = await ownRunUnfinished(api, id)
  if ('failed' in own) {
    unread.push({ said: whatTheOfficeSaid(api, own.failed), about: `run ${id.session}` })
    return { couldNotTell: theStopWasAllowedUnread(who, unread) }
  }
  if (own.unfinished) {
    return { hold: { fingerprint: `own-run:${id.session}`, reason: theOwnRunReason(id.session) + whatThisHookCouldNotRead(unread) } }
  }
  return unread.length > 0 ? { couldNotTell: theStopWasAllowedUnread(who, unread) } : { hold: null }
}

/** What a hold's reason adds for each read this hook could not make, so the run reads it itself before it stops. */
function whatThisHookCouldNotRead(unread) {
  return unread.map((one) => ` This hook could not read ${one.what} (${one.said}): ${one.where} before you stop.`).join('')
}

/** The one sentence for a stop let go because a read failed and nothing else held it: every read that failed, in order. */
function theStopWasAllowedUnread(who, unread) {
  return `${who}: ${unread.map((one) => `${one.said} about ${one.about}`).join('; ')}, so the stop was allowed.\n`
}

/**
 * THE SENTENCE FOR A STOP THE CAP LET GO (message GdSoXrDumLmp): the same sight had held it HOLDS_IN_A_ROW times in
 * a row, so this time it was allowed, and the run's stderr says so. The fingerprint names the sight, never a key.
 */
export function theCapLetItGo(who, hold) {
  return `${who}: the same reason had held this stop ${String(HOLDS_IN_A_ROW)} times in a row (${hold.fingerprint}), so the stop was allowed.\n`
}

/**
 * HOLD, UNLESS THE SAME SIGHT HAS ALREADY HELD HOLDS_IN_A_ROW TIMES: the hold is Claude Code's and the dsh bridge's "go on
 * with a reason", `{"decision":"block","reason":…}` on stdout. A new sight, or a fresh run, starts the count again.
 * Answers whether it held.
 */
export function holdOrLetGo(id, hold) {
  const kept = readTheState()
  const sameRun = kept !== null && kept.session === id.session
  const held = sameRun && kept.fingerprint === hold.fingerprint ? Number(kept.held) + 1 : 1
  if (!Number.isFinite(held) || held > HOLDS_IN_A_ROW) return false
  writeTheState({ ...kept, session: id.session, fingerprint: hold.fingerprint, held })
  process.stdout.write(JSON.stringify({ decision: 'block', reason: hold.reason }))
  return true
}
