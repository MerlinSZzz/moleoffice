// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARIAT ROW KEEPS ITS FULL HEIGHT, AND A JOIN IS ONE LINE IN THE CONVERSATION.
 *
 * Problem 3cILHSvcyCeT, and the amendment of 23 September 2026, 23:00 (wave 7) to
 * design/messages/SECRETARIAT-CHAT-ACCEPTANCE.md:
 *
 *   SC2. The pinned category never hides: its group row is drawn at the same height as a row of the
 *        default category, whatever the number of other groups, and the Groups tab scrolls as one
 *        area; no list inside it has a scroll bar of its own.
 *   SC3. A member joining a group is one short system line INSIDE the group's conversation, at its
 *        time among the messages. There is no members block above the conversation. A system line
 *        stays on one line whenever it fits in 85% of the conversation's width.
 *
 * The owner's two pictures of 23 September 2026 showed a 7-pixel Secretaries list beside its
 * heading (the tiny arrow was that list's own scroll bar) and five join blocks filling the top of
 * the open group, each wrapped onto two lines.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, in a real browser against a real server
 * ---------------------------------------------------------------------------------------
 *
 *   1. With thirty other groups the Secretariat row keeps the height of a default row, and no
 *      `.px-chat-list` in the Groups tab scrolls on its own.
 *   2. A join is one `li.px-chat-system[data-joined="yes"]` inside `ol.px-chat-said`, in time
 *      order: a join that arrives after a message stands after it.
 *   3. Every join's text has one line box at 1440 and at 390.
 *   4. The order rule, as a pure case of `theTimelineOfAGroup`.
 *   5. The disabled Edit in the Secretaries heading.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN EACH CASE RED, WITH THE CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Each mutation was made, the case run red, and the line put back byte for byte.
 *   - Case 1: the pinned `<ul>` is drawn beside its section again.
 *   - Case 2: `theTimelineOfAGroup` draws every join before every message.
 *   - Case 3: the `max-width: 85%` cap is put back on `.px-chat-system-block`.
 *   - Case 4: joins are sorted after messages within one second.
 *   - Case 5: the `disabled` attribute is taken off the Edit.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theResizeIsDrawn, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CONTACT_GROUP_WORDS } from '../src/shared/contacts.ts'
import { moleOffice, type ParticipantRef } from '../src/shared/participants.ts'
// A NAMESPACE IMPORT so this file loads on the unchanged tip as well: the picture case is run
// BEFORE the source changes, and a named import of a function that does not exist yet would stop
// the whole file from loading. The pure case below asks for the name at the moment it runs.
import * as groupLines from '../src/shared/groups.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * FOUR SECRETARIES, SHAPED LIKE THE OWNER'S WORLD. One name carries CJK parentheses, as the owner's real
 * members do (a name followed by another in CJK parentheses), and one is long enough to have wrapped in the owner's picture.
 */
const THE_SECRETARIES = [
  { handle: 'sec-lina', name: 'Lina（丽娜）' },
  { handle: 'sec-quill', name: 'Quill - the coordinator' },
  { handle: 'sec-vale', name: 'Vale' },
  { handle: 'sec-onyx', name: 'Onyx' },
] as const

/** The fifth secretary, registered during case 2. */
const THE_FIFTH = { handle: 'sec-rune', name: 'Rune' } as const

/** The agent whose one-to-one conversation carries a system line, for the picture case. */
const A_GUIDE = { handle: 'guide-moss', name: 'Moss' } as const

/** The message posted in case 2. Its words are what tells it apart in the timeline. */
const A_MESSAGE = 'This message must come before the fifth secretary joins.'

