// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW REMINDERS PASS OVER A MESSAGE THEY CANNOT READ, SAY SO IN THE LOG, AND SEND NO REMINDER IT COULD MAKE WRONG.
 *
 * Wave 13q. A message whose data is not valid JSON cannot say who sent it, who it was to, or what it is about. Before,
 * such a message stopped the flow reminders' whole pass with an error, in the idle reminder's reading of the messages
 * and in the reply reminder's. Delivered to a secretary, it stopped the pass in three readings of its broadcasts: whether
 * the person answered, whether the pause was said, and whether the reminder about a missing report was sent. Now:
 * - THE PASS FINISHES, and the reminders the message cannot change are sent.
 * - ONE LINE IN EACH PASS'S LOG says how many such messages there are, and names the first three.
 * - NO REPLY REMINDER IS SENT FOR SUCH A MESSAGE, and none for a delivery whose answer it could change. Counted as no
 *   reply, an agent's unreadable reply would send a false "a person waits for your reply". So a delivery is passed over
 *   when an unreadable message could be its reply, because it reached the person at or after the delivery, or could be
 *   the reminder already said, because it reached the agent.
 * - NO IDLE REMINDER IS SENT TO AN AGENT whose newest activity is not after such a message. Nobody can tell who sent it,
 *   so it could be any agent's newer activity, or the idle line already said.
 * - A SECRETARY THE MESSAGE WAS DELIVERED TO IS NOT PAUSED BY IT. The message could be the person's answer, so it is
 *   counted as one. Counted as none, it could pause the secretary's broadcasts and tell it, falsely, that the person
 *   answered none of them.
 * - NOR IS THE SECRETARY TOLD AGAIN THAT ITS BROADCASTS ARE PAUSED, OR THAT A REPORT IS MISSING. The message could be
 *   that line, already said, so it is counted as said. Counted as not said, it could say the line twice. This is the
 *   side the reply reminder takes: such a message can hold a line back, and never make one be said twice.
 *
 * The office, its agents and its letters are made up. Every message, hand-over and reply goes through the real doors.
 * The data is then made unreadable in the database, because no door stores data that is not JSON. Only Date moves. The
 * real watcher is started and its own tick is called, so the lines are the ones the server's log gets.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const START = new Date('2030-03-04T09:00:00Z').getTime()
const PERSON = {
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
}
let t: TestDb
let app: FastifyInstance
/** The watcher's own tick, and every line it has logged. The tick may wait, and its lines are read after it has. */
let tick: () => void | Promise<void>
const logged: string[] = []
/** Each agent's id and the session holding its handle, by handle. */
const agents = new Map<string, { id: string; session: string }>()

