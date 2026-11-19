// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE FIVE NEWER COLUMNS IMPORTS, AN INSERTED ROW READS NULL IN EACH OF THEM, AND A STORED
 * ROW KEEPS WHAT IT HOLDS.
 *
 * Five columns the importer knows were not named in MAY_BE_ABSENT in src/server/lib/import.ts, so an archive
 * written before them was refused outright. The export writes all five today:
 *
 *   - a person's own message labels (`people.chatLabels`, migration 0341), how the chat is laid out
 *     (`people.chatLayout`, migration 0343), and their own agent tags (`people.agentTags`, migration 0344);
 *   - a project's master pipeline (`workspaces.masterPipeline`, migration 0338), and whether the points of a
 *     handed-back package are inspected (`workspaces.packageInspection`, migration 0345).
 *
 * Each migration says a null means nobody has chosen: no labels made, no layout chosen, no tags made, no master
 * pipeline marked, and no inspection choice made (which the office reads as on, through `packageInspectionOf`).
 * An archive written before a column is an honest archive of a database where nobody had chosen it.
 *
 * WHAT THIS FILE ASKS.
 *   - The archive imports: no refusal names any of the five columns.
 *   - A row the import INSERTS reads null in every one of the five.
 *   - A row already stored KEEPS the choice it holds, so an old archive cannot turn a project's inspection off,
 *     erase a person's labels or tags, or lose the pipeline a project names.
 *   - The plan's notes count the rows that say nothing, how many are new and how many keep what is stored.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export, then takes out the five lines from
 * every block that carries them and the five migrations from the manifest, the way
 * tests/an-archive-before-0337-imports.test.ts does. Every id here is made up.
 *
 * MUTATIONS, each after a control run, in src/server/lib/import.ts:
 *   · any one of the five taken out of its MAY_BE_ABSENT entry → the plan is refused naming that column, and
 *     "imports, and the plan counts the rows" is red;
 *   · the notes block for these five taken out → the counting case is red, because no note counts the rows.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { journal, MIGRATIONS, migrationsBefore } from './migration-fixtures.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

/** The made-up rows: the first set is exported before the old archive is made, the second is only in the old one. */
const SECOND_PERSON = 'made-up-second-person'
const SECOND_PROJECT = 'made-up-second-project'
const SECOND_MASTER_PIPELINE = 'made-up-second-pipeline'
const AT = '2026-11-18 12:00:00'

/** The five columns, by the region whose blocks carry them, and the flags on the person we set and read. */
const NEW_COLUMNS = {
  people: ['chatLabels', 'chatLayout', 'agentTags'],
  workspaces: ['packageInspection', 'masterPipeline'],
} as const

const PERSON_CHOICES = {
  chatLabels: JSON.stringify([{ text: 'made-up label', colour: 'blue' }]),
  chatLayout: 'two',
  agentTags: JSON.stringify([{ name: 'made-up tag', colour: 'blue', agentIds: [] }]),
} as const

