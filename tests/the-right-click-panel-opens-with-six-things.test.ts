// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RIGHT-CLICK PANEL OPENS WITH SIX THINGS, KEEPS THE REST BEHIND MORE, AND KEEPS SEND ON SCREEN.
 *
 * Problem EjkW5flkNFqf, and the choice from report YHHSdOGpEZWR, blocks b-8 and b-9, that a decision
 * made. In a test office of its own, with made-up records, this file proves in Chromium:
 *
 *   1. At open the panel draws six things: the quote bar, ✕, the text box, To, Send with Start
 *      review (which shape B put where Save without sending was), and More. The title, "Met under …", the standing refusal line, Organise,
 *      "Take me there with …" and the agents nobody answers for are not drawn.
 *   2. More holds Organise, "Take me there with …" and one line with the count of agents nobody
 *      answers for. Their list opens only when that line is pressed. Test change (wave 13y round 167, point QN-2 of
 *      the quick notes): More also holds New quick note, beside Organise, because the panel opens with six things.
 *      Test change (the same round, point QN-5): after New quick note, More holds Add to note and Add to a new note.
 *      Test change (wave 13y round 169, point RC-1 of the right-click box): the three note entries leave More, because
 *      Send now chooses between a contact and a note. At open, To draws that choice, Contact and Note, before the
 *      contact press, with Contact chosen. More is read by the presses it holds, and the case waits until those presses
 *      are drawn, not only until its last line is. Test change (the same round, point RC-4): Organise leaves More,
 *      because nothing done in it reaches anyone. More holds "Take me there with …" and the line with the count.
 *      Test change (wave 13y round 175, point CK-1 of the right-click box): the head draws Copy after the quote bar
 *      and before the pin, because the box copies the selected words or the text of the thing it is about.
 *   3. The contacts are the chat's contacts as a short list: one row each, a filter box, no group
 *      headings, no New and no Edit. The filter narrows by name and an empty answer is the short
 *      mark. Choosing a row sets To.
 *   4. Send stays inside the window at 390, and at 1440 when the panel is opened near the window's
 *      foot and the contact list is opened.
 *
 * The three runs of each test (control, mutation, restore) are in the commit that added this file.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { CANNOT_REACH_WORDS } from '../src/shared/messages.ts'

