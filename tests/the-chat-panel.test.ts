// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Mode } from '../src/web/lib/mode.ts'
/**
 * THE CIRCLE AT THE BOTTOM RIGHT, AND THE PANEL THAT OPENS OUT OF IT.
 *
 * Criterion M6 of design/messages/ACCEPTANCE.md: a circle at the bottom right that opens into a
 * chat panel like QQ's, a small tick on a sent message, and a clock while it is still in the queue.
 *
 * EVERYTHING HERE IS READ OFF A REAL PAGE. The panel is a drawing of the pool, so the only way to
 * know it draws the pool is to write into the pool through the API and look at the page.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import {
  MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES,
  MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES,
} from '../src/shared/participants.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

/**
 * THE CONTACTS ROW FOR THE AGENT THIS FILE TALKS TO, as the row's own `data-contact` spells it.
 * `participantKey` in shared/messages.ts is what builds that string, and it is `<kind>:<id>`. The id is
 * the agent's registry id, which since the mint (criterion I1) is not its handle, so it is read once
 * the agent is registered, in `beforeAll`.
 */
let THE_AGENT_ROW = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'builder-x',
}

/** One message written through the API, by whoever the headers say. */
async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
  return ((await said.json()) as { record: { id: string } }).record.id
}

/**
 * ONE MODULE, FILED THROUGH THE API, whose id a message can name.
 *
 * A MODULE RATHER THAN A NOTE, because a label is stored under `data.shortForms` and only the
 * `module` and `report` kinds declare that field. A note takes no label at all, so a note could
 * never show the first half of what this test is about.
 */
async function filed(title: string): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'module',
      title,
      data: { context: 'A mount that has to hold twenty newtons.', parts: [] },
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/**
 * A LABEL WRITTEN ONTO A RECORD THROUGH THE ROUTE A PERSON WRITES ONE THROUGH.
 *
 * The route checks the revision the words were written from against the ledger, so the pair has to
 * be read off the record rather than made up here.
 */
async function writeTheLabel(recordId: string, label: string): Promise<void> {
  const ledger = await fetch(`${app.api}/api/records/${recordId}/revisions`, { headers: AS_THE_OWNER })
  expect(ledger.status, await ledger.clone().text()).toBe(200)
  const newest = ((await ledger.json()) as { revisions: { seq: number; contentHash: string }[] }).revisions[0]
  expect(newest, `record ${recordId} has no revision to write a label against`).toBeDefined()
  const wrote = await fetch(`${app.api}/api/records/${recordId}/short-forms`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      madeFrom: { seq: newest?.seq, contentHash: newest?.contentHash },
      forms: { label },
    }),
  })
  expect(wrote.status, await wrote.text()).toBe(200)
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-panel', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  // AND THE WORDS IT WRITES ABOUT ITSELF, which are free text and are the agent's own to set. The
  // `state` on the record is a two-word lifecycle; this is the sentence the panel draws small.
  const said = await fetch(`${app.api}/api/participants/agent/builder-x`, {
    method: 'PATCH',
    headers: AS_THE_AGENT,
    body: JSON.stringify({ state: 'fitting the wrist camera' }),
  })
  expect(said.status, await said.text()).toBe(200)
  const read = await fetch(`${app.api}/api/participants/agent/builder-x`, { headers: AS_THE_OWNER })
  THE_AGENT_ROW = `agent:${((await read.json()) as { participant: { id: string } }).participant.id}`
  await say(AS_THE_AGENT, 'The wrist camera fit is holding at 0.4 px.', { kind: 'person', id: THE_PERSON })
  await say(AS_THE_OWNER, 'Good. Keep going.', { kind: 'agent', id: 'builder-x' })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

/**
 * Open the page, press the circle, and come back to the contacts.
 *
 * THE PANEL REMEMBERS WHICH CONVERSATION WAS OPEN, which is a feature and is what the test below
 * proves. Every other test wants to start from the contacts, so this presses back when the panel
 * comes up already inside a conversation.
 */
async function openThePanel(mode: Mode = 'normal'): Promise<void> {
  await app.page.goto(`${app.site}/?mode=${mode}#/`)
  // DESIGN D (wave 13y) DRAWS THE CIRCLE ONLY WHILE A MESSAGE WAITS, so the chat is opened the way the page offers it.
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 15_000 })
  const inside = await app.page.$('.px-chat-back')
  if (inside !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-contact', { timeout: 15_000 })
}

/**
 * PRESS THE CONTACT FOR BUILDER X BY NAME, and wait until its messages are really on the screen.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO PRESS "THE FIRST CONTACT", AND THAT IS WHY TWO CASES TIMED OUT
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2gb802IVZQ9P`: two cases in this file timed out about one run in eight. Both open a
 * conversation and then wait for something that only the newest message draws.
 *
 * The contacts list is not in a fixed order. `.px-chat-contact` also draws groups and writers
 * nobody registered, and the rows this page has depend on what the case before it wrote. So
 * `page.click('.px-chat-contact')` pressed whichever row happened to be first, and when that was
 * not Builder X the case then waited its whole timeout for a link that was in a conversation
 * nobody had opened. Every row carries `data-contact`, which is `<kind>:<id>` — the key
 * `participantKey` builds in shared/messages.ts — so the row can be named instead of counted.
 *
 * MEASURED, EIGHT FULL-FILE RUNS EACH WAY, 6 September 2026. Pressing the first row: five runs of
 * eight went red — three on 'draws the label somebody wrote in front of the id', one on 'follows a
 * record id in a message with one press', one on 'draws the label at level 1 and the title at level
 * 2'. Pressing Builder X by name: two runs of eight, both on 'draws the label somebody wrote in
 * front of the id'. Both cases problem `2gb802IVZQ9P` named stopped failing; the third one is a
 * different fault, it never fails when its case is run alone eight times, and it has its own
 * problem record.
 *
 * AND THE WAIT AFTERWARDS IS ON THE DRAWN MESSAGES, not on `.px-chat-words`. A conversation that
 * has not been read yet can already hold the words of the one drawn before it, so the old wait
 * could be satisfied by the previous case's conversation. `.px-chat-said` is the list element, and
 * it is only there once this conversation has something in it.
 */
async function openTheConversation(): Promise<void> {
  await app.page.waitForSelector(`.px-chat-contact[data-contact="${THE_AGENT_ROW}"]`, { timeout: 15_000 })
  await app.page.click(`.px-chat-contact[data-contact="${THE_AGENT_ROW}"]`)
  await app.page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 15_000 })
}

