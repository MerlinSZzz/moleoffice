// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN THE OFFICE STARTS IS GIVEN A MODEL, AND ITS RECORD SAYS WHICH.
 *
 * Criterion M85, on the person's words of 7 September 2026 and what was measured that night: the Claude Code
 * adapter passed no `--model` at all, so every run the message worker started took whatever the
 * person's own CLI was configured with, and fifty-eight runs recorded no model. Not choosing was
 * not neutral — it was choosing silently and leaving no way to find out afterwards.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. The argument really goes to the command. Read off `commandFor`, which is what builds the
 *    argument list the process is started with, rather than off a comment saying it does.
 * 2. The setting decides it. When nobody has set it there is no model, because the office ships no
 *    default model, by FLO-05 of a decision, and the worker holds the message and starts
 *    nothing, with a sentence that says where a model is named.
 * 3. The run's own session record says which model it was given, written by the real worker.
 * 4. The runtime page says which model runs are given and where that answer came from.
 * 5. An adapter that is told its model elsewhere writes none, rather than a record claiming a model
 *    that never reached the command, and the stand-in the worker case runs under answers with the
 *    same word it passes. *
 * ---------------------------------------------------------------------------------------
 * THE SIX MUTATIONS, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Each was made on its own, with a control run before it and another after the change was put
 * back. Every control was green, 9 cases. What each mutation is, and what went red:
 *
 *   the adapter passes no model at all, which is what it did until this criterion
 *   (src/worker/runtimes/claude-code.ts) — 4 red: the three about the command line, and the one
 *   about an emptied setting.
 *
 *   the declaration carries a different default (src/config/settings.mjs, 'opus' to 'sonnet')
 *   — 3 red: the two that read the default, and the runtime page.
 *
 *   the run writes no model onto its own session record (src/worker/index.ts) — 1 red:
 *   *writes the model onto its own session record*.
 *
 *   the stand-in answers with a model it does not put on its own command line
 *   (src/worker/runtimes/fake.ts) — 1 red: *has the stand-in pass the same word it answers with*.
 *
 *   a setting somebody has emptied is passed through as an empty word
 *   (src/worker/runtimes/claude-code.ts) — 1 red: *falls back to the default when the setting is
 *   set to nothing*.
 *
 *   the page never says nobody set it, so a default reads as a choice (src/config/agent-model.mjs)
 *   — 1 red: *says which model runs are given, and that nobody set it when nobody has*.
 *
 * 8 SEPTEMBER 2026, ON MAIN, after three cases went red the moment the owner's .env named a model:
 * an adapter now answers out of the environment it was built with and nothing else (`theModelIn`),
 * the worker builds that environment as .env under its own, and the runtime-page case reads the
 * settings layer for which world the checkout is in, with the "nobody set it" sentence held on a
 * built world. Mutation, run alone: making `theModelIn` reach into the checkout's .env again turned
 * 2 of 10 red (the empty-world default and the built-world sentence) and nothing else; put back,
 * 10 green.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { readSettingHere, settingNamed } from '../src/config/settings.mjs'
