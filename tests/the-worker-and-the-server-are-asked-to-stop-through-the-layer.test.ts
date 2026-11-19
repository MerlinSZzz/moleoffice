// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER ASKS ITS WORKER TO STOP THROUGH THE SYSTEM LAYER, AND THE WORKER AND THE SERVER LISTEN FOR THE ASK. Wave
 * 13t, item 7: a clean stop without SIGTERM.
 *
 * The server stopped its worker with killProcessGroup(group, 'SIGTERM') in two places: the server's own shutdown, and
 * the stop the pause door and the shutdown door make (stopTheWorker in src/server/index.ts). Windows has no SIGTERM, so
 * both now ask the layer, which sends SIGTERM to the group on Linux and the Mac and a stop request on the group's pipe on
 * Windows (tests/a-stop-request-on-windows-reaches-the-program-that-listens.test.ts). The worker and the server listen
 * for that request beside their SIGTERM handlers. The cases:
 *
 *   1. askAProcessGroupToStop in src/server/lib/resources.ts, on Linux and the Mac, sends exactly what
 *      killProcessGroup(group, 'SIGTERM') sends, (-group, 'SIGTERM'), and ESRCH and EPERM come back as the same error;
 *   2. the server's listenForAStopRequest, on Linux and the Mac, calls nothing, says nothing and leaves the group's
 *      variable where it was, so a SIGTERM stays the only ask there;
 *   3. on Windows the ask is refused in words that name the group's pipe when nothing listens on it, and
 *      askTheMessageWorkerToStop in src/server/lib/pausing.ts keeps those words in a refusal that says the worker may
 *      still be running and that nothing was paused or shut down. A Linux reason gets its full stop;
 *   4. the pause door and the shutdown door, handed a worker stop that asks on Windows, answer 503 with those words,
 *      and the shutdown door does not shut the server down;
 *   5. askAProcessGroupToStop and killProcessGroup, the two doors to the group signal, refuse a group of 0, 1 or -5 in
 *      the ledger's words, and NaN or 1.5 as not a whole number, before anything is sent. Group 0 is this server's
 *      own group, and a signal to -1 reaches every process this user owns;
 *   6. the text of the three files, because the worker and the server cannot start here without a whole office: no
 *      stop of the worker in src/server/index.ts signals it with killProcessGroup any more, both ask, and the server
 *      listens with its shutdown. src/worker/index.ts listens beside its SIGTERM handler and stands down as SIGTERM
 *      makes it, and src/worker/runtimes/os.ts hands the listener to the layer.
 *
 * WHAT IS REAL: the layer, the server's two functions, and the two doors on a scratch office in this process (`freshDb`
 * and `apiApp`), never the live office. process.kill is spied on and sends nothing. The Windows ask is made on Linux,
 * where the pipe's name is a path that is not there, so it meets ENOENT. Nothing here has run on Windows (item 21).
 *
 * Mutations, in the commit message that moved the callers.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_GROUP_VARIABLE } from '../src/config/systems/windows-starts.mjs'
import { theStopPipeOf } from '../src/config/systems/windows-groups.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const REPO = join(import.meta.dirname, '..')

const anError = (code: string) => Object.assign(new Error(`made-up ${code}`), { code })

/** The words a Windows ask ends with when nothing answers on group 4243's pipe. */
const NOT_ASKED = 'So group 4243 was not asked to stop, and it may still be running.'

/** The words the server's refusal starts with, for group 4243. */
const THE_WORKER_WAS_NOT_ASKED =
  'The message worker in group 4243 could not be asked to stop, so no run was paused and Mole Office was not shut ' +
  'down. It may still be running. The ask was refused: '

// lib/resources.ts opens a database when it loads, so it and lib/pausing.ts are loaded after a throwaway one is named.
let t: TestDb
let app: FastifyInstance
let res: typeof import('../src/server/lib/resources.ts')
let pausing: typeof import('../src/server/lib/pausing.ts')
let office: typeof import('../src/server/lib/office-pause.ts')

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  pausing = await import('../src/server/lib/pausing.ts')
  office = await import('../src/server/lib/office-pause.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  office.thisOfficePausesWith(null)
  await app.close()
  t.close()
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env[THE_GROUP_VARIABLE]
})

