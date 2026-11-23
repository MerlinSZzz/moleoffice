// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER WORKED AND A PERSON COULD NOT GET AT IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Phases 8 and 9 were proved on the server with two real agent runs: a person asked, an agent
 * answered, and the same agent answered from its own earlier words. Then three reviewers went at
 * the screens and found that almost everything between that working server and a person was broken.
 * Five of those findings are pinned here.
 *
 *   1. THE ENTRY POINT WAS UNREACHABLE ON A PHONE. "Ask agent" lives in the sidebar,
 *      which below 1024px is a drawer over the page. Pressing it did not close the drawer, so the
 *      thing the reader was being asked to press was behind the menu.
 *   2. A DISABLED SEND SAID NOTHING. It refused for ever with no title, no wording change and no
 *      sentence anywhere in the box.
 *   3. THE COMPOSER PRINTED AN INSTRUCTION THAT WAS FALSE WHERE IT WAS PRINTED — "select inside one
 *      paragraph to quote words exactly", on things that keep no quotable text at all. As decided, the
 *      composer now draws the short word alone and gives no instruction there.
 *   4. A CONVERSATION COULD NOT BE ANSWERED. The thread had no box to write in and no press with
 *      "reply" in its name.
 *   5. A COMMENT DISPATCH HELD BACK WAS DRAWN EXACTLY LIKE ONE THAT WENT, sitting above the agent's
 *      answer, so a reader took the answer as a reply to both.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED WITHOUT A BROWSER AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The decisions are pure functions and are asked directly. What only a browser can answer — whether
 * the drawer is still over the page, and whether a reply written on the screen reaches the server —
 * is done in Chromium against a Mole Office of this test's own. Nothing here touches ./data/panelx.db.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentMessageView } from '../src/server/lib/agents.ts'
import type { PickUp, RecipientCandidate } from '../src/server/lib/recipients.ts'
import { thePersonsKeyHeader, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n } from '../src/shared/i18n.ts'

type Talk = typeof import('../src/web/components/agent/TalkBox.tsx')
type Recipients = typeof import('../src/web/components/agent/Recipients.tsx')
type AgentsPage = typeof import('../src/web/pages/AgentsPage.tsx')

let talk: Talk
let recipients: Recipients
let agentsPage: AgentsPage

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in goes in
  // before anything is imported. Nothing here is under test; the same stand-in is in
  // tests/the-composer-is-short.test.ts, which says the same thing at more length.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '#/', href: 'http://127.0.0.1/' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  talk = await import('../src/web/components/agent/TalkBox.tsx')
  recipients = await import('../src/web/components/agent/Recipients.tsx')
  agentsPage = await import('../src/web/pages/AgentsPage.tsx')
})

// ============================================================================ fixtures

const CANNOT: PickUp = {
  answer: 'no',
  why: 'never-observed',
  because: 'Nobody recorded a transcript for this run, so there is no conversation to pick up.',
}

const CAN: PickUp = {
  answer: 'yes',
  runtime: 'claude-code',
  conversationId: 'ext-1',
  transcript: '/tmp/whatever.jsonl',
  resumeCommand: 'claude --resume ext-1',
  because: 'The transcript this run left is on this machine.',
}

function candidate(over: Partial<RecipientCandidate> = {}): RecipientCandidate {
  return {
    sessionId: 's1',
    title: 'Round eight build run',
    doing: 'measuring the gripper',
    purpose: null,
    workspaceId: 'default',
    deleted: false,
    pickUp: CAN,
    origin: 'authored',
    originNote: null,
    recordedState: null,
    ground: 'wrote-to-this-record',
    why: 'This run wrote to the record you pointed at.',
    alsoWhy: [],
    lastActive: '2026-08-19 04:00:00',
    tiedWithOthers: false,
    ...over,
  } as RecipientCandidate
}

