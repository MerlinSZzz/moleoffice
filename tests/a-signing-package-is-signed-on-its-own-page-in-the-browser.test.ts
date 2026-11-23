// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SIGNING PACKAGE IS SIGNED ON ITS OWN PAGE, WHICH BECOMES ITS RECEIPT.
 * Line round 54, piece 2, which a decision and one more set.
 * Mutations, after green controls and restored byte for byte:
 * - remove source 9 in waiting.ts (case 1);
 * - send [] instead of the struck ids (case 2);
 * - hide could-not items in SigningPackagesPage.tsx (case 3).
 * Pictures are opt-in, SIGNING_PACKAGE_SHOTS=1, and use only invented tasks and agents.
 * Case 5 reads "Every item is struck" from its key. Before, the page drew a sentence that also told the person to
 * refuse the package; the Refuse press says that already, so the page draws the state alone, as decided.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ASigningPackage } from '../src/server/lib/signing-packages.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
const keys = new Map<string, string>()
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' })
async function call<T>(path: string, body?: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const response = await fetch(`${app.api}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return await response.json() as T
}
const setting = (value: number, name = 'keepBackups') => ({ act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: name, value }, why: 'Keep the agreed copies for the bench task.' })
async function bring(task: string, items: unknown[] = [setting(21), setting(22, 'untracedRequestDays'), setting(23, 'tracedRequestDays')]): Promise<ASigningPackage> {
  return (await call<{ package: ASigningPackage }>('/api/signing-packages', { forAgent: 'bench-weaver', task, items }, asAgent('quill-secretary'))).package
}
async function read(id: string): Promise<ASigningPackage> {
  return (await call<{ package: ASigningPackage }>(`/api/signing-packages/${id}`)).package
}
async function kept(name: string): Promise<unknown> {
  return (await call<{ numbers: { key: string; inForce: unknown }[] }>('/api/office/what-is-kept')).numbers.find(one => one.key === name)!.inForce
}
async function open(id: string): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/signing-packages/${id}`)
  await waitForThePage(app.page)
  await app.page.locator(`[data-signing-package="${id}"]`).waitFor()
}
async function answer(id: string, press: 'Sign' | 'Refuse'): Promise<void> {
  const panel = app.page.locator(`[data-signing-package="${id}"]`)
  const response = app.page.waitForResponse(one => one.url().endsWith(`/signing-packages/${id}/${press === 'Sign' ? 'sign' : 'refuse'}`) && one.request().method() === 'POST')
  await panel.getByRole('button', { name: press, exact: true }).click()
  const received = await response
  expect(received.ok(), await received.text()).toBe(true)
  await panel.locator(`[data-package-answer="${press === 'Sign' ? 'signed' : 'refused'}"]`).waitFor()
}
beforeAll(async () => {
  app = await liveApp({ name: 'signing-package-page', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  for (const handle of ['quill-secretary', 'bench-weaver', 'bench-asker', 'picture-asker']) {
    const started = await call<{ whatToGiveIt: { key: string } }>('/api/agents/started', { handle, name: handle, workArea: ['src'] })
    keys.set(handle, started.whatToGiveIt.key)
  }
  await call('/api/roles/card/quill-secretary', { role: 'secretary' })
}, 300_000)
afterAll(async () => { await app?.stop() }, 60_000)

describe('the package and its page', () => {
  it('1: waits on Home Needs you, attributes the secretary, and opens its own page', async () => {
    const pack = await bring('Check the invented bench copies')
    const waiting = await call<{ items: { id: string; kind: string; tier: string; act: string; why: string; theSigningPackage: unknown; fromAgent: unknown }[] }>('/api/waiting')
    const row = waiting.items.find(one => one.id === pack.id)!
    expect(row).toMatchObject({ kind: 'signing package', tier: 'asked', act: 'answer', theSigningPackage: { task: pack.task, forAgent: pack.forAgent, broughtBy: pack.broughtBy }, fromAgent: { answer: 'an-agent', agentId: pack.broughtBy.id } })
    expect(row.why).toContain('Only you can sign it')
    await app.page.goto(`${app.site}/?lang=en#/`)
    await waitForThePage(app.page)
    const link = app.page.locator(`a[href="#/signing-packages/${pack.id}"]`).first()
    await link.waitFor()
    await link.click()
    const panel = app.page.locator(`[data-signing-package="${pack.id}"]`)
    await panel.waitFor()
    expect(await panel.innerText()).toContain(pack.task)
    expect(await panel.innerText()).toContain('bench-weaver')
    expect(await panel.innerText()).toContain('quill-secretary')
    expect(await panel.getByRole('button', { name: 'Sign', exact: true }).count()).toBe(1)
  }, 60_000)

  it('2: striking item 2 sends nothing before Sign, runs 1 and 3, and draws the receipt', async () => {
    const before = await kept('untracedRequestDays')
    const pack = await bring('Keep three agreed bench settings', [setting(31), setting(32, 'untracedRequestDays'), setting(33, 'tracedRequestDays')])
    await open(pack.id)
    const item = app.page.locator(`[data-package-item="${pack.items[1]!.id}"]`)
    await item.getByRole('button', { name: 'Strike', exact: true }).click()
    expect(await item.innerText()).toContain('Will not be carried out')
    expect((await read(pack.id)).items.map(one => one.state)).toEqual(['waiting', 'waiting', 'waiting'])
    // A second press takes the strike back, before choosing it again.
    await item.getByRole('button', { name: 'Take back strike', exact: true }).click()
    await item.getByRole('button', { name: 'Strike', exact: true }).click()
    await answer(pack.id, 'Sign')
    const receipt = await read(pack.id)
    expect(receipt.items.map(one => one.state)).toEqual(['done', 'struck', 'done'])
    expect(await kept('keepBackups')).toBe(31)
    expect(await kept('untracedRequestDays')).toBe(before)
    expect(await kept('tracedRequestDays')).toBe(33)
    const panel = app.page.locator(`[data-signing-package="${pack.id}"]`)
    expect(await panel.innerText()).toContain('You signed')
    for (const one of receipt.items) expect(await panel.locator(`[data-package-item="${one.id}"]`).innerText()).toContain(one.outcome!)
    expect(await panel.getByRole('button', { name: 'Sign', exact: true }).count()).toBe(0)
  }, 60_000)

  it('3: draws an item that could not run, with its reason beside the done ones', async () => {
    const ask = await call<{ request: string }>('/api/roles/requests', { asking: 'supervisor', because: 'Manage the invented bench task.' }, asAgent('bench-asker'))
    const pack = await bring('Answer the bench card and keep copies', [setting(34), { act: 'answer-an-ask-at-the-door', inputs: { request: ask.request, answer: 'grant' }, why: 'The task needs a supervisor.' }, setting(35, 'tracedRequestDays')])
    await call(`/api/roles/requests/${ask.request}/grant`, {})
    await open(pack.id)
    await answer(pack.id, 'Sign')
    const receipt = await read(pack.id)
    expect(receipt.items.map(one => one.state)).toEqual(['done', 'could-not', 'done'])
    for (const one of receipt.items) {
      const row = app.page.locator(`[data-package-item="${one.id}"]`)
      expect(await row.isVisible()).toBe(true)
      expect(await row.innerText()).toContain(one.outcome!)
    }
    expect(await app.page.locator(`[data-package-item="${pack.items[1]!.id}"]`).innerText()).toContain('Could not run')
  }, 60_000)

  it('4: Refuse changes no setting and says you refused the package', async () => {
    const names = ['keepBackups', 'untracedRequestDays', 'tracedRequestDays']
    const before = await Promise.all(names.map(kept))
    const pack = await bring('Refuse the invented bench changes')
    await open(pack.id)
    await answer(pack.id, 'Refuse')
    expect((await read(pack.id)).items.map(one => one.state)).toEqual(['not-run', 'not-run', 'not-run'])
    expect(await Promise.all(names.map(kept))).toEqual(before)
    expect(await app.page.locator(`[data-signing-package="${pack.id}"]`).innerText()).toContain('You refused')
  }, 60_000)

  it('5: with every item struck Sign is not offered and the page draws "Every item is struck"', async () => {
    const pack = await bring('Strike every invented bench change')
    await open(pack.id)
    const panel = app.page.locator(`[data-signing-package="${pack.id}"]`)
    for (const one of pack.items) await panel.locator(`[data-package-item="${one.id}"]`).getByRole('button', { name: 'Strike', exact: true }).click()
    expect(await panel.getByRole('button', { name: 'Sign', exact: true }).count()).toBe(0)
    expect(await panel.innerText()).toContain(sayInEnglish('signingPackagesPage.allStruck'))
    expect((await read(pack.id)).state).toBe('waiting')
  }, 60_000)

  it.skipIf(process.env['SIGNING_PACKAGE_SHOTS'] !== '1')('pictures: waiting with a strike, and a receipt with done, struck and could-not', async () => {
    const shots = mkdtempSync(join(tmpdir(), 'signing-package-shots-'))
    const ask = await call<{ request: string }>('/api/roles/requests', { asking: 'supervisor', because: 'Check the invented cabinet task.' }, asAgent('picture-asker'))
    const items = [setting(36), setting(37, 'tracedRequestDays'), { act: 'answer-an-ask-at-the-door', inputs: { request: ask.request, answer: 'grant' }, why: 'A supervisor checks the invented cabinet task.' }]
    const waiting = await bring('Prepare the invented cabinet for the bench task', items)
    const receipt = await bring('Prepare the invented cabinet and keep its receipt', items)
    await call(`/api/roles/requests/${ask.request}/grant`, {})
    await call(`/api/signing-packages/${receipt.id}/sign`, { struck: [receipt.items[1]!.id] })
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
      const context = await app.browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
      await context.addInitScript(look => window.localStorage.setItem('mole-office.preset.theme', look), theme)
      const page = await context.newPage()
      try {
        for (const pack of [waiting, receipt]) {
          await page.goto(`${app.site}/?lang=${language}#/signing-packages/${pack.id}`)
          await waitForThePage(page)
          const panel = page.locator(`[data-signing-package="${pack.id}"]`)
          await panel.waitFor()
          if (pack === waiting) await panel.locator(`[data-package-item="${pack.items[1]!.id}"]`).getByRole('button', { name: language === 'zh' ? '划掉' : 'Strike', exact: true }).click()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `sideways at ${width} ${theme} ${language}`).toBe(true)
          const name = `${pack === waiting ? 'waiting' : 'receipt'}-${width}-${theme}-${language}`
          await page.evaluate(() => window.scrollTo(0, 0))
          if (width === 390) {
            const bar = await page.locator('.shell-bar').boundingBox()
            const heading = await page.locator('.sp-title').boundingBox()
            const first = await panel.locator('[data-package-item]').first().boundingBox()
            expect(bar!.y + bar!.height, 'the mobile bar covers the page heading').toBeLessThanOrEqual(heading!.y)
            expect(bar!.y + bar!.height, 'the mobile bar covers item 1').toBeLessThanOrEqual(first!.y)
          }
          await page.screenshot({ path: join(shots, `${name}-full.png`), fullPage: true })
          // The crop hides .shell-bar, .px-chat-circle and .ckw so the panel's words can be read. Full-page pictures keep all three.
          await panel.screenshot({ path: join(shots, `${name}-panel.png`), style: '.shell-bar, .px-chat-circle, .ckw { visibility: hidden !important; }' })
        }
      } finally { await context.close() }
    }
    console.log(`SIGNING_PACKAGE_SHOTS: ${shots}`)
  }, 600_000)
})
