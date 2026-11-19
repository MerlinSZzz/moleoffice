// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION WRITTEN BY THE PROMOTE ROUTE CAN BE CORRECTED AFTERWARDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Promotion stored only what the caller sent — `because`, `option_taken` — so the decision it filed
 * said nothing about what it stood on or who made it. That record was complete by the promote
 * route's rule and incomplete by the record contract's, and the first correction anybody tried was
 * refused for the two fields the route had left blank: "authority is missing", then "decided_by is
 * missing". About sixty decisions filed since 5 September 2026 were in that state.
 *
 * A decision record could not be changed, which was a defect and should not be a problem anybody has. Problem
 * `EV_G2eOWHeWy` has the measurement.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES, AND NEITHER IS A TEST ON ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * The route writes what the record contract asks for, and it never overwrites what a caller said.
 * A file that only checked the first would pass with the route stamping "the owner said so" onto an
 * agent's own engineering choice, which is the laundering the `authority` field exists to prevent.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'

const run = promisify(execFile)

let t: TestDb
let app: FastifyInstance
let url: string

/** The records this case made, so it can take its own decisions and forks off the office again. */
let madeByThisCase: string[] = []

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const AS_ANOTHER_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-other',
  'x-mole-office-workspace': PROJECT,
}
const AS_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/** The owner's words on the day, kept as the owner wrote them. */
const THE_OWNERS_WORDS = {
  saidBy: THE_TEST_OFFICES_OWNER.id,
  words: '决策记录你改不了确实是个缺陷，不应该有这个问题',
  where: 'terminal',
  when: '2026-09-06 12:30',
} as const

function about(...ids: string[]): Record<string, unknown> {
  return { ...THE_OWNERS_WORDS, for: ids }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // SETTLING ON A WARRANT IS THE SECRETARY'S ACT since the owner's decision. So the agent that
  // carries the owner's words into a promotion holds that card. Registered
  // once, because a handle is one an agent in this project has held.
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_PERSON,
    payload: { handle: 'claude-code', name: 'Claude Code', role: 'secretary' },
  })
  expect(made.statusCode, made.body).toBe(201)
  // THE REPAIR SCRIPT TALKS TO THE OFFICE OVER HTTP, so the one server listens for the whole file.
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
}, 60_000)

/**
 * A CASE TAKES ITS OWN DECISIONS AND FORKS OFF THE OFFICE AGAIN. The repair script counts every
 * promoted decision in the office, so a decision an earlier case left behind would be counted in
 * this case's answer. Deleting the decision first leaves its fork open, and the fork goes next.
 */
afterEach(async () => {
  for (const id of madeByThisCase.reverse()) {
    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: AS_PERSON })
    expect(gone.statusCode, gone.body).toBe(200)
  }
  madeByThisCase = []
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** A fork the person filed and reserved for themselves. */
function theOwnersFork(question: string): string {
  const id = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'proposal',
    title: `Fork · ${question}`,
    data: { question, options: ['a — one way', 'b — the other'], who_settles_it: 'the owner' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
  madeByThisCase.push(id)
  return id
}

async function promote(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ status: number; error: string; decision: { id: string; data: Record<string, unknown> } }> {
  const res = await app.inject({ method: 'POST', url: `/api/records/${id}/promote`, headers, payload })
  const body = res.json() as { error?: string; decision?: { id: string; data: Record<string, unknown> } }
  if (res.statusCode === 201 && body.decision !== undefined) madeByThisCase.push(body.decision.id)
  return {
    status: res.statusCode,
    error: body.error ?? '',
    decision: body.decision ?? { id: '', data: {} },
  }
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_AGENT,
): Promise<{ status: number; error: string }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  const body = res.json() as { error?: string }
  return { status: res.statusCode, error: body.error ?? '' }
}

/** What the record holds now, out of the database rather than out of a reply. */
function stored(id: string): Record<string, unknown> {
  return (t.api.getRecord(id) as { data: Record<string, unknown> }).data
}

// ================================================== 1. the route writes a complete decision

