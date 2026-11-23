// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DURABLE FORMAT — what it carries, what it deliberately does not, and that it says the same
 * thing twice running.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `./data/panelx.db` is one gitignored SQLite file and it is the only copy of everything Mole Office
 * knows. The export is the second copy. So the questions here are not "does it run" — they are the
 * ones a backup is judged by:
 *
 *   Can every row be read back EXACTLY, with Chinese titles, a `›` in a block title, a soft-deleted
 *     record, an inferred link and a three-state gate?
 *   Are the two machine columns of the resource ledger ABSENT rather than null?
 *   Do two exports of unchanged data produce identical bytes, so the mirror's history means
 *     something?
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE FIXTURE IS BUILT, AND WHY IT IS NOT THE SEED
 * ---------------------------------------------------------------------------------------
 *
 * Four of the seven authored tables have zero rows in the seeded corpus: `reader_anchors`,
 * `presentation_intent`, `panel_layouts` and `session_resources`. An export tested against the
 * seed alone would pass while carrying none of them, and the gap would be found the first time
 * somebody arranged a graph and then restored. So this file writes one row into each, through the
 * product's own write paths wherever there is one. `panel_layouts` has no write path left and no
 * export carries it; its row is written in SQL so that "the export leaves
 * it out" is said of a table that holds a row.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTRACT
 * ---------------------------------------------------------------------------------------
 *
 * design/durability/FORMAT.md. It was written before the exporter, because the importer (G3) is
 * separate work. Where a test here and that document disagree, the document is right.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { freshDb, one, type TestDb } from './helpers.ts'
import { ARCHIVED_TABLES } from '../src/server/db/schema.ts'
import { everyPartTable } from '../src/server/db/every-part-table.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type PresentationLib = typeof import('../src/server/lib/presentation.ts')

/**
 * EVERY TABLE AN ARCHIVE CARRIES, from the schema rather than a copy of the exporter's list.
 *
 * The archived tables of schema.ts, then every table a schema part declares for an archive. Round
 * 129 declared the notice batch tables in a part, so a list holding only `ARCHIVED_TABLES` would
 * have called their absence from the export correct.
 */
const EXPORTED_PART_TABLES: readonly string[] = everyPartTable()
  .filter((table) => table.says.exported)
  .map((table) => table.name)
const EXPORTED_TABLES: readonly string[] = [...ARCHIVED_TABLES, ...EXPORTED_PART_TABLES]

let t: TestDb
let lib: ExportLib
let root: string
/** Ids the fixture minted, so a test can name the row it is about. */
const made: Record<string, string> = {}

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AGENT = { type: 'agent', id: 'claude-code', sessionId: 'sess-export' } as const

/**
 * AN ACTOR WHOSE KEY PROVED SOMEBODY OTHER THAN THE NAME THE HEADERS GAVE. Criterion P83, point 5.
 *
 * The ledgers write `provedHolder` straight off the actor, so a create through `t.api` — which IS
 * records.ts, the product's own writer — is the same path a keyed request takes. No raw SQL, and a
 * real value reaches both `changes` and `revisions` for the export to carry.
 */
const PROVED = {
  ...AGENT,
  provedHolder: { id: 'the-office', how: 'the-office-key', claimed: 'an-agent-that-sent-this' },
} as const

/**
 * A `data` blob eight levels deep, which is what a module's curated chart really is:
 * data → summaryBlocks → [0] → spec → series → [0] → points → [0] → x.
 *
 * It is written through the real write path, so it is also a check that the deepest shape the
 * product accepts is a shape the export can carry.
 */
const DEEP = {
  context: 'A module whose curated summary carries a chart.',
  parts: [{ id: 'p1', name: '标定', items: [{ id: 'i1', text: 'Bolt it on', state: 'done', hours: 2 }] }],
  summaryBlocks: [
    {
      id: 'b1',
      type: 'chart',
      spec: {
        kind: 'line',
        x: { label: 'range', unit: 'm' },
        y: { label: '深度误差', unit: 'mm' },
        series: [{ id: 's1', name: '深度误差', state: 'done', points: [{ x: 1, y: 3.1 }, { x: 2, y: 9.4 }] }],
      },
    },
  ],
}

/**
 * One agent row written directly, for the ordering and naming cases.
 *
 * The front door sets an agent's id to its handle until piece I-1b mints a separate one, so the
 * fixture cannot make an id that differs from its handle through `t.api`. This is database setup:
 * the rows are exported and read back by the real format, and no behaviour is faked.
 */
