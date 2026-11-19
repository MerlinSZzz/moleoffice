// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Established work and readiness pages before their declarations move. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

const pages = ['folder-readings.md', 'tool-uses.md', 'test-file-runs.md', 'handovers.md', 'signing-packages.md', 'readiness-checklists.md'] as const
const fixture = join(process.cwd(), 'tests/fixtures/readiness-archive-before-split')

it('keeps work and readiness pages byte for byte across projects and mirror exports', async () => {
  const t = await freshDb()
  const whole = mkdtempSync(join(tmpdir(), 'readiness-whole-'))
  const scoped = mkdtempSync(join(tmpdir(), 'readiness-project-'))
  try {
    const db = t.client.sqlite
    const stamp = '2026-08-12 10:00:00'
    db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('second', 'Second project', stamp, stamp)
    for (const [suffix, workspace] of [['z', 'second'], ['a', 'default']]) {
      db.prepare('INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`use-${suffix}`, workspace, `run-${suffix}`, 1, stamp, 'fixture', 'A use')
      db.prepare('INSERT INTO test_file_runs (id, workspace_id, use_id, file, result) VALUES (?, ?, ?, ?, ?)').run(`test-${suffix}`, workspace, `use-${suffix}`, `${suffix}.test.ts`, 'passed')
      db.prepare('INSERT INTO handovers (id, agent_id, workspace_id, text, written_at, written_by_kind, written_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`handover-${suffix}`, `agent-${suffix}`, workspace, 'A handover', stamp, 'agent', `agent-${suffix}`)
      db.prepare('INSERT INTO readiness_checklists (id, workspace_id, operation, inputs, on_what, shows, level, signers, raised_by_kind, raised_by_id, state, raised_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`check-${suffix}`, workspace, 'fixture', '{}', `target-${suffix}`, 'A checklist', 'a-group', '[]', 'agent', `agent-${suffix}`, 'waiting', stamp, '2026-09-12 10:00:00')
      db.prepare('INSERT INTO readiness_signatures (id, checklist_id, signer_kind, signer_id, on_what, signed_at) VALUES (?, ?, ?, ?, ?, ?)').run(`signature-${suffix}`, `check-${suffix}`, 'agent', `agent-${suffix}`, `target-${suffix}`, stamp)
      db.prepare('INSERT INTO signing_packages (id, workspace_id, brought_by, for_agent, task, state, brought_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`package-${suffix}`, workspace, 'agent-a', `agent-${suffix}`, 'A task', 'waiting', stamp)
      db.prepare('INSERT INTO signing_package_items (id, package_id, position, act, inputs, why, shows, changes, undone, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`item-${suffix}`, `package-${suffix}`, 1, 'fixture', '{}', 'A reason', 'A choice', 'A change', 'A reversal', 'waiting')
      db.prepare('INSERT INTO folder_readings (id, workspace_id, owner_id, folder, read_by, pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`folder-${suffix}`, workspace, `owner-${suffix}`, `/fixture/${suffix}`, `agent-${suffix}`, '[]', stamp, stamp)
    }
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(whole)
    writeExport(scoped, { workspaceId: 'default' })
    for (const [scope, root] of [['whole', whole], ['scoped', scoped]]) {
      for (const page of pages) {
        expect(readFileSync(join(root!, page)), `${scope}/${page}`).toEqual(readFileSync(join(fixture, scope!, page)))
      }
    }
    mkdirSync(join(whole, 'schema-parts'), { recursive: true })
    const stale = join(whole, 'schema-parts', 'tool_uses.md')
    writeFileSync(stale, 'stale copy')
    writeExport(whole)
    expect(existsSync(stale)).toBe(false)
    for (const page of pages) expect(readFileSync(join(whole, page))).toEqual(readFileSync(join(fixture, 'whole', page)))
  } finally {
    t.close()
    rmSync(whole, { recursive: true, force: true })
    rmSync(scoped, { recursive: true, force: true })
  }
}, 30000)
