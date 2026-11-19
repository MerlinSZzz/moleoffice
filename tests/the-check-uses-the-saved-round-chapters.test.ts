// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { madeUpRound } from './round-chapters-fixture.ts'
import { prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE, saveRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import { roundChaptersText } from '../src/shared/round-chapters/manifest.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let lib: typeof import('../src/server/lib/inspection.ts')
let chapters: typeof import('../src/server/lib/chapters.ts')
let starterHeaders: Record<string, string>
const human = { type: 'human' as const, id: THE_PERSON }
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
  lib = await import('../src/server/lib/inspection.ts'); chapters = await import('../src/server/lib/chapters.ts')
  for (const [handle, role] of [['synthetic-starter', 'supervisor'], ['synthetic-inspector', 'inspector']]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: `Made-up ${role}`, role } })
    expect(r.statusCode, r.body).toBe(201)
  }
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const starter = agentByHandle('synthetic-starter')!
  starterHeaders = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter.id, 'x-mole-office-key': makeAnAgentKey(starter.id, null) }
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starterHeaders, payload: { handle: 'synthetic-worker', name: 'Made-up worker', role: 'worker', workArea: ['src'] } })
  expect(r.statusCode, r.body).toBe(201)
})
afterAll(async () => { await app?.close(); t?.close() })

it('the real readers, reminder obligations and inspector prompt use the snapshot after policy, files, registration and card drift', () => {
  const f = madeUpRound(); const { manifest } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
  const run = t.api.createRecord({ kind: 'session', title: 'Made-up saved reading', workspaceId: 'default', actor: human, origin: 'fixture', data: { state: 'running', servingAgent: 'synthetic-worker', extra: { roundChapters: manifest } } })
  writeFileSync(join(f.worktree, 'src/config/rules/CODE.md'), '# Changed CODE\n## Chapter 99 — DRIFT\nDRIFT\n')
  writeFileSync(join(f.dir, 'briefs/LINE-common.md'), 'CHANGED LOCAL FILE')
  writeFileSync(join(f.dir, ROUND_CHAPTERS_POLICY_FILE), '{broken')
  // The agent's current registration names unrelated chapters; this used to replace the round's obligation.
  const row = t.client.sqlite.prepare('SELECT record_id FROM agent_records ar JOIN agents a ON a.id = ar.agent_id WHERE a.handle = ?').get('synthetic-worker') as { record_id: string }
  t.api.patchRecord(row.record_id, { dataPatch: { mustRead: [{ chapter: 99, level: 'full' }] } }, human)
  const card = vi.spyOn(chapters, 'theCardLineOf').mockReturnValue([{ chapter: 98, level: 'full' }])
  try {
    const obligations = lib.theChaptersARunsAgentMustRead(run)
    expect(obligations.chapters.mustRead).toEqual([{ chapter: 2, level: 'outline' }])
    expect(obligations.onItsCard).toEqual([{ chapter: 2, level: 'outline' }])
    const reads = lib.whatTheInspectorReads(run.id, 'default')
    const current = vi.spyOn(chapters, 'theChapters').mockImplementation(() => { throw new Error('current chapters must not be loaded') })
    try {
      const prompt = lib.assembleTheInspectorsPrompt({ reads, changes: lib.changesInTheWorkArea([], []), workspaceId: 'default' })
      expect(prompt.text).toContain(roundChaptersText(manifest))
      expect(prompt.text).toContain(manifest.brief.text)
      expect(prompt.chaptersAt).toEqual(manifest.chapters.map(({ chapter, level, bytes }) => ({ chapter, level, bytes })))
      for (const omitted of ['CHANGED LOCAL FILE', 'DRIFT', 'chapter 98', 'chapter 99', '## Chapter 5', '## The office regulations, shared chapters by name', 'Precedents of this chapter']) expect(prompt.text).not.toContain(omitted)
      expect(prompt.text).toContain('existing non-rule checks and invariants still apply')
    } finally { current.mockRestore() }
  } finally { card.mockRestore() }
})

it('an unmanifested run retains its card path; damaged manifested runs fail visibly', () => {
  const run = t.api.createRecord({ kind: 'session', title: 'Made-up legacy reading', workspaceId: 'default', actor: human, origin: 'fixture', data: { state: 'running' } })
  const before = lib.theChaptersARunsAgentMustRead(run)
  expect(before.chapters.from).toBe('the role card')
  expect(before.onItsCard).toEqual(chapters.theCardLineOf(null))
  expect(() => lib.theChaptersARunsAgentMustRead({ ...run, data: { extra: { roundChapters: { version: 1 } } } })).toThrow(/Saved round chapters/)
})

it('the real verdict door rejects undelivered chapter claims and keeps an allowed actual reading level', async () => {
  const f = madeUpRound(); const { manifest } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
  const run = historicalSession(t, { kind: 'session', title: 'Made-up finished round', workspaceId: 'default', actor: { type: 'agent', id: 'synthetic-worker' }, data: { state: 'finished', servingAgent: 'synthetic-worker', cutFrom: 'main', tip: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), extra: { roundChapters: manifest } } })
  const asInspector = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'synthetic-inspector' }
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run.id}/assembled`, headers: asInspector, payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const refused = await app.inject({ method: 'POST', url: `/api/checks/${run.id}`, headers: asInspector, payload: { verdict: 'refused', check: 'Synthetic forbidden chapter', missing: ['Synthetic condition'], says: { chapter: 5 }, chaptersRead: [{ chapter: 2, level: 'title' }] } })
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.body).toContain('undelivered CODE chapter 5')
  const released = await app.inject({ method: 'POST', url: `/api/checks/${run.id}`, headers: asInspector, payload: { verdict: 'released', check: 'Synthetic check read the saved chapter title', chaptersRead: [{ chapter: 2, level: 'title' }] } })
  expect(released.statusCode, released.body).toBe(201)
  const body = String(t.api.getRecord(released.json().toTheWorker)!.data['body'])
  expect(body).toContain('Chapters read for this check:')
  expect(body).toContain('title')
  expect(body).not.toContain('at outline')
})

it('a real running run acknowledges the saved selection through existing record and check doors', async () => {
  const f = madeUpRound(); const { manifest } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
  const run = t.api.createRecord({ kind: 'session', title: 'Made-up save acknowledgment', workspaceId: 'default', actor: human, origin: 'fixture', data: { state: 'running', servingAgent: 'synthetic-worker', extra: { retained: true } } })
  const calls: string[] = []
  const notice = await saveRoundChapters({ id: run.id, manifest, request: async (method, path, body) => {
    calls.push(method + ' ' + path)
    const response = await app.inject({ method: method as 'GET' | 'PATCH', url: path, headers: starterHeaders, ...(body === undefined ? {} : { payload: body }) })
    return { status: response.statusCode, body: response.json() }
  } })
  expect(notice).toBeNull()
  expect(calls).toEqual([`GET /api/records/${run.id}`, `PATCH /api/records/${run.id}`, `GET /api/checks/${run.id}`])
  expect(t.api.getRecord(run.id)!.data.extra).toMatchObject({ retained: true })
  const acknowledged = await app.inject({ method: 'GET', url: `/api/checks/${run.id}`, headers })
  const obligations = lib.theChaptersARunsAgentMustRead(t.api.getRecord(run.id)!)
  expect(acknowledged.json().chapters.says).toBe(obligations.chapters.says)
  expect(acknowledged.json().chapters.mustRead).toEqual([{ chapter: 2, level: 'outline' }])
})