beforeAll(async () => {
  app = await liveApp({ name: 'secretariat-row', viewport: { width: 1440, height: 1000 } })
  const secretariat = await theSecretariatGroup()

  // THE FOUR SECRETARIES ARE PUT IN THE STANDING GROUP AUTOMATICALLY, which is what makes four
  // membership rows. The owner is already in it from the server's own start.
  for (const one of THE_SECRETARIES) {
    const made = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ handle: one.handle, name: one.name, role: 'secretary' }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }

  // THIRTY OTHER GROUPS, so the default category is tall enough to crush the pinned list. The old
  // test world had one group and both lists fit, which is why wave 2 could not see the defect.
  for (let at = 1; at <= 30; at++) {
    const made = await fetch(`${app.api}/api/groups`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        name: `Overlap group ${String(at).padStart(2, '0')}`,
        because: 'Two agents claimed the same files and neither would go first.',
        members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' }],
      }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }

  // AT LEAST TEN MESSAGES, so the join lines have a conversation to stand among.
  for (let at = 1; at <= 10; at++) {
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'message',
        title: `A message ${String(at)}`,
        data: { body: `The clamp holds at ${String(at)}.5 N.`, toGroup: secretariat.id },
      }),
    })
    expect(said.status, await said.clone().text()).toBe(201)
  }

  // AND ONE ONE-TO-ONE CONVERSATION HOLDING A SYSTEM LINE, because the CSS change reaches every
  // system line and not only a join. The line is the shape `writeASystemLineToTwo` writes, put in
  // by hand for the same reason the neighbouring test does: the runtimes that write one need a
  // whole worker to happen.
  const guide = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: A_GUIDE.name,
      data: { handle: A_GUIDE.handle, runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(guide.status, await guide.clone().text()).toBe(201)
  const aRunEnded = groupLines.SYSTEM_LINES.aRunWaitedAndEnded(10)
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: 'Mole Office',
      data: { body: aRunEnded.line, saidInFull: aRunEnded.said, to: [{ kind: 'agent', id: A_GUIDE.handle }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(line.status, await line.clone().text()).toBe(409)
  const lineId = ((await line.json()) as { record: { id: string } }).record.id
  await putASystemLineInAOneToOne(lineId)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * THE ONE-TO-ONE SYSTEM LINE, written the way the neighbouring block test writes one: the message
 * row is real, its sender is made Mole Office, and a delivery row puts it in the person's own
 * conversation. The test is what the panel draws for such a row.
 */
async function putASystemLineInAOneToOne(lineId: string): Promise<void> {
  const { default: Database } = await import('better-sqlite3')
  const { join } = await import('node:path')
  const { nanoid } = await import('nanoid')
  const held = new Database(join(app.dir, 'panelx.db'))
  try {
    held
      .prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?")
      .run(JSON.stringify({ kind: 'agent', id: 'mole-office' }), lineId)
    held
      .prepare(
        'INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(nanoid(12), lineId, 'person', THE_PERSON, 'delivered', '2026-09-23 22:00:00')
  } finally {
    held.close()
  }
}

/** The pinned group's own row, read from the door that says which one it is. */
async function theSecretariatGroup(): Promise<{ id: string }> {
  const reply = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const body = (await reply.json()) as { groups: { id: string; pinned: boolean }[] }
  const found = body.groups.find((one) => one.pinned)
  expect(found, 'the office has no pinned Secretariat group').toBeDefined()
  return { id: found?.id ?? '' }
}

/** Open the panel and leave it drawing the Groups tab. */
async function openTheGroups(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  await app.page.waitForSelector('.px-chat-top-group[data-category="pinned"]', { timeout: 20_000 })
}

/** Open the Secretariat group from the Groups tab and wait for its conversation. */
async function openTheSecretariat(): Promise<void> {
  await openTheGroups()
  await app.page.click('.px-chat-contact:has-text("Secretariat")')
  await app.page.waitForSelector('.px-chat-said', { timeout: 20_000 })
}

/** Open the person's one-to-one conversation with the guide, where the system line stands. */
async function openTheOneToOne(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="contacts"]', { timeout: 20_000 })
  await app.page.click(`.px-chat-contact:has-text("${A_GUIDE.name}")`)
  await app.page.waitForSelector('.px-chat-system', { timeout: 20_000 })
}

describe('the Secretariat row is seen at full height', () => {
  it('draws it as tall as a default row, with no list scrolling on its own', async () => {
    await openTheGroups()
    const measured = await app.page.evaluate(() => {
      const inTheTab = '.px-chat-under-tabs[data-showing="groups"]'
      // THE ROWS ARE FOUND BY THEIR OWN WORDS, not by the section they are in, so the measurement
      // still finds the Secretariat row when the defect draws its list beside the section.
      const rows = Array.from(document.querySelectorAll<HTMLElement>(`${inTheTab} .px-chat-contact`))
      const pinnedRow = rows.find((one) => one.textContent?.includes('Secretariat') === true) ?? null
      const defaultRow = rows.find((one) => one.textContent?.includes('Secretariat') !== true) ?? null
      const pinnedList = (pinnedRow?.closest('.px-chat-list') ?? null) as HTMLElement | null
      const lists = Array.from(document.querySelectorAll<HTMLElement>(`${inTheTab} .px-chat-list`))
      return {
        pinnedHeight: pinnedRow?.getBoundingClientRect().height ?? 0,
        defaultHeight: defaultRow?.getBoundingClientRect().height ?? 0,
        pinnedListHeight: pinnedList?.getBoundingClientRect().height ?? 0,
        lists: lists.map((one) => ({ scrollHeight: one.scrollHeight, clientHeight: one.clientHeight })),
      }
    })
    // THE CONTROL: both rows and both lists are drawn. An empty page would pass every count below.
    expect(measured.pinnedHeight, 'the Secretariat row is not drawn').toBeGreaterThan(0)
    expect(measured.defaultHeight, 'no default row is drawn to compare with').toBeGreaterThan(0)
    expect(measured.lists.length, 'no category list is drawn to measure').toBeGreaterThan(1)
    // THE ROW KEEPS ITS HEIGHT: it is a default row's height, within one pixel.
    expect(
      Math.abs(measured.pinnedHeight - measured.defaultHeight),
      `the Secretariat row is ${String(measured.pinnedHeight)}px against a default row's ${String(measured.defaultHeight)}px`,
    ).toBeLessThanOrEqual(1)
    // AND ITS OWN LIST IS NOT CRUSHED, which is what the row would lose first.
    expect(
      measured.pinnedListHeight,
      `the Secretaries list is ${String(measured.pinnedListHeight)}px against a row of ${String(measured.defaultHeight)}px`,
    ).toBeGreaterThanOrEqual(measured.defaultHeight - 1)
    // AND THE TAB SCROLLS AS ONE AREA: no list inside it is squeezed, so none of them scrolls.
    for (const [at, one] of measured.lists.entries()) {
      expect(
        one.scrollHeight,
        `list ${String(at)} scrolls on its own (${String(one.scrollHeight)}px of content in ${String(one.clientHeight)}px)`,
      ).toBeLessThanOrEqual(one.clientHeight + 1)
    }
  }, 120_000)
})

describe('a join stands in the conversation, in time order', () => {
  it('puts the fifth secretary after a message sent before the join', async () => {
    await openTheSecretariat()
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'message',
        title: 'A message before the join',
        data: { body: A_MESSAGE, toGroup: (await theSecretariatGroup()).id },
      }),
    })
    expect(said.status, await said.clone().text()).toBe(201)
    // A SECOND BOUNDARY BETWEEN THE TWO, so the message's stamp and the join's stamp cannot be the
    // same one. Within one second the office's own lines come first and joins come before messages,
    // which is a different fact proved as the pure case below.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const made = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ handle: THE_FIFTH.handle, name: THE_FIFTH.name, role: 'secretary' }),
    })
    expect(made.status, await made.clone().text()).toBe(201)

    await openTheSecretariat()
    await app.page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.px-chat-system-block')).some(
          (one) => one.textContent?.includes('Rune') === true,
        ),
      undefined,
      { timeout: 20_000 },
    )
    const shape = await app.page.evaluate((messageWords: string) => {
      const inAMembersBlock = document.querySelector('.px-chat-members') !== null
      const said = document.querySelector('.px-chat-said')
      const children = said === null ? [] : Array.from(said.children)
      const entries = children.map((one) => {
        if (one.matches('li.px-chat-system[data-joined="yes"]')) {
          return { kind: 'join', text: one.textContent ?? '' }
        }
        if (one.matches('li.px-chat-one')) return { kind: 'message', text: one.textContent ?? '' }
        return { kind: 'other', text: one.textContent ?? '' }
      })
      return {
        inAMembersBlock,
        entries,
        joins: entries.filter((one) => one.kind === 'join').length,
        fifth: entries.findIndex((one) => one.kind === 'join' && one.text.includes('Rune')),
        message: entries.findIndex((one) => one.kind === 'message' && one.text.includes(messageWords)),
      }
    }, A_MESSAGE)

    // THE CONTROL: the joins are drawn at all, and the message is drawn at all.
    expect(shape.inAMembersBlock, 'a members block is still drawn above the conversation').toBe(false)
    expect(shape.joins, 'no join line is drawn in the conversation').toBeGreaterThan(0)
    expect(shape.message, 'the message sent before the join is not drawn').toBeGreaterThanOrEqual(0)
    expect(shape.fifth, 'the fifth secretary has no join line').toBeGreaterThanOrEqual(0)
    // AND THE JOIN STANDS AFTER THE MESSAGE IT FOLLOWED.
    expect(
      shape.fifth,
      `the fifth join is at ${String(shape.fifth)} and the message at ${String(shape.message)}`,
    ).toBeGreaterThan(shape.message)
  }, 120_000)
})