describe("the server's stop of its worker", () => {
  it('1: asks with SIGTERM to the group on Linux and the Mac, as killProcessGroup did, and throws back what it throws', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    res.LINUX_PROBE.killProcessGroup(4321, 'SIGTERM')
    const before = kill.mock.calls.splice(0)
    await res.askAProcessGroupToStop(4321, 'linux')
    await res.askAProcessGroupToStop(4321, 'darwin')
    expect(before).toEqual([[-4321, 'SIGTERM']])
    expect(kill.mock.calls).toEqual([before[0], before[0]])
    for (const code of ['ESRCH', 'EPERM']) {
      const thrown = anError(code)
      kill.mockImplementation(() => {
        throw thrown
      })
      await expect(res.askAProcessGroupToStop(4321, 'linux')).rejects.toBe(thrown)
      await expect(res.askAProcessGroupToStop(4321, 'darwin')).rejects.toBe(thrown)
    }
  })

  it("2: is listened for by the server on Linux and the Mac with nothing, so SIGTERM stays the only ask there", () => {
    process.env[THE_GROUP_VARIABLE] = '4242'
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const onStop = vi.fn()
    const say = vi.fn()
    expect(res.listenForAStopRequest(onStop, say, 'linux')).toBeUndefined()
    expect(res.listenForAStopRequest(onStop, say, 'darwin')).toBeUndefined()
    expect(onStop).not.toHaveBeenCalled()
    expect(say).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
    expect(process.env[THE_GROUP_VARIABLE]).toBe('4242')
  })

  it('3: is refused on Windows in words naming the group pipe, and the refusal says the worker may still be running', async () => {
    const asked = await res.askAProcessGroupToStop(4243, 'win32').then(
      () => null,
      (error: unknown) => error as Error & { code?: unknown },
    )
    expect(asked).toBeInstanceOf(Error)
    expect(asked?.message).toContain(theStopPipeOf(4243))
    expect(asked?.message.endsWith(NOT_ASKED)).toBe(true)
    const refused = await pausing.askTheMessageWorkerToStop(4243, 'win32').then(
      () => null,
      (error: unknown) => error as Error & { status?: unknown },
    )
    expect(refused?.constructor.name).toBe('PanelError')
    expect(refused?.status).toBe(503)
    expect(refused?.message).toBe(`${THE_WORKER_WAS_NOT_ASKED}${asked?.message ?? ''}`)
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw anError('EPERM')
    })
    await expect(pausing.askTheMessageWorkerToStop(4243, 'linux')).rejects.toThrow(`${THE_WORKER_WAS_NOT_ASKED}made-up EPERM.`)
  })

  it('4: is refused at the pause door and the shutdown door in those words, and the server is not shut down', async () => {
    const owner = {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      ...thePersonsKeyHeader(join(dirname(t.file), 'keys.json')),
    }
    const askOnWindows = async () => {
      await pausing.askTheMessageWorkerToStop(4243, 'win32')
      return 'The stand-in message worker stopped.'
    }
    const shutDowns: string[] = []
    office.thisOfficePausesWith({ stopWorker: askOnWindows, startWorker: async () => 'The stand-in message worker started.' })
    pausing.thisServerShutsDownWith({ stopTheWorker: askOnWindows, shutDown: (why) => shutDowns.push(why) })
    const paused = await app.inject({ method: 'POST', url: '/api/office/pause', headers: owner, payload: { why: 'A made-up pause.' } })
    expect(paused.statusCode, paused.body).toBe(503)
    expect(paused.body).toContain(THE_WORKER_WAS_NOT_ASKED)
    expect(paused.body).toContain(NOT_ASKED)
    const shut = await app.inject({ method: 'POST', url: '/api/office/shut-down', headers: owner, payload: { why: 'A made-up shutdown.' } })
    expect(shut.statusCode, shut.body).toBe(503)
    expect(shut.body).toContain(THE_WORKER_WAS_NOT_ASKED)
    expect(shut.body).toContain(NOT_ASKED)
    expect(shutDowns).toEqual([])
  })

  it('5: refuses a group number that is not a whole number above 1, at both doors to the group signal, before sending', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    for (const group of [0, 1, -5]) {
      const words = `Refusing to signal process group ${String(group)}. That is init, or every process there is.`
      for (const platform of ['linux', 'darwin', 'win32']) await expect(res.askAProcessGroupToStop(group, platform)).rejects.toThrow(words)
      for (const signal of ['SIGTERM', 'SIGKILL'] as const) expect(() => res.LINUX_PROBE.killProcessGroup(group, signal)).toThrow(words)
      expect(() => res.theProbeForThisPlatform('darwin').killProcessGroup(group, 'SIGTERM')).toThrow(words)
    }
    for (const group of [Number.NaN, 1.5]) {
      const words = `Refusing to signal process group ${String(group)}. A process group is a whole number above 1.`
      for (const platform of ['linux', 'darwin', 'win32']) await expect(res.askAProcessGroupToStop(group, platform)).rejects.toThrow(words)
      expect(() => res.LINUX_PROBE.killProcessGroup(group, 'SIGKILL')).toThrow(words)
    }
    expect(kill).not.toHaveBeenCalled()
  })
})

describe('the three files that ask and listen', () => {
  /** A file's code, its comments taken out. */
  const codeOf = (file: string) =>
    readFileSync(join(REPO, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('6: the server asks and listens, and the worker listens beside its SIGTERM handler and stands down as it does', () => {
    const server = codeOf('src/server/index.ts')
    expect(server).not.toContain("killProcessGroup(theWorker.pgid, 'SIGTERM')")
    expect(server).toContain('await askAProcessGroupToStop(theWorker.pgid)')
    expect(server).toContain('await askTheMessageWorkerToStop(theWorker.pgid)')
    expect(server).toMatch(/listenForAStopRequest\(\(\) => \{\s*void shutdown\('a stop request received'\)\s*\}/)
    const worker = codeOf('src/worker/index.ts')
    const sigterm = worker.indexOf("process.on('SIGTERM', () => {\n    standDown('it was asked to stop')")
    const listens = worker.search(/listenForAStopRequest\(\(\) => \{\s*standDown\('it was asked to stop'\)\s*\}/)
    expect(sigterm).toBeGreaterThan(0)
    expect(listens).toBeGreaterThan(sigterm)
    expect(worker.slice(sigterm, listens)).not.toMatch(/\n}\n/)
    expect(codeOf('src/worker/runtimes/os.ts')).toContain('thisSystem().groups.listenForAStopRequest(onStop, say)')
  })
})
