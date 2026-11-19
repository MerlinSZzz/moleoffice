// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER ROUTER'S HOST AND CONTAINER PARTS, WITH NO OFFICE: the setting, the launcher's lines, the bridge, the key
 * slots file and the unit's text. Item 11 of the key layer (step 2): one provider, DeepSeek, behind a setting that is off.
 *
 * OLD: a dsh run got the real DEEPSEEK_API_KEY in its env file, read from the template's secrets file.
 * NEW: with MOLE_OFFICE_PROVIDER_ROUTER on, the launcher leaves every DEEPSEEK_API_KEY line out and gives a dsh run its
 * run's router token under that name instead, with one line naming the router's socket inside the container. The helper
 * opens a bridge on the container's loopback that carries dsh's requests to that socket. The real key is read only by
 * the router, a host process, from a key slots file of mode 0600 in a folder of mode 0700. With the setting off, nothing
 * of this happens: the same selection, the same bytes, no folder and no request.
 *
 * ITEM 12 (step 3) ADDS OPENCODE GO. The launcher leaves every OPENCODE_API_KEY line out as well, and gives an OpenCode
 * run on Go its token under that name. OpenCode reads no base URL variable, so the bridge points OpenCode's opencode-go
 * provider at itself through OPENCODE_CONFIG_CONTENT, with the token as its key, and keeps every plugin it was given.
 *
 * THE ROUTER'S LINE NAMES THE RUN'S RUNTIME as well as the provider, from the same selection the provider was chosen
 * from, so the bridge never has to guess which program reads the line: the dsh and Go cases expect it.
 *
 * WHAT IS REAL AND WHAT IS NOT. The functions are the shipped ones. Every key and token below is made up for this file.
 * The home is a folder of this file's own; nothing here reads or writes under the machine's own home. The router's
 * sockets are real sockets in a folder of this file's own; the "provider" behind a socket is a stand-in server here.
 * No unit is installed, enabled or started: the unit is checked as text.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED:
 *   - the setting reader takes any word: the refused-values case goes red.
 *   - theRoutedKeysLeftOut drops the key with the setting off, or keeps it with the setting on: the off and on cases go red.
 *   - the bridge listens on every address: the loopback case goes red on the address.
 *   - aRouterFolderFor leaves the folder as umask made it: the 0700 case goes red.
 *   - readTheKeySlots takes a file others can read: the slots case goes red.
 *   - the launcher asks for the router's lines for dsh runs only: the carries case goes red.
 *   - the bridge sets no provider for OpenCode, or drops its plugins: the OpenCode Go bridge case goes red.
 */
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server } from 'node:http'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  THE_ROUTED_PROVIDERS,
  THE_ROUTER_FOLDER_INSIDE,
  THE_ROUTER_VARIABLE,
  aSecretsMark,
  readTheKeySlots,
  theKeySlotsFile,
  theProviderRouterIsOn,
  theProviderRouterUnit,
  theProviderRouterUnitPath,
  theRouterControlSocket,
  theRouterMustCarry,
  theRunCapOfTheRouter,
} from '../src/config/provider-router.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { aRouterFolderFor, theRoutedKeysLeftOut, theRouterLinesForARun } from '../tools/provider-router-host.mjs'
import { openTheBridge } from '../tools/provider-router-bridge.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const ON = { MOLE_OFFICE_PROVIDER_ROUTER: 'on' }
const OFF = { MOLE_OFFICE_PROVIDER_ROUTER: 'off' }
/** A made-up DeepSeek key and a made-up router token, never a real one. */
const MADE_UP_KEY = `not-a-real-deepseek-key-${randomBytes(6).toString('hex')}`
const MADE_UP_TOKEN = `mrt_${randomBytes(32).toString('base64url')}`

let folder = ''
const servers: { close(): unknown }[] = []

/** A refuse that throws its sentence, as the launcher's refuse ends the process with it. */
class Refused extends Error {}
const refuse = (sentence: string): never => { throw new Refused(sentence) }

