// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN THAT REACHES THE TOKEN SETTING IS REMINDED OF ITS STEP AT THE OFFICE'S NEXT PASS (wave 14d, package RM, clause
 * RM-3).
 *
 * A worker of the office starts a run, and the run prints its tokens as it goes. The worker reads them while the run
 * runs and writes them on the run's record (recordTheTokensSoFar in src/worker/index.ts), and the office's step
 * reminder (src/server/lib/step-reminders.ts) reads the record. The count crosses the setting, and the reminder comes
 * at the office's first pass after it. The wait is measured and printed.
 *
 * The worker's write rules are held here as well:
 *   - the first count is written at once;
 *   - a count is written only when it has grown by 10,000 or more and five minutes have passed since the last write;
 *   - a count that reaches the setting is written at once, whatever it grew by and however soon after the last write.
 * The 10,000 tokens and the five minutes are written as numbers here, because they are the rules this test holds.
 * The setting is read where the office defines it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The worker's pass, the office and the step reminder are the product's, on a test office. The run is a STAND-IN
 * script made by this file, started by the worker as its fake runtime. It runs no model, and every count it prints is
 * made up. It prints each line this test puts in its folder, and it ends by itself after two minutes. The worker's
 * clock (`Date.now`) is moved forward by this test, so the worker's 30 seconds between readings and five minutes
 * between writes pass at once. The run is real time throughout, so the step's 45 minutes do not pass.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. The worker never writes at once at a crossing. The count stays below the setting on the record, and the case
 *      goes red at the reminder.
 *   2. The worker writes a count grown by 10,000 without waiting five minutes. The case goes red at the held count.
 *   3. The worker writes any changed count once five minutes have passed. The case goes red at the last count.
 */

import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TOKENS_COUNTED } from '../src/config/tokens-so-far.mjs'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import type { StepReminderMark } from '../src/server/lib/step-reminders.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const WORKSPACE = 'default'
const THE_LINE = SYSTEM_LINES.aStepReminder('').line
/** Before every record of this file, so the run's steps are all recorded while the office watches. */
const WATCHING_SINCE = new Date(Date.now() - 60_000)

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let stepReminders: typeof import('../src/server/lib/step-reminders.ts')
let env: typeof import('../src/server/db/env.ts')
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** The data on one run's record. */
async function theRecordOf(session: string): Promise<Record<string, unknown>> {
  const read = await get(`/api/records/${session}`)
  return ((read['record'] ?? read) as { data: Record<string, unknown> }).data
}

/** The stand-in: it names a made-up conversation, then prints each numbered line put in its folder, in order. */
function aStandIn(folder: string): string {
  const script = join(folder, 'a-run-that-spends-tokens.mjs')
  writeFileSync(
    script,
    `// A stand-in for a runtime, made by a test. It runs no model, and its counts are made up.\n` +
      `import { existsSync, readFileSync } from 'node:fs'\n` +
      `process.stdout.write(JSON.stringify({ conversation: 'made-up-tokens-run' }) + '\\n')\n` +
      `let next = 1\n` +
      `const began = Date.now()\n` +
      `setInterval(() => {\n` +
      `  const file = ${JSON.stringify(folder)} + '/' + next + '.json'\n` +
      `  if (existsSync(file)) { process.stdout.write(readFileSync(file, 'utf8').trim() + '\\n'); next += 1 }\n` +
      `  if (Date.now() - began > 120_000) process.exit(0)\n` +
      `}, 20)\n`,
  )
  return script
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-tokens-reach-the-setting-'))
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  stepReminders = await import('../src/server/lib/step-reminders.ts')
  env = await import('../src/server/db/env.ts')
}, 60_000)

