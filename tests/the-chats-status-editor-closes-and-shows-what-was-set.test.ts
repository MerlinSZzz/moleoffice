// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STATUS EDITOR UNDER A NAME IN THE CHAT CLOSES, AND A STATUS SET THERE SHOWS.
 *
 * A fault found in the live office (wave 13y round 80): pressing the status line under a name in
 * the chat opened an editor that could not be closed, and a status set there did not show. Now
 * the editor closes by a close button, by Escape and
 * by a click outside it, and a status set there shows under the name at once and after a reload.
 *
 * There are two such editors, and both are held here. One is under the reader's own name at the top
 * of the lists. The other is under the name of the agent whose conversation is open, where the
 * person may write an agent's line (criterion M21).
 *
 * ---------------------------------------------------------------------------------------
 * ESCAPE IS PRESSED WITHOUT CLICKING INTO THE BOX FIRST
 * ---------------------------------------------------------------------------------------
 *
 * That is what a person does: they press the line, see the editor, and press Escape. A test that
 * clicked into the box first would pass on an editor that only listens while its box has the focus,
 * and the panel's own Escape, which closes the whole panel, would take the press instead. So each
 * Escape case also holds that the panel is still open afterwards.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A CLICK OUTSIDE DOES WITH WORDS TYPED, AND WHAT ESCAPE DOES
 * ---------------------------------------------------------------------------------------
 *
 * The secretary's rule, given when the fault was reproduced: a click outside closes the chat's
 * editor and keeps the words typed as a draft, which is in the box when the editor opens again,
 * because a click outside may be a slip. Escape and the close button close it and drop the words,
 * as they always did. The profile's line in Settings has no click-outside close at all; it keeps
 * its leave button and Escape. Its Escape leaves the chat panel open as well, when the panel is open
 * beside Settings, because the panel closes on any Escape nothing else has taken.
 *
 * ---------------------------------------------------------------------------------------
 * THE CROSS AT A PHONE'S WIDTH
 * ---------------------------------------------------------------------------------------
 *
 * The secretary's follow-up to round 80: at 390 wide the cross was about 16 px high, too small for a
 * finger. Its press area is now at least 44 px each way there, and the glyph is not drawn larger. The
 * case presses near a corner of those 44 px, so an area that grew without taking the press would fail.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHARED READING THE LINE IS DRAWN FROM, DRIVEN WITHOUT A PAGE
 * ---------------------------------------------------------------------------------------
 *
 * The line under a name is drawn from one reading of the registries that the chat, the emergencies
 * and the offers share (src/web/lib/oneread.ts). A status did not show because a reading that began
 * before the write was joined and its old answer drawn. The last three cases hold that rule on the
 * shared reading itself, where the order of the calls can be fixed: a reading that began before a
 * change or a write is not joined, and the panels acting on one event still share one reading, so
 * the fix does not make every event cost a request for each panel.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Each case that holds an editor closed first holds that it opened, and each case that holds a
 * status shown first holds that a different one was shown before it. Without that, an editor that
 * never opened would pass every "closed" check, and a line that never changed would pass "shows".
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { STATE_PRESETS } from '../src/shared/participants.ts'
import { t } from '../src/shared/i18n.ts'
import { oneRead, type OneRead } from '../src/web/lib/oneread.ts'
import { markStale } from '../src/web/lib/pagecache.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

const THE_AGENT = { handle: 'bench-builder', name: 'Bench Builder' }

/** How long "at once" may take: one write and one reading of the lists, on a test server. */
const AT_ONCE_MS = 3_000

/** The window the cases run in, and the phone's window the cross is pressed in by a finger. */
const AT_THE_DESK = { width: 1440, height: 1000 }
const A_PHONE = { width: 390, height: 844 }
/** The least a press area a finger presses may measure each way. */
const A_FINGER_PX = 44

/** Where each of the two editors is drawn. */
const MINE = '.px-chat-me'
const THEIRS = '.px-chat-them'
const theStatusPress = (where: string): string => `${where} .px-chat-state, ${where} .px-chat-edit-personal`

