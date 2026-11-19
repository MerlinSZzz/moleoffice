// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * OPENCODE IS GIVEN A MODEL AND A REASONING VARIANT, OR NEITHER. Criterion T7.
 *
 * A decision: new workers run `opencode run -m
 * openrouter/z-ai/glm-5.3-flash --variant max`. Supervisors stay on opus. The office's opencode
 * runner learns `-m` and `--variant` in Cluster D.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. The named model and the variant the office chose with it, else the chore variant setting, go on the command line,
 *    exactly where the other flags already were. No compiled start value takes the variant's place. A start reads the
 *    office for the current effort before spawning.
 * 2. Neither flag goes on when nothing names them. An empty `-m ''` would be this product claiming a
 *    choice was made, which is the silent non-choice criterion M85 exists to end.
 * 3. An adapter that passes no model or no variant names none either, so a run's record cannot carry
 *    a model that never reached the command.
 * 4. The run's own session record carries the model and the reasoning effort, written by the real
 *    worker, proved against a stub `opencode` on a PATH of this file's own. Nothing here calls a
 *    model: the stub prints one JSON event and exits.
 * 5. When no model is named and the office gives no effort, the chore variant setting is the fallback, and the run's
 *    start words name the variant and that setting (wave 13n round BK).
 *
 * THE MUTATIONS, EACH RUN ALONE WITH A CONTROL BEFORE IT.
 *
 *   pass an empty flag when nothing is named (opencode.ts: `args.push('-m', this.modelItWouldUse?.() ?? '')`)
 *   — red: *passes neither when nothing names them*.
 *
 *   drop `modelItWouldUse` from the opencode adapter — red: *writes the model onto the session
 *   record*, because the record's model goes absent.
 *
 *   drop the native start's `recordEffort` call — red: *writes the effort onto the session record*.
 *
 *   put back the compiled start value as the variant of a named model (opencode.ts:
 *   `this.defaultVariant = model === null ? variant : theModelsStartValues(model).effort`) — red: *keeps the variant the
 *   office chose with a listed model*, *keeps the variant the office chose with a model the list does not hold*, and
 *   *passes the named model and the named variant, not the compiled start value*.
 *
 *   drop the start words of the put-back chore variant (common.ts) — red: *says the chore variant setting gave the
 *   variant*.
 */

import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RunRequest } from '../src/worker/runtimes/adapter.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { CHAPTERS_SOURCE, RULES_SOURCE, SKILL_SOURCE, USER_PART_SOURCE } from '../src/worker/rules.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LISTED = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, { effort: string | null }> }

/** A variant made up for this run, which no start value in the compatibility list names. */
function madeUpVariant(): string {
  const variant = `variant-${randomUUID()}`
  expect(Object.values(LISTED.startValues).map((value) => value.effort)).not.toContain(variant)
  return variant
}

/** The words a run's start gives when the chore variant setting gave its variant. */
const THE_CHORE_VARIANTS_WORDS = (variant: string): string =>
  `no model named and no effort from the office; variant ${variant} from the setting MOLE_OFFICE_CHORE_VARIANT`

/** One run request, in the checkout, with no file written unless a test starts a run. */
function ask(prompt: string, extra: Partial<RunRequest> = {}): RunRequest {
  return {
    session: 'a-session-id',
    agent: 'an-agent',
    prompt,
    cwd: CHECKOUT,
    api: 'http://127.0.0.1:1',
    workspace: 'default',
    outputPath: join(tmpdir(), 'opencode-command-line-only.out'),
    ...extra,
  }
}

