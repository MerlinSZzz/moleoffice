// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO REASON BOXES ON AN AGENT'S PAGE REFUSE AN EMPTY REASON, AND THE BROWSER SAYS WHY. Wave 13p round 41, after
 * the inspector's round 39 note (report p7q9ShPXqu4l, block b-notes). Round 38 turned the
 * reason for a release reading and the reason for a work area from one-line boxes marked `required` into `TextArea`,
 * which did not pass the mark on, so an empty reason could be sent. In a real browser, on this test's own office:
 *
 * 1. EACH BOX CARRIES THE MARK, AND SAVE WITH IT EMPTY SENDS NOTHING. The browser reports the box as missing a value,
 *    puts its own words to it and moves the focus there; no request reaches the door, and the form stays open.
 *    A written reason is still sent, and the form closes.
 *
 * The refusal and the written send are checked in the light look. There are no photographs.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. The agent and every reason are made up.
 *
 * MUTATION: see the round 41 report. Taking `required` off the `<textarea>` that `TextArea` draws turned the case
 * red, and putting it back turned it green.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(url: string, body: object, method = 'POST'): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** Every request either form sent to its door, as "METHOD door". */
const sent: string[] = []
const DOORS = /\/api\/participants\/agent\/[^/]+\/(reads-releases-from-the-check|work-area)$/

async function open(route: string, look: string): Promise<void> {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#${route}`)
  await waitForThePage(app.page, 60_000)
}

/** Save with the box empty: the browser keeps the form, says why, and nothing is sent. */
async function refuses(name: string, box: Locator, save: Locator): Promise<void> {
  await box.waitFor({ timeout: 30_000 })
  expect(await box.inputValue()).toBe('')
  await save.click()
  const said = await box.evaluate((el: HTMLTextAreaElement) => ({
    required: el.required,
    missing: el.validity.valueMissing,
    words: el.validationMessage,
    focused: document.activeElement === el,
  }))
  expect(said.required, `${name}: the box carries no required mark`).toBe(true)
  expect(said.missing, `${name}: the browser does not see the box as empty`).toBe(true)
  expect(said.words, `${name}: the browser gave no reason`).not.toBe('')
  expect(said.focused, `${name}: the browser did not point at the box`).toBe(true)
  await app.page.waitForTimeout(500)
  expect(sent, `${name}: an empty reason was sent`).toEqual([])
  expect(await save.isVisible(), `${name}: the form closed`).toBe(true)
}

const releases = () => app.page.locator('[data-target="uiSurface/profile.releases"]')
const releaseBox = () => releases().locator('form textarea')
const releaseSave = () => releases().getByRole('button', { name: 'Save', exact: true })
const areaBox = () => app.page.getByLabel('Why the area changed')
const areaSave = () => app.page.getByRole('button', { name: 'Save work area', exact: true })

beforeAll(async () => {
  app = await liveApp({ name: 'profile-reason-required', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  app.page.on('request', (request) => {
    const door = DOORS.exec(new URL(request.url()).pathname)?.[1]
    if (door !== undefined && request.method() !== 'GET') sent.push(`${request.method()} ${door}`)
  })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
  await send('/api/records', { kind: 'agent', title: 'Test kiln planning agent', data: { handle: 'kiln-planner', runtime: 'claude-code', state: 'active', workArea: ['src/web'] } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

it('1. each reason box carries the mark, refuses an empty reason with the browser\'s words, and sends a written one', async () => {
  await open('/who/agent/kiln-planner', 'light')
  await app.page.getByRole('button', { name: 'Do not wake it for a release', exact: true }).click()
  await refuses('profile-release-why', releaseBox(), releaseSave())

  await open('/who/agent/kiln-planner', 'light')
  await app.page.getByRole('button', { name: 'Change work area', exact: true }).click()
  await refuses('profile-work-area-why', areaBox(), areaSave())

  await open('/who/agent/kiln-planner', 'light')
  await app.page.getByRole('button', { name: 'Do not wake it for a release', exact: true }).click()
  await releaseBox().fill('Test: the kiln planner reads its own releases.')
  await releaseSave().click()
  await app.page.getByRole('button', { name: 'Wake it for a release', exact: true }).waitFor({ timeout: 30_000 })
  await app.page.getByRole('button', { name: 'Change work area', exact: true }).click()
  await areaBox().fill('Test: the kiln moved to the back room.')
  await areaSave().click()
  await app.page.getByRole('button', { name: 'Change work area', exact: true }).waitFor({ timeout: 30_000 })
  expect(sent).toEqual(['POST reads-releases-from-the-check', 'POST work-area'])
}, 600_000)
