// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARIAT GROUP IS PINNED IN A CATEGORY OF ITS OWN, AND A JOIN IS A SHORT SYSTEM LINE.
 *
 * THE DEFECT (report IrcquT_njrPE), raised twice:
 *
 *   the secretaries' group has no category of its own and is not pinned, and the owner has to
 *   search a while to find it.
 *
 * Criteria SC1 to SC5 of design/messages/SECRETARIAT-CHAT-ACCEPTANCE.md, and two
 * decisions.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server.
 *
 *   1. SC1 and SC2: the groups list draws the pinned category first, holding the Secretariat group,
 *      with every other group below under the default heading. The pinned heading carries no fold,
 *      so the standing group cannot be put away.
 *   2. SC3 and SC4: the five joins in the Secretariat group are drawn as the same short system
 *      block every office line uses — a few words, the time above them, the reason behind them —
 *      and the membership records still hold their own long reasons, so nothing was rewritten.
 *
 * THE FIVE NOTICES ARE MEMBERSHIP ROWS, NOT MESSAGES. That was measured before this was built:
 * `GET /api/messages` for projects default and panelx holds no message whose body matches the old
 * sentence, and the members panel draws the join from `group_members.joined_at` and `joined_because`
 * (src/web/components/Chat.tsx). The acceptance file describes them as messages; the code draws
 * them as membership rows. This file proves the drawing, and the report says which it found.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH THE CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Each change was put back and the control run again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CONTACT_GROUP_WORDS } from '../src/shared/contacts.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The four secretaries whose joins make the Secretariat group carry the five rows the owner pasted. */
const THE_SECRETARIES = ['sec-one', 'sec-two', 'sec-three', 'sec-four'] as const

