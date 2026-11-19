// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A LINK MAY JOIN, AND WHAT A LINK ROW RECORDS ABOUT ITSELF. Wave 13s, group g1-links.
 *
 * Four problems, one door (`createLink` in src/server/lib/records.ts) and its readers:
 *
 *   kKY18MXI98F_  an `implements` link runs from a module to a block, and the door refuses any
 *                 other pair, with a sentence naming the link types to use instead.
 *   vgwYJm6SuPtF  a block reads as carried only by a module. An `implements` link already stored
 *                 from something else is reported beside the block, not counted.
 *   zt5F7xG_moRl  a link row records whether a person, an agent or the office made it, and the
 *                 readers use that where it is recorded. A row written before says not recorded.
 *   TZP9AJb4o2Cs  a partial gate's stage is stored with its sort: a checklist item, a block, or
 *                 words. A stage naming a step or item of some other record is refused.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { modulesCarrying, readPipelineBlocks, type BlockLinkRow } from '../src/shared/blocks.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

const AGENT = { type: 'agent', id: 'g1-links-test-agent' } as const

function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title, data: { blockIds: [] }, actor: t.api.HUMAN })
}
function block(pipelineId: string, name: string) {
  return t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block
}
function module_(title: string, items: string[] = []) {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title,
    data: items.length === 0 ? {} : { parts: [{ id: `${title}-part`, name: 'Part', items: items.map((id) => ({ id, text: id, state: 'todo' })) }] },
    actor: t.api.HUMAN,
  })
}
function note(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'note', title, actor: t.api.HUMAN })
}
function linkCount(): number {
  return (t.client.sqlite.prepare('select count(*) as n from links').get() as { n: number }).n
}
function refusal(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    return String((err as Error).message)
  }
  throw new Error('the write was accepted')
}
function linkRows(): BlockLinkRow[] {
  return (
    t.client.sqlite
      .prepare('select id, from_id as fromId, to_id as toId, type, gate, gate_up_to as upTo, inferred from links')
      .all() as { id: string; fromId: string; toId: string; type: string; gate: 'hard' | 'partial' | null; upTo: string | null; inferred: number }[]
  ).map((row) => ({ ...row, inferred: row.inferred === 1 }))
}
/** A link row as an older write left it: inserted straight into the table, past the door. */
function storeOldLink(id: string, fromId: string, toId: string, type: string): void {
  t.client.sqlite
    .prepare(
      "insert into links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) " +
        `values (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-08-20 10:00:00', '2026-08-20 10:00:00', ?, ?, ?, 0, 'claude-code')`,
    )
    .run(id, fromId, toId, type)
}

// ============================================================================ kKY18MXI98F_

describe('an implements link runs from a module to a block, and nothing else is written', () => {
  it('refuses a note implementing a block, names the types to use, and writes nothing', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const n = note('A note about sensing')
    const before = linkCount()
    const said = refusal(() => t.api.createLink({ fromId: n.id, toId: sense.id, type: 'implements', actor: AGENT }))
    expect(said).toContain('runs from a module to the step of a pipeline it carries out')
    expect(said).toContain('`about`')
    expect(said).toContain('`derived_from`')
    expect(said).toContain('Nothing was written.')
    expect(linkCount()).toBe(before)
  })

  it('refuses a module implementing something that is not a block', () => {
    const m = module_('Tray clamp')
    const n = note('A decision-like note')
    expect(refusal(() => t.api.createLink({ fromId: m.id, toId: n.id, type: 'implements', actor: AGENT }))).toContain(
      'runs from a module to the step of a pipeline',
    )
  })

  it('refuses the same link sent with a new record, and the record is not written either', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const before = t.api.listRecords({ workspaceId: 'default' }).length
    refusal(() =>
      t.api.createRecordWithReport({
        workspaceId: 'default',
        kind: 'task',
        title: 'A task that says it implements a step',
        links: [{ toId: sense.id, type: 'implements' }],
        actor: AGENT,
      }),
    )
    expect(t.api.listRecords({ workspaceId: 'default' }).length).toBe(before)
  })

  it('accepts a module implementing a block', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const m = module_('Tray clamp')
    expect(t.api.createLink({ fromId: m.id, toId: sense.id, type: 'implements', actor: AGENT }).id).toBeTruthy()
  })
})

// ============================================================================ vgwYJm6SuPtF

