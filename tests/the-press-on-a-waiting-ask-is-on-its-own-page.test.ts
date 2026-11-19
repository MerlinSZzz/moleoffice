// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S PRESS ON A WAITING ASK IS ON THE ASK'S OWN PAGE. Problems ZtbZNZ735RYN and
 * x8ktQfHS5yGr; chapter 10 rule 4 (nothing the owner must do is a command in a terminal).
 *
 * A registration that proves nobody waits for the owner's press, and a waiting registration has no agent page
 * yet, so before this build the only way to admit one was a request by hand. The ask's record page now
 * draws the press, with the words of what it does, to the person and only while nobody has answered.
 * An agent asking for a new key is drawn the same way, with its own button.
 *
 * This is a browser test against a real stack: the registration and the ask are made through the real
 * doors, the page is opened at #/r/<the ask>, and the button is pressed.
 *
 * MUTATION (after a green control): take the `TheCardAsk` render out of RecordPage.tsx → red.
 *
 * PHOTOGRAPHS at 1440, 990, 660 and 390, light and dark, when REKEY_SHOTS names a folder; and, for wave 13w round 5, a
 * request to join that waits for the owner, as the owner, a secretary the owner raised and another agent see it, in English
 * and Chinese.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { titleToDraw } from '../src/web/pages/RecordPage.tsx'
import type { ParticipantsReply } from '../src/web/api.ts'

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

/** A keyless ask at the self-registration door, and the id of the waiting row it made. */
async function askToRegister(handle: string, extra: Record<string, unknown> = {}, name = `The agent ${handle}`): Promise<string> {
  const res = await fetch(`${app.api}/api/agents/register-myself`, {
    method: 'POST',
    headers: asAgent(handle),
    body: JSON.stringify({ handle, name, workingDirectory: DIR, requestedRole: 'worker', ...extra }),
  })
  const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, text).toBe(202)
  return String((JSON.parse(text) as { request: string }).request)
}

async function agentExists(handle: string): Promise<boolean> {
  const res = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_PERSON })
  return res.status === 200
}

/** An agent the person started, so a new-key ask for it can be filed and answered. */
async function startAgent(handle: string, name: string): Promise<void> {
  const res = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ handle, name }),
  })
  const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, text).toBe(201)
}

/** An admitted agent whose card ask waits on the person, and the ask's id. */
async function askForACard(handle: string, name: string): Promise<string> {
  const res = await fetch(`${app.api}/api/agents/register-myself`, {
    method: 'POST',
    headers: { ...asAgent(handle), ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({ handle, name, workingDirectory: DIR, requestedRole: 'supervisor', workArea: ['src/server'] }),
  })
  const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, text).toBe(201)
  const profile = await fetch(`${app.api}/api/participants/agent/${handle}/profile`, { headers: AS_THE_PERSON })
  expect(profile.status, await profile.clone().text()).toBe(200)
  const said = (await profile.json()) as { cardAsk?: { requestId?: string } }
  expect(typeof said.cardAsk?.requestId, 'the card ask was not filed').toBe('string')
  return String(said.cardAsk!.requestId)
}

/** The world the test office answers with, so a mocked refusal is not read as another office. */
async function theWorldHeader(path: string): Promise<string> {
  const res = await fetch(`${app.api}${path}`, { headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) } })
  return res.headers.get('x-mole-office-world') ?? ''
}

/** Answer an ask as the person, through the door the page's own press uses. */
async function answerAsPerson(id: string, answer: 'grant' | 'refuse'): Promise<void> {
  const res = await fetch(`${app.api}/api/roles/requests/${id}/${answer}`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: '{}',
  })
  const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, text).toBeLessThan(300)
}

async function openTheAsk(id: string): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

let admitAsk = ''
let newKeyAsk = ''