beforeAll(async () => {
  app = await liveApp({ name: 'secretariat-pinned', viewport: { width: 1440, height: 1000 } })
  // EVERY SECRETARY IS PUT IN THE STANDING GROUP AUTOMATICALLY, which is what makes four
  // registrations four more rows. The owner is already in it from the server's own start.
  for (const handle of THE_SECRETARIES) {
    const made = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ handle, name: handle, role: 'secretary' }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }
  // AND ONE ORDINARY GROUP, so the default category has a row to draw under it.
  const ordinary = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'An ordinary group',
      because: 'Two people had something to settle and neither would go first.',
      members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' }],
    }),
  })
  expect(ordinary.status, await ordinary.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the panel and leave it on the groups list. */
async function openTheGroups(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChatBeside(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  await app.page.waitForSelector('.px-chat-top-group[data-category="pinned"]', { timeout: 20_000 })
}

describe('SC1 and SC2: the pinned category is first, and it never folds', () => {
  it('draws the Secretariat under its own heading above the default category', async () => {
    await openTheGroups()
    const shape = await app.page.evaluate(() => {
      const pinned = document.querySelector('.px-chat-top-group[data-category="pinned"]')
      const deflt = document.querySelector('.px-chat-top-group[data-category="default"]')
      const wordOf = (one: Element | null): string =>
        one?.querySelector('.px-chat-top-name')?.textContent?.trim() ?? ''
      const firstGroup =
        document.querySelector('.px-chat-under-tabs[data-showing="groups"] .px-chat-contact .px-chat-name')
          ?.textContent?.trim() ?? ''
      return {
        hasPinned: pinned !== null,
        hasDefault: deflt !== null,
        pinnedHeading: wordOf(pinned),
        defaultHeading: wordOf(deflt),
        firstGroup,
        pinnedBeforeDefault:
          pinned !== null &&
          deflt !== null &&
          (pinned.compareDocumentPosition(deflt) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        pinnedHasAFold: pinned?.querySelector('.px-chat-fold') !== null,
      }
    })
    // THE CONTROL: both categories are drawn. An empty list would pass every word check below.
    expect(shape.hasPinned, 'the pinned category is not drawn').toBe(true)
    expect(shape.hasDefault, 'the default category is not drawn').toBe(true)
    expect(shape.pinnedHeading, 'the pinned category does not name the secretaries').toBe(
      CONTACT_GROUP_WORDS.secretaryGroup,
    )
    expect(shape.defaultHeading, 'the category below is not the default one').toBe(
      CONTACT_GROUP_WORDS.defaultGroup,
    )
    expect(shape.pinnedBeforeDefault, 'the pinned category is not drawn first').toBe(true)
    expect(shape.firstGroup, 'the first group row is not the Secretariat').toBe('Secretariat')
    // AND IT NEVER HIDES. No fold press means it cannot be put away by accident.
    expect(shape.pinnedHasAFold, 'the pinned category can be folded, so the standing group can hide').toBe(false)
  }, 120_000)
})

describe('SC3 and SC4: the five joins draw as short system lines and no record is rewritten', () => {
  it('draws five short timed join lines, with the reasons behind them', async () => {
    await openTheGroups()
    await app.page.click('.px-chat-contact:has-text("Secretariat")')
    await app.page.waitForSelector('.px-chat-said .px-chat-system[data-joined="yes"]', { timeout: 20_000 })
    const joins = await app.page.$$eval('.px-chat-said .px-chat-system[data-joined="yes"]', (all) =>
      all.map((one) => {
        const block = one.querySelector('.px-chat-system-block')
        return {
          words: block?.textContent ?? '',
          reason: block?.getAttribute('title') ?? '',
          when: one.querySelector('.px-chat-system-when')?.textContent ?? '',
        }
      }),
    )
    // THE CONTROL: the five rows are drawn at all.
    expect(joins.length, 'the Secretariat group does not draw its five joins').toBe(5)
    for (const one of joins) {
      expect(one.words, `the join row is not the short few words: ${one.words}`).toMatch(/ joined$/)
      expect(one.words, 'the join row still carries a time inside its words').not.toContain(' at ')
      expect(one.when, `the join row draws no time above it: ${one.words}`).toMatch(
        /^--\s*\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}\s*--$/,
      )
      expect(one.reason.length, `the join row draws no reason behind it: ${one.words}`).toBeGreaterThan(0)
    }
    // THE OWNER'S OWN REASON IS ON THE OWNER'S LINE, so the panel still says why the owner is in the
    // group. The sentence is read from the owner's membership row, which the server writes from
    // THE_OWNER_IS_IN_BECAUSE in src/server/lib/secretariat.ts, and not typed again here: a copy here
    // went stale when that sentence changed (merge entry bDUMKh4N4Sxw).
    const groupsReply = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
    expect(groupsReply.status, await groupsReply.clone().text()).toBe(200)
    const theGroups = ((await groupsReply.json()) as {
      groups: { name: string; members: { who: { kind: string; id: string }; joinedBecause: string }[] }[]
    }).groups
    const ownersRow = theGroups
      .find((one) => one.name === 'Secretariat')
      ?.members.find((member) => member.who.kind === 'person' && member.who.id === THE_PERSON)
    expect(ownersRow?.joinedBecause ?? '', 'the owner has no membership row in the Secretariat group').not.toBe('')
    expect(joins.map((one) => one.reason), 'no join line draws the owner\'s own reason').toContain(ownersRow?.joinedBecause)
  }, 120_000)

  it('leaves the membership rows and their long reasons exactly as they were', async () => {
    await openTheGroups()
    const reply = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
    expect(reply.status, await reply.clone().text()).toBe(200)
    const groups = ((await reply.json()) as {
      groups: { id: string; name: string; members: { joinedBecause: string }[] }[]
    }).groups
    const secretariat = groups.find((one) => one.name === 'Secretariat')
    expect(secretariat, 'the Secretariat group is not in the list').toBeDefined()
    expect(secretariat?.members.length, 'the Secretariat group does not hold the five members').toBe(5)
    for (const member of secretariat?.members ?? []) {
      // THE RECORD'S OWN WORDS STAY WHAT THEY ARE. Every membership row still carries its whole
      // sentence; the screen shortened the drawing, not the record.
      expect(member.joinedBecause.length, 'a membership reason was rewritten short').toBeGreaterThan(30)
    }
    // AND NO JOIN MESSAGE WAS WRITTEN, which is the decision of 14 September 2026.
    const one = await fetch(`${app.api}/api/groups/${secretariat?.id}`, { headers: AS_THE_OWNER })
    const said = (await one.json()) as { messages: { body?: string }[] }
    expect(
      said.messages.every((message) => (message.body ?? '').includes(' joined at ') === false),
      'a join notice was written as a message',
    ).toBe(true)
  }, 120_000)
})

/**
 * THE PICTURES. Chapter 6 rule 1: the group list with the pinned category, and the open Secretariat
 * group with its short join lines, at 1440, 990, 660 and 390 in light and dark.
 *
 * IT IS GATED, like every other photographing case here, because taking pictures is not a check and
 * a suite should not do it: run it with SF_SECRETARIAT_SHOTS set to the directory the pictures go
 * in. The panel is proved to carry the five joins before the shutter opens, so a picture of an empty
 * header cannot pass for a look at it.
 */
describe('the pinned list and the short joins are looked at', () => {
  it.skipIf(!process.env['SF_SECRETARIAT_SHOTS'])(
    'photographs the list and the open group at four widths in both themes',
    async () => {
      const shots = process.env['SF_SECRETARIAT_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      const widths = [1440, 990, 660, 390]
      const themes = ['light', 'dark'] as const
      // THE LIST: the pinned category drawn first, with the Secretariat row inside it.
      await openTheGroups()
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/group-list-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }
      // THE OPEN GROUP: the join lines drawn short and timed.
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.click('.px-chat-contact:has-text("Secretariat")')
      await app.page.waitForSelector('.px-chat-said .px-chat-system[data-joined="yes"]', { timeout: 20_000 })
      expect(
        await app.page.$$eval('.px-chat-said .px-chat-system[data-joined="yes"]', (all) => all.length),
        'the picture would show no join line',
      ).toBe(5)
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/secretariat-joins-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
