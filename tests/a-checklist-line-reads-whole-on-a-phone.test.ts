// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON A PHONE A CHECKLIST LINE WRAPS WHOLE, WITH NO CLAMP, SO THE ITEM'S NAME READS WHOLE.
 *
 * The owner decided that a checklist line says what thing and what happened. A
 * picture (QQ8q9bHMWrO0) makes every other system line one folded line on a
 * phone. The secretary answered in SZ0vKkqK4Kwu that the checklist lines wrap with a cap, and in
 * NrQFqk8CdxPG that the cap is three lines. Then the supervisor measured a done line naming the
 * checklist of an agent with a long name: at 390 it took four lines, and the clamp at three cut the
 * item's name. So the secretary answered again in Uik5ILSv5JVV: no clamp. The line is bounded already,
 * because the item's words are cut at 40 characters inside it, so only the agent's name can make it
 * longer. The longest agent name in the live office was 57 characters on 17 October 2026, and case
 * 9 is that length. The registry keeps a new name only up to five words and 60 characters.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server, in a throwaway office whose every
 * name, title, message and word is made up:
 *   1. At 390 the done line naming the joiner's checklist reads whole: more than one line, and
 *      nothing hidden.
 *   2. At 390 the done line on the person's checklist reads whole the same way.
 *   3. At 390 the two done lines carry no line clamp, wrap, and say they wrap.
 *   4. Guard: every other system line keeps the one-line fold at 390 — nowrap, hidden, and no
 *      data-wraps-on-a-phone.
 *   5. Guard: at 1440 the two done lines carry no line clamp and nothing in them is hidden.
 *   6. Guard: the office conversation still wraps its lines in full at 390, so the "A checklist was
 *      made for you" block reads whole.
 *   7. The wire carries the kind: the done lines carry notice "markedDoneOnAChecklist" and the
 *      person's own messages carry notice null (the field is there, and null).
 *   8. The office conversation says it is read only, as a short state word.
 *   9. At 390 the longest done line reads whole in four or five lines: a 57-character agent name,
 *      and an item whose words the line cuts at 40 characters, the most a line ever carries. More
 *      than five lines means something made the line longer than its cut allows.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, PROVED AFTER A CONTROL RUN, ON 2026-10-17
 * ---------------------------------------------------------------------------------------
 *
 * Proved while the lines stopped at three, before case 9 was written. Each one changes code that
 * is the same with no clamp:
 * M1, no attribute: ASystemBlock never puts data-wraps-on-a-phone on the block. Cases 1, 2 and 3
 * go red: the block is one folded line with its end behind an ellipsis.
 * M2, the attribute on every line: case 4 goes red: the long "left the group" line stops being
 * nowrap.
 * M3, the wire drops the kind: asMessage answers notice null. Cases 1, 2, 3 and 7 go red: the page
 * has nothing to tell the five lines by, and the read finds no kind.
 * M6, the old sentence: case 8 goes red.
 * M4 and M5 put the clamp at two and outside the phone width. The clamp is gone, so they are gone.
 *
 * Proved with no clamp:
 * M7, the shared set forgets the done line: cases 1, 2, 3 and 9 go red.
 * M9, the clamp at three put back on the paragraph: cases 3 and 9 go red. Case 9's line is laid out
 * in more lines than are shown.
 * M10, the item's words no longer cut at 40 characters: case 9 goes red, because the line takes
 * seven lines and the count allows five.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { FOR_THE_PERSON, liveApp, theOfficesOwnIdIn, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { openTheChat as openTheChatFromTheShell } from './open-the-chat.ts'

const { t } = createI18n('en')
/** Every value here is made up and nobody's. */
const THE_LONG_ITEM = 'Sweep the kiln room floor before the inspector comes on Friday'
const THE_LONG_NAME = 'Antidisestablishmentarianism Floccinaucinihilipilification'
const THE_JOINER = { handle: 'made-up-joiner-13j', name: 'Made-up joiner' }
const THE_SECRETARY = { handle: 'made-up-checklist-secretary', name: 'Made-up checklist secretary' }
const THE_GROUP = 'Made-up wrap group'
const THE_SECRETARYS_TITLE = 'Made-up studio checklist'
const THE_JOINER_DONE = "Marked done on Made-up joiner's checklist: «"
const THE_OWN_DONE = 'Marked done on your checklist: «'
/**
 * 57 characters, the length of the longest agent name in the live office on 17 October 2026, in five
 * words. The registry keeps a name only within the label budget, at most five words and 60
 * characters (theNameARecordGives in src/server/lib/participants.ts), and registers a longer one
 * under its handle.
 */
const THE_LONGEST_NAMED = { handle: 'made-up-longest-named', name: 'Made-up glazier-secretary, kiln-room ceramics (2-October)' }
/** Far longer than 40 characters, so the line carries the most of an item it ever carries. */
const THE_LONGEST_ITEM =
  'Sweep the kiln room floor, wash every glaze bucket, stack the moulds by the door and lock the shed before the inspector comes on Friday'
/** The start of the longest done line, up to the 39 characters a cut keeps of the item. */
const THE_LONGEST_START = `Marked done on ${THE_LONGEST_NAMED.name}'s checklist: «${THE_LONGEST_ITEM.slice(0, 39)}`

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let app: LiveApp
let joinerId = ''
let joinerKey = ''
let personList = ''
let personItem = ''
let ownItem = ''
let longestId = ''

/** One measurement of one system block, as the page computes it. */
interface Measured {
  text: string
  whiteSpace: string
  overflow: string
  clamp: string
  clampWhere: string
  clampOnTheCarrier: string
  wrapsOnAPhone: string | null
  clientHeight: number
  scrollHeight: number
  clientWidth: number
  scrollWidth: number
  lineHeight: number
  lines: number
  carrierClientHeight: number
  carrierScrollHeight: number
  carrierClientWidth: number
  carrierScrollWidth: number
  carrierWhiteSpace: string
}

/** The numbers a red run has to print, so it says what it saw. */
function whatTheBlockSaw(one: Measured | undefined): string {
  if (one === undefined) return 'the block is not drawn at all'
  return (
    `text="${one.text}" white-space=${one.whiteSpace} overflow=${one.overflow} ` +
    `lines=${String(one.lines)} (distinct tops of a Range over the block) ` +
    `clamp=${one.clamp} clamp-where=${one.clampWhere} clamp-on-the-carrier=${one.clampOnTheCarrier} ` +
    `data-wraps-on-a-phone=${one.wrapsOnAPhone ?? '(none)'} line-height=${String(one.lineHeight)} ` +
    `block client/scroll: height ${String(one.clientHeight)}/${String(one.scrollHeight)} ` +
    `width ${String(one.clientWidth)}/${String(one.scrollWidth)}; ` +
    `carrier client/scroll: height ${String(one.carrierClientHeight)}/${String(one.carrierScrollHeight)} ` +
    `width ${String(one.carrierClientWidth)}/${String(one.carrierScrollWidth)} white-space=${one.carrierWhiteSpace}`
  )
}

/** Every system block of the conversation on screen, measured as it is drawn now. */
async function theBlocksOnScreen(): Promise<Measured[]> {
  return app.page.$$eval('.px-chat-system-block', (all) => {
    const clampOf = (element: Element): string => {
      const style = getComputedStyle(element) as CSSStyleDeclaration & { webkitLineClamp?: string }
      const webkit = style.webkitLineClamp ?? ''
      const standard = style.getPropertyValue('line-clamp')
      if (webkit !== '' && webkit !== 'none') return webkit
      return standard === '' ? 'none' : standard
    }
    // THE LINES ITS WORDS TAKE, counted from the distinct tops of the rectangles a Range over the
    // block's own text returns. That count is the words' own layout, whether or not a clamp hides a
    // line. The range is set over the text nodes and not over the whole block: a range that also
    // covers the boxes between them answers a rectangle for a box as well as one for a line.
    const linesOf = (element: Element): number => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const first = walker.nextNode()
      if (first === null) return 0
      let last = first
      while (walker.nextNode() !== null) last = walker.currentNode
      const range = document.createRange()
      range.setStart(first, 0)
      range.setEnd(last, (last.textContent ?? '').length)
      const tops = new Set<number>()
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) tops.add(Math.round(rect.top))
      }
      return tops.size
    }
    return all.map((block) => {
      const style = getComputedStyle(block)
      const carrier =
        [block, ...Array.from(block.querySelectorAll('*'))].find((one) => clampOf(one) !== 'none') ?? block
      const carrierStyle = getComputedStyle(carrier)
      const blockBox = block as HTMLElement
      const carrierBox = carrier as HTMLElement
      return {
        text: block.textContent ?? '',
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        clamp: clampOf(block),
        clampWhere: carrier === block ? 'the block itself' : `${carrier.tagName.toLowerCase()} ${carrier.className}`,
        clampOnTheCarrier: clampOf(carrier),
        wrapsOnAPhone: block.getAttribute('data-wraps-on-a-phone'),
        clientHeight: blockBox.clientHeight,
        scrollHeight: blockBox.scrollHeight,
        clientWidth: blockBox.clientWidth,
        scrollWidth: blockBox.scrollWidth,
        lineHeight: parseFloat(style.lineHeight) || 0,
        lines: linesOf(block),
        carrierClientHeight: carrierBox.clientHeight,
        carrierScrollHeight: carrierBox.scrollHeight,
        carrierClientWidth: carrierBox.clientWidth,
        carrierScrollWidth: carrierBox.scrollWidth,
        carrierWhiteSpace: carrierStyle.whiteSpace,
      }
    })
  })
}

