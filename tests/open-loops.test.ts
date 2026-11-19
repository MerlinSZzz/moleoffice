// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS STILL OPEN, AND WHAT IT REFUSES TO DO TO FIT.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * ONE. The answer NAMES EVERY OPEN LOOP IN SCOPE, or names every id it left out and why. A reader
 * that quietly dropped one would report a short list as a complete answer, and the agent reading it
 * would file work that already exists. So the arithmetic is checked here on real rows: carried plus
 * left out equals every candidate, and every bucket carries its ids.
 *
 * TWO. EXCLUSIONS COME FROM STORED FACTS ONLY — the kind, the state word, the resolution of a fork,
 * the number of links from here, and when it last changed. A record whose PROSE is full of the
 * anchor's own words and which is joined to it by nothing is left out; a record that says nothing
 * about the anchor and is linked to it is carried. That pair is the whole rule, and it fails if
 * anybody ever reaches for the body.
 *
 * THREE. THE SIZE LIMIT IS MET BY SAYING LESS. A corpus too big to answer at the length asked for
 * comes back at a shorter length with the SAME loops in it. Only when the shortest length still
 * does not fit does anything come out, and then every id that came out is named.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE EACH ONE
 * ---------------------------------------------------------------------------------------
 *
 * Recorded in `design/round-nine/step53-56-open-loops.md`, each with the control run that came
 * first. In short:
 *
 *   carry the `finished` bucket's ids and drop the rest    → the naming check
 *   drop a loop instead of shortening it                   → the membership-at-every-rung check
 *   let the reach count anything it can reach              → the two distance buckets
 *   read `data.symptom` for the anchor's title             → the stored-facts-only pair
 *   report `nobody has said` as `either`                   → the fourth-answer check
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { MAIN_SUITE_FIX_EXAMPLE } from '../src/shared/main-suite-fix.ts'
import type { OpenLoops } from '../src/server/lib/openloops.ts'
import type { NeedsYouReply } from '../src/server/api/needs-you.ts'

/**
 * ONE OFFICE FOR THE FILE, A PROJECT FOR EACH CASE. A reading with no anchor answers about every
 * record in the project it is given, so each case gets a project of its own and the count it takes
 * sees only the records that case filed. The project is made in beforeEach.
 */
let WORKSPACE = 'default'
const headers = (): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
})

let t: TestDb
let app: FastifyInstance
let openLoopsFor: typeof import('../src/server/lib/openloops.ts')['openLoopsFor']
let whoseMoveIn: typeof import('../src/server/lib/openloops.ts')['whoseMoveIn']
let createWorkspace: typeof import('../src/server/lib/workspaces.ts')['createWorkspace']
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  const lib = await import('../src/server/lib/openloops.ts')
  openLoopsFor = lib.openLoopsFor
  whoseMoveIn = lib.whoseMoveIn
  createWorkspace = (await import('../src/server/lib/workspaces.ts')).createWorkspace
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { needsYouRoutes } = await import('../src/server/api/needs-you.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.register(needsYouRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: 'A case of its own' })
})

// -------------------------------------------------------------------------------- the corpus

function make(kind: string, title: string, data: Record<string, unknown> = {}): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind: kind as never, title, data, actor: AGENT }).id
}

function join(fromId: string, toId: string, type = 'relates_to'): void {
  t.api.createLink({ fromId, toId, type: type as never, actor: AGENT })
}

/** A module, one open task linked to it, one finished task, and one open problem two links away. */
function aSmallProject(): { module: string; open: string; done: string; far: string; loose: string } {
  const module = make('module', 'The gripper module', { state: 'active' })
  const open = make('task', 'Reprint the finger pads', { state: 'todo' })
  const done = make('task', 'Order the force gauge', { state: 'done' })
  const middle = make('task', 'Re-run the pinch test', { state: 'doing' })
  const far = make('problem', 'The pinch test wedges at 30 N', { state: 'open' })
  const loose = make('idea', 'Try a compliant finger', { state: 'new' })
  join(module, open)
  join(module, done)
  join(module, middle)
  join(middle, far)
  return { module, open, done, far, loose }
}

// ============================================================== naming, and the arithmetic

