// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT TAKES A PERSON TO A PAGE ONLY WITH THEIR CONSENT, AND ONE PRESS ENDS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M8 of design/messages/ACCEPTANCE.md: a right-click anywhere lets an agent lead the person to a
 * report, and leading is by consent.
 *
 * Three rules, and this file walks all three in one go, because they are one behaviour:
 *
 *   1. A LEAD NEVER MOVES THE PAGE ON ITS OWN. Not following, an offer is drawn and nothing moves.
 *   2. FOLLOWING IS A PERSON'S ACT. It is started from the right-click menu, on that agent, and the
 *      agent is told. While it lasts, a lead moves the page at once and the agent's words are drawn
 *      at the place it took them to.
 *   3. ONE PRESS ENDS IT. A control saying whose lead this is and how to stop is on screen the whole
 *      time, and after it the next lead is an offer again.
 *
 * ---------------------------------------------------------------------------------------
 * THE WHOLE THING IS IN ONE TEST, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * Each rule is about what happens NEXT after the one before it. Split into three tests they would
 * either share state through the file — which is the same thing with the order hidden — or each set
 * up a browser of its own for a minute. The assertions are written out so a failure names the step.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Request, Route } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LEADING } from '../src/shared/messages.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let recordA = ''
let recordB = ''
/** The registry id the office gave the guide. The message telling it is addressed to this id. */
let guideId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_GUIDE = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'guide-z',
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** File one note and give back its id. */
async function note(title: string, body: string): Promise<string> {
  const res = await write(AS_THE_OWNER, { kind: 'note', title, data: { date: '2026-09-04', body } })
  const held = (await res.json()) as { record?: { id: string } }
  expect(res.status, JSON.stringify(held)).toBe(201)
  return held.record?.id ?? ''
}

/** The guide offers to take the owner to one record, saying something about it. */
async function offerToTake(recordId: string, words: string): Promise<Response> {
  return write(AS_THE_GUIDE, {
    kind: 'message',
    title: words.slice(0, 40),
    data: {
      body: words,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId, workspaceId: 'default' } },
    },
  })
}

/** True for the page's request that stores the message telling the agent it is being followed. */
function tellsTheAgent(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    new URL(request.url()).pathname === '/api/records' &&
    (request.postData() ?? '').includes(LEADING.startedFollowing)
  )
}

/**
 * HOW LONG THE PAGE'S MESSAGE TO THE AGENT IS HELD BEFORE IT IS SENT.
 *
 * The page draws the control that ends following at the press, and only then sends the message that
 * tells the agent (`start` in src/web/components/Leading.tsx). So the control can be on screen before
 * the server has stored the message. Under a loaded machine the case read the pool in that gap and
 * did not find the message (the merge queue's run RIl233txMSeq). Holding the message here makes that
 * gap happen on every run, so a case that reads the pool without waiting for the message to be stored
 * fails every time.
 */
const THE_MESSAGE_IS_HELD_MS = 1500

/** The address in the bar, which is what "the page moved" means. */
async function whereWeAre(): Promise<string> {
  return app.page.evaluate(() => window.location.hash)
}