describe('each join is one line', () => {
  it('draws every join text as one line box at 1440 and at 390', async () => {
    await openTheSecretariat()
    // THE PANEL FILLS THE WINDOW AT THE DESK, which is the width the defect was measured at. At 390
    // the phone rule already makes the panel the window.
    const fill = await app.page.$('.px-chat-fill[aria-pressed="false"]')
    if (fill !== null) await fill.click()
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await theResizeIsDrawn(app.page)

    /**
     * ONE LINE BOX PER JOIN. The block's words are drawn through the Markdown renderer, which
     * wraps them in a paragraph and an inline span; the range is taken over the innermost span so
     * the count is of the words' own line boxes and not of the elements that hold them.
     */
    const joinLineBoxes = async (): Promise<{ text: string; lines: number }[]> =>
      app.page.$$eval('.px-chat-said li.px-chat-system[data-joined="yes"] .px-chat-system-block', (all) =>
        all.map((block) => {
          const paragraph = block.querySelector('.sb-p') ?? block
          const words = paragraph.firstElementChild ?? paragraph
          const range = document.createRange()
          range.selectNodeContents(words)
          return { text: block.textContent ?? '', lines: range.getClientRects().length }
        }),
      )

    const wide = await joinLineBoxes()
    // THE CONTROL: there are joins to measure.
    expect(wide.length, 'no join line is drawn to measure at 1440').toBeGreaterThan(0)
    for (const one of wide) {
      expect(one.lines, `the join "${one.text}" wraps at 1440`).toBe(1)
    }

    await app.page.setViewportSize({ width: 390, height: 844 })
    await theResizeIsDrawn(app.page)
    const narrow = await joinLineBoxes()
    expect(narrow.length, 'no join line is drawn to measure at 390').toBeGreaterThan(0)
    for (const one of narrow) {
      expect(one.lines, `the join "${one.text}" wraps at 390`).toBe(1)
    }
  }, 120_000)
})

