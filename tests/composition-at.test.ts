// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A SUBJECT WAS MADE OF AT A TIME, AND THE THREE THINGS THAT MUST NOT HAPPEN TO IT.
 *
 * `compositionAt` is the one projection six evolution readings share. This file holds its
 * membership filter, its provenance and its `unaccounted` value.
 *
 * THE CASE THAT CAUGHT A REAL DEFECT IS `an intended future is never part of a composition`. It was
 * written because the amendment to step 45 asked for it, and on 20 August 2026 it failed: a
 * `direction` linked `about` the demonstration pipeline appeared in the step-back walk, because the
 * walk admitted any link event with the subject at one end. A reader stepping back through that
 * walk would have met a guess about the future among the recorded past. The fix is one condition in
 * `compositionEvents` and it is the membership filter applied to the walk as well as to the members.
 *
 * The rows here are built through the ordinary write path — `createRecord`, `addBlock`,
 * `patchBlock`, `removeBlock`, `createLink`, `deleteLink` — so what the projection reads is what
 * the product writes, revision by revision and change row by change row. Nothing is hand-stitched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import {
  compositionAt,
  compositionBefore,
  compositionDiff,
  compositionEvents,
  compositionStops,
  everMembers,
  type CompositionSources,
  type LinkEventFact,
  type RevisionFact,
} from '../src/shared/composition.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)
afterAll(() => {
  t.close()
})

const AGENT = { type: 'agent', id: 'claude-code' } as const

/** Every source the projection reads, taken out of the throwaway database by hand-written SQL. */
function sourcesOf(subjectId: string, kind: 'pipeline' | 'module'): CompositionSources {
  const raw = t.client.sqlite
  const revisionsOf = (id: string): RevisionFact[] =>
    raw
      .prepare('select * from revisions where record_id = ? order by seq')
      .all(id)
      .map((raw_) => raw_ as Record<string, unknown>)
      .map((row) => ({
        recordId: row['record_id'] as string,
        seq: row['seq'] as number,
        at: row['at'] as string,
        op: row['op'] as string,
        actorType: row['actor_type'] as string,
        actorId: row['actor_id'] as string,
        title: row['title'] as string,
        data: JSON.parse((row['data'] as string) ?? '{}') as Record<string, unknown>,
        deletedAt: (row['deleted_at'] as string | null) ?? null,
        contentHash: row['content_hash'] as string,
      }))
  const linkEvents: LinkEventFact[] = raw
    .prepare("select * from changes where op in ('link','unlink') order by at")
    .all()
    .map((raw_) => raw_ as Record<string, unknown>)
    .map((row) => ({
      at: row['at'] as string,
      op: row['op'] === 'unlink' ? ('unlink' as const) : ('link' as const),
      type: (row['field'] as string) ?? '',
      fromId: row['record_id'] as string,
      toId: ((row['op'] === 'unlink' ? row['old_value'] : row['new_value']) as string) ?? '',
      actorType: row['actor_type'] as string,
      actorId: row['actor_id'] as string,
    }))
  const half: CompositionSources = {
    subjectId,
    subjectKind: kind,
    subjectRevisions: revisionsOf(subjectId),
    childRevisions: [],
    linkEvents,
    recordsNow: [],
  }
  const candidates = everMembers(half)
  return {
    ...half,
    childRevisions: candidates.flatMap(revisionsOf),
    recordsNow: candidates
      .map((id) => raw.prepare('select id, kind, origin from records where id = ?').get(id))
      .filter((row: unknown): row is Record<string, unknown> => row !== undefined)
      .map((row: Record<string, unknown>) => ({
        id: row['id'] as string,
        kind: row['kind'] as string,
        origin: (row['origin'] as string | null) ?? null,
      })),
  }
}

function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title, data: { blockIds: [] }, actor: AGENT })
}

function module_(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'module', title, actor: AGENT })
}

const nowIsh = () =>
  (t.client.sqlite.prepare("select datetime('now','localtime') as at").get() as { at: string }).at

