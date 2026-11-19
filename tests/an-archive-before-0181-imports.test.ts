// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVE WRITTEN BEFORE MIGRATION 0181 STILL IMPORTS, AND NEVER ERASES HOW SOMEBODY ASKED TO BE ADDRESSED.
 *
 * Migration 0181 added four columns to `people` and to `agents`: how each wishes to be
 * addressed. The export writes them on every row. An archive written before 0181 has no such
 * lines, and the importer refuses a row that leaves out a column unless MAY_BE_ABSENT in
 * src/server/lib/import.ts lists it. Now the four are listed for both regions:
 *
 *   - a row the import INSERTS has no part set;
 *   - a row ALREADY STORED keeps what its person or agent wrote;
 *   - the plan's notes count both.
 *
 * HOW THE OLD ARCHIVE IS MADE. The test writes an archive with today's export, then takes out what an
 * export before 0181 did not write: every address line, and the manifest's migration blocks from 0181 on.
 *
 * Every name here is made up.
 *
 * MUTATION PROOF (after a green control), in src/server/lib/import.ts: take ADDRESS_AS_FIELDS out of the
 * `agents` and `people` entries of MAY_BE_ABSENT. The plan is refused again, naming the address columns.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADDRESS_AS_FIELDS } from '../src/shared/address-as.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let importLib: ImportLib
let removedLines = 0

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/** Make the archive look as an export before 0181 wrote it. */
function makeItOld(dir: string): void {
  for (const file of filesUnder(dir)) {
    const kept: string[] = []
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (ADDRESS_AS_FIELDS.some((field) => line.startsWith(`${field}: `))) {
        removedLines += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file.endsWith('MANIFEST.md')) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "(\d{4})_[^"]*"\n```\n*/g, (block, number: string) =>
        Number(number) >= 181 ? '' : block,
      )
      if (text.includes('0181_')) throw new Error('the manifest still names migration 0181')
      if (!text.includes('0180_')) throw new Error('the manifest lost migration 0180 as well')
    }
    writeFileSync(file, text)
  }
}

/** Make a registered agent through the record door, and give its registry row a made-up address. */
function anAgentWithAnAddress(t: TestDb, handle: string, name: string): void {
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' }, actor: HUMAN })
  t.client.sqlite.prepare('UPDATE agents SET address_name = ?, address_title = ? WHERE handle = ?').run(name, 'a made-up title', handle)
}

function addressOf(t: TestDb, table: 'agents' | 'people', where: string, value: string): { name: string | null; title: string | null } {
  const row = t.client.sqlite.prepare(`SELECT address_name AS name, address_title AS title FROM ${table} WHERE ${where} = ?`).get(value) as
    | { name: string | null; title: string | null }
    | undefined
  if (row === undefined) throw new Error(`${table} ${value} is not stored`)
  return row
}

let personId = ''

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0181-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-0181-old-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const person = source.client.sqlite.prepare('SELECT id FROM people LIMIT 1').get() as { id: string } | undefined
  if (person === undefined) throw new Error('the test database holds no person row')
  personId = person.id
  source.client.sqlite.prepare('UPDATE people SET address_name = ?, address_title = ? WHERE id = ?').run('A made-up person', 'a made-up chief', personId)
  anAgentWithAnAddress(source, 'stored-agent', 'A made-up stored agent')
  exportLib.writeExport(fullArchive)

  anAgentWithAnAddress(source, 'new-agent', 'A made-up new agent')
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  const first = importLib.applyImport(fullArchive)
  if (!first.applied) throw new Error('the full archive did not import')
})

afterAll(() => {
  for (const dir of [fullArchive, oldArchive]) rmSync(dir, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('an archive written before migration 0181', () => {
  it('is what an old export writes: no address line on any person or agent row', () => {
    expect(removedLines, 'address lines taken out').toBeGreaterThan(0)
    expect(addressOf(target, 'agents', 'handle', 'stored-agent').name).toBe('A made-up stored agent')
    expect(addressOf(target, 'people', 'id', personId).title).toBe('a made-up chief')
  })

  it('imports, and the plan counts the rows that say nothing about how to address them', () => {
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    const notes = plan.notes.filter((n) => n.includes('say nothing about how they wish to be addressed'))
    expect(notes.length, plan.notes.join('\n')).toBeGreaterThan(0)
    expect(notes.join('\n')).toContain('existing row(s) keep what is stored')
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
  })

  it('leaves a stored address as it was, and inserts a new row with no part set', () => {
    expect(addressOf(target, 'agents', 'handle', 'stored-agent')).toEqual({ name: 'A made-up stored agent', title: 'a made-up title' })
    expect(addressOf(target, 'people', 'id', personId)).toEqual({ name: 'A made-up person', title: 'a made-up chief' })
    expect(addressOf(target, 'agents', 'handle', 'new-agent')).toEqual({ name: null, title: null })
  })
})