describe('the answer names what it carries and what it left out', () => {
  it('names every open loop in scope, each with its id', () => {
    const project = aSmallProject()
    const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 2 })
    const carried = answer.loops.map((loop) => loop.id).sort()
    expect(carried).toEqual([project.open, project.far, answer.loops.find((l) => l.hops === 1 && l.id !== project.open)?.id ?? ''].filter((id) => id !== '').sort())
    // Every carried loop says its id, its kind and the field its words came from, so nothing on
    // this list is a phrase a reader cannot check against a stored value.
    for (const loop of answer.loops) {
      expect(loop.id, 'a loop with no id is a row nobody can open').toMatch(/^[A-Za-z0-9_-]+$/)
      expect(loop.from).not.toBe('')
    }
  })

  it('names every id it left out, with the reason, in one bucket each', () => {
    const project = aSmallProject()
    const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 2 })

    const finished = answer.leftOut.find((group) => group.bucket === 'finished')
    expect(finished?.ids, 'the finished task is named, not counted').toContain(project.done)
    const unlinked = answer.leftOut.find((group) => group.bucket === 'not_linked_to_here')
    expect(unlinked?.ids, 'a loop joined to nothing is named as such').toContain(project.loose)

    // NOTHING IS IN TWO BUCKETS AND NOTHING IS IN NONE.
    const named = answer.leftOut.flatMap((group) => group.ids)
    expect(new Set(named).size, 'an id in two buckets is two reasons for one fact').toBe(named.length)
  })

  it('does not put the record you are standing at on the list of what is open around it', () => {
    const project = aSmallProject()
    // Stand at a problem rather than at the module: a module is not a loop kind, so it could never
    // appear, and the case that matters is standing at a piece of work.
    const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.far, reach: 2 })
    expect(answer.loops.map((loop) => loop.id), 'what is open AROUND a thing is not the thing').not.toContain(
      project.far,
    )
    expect(
      answer.leftOut.find((group) => group.bucket === 'where_you_are_standing')?.ids,
      'and it is left out by name, so the arithmetic still balances',
    ).toEqual([project.far])
  })

  it('adds up: carried plus left out is every candidate, exactly', () => {
    const project = aSmallProject()
    for (const reach of [0, 1, 2, 3]) {
      const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach })
      const named = answer.leftOut.reduce((sum, group) => sum + group.count, 0)
      expect(answer.loops.length + named, `at reach ${String(reach)}`).toBe(answer.counts.candidates)
      expect(answer.counts.leftOut).toBe(named)
    }
  })

  it('counts records of every other kind out of the population rather than into a bucket', () => {
    aSmallProject()
    make('note', 'A note about the bench', { body: 'nothing to do here' })
    make('session', 'A run', { state: 'finished', runtime: 'claude-code' })
    const answer = openLoopsFor({ workspaceId: WORKSPACE })
    expect(answer.counts.outsideThePopulation, 'the module, the note and the session').toBeGreaterThanOrEqual(3)
    const named = answer.leftOut.flatMap((group) => group.ids)
    expect(named, 'a note is not a loop that was passed over; it was never a candidate').not.toContain(
      answer.standingAt?.id ?? '',
    )
  })
})

// ============================================================== stored facts, never the body