describe('compositionAt reads three sources and says which answered', () => {
  it('a pipeline is made of the blockIds of the revision in effect, with provenance per element', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const b = t.blocks.addBlock(p.id, { name: 'Detector', state: 'todo' }, AGENT).block
    const sources = sourcesOf(p.id, 'pipeline')
    const now = compositionAt(sources, nowIsh())

    expect(now.members.map((m) => m.recordId)).toEqual([a.id, b.id])
    expect(now.subject.revision?.seq).toBe(3)
    // Provenance: the subject's revision listed it, the child's own revision named it.
    expect(now.members[0]?.from.subject?.seq).toBe(3)
    expect(now.members[0]?.from.child?.seq).toBe(1)
    expect(now.members[0]?.title).toBe(a.title)
    expect(now.unaccounted).toEqual([])
  })

  it('an intended future is never part of a composition, in the members OR in the walk', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const future = t.api.createRecord({
      workspaceId: 'default',
      kind: 'direction',
      title: 'Learn the scorer instead',
      data: { depth: 'noticed' },
      actor: AGENT,
    })
    t.api.createLink({ fromId: future.id, toId: p.id, type: 'about', actor: AGENT })

    const sources = sourcesOf(p.id, 'pipeline')
    const now = compositionAt(sources, nowIsh())
    const walk = compositionEvents(sources)

    expect(now.members.map((m) => m.recordId)).toEqual([a.id])
    expect(now.members.some((m) => m.recordId === future.id)).toBe(false)
    // The walk is the half that failed before this test existed.
    expect(walk.some((event) => event.recordId === future.id || event.otherId === future.id)).toBe(false)
    expect(everMembers(sources)).not.toContain(future.id)
  })

  it('a module is made of the implements links the change log says it had at that time', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const b = t.blocks.addBlock(p.id, { name: 'Detector', state: 'todo' }, AGENT).block
    const m = module_('Perception')
    t.api.createLink({ fromId: m.id, toId: a.id, type: 'implements', actor: AGENT })
    const second = t.api.createLink({ fromId: m.id, toId: b.id, type: 'implements', actor: AGENT })

    const before = sourcesOf(m.id, 'module')
    expect(compositionAt(before, nowIsh()).members.map((x) => x.recordId).sort()).toEqual([a.id, b.id].sort())

    t.api.deleteLink(second.id, AGENT, 'default')
    const after = sourcesOf(m.id, 'module')
    const now = compositionAt(after, nowIsh())
    expect(now.members.map((x) => x.recordId)).toEqual([a.id])
    expect(now.members[0]?.from.link?.type).toBe('implements')
  })

  it('a module carries what it implements, and nothing else it is linked to', () => {
    // M2 IN design/round-nine/step45-49-mutations.mjs. Widening the module's membership to every
    // link type went unnoticed until this test existed: a module is linked to reports, problems and
    // directions all day, and every one of them would have become part of what it was made of.
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const m = module_('Perception')
    t.api.createLink({ fromId: m.id, toId: a.id, type: 'implements', actor: AGENT })
    const future = t.api.createRecord({
      workspaceId: 'default',
      kind: 'direction',
      title: 'Try a learned scorer',
      data: { depth: 'noticed' },
      actor: AGENT,
    })
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'The rig drifts', actor: AGENT })
    t.api.createLink({ fromId: m.id, toId: future.id, type: 'about', actor: AGENT })
    t.api.createLink({ fromId: m.id, toId: note.id, type: 'relates_to', actor: AGENT })

    const now = compositionAt(sourcesOf(m.id, 'module'), nowIsh())
    expect(now.members.map((member) => member.recordId)).toEqual([a.id])
  })

  it('the same module at an earlier stamp still holds what it held then', () => {
    // HAND-WRITTEN STAMPS, AND THE REASON IS THE THING BEING TESTED. A test writes its link and its
    // unlink inside the same second, and two events in one second have no recorded order — that is
    // exactly what the walk reports as `tied`. So the replay over TIME is fed rows with times of
    // their own, which is what the corpus holds and what a test cannot produce by writing fast.
    const sources: CompositionSources = {
      subjectId: 'module-1',
      subjectKind: 'module',
      subjectRevisions: [
        {
          recordId: 'module-1',
          seq: 1,
          at: '2026-08-01 09:00:00',
          op: 'create',
          actorType: 'agent',
          actorId: 'builder',
          title: 'Perception',
          data: {},
          deletedAt: null,
          contentHash: 'h1',
        },
      ],
      childRevisions: [
        {
          recordId: 'block-a',
          seq: 1,
          at: '2026-08-01 09:00:00',
          op: 'create',
          actorType: 'agent',
          actorId: 'builder',
          title: 'Camera',
          data: {},
          deletedAt: null,
          contentHash: 'h2',
        },
        {
          recordId: 'block-b',
          seq: 1,
          at: '2026-08-01 09:00:00',
          op: 'create',
          actorType: 'agent',
          actorId: 'builder',
          title: 'Detector',
          data: {},
          deletedAt: null,
          contentHash: 'h3',
        },
      ],
      linkEvents: [
        { at: '2026-08-01 10:00:00', op: 'link', type: 'implements', fromId: 'module-1', toId: 'block-a', actorType: 'agent', actorId: 'builder' },
        { at: '2026-08-01 10:01:00', op: 'link', type: 'implements', fromId: 'module-1', toId: 'block-b', actorType: 'agent', actorId: 'builder' },
        { at: '2026-08-02 11:00:00', op: 'unlink', type: 'implements', fromId: 'module-1', toId: 'block-b', actorType: 'agent', actorId: 'builder' },
        { at: '2026-08-02 11:00:30', op: 'link', type: 'implements', fromId: 'module-2', toId: 'block-b', actorType: 'agent', actorId: 'builder' },
      ],
      recordsNow: [
        { id: 'block-a', kind: 'block', origin: 'fixture' },
        { id: 'block-b', kind: 'block', origin: 'fixture' },
      ],
    }
    expect(compositionAt(sources, '2026-08-01 10:00:30').members.map((m) => m.recordId)).toEqual(['block-a'])
    expect(compositionAt(sources, '2026-08-01 23:00:00').members.map((m) => m.recordId).sort()).toEqual([
      'block-a',
      'block-b',
    ])
    const afterTheMove = compositionAt(sources, '2026-08-03 00:00:00')
    expect(afterTheMove.members.map((m) => m.recordId)).toEqual(['block-a'])
    // The block did not vanish: another module carries it, and the pipeline's own reading says so.
    expect(compositionAt({ ...sources, subjectId: 'module-2' }, '2026-08-03 00:00:00')).toBeTruthy()
  })

  it('an id no record answers to is returned marked, never left out', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const sources = sourcesOf(p.id, 'pipeline')
    const invented = 'not-a-record'
    const withHole: CompositionSources = {
      ...sources,
      subjectRevisions: sources.subjectRevisions.map((rev) =>
        rev.seq === 2 ? { ...rev, data: { ...rev.data, blockIds: [a.id, invented] } } : rev,
      ),
    }
    const now = compositionAt(withHole, nowIsh())
    expect(now.members.map((m) => m.recordId)).toContain(invented)
    expect(now.members.find((m) => m.recordId === invented)?.unaccounted).toBe('noRecord')
    expect(now.unaccounted).toHaveLength(1)
  })

  it('a time before anything was recorded is an answer, not an empty picture', () => {
    const p = pipeline('Grasp')
    t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT)
    const sources = sourcesOf(p.id, 'pipeline')
    const long = compositionAt(sources, '2001-01-01 00:00:00')
    expect(long.subject.revision).toBeNull()
    expect(long.subject.unaccounted).toBe('noRevisionYet')
    expect(long.members).toEqual([])
    // A stamp nobody can read is its own answer and never an exception.
    expect(compositionAt(sources, 'whenever').subject.unaccounted).toBe('unreadableTime')
  })
})