/** The selection theSecretsFor answers, in the shape tools/sandbox.mjs builds it. */
function aSelection(lines: string[]) {
  return { lines, says: 'Read from a made-up secrets file.', file: '/made-up/secrets.env', quiet: true, warning: null }
}

/** The bytes writeTheEnvFile in tools/sandbox.mjs writes for these lines. */
const envBytes = (lines: readonly string[]) => `${lines.join('\n')}\n`

/** A HTTP request over a unix socket or to a port, answered whole. */
function ask(where: { socketPath: string } | { port: number }, path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  return new Promise((done, failed) => {
    const sent = JSON.stringify(body)
    const req = request({ ...where, ...('port' in where ? { host: '127.0.0.1' } : {}), path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(sent)), ...headers } }, (res: IncomingMessage) => {
      const parts: Buffer[] = []
      res.on('data', (c: Buffer) => parts.push(c))
      res.on('end', () => done({ status: res.statusCode ?? 0, text: Buffer.concat(parts).toString('utf8') }))
    })
    req.on('error', failed)
    req.end(sent)
  })
}

beforeAll(() => {
  folder = aTestDatabaseFolder('pr')
})
afterEach(async () => {
  for (const one of servers.splice(0)) await one.close()
})
afterAll(() => {
  removeThisTestFolder(folder)
})

describe('the setting', () => {
  // MUTATION: the reader takes any word for the setting.
  it('is off unless set on, refuses any other word, and its cap is a number of US dollars or absent', () => {
    expect(theProviderRouterIsOn({})).toBe(false)
    expect(theProviderRouterIsOn(OFF)).toBe(false)
    expect(theProviderRouterIsOn(ON)).toBe(true)
    for (const word of ['yes', 'true', '1', 'On']) expect(() => theProviderRouterIsOn({ MOLE_OFFICE_PROVIDER_ROUTER: word }), word).toThrow(/must be on or off/)
    expect(theRunCapOfTheRouter({})).toBeNull()
    expect(theRunCapOfTheRouter({ MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP: '2.5' })).toBe(2.5)
    for (const word of ['-1', 'ten', 'Infinity', '1e999']) {
      expect(() => theRunCapOfTheRouter({ MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP: word }), word).toThrow(/US dollars/)
    }
  })

  // Condition 2: the setting's own words say what is not routed while it is on. Item 12 adds OpenCode Go.
  it("says in its own words that check views and isolated execs get no DeepSeek key and no OpenCode Go key while it is on, and its name holds no KEY", () => {
    const declared = settingNamed('MOLE_OFFICE_PROVIDER_ROUTER')
    expect(declared.fallback).toBe('off')
    expect(declared.what).toMatch(/check views and isolated execs get no DeepSeek key and no OpenCode Go key/)
    expect(declared.what).toMatch(/an OpenCode run reaches OpenCode Go/)
    expect(declared.what).toMatch(/inspector/)
    for (const name of ['MOLE_OFFICE_PROVIDER_ROUTER', 'MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP']) expect(name).not.toMatch(/KEY|TOKEN|SECRET|PASSWORD/)
    expect(settingNamed('MOLE_OFFICE_PROVIDER_ROUTER_RUN_CAP').fallback).toBeNull()
  })
})

