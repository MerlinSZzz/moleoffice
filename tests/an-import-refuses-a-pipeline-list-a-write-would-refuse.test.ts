// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN IMPORT REFUSES A PIPELINE LIST THAT A WRITE WOULD REFUSE.
 *
 * A pipeline lists its blocks by id in `blockIds`. Every door that writes a list refuses five kinds of entry: an id no
 * record holds, a record that is not a block, a deleted block, a block of another project, and an id listed twice. The
 * import read no list, so an archive could leave a live pipeline listing any of the five. What is held here:
 *   1. Each of the five is refused in a pipeline the archive holds. The refusal names the pipeline by id and title, the
 *      entry, and the pipeline's file and line, and nothing is written.
 *   2. A stored pipeline the archive does not hold is checked against the state the import would leave. An archive
 *      that moves one of its blocks to another project, or deletes one, is refused at that block's file and line.
 *   3. A stored pipeline whose list was bad before the import is refused too, with no file, since no file of the archive
 *      holds the pipeline or the entry.
 *   4. Every bad entry of every pipeline is named in one answer.
 *   5. Only a pipeline that is live after the import is read. A deleted pipeline listing a deleted block and an id no
 *      record holds is imported.
 *   6. A good list is imported, also one with a block that a second pipeline of the same project lists.
 *
 * Everything here is made up, in a test office of this file's own with two projects of its own. Each case exports that
 * office into a folder made for the case with mkdtemp, edits the archive there, and removes the folder after. Blocks
 * are made through the block door. Where a case needs a row the doors do not write, it is written straight into the
 * database, and the case says so.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, one, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')
type Grammar = typeof import('../src/server/db/export-grammar.ts')
type Refused = InstanceType<ImportLib['ImportRefused']>
type Refusal = Refused['plan']['refusals'][number]

const HERE = 'made-up-here'
const ELSEWHERE = 'made-up-elsewhere'
/** An id no record holds. */
const NOBODYS = 'made-up-id-that-no-record-holds'

let t: TestDb
let exportLib: ExportLib
let lib: ImportLib
let grammar: Grammar
let authoredTables: readonly string[]
let root: string

beforeEach(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: HERE, title: 'A made-up project' })
  createWorkspace({ id: ELSEWHERE, title: 'Another made-up project' })
  exportLib = await import('../src/server/lib/export.ts')
  lib = await import('../src/server/lib/import.ts')
  grammar = await import('../src/server/db/export-grammar.ts')
  ;({ AUTHORED_TABLES: authoredTables } = await import('../src/server/db/schema.ts'))
  root = mkdtempSync(join(tmpdir(), 'mole-office-pipeline-lists-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  t.close()
})

let made = 0

/** A pipeline of `project`, filed with an empty list. Each title is its own, so a failure names the case that made it. */
function aPipeline(project: string): string {
  made += 1
  return t.api.createRecord({ workspaceId: project, kind: 'pipeline', title: `A made-up pipeline ${String(made)}`, data: { blockIds: [] }, actor: t.api.HUMAN }).id
}

/** A block added to `pipeline` through the block door. */
function aBlock(pipeline: string): string {
  made += 1
  return t.blocks.addBlock(pipeline, { name: `A made-up step ${String(made)}`, state: 'todo' }, t.api.HUMAN).block.id
}

/** A note of `project`: a record that is not a block. */
function aNote(project: string): string {
  made += 1
  return t.api.createRecord({ workspaceId: project, kind: 'note', title: `A made-up note ${String(made)}`, data: { body: 'A made-up note.' }, actor: t.api.HUMAN }).id
}

/** A record's kind and title as stored, deleted or not. */
const storedRow = (id: string): { kind: string; title: string } =>
  t.client.sqlite.prepare('SELECT kind, title FROM records WHERE id = ?').get(id) as { kind: string; title: string }

/** A pipeline's list as stored, read with SQL so a deleted pipeline is read too. */
const storedList = (pipeline: string): unknown =>
  (JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(pipeline) as { data: string }).data) as Record<string, unknown>)['blockIds']

