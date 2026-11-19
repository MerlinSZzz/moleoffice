// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The established visitor pages, captured before their declarations move. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

const pages = ['participants.md', 'worlds.md'] as const
const fixture = join(process.cwd(), 'tests/fixtures/visitors-archive-before-split')

it('keeps the visitor archive pages byte for byte, including a project view', async () => {
  const t = await freshDb()
  const whole = mkdtempSync(join(tmpdir(), 'visitors-whole-'))
  const scoped = mkdtempSync(join(tmpdir(), 'visitors-project-'))
  try {
    const db = t.client.sqlite
    const stamp = '2026-08-12 10:00:00'
    db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('second', 'Second project', stamp, stamp)
    db.prepare("UPDATE installation SET id = 'installation-fixture', how = 'fixture', written_at = ?").run(stamp)
    db.prepare("UPDATE people SET created_at = ?, home_world = 'world-a', home_installation = 'installation-fixture', citizen_since = ?").run(stamp, stamp)
    db.pragma('foreign_keys = OFF')
    db.prepare("UPDATE assets SET id = 'fixture-avatar' WHERE id = (SELECT avatar_asset_id FROM agents LIMIT 1)").run()
    db.prepare("UPDATE agents SET id = 'fixture-office', avatar_asset_id = 'fixture-avatar', created_at = ?, home_world = 'world-a', home_installation = 'installation-fixture', citizen_since = ?").run(stamp, stamp)
    db.pragma('foreign_keys = ON')
    db.prepare('UPDATE measure_words_renamed SET renamed_at = ?').run(stamp)
    db.prepare('DELETE FROM worlds').run()
    const world = db.prepare('INSERT INTO worlds (id, name, kind, database_identity, standing, born_at, installation) VALUES (?, ?, ?, ?, ?, ?, ?)')
    world.run('world-z', 'Second world', 'test', 'db-z', 'live', stamp, 'installation-fixture')
    world.run('world-a', 'First world', 'test', 'db-a', 'live', stamp, 'installation-fixture')
    db.prepare('INSERT INTO visits (id, visitor_kind, visitor_id, from_world, to_world, since, why, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('visit-a', 'agent', 'fixture-agent', 'world-z', 'world-a', stamp, 'A visit', stamp)
    db.prepare('INSERT INTO visitor_credentials (id, handle, name, role, token_hash, machine_how, standing, ends_at, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('credential-a', 'fixture-visitor', 'Fixture visitor', 'worker', 'fake-token-hash-not-for-export', 'fixture', 'waiting', '2026-09-12 10:00:00', stamp)
    db.prepare('INSERT INTO trusted_machines (id, address, how, added_at) VALUES (?, ?, ?, ?)').run('machine-a', 'fixture.invalid', 'fixture', stamp)
    db.prepare('INSERT INTO visitor_requests (id, credential_id, at, method, route, wrote) VALUES (?, ?, ?, ?, ?, ?)').run('request-a', 'credential-a', stamp, 'GET', '/fixture', 0)
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(whole)
    writeExport(scoped, { workspaceId: 'default' })
    for (const [scope, root] of [['whole', whole], ['scoped', scoped]]) {
      for (const page of pages) {
        expect(readFileSync(join(root!, page)), `${scope}/${page}`).toEqual(readFileSync(join(fixture, scope!, page)))
      }
    }
    expect(readFileSync(join(whole, 'worlds.md'), 'utf8')).not.toContain('fake-token-hash-not-for-export')
    mkdirSync(join(whole, 'schema-parts'), { recursive: true })
    const stale = join(whole, 'schema-parts', 'worlds.md')
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
