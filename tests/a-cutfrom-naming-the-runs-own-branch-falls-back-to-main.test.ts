// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Criterion 4. qvKVvyLL7rs0: cutFrom named the run's own HEAD and falsely looked already merged. */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { inspectorFixture } from './inspector-tool-fixture.ts'
import { recordedHead, recordedCutFrom } from '../src/server/lib/check-tip.ts'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
beforeEach(async () => { fixture = await inspectorFixture() })
afterEach(async () => { await fixture.close() })

describe('a cutFrom naming the run’s own branch falls back to main', () => {
  it('reads the real branch changes and keeps the fallback reason on the run', async () => {
    fixture.state.cutFrom = 'the-work'
    const result = await fixture.inspect()
    expect(result.code, result.err).toBe(0)
    const kept = fixture.state.writes.find((one) => one.path.endsWith('/assembled'))!.body
    expect(kept.base.ref).toBe(fixture.base)
    expect(kept.base.says).toContain('falls back to main')
    expect(kept.changes).toEqual([expect.objectContaining({ path: 'work', changes: expect.stringContaining('+After') })])
  })
  it('also detects another branch name resolving to HEAD', async () => {
    fixture.git('branch', 'alias-of-work')
    fixture.state.cutFrom = 'alias-of-work'
    const result = await fixture.inspect()
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('falls back to main')
  })
  it('does not change a base explicitly supplied for one check', async () => {
    fixture.state.cutFrom = 'the-work'
    const result = await fixture.inspect(['--against', fixture.base])
    expect(result.code, result.err).toBe(0)
    const kept = fixture.state.writes.find((one) => one.path.endsWith('/assembled'))!.body
    expect(kept.base.how).toBe('typed')
    expect(kept.base.says).not.toContain('falls back')
  })
  it('lets the server resolve the named branch as well as HEAD, including packed refs', () => {
    fixture.git('pack-refs', '--all')
    expect(recordedHead(fixture.checkout, 'main')).toBe(fixture.base)
    expect(recordedHead(fixture.checkout, 'the-work')).toBe(fixture.git('rev-parse', 'HEAD'))
    expect(recordedHead(fixture.checkout, '../../outside')).toBeNull()
    expect(recordedCutFrom(fixture.checkout, 'the-work')).toEqual({ branch: 'main', says: expect.stringContaining('falls back to main') })
    expect(recordedCutFrom(fixture.checkout, 'main').branch).toBe('main')
  })
  it('resolves a commit through a --shared clone\'s alternates, which is how the sandbox launcher makes an instance\'s own checkout', () => {
    // `git clone --shared` writes no object of its own for a commit the source already had — every
    // one of them, here, since nothing is ever committed inside the clone — so this proves the
    // commit is found through `objects/info/alternates`, not by coincidence of a pack the clone
    // happens to carry of its own. Measured without this fix: recordedHead answered null for a
    // commit that was there all along, which is what running the sandbox template's checkout on a
    // full test-suite proof (fix-insandbox) found in check-eligibility's own workingDirectory case.
    const theWorkTip = fixture.git('rev-parse', 'HEAD')
    const shared = join(fixture.home, 'shared-clone')
    execFileSync('git', ['clone', '-q', '--shared', '--branch', 'the-work', fixture.checkout, shared], { encoding: 'utf8' })
    // A local `main`, exactly as the sandbox launcher's own fix (`ensureLocalMainBranch`) adds one:
    // `recordedHead` never runs git itself, so this proves the OBJECT lookup below, not the ref
    // lookup, which is a loose file on disk either way once this branch exists.
    execFileSync('git', ['-C', shared, 'branch', 'main', 'origin/main'], { encoding: 'utf8' })
    expect(existsSync(join(shared, '.git', 'objects', theWorkTip.slice(0, 2), theWorkTip.slice(2)))).toBe(false)
    expect(recordedHead(shared)).toBe(theWorkTip)
    expect(recordedHead(shared, 'main')).toBe(fixture.base)
  })
  it('draws the fallback reason kept by the server on the run page, in developer mode only', async () => {
    const app = await liveApp({ name: 'inspection-base', viewport: { width: 1440, height: 900 } })
    try {
      const headers = (id: string, person = false) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': person ? 'human' : 'agent', 'x-mole-office-actor-id': id })
      async function post(path: string, body: unknown, actor = THE_PERSON, person = true) {
        const response = await fetch(`${app.api}${path}`, { method: 'POST', headers: headers(actor, person), body: JSON.stringify(body) })
        const raw = await response.text()
        expect(response.ok, raw).toBe(true)
        return JSON.parse(raw) as Record<string, any>
      }
      await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: 'Fixture secretary', runtime: 'claude-code', role: 'secretary' })
      await post('/api/agents/started', { handle: 'fixture-inspector', name: 'Fixture inspector', runtime: 'claude-code', role: 'inspector' })
      await post('/api/agents/started', { handle: 'fixture-worker', name: 'Fixture worker', runtime: 'claude-code', role: 'worker', workArea: ['work'] }, THE_TEST_OFFICES_SECRETARY.handle, false)
      const run = (await post('/api/records', { kind: 'session', title: 'Fixture check base', data: { state: 'finished', servingAgent: 'fixture-worker', workingDirectory: fixture.checkout, cutFrom: 'the-work' } }, 'fixture-worker', false)).record.id as string
      // THE DATABASE THIS TEST'S OFFICE SERVES, as the message worker hands it to the real check tool, so the tool
      // sends that office's key: the assembly door refuses a request a listener carried with no key (keys wave piece 7).
      const result = await fixture.inspect(['--api', app.api, '--workspace', 'default', '--run', run, '--model', 'one-check', '--limit', '12.5'], { MOLE_OFFICE_DB: join(app.dir, 'panelx.db') })
      expect(result.code, result.err).toBe(0)
      const response = await fetch(`${app.api}/api/checks/${run}`, { headers: headers(THE_TEST_OFFICES_SECRETARY.handle) })
      const read = await response.json() as Record<string, any>
      expect(read.whatTheCheckWouldRead.base.says).toContain('falls back to main')
      // CRITERION CHANGE, 30 September 2026, by item 2 of a decision. The base and
      // its sentence are drawn in developer mode only, so the reason is read there, and normal mode draws
      // the panel without it. Mutation: the base's sentence drawn in normal mode again in
      // `WhatItWouldRead`, and this goes red on the normal-mode line below.
      await app.page.setViewportSize({ width: 1440, height: 900 })
      await app.page.goto(`${app.site}/?mode=normal#/r/${run}`)
      await app.page.reload()
      await waitForThePage(app.page)
      expect(await app.page.locator('.chk').textContent()).not.toContain('falls back to main')
      for (const width of [1440, 390]) {
        for (const colorScheme of ['light'] as const) {
          await app.page.setViewportSize({ width, height: 900 })
          await app.page.emulateMedia({ colorScheme })
          await app.page.goto(`${app.site}/?mode=inspect#/r/${run}`)
          await app.page.reload()
          await waitForThePage(app.page)
          expect(await app.page.locator('.chk').textContent()).toContain('falls back to main')
          expect(await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
        }
      }
    } finally { await app.stop() }
  })
})
