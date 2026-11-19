// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY'S ELEVATION CARRIES THE PERSON'S ACTS, AS THE DECLARATION SAYS. Criterion P17.
 *
 * Report `jT4wVUdiwdiI`, block t3, measured that of the 21 acts only the person may do, the code let
 * an elevated secretary through only 10: those were the guards that asked `actsForThePerson`. The
 * other 11 asked only `actor.type === 'human'`, so the owner's own press was refused by ten of them.
 *
 * By R2 of a decision, the eleven ask `actsForThePerson` like the ten, with one exception: the grant never revokes a
 * regulation. A later decision permits a secretary to revoke on the owner's written words for
 * that revocation, separately from the grant.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE DECLARED ACTS ARE DRIVEN, AND WHY THE GUARDS ARE CALLED DIRECTLY
 * ---------------------------------------------------------------------------------------
 *
 * Each declared act is one row below, and the row calls the guard that stands in front of it with
 * the actor a real elevation produces. The elevation itself is NOT mocked: it is pressed
 * through POST /api/roles/elevation/<the secretary's handle> on a test office the file starts once, written on the agent's record and
 * its registry row, and `actsForThePerson` reads that row. Each case ends its own raise afterwards, so the next case
 * starts with no period open. The FORK-ON-THE-QUEUE row builds its real
 * proposal, decision and human-made link through the app first, because that guard reads them before
 * it asks the actor question.
 *
 * A row asserts the guard RETURNS: a refusal is a `PanelError`, and the row would throw it. The one
 * act elevation does not carry is asserted to throw instead. A mutation of any one guard's
 * `actsForThePerson(actor)` back to `actor.type === 'human'` makes its row throw, which is the red.
 *
 * ---------------------------------------------------------------------------------------
 * CRITERION P17'S OTHER HALF, AND WHY THE ROWS ARE BOUND TO THE DECLARATION
 * ---------------------------------------------------------------------------------------
 *
 * P17 says a period gives every one of the person's declared acts but one, AND that with no period
 * the secretary is refused ALL of them. Until 13 September 2026 this file measured only the first
 * half: it hardcoded twenty rows and asserted they pass under a grant, and it never drove the same
 * rows with no grant open. A hardcoded list can also drift from the declaration it claims to walk.
 *
 * So the rows are one function of the actor, `theDeclaredActs`, and BOTH tests use it. The act keys
 * the function drives are asserted equal to the `personAct` set of `GOVERNANCE_GUARDS`, so an act
 * added to the declaration without a row here fails this file rather than silently going unwalked;
 * `tests/the-persons-acts-are-declared-once.test.ts` binds that set to `roles.json` in turn. The
 * block-method row needs a live fallback to reach the actor question at all, so the tests build one
 * through the app rather than letting the guard return early and read as a pass.
 *
 * MUTATIONS THAT TURN THIS FILE RED, each after a control run:
 *
 *   · delete `actsForThePerson(actor)` from one guard, so it asks only for a stated person → that
 *     guard's row in the elevated test throws, because the elevated secretary is an agent.
 *   · make `actsForThePerson` return true without an elevation row → the with-no-period test goes
 *     red on every row, because a plain secretary would be allowed the person's acts.
 *   · drop one row from `theDeclaredActs` → the set equality against `GOVERNANCE_GUARDS` goes red.
 *   · let the block-method row use a block with no live fallback → the with-no-period test goes red,
 *     because the guard returns before it asks the actor.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, A_TESTS_REASON_FOR_THE_PERSON, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BuiltServer } from '../src/server/index.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb
let app: BuiltServer

/** Loaded after `freshDb()`, so these are the modules the running app refuses by. */
let records: typeof import('../src/server/lib/records.ts')
let presentation: typeof import('../src/server/lib/presentation.ts')
let workdomain: typeof import('../src/server/lib/workdomain.ts')
let regulations: typeof import('../src/server/lib/regulations.ts')
let pixel: typeof import('../src/server/lib/pixel-office.ts')
let goals: typeof import('../src/server/lib/goals.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/**
 * The actor an elevation produces: the secretary's own handle, no run, headers stated. And the press a route fills in
 * (`actorFrom` in lib/http.ts): the door, named here by the act the guard asks about, and a reason. With no press the
 * check refuses a secretary, because nothing says which door it is.
 */
function theElevatedSecretary(act: string): Actor {
  return {
    type: 'agent',
    id: THE_TEST_OFFICES_SECRETARY.handle,
    sessionId: null,
    stated: true,
    press: { operation: act, aRead: false, reason: A_TESTS_REASON_FOR_THE_PERSON },
  }
}

/**
 * THE SAME SECRETARY WITH NO PERIOD OPEN. Same handle, same stated headers, and the shared office has
 * registered it as a secretary — so the only fact that differs from the actor above is the grant.
 */
function thePlainSecretary(): Actor {
  return { type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle, sessionId: null, stated: true }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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

let raised = false

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  records = await import('../src/server/lib/records.ts')
  presentation = await import('../src/server/lib/presentation.ts')
  workdomain = await import('../src/server/lib/workdomain.ts')
  regulations = await import('../src/server/lib/regulations.ts')
  pixel = await import('../src/server/lib/pixel-office.ts')
  goals = await import('../src/server/lib/goals.ts')

  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(started.status, started.said).toBe(201)
}, 120_000)

