// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE LIST ANSWERS ONLY WHAT ITS CALLERS NEED. GET /api/merge-queue answers each entry whole: everything the
 * queue works out for it, every field the state machine wrote, and the page's reading beside the lanes. On the live
 * office that was about 17 MB a call. The list now takes `shape`: `narrow` answers each entry with only the fields
 * the merge tool and the timing job read, and works out nothing else; `page` answers the fields the queue page draws.
 * With no shape the answer is whole, as before, because callers outside this repository read it and nobody here can
 * see what they read. `ids` answers each entry with only its id, state and lane, for a gate outside this repository that
 * asks the whole list only to know whether any entry is in one of three states (wave 13u round 132). Case 12 puts both
 * answers through what that gate reads, as its owner described it.
 *
 * Each caller in this repository asks for its shape and the states it reads. Each caller reads the same from the new
 * answer as from the whole answer it asked for before: the cases below put both answers through what the caller reads
 * and compare. An office older than the shapes refuses an unknown query key by name. The merge tool and the timing
 * job then ask once more without a shape and say so; any other refusal is taken as before.
 *
 * Every entry here is made up and filed in a test database of its own. The merge tool's office is a small stand-in
 * written in this file, so nothing reaches a real office.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - the narrow entry leaves out the merged entry's integrated mainBefore: case 1 goes red;
 *   - the narrow entry leaves out a waiting entry's integration result (wave 13u round 130): case 1 goes red;
 *   - the narrow entry keeps the judged content of a final entry: case 3 goes red;
 *   - the page's shape keeps the whole entry: case 4 goes red;
 *   - the list narrows to the lane and states before it checks each entry's shape: case 6 goes red;
 *   - theLane asks without a shape: cases 7 and 8 go red;
 *   - the merge tool takes any 400 as an older office: case 9 goes red;
 *   - the timing job asks without a shape: case 10 goes red;
 *   - the ids entry leaves out its lane: case 12 goes red (wave 13u round 132);
 *   - the list orders a lane and says who moved an entry by what the shape answers of it: case 12 goes red.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DOCUMENTS_LANE, MERGE_STATES, MERGE_STATE_SPECS, inTheLanesOrder, type MergeState } from '../src/shared/merge-queue.ts'
import * as timingJob from '../tools/run-the-timing-job.mjs'
import { timingCounters, TIMING_JOB } from '../src/config/timing-job.mjs'

const WORKSPACE = 'default'
const ROOT = '/synthetic/lane-of-the-narrow-list'
const DOCS = `${ROOT} ${DOCUMENTS_LANE}`
const OTHER = '/synthetic/another-lane-of-the-narrow-list'
const LIVE = MERGE_STATES.filter((one) => !MERGE_STATE_SPECS[one].final)
const NOT_FINAL = LIVE
const HOLDS_A_LANE = MERGE_STATES.filter((one) => MERGE_STATE_SPECS[one].occupiesTheLane)
const FINAL = MERGE_STATES.filter((one) => MERGE_STATE_SPECS[one].final)
const office = { type: 'agent' as const, id: 'mole-office/the-message-worker' }
const worker = { kind: 'agent', id: 'made-up-worker' }
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** What an office older than the shapes answers a list asked with one, word for word (its query is `.strict()`). */
const THE_OLDER_OFFICES_REFUSAL = 'The queue to narrow to Unrecognized key: "shape"'

/** The fields a narrow entry may carry, and those of its machine. Each is read by the merge tool or the timing job. */
const NARROW_ENTRY = ['id', 'state', 'lane', 'run', 'changeset', 'repairOf', 'suiteWorkers', 'movedFirst', 'machine']
const NARROW_MACHINE = ['judged', 'resolution', 'integration', 'tested', 'integrated']
/** The fields of one entry the page reads (`QueueEntryRow` in src/shared/merge-queue-page.ts), and of its machine. */
const PAGE_ENTRY = ['id', 'title', 'state', 'lane', 'occupies', 'submittedAt', 'submittedInstant', 'submittedBy', 'machine', 'toolWaits', 'movedFirst', 'pressToLand']
const PAGE_MACHINE = ['tested', 'reinspection', 'resolving', 'resolution', 'waitsForAFixRound']

type Answer = { status: number; body: any; bytes: number }
const hex = (n: number, of: string): string => of.replace(/[^0-9a-f]/gu, '').padEnd(n, 'a').slice(0, n)
const q = (parts: Record<string, string>): string => `/api/merge-queue?${new URLSearchParams(parts).toString()}`
const pick = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]))

// ============================================================================ what each caller reads

