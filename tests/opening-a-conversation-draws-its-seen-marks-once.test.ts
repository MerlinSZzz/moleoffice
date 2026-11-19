// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING A CONVERSATION WITH 25 UNREAD MESSAGES SENDS THEIR SEEN MARKS IN ONE REQUEST, AND DRAWS THE
 * CHAT PANEL ONCE FOR THEM.
 *
 * The chat panel says it has read what it drew: opening a conversation marks seen each unread message
 * on screen. Each mark comes back on the event stream, and each one used to draw the whole panel
 * again, so 25 unread messages cost 25 redraws. Two things drew it. The channel made a new reading of
 * itself for every event, which draws every component that reads it. And the panel put each event's
 * change on the screen as it came. Round 85 of wave 13y made it one drawing.
 *
 * The 25 marks were still 25 requests, and the page was quiet only once the last of them had come
 * back: 1,144 ms from the click in round 85. Since round 86 the panel sends the marks for what is on
 * its screen to POST /api/messages/seen, in one request, and the server writes them in one
 * transaction. tests/the-seen-marks-on-a-screen-are-one-request-and-one-transaction.test.ts holds that
 * door to the same marks and events as the door for one message.
 *
 * WHAT THIS FILE DOES. In a test office with made-up agents, one agent has sent the person 25
 * messages, and none of them has been read. The browser's network is slowed by 150 ms a request, as
 * a page reached over a network is. The test opens that conversation on the chat page and counts,
 * from the click until the page is quiet: the seen-mark requests and the marks they carry, every
 * commit in which the panel's own component drew again, and the time from the click to the last
 * answer or commit. It fails if the marks went out in more than one request, if any of the 25
 * messages is not marked seen at the end, or if the panel drew more often after the first seen mark
 * went out than once for the marks and once for each other answer that came back after it. A mark
 * sent to the door for one message is counted as a request of its own, so the old way fails here.
 * Opening the conversation asks for its pictures at the same moment as the conversation, and for
 * what can be started with the agent at the same moment as the marks. Either answer may draw the
 * panel.
 *
 * WHY THE PICTURES WAIT FOR THE FIRST MARK. Without the wait this test failed once in four runs in
 * round 85's check. The pictures' answer came back just before the first mark went out, so it was
 * not counted, and the panel drew it just after, so that drawing was. An answer and its drawing are
 * a few milliseconds apart, and the first mark goes out a few milliseconds after the conversation is
 * drawn, so which side of the mark each one fell on was chance. The test now holds the pictures'
 * answer in the browser until the first mark has been asked, so the answer and its drawing both
 * come after the mark. The conversation, the agent's presence and the agent's status reading are not held. The panel
 * asks for the three together and stores them in one drawing (`readTheTalk` in src/web/components/Chat.tsx; the
 * status reading joined them in round 102 of wave 13y), and a seen mark is
 * asked only for a message on the screen, so that drawing always comes before the first mark. Any
 * other answer that comes back before the first mark fails the test and is named, because nothing
 * would then say on which side of the mark its drawing fell.
 *
 * HOW IT COUNTS. React calls `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` after every commit
 * when a developer tool is installed. The hook is put on the window before the page's own code
 * runs, as in tests/typing-on-the-chat-page-redraws-only-the-box.test.ts, which says how it tells a
 * component that drew from one React skipped. The panel's own component is the one whose own
 * elements include the panel's `<section>`, with no other component between them.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API on a port of its own with a database of its own;
 * nothing here reaches the owner's server. Nothing here makes load: the requests are the page's own.
 */