describe("the launcher's lines", () => {
  // Condition 1, for the selection the env file is written from. tests/sandbox-launcher.test.ts holds it for
  // the launcher itself, with up's mounts and an exec's env file.
  it('with the setting off, answers the very selection it was given, so the env file is the same bytes, and makes no folder', () => {
    const selection = aSelection([`DEEPSEEK_API_KEY=${MADE_UP_KEY}`, 'ANOTHER_MADE_UP=kept'])
    const before = envBytes(selection.lines)
    for (const env of [{}, OFF]) {
      for (const names of [undefined, ['DEEPSEEK_API_KEY']]) {
        const routed = theRoutedKeysLeftOut(selection, names, env)
        expect(routed.refusal).toBeNull()
        expect(routed.selection).toBe(selection)
        expect(envBytes(routed.selection.lines)).toBe(before)
      }
    }
    expect(existsSync(join(folder, 'provider-router'))).toBe(false)
  })

  // MUTATION: theRoutedKeysLeftOut keeps the key line with the setting on.
  it('with the setting on, leaves out every DeepSeek key line, keeps the rest, says so, and refuses an exec that names the key', () => {
    const selection = aSelection([`DEEPSEEK_API_KEY=${MADE_UP_KEY}`, 'ANOTHER_MADE_UP=kept', `DEEPSEEK_API_KEY=${MADE_UP_KEY}-again`])
    const routed = theRoutedKeysLeftOut(selection, undefined, ON)
    expect(routed.refusal).toBeNull()
    expect(routed.selection.lines).toEqual(['ANOTHER_MADE_UP=kept'])
    expect(routed.selection.says).toContain(selection.says)
    expect(routed.selection.says).toMatch(/DEEPSEEK_API_KEY/)
    expect(JSON.stringify(routed)).not.toContain(MADE_UP_KEY)
    const named = theRoutedKeysLeftOut(selection, ['DEEPSEEK_API_KEY'], ON)
    expect(named.refusal).toMatch(/DEEPSEEK_API_KEY/)
    expect(named.refusal).toMatch(/router/)
    expect(JSON.stringify(named)).not.toContain(MADE_UP_KEY)
  })

  // Item 12: the router holds the OpenCode Go keys as well.
  it('with the setting on, leaves out every OPENCODE_API_KEY line as well, and refuses an exec that names it', () => {
    const selection = aSelection([`OPENCODE_API_KEY=${MADE_UP_KEY}`, 'ANOTHER_MADE_UP=kept'])
    const routed = theRoutedKeysLeftOut(selection, undefined, ON)
    expect(routed.selection.lines).toEqual(['ANOTHER_MADE_UP=kept'])
    expect(routed.selection.says).toMatch(/OPENCODE_API_KEY/)
    expect(theRoutedKeysLeftOut(selection, ['OPENCODE_API_KEY'], ON).refusal).toMatch(/OPENCODE_API_KEY/)
    expect(theRoutedKeysLeftOut(selection, undefined, OFF).selection).toBe(selection)
  })

  // Item 12. MUTATION: the launcher asks for the router's lines for dsh runs only.
  it('carries dsh and the routed OpenCode providers while leaving other runtimes alone', () => {
    expect(theRouterMustCarry('dsh', 'deepseek/made-up', null)).toBe(true)
    expect(theRouterMustCarry('dsh', 'made-up', 'another-provider')).toBe(true)
    expect(theRouterMustCarry('opencode', 'opencode-go/made-up', null)).toBe(true)
    expect(theRouterMustCarry('opencode', 'made-up', 'opencode-go')).toBe(true)
    expect(theRouterMustCarry('opencode', 'openrouter/made-up', 'openrouter')).toBe(true)
    expect(theRouterMustCarry('opencode', 'openrouter/made-up', null)).toBe(true)
    expect(theRouterMustCarry('claude-code', 'opencode-go/made-up', null)).toBe(false)
    expect(theRouterMustCarry('codex', undefined, undefined)).toBe(false)
  })

  // Condition 3, the host folder. MUTATION: the folder is left as umask made it.
  it("makes the sandbox's router folder of mode 0700, sets it back to 0700, and refuses a link", () => {
    const hostOnly = join(folder, 'run-alpha')
    mkdirSync(hostOnly, { mode: 0o700 })
    const made = aRouterFolderFor(hostOnly)
    expect(made).toBe(join(hostOnly, 'provider-router'))
    expect(statSync(made).mode & 0o777).toBe(0o700)
    chmodSync(made, 0o755)
    expect(aRouterFolderFor(hostOnly)).toBe(made)
    expect(statSync(made).mode & 0o777).toBe(0o700)
    const linked = join(folder, 'run-linked')
    mkdirSync(linked, { mode: 0o700 })
    mkdirSync(join(folder, 'elsewhere'), { mode: 0o700 })
    symlinkSync(join(folder, 'elsewhere'), join(linked, 'provider-router'))
    expect(() => aRouterFolderFor(linked)).toThrow(/link/)
  })

  it("for a dsh run, asks the router to open the sandbox's socket, asks the office for the token from the Casting row, and puts both lines in", async () => {
    const sandboxes = join(folder, 's1')
    const name = 'a'
    const hostOnly = join(sandboxes, '.run', name)
    mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
    aRouterFolderFor(hostOnly)
    const router = createProviderRouter({ sandboxes, slots: [], office: { api: 'http://127.0.0.1:9', key: 'not-a-real-office-key' }, log: () => {} })
    servers.push(router)
    await router.start()
    const asked: { path: string; options: unknown }[] = []
    const selection = { runtime: 'dsh', model: 'made-up-office-model', native: { model: 'made-up-native', provider: 'deepseek-official', variant: null, effort: null }, casting: { id: 7, revision: 'made-up-revision' } }
    const lines = ['SANDBOX_START_EFFORT={}']
    await theRouterLinesForARun(lines, {
      sandboxes, name, run: 'made-up-run', selection, helperSource: `... ${THE_ROUTER_VARIABLE} ...`, refuse,
      ask: async (path: string, options: unknown) => { asked.push({ path, options }); return { status: 201, body: { token: MADE_UP_TOKEN, id: 'rt_made-up' } } },
    })
    expect(asked).toEqual([{ path: '/api/provider-router/run-tokens', options: { method: 'POST', body: { run: 'made-up-run', casting: { id: 7, revision: 'made-up-revision' } } } }])
    expect(lines).toEqual([
      'SANDBOX_START_EFFORT={}',
      `DEEPSEEK_API_KEY=${MADE_UP_TOKEN}`,
      `${THE_ROUTER_VARIABLE}=${JSON.stringify({ provider: 'deepseek', runtime: 'dsh', socket: `${THE_ROUTER_FOLDER_INSIDE}/router.sock` })}`,
    ])
    // Condition 3, the router's sockets.
    const socket = join(hostOnly, 'provider-router', 'router.sock')
    expect(lstatSync(socket).isSocket()).toBe(true)
    expect(lstatSync(socket).mode & 0o777).toBe(0o600)
    const control = theRouterControlSocket(sandboxes)
    expect(lstatSync(control).mode & 0o777).toBe(0o600)
  })

  it("for an OpenCode run on Go, gives the run's token under OPENCODE_API_KEY and names Go in the router's line", async () => {
    const sandboxes = join(folder, 's-go')
    const name = 'a'
    const hostOnly = join(sandboxes, '.run', name)
    mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
    aRouterFolderFor(hostOnly)
    const router = createProviderRouter({ sandboxes, slots: [], office: { api: 'http://127.0.0.1:9', key: 'not-a-real-office-key' }, log: () => {} })
    servers.push(router)
    await router.start()
    const selection = { runtime: 'opencode', model: 'opencode-go/made-up-go', native: { model: 'made-up-go', provider: 'opencode-go', variant: null, effort: null }, casting: { id: 8, revision: 'made-up-revision' } }
    const lines: string[] = []
    await theRouterLinesForARun(lines, {
      sandboxes, name, run: 'made-up-run', selection, helperSource: THE_ROUTER_VARIABLE, refuse,
      ask: async () => ({ status: 201, body: { token: MADE_UP_TOKEN, id: 'rt_made-up' } }),
    })
    expect(lines).toEqual([
      `OPENCODE_API_KEY=${MADE_UP_TOKEN}`,
      `${THE_ROUTER_VARIABLE}=${JSON.stringify({ provider: 'opencode-go', runtime: 'opencode', socket: `${THE_ROUTER_FOLDER_INSIDE}/router.sock` })}`,
    ])
    // A refusal names the run's own program.
    await expect(theRouterLinesForARun([], {
      sandboxes, name, run: 'made-up-run', selection: { ...selection, casting: null }, helperSource: THE_ROUTER_VARIABLE, refuse,
      ask: async () => ({ status: 201, body: { token: MADE_UP_TOKEN } }),
    })).rejects.toThrow(/this opencode run was not started from a Casting row/)
  })

  it('refuses a dsh run, before any token is asked for, for each thing the router cannot do this round', async () => {
    const sandboxes = join(folder, 's2')
    const name = 'a'
    const hostOnly = join(sandboxes, '.run', name)
    mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
    const routed = { runtime: 'dsh', model: 'made-up', native: { model: 'made-up-native', provider: 'deepseek-official', variant: null, effort: null }, casting: { id: 3, revision: 'r' } }
    const asked: string[] = []
    const ask = async (path: string) => { asked.push(path); return { status: 201, body: { token: MADE_UP_TOKEN } } }
    const current = `... ${THE_ROUTER_VARIABLE} ...`
    const tryIt = (selection: unknown, helperSource = current) =>
      theRouterLinesForARun([], { sandboxes, name, run: 'made-up-run', selection, helperSource, ask, refuse })
    // A legacy row, or none: the token's models come only from a Casting row's native data.
    await expect(tryIt(undefined)).rejects.toThrow(/native/)
    await expect(tryIt({ ...routed, casting: null })).rejects.toThrow(/Casting row/)
    // A row whose native provider is not routed.
    await expect(tryIt({ ...routed, native: { ...routed.native, provider: 'another-provider' } })).rejects.toThrow(/routes only/)
    // A helper from before the bridge.
    await expect(tryIt(routed, '... an older helper ...')).rejects.toThrow(/helper/)
    // A sandbox started before the setting was on has no router folder.
    await expect(tryIt(routed)).rejects.toThrow(/start the sandbox again/)
    // No router answers on its control socket.
    aRouterFolderFor(hostOnly)
    await expect(tryIt(routed)).rejects.toThrow(/does not answer/)
    expect(asked).toEqual([])
  })

  it("refuses with the office's own sentence when the office does not issue the token", async () => {
    const sandboxes = join(folder, 's3')
    const name = 'a'
    const hostOnly = join(sandboxes, '.run', name)
    mkdirSync(hostOnly, { recursive: true, mode: 0o700 })
    aRouterFolderFor(hostOnly)
    const router = createProviderRouter({ sandboxes, slots: [], office: { api: 'http://127.0.0.1:9', key: 'not-a-real-office-key' }, log: () => {} })
    servers.push(router)
    await router.start()
    const lines: string[] = []
    const selection = { runtime: 'dsh', model: 'made-up', native: { model: 'made-up-native', provider: 'deepseek-official', variant: null, effort: null }, casting: { id: 3, revision: 'r' } }
    await expect(theRouterLinesForARun(lines, {
      sandboxes, name, run: 'made-up-run', selection, helperSource: THE_ROUTER_VARIABLE, refuse,
      ask: async () => ({ status: 409, body: { error: 'A made-up refusal of the office.' } }),
    })).rejects.toThrow(/A made-up refusal of the office\./)
    expect(lines).toEqual([])
  })
})