function theBlockSaying(all: Measured[], words: string): Measured | undefined {
  return all.find((one) => one.text.includes(words))
}

/** Wait until a system block carrying these words is drawn. */
async function waitForABlockSaying(words: string): Promise<void> {
  await app.page.waitForFunction(
    (wanted) =>
      [...document.querySelectorAll('.px-chat-system-block')].some((one) =>
        (one.textContent ?? '').includes(wanted),
      ),
    words,
    { timeout: 20_000 },
  )
}

/** Open the chat lists, whichever half of the panel is on screen. */
async function openTheChat(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  await openTheChatFromTheShell(app.page)
  // A RESTORED CONVERSATION COMES BACK OPEN, with the lists behind its back press. Wait for
  // whichever half is drawn first, press back when there is one, then wait for the tabs.
  await app.page.waitForSelector('.px-chat-tabs, .px-chat-back', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
}

/** Open the person's own conversation with one participant. */
async function openTheConversationWith(id: string, expectText: string): Promise<void> {
  await openTheChat()
  // THE CONTACTS TAB, so a previous case that ended in the groups tab cannot leave the row hidden.
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="contacts"]', { timeout: 20_000 })
  const row = `.px-chat-contact[data-contact="agent:${id}"]`
  await app.page.waitForSelector(row, { timeout: 20_000 })
  await app.page.click(row)
  await waitForABlockSaying(expectText)
}

