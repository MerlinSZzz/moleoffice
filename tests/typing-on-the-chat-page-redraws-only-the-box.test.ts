// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPING ON THE CHAT PAGE REDRAWS THE BOX, AND NOT THE LISTS OR THE CONVERSATION BESIDE IT.
 *
 * Problem VovNhzVWkNOl: typing in the chat page's text box lagged a little behind the keys, while
 * typing in the corner chat on any other page did not. The page draws the lists and the open
 * conversation side by side; the corner draws one at a time.
 *
 * WHAT THIS FILE DOES. In a test office with made-up agents and a long made-up conversation, it
 * types one line into the box on the chat page, and then the same line into the corner chat on
 * Home. For each key it counts which components React drew again, and where on the page each one
 * sits: in the lists, in the conversation, in the box, or elsewhere. It also measures how long each
 * key press took to reach the screen, with the browser's own event timing. The test fails if a key
 * press on the page draws anything in the lists or in the conversation again.
 *
 * NOTHING ELSE IS DRAWING WHEN THE KEYS ARE COUNTED. The person has read the conversation already,
 * so opening it marks nothing as seen. Before the first key, the test waits until the page has had
 * an answer to every request it started. A late answer draws the lists and the conversation again,
 * and that redraw would be counted against whichever key it landed in.
 *
 * HOW IT COUNTS. React calls `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` after every commit
 * when a developer tool is installed, in the built page as in the development one. The hook is put
 * on the window before the page's own code runs. After each commit it walks React's tree. A
 * component drew again in this commit when React marked it as having done work, and the object React
 * holds for it is not the one it held at the previous commit. A component React skipped keeps the
 * same object, and so it is not counted. This is how React's own developer tool tells the two apart.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API on a port of its own with a database of its own;
 * nothing here reaches the owner's server.
 */

