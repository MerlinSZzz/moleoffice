// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE TO AN AGENT WHOSE RUNTIME IS dsh LEAVES THE WORKER ALIVE, STARTS NOTHING, AND SAYS WHY.
 *
 * Criterion P88, as amended on 12 September 2026, and the secretary's condition on that amendment.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TEST EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `dsh` became a runtime word an agent may declare, so a dsh worker is a citizen with a handle, and
 * a person can write to it from the contact list like anybody else. The office cannot start a run
 * for it: a dsh worker is started by `~/.cache/mole-office/dsh/run-worker.sh` with its brief as the
 * task, and there is no adapter behind the word. Two things must therefore be true and neither is
 * obvious from the code alone:
 *
 *   THE MESSAGE WORKER MUST NOT FALL OVER. `adapterForWordAlone` throws for dsh on purpose, so that
 *     a future word added to the dispatch list with no adapter fails loudly. If that throw were
 *     ever reached from the worker's loop, one message to one handle would stop every delivery on
 *     the machine. It is not reached: the worker calls `adapterFor`, a different function that
 *     returns null, and the reason is produced before either is asked.
 *
 *   THE MESSAGE MUST WAIT AND SAY WHY. Not dropped, not answered by something else, not silently
 *     queued with no reason. This is the M78 shape: a message to an agent nobody holds waits, and
 *     the delivery row carries the sentence.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   1. Remove the `whyTheOfficeCannotStartThisRuntime` check from `whyNotNow`: case 1 goes red,
 *      because the message would be started rather than held.
 *   2. Remove it from the start path (`startOne`): case 5 goes red. That path is NOT the one a
 *      queued message takes — `onePass` holds it at `whyNotNow` first — but `carryOnFromARestart`
 *      calls `startOne` directly, so the check there is on a path nothing else guards.
 *   3. Make `adapterFor` throw for dsh the way `adapterForWordAlone` does: case 4 goes red, which
 *      is the case that proves the loop survives.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import { startOne, whyNotNow } from '../src/worker/index.ts'
import { adapterFor, adapterForWordAlone, THE_RUNTIMES_THE_OFFICE_DISPATCHES } from '../src/worker/runtimes/index.ts'
import {
  AGENT_RUNTIMES,
  RUNTIMES_STARTED_BY_THEIR_OWN_TOOL,
  whyTheOfficeCannotStartThisRuntime,
} from '../src/shared/participants.ts'

/** One waiting message, with the parts these cases do not vary. */
const waiting = {
  messageId: 'm-1',
  workspaceId: 'panelx',
  to: { kind: 'agent', id: 'a-dsh-worker' },
  handle: 'a-dsh-worker',
  runtime: 'dsh',
  retired: false,
  body: 'how is the piece going?',
  sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
  sentAt: '2026-09-12 20:30',
  resume: null,
  hops: 0,
  needsNoRun: null,
  conversationIsWaiting: null,
  runningAlready: null,
  heldByALiveSession: null,
  heldByAReview: null,
  urgent: false,
  nobodyIsAnsweringAsIt: null,
}

const settings = {
  checkout: process.cwd(),
  runs: 2,
  env: { PATH: '/usr/bin' } as NodeJS.ProcessEnv,
} as unknown as Parameters<typeof whyNotNow>[1]

describe('a message to a dsh worker', () => {
  it('is held, with a sentence saying the office does not start a dsh run', () => {
    const said = whyNotNow(waiting as unknown as Parameters<typeof whyNotNow>[0], settings, 0)
    expect(said, 'it is held rather than started').not.toBeNull()
    expect(said).toMatchObject({because: expect.stringContaining('does not start')})
    expect(said).toMatchObject({because: expect.stringContaining('dsh')})
    expect(said, 'and it names the tool that does start one').toMatchObject({because: expect.stringContaining('run-worker.sh')})
  })

  it('says nothing of the kind about a runtime the office does start', () => {
    // A claude-code message may still be held here for another reason — on a machine with no
    // `claude` on its PATH the next check says the tool is not installed — and that is the point:
    // whatever it says, it is never the dsh sentence. Asserting null would be asserting this
    // machine's PATH.
    const said = whyNotNow({ ...waiting, runtime: 'claude-code' } as unknown as Parameters<typeof whyNotNow>[0], settings, 0)
    expect(said, 'the dsh sentence is about dsh alone').not.toEqual(expect.objectContaining({because: expect.stringContaining('run-worker.sh')}))
    expect(said).not.toEqual(expect.objectContaining({because: expect.stringContaining('does not start a "claude-code" run')}))
  })

  it('is one sentence, written once, that both the holding path and the start path read', () => {
    const said = whyTheOfficeCannotStartThisRuntime('dsh')
    expect(said).not.toBeNull()
    expect(whyNotNow(waiting as unknown as Parameters<typeof whyNotNow>[0], settings, 0)).toEqual({because: said})
    // A runtime the office really does start gets no sentence at all, which is what lets the check
    // sit in front of the adapter without changing anything else.
    expect(whyTheOfficeCannotStartThisRuntime('claude-code')).toBeNull()
    expect(whyTheOfficeCannotStartThisRuntime('codex')).toBeNull()
  })

  it('is refused at the start path too, which a restart reaches without passing whyNotNow', async () => {
    // `carryOnFromARestart` calls `startOne` directly. Without this check the path still refuses —
    // adapterFor answers null — but with the sentence "Nothing here serves the runtime word", which
    // tells a reader nothing about what to do. The guard answers before anything is started.
    const said = await startOne(
      waiting as unknown as Parameters<typeof startOne>[0],
      settings as unknown as Parameters<typeof startOne>[1],
      [],
    )
    expect(said.ok).toBe(false)
    if (said.ok) return
    expect(said.because).toBe(whyTheOfficeCannotStartThisRuntime('dsh'))
  })

  it('never reaches the throw, because the worker asks adapterFor and not adapterForWordAlone', () => {
    // THE THROW IS REAL, and this is the case that proves it cannot reach the loop.
    expect(() => adapterForWordAlone('dsh')).toThrow(/does not start a dsh run/)
    expect(adapterFor('dsh'), 'what the worker actually asks').toBeNull()
    expect(() => adapterFor('dsh')).not.toThrow()
  })

  it('is declarable and not dispatchable, and the two lists say so separately', () => {
    expect(AGENT_RUNTIMES, 'a row may declare it').toContain('dsh')
    expect(THE_RUNTIMES_THE_OFFICE_DISPATCHES as readonly string[], 'the office cannot start it').not.toContain('dsh')
    expect(RUNTIMES_STARTED_BY_THEIR_OWN_TOOL, 'and it is named as one started by its own tool').toContain('dsh')
    // EVERY DISPATCHABLE WORD HAS AN ADAPTER. This is what the exhaustive switch is for, and it is
    // checked here rather than only compiled, so a word added to the dispatch list is caught.
    for (const word of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
      expect(() => adapterForWordAlone(word), `${word} has an adapter`).not.toThrow()
    }
  })
})
