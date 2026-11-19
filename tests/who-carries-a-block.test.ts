// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO CARRIES THIS STEP — ASKED FROM THE PIPELINE AND ASKED FROM THE BLOCK, ANSWERED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Two readers answer "which modules carry this block". `readPipelineBlocks` answers it for every
 * step of one pipeline in a single pass over the workspace's links, because a pipeline page wants
 * all of them at once. `modulesCarrying` answers it for one block, because a caller holding a block
 * and no pipeline had nowhere to ask and would otherwise write the walk a second time — the defect
 * CLAUDE.md names at the top: the same fact worked out in two places, free to disagree with nothing
 * failing.
 *
 * So the filter is stated once, as `carriesBlock`, and both call it. These tests are what makes the
 * two disagreeing a failure rather than a discovery.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN ELEMENT IS A LINK AND NOT A MODULE
 * ---------------------------------------------------------------------------------------
 *
 * `links.inferred` says whether Mole Office worked a relationship out itself or was told it. The Links
 * panel already draws it over a record's whole link list — a dashed left edge and `inferredNote`'s
 * sentence — so it is not true, as `ontology.md` §3.3 says, that nothing in `src/` reads it. What
 * could not be said was which CARRIER of a particular block was a guess: the block reader collected
 * the module id and dropped the row. A reader that hands back module records cannot carry the fact
 * at all, so both readers hand back the link.
 *
 * WHAT IS NOT PROVED HERE, said plainly: the drawn half. `design/round-ten/design/ontology.md` §13
 * test 20a also asks that the Normal reading MARK the inferred carrier on screen. That projection
 * is not built in this wave, and this file only proves the fact reaches every reader that could
 * draw it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import {
  blockIdsOf,
  carriesBlock,
  modulesCarrying,
  pipelinesHolding,
  readPipelineBlocks,
  unloadedModuleName,
  type BlockCarrier,
  type BlockLinkRow,
} from '../src/shared/blocks.ts'

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

/** A second actor, so a rule is never only tested against the actor that wrote the rows. */
const OTHER_AGENT = { type: 'agent', id: 'another-session' } as const

function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title, data: { blockIds: [] }, actor: t.api.HUMAN })
}

function block(pipelineId: string, name: string) {
  return t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block
}

function module_(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'module', title, actor: t.api.HUMAN })
}

/** Every link in the throwaway database, in the shape both readers take. */
function linkRows(): BlockLinkRow[] {
  return t.client.sqlite
    .prepare('select id, from_id as fromId, to_id as toId, type, gate, gate_up_to as upTo, inferred from links')
    .all()
    .map((raw) => raw as Record<string, unknown>)
    .map((row) => ({
      id: row['id'] as string,
      fromId: row['fromId'] as string,
      toId: row['toId'] as string,
      type: row['type'] as string,
      gate: (row['gate'] as 'hard' | 'partial' | null) ?? null,
      upTo: (row['upTo'] as string | null) ?? null,
      inferred: row['inferred'] === 1,
    }))
}

const liveRecords = () => t.api.listRecords({ workspaceId: 'default' })
const allRecords = () => t.api.listRecords({ workspaceId: 'default', includeDeleted: true })

const record = (id: string) => {
  const found = t.api.getRecord(id)
  if (found === null) throw new Error(`no record ${id}`)
  return found
}

/** The per-step carrier list `readPipelineBlocks` answers with, for one block of one pipeline. */
function carriersFromThePipeline(pipelineId: string, blockId: string, records = liveRecords()): BlockCarrier[] {
  const reading = readPipelineBlocks(record(pipelineId), records, linkRows())
  const step = reading.blocks.find((b) => b.id === blockId)
  return step === undefined ? [] : step.carriers
}

