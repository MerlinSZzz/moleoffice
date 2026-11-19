// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/** Synthetic run observations. Elapsed time does not establish active or waiting coverage. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { buildSync } from 'esbuild'
import { clockStamp, elapsedSeconds, type ClockStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { outputTiming } from '../src/worker/timing.ts'
import { apiApp, freshDb, theAnswerToAWriteInATestOffice, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const originalTZ = process.env.TZ
let db: TestDb
let app: FastifyInstance
let output: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function post(url: string, payload: object) {
  const reply = await app.inject({ method: 'POST', url, headers, payload })
  if (url === '/api/records') expect(reply.statusCode, reply.body).toBe(theAnswerToAWriteInATestOffice(headers, payload))
  else expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json()
}

beforeAll(async () => {
  process.env.TZ = 'Europe/London'
  db = await freshDb()
  app = (await apiApp()).app
  supplyRuntimeSubmissions(db, app)
  await app.listen({ host: '127.0.0.1', port: 0 })
  output = mkdtempSync(join(tmpdir(), 'mole-office-flow-clock-'))
  settings = {
    api: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`,
    workspace: 'default', session: null, stopWithPid: null,
    checkout: aCheckoutForATestRun(), runs: 1, hops: 3, outputRoot: output,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs') },
  }
})

afterAll(async () => {
  for (const run of watching) run.adapter.stop(run.handle, 'flow clock test teardown')
  if (app) await app.close()
  if (db) db.close()
  if (output) rmSync(output, { recursive: true, force: true })
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

describe('elapsed evidence comes from instants', () => {
  it('keeps elapsed, observed active, observed wait and missing coverage separate in the browser', async () => {
    // Synthetic interval evidence, not a claim that the current worker observes active/wait spans.
    const evidence = {
      start: '2026-10-25T01:30:00.000+01:00', end: '2026-10-25T01:30:00.000+00:00',
      active: [{ start: '2026-10-25T01:30:00.000+01:00', end: '2026-10-25T01:45:00.000+01:00' }],
      wait: [{ start: '2026-10-25T01:45:00.000+01:00', end: '2026-10-25T01:50:00.000+01:00' }],
      coverage: 'incomplete',
    }
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ timezoneId: 'America/New_York' })
      const bundle = buildSync({ entryPoints: ['src/shared/time.ts'], bundle: true, write: false, format: 'iife', globalName: 'clockCode' })
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
      const read = await page.evaluate(evidence => {
        const clock = (globalThis as unknown as { clockCode: typeof import('../src/shared/time.ts') }).clockCode
        return {
          elapsed: clock.elapsedSeconds(evidence.start, evidence.end),
          active: evidence.active.map(interval => clock.elapsedSeconds(interval.start, interval.end)),
          wait: evidence.wait.map(interval => clock.elapsedSeconds(interval.start, interval.end)),
          coverage: evidence.coverage,
        }
      }, evidence)
      expect(read).toEqual({ elapsed: 3600, active: [900], wait: [300], coverage: 'incomplete' })
      expect(read.elapsed - read.active[0]! - read.wait[0]!).toBe(2400)
      // The unobserved forty minutes are not assigned to either active work or waiting.
    } finally { await browser.close() }
  })

  it('preserves discovery source instants and clears a companion when only wall time remains', async () => {
    const sessions = await import('../src/server/lib/sessions.ts')
    // THE FOLDER THE CONVERSATION RAN IN IS THIS TEST'S OWN, and the test project holds it: discovery files a
    // conversation into the project that holds its working directory (problem kDKj9iXd4Vft).
    await theProjectHoldsThisFolder('default', output)
    const home = join(output, 'synthetic-home')
    const logs = join(home, '.claude', 'projects', 'synthetic-clock-project')
    mkdirSync(logs, { recursive: true })
    const externalId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const path = join(logs, `${externalId}.jsonl`)
    const write = (timestamp: string) => writeFileSync(path, JSON.stringify({
      type: 'assistant', timestamp, cwd: output,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Synthetic clock observation' }] },
    }) + '\n')
    const env = {
      homeDir: home, now: new Date('2026-10-25T02:00:00Z'),
      scanProcesses: () => ({ ok: true as const, processes: [] }),
      runningWithinSeconds: 300, orphanAfterSeconds: 21_600,
    }
    const actor = { type: 'agent' as const, id: 'clock-discovery-fixture' }
    const data = () => {
      const view = sessions.listSessions('default', env).find(one => one.externalId === externalId)!
      return db.api.getRecord(view.recordId!)!.data
    }
    write('2026-10-25T00:30:00Z')
    sessions.syncSessions(actor, 'default', env, join(home, 'no-hook-notes'))
    expect((data().lastOutputTime as ClockStamp).instant).toBe('2026-10-25T01:30:00.000+01:00')
    write('2026-10-25T01:30:00Z')
    sessions.syncSessions(actor, 'default', env, join(home, 'no-hook-notes'))
    expect(data().lastOutputAt).toBe('2026-10-25 01:30:00')
    expect((data().lastOutputTime as ClockStamp).instant).toBe('2026-10-25T01:30:00.000+00:00')
    expect(data().lastOutputTimeSource).toBe('transcript-timestamp')
    write('2026-10-25 01:30:00')
    sessions.syncSessions(actor, 'default', env, join(home, 'no-hook-notes'))
    expect(data().lastOutputAt).toBe('2026-10-25 01:30:00')
    expect(data()).not.toHaveProperty('lastOutputTime')
    expect(data()).not.toHaveProperty('lastOutputTimeSource')
  })

  it('measures the repeated hour and refuses local-only or reversed inputs', () => {
    const first = clockStamp(() => '2026-10-25T00:30:00Z')
    const second = clockStamp(() => '2026-10-25T01:30:00Z')
    expect(first.stamp).toBe(second.stamp)
    expect(elapsedSeconds(first.instant, second.instant)).toBe(3600)
    expect(() => elapsedSeconds(first.stamp, second.stamp)).toThrow(/explicit timezone offset/)
    expect(() => elapsedSeconds(second.instant, first.instant)).toThrow(/clock moved backward/)
    expect(elapsedSeconds(first.instant, first.instant)).toBe(0)
    expect(elapsedSeconds('2026-01-01T00:00:00.125Z', '2026-01-01T00:00:00.875Z')).toBe(0.75)
  })

  it('keeps output file instants without inventing evidence for absent or empty output', () => {
    const path = join(output, 'synthetic-output.txt')
    expect(outputTiming(path)).toEqual({})
    writeFileSync(path, '')
    expect(outputTiming(path)).toEqual({})
    writeFileSync(path, 'synthetic output\n')
    const instant = new Date('2026-10-25T01:30:00Z')
    utimesSync(path, instant, instant)
    const patch = outputTiming(path)
    expect(patch.lastOutputAt).toBe('2026-10-25 01:30:00')
    expect((patch.lastOutputTime as ClockStamp).instant).toBe('2026-10-25T01:30:00.000+00:00')
    expect(patch).not.toHaveProperty('activeSeconds')
    expect(patch).not.toHaveProperty('waitSeconds')
  })

  it('stores worker start, output and answer pairs that a browser can read in another zone', async () => {
    await post('/api/records', { kind: 'agent', title: 'Synthetic clock worker', data: { handle: 'flow-clock-fixture', state: 'active', runtime: 'claude-code' } })
    const participants = (await app.inject({ url: '/api/participants', headers })).json()
    const agent = participants.agents.find((one: { handle: string }) => one.handle === 'flow-clock-fixture')
    const message = await post('/api/records', { kind: 'message', title: 'Synthetic clock request', data: { body: 'Please read record aaaaaaaaaaaa and say what it is.', to: [{ kind: 'agent', id: agent.id }] } })
    await post(`/api/messages/${message.record.id}/start-an-agent`, {})
    const began = await onePass(settings, watching)
    expect(began.started).toHaveLength(1)
    const session = began.started[0]!.session
    const limit = Date.now() + 20_000
    let answered = false
    while (Date.now() < limit) {
      const pass = await onePass(settings, watching)
      if (pass.answered.length > 0) { answered = true; break }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    expect(answered).toBe(true)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ timezoneId: 'America/New_York' })
      await page.goto(`${settings.api}/health`)
      const bundle = buildSync({ entryPoints: ['src/shared/time.ts'], bundle: true, write: false, format: 'iife', globalName: 'clockCode' })
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
      const read = await page.evaluate(async ({ session, headers }) => {
        const reply = await fetch(`/api/records/${session}`, { headers })
        if (!reply.ok) throw new Error(`Reading the run failed: ${reply.status}`)
        const data = (await reply.json()).record.data
        const clock = (globalThis as unknown as { clockCode: typeof import('../src/shared/time.ts') }).clockCode
        return { data, elapsed: clock.elapsedSeconds(data.startedTime.instant, data.answeredTime.instant), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      }, { session, headers })
      expect(read.zone).toBe('America/New_York')
      for (const field of ['started', 'lastOutput', 'answered']) {
        expect(read.data[`${field}At`]).toBe(read.data[`${field}Time`].stamp)
        expect(read.data[`${field}Time`].timeZone).toBe('Europe/London')
        expect(read.data[`${field}Time`].instant).toMatch(/[+-]\d{2}:\d{2}$/)
      }
      expect(read.elapsed).toBeGreaterThanOrEqual(0)
      expect(read.data).not.toHaveProperty('activeSeconds')
      expect(read.data).not.toHaveProperty('waitSeconds')
    } finally { await browser.close() }
  })
})