describe('the bridge inside the container', () => {
  /** A stand-in for the router's socket: answers each request with what it was asked. */
  async function aStandInSocket(path: string): Promise<{ seen: { url: string; authorization: string | undefined; body: string }[] }> {
    const seen: { url: string; authorization: string | undefined; body: string }[] = []
    const server: Server = createServer((req, res) => {
      const parts: Buffer[] = []
      req.on('data', (c: Buffer) => parts.push(c))
      req.on('end', () => {
        seen.push({ url: req.url ?? '', authorization: req.headers.authorization, body: Buffer.concat(parts).toString('utf8') })
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ answered: true }))
      })
    })
    await new Promise<void>((done) => server.listen(path, done))
    servers.push({ close: () => new Promise((done) => server.close(done)) })
    return { seen }
  }

  it('does nothing when the run was given no router', async () => {
    const env: NodeJS.ProcessEnv = { DEEPSEEK_API_KEY: MADE_UP_TOKEN }
    expect(await openTheBridge(undefined, env, refuse)).toBeNull()
    expect(env).toEqual({ DEEPSEEK_API_KEY: MADE_UP_TOKEN })
  })

  // Condition 3, the loopback. MUTATION: the bridge listens on every address.
  it("listens on the container's loopback only, carries a request to the router's socket, points dsh at itself, and closes", async () => {
    const socket = join(folder, 'b.sock')
    const standIn = await aStandInSocket(socket)
    const env: NodeJS.ProcessEnv = { DEEPSEEK_API_KEY: MADE_UP_TOKEN }
    const bridge = await openTheBridge(JSON.stringify({ provider: 'deepseek', socket }), env, refuse)
    expect(bridge).not.toBeNull()
    servers.push(bridge!)
    expect(bridge!.address).toBe('127.0.0.1')
    expect(env.DEEPSEEK_BASE_URL).toBe(`http://127.0.0.1:${String(bridge!.port)}/deepseek`)
    const answered = await ask({ port: bridge!.port }, '/deepseek/chat/completions', { model: 'made-up-native' }, { authorization: `Bearer ${MADE_UP_TOKEN}` })
    expect(answered).toEqual({ status: 200, text: JSON.stringify({ answered: true }) })
    expect(standIn.seen).toEqual([{ url: '/deepseek/chat/completions', authorization: `Bearer ${MADE_UP_TOKEN}`, body: JSON.stringify({ model: 'made-up-native' }) }])
    await bridge!.close()
    await expect(ask({ port: bridge!.port }, '/deepseek/chat/completions', {})).rejects.toThrow()
  })

  // Item 12. MUTATION: the bridge sets no provider for OpenCode, or drops the plugins it was given.
  it("for OpenCode Go, points OpenCode's opencode-go provider at itself with the run's token, and keeps every plugin and provider it was given", async () => {
    const socket = join(folder, 'g.sock')
    const standIn = await aStandInSocket(socket)
    const given = { plugin: ['file:///made-up/a-plugin.mjs'], provider: { another: { options: { timeout: 5 } } } }
    const env: NodeJS.ProcessEnv = { OPENCODE_API_KEY: MADE_UP_TOKEN, OPENCODE_CONFIG_CONTENT: JSON.stringify(given) }
    const bridge = await openTheBridge(JSON.stringify({ provider: 'opencode-go', socket }), env, refuse)
    servers.push(bridge!)
    expect(bridge!.baseUrl).toBe(`http://127.0.0.1:${String(bridge!.port)}/opencode-go`)
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT!)).toEqual({ ...given, provider: { ...given.provider, 'opencode-go': { options: { baseURL: bridge!.baseUrl, apiKey: MADE_UP_TOKEN } } } })
    expect(Object.keys(env).sort()).toEqual(['OPENCODE_API_KEY', 'OPENCODE_CONFIG_CONTENT'])
    const answered = await ask({ port: bridge!.port }, '/opencode-go/chat/completions', { model: 'made-up-go' }, { authorization: `Bearer ${MADE_UP_TOKEN}` })
    expect(answered.status).toBe(200)
    expect(standIn.seen.at(-1)).toEqual({ url: '/opencode-go/chat/completions', authorization: `Bearer ${MADE_UP_TOKEN}`, body: JSON.stringify({ model: 'made-up-go' }) })
    // With no config given, the bridge's own is the whole of it.
    const bare: NodeJS.ProcessEnv = { OPENCODE_API_KEY: MADE_UP_TOKEN }
    const second = await openTheBridge(JSON.stringify({ provider: 'opencode-go', socket }), bare, refuse)
    servers.push(second!)
    expect(JSON.parse(bare.OPENCODE_CONFIG_CONTENT!)).toEqual({ provider: { 'opencode-go': { options: { baseURL: second!.baseUrl, apiKey: MADE_UP_TOKEN } } } })
    // With no token, or a config that is not JSON, it refuses and opens nothing.
    await expect(openTheBridge(JSON.stringify({ provider: 'opencode-go', socket }), {}, refuse)).rejects.toThrow(/OPENCODE_API_KEY/)
    await expect(openTheBridge(JSON.stringify({ provider: 'opencode-go', socket }), { OPENCODE_API_KEY: MADE_UP_TOKEN, OPENCODE_CONFIG_CONTENT: 'not json' }, refuse)).rejects.toThrow(/OPENCODE_CONFIG_CONTENT/)
  })

  it('refuses with one sentence naming the router when its socket does not answer, or the line is not one', async () => {
    const env: NodeJS.ProcessEnv = {}
    await expect(openTheBridge(JSON.stringify({ provider: 'deepseek', socket: join(folder, 'none.sock') }), env, refuse)).rejects.toThrow(/provider router/)
    await expect(openTheBridge('not json', env, refuse)).rejects.toThrow(/SANDBOX_PROVIDER_ROUTER/)
    await expect(openTheBridge(JSON.stringify({ provider: 'another', socket: '/x.sock' }), env, refuse)).rejects.toThrow(/SANDBOX_PROVIDER_ROUTER/)
    expect(env.DEEPSEEK_BASE_URL).toBeUndefined()
  })
})