/** The five migrations that added the columns, by the end of each tag, and the tags an export before them wrote. */
const THE_TAGS = (['_a_project_names_its_master_pipeline', '_a_person_keeps_their_own_message_labels', '_a_person_keeps_how_the_chat_is_laid_out', '_a_person_keeps_their_own_agent_tags', '_a_project_chooses_package_inspection'] as const).map(
  (ending) => {
    const tag = journal(MIGRATIONS).find((entry) => entry.tag.endsWith(ending))?.tag
    if (tag === undefined) throw new Error(`the migration journal holds no migration ending ${ending}.`)
    return tag
  },
)
const THE_EARLIEST_TAG = THE_TAGS.reduce((earliest, tag) =>
  journal(MIGRATIONS).findIndex((entry) => entry.tag === tag) < journal(MIGRATIONS).findIndex((entry) => entry.tag === earliest) ? tag : earliest,
)
const THE_TAGS_BEFORE_THEM = journal(MIGRATIONS)
  .slice(0, migrationsBefore(THE_EARLIEST_TAG))
  .map((entry) => entry.tag)

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let importLib: ImportLib
let pipelineId = ''
let personId = ''
const removed: Record<string, number> = Object.fromEntries([...NEW_COLUMNS.people, ...NEW_COLUMNS.workspaces].map((column) => [column, 0]))

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before the five migrations wrote it: no line for any of the five. */
function makeItOld(dir: string): void {
  const all = new Set<string>([...NEW_COLUMNS.people, ...NEW_COLUMNS.workspaces])
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    let region: keyof typeof NEW_COLUMNS | null = null
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office people') region = 'people'
      else if (line === '```mole-office workspaces') region = 'workspaces'
      else if (line === '```') region = null
      if (region !== null) {
        const column = NEW_COLUMNS[region].find((name) => line.startsWith(`${name}: `))
        if (column !== undefined) {
          removed[column] = (removed[column] ?? 0) + 1
          continue
        }
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "([^"]*)"\n```\n*/g, (block, tag: string) =>
        THE_TAGS.includes(tag) ? '' : block,
      )
      for (const tag of THE_TAGS) if (text.includes(tag)) throw new Error(`the manifest still names ${tag}`)
      if (!text.includes(THE_TAGS_BEFORE_THEM.at(-1)!)) throw new Error('the manifest lost the migration before the five as well')
    }
    writeFileSync(file, text)
  }
  for (const column of all) if ((removed[column] ?? 0) === 0) throw new Error(`the archive never wrote ${column}`)
}

