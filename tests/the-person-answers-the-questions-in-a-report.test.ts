// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON ANSWERS THE QUESTIONS IN A REPORT, AND EACH SUBMIT SENDS ONLY WHAT IS UNSENT. It follows two decisions on
 * the design CI_hZmfzVGJk. The door is src/server/lib/answers.ts, over PUT
 * /api/records/:id/answers/:blockId and POST /api/records/:id/answers/send.
 *
 * What this file holds the door to, in order, on one report an agent wrote:
 *   1. an agent's press is refused on both doors, saying who may answer, and nothing is written;
 *   2. a box's submit sends only that box's questions, to the agent the box names, in ONE message with a lead back to
 *      the report, and the agent's delivery row is written and its waiting door lists the message;
 *   3. a choice sent is recorded at once as the person's decision, linked to the report, and the answer is kept with
 *      who sent it, when and what; the choice is about a proposal, so the decision settles it; the whole report's
 *      submit sent only what was unsent;
 *   4. a choice about a decision replaces that decision;
 *   5. an answer changed after sending is sent again, the new decision replaces the old, and the report's revisions
 *      still hold the earlier answer;
 *   6. a submit with nothing unsent is refused, and a button is sent once;
 *   7. only the answer door writes `answers`: the record door refuses a patch, a whole data and a create that set it;
 *   8. an option that is not the choice's own is refused, and so is a report whose question names nothing.
 *
 * MUTATIONS, each run after a control run on 2 October 2026 (the proofs are in the round's proofs.txt):
 *   A. `refuseAnybodyButThePerson` answers yes to everybody (`|| true`): case 1 goes red, and cases 2 and 3 with it,
 *      because the agent's writes change the report they read.
 *   B. `sendAnswers` sends the kept answer whether or not it was sent (`unsentAnswer` replaced by the draft or the
 *      sent answer): case 3 goes red, because the box's answers are sent a second time, and cases 4 to 6 with it.
 *   C. the `derived_from` link to the proposal left out of the decision's links: case 3 goes red.
 *   D. the decision's `replaces` written as an empty list: cases 4 and 5 go red.
 *   E. the messages grouped by question instead of by agent: case 2 goes red, and the cases after it that count messages.
 *   F. `refuseWhatOnlyTheAnswerDoorWrites` returns at once: case 7 goes red.
 *   G. the write-time refusal of an `about` that names nothing taken out: case 8 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const JSON_HEADER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const PERSON = { ...JSON_HEADER, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string): Record<string, string> => ({ ...JSON_HEADER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const WRITER = 'kiln-writer'
const KEEPER = 'glaze-keeper'
let writerId = ''
let keeperId = ''
let proposalId = ''
let clayDecisionId = ''
let reportId = ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: any }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, json: reply.json() }
}

const count = (kind: string): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE kind = ?').get(kind) as { n: number }).n
const dataOf = (id: string): Record<string, unknown> =>
  JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>
const linksFrom = (id: string): { type: string; to: string }[] =>
  t.client.sqlite.prepare('SELECT type, to_id AS "to" FROM links WHERE from_id = ? ORDER BY type, to_id').all(id) as { type: string; to: string }[]
/**
 * TWO IDS IN THE ORDER `linksFrom` READS THEM: SQLite's ORDER BY on a text column compares bytes (the BINARY
 * collation), and these ids are ASCII, so a plain `<` on the strings is the same order. `localeCompare` is not: it
 * puts 'aB' before 'Zb', and SQLite puts 'Zb' first. With random ids that differed about one run in several, which is
 * how case 3 failed in a sweep and passed alone.
 */
const inTheOrderSqlUses = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const answersNow = (): any => dataOf(reportId)['answers']

