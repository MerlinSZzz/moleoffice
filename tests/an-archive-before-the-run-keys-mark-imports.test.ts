// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * An archive written before the run-keys mark imports without erasing a stored mark.
 * New agents receive 0, existing agents keep both 0 and 1, and the plan counts both paths.
 * An archive that carries the mark still writes it on inserts and updates.
 *
 * The old archive is today's export with runKeysOnly removed from agents and the migration
 * journal cut before the migration's descriptive tag. Its number may change in the merge queue.
 * All agents here are made-up rows in throwaway databases.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ImportLib = typeof import('../src/server/lib/import.ts')

const THE_MIGRATION = 'an_agent_that_signs_only_with_run_keys'
const MARKED = 'made-up-marked-agent'
const UNMARKED = 'made-up-unmarked-agent'
const NEW_AGENT = 'made-up-new-agent'
const EXPLICIT_MARK = 'made-up-explicit-mark-agent'
const HUMAN = { type: 'human' as const, id: 'owner' }

let source: TestDb
let target: TestDb
let fullArchive: string
let oldArchive: string
let markedArchive: string
let importLib: ImportLib
let removedLines = 0
let removedMigrations = 0
let oldAgentRows = 0

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? filesUnder(full) : name.endsWith('.md') ? [full] : []
  })
}

function makeItOld(dir: string): void {
  const manifest = join(dir, 'MANIFEST.md')
  const original = readFileSync(manifest, 'utf8')
  const migrationTags = [...original.matchAll(/tag: "(\d{4})_([^\"]+)"/g)]
  const index = migrationTags.findIndex((tag) => tag[2] === THE_MIGRATION)
  if (index < 1) throw new Error('the manifest does not name the run-keys migration and its predecessor')
  const from = Number(migrationTags[index]?.[1])
  const previousTag = migrationTags[index - 1]?.[0] as string
  for (const file of filesUnder(dir)) {
    let inAgents = false
    const kept: string[] = []
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line === '```mole-office agents') inAgents = true
      else if (line === '```') inAgents = false
      if (inAgents && line.startsWith('runKeysOnly: ')) {
        removedLines += 1
        continue
      }
      kept.push(line)
    }
    let text = kept.join('\n')
    if (file === manifest) {
      text = text.replace(/```mole-office migrations\n(?:(?!```)[\s\S])*?tag: "(\d{4})_[^"]*"\n```\n*/g, (block, number: string) => {
        if (Number(number) < from) return block
        removedMigrations += 1
        return ''
      })
      if (text.includes(THE_MIGRATION)) throw new Error('the old manifest still names the run-keys migration')
      if (!text.includes(previousTag)) throw new Error('the old manifest lost the preceding migration')
    }
    writeFileSync(file, text)
  }
}

function anAgent(t: TestDb, handle: string, mark: 0 | 1): void {
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'codex' }, actor: HUMAN })
  t.client.sqlite.prepare('UPDATE agents SET run_keys_only = ? WHERE handle = ?').run(mark, handle)
}

function agentOf(handle: string): { id: string; name: string; mark: number } {
  const row = target.client.sqlite.prepare('SELECT id, name, run_keys_only AS mark FROM agents WHERE handle = ?').get(handle) as
    | { id: string; name: string; mark: number }
    | undefined
  if (row === undefined) throw new Error(`agent ${handle} is not stored`)
  return row
}

