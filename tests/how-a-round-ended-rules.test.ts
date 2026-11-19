// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY A ROUND ENDED WITHOUT A SEAL, AND WHAT A RUN'S LAST MESSAGE SAYS ABOUT ITS SEAL. Wave 13j round loop-1, task "every
 * round ends sealed or says why". The rules are in src/server/lib/how-a-round-ended-rules.ts, which opens no database, so
 * this file reads them with made facts and no office.
 *
 * WHAT IS PROVED.
 *   1. A message that says plainly it will not seal is a stop; "If main has moved, I will not seal" is a condition and not a
 *      stop (the 8 October 23:51 case, 13s round 30b); "I seal next" says it seals; a message that says neither says nothing.
 *   2. Each fact the office reads gives its own reason: the process died, no commits, commits not known, no report (and a
 *      report linked elsewhere is named), the agent stopped to ask, another folder, a stale base. With none of them the
 *      reason is "not sealed" with the launcher's words.
 *   3. What to do names the run and the record each reason names.
 *   4. Words inside a quotation are not the agent's own, so they say nothing about its seal (the 15 October case: a message
 *      that said "I seal next" held its run's check because it quoted the office's title "A round ended without a seal").
 *      A quotation is text in straight or curly double quotes, or in backticks, on one line. A sentence is not split
 *      inside one, and a condition word or a question mark inside one counts for nothing. Since the 12 November case (a
 *      message that said "I seal next" held its check on a step name it quoted in single quotes), text in straight or
 *      curly single quotes inside one sentence is a quotation too. An apostrophe inside a word or at its end opens none,
 *      so "I won't seal" and "the tests' check" are still read.
 *   5. Only what the run says about itself is read. "I will not seal" and "I seal next" always are. A sentence that says
 *      "no seal", "without a seal", "not sealing" or "sealing now" with no "I" or "we" is read unless it names a run that
 *      is not this one: it says "run" or "runs", and not "this run", "my run", "our run", "the run" or the run's own id.
 *      So a sentence about the run this one continues is not a stop (the 17 October case, problem Rg6Wt8oUDYDi: a message
 *      that said "I seal next" held its check on "That run stopped at 15:31 on the login's weekly limit (429) with no
 *      seal."). "No seal this round" is still a stop, and so is a sentence that names another run and also says "I will
 *      not seal". The reason names the sentence the office read as the stop, as the agent wrote it, so the starter sees at
 *      once what was read.
 *   6. "No seal" right after refuse, block, stop or prevent says what a thing lets through, so it is not a stop (the 12
 *      November case: a message that said "I seal next" held its check on "A fault of form is listed before the seal and
 *      refuses no seal at "remind" or "off"."). "I will not seal" and "No seal this round" are still stops, in a sentence
 *      of their own or beside such a "no seal".
 *
 * MUTATION, RUN ON 11 OCTOBER 2026. A control run first: all green. Then the `!A_CONDITION.test(one)` part of
 * `whatAMessageSaysAboutTheSeal` was removed, so a condition reads as a stop. "reads the 8 October sentence as a condition"
 * and "reads a message that only sets a condition as not saying it seals" went red. Restored, and the control run again: green.
 *
 * MUTATION, RUN ON 18 OCTOBER 2026 (run Xa4apWAhUUjs). A control run first: all green. Then `itIsAboutAnotherRun` was made
 * to answer false, so every sentence is read as this run's; the three cases under "when it names another run" and "gives no
 * stopped-to-ask reason for the 17 October message" went red. Separately, its `!read.includes(runId)` part was removed, so
 * a run that names itself by its id reads as another run; "still reads a stop that is this run's" went red. Each restored,
 * and the control run again: green.
 */
import { describe, expect, it } from 'vitest'
import { SESSION_STATES } from '../src/shared/types.ts'
import { WHY_NO_SEAL } from '../src/shared/how-the-round-ended.ts'

import {
  itAsksSomething,
  theSentenceThatSaysItWillNotSeal,
  whatAMessageSaysAboutTheSeal,
  whatTheEndSays,
  whatToDoAfterTheseReasons,
  whyTheRoundEndedWithoutASeal,
  type TheFactsAtTheEnd,
} from '../src/server/lib/how-a-round-ended-rules.ts'
import { THE_MESSAGE, THE_SENTENCE } from './a-quotation-that-held-a-check-fixture.ts'
import { THE_MESSAGE_ABOUT_THE_RUN_BEFORE, THE_SENTENCE_ABOUT_THE_RUN_BEFORE } from './a-sentence-about-another-run-fixture.ts'
import {
  THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES,
  THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL,
  THE_SENTENCE_ABOUT_WHAT_A_GATE_LETS_THROUGH,
  THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES,
} from './a-gate-that-refuses-no-seal-fixture.ts'

/** The run whose messages are read: the same id as `facts()` below. */
const RUN = 'synthRun0001'

/** A round that did everything but seal: commits, a report about it, no message, one folder. */
function facts(over: Partial<TheFactsAtTheEnd> = {}): TheFactsAtTheEnd {
  return {
    runId: RUN,
    state: 'running',
    commandEnded: { code: 0, signal: null },
    commits: 2,
    reportsAboutTheRun: ['synthReport1'],
    reportsElsewhere: [],
    lastMessage: null,
    folder: { filedIn: '/synthetic/worktree', now: '/synthetic/worktree' },
    forkBase: 'a'.repeat(40),
    staleBases: [],
    detail: null,
    ...over,
  }
}

describe('what a message says about the seal', () => {
  it('reads the 8 October sentence as a condition, and a plain refusal as a stop', () => {
    expect(whatAMessageSaysAboutTheSeal('If main has moved, I will not seal.', RUN)).toBe('it-does-not-say')
    expect(whatAMessageSaysAboutTheSeal('Unless the tests pass, I will not seal. I seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The tests are red. I will not seal.', RUN)).toBe('it-will-not-seal')
    expect(whatAMessageSaysAboutTheSeal("I won't seal this round; the base is wrong.", RUN)).toBe('it-will-not-seal')
  })

  it('reads "I seal next" as sealing, and a message that says neither as saying nothing', () => {
    expect(whatAMessageSaysAboutTheSeal('The report is filed.\nI seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('Sealing now.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('Which of the two layouts do you want?', RUN)).toBe('it-does-not-say')
  })
})

describe('what a message says about the seal, when it quotes somebody else', () => {
  it('reads the 15 October message as sealing: its quotation of the office\'s title is not the agent saying it stops', () => {
    expect(whatAMessageSaysAboutTheSeal(THE_MESSAGE, RUN)).toBe('it-seals')
    expect(theSentenceThatSaysItWillNotSeal(THE_MESSAGE, RUN)).toBeNull()
    expect(whatAMessageSaysAboutTheSeal(THE_SENTENCE, RUN)).toBe('it-does-not-say')
  })

  it('reads no quotation as the agent\'s own words: straight or curly double quotes, or backticks', () => {
    expect(whatAMessageSaysAboutTheSeal('You wrote "I will not seal" last round. I seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The title was “No seal this round”. I seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The test is named `stopping before the seal`. I seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The note said "Sealing now" and nothing more.', RUN)).toBe('it-does-not-say')
  })

  it('reads the 12 November message as sealing: its step name in single quotes is not the agent saying it stops', () => {
    expect(whatAMessageSaysAboutTheSeal(THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES, RUN)).toBe('it-seals')
    expect(theSentenceThatSaysItWillNotSeal(THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES, RUN)).toBeNull()
    expect(whatAMessageSaysAboutTheSeal(THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES, RUN)).toBe('it-does-not-say')
  })

  it('reads straight or curly single quotes in one sentence as a quotation, and an apostrophe as none', () => {
    expect(whatAMessageSaysAboutTheSeal("The step was named 'no seal this round'. I seal next.", RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The title was ‘No seal this round’. I seal next.', RUN)).toBe('it-seals')
    expect(theSentenceThatSaysItWillNotSeal("I won't seal this round; the base is wrong.", RUN)).toBe("I won't seal this round;")
    expect(theSentenceThatSaysItWillNotSeal("The tests' check is red, so no seal this round.", RUN)).toBe("The tests' check is red, so no seal this round.")
    expect(theSentenceThatSaysItWillNotSeal("The runs' checks are red, and I don't seal: 'x' failed.", RUN)).toBe("The runs' checks are red, and I don't seal: 'x' failed.")
    expect(theSentenceThatSaysItWillNotSeal("Tell 'em I will not seal; the tests' check is red.", RUN)).toBe("Tell 'em I will not seal;")
    expect(theSentenceThatSaysItWillNotSeal("I don't seal, and the runs' check is red.", RUN)).toBe("I don't seal, and the runs' check is red.")
    expect(theSentenceThatSaysItWillNotSeal("'Tis plain: I won't seal.", RUN)).toBe("'Tis plain: I won't seal.")
  })

  it('does not split a sentence inside a quotation, nor read a condition word or a question mark inside one', () => {
    expect(whatAMessageSaysAboutTheSeal('The other line wrote "Done. No seal yet." to its starter. I seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The page says "if in doubt, ask", and I will not seal.', RUN)).toBe('it-will-not-seal')
    expect(itAsksSomething('The note said "Which run? Mine." and nothing more.')).toBe(false)
    expect(itAsksSomething('Which run is mine? The note did not say.')).toBe(true)
  })

  it('names the sentence as the agent wrote it, quotation and all', () => {
    const body = 'The base is stale, and the office sent "A round ended without a seal". I will not seal: "the tests" are red.'
    expect(theSentenceThatSaysItWillNotSeal(body, RUN)).toBe('I will not seal: "the tests" are red.')
    expect(theSentenceThatSaysItWillNotSeal('If main has moved, I will not seal.', RUN)).toBeNull()
  })
})

describe('what a message says about the seal, when it names another run', () => {
  it('reads the 17 October message as sealing: its sentence about the run it continues is not this run stopping', () => {
    expect(whatAMessageSaysAboutTheSeal(THE_MESSAGE_ABOUT_THE_RUN_BEFORE, RUN)).toBe('it-seals')
    expect(theSentenceThatSaysItWillNotSeal(THE_MESSAGE_ABOUT_THE_RUN_BEFORE, RUN)).toBeNull()
    expect(whatAMessageSaysAboutTheSeal(THE_SENTENCE_ABOUT_THE_RUN_BEFORE, RUN)).toBe('it-does-not-say')
  })

  it('reads an unquoted sentence about other runs\' seals as saying nothing about this run', () => {
    const body = 'Both worker runs ended without a seal. I seal next.'
    expect(whatAMessageSaysAboutTheSeal(body, RUN)).toBe('it-seals')
    expect(theSentenceThatSaysItWillNotSeal(body, RUN)).toBeNull()
    expect(whatAMessageSaysAboutTheSeal('That run had no seal, so I seal next.', RUN)).toBe('it-seals')
    expect(whatAMessageSaysAboutTheSeal('The worker run is sealing now.', RUN)).toBe('it-does-not-say')
  })

  it('still reads a stop that is this run\'s: no run named, this run named, or "I" in the sentence', () => {
    expect(theSentenceThatSaysItWillNotSeal('No seal this round. I seal next.', RUN)).toBe('No seal this round.')
    expect(theSentenceThatSaysItWillNotSeal('This run goes without a seal. I seal next.', RUN)).toBe('This run goes without a seal.')
    expect(theSentenceThatSaysItWillNotSeal('My run is stopping before the seal. I seal next.', RUN)).toBe('My run is stopping before the seal.')
    expect(theSentenceThatSaysItWillNotSeal('The run is not sealing. I seal next.', RUN)).toBe('The run is not sealing.')
    expect(theSentenceThatSaysItWillNotSeal(`Run ${RUN} ends with no seal. I seal next.`, RUN)).toBe(`Run ${RUN} ends with no seal.`)
    expect(theSentenceThatSaysItWillNotSeal('That run had no seal, and I will not seal either.', RUN)).toBe(
      'That run had no seal, and I will not seal either.',
    )
    expect(whatAMessageSaysAboutTheSeal('Run synthRun0002 is sealing now.', RUN)).toBe('it-does-not-say')
  })
})

describe('what a message says about the seal, when "no seal" is what a thing lets through', () => {
  it('reads the 12 November message as sealing: its gate that refuses no seal is not this run stopping', () => {
    expect(whatAMessageSaysAboutTheSeal(THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL, '5S0ss9-wi3Pk')).toBe('it-seals')
    expect(theSentenceThatSaysItWillNotSeal(THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL, '5S0ss9-wi3Pk')).toBeNull()
    expect(theSentenceThatSaysItWillNotSeal(THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL, RUN)).toBeNull()
    expect(whatAMessageSaysAboutTheSeal(THE_SENTENCE_ABOUT_WHAT_A_GATE_LETS_THROUGH, RUN)).toBe('it-does-not-say')
  })

  it('reads no seal after refuse, block, stop or prevent as saying nothing about this run', () => {
    const sentences = [
      'The gate refuses no seal.',
      'The hard gate refused no seal today.',
      'A reminder blocks no seal.',
      'The list stops no seal.',
      'The check prevents no seal.',
    ]
    expect(sentences.filter((one) => theSentenceThatSaysItWillNotSeal(`${one} I seal next.`, RUN) !== null)).toEqual([])
    expect(sentences.filter((one) => whatAMessageSaysAboutTheSeal(`${one} I seal next.`, RUN) !== 'it-seals')).toEqual([])
  })

  it('still reads "I will not seal" and "no seal this round" as a stop, alone or beside such a sentence', () => {
    expect(theSentenceThatSaysItWillNotSeal('The tests are red. I will not seal.', RUN)).toBe('I will not seal.')
    expect(theSentenceThatSaysItWillNotSeal('The tests are red, so no seal this round.', RUN)).toBe('The tests are red, so no seal this round.')
    expect(theSentenceThatSaysItWillNotSeal('The gate refuses no seal. No seal this round.', RUN)).toBe('No seal this round.')
    expect(theSentenceThatSaysItWillNotSeal('The gate refuses no seal, and I will not seal.', RUN)).toBe('The gate refuses no seal, and I will not seal.')
    expect(whatAMessageSaysAboutTheSeal(`${THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL}\nNo seal this round.`, RUN)).toBe('it-will-not-seal')
    expect(theSentenceThatSaysItWillNotSeal(`${THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES} I will not seal.`, RUN)).toBe('I will not seal.')
    expect(theSentenceThatSaysItWillNotSeal(`${THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES}\nNo seal this round.`, RUN)).toBe('No seal this round.')
  })
})

describe('why a round ended without a seal', () => {
  it('carries a refused clean finish in the notice without calling the exit a process death', () => {
    const refusal = 'Synthetic refusal from the finish door.'
    const reasons = whyTheRoundEndedWithoutASeal(facts({ state: SESSION_STATES[3], detail: refusal, commits: 0 }))
    expect(reasons.map((reason) => reason.why)).not.toContain(WHY_NO_SEAL[0])
    const notice = whatTheEndSays(RUN, 'Synthetic round', reasons)
    expect(notice.split(refusal)).toHaveLength(2)
  })

  it('says only "not sealed", with the launcher\'s words, when every other fact is in order', () => {
    const reasons = whyTheRoundEndedWithoutASeal(facts({ detail: 'Its command ended.' }))
    expect(reasons).toEqual([{ why: 'not-sealed', says: 'Its command ended and nothing sealed it. The launcher wrote: Its command ended.' }])
  })

  it('names the process, the commits and the report, in that order, for a Codex round that left nothing', () => {
    const reasons = whyTheRoundEndedWithoutASeal(facts({ state: 'orphaned', commandEnded: null, commits: 0, reportsAboutTheRun: [] }))
    expect(reasons.map((one) => one.why)).toEqual(['the-process-died', 'no-commits', 'no-report'])
  })

  it('reads a non-zero exit and a signal as the process dying', () => {
    expect(whyTheRoundEndedWithoutASeal(facts({ commandEnded: { code: 137, signal: null } }))[0]).toEqual({ why: 'the-process-died', says: 'Its command exited 137.' })
    expect(whyTheRoundEndedWithoutASeal(facts({ commandEnded: { code: null, signal: 'SIGKILL' } }))[0]).toEqual({ why: 'the-process-died', says: 'Its command was ended by signal SIGKILL.' })
  })

  it('names a report linked to something other than the run, so the starter can link it', () => {
    const reasons = whyTheRoundEndedWithoutASeal(facts({ reportsAboutTheRun: [], reportsElsewhere: [{ report: 'synthReport2', linkedTo: 'synthModule1' }] }))
    expect(reasons).toEqual([
      {
        why: 'no-report',
        says: 'No report is linked about the run. It filed report synthReport2, which is linked to synthModule1 instead, so nothing waiting on the run sees it.',
        names: 'synthReport2',
      },
    ])
    expect(whatToDoAfterTheseReasons('synthRun0001', reasons)).toBe(
      'Link report synthReport2 to the run with POST /api/links {"fromId":"synthReport2","toId":"synthRun0001","type":"about"}.',
    )
  })

  it('names the message when the agent stopped to ask, and when it said it will not seal', () => {
    const asked = whyTheRoundEndedWithoutASeal(facts({ lastMessage: { id: 'synthMsg0001', body: 'Should I rebase first?' } }))
    expect(asked).toEqual([{ why: 'stopped-to-ask', says: 'Its last message to its starter, synthMsg0001, asks something and does not say it seals.', names: 'synthMsg0001' }])
    const refused = whyTheRoundEndedWithoutASeal(facts({ lastMessage: { id: 'synthMsg0002', body: 'The base is stale. I will not seal.' } }))
    expect(refused[0]).toMatchObject({
      why: 'stopped-to-ask',
      says: 'Its last message to its starter, synthMsg0002, says it will not seal. The office read it from this sentence: "I will not seal."',
    })
  })

  it('reads a message that only sets a condition as not saying it seals, never as saying it will not', () => {
    const conditional = whyTheRoundEndedWithoutASeal(facts({ lastMessage: { id: 'synthMsg0003', body: 'If main has moved, I will not seal.' } }))
    expect(conditional).toEqual([{ why: 'stopped-to-ask', says: 'Its last message to its starter, synthMsg0003, does not say it seals.', names: 'synthMsg0003' }])
    const seals = whyTheRoundEndedWithoutASeal(facts({ lastMessage: { id: 'synthMsg0004', body: 'I seal next.' } }))
    expect(seals.map((one) => one.why)).toEqual(['not-sealed'])
  })

  it('gives no stopped-to-ask reason for the 17 October message, whose only stop is about the run it continues', () => {
    const reasons = whyTheRoundEndedWithoutASeal(facts({ lastMessage: { id: 'synthMsg0005', body: THE_MESSAGE_ABOUT_THE_RUN_BEFORE } }))
    expect(reasons.map((one) => one.why)).toEqual(['not-sealed'])
  })

  it('names another folder and a stale base', () => {
    const base = 'b'.repeat(40)
    const reasons = whyTheRoundEndedWithoutASeal(facts({ folder: { filedIn: '/synthetic/worktree', now: '/synthetic/home' }, forkBase: base, staleBases: [base] }))
    expect(reasons.map((one) => one.why)).toEqual(['another-folder', 'a-stale-base'])
    expect(whatToDoAfterTheseReasons('synthRun0001', reasons)).toBe(
      "Rebase the round's branch onto the current main in the round's own worktree, then seal it there.",
    )
  })

  it('says what is not known rather than guessing about the commits', () => {
    const reasons = whyTheRoundEndedWithoutASeal(facts({ commits: { couldNotRead: 'the worktree is gone.' } }))
    expect(reasons).toEqual([{ why: 'commits-not-known', says: 'Whether the run made commits is not known: the worktree is gone.' }])
  })

  it('puts the run, its title and every reason in one line', () => {
    const reasons = whyTheRoundEndedWithoutASeal(facts({ commits: 0 }))
    expect(whatTheEndSays('synthRun0001', 'Synthetic round', reasons)).toBe('Run synthRun0001 ("Synthetic round") ended without a seal. The run made no commits after it started.')
  })
})
