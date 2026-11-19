// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The established presentation and submission pages before their declarations move. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

const pages = ['presentation.md', 'submissions.md'] as const
const fixture = join(process.cwd(), 'tests/fixtures/presentation-archive-before-split')

it('keeps the presentation and submission pages byte for byte for an installation and a project', async () => {
  const t = await freshDb()
  const whole = mkdtempSync(join(tmpdir(), 'presentation-whole-'))
  const scoped = mkdtempSync(join(tmpdir(), 'presentation-project-'))
  try {
    const db = t.client.sqlite
    const stamp = '2026-08-12 10:00:00'
    db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('second', 'Second project', stamp, stamp)
    const intent = db.prepare('INSERT INTO presentation_intent (workspace_id, scope, target, intent, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
    intent.run('second', 'structure', '(scope)', '{"direction":"down"}', stamp, 'human:fixture')
    intent.run('default', 'structure', '(scope)', '{"direction":"right"}', stamp, 'human:fixture')
    db.prepare('INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)').run('default', 'home', '{"columns":2}', stamp, 'human:fixture')
    const baseline = db.prepare('INSERT INTO submission_baselines (run_id, watermark, recovered) VALUES (?, ?, ?)')
    baseline.run('run-z', 21, 'live')
    baseline.run('run-a', null, 'not-recovered')
    db.prepare('INSERT INTO legacy_unsealed_runs (run_id) VALUES (?)').run('run-old')
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(whole)
    writeExport(scoped, { workspaceId: 'default' })
    for (const [scope, root] of [['whole', whole], ['scoped', scoped]]) {
      for (const page of pages) expect(readFileSync(join(root!, page)), `${scope}/${page}`).toEqual(readFileSync(join(fixture, scope!, page)))
      const stale = join(root!, 'schema-parts', 'presentation_intent.md')
      mkdirSync(join(root!, 'schema-parts'), { recursive: true })
      writeFileSync(stale, 'stale copy')
      const report = scope === 'whole' ? writeExport(root!) : writeExport(root!, { workspaceId: 'default' })
      expect(report.removed).toContain('schema-parts/presentation_intent.md')
      expect(existsSync(stale)).toBe(false)
      for (const page of pages) expect(readFileSync(join(root!, page)), `${scope}/${page} after pruning`).toEqual(readFileSync(join(fixture, scope!, page)))
    }
  } finally {
    t.close()
    rmSync(whole, { recursive: true, force: true })
    rmSync(scoped, { recursive: true, force: true })
  }
}, 30000)
