// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE LISTS WHAT WAS ALREADY DECIDED ABOUT IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT QUESTION THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * Is there a way to tell an agent that joins later which decisions about the project are already made? An
 * agent that opens a module before working on it should meet what has already been settled there.
 * Criterion P37 of design/permissions/ACCEPTANCE.md, designed in its 3.7.7.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT ONE QUERY
 * ---------------------------------------------------------------------------------------
 *
 * A decision gets to be *about* a module two ways, and measured on a copy of the owner's corpus on
 * 7 September 2026 the two are wildly different sizes: 7 decisions are linked straight to a module,
 * and 69 proposals are. So a reading that only followed direct links would answer almost nothing,
 * and one that followed forks without saying so would present *a decision about a fork somebody
 * filed here* as *a decision somebody wrote about this module*. Each row carries which way it came
 * and, for the second, the fork it came through — and that is what these cases hold.
 *
 * AND IT IS NOT PART OF THE OPEN-LOOP READING. `LOOP_KINDS` is what somebody still has to finish; a
 * decision is settled by definition. The last case checks the two populations stayed apart, because
 * folding decisions into the loops would pass every other assertion in this file.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { DECIDED_HERE_KEY, titleOfSection } from '../src/shared/sections.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'
const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/a-reader',
  'x-mole-office-workspace': PROJECT,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

function aModule(title: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'module',
    title,
    data: { context: 'Why this module exists.', parts: [] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

function aFork(title: string, aboutId: string): string {
  const id = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'proposal',
    title,
    data: { question: title, options: ['a — one way', 'b — the other'] },
    actor: { type: 'agent', id: 'claude-code/a-reader' },
  }).id
  t.api.createLink({ fromId: id, toId: aboutId, type: 'about', actor: { type: 'agent', id: 'claude-code/a-reader' } })
  return id
}

async function settle(forkId: string, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/records/${forkId}/promote`,
    headers: { ...AS_AGENT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { title, data: { because: 'the owner said so' } },
  })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(201)
  return (res.json() as { decision: { id: string } }).decision.id
}

interface TheSection {
  about: string
  decisions: {
    id: string
    title: string
    how: string
    decidedOn: string
    nobodyWroteWhen: boolean
    throughTheFork: { id: string; title: string } | null
  }[]
  note: string
}

async function context(id: string): Promise<{ decided: TheSection; loops: { id: string; kind: string }[] }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}/context`, headers: AS_AGENT })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  const body = res.json() as { decisionsAboutThis: TheSection; loops: { id: string; kind: string }[] }
  return { decided: body.decisionsAboutThis, loops: body.loops }
}

// ================================================== the two ways in

describe('a module lists the decisions about it', () => {
  it('lists a decision that settled a fork filed about the module, and names the fork', async () => {
    const module = aModule('The close-up camera')
    const fork = aFork('Which lens?', module)
    const decision = await settle(fork, 'The 16mm lens')

    const { decided } = await context(module)
    const row = decided.decisions.find((one) => one.id === decision)
    expect(row, 'the decision reached through the fork is here').toBeDefined()
    expect(row?.how).toBe('settled a fork about it')
    expect(row?.throughTheFork?.id, 'and the row says which fork it came through').toBe(fork)
    expect(decided.about).toBe(module)
  })

  it('lists a decision somebody linked straight to the module, and says so', async () => {
    const module = aModule('The gripper')
    const decision = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'decision',
      title: 'The gripper stays pneumatic',
      data: { because: 'the owner said so', authority: 'the owner said so', decided_by: THE_TEST_OFFICES_OWNER.id },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id
    t.api.createLink({ fromId: decision, toId: module, type: 'about', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } })

    const { decided } = await context(module)
    expect(decided.decisions.map((one) => one.id)).toEqual([decision])
    expect(decided.decisions[0]?.how).toBe('linked to it')
    expect(decided.decisions[0]?.throughTheFork, 'nothing came through a fork').toBeNull()
  })

  it('keeps the stronger reading when a decision is both linked and reached through a fork', async () => {
    const module = aModule('The wrist')
    const fork = aFork('Which wrist?', module)
    const decision = await settle(fork, 'A three-axis wrist')
    t.api.createLink({ fromId: decision, toId: module, type: 'about', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } })

    const { decided } = await context(module)
    expect(decided.decisions, 'one row, not two').toHaveLength(1)
    expect(decided.decisions[0]?.how, 'somebody said this is about the module, which is the stronger claim').toBe(
      'linked to it',
    )
  })

  it('does not answer with a decision about some other module', async () => {
    const mine = aModule('Mine')
    const theirs = aModule('Theirs')
    const fork = aFork('Their question', theirs)
    const decision = await settle(fork, 'Their answer')

    const { decided } = await context(mine)
    expect(decided.decisions.map((one) => one.id)).not.toContain(decision)
    expect(decided.decisions).toHaveLength(0)
    expect(decided.note, 'and it says nothing is linked rather than leaving an empty list to be read').toContain(
      'No decision governs this record or is linked to it',
    )
  })
})