describe('a block reads as carried only by a module, and a stored link from anything else is reported', () => {
  it('leaves a task out of the carriers, reports it beside the block, and both readers agree', { timeout: 60_000 }, async () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const m = module_('Tray clamp')
    const task = t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Wire the sensor', actor: t.api.HUMAN })
    t.api.createLink({ fromId: m.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })
    storeOldLink('old-implements', task.id, sense.id, 'implements')

    const records = t.api.listRecords({ workspaceId: 'default' })
    const pipelineRecord = t.api.getRecord(p.id)
    if (pipelineRecord === null) throw new Error('no pipeline')
    const step = one(readPipelineBlocks(pipelineRecord, records, linkRows()).blocks, 'the one step')
    expect(step.moduleIds).toEqual([m.id])
    expect(step.notCarriers).toEqual([{ linkId: 'old-implements', fromId: task.id, kind: 'task', title: 'Wire the sensor' }])
    expect(modulesCarrying(sense.id, linkRows(), records).map((c) => c.moduleId)).toEqual([m.id])

    // And the route that serves a pipeline says the same thing.
    const reply = await app.inject({ method: 'GET', url: `/api/records/${p.id}` })
    expect(reply.statusCode).toBe(200)
    const served = one(
      (reply.json() as { blocks: { blocks: { id: string; moduleIds: string[]; notCarriers: { linkId: string }[] }[] } }).blocks.blocks,
      'the served step',
    )
    expect(served.moduleIds).toEqual([m.id])
    expect(served.notCarriers.map((x) => x.linkId)).toEqual(['old-implements'])
  })
})

// ============================================================================ zt5F7xG_moRl

describe('a link row says whether a person or an agent made it', () => {
  function fork() {
    const proposal = t.api.createRecord({
      workspaceId: 'default',
      kind: 'proposal',
      title: 'One capacity table, or capacity as a record kind?',
      data: { question: 'Which?', options: ['a — a table', 'b — a kind'] },
      actor: AGENT,
    })
    const decision = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'Capacity stays out of the record graph',
      data: { because: 'a plan is person-level', authority: 'a measurement' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    return { proposal, decision }
  }

  it('stores the actor type beside the id, and serves it', () => {
    // The reading stays over every row; this case's rows are the ones that were not there when it
    // started.
    const linksBefore = new Set(
      (t.client.sqlite.prepare('select id from links').all() as { id: string }[]).map((row) => row.id),
    )
    const a = note('One')
    const b = note('Two')
    const c = note('Three')
    t.api.createLink({ fromId: a.id, toId: b.id, type: 'relates_to', actor: AGENT })
    t.api.createLink({ fromId: a.id, toId: c.id, type: 'relates_to', actor: t.api.HUMAN })
    const rows = t.client.sqlite.prepare('select id, to_id as toId, created_by_type as type from links').all() as {
      id: string
      toId: string
      type: string
    }[]
    const added = rows.filter((row) => !linksBefore.has(row.id))
    expect(Object.fromEntries(added.map((r) => [r.toId, r.type]))).toEqual({ [b.id]: 'agent', [c.id]: 'human' })
    const served = t.api.allLinks('default')
    expect(served.find((l) => l.toId === b.id)?.createdByType).toBe('agent')
    expect(served.find((l) => l.toId === c.id)?.createdByType).toBe('human')
  })

  it('reads a row written before the column as not recorded, never as a guess', () => {
    const a = note('One')
    const b = note('Two')
    storeOldLink('old-link', a.id, b.id, 'relates_to')
    expect(t.api.allLinks('default').find((l) => l.id === 'old-link')?.createdByType).toBeNull()
  })

  it('tells the fork readers who made the settling link, and reads the row before the change log', () => {
    // The updates below write every row, as they did over a fresh database. The rows that were
    // already here are put back at the end, so a later case finds the office as this one did.
    const linksBeforeTheCase = t.client.sqlite.prepare('select id, created_by_type as type from links').all() as {
      id: string
      type: string | null
    }[]
    try {
      const { proposal, decision } = fork()
      t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: AGENT })
      const by = one(t.api.proposalResolution(proposal)?.by ?? [], 'the settling decision')
      expect(by.linkedBy).toBe(AGENT.id)
      expect(by.linkedByType).toBe('agent')
      expect(t.api.humanMadeThisLink(decision.id, 'derived_from', proposal.id)).toBe(false)

      // The row is what answers where it recorded an answer: the change log still says an agent.
      t.client.sqlite.prepare("update links set created_by_type = 'human'").run()
      expect(t.api.humanMadeThisLink(decision.id, 'derived_from', proposal.id)).toBe(true)
      expect(one(t.api.proposalResolution(proposal)?.by ?? [], 'the settling decision').linkedByType).toBe('human')

      // A row that recorded nothing falls back to the change log, which says an agent.
      t.client.sqlite.prepare('update links set created_by_type = null').run()
      expect(t.api.humanMadeThisLink(decision.id, 'derived_from', proposal.id)).toBe(false)
      expect(one(t.api.proposalResolution(proposal)?.by ?? [], 'the settling decision').linkedByType).toBeNull()
    } finally {
      const putBack = t.client.sqlite.prepare('update links set created_by_type = ? where id = ?')
      for (const row of linksBeforeTheCase) putBack.run(row.type, row.id)
    }
  })
})