beforeAll(async () => {
  app = await liveApp({ name: 'leading', viewport: { width: 1440, height: 1000 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Guide Z',
    data: { handle: 'guide-z', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  const everyone = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await everyone.json()) as { agents: { id: string; handle: string }[] }).agents
  guideId = agents.find((one) => one.handle === 'guide-z')?.id ?? ''
  expect(guideId).not.toBe('')
  recordA = await note('The first place', 'A note the guide will offer to take somebody to.')
  recordB = await note('The second place', 'A second note, for the lead that arrives while following.')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('an agent may offer to take somebody to a page', () => {
  it('accepts a lead, and refuses one naming a record this project does not hold', async () => {
    const good = await offerToTake(recordA, 'Come and look at the first place.')
    expect(good.status, await good.text()).toBe(201)
    const bad = await write(AS_THE_GUIDE, {
      kind: 'message',
      title: 'Nowhere',
      data: {
        body: 'Come and look at nothing.',
        to: [{ kind: 'person', id: THE_PERSON }],
        lead: { target: { kind: 'record', recordId: 'no-such-id-1', workspaceId: 'default' } },
      },
    })
    expect(bad.status).toBeGreaterThanOrEqual(400)
    expect(await bad.text()).toContain('no-such-id-1')
  })
})

describe('nothing moves a person without their consent, and one press ends it', () => {
  it('keeps the unknown-agent wording when the completed registry has no sender', async () => {
    const context = await app.browser.newContext()
    const page = await context.newPage()
    await page.route((url) => url.pathname === '/api/participants' && url.searchParams.get('shape') === 'page', async (route) => {
      const response = await route.fetch()
      const registry = await response.json()
      await route.fulfill({ response, json: { ...registry, agents: registry.agents.filter((one: { id: string }) => one.id !== guideId) } })
    })
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const offer = await page.textContent('.px-lead-offer')
      expect(offer).toContain(LEADING.offer(null, 'The first place'))
      expect(offer).not.toContain('Guide Z')
      expect(await page.evaluate(() => window.location.hash)).toBe('#/records')
    } finally {
      await context.close()
    }
  }, 180_000)

  it('offers, then follows from the right-click, then stops', async () => {
    // ---- 1. THE PAGE IS SOMEWHERE, AND A LEAD ARRIVES.
    // Hold the mount's participant reply until the connection's recovery read of offers has
    // answered. Page readiness must then include installing those names, even though a newer
    // offer read superseded the mount's offer read.
    let releaseNames = (): void => {}
    const namesMayArrive = new Promise<void>((resolve) => { releaseNames = resolve })
    let namesWereAsked = (): void => {}
    const namesAsked = new Promise<void>((resolve) => { namesWereAsked = resolve })
    const theNamesDoor = (url: URL): boolean => url.pathname === '/api/participants' && url.searchParams.get('shape') === 'page'
    const holdNames = async (route: Route): Promise<void> => {
      const response = await route.fetch()
      namesWereAsked()
      await namesMayArrive
      await route.fulfill({ response })
    }
    const theStreamStateDoor = (url: URL): boolean => url.pathname === '/api/events/state' && url.searchParams.has('connectingFor')
    const recoverOffers = async (route: Route): Promise<void> => {
      await namesAsked
      const response = await route.fetch()
      const state = await response.json()
      // Say the connection crossed an event: the real channel then asks its panels to recover.
      await route.fulfill({ response, json: { ...state, whileConnecting: { ...state.whileConnecting, reached: 1 } } })
    }
    await app.page.route(theNamesDoor, holdNames)
    await app.page.route(theStreamStateDoor, recoverOffers)
    let offerReads = 0
    const recovered = app.page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/messages' && url.searchParams.get('leads') === '1' && ++offerReads === 2
    }, { timeout: 30_000 })
    try {
      await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await (await recovered).finished()
    } finally {
      releaseNames()
    }
    await waitForThePage(app.page, 60_000)
    await app.page.unroute(theNamesDoor, holdNames)
    await app.page.unroute(theStreamStateDoor, recoverOffers)
    await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })

    // NOTHING MOVED. The offer from the first test is on the screen and the address is unchanged.
    expect(await whereWeAre()).toBe('#/records')
    const offer = await app.page.textContent('.px-lead-offer')
    expect(offer).toContain('Guide Z')
    expect(offer).toContain('The first place')
    // And nothing moves however long it is left: this is the whole of rule 1.
    await new Promise((wake) => setTimeout(wake, 1500))
    expect(await whereWeAre()).toBe('#/records')

    // ---- 2. FOLLOWING IS STARTED FROM THE RIGHT-CLICK MENU, ON THAT AGENT.
    await app.page.click('main.page', { button: 'right', position: { x: 20, y: 20 } })
    // BEHIND ONE MORE PRESS since a decision, in a criterion change of
    // 27 September 2026.
    await app.page.click('.px-talk-more-btn')
    await app.page.waitForSelector('.px-lead-follow', { timeout: 30_000 })
    expect(await app.page.textContent('.px-lead-follow')).toContain('Guide Z')
    // THE MESSAGE TELLING THE AGENT IS HELD FOR A MOMENT, and the case waits for the server's answer
    // to it. `THE_MESSAGE_IS_HELD_MS` says why.
    const theWriteDoor = (url: URL): boolean => url.pathname === '/api/records'
    const hold = async (route: Route): Promise<void> => {
      if (tellsTheAgent(route.request())) await new Promise((wake) => setTimeout(wake, THE_MESSAGE_IS_HELD_MS))
      await route.continue()
    }
    await app.page.route(theWriteDoor, hold)
    const stored = app.page.waitForResponse((res) => tellsTheAgent(res.request()), { timeout: 30_000 })
    await app.page.click('.px-lead-follow')

    // THE CONTROL THAT ENDS IT IS ON SCREEN FROM THAT MOMENT.
    await app.page.waitForSelector('.px-lead-stop', { timeout: 30_000 })
    expect(await app.page.textContent('.px-lead-stop')).toContain('Guide Z')

    // AND THE AGENT IS TOLD, because an agent that is not told cannot know whether to offer or lead.
    // The pool is read once the server has answered the page's message, so the message is stored.
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect((await stored).status(), 'the server did not store the message telling the agent').toBe(409)
    const said = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
    const pool = (await said.json()) as { messages: { body: string; to: { id: string }[] }[] }
    expect(
      pool.messages.some((one) => one.to.some((who) => who.id === guideId) && one.body.includes('following you now')),
      'the agent was told that this browser is following it',
    ).toBe(true)
    // THE HOLD IS TAKEN AWAY ONLY AFTER THE POOL WAS READ. Taking it away sends a message still held,
    // so taken away earlier it would end the hold before the read it is there to test.
    await app.page.unroute(theWriteDoor, hold)

    // ---- 3. WHILE FOLLOWING, A LEAD MOVES THE PAGE AT ONCE.
    const second = await offerToTake(recordB, 'And now the second place, which is the one that matters.')
    expect(second.status, await second.text()).toBe(201)
    await app.page.waitForFunction(
      (where: string) => window.location.hash === where,
      `#/r/${recordB}`,
      { timeout: 30_000 },
    )
    // AND THE AGENT'S WORDS ARE ON THE PAGE IT TOOK THE READER TO, said by the agent that brought
    // them. A lead that also says what on that page it is about gets a card beside that thing as
    // well, and tests/an-agent-comments-on-a-page.test.ts is where that is proved.
    await app.page.waitForSelector('.px-lead-brought', { timeout: 30_000 })
    const brought = await app.page.textContent('.px-lead-brought')
    expect(brought).toContain('Guide Z')
    expect(brought).toContain('the second place, which is the one that matters')

    // ---- 4. ONE PRESS ENDS IT.
    await app.page.click('.px-lead-stop')
    await app.page.waitForSelector('.px-lead-stop', { state: 'detached', timeout: 30_000 })

    // ---- 5. AND THE NEXT LEAD IS AN OFFER AGAIN.
    const third = await offerToTake(recordA, 'Back to the first place, if you want.')
    expect(third.status, await third.text()).toBe(201)
    await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
    await new Promise((wake) => setTimeout(wake, 1500))
    expect(await whereWeAre(), 'a lead after stopping did not move the page').toBe(`#/r/${recordB}`)
  }, 180_000)
})