// Criterion first: U3sKBmfkPgq7 and u7VfWBKsLFVx, forwarded whole in C4tuNb6JK5tP.
// OLD: every finished record claimed an own stored state word, in one group.
// NEW: stored and derived finished records have their own exact sentences, ids and counts;
// the stored-only serialized shape stays byte for byte unchanged, with no stateSource field.
// WHY: a canonical ended reading from mainSuiteFix is not a stored state word.
describe('finished reasons name the provenance without changing membership', () => {
  it('groups mixed stored and derived finished records with exact words ids and counts over both HTTP readings', async () => {
    const anchor = make('module', 'Synthetic finished-reason module')
    const returned = { ...structuredClone(MAIN_SUITE_FIX_EXAMPLE), outcome: { returned: 'synthetic-landed-return' } }
    const fixed = { ...structuredClone(MAIN_SUITE_FIX_EXAMPLE), outcome: { fixed: 'c'.repeat(40) },
      fixedReceipt: { recordId: 'synthetic-green-receipt', seq: 1, contentHash: '1'.repeat(16) } }
    const problem = (title: string, data: Record<string, unknown>) => {
      const id = make('problem', title)
      writeDataBypassingTheGate(t, id, data)
      return id
    }
    const stored = [make('task', 'Synthetic stored done', { state: 'done' }),
      problem('Synthetic explicit accepted beats derived returned', { state: 'accepted', mainSuiteFix: returned })]
    const derived = [problem('Synthetic verified fixed one', { mainSuiteFix: fixed }),
      problem('Synthetic verified fixed two', { mainSuiteFix: fixed }),
      problem('Synthetic actually returned', { mainSuiteFix: returned })]
    const open = [problem('Synthetic pending repair', { mainSuiteFix: structuredClone(MAIN_SUITE_FIX_EXAMPLE) }),
      problem('Synthetic stored open beats ended repair', { state: 'open', mainSuiteFix: returned }),
      problem('Synthetic stored null beats ended repair', { state: null, mainSuiteFix: returned }),
      problem('Synthetic invalid repair stays unknown', { mainSuiteFix: {} })]
    for (const id of [...stored, ...derived, ...open]) join(anchor, id)
    const dataBefore = [...stored, ...derived, ...open].map(id => t.api.getRecord(id)!.data)
    for (const url of [`/api/open-loops?about=${anchor}&reach=1`, `/api/records/${anchor}/context?reach=1`]) {
      const response = await app.inject({ method: 'GET', url, headers: headers() })
      expect(response.statusCode, response.body).toBe(200)
      const answer = response.json() as OpenLoops
      expect(answer.leftOut.map(group => ({ ...group, ids: [...group.ids].sort() }))).toStrictEqual([
        { bucket: 'finished', sentence: 'its own state word says the work reached its end', count: 2, ids: [...stored].sort() },
        { bucket: 'finished', stateSource: 'derived from mainSuiteFix',
          sentence: 'the work has reached its end, as worked out from its fix-round record', count: 3, ids: [...derived].sort() },
      ])
      expect(answer.loops.map(row => row.id).sort()).toEqual([...open].sort())
      const named = [...answer.loops.map(row => row.id), ...answer.leftOut.flatMap(group => group.ids)]
      expect(new Set(named).size).toBe(named.length)
      expect(named.sort()).toEqual([...stored, ...derived, ...open].sort())
      expect(answer.counts).toMatchObject({ candidates: 9, carried: 4, leftOut: 5 })
      expect(answer.leftOut.reduce((sum, group) => sum + group.count, 0)).toBe(answer.counts.leftOut)
    }
    expect([...stored, ...derived, ...open].map(id => t.api.getRecord(id)!.data)).toEqual(dataBefore)
    for (const id of derived) expect(Object.hasOwn(t.api.getRecord(id)!.data, 'state')).toBe(false)
  })

  it('keeps the stored-only finished group byte for byte unchanged without optional provenance', async () => {
    const id = make('task', 'Synthetic stored-only finished task', { state: 'done' })
    const response = await app.inject({ method: 'GET', url: '/api/open-loops', headers: headers() })
    expect(response.statusCode, response.body).toBe(200)
    const answer = response.json() as OpenLoops
    expect(JSON.stringify(answer.leftOut)).toBe(JSON.stringify([
      { bucket: 'finished', sentence: 'its own state word says the work reached its end', count: 1, ids: [id] },
    ]))
    expect(answer.counts).toMatchObject({ candidates: 1, carried: 0, leftOut: 1 })
  })
})