describe('the order rule of a group timeline', () => {
  it('puts an office line, then a join, then a message in the same second', () => {
    const at = '2026-09-16 17:24:01'
    const officeLine = { id: 'office-1', sentAt: at, sentBy: moleOffice() }
    const message = {
      id: 'message-1',
      sentAt: at,
      sentBy: { kind: 'person', id: THE_PERSON } as ParticipantRef,
    }
    const join = {
      who: { kind: 'agent', id: THE_FIFTH.handle } as ParticipantRef,
      joinedAt: at,
      joinedBecause: 'It holds the secretary card.',
    }
    const timeline = groupLines.theTimelineOfAGroup([message, officeLine], [join])
    // THE CONTROL: every entry comes back, so a function dropping one cannot pass the order check.
    expect(timeline.length, 'the timeline dropped an entry').toBe(3)
    expect(timeline.map((one) => one.kind)).toEqual(['officeLine', 'join', 'message'])
  })
})

describe('the Secretaries heading carries a disabled Edit', () => {
  it('draws it disabled', async () => {
    await openTheGroups()
    const edit = await app.page.$eval('.px-chat-top-group[data-category="pinned"] .px-chat-edit', (one) => ({
      disabled: (one as HTMLButtonElement).disabled,
      text: one.textContent?.trim() ?? '',
    })).catch(() => null)
    // THE CONTROL: the press is drawn at all.
    expect(edit, 'the Secretaries heading draws no Edit press').not.toBeNull()
    expect(edit?.disabled, 'the Edit press on the office-kept group is not disabled').toBe(true)
    expect(edit?.text, 'the disabled press is not labelled Edit').toBe(CONTACT_GROUP_WORDS.edit)
  }, 120_000)
})

/**
 * THE PICTURES. Chapter 6 rule 1: the Groups tab and the open Secretariat group at 1440, 990, 660
 * and 390 in light and dark, and one one-to-one conversation holding a system line because the CSS
 * change reaches every system line.
 *
 * IT IS GATED, like every other photographing case here: taking pictures is not a check. Run it
 * with SF_SECRETARIAT_DISPLAY_SHOTS naming the directory the pictures go in. The same case is run
 * on the unchanged tip for the "before" set and again after the change for the "after" set, in the
 * same seeded world.
 */
describe('the Secretariat display is looked at', () => {
  it.skipIf(!process.env['SF_SECRETARIAT_DISPLAY_SHOTS'])(
    'photographs the Groups tab, the open group and a one-to-one system line',
    async () => {
      const shots = process.env['SF_SECRETARIAT_DISPLAY_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      const widths = [1440, 990, 660, 390]
      const themes = ['light', 'dark'] as const

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

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await openTheSecretariat()
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          // THE TOP OF THE CONVERSATION, WHERE THE JOINS STAND. The panel scrolls to the newest
          // message, so without this the picture would show the last messages and no join at all.
          await app.page.$eval('.px-chat-said', (one) => {
            ;(one as HTMLElement).scrollTop = 0
          })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/secretariat-joins-${String(width)}-${theme}.png`,
            fullPage: false,
          })
        }
      }

      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await openTheOneToOne()
      for (const width of widths) {
        for (const theme of themes) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/one-to-one-system-line-${String(width)}-${theme}.png`,
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