afterEach(async () => {
  // A grant left open would make the next case read as one with a period, so each case ends its own.
  if (!raised) return
  const ended = await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
  expect(ended.status, ended.said).toBe(200)
  raised = false
})

afterAll(async () => {
  await app.app.close()
  t.close()
})

/** Press the elevation through the app, so it is the product's own grant the guards read. */
async function press(endsWhen = 'when you say'): Promise<string> {
  const done = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen })
  expect(done.status, done.said).toBe(201)
  raised = true
  return String((done.body['elevation'] as { id: string }).id)
}

/** A real proposal, decision and human-made settling link, for the guard that reads them first. */
async function aSettledForkWithAHumanLink(): Promise<{
  proposalId: string
  decisionId: string
  proposalTitle: string
  decisionTitle: string
}> {
  const proposal = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'proposal',
    title: 'A fork the owner reserved',
    data: { question: 'Which?', options: ['One', 'Two'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
  })
  expect(proposal.status, proposal.said).toBe(201)
  const decision = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'decision',
    title: 'The answer the owner gave',
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'One of them.' },
  })
  expect(decision.status, decision.said).toBe(201)
  const proposalId = String((proposal.body['record'] as { id: string }).id)
  const decisionId = String((decision.body['record'] as { id: string }).id)
  const link = await ask('POST', '/api/links', AS_THE_PERSON, { fromId: decisionId, toId: proposalId, type: 'derived_from' })
  expect(link.status, link.said).toBe(201)
  return { proposalId, decisionId, proposalTitle: 'A fork the owner reserved', decisionTitle: 'The answer the owner gave' }
}

/**
 * A REAL BLOCK WITH A LIVE FALLBACK RUNNING ON IT, through the app.
 *
 * `assertMayChangeACanonicalMethod` refuses an agent only WHILE a fallback is live; with none, the
 * write is open to any worker and the actor question is never reached. A row that skipped this
 * setup would pass on both sides by returning early, so the act would read as measured when it was
 * not. This is what makes the block-method row ask the actor question at all.
 */
async function aBlockWithALiveFallback(): Promise<string> {
  const pipeline = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'pipeline', title: 'Perception', data: {} })
  expect(pipeline.status, pipeline.said).toBe(201)
  const pipelineId = String((pipeline.body['record'] as { id: string }).id)
  const block = await ask('POST', `/api/records/${pipelineId}/blocks`, AS_THE_PERSON, {
    name: 'Pixel segmentation',
    state: 'doing',
  })
  expect(block.status, block.said).toBe(201)
  const blockId = String((block.body['record'] as { id: string }).id)
  const method = await ask('PATCH', `/api/records/${blockId}`, AS_THE_PERSON, { dataPatch: { method: 'SAM segmentation' } })
  expect(method.status, method.said).toBe(200)
  const filed = await ask('POST', `/api/records/${blockId}/ran-instead`, asAgent('a-run'), {
    ran: 'Classical threshold segmentation.',
    because: 'SAM will not load here.',
    since: '2026-09-01',
    allowed_uses: ['downstream plumbing'],
    disallowed_claims: ['that SAM segmentation works'],
    severity: 'limits_claims',
  })
  expect(filed.status, filed.said).toBe(201)
  return blockId
}

/** One declared act, and the guard that stands in front of it, driven with the actor given. */
interface ActRow {
  act: string
  pass: (actor: Actor) => void
}

/** The act keys the declaration keeps for the person, from the registry itself. */
function theDeclaredActKeys(): string[] {
  return records.GOVERNANCE_GUARDS.filter((one) => one.personAct !== null)
    .map((one) => one.personAct as string)
    .sort()
}

/** The one act the declaration says an elevation never carries. */
const THE_ONE_IT_DOES_NOT_CARRY = 'regulation.revoke'

/**
 * EVERY ONE OF THE PERSON'S DECLARED ACTS, ONE ROW EACH, as a function of the actor.
 *
 * The rows are built once and driven twice: once with a real elevation held, once with none. Each
 * `pass` calls the guard directly, so a refusal is a `PanelError` the caller can see.
 */