describe('what is left out is decided by stored facts and never by reading a body', () => {
  it('leaves out a record whose prose is all about the anchor and which nothing links to it', () => {
    const project = aSmallProject()
    const talksAboutIt = make('problem', 'The gripper module keeps failing', {
      state: 'open',
      symptom: 'The gripper module wedges. See the gripper module. The gripper module again.',
    })
    const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 2 })
    expect(answer.loops.map((loop) => loop.id)).not.toContain(talksAboutIt)
    const unlinked = answer.leftOut.find((group) => group.bucket === 'not_linked_to_here')
    expect(unlinked?.ids).toContain(talksAboutIt)
  })

  it('carries a record that says nothing about the anchor and is linked to it', () => {
    const project = aSmallProject()
    const silent = make('task', 'Sharpen the pencils', { state: 'todo' })
    join(project.module, silent)
    const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 1 })
    expect(answer.loops.map((loop) => loop.id)).toContain(silent)
  })

  it('tells "further than the reach" apart from "joined to nothing"', () => {
    const project = aSmallProject()
    const near = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 1 })
    const beyond = near.leftOut.find((group) => group.bucket === 'beyond_reach')
    const unlinked = near.leftOut.find((group) => group.bucket === 'not_linked_to_here')
    expect(beyond?.ids, 'two links away, at reach one').toContain(project.far)
    expect(unlinked?.ids, 'joined to nothing at any reach').toContain(project.loose)
    expect(beyond?.ids).not.toContain(project.loose)

    const wider = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 2 })
    expect(wider.loops.map((loop) => loop.id), 'the same record, one link further out').toContain(project.far)
  })

  it('leaves a finished fork out through the same reading that answers needs-you', async () => {
    const proposal = make('proposal', 'Which tokeniser?', {
      question: 'Which tokeniser?',
      options: ['bigrams', 'trigrams'],
    })
    const decision = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'decision',
      title: 'Bigrams',
      data: { decided_on: '2026-08-20' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id

    const before = openLoopsFor({ workspaceId: WORKSPACE })
    expect(before.loops.map((loop) => loop.id), 'an unsettled fork is an open loop').toContain(proposal)
    expect(before.loops.find((loop) => loop.id === proposal)?.onlyAPersonCanSettle).toBe(true)

    t.api.createLink({ fromId: decision, toId: proposal, type: 'derived_from', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })

    const after = openLoopsFor({ workspaceId: WORKSPACE })
    expect(after.loops.map((loop) => loop.id)).not.toContain(proposal)
    expect(after.leftOut.find((group) => group.bucket === 'settled')?.ids).toContain(proposal)
  })
})

// ============================================================== the size limit

describe('the size limit is met by saying less, never by carrying fewer', () => {
  /** Forty problems, each with a long summary, so a gist-length answer cannot fit in 16 KB. */
  function aCrowdedProject(): string[] {
    const ids: string[] = []
    for (let n = 0; n < 40; n += 1) {
      ids.push(
        t.api.createRecord({
          workspaceId: WORKSPACE,
          kind: 'problem',
          title: `Problem number ${String(n)} on the bench rig, seen while running the pinch test`,
          summary:
            `The rig stops at ${String(n)} newtons and the log says nothing about why. ` +
            'It has been seen on three separate days, on two different machines, and the only thing they have in ' +
            'common is that the gauge was borrowed. This sentence is here to make the answer big.',
          data: { state: 'open' },
          actor: AGENT,
        }).id,
      )
    }
    return ids
  }

  it('comes back under 16 KB with the same loops in it, at a shorter length', () => {
    const ids = aCrowdedProject()
    const asked = openLoopsFor({ workspaceId: WORKSPACE, rung: 'sketch' })
    expect(Buffer.byteLength(JSON.stringify(asked), 'utf8'), 'the whole answer').toBeLessThan(16 * 1024)
    expect(asked.rung.asked).toBe('sketch')
    expect(asked.rung.drew, 'it said less rather than carrying fewer').not.toBe('sketch')
    expect(asked.rung.why, 'and it says why').not.toBeNull()
    expect(asked.loops.map((loop) => loop.id).sort(), 'every one of them is still here').toEqual([...ids].sort())
    expect(asked.counts.carried).toBe(ids.length)
  })

  it('changing the length changes how much each says and not which ones appear', () => {
    aCrowdedProject()
    const short = openLoopsFor({ workspaceId: WORKSPACE, rung: 'label' })
    const long = openLoopsFor({ workspaceId: WORKSPACE, rung: 'sketch' })
    expect(short.loops.map((loop) => loop.id)).toEqual(long.loops.map((loop) => loop.id))
  })

  it('drops loops only when the shortest length still does not fit, and names every one', () => {
    // Sixty of them against a 4 KB budget: naming sixty ids costs about 1 KB, so there is room to
    // name what came out and the last resort really can succeed. A budget is passed rather than the
    // corpus being made enormous, because the rule under test is what happens when it does not fit.
    const ids: string[] = []
    for (let n = 0; n < 60; n += 1) {
      ids.push(make('task', `Task ${String(n)} on the bench rig, with a title long enough to cost something`, { state: 'todo' }))
    }
    const answer = openLoopsFor({ workspaceId: WORKSPACE, budgetBytes: 4 * 1024 })
    expect(Buffer.byteLength(JSON.stringify(answer), 'utf8')).toBeLessThan(4 * 1024)
    expect(answer.size.fits, 'it really came in under the size it was asked for').toBe(true)
    const dropped = answer.leftOut.find((group) => group.bucket === 'quiet_the_longest')
    expect(dropped, 'something came out and it has to be named').toBeDefined()
    expect(dropped?.count).toBeGreaterThan(0)
    expect(dropped?.ids.length, 'named one by one, not counted').toBe(dropped?.count)
    expect(answer.loops.length + (dropped?.count ?? 0), 'still adds up').toBe(ids.length)
    expect(answer.rung.why, 'and the reply says what happened').toContain('came out')

    // THE OLDEST COME OUT, WHICH IS A STORED FACT AND NOT A JUDGEMENT. Every carried loop changed
    // no earlier than every dropped one.
    const carriedOldest = answer.loops.map((loop) => loop.lastChanged).sort()[0] ?? ''
    for (const id of dropped?.ids ?? []) {
      const record = t.api.getRecord(id)
      expect((record?.updatedAt ?? '') <= carriedOldest, `${id} came out and is no newer than what stayed`).toBe(true)
    }
  })

  it('says so rather than lying when nothing it could answer fits in the size asked for', () => {
    // Two hundred loops and 2 KB: naming the ids it left out costs more than the whole budget, so
    // there is no honest answer under it. The answer is still sent, whole, and says it is over.
    for (let n = 0; n < 200; n += 1) make('task', `Task ${String(n)} on the bench rig`, { state: 'todo' })
    const answer = openLoopsFor({ workspaceId: WORKSPACE, budgetBytes: 2 * 1024 })
    expect(Buffer.byteLength(JSON.stringify(answer), 'utf8'), 'over the budget, and not pretending').toBeGreaterThan(
      2 * 1024,
    )
    expect(answer.size.fits, 'the answer carries its own verdict').toBe(false)
    expect(answer.rung.why).toContain('over the size asked for')
    // AND NOTHING WAS LOST TO MAKE THE NUMBER COME OUT RIGHT.
    const named = answer.leftOut.reduce((sum, group) => sum + group.count, 0)
    expect(answer.loops.length + named).toBe(answer.counts.candidates)
  })
})