/**
 * WAIT UNTIL A MESSAGE IS DRAWN IN THE CONVERSATION. NEVER WAIT ON `document.body.textContent`.
 *
 * ---------------------------------------------------------------------------------------
 * THE WAIT THAT WAS NOT A WAIT, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Two cases in this file waited for the words they had just typed to appear anywhere in
 * `document.body.textContent`. The composer is a `<textarea>`, and React writes its value into the
 * element's `defaultValue` — which IS that element's text content. So the words were in
 * `document.body.textContent` from the moment they were typed, and the wait was satisfied before
 * the message was ever sent.
 *
 * Measured on 6 September 2026, twice on this page: right after typing the three lines and before
 * Enter was pressed, `document.body.textContent.includes('third line')` was already true, the
 * textarea's own `textContent` held all three lines, and no drawn message held any of them.
 *
 * Everything after such a wait races the send. That is problem `J-fXTM4wFagt` — the growth case
 * read the box's height while the box still held the text, and failed with "expected 66 to be less
 * than 66" about one run in three — and it is also why the case above it sometimes could not find
 * its own message in the pool.
 *
 * `.px-chat-said` is the list of drawn messages. It holds nothing of the composer.
 *
 * ---------------------------------------------------------------------------------------
 * AND ONLY A STORED MESSAGE COUNTS, NOT THE BUBBLE DRAWN AT THE PRESS
 * ---------------------------------------------------------------------------------------
 *
 * Since criterion M113 the panel draws the reader's message at the press, with a clock, before the
 * server has answered (`send` in src/web/components/Chat.tsx). That bubble is in `.px-chat-said`
 * too, and its `.px-chat-bubble` carries `data-send-state`. A stored message's bubble carries no
 * `data-send-state`, and it is drawn only after a read of the conversation returned it, so the
 * server has written it by then.
 *
 * The old wait took any bubble holding the words. So it ended at the press, and the two cases that
 * read the pool next could ask before the server had written the message. Measured on 27 September
 * 2026 on main dac417f1d, beside a whole-tree run and 24 busy loops (load 13 to 44 on 20 cores):
 * three runs of this file in ten failed, twice with "the message the panel sent is not in the pool"
 * and once with "the line breaks did not reach the pool". That is the fault the merge queue saw.
 */
async function waitUntilDrawn(words: string): Promise<void> {
  await app.page.waitForFunction(
    (looking: string) =>
      [...document.querySelectorAll('.px-chat-said .px-chat-bubble:not([data-send-state]) > .px-chat-words')].some(
        (one) => one.textContent?.includes(looking) === true,
      ),
    words,
    { timeout: 10_000 },
  )
}

/**
 * RUN `act` WHILE EVERY MESSAGE THE PAGE SENDS REACHES THE SERVER A SECOND AND A HALF LATE.
 *
 * This is what a loaded machine does to the send, made to happen on every run. The bubble with the
 * clock is drawn at once and stays on screen while the send is held. So a case that took that bubble
 * for the sent message, and read the pool inside `act`, reads it before the server has the message on
 * every run, and not only when the machine is busy. `tests/a-sent-message-shows-where-it-stands.test.ts`
 * holds the send the same way to see the clock. Only a POST of a message is held; every other request
 * goes straight through. A held send is let through before the hold is taken away, so taking it away
 * never cuts a send short.
 */
async function withTheSendHeld(act: () => Promise<void>): Promise<void> {
  const where = `${app.api}/api/records`
  const holds: Promise<void>[] = []
  const hold = async (route: Route): Promise<void> => {
    const request = route.request()
    if (request.method() === 'POST' && (request.postDataJSON() as { kind?: string } | null)?.kind === 'message') {
      const held = new Promise<void>((done) => setTimeout(done, 1_500))
      holds.push(held)
      await held
    }
    await route.continue()
  }
  await app.page.route(where, hold)
  try {
    await act()
  } finally {
    await Promise.all(holds)
    await app.page.unroute(where, hold)
  }
}

/** Wait until the composer is taller than `was`, so a height is read after the box has grown. */
async function waitUntilTheBoxIsTallerThan(was: number): Promise<void> {
  await app.page.waitForFunction(
    (start: number) => (document.querySelector('.px-chat-box')?.getBoundingClientRect().height ?? 0) > start,
    was,
    { timeout: 10_000 },
  )
}

/** Wait until the composer is shorter than `was`, so a height is read after the box has shrunk. */
async function waitUntilTheBoxIsShorterThan(was: number): Promise<void> {
  await app.page.waitForFunction(
    (tall: number) => (document.querySelector('.px-chat-box')?.getBoundingClientRect().height ?? tall) < tall,
    was,
    { timeout: 10_000 },
  )
}

describe('the circle is on every page and opens a panel', () => {
  it('is drawn on the home page and on a record page, with a name a reader can hear', async () => {
    for (const where of ['#/', '#/records']) {
      await app.page.goto(`${app.site}/${where}`)
      await app.page.waitForSelector('.px-chat-circle', { timeout: 15_000 })
      const name = await app.page.getAttribute('.px-chat-circle', 'aria-label')
      expect(name, `the circle on ${where} has no name`).toBeTruthy()
    }
  }, 120_000)

  it('says how many messages are unread, in the name a reader hears', async () => {
    await app.page.goto(`${app.site}/#/`)
    await app.page.waitForSelector('.px-chat-unread', { timeout: 15_000 })
    const name = (await app.page.getAttribute('.px-chat-circle', 'aria-label')) ?? ''
    expect(name).toBe(CHAT_WORDS.unreadName(1))
  }, 120_000)

  it('opens on a press and closes on Escape', async () => {
    await openThePanel()
    expect(await app.page.$('.px-chat')).not.toBeNull()
    await app.page.keyboard.press('Escape')
    await app.page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await app.page.$('.px-chat')).toBeNull()
  }, 120_000)
})

describe('the first screen is the reader, then the contacts', () => {
  it('draws the reader own picture, name and state at the top', async () => {
    await openThePanel()
    const own = await app.page.$('.px-chat-me .avatar')
    expect(own, 'the reader own picture is not drawn').not.toBeNull()
    const name = await app.page.textContent('.px-chat-me .px-chat-name')
    expect(name).toBe(THE_TEST_OFFICES_OWNER.name)
  }, 120_000)

  it('draws every other participant with a dot and the last thing said', async () => {
    await openThePanel()
    const names = await app.page.$$eval('.px-chat-contact .px-chat-name', (all) => all.map((one) => one.textContent))
    expect(names).toContain('Builder X')
    expect(names, 'the reader is in their own contacts').not.toContain(THE_TEST_OFFICES_OWNER.name)
    const last = await app.page.textContent('.px-chat-contact .px-chat-last')
    expect(last).toContain('Keep going')
    const dot = await app.page.getAttribute('.px-chat-contact .px-chat-dot', 'data-colour')
    expect(['green', 'grey', 'red']).toContain(dot)
  }, 120_000)
})