const unread = (a: any): string[] => (a.unreadable ?? []).map((one: any) => one.why)
const theLaneIn = (a: any, lane: string): any[] => inTheLanesOrder((a.lanes ?? []).find((one: any) => one.lane === lane)?.entries ?? [])
const landingIn = (a: any, lane: string): string[] => theLaneIn(a, lane).filter((one) => one.state === 'landing').map((one) => one.id)
/** What the merge tool reads of each entry of its lane: look, board, passOver, aResultToBorrow and aCollisionNaming. */
const theToolsEntry = (one: any) => ({
  id: one.id,
  state: one.state,
  turn: one.movedFirst?.turn ?? null,
  changeset: one.changeset,
  run: one.run,
  repairOf: one.repairOf ?? null,
  suiteWorkers: one.suiteWorkers?.count ?? null,
  resolution: one.machine?.resolution ?? null,
  // READ ONLY OF AN ENTRY THAT IS NOT FINAL: board and passOver take judged entries, and dropWhoLeftJudged one still in the lane.
  judged: MERGE_STATE_SPECS[one.state as MergeState].final ? null : one.machine?.judged ?? null,
  tested: one.machine?.tested === undefined ? null : { testedWith: one.machine.tested.testedWith ?? null, build: one.machine.tested.build ?? null, log: one.machine.tested.log ?? null },
  integrated: one.machine?.integrated === undefined ? null : { mainBefore: one.machine.integrated.mainBefore, mainAfter: one.machine.integrated.mainAfter },
})
/** The speed's own clock is read at each ask, so two asks a moment apart differ there and nowhere else. */
const withoutTheClock = (a: any) => ({ ...a, ...(a.speed === undefined ? {} : { speed: { ...a.speed, at: null, since: null } }) })

/** Each caller in this repository: what it asked before, what it asks now, and what it reads of the answer. */
const CALLERS: { name: string; before: string; now: string; reads: (a: any) => unknown; holds: (read: any) => boolean }[] = [
  {
    name: 'the queue page',
    before: q({ state: LIVE.join(',') }),
    now: q({ state: LIVE.join(','), shape: 'page' }),
    reads: (a) => ({ ...withoutTheClock(a), lanes: a.lanes.map((lane: any) => ({ lane: lane.lane, occupiedBy: lane.occupiedBy, entries: lane.entries.map((one: any) => ({ ...pick(one, PAGE_ENTRY), machine: pick(one.machine, PAGE_MACHINE) })) })) }),
    holds: (read) => read.lanes.flatMap((lane: any) => lane.entries).length === 6,
  },
  { name: 'the merge tool reading its lane', before: q({ lane: ROOT }), now: q({ lane: ROOT, shape: 'narrow' }), reads: (a) => ({ unread: unread(a), lane: theLaneIn(a, ROOT).map(theToolsEntry) }), holds: (read) => read.lane.length === 8 },
  {
    name: 'the merge tool moving past documentation landings',
    before: q({ lane: DOCS }),
    now: q({ lane: DOCS, state: 'merged', shape: 'narrow' }),
    reads: (a) => ({ unread: unread(a), merged: theLaneIn(a, DOCS).filter((one) => one.state === 'merged' && one.machine?.integrated).map((one) => [one.id, one.machine.integrated.mainBefore, one.machine.integrated.mainAfter]) }),
    holds: (read) => read.merged.length === 1,
  },
  { name: 'the merge tool waiting for a landing in the lane', before: q({ lane: ROOT }), now: q({ lane: ROOT, state: 'landing', shape: 'narrow' }), reads: (a) => ({ unread: unread(a), landing: landingIn(a, ROOT), pushes: a.emergencyPushes }), holds: (read) => Array.isArray(read.pushes) },
  { name: 'the merge tool waiting for a landing in the documents lane', before: q({ lane: DOCS }), now: q({ lane: DOCS, state: 'landing', shape: 'narrow' }), reads: (a) => ({ unread: unread(a), landing: landingIn(a, DOCS) }), holds: (read) => read.landing.length === 1 },
  {
    name: 'the merge tool reading the migrations queued',
    before: q({ lane: ROOT }),
    now: q({ lane: ROOT, state: NOT_FINAL.join(','), shape: 'narrow' }),
    reads: (a) => ({ unread: unread(a), others: theLaneIn(a, ROOT).filter((one) => !MERGE_STATE_SPECS[one.state as MergeState].final && one.changeset?.adapter === 'git' && one.changeset.root === ROOT).map((one) => [one.id, one.changeset.commit, one.run, one.machine?.integration?.result ?? null, one.machine?.integration?.clone ?? null]) }),
    holds: (read) => read.others.length === 5 && read.others.some((one: unknown[]) => one[3] !== null),
  },
  {
    name: 'the merge tool probing for conflicts after a landing',
    before: q({ lane: ROOT }),
    now: q({ lane: ROOT, state: 'pinned,judged', shape: 'narrow' }),
    reads: (a) => ({ unread: unread(a), waiting: (a.lanes ?? []).flatMap((lane: any) => lane.entries).filter((one: any) => ['pinned', 'judged'].includes(one.state) && one.changeset.adapter === 'git' && one.changeset.root === ROOT).map((one: any) => [one.id, one.state, one.changeset.commit, one.run, one.machine?.resolution ?? null]) }),
    holds: (read) => read.waiting.length === 3,
  },
  { name: 'the merge tool after a refused integrating step', before: q({ lane: ROOT }), now: q({ lane: ROOT, state: HOLDS_A_LANE.join(','), shape: 'narrow' }), reads: (a) => (a.lanes ?? []).find((one: any) => one.lane === ROOT)?.occupiedBy ?? null, holds: (read) => read !== null },
  {
    name: 'the timing job',
    before: q({ lane: ROOT, state: 'testing,integrating,landing' }),
    now: q({ lane: ROOT, state: 'testing,integrating,landing', shape: 'narrow' }),
    reads: (a) => ({ lanes: Array.isArray(a.lanes), unread: unread(a), busy: a.lanes.some((lane: any) => lane.entries.length > 0) }),
    holds: (read) => read.busy === true,
  },
]

