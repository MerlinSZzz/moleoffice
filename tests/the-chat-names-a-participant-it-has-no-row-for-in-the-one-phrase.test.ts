// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT NAMES A PARTICIPANT IT HAS NO ROW FOR IN THE ONE PHRASE EVERY PAGE USES (wave 13y round 91, the one phrase
 * of item 15e).
 *
 * Every page names a writer it has no name for by `unregisteredName` in src/shared/messages.ts: "An agent this page has
 * no name for" or "A person this page has no name for" (round 88). The chat said "Name unavailable" instead in nine
 * places where it names a participant its list of participants holds no row for. Now those nine ask
 * `unregisteredName` as well. "Name unavailable" stays only while the participants have not been read, the chat's
 * wait before its heading can name anybody, and in the circle picture's word, which names no participant.
 *
 * INSIDE A SENTENCE THE PHRASE STARTS LOWER CASE (wave 13y round 93, item 15g). The phrase stands where a name stands,
 * and it is stored starting upper case, which is right where it stands alone, as in a heading or a row. After a
 * sentence's first word it read "As An agent this page has no name for". Now `unregisteredName` and `theWritersName`
 * take where the phrase goes, and the chat asks for it inside a sentence in each sentence that names somebody after
 * its first word: "As …", "set by …", "What … is doing" for a screen reader, "Cannot reach …" in the conversation and
 * in the dialogue of the press that starts a new agent, "Mole Office could not tell whether … is answering", and
 * "You read this from …'s side". A name and a line the writer typed are never changed.
 *
 * THE CASES. Cases 1 to 6 and 8 to 11 are read by the person in a browser window of their own.
 *   1. THE CONTROL: the Between agents list's row of the two agents names both.
 *   2. The row of the first agent and an agent nobody registered names the first agent, and says the page has no name
 *      for the other, and nowhere says "Name unavailable".
 *   3. That row opened draws a side button for each agent: "As" the first agent's name, and "As" the phrase, inside the
 *      sentence. The buttons are read while the pair's read is out, held by `context.route`: the door refuses this pair
 *      (round 94), and the panel then draws the reason and the press back in place of the buttons (round 95).
 *   4. THE CONTROL: the person's conversation with the second agent draws its line as set by the first agent, by name.
 *   5. The person's conversation with the first agent draws its line as set by the phrase, inside the sentence, the
 *      setter being an agent nobody registered.
 *   6. In the group, the first agent's join line names it, and the join line of a member nobody registered says the
 *      phrase.
 *   7. The contact list's name for a contact whose kind and id the page's participants hold no row for is the phrase,
 *      for an agent and for a person, read through `theNameOfAContact` in src/web/components/ContactChooser.tsx.
 *   8. THE CONTROL: the person's conversation with the first agent, on a page that holds its row, names it by name in
 *      the line's words for a screen reader, in "Cannot reach …", and in the dialogue of the press that starts a new
 *      agent.
 *   9. The same conversation on a page that holds no row for the first agent: the heading says the phrase alone, and
 *      the line's words for a screen reader, "Cannot reach …" and the dialogue say it inside the sentence.
 *  10. The same, with the conversation's reply saying the office could not tell: "Mole Office could not tell whether
 *      …" says the phrase inside the sentence.
 *  11. The row of the two agents, on a page that holds no row for the second agent, read as the second agent's side
 *      and then as the first agent's: "You read this from …'s side" says the phrase inside the sentence.
 *
 * A PAGE THAT HOLDS NO ROW FOR AN AGENT THE OFFICE HOLDS, in cases 9 to 11. The office reads a conversation only with
 * somebody a registry holds, and refuses one with an id nobody answers to (the press test's door case). So each of
 * these sentences names an agent the office holds and the page does not: the window is given the participants without
 * that agent by `context.route`, the shape of a page whose list of participants lacks an agent the office has. Case
 * 10's conversation reply is also given `couldNotTell: true` by `context.route`. The office says so of an agent whose
 * handle a live process holds with no transcript (tests/the-top-bar-the-chat-notice-and-decisions-say-what-is-so.test.ts),
 * which this test does not set up, because the case is about the name and not about that reading.
 *
 * NOT REACHED BY ANY CASE, and why:
 *   - The folded rows under a contact nobody registered, the contact row's name in the list, and the contact a talk box
 *     on an agent's page has chosen: each is drawn from the same registries the participants list is read from, so
 *     none of them can lack a row while the page holds its participants.
 *
 * MADE-UP RECORDS, filed by the test office's person: two agents, each with a name, a handle and a record of its own,
 * a group of the person and the two agents, a message from the first agent to the second, a message from the second
 * agent to the first, and a line on each agent. What no door will write now is then given its shape in the database,
 * as in tests/the-chat-never-draws-a-claimed-id-as-a-name.test.ts: the door stores the registry id of a sender, a
 * setter and a group member, and refuses one nobody registered. Each is first checked to hold what the door stored:
 *   - the second message's stored sender becomes an agent id nobody registered, so the Between agents list pairs the
 *     first agent with an agent the page has no name for;
 *   - the first agent's line becomes set by that agent, and the second agent's line set by the first agent;
 *   - the second agent's membership row in the group becomes that agent's.
 *
 * MUTATIONS, after a control run; the round's report says which case each turned red. Round 95's: the side button of
 * an agent nobody registered says its id, and case 3 fails.
 *
 * With W13Y_PHRASE_SHOTS set to a folder, the last case photographs what cases 2, 3, 5, 6 and 9 to 11 read, at 1440,
 * 990, 660 and 390 in both themes, under the made-up label, on the code it runs on.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { CANNOT_REACH_WORDS, CHAT_WORDS, participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT, groupOpenKey } from '../src/web/lib/open-chat.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

/** The two agents, each a name, a handle and a record, every one a different string. */
const AGENTS = {
  lamp: { name: 'Lamp Lighter', handle: 'lamp-lighter' },
  bell: { name: 'Bell Ringer', handle: 'bell-ringer' },
} as const
type Who = keyof typeof AGENTS
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
/** What every page says for an agent, and for a person, it has no name for. */
const NO_NAME_FOR_AN_AGENT = enWave13y['chat.anAgentThisPageHasNoNameFor']
const NO_NAME_FOR_A_PERSON = enWave13y['chat.aPersonThisPageHasNoNameFor']
/** The phrase for an agent as it goes inside a sentence, after the sentence's first word (round 93). */
const NO_NAME_INSIDE_A_SENTENCE = `${NO_NAME_FOR_AN_AGENT.charAt(0).toLowerCase()}${NO_NAME_FOR_AN_AGENT.slice(1)}`
/** What the chat said in the nine places before this round, and still says while the participants are being read. */
const NAME_UNAVAILABLE = en['chat.unknownName']
const SHOTS = process.env.W13Y_PHRASE_SHOTS
const LABEL = 'Made-up data — a test office with two agents and an id nobody registered, not real office data'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The two messages: who writes each, to whom, and what it says. */
const SAID = {
  known: { by: 'lamp', to: 'bell', body: 'The tower lamp is lit for you.' },
  nobodys: { by: 'bell', to: 'lamp', body: 'The bell rang at noon for you.' },
} as const
/** The line on each agent. */
const LINES: Record<Who, string> = { lamp: 'Lighting the north stair', bell: 'Ringing the noon bell' }

describe('the chat names a participant it has no row for in the one phrase', () => {
  let app: LiveApp
  /** Each agent's registry id and its own record's id, as the office gave them. */
  const ids: Record<Who, { registry: string; record: string }> = { lamp: { registry: '', record: '' }, bell: { registry: '', record: '' } }
  let groupId = ''

  beforeAll(async () => {
    app = await liveApp({ name: 'chat-no-name-phrase', viewport: { width: 1440, height: 1000 } })
    for (const who of Object.keys(AGENTS) as Who[]) {
      const { name, handle } = AGENTS[who]
      ids[who].record = (await filed('/api/records', AS_THE_PERSON, { kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } }))['record']!.id
    }
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
      agents: { id: string; handle: string; name: string }[]
    }
    for (const who of Object.keys(AGENTS) as Who[]) {
      const row = listed.agents.find((one) => one.handle === AGENTS[who].handle)
      ids[who].registry = row?.id ?? ''
      expect(row?.name, JSON.stringify(row)).toBe(AGENTS[who].name)
      // NOBODY ANSWERS TO THE MADE-UP ID, or the cases below would prove nothing.
      expect(listed.agents.some((one) => one.id === NOBODYS || one.handle === NOBODYS)).toBe(false)
    }
    groupId = (
      await filed('/api/groups', AS_THE_PERSON, {
        name: 'The bell tower',
        because: 'The two agents report on the tower to the person here.',
        members: [
          { who: { kind: 'person', id: THE_PERSON }, because: 'the person reads the reports' },
          { who: { kind: 'agent', id: ids.lamp.registry }, because: 'it lights the lamps' },
          { who: { kind: 'agent', id: ids.bell.registry }, because: 'it rings the bell' },
        ],
      })
    )['group']!.id
    const messageIds = {} as Record<keyof typeof SAID, string>
    // NOTHING HOLDS EITHER AGENT IN THE TEST OFFICE, so the office stores each message, routes it and answers 409. The
    // message is stored all the same.
    for (const one of Object.keys(SAID) as (keyof typeof SAID)[]) {
      const { by, to, body } = SAID[one]
      messageIds[one] = (
        await filed(
          '/api/records',
          { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[by].handle },
          { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: ids[to].registry }] } },
          409,
        )
      )['record']!.id
    }
    for (const who of Object.keys(AGENTS) as Who[]) {
      const reply = await fetch(`${app.api}/api/participants/agent/${AGENTS[who].handle}`, {
        method: 'PATCH',
        headers: AS_THE_PERSON,
        body: JSON.stringify({ state: LINES[who] }),
      })
      expect(reply.status, await reply.clone().text()).toBe(200)
    }
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      // THE CONTROLS: the door stored the registry id of the sender, the person as each line's setter, and the second
      // agent's registry id in its membership row, so each shape below is made here and not found.
      const sentBy = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(messageIds.nobodys) as { sentBy: string }
      expect(JSON.parse(sentBy.sentBy)).toEqual({ kind: 'agent', id: ids.bell.registry })
      const setters = db.prepare('SELECT id, state_by_kind AS kind, state_by_id AS who FROM agents WHERE id IN (?, ?) ORDER BY id').all(ids.lamp.registry, ids.bell.registry)
      expect(setters).toHaveLength(2)
      for (const one of setters as { kind: string; who: string }[]) expect([one.kind, one.who]).toEqual(['person', THE_PERSON])
      db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(NOBODYS, messageIds.nobodys)
      const setBy = db.prepare("UPDATE agents SET state_by_kind = 'agent', state_by_id = ? WHERE id = ?")
      expect(setBy.run(NOBODYS, ids.lamp.registry).changes).toBe(1)
      expect(setBy.run(ids.lamp.registry, ids.bell.registry).changes).toBe(1)
      const member = db.prepare("UPDATE group_members SET member_id = ? WHERE group_id = ? AND member_kind = 'agent' AND member_id = ?")
      expect(member.run(NOBODYS, groupId, ids.bell.registry).changes).toBe(1)
    } finally {
      db.close()
    }
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** Files one thing through a door and answers the record or group it made. */
  async function filed(path: string, headers: Record<string, string>, body: unknown, expected = 201): Promise<Record<string, { id: string }>> {
    const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await reply.text()
    expect(reply.status, text).toBe(expected)
    return JSON.parse(text) as Record<string, { id: string }>
  }

  /**
   * A window of its own on Home, with the page drawn; in one theme and at one width when a picture asks for them. Cases
   * 9 to 11 give it the participants `without` one agent, and case 10 a conversation reply that says the office could
   * not tell, each as the header says.
   */
  async function aWindow(look?: { theme: 'light' | 'dark'; width: number }, given: { without?: Who; couldNotTell?: true } = {}) {
    const width = look?.width ?? 1440
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, ...(look ? { colorScheme: look.theme } : {}) })
    if (look) await context.addInitScript((theme) => window.localStorage.setItem('mole-office.preset.theme', theme), look.theme)
    const { without, couldNotTell } = given
    if (without !== undefined) {
      await context.route(
        (url) => url.pathname === '/api/participants',
        async (route) => {
          const reply = await route.fetch()
          const read = (await reply.json()) as { agents: { id: string }[] }
          await route.fulfill({ response: reply, json: { ...read, agents: read.agents.filter((one) => one.id !== ids[without].registry) } })
        },
      )
    }
    if (couldNotTell) {
      await context.route(
        (url) => url.pathname === '/api/messages/conversation',
        async (route) => {
          const reply = await route.fetch()
          await route.fulfill({ response: reply, json: { ...((await reply.json()) as object), couldNotTell: true } })
        },
      )
    }
    const page = await context.newPage()
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    return { context, page }
  }

  /**
   * CLOSES A WINDOW, once every route it was given has finished. A route still reading when its window closed failed
   * against the closed window, and that ended a run whose every case had passed (round 93's first green run).
   */
  async function closeTheWindow(context: BrowserContext): Promise<void> {
    await context.unrouteAll({ behavior: 'wait' })
    await context.close()
  }

  /**
   * HOLDS EVERY ANSWER OF THE BETWEEN DOOR TO A PAIR until the function this returns is called, so a case reads what
   * the panel draws while a pair's read is out. The door refuses a pair with a side nobody answers to (round 94), and
   * the panel then draws the reason and the press back in place of the side buttons (round 95). Call the function
   * before the window closes, since closing waits for every route.
   */
  async function holdTheBetweenRead(context: BrowserContext): Promise<() => void> {
    let letGo = (): void => undefined
    const released = new Promise<void>((done) => {
      letGo = done
    })
    await context.route(
      (url) => url.pathname.startsWith('/api/messages/between/'),
      async (route) => {
        await released
        await route.continue()
      },
    )
    return letGo
  }

  /** Opens the panel at a contact or a group, the way another page asks it to. */
  async function openThePanelAt(page: Page, key: string): Promise<void> {
    await page.evaluate(([name, detail]) => window.dispatchEvent(new CustomEvent(name, { detail })), [OPEN_AT, key] as const)
  }

  /** The words drawn on one element, trimmed. */
  const wordsOf = async (where: ReturnType<Page['locator']>): Promise<string> => ((await where.first().textContent()) ?? '').trim()

  /** Opens the panel's Between agents list, as the person does with the tab, once the row of the two agents is drawn. */
  async function theBetweenList(page: Page) {
    await page.locator('.px-chat-circle').click()
    await page.locator('.px-chat').waitFor({ timeout: 30_000 })
    if ((await page.locator('.px-chat-back').count()) > 0) await page.locator('.px-chat-back').first().click()
    await page.locator('.px-chat-tab[data-tab="between"]').click()
    await page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-list').waitFor({ timeout: 30_000 })
    const rows = page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')
    await rows.filter({ hasText: AGENTS.lamp.name }).filter({ hasText: AGENTS.bell.name }).first().waitFor({ timeout: 30_000 })
    return rows
  }

  /** The Between agents list's rows that name the first agent and not the second. */
  async function theRowsWithNobody(page: Page): Promise<string[]> {
    const drawn = (await (await theBetweenList(page)).allTextContents()).map((one) => one.trim())
    return drawn.filter((one) => one.includes(AGENTS.lamp.name) && !one.includes(AGENTS.bell.name))
  }

  describe('the Between agents list and view', () => {
    it('1. the control: the row of the two agents names both', async () => {
      const { context, page } = await aWindow()
      try {
        const rows = await theBetweenList(page)
        expect(await rows.filter({ hasText: AGENTS.lamp.name }).filter({ hasText: AGENTS.bell.name }).count()).toBe(1)
      } finally {
        await context.close()
      }
    }, 120_000)

    it('2. the row with an agent nobody registered names the first agent and says the phrase for the other', async () => {
      const { context, page } = await aWindow()
      try {
        const rows = await theRowsWithNobody(page)
        expect(rows, JSON.stringify(rows)).toHaveLength(1)
        expect(rows[0]).toContain(SAID.nobodys.body)
        expect(rows[0]).toContain(NO_NAME_FOR_AN_AGENT)
        expect(rows[0]).not.toContain(NAME_UNAVAILABLE)
        expect(rows[0]).not.toContain(NOBODYS)
      } finally {
        await context.close()
      }
    }, 120_000)

    it('3. that row opened draws a side button for each agent, the one nobody registered in the phrase inside the sentence', async () => {
      const { context, page } = await aWindow()
      // THE BUTTONS ARE READ WHILE THE PAIR'S READ IS OUT, since the refusal that answers it takes them away (round 95).
      const letGo = await holdTheBetweenRead(context)
      try {
        await theBetweenList(page)
        const row = page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact', { hasText: SAID.nobodys.body })
        await row.first().click()
        const sides = page.locator('.px-chat-sides .px-chat-side')
        await sides.nth(2).waitFor({ timeout: 30_000 })
        const drawn = (await sides.allTextContents()).map((one) => one.trim())
        expect([...drawn].sort(), JSON.stringify(drawn)).toEqual(
          [CHAT_WORDS.bothSides, CHAT_WORDS.asSide(AGENTS.lamp.name), CHAT_WORDS.asSide(NO_NAME_INSIDE_A_SENTENCE)].sort(),
        )
      } finally {
        letGo()
        await closeTheWindow(context)
      }
    }, 120_000)
  })

  describe("an agent's line, as set by somebody", () => {
    for (const [who, setter, title] of [
      ['bell', AGENTS.lamp.name, "4. the control: the second agent's line is set by the first agent, by name"],
      ['lamp', NO_NAME_INSIDE_A_SENTENCE, "5. the first agent's line, set by an agent nobody registered, is set by the phrase inside the sentence"],
    ] as const) {
      it(title, async () => {
        const { context, page } = await aWindow()
        try {
          await openThePanelAt(page, participantKey({ kind: 'agent', id: ids[who].registry }))
          const by = page.locator('.px-chat .px-chat-state-by')
          await by.first().waitFor({ timeout: 30_000 })
          expect(await wordsOf(by)).toBe(CHAT_WORDS.lineSetBy(setter))
        } finally {
          await context.close()
        }
      }, 120_000)
    }
  })

  it('6. in the group, the join line of a member nobody registered says the phrase, beside the named one', async () => {
    const { context, page } = await aWindow()
    try {
      await openThePanelAt(page, groupOpenKey(groupId))
      const joins = page.locator('.px-chat li.px-chat-system[data-joined="yes"]')
      await joins.filter({ hasText: AGENTS.lamp.name }).first().waitFor({ timeout: 30_000 })
      const drawn = (await joins.allTextContents()).map((one) => one.trim())
      expect(drawn.filter((one) => one.includes(AGENTS.lamp.name)), JSON.stringify(drawn)).toHaveLength(1)
      expect(drawn.filter((one) => one.includes(NO_NAME_FOR_AN_AGENT)), JSON.stringify(drawn)).toHaveLength(1)
      expect(drawn.filter((one) => one.includes(NAME_UNAVAILABLE) || one.includes(NOBODYS)), JSON.stringify(drawn)).toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it("7. the contact list's name for a contact the page holds no row for is the phrase", async () => {
    // THE COMPONENT REACHES api.ts AND router.tsx, which touch window while they are evaluated, as in
    // tests/a-retired-and-a-live-agent-of-one-name-are-told-apart.test.ts. The stand-in is taken away again at the end,
    // so the browser cases above and the office's stop below never see it.
    const store = new Map<string, string>()
    const global = globalThis as unknown as { window?: unknown }
    global.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      location: { hash: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    try {
      const { theNameOfAContact } = await import('../src/web/components/ContactChooser.tsx')
      const nobody = new Map<string, { name: string }>()
      expect(theNameOfAContact({ who: { kind: 'agent', id: NOBODYS }, unregistered: null }, nobody)).toBe(NO_NAME_FOR_AN_AGENT)
      expect(theNameOfAContact({ who: { kind: 'person', id: NOBODYS }, unregistered: null }, nobody)).toBe(NO_NAME_FOR_A_PERSON)
      // THE CONTROL: a contact the page holds a row for is named by it.
      const lamp = new Map([[participantKey({ kind: 'agent', id: NOBODYS }), { name: AGENTS.lamp.name }]])
      expect(theNameOfAContact({ who: { kind: 'agent', id: NOBODYS }, unregistered: null }, lamp)).toBe(AGENTS.lamp.name)
    } finally {
      delete global.window
    }
  })

  /** The person's conversation with the first agent, opened, once its cannot-reach line is drawn; answers that line. */
  async function theFirstAgentsConversation(page: Page) {
    await openThePanelAt(page, participantKey({ kind: 'agent', id: ids.lamp.registry }))
    const words = page.locator('.px-chat .px-chat-cannot-reach-words')
    await words.first().waitFor({ timeout: 30_000 })
    return words
  }

  /** Presses the press beside the cannot-reach line, and answers the first line of the dialogue it opens. */
  async function theDialogue(page: Page) {
    await page.locator('.px-chat .px-chat-cannot-reach .px-start-agent').first().click()
    const who = page.locator('.px-start-agent-ask .px-start-agent-who')
    await who.first().waitFor({ timeout: 30_000 })
    return who
  }

  /**
   * Opens the row of the two agents, reads it as the second agent's side and then as the first agent's, each read
   * waited for, so the last read before the one on screen is the second agent's; answers the line that says so.
   */
  async function readAsTheSecondAgentThenTheFirst(page: Page) {
    await page.locator('.px-chat-circle').click()
    await page.locator('.px-chat').waitFor({ timeout: 30_000 })
    if ((await page.locator('.px-chat-back').count()) > 0) await page.locator('.px-chat-back').first().click()
    await page.locator('.px-chat-tab[data-tab="between"]').click()
    await page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact', { hasText: SAID.known.body }).first().click()
    const sides = page.locator('.px-chat-sides .px-chat-side')
    await sides.nth(2).waitFor({ timeout: 30_000 })
    const asTheSecond = sides.filter({ hasNotText: AGENTS.lamp.name }).filter({ hasNotText: CHAT_WORDS.bothSides })
    expect(await asTheSecond.count(), JSON.stringify(await sides.allTextContents())).toBe(1)
    for (const side of [asTheSecond, sides.filter({ hasText: AGENTS.lamp.name })]) {
      const read = page.waitForResponse((reply) => reply.url().includes('/api/messages/between/') && reply.url().includes('as='))
      await side.click()
      expect((await read).status()).toBe(200)
    }
    return page.locator('.px-chat .px-chat-read-before')
  }

  describe('the sentences that name the agent a conversation is with', () => {
    it('8. the control: on a page that holds the first agent, each sentence names it by name', async () => {
      const { context, page } = await aWindow()
      try {
        const words = await theFirstAgentsConversation(page)
        expect(await wordsOf(words), 'the cannot-reach line').toBe(CANNOT_REACH_WORDS.cannotReach(AGENTS.lamp.name))
        expect(await page.locator('.px-chat .px-chat-them-state').first().getAttribute('aria-label'), "the agent's line, for a screen reader").toBe(
          CHAT_WORDS.theirLine(AGENTS.lamp.name),
        )
        expect(await wordsOf(await theDialogue(page)), 'the dialogue').toBe(CANNOT_REACH_WORDS.cannotReach(AGENTS.lamp.name))
      } finally {
        await closeTheWindow(context)
      }
    }, 120_000)

    it('9. on a page that holds no row for the first agent, the heading says the phrase alone and each sentence says it inside the sentence', async () => {
      const { context, page } = await aWindow(undefined, { without: 'lamp' })
      try {
        const words = await theFirstAgentsConversation(page)
        await expect.poll(() => wordsOf(page.locator('.px-chat .px-chat-them .px-chat-name')), { message: "the panel's heading", timeout: 10_000 }).toBe(
          NO_NAME_FOR_AN_AGENT,
        )
        expect(await wordsOf(words), 'the cannot-reach line').toBe(CANNOT_REACH_WORDS.cannotReach(NO_NAME_INSIDE_A_SENTENCE))
        expect(await page.locator('.px-chat .px-chat-them-state').first().getAttribute('aria-label'), "the agent's line, for a screen reader").toBe(
          CHAT_WORDS.theirLine(NO_NAME_INSIDE_A_SENTENCE),
        )
        expect(await wordsOf(await theDialogue(page)), 'the dialogue').toBe(CANNOT_REACH_WORDS.cannotReach(NO_NAME_INSIDE_A_SENTENCE))
      } finally {
        await closeTheWindow(context)
      }
    }, 120_000)

    it('10. the same, when the conversation says the office could not tell, says the phrase inside the sentence', async () => {
      const { context, page } = await aWindow(undefined, { without: 'lamp', couldNotTell: true })
      try {
        const words = await theFirstAgentsConversation(page)
        // THE CONTROL: the line drawn is the could-not-tell line, so the reply the window was given is the one read.
        await expect.poll(() => words.first().getAttribute('data-could-not-tell'), { timeout: 10_000 }).toBe('yes')
        expect(await wordsOf(words)).toBe(en['notesFixes.chat.couldNotTell'].replace('{who}', NO_NAME_INSIDE_A_SENTENCE))
      } finally {
        await closeTheWindow(context)
      }
    }, 120_000)

    it("11. read as each side in turn, on a page that holds no row for the second agent, the line says the second agent's side in the phrase inside the sentence", async () => {
      const { context, page } = await aWindow(undefined, { without: 'bell' })
      try {
        const line = await readAsTheSecondAgentThenTheFirst(page)
        const [before, after] = CHAT_WORDS.youReadThisBefore(NO_NAME_INSIDE_A_SENTENCE, '\u0000').split('\u0000')
        const literally = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        await expect.poll(() => wordsOf(line), { timeout: 30_000 }).toMatch(new RegExp(`^${literally(before ?? '')}\\S.*${literally(after ?? '')}$`))
      } finally {
        await closeTheWindow(context)
      }
    }, 120_000)
  })

  it.runIf(SHOTS)('photographs what cases 2, 3, 5, 6 and 9 to 11 read, at four widths in both themes', async () => {
    mkdirSync(SHOTS!, { recursive: true })
    // EACH VIEW IS OPENED AS ITS CASE OPENS IT, and answers where its label goes: in the project filter's row for the list,
    // which has no name filter on the Between agents tab, and in the heading above the name for a conversation. Each is
    // inside a padded row, clear of the panel's grip at its edge.
    // THE SIDES ARE PHOTOGRAPHED WHILE THE PAIR'S READ IS OUT, as case 3 reads them, and the read is let go before the
    // window closes.
    const held: { letGo: (() => void) | null } = { letGo: null }
    const views: [string, (page: Page) => Promise<string>, { without?: Who; couldNotTell?: true }?][] = [
      ['between', async (page) => {
        await theBetweenList(page)
        return '.px-chat .px-chat-project-filter'
      }],
      ['sides', async (page) => {
        held.letGo = await holdTheBetweenRead(page.context())
        await theBetweenList(page)
        await page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact', { hasText: SAID.nobodys.body }).first().click()
        await page.locator('.px-chat-sides .px-chat-side').nth(2).waitFor({ timeout: 30_000 })
        return '.px-chat .px-chat-them-top'
      }],
      ['line', async (page) => {
        await openThePanelAt(page, participantKey({ kind: 'agent', id: ids.lamp.registry }))
        await page.locator('.px-chat .px-chat-state-by').first().waitFor({ timeout: 30_000 })
        return '.px-chat .px-chat-them-top'
      }],
      ['group', async (page) => {
        await openThePanelAt(page, groupOpenKey(groupId))
        await page.locator('.px-chat li.px-chat-system[data-joined="yes"]').filter({ hasText: AGENTS.lamp.name }).first().waitFor({ timeout: 30_000 })
        return '.px-chat .px-chat-them-top'
      }],
      ['cannot-reach', async (page) => {
        await theFirstAgentsConversation(page)
        return '.px-chat .px-chat-them-top'
      }, { without: 'lamp' }],
      ['dialogue', async (page) => {
        await theFirstAgentsConversation(page)
        await theDialogue(page)
        return '.px-start-agent-ask .px-start-agent-who'
      }, { without: 'lamp' }],
      ['could-not-tell', async (page) => {
        await theFirstAgentsConversation(page)
        await page.locator('.px-chat .px-chat-cannot-reach-words[data-could-not-tell="yes"]').waitFor({ timeout: 30_000 })
        return '.px-chat .px-chat-them-top'
      }, { without: 'lamp', couldNotTell: true }],
      ['read-before', async (page) => {
        await (await readAsTheSecondAgentThenTheFirst(page)).waitFor({ timeout: 30_000 })
        return '.px-chat .px-chat-them-top'
      }, { without: 'bell' }],
    ]
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const [view, open, given] of views) {
          const { context, page } = await aWindow({ theme, width }, given)
          try {
            const above = await open(page)
            await page.evaluate(() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))))
            await putTheMadeUpLabelIn(page, LABEL, page.locator(above), `${view}, ${theme} at ${width}`)
            await page.screenshot({ path: `${SHOTS!}/${view}-${theme}-${width}.png` })
          } finally {
            held.letGo?.()
            held.letGo = null
            await closeTheWindow(context)
          }
        }
      }
    }
  }, 1_200_000)
})