import type { Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** The made-up agents on the contact list. The first is the one the conversation is with. */
const AGENTS = ['Wren', 'Moss', 'Fern', 'Sorrel', 'Tansy', 'Yarrow', 'Burdock', 'Teasel'].map((name) => ({
  name: `${name} Agent`,
  handle: `${name.toLowerCase()}-agent`,
}))
const TALKING_TO = AGENTS[0]!

/** How many messages the open conversation holds. A long one, as the owner's are. */
const MESSAGES = 120

/** The line typed, one key at a time. */
const THE_LINE = 'the bench camera drifts after lunch'

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return ((await made.json()) as { record: { id: string } }).record.id
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** The page's own channel stays open as long as the page does, so it is never waited for. */
const THE_EVENT_STREAM = '/api/events'

/** How long the page may take to answer every request it started, before the test fails and names them. */
const ANSWERED_WITHIN_MS = 30_000

/** Every request the page has started and not yet had answered, apart from the event stream. */
const onTheirWay = new Map<Request, string>()

/**
 * WAIT UNTIL NO REQUEST THE PAGE STARTED IS STILL ON ITS WAY, and until the page has drawn the last
 * answer. An answer that lands while the keys are counted draws the lists and the conversation again,
 * and that redraw would be counted against a key. A request the drawing starts is waited for in turn.
 * After the time above the test fails, and says which requests were still on their way.
 */
async function untilEveryRequestIsAnswered(): Promise<void> {
  const { page } = app
  const until = Date.now() + ANSWERED_WITHIN_MS
  for (;;) {
    if (onTheirWay.size === 0) {
      // THE LAST ANSWER IS DRAWN two frames later, and whatever that drawing starts has started by then.
      await page.evaluate(
        () => new Promise<void>((drawn) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(drawn, 0)))),
      )
      if (onTheirWay.size === 0) return
    }
    if (Date.now() > until) {
      throw new Error(`after ${String(ANSWERED_WITHIN_MS)} ms the page still waited for: ${[...onTheirWay.values()].join(', ')}`)
    }
    await new Promise((later) => setTimeout(later, 20))
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-typing', viewport: { width: 1440, height: 1000 } })
  app.page.on('request', (request) => {
    if (new URL(request.url()).pathname !== THE_EVENT_STREAM) onTheirWay.set(request, `${request.method()} ${request.url()}`)
  })
  app.page.on('requestfinished', (request) => onTheirWay.delete(request))
  app.page.on('requestfailed', (request) => onTheirWay.delete(request))
  /** What the agent the conversation is with has sent to the person. */
  const toThePerson: string[] = []
  for (const agent of AGENTS) {
    await file(AS_THE_OWNER, {
      kind: 'agent',
      title: agent.name,
      data: { handle: agent.handle, runtime: 'claude-code', state: 'active' },
    })
    const line = await file(asAgent(agent.handle), {
      kind: 'message',
      title: `A line from ${agent.name}`,
      data: { body: `A line from ${agent.name} about the rig.`, to: [{ kind: 'person', id: THE_PERSON }] },
    })
    if (agent === TALKING_TO) toThePerson.push(line)
  }
  for (let n = 0; n < MESSAGES; n += 1) {
    const fromThem = n % 2 === 0
    const body = `Message ${String(n)} about the gripper, the camera and the bench.`
    const message = await file(fromThem ? asAgent(TALKING_TO.handle) : AS_THE_OWNER, {
      kind: 'message',
      title: body,
      data: {
        body,
        to: [fromThem ? { kind: 'person', id: THE_PERSON } : { kind: 'agent', id: TALKING_TO.handle }],
      },
    })
    if (fromThem) toThePerson.push(message)
  }
  // THE PERSON HAS READ THE CONVERSATION ALREADY. Opening a conversation marks every unseen message on
  // screen as seen, in one request, and each mark comes back as an event that draws the lists and
  // the conversation again. Those redraws were still landing when the keys were counted.
  for (const id of toThePerson) {
    const marked = await fetch(`${app.api}/api/messages/${id}/mark`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mark: 'seen' }),
    })
    expect(marked.status, await marked.clone().text()).toBe(200)
  }

  // THE COUNTER, put on the window before any of the page's code runs. React reads this object once
  // when it starts: `supportsFiber` says the tool can read React's tree, `inject` must answer an id,
  // and React calls `onCommitFiberRoot` after every commit.
  await app.page.addInitScript(() => {
    type Fiber = {
      tag: number
      flags: number
      child: Fiber | null
      sibling: Fiber | null
      stateNode: unknown
    }
    const w = window as unknown as {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown
      __drawn: { lists: number; talk: number; box: number; other: number; commits: number }
      __count: (on: boolean) => void
    }
    /** Function, class, forwardRef and the two memo kinds: the components a person's code writes. */
    const COMPONENTS = new Set([0, 1, 11, 14, 15])
    /** React's flag for "this component did work in this render". */
    const PERFORMED_WORK = 1
    let counting = false
    let lastRoot: { current: Fiber } | null = null
    let before = new WeakSet<Fiber>()
    const everyFiber = (top: Fiber, each: (one: Fiber) => void): void => {
      const stack: Fiber[] = [top]
      while (stack.length > 0) {
        const one = stack.pop()!
        each(one)
        if (one.sibling !== null) stack.push(one.sibling)
        if (one.child !== null) stack.push(one.child)
      }
    }
    const theFirstElement = (fiber: Fiber): Element | null => {
      let at: Fiber | null = fiber
      while (at !== null) {
        if (at.tag === 5) return at.stateNode as Element
        if (at.tag === 6) return (at.stateNode as Text).parentElement
        at = at.child
      }
      return null
    }
    const snapshot = (top: Fiber): WeakSet<Fiber> => {
      const seen = new WeakSet<Fiber>()
      everyFiber(top, (one) => seen.add(one))
      return seen
    }
    w.__drawn = { lists: 0, talk: 0, box: 0, other: 0, commits: 0 }
    w.__count = (on) => {
      counting = on
      w.__drawn = { lists: 0, talk: 0, box: 0, other: 0, commits: 0 }
      if (on && lastRoot !== null) before = snapshot(lastRoot.current)
    }
    let nextId = 0
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => ++nextId,
      onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
        lastRoot = root
        if (!counting) return
        w.__drawn.commits += 1
        const seen = new WeakSet<Fiber>()
        everyFiber(root.current, (one) => {
          seen.add(one)
          if (!COMPONENTS.has(one.tag) || (one.flags & PERFORMED_WORK) === 0 || before.has(one)) return
          const at = theFirstElement(one)
          if (at === null) return
          if (at.closest('.px-chat-page-lists') !== null) w.__drawn.lists += 1
          else if (at.closest('.px-chat-said') !== null) w.__drawn.talk += 1
          else if (at.closest('.px-chat-write') !== null) w.__drawn.box += 1
          else w.__drawn.other += 1
        })
        before = seen
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    }
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

interface OneKey {
  lists: number
  talk: number
  box: number
  other: number
  commits: number
}

/**
 * TYPE THE LINE INTO THE BOX INSIDE `within`, ONE KEY AT A TIME, and say what each key drew and how
 * long the slowest key took to reach the screen.
 */
async function typeAndCount(within: string): Promise<{ keys: OneKey[]; slowestMs: number; medianMs: number; frameMedianMs: number }> {
  const { page } = app
  const box = page.locator(`${within} textarea.px-chat-box`)
  await box.click()
  await box.fill('')
  // THE BOX ITSELF, empty, rather than a timer: this is the state counting starts from.
  await page.waitForFunction(
    (near) => {
      const empty = document.querySelector<HTMLTextAreaElement>(`${near} textarea.px-chat-box`)
      return empty !== null && empty.value === ''
    },
    within,
  )
  await page.evaluate(() => {
    const w = window as unknown as { __timings: number[]; __frames: number[]; __observer?: PerformanceObserver; __listening?: boolean }
    w.__timings = []
    w.__frames = []
    // AND A FINER ONE: from the key to the end of the next frame, in fractions of a millisecond. The
    // browser's own figure above is rounded to 8 ms.
    if (w.__listening !== true) {
      w.__listening = true
      document.addEventListener(
        'keydown',
        () => {
          const from = performance.now()
          requestAnimationFrame(() => {
            setTimeout(() => {
              w.__frames.push(performance.now() - from)
            }, 0)
          })
        },
        true,
      )
    }
    w.__observer?.disconnect()
    // THE BROWSER'S OWN MEASURE: from the key to the next frame painted after it was handled.
    w.__observer = new PerformanceObserver((list) => {
      for (const one of list.getEntries()) if (one.name === 'keydown' || one.name === 'keypress') w.__timings.push(one.duration)
    })
    w.__observer.observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit)
  })
  const keys: OneKey[] = []
  for (const key of THE_LINE) {
    await page.evaluate(() => {
      ;(window as unknown as { __count: (on: boolean) => void }).__count(true)
    })
    await page.keyboard.type(key)
    // THE COUNTED REDRAW ITSELF: this key has committed to the page before its numbers are read.
    await page.waitForFunction(
      () => (window as unknown as { __drawn: { commits: number } }).__drawn.commits > 0,
      undefined,
      { timeout: 10_000 },
    )
    keys.push(await page.evaluate(() => ({ ...(window as unknown as { __drawn: OneKey }).__drawn })))
  }
  await page.evaluate(() => {
    ;(window as unknown as { __count: (on: boolean) => void }).__count(false)
  })
  // EVERY KEY'S FRAME WAS RECORDED, which is what the timings below are read from.
  await page.waitForFunction(
    (keys) => (window as unknown as { __frames: number[] }).__frames.length >= keys,
    THE_LINE.length,
    { timeout: 15_000 },
  )
  const timings = await page.evaluate(() => (window as unknown as { __timings: number[] }).__timings)
  const sorted = [...timings].sort((a, b) => a - b)
  const frames = (await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)).sort((a, b) => a - b)
  expect(await box.inputValue()).toBe(THE_LINE)
  return {
    frameMedianMs: frames.length === 0 ? 0 : Math.round(frames[Math.floor(frames.length / 2)]! * 10) / 10,
    keys,
    slowestMs: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    medianMs: sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!,
  }
}

