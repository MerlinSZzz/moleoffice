// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S ONE-LINE DUTY IS DRAWN UNDER ITS NAME IN THE CHAT AND ON ITS PROFILE (wave 13y round 86, item 12).
 *
 * For a secretary the line is the area of its duties record, in whichever project holds it, as
 * GET /api/secretaries/duties?scope=office answers it. A secretary nobody recorded duties for gets no line: where there is
 * nothing to show, nothing is shown (wave 13y round 111). Nobody else has a line yet: the owner has not
 * chosen what an agent that is not a secretary, or a person, would show. When the read fails, an agent's line says it
 * could not be read and why, because drawing nothing would say the agent has no line. Mole Office itself sits in the
 * agent registry and is not an agent, so nothing is drawn under it even then.
 *
 * A SUPERVISOR A SECRETARY'S DUTIES NAME gets the area those duties give it, in the same three places (wave 13y round 91,
 * item 12b). A supervisor no duties name gets nothing.
 *
 * The line is drawn in three places: under the name in the chat's contact list, under the name in the heading of a
 * conversation with one participant, and under the name on the participant's profile. The duties are read once for the
 * page, and not again while it stays open.
 *
 * MADE-UP RECORDS, filed by the test office's person: a decision of the owner's, two secretaries, one with a duties
 * record naming one supervisor and one without, that supervisor, a worker agent, and one message from each agent to the
 * person, so each has a contact row.
 *
 * MUTATIONS, after a control run:
 *   1. `theDutyLineOf` in src/web/components/ChatDuty.tsx draws an empty line for a secretary nobody recorded duties for:
 *      the contact list case, the profile case and the one-read case fail.
 *   2. It draws a line for every agent the list does not name: the worker's lines fail, in the contact list, the heading
 *      and the profile cases.
 *   3. The duties are read again by every line drawn: the one-read case fails.
 *   4. A failed read draws nothing: the failed-read case fails.
 *   5. The conversation heading in src/web/components/Chat.tsx draws no line: the heading case fails.
 *   6. `theDutyLineOf` reads Mole Office itself as an agent, which it is not: the failed-read case fails on the
 *      office's profile.
 *   7. The profile in src/web/pages/ProfilePage.tsx draws no line: the profile case fails.
 *   8. The contact row in src/web/components/ContactChooser.tsx draws no line: the contact list case fails.
 *   9. `theDutyLineOf` reads no secretary's supervisors: the supervisor's lines fail, in the contact list, the heading
 *      and the profile cases.
 *  10. It draws the secretary's own area under its supervisor: the same three cases fail.
 *
 * With W13Y_DUTY_SHOTS set to a folder, it photographs the contact list, the secretary's conversation and its profile at
 * 1440, 990, 660 and 390 in both themes, under the made-up label, and writes the height of the profile's head at each.
 * It photographs the supervisor's row, conversation and profile the same way.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR } from '../src/shared/roles.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { whoPath } from '../src/web/components/router.tsx'

/** The four agents: two secretaries, a supervisor and a worker, each a name, a handle and the card it holds. */
const AGENTS = {
  keeper: { name: 'Ledger Keeper', handle: 'ledger-keeper', role: THE_SECRETARY },
  warden: { name: 'Gate Warden', handle: 'gate-warden', role: THE_SECRETARY },
  lamplighter: { name: 'Lamp Lighter', handle: 'lamp-lighter', role: THE_SUPERVISOR },
  sweeper: { name: 'Stair Sweeper', handle: 'stair-sweeper', role: null },
} as const
type Who = keyof typeof AGENTS
/** The area of the keeper's duties, the one line drawn under its name. */
const AREA = 'Keeps the night ledger and answers the late bell.'
/** The area the keeper's duties give the lamplighter, the one line drawn under the lamplighter's name. */
const SUPERVISOR_AREA = 'The lamps of the night ledger.'
const SHOTS = process.env.W13Y_DUTY_SHOTS
const LABEL = 'Made-up data — a test office with two secretaries, a supervisor, a worker and four messages, not real office data'
/**
 * The words for a line that could not be read, in English, from the list the page reads. NOT TYPED AS THE LIST, so the
 * file runs the same before the words were in it, and fails there on what is drawn.
 */
const WORDS = enWave13y as Record<string, unknown>
const UNREAD = String(WORDS['chat.duty.unread'] ?? '')
/** What the failed read answers, made up here. */
const THE_FAILURE = 'A made-up failure of the duties read.'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

