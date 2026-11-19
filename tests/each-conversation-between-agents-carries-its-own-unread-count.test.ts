// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GREY UNREAD COUNT ON EVERY CONVERSATION BETWEEN AGENTS, NO NUMBER ON THEIR TAB, AND THE ROW'S
 * NUMBER FALLS WHEN THE PERSON OPENS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M71 of design/messages/ACCEPTANCE.md section 40:
 *
 *   In the between-agents list some titles were bold and some were not, and opening one did not lower the
 *   count above. Each conversation in that list must show its own count of unread messages, in grey.
 *
 * Three things:
 *
 *   1. EACH ROW CARRIES ITS OWN GREY COUNT of the messages the person has not read in that conversation.
 *      There was no number on these rows at all: `newSince` was on the wire and nothing drew it.
 *   2. THE TAB ABOVE DRAWS NO NUMBER. Until 6 October 2026 it drew the number of conversations
 *      with something unread. What agents say to each other is not pushed to the owner as new; it is
 *      there when the owner opens it. Agreed with wave 13n.
 *   3. OPENING ONE REDUCES ITS ROW. This is the fault the owner reported. The read WAS always recorded — the
 *      read of the conversation is what records it — but nothing asked for the lists again
 *      afterwards, so the row kept its number and its bold.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROW'S NUMBER AND ITS BOLD ARE NOT THE SAME PREDICATE, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * A row goes bold on anything written since the person last looked, a Mole Office system line included; the
 * number counts messages only. That is criterion M33, tests/a-system-line-shows-without-counting.ts:
 * a system line marks the row and counts for nothing. So a row bold with no number means one thing
 * and one thing only: a system line arrived. Both are still "unread", which is what M71 asks of the
 * bold.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw no number on the rows                          → case 1
 *   draw the row's number in any ink but the grey       → case 1
 *   draw a number or a spoken count on the tab          → case 2
 *   leave the lists unread after opening a conversation → case 3
 *
 * The servers come from `liveApp` in tests/helpers.ts. Nothing here touches ./data/panelx.db.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function say(from: string, body: string, to: string, expected: number): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(from),
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'agent', id: to }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(expected)
}

interface Conversations {
  conversations: { between: { id: string }[]; newSince: number; anythingNew: boolean }[]
}

async function pairs(): Promise<Conversations['conversations']> {
  const read = await fetch(`${app.api}/api/messages/between-agents`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as Conversations).conversations
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-unread', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-p', 'Builder P'],
    ['checker-q', 'Checker Q'],
    ['builder-r', 'Builder R'],
    ['checker-s', 'Checker S'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }
  // TWO PAIRS, WITH DIFFERENT AMOUNTS UNREAD, so a count that is really a count can be told apart
  // from a mark that is only ever one.
  // NOTHING HOLDS ANY OF THE FOUR AGENTS IN THIS TEST OFFICE, so the office stores each message, routes it and
  // answers 409 rather than 201; the four are stored all the same, and the cases below count them.
  await say('builder-p', 'I have the mount claimed.', 'checker-q', 409)
  await say('checker-q', 'So have I. Which files?', 'builder-p', 409)
  await say('builder-p', 'The three under src/server.', 'checker-q', 409)
  await say('builder-r', 'The gate is measured.', 'checker-s', 409)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

// ---------------------------------------------------------------------------- the screen

async function openTheBetweenTab(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="between"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })
  await app.page.waitForFunction(
    () =>
      [...document.querySelectorAll('.px-chat-contact .px-chat-name')].some(
        (one) => one.textContent?.includes('·') === true,
      ),
    undefined,
    { timeout: 20_000 },
  )
}

/** The numbers on the rows of the between list, in the order the rows are drawn. */
async function numbersOnTheRows(): Promise<{ name: string; count: string | null; bold: string | null }[]> {
  return app.page.$$eval('.px-chat-under-tabs[data-showing="between"] .px-chat-contact', (all) =>
    all.map((row) => ({
      name: row.querySelector('.px-chat-name')?.textContent ?? '',
      count: row.querySelector('.px-chat-unread')?.textContent ?? null,
      bold: row.getAttribute('data-unread'),
    })),
  )
}