describe('the walk, and stepping back through it', () => {
  it('steps back between stamps, and says when a stamp holds more than one event', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    t.blocks.addBlock(p.id, { name: 'Detector', state: 'todo' }, AGENT)
    const sources = sourcesOf(p.id, 'pipeline')
    const stops = compositionStops(compositionEvents(sources))

    expect(stops.length).toBeGreaterThan(0)
    // Adding a block writes the block's own create AND the pipeline's update. Nothing stored says
    // which came first, so they share a stop and every event at that stop says `tied`.
    const shared = stops.filter((stop) => stop.events.length > 1)
    expect(shared.length).toBeGreaterThan(0)
    expect(shared[0]?.events.every((event) => event.tied)).toBe(true)
    expect(compositionBefore(sources, stops, 0).subject.unaccounted).toBe('beforeAnythingRecorded')
    expect(a.id).toBeTruthy()
  })

  it('the walk over stamps of their own steps back one recorded change at a time', () => {
    const rev = (seq: number, at: string, blockIds: string[]) => ({
      recordId: 'pipe-1',
      seq,
      at,
      op: seq === 1 ? 'create' : 'update',
      actorType: 'agent',
      actorId: 'builder',
      title: 'Grasp',
      data: { blockIds },
      deletedAt: null,
      contentHash: `h${seq}`,
    })
    const child = (id: string, seq: number, at: string, title: string) => ({
      recordId: id,
      seq,
      at,
      op: seq === 1 ? 'create' : 'update',
      actorType: 'agent',
      actorId: 'builder',
      title,
      data: {},
      deletedAt: null,
      contentHash: `${id}-${seq}`,
    })
    const sources: CompositionSources = {
      subjectId: 'pipe-1',
      subjectKind: 'pipeline',
      subjectRevisions: [
        rev(1, '2026-08-01 09:00:00', []),
        rev(2, '2026-08-01 09:01:00', ['block-a']),
        rev(3, '2026-08-01 09:02:00', ['block-a', 'block-b']),
      ],
      childRevisions: [
        child('block-a', 1, '2026-08-01 09:01:00', 'Camera'),
        child('block-a', 2, '2026-08-01 09:03:00', 'Camera, calibrated'),
        child('block-b', 1, '2026-08-01 09:02:00', 'Detector'),
      ],
      linkEvents: [],
      recordsNow: [
        { id: 'block-a', kind: 'block', origin: 'authored' },
        { id: 'block-b', kind: 'block', origin: 'authored' },
      ],
    }
    const stops = compositionStops(compositionEvents(sources))
    expect(stops.map((stop) => stop.at)).toEqual([
      '2026-08-01 09:00:00',
      '2026-08-01 09:01:00',
      '2026-08-01 09:02:00',
      '2026-08-01 09:03:00',
    ])
    // A3 B1 → A1 B1 → A1 → nothing, one recorded change at a time and in recorded order.
    const titlesAt = (order: number) =>
      compositionBefore(sources, stops, order).members.map((member) => member.title)
    expect(compositionAt(sources, '2026-08-01 09:03:00').members.map((m) => m.title)).toEqual([
      'Camera, calibrated',
      'Detector',
    ])
    expect(titlesAt(3)).toEqual(['Camera', 'Detector'])
    expect(titlesAt(2)).toEqual(['Camera'])
    expect(titlesAt(1)).toEqual([])
    expect(compositionBefore(sources, stops, 0).subject.unaccounted).toBe('beforeAnythingRecorded')
  })

})

