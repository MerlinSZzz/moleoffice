// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Explicit fixture adapters for old attachment observations and new fake-runtime completions.
 * Neither adapter is installed by the general test harness or used by production.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { theVerdictsApart, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import type { TracedChange } from '../src/shared/releasing.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** Item 6 step 3 of a decision; oj9CRzzB2_8m; chapter 7 rule 5: explicit synthetic permission for
 * existing fixtures. */
export function syntheticTrace(t: TestDb, paths: string[]): TracedChange[] {
  if (paths.length === 0) return []
  const said = `Synthetic permission for the test to change ${paths.join(', ')}.`
  const record = t.api.createRecord({ kind: 'note', title: 'Synthetic permission for inspection fixtures',
    summary: said, origin: 'fixture', workspaceId: 'default', data: {}, actor: { type: 'human', id: THE_PERSON } })
  return [{ paths, to: record.id, how: "the person's word", said }]
}

/** A historical fixture, with its original data and assertions, explicitly inventoried. */
export function historicalSession(t: TestDb, input: Parameters<TestDb['api']['createRecord']>[0]) {
  const data = (input.data ?? {}) as Record<string, unknown>
  const open: Record<string, unknown> = { ...data, state: 'running' }; delete open['closedHow']
  const made = t.api.createRecord({ ...input, origin: 'fixture', data: theVerdictsApart(open).rest })
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
  // The ordinary writer keeps revision evidence current; no route-level automatic check is fired. A verdict the fixture
  // carries is written as its own door writes it, since an ordinary write of one is refused.
  const { verdicts, rest } = theVerdictsApart(data)
  t.api.patchRecord(made.id, { dataPatch: rest }, input.actor)
  writeAVerdictAsItsDoorWould(t, made.id, verdicts)
  return t.api.getRecord(made.id)!
}

/** New fake-runtime runs submit a real fixture completion note through the real finish writer.
 * The worker files its conversational answer after finishing, so the note is explicitly a fixture
 * receipt of the exit, not a claim to hold the answer or a Git submission from this source tree.
 */
export function supplyRuntimeSubmissions(t: TestDb, app: FastifyInstance): void {
  app.addHook('preHandler', async (request) => {
    const payload = request.body as { dataPatch?: Record<string, unknown> } | undefined
    const id = /^\/api\/records\/([^/]+)$/u.exec(request.url)?.[1]
    if (request.method !== 'PATCH' || !id || payload?.dataPatch?.['state'] !== 'finished' || payload.dataPatch['submission']) return
    const run = t.api.getRecord(id)
    if (!run || run.kind !== 'session') return
    const worker = (await import('../src/server/lib/inspection.ts')).theAgentOfARun(run)
    if (!worker) return
    if (!worker.workArea?.length) {
      const mapping = t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(worker.id) as { id: string }
      t.api.patchRecord(mapping.id, { dataPatch: { workArea: ['records'] } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    }
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic runtime completed', summary: String(payload.dataPatch['doing'] ?? 'The fake runtime ended.'), workspaceId: run.workspaceId, origin: 'fixture', data: {}, actor: { type: 'agent', id: 'fixture-runtime', sessionId: id } })
    payload.dataPatch['submission'] = { kind: 'records', records: [record.id] }
  })
}
