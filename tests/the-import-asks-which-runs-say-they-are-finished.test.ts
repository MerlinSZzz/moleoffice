// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPORT LISTS A RUN AS LEGACY UNSEALED ONLY WHEN `aRunSaysItIsFinished` SAYS IT IS FINISHED.
 *
 * An archive from before the seal has no submission baselines. So `applyImport` lists each finished run in it
 * that has no seal in `legacy_unsealed_runs`, and the office then reads that run as finished before the seal
 * existed. Which runs count as finished is 13n's rule, `aRunSaysItIsFinished` in src/shared/releasing.ts. The
 * import used to hold its own copy of that rule in SQL: a run whose state is finished, or whose close is
 * agent-said. On 24 October 2026 13n's round Q changed the rule (problem zv-Z5SMF_bst). A close counts as the
 * finish only while the row says running, idle or nothing of its state. The copy did not change, so the import
 * still listed a crashed run with an agent-said close. Item 18 of round 111 makes the import ask the function.
 *
 * Every case below is synthetic. The archive holds one session row for each state in SESSION_STATES, and one with
 * no state, and each of them once for each close in CLOSED_HOW and once with no close. None of these has a seal or
 * a baseline. The list the import should write is worked out by calling the function on what the import wrote, so
 * this test copies neither the states nor the rule. Two more runs say they are finished and are still not listed:
 * one has a `sealedTip`, and one has a baseline.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SESSION_STATES } from '../src/shared/types.ts'
import { CLOSED_HOW } from '../src/shared/lifecycle.ts'
import { aRunSaysItIsFinished } from '../src/shared/releasing.ts'
import { freshDb, type TestDb } from './helpers.ts'

const actor = { type: 'agent' as const, id: 'legacy-import-fixture' }
let source: TestDb, restored: TestDb, archive: string
const cases: { id: string; state: string | undefined; closedHow: string | undefined }[] = []
let sealed: string, withABaseline: string, listed: string[]

const dataOf = (id: string): Record<string, unknown> =>
  JSON.parse((restored.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)

beforeAll(async () => {
  source = await freshDb()
  const make = (title: string, data: Record<string, unknown>): string =>
    source.api.createRecord({ kind: 'session', title, data, workspaceId: 'default', actor, origin: 'fixture' }).id
  // A RUN WITH A BASELINE, which the office's trigger writes when the run is filed.
  withABaseline = make('Synthetic run with a baseline', { state: 'finished' })
  // AN ARCHIVE FROM BEFORE THE SEAL for every other run. Its office had no baseline trigger, so no run below has one.
  source.client.sqlite.exec('DROP TRIGGER submission_run_baseline')
  for (const state of [...SESSION_STATES, undefined]) {
    for (const closedHow of [...CLOSED_HOW, undefined]) {
      const data: Record<string, unknown> = state === undefined ? {} : { state }
      if (closedHow !== undefined) Object.assign(data, { closedHow, closedAt: '2026-10-24 22:00:00', closedBecause: 'A synthetic close for this test.' })
      cases.push({ id: make(`Synthetic run, state ${state ?? 'absent'}, close ${closedHow ?? 'absent'}`, data), state, closedHow })
    }
  }
  // A RUN WITH A SEAL. The office writes `sealedTip` only when a run finishes, so it is written here as raw
  // storage, the way an older office left it. This test never reads where it points.
  sealed = make('Synthetic sealed run', { state: 'finished', closedHow: 'agent-said', closedAt: '2026-10-24 22:00:00', closedBecause: 'A synthetic close for this test.' })
  source.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sealedTip', 'synthetic-seal') WHERE id = ?").run(sealed)
  archive = mkdtempSync(join(tmpdir(), 'mole-office-legacy-import-'))
  ;(await import('../src/server/lib/export.ts')).writeExport(archive)
  restored = await freshDb()
  expect((await import('../src/server/lib/import.ts')).applyImport(archive).applied).toBe(true)
  listed = (restored.client.sqlite.prepare('SELECT run_id FROM legacy_unsealed_runs').all() as { run_id: string }[]).map((row) => row.run_id).sort()
}, 60_000)

afterAll(() => {
  restored?.close()
  source?.close()
  if (archive) rmSync(archive, { recursive: true, force: true })
})

it('lists exactly the runs that aRunSaysItIsFinished says are finished, over every state and close', () => {
  // Each case came back with the state and close it was written with, so the cases cover every pair.
  expect(cases.map((one) => [dataOf(one.id)['state'], dataOf(one.id)['closedHow']])).toEqual(cases.map((one) => [one.state, one.closedHow]))
  const finished = cases.filter((one) => aRunSaysItIsFinished(dataOf(one.id))).map((one) => one.id).sort()
  // The cases split both ways, so the list below says something about each side.
  expect(finished.length).toBeGreaterThan(0)
  expect(finished.length).toBeLessThan(cases.length)
  expect(listed).toEqual(finished)
})

it('does not list a crashed run with an agent-said close', () => {
  expect(SESSION_STATES).toContain('crashed')
  const crashed = cases.find((one) => one.state === 'crashed' && one.closedHow === 'agent-said')!
  expect(dataOf(crashed.id)).toMatchObject({ state: 'crashed', closedHow: 'agent-said' })
  // 13n's rule, on the base this round stands on: the row says the run crashed, so its close is not its finish.
  expect(aRunSaysItIsFinished(dataOf(crashed.id))).toBe(false)
  expect(listed).not.toContain(crashed.id)
})

it('does not list a run with a sealedTip, though it says it is finished', () => {
  expect(dataOf(sealed)['sealedTip']).toBe('synthetic-seal')
  expect(aRunSaysItIsFinished(dataOf(sealed))).toBe(true)
  expect(listed).not.toContain(sealed)
})

it('does not list a run with a baseline, though it says it is finished', () => {
  expect(restored.client.sqlite.prepare('SELECT run_id FROM submission_baselines WHERE run_id = ?').get(withABaseline)).toEqual({ run_id: withABaseline })
  expect(aRunSaysItIsFinished(dataOf(withABaseline))).toBe(true)
  expect(listed).not.toContain(withABaseline)
})