/** The number on the Between agents tab, or null when there is none. */
async function numberOnTheTab(): Promise<string | null> {
  return app.page.$eval('.px-chat-tab[data-tab="between"]', (tab) => tab.querySelector('.px-chat-unread')?.textContent ?? null)
}

// ---------------------------------------------------------------------------- the cases

describe('each conversation between agents carries its own unread count', () => {
  it('puts a grey count on each row, of that conversation alone', async () => {
    await openTheBetweenTab()
    const rows = await numbersOnTheRows()
    expect(rows.length, 'both pairs are drawn').toBe(2)
    // THE COUNTS ARE THIS CONVERSATION'S OWN, and they differ, so a badge showing the same number
    // on every row would fail rather than pass by accident.
    const said = Object.fromEntries(rows.map((one) => [one.name, one.count]))
    expect(Object.values(said).sort()).toEqual(['1', '3'])
    // AND THEY ARE GREY, which is the mark this product already uses for a count that is not
    // waiting on this reader. Read off the computed colour so deleting the rule fails this. The
    // grey and the overdue ink are each read off a probe beside the badge, so the test asks for the
    // ink by its token and not by a hue (report Ct7fm-w1VEY9, block found1).
    const grey = await app.page.$eval('.px-chat-under-tabs[data-showing="between"] .px-chat-unread', (el) => {
      const inkOf = (token: string) => {
        const probe = document.createElement('span')
        probe.style.background = `var(${token})`
        el.parentElement!.appendChild(probe)
        const ink = getComputedStyle(probe).backgroundColor
        probe.remove()
        return ink
      }
      return {
        background: getComputedStyle(el).backgroundColor,
        counts: el.getAttribute('data-counts'),
        grey: inkOf('--text-3'),
        overdue: inkOf('--st-overdue'),
      }
    })
    expect(grey.counts).toBe('new')
    expect(grey.grey, 'the grey and the overdue ink differ in this palette').not.toBe(grey.overdue)
    expect(grey.background, 'the row badge is drawn in the grey ink, not the overdue one a contact wears').toBe(grey.grey)
  }, 120_000)

  it('draws no number on the tab above, though two conversations have something new', async () => {
    // THE CONTROL: four messages are unread across two conversations, so a tab counting either would draw one.
    const onTheWire = await pairs()
    expect(onTheWire.reduce((sum, one) => sum + one.newSince, 0)).toBe(4)
    expect(await numberOnTheTab(), 'the Between agents tab draws a number').toBeNull()
    expect(
      await app.page.$eval('.px-chat-tab[data-tab="between"]', (tab) => tab.getAttribute('aria-label')),
      'the Between agents tab says a count to a screen reader',
    ).toBeNull()
  }, 120_000)

  it('reduces the row, the moment it is opened', async () => {
    // THE CONTROL: both rows' numbers are there before the press, so "there is no number" cannot pass on
    // a panel that drew none at all.
    const before = await numbersOnTheRows()
    expect(before.filter((one) => one.count !== null).length).toBe(2)
    expect(before.every((one) => one.bold === 'yes')).toBe(true)

    const opening = before[0]?.name ?? ''
    await app.page.click(`.px-chat-contact:has-text("${opening}")`)
    await app.page.waitForSelector('.px-chat-side', { timeout: 20_000 })
    await app.page.click('.px-chat-back')
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })

    // THE ROW FALLS, WITHOUT A RELOAD: opening a conversation lowers the count above it.
    await app.page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')].some(
          (row) => row.querySelector('.px-chat-name')?.textContent === name && row.querySelector('.px-chat-unread') === null,
        ),
      opening,
      { timeout: 20_000 },
    )
    const after = await numbersOnTheRows()
    const opened = after.find((one) => one.name === opening)
    expect(opened?.count, 'the row the person opened has nothing unread left').toBe(null)
    expect(opened?.bold, 'and it is not bold any more either').toBe('no')
    // AND THE OTHER ROW IS UNTOUCHED, so this is a read of one conversation and not of the list.
    const other = after.find((one) => one.name !== opening)
    expect(other?.count).not.toBe(null)
    expect(other?.bold).toBe('yes')
  }, 120_000)
})
