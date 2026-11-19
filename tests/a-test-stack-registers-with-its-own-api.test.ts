// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP REGISTERS WHERE THIS PROCESS REALLY REACHES THE API: A PORT SET IN THE REAL
 * ENVIRONMENT BEATS AN ADDRESS THAT ONLY THE CHECKOUT'S `.env` NAMES.
 *
 * Until 5 September 2026 the registering plugin took `apiAddressFrom(env)`, which prefers a
 * MOLE_OFFICE_API named in `.env` to a MOLE_OFFICE_PORT set in the real environment. A Vite that a
 * test or a worktree started with only the port set served pages that called its own API while it
 * wrote its session row into the owner's live database, where it said "running" for ever: 268
 * rows titled "The browser app" in two days. Problem `f1uCdpMEB1hs`.
 *
 * Two halves. The rule itself, `apiAddressForThisProcess`, is checked against a `.env` written for
 * the test, so every layer is real and none is the checkout's. Then the plugin is resolved from the
 * real vite.config.ts with the port set in the environment, and every request it makes is recorded:
 * all of them must go to that port.
 */
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'
import { apiAddressForThisProcess } from '../src/config/settings.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_PORT_THE_PAGE_IS_TOLD = 29777

describe('where this process reaches the API', () => {
  let dir = ''
  let envFile = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-own-api-'))
    envFile = join(dir, '.env')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('takes a port set in the environment over an address the file names', () => {
    writeFileSync(envFile, 'MOLE_OFFICE_API=http://127.0.0.1:9\nMOLE_OFFICE_PORT=9\n')
    expect(apiAddressForThisProcess({ MOLE_OFFICE_PORT: '29777' }, envFile)).toBe('http://127.0.0.1:29777')
  })
  it('takes an address set in the environment, whatever the file says', () => {
    writeFileSync(envFile, 'MOLE_OFFICE_API=http://127.0.0.1:9\n')
    expect(apiAddressForThisProcess({ MOLE_OFFICE_API: 'http://127.0.0.1:29777/', MOLE_OFFICE_PORT: '5' }, envFile)).toBe(
      'http://127.0.0.1:29777',
    )
  })
  it('takes the address the file names when the environment sets nothing', () => {
    writeFileSync(envFile, 'MOLE_OFFICE_API=http://127.0.0.1:29777\nMOLE_OFFICE_PORT=9\n')
    expect(apiAddressForThisProcess({}, envFile)).toBe('http://127.0.0.1:29777')
  })
  it('takes the port the file names when it names no address', () => {
    writeFileSync(envFile, 'MOLE_OFFICE_PORT=29777\n')
    expect(apiAddressForThisProcess({}, envFile)).toBe('http://127.0.0.1:29777')
  })
})

let asked: string[] = []
let realFetch: typeof fetch
let was: Record<string, string | undefined> = {}

function aMoleOfficeThatRecordsWhoAsked(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    asked.push(`${String(init?.method ?? 'GET')} ${url.origin}${url.pathname}`)
    if (url.pathname === '/api/health') {
      return new Response('{"ok":true}', {
        headers: {
          'content-type': 'application/json',
          'x-mole-office-world': `db=ab12cd34ef567890; repo=${THE_TEST_FIXTURE_ROOT}/px-somewhere; port=29777; head=abc1234; standing=scratch`,
        },
      })
    }
    if (url.pathname === '/api/records') {
      return new Response(JSON.stringify({ record: { id: 'aSessionRecord' } }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.pathname === '/api/resources') {
      return new Response(JSON.stringify({ resource: { id: 'aResourceRow' } }), { headers: { 'content-type': 'application/json' } })
    }
    return new Response('{}', { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

async function theRegisteringPlugin(): Promise<Plugin> {
  const resolved = await resolveConfig({ configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent' }, 'serve')
  const found = resolved.plugins.find((one) => one.name === 'mole-office:register-this-browser-app')
  if (found === undefined) throw new Error('vite.config.ts no longer has a plugin that registers the browser app')
  return found as Plugin
}

async function start(plugin: Plugin): Promise<void> {
  const server = { httpServer: new EventEmitter() }
  const configure = plugin.configureServer
  const run = typeof configure === 'function' ? configure : configure?.handler
  if (run === undefined) throw new Error('the plugin no longer configures the server')
  await (run as (s: unknown) => unknown)(server)
  server.httpServer.emit('listening')
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('the browser app registers where its pages call', () => {
  beforeEach(() => {
    asked = []
    realFetch = globalThis.fetch
    globalThis.fetch = aMoleOfficeThatRecordsWhoAsked()
    was = { MOLE_OFFICE_NO_WATCH: process.env['MOLE_OFFICE_NO_WATCH'], MOLE_OFFICE_PORT: process.env['MOLE_OFFICE_PORT'], MOLE_OFFICE_API: process.env['MOLE_OFFICE_API'] }
    // A watching Vite, which is the one that registers, started the way a test starts one: the
    // port set, no address. Whatever this checkout's `.env` names, the port has to win.
    delete process.env['MOLE_OFFICE_NO_WATCH']
    delete process.env['MOLE_OFFICE_API']
    process.env['MOLE_OFFICE_PORT'] = String(THE_PORT_THE_PAGE_IS_TOLD)
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const [name, value] of Object.entries(was)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('asks the port it was started with, and nothing else', async () => {
    await start(await theRegisteringPlugin())
    expect(asked.length, 'the plugin made no request at all').toBeGreaterThan(0)
    const elsewhere = asked.filter((line) => !line.includes(`http://127.0.0.1:${String(THE_PORT_THE_PAGE_IS_TOLD)}/`))
    expect(elsewhere, 'a request went somewhere other than the port the page is told').toEqual([])
    // It got as far as writing itself down: the health check, the session row and the resource row.
    expect(asked.some((line) => line.endsWith('/api/records'))).toBe(true)
    expect(asked.some((line) => line.endsWith('/api/resources'))).toBe(true)
  }, 30_000)
})
