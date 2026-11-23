// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Criterion 2. Measured: a-check-of-<run> collided and cleanup did not inspect live cwd. */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
const children: ChildProcess[] = []
beforeEach(async () => { fixture = await inspectorFixture() })
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
    await once(child, 'close')
  }
  await fixture.close()
})
async function occupy(cwd: string) {
  const child = spawn(process.execPath, ['-e', 'console.log("ready"); setInterval(() => {}, 1000)'], { cwd, detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
  children.push(child)
  await once(child.stdout!, 'data')
  return child.pid!
}

describe('two checks of one run do not share a worktree', () => {
  it('cuts distinct paths for simultaneous checks, and records each identity', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let arrived!: () => void
    const firstArrived = new Promise<void>((resolve) => { arrived = resolve })
    fixture.state.onPrompt = async () => { arrived(); await held }
    const firstCheck = aMadeUpCheckSession()
    const first = fixture.inspect(['--check', firstCheck])
    await firstArrived
    fixture.state.onPrompt = undefined
    const second = await fixture.inspect(['--check', 'second-check'])
    release()
    const firstResult = await first
    expect(firstResult.code, firstResult.err).toBe(0)
    expect(second.code, second.err).toBe(0)
    const reads = fixture.state.writes.filter((one) => one.path.endsWith('/assembled')).map((one) => one.body.read)
    expect(reads.map((one) => one.worktree).sort()).toEqual([fixture.pathFor(firstCheck), fixture.pathFor('second-check')].sort())
  })
  it('names a leftover and the live process using it', async () => {
    const check = aMadeUpCheckSession()
    const at = fixture.pathFor(check)
    mkdirSync(at, { recursive: true })
    const pid = await occupy(at)
    const result = await fixture.inspect(['--check', check])
    expect(result.code).toBe(1)
    expect(result.err).toContain(at)
    expect(result.err).toContain(`PID ${pid}`)
    expect(existsSync(at)).toBe(true)
  })
  it('refuses cleanup while a live process has its cwd inside the tree', async () => {
    let pid = 0
    fixture.state.onAssembled = async (body) => { pid = await occupy(body.read.worktree) }
    const check = aMadeUpCheckSession()
    const result = await fixture.inspect(['--check', check])
    expect(result.err).toContain('Refusing to remove')
    expect(result.err).toContain(`PID ${pid}`)
    expect(existsSync(fixture.pathFor(check))).toBe(true)
  })
})

describe('two checks of one run do not share a worktree, on the page', () => {
  // THE STACK STARTS IN A HOOK, which has four minutes in a file that names liveApp, so the case's thirty seconds are left
  // for the checks and the page. On 1 Nov, at a load of 44 to 58 on 20 CPUs, the start was inside the case and the case
  // timed out at thirty seconds; at rest the start took 3 to 8 s of a case of 10 to 14 s.
  let app: LiveApp
  beforeAll(async () => { app = await liveApp({ name: 'two-check-worktrees', viewport: { width: 1440, height: 900 } }) })
  afterAll(async () => { await app?.stop() })
  it('shows each real check worktree in the browser and keeps the first while a live process uses it', async () => {
    let releaseFirst = () => {}
    let firstRun: ReturnType<typeof fixture.inspect> | undefined
    try {
      const headers = (id: string, person = false) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': person ? 'human' : 'agent', 'x-mole-office-actor-id': id })
      async function post(path: string, body: unknown, actor = THE_PERSON, person = true) {
        const response = await fetch(`${app.api}${path}`, { method: 'POST', headers: headers(actor, person), body: JSON.stringify(body) })
        const raw = await response.text()
        expect(response.ok, raw).toBe(true)
        return JSON.parse(raw) as Record<string, any>
      }
      await post('/api/agents/started', { handle: 'quill', name: 'Fixture secretary', runtime: 'claude-code', role: 'secretary' })
      await post('/api/agents/started', { handle: 'fixture-inspector', name: 'Fixture inspector', runtime: 'claude-code', role: 'inspector' })
      await post('/api/agents/started', { handle: 'fixture-worker', name: 'Fixture worker', runtime: 'claude-code', role: 'worker', workArea: ['work'] }, 'quill', false)
      const run = (await post('/api/records', { kind: 'session', title: 'Fixture run with two checks', data: { state: 'finished', servingAgent: 'fixture-worker', workingDirectory: fixture.checkout, cutFrom: 'main' } }, 'fixture-worker', false)).record.id as string
      async function checkSession(title: string) {
        return (await post('/api/records', { kind: 'session', title, data: { state: 'running', servingAgent: 'fixture-inspector', extra: { purpose: 'inspection' } } }, 'fixture-inspector', false)).record.id as string
      }
      const firstCheck = await checkSession('Fixture first check')
      const secondCheck = await checkSession('Fixture second check')
      const pathFor = (check: string) => join(fixture.home, '.cache/mole-office/worktrees', `a-check-of-${run}-${check}`)
      /** The worktree row the check panel draws in developer mode: its label, and the path in its code element. */
      const theWorktreeRow = async () => ({
        label: (await app.page.locator('.chk-read-tree dt').textContent()) ?? '',
        path: (await app.page.locator('.chk-read-tree dd code').textContent()) ?? '',
      })
      const held = new Promise<void>((resolve) => { releaseFirst = resolve })
      let sayFirst!: (path: string) => void
      const firstSeen = new Promise<string>((resolve) => { sayFirst = resolve })
      let occupant = 0
      fixture.state.forwardTo = app.api
      fixture.state.onAssembled = async (body, check) => {
        if (check !== firstCheck) return
        occupant = await occupy(body.read.worktree)
        sayFirst(body.read.worktree as string)
        await held
      }
      const flags = ['--workspace', 'default', '--run', run]
      // THE DATABASE THIS TEST'S OFFICE SERVES, as the message worker hands it to the real check tool, so the tool
      // sends that office's key: the assembly door refuses a request a listener carried with no key (keys wave piece 7).
      const served = { MOLE_OFFICE_DB: join(app.dir, 'panelx.db') }
      firstRun = fixture.inspect([...flags, '--check', firstCheck], served)
      const firstPath = await Promise.race([firstSeen, firstRun.then((result) => { throw new Error(`First check ended before its assembly: ${result.code}: ${result.err}`) })])
      expect(firstPath).toBe(pathFor(firstCheck))
      // IN DEVELOPER MODE: since item 3, C27, of a decision, a run's check panel draws its
      // worktree only there. The reloads below keep this address, so both widths are read
      // in developer mode.
      await app.page.goto(`${app.site}/?mode=inspect#/r/${run}`)
      await waitForThePage(app.page)
      expect(await theWorktreeRow()).toEqual({ label: createI18n('en').t('chk.row.worktree' as WordKey), path: firstPath })

      const second = await fixture.inspect([...flags, '--check', secondCheck], served)
      expect(second.code, second.err).toBe(0)
      expect(pathFor(secondCheck)).not.toBe(firstPath)
      expect(existsSync(firstPath)).toBe(true)
      expect(existsSync(pathFor(secondCheck))).toBe(false)
      // TWO WIDTHS IN LIGHT. The worktree line and the fit do not change with the colour scheme.
      for (const width of [1440, 390]) {
        for (const colorScheme of ['light'] as const) {
          await app.page.setViewportSize({ width, height: 900 })
          await app.page.emulateMedia({ colorScheme })
          await app.page.reload()
          await waitForThePage(app.page)
          expect(await theWorktreeRow()).toEqual({ label: createI18n('en').t('chk.row.worktree' as WordKey), path: pathFor(secondCheck) })
          expect(await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
        }
      }
      releaseFirst()
      const first = await firstRun
      expect(first.code, first.err).toBe(1)
      expect(first.err).toContain(`Refusing to remove ${firstPath}`)
      expect(first.err).toContain(`PID ${occupant}`)
      expect(() => process.kill(occupant, 0)).not.toThrow()
      expect(existsSync(firstPath)).toBe(true)
    } finally {
      releaseFirst()
      if (firstRun !== undefined) await firstRun
      fixture.state.forwardTo = undefined
      fixture.state.onAssembled = undefined
    }
  })

})