describe('the opencode command line', () => {
  it('passes the named model and the named variant, not the compiled start value', () => {
    // The office chooses the effort at the start. Until then the chore variant setting is the fallback, as it is named,
    // even for a model the compatibility list gives a start value.
    const adapter = new OpenCodeAdapter({
      MOLE_OFFICE_CHORE_MODEL: 'deepseek/deepseek-v4.1-flash',
      MOLE_OFFICE_CHORE_VARIANT: 'high',
    })
    const args = adapter.commandFor(ask('say hello')).args
    expect(args).toContain('-m')
    expect(args[args.indexOf('-m') + 1]).toBe('deepseek/deepseek-v4.1-flash')
    expect(args).toContain('--variant')
    expect(args[args.indexOf('--variant') + 1]).toBe('high')
    expect(adapter.variantItWouldUse?.()).toBe('high')
  })

  it('passes neither when nothing names them, rather than an empty flag', () => {
    const adapter = new OpenCodeAdapter({})
    const run = ask('say hello')
    expect(adapter.commandFor(run).args).toEqual(['run', '--format', 'json', '--dir', run.cwd, 'say hello'])
    expect(adapter.commandFor(run).args).not.toContain('-m')
    expect(adapter.commandFor(run).args).not.toContain('--variant')
  })

  it('keeps --format json, --dir and --session exactly where they were', () => {
    const adapter = new OpenCodeAdapter({ MOLE_OFFICE_CHORE_MODEL: 'a-model', MOLE_OFFICE_CHORE_VARIANT: 'high' })
    const args = adapter.commandFor(ask('say hello', { resume: 'ses_abc123' })).args
    // THE FOUR THAT WERE ALREADY THERE, unchanged and first.
    expect(args.slice(0, 5)).toEqual(['run', '--format', 'json', '--dir', CHECKOUT])
    expect(args).toContain('--session')
    expect(args).toContain('ses_abc123')
    // AND THE MESSAGE IS STILL LAST, which is where the tool reads it.
    expect(args.at(-1)).toBe('say hello')
  })

  it('names no model and no variant when it passes none', () => {
    // THE CONTROL FOR THE RECORD BELOW. An adapter that named a model it does not pass would put a
    // fact on a run's record that never reached the command.
    const bare = new OpenCodeAdapter({})
    expect(bare.modelItWouldUse).toBeUndefined()
    expect(bare.variantItWouldUse).toBeUndefined()
    const named = new OpenCodeAdapter({ MOLE_OFFICE_CHORE_MODEL: 'a-model', MOLE_OFFICE_CHORE_VARIANT: 'max' })
    expect(named.modelItWouldUse?.()).toBe('a-model')
    // The chore variant beside the chore model is the fallback, and the adapter names the variant it passes.
    expect(named.variantItWouldUse?.()).toBe('max')
    expect(named.commandFor(ask('say hello')).args).toEqual(['run', '--format', 'json', '--dir', CHECKOUT, '-m', 'a-model', '--variant', 'max', 'say hello'])
  })

  it('keeps the variant the office chose with a listed model, and adds none when it chose none', () => {
    // A MODEL THE COMPATIBILITY LIST GIVES A START VALUE, read from the list, with a variant the list does not hold. The
    // office's choice reaches the command as it was made, and a choice of no variant is not filled from the list.
    const model = Object.keys(LISTED.aliases).find((name) => name.includes('/') && LISTED.startValues[LISTED.aliases[name]!]?.effort != null)
    expect(model).toBeDefined()
    const variant = madeUpVariant()
    const chosen = new OpenCodeAdapter({}, { model: model!, variant })
    expect(chosen.variantItWouldUse?.()).toBe(variant)
    const args = chosen.commandFor(ask('say hello')).args
    expect(args.slice(args.indexOf('-m'), args.indexOf('-m') + 4)).toEqual(['-m', model, '--variant', variant])
    const none = new OpenCodeAdapter({}, { model: model!, variant: null })
    expect(none.variantItWouldUse).toBeUndefined()
    expect(none.commandFor(ask('say hello')).args).not.toContain('--variant')
  })

  it('keeps the variant the office chose with a model the list does not hold', () => {
    const model = `made-up/office-${randomUUID()}`
    expect(LISTED.aliases[model] ?? LISTED.startValues[model]).toBeUndefined()
    const variant = madeUpVariant()
    const chosen = new OpenCodeAdapter({}, { model, variant })
    expect(chosen.variantItWouldUse?.()).toBe(variant)
    const args = chosen.commandFor(ask('say hello')).args
    expect(args.slice(args.indexOf('-m'), args.indexOf('-m') + 4)).toEqual(['-m', model, '--variant', variant])
  })
})

/**
 * THE RUN THE WORKER STARTS, against a stub `opencode` that this file writes.
 *
 * IT IS NOT A PRETENCE ABOUT OPENCODE. The stub is handed a real argv, a real working directory and
 * a real environment, and it prints the JSON events the adapter's reader expects. The only thing not
 * real is the model at the far end, and none is called.
 */