describe('the messages panel draws an offer and a comment for what they are', () => {
  it('shows the offer with its press, and says which record a comment was left on', async () => {
    // A COMMENT FROM THE SAME AGENT, so the panel has both kinds of message in one conversation.
    const said = await write(AS_THE_GUIDE, {
      kind: 'message',
      title: 'A remark about the first place',
      data: {
        body: 'This is the paragraph I meant.',
        to: [{ kind: 'person', id: THE_PERSON }],
        target: { target: { kind: 'record', recordId: recordA, workspaceId: 'default' } },
      },
    })
    expect(said.status, await said.text()).toBe(201)

    await app.page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const already = await app.page.$('.px-chat')
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    const inside = await app.page.$('.px-chat-back')
    if (inside !== null) await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-words', { timeout: 30_000 })

    // A COMMENT SAYS WHICH RECORD IT WAS LEFT ON, and the name is a link. Since a decision that name is in the quote
    // block above the comment's words.
    await app.page.waitForSelector('.px-chat-quote-link', { timeout: 30_000 })
    expect(await app.page.textContent('.px-chat-quote-link')).toContain('The first place')

    // AN OFFER IS A CARD WITH THE PRESS THAT TAKES IT, the same press the page's own card carries.
    await app.page.waitForSelector('.px-chat-lead-go', { timeout: 30_000 })
    const card = await app.page.textContent('.px-chat-lead')
    expect(card).toContain('Guide Z')
  }, 180_000)
})

