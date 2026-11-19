// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Existing delivery-neighbor pages before their declarations move. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

const pages = ['conversation-reads.md', 'work-claims.md', 'contacts-arranged.md', 'one-press-requests.md'] as const
const fixture = join(process.cwd(), 'tests/fixtures/delivery-neighbors-archive-before-split')

it('keeps delivery-neighbor pages byte for byte across projects and mirror exports', async () => {
  const t = await freshDb()
  const whole = mkdtempSync(join(tmpdir(), 'delivery-whole-'))
  const scoped = mkdtempSync(join(tmpdir(), 'delivery-project-'))
  try {
    const db = t.client.sqlite
    const stamp = '2026-08-12 10:00:00'
    db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('second', 'Second project', stamp, stamp)
    for (const [suffix, workspace] of [['z', 'second'], ['a', 'default']]) {
      db.prepare('INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`read-${suffix}`, workspace, 'agent', `agent-${suffix}`, `agent-${suffix}~person`, `agent-${suffix}`, stamp)
      db.prepare('INSERT INTO work_claims (id, workspace_id, claimant_kind, claimant_id, run, things, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`claim-${suffix}`, workspace, 'agent', `agent-${suffix}`, `run-${suffix}`, '[]', stamp)
      db.prepare('INSERT INTO contact_groups (id, owner_kind, owner_id, key, name, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`contact-group-${suffix}`, 'agent', `agent-${suffix}`, `group-${suffix}`, 'A group', 1, stamp)
      db.prepare('INSERT INTO contact_placements (id, owner_kind, owner_id, contact, group_key, at, placed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`placement-${suffix}`, 'agent', `agent-${suffix}`, `contact-${suffix}`, `group-${suffix}`, 1, stamp)
      db.prepare('INSERT INTO contact_group_collapses (id, owner_kind, owner_id, group_key, collapsed, set_at) VALUES (?, ?, ?, ?, ?, ?)').run(`collapse-${suffix}`, 'agent', `agent-${suffix}`, `group-${suffix}`, 1, stamp)
      db.prepare('INSERT INTO one_press_requests (id, workspace_id, act, inputs, asked_by, shows, state, asked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`request-${suffix}`, workspace, 'fixture', '{}', `agent-${suffix}`, 'A request', 'waiting', stamp)
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
    const stale = join(whole, 'schema-parts', 'work_claims.md')
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