function message(over: Partial<AgentMessageView> = {}): AgentMessageView {
  return {
    id: 'm1',
    threadId: 't1',
    position: 1,
    role: 'human',
    intent: 'ask',
    body: 'Did anybody check the pad before the run?',
    state: 'sent',
    context: null,
    reading: null,
    // A RUN, SO `agentId` IS NULL. Exactly one of the two ids is ever filled and `kind` says which.
    recipient: { kind: 'session', sessionId: 's1', agentId: null, said: null, why: null },
    delivery: { canSend: true, says: 'This would go to the gripper calibration run.' },
    runId: null,
    fromAnnotationId: null,
    carries: [],
    quotes: [],
    quotePositions: null,
    createdAt: '2026-08-19 04:00:00',
    createdBy: THE_TEST_OFFICES_OWNER.id,
    ...over,
  }
}

const NO_NAMES = { byId: new Map<string, string>() } as never
const drawMessage = (over: Partial<AgentMessageView> = {}) =>
  renderToStaticMarkup(h(agentsPage.MessageLine, { message: message(over), names: NO_NAMES }))

// ============================================================ 1. the instruction that was false

describe('what the composer says about words it could not place', () => {
  /**
   * THE FIRST HALF IS SAID IN BOTH CASES AND IS NOT NEGOTIABLE. A person selected words and the
   * comment is about to be about the whole thing. Widening what somebody chose without saying so is
   * the quiet substitution invariant 2 forbids.
   */
  it('says the comment is about the whole thing whenever the words could not be placed', () => {
    const { t } = createI18n('en')
    for (const words of ['across', 'nowhere'] as const) {
      // THE WORD IS ON THE PAGE, and it is the whole of what is said, as decided.
      expect(talk.wordsNotPlacedNote(words, 'record')).toBe(t('talk.whole', { thing: 'record' }))
    }
  })

  it('says nothing at all when the words WERE placed', () => {
    expect(talk.wordsNotPlacedNote('placed', 'record')).toBe(null)
  })
})

// ============================================================ 2. who would get it, and the escape

describe('who would get this, and whether they can be reached', () => {
  it('is offering while Mole Office has an agent to propose and nobody has taken it', () => {
    expect(talk.whoWouldGetIt(null, candidate()).offering).toBe(true)
  })

  it('is not offering once a choice has been made, so one field has one control', () => {
    const chosen = recipients.chosenFrom(candidate(), null)
    expect(talk.whoWouldGetIt(chosen, candidate()).offering).toBe(false)
  })

  it('is not offering when there is nothing to propose', () => {
    expect(talk.whoWouldGetIt(null, null).offering).toBe(false)
  })

  /**
   * THE LOOP THIS BREAKS. The way out of an agent that cannot be picked up used to appear only
   * after pressing "Choose this agent" on that same agent. So the reader had to choose the thing
   * that does not work in order to be offered the thing that does.
   */
  it('names the refusal against a PROPOSED agent, before anybody has chosen it', () => {
    const asked = talk.whoWouldGetIt(null, candidate({ pickUp: CANNOT }))
    expect(asked.cannotPickUp).toBe(CANNOT.because)
  })

  /**
   * AND ONLY A CHOICE REFUSES A SEND. While nothing has been chosen, Send is already refused for
   * want of a recipient, and refusing it twice for two reasons puts the wrong sentence on screen.
   */
  it('does not refuse the send for an agent nobody has chosen', () => {
    expect(talk.whoWouldGetIt(null, candidate({ pickUp: CANNOT })).hazard).toBe(null)
    const chosen = recipients.chosenFrom(candidate({ pickUp: CANNOT }), null)
    expect(talk.whoWouldGetIt(chosen, null).hazard).toBe(CANNOT.because)
  })

  it('never calls "Mole Office could not find out" a refusal', () => {
    const unknown: PickUp = { answer: 'unknown', why: 'runtime-unknown', because: 'No adapter for that tool.' }
    const chosen = recipients.chosenFrom(candidate({ pickUp: unknown }), null)
    expect(talk.whoWouldGetIt(chosen, null).hazard).toBe(null)
    expect(talk.whoWouldGetIt(chosen, null).cannotPickUp).toBe(null)
  })
})