// ================================================== the absence, and the two populations

describe('what the module page draws, and what it must not fold into the open loops', () => {
  it('says nothing has been settled here rather than saying nothing at all', async () => {
    const module = aModule('A module nobody has decided anything about')
    const { decided } = await context(module)
    expect(decided.decisions).toHaveLength(0)
    expect(decided.note).toContain('No decision governs this record or is linked to it')
    expect(decided.note, 'and it says what it did not look at').toContain('is not readable from here')
  })

  it('does not list a decision somebody withdrew', async () => {
    const module = aModule('The lamp')
    const fork = aFork('Which lamp?', module)
    const decision = await settle(fork, 'The ring lamp')
    expect((await context(module)).decided.decisions.map((one) => one.id)).toContain(decision)

    t.api.deleteRecord(decision, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true })

    const { decided } = await context(module)
    expect(decided.decisions.map((one) => one.id), 'a withdrawn decision settles nothing').not.toContain(decision)
  })

  it('leaves the open-loop population alone: a decision is not a loop', async () => {
    const module = aModule('The close-up camera')
    const fork = aFork('Which lens?', module)
    const decision = await settle(fork, 'The 16mm lens')

    const { loops, decided } = await context(module)
    expect(loops.map((one) => one.kind), 'a decision is not one of the six loop kinds').not.toContain('decision')
    expect(loops.map((one) => one.id), 'and it is not carried as one either').not.toContain(decision)
    expect(decided.decisions.map((one) => one.id)).toContain(decision)
  })

  it('dates every row by the day, and says when the day is only when it was filed', async () => {
    const module = aModule('The rail')
    const said = aFork('Which rail?', module)
    const withADate = await settle(said, 'A single rail')
    const held = t.api.getRecord(withADate) as { data: Record<string, unknown> }
    t.api.updateRecord(
      withADate,
      { data: { ...held.data, decided_on: '2026-09-01' } },
      { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    )
    const unsaid = aFork('Which colour?', module)
    await settle(unsaid, 'Grey')

    const { decided } = await context(module)
    const dated = decided.decisions.find((one) => one.id === withADate)
    expect(dated?.decidedOn, 'the day the decision itself names').toBe('2026-09-01')
    expect(dated?.nobodyWroteWhen).toBe(false)
    const other = decided.decisions.find((one) => one.id !== withADate)
    expect(other?.nobodyWroteWhen, 'nobody wrote when this one was decided, and the row says so').toBe(true)
    // EVERY ROW IS A DAY, so one column does not carry two shapes of date.
    for (const one of decided.decisions) expect(one.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is a section a module declares, so the page has a name to draw it under', () => {
    expect(titleOfSection('module', DECIDED_HERE_KEY)).toBe('Decisions about this module')
    // AND NOT ON EVERY KIND. A panel saying "nothing settled here" on every record in the corpus
    // would be furniture, and furniture stops being read.
    expect(titleOfSection('task', DECIDED_HERE_KEY)).toBeNull()
  })
})