/**
 * A GATE OUTSIDE THIS REPOSITORY, as its owner described it (wave 13u round 132). It reads every object anywhere in the
 * answer that has `id`, `state` and a `lane` key as an entry, once per id. It holds its timer back when any entry is in
 * one of its states, and logs up to four `id state` pairs. It asked the whole list; it can now ask `THE_GATES_ASK_NOW`.
 */
const THE_GATES_STATES: readonly MergeState[] = ['judged', 'integrating', 'testing']
const THE_GATES_ASK_BEFORE = '/api/merge-queue'
const THE_GATES_ASK_NOW = `/api/merge-queue?state=${THE_GATES_STATES.join(',')}&shape=ids`
const whatTheGateReads = (answer: unknown): { busy: boolean; pairs: string[]; logged: string[] } => {
  const seen = new Map<string, string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const one of value) walk(one)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const one = value as Record<string, unknown>
    if ('id' in one && 'state' in one && 'lane' in one && !seen.has(String(one['id']))) seen.set(String(one['id']), String(one['state']))
    for (const inside of Object.values(one)) walk(inside)
  }
  walk(answer)
  const pairs = [...seen].filter(([, state]) => (THE_GATES_STATES as readonly string[]).includes(state)).map(([id, state]) => `${id} ${state}`)
  return { busy: pairs.length > 0, pairs, logged: pairs.slice(0, 4) }
}

// ============================================================================ the office

const ids: Record<string, string> = {}
const got = new Map<string, Answer>()
const withTheUnreadable: { narrow: Answer | null; whole: Answer | null } = { narrow: null, whole: null }