async function theStoredState(kind: 'person' | 'agent', id: string): Promise<string | null> {
  const got = await fetch(`${app.api}/api/participants/${kind}/${id}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { participant: { state: string | null } }).participant.state
}

async function writeTheState(kind: 'person' | 'agent', id: string, state: string): Promise<void> {
  const written = await fetch(`${app.api}/api/participants/${kind}/${id}`, {
    method: 'PATCH',
    headers: kind === 'agent' ? asAgent(id) : AS_THE_OWNER,
    body: JSON.stringify({ state }),
  })
  expect(written.status, await written.text()).toBe(200)
}

/** The page from the start, with the panel open on its lists. */
async function openTheLists(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  // THE PANEL OPENS WHERE IT WAS LEFT, which may be a conversation an earlier case left open.
  await app.page.waitForSelector('.px-chat-tabs, .px-chat-back', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector(`${MINE} .px-chat-state`, { timeout: 20_000 })
}

const THE_AGENTS_ROW = `.px-chat-contact:has-text("${THE_AGENT.name}")`

/** The page from the start, with the agent's conversation open. */
async function openTheConversation(): Promise<void> {
  await openTheLists()
  await app.page.click(THE_AGENTS_ROW)
  await app.page.waitForSelector(theStatusPress(THEIRS), { timeout: 20_000 })
}

/** The page's reading of the whole list of participants, which the line under each name is drawn from. */
const theWholeList = (url: URL): boolean => url.pathname === '/api/participants' && url.searchParams.get('shape') === 'page'

/** Press the line under the name, and hold that its editor opened. */
async function openTheEditor(where: string): Promise<void> {
  await app.page.click(theStatusPress(where))
  await app.page.waitForSelector(`${where} .px-chat-state-edit`, { timeout: 10_000 })
}

/** Wait for `promise`, and fail saying `what` if it has not settled within `ms`. */
async function within(promise: Promise<unknown>, ms: number, what: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      promise,
      new Promise((_, refuse) => {
        timer = setTimeout(() => {
          refuse(new Error(what))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Whether the editor under the name has gone, within a short wait. */
async function theEditorHasGone(where: string): Promise<boolean> {
  try {
    await app.page.waitForSelector(`${where} .px-chat-state-edit`, { state: 'detached', timeout: 2_000 })
    return true
  } catch {
    return false
  }
}

/** The status drawn under the name, or null when the line is drawn empty. */
async function theLineShown(where: string): Promise<string | null> {
  const said = await app.page.$(`${where} .px-chat-state .px-chat-said-state`)
  return said === null ? null : said.textContent()
}

/** Wait until the line under the name says `words`, and answer how long that took, or null if it never did. */
async function msUntilTheLineSays(where: string, words: string, within: number): Promise<number | null> {
  const from = Date.now()
  try {
    await app.page.waitForFunction(
      ([at, expected]) => document.querySelector(`${at} .px-chat-state .px-chat-said-state`)?.textContent === expected,
      [where, words] as const,
      { timeout: within },
    )
    return Date.now() - from
  } catch {
    return null
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'chats-status-editor', viewport: AT_THE_DESK })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: THE_AGENT.name,
      data: { handle: THE_AGENT.handle, runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  // ONE MESSAGE FROM THE AGENT, so it is a contact the panel draws.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(THE_AGENT.handle),
    body: JSON.stringify({
      kind: 'message',
      title: 'from the bench builder',
      data: { body: 'The bench is level.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

for (const [which, where, open, kind, id] of [
  ['the editor under the reader’s own name', MINE, openTheLists, 'person', THE_PERSON],
  ['the editor under the agent’s name in its conversation', THEIRS, openTheConversation, 'agent', THE_AGENT.handle],
] as const) {
  describe(which, () => {
    it('closes by its close button', async () => {
      await open()
      await openTheEditor(where)
      const close = await app.page.$(`${where} .px-chat-state-edit button[aria-label="${CHAT_WORDS.stopEditing}"]`)
      expect(close, 'the editor has no close button').not.toBeNull()
      await close?.click()
      expect(await theEditorHasGone(where), 'the close button left the editor open').toBe(true)
    }, 120_000)

    it('closes by a finger at 390 wide: the cross is pressed anywhere in 44 px each way, and its glyph is drawn no larger', async () => {
      const cross = `${where} .px-chat-stop-editing`
      const fontSize = (): Promise<string> => app.page.$eval(cross, (el) => getComputedStyle(el).fontSize)
      // THE CONTROL: the glyph's size at the desk, where nothing is pressed by a finger.
      await open()
      await openTheEditor(where)
      const atTheDesk = await fontSize()
      await app.page.setViewportSize(A_PHONE)
      try {
        await open()
        await openTheEditor(where)
        const area = await app.page.$eval(cross, (el) => {
          const r = el.getBoundingClientRect()
          return { width: r.width, height: r.height, x: r.x + r.width / 2, y: r.y + r.height / 2 }
        })
        expect(
          { wide: area.width >= A_FINGER_PX, tall: area.height >= A_FINGER_PX },
          `the cross is pressed in ${String(area.width)} by ${String(area.height)} px`,
        ).toEqual({ wide: true, tall: true })
        expect(await fontSize(), 'the glyph was drawn larger with its press area').toBe(atTheDesk)
        // A PRESS NEAR THE CORNER OF THOSE 44 PX lands on the cross and closes the editor, and not on the box beside it.
        await app.page.mouse.click(area.x - A_FINGER_PX / 2 + 2, area.y - A_FINGER_PX / 2 + 2)
        expect(await theEditorHasGone(where), 'a press near the corner of the cross’s area left the editor open').toBe(true)
      } finally {
        await app.page.setViewportSize(AT_THE_DESK)
      }
    }, 120_000)

    it('closes by Escape, pressed without clicking into the box, and the panel stays open', async () => {
      await open()
      await openTheEditor(where)
      // THE PRESS GOES WHERE THE FOCUS IS AFTER THE LINE WAS PRESSED, which is what a person's press does.
      await app.page.keyboard.press('Escape')
      expect(await app.page.$('.px-chat'), 'Escape closed the whole panel').not.toBeNull()
      expect(await theEditorHasGone(where), 'Escape left the editor open').toBe(true)
    }, 120_000)

    it('closes by a click outside it, on the name above it', async () => {
      await open()
      await openTheEditor(where)
      await app.page.click(`${where} .px-chat-name`)
      expect(await theEditorHasGone(where), 'a click outside the editor left it open').toBe(true)
    }, 120_000)

    it('keeps words typed there as a draft when a click outside closes it, and offers them when it opens again', async () => {
      // THE OWNER'S WORDS ARE NOT THROWN AWAY BY A CLICK THAT MAY HAVE BEEN A SLIP. A click outside
      // closes the editor without writing anything, and the words come back when the editor opens.
      await writeTheState(kind, id, 'clamping the frame')
      await open()
      expect(await theLineShown(where)).toBe('clamping the frame')
      await openTheEditor(where)
      await app.page.fill(`${where} .px-chat-state-box`, 'half a thought')
      await app.page.click(`${where} .px-chat-name`)
      expect(await theEditorHasGone(where), 'a click outside the editor left it open').toBe(true)
      expect(await theLineShown(where), 'a click outside wrote the words typed').toBe('clamping the frame')
      expect(await theStoredState(kind, id)).toBe('clamping the frame')
      await openTheEditor(where)
      expect(await app.page.inputValue(`${where} .px-chat-state-box`), 'the words typed before the click outside were dropped').toBe(
        'half a thought',
      )
    }, 120_000)

    it('drops words typed there when Escape closes it, and the panel stays open', async () => {
      // ESCAPE PRESSED IN THE BOX, which the case above presses without the focus there. The box's
      // own press used to close the editor and then the whole panel as well.
      await writeTheState(kind, id, 'clamping the frame')
      await open()
      await openTheEditor(where)
      await app.page.fill(`${where} .px-chat-state-box`, 'never meant')
      await app.page.press(`${where} .px-chat-state-box`, 'Escape')
      expect(await app.page.$('.px-chat'), 'Escape in the box closed the whole panel').not.toBeNull()
      expect(await theEditorHasGone(where), 'Escape in the box left the editor open').toBe(true)
      await openTheEditor(where)
      expect(await app.page.inputValue(`${where} .px-chat-state-box`), 'Escape kept the words typed').toBe('clamping the frame')
      expect(await theStoredState(kind, id)).toBe('clamping the frame')
    }, 120_000)

    it('shows a status picked there under the name at once, and again after a reload', async () => {
      // THE CONTROL: a different status is shown first, so "shows" below is a change.
      await writeTheState(kind, id, 'sanding the legs')
      await open()
      expect(await theLineShown(where)).toBe('sanding the legs')

      const preset = STATE_PRESETS[1]
      await openTheEditor(where)
      await app.page.click(`${where} .px-chat-preset:has-text("${t(`chat.preset.${preset}`)}")`)
      const took = await msUntilTheLineSays(where, preset, AT_ONCE_MS)
      expect(took, `the status picked did not show within ${String(AT_ONCE_MS)} ms`).not.toBeNull()
      expect(await theEditorHasGone(where), 'the editor stayed open after a status was picked').toBe(true)
      expect(await theStoredState(kind, id)).toBe(preset)

      await open()
      expect(await theLineShown(where), 'after a reload the line does not show the status set').toBe(preset)
    }, 120_000)

    it('keeps a status picked there when a reading of the whole list began before the write and answers after it', async () => {
      // WHAT A BUSY OFFICE DOES. Every few seconds something makes the page read the whole list
      // again, and that reading takes a while when the list is long, so one is often on its way when
      // the person sets a status. The reading asked for after the write must not be that one, whose
      // answer is from before the write. Here the server's answer to the first reading is fetched at
      // once, so it is from before the write, and handed to the page only after the write has landed.
      await writeTheState(kind, id, 'planing the edge')
      await open()
      let release = (): void => undefined
      const released = new Promise<void>((done) => {
        release = done
      })
      let seen = (): void => undefined
      const heldBack = new Promise<void>((done) => {
        seen = done
      })
      let holding = true
      await app.page.route(theWholeList, async (route) => {
        if (!holding) {
          await route.fallback()
          return
        }
        holding = false
        const answer = await route.fetch()
        seen()
        await released
        await route.fulfill({ response: answer })
      })
      try {
        // A READING OF THE WHOLE LIST BEGINS: opening the panel asks for one.
        await app.page.click('.px-chat-close')
        await openTheChat(app.page)
        await within(heldBack, 20_000, 'opening the panel asked for no reading of the whole list')
        await app.page.waitForSelector('.px-chat-tabs, .px-chat-back', { timeout: 20_000 })
        const onTheLists = (await app.page.$('.px-chat-back')) === null
        if (where === MINE && !onTheLists) await app.page.click('.px-chat-back')
        if (where === THEIRS && onTheLists) await app.page.click(THE_AGENTS_ROW)
        await app.page.waitForSelector(`${where} .px-chat-state`, { timeout: 20_000 })
        expect(await theLineShown(where)).toBe('planing the edge')

        const preset = STATE_PRESETS[0]
        await openTheEditor(where)
        const written = app.page.waitForResponse(
          (one) => one.request().method() === 'PATCH' && one.url().includes(`/api/participants/${kind}/`),
        )
        await app.page.click(`${where} .px-chat-preset:has-text("${t(`chat.preset.${preset}`)}")`)
        expect((await written).status()).toBe(200)
        // THE EVENT FOR THE WRITE has the time to arrive and be drawn before the old reading answers.
        await app.page.waitForTimeout(1_500)
        const delivered = app.page.waitForResponse((one) => theWholeList(new URL(one.url())))
        release()
        await delivered
        await app.page.waitForTimeout(1_500)
        expect(await theLineShown(where), 'a reading that began before the write put the old status back').toBe(preset)
      } finally {
        release()
        await app.page.unroute(theWholeList)
      }
    }, 120_000)

    it('shows a status typed there under the name at once', async () => {
      await writeTheState(kind, id, 'gluing the top')
      await open()
      expect(await theLineShown(where)).toBe('gluing the top')

      await openTheEditor(where)
      await app.page.fill(`${where} .px-chat-state-box`, 'waiting for the glue')
      await app.page.press(`${where} .px-chat-state-box`, 'Enter')
      expect(await msUntilTheLineSays(where, 'waiting for the glue', AT_ONCE_MS)).not.toBeNull()
      expect(await theStoredState(kind, id)).toBe('waiting for the glue')
    }, 120_000)
  })
}

describe('the status line on the reader’s own profile in Settings', () => {
  const LINE = '.app-line[data-line="status"]'

  async function openTheProfile(): Promise<void> {
    // A FRESH PAGE, not a change of the address's hash, which would keep a line an earlier case left open.
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}#/settings`)
    await waitForThePage(app.page, 30_000)
    await openSettingsPanel(app.page, 'settings.appearance')
    await app.page.waitForSelector(`${LINE} .app-pencil`, { timeout: 20_000 })
  }

  it('shows a status picked and kept there at once, and again after a reload', async () => {
    await writeTheState('person', THE_PERSON, 'oiling the top')
    await openTheProfile()
    expect(await app.page.textContent(`${LINE} .app-value`)).toBe('oiling the top')
    await app.page.click(`${LINE} .app-pencil`)
    await app.page.click(`${LINE} .app-presets button:has-text("${t('chat.preset.away')}")`)
    await app.page.click(`${LINE} .app-keep`)
    await app.page.waitForFunction(
      (at) => document.querySelector(`${at} .app-value`)?.textContent === 'away',
      LINE,
      { timeout: AT_ONCE_MS },
    )
    expect(await theStoredState('person', THE_PERSON)).toBe('away')
    await openTheProfile()
    expect(await app.page.textContent(`${LINE} .app-value`)).toBe('away')
  }, 120_000)

  it('closes by Escape after a preset was pressed, and by its leave button', async () => {
    await openTheProfile()
    await app.page.click(`${LINE} .app-pencil`)
    await app.page.click(`${LINE} .app-presets button:has-text("${t('chat.preset.working')}")`)
    await app.page.keyboard.press('Escape')
    expect(await app.page.$(`${LINE}.app-editing`), 'Escape left the profile line open').toBeNull()
    await app.page.click(`${LINE} .app-pencil`)
    await app.page.click(`${LINE} .app-leave`)
    expect(await app.page.$(`${LINE}.app-editing`), 'the leave button left the profile line open').toBeNull()
  }, 120_000)

  it('closes by Escape in its box and leaves the chat panel open beside it', async () => {
    await openTheProfile()
    await openTheChat(app.page)
    await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
    await app.page.click(`${LINE} .app-pencil`)
    await app.page.waitForSelector(`${LINE}.app-editing`)
    await app.page.press(`${LINE} .app-box`, 'Escape')
    expect(await app.page.$(`${LINE}.app-editing`), 'Escape left the profile line open').toBeNull()
    expect(await app.page.$('.px-chat'), 'Escape on the profile line closed the chat panel as well').not.toBeNull()
  }, 120_000)

  it('stays open on a click outside it, with the words typed still there', async () => {
    // NO CLICK-OUTSIDE CLOSE HERE, by the secretary's choice: the line has its leave button and
    // Escape, and a click outside never throws away a half-typed status.
    await openTheProfile()
    await app.page.click(`${LINE} .app-pencil`)
    await app.page.fill(`${LINE} .app-box`, 'half a thought')
    await app.page.click('.app-line[data-line="name"] .app-label')
    expect(await app.page.$(`${LINE}.app-editing`), 'a click outside closed the profile line').not.toBeNull()
    expect(await app.page.inputValue(`${LINE} .app-box`)).toBe('half a thought')
  }, 120_000)
})

