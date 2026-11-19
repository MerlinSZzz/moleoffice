// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE MOLE OFFICE WROTE IS A SMALL CENTRED GREY BLOCK, NEVER A MESSAGE WITH AN AVATAR.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office is a participant (criterion M11), so its lines carry a sender and were drawn like
 * anybody else's words: a bubble with an avatar beside it. A line saying a group was opened then
 * read as somebody talking. The rule, point P3:
 *
 *   a system notice only states a fact, such as who joined or who left, as a small grey block centred
 *   at the top of the conversation, as group chats commonly show it.
 *
 * Criterion M26, decision `gGUxEiMa2bgw`, problem `SZlw6wzFIWa2`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS READ OFF A REAL PAGE, AND WHAT IS MADE BY HAND
 * ---------------------------------------------------------------------------------------
 *
 * The group lines are written by the real routes: opening a group writes one, and adding a member
 * writes none — the panel draws the join from the membership row. The line in a ONE-TO-ONE
 * conversation is written straight into the database,
 * because the two things that write one — a run that stopped waiting (M22) and a restart that cut
 * a run off (M24) — each need a whole worker and a runtime to happen. What is written by hand is
 * exactly the row `writeASystemLineToTwo` in src/server/lib/groups.ts writes: a message whose
 * sender is Mole Office, addressed to both sides, with a delivery row for each. The point of the
 * test is what the panel draws for such a row, and the row is real whichever way it got there.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { liveApp, theOfficesOwnIdIn, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const GROUP_NAME = 'The mount claim'
const WHY_IT_WAS_OPENED = 'Two agents claimed the same files and neither would go first.'
/**
 * The words a run's ending puts in a one-to-one conversation. Criteria M22 and M34.
 *
 * `line` is the few words the block draws and `said` is the sentence behind them, which criterion
 * M34 moved into the block's hover text.
 */
const A_RUN_ENDED = SYSTEM_LINES.aRunWaitedAndEnded(10)

let groupId = ''

/**
 * Open the panel and leave it on the contacts list.
 *
 * THE TAB IS PRESSED RATHER THAN ASSUMED. Going to the same address the panel is already on does
 * not reload the page, so the panel is wherever the last test left it — which was a group.
 */
async function openThePanel(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-tab[data-tab="contacts"]', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
}

beforeAll(async () => {
  app = await liveApp({ name: 'system-notice', viewport: { width: 1440, height: 1000 } })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }

  // A GROUP WITH THE PERSON IN IT, opened the way anything opens one.
  const opened = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      name: GROUP_NAME,
      because: WHY_IT_WAS_OPENED,
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'The person is the one who has to settle it.' },
        { who: { kind: 'agent', id: 'builder-x' }, because: 'It holds one of the two claims.' },
      ],
    }),
  })
  expect(opened.status, await opened.clone().text()).toBe(201)
  groupId = ((await opened.json()) as { group: { id: string } }).group.id

  // AND SOMEBODY JOINING IT. No message is written for the join;
  // the members panel draws it from this membership row's own time and reason.
  const added = await fetch(`${app.api}/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ who: { kind: 'agent', id: 'checker-y' }, because: 'It holds the other claim.' }),
  })
  expect(added.status, await added.clone().text()).toBe(200)

  // AND ONE LINE IN A ONE-TO-ONE CONVERSATION: the shape `writeASystemLineToTwo` writes, made here
  // because the two things that write one need a whole worker and a runtime to happen.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'message',
      title: 'Mole Office',
      data: { body: A_RUN_ENDED.line, saidInFull: A_RUN_ENDED.said, to: [{ kind: 'agent', id: 'builder-x' }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.clone().text()).toBe(409)
  const lineId = ((await said.json()) as { record: { id: string } }).record.id

  const held = new Database(join(app.dir, 'panelx.db'))
  try {
    held
      .prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?")
      .run(JSON.stringify({ kind: 'agent', id: theOfficesOwnIdIn(held) }), lineId)
    // ADDRESSED TO BOTH SIDES, which is what puts it in their conversation and nothing else does.
    held
      .prepare(
        'INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(nanoid(12), lineId, 'person', THE_PERSON, 'delivered', '2026-09-04 17:00:00')
  } finally {
    held.close()
  }
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a line Mole Office writes into a group is a block and not somebody speaking', () => {
  it('draws it as a centred grey block with no avatar and no bubble', async () => {
    await openThePanel()
    await app.page.click('.px-chat-tab[data-tab="groups"]')
    await app.page.waitForFunction(
      (name: string) => document.body.textContent?.includes(name) === true,
      GROUP_NAME,
      { timeout: 20_000 },
    )
    await app.page.click(`.px-chat-contact:has-text("${GROUP_NAME}")`)
    await app.page.waitForSelector('.px-chat-system', { timeout: 20_000 })

    const blocks = await app.page.$$eval('.px-chat-system', (all) =>
      all.map((one) => ({
        words: one.textContent ?? '',
        hasBlock: one.querySelector('.px-chat-system-block') !== null,
        hasAvatar: one.querySelector('img, .px-avatar') !== null,
        hasBubble: one.querySelector('.px-chat-bubble') !== null,
        centred: getComputedStyle(one).justifyContent === 'center',
      })),
    )
    expect(blocks.length, 'no system line is drawn at all, so nothing below proves anything').toBeGreaterThan(0)
    for (const one of blocks) {
      expect(one.hasBlock, 'a system line is drawn as bare text and not as a block').toBe(true)
      expect(one.hasAvatar, 'a system line is drawn with an avatar, so it reads as somebody speaking').toBe(false)
      expect(one.hasBubble, 'a system line is drawn in a message bubble').toBe(false)
      expect(one.centred, 'a system line is not centred in the flow').toBe(true)
    }

    // AND NEITHER LINE IS DRAWN AS A MESSAGE. A message list item is the other shape entirely, so
    // finding these words inside one would mean both shapes were drawn for the same row.
    const asMessages = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.textContent ?? ''))
    expect(asMessages.some((one) => one.includes(GROUP_NAME))).toBe(false)
    expect(asMessages.some((one) => one.includes('Checker Y'))).toBe(false)
  }, 120_000)

  it('says how the group was opened, in its own block', async () => {
    await openThePanel()
    await app.page.click('.px-chat-tab[data-tab="groups"]')
    await app.page.waitForFunction(
      (name: string) => document.body.textContent?.includes(name) === true,
      GROUP_NAME,
      { timeout: 20_000 },
    )
    await app.page.click(`.px-chat-contact:has-text("${GROUP_NAME}")`)
    await app.page.waitForSelector('.px-chat-system', { timeout: 20_000 })

    // SINCE CRITERION M34 THE BLOCK SAYS A FEW WORDS AND THE SENTENCE IS ITS HOVER TEXT. The group's
    // name and the reason it was opened are in the sentence, which is where a reader who wants them
    // finds them; the block itself says what happened.
    //
    // THE JOIN ROWS COME FIRST IN THE DOM, because the members panel is part of the header and the
    // line saying how the group was opened is the first block in the message list. So this looks for
    // that line rather than assuming it is the first block on the page.
    const opened = SYSTEM_LINES.groupOpened(GROUP_NAME, WHY_IT_WAS_OPENED)
    const blocks = await app.page.$$eval('.px-chat-system-block', (all) =>
      all.map((one) => ({ said: one.textContent ?? '', title: one.getAttribute('title') })),
    )
    const openedBlock = blocks.find((one) => one.said === opened.line) ?? null
    expect(openedBlock, 'no block says the group was opened').not.toBeNull()
    expect(openedBlock?.title, 'the block does not name the group in its hover text').toContain(GROUP_NAME)
    expect(openedBlock?.title, 'the block does not say why the group was opened').toContain(WHY_IT_WAS_OPENED)
    expect(openedBlock?.title).toBe(opened.said)
  }, 120_000)

  it('draws the join in the members panel as a short system block, not a message', async () => {
    await openThePanel()
    await app.page.click('.px-chat-tab[data-tab="groups"]')
    await app.page.waitForFunction(
      (name: string) => document.body.textContent?.includes(name) === true,
      GROUP_NAME,
      { timeout: 20_000 },
    )
    await app.page.click(`.px-chat-contact:has-text("${GROUP_NAME}")`)
    // WHY: the join notices filled the chat and could not be closed; they
    // should read like the office's short system lines. So the join is drawn in the members panel as
    // the same small block every system line draws — a few words, its time above it, the reason
    // behind it — and it is still not delivered to every member as a message.
    await app.page.waitForSelector('.px-chat-said .px-chat-system[data-joined="yes"]', { timeout: 20_000 })
    const joins = await app.page.$$eval('.px-chat-said .px-chat-system[data-joined="yes"]', (all) =>
      all.map((one) => ({
        words: one.querySelector('.px-chat-system-block')?.textContent ?? '',
        title: one.querySelector('.px-chat-system-block')?.getAttribute('title') ?? '',
        when: one.querySelector('.px-chat-system-when')?.textContent ?? '',
        inAMessage: one.closest('.px-chat-one') !== null,
      })),
    )
    const joined = joins.filter((one) => one.words.includes('Checker Y'))
    expect(joined.length, 'nobody joining was drawn in the members panel').toBeGreaterThan(0)
    expect(joined[0]?.words, 'the join row is not the short few words').toBe('Checker Y joined')
    expect(joined[0]?.title, 'the join row does not say why Checker Y is there').toContain('It holds the other claim.')
    expect(joined[0]?.when, 'the join row draws no time above it').toMatch(
      /^--\s*\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}\s*--$/,
    )
    expect(joined[0]?.inAMessage, 'the join is drawn as a full chat message').toBe(false)
    // AND NO MESSAGE BUBBLE CARRIES IT, which is the half of the rule that was already settled.
    const asMessages = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.textContent ?? ''))
    expect(asMessages.some((one) => one.includes('Checker Y'))).toBe(false)
  }, 120_000)
})

describe('a line Mole Office writes into a one-to-one conversation is the same block', () => {
  it('draws a run that ended as a block, not as a message from a contact', async () => {
    await openThePanel()
    await app.page.waitForFunction(
      () => document.querySelector('.px-chat')?.textContent?.includes('Builder X') === true,
      undefined,
      { timeout: 20_000 },
    )
    await app.page.click('.px-chat-contact:has-text("Builder X")')
    // THE CONTACT LIST STAYS WHILE THE CONVERSATION IS READ, so the row's preview can carry these
    // words before the conversation is on screen. Wait for the block itself, which is the thing this
    // case is about; the contact list is drawn on purpose while the read is in flight.
    await app.page.waitForFunction(
      (words: string) =>
        [...document.querySelectorAll('.px-chat-system-block')].some((one) => one.textContent?.includes(words) === true),
      A_RUN_ENDED.line,
      { timeout: 20_000 },
    )

    const inABlock = await app.page.$$eval('.px-chat-system-block', (all) => all.map((one) => one.textContent ?? ''))
    expect(inABlock, 'a line about a run that ended is not drawn as a block in the conversation').toContain(
      A_RUN_ENDED.line,
    )

    const inAMessage = await app.page.$$eval('.px-chat-one', (all) => all.map((one) => one.textContent ?? ''))
    expect(
      inAMessage.some((one) => one.includes(A_RUN_ENDED.line)),
      'a line Mole Office wrote is drawn as a message with an avatar in the conversation',
    ).toBe(false)
  }, 120_000)
})