/** What the database holds right now, in every authored table, so a case can prove a refusal wrote nothing. */
const snapshot = (): string => JSON.stringify(authoredTables.map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table}`).all()))

// -------------------------------------------------------------------------------- the archive

/** A record's file, from the archive's root, in the folder of its kind. */
const pathOf = (id: string): string => `records/${storedRow(id).kind}/${id}.md`

/** A record's file, read and parsed by the archive's own grammar. */
function parsed(id: string): ReturnType<Grammar['parseExportFile']> {
  return grammar.parseExportFile(readFileSync(join(root, pathOf(id)), 'utf8'), pathOf(id))
}

/** A record's front matter, which is the first region of its file. */
function frontMatter(id: string): ReturnType<Grammar['parseExportFile']>['regions'][number] {
  const first = parsed(id).regions[0]
  if (first === undefined) throw new Error(`this test found no front matter in ${pathOf(id)}`)
  return first
}

/** The line a record's row starts on in its file: the line of its front matter, as the grammar reads it. */
const rowLine = (id: string): number => frontMatter(id).line

/** One field of a record's front matter, as the archive holds it. */
const fieldOf = (id: string, key: string): unknown => frontMatter(id).fields[key]

/** Replace one field of a record's front matter, refusing if the field is not there once. */
function setField(id: string, key: string, value: unknown): void {
  const file = join(root, pathOf(id))
  const lines = readFileSync(file, 'utf8').split('\n')
  const close = lines.indexOf('---', 1)
  const found = lines.slice(0, close).flatMap((line, i) => (line.startsWith(`${key}: `) ? [i] : []))
  if (found.length !== 1) throw new Error(`this test wanted one \`${key}:\` line in the front matter of ${file} and there are ${found.length}`)
  lines[found[0] ?? 0] = `${key}: ${JSON.stringify(value)}`
  writeFileSync(file, lines.join('\n'), 'utf8')
}

/** Give a pipeline's file a list of its own, in the JSON block that holds its `data`, as the export writes that block. */
function setBlockIds(pipeline: string, ids: readonly string[]): void {
  const file = join(root, pathOf(pipeline))
  const lines = readFileSync(file, 'utf8').split('\n')
  const data = parsed(pipeline).regions.find((region) => region.kind === 'json' && region.name === 'records.data')
  if (data === undefined) throw new Error(`this test found no data block in ${file}`)
  // The block's opening fence is at `data.line`, and it closes at the first line after it that is a bare fence.
  const open = data.line - 1
  const close = lines.findIndex((line, i) => i > open && line === '```')
  if (close === -1) throw new Error(`this test found the data block in ${file} never closed`)
  const json = { ...(data.json as Record<string, unknown>), blockIds: ids }
  lines.splice(open + 1, close - open - 1, ...JSON.stringify(json, null, 2).split('\n'))
  writeFileSync(file, lines.join('\n'), 'utf8')
}

// -------------------------------------------------------------------------------- the answer

/** The import, refused, with the database as it was before. Fails the case if the import was taken. */
function refused(): Refused {
  const before = snapshot()
  let thrown: unknown
  try {
    lib.applyImport(root)
  } catch (err) {
    thrown = err
  }
  if (thrown === undefined) throw new Error('the import was accepted, and this case exists because it must not be')
  if (!(thrown instanceof lib.ImportRefused)) throw thrown
  expect(snapshot(), 'a refused import writes nothing').toBe(before)
  return thrown
}

/**
 * The one refusal that names `entry` in the list of `pipeline`. It names the pipeline by id and title, and it gives
 * the file and line of `at`'s row, which the error's own message shows too.
 */
function expectTheRefusal(err: Refused, pipeline: string, entry: string, at: string): Refusal {
  const refusal = one(
    err.plan.refusals.filter((each) => each.problem.includes(pipeline) && each.problem.includes(entry)),
    `refusal naming ${entry} in the list of ${pipeline}, among: ${err.message}`,
  )
  expect(refusal.problem, "the pipeline's title").toContain(storedRow(pipeline).title)
  expect(`${refusal.path}:${String(refusal.line)}`, 'the file and line').toBe(`${pathOf(at)}:${String(rowLine(at))}`)
  expect(err.message, 'the file and line in the message').toContain(`${refusal.path}:${String(refusal.line)}`)
  return refusal
}

/**
 * A pipeline filed after the export, so the archive does not hold it, that lists `block`. The pipeline the block was
 * added to is deleted before the export, so no live pipeline the archive holds lists the block.
 */
function aStoredPipelineTheArchiveDoesNotHold(): { pipeline: string; block: string } {
  const first = aPipeline(HERE)
  const block = aBlock(first)
  t.api.deleteRecord(first, t.api.HUMAN)
  exportLib.writeExport(root)
  const pipeline = aPipeline(HERE)
  t.api.patchRecord(pipeline, { dataPatch: { blockIds: [block] } }, t.api.HUMAN)
  return { pipeline, block }
}