describe('the shared reading of the registries the line is drawn from', () => {
  /** A reading whose answers the case hands over one at a time, oldest first, and which counts how often it was asked. */
  function aHeldReading(): { read: OneRead<{ answer: number }>; asked: () => number; answerTheOldest: () => void } {
    const waiting: (() => void)[] = []
    let asked = 0
    const read = oneRead(
      () => {
        asked += 1
        const answer = asked
        return new Promise<{ answer: number }>((done) => {
          waiting.push(() => {
            done({ answer })
          })
        })
      },
      () => 'one project',
    )
    return {
      read,
      asked: () => asked,
      answerTheOldest: () => {
        const next = waiting.shift()
        expect(next, 'no reading was waiting for its answer').toBeDefined()
        next?.()
      },
    }
  }

  /** The panels' burst readers each run on a timer of their own, so their calls come in separate tasks. */
  const theNextTask = (): Promise<void> =>
    new Promise((done) => {
      setTimeout(done, 0)
    })

  it('asks once when the panels acting on one event each ask again', async () => {
    const held = aHeldReading()
    // THE EVENT, marked before any panel hears it, as the chat's module marks every event it draws.
    markStale([])
    const calls = [held.read.again()]
    await theNextTask()
    calls.push(held.read.again())
    await theNextTask()
    calls.push(held.read.again())
    held.answerTheOldest()
    await theNextTask()
    expect(held.asked(), 'the panels acting on one event did not share one reading').toBe(1)
    expect((await Promise.all(calls)).map((one) => one.answer)).toEqual([1, 1, 1])
  }, 20_000)

  it('waits for a reading that began before a change, asks once more, and the calls after the change share that one', async () => {
    const held = aHeldReading()
    const before = held.read.again()
    // A PANEL THAT WAS WAITING FOR THE OLD READING looks at what is held the moment it answers.
    let heldWhenTheOldReadingAnswered: unknown = 'nothing looked'
    void before.then(() => {
      heldWhenTheOldReadingAnswered = held.read.held()
    })
    markStale([])
    const after = [held.read.again()]
    await theNextTask()
    after.push(held.read.again())
    const askedPlainlyWhileTheOldReadingWasOnItsWay = held.read()
    held.answerTheOldest()
    expect((await before).answer).toBe(1)
    expect(heldWhenTheOldReadingAnswered, 'the answer from before the change was offered as the one held as it came').toBeUndefined()
    expect(held.read.held(), 'the answer from before the change was offered as the one held').toBeUndefined()
    const askedPlainlyAfterIt = held.read()
    await theNextTask()
    expect(held.asked(), 'a call after the change was handed the reading from before it').toBe(2)
    held.answerTheOldest()
    expect((await Promise.all(after)).map((one) => one.answer)).toEqual([2, 2])
    expect(
      (await askedPlainlyWhileTheOldReadingWasOnItsWay).answer,
      'a plain call after the change was handed the reading on its way from before it',
    ).toBe(2)
    expect((await askedPlainlyAfterIt).answer, 'a plain call after the change was handed the answer from before it').toBe(2)
    expect(held.asked()).toBe(2)
  }, 20_000)

  it('waits for a reading that began before this page wrote, and asks once more', async () => {
    const held = aHeldReading()
    const before = held.read.again()
    held.read.written()
    const after = held.read.again()
    held.answerTheOldest()
    expect((await before).answer).toBe(1)
    await theNextTask()
    expect(held.asked(), 'the reading after the write was the one that began before it').toBe(2)
    held.answerTheOldest()
    expect((await after).answer).toBe(2)
  }, 20_000)
})
