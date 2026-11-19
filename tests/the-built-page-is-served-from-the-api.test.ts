// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE API SERVES THE BUILT PAGE, AND SAYS HOW LONG EACH FILE MAY BE KEPT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * S3 of design/ground/ACCEPTANCE.md section 9. A build writes an `index.html` that names a folder of
 * content-hashed assets. The page must never be cached — a cached copy would go on naming files a
 * rebuild has deleted — and a hashed asset may be kept for a year, because its name changes when its
 * contents do. Every browser address that is not an API path must return the app, so an address
 * with a route in it opens directly.
 *
 * The same-origin half of S3 — that a load makes no preflight — is a fact about a browser, and it is
 * measured in the S5 numbers rather than here. What is proved here is what the server sends: the
 * `cache-control` on each kind of file, and the fallback.
 *
 * The build is also a production build when the process that asks for it says `NODE_ENV=test`, as
 * vitest does here. A development build carries React's development code, with the absolute path of
 * every source file, and tests/a-bundle-carries-none-of-the-owners-content.test.ts then finds the
 * home folder in the bundle it makes from the checkout's dist/web.
 */

import { apiServerArguments } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { buildThePage } from '../tools/build-the-page.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const { port } = address
      probe.close(() => done(port))
    })
  })
}

let dir = ''
let api = ''
let child: ChildProcess | null = null
let asset = ''

async function answered(path: string): Promise<Response | null> {
  try {
    return await fetch(`${api}${path}`, { signal: AbortSignal.timeout(4000) })
  } catch {
    return null
  }
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('served-built')
  for (const part of ['src', 'drizzle', 'public', 'package.json', 'tsconfig.json', 'vite.config.ts', 'tools/check-worktrees.mjs', 'tools/live-processes.mjs', 'for-agents/a-full-list-read.mjs']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
  const built = await buildThePage({ root: dir })
  expect(built.ok).toBe(true)
  const html = readFileSync(join(dir, 'dist/web/index.html'), 'utf8')
  asset = /\/assets\/[^"]+\.js/.exec(html)?.[0] ?? ''
  expect(asset, 'the built index.html names no hashed javascript asset').toMatch(/^\/assets\/.+\.js$/)

  const port = await freePort()
  api = `http://127.0.0.1:${String(port)}`
  child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'served.db'),
      MOLE_OFFICE_WORKSPACE: 'default',
      LOG_LEVEL: 'warn',
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
  const stop = Date.now() + 120_000
  while (Date.now() < stop) {
    const health = await answered('/api/health')
    if (health !== null) break
    await sleep(250)
  }
}, 300_000)

afterAll(async () => {
  if (child?.pid !== undefined && child.pid !== null) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone, which is the outcome that was wanted.
    }
    await sleep(1000)
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Gone, as asked.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe('the page is never cached and the hashed files are held for a year', () => {
  it('serves index.html at / as html that must not be stored', async () => {
    const response = await answered('/')
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/html')
    expect(response?.headers.get('cache-control')).toBe('no-store')
    await response?.text()
  })

  it('serves a hashed asset as immutable for a year', async () => {
    const response = await answered(asset)
    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    await response?.text()
  })

  it('serves the same asset under a name that carries its contents, so the long cache is safe', () => {
    expect(asset).toMatch(/\/assets\/.+-[A-Za-z0-9_-]{8}\.js$/)
  })
})

describe('the page is built for production, whatever the process that asks for it says', () => {
  it('carries no development code and no path of the folder it was built in', () => {
    expect(process.env.NODE_ENV, 'this case proves nothing when its caller already builds for production').toBe('test')
    const assets = join(dir, 'dist/web/assets')
    const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'))
    expect(scripts.length, 'the build wrote no javascript').toBeGreaterThan(0)
    const development = scripts.filter((name) => readFileSync(join(assets, name), 'utf8').includes('jsxDEV'))
    const naming = scripts.filter((name) => readFileSync(join(assets, name), 'utf8').includes(dir))
    expect(development, 'these files carry React\'s development code').toEqual([])
    expect(naming, `these files name ${dir}`).toEqual([])
  })
})

describe('every browser address that is not an API path opens the app', () => {
  it('answers a route path with the app itself, so a bookmark opens directly', async () => {
    const response = await answered('/records/abc123')
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/html')
    const body = await response?.text()
    expect(body).toContain('<!doctype html>')
  })

  it('still refuses an unknown API path rather than answering the app for it', async () => {
    const response = await answered('/api/no-such-endpoint')
    expect(response?.status).toBe(404)
    expect(response?.headers.get('content-type')).toContain('application/json')
    await response?.text()
  })
})
