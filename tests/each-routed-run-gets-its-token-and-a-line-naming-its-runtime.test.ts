// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH RUN THE PROVIDER ROUTER CARRIES GETS ITS TOKEN AND A LINE NAMING ITS OWN RUNTIME, and the bridge inside the
 * container takes that line and points the run's program at itself.
 *
 * OLD: the router's line named only the provider, so an OpenCode run on DeepSeek, OpenRouter, OpenAI or Anthropic was
 * read by the bridge as the provider's own program, and was pointed at the router through a variable OpenCode does not
 * read. A start on a run filed before it asked the router to open its socket with no wait, so a control socket that took
 * the connection and never answered held the start for ever.
 * NEW: theRouterLinesForARun (tools/provider-router-host.mjs) names the runtime from the same selection the provider was
 * chosen from, and asks GET /slots, with the slots' wait, before it opens the socket:
 *   1. an OpenCode run on each routed provider gets the run's token under that provider's key name, and a line naming
 *      the provider and opencode, which the bridge reads by pointing OpenCode's own provider entry at itself;
 *   2. an OpenCode run and a dsh run on DeepSeek each get a line naming their own runtime, with provider deepseek;
 *   3. with no control socket, and with one nothing answers on, the run is refused with the one sentence that says the
 *      router does not answer, within the wait, and the office is asked for no token.
 *
 * WHAT IS REAL AND WHAT IS NOT. The functions are the shipped ones, and the router is the real one with no slots,
 * listening in a folder of this file's own. The office is a function that hands a made-up token. Every key and token is
 * made up for this file, and no request reaches a provider.
 *
 * MUTATIONS, each alone and put back:
 *   M1. theRouterLinesForARun leaves the runtime out of its line: case 1 goes red on the line and on the bridge.
 *   M2. theRouterLinesForARun names the provider's own program as the runtime: case 2 goes red on the OpenCode line.
 *   M3. theRouterLinesForARun does not ask whether the router answers before it opens: case 3 goes red, held past the wait.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  THE_ROUTED_PROVIDERS,
  THE_ROUTER_FOLDER_INSIDE,
  THE_ROUTER_SOCKET_NAME,
  THE_ROUTER_VARIABLE,
  theRouterControlSocket,
  theRoutesOfTheRouter,
} from '../src/config/provider-router.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { aRouterFolderFor, theRouterIsDown, theRouterLinesForARun } from '../tools/provider-router-host.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

/** A made-up router token, never a real one. */
const MADE_UP_TOKEN = `mrt_${randomBytes(32).toString('base64url')}`
/** How long theRouterLinesForARun may take against a socket nothing answers on: the slots' wait of 5 s, and room. */
const THE_LONGEST_REFUSAL_MS = 9_000

let folder = ''
let made = 0
const servers: { close(): unknown }[] = []

class Refused extends Error {}
const refuse = (sentence: string): never => { throw new Refused(sentence) }

beforeAll(() => {
  folder = aTestDatabaseFolder('rl')
})
afterEach(async () => {
  for (const one of servers.splice(0)) await one.close()
})
afterAll(() => {
  removeThisTestFolder(folder)
})

/** A sandboxes folder with one sandbox, a, that has its router folder, and the host path of a's router socket. */
function aSandbox(): { sandboxes: string; name: string; socket: string } {
  made += 1
  const sandboxes = join(folder, `s${String(made)}`)
  const hostOnly = join(sandboxes, '.run', 'a')
  mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
  return { sandboxes, name: 'a', socket: join(aRouterFolderFor(hostOnly), THE_ROUTER_SOCKET_NAME) }
}

/** The real router, with no slots, for these sandboxes. */
async function theRouterFor(sandboxes: string): Promise<void> {
  const router = createProviderRouter({ sandboxes, slots: [], office: { api: 'http://127.0.0.1:9', key: 'not-a-real-office-key' }, log: () => {} })
  servers.push(router)
  await router.start()
}

/** A selection of the shape the office's start values carry, for a run on this runtime through this native provider. */
function aSelection(runtime: string, nativeProvider: string, modelPrefix: string | null) {
  return { runtime, model: `${modelPrefix ?? ''}made-up-model`, native: { model: 'made-up-model', provider: nativeProvider, variant: null, effort: null }, casting: { id: 11, revision: 'made-up-revision' } }
}

/** theRouterLinesForARun's lines for this selection, with an office that hands the made-up token, and what it asked. */
async function theLinesFor(sandboxes: string, name: string, selection: unknown): Promise<{ lines: string[]; asked: string[] }> {
  const lines: string[] = []
  const asked: string[] = []
  await theRouterLinesForARun(lines, {
    sandboxes, name, run: 'made-up-run', selection, helperSource: THE_ROUTER_VARIABLE, refuse,
    ask: async (path: string) => { asked.push(path); return { status: 201, body: { token: MADE_UP_TOKEN, id: 'rt_made-up' } } },
  })
  return { lines, asked }
}

/** The router's line as the bridge reads it inside the container, with its socket at the host path the router opened. */
function theLineOnTheHost(lines: string[], socket: string): string {
  const raw = lines.find((line) => line.startsWith(`${THE_ROUTER_VARIABLE}=`))
  expect(raw).toBeDefined()
  const line = JSON.parse(raw!.slice(THE_ROUTER_VARIABLE.length + 1))
  expect(line.socket).toBe(`${THE_ROUTER_FOLDER_INSIDE}/${THE_ROUTER_SOCKET_NAME}`)
  return JSON.stringify({ ...line, socket })
}

