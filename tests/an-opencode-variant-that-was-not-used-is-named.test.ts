// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPENCODE RUN SAYS THE DEFAULT VARIANT THE OFFICE'S EFFORT REPLACED (wave 13n round BN).
 *
 * An OpenCode adapter carries a default variant: the office's choice with its model, or the installation's chore variant
 * setting. Before a native start the launcher asks the office for the run's own effort and replaces the default with it.
 * When the office gives an effort that is not that default, the run's start words name the variant that was not used and
 * where it came from, so a default is never dropped in silence.
 *
 * WHAT IS REAL AND WHAT IS NOT. The adapter is the real one, a stand-in `opencode` is first on PATH and prints one JSON
 * event and exits, and a small stand-in office answers the run-model door. No model is called.
 *
 * THE MUTATION, AFTER A CONTROL RUN: take the sentence out of startModelRun (src/worker/runtimes/common.ts) and the two
 * cases that expect it are red on the missing sentence; restore it and they are green. The case where the office's
 * effort equals the variant expects no sentence before and after the code, and the same mutation leaves it green.
 */
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_AGENTS_OWN_EFFORT } from '../src/config/launcher-selection.mjs'
import type { RunRequest } from '../src/worker/runtimes/adapter.ts'
import { theVariantNotUsedWords, startModelRun } from '../src/worker/runtimes/common.ts'
import { OpenCodeAdapter, THE_CHORE_VARIANT_SETTING, THE_OFFICES_CHOICE_WITH_ITS_MODEL } from '../src/worker/runtimes/opencode.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

let scratch = ''
let bin = ''
let office: Server
let api = ''
/** What the stand-in office answers the run-model door with, changed by each case. */
let theOfficesEffort = ''

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-variant-not-used-'))
  bin = join(scratch, 'bin')
  mkdirSync(bin)
  const stub = join(bin, 'opencode')
  writeFileSync(
    stub,
    '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "opencode stand-in"; exit 0; fi\n' +
      'printf \'%s\\n\' "$@" > "$SYNTHETIC_OPENCODE_ARGV"\n' +
      'echo \'{"type":"text","part":{"text":"The stand-in answered."}}\'\n' +
      'echo \'{"sessionID":"ses_stub0001"}\'\n' +
      'exit 0\n',
  )
  chmodSync(stub, 0o755)
  office = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://made-up.invalid')
    if (request.method === 'GET' && url.pathname.startsWith('/api/office/run-models/for/')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ effort: theOfficesEffort, effortFrom: THE_AGENTS_OWN_EFFORT, model: url.searchParams.get('model') }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":"Made-up: this stand-in office answers only the run-model door."}')
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(scratch, { recursive: true, force: true })
})

/** A variant or effort made up for one case, which no compiled start value names. */
function madeUp(prefix: string): string {
  const value = `${prefix}-${randomUUID()}`
  const efforts = Object.values((LAUNCHER_MODEL_COMPATIBILITY as { startValues: Record<string, { effort: string | null }> }).startValues).map((one) => one.effort)
  expect(efforts).not.toContain(value)
  return value
}

/** A run request whose output and environment are this test's own. */
function ask(outputPath: string): RunRequest {
  return { session: 'a-session-id', agent: 'an-agent', prompt: 'say hello', cwd: scratch, api, workspace: 'default', outputPath }
}

/** The environment an adapter and its run are given: the stand-in first on PATH, and the argv file this case reads. */
function environment(choreVariant: string, argvPath: string): NodeJS.ProcessEnv {
  return { ...withoutInheritedEffort(), PATH: `${bin}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_CHORE_VARIANT: choreVariant, SYNTHETIC_OPENCODE_ARGV: argvPath }
}

/** Start one run with `adapter` and let its stand-in finish, stopping anything left. */
async function oneRun(adapter: OpenCodeAdapter, env: NodeJS.ProcessEnv): Promise<Awaited<ReturnType<typeof startModelRun>>> {
  const handle = await startModelRun(adapter, ask(join(scratch, `${randomUUID()}.out`)), env)
  try {
    const until = Date.now() + 10_000
    while (adapter.alive(handle) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 25))
    expect(adapter.alive(handle), 'the stand-in did not finish').toBe(false)
    return handle
  } finally {
    adapter.stop(handle, 'the case is over')
  }
}

/** The variant flag the stand-in was run with. */
function theVariantOf(argvPath: string): string {
  const argv = readFileSync(argvPath, 'utf8').split('\n')
  expect(argv.filter((word) => word === '--variant'), 'one --variant in the stand-in\'s argument list').toHaveLength(1)
  return argv[argv.indexOf('--variant') + 1] ?? ''
}

describe("an OpenCode run says the variant its own start did not use", () => {
  it('names the chore variant setting\'s variant when the office starts the run at another effort', async () => {
    const variant = madeUp('chore-variant')
    const effort = madeUp('office-effort')
    theOfficesEffort = effort
    const argvPath = join(scratch, `argv-chore-${randomUUID()}`)
    const env = environment(variant, argvPath)
    const adapter = new OpenCodeAdapter(env)
    const handle = await oneRun(adapter, env)
    expect(handle.startWords).toContain(theVariantNotUsedWords(variant, THE_CHORE_VARIANT_SETTING))
    expect(theVariantOf(argvPath)).toBe(effort)
  }, 40_000)

  it("names the office's choice with its model when the office starts the run at another effort", async () => {
    const model = Object.keys((LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string> }).aliases)[0]
    expect(model).toBeDefined()
    const variant = madeUp('chosen-variant')
    const effort = madeUp('office-effort')
    theOfficesEffort = effort
    const argvPath = join(scratch, `argv-chosen-${randomUUID()}`)
    const env = environment(madeUp('unused-setting'), argvPath)
    const adapter = new OpenCodeAdapter(env, { model: model!, variant })
    const handle = await oneRun(adapter, env)
    expect(handle.startWords).toContain(theVariantNotUsedWords(variant, THE_OFFICES_CHOICE_WITH_ITS_MODEL))
    expect(theVariantOf(argvPath)).toBe(effort)
  }, 40_000)

  it('says no such sentence when the office starts the run at the variant itself', async () => {
    const variant = madeUp('same-variant')
    theOfficesEffort = variant
    const argvPath = join(scratch, `argv-same-${randomUUID()}`)
    const env = environment(variant, argvPath)
    const adapter = new OpenCodeAdapter(env)
    const handle = await oneRun(adapter, env)
    expect(handle.startWords ?? '').not.toContain(theVariantNotUsedWords(variant, THE_CHORE_VARIANT_SETTING))
    expect(handle.startWords ?? '').not.toContain(theVariantNotUsedWords(variant, THE_OFFICES_CHOICE_WITH_ITS_MODEL))
    expect(theVariantOf(argvPath)).toBe(variant)
  }, 40_000)
})
