// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY DECIDE WHAT IT CAN CITE, AND MAY NOT MANUFACTURE THE AUTHORITY.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS REPLACES, AND THE DATE IT STOPPED GOVERNING
 * ---------------------------------------------------------------------------------------
 *
 * Until 27 August 2026 `decision` was the one word under `humanOnly` and every agent got a 403 on
 * the kind. That kept the record honest and left an agent that KNEW the owner had already decided
 * something able to file only a note, which nothing queries. The owner replaced the sentence:
 * *"An Agent may close a question when it can cite sufficient authoritative evidence. It may not
 * manufacture authority that the evidence does not contain."*
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR CASES, AND THE THREE THINGS THAT DID NOT MOVE
 * ---------------------------------------------------------------------------------------
 *
 *   · no authority                                    — refused, to every agent.
 *   · decided_by the agent, on one of four evidences  — allowed.
 *   · decided_by the owner, no durable reference      — refused.
 *   · decided_by the owner, citing a real record      — allowed. It is a transcription.
 *
 * Unchanged, and each is checked below because a relaxation is exactly when the rest of a boundary
 * gets loosened by accident: deleting a decision, promoting a proposal into one, and a caller that
 * hands over no body at all — which is how `src/server/api/import.ts` borrows this guard.
 *
 * ---------------------------------------------------------------------------------------
 * THE REFUSAL IS PART OF THE MECHANISM
 * ---------------------------------------------------------------------------------------
 *
 * A blocked agent reads it and has to be able to act on it, so every refusal here is checked for
 * two things: what is missing, and what would satisfy it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { AGENT_AUTHORITIES, THE_OWNER } from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** The project this case files into, made fresh so a count of decisions sees only its own. */
let HERE = 'default'
let caseNumber = 0
const headersFor = (type: 'agent' | 'human'): Record<string, string> => ({
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': type === 'agent' ? 'claude-code' : THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': HERE,
})
let AS_AGENT = headersFor('agent')
let AS_PERSON = headersFor('human')

let t: TestDb
let app: FastifyInstance
let makeWorkspace: (input: { id: string; title: string }) => unknown

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  ;({ createWorkspace: makeWorkspace } = await import('../src/server/lib/workspaces.ts'))
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  HERE = `an-agent-may-cite-case-${String(caseNumber)}`
  makeWorkspace({ id: HERE, title: `An agent may cite case ${String(caseNumber)}` })
  AS_AGENT = headersFor('agent')
  AS_PERSON = headersFor('human')
})

const decisions = (): number => t.api.listRecords({ workspaceId: HERE, kind: 'decision' }).length

const messageOf = (reply: { json: () => unknown }): string => {
  const body = reply.json() as { error?: string; message?: string }
  return `${body.message ?? ''} ${body.error ?? ''}`
}

const write = async (data: unknown, headers = AS_AGENT): Promise<{ statusCode: number; json: () => unknown }> =>
  app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'decision', title: 'Position control for the handover', data: data !== null && typeof data === 'object' && !Array.isArray(data) ? { replaces: [], ...(data as Record<string, unknown>) } : data },
  })

describe('a decision with no authority is refused to every agent', () => {
  it('refuses it, names what is missing, and names what would satisfy it', async () => {
    const reply = await write({ because: 'the force sensor is missing on the left finger' })
    expect(reply.statusCode).toBe(403)
    const said = messageOf(reply)
    expect(said, 'the refusal does not name the missing field').toContain('`authority` is missing')
    expect(said, 'the refusal does not say what would satisfy it').toContain('WHAT WOULD SATISFY THIS')
    // Every one of the five, with what each has to carry, so the agent can pick without a second
    // request. A refusal that says only "no" costs the caller its next turn.
    for (const word of AGENT_AUTHORITIES) expect(said, `the refusal does not offer "${word}"`).toContain(word)
    expect(said).toContain('the owner said so')
    expect(said, 'the refusal does not say nothing was written').toContain('Nothing was written')
    expect(decisions()).toBe(0)
  })

  it('refuses a word that is not one of the five', async () => {
    const reply = await write({ decided_by: 'claude-code', authority: 'it seemed right' })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('not one of the five things a decision may stand on')
    expect(decisions()).toBe(0)
  })

  it('refuses one that says nobody made it', async () => {
    const reply = await write({ authority: 'a measurement' })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('`decided_by` is missing')
    expect(decisions()).toBe(0)
  })
})

describe('an agent may write a decision it made itself', () => {
  it('accepts one on a measurement, and records who typed it', async () => {
    const reply = await write({
      decided_by: 'claude-code',
      authority: 'a measurement',
      because: 'openLoopsFor over 143 loops: person 4, agent 16, either 3, nobody has said 120.',
    })
    expect(reply.statusCode, messageOf(reply)).toBe(201)
    const id = (reply.json() as { record: { id: string } }).record.id
    const data = (t.api.getRecord(id)?.data ?? {}) as Record<string, unknown>
    expect(data['decided_by']).toBe('claude-code')
    expect(data['recorded_by']).toBe('agent claude-code')
  })

  it('accepts all four evidence authorities, and refuses the owner’s word under its own name', async () => {
    for (const word of AGENT_AUTHORITIES) {
      const reply = await write({ decided_by: 'claude-code', authority: word })
      expect(reply.statusCode, `"${word}" was refused: ${messageOf(reply)}`).toBe(201)
    }
    // "the owner said so" under the agent's own name is the one combination that does not go
    // together: if the owner's word settles it, the owner decided it.
    const wrong = await write({ decided_by: 'claude-code', authority: 'the owner said so' })
    expect(wrong.statusCode).toBe(403)
    expect(messageOf(wrong)).toContain('do not go together')
  })

  it('refuses one signed with a third party’s name', async () => {
    const reply = await write({ decided_by: 'some-other-agent', authority: 'a measurement' })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('came from agent "claude-code"')
    expect(decisions()).toBe(0)
  })
})