/** Open the group and come back to its system lines. */
async function openTheGroup(): Promise<void> {
  await openTheChat()
  await app.page.click('.px-chat-tab[data-tab="groups"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="groups"]', { timeout: 20_000 })
  await app.page.click(`.px-chat-contact:has-text("${THE_GROUP}")`)
  await waitForABlockSaying('left the group')
}

/**
 * The id the office's own row holds in this test's office, read from its database. A fresh office
 * draws it new each time, and the server runs in another process, so this process cannot know it.
 */
function theOfficesOwnIdHere(): string {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true, fileMustExist: true })
  try {
    return theOfficesOwnIdIn(db)
  } finally {
    db.close()
  }
}

/**
 * OPEN THE OFFICE'S OWN CONVERSATION BY ADDRESS. It has no row in the contact list unless an
 * upgrade notice has been announced (contactsFor in src/server/lib/messages.ts), so the page is
 * told which conversation to open before it loads, the way a remembered conversation comes back.
 */
async function openTheOfficeConversation(): Promise<void> {
  await app.page.evaluate((address) => {
    localStorage.setItem('mole-office.chat.open', 'yes')
    localStorage.setItem('mole-office.chat.with', address)
  }, `agent:${theOfficesOwnIdHere()}`)
  // A RELOAD AND NOT A goto: the page is already at this address, and only a fresh document reads
  // the remembered conversation back out of the store.
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.px-chat-office-notices', { timeout: 20_000 })
  await waitForABlockSaying('A checklist was made for you')
}

