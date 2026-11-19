// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SENDING A REPORT'S ANSWERS ASKS THE LIST, after the person and before its old refusal. The card keeps the door.
 * A choice remains recorded as the person's decision while the grant, sender and chooser
 * name what the secretary actually did. A secretary's words never become the person's own words.
 *
 * REAL: a scratch office in process, real routes, made-up agents, a real grant and the person's answers to the list.
 * Only the old-draft fixture removes a chooser directly, to represent data written before choosers were stored.
 * No migration, model call or live office. Refusals leave answers, decisions, messages and both ledgers unchanged.
 *
 * MUTATIONS RUN ALONE AND RESTORED, 23 October 2026, after the green control and green implementation:
 *   1. Sending asks the person alone again (false): kept; may-press, the person chose; the decision write also asks
 *      the list; may-press, the secretary chose; the person's own words; and the button and fill-in case went red.
 *   2. A decision sent under the grant cites the report: may-press, the person chose; the decision write also asks
 *      the list; and may-press, the secretary chose went red on authority_reference.
 *   3. The draft stores no chooser: may-press, the person chose; may-press, the secretary chose; the person sends
 *      what the secretary chose; and the button and fill-in case went red.
 *   4. A send under the grant stores the person as sender: may-press, the person chose; may-press, the secretary
 *      chose; and the person's own words case went red on their stored-sender assertions.
 *   5. The message's first line says the person answered: may-press, the person chose went red on the message.
 * All five runs exited 1; the restored run exited 0 with all nine cases green. The reader also excludes a send
 * marked underTheGrant, so a corrupt by alone cannot make that send count as the person's own words.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ReportAnswers } from '../src/shared/answers.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'answer-granted-secretary'
const UNRAISED = 'answer-unraised-secretary'
const WRITER = 'answer-report-writer'
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
let t: TestDb
let app: FastifyInstance
let grant = ''
let whoseRecordsAreThese: typeof import('../src/server/lib/the-persons-own-words.ts').whoseRecordsAreThese
const answered = new Set<string>()
const as = (handle: string): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle)! })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers = PERSON, payload?: unknown): Promise<{ status: number; body: any }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: reply.statusCode, body: reply.json() }
}
async function answer(door: string, value: 'kept' | 'may-press' | 'default'): Promise<void> {
  const reply = await call('POST', '/api/office/what-the-grant-carries', PERSON, { changes: [{ door, answer: value }] })
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  answered.add(door)
}
const data = (id: string): Record<string, unknown> => t.api.getRecord(id)!.data
const answers = (id: string): ReportAnswers => data(id)['answers'] as ReportAnswers
const all = (sql: string, ...args: unknown[]) => t.client.sqlite.prepare(sql).all(...args)
const last = (table: string): number => (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n
const snapshot = (id: string) => JSON.stringify({ answers: answers(id), records: all("SELECT id, data FROM records WHERE kind IN ('decision', 'message') ORDER BY id"), changes: last('changes'), presses: last('presses_for_the_person') })
async function report(): Promise<string> {
  const reply = await call('POST', '/api/records', as(WRITER), { kind: 'report', title: 'Questions for a made-up batch', data: {
    for: 'the person', date: '2026-10-23', blocks: [
      { id: 'choice', type: 'choice', question: 'Which finish?', options: [{ id: 'a', label: 'Matt' }, { id: 'b', label: 'Gloss' }] },
      { id: 'note', type: 'fillin', asks: 'Anything else?' },
      { id: 'button', type: 'button', label: 'Start the batch', confirm: 'Start it?' },
    ],
  } })
  expect(reply.status, JSON.stringify(reply.body)).toBe(201)
  return String(reply.body.record.id)
}
async function keep(id: string, who = PERSON): Promise<void> {
  const reply = await call('PUT', `/api/records/${id}/answers/choice`, who, { answer: { chosen: ['a'], words: 'Keep the finish plain.' }, ...(who === PERSON ? {} : FOR_THE_PERSON) })
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
}
const send = (id: string, who = as(RAISED), press: object = { scope: 'report' }) => call('POST', `/api/records/${id}/answers/send`, who, { press, ...(who === PERSON ? {} : FOR_THE_PERSON) })
function sentReply(reply: Awaited<ReturnType<typeof send>>): void { expect(reply.status, JSON.stringify(reply.body)).toBe(201) }
function message(reply: Awaited<ReturnType<typeof send>>): string { return String(data(String(reply.body.messages[0].id))['body']) }
function choiceDecision(reply: Awaited<ReturnType<typeof send>>): Record<string, unknown> { return data(String(reply.body.decisions[0])) }
function senderIsTheSecretary(id: string): void {
  expect(answers(id)['choice']!.sent).toMatchObject({ by: ids.get(RAISED), underTheGrant: grant })
  expect(answers(id)['choice']!.sent!.by).not.toBe(RAISED)
  expect(answers(id)['choice']!.sent!.by).not.toBe(THE_PERSON)
}
async function refused(id: string, who: string, words: string): Promise<Awaited<ReturnType<typeof send>>> {
  const before = snapshot(id)
  const reply = await send(id, as(who))
  expect(reply.status, JSON.stringify(reply.body)).toBe(403)
  expect(reply.body.error).toContain(words)
  expect(snapshot(id)).toBe(before)
  return reply
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  whoseRecordsAreThese = (await import('../src/server/lib/the-persons-own-words.ts')).whoseRecordsAreThese
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WRITER, 'worker']] as const) {
    const reply = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(reply.status, JSON.stringify(reply.body)).toBe(201)
    keys.set(handle, String(reply.body.whatToGiveIt.key))
    ids.set(handle, String(reply.body.agent.id))
  }
  const reply = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A synthetic grant for sending answers.' })
  expect(reply.status, JSON.stringify(reply.body)).toBe(201)
  grant = String(reply.body.elevation.id)
}, 60_000)
afterEach(async () => {
  for (const door of answered) await answer(door, 'default')
  answered.clear()
})
afterAll(async () => { await app?.close(); t?.close() })

