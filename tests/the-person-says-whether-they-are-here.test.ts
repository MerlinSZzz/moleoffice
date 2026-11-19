// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON SAYS WHETHER THEY ARE HERE: ONLINE, AWAY OR INVISIBLE, AND THE WORKING LINE IS A SEPARATE FIELD.
 *
 * Decision `wvfrwvuzsKF_`: online by default, but the person can set online, offline or invisible.
 * Invisible means an agent learns the person is online only after a message from the person to it;
 * working, do not disturb and the like are another field, like an agent's reporting and working. Criterion M20 of
 * design/messages/ACCEPTANCE.md section 9; problem `QDnHoI-VYAOc`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT INVISIBLE HAS TO SURVIVE TO BE WORTH ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * An agent the owner has not written to must not be able to work it out from anything in the reply. So the
 * cases below do not only check the colour: they check the SENTENCE is word for word what being away
 * says, and that the word `invisible` is nowhere in what that agent is told. A build that drew a
 * grey dot and put `choice: "invisible"` in the field beside it would pass a colour test and would
 * have hidden nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Each invisible case first proves the agent CAN see the owner once the owner sent it a message. Without that,
 * every "the agent sees away" assertion would pass on a server that told every agent nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PRESENCE_CHOICE_WORDS } from '../src/shared/participants.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Headers for one of the two agents in this file. */
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

interface Reading {
  colour: string
  word: string
  says: string
  choice: string | null
  choiceAt: string | null
  state: string | null
}

async function fileAnAgent(handle: string, name: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.text()).toBe(201)
}

/** What one caller is told about the owner. */
async function howTheOwnerLooksTo(headers: Record<string, string>): Promise<Reading> {
  const got = await fetch(`${app.api}/api/presence/person/${THE_PERSON}`, { headers })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { presence: Reading }).presence
}

/** The owner sets whether they are here. */
async function theOwnerSays(choice: string, headers: Record<string, string> = AS_THE_OWNER): Promise<Response> {
  return fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ presence: choice }),
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'person-is-here', viewport: { width: 1440, height: 1000 } })
  await fileAnAgent('written-to', 'The one the owner has written to')
  await fileAnAgent('not-written-to', 'The one the owner has not')
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: 'to the one the owner has written to',
      data: { body: 'Start on the wrist camera.', to: [{ kind: 'agent', id: 'written-to' }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.text()).toBe(409)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('online by default, and the default is not a choice anybody made', () => {
  it('reads as here before the owner has said anything, and says so', async () => {
    const mine = await howTheOwnerLooksTo(AS_THE_OWNER)
    expect(mine.colour).toBe('green')
    expect(mine.choice).toBe('online')
    expect(mine.says).toContain('Not chosen')
  }, 120_000)
})

describe('away is shown to everybody', () => {
  it('is grey to the owner and to both agents, whether or not the owner has written to them', async () => {
    expect((await theOwnerSays('offline')).status).toBe(200)
    expect((await howTheOwnerLooksTo(AS_THE_OWNER)).colour).toBe('grey')
    expect((await howTheOwnerLooksTo(asAgent('written-to'))).colour).toBe('grey')
    expect((await howTheOwnerLooksTo(asAgent('not-written-to'))).colour).toBe('grey')
  }, 120_000)
})

describe('invisible is here to an agent the owner has written to, and nothing at all to one the owner has not', () => {
  it('tells the one the owner wrote to that the owner is here', async () => {
    expect((await theOwnerSays('invisible')).status).toBe(200)
    const told = await howTheOwnerLooksTo(asAgent('written-to'))
    expect(told.colour).toBe('green')
  }, 120_000)

  it('tells the other one exactly what being away says, and nothing more', async () => {
    expect((await theOwnerSays('invisible')).status).toBe(200)
    // THE CONTROL: the agent with a message from the owner can see the owner, so a server telling nobody anything would fail.
    expect((await howTheOwnerLooksTo(asAgent('written-to'))).colour).toBe('green')

    const hidden = await howTheOwnerLooksTo(asAgent('not-written-to'))
    expect(hidden.colour).toBe('grey')
    expect(hidden.choice, 'the word invisible was handed to the agent it hides the owner from').toBeNull()
    expect(hidden.choiceAt).toBeNull()
    expect(JSON.stringify(hidden)).not.toContain('invisible')

    // AND WORD FOR WORD WHAT AWAY SAYS, because a different sentence is the hiding undone.
    expect((await theOwnerSays('offline')).status).toBe(200)
    const away = await howTheOwnerLooksTo(asAgent('not-written-to'))
    expect(hidden.says).toBe(away.says)
    expect(hidden.word).toBe(away.word)
  }, 180_000)

  it('shows the owner their own answer, and shows it to nobody with an agent id', async () => {
    expect((await theOwnerSays('invisible')).status).toBe(200)
    expect((await howTheOwnerLooksTo(AS_THE_OWNER)).choice).toBe('invisible')
    expect((await howTheOwnerLooksTo(asAgent('written-to'))).choice).toBeNull()
  }, 120_000)
})

describe('whose answer it is', () => {
  it('refuses an agent setting a person here or away, naming the rule', async () => {
    const refused = await theOwnerSays('offline', asAgent('written-to'))
    expect(refused.status).toBe(403)
    expect(await refused.text()).toContain('theirs to say')
  }, 120_000)

  it('refuses it on an agent at all, because an agent has nothing to declare', async () => {
    const refused = await fetch(`${app.api}/api/participants/agent/written-to`, {
      method: 'PATCH',
      headers: asAgent('written-to'),
      body: JSON.stringify({ presence: 'offline' }),
    })
    expect(refused.status).toBe(403)
    expect(await refused.text()).toContain('worked out from what is running')
  }, 120_000)

  it('refuses a word that is not one of the three, and writes nothing', async () => {
    expect((await theOwnerSays('online')).status).toBe(200)
    const refused = await theOwnerSays('busy-ish')
    expect(refused.status).toBe(400)
    expect((await howTheOwnerLooksTo(AS_THE_OWNER)).choice).toBe('online')
  }, 120_000)
})

describe('the working line is a separate field', () => {
  it('keeps their own words when they change whether they are here', async () => {
    const wrote = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ state: 'reading the handback' }),
    })
    expect(wrote.status, await wrote.text()).toBe(200)
    expect((await theOwnerSays('offline')).status).toBe(200)
    const after = await howTheOwnerLooksTo(AS_THE_OWNER)
    expect(after.state, 'their working line was changed by a presence they set').toBe('reading the handback')
    expect(after.colour).toBe('grey')
  }, 120_000)
})

