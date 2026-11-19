// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Runs here end finished, so the fixture submits a completion note for each, as for every fake run that answers. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * THE MESSAGE WORKER'S RESUMED CODEX RUN GETS ITS OWN USAGE, NOT ITS THREAD'S TOTAL (wave 13s round 43, item 2).
 *
 * `codex exec resume` reports the thread's total so far in its last turn.completed, not the run's own part. Round 42
 * made a round of the launcher take the total of the run it continues off its own. The message worker's resumed run
 * still kept only the thread's total, in words. Now the worker is told which run's conversation a resumed run picks up
 * (`PickUp.run` in src/server/lib/worker.ts), reads that run's output, and takes its total off, with round 42's reader
 * (theRoundsOwnCodexUsage in src/config/usage.mjs). When the earlier output cannot be read, the receipt keeps no number
 * as the run's, and its words say the figures are the thread's total.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The server, the queue, the session records and the worker's passes are real. `codex` is a STAND-IN SCRIPT on PATH,
 * made by this file: it prints a stand-in event stream and writes "ok" where `-o` says, and runs no model. Started
 * fresh, it prints the first round of a thread. Started with `resume`, it prints the same thread's total after a second
 * round, as the real tool does. The counts are made up for this file. CODEX_HOME is a scratch folder, so no rollout of
 * this machine is read.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. The Codex adapter reads a resumed run with codexUsage, the cumulative figure. The delta case goes red.
 *   2. theRoundsOwnCodexUsage gives the total as the run's when the earlier figure cannot be found. The missing case
 *      goes red.
 *   3. pickUpRunsAlreadyGoing leaves `continues` off the handle of a run a restarted worker picks up. The restart case
 *      goes red.
 */

import type { AddressInfo } from 'node:net'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { USAGE_NUMBERS } from '../src/config/usage.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { UsageReceipt } from '../src/shared/usage-receipts.ts'
import { theProviderTheLauncherAdds } from '../src/shared/worker-runs.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

type Watching = Parameters<typeof onePass>[1]

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
/** Every list of runs a worker here watched, so whatever is still going at the end is stopped by its group. */
const everyList: Watching[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: (body ?? {}) as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** What `codex exec --json` prints for one round of a thread whose total so far is these counts. */
function aCodexRound(thread: string, [input, cached, output, reasoning]: [number, number, number, number]): string {
  return [
    { type: 'thread.started', thread_id: thread },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'ok' } },
    { type: 'turn.completed', usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning } },
  ].map((event) => JSON.stringify(event)).join('\n') + '\n'
}

/** The thread's total after its first round, and after its second: the second round's own part is the difference. */
const FIRST: [number, number, number, number] = [100, 60, 10, 4]
const SECOND: [number, number, number, number] = [250, 180, 25, 9]
const THE_SECOND_ROUNDS_OWN = { inputTokens: 150, cachedInputTokens: 120, outputTokens: 15, reasoningTokens: 5 }
const THE_THREADS_TOTAL_IN_WORDS =
  "So the figures Codex gave are the thread's total so far, over every round of it, and not this run's own: tokens in 250, cached tokens 180, tokens out 25, reasoning tokens 9. None of them is kept on this receipt as a number of this run's."

const numbersOf = (receipt: UsageReceipt) => Object.fromEntries(USAGE_NUMBERS.filter((key) => receipt[key] !== undefined).map((key) => [key, receipt[key]]))

/**
 * A WORKER WITH ITS OWN STAND-IN `codex`, for one thread. Started with `resume`, the stand-in waits while the file
 * `hold` is in its folder, so a test can restart the worker while that run is going.
 */
