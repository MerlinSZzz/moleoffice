// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE MAY NOW ADDRESS ONE PARTICIPANT, AND NOTHING ELSE ABOUT THE GATE CHANGED.
 *
 * Criterion M105 of design/messages/ACCEPTANCE.md, and the blocking item named in the cluster A
 * brief: `src/server/lib/records.ts` refused a line written as Mole Office (`senderIsMoleOffice`)
 * unless it was addressed to a whole group or to exactly both participants of one conversation.
 * F10's reminder (a later worker's build) and this cluster's own dead-letter broadcast are both the
 * office writing to ONE participant, and that was refused outright — the only way round it, used by
 * `src/server/lib/inspection.ts`'s `writeAMessage`, was to pad a one-recipient `to` to two by
 * repeating the one recipient, which says something the caller did not mean.
 *
 * WHAT IS NOW ALLOWED: a line Mole Office writes addressed to exactly one participant, through the
 * new `writeASystemLineToOne` in lib/groups.ts, which is the only thing besides
 * `writeASystemLine`/`writeASystemLineToTwo` that may set `senderIsMoleOffice`.
 *
 * WHAT IS STILL REFUSED, unchanged and proved below: a line claiming to be Mole Office addressed to
 * nobody, to three or more people, or to an entry that is not a real participant reference; and —
 * the point of the "deliberately, not loosely" instruction — an ORDINARY AGENT claiming `sentBy` is
 * Mole Office through the normal write path, whatever `to` it names. `senderIsMoleOffice` is never
 * reachable from a request (see the field's own comment in records.ts): a normal HTTP write can only
 * ever reach the `else if (said !== undefined ...)` branch, which refuses a claimed sender that is
 * not the writer, and that branch is untouched by this change.
 *
 * Mutation: in `src/server/lib/records.ts`, change `data['to'].length === 1 || data['to'].length === 2`
 * back to `data['to'].length === 2` (the pre-M105 rule). "writes to exactly one agent" below goes
 * red; every other case here is unaffected, because none of them relied on the widened half.
 *
 * WIDENED AGAIN IN WAVE 13J ROUND LOOP-5. Old: a line written as
 * Mole Office to three or more participants was refused, whoever they were. New: three or more is
 * allowed when every one is an agent, through `writeASystemLineToAgents`; a person among three or more
 * is still refused. Why: when the person marks a checklist item done, the office tells the agents the
 * item names in one message (the brief, message vTlootllRM0Z: "One message can already reach several
 * agents, so use that, not a new channel"). design/messages/ACCEPTANCE.md M105 still says three or more
 * is refused; that file is not this round's to edit, and the round's report says so.
 * Mutation: the agents-only half taken out of the rule in records.ts. "writes one line to three agents"
 * goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')
/** The registry id the starter door gave w-one. It is not the handle, so a stored `to` holds this. */
let wOneId: string

const THE_OFFICE = { type: 'agent', id: 'mole-office/the-api-server' } as const
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

beforeAll(async () => {
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  const wOne = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: 'w-one', name: 'Worker One', role: 'worker' },
  })
  wOneId = (wOne.json() as { agent: { id: string } }).agent.id
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the office may now write to one participant', () => {
  it('writes to exactly one agent, through the new writeASystemLineToOne', () => {
    const written = groups.writeASystemLineToOne(
      { kind: 'agent', id: wOneId },
      'default',
      { line: 'A reminder', said: 'Re-read the regulations after a compaction.', notice: 'aCounterFired' },
      THE_OFFICE,
    )
    expect(written.id).toBeTruthy()
    const record = t.api.getRecord(written.id)
    expect(record).not.toBeNull()
    const data = record!.data as Record<string, unknown>
    expect(data['sentBy']).toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    expect(data['to']).toEqual([{ kind: 'agent', id: wOneId }])
  })

  it('still refuses a Mole Office line addressed to nobody', () => {
    // CAUGHT EARLIER, BY THE GENERAL ADDRESSING CHECK EVERY MESSAGE MEETS — `whyTheAddressingIsRefused`
    // refuses an empty `to` with no target before the sender is even asked about, so a Mole Office
    // line naming nobody never reaches the senderIsMoleOffice branch at all. Still refused either way.
    expect(() =>
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'message',
        title: 'Nobody',
        data: { body: 'x', sentBy: { kind: 'agent', id: theOfficesOwnId(t) }, to: [] },
        actor: THE_OFFICE,
        senderIsMoleOffice: true,
      }),
    ).toThrow(/A message with nobody to send it to is not a message/)
  })

  it('still refuses a Mole Office line addressed to three participants', () => {
    expect(() =>
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'message',
        title: 'Three',
        data: {
          body: 'x',
          sentBy: { kind: 'agent', id: theOfficesOwnId(t) },
          to: [
            { kind: 'agent', id: 'w-one' },
            { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
            { kind: 'person', id: THE_PERSON },
          ],
        },
        actor: THE_OFFICE,
        senderIsMoleOffice: true,
      }),
    ).toThrow(/is addressed to a group/)
  })

  // WIDENED AGAIN, FOR SEVERAL AGENTS AND NO PERSON. When the person
  // marks a checklist item done, the office tells whoever added it, or the agents the item names, and the brief
  // (message vTlootllRM0Z) says one message reaches several agents. A person among three or more is still refused, above.
  it('writes one line to three agents, through writeASystemLineToAgents', async () => {
    // TWO MORE WORKERS, so every one of the three is named by the registry id the office stores.
    const registered: string[] = []
    for (const [handle, name] of [['w-three', 'Worker Three'], ['w-four', 'Worker Four']] as const) {
      const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle, name, role: 'worker' } })
      registered.push((made.json() as { agent: { id: string } }).agent.id)
    }
    const three = [
      { kind: 'agent', id: wOneId },
      { kind: 'agent', id: registered[0]! },
      { kind: 'agent', id: registered[1]! },
    ] as const
    const written = groups.writeASystemLineToAgents(
      three,
      'default',
      { line: 'An item was marked done', said: 'Made up for this test.', notice: 'thePersonMarkedAnItemDone' },
      THE_OFFICE,
    )
    expect((t.api.getRecord(written.id)!.data as Record<string, unknown>)['to']).toEqual(three)
    expect(() => groups.writeASystemLineToAgents([three[0], { kind: 'person', id: THE_PERSON }, three[2]] as never, 'default', { line: 'x', said: 'x', notice: 'thePersonMarkedAnItemDone' }, THE_OFFICE)).toThrow(
      /agents only/,
    )
  })

  it('still refuses an ordinary agent claiming to be Mole Office, whatever it addresses', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('w-one'),
      payload: {
        kind: 'message',
        title: 'Forged',
        data: { body: 'I am the office', sentBy: { kind: 'agent', id: theOfficesOwnId(t) }, to: [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }] },
      },
    })
    expect(reply.statusCode).toBeGreaterThanOrEqual(400)
    const said = reply.json() as { error: string }
    expect(said.error).toContain(theOfficesOwnId(t))
    expect(said.error).toContain('w-one')
  })

  it('still refuses senderIsMoleOffice claimed with a sentBy that is not really Mole Office', () => {
    expect(() =>
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'message',
        title: 'Not really',
        data: { body: 'x', sentBy: { kind: 'agent', id: 'w-one' }, to: [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }] },
        actor: THE_OFFICE,
        senderIsMoleOffice: true,
      }),
    ).toThrow(/says Mole Office sent it, and this one does not/)
  })
})
