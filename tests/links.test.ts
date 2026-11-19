// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Links: stored once, shown from both ends, never silently dropped.
 *
 * The two queries at the bottom — unconsumed() and unmetDependencies() — are the reason links
 * are typed rather than plain, so they get tested here alongside the links themselves.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, apiApp, expectPanelError, freshDb, one, type TestDb } from './helpers.ts'
import { LINK_TYPES, type PanelRecord } from '@shared/types.ts'
// The words for a gate are written once, in shared/work.ts. The assertions below ask that
// function what an edge says rather than repeating the sentence, so a change to the wording
// cannot leave this file passing while every screen reads differently.
import { gateLabel } from '@shared/work.ts'

let t: TestDb
let app: FastifyInstance
/** Each case works in its own project, so a reading over that project sees only that case's rows. */
let HERE = 'default'
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  HERE = `links-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: HERE, title: `Links case ${String(caseNumber)}` })
})

/** Shorthand: most of these tests need a couple of records and do not care about their fields. */
const make = (kind: PanelRecord['kind'], title: string) => t.api.createRecord({ workspaceId: HERE, kind, title, actor: t.api.HUMAN })

describe('storing a link', () => {
  it('stores it once — creating the same link twice returns the id it already had', () => {
    const gripper = make('module', 'Tray clamp')
    const calib = make('module', '夹具标定')

    const first = t.api.createLink({ fromId: calib.id, toId: gripper.id, type: 'measures', actor: t.api.HUMAN })
    const again = t.api.createLink({ fromId: calib.id, toId: gripper.id, type: 'measures', actor: t.api.HUMAN })

    expect(again.id).toBe(first.id)
    expect(t.api.resolveLinks(gripper.id)).toHaveLength(1)
    // The duplicate attempt was not logged as a second linking event either.
    expect(t.api.listChanges({ workspaceId: HERE, recordId: calib.id }).filter((c) => c.op === 'link')).toHaveLength(1)
  })

  it('treats a different type between the same two records as a different link', () => {
    const a = make('module', 'Tray clamp')
    const b = make('claim', 'Zero-velocity beats every learned predictor past 200ms')

    const l1 = t.api.createLink({ fromId: a.id, toId: b.id, type: 'produces', actor: t.api.HUMAN })
    const l2 = t.api.createLink({ fromId: a.id, toId: b.id, type: 'relates_to', actor: t.api.HUMAN })

    expect(l2.id).not.toBe(l1.id)
    expect(t.api.resolveLinks(a.id)).toHaveLength(2)
  })

  it('refuses a link to a record that does not exist, and one from a record to itself', () => {
    const a = make('module', 'Tray clamp')
    expectPanelError(t, () => t.api.createLink({ fromId: a.id, toId: 'nope', actor: t.api.HUMAN }), 404)
    expectPanelError(t, () => t.api.createLink({ fromId: a.id, toId: a.id, actor: t.api.HUMAN }), 400)
    expect(t.api.resolveLinks(a.id)).toHaveLength(0)
  })
})

describe('a gate says how much a blocks link blocks', () => {
  /** The blocker and the blocked, in that order. */
  function pair(): [PanelRecord, PanelRecord] {
    return [make('problem', 'The real arm is in pieces'), make('module', 'YuMi digital twin')]
  }

  it('stores a hard gate and serves it on BOTH ends, in the words shared/work.ts writes', () => {
    const [arm, twin] = pair()
    t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', gate: { kind: 'hard' }, actor: t.api.HUMAN })

    // The end that stores the link.
    const onBlocker = one(t.api.resolveLinks(arm.id), 'link on the blocker')
    expect(onBlocker.gate).toEqual({ kind: 'hard' })
    expect(onBlocker.gateLabel).toBe(gateLabel({ kind: 'hard' }))
    expect(onBlocker.gateProblem).toBeNull()

    // The end that does NOT store it, which is the one that has to say what it is waiting for.
    const onBlocked = one(t.api.resolveLinks(twin.id), 'backlink on the blocked record')
    expect(onBlocked.isBacklink).toBe(true)
    expect(onBlocked.label).toBe('blocked by')
    expect(onBlocked.gate).toEqual({ kind: 'hard' })
    expect(onBlocked.gateLabel).toBe(gateLabel({ kind: 'hard' }))
  })

  it('carries how far a partial gate lets the blocked work get', () => {
    const [arm, twin] = pair()
    const gate = { kind: 'partial', upTo: 'kinematics checked' } as const
    t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', gate, actor: t.api.HUMAN })

    const onBlocked = one(t.api.resolveLinks(twin.id), 'backlink on the blocked record')
    expect(onBlocked.gate).toEqual(gate)
    // The stage is IN the sentence, because "partially blocked" with no stage is what this whole
    // vocabulary exists to stop being written.
    expect(onBlocked.gateLabel).toBe(gateLabel(gate))
    expect(onBlocked.gateLabel).toContain('kinematics checked')
  })

  it('refuses a partial gate that does not say how far, and stores no link at all', () => {
    const [arm, twin] = pair()
    const err = expectPanelError(
      t,
      () =>
        t.api.createLink({
          fromId: arm.id,
          toId: twin.id,
          type: 'blocks',
          gate: { kind: 'partial' },
          actor: t.api.HUMAN,
        }),
      400,
    )
    expect(err.message).toContain('upTo')
    // A refusal, not a warning: half a gate stored would read as "as far as (unstated)" on the
    // blocked record, which is worse than the hard gate it would otherwise have been.
    expect(t.api.resolveLinks(arm.id)).toHaveLength(0)
  })

  it('refuses a gate on a link type that states no dependency', () => {
    const claim = make('claim', 'Zero-velocity beats every learned predictor past 200ms')
    const task = make('task', 'Replay the 07-30 captures')
    const err = expectPanelError(
      t,
      () =>
        t.api.createLink({
          fromId: task.id,
          toId: claim.id,
          type: 'consumes',
          gate: { kind: 'hard' },
          actor: t.api.HUMAN,
        }),
      400,
    )
    expect(err.message).toContain('blocks')
    expect(t.api.resolveLinks(task.id)).toHaveLength(0)
  })

  it('leaves an unqualified blocks link unqualified — a null gate is not a hard one', () => {
    const [arm, twin] = pair()
    t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', actor: t.api.HUMAN })

    const link = one(t.api.resolveLinks(twin.id), 'backlink')
    // Every blocks link written before the columns existed reads exactly like this. Serving
    // `hard` here would put a word in the author's mouth and make mostly-doable work look stuck.
    expect(link.gate).toBeNull()
    expect(link.gateLabel).toBeNull()
    expect(link.gateProblem).toBeNull()
  })

  it('is idempotent for the same gate, and refuses to overwrite a different one', () => {
    const [arm, twin] = pair()
    const gate = { kind: 'partial', upTo: 'kinematics checked' } as const
    const first = t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', gate, actor: t.api.HUMAN })

    // The same request twice is the same link, as it has always been.
    const again = t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', gate, actor: t.api.HUMAN })
    expect(again.id).toBe(first.id)
    // And so is a repeat that says nothing about the gate.
    expect(t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', actor: t.api.HUMAN }).id).toBe(first.id)

    // A different gate is somebody's statement being replaced, so nothing happens and the caller
    // is told what is stored and how to change it.
    const err = expectPanelError(
      t,
      () =>
        t.api.createLink({
          fromId: arm.id,
          toId: twin.id,
          type: 'blocks',
          gate: { kind: 'hard' },
          actor: t.api.HUMAN,
        }),
      409,
    )
    expect(err.message).toContain(first.id)
    expect(err.message).toContain('kinematics checked')
    expect(one(t.api.resolveLinks(twin.id), 'backlink').gate).toEqual(gate)
  })

  it('reports a stored gate nobody can read rather than serving null and looking unqualified', () => {
    const [arm, twin] = pair()
    const made = t.api.createLink({ fromId: arm.id, toId: twin.id, type: 'blocks', gate: { kind: 'hard' }, actor: t.api.HUMAN })

    // Only reachable by editing the row by hand, which is why it is written by hand here. The
    // point is that "somebody said something unreadable" does not come back as "nobody said".
    // The office now holds other cases' links too, so the hand edit names this case's row.
    t.client.sqlite.prepare("UPDATE links SET gate = 'mostly' WHERE id = ?").run(made.id)

    const link = one(t.api.resolveLinks(twin.id), 'backlink')
    expect(link.gate).toBeNull()
    expect(link.gateLabel).toBeNull()
    expect(link.gateProblem).toContain('mostly')
  })
})

describe('resolveLinks labels each end from its own point of view', () => {
  it('shows the forward label on the source and the reverse label on the target', () => {
    const problem = make('problem', 'Placement runs through the recipe planner solver, which cannot hold jaw pose precisely')
    const task = make('task', 'Run the rig_60mm wizard')

    t.api.createLink({ fromId: problem.id, toId: task.id, type: 'blocks', actor: t.api.HUMAN })

    // Looking at the problem: it blocks the task.
    const onSource = one(t.api.resolveLinks(problem.id), 'link on the source')
    expect(onSource.label).toBe('blocks')
    expect(onSource.isBacklink).toBe(false)
    expect(onSource.other.title).toBe('Run the rig_60mm wizard')

    // Looking at the task: it is blocked by the problem. Same single row, other label.
    const onTarget = one(t.api.resolveLinks(task.id), 'link on the target')
    expect(onTarget.label).toBe('blocked by')
    expect(onTarget.isBacklink).toBe(true)
    expect(onTarget.other.title).toBe('Placement runs through the recipe planner solver, which cannot hold jaw pose precisely')

    expect(onTarget.linkId).toBe(onSource.linkId)
  })

  it('uses the same label both ways for a symmetric type', () => {
    const a = make('module', 'Tray clamp')
    const b = make('module', 'Close-up camera')
    t.api.createLink({ fromId: a.id, toId: b.id, type: 'relates_to', actor: t.api.HUMAN })
    expect(one(t.api.resolveLinks(a.id), 'link').label).toBe('relates to')
    expect(one(t.api.resolveLinks(b.id), 'link').label).toBe('relates to')
  })

  it('carries the inferred flag through, so a guessed link can be shown differently', () => {
    const a = make('session', 'Agent session 2026-07-30')
    const b = make('module', 'Tray clamp')
    t.api.createLink({ fromId: a.id, toId: b.id, type: 'discusses', inferred: true, actor: AGENT })
    expect(one(t.api.resolveLinks(b.id), 'link').inferred).toBe(true)
  })
})

describe('linking by typing a title', () => {
  it('links when the title exists', () => {
    const task = make('task', 'Run the rig_60mm wizard')
    make('module', 'Tray clamp')

    t.api.linkByTitle(task.id, 'Tray clamp', 'part_of', t.api.HUMAN, HERE)

    expect(one(t.api.resolveLinks(task.id), 'link').other.title).toBe('Tray clamp')
  })

  it('throws when the title does not exist, and creates nothing to satisfy it', () => {
    const task = make('task', 'Run the rig_60mm wizard')

    const err = expectPanelError(t, () => t.api.linkByTitle(task.id, 'Grippr', 'part_of', t.api.HUMAN, HERE), 404)
    expect(err.message).toMatch(/Grippr/)

    // No invented record, and no link. A guessed record here would be a silent fallback: you
    // would think you had linked to the gripper and you would have linked to a typo.
    expect(t.api.getRecordByTitle('Grippr', HERE)).toBeNull()
    expect(t.api.listRecords({ workspaceId: HERE })).toHaveLength(1)
    expect(t.api.resolveLinks(task.id)).toHaveLength(0)
  })
})

/**
 * A NAME THAT RESOLVES TO A DELETED RECORD.
 *
 * Until 2026-08-10 this was a 201. `getRecordByTitle` returns deleted rows — it has to, because a
 * title stays taken after a delete — so the link was made and drawn as broken the instant it
 * existed, and the caller was told it had worked. Mole Office never truly deletes, so those titles stay
 * in the table for ever and the wrong answer could be given for ever.
 */
describe('linking by typing the title of a deleted record', () => {
  /** A task, and a claim that has been retracted. The pair the seed corpus actually contains. */
  function taskAndRetractedClaim(): [PanelRecord, PanelRecord] {
    const task = make('task', 'Run the rig_60mm wizard')
    const claim = make('claim', 'Setting 12 holding force is enough for the 60 mm pot')
    t.api.deleteRecord(claim.id, t.api.HUMAN)
    return [task, claim]
  }

  it('refuses with 409, names the deleted record, and stores nothing', () => {
    const [task, claim] = taskAndRetractedClaim()

    const err = expectPanelError(
      t,
      () => t.api.linkByTitle(task.id, 'Setting 12 holding force is enough for the 60 mm pot', 'consumes', t.api.HUMAN, HERE),
      409,
    )

    // Not "nothing is called that" — that would be false, and the reader typed a name they
    // believed in. The message says which record it is and when it went.
    expect(err.message).toContain('Setting 12 holding force is enough for the 60 mm pot')
    expect(err.message).toContain('claim')
    const deletedAt = t.api.getRecord(claim.id)?.deletedAt
    if (deletedAt === null || deletedAt === undefined) throw new Error('the claim was supposed to be deleted')
    expect(err.message).toContain(deletedAt)

    // Both ways out are in the message, as requests that can be copied.
    expect(err.message).toContain(`POST /api/records/${claim.id}/restore`)
    expect(err.message).toContain(`"toId":"${claim.id}"`)

    // And nothing was written: no link at all, not even a broken one.
    expect(t.api.resolveLinks(task.id)).toHaveLength(0)
    expect(t.api.listChanges({ workspaceId: HERE, recordId: task.id }).filter((c) => c.op === 'link')).toHaveLength(0)
  })

  it('still allows the same link by id, because an id says you have seen which record it is', () => {
    const [task, claim] = taskAndRetractedClaim()

    // Deliberate, and the refusal above names it: a task that consumes a claim somebody has since
    // retracted is a real thing to record, and unmetDependencies() exists to list exactly those.
    t.api.createLink({ fromId: task.id, toId: claim.id, type: 'consumes', actor: t.api.HUMAN })

    const link = one(t.api.resolveLinks(task.id), 'link')
    expect(link.broken).toBe(true)
    expect(t.api.unmetDependencies(HERE).map((u) => u.missingTitle)).toContain(
      'Setting 12 holding force is enough for the 60 mm pot',
    )
  })

  it('links by name again once the record is restored', () => {
    const [task, claim] = taskAndRetractedClaim()
    t.api.restoreRecord(claim.id, t.api.HUMAN)

    t.api.linkByTitle(task.id, 'Setting 12 holding force is enough for the 60 mm pot', 'consumes', t.api.HUMAN, HERE)

    expect(one(t.api.resolveLinks(task.id), 'link').broken).toBe(false)
  })

  it('tells a misspelling and a deleted record apart, because they are fixed differently', () => {
    const [task] = taskAndRetractedClaim()

    // Two different statuses, so a caller can tell them apart without reading English: 404 means
    // type it again, 409 means the record is there and something has to be decided about it.
    expectPanelError(t, () => t.api.linkByTitle(task.id, 'Effort 12 grip force', 'consumes', t.api.HUMAN, HERE), 404)
    expectPanelError(
      t,
      () => t.api.linkByTitle(task.id, 'Setting 12 holding force is enough for the 60 mm pot', 'consumes', t.api.HUMAN, HERE),
      409,
    )
  })
})

describe('links to a deleted record', () => {
  it('are marked broken and still returned, and unbreak when the record comes back', () => {
    const task = make('task', 'Run the rig_60mm wizard')
    const claim = make('claim', 'Setting 12 holding force is enough for the 60 mm pot')
    t.api.createLink({ fromId: task.id, toId: claim.id, type: 'consumes', actor: t.api.HUMAN })

    expect(one(t.api.resolveLinks(task.id), 'link').broken).toBe(false)

    t.api.deleteRecord(claim.id, t.api.HUMAN)

    // Still there. Hiding it would mean the task looked fine while the thing it depends on
    // had been retracted — exactly the failure Mole Office exists to prevent.
    const broken = one(t.api.resolveLinks(task.id), 'link')
    expect(broken.broken).toBe(true)
    expect(broken.other.title).toBe('Setting 12 holding force is enough for the 60 mm pot')
    expect(broken.label).toBe('consumes')

    t.api.restoreRecord(claim.id, t.api.HUMAN)
    expect(one(t.api.resolveLinks(task.id), 'link').broken).toBe(false)
  })

  it('are marked broken when it is the source that was deleted', () => {
    const session = make('session', 'Agent session 2026-07-30')
    const gripper = make('module', 'Tray clamp')
    t.api.createLink({ fromId: session.id, toId: gripper.id, type: 'discusses', actor: AGENT })

    t.api.deleteRecord(session.id, t.api.HUMAN)

    const seenFromClamp = one(t.api.resolveLinks(gripper.id), 'backlink')
    expect(seenFromClamp.broken).toBe(true)
    expect(seenFromClamp.label).toBe('discussed by')
  })
})

describe('removing a link', () => {
  it('deletes it and logs the unlink', () => {
    const a = make('module', 'Tray clamp')
    const b = make('module', 'Close-up camera')
    const { id } = t.api.createLink({ fromId: a.id, toId: b.id, type: 'relates_to', actor: t.api.HUMAN })

    t.api.deleteLink(id, t.api.HUMAN, HERE)

    expect(t.api.resolveLinks(a.id)).toHaveLength(0)
    expect(t.api.listChanges({ workspaceId: HERE, recordId: a.id }).filter((c) => c.op === 'unlink')).toHaveLength(1)
    expectPanelError(t, () => t.api.deleteLink(id, t.api.HUMAN, HERE), 404)
  })
})

/**
 * THE ROUTE, AS AN AGENT SENDS IT.
 *
 * Everything above calls the library. These two tests are about the two things the ROUTE decides
 * and the library cannot: how a caller may name each end, and what it is told afterwards. Both
 * came out of seven agents recording this pass's own development through this endpoint.
 *
 * These two tests write everything they need over HTTP into the default project, which the library
 * cases above never use because each of them works in a project of its own. They share the file's
 * one app, so no second office is started.
 */
describe('POST /api/links, as an agent sends it', () => {
  const post = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/links', payload })

  /** The reply, parsed from the bytes the way a caller on the other end of a socket reads it. */
  function body(res: { body: string }): Record<string, unknown> {
    const parsed: unknown = JSON.parse(res.body)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`expected a JSON object, got ${res.body.slice(0, 120)}`)
    }
    return parsed as Record<string, unknown>
  }

  /** One field of a reply, as an object, or a failure naming what was wanted. */
  function field(res: { body: string }, key: string): Record<string, unknown> {
    const value = body(res)[key]
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`expected ${key} to be an object, got ${JSON.stringify(value)}`)
    }
    return value as Record<string, unknown>
  }

  /** File a record over HTTP and hand back its id, the way a caller with no database does. */
  async function file(kind: PanelRecord['kind'], title: string, data: Record<string, unknown> = {}): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/records', payload: { kind, title, data } })
    expect(res.statusCode, res.body).toBe(201)
    return String(field(res, 'record').id)
  }

  /** Every link on a record, both directions, as the record's own page reads them. */
  async function linksOf(id: string): Promise<{ label: string; isBacklink: boolean; other: { id: string } }[]> {
    const res = await app.inject({ method: 'GET', url: `/api/records/${id}` })
    expect(res.statusCode, res.body).toBe(200)
    return (JSON.parse(res.body) as { links: { label: string; isBacklink: boolean; other: { id: string } }[] }).links
  }

  it('takes a title at the FROM end too, and refuses a bad one the same two ways the to end does', async () => {
    const problem = await file('problem', 'The gel force estimate lags the pull', { state: 'open' })
    const module = await file('module', 'Tactile sensing')

    // NEITHER ID IS IN THE REQUEST. Two names is what an agent is holding after reading a design
    // note, and until now the from end could only be an id — so an id had to be looked up for no
    // reason other than that this key would not take a name.
    const made = await post({
      fromTitle: 'The gel force estimate lags the pull',
      toTitle: 'Tactile sensing',
      type: 'part_of',
    })
    expect(made.statusCode, made.body).toBe(201)

    // Read off the STORED link rather than off the reply, so this test is about which record the
    // name resolved to and not about what the 201 says — that is the next test's subject. The
    // module is the end that did not store the link, so it reads the reverse label: the link is
    // the way round it was asked for and not its mirror image.
    const onModule = one(await linksOf(module), 'link on the module')
    expect(onModule.other.id).toBe(problem)
    expect(onModule.isBacklink).toBe(true)
    expect(onModule.label).toBe(LINK_TYPES.part_of.reverse)

    // A name that means nothing is a 404 with the name in it, and nothing is written — the same
    // refusal the to end gives, because a name is a belief about a record at either end.
    const missing = await post({ fromTitle: 'The gel force estimte lags the pull', toId: module })
    expect(missing.statusCode, missing.body).toBe(404)
    expect(body(missing).error).toContain('The gel force estimte lags the pull')

    // And a name whose record has been deleted is a 409 naming it, never a link that is broken the
    // moment it is made. That was a silent 201 at the to end until 2026-08-10.
    const retracted = await file('claim', 'Effort 12 is enough for the 50mm cube', { state: 'measured' })
    expect((await app.inject({ method: 'DELETE', url: `/api/records/${retracted}` })).statusCode).toBe(200)
    const deleted = await post({ fromTitle: 'Effort 12 is enough for the 50mm cube', toId: module })
    expect(deleted.statusCode, deleted.body).toBe(409)
    expect(body(deleted).error).toContain(`"fromId":"${retracted}"`)

    // Two refusals, and the module still has exactly the one link it started with.
    expect(await linksOf(module)).toHaveLength(1)
  })

  it('answers with what was linked to what, not with an id and nothing else', async () => {
    const arm = await file('problem', 'The real arm is in pieces', { state: 'open' })
    const twin = await file('module', 'YuMi digital twin')

    const res = await post({ fromId: arm, toTitle: 'YuMi digital twin', type: 'blocks', gate: { kind: 'hard' } })
    expect(res.statusCode, res.body).toBe(201)
    const reply = body(res)

    // Both ends, named. The caller typed a TITLE for one of them, so this is the only place the
    // belief that the name meant that record is confirmed.
    expect(reply.from).toEqual({ id: arm, title: 'The real arm is in pieces' })
    expect(field(res, 'to').title).toBe('YuMi digital twin')
    expect(reply.type).toBe('blocks')

    // In the wording the contract publishes, asked of LINK_TYPES rather than retyped here, so a
    // relabelled link type moves the reply and this assertion together.
    expect(reply.note).toContain(`"The real arm is in pieces" now ${LINK_TYPES.blocks.forward} "YuMi digital twin"`)
    expect(reply.note).toContain(LINK_TYPES.blocks.reverse)
    // The gate is part of what this request wrote and it is shown on the record the caller is not
    // looking at, so the sentence says it in the words shared/work.ts writes.
    expect(reply.note).toContain(gateLabel({ kind: 'hard' }))

    // A request that said nothing about the type is told which one it got, rather than having to
    // read a record back to find out.
    const plain = await post({ fromId: twin, toId: arm })
    expect(plain.statusCode, plain.body).toBe(201)
    expect(body(plain).type).toBe('relates_to')

    // `id` is unmoved and still means the same thing: it is what the delete route takes.
    const gone = await app.inject({ method: 'DELETE', url: `/api/links/${String(reply.id)}` })
    expect(gone.statusCode, gone.body).toBe(200)
  })
})

describe('the two queries that justify typed links', () => {
  it('unconsumed() finds a result nothing is using, and stops once something uses it', () => {
    const claim = make('claim', 'Zero-velocity beats every learned predictor past 200ms')
    const task = make('task', 'Run the rig_60mm wizard')

    expect(t.api.unconsumed(HERE).map((r) => r.title)).toContain(claim.title)

    t.api.createLink({ fromId: task.id, toId: claim.id, type: 'consumes', actor: t.api.HUMAN })

    expect(t.api.unconsumed(HERE).map((r) => r.title)).not.toContain(claim.title)
  })

  it('unconsumed() ignores a link of some other type — only consumption counts', () => {
    const claim = make('claim', 'Zero-velocity beats every learned predictor past 200ms')
    const idea = make('idea', 'Learn a transplant-timing predictor from the LeafCam depth stream')
    t.api.createLink({ fromId: claim.id, toId: idea.id, type: 'contradicts', actor: t.api.HUMAN })
    expect(t.api.unconsumed(HERE).map((r) => r.title)).toContain(claim.title)
  })

  it('unmetDependencies() finds work waiting on something that has been retracted', () => {
    const task = make('task', 'Run the rig_60mm wizard')
    const claim = make('claim', 'Setting 12 holding force is enough for the 60 mm pot')
    t.api.createLink({ fromId: task.id, toId: claim.id, type: 'consumes', actor: t.api.HUMAN })

    expect(t.api.unmetDependencies(HERE)).toHaveLength(0)

    t.api.deleteRecord(claim.id, t.api.HUMAN)

    const unmet = one(t.api.unmetDependencies(HERE), 'unmet dependency')
    expect(unmet.consumer.title).toBe('Run the rig_60mm wizard')
    expect(unmet.missingTitle).toBe('Setting 12 holding force is enough for the 60 mm pot')
  })
})