/** Put the page at 390 and wait for the redraw. */
async function thePhoneWidth(): Promise<void> {
  await app.page.setViewportSize({ width: 390, height: 844 })
  await theResizeIsDrawn(app.page)
}

beforeAll(async () => {
  app = await liveApp({ name: 'checklist-line-phone', viewport: { width: 1440, height: 1000 } })

  // THE JOINER AND A SECRETARY, registered through the door the product registers agents at.
  const madeJoiner = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ ...THE_JOINER, role: 'worker' }),
  })
  expect(madeJoiner.status, await madeJoiner.clone().text()).toBe(201)
  const joiner = (await madeJoiner.json()) as { agent: { id: string }; whatToGiveIt: { key: string } }
  joinerId = joiner.agent.id
  joinerKey = joiner.whatToGiveIt.key
  const madeSecretary = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ ...THE_SECRETARY, role: 'secretary' }),
  })
  expect(madeSecretary.status, await madeSecretary.clone().text()).toBe(201)
  const secretary = (await madeSecretary.json()) as { agent: { id: string }; whatToGiveIt: { key: string } }
  const asTheJoiner = {
    ...AS_THE_PERSON,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': joinerId,
    'x-mole-office-key': joinerKey,
  }
  const asTheSecretary = {
    ...AS_THE_PERSON,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': secretary.agent.id,
    'x-mole-office-key': secretary.whatToGiveIt.key,
  }

  // A GROUP WITH A LONG-NAMED AGENT, which the person removes, so a long "left the group" line is
  // written. The name is a registry name and nothing cuts it.
  const longAgent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'agent',
      title: THE_LONG_NAME,
      data: { handle: 'made-up-long-name', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(longAgent.status, await longAgent.clone().text()).toBe(201)
  const madeGroup = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      name: THE_GROUP,
      because: 'One line with a long name has to stay one line on a phone.',
      members: [
        { who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, because: 'the person opened it' },
        { who: { kind: 'agent', id: 'made-up-long-name' }, because: 'it has a long name' },
      ],
    }),
  })
  expect(madeGroup.status, await madeGroup.clone().text()).toBe(201)
  const groupId = ((await madeGroup.json()) as { group: { id: string } }).group.id
  const left = await fetch(`${app.api}/api/groups/${groupId}/members/remove`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ who: { kind: 'agent', id: 'made-up-long-name' } }),
  })
  expect(left.status, await left.clone().text()).toBe(200)

  // THE PERSON'S OWN CHECKLIST, made empty by the person so making it says nothing, then an item
  // with words longer than 40 characters added by the joiner, so the line carries the cut at 40.
  const madeList = await fetch(`${app.api}/api/checklists`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ title: 'Made-up kiln checklist' }),
  })
  expect(madeList.status, await madeList.clone().text()).toBe(201)
  personList = ((await madeList.json()) as { checklist: { id: string } }).checklist.id
  const added = await fetch(`${app.api}/api/checklists/${personList}/items`, {
    method: 'POST',
    headers: asTheJoiner,
    body: JSON.stringify({ words: THE_LONG_ITEM }),
  })
  expect(added.status, await added.clone().text()).toBe(201)
  personItem = ((await added.json()) as { item: { id: string } }).item.id

  // THE JOINER'S OWN CHECKLIST, with an item of the same long words.
  const madeOwn = await fetch(`${app.api}/api/checklists`, {
    method: 'POST',
    headers: asTheJoiner,
    body: JSON.stringify({ title: 'Made-up joiner checklist', items: [{ words: THE_LONG_ITEM }] }),
  })
  expect(madeOwn.status, await madeOwn.clone().text()).toBe(201)
  const ownList = ((await madeOwn.json()) as { checklist: { id: string } }).checklist.id
  const readOwn = await fetch(`${app.api}/api/checklists/${ownList}`, { headers: asTheJoiner })
  expect(readOwn.status, await readOwn.clone().text()).toBe(200)
  const ownItemId = (
    (await readOwn.json()) as { checklist: { items: { id: string; words: string }[] } }
  ).checklist.items.find((one) => one.words === THE_LONG_ITEM)?.id
  expect(ownItemId, 'the joiner checklist holds no item with the long words').toBeDefined()
  ownItem = ownItemId as string

  // THE PERSON'S TWO MESSAGES TO THE JOINER, and one done mark on each, on the person's words.
  const say = async (body: string): Promise<string> => {
    const sent = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({ kind: 'message', title: body, data: { body, to: [{ kind: 'agent', id: joinerId }] } }),
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(sent.status, await sent.clone().text()).toBe(409)
    return ((await sent.json()) as { record: { id: string } }).record.id
  }
  const onTheFloor = await say('The kiln room floor is swept and the inspector has gone, so tick that off.')
  const onTheDoor = await say('The shed door is planed as well, tick that one off too.')
  const doneOnThePerson = await fetch(`${app.api}/api/checklists/${personList}/items/${personItem}`, {
    method: 'PATCH',
    headers: asTheJoiner,
    body: JSON.stringify({ state: 'done', onThePersonsWords: onTheFloor }),
  })
  expect(doneOnThePerson.status, await doneOnThePerson.clone().text()).toBe(200)
  const doneOnItsOwn = await fetch(`${app.api}/api/checklists/${ownList}/items/${ownItem}`, {
    method: 'PATCH',
    headers: asTheJoiner,
    body: JSON.stringify({ state: 'done', onThePersonsWords: onTheDoor }),
  })
  expect(doneOnItsOwn.status, await doneOnItsOwn.clone().text()).toBe(200)

  // A SECRETARY MAKES A CHECKLIST FOR THE PERSON with three items, so the office conversation holds
  // "A checklist was made for you: «…», 3 items".
  const madeForThePerson = await fetch(`${app.api}/api/checklists`, {
    method: 'POST',
    headers: asTheSecretary,
    body: JSON.stringify({
      title: THE_SECRETARYS_TITLE,
      ...FOR_THE_PERSON,
      items: [{ words: 'Pack the moulds' }, { words: 'Label the crates' }, { words: 'Book the van' }],
    }),
  })
  expect(madeForThePerson.status, await madeForThePerson.clone().text()).toBe(201)

  // THE LONGEST DONE LINE: an agent with a 57-character name marks an item done on its own
  // checklist, on the person's words, so the person's conversation with it holds the longest line.
  const madeLongest = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ ...THE_LONGEST_NAMED, role: 'worker' }),
  })
  expect(madeLongest.status, await madeLongest.clone().text()).toBe(201)
  const longest = (await madeLongest.json()) as {
    agent: { id: string; name: string }
    whatToGiveIt: { key: string }
  }
  expect(longest.agent.name, 'the registry did not keep the 57-character name').toBe(THE_LONGEST_NAMED.name)
  longestId = longest.agent.id
  const asTheLongest = {
    ...AS_THE_PERSON,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': longestId,
    'x-mole-office-key': longest.whatToGiveIt.key,
  }
  const madeLongestList = await fetch(`${app.api}/api/checklists`, {
    method: 'POST',
    headers: asTheLongest,
    body: JSON.stringify({ title: 'Made-up glazing checklist', items: [{ words: THE_LONGEST_ITEM }] }),
  })
  expect(madeLongestList.status, await madeLongestList.clone().text()).toBe(201)
  const longestList = ((await madeLongestList.json()) as { checklist: { id: string } }).checklist.id
  const readLongest = await fetch(`${app.api}/api/checklists/${longestList}`, { headers: asTheLongest })
  expect(readLongest.status, await readLongest.clone().text()).toBe(200)
  const longestItem = (
    (await readLongest.json()) as { checklist: { items: { id: string; words: string }[] } }
  ).checklist.items.find((one) => one.words === THE_LONGEST_ITEM)?.id
  expect(longestItem, 'the glazing checklist holds no item with the longest words').toBeDefined()
  const toTheLongest = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'message',
      title: 'The floor is swept and the shed is locked.',
      data: { body: 'The floor is swept and the shed is locked.', to: [{ kind: 'agent', id: longestId }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(toTheLongest.status, await toTheLongest.clone().text()).toBe(409)
  const onTheShed = ((await toTheLongest.json()) as { record: { id: string } }).record.id
  const doneOnTheLongest = await fetch(`${app.api}/api/checklists/${longestList}/items/${longestItem as string}`, {
    method: 'PATCH',
    headers: asTheLongest,
    body: JSON.stringify({ state: 'done', onThePersonsWords: onTheShed }),
  })
  expect(doneOnTheLongest.status, await doneOnTheLongest.clone().text()).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
}, 60_000)