// ============================================================ 3. a half-written comment dropped

describe('a half-written comment dropped to make room', () => {
  it('says nothing when nothing was dropped', () => {
    expect(talk.whatKeepsTheWords(null, 0)).toBe(talk.whatKeepsTheWords(null))
  })

  it('says it out loud rather than losing the words quietly', () => {
    expect(talk.whatKeepsTheWords(null, 1)).toContain('dropped to make room')
    expect(talk.whatKeepsTheWords(null, 3)).toContain('3 oldest were dropped')
    // It is said whichever answer the browser's own store gave, because losing the words and
    // failing to keep them are different facts and a reader is owed both.
    expect(talk.whatKeepsTheWords('storage is disabled', 2)).toContain('dropped to make room')
  })
})

// ============================================================ 4. a comment that has not gone

describe('a comment dispatch held back is not drawn like one that went', () => {
  it('marks a comment that is still waiting, and keeps the server words for developer mode', async () => {
    const waiting: Partial<AgentMessageView> = {
      state: 'queued',
      recipient: null,
      delivery: { canSend: false, says: 'No recipient chosen yet.' },
    }
    const html = drawMessage(waiting)
    expect(html).toContain('Not sent yet')
    expect(html, 'the server sentence is for a developer').not.toContain('No recipient chosen yet.')
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    const inspected = drawMessage(waiting)
    mode.setMode('normal')
    expect(inspected).toContain('No recipient chosen yet.')
  })

  it('marks nothing on a comment that went, because nobody has to do anything about it', () => {
    expect(drawMessage({ state: 'sent' })).not.toContain('Not sent yet')
    // Was `answered`, which is no longer one of the six words a message may hold — see
    // src/server/lib/dispatch.ts. `handled` is what it meant, and it is what this asserts now.
    expect(drawMessage({ state: 'handled' })).not.toContain('Not sent yet')
  })

  /**
   * WHO SPOKE IS SETTLED BY THE RUN, NOT BY A REQUEST HEADER. `role` is written from
   * x-mole-office-actor-type, so anybody can POST a message that says an agent wrote it. The schema says
   * run_id "is how a reader tells the two apart without guessing from role", and this page guessed.
   */
  it('says when nothing but the sender word says an agent wrote it', () => {
    expect(drawMessage({ role: 'agent', recipient: null, runId: null })).toContain('No run produced this')
    expect(drawMessage({ role: 'agent', recipient: null, runId: 'run1' })).not.toContain('No run produced this')
    expect(drawMessage({ role: 'human' })).not.toContain('No run produced this')
  })
})

// ============================================================ 5. in a real browser