describe('a contact opens the conversation', () => {
  it('draws the other side picture, name, dot and state on top, and the messages under it', async () => {
    await openThePanel()
    await openTheConversation()
    expect(await app.page.textContent('.px-chat-them .px-chat-name')).toBe('Builder X')
    expect(await app.page.textContent('.px-chat-them-words')).toContain('fitting the wrist camera')
    expect(await app.page.$('.px-chat-them .px-chat-dot')).not.toBeNull()
    const said = await app.page.$$eval('.px-chat-words', (all) => all.map((one) => one.textContent))
    expect(said[0], 'the oldest message is first').toContain('0.4 px')
    expect(said[1]).toContain('Keep going')
  }, 120_000)

  // M113, amended: queued ✓, delivered muted ✓✓, read green ✓✓.
  // The clock still belongs to the press before the server answers, which these API-filed rows
  // never pass through. Only the recipient's own act makes the double ticks green.
  it('puts a tick on the reader own message once the server has written it', async () => {
    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-mark', { timeout: 10_000 })
    const shapes = await app.page.$$eval('.px-chat-mark', (all) => all.map((one) => one.getAttribute('data-shape')))
    expect(shapes, 'the message the owner sent should carry a tick once it is queued at the server').toEqual(['tick'])
    // AND ONLY ON THE OWNER'S OWN. A mark on somebody else's message would be saying how far the owner's own reading
    // of it had got, which is not what a tick means.
    const bodies = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.getAttribute('data-mine')))
    expect(bodies).toEqual(['no', 'yes'])
  }, 120_000)

  it('draws the read shape when the agent has said it read the message', async () => {
    // Reading the agent's conversation writes no mark. The agent then explicitly marks it read.
    const read = await fetch(`${app.api}/api/messages/conversation?kind=person&id=${THE_PERSON}`, {
      headers: AS_THE_AGENT,
    })
    expect(read.status, await read.clone().text()).toBe(200)
    const { messages } = (await read.json()) as { messages: { id: string; sentBy: { kind: string; id: string } | null }[] }
    // ONLY THE PERSON'S OWN, which are the ones addressed to the agent and so the ones the agent can
    // say it read. The agent's own message in this conversation carries no delivery row to itself.
    const thePersonsMessages = messages.filter((one) => one.sentBy?.kind === 'person')
    expect(thePersonsMessages.length).toBeGreaterThan(0)
    for (const one of thePersonsMessages) {
      const marked = await fetch(`${app.api}/api/messages/${one.id}/mark`, {
        method: 'POST',
        headers: { ...AS_THE_AGENT, 'content-type': 'application/json' },
        body: JSON.stringify({ mark: 'seen' }),
      })
      expect(marked.status, await marked.clone().text()).toBe(200)
    }
    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-mark[data-shape="read"]', { timeout: 10_000 })
    const shapes = await app.page.$$eval('.px-chat-mark', (all) => all.map((one) => one.getAttribute('data-shape')))
    expect(shapes).toEqual(['read'])
  }, 120_000)

  it('follows a record id in a message with one press', async () => {
    const note = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'note', title: 'Where the numbers are', data: { body: 'here' } }),
    })
    const noteId = ((await note.json()) as { record: { id: string } }).record.id
    await say(AS_THE_AGENT, `The numbers are in ${noteId}.`, { kind: 'person', id: THE_PERSON })

    await openThePanel()
    await openTheConversation()
    // A RECORD LINK IS FOUND BY ITS `data-named` MARK, whichever drawing made it: the chat's own linker
    // or the shared inline reading. A page address is a press as well, and carries no such mark.
    await app.page.waitForSelector('.px-chat-words a[data-named]', { timeout: 10_000 })
    await app.page.click('.px-chat-words a[data-named]')
    await app.page.waitForFunction((id: string) => window.location.hash.includes(id), noteId, { timeout: 10_000 })
    expect(app.page.url()).toContain(noteId)
  }, 120_000)

  /**
   * A RECORD NAMED IN A MESSAGE IS DRAWN AS ITS SHORT NAME AND THEN ITS ID. Criterion M42.
   *
   * The id is good for finding or searching for a record, and it stays, but it does not say what
   * the record is. So a link is written as the level-1 name, then # and the id.
   *
   * BOTH RECORDS ARE REAL AND SO IS THE LABEL. The label is written through the route a person
   * writes one through, so what the panel draws is a stored short form and not a fixture.
   */
  // pVOBOQm2_73I keeps the record-id assertions in Developer mode.
  it('draws the label somebody wrote in front of the id, and stands the title in where nobody wrote one', async () => {
    const withALabel = await filed('The printed clamp mount cracked under load at fifteen newtons')
    const withoutOne = await filed('The aluminium mount held at twenty newtons')
    await writeTheLabel(withALabel, 'Clamp mount load test')
    await say(AS_THE_AGENT, `Both results: ${withALabel} and ${withoutOne}.`, { kind: 'person', id: THE_PERSON })

    await openThePanel('inspect')
    await openTheConversation()
    // The names are read after the messages are drawn, so the drawing waits for the read rather
    // than for the message. Both links are waited for by id, because other messages in this
    // conversation name records too.
    await app.page.waitForFunction(
      (ids: string[]) =>
        ids.every((id) =>
          [...document.querySelectorAll('.px-chat-words a[data-named]')].some(
            (one) => (one.textContent ?? '').includes(id) && one.getAttribute('data-named') !== 'no',
          ),
        ),
      [withALabel, withoutOne],
      { timeout: 15_000 },
    )
    const links = await app.page.$$eval('.px-chat-words a[data-named]', (all) =>
      all.map((one) => ({
        text: one.textContent ?? '',
        named: one.getAttribute('data-named'),
        says: one.getAttribute('title'),
      })),
    )

    // THE LABEL, THEN THE ID. The id stays in the words on screen, so searching the page finds it.
    const labelled = links.find((one) => one.text.includes(withALabel))
    expect(labelled?.text, 'the record with a label is not drawn as its label and its id').toBe(
      `Clamp mount load test #${withALabel}`,
    )
    expect(labelled?.named).toBe('label')

    // AND WHERE NOBODY WROTE A LABEL, THE TITLE STANDS IN AND THE LINK SAYS SO. A reader who took
    // a whole sentence for the short name would be reading the drawing wrongly, so it is marked.
    const bare = links.find((one) => one.text.includes(withoutOne))
    expect(bare?.text, 'the record with no label is not drawn as its title and its id').toBe(
      `The aluminium mount held at twenty newtons #${withoutOne}`,
    )
    expect(bare?.named).toBe('title')
    expect(bare?.says).toBe(CHAT_WORDS.titleStandsInForTheLabel)

    // AND IT IS STILL ONE PRESS TO THE RECORD.
    await app.page.click(`.px-chat-words a[data-named="label"]`)
    await app.page.waitForFunction((id: string) => window.location.hash.includes(id), withALabel, { timeout: 10_000 })
    expect(app.page.url()).toContain(withALabel)

    // IN NORMAL MODE THE LABEL AND THE STAND-IN TITLE STAY, AND ONLY THE ID GOES (pVOBOQm2_73I).
    await openThePanel()
    await openTheConversation()
    const plainly = async (id: string): Promise<string> => {
      const link = app.page.locator(`.px-chat-words a[data-named][href*="${id}"]:not([data-named="no"])`).last()
      await link.waitFor({ timeout: 15_000 })
      return (await link.textContent()) ?? ''
    }
    expect(await plainly(withALabel), 'normal mode lost the label').toBe('Clamp mount load test')
    expect(await plainly(withoutOne), 'normal mode lost the title standing in').toBe('The aluminium mount held at twenty newtons')
  }, 120_000)

  /**
   * WHICH OF THE TWO NAMES A LINK DRAWS IS THE OWNER'S TO CHOOSE. Criterion M47.
   *
   * A link in a message shows the level-1 or the level-2 name, as the owner sets it. Level 1 is the default.
   *
   * ONE RECORD WITH A LABEL PROVES BOTH HALVES. At level 1 the label is drawn; at level 2 the same
   * record's title is drawn instead, which is the only thing that tells the setting from a record
   * that happens to have no label.
   */
  it('draws the label at level 1 and the title at level 2, as the reader chose', async () => {
    const both = await filed('The steel bracket held at thirty newtons and was not deformed')
    await writeTheLabel(both, 'Steel bracket load test')
    await say(AS_THE_AGENT, `The bracket: ${both}.`, { kind: 'person', id: THE_PERSON })

    /** What the link for that record says on the page right now. */
    const theLink = async (): Promise<{ text: string; named: string | null; says: string | null }> => {
      await openThePanel('inspect')
      await openTheConversation()
      await app.page.waitForFunction(
        (id: string) =>
          [...document.querySelectorAll('.px-chat-words a[data-named]')].some(
            (one) => (one.textContent ?? '').includes(id) && one.getAttribute('data-named') !== 'no',
          ),
        both,
        { timeout: 15_000 },
      )
      const found = await app.page.$$eval(
        '.px-chat-words a[data-named]',
        (all, id) =>
          all
            .filter((one) => (one.textContent ?? '').includes(id as string))
            .map((one) => ({
              text: one.textContent ?? '',
              named: one.getAttribute('data-named'),
              says: one.getAttribute('title'),
            })),
        both,
      )
      const one = found[0]
      if (one === undefined) throw new Error(`no link on the page names ${both}`)
      return one
    }

    // NOBODY HAS CHOSEN, so the default stands and the label is drawn.
    const held = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
    expect(held.status, await held.clone().text()).toBe(200)
    expect(
      ((await held.json()) as { participant: { messageLinkLevel: string | null } }).participant.messageLinkLevel,
      'somebody has already chosen, so the default is not what is measured',
    ).toBeNull()
    expect(MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES).toBe('label')
    const atLevelOne = await theLink()
    expect(atLevelOne.text, 'level 1 does not draw the label somebody wrote').toBe(`Steel bracket load test #${both}`)
    expect(atLevelOne.named).toBe('label')

    // AND AT LEVEL 2 THE SAME RECORD IS DRAWN AS ITS TITLE, label or no label.
    const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ messageLinkLevel: 'title' }),
    })
    expect(set.status, await set.clone().text()).toBe(200)
    // IT IS STORED, not held on a screen: it is read back from the door on a fresh request.
    const back = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
    expect(
      ((await back.json()) as { participant: { messageLinkLevel: string | null } }).participant.messageLinkLevel,
    ).toBe('title')

    // A RELOAD AND NOT A `goto`, because the address does not change: the panel reads the setting
    // when it loads, and a navigation to the address the browser is already at does not reload it.
    await app.page.reload()
    await app.page.waitForFunction(
      (id: string) =>
        [...document.querySelectorAll('.px-chat-words a[data-named]')].some(
          (one) => (one.textContent ?? '').includes(id) && (one.textContent ?? '').startsWith('The steel bracket'),
        ),
      both,
      { timeout: 20_000 },
    )
    const atLevelTwo = await theLink()
    expect(atLevelTwo.text, 'level 2 does not draw the record own title').toBe(
      `The steel bracket held at thirty newtons and was not deformed #${both}`,
    )
    expect(atLevelTwo.named).toBe('title')
    // AND NOTHING IS SAID ABOUT A TITLE STANDING IN, because at level 2 the title is what was asked
    // for. That mark belongs to level 1, where a title is drawn only because nobody wrote a label.
    expect(atLevelTwo.says, 'level 2 says the title is standing in for a label nobody asked for').toBeNull()

    // AND THE CHOICE IS PUT BACK, so the tests after this one see the default.
    const undo = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ messageLinkLevel: '' }),
    })
    expect(undo.status, await undo.clone().text()).toBe(200)
    await app.page.goto(`${app.site}/#/`)
  }, 120_000)

  /**
   * WHERE A LINK SITS IN THE BUBBLE IS THE OWNER'S TO CHOOSE. Criterion M48.
   *
   * A link used to break onto a centred line of its own. That is an option now, beside running on
   * in the sentence. The default was the centred line, and it has since been changed to the
   * sentence. Its own centred line stays a choice, and a choice somebody saved still wins over the default.
   *
   * A SHORT NAME IS WHAT TELLS THE TWO APART. A name too long for the bubble ends up on its own line
   * under either choice, because there is nowhere else for it to go. A short one either runs on with
   * the sentence or does not, and that is the whole of the setting.
   */
  it('runs a link on with the sentence by default, and gives it its own centred line when the owner chooses that', async () => {
    const shortOne = await filed('The rubber pad held at eleven newtons')
    await writeTheLabel(shortOne, 'Pad test')
    await say(AS_THE_AGENT, `See ${shortOne} now.`, { kind: 'person', id: THE_PERSON })

    /** Where that link and the words before it are drawn, read off the page. */
    const whereItSits = async (): Promise<{
      left: number
      width: number
      top: number
      innerLeft: number
      bubbleLeft: number
      bubbleWidth: number
      beforeRight: number
      beforeBottom: number
    }> => {
      await openThePanel('inspect')
      await openTheConversation()
      await app.page.waitForFunction(
        (id: string) =>
          [...document.querySelectorAll('.px-chat-words a[data-named]')].some(
            (one) => (one.textContent ?? '').includes(id) && one.getAttribute('data-named') !== 'no',
          ),
        shortOne,
        { timeout: 15_000 },
      )
      return await app.page.$$eval(
        '.px-chat-words a[data-named]',
        (all, id) => {
          const link = all.find((one) => (one.textContent ?? '').includes(id as string))
          if (link === undefined) throw new Error('no link on the page names that record')
          const words = link.closest('.px-chat-words')
          if (words === null) throw new Error('the link is not inside a message body')
          const box = link.getBoundingClientRect()
          const bubble = words.getBoundingClientRect()
          // WHERE THE WORDS THEMSELVES ARE, which is not where the box is when they are centred.
          const inside = document.createRange()
          inside.selectNodeContents(link)
          const first = [...inside.getClientRects()][0]
          // AND WHERE THE SENTENCE BEFORE THE LINK ENDS.
          const previous = link.previousSibling
          if (previous === null) throw new Error('nothing is drawn before the link')
          const before = document.createRange()
          before.selectNodeContents(previous)
          const rects = [...before.getClientRects()]
          const last = rects[rects.length - 1]
          if (first === undefined || last === undefined) throw new Error('nothing measurable was drawn')
          return {
            left: box.left,
            width: box.width,
            top: box.top,
            innerLeft: first.left,
            bubbleLeft: bubble.left,
            bubbleWidth: bubble.width,
            beforeRight: last.right,
            beforeBottom: last.bottom,
          }
        },
        shortOne,
      )
    }

    // NOBODY HAS CHOSEN, so the default stands: the words start where the words before them ended.
    expect(MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES).toBe('inline')
    const byDefault = await whereItSits()
    // A SPACE'S WIDTH OF SLACK, because the words before the link end with one and a browser may or
    // may not draw it inside the range that was measured.
    expect(byDefault.innerLeft, 'the link did not run on from the words before it').toBeLessThan(
      byDefault.beforeRight + 8,
    )
    expect(byDefault.innerLeft, 'the link went back to the left edge of the bubble').toBeGreaterThan(
      byDefault.bubbleLeft + 4,
    )
    expect(byDefault.width, 'the link is as wide as the bubble').toBeLessThan(byDefault.bubbleWidth - 10)

    // AND WHEN THE OWNER HAS SAVED ITS OWN LINE, the saved choice wins over the default: its own line,
    // the width of the bubble, centred.
    const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ messageLinkLayout: 'own-line' }),
    })
    expect(set.status, await set.clone().text()).toBe(200)
    const held = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers: AS_THE_OWNER })
    expect(
      ((await held.json()) as { participant: { messageLinkLayout: string | null } }).participant.messageLinkLayout,
    ).toBe('own-line')

    // A RELOAD, for the reason the test above gives: the address is the one the browser is already at.
    await app.page.reload()
    await app.page.waitForFunction(
      () => [...document.querySelectorAll('.px-chat-words a[data-named]')].some((one) => one.getAttribute('data-layout') === 'own-line'),
      undefined,
      { timeout: 20_000 },
    )
    const onItsOwnLine = await whereItSits()
    expect(onItsOwnLine.left, 'the link does not start at the left edge of the bubble').toBeCloseTo(
      onItsOwnLine.bubbleLeft,
      0,
    )
    expect(onItsOwnLine.width, 'the link is not as wide as the bubble').toBeCloseTo(onItsOwnLine.bubbleWidth, 0)
    expect(onItsOwnLine.top, 'the link is on the same line as the words before it').toBeGreaterThanOrEqual(
      onItsOwnLine.beforeBottom - 1,
    )
    expect(onItsOwnLine.innerLeft, 'the words in the link are not centred').toBeGreaterThan(onItsOwnLine.left + 2)

    // AND THE CHOICE IS PUT BACK, so the tests after this one see the default.
    const undo = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ messageLinkLayout: '' }),
    })
    expect(undo.status, await undo.clone().text()).toBe(200)
    await app.page.goto(`${app.site}/#/`)
  }, 120_000)

  it('sends what the reader typed, and the message is in the pool', async () => {
    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-box', { timeout: 10_000 })
    await app.page.fill('.px-chat-box', 'Try the 3 mm pad next.')
    // THE SEND IS HELD, so the wait has to see the stored message and not the clock's bubble.
    await withTheSendHeld(async () => {
      await app.page.click('.px-chat-send')
      await waitUntilDrawn('Try the 3 mm pad next.')
      const pool = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
      const held = (await pool.json()) as { messages: { body: string; sentBy: { id: string } | null }[] }
      const mine = held.messages.find((one) => one.body === 'Try the 3 mm pad next.')
      expect(mine, 'the message the panel sent is not in the pool').toBeDefined()
      expect(mine?.sentBy?.id).toBe(THE_PERSON)
    })
  }, 120_000)
})