describe('an agent writing down a decision the OWNER made', () => {
  const ownerNote = (): string =>
    t.api.createRecord({
      workspaceId: HERE,
      kind: 'note',
      title: 'Never change the GPU driver on the workstation',
      data: { body: 'the 5070 Ti is marginally stable; solve compatibility on the application side' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id

  it('refuses it with no reference at all, and says what to file first', async () => {
    const reply = await write({ decided_by: THE_OWNER, authority: 'the owner said so' })
    expect(reply.statusCode).toBe(403)
    const said = messageOf(reply)
    expect(said).toContain('`authority_reference` is')
    expect(said, 'the refusal does not say a paraphrase is not the owner’s words').toContain('paraphrase')
    expect(decisions()).toBe(0)
  })

  it('refuses a reference nothing answers to', async () => {
    const reply = await write({
      decided_by: THE_OWNER,
      authority: 'the owner said so',
      authority_reference: 'nosuchrecord',
    })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('nothing in Mole Office answers to that id')
    expect(decisions()).toBe(0)
  })

  it('refuses a reference to a record that has been deleted', async () => {
    // A deleted record is a fact about the archive rather than a live claim about the owner. Accepting it
    // would let an agent cite something it had just removed.
    const id = ownerNote()
    t.api.deleteRecord(id, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const reply = await write({ decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: id })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('is deleted')
  })

  it('refuses "the owner decided" on any authority but the owner’s word', async () => {
    const id = ownerNote()
    const reply = await write({ decided_by: THE_OWNER, authority: 'a measurement', authority_reference: id })
    expect(reply.statusCode).toBe(403)
    expect(messageOf(reply)).toContain('cannot both be true from an agent')
  })

  it('accepts it when the reference names a live record, and says the agent typed it', async () => {
    const id = ownerNote()
    const reply = await write({
      decided_by: THE_OWNER,
      authority: 'the owner said so',
      authority_reference: id,
      because: 'The owner’s words: "no driver changes on the 5070 Ti workstation."',
    })
    expect(reply.statusCode, messageOf(reply)).toBe(201)
    const made = (reply.json() as { record: { id: string } }).record.id
    const data = (t.api.getRecord(made)?.data ?? {}) as Record<string, unknown>
    // The pair is the whole point: THE OWNER decided it, an AGENT wrote it down. On screen this must never
    // read as though the agent decided it, and it must never read as though the owner typed it.
    expect(data['decided_by']).toBe(THE_OWNER)
    expect(data['recorded_by']).toBe('agent claude-code')
  })
})

describe('what did not move', () => {
  const filed = (): string =>
    t.api.createRecord({
      workspaceId: HERE,
      kind: 'decision',
      title: 'Stay on position control',
      data: { replaces: [], authority: 'a measurement', decided_by: THE_OWNER },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id

  it('a person may still write a decision with no authority at all', async () => {
    const reply = await write({ because: 'I want to' }, AS_PERSON)
    expect(reply.statusCode, messageOf(reply)).toBe(201)
  })

  it('an agent still may not delete a decision', async () => {
    const id = filed()
    const reply = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: AS_AGENT })
    expect(reply.statusCode).toBe(403)
    expect(t.api.getRecord(id)?.deletedAt).toBeNull()
  })

  it('an agent still may not promote a proposal into one', async () => {
    const fork = t.api.createRecord({
      workspaceId: HERE,
      kind: 'proposal',
      title: 'Position or force control?',
      data: { question: 'Which?', options: ['a — position', 'b — force'] },
      actor: { type: 'agent', id: 'claude-code' },
    }).id
    const reply = await app.inject({
      method: 'POST',
      url: `/api/records/${fork}/promote`,
      headers: AS_AGENT,
      payload: { title: 'Stay on position control' },
    })
    expect(reply.statusCode).toBe(403)
    expect(decisions()).toBe(0)
  })

  it('a caller that hands over no body is refused by the old sentence', async () => {
    // This is the door src/server/api/import.ts uses: it borrows this guard to refuse an agent that
    // would overwrite the whole archive, and it has no decision body to hand over. The authority
    // path must never open by default.
    const { assertMayWrite } = await import('../src/server/lib/records.ts')
    expect(() =>
      assertMayWrite('decision', 'change', { type: 'agent', id: 'claude-code', stated: true }, 'the whole archive'),
    ).toThrow(/Only the human may change a decision/)
  })

  it('an agent may not change a filed decision into one with no authority', async () => {
    const id = filed()
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { because: 'no authority any more' } },
    })
    expect(reply.statusCode).toBe(403)
    expect(((t.api.getRecord(id)?.data ?? {}) as Record<string, unknown>)['authority']).toBe('a measurement')
  })
})