describe('the key slots file and the unit', () => {
  /** A made-up home of this file's own, with the slots file where the router reads it. */
  function aHome(name: string, text: string, mode = 0o600, folderMode = 0o700): string {
    const home = join(folder, name)
    const file = theKeySlotsFile(home)
    mkdirSync(join(home, '.config'), { recursive: true })
    mkdirSync(join(home, '.config', 'mole-office'), { mode: folderMode })
    chmodSync(join(home, '.config', 'mole-office'), folderMode)
    writeFileSync(file, text, { mode })
    chmodSync(file, mode)
    return file
  }
  const slots = (key = MADE_UP_KEY) => JSON.stringify({ version: 1, slots: [{ id: 'slot-a', provider: 'deepseek', label: 'Made-up slot A', key }] })

  // MUTATION: readTheKeySlots takes a file others can read.
  it('is read only at mode 0600 in a folder of mode 0700, never through a link, and no refusal holds the key', () => {
    expect(theKeySlotsFile('/made-up-home')).toBe('/made-up-home/.config/mole-office/key-slots.json')
    expect(readTheKeySlots(aHome('good', slots()))).toEqual([{ id: 'slot-a', provider: 'deepseek', label: 'Made-up slot A', key: MADE_UP_KEY }])
    const refusals: string[] = []
    for (const [name, file] of [
      ['loose', aHome('loose', slots(), 0o644)],
      ['open-folder', aHome('open-folder', slots(), 0o600, 0o755)],
      ['not-json', aHome('not-json', `{"version":1,"slots":[{"key":"${MADE_UP_KEY}"`)],
      ['no-provider', aHome('no-provider', JSON.stringify({ version: 1, slots: [{ id: 'slot-a', provider: 'another', label: 'A', key: MADE_UP_KEY }] }))],
      ['missing', join(folder, 'missing', 'key-slots.json')],
    ] as const) {
      let said = ''
      try { readTheKeySlots(file) } catch (error) { said = (error as Error).message }
      expect(said, name).not.toBe('')
      refusals.push(said)
    }
    const linked = aHome('linked-target', slots())
    const home = join(folder, 'linked')
    mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
    chmodSync(join(home, '.config', 'mole-office'), 0o700)
    symlinkSync(linked, theKeySlotsFile(home))
    expect(() => readTheKeySlots(theKeySlotsFile(home))).toThrow(/link/)
    for (const said of refusals) expect(said).not.toContain(MADE_UP_KEY)
  })

  it("names a secret only by its sha256 prefix", () => {
    const mark = aSecretsMark(MADE_UP_KEY)
    expect(mark).toBe(`sha256:${createHash('sha256').update(MADE_UP_KEY).digest('hex').slice(0, 12)}`)
    expect(mark).not.toContain(MADE_UP_KEY)
  })

  it('is a user unit restarted always, run by node from the checkout, given no key, and only written out as text', () => {
    const home = join(folder, 'unit-home')
    const unit = theProviderRouterUnit({ node: '/made-up/node', router: '/made-up/checkout/tools/provider-router.mjs', sandboxes: '/made-up/sandboxes' })
    expect(theProviderRouterUnitPath(home)).toBe(join(home, '.config', 'systemd', 'user', 'mole-office-keyrouter.service'))
    expect(unit).toMatch(/^\[Unit\]\n/)
    expect(unit).toContain('\nType=simple\n')
    expect(unit).toContain('\nRestart=always\n')
    expect(unit).toContain('\nExecStart=/made-up/node /made-up/checkout/tools/provider-router.mjs serve --sandboxes /made-up/sandboxes\n')
    expect(unit).toContain('\nUMask=0077\n')
    expect(unit).not.toMatch(/Environment=.*(KEY|TOKEN)/)
    expect(existsSync(theProviderRouterUnitPath(home))).toBe(false)
  })

  // Item 12: OpenCode Go is the second provider, paid by a subscription, with no base URL variable for OpenCode to read.
  // The values belong to the code: this reads every entry from the table and checks the shape and invariants each one
  // must keep. It copies no provider's address, program, names or paid-by word, so a table value may change without
  // this case going red. The table is frozen so a run cannot reroute another run by editing it at run time.
  it('routes providers with frozen entries, valid key names, base URL names and HTTPS upstreams', () => {
    const declaredFields = ['upstream', 'program', 'nativeProvider', 'modelPrefix', 'keyName', 'baseUrlName', 'named', 'paidBy', 'harnesses', 'paths', 'keyHeader']
    const entries = Object.entries(THE_ROUTED_PROVIDERS)
    expect(entries).toHaveLength(5)
    expect(Object.isFrozen(THE_ROUTED_PROVIDERS)).toBe(true)
    for (const [provider, one] of entries) {
      expect(Object.keys(one).sort(), provider).toEqual([...declaredFields].sort())
      expect(Object.isFrozen(one), provider).toBe(true)
      for (const field of ['program', 'nativeProvider', 'keyName', 'named'] as const) {
        expect(typeof one[field], `${provider}.${field}`).toBe('string')
        expect(one[field].length, `${provider}.${field}`).toBeGreaterThan(0)
      }
      expect(one.modelPrefix === null || (typeof one.modelPrefix === 'string' && one.modelPrefix.length > 0), `${provider}.modelPrefix`).toBe(true)
      expect(['tokens', 'subscription'], `${provider}.paidBy`).toContain(one.paidBy)
      expect(one.upstream, `${provider}.upstream`).toMatch(/^https:\/\//)
      const upstream = new URL(one.upstream)
      expect(upstream.protocol, `${provider}.upstream`).toBe('https:')
      expect(upstream.hostname.length, `${provider}.upstream`).toBeGreaterThan(0)
    }
    const paidBySubscription = entries.filter(([, one]) => one.paidBy === 'subscription')
    expect(paidBySubscription).toHaveLength(1)
    for (const [provider, one] of entries) {
      if (one.paidBy === 'tokens') {
        expect(typeof one.keyName, `${provider}.keyName`).toBe('string')
        expect(one.keyName.length, `${provider}.keyName`).toBeGreaterThan(0)
        expect(typeof one.baseUrlName, `${provider}.baseUrlName`).toBe('string')
        expect(one.baseUrlName.length, `${provider}.baseUrlName`).toBeGreaterThan(0)
      } else {
        expect(one.baseUrlName, `${provider}.baseUrlName`).toBeNull()
      }
    }
  })
})