describe('a message that arrives while the panel is open needs no reload', () => {
  it('draws it without the page being asked to look again', async () => {
    await openThePanel()
    await openTheConversation()
    await say(AS_THE_AGENT, 'The pad arrived and it fits.', { kind: 'person', id: THE_PERSON })
    await app.page.waitForFunction(
      () => document.body.textContent?.includes('The pad arrived and it fits.') === true,
      undefined,
      { timeout: 10_000 },
    )
    expect(await app.page.textContent('.px-chat-said')).toContain('The pad arrived and it fits.')
  }, 120_000)
})

describe('the panel remembers what it was doing', () => {
  it('is still open, on the same conversation, after the page is loaded again', async () => {
    await openThePanel()
    await openTheConversation()
    await app.page.reload()
    // WAIT FOR THE PAGE TO SAY IT HAS FINISHED DRAWING, not for the first message to appear.
    // The name at the top of a conversation comes from the registry and the messages come from the
    // pool, and they are two requests: the first message can be on screen while the registry read
    // is still out, and the name then falls back to the handle for a moment. That gap widened when
    // the messages connection started being held open on every page, because a held connection
    // takes one of the browser's connections to the server for as long as the page is open.
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.px-chat-words', { timeout: 15_000 })
    expect(await app.page.textContent('.px-chat-them .px-chat-name')).toBe('Builder X')
  }, 120_000)
})