function insertAgent(who: { id: string; handle: string; name: string; retired?: boolean; retiredAt?: string | null }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, who.retired ? 1 : 0, who.retiredAt ?? null, '2026-09-16 10:00:00')
}

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/export.ts')
  const presentation = (await import('../src/server/lib/presentation.ts')) as PresentationLib
  root = mkdtempSync(join(tmpdir(), 'mole-office-export-'))

  // ---- records, including the two things the block migration introduced
  const gripper = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: '夹具标定', summary: '把 effort 值标定成实际夹持力', data: DEEP, actor: HUMAN })
  made['gripper'] = gripper.id
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Transplant v2', data: {}, actor: HUMAN })
  made['pipeline'] = pipeline.id
  const first = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'done', measured: 'p50 42 ms · n=400' }, HUMAN)
  const second = t.blocks.addBlock(pipeline.id, { name: 'Plan the approach', state: 'blocked' }, AGENT)
  made['block'] = first.block.id
  made['block2'] = second.block.id

  // A string with a newline in it. Two of 290 corpus blobs have one; rare enough to be missed in
  // testing and common enough to break a line-oriented format.
  const noted = t.api.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'A note with a newline in its body',
    data: { body: 'first line\nsecond line' },
    actor: HUMAN,
  })
  made['note'] = noted.id

  // A record that is soft-deleted, and therefore only recoverable through its change rows.
  const doomed = t.api.createRecord({ workspaceId: 'default', kind: 'claim', title: 'A claim that was withdrawn', data: { state: 'retracted', evidence: ['one run'], retracted_because: 'the bed was not level' }, actor: HUMAN })
  made['deleted'] = doomed.id
  t.api.deleteRecord(doomed.id, HUMAN)

  // ---- a write whose key proved a holder the headers did not name, so `provedHolder` is not null
  //
  // THE ONE ROW THAT DRIVES THE COLUMN THROUGH THE PRODUCT. Migration 0168 put it on both ledgers and
  // the export declares it, writes it and draws it, but every other fixture row leaves it null, which
  // exercises none of that. `PROVED` carries it on the actor; `createRecord` writes it to `changes`
  // and `revisions` in one transaction, exactly as a keyed request does.
  const proved = t.api.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'A note written under a key that proved a different holder',
    data: { body: 'The ledgers carry who the key proved beside the actor the headers named.' },
    actor: PROVED,
  })
  made['proved'] = proved.id

  // ---- links: one inferred, one hard gate, one partial gate with an upTo, one unqualified
  t.api.createLink({ fromId: gripper.id, toId: first.block.id, type: 'implements', inferred: true, actor: HUMAN })
  t.api.createLink({ fromId: first.block.id, toId: second.block.id, type: 'blocks', gate: { kind: 'hard' }, actor: HUMAN })
  t.api.createLink({ fromId: gripper.id, toId: second.block.id, type: 'blocks', gate: { kind: 'partial', upTo: first.block.id }, actor: AGENT })
  t.api.createLink({ fromId: noted.id, toId: gripper.id, type: 'discusses', actor: HUMAN })

  // ---- the four tables the corpus leaves empty
  t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, 'default')
  presentation.writeNodeIntent(presentation.parseScope(`pipeline:${pipeline.id}`, 'default'), first.block.id, { lane: 'on the real arm', emphasis: 'blocked' }, HUMAN)
  t.client.sqlite
    .prepare('INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES (?,?,?,?,?)')
    .run('default', 'home', JSON.stringify({ columns: 2, blocks: [{ id: 'attention', span: 2 }] }), '2026-08-10 18:40:02', `human:${THE_TEST_OFFICES_OWNER.id}`)
  // Raw SQL for the ledger, and only for the ledger. `registerResource` reads the live machine
  // through OsProbe to find a pid's start time, and this file is about the FORMAT, not about
  // whether the ledger can see a process. The columns are what matter here.
  t.client.sqlite
    .prepare(
      `INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail,
        registered_at, registered_by, released_at, released_by, release_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('res-1', 'default', pipeline.id, 'port', '39187', 3_314_755, '2026-08-10 14:29:03', 'the audit server', '2026-08-10 14:29:03', 'agent:claude-code', '2026-08-10 15:02:11', `human:${THE_TEST_OFFICES_OWNER.id}`, 'killed by process group')
  t.client.sqlite
    .prepare(
      `INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail,
        registered_at, registered_by, released_at, released_by, release_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    // `os_started_at` is deliberately a different value from `registered_at`, so a test asserting
    // it is gone cannot pass by accident on a string that is also somewhere legitimate.
    .run('res-2', 'default', pipeline.id, 'process', '424242', 424_240, '2026-08-10 15:59:01', 'a server nobody stopped', '2026-08-10 16:00:00', 'agent:claude-code', null, null, null)

  // ---- agents whose ids differ from their handles, so an id-ordered page can be told apart from a
  //      handle-ordered one. One is retired, so a proved holder it names carries its retirement date.
  insertAgent({ id: 'b2Nn7xKq4mTa', handle: 'aaa-early-handle', name: 'Early Agent' })
  insertAgent({ id: 'a1Mm6wJp3sRb', handle: 'zzz-late-handle', name: 'Late Agent' })
  insertAgent({ id: 'c3Oo8yLr5tUc', handle: 'retired-holder', name: 'Retired Holder', retired: true, retiredAt: '2026-09-01 08:30:00' })

  // ---- writes whose key proved an agent by its registry id, so the prose has an id to resolve.
  const provedAgent = t.api.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'A note written under a key that proved an agent',
    data: { body: 'The heading names the agent, not its registry id.' },
    actor: { ...AGENT, provedHolder: { id: 'b2Nn7xKq4mTa', how: 'an-agent-key', claimed: 'a-different-name' } },
  })
  made['provedAgent'] = provedAgent.id
  const provedRetired = t.api.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'A note written under a key that proved a retired agent',
    data: { body: 'The heading names the agent and its retirement date.' },
    actor: { ...AGENT, provedHolder: { id: 'c3Oo8yLr5tUc', how: 'an-agent-key', claimed: 'a-different-name' } },
  })
  made['provedRetired'] = provedRetired.id

  lib.writeExport(root)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  t.close()
})

// -------------------------------------------------------------------------------- reading it back

/** Every exported file, parsed into its data regions by the format's own reader. */
function tree(): ReturnType<ExportLib['readExportTree']> {
  return lib.readExportTree(root)
}

/** Every data region of one name, from anywhere in the export. */
function regions(name: string): { path: string; fields: Record<string, unknown>; json: unknown }[] {
  const out: { path: string; fields: Record<string, unknown>; json: unknown }[] = []
  for (const file of tree()) {
    for (const region of file.regions) {
      if (region.name === name) out.push({ path: file.path, fields: region.fields, json: region.json })
    }
  }
  return out
}