describe('the six marks', () => {
  it('added, removed, changed and moved, and an insertion does not move what it was put in front of', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const b = t.blocks.addBlock(p.id, { name: 'Detector', state: 'todo' }, AGENT).block
    const c = t.blocks.addBlock(p.id, { name: 'Cloud', state: 'todo' }, AGENT).block
    const sourcesBefore = sourcesOf(p.id, 'pipeline')
    const at1 = nowIsh()
    const before = compositionAt(sourcesBefore, at1)

    t.blocks.patchBlock(p.id, c.id, { state: 'done' }, AGENT)
    t.blocks.removeBlock(p.id, b.id, AGENT)
    const d = t.blocks.addBlock(p.id, { name: 'Fiducial', state: 'todo' }, AGENT).block
    t.blocks.reorderBlocks(p.id, [d.id, a.id, c.id], AGENT)

    const sourcesAfter = sourcesOf(p.id, 'pipeline')
    const after = compositionAt(sourcesAfter, nowIsh())
    const diff = compositionDiff(before, after)

    expect(diff.counts.added).toBe(1)
    expect(diff.counts.removed).toBe(1)
    expect(diff.counts.changed).toBe(1)
    // `a` and `c` kept their order relative to each other. The new block went in front of both, and
    // that is not a move: absolute positions shifted, ranks among the survivors did not.
    expect(diff.counts.moved).toBe(0)
    expect(diff.changes.find((change) => change.recordId === d.id)?.marks).toEqual(['added'])
    expect(diff.changes.find((change) => change.recordId === b.id)?.marks).toEqual(['removed'])
    expect(diff.changes.find((change) => change.recordId === c.id)?.marks).toEqual(['changed'])
  })

  it('moved is two survivors changing places, and regrouped is a different module carrying it', () => {
    const p = pipeline('Grasp')
    const a = t.blocks.addBlock(p.id, { name: 'Camera', state: 'todo' }, AGENT).block
    const b = t.blocks.addBlock(p.id, { name: 'Detector', state: 'todo' }, AGENT).block
    const one = module_('Perception')
    const two = module_('Grasp planning')
    const held = t.api.createLink({ fromId: one.id, toId: b.id, type: 'implements', actor: AGENT })
    const before = compositionAt(sourcesOf(p.id, 'pipeline'), nowIsh())

    t.blocks.reorderBlocks(p.id, [b.id, a.id], AGENT)
    t.api.deleteLink(held.id, AGENT, 'default')
    t.api.createLink({ fromId: two.id, toId: b.id, type: 'implements', actor: AGENT })

    const after = compositionAt(sourcesOf(p.id, 'pipeline'), nowIsh())
    const diff = compositionDiff(before, after)
    expect(diff.counts.moved).toBe(2)
    expect(diff.counts.regrouped).toBe(1)
    const moved = diff.changes.find((change) => change.recordId === b.id)
    expect(moved?.marks).toContain('moved')
    expect(moved?.marks).toContain('regrouped')
    expect(moved?.before?.carriers).toEqual([one.id])
    expect(moved?.after?.carriers).toEqual([two.id])
  })
})
