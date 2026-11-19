// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** The Kimi completion previously needed no submitted work. Its fake output now gets an explicit record completion note through the real sealer; adapter/program/version assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * WHICH PROGRAM RAN A RUN, WHEN THE MACHINE HOLDS THE SAME TOOL TWICE.
 *
 * Problem `cP2qOXQoYRcv`. The owner's machine had Codex installed twice — a root-owned
 * `/usr/local/bin/codex` at 0.137.0 from 8 June and `~/.nvm/versions/node/v22.23.2/bin/codex` at
 * 0.147.0 from 17 August — and every adapter resolves its command through `PATH`. So a worker
 * started from a shell that sourced nvm ran a different Codex from one that did not, and nothing on
 * the run said which. Every version this repository records was measured against one of them and
 * written down as a fact about "codex". The owner removed the older install on 5 September 2026,
 * which settles that pair and not the question: PATH is still what decides, and this is about what
 * ran rather than about how many Codexes exist today.
 *
 * WHAT IS REAL HERE. The programs are real files this test writes into a temporary directory and a
 * real `PATH` is built out of them, so `whereItIs` resolves and `--version` runs exactly as they do
 * on the owner's machine. Nothing pretends to be Codex: the point is two programs of one name at two
 * versions, and any two will do.
 *
 * NO INSTALL ON THE OWNER'S MACHINE IS TOUCHED, by this test or by the fix. What changed is that
 * the run says which program answered.
 *
 * THE LAST BLOCK IN THIS FILE IS ABOUT A FOURTH TOOL RATHER THAN A SECOND INSTALL. Kimi CLI was
 * added on 5 September 2026, and the thing worth proving about it is that the worker starts it the
 * way it starts the other three — one `adapterFor`, one `theProgramThatRan`, no branch of its own —
 * so that the record of a Kimi run carries the program and the version without anything having been
 * written for Kimi to make it.
 */

import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { CHAPTERS_SOURCE, RULES_SOURCE, SKILL_SOURCE, USER_PART_SOURCE } from '../src/worker/rules.ts'
import { theProgramThatRan } from '../src/worker/runtimes/os.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

/** Everything this file wrote, removed at the end. */
const scratch: string[] = []

/** A directory of its own, cleaned up afterwards. */
function aDirectory(): string {
  const made = mkdtempSync(join(tmpdir(), 'mole-office-which-program-'))
  scratch.push(made)
  return made
}