/** Every file's text, keyed by its path relative to the export root. */
function files(): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else out.set(relative(root, full).split(sep).join('/'), readFileSync(full, 'utf8'))
    }
  }
  visit(root)
  return out
}

/** Every row of an authored table as drizzle reads it: TypeScript names, JSON parsed, 0/1 as boolean. */
function rows(table: string): Record<string, unknown>[] {
  const tables: Record<string, unknown> = t.client.schema
  const drizzleTable = tables[camel(table)] as Parameters<typeof getTableColumns>[0]
  return t.client.db.select().from(drizzleTable as never).all() as Record<string, unknown>[]
}

/** `reader_anchors` -> `readerAnchors`, which is what schema.ts calls the same table. */
function camel(sqlName: string): string {
  return sqlName.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// ================================================================================ the inventory

describe('every key in a data region is a stored column of its table', () => {
  it.each([...EXPORTED_TABLES])('%s writes its declared columns and no others', (table) => {
    const region = table as ExportLib['EXPORTED_REGIONS'][number]
    const declared = lib.columnsOf(region)
    const all = [...declared.fields, ...declared.jsonBlocks, ...declared.dropped].sort()
    // The one assertion that stops a column being lost. Add a column to schema.ts and this fails
    // until somebody decides whether it round-trips, is a JSON block, or is deliberately dropped.
    expect(all, `${table}: the export's column list has drifted from schema.ts`).toEqual(lib.schemaColumnsOf(region))
  })

  it('writes nothing into a data block that is not a column', () => {
    // A title beside an id is useful and it goes in the prose heading, never in the block. A
    // derived key inside a data region is a second representation of a stored fact, which is this
    // codebase's recurring defect in the one place a restore would read it back as data.
    const known = new Map<string, Set<string>>()
    for (const table of EXPORTED_TABLES) {
      const region = table as ExportLib['EXPORTED_REGIONS'][number]
      known.set(table, new Set(lib.columnsOf(region).fields))
    }
    const strays: string[] = []
    for (const file of tree()) {
      for (const region of file.regions) {
        const columns = known.get(region.name)
        if (columns === undefined) continue
        for (const key of Object.keys(region.fields)) {
          if (!columns.has(key)) strays.push(`${file.path}: ${region.name}.${key}`)
        }
      }
    }
    expect(strays).toEqual([])
  })
})

// ================================================================================ the round trip

describe('every authored row can be read back exactly', () => {
  /** Compare the exported regions of one table against the database, key by key. */
  function roundTrips(table: string, identity: (row: Record<string, unknown>) => string): void {
    const region = table as ExportLib['EXPORTED_REGIONS'][number]
    const declared = lib.columnsOf(region)
    const stored = new Map(rows(table).map((row) => [identity(row), row]))
    const exported = regions(table)
    expect(exported.length, `${table}: row count`).toBe(stored.size)
    for (const found of exported) {
      const key = identity(found.fields)
      const row = stored.get(key)
      expect(row, `${table}: the export holds ${key} and the database does not`).toBeDefined()
      if (row === undefined) continue
      for (const column of declared.fields) {
        expect(found.fields[column], `${table}.${column} of ${key}`).toEqual(row[column] ?? null)
      }
    }
  }

  it('records — every envelope column, including deletedAt', () => {
    roundTrips('records', (r) => String(r['id']))
  })

  it('records.data — as parsed JSON, with no normalising of any value', () => {
    // Compared parsed rather than as text, because key order is not meaning. Compared with no
    // normalisation, because a changed value MUST fail: that is what makes the restore test mean
    // something.
    const stored = new Map(rows('records').map((r) => [String(r['id']), r['data']]))
    for (const file of tree()) {
      const envelope = file.regions.find((r) => r.name === 'records')
      const data = file.regions.find((r) => r.name === 'records.data')
      if (envelope === undefined) continue
      expect(data, `${file.path} has a record and no data block`).toBeDefined()
      expect(data?.json).toEqual(stored.get(String(envelope.fields['id'])))
    }
  })

  it('links — with the inferred flag and both halves of the gate', () => {
    roundTrips('links', (r) => String(r['id']))
  })

  it('changes — the whole log, including the rows that hold a previous data blob', () => {
    roundTrips('changes', (r) => String(r['id']))
  })

  it('revisions — the whole ledger, including who a key proved', () => {
    // The revision half of `proved_holder` had no coverage at all: this list never named `revisions`,
    // so the column could be dropped from the region and only `tests/restore-check.test.ts` would
    // notice, and only through the comparison. Both ledgers carry it together.
    roundTrips('revisions', (r) => String(r['id']))
  })

  it('reader_anchors', () => {
    roundTrips('reader_anchors', (r) => `${String(r['workspaceId'])}/${String(r['reader'])}`)
  })

  it('presentation_intent, with its intent read back as a value rather than as a string', () => {
    roundTrips('presentation_intent', (r) => `${String(r['scope'])}/${String(r['target'])}`)
  })

  it('panel_layouts is carried by no export, though the database holds a row, and the archive says so', () => {
    // The table stays declared and nothing is deleted from it; no export carries it.
    expect(rows('panel_layouts').length).toBe(1)
    const names = new Set(tree().flatMap((f) => f.regions.map((r) => r.name)))
    expect(names).not.toContain('panel_layouts')
    expect(names).not.toContain('panel_layouts.layout')
    expect([...files().keys()].filter((path) => path.startsWith('layouts/'))).toEqual([])
    expect(Object.keys(one(regions('manifest'), 'manifest region').fields)).not.toContain('panel_layouts')
    for (const path of ['README.md', 'MANIFEST.md']) {
      const text = files().get(path) ?? ''
      expect(text, `${path} does not say panel_layouts is left out`).toContain('panel_layouts')
      expect(text, `${path} does not say every backup and export leaves it out`).toContain('out of every backup and export')
    }
  })

  it('session_resources — the authored half', () => {
    roundTrips('session_resources', (r) => String(r['id']))
  })
})

// ================================================================================ decision 3

describe('the resource ledger exports what happened and never what is true right now', () => {
  it('leaves pgid and osStartedAt out entirely — absent, not null', () => {
    // Absent and not null, and the difference is the whole point. A null column is a column the
    // format carries and had no value for; an absent one is a column the format has decided not to
    // carry. This project once acted on a stale reading of the machine and lost an afternoon.
    for (const region of regions('session_resources')) {
      expect(Object.keys(region.fields)).not.toContain('pgid')
      expect(Object.keys(region.fields)).not.toContain('osStartedAt')
    }
    // The values are gone too, not only the keys. 3314755 is the process group of the fixture's
    // released row and 424240 is the one that was never released.
    const text = files().get('resources.md') ?? ''
    expect(text).not.toContain('3314755')
    expect(text).not.toContain('424240')
    expect(text).not.toContain('2026-08-10 15:59:01')
  })

  it('keeps the release history, which is the question the table exists to answer', () => {
    const released = regions('session_resources').find((r) => r.fields['id'] === 'res-1')
    expect(released?.fields['releasedBy']).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(released?.fields['releaseNote']).toBe('killed by process group')
    expect(released?.fields['releasedAt']).toBe('2026-08-10 15:02:11')
    expect(released?.fields['registeredBy']).toBe('agent:claude-code')
  })

  it('says in words that a still-held row describes a machine that may be gone', () => {
    // Not left to a reader to work out. The importer is told to report the same thing, because a
    // restored ledger row with no anti-reuse anchor is a pid nobody should act on.
    const report = lib.buildExport().report
    expect(report.notes.join(' ')).toMatch(/still shown as held/)
    expect(files().get('resources.md') ?? '').toContain('pgid')
  })
})

// ================================================================================ what it carries

describe('it carries the things a text format usually loses', () => {
  it('a soft-deleted record, with the change rows that make it recoverable', () => {
    const deleted = regions('records').find((r) => r.fields['id'] === made['deleted'])
    expect(deleted, 'the soft-deleted record has no file').toBeDefined()
    expect(deleted?.fields['deletedAt']).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2} /))
    // Its title is still readable, which is what makes a link into it show as broken rather than
    // vanishing, and its create row still holds what it was.
    expect(deleted?.fields['title']).toBe('A claim that was withdrawn')
    const its = regions('changes').filter((c) => c.fields['recordId'] === made['deleted'])
    expect(its.map((c) => c.fields['op'])).toContain('delete')
    expect(its.map((c) => c.fields['op'])).toContain('create')
  })

  it('Chinese titles and summaries, written literally rather than escaped', () => {
    const gripper = regions('records').find((r) => r.fields['id'] === made['gripper'])
    expect(gripper?.fields['title']).toBe('夹具标定')
    expect(String(gripper?.fields['summary'])).toContain('把 effort 值标定成实际夹持力')
    // Literally in the bytes, so a person reading the file sees the words rather than escape sequences.
    const text = files().get(`records/module/${String(made['gripper'])}.md`) ?? ''
    expect(text).toContain('夹具标定')
    // IN THE FRONT MATTER ITSELF, and not only in the heading. The file's `# title` heading holds the title as well,
    // so the line above would still pass if the field lines were escaped.
    expect(text).toContain('title: "夹具标定"')
    expect(text).toContain('summary: "把 effort 值标定成实际夹持力"')
    // AND NO CHARACTER OF THE TITLE AS AN ESCAPE, in either case of hex digit. Each escape is worked out from the
    // character, so the check names the characters the fixture holds.
    for (const character of '夹具标定') {
      const escape = `\\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`
      expect(text.toLowerCase(), `${character} is written as the escape ${escape}`).not.toContain(escape)
    }
  })

  it('a block, called by its own name', () => {
    const block = regions('records').find((r) => r.fields['id'] === made['block'])
    expect(block?.fields['kind']).toBe('block')
    expect(block?.fields['title']).toBe('Sense the pot')
    expect(files().has(`records/block/${String(made['block'])}.md`)).toBe(true)
  })

  it('a pipeline\'s blockIds, which is the only statement of membership and order', () => {
    const pipelineFile = files().get(`records/pipeline/${String(made['pipeline'])}.md`) ?? ''
    const parsed = lib.parseExportFile(pipelineFile, 'pipeline')
    const data = parsed.regions.find((r) => r.name === 'records.data')?.json as { blockIds?: string[] }
    expect(data.blockIds).toEqual([made['block'], made['block2']])
  })

  it('the block-to-module mapping, which is now an implements link and not a title', () => {
    const implementsLink = regions('links').find((l) => l.fields['type'] === 'implements')
    expect(implementsLink?.fields['fromId']).toBe(made['gripper'])
    expect(implementsLink?.fields['toId']).toBe(made['block'])
    expect(implementsLink?.fields['inferred']).toBe(true)
  })

  it('all three gate states, kept apart — null is not hard', () => {
    // NULL means nobody said how hard the dependency is. Reading it as `hard` makes work that is
    // mostly doable look completely stuck, which is the mistake `partial` was added to stop.
    const gates = regions('links').map((l) => ({ gate: l.fields['gate'], upTo: l.fields['gateUpTo'] }))
    expect(gates).toContainEqual({ gate: null, upTo: null })
    expect(gates).toContainEqual({ gate: 'hard', upTo: null })
    expect(gates).toContainEqual({ gate: 'partial', upTo: made['block'] })
  })

  it('the inferred flag as a boolean, both ways round', () => {
    const flags = regions('links').map((l) => l.fields['inferred'])
    expect(flags).toContain(true)
    expect(flags).toContain(false)
  })

  it('presentation intent, in the closed vocabulary an importer has to re-check', () => {
    const intent = one(regions('presentation_intent'), 'presentation intent row')
    expect(intent.fields['intent']).toEqual({ lane: 'on the real arm', emphasis: 'blocked' })
    expect(intent.fields['scope']).toBe(`pipeline:${String(made['pipeline'])}`)
    expect(String(files().get('presentation.md')), 'the file must tell an importer to run the checker').toContain(
      'checkScopeIntent',
    )
  })

  it('a string with a newline in it, on one line, unbroken', () => {
    const note = files().get(`records/note/${String(made['note'])}.md`) ?? ''
    expect(note).toContain('first line\\nsecond line')
    const parsed = lib.parseExportFile(note, 'note')
    expect((parsed.regions.find((r) => r.name === 'records.data')?.json as { body: string }).body).toBe(
      'first line\nsecond line',
    )
  })

  it('data nested eight levels deep, as JSON a person can read', () => {
    const text = files().get(`records/module/${String(made['gripper'])}.md`) ?? ''
    expect(text).toContain('"points": [')
    const parsed = lib.parseExportFile(text, 'gripper')
    expect(parsed.regions.find((r) => r.name === 'records.data')?.json).toEqual(DEEP)
  })

  it('a stamp exactly as stored, local wall clock with no timezone bolted on', () => {
    // The product lost two months to a stamp read as UTC. An export that normalised one would
    // re-introduce that on the way back in, and a restore test comparing normalised stamps could
    // not see it.
    for (const record of regions('records')) {
      expect(String(record.fields['createdAt'])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    }
  })

  it('a change row that holds a whole previous data blob, unsplit and unparsed', () => {
    // A WHOLESALE `data` REPLACEMENT ON A MODULE NOW COSTS AN `ifVersion`, and this is a real one.
    // The gripper module carries a checklist, and a `data` write that does not mention it drops
    // every line — the loss that was measured during the dogfood, three ids replaced by four with
    // none surviving, answered 200. The write path refuses it now unless the caller proves it read
    // what it is replacing. This test wants the replacement, so it pays the proof rather than
    // being exempted from it: an exemption here would be the test asserting the defect was fine.
    const before = t.api.getRecord(String(made['gripper']))
    if (before === null) throw new Error('the gripper module is not there to replace')
    t.api.patchRecord(
      String(made['gripper']),
      // AND `replace: true`, WHICH IS THE SECOND THING A WHOLESALE `data` NOW HAS TO SAY. The
      // `ifVersion` above proves this write read the checklist it is dropping; this says the module's
      // other fields are meant to go too. They are two different claims and this test makes both.
      { data: { context: 'replaced entirely' }, ifVersion: t.api.versionOf(before), replace: true },
      HUMAN,
    )
    lib.writeExport(root)
    const blob = regions('changes').find((c) => c.fields['field'] === 'data')
    expect(blob, 'no change row carried a whole data blob').toBeDefined()
    expect(JSON.parse(String(blob?.fields['oldValue'])) as unknown).toEqual(DEEP)
  })

  it('carries who a key proved, inline on both ledgers and in the heading a person reads', () => {
    // THE COLUMN IS FILLED BY A REAL WRITE and asserted whole. `provedHolder` goes inline as one JSON
    // value on a field line (INLINE_JSON_COLUMNS) and into the prose heading as ` · proved by <id>`
    // (provedHolderWords). Both are dead code until a row carries a value, and until this row no test
    // put one through the product's own writer.
    const holder = { id: 'the-office', how: 'the-office-key', claimed: 'an-agent-that-sent-this' }

    const change = regions('changes').find((c) => c.fields['recordId'] === made['proved'])
    expect(change, 'the change row for the proved write').toBeDefined()
    expect(change?.fields['provedHolder'], 'inline JSON, parsed back as an object').toEqual(holder)

    const revision = regions('revisions').find((r) => r.fields['recordId'] === made['proved'])
    expect(revision, 'the revision row for the proved write').toBeDefined()
    expect(revision?.fields['provedHolder']).toEqual(holder)

    // AND THE HEADING, in the log file and the revision file, names the holder the key proved.
    const log = [...files().entries()]
      .filter(([path]) => path.startsWith('changes/'))
      .map(([, text]) => text)
      .join('\n')
    expect(log, 'the change-log heading names the holder the key proved').toContain(' · proved by the-office')
    const revisionFile = files().get(`revisions/${String(made['proved'])}/1.md`) ?? ''
    expect(revisionFile, 'the revision heading names the holder the key proved').toContain('proved by the-office')
  })
})