describe('one block, two readers, one answer', () => {
  it('agrees element for element — link id and inferred included — for every block of every pipeline', () => {
    const p1 = pipeline('Transplant v2')
    const p2 = pipeline('Calibration sweep')
    const sense = block(p1.id, 'Sense the pot')
    const hold = block(p1.id, 'Close and hold')
    const sweep = block(p2.id, 'Measure setting 15')

    const gripper = module_('Tray clamp')
    const vision = module_('Vision')
    const bench = module_('Bench jig')

    // A second session files one of these, and one of them is a machine's guess. Both facts have to
    // survive both readers.
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })
    t.api.createLink({ fromId: vision.id, toId: sense.id, type: 'implements', inferred: true, actor: OTHER_AGENT })
    t.api.createLink({ fromId: gripper.id, toId: hold.id, type: 'implements', actor: OTHER_AGENT })
    t.api.createLink({ fromId: bench.id, toId: sweep.id, type: 'implements', actor: t.api.HUMAN })
    // A link that is not `implements`, and one pointing the other way. Neither is a carrier.
    t.api.createLink({ fromId: sense.id, toId: hold.id, type: 'blocks', actor: t.api.HUMAN })
    t.api.createLink({ fromId: sense.id, toId: gripper.id, type: 'relates_to', actor: t.api.HUMAN })

    const records = liveRecords()
    const links = linkRows()
    for (const p of [p1, p2]) {
      for (const blockId of blockIdsOf(record(p.id))) {
        expect(carriersFromThePipeline(p.id, blockId, records)).toEqual(modulesCarrying(blockId, links, records))
      }
    }

    // And the answer is not empty, so the agreement above is about something.
    expect(modulesCarrying(sense.id, links, records).map((c) => [c.title, c.inferred])).toEqual([
      ['Tray clamp', false],
      ['Vision', true],
    ])
  })

  it('agrees about a block carried by a module somebody deleted, whether or not the caller loaded it', () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const gripper = module_('Tray clamp')
    const gone = module_('An old module')
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })
    t.api.createLink({ fromId: gone.id, toId: sense.id, type: 'implements', actor: OTHER_AGENT })
    t.api.deleteRecord(gone.id, OTHER_AGENT)

    const links = linkRows()

    // A caller that loaded the deleted module: it carries nothing, and both readers drop it.
    const withDeleted = allRecords()
    expect(modulesCarrying(sense.id, links, withDeleted).map((c) => c.moduleId)).toEqual([gripper.id])
    expect(carriersFromThePipeline(p.id, sense.id, withDeleted)).toEqual(modulesCarrying(sense.id, links, withDeleted))

    // A caller that loaded live records only cannot tell "deleted" from "not loaded", so both
    // readers say in words that they were not given a record. Not the bare id, which reads as a
    // module somebody named that.
    const liveOnly = liveRecords()
    const fromBlock = modulesCarrying(sense.id, links, liveOnly)
    expect(fromBlock.map((c) => c.title)).toEqual(['Tray clamp', unloadedModuleName(gone.id)])
    expect(carriersFromThePipeline(p.id, sense.id, liveOnly)).toEqual(fromBlock)
  })

  it('answers about a block no live pipeline lists, which is where the pipeline reader cannot be asked', () => {
    const p = pipeline('4B.2 probe pipeline, delete me')
    const orphan = block(p.id, 'First block')
    const gripper = module_('Tray clamp')
    t.api.createLink({ fromId: gripper.id, toId: orphan.id, type: 'implements', actor: t.api.HUMAN })
    // The pipeline goes; its stored order keeps the block id, exactly as the three orphan blocks in
    // the owner's corpus do, and the block stays live.
    t.api.deleteRecord(p.id, t.api.HUMAN)
    expect(record(orphan.id).deletedAt).toBeNull()

    const live = liveRecords()
    expect(pipelinesHolding(orphan.id, live)).toEqual([])
    expect(modulesCarrying(orphan.id, linkRows(), live).map((c) => c.title)).toEqual(['Tray clamp'])
  })

  it('carries the inferred fact into the reply a route hands back', async () => {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const told = module_('Tray clamp')
    const guessed = module_('Vision')
    t.api.createLink({ fromId: told.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })
    t.api.createLink({ fromId: guessed.id, toId: sense.id, type: 'implements', inferred: true, actor: OTHER_AGENT })

    const reply = await app.inject({ method: 'GET', url: `/api/records/${p.id}` })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { blocks: { blocks: { id: string; carriers: BlockCarrier[] }[] } }
    const step = one(
      body.blocks.blocks.filter((b) => b.id === sense.id),
      'the block in the reply',
    )
    expect(step.carriers.map((c) => [c.title, c.inferred])).toEqual([
      ['Tray clamp', false],
      ['Vision', true],
    ])
    // Both elements carry the fact. A reply that carried it on neither would say a machine's
    // guess and a person's statement are the same thing.
    expect(step.carriers.every((c) => typeof c.inferred === 'boolean')).toBe(true)
  })
})

describe('the filter itself', () => {
  it('is what both readers ask, and it answers about the link and the module together', () => {
    const linksBefore = new Set(linkRows().map((row) => row.id))
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot')
    const gripper = module_('Tray clamp')
    t.api.createLink({ fromId: gripper.id, toId: sense.id, type: 'implements', actor: t.api.HUMAN })
    // The reading is over every link, as it was; this case's link is the one that was not there
    // when the case started.
    const link = one(
      linkRows().filter((row) => !linksBefore.has(row.id)),
      'the one link',
    )
    const live = record(gripper.id)

    expect(carriesBlock(link, sense.id, live)).toBe(true)
    // The other direction of each half, so the rule is not only proved where it says yes.
    expect(carriesBlock(link, 'some-other-block', live)).toBe(false)
    expect(carriesBlock({ ...link, type: 'relates_to' }, sense.id, live)).toBe(false)
    expect(carriesBlock(link, sense.id, { ...live, deletedAt: '2026-08-25 10:00:00' })).toBe(false)
    // Not loaded is not deleted. This is the case that keeps a page from losing a row.
    expect(carriesBlock(link, sense.id, undefined)).toBe(true)
  })
})
