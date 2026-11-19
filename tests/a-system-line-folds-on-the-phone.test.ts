// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M128 — ON A PHONE A SYSTEM LINE IS ONE LINE, FOLDED, NEVER A PARAGRAPH.
 *
 * Criterion M128 of design/messages/ACCEPTANCE.md, in the owner's picture of 12 September 2026 at 16:48
 * (QQ8q9bHMWrO0): the long system notice filled most of the phone screen. A system line's few words
 * are what is drawn; when those few words are long — a long participant name, say — the block is
 * still one line at 390, and the rest is behind the hover text rather than a paragraph in the flow.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server: a group line whose words are long
 * enough to wrap several times is drawn as ONE line at 390. The mutation drops the fold and the
 * case goes red.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, PROVED AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: the case passes. Then the `.px-chat-system-block` rule was removed from the phone media
 * query in src/web/components/Chat.tsx — the `-webkit-line-clamp: 1` and its companions. The case
 * goes red: the block's height grew to several lines. The rule was put back byte-for-byte (sha256
 * checked) and the control run again: green.
 *
 * WHAT WOULD MAKE THIS GO RED: dropping the clamp at 390.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theResizeIsDrawn, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A NAME LONG ENOUGH TO WRAP SEVERAL TIMES AT 390. It is a registry name, so it is two to five
 * words and at most sixty characters; nothing in the product cuts a name, so the block is what must
 * stay one line.
 */
const A_LONG_NAME = 'Antidisestablishmentarianism Floccinaucinihilipilification'

beforeAll(async () => {
  app = await liveApp({ name: 'system-line-folds', viewport: { width: 1440, height: 1000 } })
  // A TITLE OF TWO LONG WORDS IS A NAME (the label budget is two to five words and sixty
  // characters), so the registry keeps it rather than falling back to the handle.
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: A_LONG_NAME,
      data: { handle: 'fold-long', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const made = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: 'The fold group',
      because: 'One line has to stay one line on a phone.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'the person opened it' },
        { who: { kind: 'agent', id: 'fold-long' }, because: 'it has a long name' },
      ],
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const groupId = ((await made.json()) as { group: { id: string } }).group.id
  // THE LONG NAME IS CARRIED BY A LINE THAT IS STILL WRITTEN. A join is no longer a message (the owner's
  // words of 14 September 2026), so the line carrying a participant's own long name is the leave.
  // The person removes the long-named agent, which writes "<the long name> left the group".
  const left = await fetch(`${app.api}/api/groups/${groupId}/members/remove`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ who: { kind: 'agent', id: 'fold-long' } }),
  })
  expect(left.status, await left.clone().text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
}, 60_000)

/** Open the group and come back to its system lines. */
async function openTheGroup(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  await app.page.click('.px-chat-contact:has-text("The fold group")')
  await app.page.waitForSelector('.px-chat-system', { timeout: 20_000 })
}

describe('M128: a system line folds to one line at 390', () => {
  it('draws a long system line as one line on the phone, with the rest behind it', async () => {
    await openTheGroup()
    // THE CONTROL: the long block is drawn at all, and it carries the long name.
    const block = await app.page.$$eval('.px-chat-system-block', (all) => {
      const found = all.find((one) => (one.textContent ?? '').includes('Antidisestablishmentarianism'))
      if (found === undefined) return null
      const style = getComputedStyle(found)
      return {
        text: found.textContent ?? '',
        clamp: style.webkitLineClamp || style.getPropertyValue('line-clamp') || '',
        whiteSpace: style.whiteSpace,
        height: found.getBoundingClientRect().height,
        clientHeight: (found as HTMLElement).clientHeight,
        lineHeight: parseFloat(style.lineHeight) || 0,
      }
    })
    expect(block, 'the system line about the long-named agent is not drawn').not.toBeNull()
    expect(block?.text, 'the block does not carry the long name').toContain('Antidisestablishmentarianism')

    // AT 390 IT IS ONE LINE. `clientHeight` is about one line-height, not the several the words
    // would take unfolded.
    await app.page.setViewportSize({ width: 390, height: 844 })
    await theResizeIsDrawn(app.page)
    const narrow = await app.page.$$eval('.px-chat-system-block', (all) => {
      const found = all.find((one) => (one.textContent ?? '').includes('Antidisestablishmentarianism'))
      if (found === undefined) return null
      const style = getComputedStyle(found)
      return {
        height: found.getBoundingClientRect().height,
        clientHeight: (found as HTMLElement).clientHeight,
        scrollHeight: (found as HTMLElement).scrollHeight,
        lineHeight: parseFloat(style.lineHeight) || 0,
        overflow: style.overflow,
        whiteSpace: style.whiteSpace,
      }
    })
    expect(narrow, 'the system line vanished at 390').not.toBeNull()
    // A LINE IS ONE LINE: the drawn height is not two.
    expect(
      narrow?.clientHeight ?? 999,
      `the system line is ${String(narrow?.clientHeight)}px tall at 390 (line-height ${String(narrow?.lineHeight)})`,
    ).toBeLessThan((narrow?.lineHeight ?? 1) * 1.8)
    // AND THE FOLD IS WHAT MAKES IT ONE LINE: the words are not wrapped, and the overflowing part is
    // hidden behind the hover text rather than drawn as a paragraph.
    expect(narrow?.whiteSpace, 'the words are still free to wrap at 390').toBe('nowrap')
    expect(narrow?.overflow, 'the fold does not hide the overflowing words').toBe('hidden')
  }, 120_000)
})