beforeAll(async () => {
  app = await liveApp({ name: 'ask-press', viewport: { width: 1440, height: 1000 } })
  admitAsk = await askToRegister('waits-for-a-press', {}, 'A Registration Named Elsewhere')
  // AN AGENT THE OWNER STARTED, which then asks for a new key with no key: it lost its own.
  await startAgent('lost-its-key', 'Lost its key')
  newKeyAsk = await askToRegister('lost-its-key', { newKey: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the press on a waiting registration', () => {
  it('says what pressing does, names the office name the session gave, and one press admits the agent', async () => {
    await openTheAsk(admitAsk)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    const askWords = (await ask.innerText()).replace(/\s+/g, ' ').trim()
    expect(askWords).toContain(sayInEnglish('cardAsk.admit.unproved', { handle: 'A Registration Named Elsewhere', card: 'worker' }))
    expect(askWords, 'the admission sentence draws the stored handle').not.toContain('waits-for-a-press')
    expect(askWords, 'the admission sentence does not draw the name the session gave').toContain('A Registration Named Elsewhere')
    expect(await agentExists('waits-for-a-press'), 'the agent existed before the press').toBe(false)
    await ask.locator('button', { hasText: 'Admit it' }).click()
    await expect.poll(() => agentExists('waits-for-a-press'), { timeout: 20_000 }).toBe(true)
    // AND THE PRESS IS GONE ONCE IT IS ANSWERED.
    await app.page.locator('.tc-ask').waitFor({ state: 'detached', timeout: 20_000 })
  }, 120_000)
})

describe('the press on a new-key ask', () => {
  it('names the new key and says what the press does', async () => {
    await openTheAsk(newKeyAsk)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    const says = ((await ask.textContent()) ?? '').replace(/\s+/g, ' ').trim()
    expect(says, 'the new-key sentence does not name the asker').toContain('Lost its key')
    expect(await ask.locator('button', { hasText: 'Give a new key' }).count()).toBe(1)
  }, 120_000)
})

describe('the names on the ask record page after a press', () => {
  it('names the office name in what a completed press did', async () => {
    const id = await askToRegister('done-press', {}, 'The Done One')
    await openTheAsk(id)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    // THE RELOAD AFTER THE PRESS IS HELD, so the done sentence stays for the read. A component test would
    // not prove that the page draws it; this is the page's own state, held at the moment it is shown.
    await app.page.route(`**/api/records/${id}*`, () => {})
    try {
      await ask.locator('button', { hasText: 'Admit it' }).click()
      const done = app.page.locator('.tc-ask-done')
      await done.waitFor({ state: 'visible', timeout: 20_000 })
      const words = (await done.innerText()).replace(/\s+/g, ' ').trim()
      expect(words, 'the done sentence draws the stored handle').not.toContain('done-press')
      expect(words, 'the done sentence does not draw the office name').toContain('The Done One')
    } finally {
      await app.page.unroute(`**/api/records/${id}*`)
    }
  }, 120_000)

  it('names the office name in what a failed press says', async () => {
    const id = await askToRegister('failed-press', {}, 'The Failed One')
    await openTheAsk(id)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    // THE PRESS IS REFUSED BY THE BROWSER, so the page's own failure path is read while the ask still stands.
    const world = await theWorldHeader(`/api/records/${id}`)
    await app.page.route(`**/api/roles/requests/${id}/grant`, (route) =>
      route.fulfill({ status: 403, headers: {
        'content-type': 'application/json',
        'x-mole-office-world': world,
        'access-control-allow-origin': new URL(app.site).origin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'x-mole-office-world',
      }, body: JSON.stringify({ error: 'Test: this press was refused.' }) }))
    await ask.locator('button', { hasText: 'Admit it' }).click()
    const failed = app.page.locator('.tc-ask-failed')
    await failed.waitFor({ state: 'visible', timeout: 20_000 })
    const words = (await failed.innerText()).replace(/\s+/g, ' ').trim()
    expect(words, 'the failure sentence draws the stored handle').not.toContain('failed-press')
    expect(words, 'the failure sentence does not draw the office name').toContain('The Failed One')
    await app.page.unroute(`**/api/roles/requests/${id}/grant`)
  }, 120_000)
})

describe('the names in the new-key and card-ask sentences', () => {
  it('names the new-key asker and its stands sentence by the office name', async () => {
    await openTheAsk(newKeyAsk)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    const says = (await ask.innerText()).replace(/\s+/g, ' ').trim()
    expect(says, 'the new-key sentence draws the stored handle').not.toContain('lost-its-key')
    expect(says, 'the new-key sentence does not draw the office name').toContain('Lost its key')
    const stands = (await app.page.locator('.tc-asked dd[data-fact="stands"]').innerText()).replace(/\s+/g, ' ').trim()
    expect(stands, 'the stands sentence draws the stored handle').not.toContain('lost-its-key')
    expect(stands, 'the stands sentence does not draw the office name').toContain('Lost its key')
    for (const title of [await app.page.locator('.rp-title').innerText(), await app.page.locator('.rp-crumb-here').innerText()]) {
      expect(title, 'the page title draws the stored handle').not.toContain('lost-its-key')
      expect(title, 'the page title does not draw the office name').toContain('Lost its key')
    }
  }, 120_000)

  it('names the card asker by the office name', async () => {
    const id = await askForACard('asks-for-a-card', 'The Card Asker')
    await openTheAsk(id)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    const words = (await ask.innerText()).replace(/\s+/g, ' ').trim()
    expect(words, 'the card-ask sentence draws the stored handle').not.toContain('asks-for-a-card')
    expect(words, 'the card-ask sentence does not draw the office name').toContain('The Card Asker')
    for (const title of [await app.page.locator('.rp-title').innerText(), await app.page.locator('.rp-crumb-here').innerText()]) {
      expect(title, 'the page title draws the stored handle').not.toContain('asks-for-a-card')
      expect(title, 'the page title does not draw the office name').toContain('The Card Asker')
    }
  }, 120_000)

  it('names the new-key withdraw sentence by the office name', async () => {
    await startAgent('asks-again', 'The Asking One')
    const id = await askToRegister('asks-again', { newKey: true })
    await openTheAsk(id)
    const ask = app.page.locator('.tc-ask')
    await ask.waitFor({ state: 'visible', timeout: 30_000 })
    await ask.locator('button', { hasText: 'Give a new key' }).click()
    const withdraw = app.page.locator('.tc-withdraw')
    await withdraw.waitFor({ state: 'visible', timeout: 30_000 })
    const words = (await withdraw.innerText()).replace(/\s+/g, ' ').trim()
    expect(words, 'the withdraw sentence draws the stored handle').not.toContain('asks-again')
    expect(words, 'the withdraw sentence does not draw the office name').toContain('The Asking One')
    const stands = (await app.page.locator('.tc-asked dd[data-fact="stands"]').innerText()).replace(/\s+/g, ' ').trim()
    expect(stands, 'the granted stands sentence draws the stored handle').not.toContain('asks-again')
    expect(stands, 'the granted stands sentence does not draw the office name').toContain('The Asking One')
  }, 120_000)
})

describe('the ask title when two registrations collide', () => {
  type Row = { id: string; handle: string; name: string }
  const participants = (agents: Row[]): ParticipantsReply => ({ people: [], agents } as unknown as ParticipantsReply)
  const theNewKeyAsk = (agent: string, title: string) => ({
    kind: 'role_request',
    title,
    data: { extra: { newKey: { agent } } },
  })

  it('draws the exact id row even when an earlier row bears that id as its handle', () => {
    const exact: Row = { id: 'agent-exact', handle: 'exact-handle', name: 'The Exact Agent' }
    const earlierHandle: Row = { id: 'handle-row', handle: 'agent-exact', name: 'The Handle Agent' }
    expect(
      titleToDraw(theNewKeyAsk('agent-exact', 'exact-handle asks for a new key'), participants([earlierHandle, exact])),
      'the title chose the earlier handle row instead of the exact id',
    ).toBe('The Exact Agent asks for a new key')
  })

  it('leaves the stored title when two rows bear the same handle', () => {
    const one: Row = { id: 'one', handle: 'same-handle', name: 'One' }
    const two: Row = { id: 'two', handle: 'same-handle', name: 'Two' }
    expect(
      titleToDraw(theNewKeyAsk('same-handle', 'same-handle asks for a new key'), participants([one, two])),
      'the title silently chose the first of two rows bearing the handle',
    ).toBe('same-handle asks for a new key')
  })

  it('leaves a title somebody wrote as stored', () => {
    const exact: Row = { id: 'agent-exact', handle: 'exact-handle', name: 'The Exact Agent' }
    expect(titleToDraw(theNewKeyAsk('agent-exact', 'A title the person wrote'), participants([exact]))).toBe(
      'A title the person wrote',
    )
  })
})

describe('photographs', () => {
  it.skipIf(!process.env['REKEY_SHOTS'])('photographs both asks at four widths, light and dark', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['REKEY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const another = await askToRegister('waits-for-a-photo', {}, 'The Registration In The Pictures')
    for (const [name, id] of [['waiting-registration', another], ['new-key-ask', newKeyAsk]] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await openTheAsk(id)
          await app.page.locator('.tc-ask').waitFor({ state: 'visible', timeout: 30_000 })
          await app.page.locator('.tc-ask').scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
    }
  }, 600_000)
})

describe('photographs of who may press', () => {
  it.skipIf(!process.env['REKEY_SHOTS'])('photographs a request to join as the owner, a secretary the owner raised and another agent', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['REKEY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const post = async (url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, any>> => {
      const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
      const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
      expect(res.status, text).toBeLessThan(300)
      return JSON.parse(text) as Record<string, any>
    }
    // EACH AGENT'S KEY IS HELD HERE ONLY, in memory, and sent on the page's own requests: never printed, never written.
    const keys: Record<string, string> = {}
    for (const [handle, role] of [['photo-secretary', 'secretary'], ['photo-bystander', 'supervisor']] as const) {
      const res = await fetch(`${app.api}/api/agents/started`, {
        method: 'POST',
        headers: AS_THE_PERSON,
        body: JSON.stringify({ handle, name: `The agent ${handle}`, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) }),
      })
      const said = (await res.json()) as { whatToGiveIt?: { key?: string }; error?: string }
      expect(res.status, (said.error ?? '').replace(/[0-9a-f]{64}/g, '<a key>')).toBe(201)
      expect(typeof said.whatToGiveIt?.key, 'the start gave no key').toBe('string')
      keys[handle] = said.whatToGiveIt!.key!
    }
    const key = thePersonsKeyHeader(join(app.dir, 'keys.json'))
    await post('/api/roles/elevation/photo-secretary', { ...AS_THE_PERSON, ...key }, { reason: 'Test: answer what waits for me' })
    const ask = await askToRegister('asks-to-join')
    for (const [viewer, actor] of [['owner', null], ['raised-secretary', 'photo-secretary'], ['another-agent', 'photo-bystander']] as const) {
      await app.page.goto(`${app.site}/#/`, { timeout: 60_000 })
      await app.page.setExtraHTTPHeaders(actor === null ? {} : { 'x-mole-office-key': keys[actor]! })
      await app.page.evaluate((who) => {
        if (who === null) window.localStorage.removeItem('mole-office.actor')
        else window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: who }))
      }, actor)
      for (const lang of ['en', 'zh'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await app.page.goto(`${app.site}/?lang=${lang}#/r/${ask}`, { timeout: 60_000 })
            await waitForThePage(app.page, 60_000)
            await app.page.reload({ timeout: 60_000 })
            await waitForThePage(app.page, 60_000)
            const press = app.page.locator('.tc-ask')
            if (actor === 'photo-bystander') {
              expect(await press.count(), 'another agent is shown the press').toBe(0)
            } else {
              await press.waitFor({ state: 'visible', timeout: 30_000 })
              await press.scrollIntoViewIfNeeded()
              expect(await press.locator('.tc-ask-who').count()).toBe(1)
            }
            await app.page.screenshot({ path: `${shots}/who-may-press-${viewer}-${lang}-${String(width)}-${theme}.png`, fullPage: false })
          }
        }
      }
    }
    await app.page.setExtraHTTPHeaders({})
    await app.page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
  }, 900_000)
})