describe('a person can reach it, in Chromium', () => {
  let app: LiveApp
  let recordId: string
  let threadId: string
  let sessionId: string

  const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`${app.api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...thePersonsKeyHeader(app.dir + '/keys.json') },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return (await res.json()) as Record<string, unknown>
  }

  beforeAll(async () => {
    app = await liveApp({ name: 'reach', viewport: { width: 1440, height: 900 } })
  // THE DRAWER'S CLOSING IS A 240 MS ANIMATION. These cases read whether it has got out of the
  // way, so the animation is off and the measurement is of where it ends, not of the first frame.
  await app.page.emulateMedia({ reducedMotion: 'reduce' })

    const record = (await post('/api/records', {
      kind: 'problem',
      title: 'The gripper drops the part above fifteen newtons',
      summary: 'One run in three dropped it.',
      data: { state: 'open', symptom: 'It lets go somewhere above fifteen newtons and nobody has measured why.' },
    })) as { record: { id: string } }
    recordId = record.record.id

    const session = (await post('/api/records', {
      kind: 'session',
      title: 'Round eight build run',
      data: { runtime: 'claude-code', state: 'running', doing: 'measuring the gripper' },
    })) as { record: { id: string } }
    sessionId = session.record.id

    const thread = (await post('/api/agent/threads', { title: 'About the gripper', mode: 'direct' })) as {
      thread: { id: string }
    }
    threadId = thread.thread.id
    await post(`/api/agent/threads/${threadId}/messages`, {
      intent: 'ask',
      body: 'Did anybody check the pad before the run, or is that still unknown?',
      recipient: { kind: 'new' },
      context: { target: { kind: 'record', recordId, workspaceId: 'default' } },
    })
    const sent = (await post(`/api/agent/threads/${threadId}/dispatch`, {})) as { runs: { id: string }[] }
    const runId = sent.runs[0]?.id ?? ''
    await post(`/api/agent/runs/${runId}/claim`, { worker: 'w1' })
    await post(`/api/agent/runs/${runId}/result`, {
      result: { answer: 'Nobody checked it. The log has no entry for the pad on that day.' },
    })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /**
   * EVERY VISIT IS A REAL LOAD, and that is not caution about timing.
   *
   * Two addresses in this app differ only in the fragment, so navigating between them does not
   * reload the document — the browser keeps every module, including the one holding whether the
   * page is marking what can be talked about and the composer that is open over it. One case's
   * leftovers then decide what the next case's first press does. The visit number makes the address
   * different, so one load gives what a person opening the page fresh gets.
   */
  let visit = 0
  const open = async (where: string, size: { width: number; height: number }, developer = false) => {
    visit += 1
    await app.page.setViewportSize(size)
    await app.page.goto(`${app.site}/${developer ? '?mode=inspect&' : '?'}visit=${String(visit)}#${where}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await waitForThePage(app.page, 60_000)
  }

  /**
   * THE ONE THAT ONLY HAPPENS ON A PHONE.
   *
   * Below 1024px the sidebar is a drawer, so the only way to reach "Ask agent" is to
   * open the menu — and the menu was then still over the page the control had just asked somebody
   * to press. Measured before the fix: the drawer was 300px wide over a 390px window, the scrim was
   * up, and document.elementFromPoint in the middle of the page was the navigation.
   */
  it('gets the menu out of the way at 390, so the page can be pressed', async () => {
    await open(`/r/${recordId}`, { width: 390, height: 900 })
    await app.page.getByRole('button', { name: 'Menu' }).click()
    // THE MENU ITSELF: the drawer has a width once it is open.
    await app.page.waitForFunction(
      () => {
        const side = document.getElementById('shell-side')
        return side !== null && side.getBoundingClientRect().width > 0
      },
      undefined,
      { timeout: 15_000 },
    )
    const covering = await app.page.evaluate(() => {
      const side = document.getElementById('shell-side')
      return { width: side === null ? 0 : Math.round(side.getBoundingClientRect().width) }
    })
    expect(covering.width, 'the menu did not open, so this test is not measuring what it says').toBeGreaterThan(0)

    await app.page.locator('.px-point-switch').click()
    await app.page.waitForFunction(() => document.documentElement.getAttribute('data-pointing') === '1', undefined, {
      timeout: 15_000,
    })
    const after = await app.page.evaluate(() => {
      const side = document.getElementById('shell-side')
      const under = document.elementFromPoint(200, 300)
      return {
        width: side === null ? 0 : Math.round(side.getBoundingClientRect().width),
        scrim: document.querySelector('.shell-scrim') !== null,
        underThePointer: under === null ? 'nothing' : under.className,
        marking: document.documentElement.getAttribute('data-pointing'),
      }
    })
    expect(after.width, 'the drawer is still over the page').toBe(0)
    expect(after.scrim, 'the scrim is still over the page').toBe(false)
    expect(after.underThePointer).not.toContain('px-point-switch')
    expect(after.underThePointer).not.toContain('shell-scrim')
    expect(after.marking, 'the page is not marking what can be talked about').toBe('1')
  }, 120_000)

  /**
   * A DISABLED CONTROL THAT WILL NOT SAY WHAT IT WANTS IS THE WORST THING A SCREEN CAN DO, and Send
   * did exactly that: aria-disabled for ever with no title and no sentence beside it.
   */
  it('says why Send is off, without anybody pressing it', async () => {
    await open(`/r/${recordId}`, { width: 1440, height: 900 })
    await app.page.locator('.px-point-switch').click()
    await app.page.waitForFunction(() => document.documentElement.getAttribute('data-pointing') === '1', undefined, {
      timeout: 15_000,
    })
    await app.page.evaluate(() => {
      // THE PAGE'S OWN TREE, not the document's. Since step 15 the shell itself carries a key, so
      // the first `[data-target]` in the document is the whole window, and point mode does not take
      // a press on the frame — it marks what the page holds and takes a press on one of those.
      const at = document.querySelector('#main [data-target]')
      if (at === null) throw new Error('nothing on this page says what it is')
      const box = at.getBoundingClientRect()
      at.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: Math.round(box.left + 20), clientY: Math.round(box.top + 20) }),
      )
    })
    await app.page.waitForSelector('.px-talk', { timeout: 15_000 })
    await app.page.locator('.px-talk textarea').fill('Is the pad the cause, or is that still unknown?')
    // THE REFUSAL ITSELF: Send is off and the box says why.
    await app.page.waitForFunction(
      () => {
        const box = document.querySelector('.px-talk')
        const send = [...(box?.querySelectorAll('button') ?? [])].find((one) => one.textContent?.trim() === 'Send')
        return (
          send?.getAttribute('aria-disabled') === 'true' &&
          (box?.querySelector('.px-talk-refusal')?.textContent ?? '').length > 10
        )
      },
      undefined,
      { timeout: 15_000 },
    )
    const said = await app.page.evaluate(() => {
      const box = document.querySelector('.px-talk')
      const send = [...(box?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === 'Send')
      return {
        off: send?.getAttribute('aria-disabled') ?? null,
        refusal: box?.querySelector('.px-talk-refusal')?.textContent ?? null,
        title: send?.getAttribute('title') ?? null,
      }
    })
    expect(said.off, 'this test is only about a Send that refuses').toBe('true')
    expect(said.refusal, 'the box refuses and says nothing about why').not.toBe(null)
    expect((said.refusal ?? '').length).toBeGreaterThan(10)
    expect(said.title).toBe(said.refusal)
  }, 120_000)

  /**
   * ANSWERING THE ANSWER, which is the sentence Phase 9 exists to make true. Before this there were
   * no boxes to write in anywhere in an opened conversation and no press with "reply" in its name.
   */
  it('lets a person answer the agent in the conversation, and the words reach the server', async () => {
    await open('/conversations', { width: 1440, height: 900 })
    await app.page.locator('.px-thread-row').first().click()
    await app.page.waitForSelector('.px-reply textarea', { timeout: 15_000 })
    await app.page.locator('.px-reply textarea').fill('Then measure it before the next run and say what you find.')
    const press = await app.page.evaluate(
      () => [...document.querySelectorAll('.px-reply button')].map((b) => b.textContent?.trim() ?? '').at(-1) ?? '',
    )
    // THE PRESS ITSELF, once the written words have offered it.
    await app.page.waitForFunction(
      (name) => {
        const button = [...document.querySelectorAll('.px-reply button')].find((one) => (one.textContent ?? '').trim() === name)
        return button !== undefined && button.getAttribute('aria-disabled') !== 'true' && !(button as HTMLButtonElement).disabled
      },
      press,
      { timeout: 15_000 },
    )
    await app.page.getByRole('button', { name: press, exact: true }).click()
    // THE REPLY ITSELF, on the server.
    await expect
      .poll(
        async () => {
          const said = await fetch(`${app.api}/api/agent/threads/${threadId}`)
          const held = (await said.json()) as { messages: { body: string }[] }
          return held.messages.some((one) => one.body.startsWith('Then measure it'))
        },
        { timeout: 30_000 },
      )
      .toBe(true)

    const res = await fetch(`${app.api}/api/agent/threads/${threadId}`)
    const detail = (await res.json()) as { messages: { body: string; context: unknown }[] }
    const reply = detail.messages.find((one) => one.body.startsWith('Then measure it'))
    expect(reply, 'the reply never reached the server').not.toBe(undefined)
    // IT SAYS WHICH ANSWER IT FOLLOWS. An agent message is one entry in the target vocabulary, so
    // continuing from a reply needs nothing of its own.
    expect(JSON.stringify(reply?.context ?? null)).toContain('agentMessage')
  }, 120_000)

  /**
   * The page's own heading promises work, and after the sweep Phase 10 prescribes every row was an
   * agent run. Leaving them out is only honest if the page says how many it left out.
   */
  it('keeps agent runs off the list of work, and says how many it left off', async () => {
    await open('/conversations', { width: 1440, height: 900 })
    const seen = await app.page.evaluate(() => ({
      titles: [...document.querySelectorAll('.px-talk-source-title')].map((e) => e.textContent ?? ''),
      pageText: document.querySelector('main.page')?.textContent ?? '',
    }))
    expect(seen.titles.join(' '), 'an agent run is on the list of work').not.toContain('Round eight build run')
    // THE RUN COUNT IS DEVELOPER DETAIL. The page still names where runs are, but the ordinary view
    // keeps their count out of the work list.
    expect(seen.pageText).not.toContain('2 agent runs are on Agent runs')
    await open('/conversations', { width: 1440, height: 900 }, true)
    const developerText = await app.page.locator('main.page').innerText()
    // EVERY SESSION IN THE PROJECT, COUNTED BY THE SERVER: the two this test made, and the rows the
    // server files about itself, which land in `default` since that became the default project, by item FLO-02 of a
    // decision. Before, they were refused in a project the test office did not have.
    const listed = await fetch(`${app.api}/api/records?kind=session`, {
      headers: { 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader(app.dir + '/keys.json') },
    })
    const sessions = ((await listed.json()) as { records: unknown[] }).records.length
    expect(sessions).toBeGreaterThanOrEqual(2)
    expect(developerText).toContain(`${String(sessions)} agent runs are on Agent runs`)
    expect(developerText).not.toContain('sessions page')
    expect(sessionId.length).toBeGreaterThan(0)
  }, 120_000)

  /**
   * docs/UX-CONTRACT.md: nothing scrolls sideways at 1440 or 390. Phase 9 puts agent-written text
   * — paths, addresses, stack traces — into a message body for the first time, and that element
   * kept the line breaks somebody typed and broke a line only at a space.
   */
  it('does not scroll the page sideways for one long unbroken word', async () => {
    const long = `${THE_TEST_FIXTURE_ROOT}/${'a'.repeat(600)}/deeply/nested/path.jsonl`
    await post(`/api/agent/threads/${threadId}/messages`, { intent: 'ask', body: `Look at ${long} please.` })
    for (const width of [1440, 390]) {
      await open('/conversations', { width, height: 900 })
      await app.page.locator('.px-thread-row').first().click()
      await app.page.waitForSelector('.px-msg-body', { timeout: 15_000 })
      // THE LONG MESSAGE ITSELF, drawn in the conversation.
      await app.page.waitForFunction(
        (said) => [...document.querySelectorAll('.px-msg-body')].some((one) => (one.textContent ?? '').includes(said)),
        long,
        { timeout: 30_000 },
      )
      const measured = await app.page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        bodies: document.querySelectorAll('.px-msg-body').length,
      }))
      expect(measured.bodies, 'no message was drawn, so this measured nothing').toBeGreaterThan(0)
      expect(measured.scroll, `the page scrolls sideways at ${String(width)}`).toBeLessThanOrEqual(measured.client)
    }
  }, 180_000)
})