describe('an opencode run records the model and the effort it was given', () => {
  let t: TestDb
  let app: FastifyInstance
  let api: string
  let outputs: string
  let bin: string
  /**
   * THE CHECKOUT THE STUB IS GIVEN WITH --dir: a throwaway folder, not this checkout (measurement 4 of 24 September,
   * the secretary's word VSmfXm6Bf1D8). The stub reads nothing, but a program given a folder counts as reading everything under
   * it, and handing it this checkout kept every document from landing alone. The worker reads
   * three files from its checkout before it starts a run (the rules, their chapters, and the skill's section on
   * leading), so the throwaway folder is given copies of those three and nothing else.
   */
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
    outputs = mkdtempSync(join(tmpdir(), 'mole-office-opencode-'))
    bin = mkdtempSync(join(tmpdir(), 'mole-office-opencode-bin-'))
    checkout = mkdtempSync(join(tmpdir(), 'mole-office-opencode-checkout-'))
    for (const file of [RULES_SOURCE, USER_PART_SOURCE, CHAPTERS_SOURCE, SKILL_SOURCE]) {
      mkdirSync(join(checkout, file, '..'), { recursive: true })
      copyFileSync(join(CHECKOUT, file), join(checkout, file))
    }
    const stub = join(bin, 'opencode')
    writeFileSync(
      stub,
      '#!/bin/sh\n' +
        'if [ "$1" = "--version" ]; then echo "opencode 1.18.30-stub"; exit 0; fi\n' +
        'printf \'%s\\n\' "$@" > "$SYNTHETIC_OPENCODE_ARGV"\n' +
        'echo \'{"type":"text","part":{"text":"The stub answered."}}\'\n' +
        'echo \'{"type":"step_finish","part":{"id":"step-1","tokens":{"input":1,"output":1,"cache":{"read":0,"write":0}},"cost":0}}\'\n' +
        'echo \'{"sessionID":"ses_stub0001"}\'\n' +
        'exit 0\n',
    )
    chmodSync(stub, 0o755)
    // THE STUB IS FIRST ON THE PATH, so `whereItIs` and the spawn both find it rather than any real
    // opencode. The fake runtime is deliberately not set: this is the real adapter's path.
    const env: NodeJS.ProcessEnv = {
      ...withoutInheritedEffort(),
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      MOLE_OFFICE_CHORE_MODEL: 'openrouter/z-ai/glm-5.3-flash',
      MOLE_OFFICE_CHORE_VARIANT: 'max',
      SYNTHETIC_OPENCODE_ARGV: join(outputs, 'argv'),
    }
    delete env['MOLE_OFFICE_FAKE_RUNTIME']
    settings = {
      api,
      workspace: 'default',
      session: null,
      stopWithPid: null,
      checkout,
      runs: 2,
      hops: 3,
      outputRoot: outputs,
      env,
    }
  }, 60_000)

  afterEach(() => {
    delete process.env['MOLE_OFFICE_CHORE_MODEL']
    delete process.env['MOLE_OFFICE_CHORE_VARIANT']
  })

  afterAll(async () => {
    for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
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

  it('writes the model and the effort onto its own session record', async () => {
    await post('/api/records', {
      kind: 'agent',
      title: 'opencode-runner',
      data: { handle: 'opencode-runner', state: 'active', runtime: 'opencode' },
    })
    // THE ID THE PARTICIPANT REGISTRY LISTS IT UNDER, which is the one a message may be addressed
    // to. The record created above and the registry row are read through the same door the product
    // uses, so this test files its message the way a person does.
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one(
      (listed.agents ?? []).filter((one) => one.handle === 'opencode-runner'),
      'the registry row for opencode-runner',
    ).id
    // Explicit effort is now held in the office. Keep the exact max assertion by recording that choice there.
    // A MODEL THE COMPATIBILITY LIST HOLDS: a conversation run gets no Casting selection from this office.
    await post(`/api/office/run-models/agent/${agentId}`, { model: 'deepseek/deepseek-v4.1-flash', variant: 'max' })
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'something for opencode to answer',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    // THE PERSON'S PRESS, because this agent is fresh: criterion M78.
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const started = one(
      (await onePass(settings, watching)).started.filter((run) => run.messageId === messageId),
      'the run started for this message',
    )
    const record = (await get(`/api/records/${started.session}`)) as { record?: { data: Record<string, unknown> } }
    expect(record.record?.data['model']).toBe('deepseek/deepseek-v4.1-flash')
    expect(record.record?.data['effort']).toBe('max')
    const argv = readFileSync(join(outputs, 'argv'), 'utf8').split('\n')
    expect(argv.slice(argv.indexOf('--variant'), argv.indexOf('--variant') + 2)).toEqual(['--variant', 'max'])
  }, 40_000)

  it('says the chore variant setting gave the variant when no model is named and the office gave no effort', async () => {
    // NO MODEL IS NAMED AND THE OFFICE CANNOT BE ASKED, because nothing listens on port 1. The launcher then gives no
    // start, and the chore variant setting is the fallback. The run's start words name the variant and that setting.
    const variant = madeUpVariant()
    const env: NodeJS.ProcessEnv = { ...settings.env, MOLE_OFFICE_CHORE_VARIANT: variant, SYNTHETIC_OPENCODE_ARGV: join(outputs, 'argv-chore-variant') }
    delete env['MOLE_OFFICE_CHORE_MODEL']
    const adapter = new OpenCodeAdapter(env)
    const handle = await adapter.start(ask('say hello', { cwd: checkout, outputPath: join(outputs, 'chore-variant.out') }))
    try {
      const until = Date.now() + 10_000
      while (adapter.alive(handle) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50))
      expect(adapter.alive(handle)).toBe(false)
    } finally {
      adapter.stop(handle, 'the test is over')
    }
    expect(handle.startWords).toBe(THE_CHORE_VARIANTS_WORDS(variant))
    const argv = readFileSync(join(outputs, 'argv-chore-variant'), 'utf8').split('\n')
    expect(argv).not.toContain('-m')
    expect(argv.slice(argv.indexOf('--variant'), argv.indexOf('--variant') + 2)).toEqual(['--variant', variant])
  }, 40_000)
})
