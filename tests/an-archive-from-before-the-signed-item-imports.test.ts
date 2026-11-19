// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0276 IMPORTS, AND STORED SIGNED ITEMS STAY AS THEY ARE.
 * The secretary's answer aMg06KMwjfw4, under decision -Y2YrAvOc3eF; supervisor message kDOPE0pEsKpt.
 *
 * Two archives come from one source. A named agent carries out a held rule mark, giving changes
 * and revisions real, non-null signed_item evidence. The first archive is imported whole into
 * the target. After ordinary writes, the second archive loses every signed_item line on those
 * two ledgers and every manifest migration block from 0276 on. A line anywhere else is an error.
 *
 * The old archive has new and stored ledger rows. Its plan has no refusals. Its note quotes the
 * published ABSENT_SIGNED_ITEM_RULE and counts both: inserted rows receive null (no signed item
 * was recorded for that write), and every stored row keeps its exact signed_item value.
 *
 * MUTATIONS in src/server/lib/import.ts, each restored and rerun green:
 * a. Remove signed_item from both MAY_BE_ABSENT entries. The plan is refused, naming the column.
 * b. In differingColumns, treat an absent signed_item as different. The append-only changes
 *    check refuses the archive; without that check a stored revision's evidence would be erased.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

/** Ordinary writes after the signed act make new rows in both ledgers. */
const PROVED = { type: 'human', id: THE_PERSON, provedBy: 'the-person-key' } as const
const REGIONS = ['changes', 'revisions'] as const
type Region = (typeof REGIONS)[number]
/** The migration that added `signed_item`, by its whole tag: the merge queue renumbers a bare number. */
const SIGNED_ITEM_MIGRATION = '0276_a_signed_item_held_for_its_named_agent'
/** Every migration tag, in the journal's order. */
const JOURNAL_TAGS = (
  JSON.parse(readFileSync(fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)), 'utf8')) as { entries: { tag: string }[] }
).entries.map((entry) => entry.tag)

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
/** The ids of each region that the first archive holds, so already stored in the target. */
const firstIds: Record<Region, Set<string>> = { changes: new Set(), revisions: new Set() }
/** The ids of each region the second archive holds. */
const allIds: Record<Region, Set<string>> = { changes: new Set(), revisions: new Set() }
const removedLines: Record<Region, number> = { changes: 0, revisions: 0 }
let importLib: ImportLib
const firstValues: Record<Region, Map<string, string | null>> = { changes: new Map(), revisions: new Map() }

function idsOf(t: TestDb, region: Region): Set<string> {
  return new Set((t.client.sqlite.prepare(`SELECT id FROM ${region}`).all() as { id: string }[]).map((r) => r.id))
}

