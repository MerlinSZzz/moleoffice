// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH WRITER OF THE FOUR IDS MIGRATION 0311 PUT A KIND BESIDE STORES THAT KIND WITH THE ID, SO A ROW WRITTEN FROM
 * NOW ON CAN BE TOLD WITHOUT A GUESS. Wave 13s round 155, item 30c part 3.
 *
 *   - folder_readings.read_by and owner_id: the draft door stores `person` for a person who files a folder reading,
 *     and `agent` for an agent;
 *   - revalidations.decided_by: the judgement door stores the kind of whoever judged, both when it writes the row and
 *     when a later judgement changes it;
 *   - conversation_reads.as_side: `recordThatSomebodyRead` stores the kind of the side it was given, and none for a
 *     read as neither side, because that names nobody.
 *
 * The rows written before 0311 are told by its data step, in
 * tests/migration-0311-the-rows-before-it-are-told-whose-id-they-hold.test.ts.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/each-writer-stores-the-kind-beside-the-id.test.ts
 * After a green control, make one change at a time:
 *   1. in src/server/lib/folderreading.ts, delete `ownerKind: input.actorKind,`: the first case goes red;
 *   2. in src/server/lib/revalidations.ts, delete `decidedByKind: theKindOfAnActorsId(actor.type), ` from the update:
 *      the second case goes red;
 *   3. in src/server/lib/messages.ts, put `null` in place of `asSide?.kind ?? null`: the third case goes red;
 *   4. in src/shared/types.ts, make `theKindOfAnActorsId` return `'agent'`: the first and second cases go red.
 * Copy each file before its change, restore it with cp after, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up, except the test office's person and the agent id its tests write as.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NEITHER_SIDE } from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { conversationReads, folderReadings, revalidations } from '../src/server/db/schema.ts'

const PROJECT = 'default'
const AN_AGENT = 'claude-code'
const AS_A_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': PROJECT }
const AS_AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AN_AGENT, 'x-mole-office-workspace': PROJECT }

let t: TestDb
let app: FastifyInstance
let pool: typeof import('../src/server/lib/messages.ts')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  pool = await import('../src/server/lib/messages.ts')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The values of one row's columns, in the order asked, read straight from the table by the names schema.ts gives them. */
function stored(table: string, id: string, columns: readonly string[]): unknown[] {
  return t.client.sqlite.prepare(`SELECT ${columns.map((one) => `"${one}"`).join(', ')} FROM "${table}" WHERE id = ?`).raw().get(id) as unknown[]
}

async function send(method: 'POST' | 'PUT', url: string, payload: object, headers: Record<string, string>): Promise<any> {
  const res = await app.inject({ method, url, payload, headers })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res.json()
}

async function aRecord(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  return (await send('POST', '/api/records', { kind, title, data }, AS_A_PERSON)).record.id as string
}

describe('each writer stores the kind beside the id it writes (migration 0311)', () => {
  it('stores the kind of whoever files a folder reading beside read_by and owner_id', async () => {
    const draft = (who: Record<string, string>, folder: string) =>
      send('POST', '/api/import/draft', {
        folder,
        pieces: [{ kind: 'note', title: 'A made-up observation', data: {}, from: ['NOTES.md'], quote: 'This is made-up material.' }],
      }, who)
    const byAPerson = (await draft(AS_A_PERSON, '/made-up/a-persons-folder')).draft.id as string
    const byAnAgent = (await draft(AS_AN_AGENT, '/made-up/an-agents-folder')).draft.id as string

    const columns = [folderReadings.readBy.name, folderReadings.readByKind.name, folderReadings.ownerId.name, folderReadings.ownerKind.name]
    expect(stored('folder_readings', byAPerson, columns)).toEqual([THE_PERSON, 'person', THE_PERSON, 'person'])
    expect(stored('folder_readings', byAnAgent, columns)).toEqual([AN_AGENT, 'agent', AN_AGENT, 'agent'])
  })

  it('stores the kind of whoever judged beside decided_by, when the row is written and when it is changed', async () => {
    const placeholder = await aRecord('placeholder', 'A made-up slot nobody has filled', {
      what: 'Nobody has supplied the made-up figure.',
      slot: 'stand_in',
      substitute: 'a made-up figure',
      resolved_when: 'Somebody supplies the figure.',
      allowed_uses: ['plumbing'],
      disallowed_claims: ['any comparison'],
      severity: 'stops_final',
    })
    const first = await aRecord('claim', 'A made-up result judged first by a person', { state: 'measured' })
    const second = await aRecord('claim', 'A made-up result judged first by an agent', { state: 'measured' })
    for (const claim of [first, second]) await send('POST', '/api/links', { fromId: placeholder, toId: claim, type: 'about' }, AS_A_PERSON)
    const judge = (claim: string, who: Record<string, string>) => send('PUT', `/api/revalidations/${placeholder}/${claim}`, { state: 'checked' }, who)
    const theRow = (claim: string) =>
      t.client.sqlite
        .prepare(`SELECT "${revalidations.decidedBy.name}" AS by, "${revalidations.decidedByKind.name}" AS kind FROM revalidations WHERE restriction_id = ? AND record_id = ?`)
        .get(placeholder, claim)

    await judge(first, AS_A_PERSON)
    await judge(second, AS_AN_AGENT)
    expect([theRow(first), theRow(second)]).toEqual([{ by: THE_PERSON, kind: 'person' }, { by: AN_AGENT, kind: 'agent' }])

    await judge(first, AS_AN_AGENT)
    await judge(second, AS_A_PERSON)
    expect([theRow(first), theRow(second)]).toEqual([{ by: AN_AGENT, kind: 'agent' }, { by: THE_PERSON, kind: 'person' }])
  })

  it('stores the kind of the side a conversation was read as, and none for a read as neither side', () => {
    const reader: ParticipantRef = { kind: 'person', id: 'a-made-up-reader' }
    const sides: { conversation: string; side: ParticipantRef | null; stored: { side: string; kind: string | null } }[] = [
      { conversation: 'made-up-agent-a~made-up-agent-b', side: { kind: 'agent', id: 'made-up-agent-a' }, stored: { side: 'made-up-agent-a', kind: 'agent' } },
      { conversation: 'aMadeUpGrp12', side: { kind: 'person', id: 'a-made-up-reader' }, stored: { side: 'a-made-up-reader', kind: 'person' } },
      { conversation: 'made-up-agent-a~made-up-agent-c', side: null, stored: { side: NEITHER_SIDE, kind: null } },
    ]
    for (const { conversation, side } of sides) pool.recordThatSomebodyRead(reader, conversation, side, PROJECT, '2026-10-30 10:00:00')

    const read = t.client.sqlite.prepare(
      `SELECT "${conversationReads.asSide.name}" AS side, "${conversationReads.asSideKind.name}" AS kind FROM conversation_reads WHERE pair = ? AND reader_id = ?`,
    )
    expect(sides.map(({ conversation }) => read.get(conversation, reader.id))).toEqual(sides.map((one) => one.stored))
  })
})