describe('the office', () => {
  let t: TestDb

  beforeAll(async () => {
    t = await freshDb()
    const door = await import('../src/server/lib/merge-entry-door.ts')
    const file = (name: string, state: string, more: Record<string, unknown> = {}, lane: 'root' | 'docs' | 'other' = 'root', submittedBy: unknown = worker): void => {
      // NULL FOR NOBODY: undefined would take the default.
      const root = lane === 'other' ? OTHER : ROOT
      const files = [`src/made-up/${name}/one.ts`, `src/made-up/${name}/two.ts`]
      const judged = Object.fromEntries(files.map((path) => [path, hex(64, `${name}${path}`)]))
      const after = !['submitted', 'pinned'].includes(state)
      ids[name] = door.asTheMergeQueue(() =>
        t.api.createRecord({
          kind: 'merge_entry',
          title: `Made-up merge entry ${name}`,
          workspaceId: WORKSPACE,
          actor: office,
          origin: 'fixture',
          data: {
            state,
            run: `made-up-run-${name}`,
            seal: { id: `made-up-seal-${name}`, hash: hex(64, `5ea1${name}`) },
            changeset: { adapter: 'git', repository: 'made-up-repository', root, branch: `made-up-${name}`, commit: hex(40, `c0${name}`), base: hex(40, `ba5e${name}`) },
            ...(submittedBy === null ? {} : { submittedBy }),
            ...(lane === 'docs' ? { documents: { tree: hex(40, `d0c${name}`), files } } : {}),
            ...(after ? { judged, verdict: { at: '2026-10-29 07:00:00', released: true, says: 'A made-up verdict.' }, checked: { at: '2026-10-29 07:00:00', files: 2, says: 'A made-up check.' } } : {}),
            ...more,
          },
        }),
      ).id
    }
    const integration = { at: '2026-10-29 07:10:00', result: hex(40, 'c1'), clone: '/made-up/integration-clone', mainBefore: hex(40, 'a1'), files: { 'src/made-up/one.ts': { before: hex(64, 'b1'), after: hex(64, 'af') } } }
    const tested = (name: string, testedWith?: Record<string, unknown>) => ({
      at: '2026-10-29 07:20:00', green: true, build: { passed: true, log: `/made-up/logs/${name}/build.log` }, log: `/made-up/logs/${name}/suite.log`, counts: { passed: 12, failed: 0 }, says: 'A made-up test run.', mergeClass: { class: 1, says: 'A made-up class.' },
      ...(testedWith === undefined ? {} : { testedWith }),
    })
    file('merged', 'merged', { handedOn: { 'src/made-up/one.ts': hex(64, 'h0') }, integration, tested: tested('merged'), integrated: { at: '2026-10-29 07:30:00', mainBefore: hex(40, 'a1'), mainAfter: hex(40, 'a2'), tree: hex(40, 'e1') } })
    file('bounced', 'bounced', { integration, tested: tested('bounced', { entry: 'made-up-driver', tree: hex(40, 'e2'), bus: [{ entry: 'made-up-rider' }], collision: { paths: ['src/made-up/one.ts'] } }), bounced: { at: '2026-10-29 07:40:00', because: 'A made-up red test.' } })
    file('docs-merged', 'merged', { integrated: { at: '2026-10-29 07:45:00', mainBefore: hex(40, 'a2'), mainAfter: hex(40, 'a3') } }, 'docs')
    file('withdrawn', 'withdrawn', { withdrawn: { because: 'A made-up withdrawal.', by: worker, at: '2026-10-29 07:50:00' } })
    file('other-merged', 'merged', { integrated: { at: '2026-10-29 07:55:00', mainBefore: hex(40, 'f1'), mainAfter: hex(40, 'f2') } }, 'other')
    file('moved', 'judged', { movedFirst: { by: worker, at: '2026-10-29 08:00:00', because: 'A made-up reason to go first.', turn: 1 }, suiteWorkers: { count: 3, by: worker }, resolution: { at: '2026-10-29 08:01:00', checked: { at: '2026-10-29 08:02:00' } } })
    file('repair', 'judged', { repairOf: { problem: 'made-up-problem', files: ['tests/made-up.test.ts'] } })
    file('pinned', 'pinned')
    file('submitted', 'submitted')
    file('testing', 'testing', { occupies: ROOT, integration })
    file('docs-landing', 'landing', { occupies: DOCS, integration, integrated: { at: '2026-10-29 08:10:00', mainBefore: hex(40, 'a3'), mainAfter: hex(40, 'a4') } }, 'docs')

    // READ HERE, BEFORE ANY CASE, as the template for a list's door test reads it (one-entry-the-queue-cannot-read...).
    const app = (await apiApp()).app
    await app.ready()
    try {
      const ask = async (url: string): Promise<Answer> => {
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        return { status: reply.statusCode, body: reply.json() as unknown, bytes: reply.rawPayload.length }
      }
      for (const url of new Set([...CALLERS.flatMap((one) => [one.before, one.now]), q({ lane: ROOT, shape: 'narrow' }), q({ lane: ROOT }), q({ lane: ROOT, shape: 'page' }), q({ lane: ROOT, shape: 'whole' })])) got.set(url, await ask(url))
      // FILED AFTER THE CALLERS' ASKS, so that each of the gate's states is held: a move to the front filed after the
      // entries it goes before, and an entry integrating in another lane.
      file('moved-late', 'judged', { movedFirst: { by: worker, at: '2026-10-29 08:20:00', because: 'A made-up reason to go second.', turn: 2 } })
      file('integrating', 'integrating', { occupies: OTHER }, 'other')
      for (const url of [THE_GATES_ASK_BEFORE, THE_GATES_ASK_NOW, q({ state: THE_GATES_STATES.join(',') })]) got.set(url, await ask(url))
      // AN ENTRY THE QUEUE CANNOT READ, filed last so that it is in none of the answers above.
      file('unreadable', 'merged', {}, 'other', null)
      withTheUnreadable.narrow = await ask(q({ lane: OTHER, state: 'judged', shape: 'narrow' }))
      withTheUnreadable.whole = await ask(q({ lane: OTHER, state: 'judged' }))
    } finally {
      await app.close()
    }
  }, 120_000)

  afterAll(() => {
    t?.close()
  })

  const answered = (url: string): any => {
    const answer = got.get(url)!
    expect(answer.status, `${url}: ${JSON.stringify(answer.body).slice(0, 400)}`).toBe(200)
    return answer.body
  }

  it('1: each caller reads the same from the answer it asks for now as from the whole answer it asked for before', () => {
    for (const caller of CALLERS) {
      const before = caller.reads(answered(caller.before))
      expect(caller.holds(before), `${caller.name}: the made-up office gives it something to read`).toBe(true)
      expect(caller.reads(answered(caller.now)), caller.name).toEqual(before)
    }
  })

  it('2: asked with no shape, the list answers as before: every entry whole, and the page\'s reading beside the lanes', () => {
    const whole = answered(q({ lane: ROOT }))
    expect(Object.keys(whole), JSON.stringify(Object.keys(whole))).toEqual(['lanes', 'unreadable', 'says', 'speed', 'page', 'emergencyPushes', 'held', 'workspaceId', 'narrowedByPermission'])
    const merged = whole.lanes[0].entries.find((one: any) => one.id === ids['merged'])
    for (const key of ['title', 'workspaceId', 'means', 'waitsOn', 'seal', 'occupies', 'pinnedRef', 'submittedBy', 'submittedAt', 'withdrawn', 'superseded', 'tool', 'toolWanted', 'supersedes', 'supersededBy']) {
      expect(Object.keys(merged), key).toContain(key)
    }
    expect(Object.keys(merged.machine)).toEqual(['judged', 'handedOn', 'verdict', 'checked', 'integration', 'tested', 'integrated'])
    expect(whole.lanes[0].entries.find((one: any) => one.id === ids['moved']).movedFirst.says).toBeTypeOf('string')
  })

  it('3: the narrow answer holds only what the merge tool and the timing job read, and works out nothing else', () => {
    const whole = answered(q({ lane: ROOT }))
    const narrow = answered(q({ lane: ROOT, shape: 'narrow' }))
    // narrowedByPermission IS EVERY REPLY'S, added by the reply hook (sayWhetherPermissionNarrowedIt in src/server/lib/http.ts).
    expect(Object.keys(narrow), JSON.stringify(Object.keys(narrow))).toEqual(['lanes', 'unreadable', 'says', 'emergencyPushes', 'held', 'workspaceId', 'narrowedByPermission'])
    expect(narrow.says, 'the sentence is the list\'s own, whatever the shape').toBe(whole.says)
    const entries = narrow.lanes.flatMap((lane: any) => lane.entries)
    expect(entries.map((one: any) => one.id)).toEqual(whole.lanes.flatMap((lane: any) => lane.entries).map((one: any) => one.id))
    for (const one of entries) {
      expect(NARROW_ENTRY, `the fields of ${one.id}`).toEqual(expect.arrayContaining(Object.keys(one)))
      for (const key of ['id', 'state', 'lane', 'run', 'changeset', 'machine']) expect(Object.keys(one), `${one.id} ${key}`).toContain(key)
      expect(NARROW_MACHINE, `the machine of ${one.id}`).toEqual(expect.arrayContaining(Object.keys(one.machine)))
      if (FINAL.includes(one.state)) expect(one.machine.judged, `${one.id} is ${String(one.state)}, and nobody reads what a final entry was judged on`).toBeUndefined()
      if (FINAL.includes(one.state)) expect(one.machine.integration, `${one.id} is ${String(one.state)}, and nobody reads where a final entry was integrated`).toBeUndefined()
      if (one.machine.integration !== undefined) expect(Object.keys(one.machine.integration)).toEqual(['result', 'clone'])
      if (one.machine.tested !== undefined) expect(['testedWith', 'build', 'log']).toEqual(expect.arrayContaining(Object.keys(one.machine.tested)))
      if (one.machine.integrated !== undefined) expect(Object.keys(one.machine.integrated)).toEqual(['mainBefore', 'mainAfter'])
    }
    const moved = entries.find((one: any) => one.id === ids['moved'])
    expect(moved.movedFirst, 'the move as stored, without the sentence that names who moved it').toEqual({ by: worker, at: '2026-10-29 08:00:00', because: 'A made-up reason to go first.', turn: 1 })
    expect(entries.find((one: any) => one.id === ids['repair']).machine.judged, 'a judged entry keeps what it was judged on').toBeTypeOf('object')
    expect(got.get(q({ lane: ROOT, shape: 'narrow' }))!.bytes * 2, 'the narrow answer is less than half the whole one').toBeLessThan(got.get(q({ lane: ROOT }))!.bytes)
  })

  it('4: the page\'s answer holds every part the page reads, with only the fields of each entry it draws', () => {
    const whole = answered(q({ lane: ROOT }))
    const page = answered(q({ lane: ROOT, shape: 'page' }))
    expect(Object.keys(page)).toEqual(Object.keys(whole))
    expect(withoutTheClock({ ...page, lanes: null })).toEqual(withoutTheClock({ ...whole, lanes: null }))
    for (const one of page.lanes.flatMap((lane: any) => lane.entries)) {
      expect(PAGE_ENTRY, `the fields of ${String(one.id)}`).toEqual(expect.arrayContaining(Object.keys(one)))
      expect(PAGE_MACHINE, `the machine of ${String(one.id)}`).toEqual(expect.arrayContaining(Object.keys(one.machine)))
    }
    expect(page.lanes[0].entries.find((one: any) => one.id === ids['moved']).movedFirst.says, 'the page draws the move\'s sentence').toBeTypeOf('string')
  })

  it('5: a shape the list does not know is refused by name, and nothing is answered', () => {
    const refused = got.get(q({ lane: ROOT, shape: 'whole' }))!
    expect(refused.status).toBe(400)
    expect(refused.body.error).toContain('shape')
  })

  it('6: an entry the queue cannot read is named in the narrow answer, whatever lane or states were asked for', () => {
    for (const [shape, answer] of [['narrow', withTheUnreadable.narrow!], ['whole', withTheUnreadable.whole!]] as const) {
      expect(answer.status, `${shape}: ${JSON.stringify(answer.body).slice(0, 400)}`).toBe(200)
      expect(answer.body.unreadable, shape).toEqual([
        { id: ids['unreadable'], title: 'Made-up merge entry unreadable', why: `Merge entry ${String(ids['unreadable'])} does not hold what the merge queue writes: it names nobody as its submitter.` },
      ])
    }
    expect(withTheUnreadable.narrow!.body.says).toBe(withTheUnreadable.whole!.body.says)
  })

  it('12: a gate outside this repository reads the same from the ids answer to its states as from the whole list, and that answer holds nothing else', () => {
    const before = whatTheGateReads(answered(THE_GATES_ASK_BEFORE))
    expect([...new Set(before.pairs.map((one) => one.split(' ')[1]))].sort(), 'the made-up office holds an entry in each of the gate\'s states').toEqual([...THE_GATES_STATES].sort())
    expect(before.pairs.length, 'more entries than the gate logs').toBeGreaterThan(4)
    const now = answered(THE_GATES_ASK_NOW)
    expect(whatTheGateReads(now)).toEqual(before)
    // narrowedByPermission IS EVERY REPLY'S, as case 3 says.
    expect(Object.keys(now), JSON.stringify(Object.keys(now))).toEqual(['lanes', 'unreadable', 'says', 'workspaceId', 'narrowedByPermission'])
    for (const one of now.lanes.flatMap((lane: any) => lane.entries)) expect(Object.keys(one), `the fields of ${String(one.id)}`).toEqual(['id', 'state', 'lane'])
    // THE WHOLE LIST TO THE SAME STATES, cut to those fields: the same lanes, who holds each, the same entries in the lane's order, and the same sentence.
    const whole = answered(q({ state: THE_GATES_STATES.join(',') }))
    expect(now.lanes).toEqual(whole.lanes.map((lane: any) => ({ ...lane, entries: lane.entries.map((one: any) => ({ id: one.id, state: one.state, lane: one.lane })) })))
    expect(now.unreadable).toEqual(whole.unreadable)
    expect(now.says, 'the sentence is the list\'s own, whatever the shape').toBe(whole.says)
    const root = now.lanes.find((lane: any) => lane.lane === ROOT).entries.map((one: any) => one.id)
    expect(root, 'a move to the front orders the lane in this answer too').toEqual([ids['moved'], ids['moved-late'], ids['repair'], ids['testing']])
    expect(got.get(THE_GATES_ASK_NOW)!.bytes * 10, 'the ids answer to the gate\'s states is less than a tenth of the whole list').toBeLessThan(got.get(THE_GATES_ASK_BEFORE)!.bytes)
  })
})