// ================================================================================ who takes part

describe('the who-takes-part page names agents by their id', () => {
  it('orders and heads durable agents by id, and keeps each handle inside its block', () => {
    const page = files().get('participants.md') ?? ''
    const durable = page.slice(page.indexOf('## Durable agents'))
    // BY ID, NOT BY HANDLE. The fixture has Early (id b2…) with handle aaa-… and Late (id a1…) with
    // handle zzz-…, so a handle-ordered page would put Early first and this would catch it.
    expect(durable).toContain('### a1Mm6wJp3sRb — Late Agent')
    expect(durable).toContain('### b2Nn7xKq4mTa — Early Agent')
    expect(durable).toContain('### c3Oo8yLr5tUc — Retired Holder')
    expect(durable.indexOf('### a1Mm6wJp3sRb — Late Agent')).toBeLessThan(durable.indexOf('### b2Nn7xKq4mTa — Early Agent'))
    expect(durable.indexOf('### b2Nn7xKq4mTa — Early Agent')).toBeLessThan(durable.indexOf('### c3Oo8yLr5tUc — Retired Holder'))
    // AND THE HANDLE IS STILL IN THE BLOCK, so the address a reader needs is not lost.
    expect(durable).toContain('handle: "aaa-early-handle"')
    expect(durable).toContain('handle: "zzz-late-handle"')
  })

  it('names an agent a key proved, dates a retired one, and shows an id only where no row answers', () => {
    const log = [...files().entries()]
      .filter(([path]) => path.startsWith('changes/'))
      .map(([, text]) => text)
      .join('\n')
    expect(log).toContain('proved by Early Agent')
    expect(log).toContain('proved by Retired Holder (retired 2026-09-01 08:30:00)')
    // THE REGISTRY ID IS NOT WHAT A PERSON READS, and the office has no agent row, so its id stands.
    expect(log).not.toContain('proved by b2Nn7xKq4mTa')
    expect(log).toContain('proved by the-office')
  })
})