describe('an import refuses a pipeline list that a write would refuse', () => {
  it('1. refuses a block of another project in a pipeline the archive holds, and names both projects', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const elsewhere = aBlock(aPipeline(ELSEWHERE))
    exportLib.writeExport(root)
    setBlockIds(pipeline, [own, elsewhere])
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(1)
    const refusal = expectTheRefusal(err, pipeline, elsewhere, pipeline)
    expect(refusal.problem, "the block's project").toContain(ELSEWHERE)
    expect(refusal.problem, "the pipeline's project").toContain(HERE)
  })

  it('2. refuses an id that no record holds', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    exportLib.writeExport(root)
    setBlockIds(pipeline, [own, NOBODYS])
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(1)
    expectTheRefusal(err, pipeline, NOBODYS, pipeline)
  })

  it('3. refuses a record that is not a block', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    const note = aNote(HERE)
    exportLib.writeExport(root)
    setBlockIds(pipeline, [own, note])
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(1)
    expectTheRefusal(err, pipeline, note, pipeline)
  })

  it('4. refuses a block the archive deletes, in a pipeline the archive holds, at the pipeline\'s file', () => {
    const pipeline = aPipeline(HERE)
    aBlock(pipeline)
    const gone = aBlock(pipeline)
    exportLib.writeExport(root)
    setField(gone, 'deletedAt', fieldOf(gone, 'createdAt'))
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(1)
    expectTheRefusal(err, pipeline, gone, pipeline)
  })

  it('5. refuses one block listed twice', () => {
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    exportLib.writeExport(root)
    setBlockIds(pipeline, [own, own])
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(1)
    expectTheRefusal(err, pipeline, own, pipeline)
  })

  it('6. refuses an archive that moves a block of a stored pipeline it does not hold to another project, at the block\'s file', () => {
    const { pipeline, block } = aStoredPipelineTheArchiveDoesNotHold()
    setField(block, 'workspaceId', ELSEWHERE)
    const err = refused()
    // One refusal: the deleted pipeline the block was added to lists it too, and a deleted pipeline is not read.
    expect(err.plan.refusals, err.message).toHaveLength(1)
    const refusal = expectTheRefusal(err, pipeline, block, block)
    expect(refusal.problem, "the block's project").toContain(ELSEWHERE)
    expect(refusal.problem, "the pipeline's project").toContain(HERE)
  })

  it('7. refuses an archive that deletes a block of a stored pipeline it does not hold, at the block\'s file', () => {
    const { pipeline, block } = aStoredPipelineTheArchiveDoesNotHold()
    setField(block, 'deletedAt', fieldOf(block, 'createdAt'))
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(1)
    expectTheRefusal(err, pipeline, block, block)
  })

  it('8. refuses a stored pipeline whose list was bad before the import, and gives it no file of the archive', () => {
    exportLib.writeExport(root)
    const pipeline = aPipeline(HERE)
    const own = aBlock(pipeline)
    // A write door refuses this list, so it is written straight into the database. It stands for a row an import or a
    // hand could write.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.blockIds', json(?)) WHERE id = ?").run(JSON.stringify([own, NOBODYS]), pipeline)
    const err = refused()
    const refusal = one(
      err.plan.refusals.filter((each) => each.problem.includes(pipeline) && each.problem.includes(NOBODYS)),
      `refusal naming ${NOBODYS} in the list of ${pipeline}, among: ${err.message}`,
    )
    expect(refusal.problem, "the pipeline's title").toContain(storedRow(pipeline).title)
    // The empty path and the line 0 are how an ImportRefusal says no file holds the problem.
    expect({ path: refusal.path, line: refusal.line }).toEqual({ path: '', line: 0 })
  })

  it('9. names every bad entry of every pipeline in one answer', () => {
    const first = aPipeline(HERE)
    const firstOwn = aBlock(first)
    const second = aPipeline(HERE)
    const secondOwn = aBlock(second)
    const note = aNote(HERE)
    exportLib.writeExport(root)
    setBlockIds(first, [firstOwn, NOBODYS, note])
    setBlockIds(second, [secondOwn, secondOwn])
    const err = refused()
    expect(err.plan.refusals, err.message).toHaveLength(3)
    expectTheRefusal(err, first, NOBODYS, first)
    expectTheRefusal(err, first, note, first)
    expectTheRefusal(err, second, secondOwn, second)
  })

  it('10. imports a deleted pipeline that lists a deleted block and an id no record holds, since only a live pipeline is read', () => {
    const pipeline = aPipeline(HERE)
    const block = aBlock(pipeline)
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    // The delete door lets a block go once no live pipeline lists it.
    t.api.deleteRecord(block, t.api.HUMAN)
    exportLib.writeExport(root)
    setBlockIds(pipeline, [block, NOBODYS])
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    expect(storedList(pipeline)).toEqual([block, NOBODYS])
  })

  it('11. imports a good list, also one with a block that a second pipeline of the same project lists', () => {
    const first = aPipeline(HERE)
    const shared = aBlock(first)
    const second = aPipeline(HERE)
    const own = aBlock(second)
    t.api.patchRecord(second, { dataPatch: { blockIds: [own, shared] } }, t.api.HUMAN)
    exportLib.writeExport(root)
    setBlockIds(second, [shared, own])
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    expect(storedList(second)).toEqual([shared, own])
    expect(storedList(first)).toEqual([shared])
  })
})