function theDeclaredActs(
  fork: { proposalId: string; decisionId: string; proposalTitle: string; decisionTitle: string },
  fallbackBlock: string,
): ActRow[] {
  return [
    {
      act: 'decision.write',
      pass: (actor) =>
        records.assertMayWrite('decision', 'create', actor, 'A decision', {
          data: { decided_by: 'the owner', authority: 'the owner said so', because: 'Because.' },
        }),
    },
    {
      act: 'fork.settle',
      pass: (actor) =>
        records.assertMaySettleFork(
          { id: 'd-1', kind: 'decision', title: 'A decision' },
          { id: 'p-1', kind: 'proposal', title: 'A fork' },
          'derived_from',
          actor,
        ),
    },
    {
      act: 'fork.replace',
      pass: (actor) =>
        records.assertMayReplaceAFork(
          { id: 'p-1', kind: 'proposal', title: 'A fork' },
          { id: 'p-2', kind: 'proposal', title: 'The fork that replaced it' },
          'supersedes',
          actor,
        ),
    },
    {
      act: 'fork.reopen',
      pass: (actor) =>
        records.assertMayPutAForkBackOnTheQueue(
          { fromId: fork.decisionId, type: 'derived_from', toId: fork.proposalId },
          [
            { id: fork.decisionId, kind: 'decision', title: fork.decisionTitle },
            { id: fork.proposalId, kind: 'proposal', title: fork.proposalTitle },
          ],
          actor,
        ),
    },
    {
      act: 'fork.remove',
      pass: (actor) => records.assertMayRemoveAFork({ id: 'p-1', kind: 'proposal', title: 'A fork' }, actor),
    },
    {
      act: 'act.revoke',
      pass: (actor) => records.assertMayRevokeAnAct({ recordId: 'r-1', seq: 1, title: 'An act' }, actor),
    },
    {
      act: 'ask.remove',
      pass: (actor) =>
        records.assertMayRemoveAnAsk(
          { id: 'r-1', kind: 'note', title: 'A question', data: { whose_move: 'person', state: 'doing' }, deletedAt: null },
          { state: 'done' },
          actor,
        ),
    },
    {
      act: 'plan.commit',
      pass: (actor) => records.assertMayCommitAnIntent({ id: 'i-1', said: 'around 1.5', period: 'next week' }, actor),
    },
    {
      // Criterion S1. The person, or the secretary carrying the owner's words, puts a direction on the
      // shelf; it is declared under the person's own acts, so an elevation carries it and a plain
      // secretary is refused it.
      act: 'direction.shelve',
      pass: (actor) =>
        records.assertMayShelve(
          { id: 'd-1', title: 'A direction' },
          null,
          { shelved: { since: '2026-09-16', because: 'A reason to stop.', restart_when: 'A reason to start.' } },
          actor,
        ),
    },
    {
      // Criterion P1 and P17. An elevation carries `goal.confirm` because the declaration names it
      // under the person's own power; a plain agent, and an agent carrying a warrant, are refused.
      act: 'goal.confirm',
      pass: (actor) =>
        goals.assertMayConfirmAGoal({
          kind: 'goal',
          arriving: { confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16' } },
          actor,
        }),
    },
    { act: 'import.accept', pass: (actor) => records.assertMayAcceptAnImportPiece(actor) },
    {
      act: 'implementation.accept',
      pass: (actor) => records.assertMayAcceptAGuess({ id: 'g-1', recordId: 'r-1', pattern: 'src/x.ts', provenance: 'llm' }, actor),
    },
    { act: 'office.scene-settings.change', pass: (actor) => pixel.assertMayChangeTheOfficeScene(actor) },
    {
      act: 'module-graph.arrange',
      pass: (actor) =>
        presentation.assertMayArrangeTheModuleGraph(
          { kind: 'structure' } as unknown as Parameters<typeof presentation.assertMayArrangeTheModuleGraph>[0],
          actor,
        ),
    },
    {
      act: 'fork.pin',
      pass: (actor) => records.assertMayPinAFork({ data: { pinned: true }, stored: {}, recordId: null }, actor),
    },
    {
      act: 'fork.reclassify',
      pass: (actor) =>
        records.assertMayReclassifyAFork(
          { data: { who_settles_it: 'an agent' }, replacesEverything: false, stored: { who_settles_it: 'the owner' }, recordId: 'p-1' },
          actor,
        ),
    },
    {
      act: 'plan.shape',
      pass: (actor) => records.assertMayShapeTheFuture({ id: 't-1', kind: 'trajectory', title: 'A future' }, 'delete', actor),
    },
    {
      act: 'workdomain.change',
      pass: (actor) =>
        workdomain.assertMayChangeThisDomain({
          kind: 'work_domain',
          id: 'w-1',
          before: {},
          arriving: { resolved: { at: 'now', because: 'It was resolved.' } },
          actor,
        }),
    },
    {
      act: 'implementation.retire',
      pass: (actor) =>
        records.assertMayRetireSomebodyElsesRow(
          { id: 'i-1', recordId: 'r-1', pattern: 'src/x.ts', statedBy: `human:${THE_TEST_OFFICES_OWNER.id}` },
          actor,
        ),
    },
    {
      act: 'repository.repoint',
      pass: (actor) => records.assertMayRepointARepository({ id: 'repo-1', name: 'The repository', root: '/tmp/x' }, true, actor),
    },
    {
      act: 'restriction.dismiss',
      pass: (actor) =>
        records.assertMayDismissARestriction(
          { id: 'x-1', title: 'Nothing may be called final', severity: 'stops_final', writtenByAPerson: true },
          'r-1',
          'not_affected',
          actor,
        ),
    },
    {
      act: 'block.method.change',
      pass: (actor) =>
        records.assertMayChangeACanonicalMethod(
          { id: fallbackBlock, kind: 'block', title: 'Pixel segmentation', workspaceId: 'default' },
          { method: 'Run it another way.' },
          actor,
        ),
    },
    {
      act: 'regulation.revoke',
      pass: (actor) =>
        regulations.assertMayRevokeARegulation({
          kind: 'regulation',
          arriving: { revoked_at: '2026-09-12 10:00:00', revoked_because: 'The owner said so.' },
          actor,
        }),
    },
  ]
}

describe('under a granted elevation the secretary passes every declared act but one', () => {
  it('passes the acts it carries and refuses the one act it never carries', async () => {
    await press()
    const fork = await aSettledForkWithAHumanLink()
    const block = await aBlockWithALiveFallback()
    const rows = theDeclaredActs(fork, block)

    // THE SET, NOT A COUNT. An act added to the declaration with no row here is a failing build,
    // and the control says the two sides are non-empty so an empty equality cannot pass.
    const declared = theDeclaredActKeys()
    expect(declared.length).toBeGreaterThan(0)
    expect(rows.map((one) => one.act).sort()).toEqual(declared)

    for (const one of rows) {
      const actor = theElevatedSecretary(one.act)
      if (one.act === THE_ONE_IT_DOES_NOT_CARRY) {
        expect(() => one.pass(actor), `${one.act} was allowed, and the declaration says elevation never carries it`).toThrow()
        continue
      }
      expect(() => one.pass(actor), `${one.act} was refused to an elevated secretary`).not.toThrow()
    }
  })
})

describe('with no period open the secretary is refused every declared act', () => {
  it('refuses every declared act, driven at the same guards', async () => {
    const actor = thePlainSecretary()
    const fork = await aSettledForkWithAHumanLink()
    const block = await aBlockWithALiveFallback()
    const rows = theDeclaredActs(fork, block)

    expect(rows.map((one) => one.act).sort()).toEqual(theDeclaredActKeys())

    for (const one of rows) {
      expect(() => one.pass(actor), `${one.act} was allowed with no period open`).toThrow()
    }
  })
})

describe('the same acts through the app, so the route and the guard agree', () => {
  it('lets an elevated secretary write a decision over HTTP', async () => {
    await press()
    const done = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      kind: 'decision',
      title: 'A decision under the press',
      data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'Because.' },
      ...FOR_THE_PERSON,
    })
    expect(done.status, done.said).toBe(201)
  })

  it('lets an elevated secretary change the shared scene over HTTP', async () => {
    await press()
    const read = await ask('GET', '/api/office/scene-settings', asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    const body = (read.body['settings'] as Record<string, unknown>) ?? {}
    try {
      const done = await ask('PATCH', '/api/office/scene-settings', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
        ...body,
        ...FOR_THE_PERSON,
      })
      expect(done.status, done.said).toBe(200)
    } finally {
      // The scene is shared by every case, so this case leaves it as it found it.
      const restored = await ask('PATCH', '/api/office/scene-settings', AS_THE_PERSON, body)
      expect(restored.status, restored.said).toBe(200)
    }
  })

  it('refuses an elevated secretary a regulation revocation over HTTP, all the same', async () => {
    await press()
    const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'regulation',
      title: "A regulation of the owner's",
      data: { sentence: "A rule of the owner's.", binds: 'person', since: '2026-09-12' },
    })
    expect(filed.status, filed.said).toBe(201)
    const id = String((filed.body['record'] as { id: string }).id)
    const no = await ask('PATCH', `/api/records/${id}`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      dataPatch: { revoked_at: '2026-09-12 10:00:00', revoked_because: 'The owner said so.' },
    })
    expect(no.status).toBe(403)
  })
})