/**
 * THE MEMBERS PANEL, LOOKED AT — chapter 6, and the half of the request that
 * this branch could not photograph from a worker.
 *
 * A join is no longer sent to any agent as a message; the members panel carries it instead. That
 * moved a fact from the message list, which is looked at every time somebody opens a conversation,
 * into a panel nobody had photographed. So the panel is looked at at four widths and in both
 * themes, with a member whose name is long enough to wrap, because a short block that reads cleanly
 * at 1440 is where a phone shows the reader something broken.
 *
 * IT IS GATED, like every other photographing case here, because taking pictures is not a check and
 * a suite should not do it: run it with SF_MEMBERS_SHOTS set to the directory the pictures go in.
 */
describe('the members panel carries the join, and is looked at', () => {
  it.skipIf(!process.env['SF_MEMBERS_SHOTS'])(
    'photographs the members panel at 1440, 1024, 768 and 390 in both themes',
    async () => {
      const shots = process.env['SF_MEMBERS_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      // THE WAY IN IS WRITTEN OUT HERE RATHER THAN SHARED WITH THE CASE ABOVE. `openTheGroup` waits
      // for the tabs before it presses Back, which works from a fresh panel; by the time this case
      // runs the group is already open and restored across the reload, so the tabs are not drawn and
      // the wait times out. Pressing Back first, when there is one, is the difference. Each width is
      // set afterwards, one at a time.
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
      await app.page.goto(`${app.site}/#/`)
      await waitForThePage(app.page, 30_000)
      await openTheChat(app.page)
      const back = await app.page.$('.px-chat-back')
      if (back !== null) await back.click()
      await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
      await app.page.click('.px-chat-tab[data-tab="groups"]')
      await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
      await app.page.click('.px-chat-contact:has-text("The fold group")')
      await app.page.waitForSelector('.px-chat-box', { timeout: 20_000 })
      // THE PANEL IS REALLY THERE AND REALLY CARRIES A JOIN, so a picture of an empty header cannot
      // pass for a look at it. Since a later ruling a join is the same short system
      // block as every other office line, with its time drawn above it.
      await app.page.waitForSelector('.px-chat-said .px-chat-system[data-joined="yes"]', { timeout: 20_000 })
      const rows = await app.page.$$eval('.px-chat-said .px-chat-system[data-joined="yes"]', (all) =>
        all.map((one) => ({
          words: one.querySelector('.px-chat-system-block')?.textContent ?? '',
          when: one.querySelector('.px-chat-system-when')?.textContent ?? '',
        })),
      )
      expect(rows.length, 'the members panel drew no row at all').toBeGreaterThan(0)
      expect(
        rows.some((one) => one.when.includes('--')),
        'no join row says when its member joined, drawn as a system line',
      ).toBe(true)
      expect(
        rows.some((one) => one.words.endsWith(' joined')),
        'no join row draws the short line',
      ).toBe(true)
      for (const width of [1440, 1024, 768, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.screenshot({
            path: `${shots}/members-panel-${String(width)}-${theme}.png`,
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