import type { Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { theTargetOfARead } from '../src/shared/plugin-read.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** The made-up agents on the contact list. The first is the one whose conversation is opened. */
const AGENTS = ['Wren', 'Moss', 'Fern', 'Sorrel'].map((name) => ({
  name: `${name} Agent`,
  handle: `${name.toLowerCase()}-agent`,
}))
const TALKING_TO = AGENTS[0]!

/** How many messages from that agent nobody has read. */
const UNREAD = 25

/** How much later every request of the page's is answered. */
const LATENCY_MS = 150

/** How long nothing must happen before the page counts as quiet. */
const QUIET_MS = 1500

/** How long the page may take to be quiet, before the test fails and says what was still happening. */
const QUIET_WITHIN_MS = 60_000

const PANEL = '.px-chat[data-where="page"]'

/** The page's own channel stays open as long as the page does, so it is never waited for. */
const THE_EVENT_STREAM = '/api/events'

/** The door for one message's mark, and the door for the seen marks of everything on a screen. */
const A_SEEN_MARK = /^\/api\/messages\/[^/]+\/mark$/
const THE_SEEN_MARKS = '/api/messages/seen'

/** The request that is held until the first seen mark has been asked. */
const THE_PICTURES = '/api/messages/pictures'

/** A text to be matched as it stands, with no character of it read as part of a pattern. */
const exactly = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The three reads that put the conversation on the screen, drawn together before any mark is asked. */
const THE_CONVERSATION_ITSELF = new RegExp(
  `^GET (/api/messages/conversation|/api/presence/agent/[^/]+|${exactly(theTargetOfARead('status'))})$`,
)

/** Every request the page has started and not yet had answered, apart from the event stream. */
const onTheirWay = new Map<Request, { what: string; askedAt: number }>()

/** What the page asked for after the click, and when, in the page's own clock, with how many seen marks it carried. */
const asked: { at: number; what: string; marks: number }[] = []
/** What was answered after the click, and when, named as in `asked`, with when it was asked. */
const answers: { at: number; what: string; askedAt: number }[] = []
let lastAnswerAt = 0
let counting = false

/** Lets the held pictures' request go, once the first seen mark has been asked. */
let theFirstMarkWentOut: () => void = () => {}
const theFirstMark = new Promise<void>((went) => {
  theFirstMarkWentOut = went
})

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** The messages the person has not read, filed before the page opens. */
const unread: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'chat-seen-marks', viewport: { width: 1440, height: 1000 } })
  app.page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === THE_EVENT_STREAM) return
    const posted = request.method() === 'POST' ? (request.postData() ?? '') : ''
    const marks =
      path === THE_SEEN_MARKS
        ? ((JSON.parse(posted || '{}') as { messages?: unknown[] }).messages ?? []).length
        : A_SEEN_MARK.test(path) && posted.includes('"seen"')
          ? 1
          : 0
    const seen = request.method() === 'POST' && (path === THE_SEEN_MARKS || marks > 0)
    const what = seen ? 'seen' : `${request.method()} ${path}`
    const askedAt = Date.now()
    onTheirWay.set(request, { what, askedAt })
    if (!counting) return
    asked.push({ at: askedAt, what, marks })
    if (seen) theFirstMarkWentOut()
  })
  const answered = (request: Request): void => {
    const one = onTheirWay.get(request)
    if (!onTheirWay.delete(request) || !counting || one === undefined) return
    lastAnswerAt = Date.now()
    answers.push({ at: lastAnswerAt, ...one })
  }
  app.page.on('requestfinished', answered)
  app.page.on('requestfailed', answered)
  for (const agent of AGENTS) {
    await file(AS_THE_OWNER, {
      kind: 'agent',
      title: agent.name,
      data: { handle: agent.handle, runtime: 'claude-code', state: 'active' },
    })
    if (agent === TALKING_TO) continue
    await file(asAgent(agent.handle), {
      kind: 'message',
      title: `A line from ${agent.name}`,
      data: { body: `A line from ${agent.name} about the rig.`, to: [{ kind: 'person', id: THE_PERSON }] },
    })
  }
  for (let n = 0; n < UNREAD; n += 1) {
    const body = `Message ${String(n)} about the gripper, the camera and the bench.`
    unread.push(
      await file(asAgent(TALKING_TO.handle), {
        kind: 'message',
        title: body,
        data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
      }),
    )
  }

  // THE COUNTER, put on the window before any of the page's code runs. React reads this object once
  // when it starts: `supportsFiber` says the tool can read React's tree, `inject` must answer an id,
  // and React calls `onCommitFiberRoot` after every commit.
  await app.page.addInitScript((panel: string) => {
    type Fiber = {
      tag: number
      flags: number
      child: Fiber | null
      sibling: Fiber | null
      stateNode: unknown
    }
    const w = window as unknown as {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown
      __commits: { at: number; panel: boolean }[]
      __count: (on: boolean) => void
    }
    /** Function, class, forwardRef and the two memo kinds: the components a person's code writes. */
    const COMPONENTS = new Set([0, 1, 11, 14, 15])
    /** React's flag for "this component did work in this render". */
    const PERFORMED_WORK = 1
    /** React's kind for an element on the page. */
    const AN_ELEMENT = 5
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
    /** Whether the panel's element is one of this component's own, with no other component between. */
    const drawsThePanel = (component: Fiber): boolean => {
      const stack: Fiber[] = component.child === null ? [] : [component.child]
      while (stack.length > 0) {
        const one = stack.pop()!
        if (one.sibling !== null) stack.push(one.sibling)
        if (COMPONENTS.has(one.tag)) continue
        if (one.tag === AN_ELEMENT) {
          if (one.stateNode instanceof Element && one.stateNode.matches(panel)) return true
          continue
        }
        if (one.child !== null) stack.push(one.child)
      }
      return false
    }
    const snapshot = (top: Fiber): WeakSet<Fiber> => {
      const seen = new WeakSet<Fiber>()
      everyFiber(top, (one) => seen.add(one))
      return seen
    }
    w.__commits = []
    w.__count = (on) => {
      counting = on
      w.__commits = []
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
        const seen = new WeakSet<Fiber>()
        let drewThePanel = false
        everyFiber(root.current, (one) => {
          seen.add(one)
          if (drewThePanel || !COMPONENTS.has(one.tag) || (one.flags & PERFORMED_WORK) === 0 || before.has(one)) return
          if (drawsThePanel(one)) drewThePanel = true
        })
        before = seen
        w.__commits.push({ at: Date.now(), panel: drewThePanel })
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    }
  }, PANEL)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** The commits the page made since counting began. */
