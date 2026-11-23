// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S RELEASES ARE ONE SWITCH, "WAKE IT ON RELEASE". As decided in November 2026.
 *
 * The Releases panel on an agent's page drew a sentence on how the agent reads a release, a sentence on who set that
 * and why, and a press named after the change. It now draws one switch: on when a release wakes the agent, off when it
 * does not. When nobody has set it, the switch is on and the small label "default" stands beside it. Who set it and
 * why are behind the "?" on the heading. A press opens the reason box. Save writes the change through the door the old
 * press used, and Cancel leaves the switch as it was.
 *
 * WHAT IS CLAIMED, on a made-up agent nobody has set, in the order the cases run:
 *
 *   1. the switch reads on, its word says so, the "default" label is drawn, and the heading has no "?";
 *   2. a press and a written reason turn it off through the door, the label goes, and the "?" holds the reason;
 *   3. on the agent case 2 left off, a press and Cancel send nothing and leave the switch off.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. The agent and the reason are made up.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the switch reads the door the wrong way round, or no "default" label → case 1
 *   the save does not write the changed value, or no "?" holds the reason → case 2
 *   Cancel writes, or moves the switch                                     → case 3
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t as word } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const HANDLE = 'kiln-releases'
const REASON = 'Test: the kiln agent reads its own releases.'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(url: string, body?: object): Promise<Record<string, any>> {
  const method = body === undefined ? 'GET' : 'POST'
  const reply = await fetch(app.api + url, { method, headers: PERSON, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** Every body the page sent to the release door, in order. */
const sent: unknown[] = []
const DOOR_PATH = `/api/participants/agent/${HANDLE}/reads-releases-from-the-check`
const DOOR = /\/api\/participants\/agent\/[^/]+\/reads-releases-from-the-check$/

const releases = () => app.page.locator('[data-target="uiSurface/profile.releases"]')
const theSwitch = () => releases().getByRole('switch', { name: word('releaseReading.wake') })
const drawn = (words: string) => releases().getByText(words, { exact: true })

/** The agent's page, ready to read, with the switch drawn. */
async function open(): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${HANDLE}`)
  await waitForThePage(app.page, 60_000)
  await theSwitch().waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'releases-are-one-switch', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  app.page.on('request', (request) => {
    if (request.method() !== 'GET' && DOOR.test(new URL(request.url()).pathname)) sent.push(request.postDataJSON())
  })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
  await send('/api/records', { kind: 'agent', title: 'Test kiln agent', data: { handle: HANDLE, runtime: 'claude-code', state: 'active' } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe("an agent's releases, one switch", () => {
  it('1: nobody has set it, so the switch is on and the "default" label stands beside it', async () => {
    expect((await send(DOOR_PATH))['readsReleasesFromTheCheck']).toBeNull()
    await open()
    expect(await theSwitch().getAttribute('aria-checked')).toBe('true')
    expect(await drawn(word('releaseReading.switchOn')).count()).toBe(1)
    expect(await drawn(word('switch.byDefault')).count()).toBe(1)
    expect(await releases().locator('.px-hint-mark').count(), 'nobody set it, so there is no "?"').toBe(0)
  }, 120_000)

  it('2: a press and a written reason turn it off through the door, and the "?" holds the reason', async () => {
    await open()
    await theSwitch().click()
    await releases().locator('form textarea').fill(REASON)
    await releases().getByRole('button', { name: word('releaseReading.save'), exact: true }).click()
    await releases().locator('[role="switch"][aria-checked="false"]').waitFor({ timeout: 30_000 })
    // THE DOOR'S `on` IS "READS A RELEASE FROM THE CHECK", so a release no longer wakes the agent.
    expect(sent).toEqual([{ on: true, because: REASON }])
    const stored = (await send(DOOR_PATH))['readsReleasesFromTheCheck']
    expect(stored?.on).toBe(true)
    expect(await drawn(word('releaseReading.switchOff')).count()).toBe(1)
    expect(await drawn(word('switch.byDefault')).count()).toBe(0)
    expect((await releases().locator('.px-hint-mark .px-hint-body').textContent()) ?? '').toContain(REASON)
  }, 120_000)

  it('3: a press and Cancel send nothing and leave the switch as it was', async () => {
    await open()
    const before = sent.length
    expect(await theSwitch().getAttribute('aria-checked')).toBe('false')
    await theSwitch().click()
    await releases().getByRole('button', { name: word('releaseReading.cancel'), exact: true }).click()
    await releases().locator('form').waitFor({ state: 'detached', timeout: 30_000 })
    await app.page.waitForTimeout(500)
    expect(await theSwitch().getAttribute('aria-checked')).toBe('false')
    expect(sent).toHaveLength(before)
  }, 120_000)
})