describe('a promoted decision says what it stands on and who made it', () => {
  it('names the owner’s word, where the owner said it, and the owner, when the secretary carries the owner’s words', async () => {
    const fork = theOwnersFork('Does an orphaned session count as over?')
    const done = await promote(fork, {
      title: 'An orphaned session counts as over',
      data: { because: 'the owner said so in the terminal' },
      warrant: about(fork),
    })
    expect(done.status, done.error).toBe(201)
    expect(done.decision.data['authority']).toBe('the owner said so')
    expect(done.decision.data['decided_by']).toBe(THE_OWNER)
    // WHERE THE OWNER'S WORDS ARE, UNDER AN OWNER'S DECISION. Since then the secretary's
    // settling act cites the authorization itself — the warrant's own place field — rather than the
    // fork. The owner's words are also on the decision's own first revision, where `actsOnTheirWords` reads
    // them.
    expect(done.decision.data['authority_reference']).toBe(THE_OWNERS_WORDS.where)
    expect(done.decision.data['because']).toBe('the owner said so in the terminal')
  })

  it('says the same when the person presses it themselves, so both doors write one shape', async () => {
    const fork = theOwnersFork('Should a stale claim be a problem?')
    const done = await promote(fork, { title: 'It is a problem', data: { because: 'I said so' } }, AS_PERSON)
    expect(done.status, done.error).toBe(201)
    expect(done.decision.data['authority']).toBe('the owner said so')
    expect(done.decision.data['decided_by']).toBe(THE_OWNER)
    expect(done.decision.data['authority_reference']).toBe(fork)
  })

  it('leaves an agent’s own engineering judgement as the agent’s, and invents no reference for it', async () => {
    const fork = theOwnersFork('Which timer does the sweep read?')
    const done = await promote(fork, {
      title: 'The sweep reads the monotonic clock',
      data: {
        authority: 'reversible engineering judgement',
        because: 'the wall clock moves under it; changing it back is one line',
        revisit_when: 'the sweep has to report a wall-clock time to a person',
      },
      warrant: about(fork),
    })
    expect(done.status, done.error).toBe(201)
    // WHAT THE CALLER SAID IS KEPT. Stamping the owner's word onto this would be an agent's own choice
    // wearing the owner's authority, which is the one thing the authority field exists to stop.
    expect(done.decision.data['authority']).toBe('reversible engineering judgement')
    expect(done.decision.data['decided_by']).toBe('claude-code')
    expect(done.decision.data['authority_reference']).toBeUndefined()
  })
})

// ================================================== 2. and it can be corrected afterwards

describe('a promoted decision can be corrected under the owner’s later words', () => {
  it('takes a title correction under a warrant naming the decision', async () => {
    const fork = theOwnersFork('Does a crashed run count as finished?')
    const done = await promote(fork, {
      title: 'A crashed run is not finished',
      data: { because: 'the owner said so' },
      warrant: about(fork),
    })
    expect(done.status, done.error).toBe(201)
    const corrected = await patch(done.decision.id, {
      title: 'A crashed run is not finished, and the alarm panel says so',
      warrant: about(done.decision.id),
    })
    expect(corrected.status, corrected.error).toBe(200)
    expect((t.api.getRecord(done.decision.id) as { title: string }).title).toContain('the alarm panel says so')
  })

  it('takes a correction from an agent that is not the one that decided it, when it carries the owner’s words', async () => {
    const fork = theOwnersFork('Which clock does a session age read?')
    const done = await promote(fork, {
      title: 'A session age reads the local clock',
      data: { authority: 'reversible engineering judgement', because: 'one reader, one writer' },
      warrant: about(fork),
    })
    expect(done.decision.data['decided_by']).toBe('claude-code')
    // THE WORDS WHY, AND NOT `revisit_when`, IS WHAT THIS CASE ASKS THROUGH NOW. It used to ask
    // through `revisit_when`, on the older rule that every field of a decision was shut to a
    // third-party agent without the owner's words. Criterion P76 of 13 September 2026 divides a decision
    // into the decision itself — the option taken, the words why, the title, the words added after
    // the press — and the notes around it, of which `revisit_when` is one, and the notes are open to
    // any agent. P76 supersedes the older rule because the older one had no notes half to exempt:
    // it was written when a decision was one flat object. What this case is about is unchanged: an
    // agent that did not make the decision may still correct it when it carries the owner's words.
    //
    // WITHOUT THE OWNER'S WORDS this is the third-party refusal, and it still is.
    const refused = await patch(
      done.decision.id,
      { dataPatch: { because: 'two readers, one writer' } },
      AS_ANOTHER_AGENT,
    )
    expect(refused.status).toBe(403)
    // AND THE SENTENCE IT COMES BACK IN CHANGED WITH IT. The third-party refusal — 'This decision
    // says "claude-code" made it' — used to be what a non-maker met on any field. P76's guard is
    // narrower and stands in front of it: whoever did not record this decision does not change the
    // decision itself, whatever it would have written. That sentence is still the product's, still
    // reached at the create door, and tests/an-agent-may-decide-what-it-can-cite holds it there.
    expect(refused.error).toContain('only whoever made it, or the person, may do that')
    expect(refused.error).toContain('recorded by "agent claude-code"')
    expect(refused.error).toContain('this request came from agent "claude-other"')
    // WITH THEM it goes through, and the words are on the revision.
    const allowed = await patch(
      done.decision.id,
      { dataPatch: { because: 'two readers, one writer' }, warrant: about(done.decision.id) },
      AS_ANOTHER_AGENT,
    )
    expect(allowed.status, allowed.error).toBe(200)
    expect(stored(done.decision.id)['because']).toBe('two readers, one writer')
  })

  it('takes a note from an agent that is not the one that decided it, with no words at all', async () => {
    const fork = theOwnersFork('Which clock does a session age read, and when do we look again?')
    const done = await promote(fork, {
      title: 'A session age reads the local clock',
      data: { authority: 'reversible engineering judgement', because: 'one reader, one writer' },
      warrant: about(fork),
    })
    expect(done.decision.data['decided_by']).toBe('claude-code')

    // THE OTHER HALF OF CRITERION P76, and the half the case above can no longer show. When to look
    // at a decision again is a note around it, not the decision, so any agent may write it — no
    // warrant, no authority, nothing to quote. The decision itself is untouched by it, which is why
    // this is safe, and the record's history says who wrote the note and when.
    const allowed = await patch(done.decision.id, { dataPatch: { revisit_when: 'the clock moves' } }, AS_ANOTHER_AGENT)
    expect(allowed.status, allowed.error).toBe(200)
    expect(stored(done.decision.id)['revisit_when']).toBe('the clock moves')
    // And the decision it belongs to is exactly as its maker left it.
    expect(stored(done.decision.id)['because']).toBe('one reader, one writer')
    expect((t.api.getRecord(done.decision.id) as { title: string }).title).toBe('A session age reads the local clock')
  })
})