describe('a browser that refuses to remember anything follows nobody', () => {
  it('draws its pages, offers the lead, and does not move', async () => {
    /**
     * M8'S RULE IN THE BROWSER THAT CANNOT REMEMBER: leading is simply off.
     *
     * Following is kept in this browser and nowhere else, so a browser that refuses site storage
     * can never be following anybody. `src/web/lib/following.ts` answers "following nobody" when
     * the store cannot be read, which is both the honest answer and the safe one — but until
     * 4 September the rule could not be reached, because the app itself did not start with storage
     * blocked: `workspace.ts` read `window.localStorage` while it was being imported and the page
     * drew "Mole Office did not start" and nothing else. Problem `6DaURy-aOWOT`, and the boot was
     * fixed in commit 2766f81. This is the part that problem could not check.
     *
     * The property itself throws here, which is what Chrome does when site data is blocked and the
     * half a try around getItem does not catch. tests/the-page-opens-when-the-browser-blocks-storage
     * covers the shell and the panel; this covers what leading does.
     */
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(`
      const refuse = () => { throw new Error('Access to storage is not allowed from this context.') }
      Object.defineProperty(window, 'localStorage', { configurable: true, get: refuse })
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: refuse })
    `)
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      expect(await page.$('.boot-failure'), 'the page is still showing "Mole Office did not start"').toBeNull()
      expect(await page.$('.shell'), 'the app shell did not draw').not.toBeNull()

      // NOBODY IS BEING FOLLOWED, so there is nothing to stop.
      expect(await page.$('.px-lead-stop'), 'this browser thinks it is following somebody').toBeNull()

      // NO OTHER PAGE IS SHOWING THE GUIDE'S CONVERSATION. The first page of this file was left with
      // it open, and a page showing a conversation marks a new message in it read, which takes the
      // offer out of what is waiting. Since 26 September 2026 the event carries the message, so that
      // page marks it read at once rather than after reading the conversation again; the first page
      // is taken off the office so the offer here is still waiting.
      await app.page.goto('about:blank')

      // AND A LEAD IS AN OFFER, WHICH IS THE WHOLE OF THE RULE. The page stays where it is.
      const lead = await offerToTake(recordA, 'Come and look at the first place.')
      expect(lead.status, await lead.text()).toBe(201)
      await page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
      await new Promise((wake) => setTimeout(wake, 1500))
      expect(await page.evaluate(() => window.location.hash)).toBe('#/records')
      expect(await page.$('.px-lead-stop'), 'an offer alone started following somebody').toBeNull()
    } finally {
      await context.close()
    }
  }, 180_000)
})