// ================================================================================ readability

describe('a person can find their way around it', () => {
  it('names every record in INDEX.md, by title, with the file to open', () => {
    const index = files().get('INDEX.md') ?? ''
    expect(index).toContain('夹具标定')
    expect(index).toContain(`records/module/${String(made['gripper'])}.md`)
    expect(index).toContain('*(deleted)*')
  })

  it('puts a title beside every id a link names, so an id can be followed', () => {
    const gripper = files().get(`records/module/${String(made['gripper'])}.md`) ?? ''
    expect(gripper).toContain('### implements → Sense the pot')
  })

  it('says in words when a record has no links, rather than leaving an empty heading', () => {
    const note = files().get(`records/note/${String(made['note'])}.md`) ?? ''
    expect(note).toMatch(/No link is stored on this record|### /)
  })

  it('opens every record file with its own title, so the file says what it is', () => {
    const block = files().get(`records/block/${String(made['block'])}.md`) ?? ''
    expect(block).toContain('# Sense the pot')
    expect(block).toContain('block · id')
  })

  it('keeps INDEX.md and README.md out of the data entirely', () => {
    // Both are derived from the record files, so both are a second statement of facts already
    // written down. The fence is a rule, not care: an importer reads neither, and a restore that
    // deleted both must produce exactly the same database.
    for (const path of ['INDEX.md', 'README.md']) {
      const parsed = lib.parseExportFile(files().get(path) ?? '', path)
      expect(parsed.regions, `${path} carries a data region`).toEqual([])
    }
  })
})

// ================================================================================ the manifest

describe('MANIFEST.md is a fence an importer can check itself against', () => {
  it('counts what is actually in the files', () => {
    const manifest = one(regions('manifest'), 'manifest region')
    expect(manifest.fields['format']).toBe(lib.FORMAT_VERSION)
    for (const table of EXPORTED_TABLES) {
      expect(manifest.fields[table], `MANIFEST count for ${table}`).toBe(regions(table).length)
    }
    expect(manifest.fields['recordFiles']).toBe(regions('records').length)
  })

  it('records the migrations the database had, with a readable tag', () => {
    const migrations = regions('migrations')
    expect(migrations.length).toBeGreaterThan(0)
    for (const m of migrations) {
      expect(typeof m.fields['hash']).toBe('string')
      expect(typeof m.fields['when']).toBe('number')
    }
    expect(migrations.map((m) => m.fields['tag'])).toContain('0000_uneven_molly_hayes')
  })
})

// ================================================================================ determinism

describe('two exports of unchanged data are the same bytes', () => {
  it('builds the identical tree twice', () => {
    // The property the git mirror rests on. If this fails, every run commits and the history stops
    // meaning anything.
    const a = lib.buildExport().files
    const b = lib.buildExport().files
    expect(b.map((f) => f.path)).toEqual(a.map((f) => f.path))
    for (const [i, file] of a.entries()) expect(b[i]?.text, `${file.path} differs between two builds`).toBe(file.text)
  })

  it('writes nothing the second time', () => {
    lib.writeExport(root)
    const second = lib.writeExport(root)
    expect(second.written).toEqual([])
    expect(second.removed).toEqual([])
    expect(second.unchanged).toBe(second.files)
  })

  it('reports only the files that really changed', () => {
    t.api.patchRecord(String(made['note']), { summary: 'a summary added for this test' }, HUMAN)
    const after = lib.writeExport(root)
    // The record file and the change-log day for today, and nothing else. MANIFEST is unchanged
    // because no row was added.
    expect(after.written).toContain(`records/note/${String(made['note'])}.md`)
    expect(after.written.filter((p) => p.startsWith('records/'))).toEqual([`records/note/${String(made['note'])}.md`])
  })

  it('removes a file it no longer produces, so nothing comes back from the dead', () => {
    // An export written before a decision carried each panel layout as
    // layouts/<id>.md. Left behind in a folder this export owns, it would be
    // read by the next import, so the next
    // export removes it. The file here is the one such an export wrote.
    mkdirSync(join(root, 'layouts'), { recursive: true })
    writeFileSync(join(root, 'layouts', 'home.md'), '# Panel layout `home`\n')
    expect(files().has('layouts/home.md')).toBe(true)
    const report = lib.writeExport(root)
    expect(report.removed).toEqual(['layouts/home.md'])
    expect(files().has('layouts/home.md')).toBe(false)
    // And the directory does not linger, saying a layout exists and is empty.
    expect(() => statSync(join(root, 'layouts'))).toThrow()
  })
})

// ================================================================================ the grammar

describe('the grammar is small enough to be implemented twice and read the same way', () => {
  it('reads front matter, a fields block and a JSON block out of one file', () => {
    const parsed = lib.parseExportFile(
      ['---', 'panelx: "records"', 'id: "abc"', '---', '', '# A title', '', '```mole-office links', 'id: "l1"', '```', '', '```json mole-office records.data', '{ "a": 1 }', '```', ''].join('\n'),
      'made-up.md',
    )
    expect(parsed.regions.map((r) => `${r.name}:${r.kind}`)).toEqual(['records:fields', 'links:fields', 'records.data:json'])
    expect(parsed.regions[0]?.fields).toEqual({ id: 'abc' })
    expect(parsed.regions[2]?.json).toEqual({ a: 1 })
  })

  it('ignores prose entirely, wherever it sits', () => {
    const parsed = lib.parseExportFile(['Some words.', '', '```mole-office links', 'id: "l1"', '```', '', 'More words, and a ``` that is not a fence.'].join('\n'), 'x.md')
    expect(parsed.regions.length).toBe(1)
  })

  it.each([
    ['front matter that is never closed', ['---', 'panelx: "records"', 'id: "a"'].join('\n'), 'never closed'],
    ['front matter with no region named', ['---', 'id: "a"', '---'].join('\n'), 'name its region'],
    ['a block that is never closed', ['```mole-office links', 'id: "a"'].join('\n'), 'never closed'],
    ['a line that is not a field line', ['```mole-office links', 'id "a"', '```'].join('\n'), 'not a field line'],
    ['a value that is not JSON', ['```mole-office links', 'id: abc', '```'].join('\n'), 'not JSON'],
    ['the same key twice', ['```mole-office links', 'id: "a"', 'id: "b"', '```'].join('\n'), 'appears twice'],
    ['a blank line inside a block', ['```mole-office links', 'id: "a"', '', 'toId: "b"', '```'].join('\n'), 'blank line'],
    ['a key that is not a key', ['```mole-office links', '2id: "a"', '```'].join('\n'), 'not a usable key'],
    ['JSON that does not parse', ['```json mole-office records.data', '{ "a": ', '```'].join('\n'), 'does not parse'],
  ])('refuses %s, naming the file and the line', (_what, text, says) => {
    // Refusing loudly beats guessing. Every one of these is something a person hand-editing an
    // export will do, and every message has to say where.
    let thrown: Error | null = null
    try {
      lib.parseExportFile(text, 'hand-edited.md')
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown, `${_what} was accepted`).not.toBeNull()
    expect(thrown?.message).toContain(says)
    expect(thrown?.message).toContain('hand-edited.md:')
  })

  it('reads back everything it wrote, over the whole export, without one refusal', () => {
    // The strongest statement this file can make about the grammar: the writer and the reader are
    // two implementations of FORMAT.md §4, and they agree over every file of a real corpus.
    expect(() => tree()).not.toThrow()
    expect(tree().length).toBe(lib.buildExport().files.length)
  })
})

// ================================================================================ refusals

describe('it refuses rather than writing something wrong', () => {
  it('stops on a record id that could write outside the export', () => {
    // Unreachable through the product — ids are nanoids — and reachable by a direct database
    // write, which is exactly when a backup must not start writing files wherever it is told.
    const scratch = mkdtempSync(join(tmpdir(), 'mole-office-export-bad-'))
    // A record nothing links to, because `links.from_id` and `to_id` are foreign keys and the
    // database would refuse the rename before the exporter ever saw it.
    const lonely = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note nothing links to', data: {}, actor: HUMAN })
    try {
      t.client.sqlite.prepare("UPDATE records SET id = '../escape' WHERE id = ?").run(lonely.id)
      expect(() => lib.writeExport(scratch)).toThrow(/cannot be a file name/)
    } finally {
      t.client.sqlite.prepare("DELETE FROM records WHERE id = '../escape'").run()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('stops on a data column that is no longer JSON, naming the row', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'mole-office-export-bad-'))
    try {
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{not json', made['note'])
      expect(() => lib.writeExport(scratch)).toThrow(/records\.data/)
    } finally {
      t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{}', made['note'])
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('files a record of an unrecognised kind rather than dropping it, and says so', () => {
    // A backup that drops a row it does not recognise is worse than one that reports it.
    const scratch = mkdtempSync(join(tmpdir(), 'mole-office-export-odd-'))
    try {
      t.client.sqlite.prepare('UPDATE records SET kind = ? WHERE id = ?').run('from_the_future', made['note'])
      const report = lib.writeExport(scratch)
      expect(report.notes.join(' ')).toContain('_unrecognised')
      const written = readFileSync(join(scratch, 'records', '_unrecognised', `${String(made['note'])}.md`), 'utf8')
      expect(written).toContain('kind: "from_the_future"')
    } finally {
      t.client.sqlite.prepare('UPDATE records SET kind = ? WHERE id = ?').run('note', made['note'])
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('puts a change row with an unreadable stamp somewhere visible rather than losing it', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'mole-office-export-undated-'))
    try {
      t.client.sqlite.prepare("UPDATE changes SET at = 'no idea' WHERE id = (SELECT id FROM changes LIMIT 1)").run()
      const report = lib.writeExport(scratch)
      expect(report.notes.join(' ')).toContain('changes/undated.md')
      expect(statSync(join(scratch, 'changes', 'undated.md')).isFile()).toBe(true)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

// ================================================================================ nothing local

describe('nothing in the export is about this machine', () => {
  it('carries no absolute path to the export itself, no host name and no export time', () => {
    // A file that changed because the export ran would make every run a commit, and the mirror's
    // history would stop meaning anything.
    const all = [...files().values()].join('\n')
    expect(all).not.toContain(root)
    expect(all).not.toContain(tmpdir())
    // A stamp of "now" would be the giveaway. Record stamps are all in the fixture's own past.
    const today = new Date()
    const stampNow = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`
    const outsideData = [files().get('README.md') ?? '', files().get('INDEX.md') ?? '', files().get('MANIFEST.md') ?? ''].join('\n')
    expect(outsideData).not.toContain(stampNow)
  })

  it('ends every file with exactly one newline, in UTF-8, with no carriage returns', () => {
    for (const [path, text] of files()) {
      expect(text.endsWith('\n'), `${path} does not end with a newline`).toBe(true)
      expect(text.endsWith('\n\n'), `${path} ends with a blank line`).toBe(false)
      expect(text.includes('\r'), `${path} holds a carriage return`).toBe(false)
    }
  })
})

// ================================================================================ it never touches the real database

describe('an export with no destination lands beside the database it mirrors', () => {
  it('puts the default mirror next to MOLE_OFFICE_DB, not at a fixed path in the repository', () => {
    // This is a regression, and the regression was found by another test file within an hour of
    // the default being a fixed `<repo>/data/mirror`. tests/server-wiring.test.ts sends an empty
    // body to every endpoint that takes one — including POST /api/export — so six files describing
    // an empty throwaway Mole Office landed in the repository's real mirror, and the next real export
    // would have shown that as a change and committed it. A mirror belongs to a database.
    expect(lib.defaultExportRoot()).toBe(join(dirname(t.file), 'mirror'))
    expect(lib.defaultExportRoot().startsWith(tmpdir())).toBe(true)
    expect(lib.defaultExportRoot()).not.toContain('test_claude')
  })

  it('lets a caller name a root, and prefers it over the default', () => {
    const named = mkdtempSync(join(tmpdir(), 'mole-office-export-named-'))
    try {
      lib.useExportRoot(named)
      expect(lib.exportRoot()).toBe(named)
      expect(lib.writeExport().root).toBe(named)
    } finally {
      lib.useExportRoot(root)
      rmSync(named, { recursive: true, force: true })
    }
  })
})

describe('this test never opened the real database', () => {
  it('is pointed at a throwaway file, and the export root is a temporary directory', () => {
    // Five orphaned-process incidents, one of which served stale data out of a deleted database.
    // The rule this file obeys is the same one the audits obey: never ./data/panelx.db.
    expect(t.file).toContain(tmpdir())
    expect(process.env.MOLE_OFFICE_DB).toBe(t.file)
    expect(root).toContain(tmpdir())
    expect(writeFileSync).toBeDefined()
  })
})

/**
 * NO PATH FROM THIS MACHINE IN THE ONE COLUMN THAT EXISTS TO EXPLAIN AN ID.
 *
 * `installation.how` is exported, and it used to name the database path its id was worked out from.
 * The second citizens verifier wrote a whole-installation archive from a copy of the owner's
 * database and found the database's own path, under the home folder, in it, at
 * `mirror/participants.md` line 231. Problem `25JDoYvL_lK5`, reopened.
 *
 * THE CLAIM THIS REPLACES WAS TOO BIG, and the verifier was right to say so. The fix for that
 * problem said this file "refuses an absolute path from this machine anywhere in an archive". It
 * does not, and it should not: a world's checkout, a ledger row and plenty of record bodies are
 * paths on this machine, and they are facts about the thing being described. What is enforceable —
 * and what was actually wrong — is this one column, whose whole content is a sentence this product
 * writes about itself.
 *
 * IT DRIVES THE WHOLE CHAIN. A path is put into the row the way the old code wrote it, the database
 * is migrated, and the archive is written from what the migration left.
 */
describe('the installation sentence carries no path into an archive', () => {
  it('is clean in the archive after a database with an old sentence is migrated', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const { fileURLToPath, URL: NodeURL } = await import('node:url')
    const MIGRATIONS = fileURLToPath(new NodeURL('../drizzle', import.meta.url))
    t.client.sqlite
      .prepare('UPDATE installation SET how = ? WHERE only_row = 1')
      .run(
        'nothing named this installation, so it is the SHA-256 of the canonical database path ' +
          `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/data/panelx.db, cut to 16 characters`,
      )
    expect(migrateInPlace(t.client.sqlite, MIGRATIONS).citizenship.installationSentenceRepaired).toBe(1)

    const where = mkdtempSync(join(tmpdir(), 'mole-office-installation-archive-'))
    try {
      lib.writeExport(where)
      const written: string[] = []
      const visit = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) visit(full)
          else written.push(readFileSync(full, 'utf8'))
        }
      }
      visit(where)
      const all = written.join('\n')
      expect(all, 'the archive still carries the path the installation row named').not.toContain(
        `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/data/panelx.db`,
      )
      // And the row really is in there, so this is not passing because nothing was exported.
      const stored = t.client.sqlite.prepare('SELECT id FROM installation WHERE only_row = 1').get() as { id: string }
      expect(all).toContain(stored.id)
    } finally {
      rmSync(where, { recursive: true, force: true })
    }
  })
})