describe("a routed run's lines", () => {
  const openCodeRoutes = theRoutesOfTheRouter().filter((route) => route.runtime === 'opencode')

  it('names every routed provider OpenCode reaches through the router, so each is a case below', () => {
    expect(openCodeRoutes.map((route) => route.provider)).toEqual(expect.arrayContaining(['deepseek', 'openrouter', 'openai', 'anthropic', 'opencode-go']))
  })

  // Case 1. M1.
  it.each(openCodeRoutes.map((route) => [route.provider, route] as const))(
    'an OpenCode run on %s gets its token under the key name and a line naming opencode, which the bridge points OpenCode at',
    async (provider, route) => {
      const { sandboxes, name, socket } = aSandbox()
      await theRouterFor(sandboxes)
      const { keyName } = THE_ROUTED_PROVIDERS[provider as keyof typeof THE_ROUTED_PROVIDERS]
      const { lines, asked } = await theLinesFor(sandboxes, name, aSelection('opencode', route.nativeProvider, route.modelPrefix))
      expect(asked).toEqual(['/api/provider-router/run-tokens'])
      expect(lines).toEqual([
        `${keyName}=${MADE_UP_TOKEN}`,
        `${THE_ROUTER_VARIABLE}=${JSON.stringify({ provider, runtime: 'opencode', socket: `${THE_ROUTER_FOLDER_INSIDE}/${THE_ROUTER_SOCKET_NAME}` })}`,
      ])
      // The bridge, given the env file's two lines, points OpenCode's own entry for the native provider at itself.
      const env: NodeJS.ProcessEnv = { [keyName]: MADE_UP_TOKEN }
      const bridge = await openTheBridge(theLineOnTheHost(lines, socket), env, refuse)
      expect(bridge).not.toBeNull()
      servers.push(bridge!)
      expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}')).toEqual({ provider: { [route.nativeProvider]: { options: { baseURL: bridge!.baseUrl, apiKey: MADE_UP_TOKEN } } } })
    },
  )

  // Case 2. M2.
  it('an OpenCode run and a dsh run on DeepSeek each get a line naming their own runtime, with provider deepseek', async () => {
    const { sandboxes, name, socket } = aSandbox()
    await theRouterFor(sandboxes)
    const deepseek = THE_ROUTED_PROVIDERS.deepseek
    const openCode = deepseek.harnesses.find((one) => one.runtime === 'opencode')!
    const runs = [
      { runtime: deepseek.program, selection: aSelection(deepseek.program, deepseek.nativeProvider, deepseek.modelPrefix) },
      { runtime: 'opencode', selection: aSelection('opencode', openCode.nativeProvider, openCode.modelPrefix) },
    ]
    expect(runs.map((run) => run.runtime)).toEqual(['dsh', 'opencode'])
    for (const run of runs) {
      const { lines } = await theLinesFor(sandboxes, name, run.selection)
      expect(lines).toContain(`${deepseek.keyName}=${MADE_UP_TOKEN}`)
      const line = JSON.parse(theLineOnTheHost(lines, socket))
      expect({ provider: line.provider, runtime: line.runtime }).toEqual({ provider: 'deepseek', runtime: run.runtime })
      // The bridge points each at itself in its own way: dsh by its base URL variable, OpenCode by its config.
      const env: NodeJS.ProcessEnv = { [deepseek.keyName]: MADE_UP_TOKEN }
      const bridge = await openTheBridge(JSON.stringify(line), env, refuse)
      servers.push(bridge!)
      if (run.runtime === 'dsh') {
        expect(env[deepseek.baseUrlName!]).toBe(bridge!.baseUrl)
        expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined()
      } else {
        expect(env[deepseek.baseUrlName!]).toBeUndefined()
        expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}').provider[openCode.nativeProvider].options.baseURL).toBe(bridge!.baseUrl)
      }
    }
  })
})

describe('a routed run while the router does not answer', () => {
  /** A stand-in on the control socket's path that takes each connection and never answers. */
  async function aSocketNothingAnswersOn(sandboxes: string): Promise<void> {
    const control = theRouterControlSocket(sandboxes)
    mkdirSync(dirname(control), { recursive: true, mode: 0o700 })
    const held: Socket[] = []
    const server: Server = createServer((socket) => { held.push(socket) })
    await new Promise<void>((done) => server.listen(control, done))
    servers.push({ close: () => new Promise<void>((done) => { for (const socket of held) socket.destroy(); server.close(() => done()) }) })
  }

  // Case 3. M3.
  it.each([['no control socket', false], ['a control socket nothing answers on', true]] as const)(
    'with %s, is refused with the sentence that says so, within the wait, and asks the office for nothing',
    async (_what, silent) => {
      const { sandboxes, name } = aSandbox()
      if (silent) await aSocketNothingAnswersOn(sandboxes)
      const route = theRoutesOfTheRouter().find((one) => one.runtime === 'opencode')!
      const began = Date.now()
      let asked: string[] | null = null
      const lines: string[] = []
      const refused = await Promise.race([
        theRouterLinesForARun(lines, {
          sandboxes, name, run: 'made-up-run', selection: aSelection('opencode', route.nativeProvider, route.modelPrefix), helperSource: THE_ROUTER_VARIABLE, refuse,
          ask: async (path: string) => { (asked ??= []).push(path); return { status: 201, body: { token: MADE_UP_TOKEN } } },
        }).then(() => 'started', (why: unknown) => (why instanceof Refused ? why.message : `threw ${String(why)}`)),
        new Promise<string>((done) => setTimeout(() => done('still held'), THE_LONGEST_REFUSAL_MS)),
      ])
      expect(refused).toBe(theRouterIsDown(sandboxes))
      expect(Date.now() - began).toBeLessThan(THE_LONGEST_REFUSAL_MS)
      expect(asked).toBeNull()
      expect(lines).toEqual([])
    },
    THE_LONGEST_REFUSAL_MS + 5_000,
  )
})
