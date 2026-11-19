// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TALKING TO AN AGENT: the four things on screen that could be wrong without anything failing.
 *
 * ---------------------------------------------------------------------------------------
 * 1. THE RECIPIENT IS SHOWN AND NEVER APPLIED
 * ---------------------------------------------------------------------------------------
 *
 * The rule: the recipient is never guessed silently, and the interpretation is visible and easy to
 * override. A default applied behind the composer is the one
 * thing this feature must not do, and it would look completely normal — a message would simply go
 * somewhere nobody chose. So: the suggestion comes from the ranked list only, never from the agents
 * that are merely recent, and a composer with nothing chosen refuses to send.
 *
 * ---------------------------------------------------------------------------------------
 * 2. A RUN THAT CANNOT BE PICKED UP SAYS SO, AND `unknown` IS NOT `no`
 * ---------------------------------------------------------------------------------------
 *
 * "I looked and there is nothing to pick up" and "I could not find out" are different findings, and
 * flattening the second into the first is a guess with a confident face on it.
 *
 * ---------------------------------------------------------------------------------------
 * 3. A RUN NOBODY HAS PICKED UP SAYS SO IN WORDS AND NEVER SPINS
 * ---------------------------------------------------------------------------------------
 *
 * When no worker is running, "nobody has picked this up yet" is the true answer. A turning circle
 * says the opposite — that something is happening — and there is no way for a reader to tell.
 *
 * ---------------------------------------------------------------------------------------
 * 4. THE HANDLE IS THERE AT REST
 * ---------------------------------------------------------------------------------------
 *
 * *"A first-time user who eventually discovers a hidden interaction by clicking blank space does not
 * count as success."* Nothing on a page says a right-click will do anything, so the handle is a
 * button that is drawn whether or not anybody is hovering, and its accessible name says what it
 * does and what it is about.
 *
 * There is no DOM in this runner, so what is checked is the markup each component renders. What it
 * cannot see is a control hidden by CSS, which is what `node tools/review.mjs` photographs for.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AgentMessageView, AgentRunView } from '../src/server/lib/agents.ts'
import type { RecipientCandidate, RecipientsAnswer } from '../src/server/lib/recipients.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { recipientDisclosureForFixture } from './recipient-answer-disclosure.ts'

type Recipients = typeof import('../src/web/components/agent/Recipients.tsx')
type Pointing = typeof import('../src/web/components/agent/PointingLayer.tsx')
type Page = typeof import('../src/web/pages/AgentsPage.tsx')
type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')

let recipients: Recipients
let pointing: Pointing
let page: Page
let bar: Bar
let review: typeof import('../src/web/lib/review.ts')

/** The review module, imported once with everything else. */
const requireReview = () => review

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, exactly as tests/ui.test.ts says, so
  // the smallest stand-in goes in before anything is imported. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  recipients = await import('../src/web/components/agent/Recipients.tsx')
  pointing = await import('../src/web/components/agent/PointingLayer.tsx')
  page = await import('../src/web/pages/AgentsPage.tsx')
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
  review = await import('../src/web/lib/review.ts')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

// ---------------------------------------------------------------------------- fixtures

/** A candidate as the recipients route sends one. Test input, not an observation. */
function candidate(over: Partial<RecipientCandidate> = {}): RecipientCandidate {
  return {
    sessionId: 's1',
    title: 'The gripper calibration run',
    doing: 'measuring slip above 15N',
    purpose: null,
    workspaceId: 'panelx',
    deleted: false,
    why: 'It filed this report on 15 August.',
    ground: 'filed-this-record',
    alsoWhy: [],
    support: 2,
    pickUp: {
      answer: 'yes',
      runtime: 'claude-code',
      conversationId: 'c1',
      transcript: `${THE_TEST_FIXTURE_ROOT}/.claude/c1.jsonl`,
      resumeCommand: 'claude --resume c1',
      because: 'Its transcript is on this machine.',
    },
    origin: 'authored',
    originNote: null,
    recordedState: null,
    lastSeenAt: '2026-08-17 10:00:00',
    lastSeenFrom: 'change-log',
    // Added to the server's shape while this was being written: which other candidates this one is
    // level with. Empty is the ordinary case and is what the fixture says.
    tiedWith: [],
    ...over,
  }
}