describe('photographs of the named ask states', () => {
  it.skipIf(!process.env['REKEY_SHOTS'])('photographs the card ask, the failed press, the done press and the granted new-key ask at four widths and two themes', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['REKEY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const widths = [1440, 990, 660, 390] as const
    const themes = ['light', 'dark'] as const
    const shoot = async (name: string, what: { scrollIntoViewIfNeeded: () => Promise<void> }) => {
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await what.scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
    }
    // THE CARD ASK, opened fresh at each size so the page is drawn at that width from the start.
    const cardAsk = await askForACard('photographs-a-card', 'The Photographed Card Asker')
    for (const width of widths) {
      for (const theme of themes) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        await openTheAsk(cardAsk)
        const press = app.page.locator('.tc-ask')
        await press.waitFor({ state: 'visible', timeout: 30_000 })
        await press.scrollIntoViewIfNeeded()
        await app.page.screenshot({ path: `${shots}/card-ask-${String(width)}-${theme}.png`, fullPage: false })
      }
    }
    // THE FAILED PRESS, held by a refused answer so the state stays for every size.
    const failedId = await askToRegister('photographs-a-failure', {}, 'The Photographed Failure')
    await openTheAsk(failedId)
    const failedPress = app.page.locator('.tc-ask')
    await failedPress.waitFor({ state: 'visible', timeout: 30_000 })
    const world = await theWorldHeader(`/api/records/${failedId}`)
    await app.page.route(`**/api/roles/requests/${failedId}/grant`, (route) =>
      route.fulfill({ status: 403, headers: {
        'content-type': 'application/json',
        'x-mole-office-world': world,
        'access-control-allow-origin': new URL(app.site).origin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'x-mole-office-world',
      }, body: JSON.stringify({ error: 'Test: this press was refused.' }) }))
    await failedPress.locator('button', { hasText: 'Admit it' }).click()
    const failed = app.page.locator('.tc-ask-failed')
    await failed.waitFor({ state: 'visible', timeout: 20_000 })
    await shoot('failed-press', failed)
    await app.page.unroute(`**/api/roles/requests/${failedId}/grant`)
    // THE DONE PRESS, held by a reload that never answers so the sentence stays for every size.
    const doneId = await askToRegister('photographs-a-done', {}, 'The Photographed Done')
    await openTheAsk(doneId)
    const donePress = app.page.locator('.tc-ask')
    await donePress.waitFor({ state: 'visible', timeout: 30_000 })
    await app.page.route(`**/api/records/${doneId}*`, () => {})
    await donePress.locator('button', { hasText: 'Admit it' }).click()
    const done = app.page.locator('.tc-ask-done')
    await done.waitFor({ state: 'visible', timeout: 20_000 })
    await shoot('done-press', done)
    await app.page.unroute(`**/api/records/${doneId}*`)
    // THE GRANTED NEW-KEY ASK, with its stands sentence and the press that withdraws it.
    await startAgent('photographs-a-rekey', 'The Photographed Rekey')
    const grantedId = await askToRegister('photographs-a-rekey', { newKey: true })
    await openTheAsk(grantedId)
    const grantedPress = app.page.locator('.tc-ask')
    await grantedPress.waitFor({ state: 'visible', timeout: 30_000 })
    await grantedPress.locator('button', { hasText: 'Give a new key' }).click()
    const withdraw = app.page.locator('.tc-withdraw')
    await withdraw.waitFor({ state: 'visible', timeout: 30_000 })
    await shoot('granted-new-key', withdraw)
  }, 900_000)
})