function aWorker(name: string, thread: string): { settings: WorkerSettings; watching: Watching; folder: string } {
  const folder = mkdtempSync(join(scratch, `${name}-`))
  writeFileSync(join(folder, 'first.jsonl'), aCodexRound(thread, FIRST))
  writeFileSync(join(folder, 'second.jsonl'), aCodexRound(thread, SECOND))
  const script = join(folder, 'codex')
  writeFileSync(
    script,
    '#!/bin/sh\n# A stand-in for codex, made by this test. It runs no model.\n' +
      `if [ "$1" = "--version" ]; then echo 'codex-cli 0.155.1'; exit 0; fi\n` +
      "answer=''\nresumed=no\n" +
      'while [ $# -gt 0 ]; do\n  case "$1" in\n    -o) answer="$2"; shift ;;\n    resume) resumed=yes ;;\n  esac\n  shift\ndone\n' +
      `if [ "$resumed" = yes ]; then\n  while [ -e '${join(folder, 'hold')}' ]; do sleep 0.1; done\n  cat '${join(folder, 'second.jsonl')}'\n` +
      `else\n  cat '${join(folder, 'first.jsonl')}'\nfi\nprintf 'ok' > "$answer"\n`,
  )
  chmodSync(script, 0o755)
  const watching: Watching = []
  everyList.push(watching)
  return {
    folder,
    watching,
    settings: {
      api,
      workspace: 'default',
      session: null,
      stopWithPid: null,
      checkout: aCheckoutForATestRun(),
      runs: 4,
      hops: 3,
      outputRoot: mkdtempSync(join(folder, 'outputs-')),
      env: { ...withoutInheritedEffort(), PATH: `${folder}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_FAKE_RUNTIME: '', CODEX_HOME: mkdtempSync(join(folder, 'codex-home-')) },
    },
  }
}

/**
 * A Codex model the compatibility list names, both alone and with Codex's provider in front. A Codex run that answers a
 * message is started only on a model the office names, and with no Casting selection the launcher starts a listed one.
 */
const A_LISTED_CODEX_MODEL = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(theProviderTheLauncherAdds('codex'))}/${name}`))

/** Register a durable agent whose runs are Codex runs, with that model as its own, and give back its registry id. */
async function aCodexAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'codex' } })
  expect(A_LISTED_CODEX_MODEL, 'a Codex model the compatibility list names').toBeDefined()
  const named = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${handle}`, headers: AS_THE_OWNER, payload: { model: A_LISTED_CODEX_MODEL } })
  expect(named.statusCode, named.body).toBe(200)
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** Send a message to an agent, press to start an agent for it (criterion M78), and give back the message id. */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } })
  const id = (filed['record'] as { id: string }).id
  await post(`/api/messages/${id}/start-an-agent`, {})
  return id
}

/** The session record of the run that took this message, or null because none has yet. */
async function runOf(messageId: string): Promise<string | null> {
  const read = (await get(`/api/messages/${messageId}`)) as { message?: { deliveries?: { run: string | null }[] } }
  return read.message?.deliveries?.[0]?.run ?? null
}

/** One session record's stored data. */
async function runData(session: string): Promise<Record<string, unknown>> {
  const read = (await get(`/api/records/${session}`)) as { record?: { data?: Record<string, unknown> } }
  return read.record?.data ?? {}
}

/** Passes until the run that took this message has ended with a receipt on its record; that run and its receipt. */
async function theReceiptOfTheRunFor(
  messageId: string,
  settings: WorkerSettings,
  watching: Watching,
): Promise<{ run: string; receipt: UsageReceipt }> {
  const deadline = Date.now() + 20_000
  for (;;) {
    await onePass(settings, watching)
    const run = await runOf(messageId)
    const data = run === null ? {} : await runData(run)
    if (run !== null && data['state'] !== 'running' && data['usageReceipt'] !== undefined) {
      expect(data['state'], `run ${run} ended: ${String(data['doing'])}`).toBe('finished')
      return { run, receipt: data['usageReceipt'] as UsageReceipt }
    }
    if (Date.now() >= deadline) throw new Error(`No run for message ${messageId} ended with a receipt within 20 seconds.`)
    await new Promise((go) => setTimeout(go, 100))
  }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-resumed-codex-usage-'))
}, 60_000)

afterAll(async () => {
  // Whatever is still going, stopped by the group its handle wrote down.
  for (const run of everyList.flat()) {
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

describe("the message worker's resumed Codex run", () => {
  it('gets its own delta: the thread’s total less the total the run it resumes reported at its end', async () => {
    const { settings, watching } = aWorker('delta', '01a106ba-1b44-7371-868f-00000000d001')
    const agentId = await aCodexAgent('codex-delta')
    const first = await theReceiptOfTheRunFor(await messageTo(agentId, 'Please read record aaaaaaaaaaaa.'), settings, watching)
    expect(numbersOf(first.receipt)).toEqual({ inputTokens: 100, cachedInputTokens: 60, outputTokens: 10, reasoningTokens: 4 })

    const second = await theReceiptOfTheRunFor(await messageTo(agentId, 'One more thing, about record bbbbbbbbbbbb.'), settings, watching)
    expect(second.run).not.toBe(first.run)
    // THE SAME THREAD, PICKED UP: the second run was filed with the first one's conversation.
    expect((await runData(second.run))['providerSession']).toBe((await runData(first.run))['providerSession'])
    expect(numbersOf(second.receipt)).toEqual(THE_SECOND_ROUNDS_OWN)
    expect(second.receipt.source).toContain(`less the total run ${first.run} reported at its end`)
    expect(second.receipt.inputIncludesCached).toBe(true)
  }, 60_000)

  it('keeps no number as its own when the earlier run’s output cannot be read, and says the figures are the thread’s total', async () => {
    const { settings, watching } = aWorker('missing', '01a106ba-1b44-7371-868f-00000000d002')
    const agentId = await aCodexAgent('codex-missing')
    const first = await theReceiptOfTheRunFor(await messageTo(agentId, 'Please read record cccccccccccc.'), settings, watching)
    // THE EARLIER FIGURE GOES MISSING: the first run's output file is taken away before the second run ends.
    const itsOutput = join(settings.outputRoot, first.run, 'said.txt')
    expect(existsSync(itsOutput), 'the first run’s output is where the worker wrote it').toBe(true)
    rmSync(itsOutput)

    const second = await theReceiptOfTheRunFor(await messageTo(agentId, 'One more thing, about record dddddddddddd.'), settings, watching)
    expect(numbersOf(second.receipt)).toEqual({})
    expect(second.receipt.says).toContain(`This run continues run ${first.run}, whose output file could not be read (${itsOutput}: ENOENT). ${THE_THREADS_TOTAL_IN_WORDS}`)
  }, 60_000)

  it('still gets its own delta when the worker restarts while it is going', async () => {
    const { settings, watching, folder } = aWorker('restart', '01a106ba-1b44-7371-868f-00000000d003')
    const agentId = await aCodexAgent('codex-restart')
    const first = await theReceiptOfTheRunFor(await messageTo(agentId, 'Please read record eeeeeeeeeeee.'), settings, watching)

    // THE RESUMED RUN IS STARTED AND HELD, and a worker with an empty list, which is a restarted one, picks it up.
    writeFileSync(join(folder, 'hold'), '')
    const asked = await messageTo(agentId, 'One more thing, about record ffffffffffff.')
    let started: string | null = null
    for (let tries = 0; tries < 40 && started === null; tries += 1) {
      started = (await onePass(settings, watching)).started[0]?.session ?? null
      if (started === null) await new Promise((go) => setTimeout(go, 100))
    }
    if (started === null) throw new Error('The resumed run was not started within forty passes.')
    expect(watching.map((run) => run.session)).toContain(started)
    const restarted: Watching = []
    everyList.push(restarted)
    expect((await onePass(settings, restarted)).pickedUp).toContain(started)
    rmSync(join(folder, 'hold'))

    const second = await theReceiptOfTheRunFor(asked, settings, restarted)
    expect(second.run).toBe(started)
    expect(numbersOf(second.receipt)).toEqual(THE_SECOND_ROUNDS_OWN)
    expect(second.receipt.source).toContain(`less the total run ${first.run} reported at its end`)
  }, 60_000)
})