afterAll(async () => {
  vi.restoreAllMocks()
  // Whatever is still going, stopped by the group its handle wrote down.
  for (const run of watching) {
    try {
      process.kill(-run.handle.pgid, 'SIGKILL')
    } catch {
      continue
    }
  }
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('a run that reaches the token setting', () => {
  it('has its count written at once, and is reminded at the office pass after it', async () => {
    const N = env.stepReminderTokens()
    const lines = join(scratch, 'lines')
    mkdirSync(lines)
    const settings: WorkerSettings = {
      api,
      workspace: WORKSPACE,
      session: null,
      stopWithPid: null,
      checkout: aCheckoutForATestRun(),
      runs: 4,
      hops: 3,
      outputRoot: mkdtempSync(join(scratch, 'outputs-')),
      env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: aStandIn(lines) },
    }
    const handle = 'spends-tokens'
    await post('/api/records', { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
    const filed = await post('/api/records', { kind: 'message', title: `a message to ${handle}`, data: { body: 'please work on something long', to: [{ kind: 'agent', id: agentId }] } })
    await post(`/api/messages/${(filed['record'] as { id: string }).id}/start-an-agent`, {})
    const session = one((await onePass(settings, watching)).started, `the run started for ${handle}`).session
    const run = one(watching.filter((one) => one.session === session), 'the watched run')

    // THE WORKER'S CLOCK, moved forward by this test.
    const realNow = Date.now.bind(Date)
    let ahead = 0
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + ahead)
    const aReadingAfter = async (seconds: number) => {
      ahead += seconds * 1_000
      await onePass(settings, watching)
    }
    const theCountOnTheRecord = async () => (await theRecordOf(session))['tokensSoFar']
    const anOfficePass = () => stepReminders.sendTheStepRemindersThatAreDue(WORKSPACE, new Date(Date.now()), WATCHING_SINCE).filter((one) => one === session)
    let printed = 0
    let total = 0
    /** The run prints one answer's tokens, and the worker's adapter can read them; how long that took, in ms. */
    const theRunPrints = async (tokens: { input: number; cacheWrites: number; cacheReads: number; output: number }) => {
      printed += 1
      total += tokens.input + tokens.cacheWrites + tokens.output
      writeFileSync(join(lines, `${printed}.tmp`), JSON.stringify({ tokens }))
      renameSync(join(lines, `${printed}.tmp`), join(lines, `${printed}.json`))
      for (let tries = 0; tries < 500 && run.adapter.tokensSoFar?.(run.handle).tokens !== total; tries += 1) await sleep(20)
      expect(run.adapter.tokensSoFar?.(run.handle).tokens, 'the run printed its line').toBe(total)
    }

    // 1. The first count, written at once. Every line has cache reads, and they are not counted.
    await theRunPrints({ input: 5_000, cacheWrites: 40_000, cacheReads: 900_000, output: N - 50_000 })
    await aReadingAfter(31)
    expect(await theCountOnTheRecord()).toBe(N - 5_000)
    expect((await theRecordOf(session))['howTheTokensWereReadAndCounted']).toContain(THE_TOKENS_COUNTED)
    expect(anOfficePass()).toEqual([])

    // 2. One token short of the setting: grown by 4,999, 31 seconds after the last write, so not written.
    await theRunPrints({ input: 0, cacheWrites: 4_999, cacheReads: 300_000, output: 0 })
    await aReadingAfter(31)
    expect(await theCountOnTheRecord()).toBe(N - 5_000)
    expect(anOfficePass()).toEqual([])

    // 3. The setting reached: grown by 1, a minute after the last write, and written at once. The office's next pass
    // reminds, and the pass after it does not.
    await theRunPrints({ input: 1, cacheWrites: 0, cacheReads: 300_000, output: 0 })
    const printedAt = performance.now()
    await aReadingAfter(31)
    const writtenAt = performance.now()
    expect(await theCountOnTheRecord()).toBe(N)
    expect(anOfficePass()).toEqual([session])
    const remindedAt = performance.now()
    expect(anOfficePass()).toEqual([])
    const reminders = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.saidInFull') AS said, json_extract(data, '$.extra.stepReminder') AS mark FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ? ORDER BY created_at, rowid")
      .all(session, THE_LINE) as { said: string; mark: string }[]
    expect(reminders.map((row) => JSON.parse(row.mark) as StepReminderMark)).toMatchObject([{ step: 1, why: 'tokens', tokens: N }])
    expect(reminders[0]!.said).toContain(`and ${N} tokens have passed since the step began.`)
    expect(reminders[0]!.said).toContain(THE_TOKENS_COUNTED)
    console.log(
      `[a run that reached ${N} tokens was reminded ${(remindedAt - printedAt).toFixed(0)} ms after its line could be read, ` +
        `with the worker's reading and the office's pass run back to back: ${(writtenAt - printedAt).toFixed(0)} ms for the ` +
        `worker's pass that wrote it, ${(remindedAt - writtenAt).toFixed(0)} ms for reading the record and the office's pass]`,
    )

    // 4. Grown by 10,000 but 31 seconds after the last write, so held, and still held at 4 minutes 31 seconds. Written
    // at 5 minutes 2 seconds.
    await theRunPrints({ input: 0, cacheWrites: 0, cacheReads: 300_000, output: 10_000 })
    await aReadingAfter(31)
    expect(await theCountOnTheRecord()).toBe(N)
    await aReadingAfter(240)
    expect(await theCountOnTheRecord()).toBe(N)
    await aReadingAfter(31)
    expect(await theCountOnTheRecord()).toBe(N + 10_000)

    // 5. Grown by 5,000, six minutes after the last write: not grown enough, so not written.
    await theRunPrints({ input: 0, cacheWrites: 5_000, cacheReads: 300_000, output: 0 })
    await aReadingAfter(360)
    expect(await theCountOnTheRecord()).toBe(N + 10_000)
  }, 60_000)
})
