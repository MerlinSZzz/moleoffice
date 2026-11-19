// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { madeUpRound } from './round-chapters-fixture.ts'
import { prepareRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import { readRoundChapters, roundChaptersAcknowledgement } from '../src/shared/round-chapters/manifest.ts'
import { fileManifestEvidence, planManifestEvidence, planManifestValue } from '../src/server/db/remint-manifest-evidence.ts'
import { partHashOf } from '../src/server/db/version.ts'
import type { ThePassPlan } from '../src/server/db/remint-history.ts'

function aManifest() {
  const fixture = madeUpRound()
  const { manifest } = prepareRoundChapters({ sandboxDir: fixture.dir, worktree: fixture.worktree, brief: fixture.brief })
  const task = (id: string, kind: 'agent' | 'person') => ({
    task: id, title: 'The old identity is also ordinary text', parent: { kind: 'task' as const, id: 'parent' },
    lines: ['line'], inside: { taken: true, takenBy: { kind, id: 'old-identity' }, takenAt: '2026-01-01', alignment: 'aligned' as const },
    points: [{ id: 'point', number: '1', line: 'line', why: 'old-identity is prose' }], materials: [],
  })
  const value = { ...manifest, delegations: { line: 'line', named: ['first', 'second'], tasks: [task('first', 'agent'), task('second', 'person')] } }
  return value
}

it('keeps the complete original manifest and changes only an agent participant', () => {
  const value = aManifest()
  const before = JSON.stringify(value)
  const plan = planManifestValue(value, new Map([['old-identity', 'new-identity']]))
  expect(plan).not.toBeNull()
  expect(plan!.original_json).toBe(before)
  const after = JSON.parse(plan!.rewritten_json) as typeof value
  expect(after.delegations.tasks[0]!.inside.takenBy).toEqual({ kind: 'agent', id: 'new-identity' })
  expect(after.delegations.tasks[1]!.inside.takenBy).toEqual({ kind: 'person', id: 'old-identity' })
  expect(after).toEqual({ ...value, delegations: { ...value.delegations, tasks: [{ ...value.delegations.tasks[0]!, inside: { ...value.delegations.tasks[0]!.inside, takenBy: { kind: 'agent', id: 'new-identity' } } }, value.delegations.tasks[1]] } })
  expect(plan!.derived_original_ack).toBe(roundChaptersAcknowledgement(readRoundChapters(value)))
  expect(plan!.derived_rewritten_ack).toBe(roundChaptersAcknowledgement(readRoundChapters(after)))
  expect(plan!.derived_rewritten_ack).not.toBe(plan!.derived_original_ack)
  expect(JSON.stringify(value)).toBe(before)
  expect(planManifestValue(value, new Map([['someone-else', 'replacement']]))).toBeNull()
})


it('keeps one full body for two stored-once revisions and the original change side', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    db.exec('CREATE TABLE registry_remint_generations (digest TEXT PRIMARY KEY); CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, data TEXT); CREATE TABLE revisions (id TEXT PRIMARY KEY, record_id TEXT, seq INTEGER, data TEXT, content_hash TEXT, parts TEXT); CREATE TABLE changes (id TEXT PRIMARY KEY, record_id TEXT, field TEXT, old_value TEXT, new_value TEXT)')
    db.exec(readFileSync(new URL('../drizzle/0352_a_remint_keeps_the_manifests_it_rewrites.sql', import.meta.url), 'utf8'))
    const manifest = aManifest()
    const body = planManifestValue(manifest, new Map([['old-identity', 'new-identity']]))!
    const before = { extra: { roundChapters: manifest }, state: 'running' }
    const after = { extra: { roundChapters: JSON.parse(body.rewritten_json) as unknown }, state: 'running' }
    const fragment = { extra: { roundChapters: partHashOf(body.original_json) }, state: 'running' }
    const changedFragment = { extra: { roundChapters: partHashOf(body.rewritten_json) }, state: 'running' }
    const oldHash = '0123456789abcdef'
    const newHash = 'fedcba9876543210'
    db.prepare('INSERT INTO records VALUES (?, ?, ?)').run('record', 'session', JSON.stringify(before))
    const addRevision = db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?, ?, ?)')
    addRevision.run('one', 'record', 1, JSON.stringify(before), oldHash, null)
    addRevision.run('two', 'record', 2, JSON.stringify(fragment), oldHash, JSON.stringify({ 'extra.roundChapters': 1 }))
    db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?)').run('change', 'record', 'data.extra.roundChapters', body.original_json, body.original_json)
    const plan = { writes: { revisions: [
      { id: 'one', set: { data: JSON.stringify(after), content_hash: newHash } },
      { id: 'two', set: { data: JSON.stringify(changedFragment), content_hash: newHash } },
    ], changes: [{ id: 'change', set: { new_value: body.rewritten_json } }] } } as unknown as ThePassPlan
    const evidence = planManifestEvidence(db, { newIds: new Map([['old-identity', 'new-identity']]), underTheRule: () => null }, plan)
    expect(evidence.bodies).toEqual([body])
    expect(evidence.revisions).toHaveLength(2)
    expect(evidence.changes).toHaveLength(1)
    expect(evidence.changes[0]).toMatchObject({ original_value: null, rewritten_value: null, original_manifest_digest: body.original_digest })
    const generation = 'a'.repeat(64)
    db.prepare('INSERT INTO registry_remint_generations VALUES (?)').run(generation)
    db.prepare('UPDATE revisions SET content_hash = ?, data = ? WHERE id = ?').run(newHash, JSON.stringify(after), 'one')
    db.prepare('UPDATE revisions SET content_hash = ?, data = ? WHERE id = ?').run(newHash, JSON.stringify(changedFragment), 'two')
    db.prepare('UPDATE changes SET new_value = ? WHERE id = ?').run(body.rewritten_json, 'change')
    fileManifestEvidence(db, generation, evidence)
    expect(db.prepare('SELECT original_json, rewritten_json FROM registry_remint_manifests').get()).toEqual({ original_json: body.original_json, rewritten_json: body.rewritten_json })
    expect(db.prepare('SELECT COUNT(*) AS n FROM registry_remint_manifest_revisions').get()).toEqual({ n: 2 })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally { db.close() }
})
