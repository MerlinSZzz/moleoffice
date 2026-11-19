// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON ANSWERS AN AGENT'S NEW NAME WITH A PRESS ON ITS PAGE. Item 42 of wave 13s (round 192).
 *
 * A throwaway office of this test's own (liveApp) is filled through its real doors: the person registers a secretary,
 * and the secretary proposes a new name for itself, so the proposal waits for the person, who is told once. Then the
 * pages are read in a browser. Each case starts on Home, where the person's line is offered, and presses Take me there,
 * as the person would; that press marks the line read, so the offer leaves. The last case goes to the page without it.
 * What is measured:
 *
 *   (a) the person is told by one line, whose offer takes the person to the agent's page, where the new name that
 *       waits is drawn with the two presses; Send says why it is off until a reason is written, and nothing is answered
 *       meanwhile; Approve with a reason renames the agent, the page's heading says the new name, and the earlier names
 *       say who approved it and why;
 *   (b) Refuse with a reason leaves the name as it is, and the earlier names draw the refusal with both reasons;
 *   (c) a page with a new name waiting and two earlier names under it scrolls sideways at no width it is drawn at;
 *   (d) a new name approved by the person on the agent's page, after putting its offer off with Not now, ends the offer:
 *       the line waits no more, nothing is set to come back, and Home draws no offer for it.
 *
 * PICTURES. With TEST_SHOTS set, the page of (c) is photographed at 1440, 990, 660 and 390 pixels wide, in light and
 * dark, in English and in Chinese, and the box for the reason at 1440 and 390 in light. Without it, (c) is drawn and
 * checked at 1440 and 390 in light, in English, and nothing is photographed.
 *
 * THE MUTATIONS THAT TURN THIS RED, AFTER A CONTROL RUN:
 *
 *   1. In `TheWaitingRename` (src/web/components/AgentRenames.tsx), send to the refuse door whichever press asked →
 *      (a) and (d) go red: each approval is stored as a refusal. (b), which goes on from the page (a) left, goes red
 *      with them.
 *   2. In `AgentRenames`, drop `onChanged()` from `answered` → (a) goes red: the heading keeps the old name.
 *   3. In `TheWaitingRename`, let `noReason` be false whatever was written → (a) goes red: Send with no reason does
 *      not say why it is off. (b) and (c) go red with it, because the new name (a) left waiting refuses the next one.
 *   4. In `answerARename` (src/server/lib/agent-renames.ts), drop the call to `markReadByTheOffice` → (d) goes red:
 *      the offer is still set to come back.
 *
 * THE PRESSES AND THE SENTENCES ARE READ FROM THE WORDS THE PAGE DRAWS WITH (the agentRenames keys of
 * src/shared/words/en-wave-13s.ts), filled with this test's names and reasons, so a word reworded there is reworded here.
 * Where a sentence ends with the time, it is compared up to the time, which the page draws in the browser's clock.
 */

import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, theResizeIsDrawn, thePersonsKeyHeader, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const PICTURES = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('agent-renames')
const WIDTHS = PICTURES ? [1440, 990, 660, 390] : [1440, 390]
const THEMES = PICTURES ? (['light', 'dark'] as const) : (['light'] as const)
const LANGUAGES = PICTURES ? (['en', 'zh'] as const) : (['en'] as const)

const PANEL = '[data-agent-rename="waiting"]'

let app: LiveApp
let page: Page
let person: Record<string, string>
let secretary: { id: string; key: string }
/** What the page threw, so a wait that runs out says why. */
const pageErrors: string[] = []

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

const asPerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person })
const asSecretary = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'sec-test',
  'x-mole-office-key': secretary.key,
})

/** The secretary proposes a new name for itself; it waits for the person, who is told. Answers the rename and the line. */
async function theSecretaryProposes(name: string, because: string): Promise<{ renameId: string; toldIn: string }> {
  const reply = await call('POST', `/api/participants/agent/${secretary.id}/renames`, asSecretary(), { name, because })
  expect(reply['rename'].approver).toEqual(expect.objectContaining({ kind: 'person', id: THE_PERSON }))
  expect(typeof reply['rename'].toldMessage, 'the line that told the person').toBe('string')
  return { renameId: String(reply['rename'].id), toldIn: String(reply['rename'].toldMessage) }
}