/**
 * CLOSING THE PANEL AND OPENING IT AGAIN KEEPS THE READER'S PLACE. Criterion M58.
 *
 * A fault: with a conversation open, closing the panel by the circle and opening it again moved
 * the chat back to the earliest message.
 *
 * WHAT WAS WRONG. The panel is `{open ? <aside…> : null}` in components/Chat.tsx, so pressing the
 * circle throws the whole message list away. Pressing it again builds a fresh one, and a fresh list
 * starts at the top — the OLDEST message. The effect that puts the newest message on screen ran on
 * `[talk, theGroup]` only, and neither of those changes while the panel is shut: the conversation
 * is not re-read, because `talkingTo` never moved. So nothing scrolled the new list.
 *
 * HOW IT IS MEASURED. The conversation is filled with more messages than the panel can show, so
 * that where the list is scrolled to is a real question. The check is on the list element's own
 * `scrollTop`: at the top it is 0, and the newest message being on screen means it is at the
 * bottom. Reading the position rather than looking for words is what tells "scrolled to the newest"
 * from "the list is short enough that everything is visible".
 */
describe('closing the panel and opening it again keeps the reader’s place', () => {
  it('comes back to the same conversation at the newest message, not the earliest', async () => {
    // ENOUGH MESSAGES THAT THE LIST REALLY SCROLLS. Twenty-five short lines overflow the panel at
    // this height by a long way, so being at the top and being at the bottom are far apart.
    //
    // THEY ARE THE READER'S OWN, AND THAT IS THE PART TO READ TWICE. Drawing a message addressed to
    // the reader makes the panel tell Mole Office they have seen it; that write comes back on the
    // messages connection, the panel reads the conversation again, and a fresh conversation object
    // is what the scroll effect watches. So a conversation full of messages TO the reader scrolls
    // itself to the newest one for a reason that has nothing to do with the panel being reopened.
    //
    // Measured on 6 September 2026 with the fix taken out: right after reopening the list was at 0
    // — the earliest message, which is the owner's complaint exactly — and fifty milliseconds later it was
    // at 1222 of a possible 1229. The case passed with the feature deleted. Messages the reader
    // sent are marked by nobody, so nothing re-reads, and what is left is the reopening alone.
    for (let n = 1; n <= 25; n += 1) {
      await say(AS_THE_OWNER, `Trial ${String(n)} of the wrist camera fit.`, { kind: 'agent', id: 'builder-x' })
    }

    await openThePanel()
    await openTheConversation()
    await waitUntilDrawn('Trial 25 of the wrist camera fit.')

    /** How far down the drawn list of messages is scrolled, and how far down it could go. */
    const wherePeopleAreLooking = async (): Promise<{ at: number; most: number }> =>
      app.page.$eval('.px-chat-said', (list) => ({
        at: Math.round(list.scrollTop),
        most: Math.round(list.scrollHeight - list.clientHeight),
      }))

    const before = await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        if (list === null) return false
        return list.scrollHeight - list.clientHeight > 40
      },
      undefined,
      { timeout: 15_000 },
    )
    expect(before, 'the conversation is short enough to fit, so nothing about scrolling is measured').toBeTruthy()

    // NOTHING IS WAITING TO BE MARKED READ, so nothing will re-read the conversation while this is
    // being measured. See the note on the messages above.
    await app.page.waitForFunction(() => document.querySelector('.px-chat-circle .px-chat-unread') === null, undefined, {
      timeout: 20_000,
    })

    // THE PRESS THAT CLOSES IT, which is the owner's: the window's own close. Design D (wave 13y) draws the circle only
    // while a message waits, and nothing waits here.
    await app.page.click('.px-chat-close')
    await app.page.waitForFunction(() => document.querySelector('.px-chat') === null, undefined, { timeout: 15_000 })

    // AND THE PRESS THAT OPENS IT AGAIN, the way the page offers it.
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 15_000 })
    await waitUntilDrawn('Trial 25 of the wrist camera fit.')
    await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        if (list === null) return false
        return list.scrollHeight - list.clientHeight - list.scrollTop < 8
      },
      undefined,
      { timeout: 15_000 },
    )

    const after = await wherePeopleAreLooking()
    expect(after.most, "the reopened list does not scroll, so nothing about the owner's complaint is measured").toBeGreaterThan(
      40,
    )
    // AT THE BOTTOM, WHICH IS THE NEWEST MESSAGE. It landed at 0 — the earliest — before this.
    expect(after.most - after.at).toBeLessThan(8)
  }, 180_000)
})

