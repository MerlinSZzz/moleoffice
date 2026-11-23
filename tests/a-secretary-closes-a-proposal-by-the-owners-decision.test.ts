// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY CLOSES A PROPOSAL BY A DECISION THE OWNER ALREADY MADE. Closing a proposal with the owner’s
 * authorization, meaning a decision the owner already made, is one of a secretary's ordinary duties, with no
 * warrant and no raise.
 *
 * Before this, `assertMaySettleFork` in src/server/lib/records.ts refused every agent that pointed a decision at a fork
 * the owner settles, unless it carried the owner’s words or the owner’s raise. Now a secretary may make that link when the decision
 * says the owner made it and names the fork, by its id in its own text or by a link from the decision to the fork.
 *
 * WHAT THIS FILE PROVES, over the link door and the record door, with agents registered on real cards:
 *   1. a secretary closes the fork by the owner's decision that names it in its text; the fork reads settled, it leaves
 *      the person's desk, and the link's change row carries no warrant and no raise;
 *   2. the same when the decision names the fork by a link instead;
 *   3. a secretary is refused with the owner's decision that does not name the fork;
 *   4. a secretary is refused with its own decision, even one that names the fork;
 *   5. an agent that is not a secretary is refused with the owner's decision that names the fork;
 *   6. the person still closes a fork by a decision, naming it or not;
 *   7. the record door lists the decisions that name an open fork, and only those, and lists none once it is settled.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function ask(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', headers, { kind, title, data })
  expect(made.status, made.said).toBe(201)
  return String((made.body['record'] as { id: string }).id)
}

/** A fork the owner settles, filed by the person. */
function aForkForThePerson(title: string): Promise<string> {
  return file(AS_THE_PERSON, 'proposal', title, {
    question: 'Which glaze goes on the spring batch?',
    options: ['The celadon', 'The tenmoku'],
    because: 'The kiln is booked for Friday.',
    who_settles_it: 'the owner',
  })
}

/**
 * A decision the owner made, written down by the secretary from the owner's words filed as the owner's own note, as a secretary records
 * them. `names` is put in its text, or left out.
 */
async function theOwnersDecision(names: string | null): Promise<string> {
  // THE OWNER'S OWN WORDS, AS A SECRETARY RECORDS THEM SINCE 4 OCTOBER: the
  // secretary prepares the words as a note, the person's own press files them as a note of theirs, and the decision
  // cites that one. Until round 11 this helper cited the secretary's note itself, which the guard now refuses.
  const prepared = await file(asAgent('quill'), 'note', 'What the owner said about the glaze', {
    body: 'The celadon, said the owner on 3 October.',
    for_the_person_to_file: true,
  })
  const filed = await ask('POST', `/api/records/${prepared}/file-as-my-words`, AS_THE_PERSON)
  expect(filed.status, filed.said).toBe(200)
  const words = String((filed.body['note'] as { id: string }).id)
  return file(asAgent('quill'), 'decision', 'The spring batch takes the celadon', {
    ...governsTheWholeProject(), replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    authority_reference: words,
    option_taken: names === null ? 'The celadon.' : `The celadon, as proposal ${names} asked.`,
    because: 'The owner said so on 3 October.',
  })
}

/** Point a decision at a fork with the settling link. */
function settle(headers: Record<string, string>, decision: string, fork: string) {
  return ask('POST', '/api/links', headers, { fromId: decision, toId: fork, type: 'derived_from' })
}

async function readsSettled(fork: string): Promise<boolean> {
  const back = await ask('GET', `/api/records/${fork}`, AS_THE_PERSON)
  expect(back.status, back.said).toBe(200)
  return (back.body['resolution'] as { resolved?: boolean } | undefined)?.resolved === true
}

