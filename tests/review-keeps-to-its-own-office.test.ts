// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Review's throwaway office must not inherit another office (wPqnA92Ta8Kb; GB5jW-UGbDA0).
 * Ask the real Vite config for the module it serves to the browser rather than photograph every
 * page in each test. The stand-in records every request, including a registration sent by mistake.
 * The owner case reads the real migrated database through the door the first-run gate reads.
 * The full review run separately checks the browser and Vite's registration with a stand-in.
 * And wave 13y round 54 (backlog 9.15 (f)): review's refusal of --expected without a reason names the file it really
 * keeps what each page drew in, not tools/review/reference.json, a name the file never had.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { photographEach, takeReviewPicture, theReviewEnvironment } from '../tools/review.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

// Problem h09tYuNl1nd9; Vv6h0HVryXOe: even the unused database path belongs to this file run.
const reviewFolder = mkdtempSync(join(tmpdir(), 'review-own-office-'))
afterAll(() => { rmSync(reviewFolder, { recursive: true, force: true }) })

let db: TestDb | null = null
let app: Awaited<ReturnType<typeof apiApp>> | null = null
afterEach(async () => {
  await app?.app.close()
  app = null
  db?.close()
  db = null
  vi.unstubAllEnvs()
})

it('mutations: removal call omitted; MOLE_AGENT_KEY removed from THE_OFFICES_VARIABLES; kept setting removed again — Vite gives the browser review\'s API port and sends nothing to another office', async () => {
  const requests: string[] = []
  const otherOffice = createServer((request, response) => {
    requests.push(`${request.method ?? ''} ${request.url ?? ''}`)
    response.writeHead(403).end('This is a stand-in, not an office.')
  })
  otherOffice.listen(0, '127.0.0.1')
  await once(otherOffice, 'listening')
  try {
    const address = otherOffice.address()
    if (!address || typeof address === 'string') throw new Error('The stand-in has no port.')
    const other = `http://127.0.0.1:${address.port}`
    const caller: NodeJS.ProcessEnv = {
      ...process.env,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_API: other,
      MOLE_OFFICE_WEB: other,
      MOLE_OFFICE_URL: other,
      MOLE_AGENT_KEY: 'made-up-key',
      MOLE_OFFICE_WORKSPACE: 'another-project',
      MOLE_OFFICE_SESSION: 'another-session',
      MOLE_OFFICE_AGENT: 'another-agent',
      MOLE_OFFICE_OWNER_ID: 'another-owner',
      MOLE_OFFICE_OWNER_NAME: 'Another Example',
      MOLE_OFFICE_PORT: String(address.port),
      MOLE_OFFICE_WEB_PORT: String(address.port),
      MOLE_OFFICE_DB: 'another.db',
      GIT_AUTHOR_NAME: 'Another Example',
    }
    const env = theReviewEnvironment(caller, 32101, 32102, 'review.db')
    expect(env.MOLE_OFFICE_PORT).toBe('32101')
    expect(env.MOLE_OFFICE_WEB_PORT).toBe('32102')
    expect(env.MOLE_OFFICE_DB).toBe('review.db')
    expect(env.MOLE_OFFICE_MESSAGE_WORKER).toBe('off')
    expect(caller.MOLE_OFFICE_API).toBe(other)
    expect(env.PATH).toBe(caller.PATH)

    // Load the actual Vite config in a separate process with precisely review's environment.
    // Its real plugin supplies the development port; no mock of address precedence is involved.
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { loadConfigFromFile } from 'vite'
      const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' })
      const plugin = loaded.config.plugins.find(p => p.name === 'mole-office:serve-the-api-address')
      const module = await plugin.load(plugin.resolveId('virtual:mole-office-api'))
      console.log(JSON.stringify({ module, webPort: loaded.config.server.port }))
    `], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    child.stdout.on('data', chunk => { output += String(chunk) })
    child.stderr.on('data', chunk => { errors += String(chunk) })
    const [code] = await once(child, 'close')
    expect(code, errors).toBe(0)
    expect(JSON.parse(output.trim())).toEqual({
      module: 'export const apiPortInDevelopment = 32101\n', webPort: 32102,
    })
    for (const name of [
      'MOLE_OFFICE_API', 'MOLE_OFFICE_WEB', 'MOLE_OFFICE_URL', 'MOLE_AGENT_KEY',
      'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'GIT_AUTHOR_NAME',
    ]) expect(env, name).not.toHaveProperty(name)
    expect(requests).toEqual([])
  } finally {
    otherOffice.close()
    await once(otherOffice, 'close')
  }
}, 30_000)

it('mutation: owner settings omitted — the migrated throwaway office has a made-up named owner, so the gate opens the pages', async () => {
  const env = theReviewEnvironment({}, 32101, 32102, join(reviewFolder, 'unused-review.db'))
  // Empty prevents test setup or a checkout's .env from supplying a name when the fix is removed.
  vi.stubEnv('MOLE_OFFICE_OWNER_ID', env.MOLE_OFFICE_OWNER_ID ?? '')
  vi.stubEnv('MOLE_OFFICE_OWNER_NAME', env.MOLE_OFFICE_OWNER_NAME ?? '')
  db = await freshDb()
  app = await apiApp()
  const response = await app.app.inject({ method: 'GET', url: '/api/office/owner' })
  expect(response.statusCode, response.body).toBe(200)
  const owner = response.json() as { id: string; name: string | null; named: boolean }
  expect(owner.named, 'OwnerGate draws the guide while named is false').toBe(true)
  // THE ID REVIEW'S OWN ENVIRONMENT GIVES ITS OFFICE, and it is the test offices' invented owner, read from the one
  // place it is written. Review's office used to have an owner of its own, whose id was a real person's name.
  expect(owner.id).toBe(env.MOLE_OFFICE_OWNER_ID)
  expect(owner.id).toBe(THE_TEST_OFFICES_OWNER.id)
  expect(owner.name).toBe(THE_TEST_OFFICES_OWNER.name)
})

it('mutations: kept setting removed again; OFFICE_BACK_SECONDS list entry removed; output line omitted — review keeps the message-worker choice and inspection office-back wait and names every removed variable', () => {
  const say = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const caller = {
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS: '37',
      MOLE_OFFICE_API: 'http://127.0.0.1:32103',
      MOLE_OFFICE_SESSION: 'another-session',
      MOLE_AGENT_KEY: 'stand-in-key',
      MOLE_OFFICE_READ_OUTSIDE: 'stand-in-permission',
      GIT_AUTHOR_EMAIL: 'stand-in@example.invalid',
    }
    const env = theReviewEnvironment(caller, 32101, 32102, 'review.db')
    expect(env.MOLE_OFFICE_MESSAGE_WORKER).toBe('off')
    expect(env.MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS).toBe('37')
    for (const name of Object.keys(caller).filter(name => !['MOLE_OFFICE_MESSAGE_WORKER', 'MOLE_OFFICE_INSPECTION_OFFICE_BACK_SECONDS'].includes(name))) {
      expect(env, name).not.toHaveProperty(name)
    }
    expect(say.mock.calls).toEqual([[
      "review: caller's office variables taken out: GIT_AUTHOR_EMAIL, MOLE_AGENT_KEY, MOLE_OFFICE_API, MOLE_OFFICE_READ_OUTSIDE, MOLE_OFFICE_SESSION.",
    ]])
    expect(caller.MOLE_OFFICE_API).toBe('http://127.0.0.1:32103')
  } finally {
    say.mockRestore()
  }
})


function emptyShot() {
  return {
    canvas: null as string | null,
    height: null as number | null,
    file: null as string | null,
    content: null as Parameters<typeof takeReviewPicture>[2]['content'],
    blank: null as string | null,
    error: null as string | null,
  }
}

const picture = { page: { name: 'stand-in' }, viewport: { width: 660, height: 800 }, theme: 'light' }

it('mutation: main wait removed — review photographs a main element drawn after the ready signal', async () => {
  const hold = { browser: await chromium.launch() }
  const directory = mkdtempSync(join(tmpdir(), 'review-drawn-'))
  try {
    const tab = await hold.browser.newPage({ viewport: picture.viewport })
    await tab.setContent(`<html data-mole-office-ready=""><body><script>
      setTimeout(() => {
        document.body.insertAdjacentHTML('beforeend',
          '<main class="page"><h1>A drawn stand-in page</h1><p>This is invented test content.</p></main>')
      }, 600)
    </script></body></html>`)
    expect(await tab.locator('main.page').count()).toBe(0)
    let drawnAtCapture = false
    const capture = tab.screenshot.bind(tab)
    vi.spyOn(tab, 'screenshot').mockImplementation(async options => {
      drawnAtCapture = await tab.locator('main.page').isVisible()
      return capture(options)
    })
    const shot = emptyShot()
    const lost = await photographEach(hold, [picture],
      async () => takeReviewPicture(tab, picture.viewport, shot, 'drawn.png', directory, 2000),
      () => chromium.launch(), () => {})
    expect(lost).toEqual([])
    expect(drawnAtCapture, 'the camera ran before main.page was visible').toBe(true)
    expect(shot.file).toBe('drawn.png')
    expect(shot.error).toBeNull()
    expect(shot.content).toMatchObject({ found: true })
    expect(existsSync(join(directory, 'drawn.png'))).toBe(true)
  } finally {
    await hold.browser.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('mutation: main timeout swallowed into a kept picture — review lists a main element that never draws as a failed picture', async () => {
  const hold = { browser: await chromium.launch() }
  const directory = mkdtempSync(join(tmpdir(), 'review-never-drawn-'))
  try {
    const tab = await hold.browser.newPage({ viewport: picture.viewport })
    await tab.setContent('<html data-mole-office-ready=""><body>This is a stand-in that never mounts.</body></html>')
    const capture = vi.spyOn(tab, 'screenshot')
    const shot = emptyShot()
    const said: string[] = []
    const lost = await photographEach(hold, [picture],
      async () => takeReviewPicture(tab, picture.viewport, shot, 'missing.png', directory, 200),
      () => chromium.launch(), (line: string) => said.push(line))
    const reason = "the page's main element was not drawn within 0.2 seconds"
    expect(lost).toEqual([{ which: 'stand-in at 660px light', error: reason }])
    expect(shot.error).toBe(reason)
    expect(shot.file).toBeNull()
    expect(shot.content).toBeNull()
    expect(capture).not.toHaveBeenCalled()
    expect(existsSync(join(directory, 'missing.png'))).toBe(false)
    expect(said[0]).toBe(`FAILED stand-in at 660px light: ${reason}`)
  } finally {
    await hold.browser.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