function answer(over: Partial<RecipientsAnswer> = {}): RecipientsAnswer {
  const connected = over.connected ?? [candidate()]
  const recent = over.recent ?? [candidate({ sessionId: 's9', title: 'Some other run', why: 'It was active yesterday.', ground: null })]
  const recentLeftOut = over.recentLeftOut ?? 0
  return {
    context: {
      asked: { kind: 'record', id: 'r1' },
      record: { id: 'r1', kind: 'task', title: 'Test the gripper', workspaceId: 'panelx', deleted: false },
      nothingFiled: null,
      workspaceId: 'panelx',
      askedForProject: null,
      elsewhere: null,
    },
    connected,
    recent,
    recentLeftOut,
    ...recipientDisclosureForFixture(connected.length, recent.length, recentLeftOut),
    read: {
      rule: 'Five things count, strongest first.',
      pickUpRule: 'Whether a run can be picked up is checked on this machine.',
      whenItCannotBePickedUp: 'There are two honest choices and Mole Office offers both.',
      conversationRule: 'A sweep of this machine writes down which conversation a run was.',
      pickUp: { total: 0, stuck: 0, allSameReason: null },
      origins: { fixture: 0, unmarked: 0, authored: 0, deleted: 0 },
      sessions: 9,
      projects: 2,
      links: 4,
      changesOnThis: 3,
      changesOnThisCapped: false,
      changesRead: 40,
      changesCapped: false,
      transcriptsChecked: 9,
      tookMs: 12,
    },
    ...over,
  }
}

/** A run as the conversation route sends one. */
function run(over: Partial<AgentRunView> = {}): AgentRunView {
  return {
    id: 'run1',
    threadId: 't1',
    workspaceId: 'panelx',
    threadTitle: 'Review, 18 August',
    runtime: 'claude-code',
    state: 'queued',
    recipientSessionId: null,
    resume: null,
    claimedBy: null,
    claimedAt: null,
    claimedFromMachine: null,
    startedAt: null,
    endedAt: null,
    createdAt: '2026-08-18 02:00:00',
    error: null,
    result: null,
    focus: null,
    says: 'Nobody has picked this up yet.',
    ...over,
  }
}

// ---------------------------------------------------------------------------- the suggestion

describe('who a message goes to is shown, never applied', () => {
  it('offers the strongest CONNECTED agent and never one that is merely recent', () => {
    // THE FAILURE THIS PREVENTS: a suggestion drawn off the recent list. Recency is not relevance —
    // the server keeps the two apart for that reason — and a composer that offered "whoever ran
    // last" would be the guess the owner forbade, wearing the clothes of a ranking.
    expect(recipients.strongestCandidate(answer())?.sessionId).toBe('s1')
    expect(recipients.strongestCandidate(answer({ connected: [] }))).toBe(null)
  })

  it('keeps what a person typed, so a refusal can be read beside the comment later', () => {
    const kept = recipients.recipientForServer({
      kind: 'unresolved',
      said: 'the agent working on calibration',
      why: 'Those words named three agents.',
    })
    expect(kept).toEqual({
      kind: 'unresolved',
      sessionId: null,
      said: 'the agent working on calibration',
      why: 'Those words named three agents.',
    })
  })
})

describe('whether an agent can be picked up where it left off', () => {
  it('says nothing when it can', () => {
    expect(recipients.pickUpNote(candidate().pickUp)).toBe(null)
  })

  it('separates "there is nothing to pick up" from "I could not find out"', () => {
    // `unknown` drawn as `no` is a guess with a confident face on it, and it is the difference
    // between "start a new agent" being the right offer and it being a substitution.
    const gone = recipients.pickUpNote({ answer: 'no', why: 'transcript-gone', because: 'The transcript is not here.' })
    expect(gone?.bad).toBe(true)
    expect(gone?.words).toContain('Cannot be picked up')

    const unsure = recipients.pickUpNote({
      answer: 'unknown',
      why: 'transcript-unreadable',
      because: 'The file could not be read.',
    })
    expect(unsure?.bad).toBe(false)
    expect(unsure?.words).toContain('could not find out')
  })
})

// ---------------------------------------------------------------------------- the picker