// ============================================================== the module line

describe('every reply says how many open loops attach to no module', () => {
  it('carries the two numbers and the sentence, on a module-scoped reading', () => {
    const project = aSmallProject()
    const answer = openLoopsFor({ workspaceId: WORKSPACE, anchorId: project.module, reach: 1 })
    expect(answer.attachment.openLoopsInProject, 'four open loops: two tasks, a problem and an idea').toBe(4)
    expect(answer.attachment.attachedToNoModule, 'the far problem and the loose idea').toBe(2)
    expect(answer.attachment.sentence).toContain('2 of the 4')
    expect(answer.loops.length, 'and the scoped list is shorter than the project').toBeLessThan(
      answer.attachment.openLoopsInProject,
    )
  })

  it('says it on a whole-project reading too, so one reply cannot mean two things', () => {
    aSmallProject()
    const answer = openLoopsFor({ workspaceId: WORKSPACE })
    expect(answer.attachment.openLoopsInProject).toBe(4)
    expect(answer.attachment.sentence).not.toBe('')
  })
})

// ============================================================== whose move it is

describe('whose move it is', () => {
  it('keeps "nobody has said" apart from "either"', () => {
    const said = make('task', 'Wire the gauge', { state: 'todo', whose_move: 'either' })
    const unsaid = make('task', 'Print the pads', { state: 'todo' })
    const reading = whoseMoveIn(WORKSPACE)
    expect(reading.either.map((loop) => loop.id)).toEqual([said])
    expect(reading.nobodyHasSaid.ids).toEqual([unsaid])
    expect(reading.nobodyHasSaid.count).toBe(1)
    expect(reading.person, 'nothing is read into the gap').toEqual([])
  })

  it('is refused a word nobody declared, so the queue cannot be filled with invented roles', async () => {
    const id = make('task', 'Wire the gauge', { state: 'todo' })
    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: headers(),
      payload: { dataPatch: { whose_move: THE_TEST_OFFICES_OWNER.id } },
    })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toContain('person, agent, either')
  })

  it('cannot put anything into the queue of what only a person may do, or take anything out', async () => {
    // The permission boundary, stated as a test rather than as a comment. `needs-you` answers from
    // the KIND and the resolution; an agent writing `whose_move` must not be able to move that list.
    const proposal = make('proposal', 'Which tokeniser?', { question: 'Which?', options: ['a', 'b'] })
    const before = await app.inject({ method: 'GET', url: '/api/needs-you', headers: headers() })
    const was = (before.json() as NeedsYouReply).actions.map((one) => one.recordId)
    expect(was).toContain(proposal)

    const task = make('task', 'Something an agent could do', { state: 'todo' })
    await app.inject({
      method: 'PATCH',
      url: `/api/records/${task}`,
      headers: headers(),
      payload: { dataPatch: { whose_move: 'person' } },
    })
    const after = await app.inject({ method: 'GET', url: '/api/needs-you', headers: headers() })
    expect((after.json() as NeedsYouReply).actions.map((one) => one.recordId), 'unchanged, both ways').toEqual(was)
  })
})