describe('sending a report’s answers asks the list', () => {
  it('no grant: keeps its old refusal even with may-press, and writes nothing', async () => {
    const id = await report(); await keep(id); await answer('answer.send', 'may-press')
    const reply = await refused(id, UNRAISED, "Sending the answers to a report is the person's own act")
    expect(reply.body.code).toBe('answerNotThePerson')
  })
  it('kept: the card and this office each refuse in the check’s words and write nothing', async () => {
    const id = await report(); await keep(id)
    await refused(id, RAISED, 'The secretary card keeps answer.send for the person')
    await answer('answer.send', 'kept')
    await refused(id, RAISED, "This office's list of what the grant carries, since")
  })
  it('may-press, the person chose: cites the grant, keeps the report link and names sender and chooser', async () => {
    const id = await report(); await keep(id); await answer('answer.send', 'may-press')
    const mark = last('presses_for_the_person')
    const reply = await send(id); sentReply(reply)
    expect(choiceDecision(reply)).toMatchObject({ decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: grant })
    const decision = String(reply.body.decisions[0])
    expect(all('SELECT type, to_id FROM links WHERE from_id = ?', decision)).toContainEqual({ type: 'derived_from', to_id: id })
    for (const table of ['changes', 'revisions']) {
      const rows = all(`SELECT actor_type, actor_id, elevation FROM ${table} WHERE record_id = ?`, decision) as { actor_type: string; actor_id: string; elevation: string }[]
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row).toMatchObject({ actor_type: 'agent', actor_id: RAISED })
        expect(JSON.parse(row.elevation)).toMatchObject({ id: grant })
      }
    }
    senderIsTheSecretary(id)
    expect(answers(id)['choice']!.sent!.chosenBy).toEqual({ kind: 'person', id: THE_PERSON })
    const body = message(reply)
    expect(body.split('\n')[0]).toContain(`The secretary ${ids.get(RAISED)}`)
    expect(body.split('\n')[0]).toContain(`under the person's grant ${grant}`)
    expect(body.split('\n')[0]).not.toContain('The person answered')
    expect(body).toContain('Chosen by the person')
    expect(body).toContain('In their own words: Keep the finish plain.')
    expect(body).toContain("Recorded as the person's decision")
    expect(all('SELECT agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ?', mark)).toEqual([
      { agent_id: RAISED, grant_id: grant, operation: 'answer.send', reason: A_TESTS_REASON_FOR_THE_PERSON },
    ])
  })
  it('the decision write also asks the list for record:decision before its stricter guard', async () => {
    const id = await report(); await keep(id); await answer('answer.send', 'may-press'); await answer('record:decision', 'kept')
    await refused(id, RAISED, 'keeps writing a decision for the person')
    await answer('record:decision', 'may-press')
    const reply = await send(id); sentReply(reply)
    // The grant is not the person's own words. Success citing it proves the stricter guard was not reached.
    expect(choiceDecision(reply)['authority_reference']).toBe(grant)
    expect(whoseRecordsAreThese([grant]).get(grant)?.own).toBe(false)
  })
  it('may-press, the secretary chose: draft, sent answer, decision and message name its words', async () => {
    const id = await report(); await answer('answer.keep', 'may-press'); await answer('answer.send', 'may-press')
    await keep(id, as(RAISED))
    expect(answers(id)['choice']!.draft!.chosenBy).toEqual({ kind: 'agent', id: ids.get(RAISED) })
    const reply = await send(id); sentReply(reply); senderIsTheSecretary(id)
    expect(answers(id)['choice']!.sent!.chosenBy).toEqual({ kind: 'agent', id: ids.get(RAISED) })
    expect(choiceDecision(reply)['option_taken']).toContain(`in the secretary ${ids.get(RAISED)}'s own words: Keep the finish plain.`)
    expect(message(reply)).toContain(`Chosen by the secretary ${ids.get(RAISED)}`)
    expect(message(reply)).toContain(`In the secretary ${ids.get(RAISED)}'s own words: Keep the finish plain.`)
    expect(message(reply)).not.toContain('In their own words:')
    expect(choiceDecision(reply)).toMatchObject({ decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: grant })
  })
  it('the person sends what the secretary chose: preserves both participants', async () => {
    const id = await report(); await answer('answer.keep', 'may-press'); await keep(id, as(RAISED))
    const reply = await send(id, PERSON); sentReply(reply)
    expect(answers(id)['choice']!.sent).toMatchObject({ by: THE_PERSON, chosenBy: { kind: 'agent', id: ids.get(RAISED) } })
    expect(answers(id)['choice']!.sent!.underTheGrant).toBeUndefined()
    expect(choiceDecision(reply)['authority_reference']).toBe(id)
    expect(message(reply)).toContain(`Chosen by the secretary ${ids.get(RAISED)}`)
    expect(message(reply)).not.toContain('The person answered')
  })
  it('an old draft: leaves chooser absent and says nobody recorded who chose it', async () => {
    const id = await report(); await keep(id)
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.answers.choice.draft.chosenBy') WHERE id = ?").run(id)
    const reply = await send(id, PERSON); sentReply(reply)
    expect(answers(id)['choice']!.sent!.chosenBy).toBeUndefined()
    expect(message(reply)).toContain('Nobody recorded who chose this answer.')
    expect(message(reply)).not.toContain('In their own words:')
    expect(message(reply)).not.toContain('The person answered')
  })
  it('the person’s own words: answers sent only under the grant do not count for the decision reader', async () => {
    const id = await report(); await keep(id); await answer('answer.send', 'may-press')
    const reply = await send(id); sentReply(reply)
    senderIsTheSecretary(id)
    expect(whoseRecordsAreThese([id]).get(id)).toMatchObject({ own: false, because: 'notTheirs' })
  })
  it('a button names the sender as chooser, and a fill-in names whose words it carries', async () => {
    const id = await report(); await answer('answer.keep', 'may-press'); await answer('answer.send', 'may-press')
    const kept = await call('PUT', `/api/records/${id}/answers/note`, as(RAISED), { answer: { words: 'Leave it to dry.' }, ...FOR_THE_PERSON })
    expect(kept.status, JSON.stringify(kept.body)).toBe(200)
    const filled = await send(id); sentReply(filled)
    expect(message(filled)).toContain(`In the secretary ${ids.get(RAISED)}'s own words: Leave it to dry.`)
    const pressed = await send(id, as(RAISED), { scope: 'button', id: 'button' }); sentReply(pressed)
    expect(answers(id)['button']!.sent!.chosenBy).toEqual({ kind: 'agent', id: ids.get(RAISED) })
    expect(message(pressed)).toContain(`Chosen by the secretary ${ids.get(RAISED)}`)
  })
})
