// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMPOSER IS SHORT, AND NOTHING WAS THROWN AWAY TO MAKE IT SHORT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The recipient and routing part of the composer was too wordy, and by default it showed several
 * paragraphs explaining where the recipient came from and the resume state. What is wanted
 * instead is three lines:
 *
 *     Round 7 agent
 *     Worked on this Plan · 18 Aug
 *     ○ new run required
 *
 * There are two ways to answer that and only one of them is honest. The dishonest one is to cut the
 * sentences: take the server's paragraph about why an agent is offered and print its first forty
 * characters. The reader then has a broken sentence and no way to know what was after it.
 *
 * The honest one is a SHORT FORM OF ITS OWN, built from the structured fields the server sends
 * beside its prose — `ground`, `origin`, `pickUp.answer` — with every sentence one press away. That
 * is what these tests hold the composer to.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS THAT COULD GO WRONG WITHOUT ANYTHING FAILING
 * ---------------------------------------------------------------------------------------
 *
 * 1. A short line that is a cut sentence. Nothing would fail; the screen would just be wrong in a
 *    way that reads as fine.
 * 2. `unknown` worded as `no`. "Mole Office could not find out whether this can be picked up" turning
 *    into "needs a new run" is a guess with a confident face on it, and it sends somebody off to
 *    start an agent that has never heard of the work.
 * 3. A sentence dropped rather than folded. Shortening a screen by deleting what would not fit is
 *    the failure this whole redesign is meant to avoid.
 * 4. An agent's answer drawn as a question addressed to nobody, and unpointable.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE, AND WHAT THEY ARE NOT
 * ---------------------------------------------------------------------------------------
 *
 * There is no DOM in this runner, so what is checked is the markup each component renders. A
 * control hidden by CSS is invisible to this file; that is what `node tools/review.mjs` photographs
 * for.
 *
 * SOME OF THESE WOULD FAIL IF THE PRODUCT GOT MORE HONEST, and where that is true it is said in the
 * test. The exact wording of a label is one of those: `it("says which of the five reasons")` pins
 * the reason a person reads, and if somebody finds better words for it, this test is the thing to
 * change and not the words. What is NOT in that category, and must not be weakened, is every
 * assertion below that a sentence is still reachable and that `unknown` is not drawn as `no`.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
// MESSAGE_ROLES FROM THE CONTRACT FILE, NOT FROM THE AGENT LIBRARY. This test draws a screen and
// touches no database; src/server/lib/agents.ts opens one the moment it is imported. The two types
// beside it are erased before this file runs, so naming that module for them costs nothing.
import { MESSAGE_ROLES, unstampedOriginNote } from '../src/shared/types.ts'
import type { AgentMessageView, AgentRunView } from '../src/server/lib/agents.ts'
import { RECIPIENT_GROUNDS } from '../src/shared/types.ts'
import type { PickUp, RecipientCandidate, RecipientsAnswer } from '../src/server/lib/recipients.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { recipientDisclosureForFixture } from './recipient-answer-disclosure.ts'
import { RECORD_ORIGINS } from '../src/shared/types.ts'
import { TARGET_ATTRIBUTE, targetFromAttributeValue } from '../src/shared/targets.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

type Recipients = typeof import('../src/web/components/agent/Recipients.tsx')
type Context = typeof import('../src/web/components/agent/context.ts')
type Page = typeof import('../src/web/pages/AgentsPage.tsx')

let recipients: Recipients
let words: Context
let page: Page

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in goes in
  // before anything is imported. Nothing here is under test. Copied from tests/agent-talk.test.ts,
  // which says the same thing at more length.
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
  words = await import('../src/web/components/agent/context.ts')
  page = await import('../src/web/pages/AgentsPage.tsx')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

// ---------------------------------------------------------------------------- fixtures

/** Fixed, so "2 days ago" is arithmetic rather than a race with the clock. */
const NOW = Date.parse('2026-08-19T10:00:00')

/** The kind of sentence the server really sends. Test input, not an observation. */
const THE_SENTENCE =
  'The change log says this run created the record you pointed at, on 15 August 2026, and nothing else here ' +
  'created it.'