// ================================================== 3. the repair, and running it twice

describe('the repair writes onto the decisions already promoted, and only once', () => {
  /** Put a decision back into the shape the route used to write, straight into the table. */
  function asTheRouteUsedToWriteIt(id: string, keep: Record<string, unknown>): void {
    writeDataBypassingTheGate(t, id, keep)
  }

  async function repair(api: string, apply: boolean): Promise<string> {
    const script = fileURLToPath(new URL('../tools/repair-promoted-decisions.mjs', import.meta.url))
    // THE ACTOR IS REGISTERED IN `beforeAll`. The script's default is a historical session name no
    // registry row holds, and the records door refuses a write under one; `claude-code` is the
    // secretary this file already registers, and the actor is attribution rather than the subject.
    const args = [script, '--api', api, '--workspace', PROJECT, '--since', '2026-01-01', '--actor', 'claude-code']
    if (apply) args.push('--apply')
    const { stdout } = await run(process.execPath, args, { env: process.env })
    return stdout
  }

  it('writes the missing fields once and finds nothing to write the second time', async () => {
    const fork = theOwnersFork('Does a stale claim block a merge?')
    const done = await promote(fork, {
      title: 'A stale claim does not block a merge',
      data: { because: 'the owner said so' },
      warrant: about(fork),
    })
    expect(done.status, done.error).toBe(201)
    asTheRouteUsedToWriteIt(done.decision.id, { because: 'the owner said so', recorded_by: 'agent claude-code' })
    expect(stored(done.decision.id)['authority']).toBeUndefined()

    {
      const first = await repair(url, true)
      expect(first).toContain(done.decision.id)
      expect(first).toContain('Wrote the missing fields onto 1 promoted decision')
      expect(stored(done.decision.id)['authority']).toBe('the owner said so')
      expect(stored(done.decision.id)['decided_by']).toBe(THE_OWNER)
      expect(stored(done.decision.id)['authority_reference']).toBe(fork)

      // AND AGAIN. Nothing is written, because it asks what each record holds now rather than
      // remembering what it did.
      const seq = (t.api.getRecord(done.decision.id) as { updatedAt: string }).updatedAt
      const second = await repair(url, true)
      expect(second).toContain('Wrote the missing fields onto 0 promoted decision')
      expect(second).toContain('Already complete, nothing written: 1')
      expect((t.api.getRecord(done.decision.id) as { updatedAt: string }).updatedAt).toBe(seq)
    }
  })

  it('leaves alone a decision whose ledger says nothing about what it stands on', async () => {
    const fork = theOwnersFork('Which way round is the sweep?')
    const done = await promote(fork, {
      title: 'The sweep runs forwards',
      data: { authority: 'a measurement', because: 'the run said so' },
      warrant: about(fork),
    })
    // An agent-filed decision with the authority taken off it and no warrant on the create row is
    // the case the script must not guess at. Take the warrant off the ledger to make that state.
    t.client.sqlite.prepare('UPDATE changes SET warrant = NULL WHERE record_id = ?').run(done.decision.id)
    t.client.sqlite.prepare('UPDATE revisions SET warrant = NULL WHERE record_id = ?').run(done.decision.id)
    asTheRouteUsedToWriteIt(done.decision.id, { because: 'the run said so' })

    {
      const said = await repair(url, true)
      expect(said).toContain('Left alone: 1')
      expect(said).toContain('no warrant and no authority')
      expect(stored(done.decision.id)['authority']).toBeUndefined()
    }
  })
})