async function theCommits(): Promise<{ at: number; panel: boolean }[]> {
  return app.page.evaluate(() => (window as unknown as { __commits: { at: number; panel: boolean }[] }).__commits)
}

/** Whether the person's mark on this message is `seen`, as the server holds it. */
async function seenOnTheServer(id: string): Promise<boolean> {
  const answer = await fetch(`${app.api}/api/messages/${id}`, { headers: AS_THE_OWNER })
  expect(answer.status, await answer.clone().text()).toBe(200)
  const { message } = (await answer.json()) as { message: { deliveries: { to: { kind: string; id: string }; mark: string }[] } }
  return message.deliveries.some((one) => one.to.kind === 'person' && one.to.id === THE_PERSON && one.mark === 'seen')
}

describe('opening a conversation with 25 unread messages on the chat page', () => {
  it('draws the panel once for their seen marks, and marks every one of them seen', async () => {
    const { page } = app
    await page.goto(`${app.site}/#/chat`)
    await waitForThePage(page, 30_000)
    const contact = `${PANEL} .px-chat-contact:has(.px-chat-name:text-is("${TALKING_TO.name}"))`
    await page.locator(contact).waitFor({ state: 'visible', timeout: 30_000 })
    // NOTHING THE PAGE ASKED FOR IS STILL ON ITS WAY when the latency begins and the click is counted.
    const settled = Date.now() + QUIET_WITHIN_MS
    while (onTheirWay.size > 0) {
      if (Date.now() > settled) throw new Error(`the page still waited for: ${[...onTheirWay.values()].map((one) => one.what).join(', ')}`)
      await new Promise((later) => setTimeout(later, 20))
    }

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LATENCY_MS, downloadThroughput: -1, uploadThroughput: -1 })
    // THE PICTURES' ANSWER WAITS UNTIL THE FIRST MARK HAS BEEN ASKED. The top of this file says why.
    // The browser holds the answer after the server has sent it, so the request goes out when the
    // page sends it. Held before it went out, it went out behind the 25 marks, because the browser
    // sends only six requests to one server at a time, and came back after 1.1 s instead of 0.2 s.
    // The browser's own check before it is not held: the page and the API are on different ports,
    // so the browser first asks the API with OPTIONS whether the page may read it.
    const picturesHeld: number[] = []
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `*${THE_PICTURES}*`, requestStage: 'Response' }] })
    cdp.on('Fetch.requestPaused', (paused) => {
      const theRead = paused.request.method === 'GET'
      const heldAt = Date.now()
      void (theRead ? theFirstMark : Promise.resolve()).then(async () => {
        if (theRead) picturesHeld.push(Date.now() - heldAt)
        await cdp.send('Fetch.continueRequest', { requestId: paused.requestId })
      })
    })
    await page.evaluate(() => {
      ;(window as unknown as { __count: (on: boolean) => void }).__count(true)
    })
    counting = true
    const clickedAt = Date.now()
    await page.click(contact)
    await page.waitForSelector(`${PANEL} .px-chat-words:has-text("Message ${String(UNREAD - 1)} about")`, { timeout: 30_000 })

    // QUIET: no request on its way, every seen mark answered, and no commit for QUIET_MS.
    for (;;) {
      const commits = await theCommits()
      const last = Math.max(lastAnswerAt, commits.length === 0 ? clickedAt : commits[commits.length - 1]!.at)
      const marks = asked.reduce((sum, one) => sum + one.marks, 0)
      if (onTheirWay.size === 0 && marks >= UNREAD && Date.now() - last >= QUIET_MS) break
      if (Date.now() - clickedAt > QUIET_WITHIN_MS) {
        throw new Error(
          `after ${String(QUIET_WITHIN_MS)} ms the page was not quiet: ${String(marks)} seen marks asked, ` +
            `still on their way: ${[...onTheirWay.values()].map((one) => one.what).join(', ') || 'nothing'}`,
        )
      }
      await new Promise((later) => setTimeout(later, 50))
    }
    counting = false
    const commits = await theCommits()
    await page.evaluate(() => {
      ;(window as unknown as { __count: (on: boolean) => void }).__count(false)
    })
    await cdp.send('Fetch.disable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

    const marks = asked.filter((one) => one.what === 'seen')
    const carried = marks.reduce((sum, one) => sum + one.marks, 0)
    const firstMark = marks[0]!.at
    const panel = commits.filter((one) => one.panel)
    const afterTheMarks = panel.filter((one) => one.at >= firstMark)
    // THE CONVERSATION ITSELF IS NOT COUNTED. Its two reads, asked before the first mark, are drawn
    // before the first mark can be asked, so neither accounts for a drawing after it.
    const counted = answers.filter(
      (one) => one.what !== 'seen' && !(THE_CONVERSATION_ITSELF.test(one.what) && one.askedAt < firstMark),
    )
    const beforeTheFirstMark = counted.filter((one) => one.at < firstMark)
    const otherAnswers = counted.filter((one) => one.at >= firstMark)
    const quietAt = Math.max(lastAnswerAt, commits.length === 0 ? clickedAt : commits[commits.length - 1]!.at)
    const said =
      `latency ${String(LATENCY_MS)} ms, ${String(UNREAD)} unread: ${String(asked.length)} requests after the click, ` +
      `${String(marks.length)} of them seen-mark requests carrying ${String(carried)} marks; ${String(commits.length)} commits, the panel drawn in ` +
      `${String(panel.length)}, ${String(afterTheMarks.length)} of them after the first seen mark went out; ` +
      `click to a quiet page ${String(quietAt - clickedAt)} ms; panel drawn at ` +
      `${panel.map((one) => String(one.at - clickedAt)).join(', ')} ms; seen marks asked at ` +
      `${marks.map((one) => String(one.at - clickedAt)).join(', ')} ms; the other requests: ` +
      `${asked.filter((one) => one.what !== 'seen').map((one) => `${one.what} at ${String(one.at - clickedAt)} ms`).join(', ')}; ` +
      `the pictures' answer held for ${picturesHeld.map(String).join(', ') || 'no'} ms until the first mark was asked; ` +
      `answered after the first seen mark went out: ${otherAnswers.map((one) => `${one.what} at ${String(one.at - clickedAt)} ms`).join(', ') || 'nothing else'}; ` +
      `counted and answered before it: ${beforeTheFirstMark.map((one) => `${one.what} at ${String(one.at - clickedAt)} ms`).join(', ') || 'nothing'}`
    console.log(said)

    // THE COUNTER IS WIRED: opening the conversation drew the panel. A zero here would make the count
    // below prove nothing.
    expect(panel.length, `the panel was never drawn, so the counter did not see React. ${said}`).toBeGreaterThan(0)
    // EVERY UNREAD MESSAGE WAS MARKED, IN ONE REQUEST, and is seen on the server.
    expect(marks.length, `the seen marks went out in more than one request. ${said}`).toBe(1)
    expect(carried, said).toBe(UNREAD)
    const notSeen: string[] = []
    for (const id of unread) if (!(await seenOnTheServer(id))) notSeen.push(id)
    expect(notSeen, said).toEqual([])
    // NO COUNTED ANSWER CAME BACK BEFORE THE FIRST MARK, so each one the bound allows for is drawn after it.
    expect(
      beforeTheFirstMark.map((one) => one.what),
      `an answer came back before the first seen mark went out, and nothing says on which side of the mark it was drawn. ${said}`,
    ).toEqual([])
    // ONCE FOR THE MARKS, and once for each other answer that came back while they were out.
    expect(afterTheMarks.length, said).toBeLessThanOrEqual(1 + otherAnswers.length)
  }, 240_000)
})