const CAN_BE_PICKED_UP: PickUp = {
  answer: 'yes',
  runtime: 'claude-code',
  conversationId: 'c1',
  transcript: `${THE_TEST_FIXTURE_ROOT}/.claude/c1.jsonl`,
  resumeCommand: 'claude --resume c1',
  because: 'Its transcript is on this machine.',
}

function candidate(over: Partial<RecipientCandidate> = {}): RecipientCandidate {
  return {
    sessionId: 's1',
    title: 'Round seven build run — Plan and Schedule corrections, then the first Agent Interaction Foundation',
    doing: 'measuring slip above 15N',
    purpose: null,
    workspaceId: 'panelx',
    deleted: false,
    why: THE_SENTENCE,
    ground: 'filed-this-record',
    alsoWhy: [],
    support: 2,
    pickUp: CAN_BE_PICKED_UP,
    origin: 'authored',
    originNote: null,
    recordedState: null,
    lastSeenAt: '2026-08-17 10:00:00',
    lastSeenFrom: 'change-log',
    tiedWith: [],
    ...over,
  }
}

function answer(over: Partial<RecipientsAnswer> = {}): RecipientsAnswer {
  const connected = over.connected ?? [candidate()]
  const recent = over.recent ?? []
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

function message(over: Partial<AgentMessageView> = {}): AgentMessageView {
  return {
    id: 'm1',
    threadId: 't1',
    position: 1,
    role: 'human',
    intent: 'ask',
    body: 'Did the mast move between the two runs, and does the report say so?',
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
    createdAt: '2026-08-18 09:00:00',
    createdBy: THE_TEST_OFFICES_OWNER.id,
    ...over,
  }
}

function run(over: Partial<AgentRunView> = {}): AgentRunView {
  return {
    id: 'run1',
    threadId: 't1',
    workspaceId: 'panelx',
    threadTitle: 'Ask: the mast',
    runtime: 'claude-code',
    state: 'finished',
    recipientSessionId: 's1',
    resume: null,
    claimedBy: null,
    claimedAt: null,
    claimedFromMachine: null,
    startedAt: null,
    endedAt: null,
    createdAt: '2026-08-18 02:00:00',
    error: null,
    result: { answer: 'The mast moved 4mm and the report does not mention it.' },
    focus: null,
    says: 'This run finished.',
    ...over,
  }
}

/** The names request, still out. `agentName` has its own sentence for that and it is not under test. */
const NO_NAMES = { status: 'loading' } as const

// ============================================================================ the short reading

describe('a short line is a level of its own, never a cut sentence', () => {
  it('says which of the five reasons this is, and when the run was last seen', () => {
    // IF THE WORDING CHANGES BECAUSE SOMEBODY FOUND PLAINER WORDS, CHANGE THIS TEST. What it is
    // really holding is the shape: a reason drawn from `ground`, a dot, and an age.
    const read = recipients.shortReading(candidate(), NOW)
    expect(read.line).toBe('Created this · 2 days ago')
  })

  it('never puts the server sentence on the line, at any length', () => {
    // THE FAILURE THIS PREVENTS: `line` becoming `candidate.why.slice(0, 40)`. It would look
    // reasonable on the fixture in this file and be a broken sentence on the owner's corpus.
    const read = recipients.shortReading(candidate(), NOW)
    expect(read.line).not.toContain('change log')
    expect(THE_SENTENCE.startsWith(read.line)).toBe(false)
  })

  it('says a run nothing connects to this is not connected, on the row and not only in the heading', () => {
    // A row read on its own must not look ranked. The heading says it once for the whole list; a
    // person scanning rows reads one row.
    const read = recipients.shortReading(candidate({ ground: null }), NOW)
    expect(read.line).toContain('Not connected to this')
  })

  it('cuts a long name at a word and says it was cut', () => {
    const read = recipients.shortReading(candidate(), NOW)
    expect(read.name.endsWith(' …')).toBe(true)
    expect(read.name.length).toBeLessThanOrEqual(words.LABEL_CHARACTERS + 2)
    // Nothing is only available in a cut form. The whole title travels with it.
    expect(read.wholeName).toBe(candidate().title)
    // AND IT IS CUT AT A SPACE. A cut inside a word reads as a different word.
    expect(read.name.replace(' …', '').endsWith('—') || !read.name.includes('  ')).toBe(true)
  })

  it('leaves a short name alone and marks nothing', () => {
    const read = recipients.shortReading(candidate({ title: 'Round 7 agent' }), NOW)
    expect(read.name).toBe('Round 7 agent')
  })
})

describe('whether a run can be picked up, at both lengths, from one decision', () => {
  it('says nothing at all when it can', () => {
    expect(recipients.shortReading(candidate(), NOW).pickUp).toBe(null)
    expect(recipients.pickUpReading(CAN_BE_PICKED_UP)).toBe(null)
  })

  it('separates "there is nothing to pick up" from "I could not find out", in the SHORT form too', () => {
    // THE FAILURE THIS PREVENTS, and it is the reason the short form is a map rather than a cut:
    // `unknown` shortened to the same three words as `no` is the second engineering rule broken on
    // the one path where breaking it hands somebody's words to an agent that never heard of the work.
    const gone = recipients.shortReading(
      candidate({ pickUp: { answer: 'no', why: 'transcript-gone', because: 'The transcript is not here.' } }),
      NOW,
    )
    expect(gone.pickUp?.bad).toBe(true)
    expect(gone.pickUp?.words).toBe('Needs a new run')

    const unsure = recipients.shortReading(
      candidate({
        pickUp: { answer: 'unknown', why: 'transcript-unreadable', because: 'The file could not be read.' },
      }),
      NOW,
    )
    expect(unsure.pickUp?.bad).toBe(false)
    expect(unsure.pickUp?.words).not.toContain('Needs a new run')
    expect(unsure.pickUp?.words).toContain('Not known')
  })

  it('gives the short mark and the sentence the same verdict, because one function decides both', () => {
    for (const pickUp of [
      { answer: 'no', why: 'never-observed', because: 'Mole Office never saw this run.' },
      { answer: 'unknown', why: 'runtime-unknown', because: 'Nothing says which tool this was.' },
    ] as const) {
      const read = recipients.pickUpReading(pickUp)
      const note = recipients.pickUpNote(pickUp)
      expect(read?.bad).toBe(note?.bad)
      expect(note?.words).toBe(read?.whole)
      // The sentence is the server's own and is carried whole, never summarised away.
      expect(read?.whole).toContain(pickUp.because)
    }
  })
})

describe('how a session record got here is short on the row and whole behind the fold', () => {
  it('says a fixture session is not a real run, without anybody opening anything', () => {
    const read = recipients.shortReading(
      candidate({ origin: 'fixture', originNote: 'This session record is fixture content. It is not a real run.' }),
      NOW,
    )
    expect(read.origin).toBe('Not a real run')
  })

  it('says nobody stamped it, rather than leaving a blank that reads as "nothing is wrong"', () => {
    const read = recipients.shortReading(
      candidate({ origin: null, originNote: unstampedOriginNote() }),
      NOW,
    )
    expect(read.origin).toContain('Nobody said')
  })

  it('says nothing where the server said nothing, so the browser never invents a warning', () => {
    // THE SERVER DECIDES WHETHER, THIS DECIDES HOW SHORT. A browser that decided which origins are
    // worth a warning would be a second copy of that rule, free to disagree with the first.
    expect(recipients.shortReading(candidate({ origin: 'fixture', originNote: null }), NOW).origin).toBe(null)
  })
})

// ============================================================================ the maps are total

/**
 * A VALUE ADDED ON THE SERVER MUST NOT DRAW BLANK.
 *
 * `tsc` already forces an entry for a value added to one of these unions, because each map is a
 * `Record` over it. What it cannot catch is a value REMOVED from the server and left here, or a key
 * misspelt in a way that still type-checks through an index signature. These compare the keys
 * against the server's own arrays, which is the "make a test fail when the two disagree" answer
 * `CLAUDE.md` asks for.
 */
describe('the short vocabulary is total over the server unions', () => {
  const keys = (map: object) => Object.keys(map).sort()

  it('has a label for every reason an agent can be ranked, and no others', () => {
    expect(keys(words.GROUND_LABELS)).toEqual([...RECIPIENT_GROUNDS].sort())
  })

  it('has a mark for every origin a record can carry, and no others', () => {
    expect(keys(words.ORIGIN_MARKS)).toEqual([...RECORD_ORIGINS].sort())
  })

  it('has a word for every role a message can have, and no others', () => {
    expect(keys(words.ROLE_WORDS)).toEqual([...MESSAGE_ROLES].sort())
  })

  it('has a mark for all three pick-up answers, and `yes` is deliberately nothing', () => {
    expect(keys(words.PICK_UP_MARKS)).toEqual(['no', 'unknown', 'yes'])
    expect(words.PICK_UP_MARKS.yes).toBe(null)
  })
})

// ============================================================================ the picker

describe('the picker lists agents in three lines and keeps every sentence', () => {
  const drawn = (over: Partial<RecipientsAnswer> = {}) =>
    render(
      h(recipients.RecipientPicker, {
        context: { target: { kind: 'record', recordId: 'r1', workspaceId: 'panelx' } },
        recipients: { status: 'ready', value: answer(over) },
        onChoose: () => {},
        onClose: () => {},
        reviewOn: false,
      }),
    )

  /** Everything above the fold. The rows are drawn before it; the sentences are inside it. */
  const rows = (html: string) => html.split('<details')[0] ?? ''

  it('draws no paragraph of provenance on a row', () => {
    // THE OWNER'S COMPLAINT, AS AN ASSERTION. A row used to carry the reason, the other reasons, how
    // the record got here and the pick-up sentence — four paragraphs, times every candidate.
    const html = drawn({
      connected: [
        candidate({
          alsoWhy: ['It also wrote to the report on 16 August.'],
          originNote: 'This session record is fixture content. It is not a real run.',
          origin: 'fixture',
          pickUp: { answer: 'no', why: 'transcript-gone', because: 'The transcript is not on this machine.' },
        }),
      ],
    })
    expect(rows(html)).not.toContain('change log')
    expect(rows(html)).not.toContain('It also wrote to the report')
    expect(rows(html)).not.toContain('not on this machine')
    expect(rows(html)).not.toContain('fixture content')
  })

  it('still says on the row the two things that change what a person should do', () => {
    const html = drawn({
      connected: [
        candidate({
          origin: 'fixture',
          originNote: 'This session record is fixture content. It is not a real run.',
          pickUp: { answer: 'no', why: 'transcript-gone', because: 'The transcript is not on this machine.' },
        }),
      ],
    })
    // A run that cannot be picked up, and a record that is not a real run. Both refuse or redirect
    // the send, so neither may be something a reader has to open something to find out.
    expect(rows(html)).toContain('Needs a new run')
    expect(rows(html)).toContain('Not a real run')
  })

  it('keeps every sentence the server sent, behind one press', () => {
    // SHORTENING BY DELETING IS THE FAILURE THIS WHOLE REDESIGN IS AGAINST. The archive stays
    // complete; only the tracking layer gets small.
    const html = drawn({
      connected: [
        candidate({
          alsoWhy: ['It also wrote to the report on 16 August.'],
          originNote: 'This session record is fixture content. It is not a real run.',
          origin: 'fixture',
          pickUp: { answer: 'no', why: 'transcript-gone', because: 'The transcript is not on this machine.' },
        }),
      ],
    })
    expect(html).toContain(THE_SENTENCE)
    expect(html).toContain('It also wrote to the report on 16 August.')
    expect(html).toContain('This session record is fixture content.')
    expect(html).toContain('The transcript is not on this machine.')
    // And the rule that produced the ranking, which used to be the only thing behind the fold.
    expect(html).toContain('Five things count, strongest first.')
  })

  it('writes out the unranked agents too, so nothing on the list is unexplained', () => {
    const html = drawn({
      recent: [
        candidate({
          sessionId: 's9',
          title: 'Some other run',
          ground: null,
          pickUp: { answer: 'unknown', why: 'runtime-unknown', because: 'Nothing says which tool this was.' },
        }),
      ],
    })
    expect(html).toContain('Nothing says which tool this was.')
  })
})

// ============================================================================ beside the box

describe('what the composer draws beside the To control', () => {
  const reading = (over: Partial<RecipientCandidate> = {}, withName = true) =>
    render(h(recipients.RecipientReading, { candidate: candidate(over), withName }))

  it('is the reason line, and the reason line is what opens the sentences', () => {
    // THIS IS WHAT KEEPS IT TO THREE LINES. The short line is the fold's own summary rather than a
    // line with a separate press underneath it saying the same thing again.
    const html = reading()
    expect(html).toContain('<details')
    expect(html).toContain('why this agent')
    const summary = html.slice(html.indexOf('<summary'), html.indexOf('</summary>'))
    expect(summary).toContain('Created this ·')
    expect(summary).not.toContain('change log')
  })

  it('leaves the pick-up mark outside the fold, because it decides whether Send works at all', () => {
    const html = reading({
      pickUp: { answer: 'no', why: 'transcript-gone', because: 'The transcript is not on this machine.' },
    })
    expect(html.indexOf('Needs a new run')).toBeGreaterThan(html.indexOf('</details>'))
  })

  it('leaves the name off when the control above already carries it', () => {
    expect(reading({}, false)).not.toContain('px-talk-suggest-who')
    expect(reading({}, true)).toContain('px-talk-suggest-who')
  })
})

// ============================================================================ answering a reply

describe('an agent answer is a message, and continuing from it is the ordinary gesture', () => {
  const drawn = (over: Partial<AgentMessageView> = {}) =>
    render(h(page.MessageLine, { message: message(over), names: NO_NAMES }))

  it('can be pointed at: the wrapper reads back as this exact message', () => {
    // THE CHECK THE BRIEF ASKED FOR. An agent message is already one of the thirteen targets, so
    // pointing at one should need nothing of its own — this proves the attribute the one document
    // listener walks up to is really there and really reads back.
    const html = drawn({ role: 'agent', recipient: null })
    const found = /data-target="([^"]+)"/.exec(html)
    expect(found, 'the message carries nothing anybody can point at').not.toBe(null)
    const read = targetFromAttributeValue(found?.[1] ?? '')
    expect(read).toEqual({ target: { kind: 'agentMessage', messageId: 'm1' } })
    expect(html).toContain(TARGET_ATTRIBUTE)
  })

  it('says which stored string the reply is and where it starts, so a few words can be quoted exactly', () => {
    // Without these two, selecting part of a reply gets a comment about the whole message instead of
    // about the words — which is the honest refusal, and it is not what this surface should do.
    const html = drawn({ role: 'agent', recipient: null })
    expect(html).toContain('data-text-field="body"')
    expect(html).toContain('data-text-offset="0"')
  })

  it('is labelled by who said it, not by one of the five things a person can mean', () => {
    const html = drawn({ role: 'agent', recipient: null, intent: 'ask' })
    expect(html).toContain('The agent answered')
    // AN ANSWER IS NOT A QUESTION AND IS NOT ADDRESSED TO ANYBODY. Drawing it as "Ask · Nobody
    // chosen" was two false statements about it, and both looked like ordinary furniture.
    expect(html).not.toContain(sayInEnglish('g6a.agents.noRecipient'))
    expect(html).not.toContain('>Ask<')
  })

  it('still labels a person’s message by what they meant, and by who it went to', () => {
    const html = drawn()
    expect(html).toContain('>Ask<')
    expect(html).toContain('px-review-to')
    expect(html).not.toContain('The agent answered')
  })
})