// ============================================================================ TZP9AJb4o2Cs

describe('a partial gate stores which sort of stage it names, and refuses a stage of another record', () => {
  function sortOf(fromId: string, toId: string): string | null {
    return (
      t.client.sqlite.prepare('select gate_up_to_sort as s from links where from_id = ? and to_id = ?').get(fromId, toId) as { s: string | null }
    ).s
  }
  function gateStageSeenFrom(recordId: string, otherId: string) {
    return one(t.api.resolveLinks(recordId).filter((l) => l.other.id === otherId), 'the link').gateStage
  }

  it('stores a block of the pipeline as a block, a checklist item as an item, and anything else as words', () => {
    const p = pipeline('Transplant v2')
    block(p.id, 'Sense the pot')
    const hold = block(p.id, 'Close and hold')
    const m = module_('Tray clamp', ['mount-1'])
    const bench = note('The bench')
    const jig = note('The jig')
    const arm = note('The arm')

    t.api.createLink({ fromId: bench.id, toId: p.id, type: 'blocks', gate: { kind: 'partial', upTo: hold.id }, actor: AGENT })
    t.api.createLink({ fromId: jig.id, toId: m.id, type: 'blocks', gate: { kind: 'partial', upTo: 'mount-1' }, actor: AGENT })
    t.api.createLink({ fromId: arm.id, toId: p.id, type: 'blocks', gate: { kind: 'partial', upTo: 'the two rows already measured' }, actor: AGENT })
    t.api.createLink({ fromId: arm.id, toId: m.id, type: 'blocks', gate: { kind: 'hard' }, actor: AGENT })

    expect(sortOf(bench.id, p.id)).toBe('block')
    expect(sortOf(jig.id, m.id)).toBe('item')
    expect(sortOf(arm.id, p.id)).toBe('words')
    expect(sortOf(arm.id, m.id)).toBeNull()
    // And the reader says the same, from the blocked end.
    expect(gateStageSeenFrom(p.id, bench.id)).toBe('block')
    expect(gateStageSeenFrom(m.id, jig.id)).toBe('item')
    expect(gateStageSeenFrom(p.id, arm.id)).toBe('words')
    expect(gateStageSeenFrom(m.id, arm.id)).toBeNull()
  })

  it('refuses a block of a different pipeline, and writes nothing', () => {
    const p = pipeline('Transplant v2')
    block(p.id, 'Sense the pot')
    const q = pipeline('Calibration sweep')
    const elsewhere = block(q.id, 'Measure setting 15')
    const bench = note('The bench')
    const before = linkCount()
    const said = refusal(() =>
      t.api.createLink({ fromId: bench.id, toId: p.id, type: 'blocks', gate: { kind: 'partial', upTo: elsewhere.id }, actor: AGENT }),
    )
    expect(said).toContain('Measure setting 15')
    expect(said).toContain('Nothing was written.')
    expect(linkCount()).toBe(before)
  })

  it('refuses a checklist item of a different record, and writes nothing', () => {
    const m = module_('Tray clamp', ['mount-1'])
    const other = module_('Bench jig', ['jig-7'])
    const bench = note('The bench')
    const before = linkCount()
    const said = refusal(() =>
      t.api.createLink({ fromId: bench.id, toId: m.id, type: 'blocks', gate: { kind: 'partial', upTo: 'jig-7' }, actor: AGENT }),
    )
    expect(said).toContain('Bench jig')
    expect(said).toContain(other.id)
    expect(linkCount()).toBe(before)
  })

  it('reads a partial gate written before the sort was stored as not recorded', () => {
    const p = pipeline('Transplant v2')
    const bench = note('The bench')
    t.api.createLink({ fromId: bench.id, toId: p.id, type: 'blocks', gate: { kind: 'partial', upTo: 'the dry run' }, actor: AGENT })
    t.client.sqlite.prepare('update links set gate_up_to_sort = null').run()
    expect(gateStageSeenFrom(p.id, bench.id)).toBe('not_recorded')
  })
})