/** Write an executable shell script called `name` into `dir`, and give back its path. */
function aProgram(dir: string, name: string, body: string): string {
  const path = join(dir, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

describe('which of two programs of the same name answered', () => {
  it('gives the path and the version of the one this PATH finds, not the other one', () => {
    // TWO INSTALLS OF ONE NAME, which is the whole of problem cP2qOXQoYRcv.
    const older = aDirectory()
    const newer = aDirectory()
    aProgram(older, 'codex', 'echo "codex-cli 0.137.0"')
    aProgram(newer, 'codex', 'echo "codex-cli 0.147.0"')

    const front = theProgramThatRan('codex', `${newer}:${older}`)
    const behind = theProgramThatRan('codex', `${older}:${newer}`)

    // THE SAME COMMAND, THE SAME TWO PROGRAMS, TWO DIFFERENT ANSWERS. Which one runs is decided by
    // the PATH the worker was started with, and now the answer says so instead of leaving it out.
    expect(front.path).toBe(join(newer, 'codex'))
    expect(front.version).toBe('codex-cli 0.147.0')
    expect(front.versionWasRead).toBe(true)

    expect(behind.path).toBe(join(older, 'codex'))
    expect(behind.version).toBe('codex-cli 0.137.0')
    expect(behind.versionWasRead).toBe(true)
  })

  it('asks the program once and remembers, so a run does not cost a process', () => {
    const dir = aDirectory()
    const counted = join(dir, 'times-it-was-asked')
    aProgram(dir, 'codex', `echo asked >> ${counted}\necho "codex-cli 0.147.0"`)

    const first = theProgramThatRan('codex', dir)
    const second = theProgramThatRan('codex', dir)
    const third = theProgramThatRan('codex', dir)

    expect(first.version).toBe('codex-cli 0.147.0')
    expect(second.version).toBe(first.version)
    expect(third.version).toBe(first.version)
    // ONCE. The worker is one process and this is what "once per worker start" is.
    expect(readFileSync(counted, 'utf8').trim().split('\n')).toEqual(['asked'])
  })

  it('reads a version a program prints on its error stream, because some do', () => {
    const dir = aDirectory()
    aProgram(dir, 'codex', 'echo "codex-cli 0.147.0" 1>&2')

    const read = theProgramThatRan('codex', dir)

    expect(read.version).toBe('codex-cli 0.147.0')
    expect(read.versionWasRead).toBe(true)
  })
})

describe('a version that could not be read says so, and is never a guess', () => {
  it('says nothing of that name is on this PATH, and gives no path', () => {
    const empty = aDirectory()

    const read = theProgramThatRan('codex', empty)

    expect(read.path).toBeNull()
    expect(read.versionWasRead).toBe(false)
    expect(read.version).toContain('nothing of that name is on this PATH')
  })

  it('names the exit code when the program refuses the question', () => {
    const dir = aDirectory()
    aProgram(dir, 'codex', 'echo "unknown option --version" 1>&2\nexit 3')

    const read = theProgramThatRan('codex', dir)

    // THE PATH IS STILL KNOWN. Which program ran and what version it is are two facts, and failing
    // to read the second does not lose the first.
    expect(read.path).toBe(join(dir, 'codex'))
    expect(read.versionWasRead).toBe(false)
    expect(read.version).toContain('exited 3')
  })

  it('says the program printed nothing rather than storing an empty version', () => {
    const dir = aDirectory()
    aProgram(dir, 'codex', 'exit 0')

    const read = theProgramThatRan('codex', dir)

    expect(read.versionWasRead).toBe(false)
    expect(read.version).toContain('printed nothing')
    // AND IT IS NOT AN EMPTY STRING, which a reader would take for a version nobody wrote down.
    expect(read.version.trim()).not.toBe('')
  })
})

/**
 * THE RUN'S OWN RECORD SAYS WHICH PROGRAM RAN IT.
 *
 * The two above are about the reading. This is about where it lands, and it drives the real worker
 * against a real server.
 *
 * HOW TWO PROGRAMS OF ONE NAME ARE ARRANGED HERE. The fake runtime adapter runs `node`, and this
 * test puts a second `node` at the front of the worker's `PATH`: a script that answers `--version`
 * with a version of its own and hands every other invocation to the real one. So the worker resolves
 * a different `node` from the one running this test, the run still works, and the session record has
 * to name the one that actually ran. That is exactly the shape of the two Codex installs.
 */
describe('the session record names the program that ran and the version it printed', () => {
  let t: TestDb
  let app: FastifyInstance
  let settings: WorkerSettings
  let outputs: string
  let shim: string
  const watching: Parameters<typeof onePass>[1] = []

  const AS_THE_OWNER = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
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

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    supplyRuntimeSubmissions(t, app)
    await app.ready()
    await app.listen({ host: '127.0.0.1', port: 0 })
    outputs = aDirectory()

    // THE SECOND `node`, in front of the real one. It answers --version with a line nothing else on
    // this machine prints, and passes everything else to the node running this test.
    const front = join(aDirectory(), 'bin')
    mkdirSync(front, { recursive: true })
    shim = aProgram(
      front,
      'node',
      `if [ "$1" = "--version" ]; then echo "v0.0.0-the-node-at-the-front-of-PATH"; exit 0; fi\nexec ${process.execPath} "$@"`,
    )

    settings = {
      api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
      workspace: 'default',
      session: null,
      stopWithPid: null,
      checkout: aCheckoutForATestRun(),
      runs: 2,
      hops: 3,
      outputRoot: outputs,
      env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE, PATH: `${front}:${process.env['PATH'] ?? ''}` },
    }
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('writes the whole path and the version the program itself printed', async () => {
    await post('/api/records', {
      kind: 'agent',
      title: 'which-program',
      data: { handle: 'which-program', state: 'active', runtime: 'claude-code' },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'which-program'),
      'the registry row for which-program',
    ).id
    const sent = await post('/api/records', {
      kind: 'message',
      title: 'a message that becomes a run',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: every agent in this file
    // is fresh, so a message to one waits for the person's press. What is measured here is WHICH PROGRAM ran.
    await post(`/api/messages/${(sent['record'] as { id: string }).id}/start-an-agent`, {})

    const report = await onePass(settings, watching)
    const started = one(report.started, 'the run that was started')

    const whole = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    const data = whole.record?.data ?? {}

    // THE PROGRAM THAT RAN, not the word for the tool. `runtime` says the word and this says the file.
    expect(data['ranProgram']).toBe(shim)
    expect(data['ranProgram']).not.toBe(process.execPath)
    // AND WHAT THAT PROGRAM SAID ITS VERSION WAS, which is the shim's line and not this node's.
    expect(data['ranProgramVersion']).toBe('v0.0.0-the-node-at-the-front-of-PATH')
    expect(data['ranProgramVersion']).not.toBe(process.version)
  }, 60_000)
})


/**
 * A FOURTH TOOL GOES THROUGH THE SAME ONE PLACE, AND ITS RECORD SAYS WHAT RAN IT.
 *
 * The worker picks an adapter with `adapterFor` and asks `theProgramThatRan` once, for every
 * adapter, before it starts anything. Nothing about that is per-tool, so adding Kimi CLI needed no
 * code in the worker at all — and a claim like that is worth a test, because the way it would go
 * wrong is a second code path somebody adds later.
 *
 * THE REAL KIMI ADAPTER IS USED HERE, not the fake runtime: `MOLE_OFFICE_FAKE_RUNTIME` is left
 * unset so `adapterFor` returns `KimiAdapter`, and a stand-in program called `kimi` sits at the
 * front of the worker's PATH. It is not a pretence about Kimi CLI. It answers `--version` with a
 * line nothing else on this machine prints, and prints the one JSON object Kimi prints with
 * `--output-format stream-json --final-message-only`, which was read out of Kimi CLI 1.50.0 itself
 * on 5 September 2026.
 */
describe('the worker starts a Kimi run the same way it starts the others', () => {
  let t: TestDb
  let app: FastifyInstance
  let settings: WorkerSettings
  let outputs: string
  let standIn: string
  /**
   * THE CHECKOUT THE STAND-IN IS GIVEN WITH -w: a throwaway folder, not this checkout (measurement 4 of 24 September,
   * VSmfXm6Bf1D8). The worker gives a run its checkout as the working folder, and a program given a folder
   * counts as reading everything under it, so handing the stand-in this checkout kept every document from landing alone
   * . The worker reads three files from its checkout before it starts a run (the rules, their
   * chapters, and the skill's section on leading), so the throwaway folder is given copies of those three and nothing
   * else.
   */
  let checkout: string
  const watching: Parameters<typeof onePass>[1] = []

  const AS_THE_OWNER = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
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

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    supplyRuntimeSubmissions(t, app)
    await app.ready()
    await app.listen({ host: '127.0.0.1', port: 0 })
    outputs = aDirectory()
    const front = join(aDirectory(), 'bin')
    mkdirSync(front, { recursive: true })
    standIn = aProgram(
      front,
      'kimi',
      'if [ "$1" = "--version" ]; then echo "kimi, version 1.50.0-a-stand-in"; exit 0; fi\n' +
        'echo \'{"role":"assistant","content":"Read it."}\'',
    )
    checkout = aDirectory()
    for (const file of [RULES_SOURCE, USER_PART_SOURCE, CHAPTERS_SOURCE, SKILL_SOURCE]) {
      mkdirSync(join(checkout, file, '..'), { recursive: true })
      copyFileSync(join(CHECKOUT, file), join(checkout, file))
    }
    settings = {
      api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
      workspace: 'default',
      session: null,
      stopWithPid: null,
      checkout,
      runs: 2,
      hops: 3,
      outputRoot: outputs,
      // NO FAKE RUNTIME SETTING. This is the real Kimi adapter, resolving a real program on a PATH.
      //
      // THE MADE-UP KEY IS WHAT LETS THE RUN START AT ALL. Since criterion U2 the Kimi adapter
      // refuses before it starts anything when no key is set anywhere, instead of dropping the key
      // from the child environment in silence and letting the refusal happen inside Kimi CLI's own
      // error four layers down. This case is about what the session says the program and the
      // version were, so it needs a run that starts. The value is obviously not a key, it is this
      // stack's own environment and not the office's key file, and the stand-in program ignores it.
      // The refusal itself is driven by
      // `tests/the-office-keys-are-two-and-each-tool-is-asked-read-only.test.ts`, which is where it
      // belongs; taking this line out makes this case red with that refusal's sentence.
      //
      // THE DATABASE OF THE OFFICE THE WORKER TALKS TO, so the worker reads the office's own key beside it and sends
      // that key, as it does in an office with a key file.
      env: { PATH: `${front}:${process.env['PATH'] ?? ''}`, KIMI_API_KEY: 'not-a-real-key-for-the-program-test', MOLE_OFFICE_DB: t.file },
    }
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('files a session naming the runtime, the program and the version, with nothing written for Kimi', async () => {
    await post('/api/records', {
      kind: 'agent',
      title: 'served-by-kimi',
      data: { handle: 'served-by-kimi', state: 'active', runtime: 'kimi' },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one(
      (listed.agents ?? []).filter((a) => a.handle === 'served-by-kimi'),
      'the registry row for served-by-kimi',
    ).id
    const sent = await post('/api/records', {
      kind: 'message',
      title: 'a message that becomes a Kimi run',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: every agent in this file
    // is fresh, so a message to one waits for the person's press. What is measured here is WHICH PROGRAM ran.
    await post(`/api/messages/${(sent['record'] as { id: string }).id}/start-an-agent`, {})

    const report = await onePass(settings, watching)
    const started = one(report.started, 'the run that was started')
    expect(started.runtime).toBe('kimi')

    const whole = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    const data = whole.record?.data ?? {}

    // THE WORD FOR THE TOOL, AND THE FILE THAT ACTUALLY RAN. Two facts, both on the record, and
    // neither of them written by anything Kimi-specific: the worker asks once, for every adapter.
    expect(data['runtime']).toBe('kimi')
    expect(data['ranProgram']).toBe(standIn)
    expect(data['ranProgramVersion']).toBe('kimi, version 1.50.0-a-stand-in')

    // AND THE CONVERSATION IS ALREADY ON THE RECORD, before the run has ended. It has to be: a
    // worker restarted mid-run rebuilds the handle from this record, and an id that was chosen
    // rather than read out of the output has nowhere else to come back from.
    expect(data['providerSession']).toBe(`mole-office-${started.session}`)

    // AND THEN THE RUN ENDS AND THE WORKER READS IT, on the pass after the one that started it.
    for (let i = 0; i < 200; i += 1) {
      const ended = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
      if (ended.record?.data?.['state'] !== 'running') break
      await onePass(settings, watching)
      await new Promise((go) => setTimeout(go, 50))
    }
    const after = (await get(`/api/records/${started.session}`)) as { record?: { data?: Record<string, unknown> } }
    const ended = after.record?.data ?? {}

    // THE CONVERSATION ON THE RECORD IS THE ONE THIS ADAPTER CHOSE, built from Mole Office's own id
    // for the run. The other three tools mint their own and it is read back out of their output.
    expect(ended['providerSession']).toBe(`mole-office-${started.session}`)
    expect(ended['state']).toBe('finished')

    // AND WHAT THE PROGRAM PRINTED REACHED THE CONVERSATION, read out of the one JSON object.
    const answers = (await get(`/api/records?kind=message&shape=full`)) as { records?: { data?: Record<string, unknown> }[] }
    const said = (answers.records ?? []).map((r) => String(r.data?.['body'] ?? ''))
    expect(said, `the messages filed were: ${said.join(' | ')}`).toContain('Read it.')
  }, 60_000)
})