function at(ms: number): void { vi.setSystemTime(ms) }
async function ask(method: 'POST', url: string, payload: object, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await app.inject({ method, url, headers, payload })
  expect(reply.statusCode, reply.body).toBe(url === '/api/records' || url.endsWith('/hold') ? 201 : 200)
  return reply.json() as Record<string, any>
}
async function anAgent(handle: string): Promise<void> {
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' }, actor: t.api.HUMAN })
  await theHandleHeld(handle, (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id)
}
/** A secretary, registered at the door that gives it a schedule, holding its handle as the other agents do. */
async function aSecretary(handle: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, role: 'secretary' } })
  expect(reply.statusCode, reply.body).toBe(201)
  await theHandleHeld(handle, (reply.json() as { agent: { id: string } }).agent.id)
}
async function theHandleHeld(handle: string, id: string): Promise<void> {
  const session = (await ask('POST', '/api/records', { kind: 'session', title: 'Made-up live session', data: { state: 'running', runtime: 'claude-code' } }))['record'].id as string
  await ask('POST', `/api/handles/${handle}/hold`, { session, machine: 'made-up-machine', runtime: 'claude-code' })
  agents.set(handle, { id, session })
}
/** The person writes to the agent, and the agent's waiter takes the letter for its session. */
async function aLetterHandedTo(handle: string): Promise<string> {
  const { id: agent, session } = agents.get(handle)!
  const letter = (await ask('POST', '/api/records', {
    kind: 'message', title: 'Made-up question', data: { to: [{ kind: 'agent', id: agent }], body: 'A made-up question awaiting a reply.' },
  }))['record'].id as string
  await ask('POST', `/api/handles/${handle}/took`, { session, message: letter })
  return letter
}
/** The person writes to the agent, and nobody hands the letter over. */
async function aLetterTo(handle: string, answers: 201 | 409 = 201): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: {
    kind: 'message', title: 'Made-up question', data: { to: [{ kind: 'agent', id: agents.get(handle)!.id }], body: 'A made-up question.' },
  } })
  expect(reply.statusCode, reply.body).toBe(answers)
  return (reply.json() as Record<string, any>)['record'].id as string
}
/** The agent writes to the person, as itself. */
async function theAgentAnswers(handle: string): Promise<string> {
  return (await ask('POST', '/api/records', {
    kind: 'message', title: 'Made-up answer', data: { to: [{ kind: 'person', id: THE_PERSON }], body: 'The made-up answer.' },
  }, { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': agents.get(handle)!.session }))['record'].id as string
}
/** The secretary writes to the person, as itself, naming one of its broadcast times. */
async function aBroadcastFrom(handle: string, slot: string): Promise<void> {
  await ask('POST', '/api/records', {
    kind: 'message', title: 'Made-up broadcast', data: { to: [{ kind: 'person', id: THE_PERSON }], body: `The ${slot} broadcast: one made-up decision is needed.` },
  }, { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': agents.get(handle)!.session })
}
/** The message's data, made into text that is not JSON. */
function unreadable(id: string): string {
  const changed = t.client.sqlite.prepare("UPDATE records SET data = '{\"to\": [{\"kind\"', updated_at = ? WHERE id = ?").run(localStamp(new Date(Date.now())), id)
  expect(changed.changes).toBe(1)
  return id
}
/** The reply reminders the office has written to the agent. */
function theRemindersTo(handle: string): string[] {
  return (t.client.sqlite.prepare(
    "SELECT json_extract(data, '$.aboutMessage') AS about FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_valid(data) " +
      "AND json_extract(data, '$.notice') = 'aPersonWaitsForAReply' AND json_extract(data, '$.to[0].id') = ?",
  ).all(agents.get(handle)!.id) as { about: string }[]).map((one) => one.about)
}
/** How many idle lines the office has written to the agent. */
function theIdleLinesTo(handle: string): number {
  return (t.client.sqlite.prepare(
    "SELECT count(*) AS n FROM records r JOIN message_delivery d ON d.message_id = r.id WHERE r.kind = 'message' AND r.deleted_at IS NULL " +
      "AND json_valid(r.data) AND json_extract(r.data, '$.body') = ? AND d.recipient_kind = 'agent' AND d.recipient_id = ?",
  ).get(SYSTEM_LINES.youHaveBeenIdle('').line, agents.get(handle)!.id) as { n: number }).n
}
/** How many lines saying its broadcasts are paused the office has written to the agent. */
function thePauseLinesTo(handle: string): number {
  return (t.client.sqlite.prepare(
    "SELECT count(*) AS n FROM records r JOIN message_delivery d ON d.message_id = r.id WHERE r.kind = 'message' AND r.deleted_at IS NULL " +
      "AND json_valid(r.data) AND json_extract(r.data, '$.extra.broadcastPause') = 1 AND d.recipient_kind = 'agent' AND d.recipient_id = ?",
  ).get(agents.get(handle)!.id) as { n: number }).n
}
/** How many lines saying the report for one slot occurrence is missing the office has written to the agent. */
function theNoReportLinesTo(handle: string, occurrence: string): number {
  return (t.client.sqlite.prepare(
    "SELECT count(*) AS n FROM records r JOIN message_delivery d ON d.message_id = r.id WHERE r.kind = 'message' AND r.deleted_at IS NULL " +
      "AND json_valid(r.data) AND json_extract(r.data, '$.extra.broadcastNoReport') = ? AND d.recipient_kind = 'agent' AND d.recipient_id = ?",
  ).get(occurrence, agents.get(handle)!.id) as { n: number }).n
}
/** One tick of the watcher at this time, and the lines it logged. */
async function aTickAt(ms: number): Promise<string[]> {
  at(ms)
  const from = logged.length
  await tick()
  const lines = logged.slice(from)
  expect(lines.filter((line) => line.includes('could not finish a tick') || line.includes('reply reminder could not run'))).toEqual([])
  return lines
}
function theLinesAboutUnreadableMessages(lines: string[]): string[] {
  return lines.filter((line) => line.includes('not valid JSON'))
}

let letterToReply: string
let theUnreadableReply: string
let theUnreadableLetter: string
let letterToLater: string
let letterToOwn: string

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_REPLY_REMINDER_MINUTES', '3')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_TIMES', '07:00,18:00')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_LEAD_MINUTES', '30')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', '3')
  vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE', '')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  vi.useFakeTimers({ toFake: ['Date'], now: START })
  for (const handle of ['ur-reply', 'ur-own', 'ur-later']) await anAgent(handle)
  // REGISTERED BEFORE ANY MESSAGE IS MADE UNREADABLE, because the registration door's own reading of the messages stops at one.
  await aSecretary('ur-secretary')
  // AND ONE NO SUCH MESSAGE REACHES, which shows the reminder about a missing report is due.
  await aSecretary('ur-other-secretary')
  // THE WATCHER, started as the server starts it, with its interval caught.
  const reminders = await import('../src/server/lib/reminders.ts')
  let callback: (() => void) | undefined
  const timer = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
    callback ??= fn
    return { unref() {} } as NodeJS.Timeout
  }) as typeof setInterval)
  try { reminders.startTheReminders('default', (line) => logged.push(line)) } finally { timer.mockRestore() }
  expect(callback).toBeTypeOf('function')
  tick = callback!

  // A LETTER THE AGENT ANSWERED, WITH AN ANSWER NOBODY CAN READ.
  at(START + 10_000)
  letterToReply = await aLetterHandedTo('ur-reply')
  // A HANDED LETTER NOBODY CAN READ.
  at(START + 20_000)
  theUnreadableLetter = unreadable(await aLetterHandedTo('ur-own'))
  at(START + MINUTE)
  theUnreadableReply = unreadable(await theAgentAnswers('ur-reply'))
  // A LETTER NO UNREADABLE MESSAGE CAN BE THE ANSWER TO, handed after them, which nobody answers.
  at(START + 2 * MINUTE)
  letterToLater = await aLetterHandedTo('ur-later')
  // AND ONE TO THE AGENT THE UNREADABLE LETTER REACHED, which that letter cannot answer but could be the reminder about.
  letterToOwn = await aLetterHandedTo('ur-own')
}, 60_000)
afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
})