import { NO_MODEL_SAYS, theModelASettingNamed, whereTheModelCameFrom } from '../src/config/agent-model.mjs'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'
import type { RuntimeAdapter } from '../src/worker/runtimes/adapter.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const SETTING = 'MOLE_OFFICE_AGENT_MODEL'

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** What the adapter would put on the command line, with the model this environment names. */
function argsWith(model?: string): string[] {
  const adapter = new ClaudeCodeAdapter(model === undefined ? {} : { [SETTING]: model })
  return adapter.commandFor({
    session: 's',
    agent: 'an-agent',
    prompt: 'say something',
    cwd: CHECKOUT,
    api: 'http://127.0.0.1:1',
    workspace: 'default',
    outputPath: join(tmpdir(), 'nothing.json'),
  }).args
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-model-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterEach(() => {
  delete process.env[SETTING]
})

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('the model goes on the command line', () => {
  it('passes --model with the word the setting names', () => {
    const args = argsWith('haiku')
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('haiku')
  })

  it('names no model when nobody has set one, because the office ships no default model', () => {
    // FLO-05 of a decision. Until 2 October 2026 the declaration said 'opus' and this case
    // read that default off the command line. The adapter was built with an empty world, and it
    // answers about that world: not about this checkout's .env, which may well name a model.
    expect(settingNamed(SETTING).fallback).toBeNull()
    expect(new ClaudeCodeAdapter({}).modelItWouldUse()).toBeNull()
    expect(new FakeAdapter(FAKE, {}).modelItWouldUse()).toBeNull()
    // AND NO COMMAND LINE IS BUILT WITHOUT ONE. startOne refuses first, so this is the loud failure
    // for a caller that skipped it.
    expect(() => argsWith()).toThrow(NO_MODEL_SAYS.conversation)
  })

  it('names no model when the setting is set to nothing, rather than passing an empty word', () => {
    // A LINE LIKE `MOLE_OFFICE_AGENT_MODEL=` IN A .env IS SET, AND SAYS NOTHING. Passing what it
    // says would put a bare `--model ''` on the command line, which is not the CLI default and not
    // a model either; it is the same silent non-choice this criterion exists to end.
    expect(new ClaudeCodeAdapter({ [SETTING]: '   ' }).modelItWouldUse()).toBeNull()
    expect(() => argsWith('   ')).toThrow(NO_MODEL_SAYS.conversation)
  })

  it('keeps the model in front of --resume, so picking a conversation up is given one too', () => {
    const adapter = new ClaudeCodeAdapter({ [SETTING]: 'haiku' })
    const args = adapter.commandFor({
      session: 's',
      agent: 'an-agent',
      prompt: 'carry on',
      cwd: CHECKOUT,
      api: 'http://127.0.0.1:1',
      workspace: 'default',
      outputPath: join(tmpdir(), 'nothing.json'),
      resume: 'a-conversation',
    }).args
    expect(args).toContain('--model')
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--model') + 1]).toBe('haiku')
  })

  it('has the stand-in pass the same word it answers with, so the record below is about a real command line', () => {
    // WHY THIS IS HERE. The worker writes the model onto the run's record by asking the adapter
    // what model it uses. The run in the next case is started under the fake runtime, so if the
    // fake answered a word it never put on its command line, that record would pass while saying
    // something untrue about the process that ran. These two must be the same word or neither is
    // worth reading.
    const fake = new FakeAdapter(FAKE, { [SETTING]: 'haiku' })
    const args = fake.commandFor({
      session: 's',
      agent: 'an-agent',
      prompt: 'say something',
      cwd: CHECKOUT,
      api: 'http://127.0.0.1:1',
      workspace: 'default',
      outputPath: join(tmpdir(), 'nothing.json'),
    }).args
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe(fake.modelItWouldUse())
    expect(fake.modelItWouldUse()).toBe('haiku')
  })

  it('says nothing about a model for a tool that is told elsewhere, rather than naming one it does not pass', () => {
    // THE CONTROL FOR THE RECORD BELOW. Only an adapter that passes a model may say what it passes,
    // and a record naming a model that never reached the command would be worse than a record
    // saying nothing.
    const codex: RuntimeAdapter = new CodexAdapter({})
    expect(codex.modelItWouldUse).toBeUndefined()
  })
})

describe('the run the worker starts', () => {
  it('holds the message and starts nothing when no model is named, and says where to name one', async () => {
    // FLO-05 of a decision: no shipped model, so a run with none named is refused.
    // The worker's environment is the whole world here: neither model setting is in it.
    await post('/api/records', {
      kind: 'agent',
      title: 'given-no-model',
      data: { handle: 'given-no-model', state: 'active', runtime: 'claude-code' },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'given-no-model'),
      'the registry row for given-no-model',
    ).id
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'something nobody named a model for',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const env: NodeJS.ProcessEnv = { ...settings.env }
    delete env[SETTING]
    delete env['MOLE_OFFICE_CHORE_MODEL']
    // FIRST IN THIS GROUP, so no run of an earlier case is still going for this pass to pick up.
    const report = await onePass({ ...settings, env }, watching)
    expect(report.started.filter((run) => run.messageId === messageId)).toEqual([])
    const held = one(report.held.filter((row) => row.messageId === messageId), 'the hold for this message')
    expect(held.because).toBe(NO_MODEL_SAYS.conversation)
    expect(held.because).toContain('on the Settings page')
  }, 40_000)

  it('writes the model onto its own session record', async () => {
    await post('/api/records', {
      kind: 'agent',
      title: 'given-a-model',
      data: { handle: 'given-a-model', state: 'active', runtime: 'claude-code' },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'given-a-model'),
      'the registry row for given-a-model',
    ).id
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'something to answer',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    // THE PERSON'S PRESS, because this agent is fresh: criterion M78.
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const started = one(
      (await onePass({ ...settings, env: { ...settings.env, [SETTING]: 'haiku' } }, watching)).started.filter(
        (run) => run.messageId === messageId,
      ),
      'the run started for this message',
    )

    const record = (await get(`/api/records/${started.session}`)) as { record?: { data: Record<string, unknown> } }
    expect(record.record?.data['model']).toBe('haiku')
  }, 40_000)
})

describe('the runtime page', () => {
  it('says which model runs are given and which layer decided it, the same as the settings layer reads', async () => {
    // THIS CHECKOUT MAY HAVE NAMED ONE. The page reads the world this process runs in, .env under
    // the real environment, and a test cannot unset a line in a file by deleting a key (the
    // 28 August 2026 lesson in settings.mjs; paid for again on 8 September, when the owner's .env
    // named a model and this case, which assumed nobody had, went red on main). So the expectation
    // is read from the same layer, and the sentence for nobody having set it is proved on a built
    // world in the next case.
    const reading = readSettingHere(SETTING)
    const page = (await get('/api/runtime')) as { worker?: { model?: { name: string | null; from: string } } }
    if (reading.source === 'nothing set it') {
      expect(page.worker?.model?.name).toBeNull()
      expect(String(page.worker?.model?.from)).toContain('MOLE_OFFICE_AGENT_MODEL is not set, and the office has no default model.')
    } else {
      expect(page.worker?.model?.name).toBe(String(reading.value).trim())
      expect(String(page.worker?.model?.from)).toContain(`MOLE_OFFICE_AGENT_MODEL says so, from ${reading.source}`)
    }
  })

  it('says nobody set it, and names no model, on a world where nobody has', () => {
    const nowhere = join(outputs, 'no-such-env')
    expect(theModelASettingNamed({}, nowhere)).toBeNull()
    expect(whereTheModelCameFrom({}, nowhere)).toContain('MOLE_OFFICE_AGENT_MODEL is not set, and the office has no default model.')
  })

  it('says the setting decided it once somebody has', async () => {
    process.env[SETTING] = 'haiku'
    const page = (await get('/api/runtime')) as { worker?: { model?: { name: string; from: string } } }
    expect(page.worker?.model?.name).toBe('haiku')
    expect(String(page.worker?.model?.from)).toContain('MOLE_OFFICE_AGENT_MODEL says so')
  })
})
