// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW-KEY ASK'S OWN PAGE, IN EACH OF ITS FIVE STATES: WHAT IT SAYS, AND WHICH PRESSES IT DRAWS.
 * Point 9 of a decision (the press that withdraws a grant nobody collected) and
 * problem sgjHE9R2vSEZ (after "Give a new key" the page stopped: while the press was being answered it
 * drew "Refuse it" disabled with no reason, which `Btn` then refused to draw).
 *
 * This is a browser test against a real stack. The asks are made through the real doors, each page is
 * opened at #/r/<the ask>, and the person's presses are pressed on the page. In every state the page's
 * own check must pass: no fault panel is drawn.
 *
 *   state                      the presses drawn for the person      where it stands
 *   not answered               Give a new key, Refuse it             This ask has not been answered yet.
 *   granted, not collected     Withdraw the grant                    Granted ... Nobody has collected ...
 *   collected                  none                                  ... The new key was collected at ...
 *   refused                    none                                  Refused at ...
 *   withdrawn                  none                                  ... The grant was withdrawn at ...
 *
 * MUTATIONS (after a green control):
 *   take the `TheGrantToWithdraw` render out of RecordPage.tsx → the granted state draws no withdraw
 *   press, red;
 *   say "Nobody has answered this ask yet." again where a not-answered ask stands
 *   (src/server/lib/newkey.ts) → the not-answered state is red on its first expect.
 *
 * NOT A MUTATION ANY MORE: taking the `reason` off "Refuse it". Since November 2026 `Btn` draws a press
 * that is off with no reason as off, with a line saying so, so the page stands and this file stays
 * green. tests/ui.test.ts has the case for that line.
 *
 * PHOTOGRAPHS of each state at 1440, 990, 660 and 390, light and dark, when WITHDRAW_SHOTS names a
 * folder.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

let app: LiveApp

const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** A reply's text with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, json: JSON.parse(text) as Record<string, unknown>, text: hidden(text) }
}

/** The office name each agent here is registered under, and the name a person reads for it. */
const officeNameOf = (handle: string): string => `The agent ${handle}`

/** Start an agent as the person, then ask for a new key in its name with no key: it lost its own. */
async function anAgentAsksForANewKey(handle: string): Promise<{ request: string; secret: string }> {
  const started = await post('/api/agents/started', AS_THE_PERSON, { handle, name: officeNameOf(handle) })
  expect(started.status, started.text).toBe(201)
  const asked = await askForANewKey(handle)
  expect(asked.status, asked.text).toBe(202)
  return { request: String(asked.json['request']), secret: String(asked.json['askSecret']) }
}

const askForANewKey = (handle: string, askSecret?: string) =>
  post('/api/agents/register-myself', asAgent(handle), {
    handle,
    name: officeNameOf(handle),
    workingDirectory: DIR,
    newKey: true,
    ...(askSecret === undefined ? {} : { askSecret }),
  })

async function grant(request: string): Promise<void> {
  const granted = await post(`/api/roles/requests/${request}/grant`, AS_THE_PERSON, {})
  expect(granted.status, granted.text).toBe(200)
}

async function answerOf(request: string): Promise<unknown> {
  const res = await fetch(`${app.api}/api/records/${request}`, { headers: AS_THE_PERSON })
  const json = (await res.json()) as { record: { data: Record<string, unknown> } }
  return json.record.data['answer']
}

async function openTheAsk(id: string): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** The labels of every press the person is offered on the ask, in the order drawn. */
async function thePresses(): Promise<string[]> {
  return (await app.page.locator('.tc-ask button').allTextContents()).map((one) => one.trim())
}

/** Where the ask stands, as the page says it. */
async function whereItStands(): Promise<string> {
  const line = app.page.locator('[data-fact="stands"]')
  await line.waitFor({ state: 'visible', timeout: 30_000 })
  return (await line.textContent()) ?? ''
}

/** The page's own check passed: no fault panel is drawn anywhere on it. */
async function noFault(): Promise<void> {
  expect(await app.page.locator('.fault').count(), 'the page drew a fault').toBe(0)
}

/** Wait until the page says the ask stands where it should. */
async function untilItStands(words: string): Promise<void> {
  await expect
    .poll(async () => ((await app.page.locator('.fault').count()) > 0 ? 'a fault' : await app.page.locator('[data-fact="stands"]').textContent()), {
      timeout: 20_000,
    })
    .toContain(words)
}

/** One ask in each state, made through the doors, for the photographs. */
const forThePhotographs: Record<string, string> = {}