let app: LiveApp
let page: Page
let reportId = ''
/** Every id and handle this office holds, which the never-show scan looks for in the panel. */
const machineWords: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function write(headers: Record<string, string>, body: unknown): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text).toBe(theAnswerToAWriteInATestOffice(headers, body))
  const id = (JSON.parse(text) as { record: { id: string } }).record.id
  machineWords.push(id)
  return id
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Wait for the panel itself: its reviews read, and the quote bar holding the words it was opened on. */
async function waitForThePanelDrawn(): Promise<void> {
  await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const quote = document.querySelector<HTMLElement>('.px-talk .px-talk-quote')
      return quote !== null && (quote.innerText ?? '').trim() !== ''
    },
    null,
    { timeout: 20_000 },
  )
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'talk-six-things', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const handles = ['calib-agent', 'codex-bench', 'review-agent', 'wiring-agent']
  machineWords.push(...handles)
  for (const [title, handle] of [
    ['Calibration agent', 'calib-agent'],
    ['Codex on the far bench', 'codex-bench'],
    ['Review agent', 'review-agent'],
    ['Wiring agent', 'wiring-agent'],
  ] as const) {
    await write(AS_THE_PERSON, { kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
    agents: { id: string; handle: string }[]
  }).agents
  machineWords.push(...agents.map((one) => one.id))
  const idOf = (h: string) => agents.find((one) => one.handle === h)?.id ?? ''
  reportId = await write(AS_THE_PERSON, {
    kind: 'report',
    title: 'What the second calibration run showed',
    data: {
      for: 'Robin Vale',
      date: '2026-09-27',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount holds calibration through a full handover.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The mast is the part that moved. Nothing was re-machined between the two runs.' },
      ],
    },
  })
  for (const title of ['The mast clamp slips after a handover', 'The second camera drops frames', 'The depth map has a hole']) {
    await write(AS_THE_PERSON, { kind: 'problem', title, data: { state: 'open', symptom: `${title}.` } })
  }
  // AN AGENT OFFERS TO TAKE THE PERSON TO THE REPORT, so More draws "Take me there with …".
  await write(AS('calib-agent'), {
    kind: 'message',
    title: 'The second run is written up',
    data: {
      body: 'I wrote up the second run. Shall I take you to the report?',
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
    },
  })
  for (const handle of ['review-agent', 'wiring-agent']) {
    await write(AS(handle), {
      kind: 'message',
      title: 'A note',
      data: { body: 'The harness for the second arm is labelled now.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
  }
  // A MESSAGE NOTHING HAS TAKEN, to an agent nothing answers as: one agent nobody answers for.
  await write(AS_THE_PERSON, {
    kind: 'message',
    title: 'Can you read the logs',
    data: { body: 'Can you read the bench logs for me?', to: [{ kind: 'agent', id: idOf('codex-bench') }] },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open a page fresh, in a language when one is named, with no panel left over. */
async function go(hash: string, lang = ''): Promise<void> {
  await page.goto(`${app.site}/${lang === '' ? '' : `?lang=${lang}`}#${hash}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Select words of the report's second paragraph and right-click them. */
async function openOnWords(lang = ''): Promise<void> {
  await go(`/r/${reportId}`, lang)
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await page.locator(run).waitFor({ timeout: 30_000 })
  await page.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 31)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.px-talk').waitFor({ timeout: 20_000 })
  await waitForThePanelDrawn()
}

/** Right-click a row of the records list, scrolled so the pointer lands at `y` in the window. */
async function openOnARowAt(y: number): Promise<void> {
  await go('/records')
  const row = page.locator('main [data-target^="record"]', { hasText: 'The mast clamp slips' }).first()
  await row.waitFor({ timeout: 30_000 })
  await row.evaluate((el, wanted) => {
    el.scrollIntoView({ block: 'center' })
    window.scrollBy(0, el.getBoundingClientRect().top - wanted)
  }, y)
  // THE SCROLL IS THE THING TO WAIT FOR, and two frames are enough for the page to draw where it was moved.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const box = await row.boundingBox()
  if (box === null) throw new Error('the row is not drawn')
  await page.mouse.click(box.x + 40, box.y + Math.min(12, box.height / 2), { button: 'right' })
  await page.locator('.px-talk').waitFor({ timeout: 20_000 })
  await waitForThePanelDrawn()
}

/** The labels of the presses the panel draws where a person can see them, in order. */
async function visiblePresses(): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.px-talk button')]
      .filter((one) => one.offsetParent !== null)
      .map((one) => (one.getAttribute('aria-label') ?? one.innerText).replace(/\s+/g, ' ').trim()),
  )
}

describe('at open', () => {
  it('draws the six things and nothing that moved behind More or went away', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openOnWords()
    const read = await page.evaluate(() => {
      const talk = document.querySelector<HTMLElement>('.px-talk')
      if (talk === null) throw new Error('no panel')
      const quote = talk.querySelector<HTMLElement>('.px-talk-head .px-talk-quote')
      return {
        quote: quote === null ? null : quote.innerText.replace(/\s+/g, ' ').trim(),
        quoteIsTheChatsBlock: quote?.classList.contains('px-chat-quote') ?? false,
        box: talk.querySelectorAll('textarea').length,
        title: talk.querySelectorAll('.px-talk-title').length,
        met: talk.querySelectorAll('.px-talk-drawn').length,
        refusal: talk.querySelectorAll('.px-talk-refusal').length,
        offer: talk.querySelectorAll('.px-talk-offer').length,
        notes: [...talk.querySelectorAll<HTMLElement>('.px-talk-note')].map((one) => one.innerText),
        name: talk.getAttribute('aria-label'),
      }
    })
    expect(read.quote).toBe('Paragraph “The mast is the part that moved”')
    expect(read.quoteIsTheChatsBlock).toBe(true)
    expect(read.box).toBe(1)
    expect(await visiblePresses()).toEqual([
      'Copy',
      'Pin this box open',
      'Close',
      t('talk.sendTo.contact'),
      t('talk.sendTo.note'),
      'Choose a contact ▾',
      'Send',
      'Start review',
      'More ▾',
    ])
    expect(await page.locator('.px-talk [role="radio"][aria-checked="true"]').getAttribute('data-send-to'), 'what Send goes to at open').toBe('contact')
    expect(read.title, 'the heading is gone').toBe(0)
    expect(read.met, '"Met under …" is gone').toBe(0)
    expect(read.refusal, 'no refusal line at open').toBe(0)
    expect(read.offer).toBe(0)
    expect(read.notes).toEqual([])
    expect(read.name, 'the dialog keeps a name for a screen reader').toBe('Talk about this')
    // TYPING DRAWS NO "KEPT HERE" LINE; THE ONE REFUSAL LEFT IS THAT NOBODY IS CHOSEN.
    await page.locator('.px-talk textarea').fill('Check how the mast is clamped.')
    await sleep(300)
    expect(await page.locator('.px-talk .px-talk-note').count()).toBe(0)
    expect(await page.locator('.px-talk .px-talk-refusal').innerText()).toBe(t('talk.sayWhoFirst'))
    await page.keyboard.press('Escape')
  }, 180_000)
})

describe('More', () => {
  it('holds Take me there and one line with a count, and the list opens on a press', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openOnWords()
    await page.locator('.px-talk textarea').fill('Check how the mast is clamped.')
    await page.locator('.px-talk-more-btn').click()
    // MORE'S PARTS READ THE OFFICE AND DRAW THEIR ROWS AT DIFFERENT TIMES, so the case waits for the presses it expects
    // and not for the last line alone.
    const thePressesInMore = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.px-talk .px-talk-more button')]
          .filter((one) => one.offsetParent !== null)
          .map((one) => (one.getAttribute('aria-label') ?? one.innerText).replace(/\s+/g, ' ').trim()),
      )
    await expect
      .poll(thePressesInMore, { timeout: 20_000 })
      .toEqual([
        t('chatEnglish.lead.followWith', { agent: 'Calibration agent' }),
        `${t('talk.startANewAgentFor')} ${t('talk.notAnswering', { n: 1 })}`,
      ])
    const listShown = () =>
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.px-talk .px-start-agent-here')
        return list !== null && list.offsetParent !== null ? list.innerText.replace(/\s+/g, ' ').trim() : null
      })
    expect(await listShown(), 'the list waits for its press').toBeNull()
    await page.locator('.px-talk-more-line').click()
    await sleep(300)
    expect(await listShown()).toBe(`${CANNOT_REACH_WORDS.noneOfTheseIsAnswering} Codex on the far bench ${t('chatLive.startANewAgent')}`)
    await page.keyboard.press('Escape')
  }, 180_000)
})

describe('the contacts', () => {
  it('are the chat contacts as a short list with a filter, and a row sets To', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openOnWords()
    await page.locator('.px-talk-to-btn').click()
    await page.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
    const reply = (await (await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_PERSON })).json()) as {
      contacts: { key: string; group: string }[]
      contactGroups: { key: string }[]
    }
    const theChats = reply.contacts
      .filter((line) => reply.contactGroups.some((group) => group.key === line.group))
      .map((line) => line.key)
      .sort()
    const read = () =>
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.px-talk-chooser')
        if (list === null) throw new Error('no list')
        return {
          keys: [...list.querySelectorAll<HTMLElement>('.px-talk-contact')].map((one) => one.dataset['contact'] ?? ''),
          names: [...list.querySelectorAll<HTMLElement>('.px-talk-contact')].map((one) => one.innerText.trim()),
          headings: list.querySelectorAll('h3, h4, .px-chat-top-heading, .px-chat-group-name').length,
          newOrEdit: list.querySelectorAll('.px-chat-new-agent, .px-chat-edit, .px-chat-new-agent-placeholder').length,
          filter: list.querySelectorAll('input[type="search"]').length,
          // WHAT IS DRAWN, WITHOUT THE WORDS KEPT FOR A SCREEN READER.
          mark: [...list.querySelectorAll<HTMLElement>('.px-absent')].map((one) =>
            [...one.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim(),
          ),
        }
      })
    const open = await read()
    expect([...open.keys].sort()).toEqual(theChats)
    expect(open.names).toContain('Wiring agent')
    expect(open.headings).toBe(0)
    expect(open.newOrEdit).toBe(0)
    expect(open.filter).toBe(1)
    await page.locator('.px-talk-filter').fill('wiring')
    await sleep(200)
    expect((await read()).names).toEqual(['Wiring agent'])
    // THE EMPTY SCAN: nothing matching is the short mark, not a sentence.
    await page.locator('.px-talk-filter').fill('zzzz')
    await sleep(200)
    const none = await read()
    expect(none.names).toEqual([])
    expect(none.mark).toEqual(['—'])
    await page.locator('.px-talk-filter').fill('wiring')
    await page.locator('.px-talk-contact', { hasText: 'Wiring agent' }).click()
    await sleep(300)
    expect(await page.locator('.px-talk-chooser').count(), 'the list closes on a choice').toBe(0)
    expect((await page.locator('.px-talk-to-btn').innerText()).replace(/\s+/g, ' ').trim()).toBe('Wiring agent ▾')
    await page.keyboard.press('Escape')
  }, 180_000)
})

describe('Send stays on screen', () => {
  /** Where Send and the panel are, against the window. */
  const whereSendIs = () =>
    page.evaluate(() => {
      const talk = document.querySelector<HTMLElement>('.px-talk')
      const send = [...document.querySelectorAll<HTMLElement>('.px-talk .px-talk-do .px-btn')][0]
      if (talk === null || send === undefined) throw new Error('no panel or no Send')
      const t = talk.getBoundingClientRect()
      const s = send.getBoundingClientRect()
      return { top: t.top, bottom: t.bottom, sendTop: s.top, sendBottom: s.bottom, window: window.innerHeight }
    })

  for (const [width, height, y] of [
    [390, 844, 600],
    [1440, 1000, 940],
  ] as const) {
    it(`at ${String(width)}, opened low in the window, with More and the contact list open`, async () => {
      await page.setViewportSize({ width, height })
      await openOnARowAt(y)
      const inside = async (what: string) => {
        const at = await whereSendIs()
        const said = `${what}: ${JSON.stringify(at)}`
        expect(at.top, said).toBeGreaterThanOrEqual(0)
        expect(at.bottom, said).toBeLessThanOrEqual(at.window)
        expect(at.sendBottom, said).toBeLessThanOrEqual(at.window)
      }
      await inside('at open')
      // MORE GROWS THE PANEL TWICE: once when it opens, and again when its parts have read the
      // office and draw their rows, which is the growth problem EjkW5flkNFqf was about.
      await page.locator('.px-talk-more-btn').click()
      await page.locator('.px-talk-more-line').waitFor({ timeout: 20_000 })
      await sleep(1000)
      await inside('with More open')
      await page.locator('.px-talk-to-btn').click()
      await page.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
      await sleep(1000)
      await inside('with More and the contacts open')
      await page.keyboard.press('Escape')
    }, 180_000)
  }
})