// ============================================================================ the merge tool

/** One ask of the list as the office heard it: its lane, its states in order of their names, and its shape. */
function readTheAsk(line: string): { lane: string | null; states: string[] | null; shape: string | null } {
  const url = new URL(line.slice(line.indexOf(' ') + 1), 'http://made-up.invalid')
  return { lane: url.searchParams.get('lane'), states: url.searchParams.get('state')?.split(',').sort() ?? null, shape: url.searchParams.get('shape') }
}
const asksOf = (lines: readonly string[]) => lines.filter((one) => one.startsWith('GET /api/merge-queue?')).map(readTheAsk)
const narrowAsk = (lane: string, states: readonly string[] | null) => ({ lane, states: states === null ? null : [...states].sort(), shape: 'narrow' })

describe('the merge tool', () => {
  const LANDING = { id: 'made-up-landing', state: 'landing', lane: ROOT, run: 'made-up-run', changeset: { adapter: 'git', root: ROOT, commit: 'c'.repeat(40) }, machine: {} }
  const aReply = (entries: unknown[], lane = ROOT): Record<string, unknown> => ({
    lanes: [{ lane, occupiedBy: { entry: 'made-up-holder', workspaceId: WORKSPACE, state: 'testing' }, entries }],
    unreadable: [],
    says: 'A made-up reply of the merge queue.',
    emergencyPushes: [],
    held: null,
    workspaceId: WORKSPACE,
  })
  /** How the stand-in answers the list: as this office does, as an older office does, or refusing it some other way. */
  let answers: 'today' | 'older' | 'refuses' = 'today'
  let reply: Record<string, unknown> = aReply([])
  const heard: string[] = []
  let stand: Server
  let scratch = ''
  let main = ''
  let keeper: typeof import('../tools/merge-tool/office-keeper.mjs')
  let documents: typeof import('../tools/merge-tool/documents.mjs')
  let push: typeof import('../tools/merge-tool/emergency-push.mjs')
  let failure: typeof import('../tools/merge-tool/log-and-state.mjs').MergerFailure
  let shared: Record<string, unknown>

  /** The answer a stand-in office gives to one ask of the list. */
  const theListAnswer = (url: string): { status: number; body: unknown } => {
    if (answers === 'refuses') return { status: 400, body: { error: 'A made-up refusal of the list.' } }
    if (answers === 'older' && new URL(url, 'http://made-up.invalid').searchParams.has('shape')) return { status: 400, body: { error: THE_OLDER_OFFICES_REFUSAL } }
    return { status: 200, body: reply }
  }
  const theLog = (): string => readFileSync(join(scratch, 'the-merger.log'), 'utf8')
  const beginning = (mode: typeof answers, entries: unknown[]): void => {
    answers = mode
    reply = aReply(entries)
    heard.length = 0
  }

  beforeAll(async () => {
    stand = createServer((request, answer) => {
      request.resume()
      const url = request.url ?? ''
      heard.push(`${String(request.method)} ${url}`)
      const said =
        request.method === 'GET' && url.startsWith('/api/merge-queue?')
          ? theListAnswer(url)
          : request.method === 'GET' && url === '/api/merge-queue/made-up-entry'
            ? { status: 200, body: { entry: { id: 'made-up-entry', state: 'judged', lane: ROOT } } }
            : request.method === 'POST' && url === '/api/merge-queue/made-up-entry/step'
              ? { status: 409, body: { error: 'The lane is held by a made-up entry.' } }
              : { status: 404, body: { error: 'This made-up office answers only the merge queue.' } }
      answer.writeHead(said.status, { 'content-type': 'application/json' })
      answer.end(JSON.stringify(said.body))
    })
    await new Promise<void>((ok) => stand.listen(0, '127.0.0.1', ok))
    const at = `http://127.0.0.1:${String((stand.address() as AddressInfo).port)}`
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-narrow-list-'))
    main = join(scratch, 'main')
    const made = spawnSync('git', ['init', '-q', '-b', 'main', main], { encoding: 'utf8' })
    expect(made.status, made.stderr).toBe(0)
    const argv = process.argv
    process.argv = [argv[0]!, argv[1]!, '--entry', 'made-up-entry', '--session', 'made-up-session', '--workdir', scratch, '--api', at, '--office-for', '6']
    try {
      keeper = await import('../tools/merge-tool/office-keeper.mjs')
      documents = await import('../tools/merge-tool/documents.mjs')
      push = await import('../tools/merge-tool/emergency-push.mjs')
      failure = (await import('../tools/merge-tool/log-and-state.mjs')).MergerFailure
      shared = { ...(await import('../src/shared/merge-queue.ts')) }
    } finally {
      process.argv = argv
    }
  })

  afterAll(async () => {
    stand?.closeAllConnections()
    await new Promise<void>((ok) => (stand === undefined ? ok() : stand.close(() => ok())))
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  /** The emergency push's own ask, sent to the stand-in, so whoMovesMain is heard there too. */
  const theEmergencyPushesAsk = async (method: string, path: string): Promise<{ status: number; body: unknown }> => {
    heard.push(`${method} ${path}`)
    if (method === 'GET' && path.startsWith('/api/merge-queue?')) return theListAnswer(path)
    return { status: 418, body: { error: 'This made-up office takes no emergency push.' } }
  }
  const anEmergencyPush = () =>
    push
      .runTheEmergencyPush({
        root: main,
        commit: 'a'.repeat(40),
        message: { id: 'made-up-message', seq: 1, contentHash: 'made-up-hash' },
        ask: theEmergencyPushesAsk,
        sleep: keeper.sleep,
        whatAboutTheOffice: async () => ({ mainOnly: true, says: 'A made-up office that runs from another folder.' }),
        waitMs: 0,
        everyMs: 10,
      })
      .then(() => null, (error: unknown) => error)

  it('7: each reader of the list asks for the narrow answer, in the states it reads', async () => {
    const each: [string, () => Promise<unknown>, ReturnType<typeof narrowAsk>[]][] = [
      ['theLane', () => keeper.theLane(ROOT), [narrowAsk(ROOT, null)]],
      ['theMigrationsQueued', () => keeper.theMigrationsQueued(ROOT, { id: 'made-up-entry' }), [narrowAsk(ROOT, NOT_FINAL)]],
      ['conflictsAfterLanding', () => keeper.conflictsAfterLanding(ROOT, 'main'), [narrowAsk(ROOT, ['pinned', 'judged'])]],
      ['aMoveOfOnlyDocuments', () => documents.aMoveOfOnlyDocuments(ROOT, 'a'.repeat(40), 'b'.repeat(40), { theLane: keeper.theLane }), [narrowAsk(DOCS, ['merged'])]],
      ['untilNoOtherLandingOf', () => documents.untilNoOtherLandingOf(ROOT, { theLane: keeper.theLane, sleep: keeper.sleep, ask: keeper.ask }), [narrowAsk(ROOT, ['landing']), narrowAsk(DOCS, ['landing']), narrowAsk(ROOT, ['landing'])]],
      ['sayThePushesThatMovedMain', () => push.sayThePushesThatMovedMain(main, 'a'.repeat(40), 'b'.repeat(40), { ask: keeper.ask }), [narrowAsk(main, ['landing'])]],
      ['step after a refused integrating', () => keeper.step('integrating', { made: 'up' }), [narrowAsk(ROOT, HOLDS_A_LANE)]],
    ]
    for (const [name, read, asked] of each) {
      beginning('today', [])
      await read()
      expect(asksOf(heard), name).toEqual(asked)
    }
    beginning('today', [])
    reply = aReply([{ ...LANDING, lane: main }], main)
    const ended = await anEmergencyPush()
    expect(ended, 'a landing entry moves main, so the push waits and gives up').toBeInstanceOf(failure)
    expect(asksOf(heard).sort((a, b) => String(a.lane).localeCompare(String(b.lane))), 'whoMovesMain').toEqual([narrowAsk(main, ['landing']), narrowAsk(`${main} ${DOCUMENTS_LANE}`, ['landing'])])
  }, 30_000)

  it('8: an office older than the shapes is asked once more for the whole list, and the log says so', async () => {
    const said = shared['theWholeListAskedOfAnOlderOffice']
    expect(said, 'the sentence an older office is said in').toBeTypeOf('function')
    beginning('older', [LANDING])
    expect((await keeper.theLane(ROOT)).map((one: any) => one.id), 'the lane is read from the whole list').toEqual([LANDING.id])
    expect(asksOf(heard)).toEqual([narrowAsk(ROOT, null), { lane: ROOT, states: null, shape: null }])
    expect(theLog()).toContain((said as (path: string) => string)(heard[0]!.slice('GET '.length)))

    beginning('older', [])
    reply = aReply([{ ...LANDING, lane: main }], main)
    const ended = await anEmergencyPush()
    expect(ended, 'the landing entry is read from the whole list, so the push waits and gives up').toBeInstanceOf(failure)
    expect((ended as Error).message).toContain(`merge entry ${LANDING.id} is landing`)
    expect(asksOf(heard).filter((one) => one.shape === null).map((one) => one.lane).sort()).toEqual([main, `${main} ${DOCUMENTS_LANE}`])
  }, 30_000)

  it('9: any other refusal of the narrow list is taken as a refusal, and the list is not asked again', async () => {
    beginning('refuses', [LANDING])
    expect(await keeper.theLane(ROOT), 'the lane is read as when the office refuses its list').toEqual([])
    expect(asksOf(heard)).toEqual([narrowAsk(ROOT, null)])
    const queued = await keeper.theMigrationsQueued(ROOT, { id: 'made-up-entry' })
    expect(queued.lane).toContain('A made-up refusal of the list.')
  })
})

// ============================================================================ the timing job and the page

describe('the timing job', () => {
  const LANE = '/synthetic-main'
  function fixture(mode: 'today' | 'older' | 'broken') {
    const now = new Date('2026-10-08T01:00:00')
    const counters = timingCounters(LANE).map((one, i) => ({ ...one, id: `counter-${String(i)}`, follows: one.follows ?? [] }))
    const asked: string[] = []
    const refusal = Reflect.get(timingJob, 'anOfficeRefusal') as ((method: string, path: string, status: number, answer: unknown) => Error) | undefined
    const ask = vi.fn(async (method: string, path: string, body?: any): Promise<any> => {
      if (path === '/api/counters') return { counters }
      if (path.includes('/counter-0?')) return { rows: [{ seq: 1, what: 'firing', at: '2026-10-08 00:00:00', answer: { kind: 'job', job: TIMING_JOB, finished: false } }], more: false }
      if (path.includes('/counter-1?')) return { rows: [], more: false }
      if (path.startsWith('/api/merge-queue?')) {
        asked.push(path)
        if (mode === 'broken') throw refusal!(method, path, 500, { error: 'A made-up fault of the office.' })
        if (mode === 'older' && new URL(path, 'http://made-up.invalid').searchParams.has('shape')) throw refusal!(method, path, 400, { error: THE_OLDER_OFFICES_REFUSAL })
        return { lanes: [{ lane: LANE, occupiedBy: null, entries: [] }], unreadable: [] }
      }
      if (path === '/api/records' && method === 'POST') return { record: { id: 'result' }, body }
      if (path === '/api/records/result/revisions') return { revisions: [{ seq: 1, contentHash: 'synthetic-hash' }] }
      if (path === '/api/records/result/short-forms' && method === 'GET') return { levels: [{ rung: 'outline', why: 'notWritten' }] }
      return {}
    })
    const measured = { status: 'passed', quiet: true, limitMs: 300, coldFixtureMs: 12_000, machineBefore: { load1: 1, cores: 20 }, machineAfter: { load1: 2, cores: 20 }, runs: [[{ press: 'Collect', ms: 125, doors: ['/api/reviews'] }]] }
    const run = vi.fn(async () => ({ code: 0, commit: 'a'.repeat(40), measurements: measured }))
    const state = new Map<string, any>()
    const doors = { ask, reading: () => ({ load1: 1, cores: 20, memAvailableKiB: 90_000_000 }), run, load: (key: string) => state.get(key) ?? {}, save: (key: string, value: any) => void state.set(key, value), now: () => now, lane: LANE, reader: 'wren' }
    return { doors, asked, refusal }
  }

  it('10: the timing job asks for the narrow list; an older office is asked once more for the whole list and said; any other refusal fails as before', async () => {
    const today = fixture('today')
    expect(today.refusal, 'the refusal the timing job\'s ask throws, with its status and answer').toBeTypeOf('function')
    expect(await timingJob.timingJobTick(today.doors)).toContain('passed')
    expect(asksOf(today.asked.map((one) => `GET ${one}`))).toEqual([narrowAsk(LANE, ['testing', 'integrating', 'landing'])])

    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const older = fixture('older')
      expect(await timingJob.timingJobTick(older.doors)).toContain('passed')
      expect(asksOf(older.asked.map((one) => `GET ${one}`))).toEqual([narrowAsk(LANE, ['testing', 'integrating', 'landing']), { lane: LANE, states: ['integrating', 'landing', 'testing'], shape: null }])
      const said = Reflect.get(await import('../src/shared/merge-queue.ts'), 'theWholeListAskedOfAnOlderOffice') as (path: string) => string
      expect(warned).toHaveBeenCalledWith(said(older.asked[0]!))
    } finally {
      warned.mockRestore()
    }

    const broken = fixture('broken')
    await expect(timingJob.timingJobTick(broken.doors)).rejects.toThrow('A made-up fault of the office.')
    expect(broken.asked).toHaveLength(1)
  })
})

describe('the queue page', () => {
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('11: the page asks for the page\'s answer in the states it shows', async () => {
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    }
    const real = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = (async (url: string) => {
      seen.push(url)
      return new Response(JSON.stringify({ lanes: [], says: 'A made-up reply.', workspaceId: WORKSPACE, emergencyPushes: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      // THROUGH api.ts, which joins its parts: a part loaded first finds the join half-made.
      const { api } = await import('../src/web/api.ts')
      await api.mergeQueue(['judged', 'testing'])
    } finally {
      globalThis.fetch = real
    }
    expect(seen.map((one) => `GET ${one}`).map(readTheAsk)).toEqual([{ lane: null, states: ['judged', 'testing'], shape: 'page' }])
  })
})