// ============================================================================ the send button

describe('whether what is written here will join a review', () => {
  let talk: typeof import('../src/web/components/agent/TalkBox.tsx')
  beforeAll(async () => {
    talk = await import('../src/web/components/agent/TalkBox.tsx')
  })

  it('says NO when nothing is collecting, which is what puts Send on the composer', () => {
    // THE DEFECT THIS PINS, photographed on 19 August 2026: with no review collecting — the
    // ordinary state — the composer offered only "Write it down and keep it", and told the reader
    // to finish the collecting in a review that did not exist. A message could not be sent to an
    // agent from anywhere in Mole Office, and nothing failed.
    expect(talk.joinsTheCollectingReview({ collecting: [], reaching: null })).toBe(false)
    expect(talk.joinsTheCollectingReview({ collecting: [], reaching: ['rv1'] })).toBe(false)
  })

  it('keeps "Mole Office has not answered yet" apart from "no", because they are different situations', () => {
    // Flipping the buttons under somebody mid-read is what `null` exists to avoid. Both requests
    // can be out at once, so either list being unanswered is the same waiting answer.
    expect(talk.joinsTheCollectingReview({ collecting: null, reaching: null })).toBe(null)
    expect(talk.joinsTheCollectingReview({ collecting: null, reaching: ['rv1'] })).toBe(null)
    expect(talk.joinsTheCollectingReview({ collecting: ['rv1'], reaching: null })).toBe(null)
    expect(talk.joinsTheCollectingReview({ collecting: ['rv1'], reaching: [] })).toBe(false)
    expect(talk.joinsTheCollectingReview({ collecting: ['rv1'], reaching: ['rv1'] })).toBe(true)
    expect(talk.joinsTheCollectingReview({ collecting: ['rv1'], reaching: ['rv2'] })).toBe(false)
  })

  it('says YES when any collecting review reaches here, and not only the first one', () => {
    // SEVERAL REVIEWS CAN COLLECT AT ONCE — one per scope — and a comment joins every one whose
    // scope reaches it. Asking about one of them was the browser answering a narrower question
    // than the person's, which is whether these words will be collected at all.
    expect(talk.joinsTheCollectingReview({ collecting: ['rv1', 'rv2'], reaching: ['rv2'] })).toBe(true)
    expect(talk.joinsTheCollectingReview({ collecting: ['rv1', 'rv2'], reaching: ['rv3'] })).toBe(false)
  })
})