const keep = (blockId: string, answer: unknown, headers: Record<string, string> = PERSON) => ask('PUT', `/api/records/${reportId}/answers/${blockId}`, headers, { answer })
const send = (press: unknown, headers: Record<string, string> = PERSON) => ask('POST', `/api/records/${reportId}/answers/send`, headers, { press })

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  const writer = await ask('POST', '/api/agents/started', PERSON, { handle: WRITER, name: 'Kiln Writer', role: 'supervisor' })
  expect(writer.status, JSON.stringify(writer.json)).toBe(201)
  writerId = String(writer.json.agent.id)
  const keeper = await ask('POST', '/api/agents/started', PERSON, { handle: KEEPER, name: 'Glaze Keeper', role: 'worker' })
  expect(keeper.status, JSON.stringify(keeper.json)).toBe(201)
  keeperId = String(keeper.json.agent.id)

  const proposal = await ask('POST', '/api/records', asAgent(WRITER), { kind: 'proposal', title: 'Which glaze the spring batch uses' })
  expect(proposal.status, JSON.stringify(proposal.json)).toBe(201)
  proposalId = String(proposal.json.record.id)
  const clay = await ask('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'The spring batch is stoneware',
    data: { option_taken: 'Stoneware', replaces: [] },
  })
  expect(clay.status, JSON.stringify(clay.json)).toBe(201)
  clayDecisionId = String(clay.json.record.id)

  const report = await ask('POST', '/api/records', asAgent(WRITER), {
    kind: 'report',
    title: 'Questions about the spring kiln',
    data: {
      for: 'Morgan Vale',
      date: '2026-10-02',
      blocks: [
        {
          id: 'q-glaze',
          type: 'choice',
          question: 'Which glaze should the spring batch use?',
          about: proposalId,
          options: [
            { id: 'a', label: 'Celadon', recommended: true },
            { id: 'b', label: 'Tenmoku' },
          ],
        },
        {
          id: 'q-clay',
          type: 'choice',
          question: 'Which clay should the spring batch use?',
          about: clayDecisionId,
          options: [
            { id: 'x', label: 'Stoneware' },
            { id: 'y', label: 'Porcelain' },
          ],
        },
        {
          id: 'box-notes',
          type: 'box',
          title: 'Notes for the glazer',
          to: KEEPER,
          blocks: [
            { id: 'q-note', type: 'fillin', asks: 'Anything the glazer should know?', lines: 'many' },
            {
              id: 'q-kiln',
              type: 'choice',
              question: 'Which kilns may the glazer use?',
              many: true,
              options: [
                { id: 'k1', label: 'The small kiln' },
                { id: 'k2', label: 'The wood kiln' },
                { id: 'k3', label: 'The gas kiln' },
              ],
            },
          ],
        },
        { id: 'q-loose', type: 'fillin', asks: 'When should the firing start?' },
        { id: 'q-fire', type: 'button', label: 'Fire the kiln', confirm: 'Fire the kiln tonight?' },
      ],
    },
  })
  expect(report.status, JSON.stringify(report.json)).toBe(201)
  reportId = String(report.json.record.id)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the person answers the questions in a report', () => {
  it('1. refuses an agent on both doors, says who may answer, and writes nothing', async () => {
    const kept = await keep('q-glaze', { chosen: ['b'] })
    expect(kept.status, JSON.stringify(kept.json)).toBe(200)
    const before = { answers: JSON.stringify(answersNow()), decisions: count('decision'), messages: count('message') }

    const agentKeeps = await keep('q-glaze', { chosen: ['a'] }, asAgent(WRITER))
    const agentSends = await send({ scope: 'report' }, asAgent(WRITER))
    for (const refused of [agentKeeps, agentSends]) {
      expect(refused.status, JSON.stringify(refused.json)).toBe(403)
      expect(refused.json.code).toBe('answerNotThePerson')
      const said = JSON.stringify(refused.json)
      expect(said).toContain('Only the person answers the questions in a report, in the browser paired as theirs.')
      expect(said).toContain('Nothing was written')
    }
    expect(JSON.stringify(answersNow())).toBe(before.answers)
    expect(count('decision')).toBe(before.decisions)
    expect(count('message')).toBe(before.messages)
  })

  it('2. sends a box’s questions alone, to the agent it names, in one message that leads to the report', async () => {
    expect((await keep('q-note', { words: 'Wax the feet first.' })).status).toBe(200)
    expect((await keep('q-kiln', { chosen: ['k1', 'k3'] })).status).toBe(200)
    expect((await keep('q-loose', { words: 'Friday at dawn' })).status).toBe(200)

    const sent = await send({ scope: 'box', id: 'box-notes' })
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)
    expect(sent.json.messages).toHaveLength(1)
    expect(sent.json.messages[0].to).toBe(keeperId)
    expect(sent.json.decisions).toHaveLength(1)
    const messageId = String(sent.json.messages[0].id)

    const message = dataOf(messageId)
    expect(message['to']).toEqual([{ kind: 'agent', id: keeperId }])
    expect(message['lead']).toMatchObject({ target: { kind: 'record', recordId: reportId, workspaceId: 'default' } })
    const body = String(message['body'])
    expect(body).toContain('Wax the feet first.')
    expect(body).toContain('The small kiln (option k1); The gas kiln (option k3)')
    expect(body).toContain(String(sent.json.decisions[0]))
    expect(body).not.toContain('Friday at dawn')
    expect(body).not.toContain('Tenmoku')

    const rows = t.client.sqlite
      .prepare("SELECT recipient_id AS id, mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent'")
      .all(messageId) as { id: string; mark: string }[]
    expect(rows).toEqual([{ id: keeperId, mark: 'queued' }])
    const waiting = await ask('GET', `/api/handles/${KEEPER}/waiting`, asAgent(KEEPER))
    expect(waiting.status, JSON.stringify(waiting.json)).toBe(200)
    expect(JSON.stringify(waiting.json)).toContain(messageId)

    const answers = answersNow()
    expect(answers['q-note'].sent).toMatchObject({ answer: { words: 'Wax the feet first.' }, by: THE_PERSON, to: keeperId, message: messageId })
    expect(answers['q-note'].draft).toBeUndefined()
    expect(answers['q-loose'].sent).toBeUndefined()
    expect(answers['q-loose'].draft.answer).toEqual({ words: 'Friday at dawn' })
    expect(answers['q-glaze'].sent).toBeUndefined()
  })

  it('3. records a choice as the person’s decision linked to the report, settles its proposal, and sends only what is unsent', async () => {
    expect((await keep('q-glaze', { chosen: ['b'], words: 'Keep it simple' })).status).toBe(200)
    const sent = await send({ scope: 'report' })
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)
    expect(sent.json.messages).toEqual([{ id: expect.any(String), to: writerId }])
    expect(sent.json.decisions).toHaveLength(1)
    const decisionId = String(sent.json.decisions[0])

    const body = String(dataOf(String(sent.json.messages[0].id))['body'])
    expect(body).toContain('Tenmoku (option b)')
    expect(body).toContain('Friday at dawn')
    // THE BOX'S ANSWERS WERE SENT ALREADY, so the whole report's submit does not send them again.
    expect(body).not.toContain('Wax the feet first.')
    expect(body).not.toContain('The small kiln')

    const decision = dataOf(decisionId)
    expect(decision).toMatchObject({
      option_taken: 'Tenmoku — in their own words: Keep it simple',
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: reportId,
      replaces: [],
    })
    // THE ORDER IS SQLITE'S, checked on two ids whose two orders differ, so this cannot pass by the ids' luck.
    expect(['aB-x', 'Zb-x'].sort(inTheOrderSqlUses)).toEqual(
      (t.client.sqlite.prepare("SELECT v FROM (SELECT 'aB-x' AS v UNION ALL SELECT 'Zb-x') ORDER BY v").all() as { v: string }[]).map((r) => r.v),
    )
    expect(linksFrom(decisionId)).toEqual(
      [
        { type: 'derived_from', to: reportId },
        { type: 'derived_from', to: proposalId },
      ].sort((a, b) => inTheOrderSqlUses(a.to, b.to)),
    )
    const { proposalResolution, getRecord } = await import('../src/server/lib/records.ts')
    const resolution = proposalResolution(getRecord(proposalId)!)
    expect(resolution?.resolved).toBe(true)
    expect(resolution?.by.map((one) => one.id)).toEqual([decisionId])

    const kept = answersNow()['q-glaze']
    expect(kept.draft).toBeUndefined()
    expect(kept.sent).toMatchObject({
      answer: { chosen: ['b'], words: 'Keep it simple' },
      by: THE_PERSON,
      to: writerId,
      message: String(sent.json.messages[0].id),
      decision: decisionId,
    })
    expect(String(kept.sent.at)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  })

  it('4. replaces the decision a choice is about', async () => {
    expect((await keep('q-clay', { chosen: ['y'] })).status).toBe(200)
    const sent = await send({ scope: 'report' })
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)
    const decisionId = String(sent.json.decisions[0])
    expect(dataOf(decisionId)['replaces']).toEqual([clayDecisionId])
    expect(linksFrom(decisionId)).toContainEqual({ type: 'supersedes', to: clayDecisionId })
    const { whatSupersedes } = await import('../src/server/lib/replaced-decisions.ts')
    expect(whatSupersedes(clayDecisionId)?.id).toBe(decisionId)
  })

  it('5. sends a changed answer again, replaces the earlier decision, and keeps the earlier answer in the revisions', async () => {
    const earlier = String(answersNow()['q-glaze'].sent.decision)
    expect((await keep('q-glaze', { chosen: ['a'] })).status).toBe(200)
    const sent = await send({ scope: 'report' })
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)
    expect(sent.json.messages).toHaveLength(1)
    const later = String(sent.json.decisions[0])
    expect(dataOf(later)['replaces']).toEqual([earlier])
    expect(dataOf(later)['option_taken']).toBe('Celadon')
    const { whatSupersedes } = await import('../src/server/lib/replaced-decisions.ts')
    expect(whatSupersedes(earlier)?.id).toBe(later)
    expect(answersNow()['q-glaze'].sent.decision).toBe(later)

    const revisions = (t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? ORDER BY seq').all(reportId) as { data: string }[]).map(
      (row) => JSON.parse(row.data) as { answers?: Record<string, { sent?: { answer: { chosen?: string[] } } }> },
    )
    expect(revisions.some((one) => JSON.stringify(one.answers?.['q-glaze']?.sent?.answer.chosen) === JSON.stringify(['b']))).toBe(true)
  })

  it('6. refuses a submit with nothing unsent, and sends a button once', async () => {
    const nothing = await send({ scope: 'report' })
    expect(nothing.status, JSON.stringify(nothing.json)).toBe(409)
    expect(nothing.json.code).toBe('answersNothingUnsent')
    expect(JSON.stringify(nothing.json)).toContain('Nothing was sent')

    const pressed = await send({ scope: 'button', id: 'q-fire' })
    expect(pressed.status, JSON.stringify(pressed.json)).toBe(201)
    expect(pressed.json.messages).toEqual([{ id: expect.any(String), to: writerId }])
    expect(pressed.json.decisions).toEqual([])
    expect(String(dataOf(String(pressed.json.messages[0].id))['body'])).toContain('Button "Fire the kiln" (block q-fire): pressed.')
    expect(answersNow()['q-fire'].sent.answer).toEqual({ pressed: true })
    const again = await send({ scope: 'button', id: 'q-fire' })
    expect(again.status, JSON.stringify(again.json)).toBe(409)
  })

  it('7. lets only the answer door write answers', async () => {
    const before = JSON.stringify(answersNow())
    const patched = await ask('PATCH', `/api/records/${reportId}`, PERSON, { dataPatch: { answers: {} } })
    expect(patched.status, JSON.stringify(patched.json)).toBe(409)
    expect(JSON.stringify(patched.json)).toContain('only the answer door writes it')
    const { answers: _left, ...rest } = dataOf(reportId)
    const replaced = await ask('PATCH', `/api/records/${reportId}`, PERSON, { data: rest })
    expect(replaced.status, JSON.stringify(replaced.json)).toBe(409)
    const filed = await ask('POST', '/api/records', asAgent(WRITER), {
      kind: 'report',
      title: 'A report filed already answered',
      data: { for: 'Morgan Vale', date: '2026-10-02', blocks: [], answers: {} },
    })
    expect(filed.status, JSON.stringify(filed.json)).toBe(409)
    expect(JSON.stringify(answersNow())).toBe(before)
    // A ROUND TRIP THAT CARRIES THE ANSWERS UNCHANGED IS NOT A WRITE OF THEM, and passes.
    const roundTrip = await ask('PATCH', `/api/records/${reportId}`, PERSON, { data: { ...dataOf(reportId), date: '2026-10-03' } })
    expect(roundTrip.status, JSON.stringify(roundTrip.json)).toBe(200)
  })

  it('8. refuses an option that is not the choice’s own, and a report whose question names nothing', async () => {
    const stranger = await keep('q-glaze', { chosen: ['z'] })
    expect(stranger.status, JSON.stringify(stranger.json)).toBe(400)
    expect(stranger.json.code).toBe('answerNotAnOption')

    const aboutNothing = await ask('POST', '/api/records', asAgent(WRITER), {
      kind: 'report',
      title: 'A question about nothing',
      data: {
        for: 'Morgan Vale',
        date: '2026-10-02',
        blocks: [{ id: 'q-1', type: 'choice', question: 'Which one?', about: 'no-such-record', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }],
      },
    })
    expect(aboutNothing.status, JSON.stringify(aboutNothing.json)).toBe(400)
    expect(JSON.stringify(aboutNothing.json)).toContain('no record has that id')
    const toNobody = await ask('POST', '/api/records', asAgent(WRITER), {
      kind: 'report',
      title: 'A box for nobody',
      data: {
        for: 'Morgan Vale',
        date: '2026-10-02',
        blocks: [{ id: 'box-1', type: 'box', to: 'no-such-agent', blocks: [{ id: 'q-2', type: 'fillin', asks: 'Anything?' }] }],
      },
    })
    expect(toNobody.status, JSON.stringify(toNobody.json)).toBe(400)
    expect(JSON.stringify(toNobody.json)).toContain('no agent in this office has that id or handle')
  })
})