/** The secretary's renames, as the person reads them. */
async function theRenames(): Promise<{ renames: Record<string, any>[]; waiting: Record<string, any> | null }> {
  return (await call('GET', `/api/participants/agent/${secretary.id}/renames`, asPerson())) as never
}

/** Open a page of the app at a width, in a look and a language. */
async function open(route: string, theme: 'light' | 'dark', width: number, language: 'en' | 'zh'): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}#${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Wait for what the page should draw, and when it never comes, fail saying what it drew instead and what it threw. */
async function see(selector: string): Promise<void> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    const drawn = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.slice(0, 1500).replace(/\s+/g, ' '))
    throw new Error(`${selector} was not drawn. The page threw: ${pageErrors.join(' | ') || 'nothing'}. It drew: ${drawn}`)
  }
}

/** No look scrolls sideways; then the picture, when pictures are asked for. */
async function picture(name: string, theme: string, width: number, language: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `${name} at ${String(width)} in ${theme}, ${language}, scrolls sideways`).toBeLessThanOrEqual(0)
  if (PICTURES) await page.screenshot({ path: join(SHOTS, `${name}-${String(width)}-${theme}-${language}.png`), fullPage: true })
}

/** On Home, press Take me there on the offer of the line that told the person, and land on the agent's page. */
async function followTheLine(toldIn: string): Promise<void> {
  await open('/', 'light', 1440, 'en')
  const offer = page.locator(`.px-lead-offer[data-lead-message="${toldIn}"]`)
  await see(`.px-lead-offer[data-lead-message="${toldIn}"]`)
  await offer.locator('.px-lead-go').click()
  await see(PANEL)
  expect(new URL(page.url()).hash).toBe(`#/who/agent/${secretary.id}`)
}

/** The words of `key` up to the time the page draws in them, because the page draws the time in the browser's clock. */
function upToTheTime(key: 'agentRenames.approved' | 'agentRenames.refused', names: { oldName: string; newName: string }): string {
  const mark = '\u0000'
  return t(key, { ...names, when: mark }).split(mark)[0]!
}

/** The name of who answered a rename, as the office names it. */
async function whoAnswered(renameId: string): Promise<string> {
  return String((await theRenames()).renames.find((one) => one['id'] === renameId)?.['answeredBy']?.name)
}

/** The page's heading, which names the agent. */
async function theHeading(): Promise<string> {
  return ((await page.locator('h1.prof-name').first().textContent({ timeout: 5_000 }).catch(() => '')) ?? '').trim()
}