describe("a secretary's one-line duty, under its name", () => {
  let app: LiveApp
  /** Each agent's registry id, as the office gave it. */
  const ids = {} as Record<Who, string>
  /** Mole Office's own registry id, as the office gave it. */
  let officeId = ''

  beforeAll(async () => {
    app = await liveApp({ name: 'chat-duty-line', viewport: { width: 1440, height: 1000 } })
    const decision = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({
        kind: 'decision',
        title: 'Made-up decision the duties rest on',
        data: { option_taken: 'The keeper keeps the night ledger.', because: 'A made-up reason.', decided_by: THE_OWNER, replaces: [] },
      }),
    })
    expect(decision.status, await decision.clone().text()).toBe(201)
    const decisionId = ((await decision.json()) as { record: { id: string } }).record.id
    for (const who of Object.keys(AGENTS) as Who[]) {
      const { name, handle, role } = AGENTS[who]
      const started = await fetch(`${app.api}/api/agents/started`, {
        method: 'POST',
        headers: AS_THE_PERSON,
        body: JSON.stringify(role === null ? { handle, name } : { handle, name, role }),
      })
      expect(started.status, await started.clone().text()).toBe(201)
      ids[who] = ((await started.json()) as { agent: { id: string } }).agent.id
    }
    const duties = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({
        kind: 'secretary_duties',
        title: "Made-up duties of the ledger's secretary",
        data: {
          secretary: { kind: 'agent', id: ids.keeper },
          area: AREA,
          restsOn: [decisionId],
          supervisors: [{ agent: { kind: 'agent', id: ids.lamplighter }, area: SUPERVISOR_AREA }],
        },
      }),
    })
    expect(duties.status, await duties.clone().text()).toBe(201)
    // THE CONTROL: the door lists the two secretaries, one with the area and the supervisor it names and one with nobody's
    // duties, and neither the supervisor nor the worker as a secretary.
    const listed = (await (await fetch(`${app.api}/api/secretaries/duties`, { headers: AS_THE_PERSON })).json()) as {
      secretaries: { agent: { id: string }; duties: { area: string; supervisors?: { agent: { id: string }; area: string }[] } | null }[]
    }
    const asListed = (who: Who) => listed.secretaries.find((one) => one.agent.id === ids[who])
    expect([asListed('keeper')?.duties?.area, asListed('warden')?.duties, asListed('lamplighter'), asListed('sweeper')]).toEqual([AREA, null, undefined, undefined])
    expect(asListed('keeper')?.duties?.supervisors).toEqual([{ agent: { kind: 'agent', id: ids.lamplighter }, area: SUPERVISOR_AREA }])
    for (const who of Object.keys(AGENTS) as Who[]) {
      const said = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[who].handle },
        body: JSON.stringify({ kind: 'message', title: `From ${AGENTS[who].name}`, data: { body: `${AGENTS[who].name} is on duty.`, to: [{ kind: 'person', id: THE_PERSON }] } }),
      })
      expect(said.status, await said.clone().text()).toBe(201)
    }
    const office = await fetch(`${app.api}/api/participants/agent/${MOLE_OFFICE_HANDLE}`, { headers: AS_THE_PERSON })
    expect(office.status, await office.clone().text()).toBe(200)
    officeId = ((await office.json()) as { participant: { id: string } }).participant.id
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /**
   * A window of its own on the Messages page, in one theme and at one width, with every request to the duties door
   * counted, and that door answering with a failure when asked to.
   */
  async function aWindow(theme: 'light' | 'dark' = 'light', width = 1440, failing = false) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const asked: string[] = []
    if (failing) {
      // THE SERVER'S OWN HEADERS ARE KEPT, with its status and body replaced. A reply that does not say which office
      // answered is refused by the page as another office's, and the line would then say that instead.
      await context.route('**/api/secretaries/duties*', async (route) => {
        const real = await route.fetch()
        await route.fulfill({ response: real, status: 500, contentType: 'application/json', body: JSON.stringify({ error: THE_FAILURE }) })
      })
    }
    const page = await context.newPage()
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/secretaries/duties') asked.push(request.url())
    })
    await page.goto(`${app.site}/#/messages`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    return { context, page, asked }
  }

  /** The chat's contact list, open, with a row for each of the four agents. */
  async function theContacts(page: Page) {
    await page.locator('.px-chat-circle').click()
    await page.locator('.px-chat').waitFor({ timeout: 30_000 })
    if ((await page.locator('.px-chat-back').count()) > 0) await page.locator('.px-chat-back').first().click()
    for (const who of Object.keys(AGENTS) as Who[]) await theRowOf(page, who).waitFor({ timeout: 30_000 })
  }

  /** One agent's row in the chat's contact list. */
  const theRowOf = (page: Page, who: Who) =>
    page.locator('.px-chat-contact', { has: page.locator('.px-chat-name', { hasText: AGENTS[who].name }) }).first()

  /** Opens the panel at one agent's conversation, the way another page asks it to. */
  async function theConversationWith(page: Page, who: Who): Promise<void> {
    await page.evaluate(([name, detail]) => window.dispatchEvent(new CustomEvent(name, { detail })), [OPEN_AT, participantKey({ kind: 'agent', id: ids[who] })] as const)
    await expect.poll(() => wordsOf(page.locator('.px-chat-them .px-chat-name')), { timeout: 30_000 }).toBe(AGENTS[who].name)
  }

  /** Goes to one agent's profile in the same document, so the page is not loaded again. */
  async function theProfileOf(page: Page, who: Who): Promise<void> {
    await page.evaluate((path) => {
      window.location.hash = path
    }, whoPath('agent', ids[who]))
    await expect.poll(() => wordsOf(page.locator('h1.prof-name')), { timeout: 30_000 }).toBe(AGENTS[who].name)
  }

  /** Goes to Mole Office's own profile in the same document. */
  async function theOfficesProfile(page: Page): Promise<void> {
    await page.evaluate((path) => {
      window.location.hash = path
    }, whoPath('agent', officeId))
    await page.locator('h1.prof-name').first().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 30_000 }).toContain(officeId)
  }

  /** The words drawn on one element, trimmed. */
  const wordsOf = async (where: ReturnType<Page['locator']>): Promise<string> => ((await where.first().textContent()) ?? '').trim()

  /** The duty lines drawn in one place: what each says and its words. */
  const linesIn = async (where: ReturnType<Page['locator']>): Promise<{ says: string | null; words: string }[]> =>
    where.locator('.duty-line').evaluateAll((all) => all.map((one) => ({ says: one.getAttribute('data-says'), words: (one.textContent ?? '').trim() })))

  it('draws the area under a secretary and its supervisor in the contact list, and nothing for a secretary with no duties or for a worker', async () => {
    const { context, page } = await aWindow()
    try {
      await theContacts(page)
      await expect.poll(() => linesIn(theRowOf(page, 'keeper')), { timeout: 15_000 }).toEqual([{ says: 'area', words: AREA }])
      expect(await linesIn(theRowOf(page, 'warden'))).toEqual([])
      expect(await linesIn(theRowOf(page, 'lamplighter'))).toEqual([{ says: 'area', words: SUPERVISOR_AREA }])
      expect(await linesIn(theRowOf(page, 'sweeper'))).toEqual([])
      // THE WHOLE LINE IS THE HOVER TEXT, because a narrow chat cuts it at the edge.
      expect(await theRowOf(page, 'keeper').locator('.duty-line').getAttribute('title')).toBe(AREA)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('draws the line under the name in the heading of a conversation, for a secretary and its supervisor, and none for a worker', async () => {
    const { context, page } = await aWindow()
    try {
      await theConversationWith(page, 'keeper')
      await expect.poll(() => linesIn(page.locator('.px-chat-them')), { timeout: 15_000 }).toEqual([{ says: 'area', words: AREA }])
      await theConversationWith(page, 'lamplighter')
      await expect.poll(() => linesIn(page.locator('.px-chat-them')), { timeout: 15_000 }).toEqual([{ says: 'area', words: SUPERVISOR_AREA }])
      await theConversationWith(page, 'sweeper')
      expect(await linesIn(page.locator('.px-chat-them'))).toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it('draws the line directly under the name on the profile, for a secretary and its supervisor, and none for a secretary with no duties or for a worker', async () => {
    const { context, page } = await aWindow()
    try {
      for (const [who, lines] of [
        ['keeper', [{ says: 'area', words: AREA }]],
        ['warden', []],
        ['lamplighter', [{ says: 'area', words: SUPERVISOR_AREA }]],
        ['sweeper', []],
      ] as const) {
        await theProfileOf(page, who)
        await expect.poll(() => linesIn(page.locator('.prof-titles')), { timeout: 15_000, message: `the profile of ${who}` }).toEqual(lines)
      }
      await theProfileOf(page, 'keeper')
      // DIRECTLY UNDER THE NAME: the line is the next thing after the heading.
      expect(await page.locator('h1.prof-name + .duty-line').count()).toBe(1)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('reads the duties once for the page, however many lines it draws and however often the chat moves', async () => {
    const { context, page, asked } = await aWindow()
    try {
      await theContacts(page)
      await expect.poll(() => linesIn(theRowOf(page, 'keeper')), { timeout: 15_000 }).toEqual([{ says: 'area', words: AREA }])
      await theConversationWith(page, 'keeper')
      await theConversationWith(page, 'warden')
      await theConversationWith(page, 'sweeper')
      await theProfileOf(page, 'keeper')
      await theProfileOf(page, 'warden')
      await expect.poll(() => linesIn(page.locator('.prof-titles')), { timeout: 15_000 }).toEqual([])
      expect(asked, 'the requests to GET /api/secretaries/duties').toHaveLength(1)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('says under an agent that its line could not be read, and why, when the read fails, and nothing under Mole Office itself', async () => {
    const { context, page } = await aWindow('light', 1440, true)
    try {
      await theContacts(page)
      const unread = UNREAD.slice(0, UNREAD.indexOf('{why}'))
      expect(unread, 'the words for a line that could not be read').not.toBe('')
      for (const who of Object.keys(AGENTS) as Who[]) {
        await expect
          .poll(async () => (await linesIn(theRowOf(page, who))).map((one) => one.says), { timeout: 15_000, message: `the row of ${who}` })
          .toEqual(['unread'])
        // THE WORDS SAY IT COULD NOT BE READ, AND WHY: the failure the door answered.
        const [line] = await linesIn(theRowOf(page, who))
        expect(line?.words, `the words under ${who}`).toMatch(new RegExp(`^${unread}.*${THE_FAILURE.replace(/\./g, '\\.')}`))
      }
      // THE OFFICE IS NOT AN AGENT, so the failed read, which has settled by now, draws nothing under it.
      await theOfficesProfile(page)
      await page.locator('.prof-head').waitFor({ timeout: 30_000 })
      expect(await linesIn(page.locator('.prof-titles')), "the office's profile").toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it.runIf(SHOTS)("photographs the contact list, the conversation and the profile of the secretary and its supervisor at the four widths in both themes", async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const { context, page } = await aWindow(theme, width)
        try {
          await theContacts(page)
          // THE LABEL GOES IN THE LIST'S FOOT, above its link, and the label in the conversation goes above its message.
          // Both have room at their sides. The rows of the list reach the panel's left edge, and the heading its top
          // edge, and a label there lay over the grips that resize the panel.
          await putTheMadeUpLabelIn(page, LABEL, page.locator('.px-chat .px-chat-foot-link a'), `the contact list, ${theme} at ${width}`)
          // THEN THE KEEPER'S ROW IS SCROLLED INTO VIEW. The foot is not in what scrolls, so the label stays where it is.
          // A panel shorter than the window does not reach the agents' rows without it.
          await theRowOf(page, 'keeper').scrollIntoViewIfNeeded()
          await page.screenshot({ path: `${SHOTS}/contacts-${theme}-${width}.png` })
          await theRowOf(page, 'lamplighter').scrollIntoViewIfNeeded()
          await page.screenshot({ path: `${SHOTS}/supervisor-contacts-${theme}-${width}.png` })
          await theConversationWith(page, 'keeper')
          const message = page.locator('.px-chat li.px-chat-one').first()
          await message.waitFor({ timeout: 30_000 })
          await putTheMadeUpLabelIn(page, LABEL, message, `the conversation, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/conversation-${theme}-${width}.png` })
          await theConversationWith(page, 'lamplighter')
          // ITS OWN MESSAGE, found by its words. The heading names the supervisor before the keeper's message has left
          // the list, and a label put above that message went with it.
          const itsMessage = page.locator('.px-chat li.px-chat-one', { hasText: `${AGENTS.lamplighter.name} is on duty.` }).first()
          await itsMessage.waitFor({ timeout: 30_000 })
          await putTheMadeUpLabelIn(page, LABEL, itsMessage, `the supervisor's conversation, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/supervisor-conversation-${theme}-${width}.png` })
        } finally {
          await context.close()
        }
        // THE PROFILE IN A WINDOW OF ITS OWN, where the chat is closed and covers none of it.
        const own = await aWindow(theme, width)
        try {
          await theProfileOf(own.page, 'keeper')
          await own.page.locator('.prof-head').waitFor({ timeout: 30_000 })
          // THE HEIGHT OF THE PROFILE'S HEAD, written down so a picture before and after can be compared at each width.
          const head = await own.page.locator('.prof-head').boundingBox()
          console.log(`the profile's head, ${theme} at ${width}: ${head === null ? 'not drawn' : `${Math.round(head.height)} px high`}`)
          await putTheMadeUpLabelIn(own.page, LABEL, own.page.locator('.prof-head'), `the profile, ${theme} at ${width}`)
          await own.page.screenshot({ path: `${SHOTS}/profile-${theme}-${width}.png` })
          await theProfileOf(own.page, 'lamplighter')
          await expect.poll(() => linesIn(own.page.locator('.prof-titles')), { timeout: 15_000 }).toEqual([{ says: 'area', words: SUPERVISOR_AREA }])
          await putTheMadeUpLabelIn(own.page, LABEL, own.page.locator('.prof-head'), `the supervisor's profile, ${theme} at ${width}`)
          await own.page.screenshot({ path: `${SHOTS}/supervisor-profile-${theme}-${width}.png` })
        } finally {
          await own.context.close()
        }
      }
    }
  }, 1_200_000)
})