describe('a checklist line reads whole on a phone, with no clamp', () => {
  it('1. at 390 the done line naming the joiner\'s checklist reads whole', async () => {
    await openTheConversationWith(joinerId, THE_JOINER_DONE)
    await thePhoneWidth()
    const all = await theBlocksOnScreen()
    const one = theBlockSaying(all, THE_JOINER_DONE)
    expect(one, `the done line naming the joiner's checklist is not drawn: ${whatTheBlockSaw(one)}`).toBeDefined()
    expect(one!.text, whatTheBlockSaw(one)).toContain(THE_LONG_ITEM.slice(0, 39))
    expect(one!.text.endsWith('»'), `the words are cut before their end: ${whatTheBlockSaw(one)}`).toBe(true)
    expect(one!.lines, `it is not more than one line: ${whatTheBlockSaw(one)}`).toBeGreaterThan(1)
    // NOTHING IS HIDDEN, READ WHERE A CLAMP WOULD SIT AS WELL AS ON THE BLOCK. A clamp cuts by
    // putting overflow hidden on the element it is on, so that element, and not the block around it,
    // is the one whose scroll size shows a hidden line. Measured: with a clamp at two, the block read
    // 58 and 58 while the element holding the lines read 51 and 77, so a block-only check cannot see
    // the cut.
    expect(
      one!.scrollHeight,
      `something in it is hidden vertically: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientHeight + 1)
    expect(
      one!.scrollWidth,
      `something in it is hidden sideways: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientWidth + 1)
    expect(
      one!.carrierScrollHeight,
      `a line is hidden inside the element the clamp sits on: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.carrierClientHeight + 1)
    expect(
      one!.carrierScrollWidth,
      `something is hidden sideways inside the element the clamp sits on: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.carrierClientWidth + 1)
  }, 120_000)

  it("2. at 390 the done line on the person's checklist reads whole", async () => {
    await openTheConversationWith(joinerId, THE_JOINER_DONE)
    await thePhoneWidth()
    const all = await theBlocksOnScreen()
    const one = theBlockSaying(all, THE_OWN_DONE)
    expect(one, `the done line on the person's checklist is not drawn: ${whatTheBlockSaw(one)}`).toBeDefined()
    expect(one!.text.endsWith('»'), `the words are cut before their end: ${whatTheBlockSaw(one)}`).toBe(true)
    expect(one!.lines, `it is not more than one line: ${whatTheBlockSaw(one)}`).toBeGreaterThan(1)
    // NOTHING IS HIDDEN, READ WHERE A CLAMP WOULD SIT AS WELL AS ON THE BLOCK. A clamp cuts by
    // putting overflow hidden on the element it is on, so that element, and not the block around it,
    // is the one whose scroll size shows a hidden line. Measured: with a clamp at two, the block read
    // 58 and 58 while the element holding the lines read 51 and 77, so a block-only check cannot see
    // the cut.
    expect(
      one!.scrollHeight,
      `something in it is hidden vertically: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientHeight + 1)
    expect(
      one!.scrollWidth,
      `something in it is hidden sideways: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientWidth + 1)
    expect(
      one!.carrierScrollHeight,
      `a line is hidden inside the element the clamp sits on: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.carrierClientHeight + 1)
    expect(
      one!.carrierScrollWidth,
      `something is hidden sideways inside the element the clamp sits on: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.carrierClientWidth + 1)
  }, 120_000)

  it('3. at 390 the two done lines carry no line clamp, wrap, and say they wrap', async () => {
    await openTheConversationWith(joinerId, THE_JOINER_DONE)
    await thePhoneWidth()
    const all = await theBlocksOnScreen()
    for (const words of [THE_JOINER_DONE, THE_OWN_DONE]) {
      const one = theBlockSaying(all, words)
      expect(one, `the block saying "${words}" is not drawn: ${whatTheBlockSaw(one)}`).toBeDefined()
      expect(
        one!.clampOnTheCarrier,
        `a line clamp is computed on it or inside it: ${whatTheBlockSaw(one)}`,
      ).toBe('none')
      expect(one!.whiteSpace, `the block is not free to wrap: ${whatTheBlockSaw(one)}`).toBe('normal')
      expect(one!.wrapsOnAPhone, `the block does not say it wraps: ${whatTheBlockSaw(one)}`).toBe('yes')
    }
  }, 120_000)

  it('4. guard: every other system line keeps the one-line fold at 390', async () => {
    await openTheGroup()
    await thePhoneWidth()
    const inTheGroup = await theBlocksOnScreen()
    const long = theBlockSaying(inTheGroup, THE_LONG_NAME)
    expect(long, `the long "left the group" line is not drawn: ${whatTheBlockSaw(long)}`).toBeDefined()
    expect(long!.lines, `the long line is not one line: ${whatTheBlockSaw(long)}`).toBe(1)
    expect(long!.whiteSpace, `the long line is free to wrap: ${whatTheBlockSaw(long)}`).toBe('nowrap')
    expect(long!.overflow, `the long line does not hide its end: ${whatTheBlockSaw(long)}`).toBe('hidden')
    expect(long!.wrapsOnAPhone, `the long line says it wraps: ${whatTheBlockSaw(long)}`).toBeNull()

    // AND ANY OTHER OFFICE LINE IN THE PERSON'S CONVERSATION WITH THE JOINER KEEPS THE FOLD TOO. The
    // two done lines are the checklist lines this page is about; every other system block must be one
    // folded line with no attribute. Today this conversation holds no other system block (measured on
    // 17 October 2026), so the long line in the group above is what this case guards with; the loop is
    // here for a line that comes later, and it skips none.
    await openTheConversationWith(joinerId, THE_JOINER_DONE)
    await thePhoneWidth()
    const inTheConversation = await theBlocksOnScreen()
    const others = inTheConversation.filter(
      (one) => !one.text.includes(THE_JOINER_DONE) && !one.text.includes(THE_OWN_DONE),
    )
    for (const one of others) {
      expect(one.lines, `another office line is not one line: ${whatTheBlockSaw(one)}`).toBe(1)
      expect(one.whiteSpace, `another office line is free to wrap: ${whatTheBlockSaw(one)}`).toBe('nowrap')
      expect(one.overflow, `another office line does not hide its end: ${whatTheBlockSaw(one)}`).toBe('hidden')
      expect(one.wrapsOnAPhone, `another office line says it wraps: ${whatTheBlockSaw(one)}`).toBeNull()
    }
  }, 120_000)

  it('5. guard: at 1440 the two done lines carry no clamp and nothing is hidden', async () => {
    await openTheConversationWith(joinerId, THE_JOINER_DONE)
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await theResizeIsDrawn(app.page)
    const all = await theBlocksOnScreen()
    for (const words of [THE_JOINER_DONE, THE_OWN_DONE]) {
      const one = theBlockSaying(all, words)
      expect(one, `the block saying "${words}" is not drawn: ${whatTheBlockSaw(one)}`).toBeDefined()
      expect(
        one!.clampOnTheCarrier,
        `a line clamp is computed at 1440: ${whatTheBlockSaw(one)}`,
      ).toBe('none')
      expect(
        one!.scrollHeight,
        `something in it is hidden vertically at 1440: ${whatTheBlockSaw(one)}`,
      ).toBeLessThanOrEqual(one!.clientHeight + 1)
      expect(
        one!.scrollWidth,
        `something in it is hidden sideways at 1440: ${whatTheBlockSaw(one)}`,
      ).toBeLessThanOrEqual(one!.clientWidth + 1)
    }
  }, 120_000)

  it('6. guard: the office conversation still wraps its lines in full at 390', async () => {
    await openTheOfficeConversation()
    await thePhoneWidth()
    const all = await theBlocksOnScreen()
    const one = theBlockSaying(all, 'A checklist was made for you')
    expect(one, `the "A checklist was made for you" block is not drawn: ${whatTheBlockSaw(one)}`).toBeDefined()
    expect(one!.text, whatTheBlockSaw(one)).toContain(THE_SECRETARYS_TITLE)
    expect(one!.text, `the block does not read to its end: ${whatTheBlockSaw(one)}`).toContain('3 items')
    expect(
      one!.scrollHeight,
      `something in it is hidden vertically: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientHeight + 1)
    expect(
      one!.scrollWidth,
      `something in it is hidden sideways: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientWidth + 1)
  }, 120_000)

  it("7. the wire carries the kind: the done lines name it, the person's own messages carry null", async () => {
    const read = await fetch(
      `${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(joinerId)}&limit=50`,
      { headers: AS_THE_PERSON },
    )
    expect(read.status, await read.clone().text()).toBe(200)
    const held = (await read.json()) as {
      messages: { id: string; body: string; notice?: string | null; sentBy: { kind: string; id: string } | null }[]
    }
    const doneLines = held.messages.filter((one) => one.body.startsWith('Marked done on '))
    expect(
      doneLines.map((one) => one.body),
      'the two done lines are not both in the conversation',
    ).toHaveLength(2)
    for (const one of doneLines) {
      expect(one.notice, `the wire carries no kind on "${one.body}"`).toBe('markedDoneOnAChecklist')
    }
    const mine = held.messages.filter((one) => one.sentBy?.kind === 'person')
    expect(mine.length, 'the person\'s own messages are not in the conversation').toBeGreaterThan(0)
    for (const one of mine) {
      expect('notice' in one, 'the field is missing from a message the person wrote').toBe(true)
      expect(one.notice, `a message the person wrote carries a kind: "${one.body}"`).toBeNull()
    }
  }, 60_000)

  it('8. the office conversation says it is read only', async () => {
    await openTheOfficeConversation()
    const said = await app.page.locator('.px-chat-office-notices').textContent()
    expect(said).toBe(t('chat.officeNotices.readOnly'))
  }, 120_000)

  it('9. at 390 the longest done line reads whole in four or five lines', async () => {
    await openTheConversationWith(longestId, `Marked done on ${THE_LONGEST_NAMED.name}'s checklist`)
    await thePhoneWidth()
    const all = await theBlocksOnScreen()
    const one = theBlockSaying(all, `Marked done on ${THE_LONGEST_NAMED.name}'s checklist`)
    expect(one, `the longest done line is not drawn: ${whatTheBlockSaw(one)}`).toBeDefined()
    // THE ITEM'S NAME READS WHOLE: the line holds the whole agent name and the start of the item, and
    // its closing mark is drawn. The cut at 40 itself is proved in
    // a-change-to-the-persons-checklist-is-one-short-line.test.ts; this case does not ask for it, so
    // that a line made longer than its cut allows is caught by the count of lines below.
    expect(one!.text, `the line does not hold the whole name and the item's start: ${whatTheBlockSaw(one)}`).toContain(
      THE_LONGEST_START,
    )
    expect(one!.text.trimEnd(), `the line's closing mark is not drawn: ${whatTheBlockSaw(one)}`).toMatch(/»$/)
    expect(
      one!.clampOnTheCarrier,
      `a line clamp is computed on it or inside it: ${whatTheBlockSaw(one)}`,
    ).toBe('none')
    expect(one!.wrapsOnAPhone, `the block does not say it wraps: ${whatTheBlockSaw(one)}`).toBe('yes')
    // FOUR OR FIVE LINES, THE COUNT THIS LINE TAKES. Measured at 390 on 17 October 2026: 4 lines, and
    // 5 with a 60-character name, the most a new registry name may be. With the item not cut it took
    // 7. A count over five means something made the line longer than the cut at 40 allows.
    expect(
      [4, 5],
      `the longest done line does not take four or five lines at 390: ${whatTheBlockSaw(one)}`,
    ).toContain(one!.lines)
    expect(
      one!.scrollHeight,
      `something in it is hidden vertically: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientHeight + 1)
    expect(
      one!.scrollWidth,
      `something in it is hidden sideways: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.clientWidth + 1)
    expect(
      one!.carrierScrollHeight,
      `a line is hidden inside the element a clamp would sit on: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.carrierClientHeight + 1)
    expect(
      one!.carrierScrollWidth,
      `something is hidden sideways inside the element a clamp would sit on: ${whatTheBlockSaw(one)}`,
    ).toBeLessThanOrEqual(one!.carrierClientWidth + 1)
  }, 120_000)
})
