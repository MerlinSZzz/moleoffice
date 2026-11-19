// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0178 IMPORTS AGAIN. The secretary's decision -Y2YrAvOc3eF.
 *
 * Migration 0178 added `proved_by` to `changes`, `revisions` and `agent_messages`, and the export
 * writes a `provedBy` line on every row of those three regions. An archive written before 0178 has
 * no such line. The importer refused every such row, because a column may be missing only where
 * `MAY_BE_ABSENT` in src/server/lib/import.ts says so. Now `provedBy` is listed there, under
 * `ABSENT_PROVED_BY_RULE`:
 *
 *   - a row the import INSERTS gets proved_by null;
 *   - a row that is ALREADY STORED keeps the proved_by it has;
 *   - the plan's notes count both.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export and then takes out
 * what an export before 0178 did not write: every `provedBy` line, and the manifest's migration
 * blocks from 0178 on. Everything else is what the export wrote.
 *
 * TWO ARCHIVES FROM ONE SOURCE. The first is taken after record A and message 1, and is imported
 * whole into the target, so A's rows and message 1 are stored there with proved_by set. The second
 * is taken after record B and message 2 as well, and is made old. Importing it inserts B's rows and
 * message 2, and meets A's rows and message 1 already stored.
 *
 * MUTATION PROOF (after a green control), in src/server/lib/import.ts:
 *
 *   a. Take `provedBy` out of the three MAY_BE_ABSENT entries. The plan is refused again, naming
 *      `provedBy` on every row, and nothing is imported.
 *   b. In `differingColumns`, let an absent `provedBy` through as a column that differs (for
 *      `revisions` and `agent_messages`). The stored proof is overwritten with null and the last
 *      case goes red. Done for `changes` too, the append-only check refuses the archive instead.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')
type AgentsLib = typeof import('../src/server/lib/agents.ts')

/** A write the person's key proved, which is what makes proved_by non-null on all three regions. */
const PROVED = { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' } as const
const REGIONS = ['changes', 'revisions', 'agent_messages'] as const
type Region = (typeof REGIONS)[number]

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
/** The ids of each region that the first archive holds, so already stored in the target. */
const firstIds: Record<Region, Set<string>> = { changes: new Set(), revisions: new Set(), agent_messages: new Set() }
/** The ids of each region the second archive holds. */
const allIds: Record<Region, Set<string>> = { changes: new Set(), revisions: new Set(), agent_messages: new Set() }
const removedLines: Record<Region, number> = { changes: 0, revisions: 0, agent_messages: 0 }
let importLib: ImportLib

function idsOf(t: TestDb, region: Region): Set<string> {
  return new Set((t.client.sqlite.prepare(`SELECT id FROM ${region}`).all() as { id: string }[]).map((r) => r.id))
}

function provedByOf(t: TestDb, region: Region, id: string): string | null {
  const row = t.client.sqlite.prepare(`SELECT proved_by AS p FROM ${region} WHERE id = ?`).get(id) as { p: string | null } | undefined
  if (row === undefined) throw new Error(`${region} ${id} is not stored in the target`)
  return row.p
}

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/**
 * Make the archive look as an export before 0178 wrote it. Every `provedBy` line inside a block of
 * one of the three regions is taken out, counted per region, and the manifest's migration blocks
 * from 0178 on are taken out.
 */
function makeItOld(dir: string): void {
  for (const file of filesUnder(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    const kept: string[] = []
    let region: string | null = null
    for (const line of lines) {
      // A region is named by a fenced block's word, or by a `region:` line in a file's front matter
      // (a revision is one file each).
      const fence = /^```mole-office (\S+)/.exec(line) ?? /^region: "([^"]+)"$/.exec(line)
      if (fence !== null) region = fence[1] ?? null
      else if (line === '```' || line === '---') region = null
      if (line.startsWith('provedBy: ')) {
        if (!(REGIONS as readonly string[]).includes(region ?? '')) throw new Error(`a provedBy line in ${file} outside the three regions`)
        removedLines[region as Region] += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "(\d{4})_[^"]*"\n```\n*/g, (block, number: string) =>
        Number(number) >= 178 ? '' : block,
      )
      if (text.includes('0178_how_a_write_was_proved')) throw new Error('the manifest still names migration 0178')
      if (!text.includes('0177_')) throw new Error('the manifest lost migration 0177 as well')
    }
    writeFileSync(file, text)
  }
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0178-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0178-old-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const agents = (await import('../src/server/lib/agents.ts')) as AgentsLib
  const thread = agents.createThread({ workspaceId: 'default', title: 'Proved words', mode: 'direct' }, PROVED)

  source.api.createRecord({ kind: 'note', title: 'Record A, already stored', data: {}, workspaceId: 'default', actor: PROVED })
  agents.addMessage(thread.id, 'default', { intent: 'review', body: 'Message 1, already stored' }, PROVED)
  exportLib.writeExport(fullArchive)
  for (const region of REGIONS) for (const id of idsOf(source, region)) firstIds[region].add(id)

  source.api.createRecord({ kind: 'note', title: 'Record B, new', data: {}, workspaceId: 'default', actor: PROVED })
  agents.addMessage(thread.id, 'default', { intent: 'review', body: 'Message 2, new' }, PROVED)
  exportLib.writeExport(oldArchive)
  for (const region of REGIONS) for (const id of idsOf(source, region)) allIds[region].add(id)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  importLib.applyImport(fullArchive)
})

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target.close()
  source.close()
})

describe('an archive written before migration 0178', () => {
  it('is what an old export writes: no provedBy line on any row of the three regions', () => {
    for (const region of REGIONS) {
      expect(removedLines[region], `${region} rows in the archive`).toBe(allIds[region].size)
      expect(allIds[region].size - firstIds[region].size, `new ${region} rows`).toBeGreaterThan(0)
      expect(firstIds[region].size, `stored ${region} rows`).toBeGreaterThan(0)
    }
    // Every row the source wrote was proved by the person's key, so a null afterwards comes from
    // the import and not from the source.
    for (const region of REGIONS) for (const id of allIds[region]) expect(provedByOf(source, region, id)).toBe('the-person-key')
    // And the first import stored the proof on the target.
    for (const region of REGIONS) for (const id of firstIds[region]) expect(provedByOf(target, region, id)).toBe('the-person-key')
  })

  it('imports, and the plan counts the rows with no provedBy line in its notes', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const inserted = REGIONS.reduce((n, region) => n + allIds[region].size - firstIds[region].size, 0)
    const kept = REGIONS.reduce((n, region) => n + firstIds[region].size, 0)
    const note = plan.notes.find((n) => n.includes('carry no `provedBy` line'))
    expect(note, plan.notes.join('\n')).toBeDefined()
    expect(note).toContain(importLib.ABSENT_PROVED_BY_RULE)
    expect(note).toContain(`Here that is ${String(inserted)} new row(s) inserted with provedBy null and ${String(kept)} existing row(s)`)

    const report = importLib.applyImport(oldArchive)
    expect(report.applied).toBe(true)
  })

  it('writes proved_by null on every row it inserted, and leaves a stored proved_by exactly as it was', () => {
    for (const region of REGIONS) {
      for (const id of allIds[region]) {
        const expected = firstIds[region].has(id) ? 'the-person-key' : null
        expect(provedByOf(target, region, id), `${region} ${id}`).toBe(expected)
      }
    }
  })
})