describe('at 390 the panel is the whole width', () => {
  it('reaches both edges and nothing scrolls sideways', async () => {
    await app.page.setViewportSize({ width: 390, height: 844 })
    await openThePanel()
    const box = await app.page.$eval('.px-chat', (one) => {
      const at = one.getBoundingClientRect()
      return { left: at.left, right: at.right, width: window.innerWidth, scroll: document.documentElement.scrollWidth }
    })
    expect(box.left).toBeLessThanOrEqual(1)
    expect(box.right).toBeGreaterThanOrEqual(box.width - 1)
    expect(box.scroll, 'the page scrolls sideways with the panel open').toBeLessThanOrEqual(box.width + 1)
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 120_000)
})

describe('the composer grows with what is typed', () => {
  // Problem tFdHDJiQNVc8: the composer breaks lines, and when the text is longer than the box the
  // box grows upward, rather than running on with only its end in view.
  it('breaks a line on Enter, grows upward, and sends the whole text on Shift+Enter', async () => {
    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-box', { timeout: 10_000 })
    const before = await app.page.$eval('.px-chat-box', (el) => el.getBoundingClientRect().height)
    await app.page.click('.px-chat-box')
    await app.page.keyboard.type('First line of a longer note')
    await app.page.keyboard.press('Enter')
    await app.page.keyboard.type('second line')
    await app.page.keyboard.press('Enter')
    await app.page.keyboard.type('third line')
    const typed = await app.page.$eval('.px-chat-box', (el) => (el as HTMLTextAreaElement).value)
    expect(typed).toBe('First line of a longer note\nsecond line\nthird line')
    // THE HEIGHT IS WAITED FOR, NOT READ ON THE WAY PAST. A rendered size is the end of a render,
    // and a test that reads one straight after a keystroke is asking whether the render has
    // happened yet rather than how tall the box is.
    await waitUntilTheBoxIsTallerThan(before)
    const after = await app.page.$eval('.px-chat-box', (el) => el.getBoundingClientRect().height)
    expect(after, 'the box did not grow with three lines').toBeGreaterThan(before * 2)
    // Nothing went out on Enter: the pool holds no message with this text yet. Enter is the new line
    // by default.
    const pool = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
    const held = (await pool.json()) as { messages: { body: string }[] }
    expect(held.messages.some((one) => one.body.startsWith('First line of a longer note'))).toBe(false)
    // THE SEND IS HELD here too, for the reason the case above gives.
    await withTheSendHeld(async () => {
      await app.page.keyboard.press('Shift+Enter')
      await waitUntilDrawn('third line')
      const sent = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
      const now = (await sent.json()) as { messages: { body: string }[] }
      const mine = now.messages.find((one) => one.body.startsWith('First line of a longer note'))
      expect(mine?.body, 'the line breaks did not reach the pool').toBe('First line of a longer note\nsecond line\nthird line')
    })
    // And the box is one line again once it is empty.
    await waitUntilTheBoxIsShorterThan(after)
    const emptied = await app.page.$eval('.px-chat-box', (el) => el.getBoundingClientRect().height)
    expect(emptied).toBeLessThan(after)
    expect(emptied, 'the emptied box is not back to the one line it started at').toBe(before)
  }, 120_000)
})

describe('a dragged height is the smallest the composer may be, and it still grows with the text', () => {
  // Problem EDDFguLt9CF9: the composer's height can also be changed by dragging its top edge,
  // within limits the builder sets. The smallest and largest are the two the growing already uses: one line
  // and eight.
  //
  // AND THE DRAGGED HEIGHT IS THE SMALLEST, NOT THE LARGEST. Criterion M46, problem xxbNEYeTWD9i.
  // A box dragged taller did not grow when the typing went past it, perhaps because it had been
  // sized by hand first.

  /** Drag the composer's top edge by this much, as a pointer really does it. */
  async function dragTheTopEdge(by: number): Promise<void> {
    const at = await app.page.$eval('.px-chat-box-grip', (one) => {
      const box = one.getBoundingClientRect()
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    })
    await app.page.mouse.move(at.x, at.y)
    await app.page.mouse.down()
    // IN STEPS, because one jump can arrive as a single move a handler reading only the last one
    // would still pass on. A real pointer sends many.
    await app.page.mouse.move(at.x, at.y + by / 2, { steps: 4 })
    await app.page.mouse.move(at.x, at.y + by, { steps: 4 })
    await app.page.mouse.up()
  }

  const boxHeight = async (): Promise<number> =>
    await app.page.$eval('.px-chat-box', (el) => el.getBoundingClientRect().height)

  /** How tall one line of this box is, read from the box rather than written down twice. */
  const oneLine = async (): Promise<number> =>
    await app.page.$eval('.px-chat-box', (el) => parseFloat(getComputedStyle(el).lineHeight) || 20)

  it('drags the edge up to a taller box, keeps at least that height, and stops at eight lines', async () => {
    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-box-grip', { timeout: 10_000 })
    await app.page.fill('.px-chat-box', '')
    const before = await boxHeight()

    // DRAGGING THE TOP EDGE UPWARD MAKES IT TALLER. Negative, because up the screen is a smaller y.
    await dragTheTopEdge(-60)
    const dragged = await boxHeight()
    expect(dragged, 'dragging the top edge up did not make the box taller').toBeGreaterThan(before + 30)

    // AND IT STAYS. Typing one line does not put it back to the height that line needs.
    await app.page.click('.px-chat-box')
    await app.page.keyboard.type('one short line')
    expect(await boxHeight(), 'the box went back to the height its text needs').toBeCloseTo(dragged, 0)

    // AND TYPING PAST IT GROWS IT. This assertion used to read the other way round: a dragged
    // height held the box at exactly that height and the text scrolled inside it, which is the
    // defect criterion M46 names. Five lines is more than a 60px drag asked for, so the box is
    // now the height its text needs and no longer the height that was dragged.
    for (let i = 0; i < 4; i += 1) {
      await app.page.keyboard.press('Enter')
      await app.page.keyboard.type(`another line ${String(i)}`)
    }
    expect(await boxHeight(), 'the text did not grow the box past the height somebody dragged to').toBeGreaterThan(
      dragged + 3,
    )

    // DRAGGING PAST THE LARGEST STOPS AT EIGHT LINES. The line height is read from the box itself,
    // so this is the same number the growing is held to and not a second copy of it.
    await dragTheTopEdge(-800)
    const most = (await oneLine()) * 8 + 10
    const pulled = await boxHeight()
    expect(pulled, 'the drag went past eight lines').toBeLessThanOrEqual(most + 1)
    expect(pulled, 'the drag stopped short of eight lines').toBeGreaterThan(most - 3)

    // PRESSING THE EDGE TWICE HANDS THE CHOICE BACK, and the box is the size its text needs again.
    await app.page.dblclick('.px-chat-box-grip')
    const grownAgain = await boxHeight()
    expect(grownAgain, 'a double press did not give the box back to the text').toBeLessThan(pulled - 3)
  }, 120_000)

  /**
   * THE THREE MEASUREMENTS CRITERION M46 IS JUDGED BY, in one run, in lines rather than in pixels.
   *
   * A LINE IS MEASURED FROM THE BOX, TWICE, AND NOT READ OFF THE STYLESHEET. The box is emptied,
   * which makes it one line tall, and then given two lines, and the difference is what one more
   * line of text really adds. The computed `line-height` is a different number in this browser —
   * 16.9 against a real 18.5 at the size the panel draws — so a test that divided by it would be
   * measuring something other than lines.
   */
  it('grows to six lines over a three-line floor, and is one line again when emptied or on a double press', async () => {
    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-box-grip', { timeout: 10_000 })
    await app.page.dblclick('.px-chat-box-grip')
    await app.page.fill('.px-chat-box', '')
    const oneLineTall = await boxHeight()
    await app.page.fill('.px-chat-box', 'one\ntwo')
    const line = (await boxHeight()) - oneLineTall
    expect(line, 'a second line did not make the box taller, so nothing here can be counted in lines').toBeGreaterThan(5)
    await app.page.fill('.px-chat-box', '')
    /** How many lines tall the box is now, counted from the height one line makes. */
    const inLines = (height: number): number => (height - oneLineTall) / line + 1

    // DRAG TO THREE LINES: two more than the one it starts at.
    await dragTheTopEdge(-2 * line)
    expect(inLines(await boxHeight()), 'the drag did not leave the box three lines tall').toBeCloseTo(3, 0)

    // TYPE SIX LINES: the box is six lines tall, not three.
    await app.page.click('.px-chat-box')
    for (let i = 0; i < 6; i += 1) {
      if (i > 0) await app.page.keyboard.press('Enter')
      await app.page.keyboard.type(`line ${String(i)}`)
    }
    expect(inLines(await boxHeight()), 'six lines of text did not make the box six lines tall').toBeCloseTo(6, 0)

    // DELETE THE TEXT: the box is one line again, and the dragged floor went with the message.
    // M46: an emptied box goes back to one line.
    await app.page.fill('.px-chat-box', '')
    expect(inLines(await boxHeight()), 'an emptied box did not come back to one line').toBeCloseTo(1, 0)

    // DRAG AGAIN WITH TEXT IN THE BOX, THEN PRESS THE EDGE TWICE: the dragged height is handed back
    // and the box is as tall as its one line of text.
    await app.page.fill('.px-chat-box', 'one line')
    await dragTheTopEdge(-2 * line)
    expect(inLines(await boxHeight()), 'the second drag did not leave the box three lines tall').toBeCloseTo(3, 0)
    await app.page.dblclick('.px-chat-box-grip')
    expect(inLines(await boxHeight()), 'a double press did not give the dragged height back').toBeCloseTo(1, 0)
  }, 120_000)

  it('leaves the panel\'s own edges working, which are a different three handles', async () => {
    await openThePanel()
    await openTheConversation()
    const panelBefore = await app.page.$eval('.px-chat', (el) => el.getBoundingClientRect().height)
    const at = await app.page.$eval('.px-chat-grip[data-edge="top"]', (one) => {
      const box = one.getBoundingClientRect()
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    })
    await app.page.mouse.move(at.x, at.y)
    await app.page.mouse.down()
    await app.page.mouse.move(at.x, at.y - 40, { steps: 4 })
    await app.page.mouse.move(at.x, at.y - 80, { steps: 4 })
    await app.page.mouse.up()
    const panelAfter = await app.page.$eval('.px-chat', (el) => el.getBoundingClientRect().height)
    expect(panelAfter, 'the panel stopped resizing when the composer learned to').toBeGreaterThan(panelBefore + 40)
  }, 120_000)
})

/**
 * A MESSAGE THAT CAME OUT OF A RUN SAYS WHICH TOOL RAN IT.
 *
 * A message may need to say which tool its agent's run used, for instance a small claude, codex or
 * opencode mark beside it. The fact was already stored — a reply the worker files carries
 * `fromRun`, and that run's session record carries `runtime` — and the panel drew neither.
 *
 * NOTHING IS DRAWN WHERE NOTHING IS KNOWN, which is the other half and the one a guess would break:
 * a message a person wrote came out of no run and gets no mark at all.
 */
describe('a message from a run carries the tool that ran it', () => {
  it('draws the short word for opencode, names the tool in full, and marks a person\'s message not at all', async () => {
    // A RUN THAT SAYS WHICH TOOL IT IS, and a reply that says it came out of that run.
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'session',
        title: 'A run of OpenCode',
        data: { state: 'finished', runtime: 'opencode', doing: 'answering the owner' },
      }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
    const run = ((await filed.json()) as { record: { id: string } }).record.id

    const reply = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_AGENT,
      body: JSON.stringify({
        kind: 'message',
        title: 'The answer from the run',
        data: {
          body: 'This answer came out of a run.',
          to: [{ kind: 'person', id: THE_PERSON }],
          fromRun: run,
        },
      }),
    })
    expect(reply.status, await reply.clone().text()).toBe(201)

    await openThePanel()
    await openTheConversation()
    await app.page.waitForSelector('.px-chat-ranby', { timeout: 15_000 })

    // ONE MARK, ON THE ONE MESSAGE THAT CAME OUT OF A RUN. The conversation already holds a message
    // the agent wrote and one the person wrote, and neither names a run.
    const marks = await app.page.$$eval('.px-chat-ranby', (all) =>
      all.map((one) => ({ word: one.textContent ?? '', name: one.getAttribute('aria-label') ?? '' })),
    )
    expect(marks, 'the panel drew a tool beside a message that named no run').toHaveLength(1)
    expect(marks[0]?.word, 'the short word is the one the owner named').toContain('opencode')
    expect(marks[0]?.name, 'the tool is named in full for a reader who hears the page').toContain('OpenCode')

    // AND THE MARK IS BESIDE THE RIGHT MESSAGE, not floating at the top of the conversation.
    const beside = await app.page.$eval('.px-chat-ranby', (one) => {
      const bubble = one.closest('.px-chat-bubble')
      return bubble?.querySelector('.px-chat-words')?.textContent ?? ''
    })
    expect(beside).toContain('This answer came out of a run.')
  }, 120_000)
})