function rowsIn(t: TestDb, table: 'people' | 'workspaces'): number {
  return (t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

function personChoice(t: TestDb, id: string, column: keyof typeof PERSON_CHOICES): string | null {
  const sql = column === 'chatLabels' ? 'chat_labels' : column === 'chatLayout' ? 'chat_layout' : 'agent_tags'
  const row = t.client.sqlite.prepare(`SELECT ${sql} AS value FROM people WHERE id = ?`).get(id) as { value: string | null } | undefined
  if (row === undefined) throw new Error(`person ${id} is not stored`)
  return row.value
}

function projectChoice(t: TestDb, id: string, column: 'packageInspection' | 'masterPipeline'): boolean | string | null {
  const sql = column === 'packageInspection' ? 'package_inspection' : 'master_pipeline'
  const row = t.client.sqlite.prepare(`SELECT ${sql} AS value FROM workspaces WHERE id = ?`).get(id) as { value: number | string | null } | undefined
  if (row === undefined) throw new Error(`project ${id} is not stored`)
  if (column === 'masterPipeline') return row.value === null ? null : String(row.value)
  return row.value === null ? null : row.value !== 0
}

/** A second person, copied from the first with its own made-up id, handle and name, and its own choices. */
function aSecondPerson(t: TestDb, fromId: string): void {
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(people)').all() as { name: string }[]).map((c) => c.name)
  const others = columns.filter((c) => c !== 'id' && c !== 'handle' && c !== 'name' && c !== 'office_owner')
  t.client.sqlite
    .prepare(`INSERT INTO people (id, handle, name, ${others.join(', ')}) SELECT ?, ?, ?, ${others.join(', ')} FROM people WHERE id = ?`)
    .run(SECOND_PERSON, SECOND_PERSON, 'A made-up second person', fromId)
  t.client.sqlite
    .prepare('UPDATE people SET chat_labels = ?, chat_layout = ?, agent_tags = ? WHERE id = ?')
    .run(JSON.stringify([{ text: 'made-up other label', colour: 'green' }]), 'one', JSON.stringify([{ name: 'made-up other tag', colour: 'green', agentIds: [] }]), SECOND_PERSON)
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-before-five-columns-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-before-five-columns-old-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const person = source.client.sqlite.prepare('SELECT id FROM people LIMIT 1').get() as { id: string } | undefined
  if (person === undefined) throw new Error('the test database holds no person row')
  personId = person.id
  source.client.sqlite
    .prepare('UPDATE people SET chat_labels = ?, chat_layout = ?, agent_tags = ? WHERE id = ?')
    .run(PERSON_CHOICES.chatLabels, PERSON_CHOICES.chatLayout, PERSON_CHOICES.agentTags, personId)

  const pipeline = source.api.createRecord({
    kind: 'pipeline',
    title: 'A made-up master pipeline',
    data: { blockIds: [] },
    workspaceId: 'default',
    actor: { type: 'agent', id: 'made-up-secretary', sessionId: null, stated: true },
  })
  pipelineId = pipeline.id
  source.client.sqlite
    .prepare('UPDATE workspaces SET package_inspection = 1, master_pipeline = ? WHERE id = ?')
    .run(pipelineId, 'default')
  exportLib.writeExport(fullArchive)

  aSecondPerson(source, personId)
  source.client.sqlite
    .prepare('INSERT INTO workspaces (id, title, package_inspection, master_pipeline, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)')
    .run(SECOND_PROJECT, 'A made-up second project', SECOND_MASTER_PIPELINE, AT, AT)
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  const first = importLib.applyImport(fullArchive)
  if (!first.applied) throw new Error('the full archive did not import')
}, 60_000)

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive written before the five columns', () => {
  it('is what an old export writes: no line for any of them, and no migration that added one', () => {
    const people = rowsIn(source, 'people')
    const projects = rowsIn(source, 'workspaces')
    expect(removed['chatLabels']).toBe(people)
    expect(removed['chatLayout']).toBe(people)
    expect(removed['agentTags']).toBe(people)
    expect(removed['packageInspection']).toBe(projects)
    expect(removed['masterPipeline']).toBe(projects)
    expect(personChoice(target, personId, 'chatLayout')).toBe(PERSON_CHOICES.chatLayout)
    expect(projectChoice(target, 'default', 'masterPipeline')).toBe(pipelineId)
  })

  it('imports, and the plan counts the rows that say nothing about each group', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const people = rowsIn(source, 'people')
    const projects = rowsIn(source, 'workspaces')
    const peopleNote = plan.notes.filter((n) => n.includes('say nothing about one or more of their own message labels, how the chat is laid out, and their own agent tags'))
    expect(peopleNote, plan.notes.join('\n')).toHaveLength(1)
    expect(peopleNote[0]).toContain(`${String(people)} people row(s) say nothing`)
    expect(peopleNote[0]).toContain('1 new row(s) are inserted')
    expect(peopleNote[0]).toContain(`${String(people - 1)} existing row(s) keep what is stored`)
    const projectNote = plan.notes.filter((n) => n.includes('say nothing about the project\'s master pipeline or whether its handed-back package points are inspected'))
    expect(projectNote, plan.notes.join('\n')).toHaveLength(1)
    expect(projectNote[0]).toContain(`${String(projects)} workspaces row(s) say nothing`)
    expect(projectNote[0]).toContain('1 new row(s) are inserted')
    expect(projectNote[0]).toContain(`${String(projects - 1)} existing row(s) keep what is stored`)
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
  })

  it('reads null in every one of the five on an inserted row, and keeps what a stored row holds', () => {
    for (const column of NEW_COLUMNS.people) expect(personChoice(target, SECOND_PERSON, column)).toBeNull()
    for (const column of NEW_COLUMNS.people) expect(personChoice(target, personId, column)).toBe(PERSON_CHOICES[column])
    expect(projectChoice(target, SECOND_PROJECT, 'packageInspection')).toBeNull()
    expect(projectChoice(target, SECOND_PROJECT, 'masterPipeline')).toBeNull()
    expect(projectChoice(target, 'default', 'packageInspection')).toBe(true)
    expect(projectChoice(target, 'default', 'masterPipeline')).toBe(pipelineId)
  })
})
