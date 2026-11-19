// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Criterion 5. Measured tool default: generic agent model and a hidden 20 minute clock. */
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { inspectionSettings } from '../src/config/inspection.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { inspectorFixture } from './inspector-tool-fixture.ts'
import { liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
beforeEach(async () => { fixture = await inspectorFixture() })
afterEach(async () => { await fixture.close() })

describe('the check’s model and clock are settings', () => {
  it('declares no model and forty minutes in the office settings', () => {
    // FLO-05: the office ships no default model. It declared 'sonnet' until
    // 2 October 2026. A check with no model is refused by whoever starts it.
    expect(settingNamed('MOLE_OFFICE_INSPECTION_MODEL').fallback).toBeNull()
    expect(settingNamed('MOLE_OFFICE_INSPECTION_MINUTES').fallback).toBe('40')
    expect(inspectionSettings({})).toEqual({ model: null, minutes: 40 })
    expect(inspectionSettings({ MOLE_OFFICE_INSPECTION_MODEL: ' a-named-model ' })).toEqual({ model: 'a-named-model', minutes: 40 })
  })
  it('prints the settings in dry output and sends them to the run record', async () => {
    // CRITERION U2: WITH NO --model, THE OFFICE NAMES THE CHECK'S MODEL. Until U2 the tool read
    // MOLE_OFFICE_INSPECTION_MODEL from its own environment; now it asks the office, whose answer
    // falls back to that setting in the office's .env. The fixture office answers 'fixture-model'.
    fixture.state.checkModel = { model: 'fixture-model', from: 'the settings file', says: 'The fixture office names this model.' }
    const result = await fixture.inspect([], { MOLE_OFFICE_INSPECTION_MODEL: 'the-tools-own-setting-is-not-read', MOLE_OFFICE_INSPECTION_MINUTES: '57' })
    expect(result.code, result.err).toBe(0)
    expect(fixture.state.modelAsked).toEqual(['/api/office/run-models/for/fixture-inspector?place=check'])
    expect(result.out).toContain('fixture-model, with 57 minutes to finish')
    const kept = fixture.state.writes.find((one) => one.path.endsWith('/assembled'))!.body
    expect(kept.execution).toEqual({ model: 'fixture-model', minutes: 57 })
  })
  it('lets flags override both settings for this one check', async () => {
    const result = await fixture.inspect(['--model', 'one-check', '--limit', '12.5'], { MOLE_OFFICE_INSPECTION_MODEL: 'office-model', MOLE_OFFICE_INSPECTION_MINUTES: '57' })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('one-check, with 12.5 minutes to finish')
    const kept = fixture.state.writes.find((one) => one.path.endsWith('/assembled'))!.body
    expect(kept.execution).toEqual({ model: 'one-check', minutes: 12.5 })
  })
  it('refuses an invalid office clock or flag instead of silently choosing another', async () => {
    expect(() => inspectionSettings({ MOLE_OFFICE_INSPECTION_MINUTES: 'later' })).toThrow('positive number')
    const result = await fixture.inspect(['--limit', '-2'])
    expect(result.code).toBe(2)
    expect(result.err).toContain('--limit')
    expect(fixture.state.writes).toEqual([])
  })
  // THE OFFICE AND ITS BROWSER START IN A HOOK, not in the case. Started in the case, at a 1-minute
  // load of 36 to 42 on 20 CPUs, the start waited 15 s of the case's 30 for the page build or its lock,
  // then stopped to keep the other 15 s for clearing up; alone the whole case took 7.6 to 7.9 s. A hook
  // that starts something may take 240 s, so the wait counts against the hook. Every assertion stays
  // in the case.
  describe('with an office and its browser started before the case', () => {
    let app: Awaited<ReturnType<typeof liveApp>>
    beforeAll(async () => { app = await liveApp({ name: 'inspection-settings', viewport: { width: 1440, height: 900 } }) })
    afterAll(async () => { await app?.stop() })

    it('keeps the dry tool choices through the real API and draws them on the run page', async () => {
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
      const run = (await post('/api/records', { kind: 'session', title: 'Fixture check settings', data: { state: 'finished', servingAgent: 'fixture-worker', workingDirectory: fixture.checkout, cutFrom: 'main' } }, 'fixture-worker', false)).record.id as string
      // THE DATABASE THIS TEST'S OFFICE SERVES, as the message worker hands it to the real check tool, so the tool
      // sends that office's key: the assembly door refuses a request a listener carried with no key (keys wave piece 7).
      const result = await fixture.inspect(['--api', app.api, '--workspace', 'default', '--run', run, '--model', 'one-check', '--limit', '12.5'], { MOLE_OFFICE_DB: join(app.dir, 'panelx.db') })
      expect(result.code, result.err).toBe(0)
      const response = await fetch(`${app.api}/api/checks/${run}`, { headers: headers(THE_TEST_OFFICES_SECRETARY.handle) })
      const read = await response.json() as Record<string, any>
      expect(read.whatTheCheckWouldRead.execution).toEqual({ model: 'one-check', minutes: 12.5 })
      for (const width of [1440, 390]) {
        for (const colorScheme of ['light'] as const) {
          await app.page.setViewportSize({ width, height: 900 })
          await app.page.emulateMedia({ colorScheme })
          await app.page.goto(`${app.site}/#/r/${run}`)
          await app.page.reload()
          await waitForThePage(app.page)
          const settings = app.page.locator('.chk-settings')
          expect(await settings.locator('dt').allTextContents()).toEqual(['Model', 'Time limit'])
          expect(await settings.locator('dd').allTextContents()).toEqual(['one-check', '12.5 minutes'])
          expect(await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
        }
      }
    })
  })
})