beforeAll(async () => {
  fullArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-run-keys-full-'))
  oldArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-run-keys-old-'))
  markedArchive = mkdtempSync(join(tmpdir(), 'mole-office-archive-run-keys-marked-'))
  source = await freshDb()
  const exportLib = await import('../src/server/lib/export.ts')
  anAgent(source, MARKED, 1)
  anAgent(source, UNMARKED, 0)
  exportLib.writeExport(fullArchive)

  // Changing another column forces real UPDATEs while the old archive says nothing about the mark.
  for (const handle of [MARKED, UNMARKED]) {
    source.client.sqlite.prepare('UPDATE agents SET name = ? WHERE handle = ?').run(`An archived name for ${handle}`, handle)
  }
  anAgent(source, NEW_AGENT, 1)
  oldAgentRows = (source.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents').get() as { n: number }).n
  exportLib.writeExport(oldArchive)
  makeItOld(oldArchive)

  anAgent(source, EXPLICIT_MARK, 1)
  source.client.sqlite.prepare('UPDATE agents SET run_keys_only = 1 WHERE handle = ?').run(UNMARKED)
  exportLib.writeExport(markedArchive)
})

beforeEach(async () => {
  target = await freshDb()
  importLib = await import('../src/server/lib/import.ts')
  const first = importLib.applyImport(fullArchive)
  expect(first.refusals).toEqual([])
  expect(first.applied).toBe(true)
  expect(agentOf(MARKED).mark).toBe(1)
  expect(agentOf(UNMARKED).mark).toBe(0)
})

afterEach(() => target?.close())
afterAll(() => {
  for (const dir of [fullArchive, oldArchive, markedArchive]) {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
  source?.close()
})

describe('an archive written before the run-keys mark', () => {
  it('has no runKeysOnly line and plans an insert and updates to both fixture agents', () => {
    expect(oldAgentRows).toBeGreaterThanOrEqual(3)
    expect(removedLines).toBe(oldAgentRows)
    expect(removedMigrations).toBeGreaterThanOrEqual(1)
    const plan = importLib.planImport(oldArchive)
    expect(plan.refusals).toEqual([])
    expect(plan.ok).toBe(true)
    expect(plan.inserts['agents']).toBe(1)
    expect(plan.updates['agents']).toBe(2)
  })

  it('inserts a new agent with the integer mark 0 rather than NULL', () => {
    const result = importLib.applyImport(oldArchive)
    expect(result.refusals).toEqual([])
    expect(result.applied).toBe(true)
    expect(agentOf(NEW_AGENT).mark).toBe(0)
  })

  it('updates other columns while keeping stored marks 1 and 0 exactly as they are', () => {
    const plan = importLib.planImport(oldArchive)
    for (const handle of [MARKED, UNMARKED]) {
      const change = plan.rows.find((row) => row.region === 'agents' && row.key === agentOf(handle).id)
      expect(change?.action).toBe('update')
      expect(change?.columns).toContain('name')
      expect(change?.columns).not.toContain('runKeysOnly')
    }
    expect(importLib.applyImport(oldArchive).applied).toBe(true)
    expect(agentOf(MARKED)).toMatchObject({ name: `An archived name for ${MARKED}`, mark: 1 })
    expect(agentOf(UNMARKED)).toMatchObject({ name: `An archived name for ${UNMARKED}`, mark: 0 })
  })

  it('counts inserted defaults and preserved marks together and names the migration in words', () => {
    const plan = importLib.planImport(oldArchive)
    const notes = plan.notes.filter((note) => note.includes('say nothing about the run-keys mark'))
    expect(notes, plan.notes.join('\n')).toHaveLength(1)
    expect(notes[0]).toBe(`${oldAgentRows} agent row(s) say nothing about the run-keys mark, because the archive was written before the migration that added the run-keys mark. 1 new row(s) are inserted with the mark 0, and ${oldAgentRows - 1} existing row(s) keep what is stored.`)
  })

  it('still imports an explicit runKeysOnly: 1 on inserts and updates', () => {
    const plan = importLib.planImport(markedArchive)
    expect(plan.refusals).toEqual([])
    const change = plan.rows.find((row) => row.region === 'agents' && row.key === agentOf(UNMARKED).id)
    expect(change?.columns).toContain('runKeysOnly')
    expect(plan.notes.some((note) => note.includes('say nothing about the run-keys mark'))).toBe(false)
    expect(importLib.applyImport(markedArchive).applied).toBe(true)
    expect(agentOf(EXPLICIT_MARK).mark).toBe(1)
    expect(agentOf(UNMARKED).mark).toBe(1)
  })
})