describe('an answer is drawn once', () => {
  it('draws the run’s answer when it is not a message in the conversation', () => {
    const html = render(h(page.RunLine, { run: run(), names: NO_NAMES }))
    expect(html).toContain('The mast moved 4mm')
  })

  it('leaves it to the message when THIS run has already said it up the page', () => {
    // IT IS THE RUN'S OWN ID, NOT A GUESS ABOUT THE THREAD. A thread holding one agent message does
    // not prove that every run's answer is one of them, and hiding it on that reasoning would lose
    // the answer of every run finished before answers became messages.
    expect(render(h(page.RunLine, { run: run(), names: NO_NAMES, answeredAbove: ['run1'] }))).not.toContain(
      'The mast moved 4mm',
    )
    expect(
      render(h(page.RunLine, { run: run(), names: NO_NAMES, answeredAbove: ['some other run'] })),
    ).toContain('The mast moved 4mm')
  })
})

// ============================================================================ who a message is for

/**
 * A DURABLE AGENT IS NOT A RUN, AND THE LINE THAT NAMES ONE HAS TO READ THE RIGHT FIELD.
 *
 * The recipient a message carries holds exactly one of two ids — a run under `sessionId`, a durable
 * agent under `agentId` — and `kind` says which. It was one field called `sessionId` until 25 August
 * 2026, which put an agent record's id under the name of a run; the value was right and the name was
 * not. Reading `sessionId` alone now would call a durable agent "a new agent", which is why the
 * choice lives in one function rather than at each surface that draws a recipient.
 */