describe('a pass that meets messages it cannot read', () => {
  it('finishes, says how many and which in one line, and sends the reminder they cannot change', async () => {
    const lines = await aTickAt(START + 6 * MINUTE)
    const about = theLinesAboutUnreadableMessages(lines)
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('2 messages')
    expect(about[0]).toContain(`${theUnreadableLetter}, ${theUnreadableReply}`)
    expect(theRemindersTo('ur-later')).toEqual([letterToLater])
    expect(lines.some((line) => line.includes(`a reminder that a person waits for a reply: ${letterToLater}`))).toBe(true)
  })

  it('sends no reminder for the letter it cannot read', () => {
    expect(theRemindersTo('ur-own')).not.toContain(theUnreadableLetter)
  })

  it('sends no reminder to an agent the message it cannot read reached, which could be the reminder already sent', () => {
    expect(theRemindersTo('ur-own')).not.toContain(letterToOwn)
  })

  it('sends no reminder where the message it cannot read could be the answer', () => {
    expect(theRemindersTo('ur-reply')).not.toContain(letterToReply)
  })

  it('says it again in the next pass, and sends nothing more', async () => {
    const about = theLinesAboutUnreadableMessages(await aTickAt(START + 7 * MINUTE))
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('2 messages')
    expect(theRemindersTo('ur-own')).toEqual([])
    expect(theRemindersTo('ur-reply')).toEqual([])
    expect(theRemindersTo('ur-later')).toEqual([letterToLater])
  })

  it('names the first three of four, oldest first, and counts the rest', async () => {
    at(START + 8 * MINUTE)
    const third = unreadable(await aLetterTo('ur-own', 409))
    at(START + 9 * MINUTE)
    unreadable(await aLetterTo('ur-own', 409))
    const about = theLinesAboutUnreadableMessages(await aTickAt(START + 10 * MINUTE))
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('4 messages')
    expect(about[0]).toContain(`${theUnreadableLetter}, ${theUnreadableReply}, ${third} and 1 more`)
    expect(theRemindersTo('ur-own')).toEqual([])
    expect(theRemindersTo('ur-reply')).toEqual([])
  })

  it('sends no idle reminder to an agent whose newest activity it could be newer than, and sends one to an agent active after it', async () => {
    // AN AGENT WHOSE NEWEST ACTIVITY, A LETTER IT RECEIVED, IS AFTER THE NEWEST MESSAGE NOBODY CAN READ.
    at(START + 11 * MINUTE)
    await anAgent('ur-idle')
    await aLetterTo('ur-idle')
    const lines = await aTickAt(START + 11 * MINUTE + HOUR + MINUTE)
    const said = lines.filter((line) => line.startsWith('The office sent a flow reminder')).join('\n')
    expect(said.match(/idle reminder to ([^;.]*)/)?.[1]).toBe('ur-idle')
    expect(theIdleLinesTo('ur-idle')).toBe(1)
    for (const handle of ['ur-reply', 'ur-own', 'ur-later']) expect(theIdleLinesTo(handle), handle).toBe(0)
    const about = theLinesAboutUnreadableMessages(lines)
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('4 messages')
  })

  it('finishes when such a message reached a secretary, and neither reminds the secretary nor pauses its broadcasts', async () => {
    // THE SECRETARY'S THREE BROADCASTS, and a letter handed to it after them that nobody can read. Its handle is held
    // again first, because the hold taken at the start has gone quiet by now.
    at(START + 12 * MINUTE + HOUR)
    await theHandleHeld('ur-secretary', agents.get('ur-secretary')!.id)
    for (const [n, slot] of ['07:00', '18:00', '07:00'].entries()) {
      at(START + 12 * MINUTE + HOUR + (n + 1) * 1000)
      await aBroadcastFrom('ur-secretary', slot)
    }
    at(START + 13 * MINUTE + HOUR)
    unreadable(await aLetterHandedTo('ur-secretary'))
    const lines = await aTickAt(START + 17 * MINUTE + HOUR)
    const about = theLinesAboutUnreadableMessages(lines)
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('5 messages')
    expect(about[0]).toContain(`${theUnreadableLetter}, ${theUnreadableReply}, `)
    expect(about[0]).toContain(' and 2 more')
    expect(theRemindersTo('ur-secretary')).toEqual([])
    // THE THREE BROADCASTS ARE RECOGNISED, so it is the letter, taken as an answer, that keeps them from a pause.
    const { thePauseReadingFor } = await import('../src/server/lib/broadcast.ts')
    expect(thePauseReadingFor(agents.get('ur-secretary')!.id)).toMatchObject({ paused: false, broadcasts: 3, limit: 3 })
    expect(thePauseLinesTo('ur-secretary')).toBe(0)
  })

  it('finishes when the broadcasts of a secretary such a message reached are paused, and says no pause line, which it could be', async () => {
    // THREE MORE BROADCASTS, after the letter nobody can read, which is the newest answer.
    at(START + 20 * MINUTE + HOUR)
    await theHandleHeld('ur-secretary', agents.get('ur-secretary')!.id)
    for (const [n, slot] of ['18:00', '07:00', '18:00'].entries()) {
      at(START + 20 * MINUTE + HOUR + (n + 1) * 1000)
      await aBroadcastFrom('ur-secretary', slot)
    }
    const about = theLinesAboutUnreadableMessages(await aTickAt(START + 22 * MINUTE + HOUR))
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('5 messages')
    // PAUSED, so the pause line would be said, but the letter could be that line, said since the newest answer.
    const { thePauseReadingFor } = await import('../src/server/lib/broadcast.ts')
    expect(thePauseReadingFor(agents.get('ur-secretary')!.id)).toMatchObject({
      paused: true, broadcasts: 6, limit: 3, newestAnswer: localStamp(new Date(START + 13 * MINUTE + HOUR)),
    })
    expect(thePauseLinesTo('ur-secretary')).toBe(0)
  })

  it('sends no reminder about a missing report to a secretary such a message reached, which could be that reminder, and sends one to a secretary it did not reach', async () => {
    // THE NEXT LOCAL DAY'S 18:00, in whatever zone the test runs, so it is after every tick before.
    const last = new Date(START + 22 * MINUTE + HOUR)
    const slot = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1, 18, 0, 0, 0).getTime()
    // THE PERSON ANSWERS THE SECRETARY, so its broadcasts are no longer paused, and a report template is set.
    at(slot + 10 * MINUTE)
    await aLetterTo('ur-secretary', 409)
    const template = t.api.createRecord({
      workspaceId: 'default', kind: 'note', title: 'The made-up report template', data: { body: 'A made-up template.' }, actor: t.api.HUMAN,
    }).id
    vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE', template)
    vi.stubEnv('MOLE_OFFICE_BROADCAST_REPORT_LATE_MINUTES', '15')
    // 18:20, INSIDE THE WINDOW OF THE REMINDER THAT THE 18:00 REPORT IS MISSING.
    const about = theLinesAboutUnreadableMessages(await aTickAt(slot + 20 * MINUTE))
    expect(about).toHaveLength(1)
    expect(about[0]).toContain('5 messages')
    const { thePauseReadingFor } = await import('../src/server/lib/broadcast.ts')
    expect(thePauseReadingFor(agents.get('ur-secretary')!.id).paused).toBe(false)
    const occurrence = localStamp(new Date(slot)).slice(0, 16)
    expect(theNoReportLinesTo('ur-other-secretary', occurrence)).toBe(1)
    expect(theNoReportLinesTo('ur-secretary', occurrence)).toBe(0)
  })
})