describe('the recipient picker', () => {
  const drawn = () =>
    render(
      h(recipients.RecipientPicker, {
        context: { target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' } },
        recipients: { status: 'ready', value: answer() },
        onChoose: () => {},
        onClose: () => {},
        reviewOn: false,
      }),
    )

  it('gives every candidate the sentence saying why it is one', () => {
    const html = drawn()
    expect(html).toContain('It filed this report on 15 August.')
    expect(html).toContain('Connected to what you pointed at')
  })

  it('keeps recency under its own heading, so nobody reads it as relevance', () => {
    const html = drawn()
    // THE HEADING IS THE SCREEN'S OWN NOW, and it keeps the half that matters: `Not connected` is
    // what stops recency being read as relevance, and it is word for word what each row underneath
    // says about itself, so the heading and the rows cannot drift apart.
    expect(html).toContain('Not connected · recently active')
    expect(html.indexOf('It filed this report on 15 August.')).toBeLessThan(
      html.indexOf('Not connected · recently active'),
    )
  })

  it('offers a new agent and a way to say who you mean, and never picks for you', () => {
    const html = drawn()
    expect(html).toContain('Start a new agent')
    expect(html).toContain('Say who you mean')
    // Nothing in the markup claims a choice has been made.
    expect(html).not.toContain('aria-checked="true"')
  })

  it('puts the ranking rule behind a press rather than in front of the agents', () => {
    // Measured in the browser on 18 August 2026: drawn open, the rule filled the whole picker and
    // pushed every candidate below the fold. It is read once and skipped afterwards, which is what
    // `Explain` is for.
    const html = drawn()
    expect(html).toContain('<details')
    expect(html).toContain('how the ranking works')
    expect(html).toContain('Five things count, strongest first.')
  })

  it('says when nothing Mole Office holds connects an agent to this, rather than showing an empty list', () => {
    const html = render(
      h(recipients.RecipientPicker, {
        context: null,
        recipients: { status: 'ready', value: answer({ connected: [] }) },
        onChoose: () => {},
        onClose: () => {},
        reviewOn: false,
      }),
    )
    // WHAT IT WAS RANKED AGAINST, AS A LABEL AND A VALUE. It was a sentence from the server —
    // `You pointed at the task “Test the gripper”.` — and the kind and the title were inside it
    // where nothing could draw either on its own.
    expect(html).toContain('Ranked against')
    expect(html).toContain('task')
    expect(html).toContain('Test the gripper')
  })
})

// ---------------------------------------------------------------------------- how anybody finds out

/**
 * THE CONTROL THAT SAYS THIS IS POSSIBLE AT ALL.
 *
 * Round seven put a press beside each thing that could be talked about, and this file used to check
 * that press. It is gone, and the reason is that it answered the wrong question: a button on a row
 * says THIS row can be talked about, while the question a first-time reader has is whether anything
 * can. There is one control now, in the frame, on every page at every width — and everything on the
 * page is addressable through one listener rather than through a button per object.
 */
describe('how anybody finds out they can point at something', () => {
  it('is a real control at rest in the frame, saying what it does', () => {
    const html = render(h(pointing.TalkAboutSomething))
    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('Ask agent')
    expect(html).toContain('class="px-point-switch"')
    // NOT ALREADY ON. Marking the page is what a press does, not what a visit does.
    expect(html).toContain('aria-pressed="false"')
    // `hidden=""` is the attribute; `aria-hidden` on the glyph is a different thing and is right.
    expect(html).not.toContain('hidden=""')
  })

  it('is not hidden until somebody hovers, which for a scanning reader is not there at all', async () => {
    // There is no DOM here, so the stylesheet is read as text.
    const { AGENT_CSS } = await import('../src/web/components/agent/agent-css.ts')
    for (const rule of AGENT_CSS.split('}')) {
      if (!rule.includes('.px-point-switch')) continue
      // THE COLLAPSED RAIL HIDES THE WORDS AND KEEPS THE CONTROL, exactly as it does for every
      // other label in the sidebar. The control itself is what may not be hidden.
      if (rule.includes('.px-point-switch-words')) continue
      const hides = /display:\s*none|visibility:\s*hidden|opacity:\s*0(?!\.)/.test(rule)
      expect(hides, `a rule hides the control: ${rule.trim()}`).toBe(false)
    }
  })

  it('draws nothing else at rest — no offer until words are selected', () => {
    // STRIP THE STYLESHEET FIRST. Every stylesheet in this app is a template literal rendered into
    // a style tag, so it carries the class name of everything it styles, and an assertion that the
    // markup does not mention a class would match the stylesheet instead of the markup.
    const html = render(h(pointing.PointingLayer)).replace(/<style[\s\S]*?<\/style>/g, '')
    expect(html).not.toContain('px-talk-quote')
    expect(html).not.toContain('px-talk')
  })
})