describe('the owner sets it from one dot in the panel', () => {
  it('draws one dot with the word beside it, and offers the three only when it is pressed', async () => {
    // WHAT WENT WRONG. Three buttons sat under the owner's name with one green dot above them, so the dot
    // said green while the owner was invisible and the three took the room of a contact. The fix: no three
    // buttons for online, offline and invisible; they stay hidden until the green dot is pressed, the dot
    // shows its colour and its name, and invisible was drawn green as well. Criterion M20 refined, problem qe654_q2eHWS.
    expect((await theOwnerSays('online')).status).toBe(200)
    await app.page.goto(app.site)
    await waitForThePage(app.page, 30_000)
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.wyh-press', { timeout: 20_000 })

    // NOTHING IS OFFERED UNTIL THE DOT IS PRESSED.
    expect(await app.page.$$('.wyh-is'), 'the three choices are drawn before anybody asks').toEqual([])

    // THE DOT SAYS WHICH ONE IS ON, in its colour and in the word beside it.
    await app.page.waitForFunction(
      () => document.querySelector('.wyh-press .wyh-dot')?.getAttribute('data-choice') === 'online',
      undefined,
      { timeout: 20_000 },
    )
    expect(await app.page.textContent('.wyh-word')).toBe(PRESENCE_CHOICE_WORDS.online.word)

    // PRESSING IT OFFERS THE THREE.
    await app.page.click('.wyh-press')
    await app.page.waitForSelector('.wyh-is', { timeout: 20_000 })
    const named = await app.page.$$eval('.wyh-is', (all) => all.map((one) => one.textContent))
    expect(named).toEqual([
      PRESENCE_CHOICE_WORDS.online.word,
      PRESENCE_CHOICE_WORDS.offline.word,
      PRESENCE_CHOICE_WORDS.invisible.word,
    ])

    await app.page.click('.wyh-is:has-text("' + PRESENCE_CHOICE_WORDS.invisible.word + '")')
    await app.page.waitForFunction(
      () => document.querySelector('.wyh-press .wyh-dot')?.getAttribute('data-choice') === 'invisible',
      undefined,
      { timeout: 20_000 },
    )
    // AND THE WORD BESIDE IT CHANGED WITH IT, so the dot and the word cannot say different things.
    expect(await app.page.textContent('.wyh-word')).toBe(PRESENCE_CHOICE_WORDS.invisible.word)
    // AND IT IS STORED, not only drawn.
    expect((await howTheOwnerLooksTo(AS_THE_OWNER)).choice).toBe('invisible')

    // INVISIBLE IS NOT DRAWN AS ONLINE. That was the half of it the owner could see was wrong.
    const look = await app.page.$eval('.wyh-press .wyh-dot', (one) => {
      const style = getComputedStyle(one)
      return { fill: style.backgroundColor, edge: style.borderStyle }
    })
    expect(look.edge, 'invisible is drawn as a filled dot like online').toBe('dashed')
    expect(
      ['transparent', 'rgba(0, 0, 0, 0)'].includes(look.fill),
      'invisible is drawn with a fill, which is what made it look online',
    ).toBe(true)

    // AND THE THREE ARE PUT AWAY AGAIN once one is chosen.
    expect(await app.page.$$('.wyh-is'), 'the three stayed on screen after the owner chose one').toEqual([])

    // AND THE OWNER'S WORKING LINE IS STILL ITS OWN CONTROL, on the same screen.
    expect(await app.page.$('.px-chat-state')).not.toBeNull()
  }, 180_000)

  it('offers the same control on the Settings page, where the owner sets their other facts', async () => {
    // PROBLEM D7tLqVTctD2L. The control existed only inside the chat panel, so the page a person
    // opens to set their name, their picture and their status could not set this. It is the same
    // component in both places rather than a second one shaped like it, which is why the selectors
    // below are the ones the panel test above uses.
    expect((await theOwnerSays('online')).status).toBe(200)
    await app.page.goto(`${app.site}#/settings`)
    await waitForThePage(app.page, 30_000)
    // Every Settings panel is folded to its title; the control is in "Your profile".
    await openSettingsPanel(app.page, 'settings.appearance')
    await app.page.waitForSelector('.app-line[data-line="here"] .wyh-press', { timeout: 20_000 })
    const where = '.app-line[data-line="here"] '
    await app.page.waitForFunction(
      () => document.querySelector('.app-line[data-line="here"] .wyh-dot')?.getAttribute('data-choice') === 'online',
      undefined,
      { timeout: 20_000 },
    )

    // NOTHING IS OFFERED UNTIL THE DOT IS PRESSED, here as in the panel.
    expect(await app.page.$$(`${where}.wyh-is`), 'the three choices are drawn before anybody asks').toEqual([])
    await app.page.click(`${where}.wyh-press`)
    await app.page.click(`${where}.wyh-is:has-text("${PRESENCE_CHOICE_WORDS.invisible.word}")`)

    // IT IS STORED, not only drawn: the door is the one the chat panel writes through.
    await app.page.waitForFunction(
      () => document.querySelector('.app-line[data-line="here"] .wyh-dot')?.getAttribute('data-choice') === 'invisible',
      undefined,
      { timeout: 20_000 },
    )
    expect((await howTheOwnerLooksTo(AS_THE_OWNER)).choice).toBe('invisible')

    // AND IT IS NOT GREEN, which is the half of this the owner could see was wrong.
    const look = await app.page.$eval(`${where}.wyh-dot`, (one) => {
      const style = getComputedStyle(one)
      return { fill: style.backgroundColor, edge: style.borderStyle }
    })
    expect(look.edge, 'invisible is drawn as a filled dot like online').toBe('dashed')
    expect(
      ['transparent', 'rgba(0, 0, 0, 0)'].includes(look.fill),
      'invisible is drawn with a fill, which is what made it look online',
    ).toBe(true)

    // AND PUTTING IT BACK MAKES IT GREEN AGAIN, so the line above is a report and not a constant.
    await app.page.click(`${where}.wyh-press`)
    await app.page.click(`${where}.wyh-is:has-text("${PRESENCE_CHOICE_WORDS.online.word}")`)
    await app.page.waitForFunction(
      () => document.querySelector('.app-line[data-line="here"] .wyh-dot')?.getAttribute('data-choice') === 'online',
      undefined,
      { timeout: 20_000 },
    )
    expect((await howTheOwnerLooksTo(AS_THE_OWNER)).choice).toBe('online')
    const green = await app.page.$eval(`${where}.wyh-dot`, (one) => getComputedStyle(one).backgroundColor)
    expect(['transparent', 'rgba(0, 0, 0, 0)'].includes(green), 'online is drawn hollow, like invisible').toBe(false)
  }, 180_000)
})
