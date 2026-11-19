// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE WORKER SAYS WHY A REFUSED EFFORT HOLDS NO CASTING ROW (wave 13n round BN).
 *
 * The launcher already says it when a native program refuses an effort that is not its Casting row's own: the row is not
 * held, because its own effort was not tried. The message worker kept the start's effort on the run's handle but not the
 * start, so its ending named only the program's refusal and no sentence named the effort, the row and the model. Now the
 * handle carries the start, and the run's record detail ends with the refusal sentence the launcher's own function makes.
 * No hold is posted.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and every agent, Casting row and
 * message is written through its doors as the person. The `opencode` program is a stand-in first on PATH: it prints one
 * option refusal and exits 1, and runs no model. Every model name, native name, provider and effort is made up for this
 * run, and the test checks that the compiled list names none of them.
 *
 * THE MUTATION, AFTER A CONTROL RUN: take the notHeld words out of the run's ending in src/worker/index.ts, and the case
 * is red because the record detail does not end with the sentence; restore it and the case is green.
 */
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_ROW_IS_NOT_HELD_OWN_EFFORT_WAS_NOT_TRIED } from '../src/config/launcher-selection.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LISTED = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, { effort: string | null }> }

/** A model, a native name, a provider and two efforts made up for this run, none of which the compiled list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, provider: `provider-${key}`, rowEffort: `row-effort-${key}`, ownEffort: `own-effort-${key}` }
  for (const name of [made.model, made.native, `${made.provider}/${made.native}`]) expect(LISTED.aliases[name] ?? LISTED.startValues[name]).toBeUndefined()
  const efforts = Object.values(LISTED.startValues).map((value) => value.effort)
  for (const effort of [made.rowEffort, made.ownEffort]) expect(efforts).not.toContain(effort)
  return made
}

let t: TestDb
let app: FastifyInstance
let api = ''
let outputs = ''
let bin = ''
let checkout: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-refused-effort-'))
  bin = mkdtempSync(join(tmpdir(), 'mole-office-refused-effort-bin-'))
  checkout = aCheckoutForATestRun()
  const stub = join(bin, 'opencode')
  writeFileSync(
    stub,
    '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "opencode stand-in"; exit 0; fi\n' +
      'printf \'%s\\n\' "$@" > "$SYNTHETIC_OPENCODE_ARGV"\n' +
      'echo \'{"type":"error","error":{"name":"APIError","data":{"responseBody":"{\\"error\\":{\\"code\\":\\"unknown_variant\\",\\"message\\":\\"Made-up: the program does not know this variant.\\"}}"}}}\'\n' +
      'exit 1\n',
  )
  chmodSync(stub, 0o755)
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), PATH: `${bin}:${process.env['PATH'] ?? ''}`, SYNTHETIC_OPENCODE_ARGV: join(outputs, 'argv') },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) if (left.adapter.alive(left.handle)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
  rmSync(checkout, { recursive: true, force: true })
})

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** The Casting row's hold, read from the table the Casting page reads. */
async function theRowsHold(id: number): Promise<unknown> {
  const table = (await get('/api/casting')) as { roles?: { scopes?: { castings?: { id: number; hold?: unknown }[] }[] }[] }
  const rows = (table.roles ?? []).flatMap((role) => (role.scopes ?? []).flatMap((scope) => scope.castings ?? []))
  return rows.find((row) => row.id === id)?.hold ?? null
}

describe('a native option refusal of an effort that is not the row\'s own', () => {
  it('ends the run with the sentence saying the row is not held, and posts no hold', async () => {
    const made = unseen()
    await post('/api/records', {
      kind: 'agent',
      title: 'refused-effort-runner',
      data: { handle: 'refused-effort-runner', state: 'active', runtime: 'opencode' },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one((listed.agents ?? []).filter((one) => one.handle === 'refused-effort-runner'), 'the registry row for refused-effort-runner').id
    // THE ROW THE OFFICE READS, and the agent's own effort in place of its own.
    const written = await post(`/api/casting/${THE_WORKER}`, {
      program: { value: 'opencode' },
      model: { value: made.model },
      effort: { value: made.rowEffort },
      native: { model: made.native, provider: made.provider, variant: made.rowEffort },
    })
    const row = written['casting'] as { id: number }
    const own = await post(`/api/office/run-models/agent/${agentId}`, { model: made.model, variant: made.ownEffort })
    expect(own['model'], JSON.stringify(own)).toBe(made.model)
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'something for the refused effort to answer',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const started = one((await onePass(settings, watching)).started.filter((run) => run.messageId === messageId), 'the run started for this message')
    const run = one(watching.filter((watched) => watched.session === started.session), 'the watched run')
    const until = Date.now() + 15_000
    while (run.adapter.alive(run.handle) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 25))
    expect(run.adapter.alive(run.handle), 'the stand-in did not finish').toBe(false)
    await onePass(settings, watching)

    const record = t.api.getRecord(started.session)
    const doing = String(record?.data['doing'] ?? '')
    expect(record?.data['state']).toBe('crashed')
    expect(doing.endsWith(THE_ROW_IS_NOT_HELD_OWN_EFFORT_WAS_NOT_TRIED)).toBe(true)
    expect(doing).toContain(made.ownEffort)
    expect(doing).toContain(made.native)
    expect(doing).toContain(`Casting row ${String(row.id)}`)
    expect(await theRowsHold(row.id)).toBeNull()
    const argv = readFileSync(join(outputs, 'argv'), 'utf8').split('\n')
    expect(argv[argv.indexOf('--variant') + 1]).toBe(made.ownEffort)
  }, 40_000)
})