beforeAll(async () => {
  app = await liveApp({ name: 'withdraw-press', viewport: { width: 1440, height: 1000 } })
  forThePhotographs['waiting-ask'] = (await anAgentAsksForANewKey('photo-waits')).request
  const granted = (await anAgentAsksForANewKey('photo-granted')).request
  await grant(granted)
  forThePhotographs['granted-uncollected-ask'] = granted
  const asked = await anAgentAsksForANewKey('photo-collected')
  await grant(asked.request)
  const took = await askForANewKey('photo-collected', asked.secret)
  expect(took.status, took.text).toBe(200)
  forThePhotographs['collected-ask'] = asked.request
  const refused = (await anAgentAsksForANewKey('photo-refused')).request
  const no = await post(`/api/roles/requests/${refused}/refuse`, AS_THE_PERSON, {})
  expect(no.status, no.text).toBe(200)
  forThePhotographs['refused-ask'] = refused
  const withdrawn = (await anAgentAsksForANewKey('photo-withdrawn')).request
  await grant(withdrawn)
  const back = await post(`/api/roles/requests/${withdrawn}/withdraw`, AS_THE_PERSON, {})
  expect(back.status, back.text).toBe(200)
  forThePhotographs['withdrawn-ask'] = withdrawn
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('an ask nobody answered, granted by the owner’s press, then withdrawn by the owner’s press', () => {
  let request = ''
  it('offers "Give a new key" and "Refuse it", and no withdraw press', async () => {
    request = (await anAgentAsksForANewKey('lost-its-secret')).request
    await openTheAsk(request)
    // THE SENTENCE IS THE WORD LIST'S, read from there, and it is not built on "nobody". It names the agent by its
    // office name, as every state of the ask's page does, never by its handle.
    expect(await whereItStands()).toContain(sayInEnglish('newKeyAsk.stands.unanswered', { handle: officeNameOf('lost-its-secret') }))
    expect(await thePresses()).toEqual(['Give a new key', 'Refuse it'])
    expect(await app.page.locator('.tc-withdraw').count()).toBe(0)
    await noFault()
  }, 120_000)

  it('after "Give a new key", says it worked and what the agent does next, and offers only the withdraw press', async () => {
    await app.page.locator('.tc-ask button', { hasText: 'Give a new key' }).click()
    await untilItStands('Nobody has collected the new key yet.')
    const stands = await whereItStands()
    expect(stands).toContain('Granted at')
    expect(stands).toContain('by the person')
    expect(stands).toContain('for-agents/register-myself.mjs --new-key')
    expect(stands).toContain('answered one new key, once.')
    await noFault()
    expect(await thePresses()).toEqual(['Withdraw the grant'])
    expect(await app.page.locator('.tc-withdraw').textContent()).toContain('The keys the grant revoked stay revoked.')
    expect(await answerOf(request)).toBe('granted')
  }, 120_000)

  it('after "Withdraw the grant", says the ask ended, and offers no press', async () => {
    await app.page.locator('.tc-withdraw button', { hasText: 'Withdraw the grant' }).click()
    await untilItStands('The grant was withdrawn at')
    await noFault()
    expect(await whereItStands()).toContain('may ask for a new key again')
    expect(await thePresses()).toEqual([])
    expect(await answerOf(request)).toBe('withdrawn')
  }, 120_000)
})

describe('an ask refused by the owner’s press', () => {
  it('says it was refused, and offers no press', async () => {
    const request = (await anAgentAsksForANewKey('refused-by-the-owner')).request
    await openTheAsk(request)
    await app.page.locator('.tc-ask button', { hasText: 'Refuse it' }).click()
    // A decision requires a question before the final refusal.
    await app.page.getByRole('dialog').getByRole('button', { name: 'Refuse it', exact: true }).click()
    await untilItStands('Refused at')
    await noFault()
    expect(await thePresses()).toEqual([])
    expect(await answerOf(request)).toBe('refused')
  }, 120_000)
})

describe('an ask whose key was collected', () => {
  it('says when it was collected, and offers no press', async () => {
    await openTheAsk(forThePhotographs['collected-ask']!)
    expect(await whereItStands()).toContain('The new key was collected at')
    await noFault()
    expect(await thePresses()).toEqual([])
  }, 120_000)
})

describe('photographs', () => {
  it.skipIf(!process.env['WITHDRAW_SHOTS'])('photographs each state at four widths, light and dark', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['WITHDRAW_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    for (const [name, id] of Object.entries(forThePhotographs)) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await openTheAsk(id)
          await app.page.locator('[data-fact="stands"]').waitFor({ state: 'visible', timeout: 30_000 })
          await noFault()
          await app.page.locator('.tc-asked').scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
    }
  }, 900_000)
})