/** Is the fork open on the person's desk, or settled there? The desk's reader is not the record's. */
async function onThePersonsDesk(fork: string): Promise<{ open: boolean; settled: boolean }> {
  const desk = await ask('GET', '/api/forks', AS_THE_PERSON)
  expect(desk.status, desk.said).toBe(200)
  const open = (desk.body['forks'] as { recordId: string }[]).map((one) => one.recordId)
  const settled = (desk.body['settled'] as { proposalId: string }[]).map((one) => one.proposalId)
  return { open: open.includes(fork), settled: settled.includes(fork) }
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  expect(started.status, started.said).toBe(201)
  const worker = await ask('POST', '/api/agents/started', asAgent('quill'), {
    handle: 'tamp',
    name: 'Tamp',
    role: 'worker',
    workArea: ['src'],
  })
  expect(worker.status, worker.said).toBe(201)
}, 120_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('a secretary closes a proposal by a decision the owner already made', () => {
  it('closes it by the owner’s decision that names it in its text, and the person\'s desk agrees', async () => {
    const fork = await aForkForThePerson('Which glaze for the spring batch?')
    const decision = await theOwnersDecision(fork)
    expect(await onThePersonsDesk(fork)).toEqual({ open: true, settled: false })

    const linked = await settle(asAgent('quill'), decision, fork)
    expect(linked.status, linked.said).toBe(201)
    expect(await readsSettled(fork)).toBe(true)
    // THE DESK READS THE LINK ITSELF, so the door and the desk must agree.
    expect(await onThePersonsDesk(fork)).toEqual({ open: false, settled: true })

    // THE ACT IS THE SECRETARY'S OWN: no warrant and no raise on the change row.
    const rows = t.client.sqlite
      .prepare("SELECT actor_type, warrant, elevation FROM changes WHERE record_id = ? AND op = 'link' AND field = 'derived_from'")
      .all(decision) as { actor_type: string; warrant: string | null; elevation: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ actor_type: 'agent', warrant: null, elevation: null })
  })

  it('closes it by the owner’s decision that names it by a link', async () => {
    const fork = await aForkForThePerson('Which clay for the summer batch?')
    const decision = await theOwnersDecision(null)
    const about = await ask('POST', '/api/links', asAgent('quill'), { fromId: decision, toId: fork, type: 'about' })
    expect(about.status, about.said).toBe(201)

    const linked = await settle(asAgent('quill'), decision, fork)
    expect(linked.status, linked.said).toBe(201)
    expect(await onThePersonsDesk(fork)).toEqual({ open: false, settled: true })
  })

  it('is refused with the owner’s decision that does not name the fork', async () => {
    const fork = await aForkForThePerson('Which kiln for the autumn batch?')
    const decision = await theOwnersDecision(null)
    const linked = await settle(asAgent('quill'), decision, fork)
    expect(linked.status, linked.said).toBe(403)
    expect(linked.said).toContain('SETTLES that fork')
    expect(linked.said).toContain('names this fork')
    expect(await readsSettled(fork)).toBe(false)
  })

  it('is refused with its own decision, even one that names the fork', async () => {
    const fork = await aForkForThePerson('Which shelf for the winter batch?')
    const own = await file(asAgent('quill'), 'decision', 'The winter batch goes on the top shelf', {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'quill',
      authority: 'a measurement',
      authority_reference: 'The top shelf held 40 degrees over two firings.',
      option_taken: `The top shelf, for proposal ${fork}.`,
      because: 'Measured over two firings.',
    })
    const linked = await settle(asAgent('quill'), own, fork)
    expect(linked.status, linked.said).toBe(403)
    expect(await readsSettled(fork)).toBe(false)
  })

  it('is refused to an agent that is not a secretary', async () => {
    const fork = await aForkForThePerson('Which brush for the spring batch?')
    const decision = await theOwnersDecision(fork)
    const linked = await settle(asAgent('tamp'), decision, fork)
    expect(linked.status, linked.said).toBe(403)
    expect(linked.said).toContain('SETTLES that fork')
    expect(await readsSettled(fork)).toBe(false)
  })
})

describe('the person still closes a proposal by a decision', () => {
  it('closes it by a decision that names it, and by one that does not', async () => {
    const named = await aForkForThePerson('Which wax for the spring batch?')
    const linked = await settle(AS_THE_PERSON, await theOwnersDecision(named), named)
    expect(linked.status, linked.said).toBe(201)
    expect(await onThePersonsDesk(named)).toEqual({ open: false, settled: true })

    const unnamed = await aForkForThePerson('Which sponge for the spring batch?')
    const again = await settle(AS_THE_PERSON, await theOwnersDecision(null), unnamed)
    expect(again.status, again.said).toBe(201)
    expect(await onThePersonsDesk(unnamed)).toEqual({ open: false, settled: true })
  })
})

describe('the record door lists the decisions an open fork may be closed by', () => {
  it('lists every live decision that names it, and none once it is settled', async () => {
    const fork = await aForkForThePerson('Which tongs for the spring batch?')
    const inText = await theOwnersDecision(fork)
    const byLink = await theOwnersDecision(null)
    const about = await ask('POST', '/api/links', asAgent('quill'), { fromId: byLink, toId: fork, type: 'about' })
    expect(about.status, about.said).toBe(201)
    const elsewhere = await theOwnersDecision(null)

    const open = await ask('GET', `/api/records/${fork}`, AS_THE_PERSON)
    expect(open.status, open.said).toBe(200)
    const listed = (open.body['decisionsThatNameIt'] as { id: string; decidedBy: string | null }[]).map((d) => d.id)
    expect(listed.sort()).toEqual([inText, byLink].sort())
    expect(listed).not.toContain(elsewhere)

    const linked = await settle(AS_THE_PERSON, inText, fork)
    expect(linked.status, linked.said).toBe(201)
    const settled = await ask('GET', `/api/records/${fork}`, AS_THE_PERSON)
    expect(settled.body['decisionsThatNameIt']).toBeUndefined()
  })
})
