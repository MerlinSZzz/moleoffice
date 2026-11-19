// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING GRAPH: what a period is working toward, and which of it is actually allocated.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE FOR
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/plan-graph/<horizon>/<period>` answers one question and refuses to answer any other:
 *
 *     What goal or deadline am I working toward, what work and future branches lead there,
 *     and which parts are actually allocated?
 *
 * Four of the things it has to keep true fail QUIETLY, which is why they are the four this file
 * spends most of its lines on. None of them breaks a type or throws:
 *
 *   1. THE BOUNDARY. A plan spans projects; a structure does not. An allocation naming work in
 *      another project must be NAMED and NOT DRAWN, because drawing it means reading that project's
 *      links — which is exactly "a planning allocation became a way to read robotics", the failure
 *      `src/server/lib/planning.ts` exists to prevent. A route that quietly widened would look
 *      better and be wrong.
 *   2. NO PROMOTION. A direction may be planned without ever being adopted. Giving one hours must
 *      not turn it into work, and must not give it an estimate it does not have.
 *   3. `due` AS STORED. Nothing here parses, compares or defaults it. An obligation with no `due` is
 *      a real state of this corpus and must come back as null rather than as a guess. The
 *      arithmetic belongs to `src/shared/deadlines.ts` and this route must not grow its own.
 *   4. NO RENDERING IN THE REPLY. `src/shared/presentation.ts` says store meaning, derive rendering.
 *      A coordinate that crept into this reply would work perfectly and would be the boundary lost,
 *      so the last test walks the whole JSON looking for one.
 *
 * THE SENTENCE IS NOT COPIED INTO THIS FILE. Where a test asserts on wording it asserts on a fact
 * the reply also carries — a count, a kind, an id — so a test cannot pass while the server says
 * something else about the same numbers.
 *
 * `app.inject` runs a request through the whole stack without opening a port, so nothing has to be
 * started and these cannot collide with the dev server on 8787.
 */

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'
import type { PlanGraphReply } from '../src/server/api/plan-graph.ts'

interface Harness {
  t: TestDb
  app: FastifyInstance
  /** Read the drawing for a period, in a project. */
  draw(period: string, workspaceId?: string): Promise<PlanGraphReply>
  /** Read it and hand back the raw reply, for the cases that are refusals. */
  raw(path: string, workspaceId?: string): Promise<{ status: number; body: Record<string, unknown> }>
}

/**
 * A week that is a real ISO week, and a day inside it.
 *
 * WRITTEN OUT RATHER THAN COMPUTED FROM `new Date()`. A test whose period came from the clock would
 * pass or fail depending on the day it ran, and this project has already paid once for a date that
 * meant something different at a boundary.
 */
const WEEK = '2026-W36'
const DAY_IN_WEEK = '2026-09-02'
const OTHER_WEEK = '2026-W37'

async function freshApp(): Promise<Harness> {
  const t = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  const { app } = await apiApp()
  await app.ready()

  const raw = async (path: string, workspaceId = 'default') => {
    const res = await app.inject({ method: 'GET', url: path, headers: { 'x-mole-office-workspace': workspaceId } })
    return { status: res.statusCode, body: res.json() as Record<string, unknown> }
  }
  const draw = async (period: string, workspaceId = 'default'): Promise<PlanGraphReply> => {
    const horizon = period.includes('W') ? 'week' : period.length === 7 ? 'month' : 'day'
    const { status, body } = await raw(`/api/plan-graph/${horizon}/${period}`, workspaceId)
    if (status !== 200) throw new Error(`GET plan-graph ${period} answered ${status}: ${JSON.stringify(body)}`)
    return body as unknown as PlanGraphReply
  }
  return { t, app, draw, raw }
}

describe('the plan graph', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.t.close()
  })

  /** A record in a project, with whatever data its kind wants. */
  const make = (kind: string, title: string, data: Record<string, unknown> = {}, workspaceId = 'default'): string =>
    h.t.api.createRecord({ workspaceId, kind: kind as never, title, data, actor: h.t.api.HUMAN }).id

  const link = (fromId: string, toId: string, type = 'relates_to'): void => {
    h.t.api.createLink({ fromId, toId, type: type as never, actor: h.t.api.HUMAN })
  }

  const allocate = async (recordId: string, horizon: string, period: string, plannedHours: number | null = null) => {
    const { createAllocation } = await import('../src/server/lib/planning.ts')
    return createAllocation({ horizon, period, recordId, plannedHours }, h.t.api.HUMAN)
  }

  // ==================================================================== what is drawn, and what is not

  describe('one rule decides which cards are drawn, and everything else is counted by name', () => {
    it('draws every obligation and direction, the work one link from them, and nothing else', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const branch = make('direction', 'Whether the twin can stand in', { depth: 'ran' })
      const leadsThere = make('task', 'Draft the figures', { state: 'doing' })
      const alsoLeadsThere = make('problem', 'The export crashes on 3 MB', { state: 'open' })
      const unrelated = make('task', 'Tidy the bench', { state: 'todo' })
      link(leadsThere, owed, 'blocks')
      link(branch, alsoLeadsThere)

      const drawn = await h.draw(WEEK)
      const ids = drawn.nodes.map((n) => n.recordId).sort()
      expect(ids, 'the drawing is not the anchors plus one link from them').toEqual(
        [owed, branch, leadsThere, alsoLeadsThere].sort(),
      )
      expect(ids, 'a record joined to nothing in the question was drawn anyway').not.toContain(unrelated)

      // NOT SILENTLY. The record that is not drawn is counted, with the project it is in named.
      const rest = drawn.omitted.find((o) => o.what.includes('other records'))
      expect(rest?.count, 'the records outside the rule were not counted').toBe(1)
    })

    it('counts a neighbour it will not draw by its kind, rather than dropping it', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const session = make('session', 'esa · figure export', { state: 'finished' })
      link(session, owed, 'produces')

      const drawn = await h.draw(WEEK)
      expect(drawn.nodes.map((n) => n.recordId), 'a session was drawn as work').not.toContain(session)
      const counted = drawn.omitted.find((o) => o.what.startsWith('session record'))
      expect(counted, 'a neighbour of the wrong kind vanished without being counted').toBeDefined()
      expect(counted?.count).toBe(1)
      // The reason names the kinds that ARE drawn, from the route's own list rather than a copy.
      // Loaded here rather than at the top: this module reaches the database client, which opens
      // its file at import, before freshDb() can name a throwaway one.
      const { PLAN_WORK_KINDS } = await import('../src/server/api/plan-graph.ts')
      for (const kind of PLAN_WORK_KINDS) expect(counted?.why).toContain(kind)
    })

    it('draws a deadline nothing leads to, because that is the answer rather than an empty picture', async () => {
      const alone = make('obligation', 'Return the borrowed gauge', { due: '2026-09-01', owedTo: 'the metrology lab' })
      const drawn = await h.draw(WEEK)
      // NO PROJECTION HERE. The structure view drops cards no line touches; this one must not, or a
      // deadline with no work behind it — the thing a person most needs to see — disappears.
      expect(drawn.nodes.map((n) => n.recordId)).toEqual([alone])
      expect(drawn.edges).toEqual([])
    })

    it('draws the links between two drawn cards, with the gate in the shared contract words', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const work = make('task', 'Reprint the part', { state: 'blocked' })
      h.t.api.createLink({
        fromId: work,
        toId: owed,
        type: 'blocks',
        gate: { kind: 'partial', upTo: 'the two pages can be drafted' },
        actor: h.t.api.HUMAN,
      })

      const edge = one(await h.draw(WEEK).then((d) => d.edges), 'edge')
      expect(edge.from).toBe(work)
      expect(edge.to).toBe(owed)
      expect(edge.type).toBe('blocks')
      // The words come from `gateLabel()` in shared/work.ts, never from a second vocabulary here.
      const { gateLabel } = await import('../src/shared/work.ts')
      expect(edge.gateLabel).toBe(gateLabel({ kind: 'partial', upTo: 'the two pages can be drafted' }))
    })
  })

  // ==================================================================== the allocation overlay

  describe('the allocation overlay says which parts are actually allocated', () => {
    it('marks the allocated card and leaves the rest saying they are not', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const work = make('task', 'Draft the figures', { state: 'doing' })
      link(work, owed, 'blocks')
      await allocate(work, 'week', WEEK, 6)

      const drawn = await h.draw(WEEK)
      const drawnWork = drawn.nodes.find((n) => n.recordId === work)
      const drawnOwed = drawn.nodes.find((n) => n.recordId === owed)
      expect(one(drawnWork?.allocations ?? [], 'allocation').plannedHours).toBe(6)
      // AND THE UNALLOCATED ONE IS AN EMPTY LIST, NOT A MISSING FIELD. "Nothing is planned for this"
      // is one of the five things the drawing exists to distinguish.
      expect(drawnOwed?.allocations).toEqual([])
    })

    it('does not mark work allocated in a DIFFERENT period', async () => {
      const work = make('task', 'Draft the figures', { state: 'doing' })
      make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      await allocate(work, 'week', OTHER_WEEK, 6)

      // It is not drawn at all here: it is not an anchor and it links to nothing that is.
      const drawn = await h.draw(WEEK)
      expect(drawn.nodes.map((n) => n.recordId), 'another week owns this allocation').not.toContain(work)
      // And in its own week it is an anchor, because that week gives it time.
      const own = await h.draw(OTHER_WEEK)
      expect(own.nodes.find((n) => n.recordId === work)?.drawn).toBe('anchor')
    })

    it('carries a week and a day as two rows and never adds them together', async () => {
      const work = make('task', 'Draft the figures', { state: 'doing' })
      await allocate(work, 'week', WEEK, 8)
      await allocate(work, 'day', DAY_IN_WEEK, 3)

      const node = one((await h.draw(WEEK)).nodes, 'node')
      const rows = [...node.allocations].sort((a, b) => a.horizon.localeCompare(b.horizon))
      expect(rows.map((a) => [a.horizon, a.period, a.plannedHours])).toEqual([
        ['day', DAY_IN_WEEK, 3],
        ['week', WEEK, 8],
      ])
      // THE NUMBER 11 MUST NOT BE A VALUE ANYWHERE IN THIS REPLY. A week planning 8 hours with 3 of
      // them on a Monday is 8 hours of work — shared/planning.ts states it, and a helpful total
      // here would be the one piece of arithmetic this product forbids. Walked as NUMBERS rather
      // than as a substring, because a timestamp contains "11" and would make this pass by luck.
      const numbers: number[] = []
      const walk = (value: unknown): void => {
        if (typeof value === 'number') return void numbers.push(value)
        if (Array.isArray(value)) return value.forEach(walk)
        if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
      }
      walk(await h.draw(WEEK))
      expect(numbers, 'two horizons were added together').not.toContain(11)
    })

    it('reports an allocation with no hours as no hours, never as zero and never as the estimate', async () => {
      const work = make('task', 'Draft the figures', { state: 'doing', effort_hours: 20 })
      await allocate(work, 'week', WEEK, null)

      const node = one((await h.draw(WEEK)).nodes, 'node')
      expect(one(node.allocations, 'allocation').plannedHours, 'an unstated allocation was filled in').toBeNull()
      // The estimate is on the WORK and is a different number. Both are reported, neither replaces
      // the other.
      expect(node.effortHours).toBe(20)
    })
  })

  // ==================================================================== the boundary

  describe('a plan spans projects; this drawing does not, and it says so rather than widening', () => {
    it('names work allocated in another project and never draws it or its links', async () => {
      const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
      createWorkspace({ id: 'robotics', title: 'Robotics' })
      const theirs = make('task', '把 probe 读到的湿度和参考湿度计对一遍', { state: 'doing' }, 'robotics')
      const theirSecret = make('module', '夹具标定', {}, 'robotics')
      h.t.api.createLink({ fromId: theirs, toId: theirSecret, type: 'relates_to', actor: h.t.api.HUMAN })
      await allocate(theirs, 'week', WEEK, 4)
      make('obligation', 'Our own report', { due: '2026-09-04', owedTo: 'the reviewer' })

      const drawn = await h.draw(WEEK, 'default')
      const ids = drawn.nodes.map((n) => n.recordId)
      expect(ids, "another project's work was drawn").not.toContain(theirs)
      // THIS IS THE ONE THAT MATTERS. Reaching `theirSecret` requires reading robotics' links, which
      // is the failure the planning boundary exists to prevent. It must not be anywhere in the reply.
      expect(JSON.stringify(drawn), "a link of another project was read").not.toContain(theirSecret)

      const row = one(drawn.elsewhere, 'elsewhere row')
      expect(row.recordId).toBe(theirs)
      expect(row.workspaceId, 'the row does not say which project it belongs to').toBe('robotics')
      expect(one(row.allocations, 'allocation').plannedHours).toBe(4)
    })

    it('names the project it drew, so the browser never has to print its id', async () => {
      // `projectName` in the browser prints the STORED ID when nobody hands it a title, so this
      // drawing read "only panelx is drawn" while the rail four inches away read "Mole Office" — one
      // project with two spellings, and nothing failing when they disagreed. The registry is the
      // only place a title is stored, and this reply is how it reaches the drawing.
      const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
      createWorkspace({ id: 'robotics', title: 'Robotics' })

      const drawn = await h.draw(WEEK, 'robotics')
      expect(drawn.workspaceId).toBe('robotics')
      expect(drawn.workspaceTitle, 'the reply carries the id and no name to print').toBe('Robotics')
    })

    it('keeps an allocation whose record has gone, and says so rather than losing the hours', async () => {
      const work = make('task', 'Draft the figures', { state: 'doing' })
      await allocate(work, 'week', WEEK, 4)
      h.t.api.deleteRecord(work, h.t.api.HUMAN)

      const drawn = await h.draw(WEEK)
      // A soft-deleted record is not in `listRecords`, so it cannot be a card. It must not silently
      // take four planned hours with it.
      expect(drawn.nodes.map((n) => n.recordId)).not.toContain(work)
      const row = one(drawn.elsewhere, 'elsewhere row')
      expect(row.recordId).toBe(work)
      expect(row.gone, 'a deleted record was reported as present').toBe(true)
    })
  })

  // ==================================================================== the three roles

  describe('planned is not adopted, and nothing on this route promotes anything', () => {
    it('draws an ALLOCATED direction as a direction, with no estimate invented for it', async () => {
      const branch = make('direction', 'Whether the twin can stand in for bench time', { depth: 'ran' })
      await allocate(branch, 'week', WEEK, 5)

      const node = one((await h.draw(WEEK)).nodes, 'node')
      expect(node.role, 'giving a direction hours turned it into work').toBe('direction')
      expect(node.kind).toBe('direction')
      expect(node.depth).toBe('ran')
      // A direction deliberately has no `effort_hours` — exploring is how you find out how big it is
      // — so this must be null and never the allocation's 5.
      expect(node.effortHours).toBeNull()
      expect(one(node.allocations, 'allocation').plannedHours).toBe(5)
    })

    it('gives each kind the role the legend draws it with, and nothing else', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const branch = make('direction', 'A future branch', { depth: 'noticed' })
      const task = make('task', 'Real work', { state: 'doing' })
      link(task, owed, 'blocks')

      const roles = new Map((await h.draw(WEEK)).nodes.map((n) => [n.recordId, n.role]))
      expect(roles.get(owed)).toBe('deadline')
      expect(roles.get(branch)).toBe('direction')
      expect(roles.get(task)).toBe('work')
    })
  })

  // ==================================================================== the deadline itself

  describe('`due` is served exactly as stored, and nothing here computes a date', () => {
    it('passes a stamp through untouched', async () => {
      make('obligation', 'The report is owed', { due: '2026-09-04 17:00', owedTo: 'the reviewer' })
      expect(one((await h.draw(WEEK)).nodes, 'node').due).toBe('2026-09-04 17:00')
    })

    it('passes a due that is a condition rather than a date through untouched', async () => {
      const until = { condition: 'the reprint is on the bench' }
      make('obligation', 'The part is owed', { due: until, owedTo: 'the reviewer' })
      // NOT FLATTENED INTO A STRING and not refused: `date | PauseUntil` is the stored shape, and a
      // drawing that could only read one of the two would silently lose the other.
      expect(one((await h.draw(WEEK)).nodes, 'node').due).toEqual(until)
    })

    it('reports an obligation with no due as null rather than inventing one', async () => {
      make('obligation', 'Write up the handover demo', { owedTo: 'the group meeting', state: 'open' })
      const node = one((await h.draw(WEEK)).nodes, 'node')
      expect(node.due, 'an obligation with no due was given one').toBeNull()
      expect(node.role).toBe('deadline')
    })

    /**
     * THE TEST THAT IS NOT HERE, AND WHY.
     *
     * "A `due` on a task is not read as a deadline" cannot be written: `validateData` refuses
     * `data.due` on every kind but `obligation`, so there is no way to store the state it would
     * check. Writing it through the database instead would test a corpus Mole Office cannot produce,
     * which is a test for a hypothetical rather than for the product. It is left out and said.
     */
    it('says a record has no state rather than inventing one', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const module = make('module', 'Mole Office — durable archive', { context: 'export and restore' })
      link(owed, module, 'part_of')

      const drawn = (await h.draw(WEEK)).nodes.find((n) => n.recordId === module)
      // A module has no state word in this vocabulary, and the card must print nothing there rather
      // than a plausible default. Absence beats a guess.
      expect(drawn?.state, 'a module was given a state it does not have').toBeNull()
      expect(drawn?.depth, 'a module was given a direction depth').toBeNull()
      expect(drawn?.role).toBe('work')
    })
  })

  // ==================================================================== the sentence and the empty cases

  describe('the sentence is built from the arrays it describes, so the two cannot disagree', () => {
    it('says there is nothing to draw when there is nothing to draw', async () => {
      make('note', 'A note about nothing in particular', {})
      const drawn = await h.draw(WEEK)
      expect(drawn.nodes).toEqual([])
      expect(drawn.note).toContain('no drawing')
      // NOT A FAILURE, and it must not read like one: the records are fine and this project simply
      // has no obligation and no direction.
      expect(drawn.note).toContain('not a failure to draw')
    })

    it('says a project with deadlines has nothing allocated, which is not the same as no plan', async () => {
      make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const drawn = await h.draw(WEEK)
      expect(drawn.note).toContain('Nothing on this drawing has any of')
      const { nothingHereHasTimeIn } = await import('../src/server/api/plan-graph.ts')
      expect(drawn.note).toContain(nothingHereHasTimeIn(WEEK))
    })

    it('cannot report a deadline the nodes do not hold', async () => {
      // `describePlanGraph` reads the reply rather than the workings, which is what makes the
      // sentence unable to disagree with the drawing. Handed no deadlines, it must say so.
      const empty = {
        horizon: 'week' as const,
        period: WEEK,
        from: '2026-08-31',
        to: '2026-09-06',
        workspaceId: 'default',
        nodes: [{ role: 'work', due: null, allocations: [] }],
        edges: [],
        elsewhere: [],
        omitted: [],
      } as unknown as Omit<PlanGraphReply, 'note'>
      const { describePlanGraph } = await import('../src/server/api/plan-graph.ts')
      expect(describePlanGraph(empty)).toContain('has no deadline in it')
    })
  })

  // ==================================================================== the two refusals

  describe('the period is parsed rather than trusted', () => {
    it('refuses a key that cannot be placed on a calendar', async () => {
      const { status, body } = await h.raw('/api/plan-graph/week/2026-W99')
      expect(status).toBe(400)
      expect(String(body['error'])).toContain('2026-W99')
    })

    it('refuses a real key that is not of the horizon it was asked under', async () => {
      // `2026-W36` is a week. Asked for as a day it must be refused, not answered about a different
      // period — the same rule `checkPeriod` keeps on the write side.
      const { status, body } = await h.raw(`/api/plan-graph/day/${WEEK}`)
      expect(status).toBe(400)
      expect(String(body['error'])).toContain('is not a day')
    })
  })

  // ==================================================================== the derived-layout boundary

  describe('no rendering leaves this route', () => {
    it('carries no coordinate, no size and no colour anywhere in the reply', async () => {
      const owed = make('obligation', 'The report is owed', { due: '2026-09-04', owedTo: 'the reviewer' })
      const work = make('task', 'Draft the figures', { state: 'doing' })
      link(work, owed, 'blocks')
      await allocate(work, 'week', WEEK, 6)

      // WALKED RATHER THAN SPOT-CHECKED. A coordinate that crept in would work perfectly and would
      // be the presentation boundary lost — src/server/lib/presentation.ts refuses one in writing on
      // the storage side, and this is the same rule on the reading side.
      const forbidden = ['x', 'y', 'width', 'height', 'colour', 'color', 'position', 'lane', 'zoom']
      const seen: string[] = []
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) return value.forEach(walk)
        if (value === null || typeof value !== 'object') return
        for (const [key, inner] of Object.entries(value)) {
          if (forbidden.includes(key)) seen.push(key)
          walk(inner)
        }
      }
      walk(await h.draw(WEEK))
      expect(seen, 'the plan graph reply has grown a rendering field').toEqual([])
    })
  })
})