it('shows a long contact name and its project tag in the chat list', async () => {
  const contact = { handle: 'made-up-long-contact', name: 'Made-up Returning Agent' }
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'agent', title: contact.name, data: { handle: contact.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  const participants = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as { agents: { id: string; handle: string; name: string }[] }
  const registered = participants.agents.find((one) => one.handle === contact.handle)
  expect(registered?.name).toBe(contact.name)
  const id = registered?.id
  expect(id).toBeTruthy()
  await say(AS_THE_OWNER, 'Made-up contact message.', { kind: 'agent', id: id! })
  await say({ ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': contact.handle }, 'Made-up answer from the contact.', { kind: 'person', id: THE_PERSON })
  const projects = (await (await fetch(`${app.api}/api/workspaces`, { headers: AS_THE_OWNER })).json()) as { workspaces: { id: string; title: string }[] }
  const project = projects.workspaces.find((one) => one.id === AS_THE_OWNER['x-mole-office-workspace'])?.title
  expect(project).toBeTruthy()
  for (const theme of ['light']) for (const width of [1440, 660]) {
    const context = await app.browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
    try {
      const page = await context.newPage()
      await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      const filter = page.locator('.px-chat-page-lists .px-chat-filter')
      await filter.focus()
      await filter.fill(contact.name)
      const row = page.locator('.px-chat-page-lists .px-chat-contact').filter({ hasText: contact.name }).first()
      await row.waitFor({ timeout: 30_000 })
      for (const [selector, expected] of [['.px-chat-name', contact.name], ['.px-chat-project-mark', project!]] as const) {
        const element = row.locator(selector).filter({ hasText: expected }).first()
        await element.waitFor({ timeout: 30_000 })
        const drawn = await element.evaluate((el) => ({ text: el.textContent?.trim(), cut: el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5 }))
        expect(drawn, `${width}, ${theme}: ${selector}`).toEqual({ text: expected, cut: false })
      }
    } finally {
      await context.close()
    }
  }
}, 180_000)

it('keeps the delivery mark on the Edit line at 390 in the light theme', async () => {
  // One theme: whether the mark stays on the Edit line does not depend on the colours.
  const theme = 'light'
  const body = `Made-up line for the delivery mark in ${theme}.`
  await say(AS_THE_OWNER, body, { kind: 'agent', id: 'builder-x' })
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  try {
    const page = await context.newPage()
    await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
    await page.locator(`.px-chat-page-lists .px-chat-contact[data-contact="${THE_AGENT_ROW}"]`).click({ timeout: 30_000 })
    const foot = page.locator('.px-chat-one').filter({ hasText: body }).locator('.px-chat-foot')
    await foot.locator('.px-chat-edit').waitFor({ timeout: 30_000 })
    await foot.locator('.px-chat-mark').waitFor({ timeout: 30_000 })
    const onSameLine = await foot.evaluate((el) => {
      const press = el.querySelector('.px-chat-edit')!.getBoundingClientRect()
      const mark = el.querySelector('.px-chat-mark')!.getBoundingClientRect()
      return press.top < mark.bottom && mark.top < press.bottom
    })
    expect(onSameLine, `${theme}: the mark left its Edit line`).toBe(true)
  } finally {
    await context.close()
  }
}, 180_000)