beforeAll(async () => {
  app = await liveApp({ name: 'agent-renames-drawn', workspace: 'default', viewport: { width: 1440, height: 900 } })
  page = app.page
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  await app.context.addCookies([{ name: 'mole-office-key', value: person['x-mole-office-key']!, domain: '127.0.0.1', path: '/' }])
  const reply = await call('POST', '/api/agents/started', asPerson(), { handle: 'sec-test', name: 'Test secretary Sable', role: 'secretary' })
  secretary = { id: String(reply['agent'].id), key: String(reply['whatToGiveIt']?.key) }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the person\'s press on the agent\'s page', () => {
  it('(a) follows the person\'s line to the page, asks for a reason, and approves the new name', async () => {
    const { renameId, toldIn } = await theSecretaryProposes('Test secretary Larch', 'Test: the secretary keeps the office in balance.')
    // THE PERSON IS TOLD ONCE, AND THE LINE LEADS TO THE AGENT'S PAGE.
    const inbox = await call('GET', '/api/messages?only=waiting-for-me&full=1', asPerson())
    const lines = (inbox['messages'] as { id: string; notice?: string; lead?: { target?: { route?: string } } | null }[]).filter(
      (one) => one.notice === 'aRenameWaitsForYou',
    )
    expect(lines.map((one) => one.id), 'the lines telling the person a new name waits').toEqual([toldIn])
    expect(lines[0]!.lead?.target?.route).toBe(`/who/agent/${secretary.id}`)

    await followTheLine(toldIn)
    const waits = page.locator(PANEL)
    expect(await waits.innerText()).toContain(t('agentRenames.waits', { newName: 'Test secretary Larch', oldName: 'Test secretary Sable' }))
    expect(await waits.innerText()).toContain(t('agentRenames.reason', { because: 'Test: the secretary keeps the office in balance.' }))
    expect(await theHeading()).toBe('Test secretary Sable')

    // SEND IS OFF UNTIL A REASON IS WRITTEN, AND SAYS SO; NOTHING IS ANSWERED MEANWHILE. An off press carries
    // aria-disabled, which Playwright's click() waits out, so the press is dispatched, as a reader's press reaches it.
    await waits.getByRole('button', { name: t('agentRenames.approve') }).click()
    await waits.locator('textarea').waitFor({ state: 'visible', timeout: 30_000 })
    expect(await waits.getByRole('button', { name: t('agentRenames.send') }).getAttribute('aria-disabled')).toBe('true')
    await waits.getByRole('button', { name: t('agentRenames.send') }).dispatchEvent('click')
    await waits.getByText(t('agentRenames.reasonNeeded')).waitFor({ state: 'visible', timeout: 30_000 })
    expect((await theRenames()).waiting?.['rename']).toBe(renameId)

    await waits.locator('textarea').fill('Test: it reads well.')
    await waits.getByRole('button', { name: t('agentRenames.send') }).click()
    // THE STORED ANSWER FIRST, so a press that wrote the wrong thing fails on the fact and not on a wait.
    await expect
      .poll(async () => (await theRenames()).renames.find((one) => one['id'] === renameId)?.['answer'] ?? null, { timeout: 30_000 })
      .toBe('approved')
    await expect.poll(theHeading, { timeout: 30_000 }).toBe('Test secretary Larch')
    const approved = page.locator('li[data-agent-rename="approved"]')
    await approved.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await approved.innerText()).toContain(upToTheTime('agentRenames.approved', { oldName: 'Test secretary Sable', newName: 'Test secretary Larch' }))
    // THE PROPOSER IS NAMED AS IT IS NAMED NOW: the row keeps who proposed, and the name it bore then is the old name.
    expect(await approved.innerText()).toContain(
      t('agentRenames.proposedWith', { who: 'Test secretary Larch', because: 'Test: the secretary keeps the office in balance.' }),
    )
    expect(await approved.innerText()).toContain(t('agentRenames.approvedBy', { who: await whoAnswered(renameId), because: 'Test: it reads well.' }))
    expect(await page.locator(PANEL).count(), 'a new name still waits after the approval').toBe(0)
  }, 180_000)

  it('(b) refuses the next new name with a reason and leaves the name as it is', async () => {
    const { renameId, toldIn } = await theSecretaryProposes('Test secretary Moss', 'Test: a shorter name.')
    await followTheLine(toldIn)
    const waits = page.locator(PANEL)
    await waits.getByRole('button', { name: t('agentRenames.refuse') }).click()
    await waits.locator('textarea').fill('Test: the name it has is clearer.')
    await waits.getByRole('button', { name: t('agentRenames.send') }).click()
    await expect
      .poll(async () => (await theRenames()).renames.find((one) => one['id'] === renameId)?.['answer'] ?? null, { timeout: 30_000 })
      .toBe('refused')
    const refused = page.locator('li[data-agent-rename="refused"]')
    await refused.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await refused.innerText()).toContain(upToTheTime('agentRenames.refused', { oldName: 'Test secretary Larch', newName: 'Test secretary Moss' }))
    expect(await refused.innerText()).toContain(t('agentRenames.proposedWith', { who: 'Test secretary Larch', because: 'Test: a shorter name.' }))
    expect(await refused.innerText()).toContain(
      t('agentRenames.refusedBy', { who: await whoAnswered(renameId), because: 'Test: the name it has is clearer.' }),
    )
    expect(await theHeading()).toBe('Test secretary Larch')
  }, 180_000)

  it('(c) draws a new name waiting over the earlier names at every width it is drawn at, with no sideways scroll', async () => {
    const { toldIn } = await theSecretaryProposes('Test secretary Fern', 'Test: the name it chose for itself in its own notes.')
    await followTheLine(toldIn)
    const route = `/who/agent/${secretary.id}`
    for (const language of LANGUAGES) {
      for (const width of WIDTHS) for (const theme of THEMES) {
        await open(route, theme, width, language)
        await see(PANEL)
        await page.locator(PANEL).scrollIntoViewIfNeeded()
        expect(await page.locator('li[data-agent-rename]').count(), 'the earlier names under the new one').toBe(2)
        await picture('waiting', theme, width, language)
      }
    }
    // THE BOX FOR THE REASON, OPENED BY A PRESS.
    await open(route, 'light', 1440, 'en')
    await see(PANEL)
    await page.locator(PANEL).getByRole('button', { name: t('agentRenames.approve') }).click()
    await page.locator(`${PANEL} textarea`).waitFor({ state: 'visible', timeout: 30_000 })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await theResizeIsDrawn(page)
      await page.locator(`${PANEL} textarea`).scrollIntoViewIfNeeded()
      await picture('the-reason-box', 'light', width, 'en')
    }
  }, 590_000)

  it('(d) a new name answered on the agent\'s page ends its offer at Home, which does not come back after Not now', async () => {
    // (c) LEAVES ITS NEW NAME WAITING, and one waits at a time, so the person refuses that one at the door first.
    const left = await theRenames()
    await call('POST', `/api/renames/${String(left.waiting?.['rename'])}/refuse`, asPerson(), { because: 'Test: another is proposed.' })
    const { renameId, toldIn } = await theSecretaryProposes('Test secretary Wren', 'Test: a name for the last case.')
    const offers = async (): Promise<{ ids: string[]; comesBack: unknown }> => {
      const read = await call('GET', '/api/messages?only=waiting-for-me&leads=1', asPerson())
      return { ids: (read['messages'] as { id: string }[]).map((one) => one.id), comesBack: read['offersComeBackInSeconds'] ?? null }
    }

    await open('/', 'light', 1440, 'en')
    const offer = `.px-lead-offer[data-lead-message="${toldIn}"]`
    await see(offer)
    // THE OFFER LEAVES THE SCREEN AT THE PRESS, before the page sends Not now, so the read below waits
    // for the office's answer to it as well.
    const putOffWritten = page.waitForResponse(
      (res) => res.url().includes(`/api/messages/${toldIn}/not-now`) && res.request().method() === 'POST',
      { timeout: 60_000 },
    )
    await page.locator(offer).locator('.px-lead-not').click()
    await page.locator(offer).waitFor({ state: 'hidden', timeout: 30_000 })
    expect((await putOffWritten).ok(), 'Not now was written').toBe(true)
    // PUT OFF, THE OFFER IS SET TO COME BACK, because its line still waits for the person.
    const putOff = await offers()
    expect(putOff.ids).not.toContain(toldIn)
    expect(typeof putOff.comesBack, 'when the put-off offer comes back').toBe('number')

    // THE PERSON GOES TO THE PAGE WITHOUT THE LINE, and approves there.
    await open(`/who/agent/${secretary.id}`, 'light', 1440, 'en')
    await see(PANEL)
    const waits = page.locator(PANEL)
    await waits.getByRole('button', { name: t('agentRenames.approve') }).click()
    await waits.locator('textarea').fill('Test: it reads well too.')
    await waits.getByRole('button', { name: t('agentRenames.send') }).click()
    await expect
      .poll(async () => (await theRenames()).renames.find((one) => one['id'] === renameId)?.['answer'] ?? null, { timeout: 30_000 })
      .toBe('approved')

    // NOTHING IS SET TO COME BACK, AND THE LINE WAITS NO MORE, so the end of Not now's wait brings back nothing.
    expect(await offers()).toEqual({ ids: expect.not.arrayContaining([toldIn]), comesBack: null })
    const waiting = await call('GET', '/api/messages?only=waiting-for-me', asPerson())
    expect((waiting['messages'] as { id: string }[]).map((one) => one.id)).not.toContain(toldIn)
    // HOME DRAWS ITS OFFERS FROM ITS OWN OFFERS READ, so the offer is looked for once that read has answered.
    const homeRead = page.waitForResponse((res) => res.url().includes('only=waiting-for-me') && res.url().includes('leads=1'), { timeout: 60_000 })
    await open('/', 'light', 1440, 'en')
    await homeRead
    expect(await page.locator(offer).count(), 'the offer at Home').toBe(0)
  }, 180_000)
})