// ============================================================== what must not be repeated

describe('what has already been tried', () => {
  it('hands a fresh agent the line that says what not to repeat, without opening a transcript', () => {
    const problem = make('problem', 'The port stays held after the server is killed', {
      state: 'open',
      attempts: [
        {
          id: 'a-kill-parent',
          tried: 'Killed the tsx parent with kill -TERM on its pid.',
          result: 'The shell printed Terminated and ss still showed the port held.',
          do_not_repeat: 'Do not kill the parent by pid: it looks like it worked and leaves the port held.',
        },
        {
          id: 'a-ss',
          tried: 'Checked with ss -ltn afterwards.',
          result: 'It showed 8787 still listening.',
          still_useful: 'ss is the check that says whether the port is really free.',
        },
      ],
    })
    const answer = openLoopsFor({ workspaceId: WORKSPACE })
    const row = answer.loops.find((loop) => loop.id === problem)
    expect(row?.attempts, 'both attempts are counted').toBe(2)
    expect(row?.doNotRepeat, 'and the one dead end is quoted, in the author’s own words').toEqual([
      'Do not kill the parent by pid: it looks like it worked and leaves the port held.',
    ])
  })

  it('refuses two attempts on one problem sharing an id, and stores nothing', async () => {
    // The id is how one attempt is addressed — `data.attempts[#a-1]` in the history — so two
    // sharing one makes the first ambiguous and a change to either prints both arrays whole.
    // `tests/an-id-names-one-thing.test.ts` names this file as where that refusal is exercised.
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: headers(),
      payload: {
        kind: 'problem',
        title: 'The port stays held',
        data: {
          state: 'open',
          attempts: [
            { id: 'a-1', tried: 'Killed the parent.', result: 'The port was still held.' },
            { id: 'a-1', tried: 'Killed the group.', result: 'The port came back.' },
          ],
        },
      },
    })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toContain('may not share an id')
  })

  it('refuses an attempt with no result, because an attempt with no result is a rumour', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: headers(),
      payload: {
        kind: 'problem',
        title: 'The port stays held',
        data: { state: 'open', attempts: [{ id: 'a-1', tried: 'Killed the parent.' }] },
      },
    })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toContain('result')
  })
})

// ============================================================== over HTTP

describe('the three ways in answer out of one reading', () => {
  it('answers the same loops standing at a record and asking the project about it', async () => {
    const project = aSmallProject()
    const scoped = await app.inject({
      method: 'GET',
      url: `/api/records/${project.module}/context?reach=1`,
      headers: headers(),
    })
    const asked = await app.inject({
      method: 'GET',
      url: `/api/open-loops?about=${project.module}&reach=1`,
      headers: headers(),
    })
    expect(scoped.statusCode).toBe(200)
    expect((scoped.json() as OpenLoops).loops.map((one) => one.id)).toEqual(
      (asked.json() as OpenLoops).loops.map((one) => one.id),
    )
  })

  it('refuses a rung nobody declared rather than quietly answering at another one', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/open-loops?rung=medium', headers: headers() })
    expect(answer.statusCode).toBe(400)
    expect(answer.json().error).toContain('rung must be one of')
  })

  it('answers a record that is not there by saying so, not with an empty list', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/records/nosuchrecord/context', headers: headers() })
    expect(answer.statusCode).toBe(404)
  })
})
