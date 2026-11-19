// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Existing resource and source pages before their declarations move. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

const pages = ['resources.md', 'code.md', 'observations/2026-08-12.md'] as const
const fixture = join(process.cwd(), 'tests/fixtures/source-archive-before-split')

it('keeps resource and source pages byte for byte across projects and mirror exports', async () => {
  const t = await freshDb()
  const whole = mkdtempSync(join(tmpdir(), 'source-whole-'))
  const scoped = mkdtempSync(join(tmpdir(), 'source-project-'))
  try {
    const db = t.client.sqlite
    const stamp = '2026-08-12 10:00:00'
    db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('second', 'Second project', stamp, stamp)
    for (const [suffix, workspace] of [['z', 'second'], ['a', 'default']]) {
      db.prepare("INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, 'fixture-owner', 'note', ?, '{}', ?, ?)").run(`record-${suffix}`, workspace, `Work ${suffix}`, stamp, stamp)
      db.prepare('INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`resource-${suffix}`, workspace, `record-${suffix}`, 'fixture', `key-${suffix}`, 'A resource', stamp, 'agent:fixture')
      db.prepare('INSERT INTO repositories (id, workspace_id, name, root, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`repo-${suffix}`, workspace, `Repository ${suffix}`, `/fixture/${suffix}`, stamp, stamp, 'agent:fixture')
      db.prepare('INSERT INTO implementation_revisions (id, workspace_id, repository_id, ref, stated_at, stated_by) VALUES (?, ?, ?, ?, ?, ?)').run(`revision-${suffix}`, workspace, `repo-${suffix}`, `ref-${suffix}`, stamp, 'agent:fixture')
      db.prepare('INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, revision_id, stated_at, stated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`map-${suffix}`, workspace, `record-${suffix}`, `repo-${suffix}`, `src/${suffix}.ts`, 'implements', 'stated', `revision-${suffix}`, stamp, 'agent:fixture')
      db.prepare('INSERT INTO file_observations (id, workspace_id, scan_id, repository_id, path, change, seen_at, first_scan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`observation-${suffix}`, workspace, `scan-${suffix}`, `repo-${suffix}`, `src/${suffix}.ts`, 'added', stamp, 1)
      db.prepare('INSERT INTO source_files (workspace_id, repository_id, path, language, size_bytes, lines, imports, exports, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(workspace, `repo-${suffix}`, `derived-sentinel-${suffix}`, 'ts', 1, 1, '[]', '[]', stamp)
      db.prepare('INSERT INTO source_index (workspace_id, repository_id, built_at, built_by, root, scan_ms, skipped) VALUES (?, ?, ?, ?, ?, ?, ?)').run(workspace, `repo-${suffix}`, stamp, 'fixture', '/fixture', 1, '[]')
      db.prepare('INSERT INTO source_file_hashes (workspace_id, repository_id, path, hash, built_at) VALUES (?, ?, ?, ?, ?)').run(workspace, `repo-${suffix}`, `derived-sentinel-${suffix}`, 'hash', stamp)
      db.prepare('INSERT INTO implementation_findings (id, workspace_id, record_id, repository_id, path, relation, provenance, evidence_path, evidence_detail, built_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`finding-${suffix}`, workspace, `record-${suffix}`, `repo-${suffix}`, `derived-sentinel-${suffix}`, 'implements', 'stated', 'fixture', 'fixture', stamp)
    }
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(whole)
    writeExport(scoped, { workspaceId: 'default' })
    for (const [scope, root] of [['whole', whole], ['scoped', scoped]]) {
      for (const page of pages) {
        expect(readFileSync(join(root!, page)), `${scope}/${page}`).toEqual(readFileSync(join(fixture, scope!, page)))
        expect(readFileSync(join(root!, page), 'utf8')).not.toContain('derived-sentinel')
      }
    }
    mkdirSync(join(whole, 'schema-parts'), { recursive: true })
    const stale = join(whole, 'schema-parts', 'implementation_map.md')
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