function sum(keys: OneKey[], of: keyof OneKey): number {
  return keys.reduce((total, one) => total + one[of], 0)
}

describe('a key press on the chat page', () => {
  it('draws the box again and nothing in the lists or the conversation', async () => {
    const { page } = app
    await page.goto(`${app.site}/#/chat`)
    await waitForThePage(page, 30_000)
    const onThePage = '.px-chat[data-where="page"]'
    await page.click(`${onThePage} .px-chat-contact:has(.px-chat-name:text-is("${TALKING_TO.name}"))`)
    await page.waitForSelector(`${onThePage} .px-chat-words:has-text("Message ${String(MESSAGES - 1)} about")`, { timeout: 30_000 })
    await page.locator(`${onThePage} textarea.px-chat-box`).waitFor({ state: 'visible', timeout: 30_000 })
    await untilEveryRequestIsAnswered()

    // A SLOWER PROCESSOR, so a difference in work shows as a difference in time.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const typed = await typeAndCount(onThePage)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

    // THE CORNER ON HOME, the same line into the same conversation, as the thing to compare with.
    await page.evaluate(() => {
      localStorage.setItem('mole-office.chat.open', 'yes')
    })
    await page.goto(`${app.site}/#/`)
    // THE MOVE TO HOME ASKS FOR READS, and one still on its way when the page is loaded again is never
    // said to have stopped, so it would be waited for until the time ran out.
    await untilEveryRequestIsAnswered()
    await page.reload()
    await waitForThePage(page, 30_000)
    const inTheCorner = '.px-chat[data-where="corner"]'
    await page.waitForSelector(`${inTheCorner} .px-chat-words:has-text("Message ${String(MESSAGES - 1)} about")`, { timeout: 30_000 })
    await page.locator(`${inTheCorner} textarea.px-chat-box`).waitFor({ state: 'visible', timeout: 30_000 })
    await untilEveryRequestIsAnswered()
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const corner = await typeAndCount(inTheCorner)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

    const said = (where: string, one: typeof typed): string =>
      `${where}: ${String(one.keys.length)} keys; components drawn again: lists ${String(sum(one.keys, 'lists'))}, ` +
      `conversation ${String(sum(one.keys, 'talk'))}, box ${String(sum(one.keys, 'box'))}, elsewhere ${String(sum(one.keys, 'other'))}; ` +
      `commits ${String(sum(one.keys, 'commits'))}; key to screen, median ${String(one.medianMs)} ms, slowest ${String(one.slowestMs)} ms; ` +
      `key to the end of the next frame, median ${String(one.frameMedianMs)} ms`
    console.log(said('the chat page', typed))
    console.log(said('the corner on Home', corner))

    // THE COUNTER IS WIRED: every key drew the box. A zero here would make the zeros below prove nothing.
    expect(sum(typed.keys, 'box'), 'no key drew the box, so the counter did not see React').toBeGreaterThan(0)
    expect(sum(typed.keys, 'lists'), said('the chat page', typed)).toBe(0)
    expect(sum(typed.keys, 'talk'), said('the chat page', typed)).toBe(0)
  }, 240_000)
})