function signedItemOf(t: TestDb, region: Region, id: string): string | null {
  const row = t.client.sqlite.prepare(`SELECT signed_item AS p FROM ${region} WHERE id = ?`).get(id) as { p: string | null } | undefined
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
 * Make the archive look as an export before SIGNED_ITEM_MIGRATION wrote it. Every `signed_item` line inside a block of
 * one of the two ledgers is taken out, counted per region, and the manifest's migration blocks
 * from SIGNED_ITEM_MIGRATION on, in the journal's order, are taken out.
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
      if (line.startsWith('signed_item: ')) {
        if (!(REGIONS as readonly string[]).includes(region ?? '')) throw new Error(`a signed_item line in ${file} outside the two ledgers`)
        removedLines[region as Region] += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      const at = JOURNAL_TAGS.indexOf(SIGNED_ITEM_MIGRATION)
      if (at < 1) throw new Error(`the journal holds no migration before ${SIGNED_ITEM_MIGRATION}`)
      const newer = new Set(JOURNAL_TAGS.slice(at))
      const before = JOURNAL_TAGS[at - 1]
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "([^"]+)"\n```\n*/g, (block, tag: string) =>
        newer.has(tag) ? '' : block,
      )
      if (text.includes(`tag: "${SIGNED_ITEM_MIGRATION}"`)) throw new Error(`the manifest still names ${SIGNED_ITEM_MIGRATION}`)
      if (!text.includes(`tag: "${before}"`)) throw new Error(`the manifest lost ${before} as well`)
    }
    writeFileSync(file, text)
  }
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-signed-item-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-signed-item-old-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const forgetWorld = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetWorld()
  const app = (await apiApp()).app
  await app.ready()
  const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader(join(dirname(source.file), 'keys.json')) }
  const agents = new Map<string, Record<string, string>>()
  async function call(url: string, headers: Record<string, string> = person, payload?: object) {
    const res = await app.inject({ method: 'POST', url, headers, ...(payload === undefined ? {} : { payload }) })
    expect(res.statusCode, res.body.replace(/[0-9a-f]{64}/g, '<fixture key>')).toBeGreaterThanOrEqual(200)
    expect(res.statusCode, res.body.replace(/[0-9a-f]{64}/g, '<fixture key>')).toBeLessThan(300)
    return res.json()
  }
  try {
    for (const handle of ['archive-secretary', 'archive-worker']) {
      const started = await call('/api/agents/started', person, { handle, name: handle, workArea: ['src'] })
      const participant = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: person })
      agents.set(handle, { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': participant.json().participant.id, 'x-mole-office-key': started.whatToGiveIt.key })
    }
    await call('/api/roles/card/archive-secretary', person, { role: 'secretary' })
    const chapter = source.api.createRecord({ kind: 'module', title: 'A fixture chapter for an archived signature', workspaceId: 'default', actor: PROVED,
      data: { extra: { chapter: 1 }, summaryBlocks: [{ id: 'archive-rule', type: 'text', heading: 'An archived rule', text: 'Only this office uses this rule.' }] } })
    const brought = await call('/api/signing-packages', agents.get('archive-secretary')!, {
      forAgent: 'archive-worker', task: 'A fixture act whose signature is kept in the archive',
      items: [{ act: 'mark-a-rule-only-for-this-office', inputs: { chapter: chapter.id, rule: 'archive-rule', only: true }, why: 'Keep the signed item on both ledgers.', carriedOut: 'by-the-named-agent' }],
    })
    await call(`/api/signing-packages/${brought.package.id}/sign`, person, { struck: [] })
    const carried = await call(`/api/signing-packages/${brought.package.id}/items/${brought.package.items[0].id}/carry-out`, agents.get('archive-worker')!)
    expect(carried.package.items[0].state).toBe('done')
  } finally { await app.close() }
  exportLib.writeExport(fullArchive)
  for (const region of REGIONS) for (const id of idsOf(source, region)) {
    firstIds[region].add(id)
    firstValues[region].set(id, signedItemOf(source, region, id))
  }

  source.api.createRecord({ kind: 'note', title: 'An ordinary record added after the signed act', data: {}, workspaceId: 'default', actor: PROVED })
  exportLib.writeExport(oldArchive)
  for (const region of REGIONS) for (const id of idsOf(source, region)) allIds[region].add(id)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  importLib.applyImport(fullArchive)
}, 60_000)

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe(`an archive written before migration ${SIGNED_ITEM_MIGRATION}`, () => {
  it('is what an old export writes: no signed_item line on any row of the two ledgers', () => {
    for (const region of REGIONS) {
      expect(removedLines[region], `${region} rows in the archive`).toBe(allIds[region].size)
      expect(allIds[region].size - firstIds[region].size, `new ${region} rows`).toBeGreaterThan(0)
      expect(firstIds[region].size, `stored ${region} rows`).toBeGreaterThan(0)
    }
    // A real held act put non-null signed-item evidence on both ledgers before the first export.
    // The whole first archive stored every value in the target, including that evidence.
    for (const region of REGIONS) {
      expect([...firstValues[region].values()].some(value => value !== null), `${region} has a signed act`).toBe(true)
      for (const [id, value] of firstValues[region]) expect(signedItemOf(target, region, id)).toBe(value)
    }
  })

  it('imports, and the plan counts the rows with no signed_item line in its notes', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const inserted = REGIONS.reduce((n, region) => n + allIds[region].size - firstIds[region].size, 0)
    const kept = REGIONS.reduce((n, region) => n + firstIds[region].size, 0)
    const note = plan.notes.find((n) => n.includes('carry no `signed_item` line'))
    expect(note, plan.notes.join('\n')).toBeDefined()
    expect(note).toContain(importLib.ABSENT_SIGNED_ITEM_RULE)
    expect(note).toContain(`Here that is ${String(inserted)} new row(s) inserted with signed_item null and ${String(kept)} existing row(s)`)

    const report = importLib.applyImport(oldArchive)
    expect(report.applied).toBe(true)
  })

  it('writes signed_item null on every row it inserted, and leaves every stored signed_item exactly as it was', () => {
    for (const region of REGIONS) {
      for (const id of allIds[region]) {
        const expected = firstValues[region].get(id) ?? null
        expect(signedItemOf(target, region, id), `${region} ${id}`).toBe(expected)
      }
    }
  })
})