describe('what to call whoever a message is for', () => {
  const filed = (id: string, kind: 'session' | 'agent', title: string) =>
    ({ id, kind, title, workspaceId: 'panelx', summary: null, data: {}, createdAt: '', updatedAt: '', deletedAt: null }) as never
  const READY = {
    status: 'ready',
    value: [filed('r1', 'session', 'The gripper calibration run'), filed('a1', 'agent', 'round-ten')],
  } as never

  it('names a durable agent from the agent field, and a run from the run field', async () => {
    const names = await import('../src/web/components/agent/names.ts')
    expect(names.nameOfWhoever(READY, { kind: 'agent', agentId: 'a1', sessionId: null })).toBe('round-ten')
    expect(names.nameOfWhoever(READY, { kind: 'session', sessionId: 'r1', agentId: null })).toBe(
      'The gripper calibration run',
    )
  })

  it('says a deliberately new agent is one, and says when it cannot name what it was given', async () => {
    const names = await import('../src/web/components/agent/names.ts')
    expect(names.nameOfWhoever(READY, { kind: 'new', sessionId: null, agentId: null })).toBe('a new agent')
    expect(names.nameOfWhoever(READY, { kind: 'agent', agentId: 'gone', sessionId: null })).toBe(
      names.AN_AGENT_NO_LONGER_FILED,
    )
  })
})
