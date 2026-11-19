// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE MACHINE READING FOR THIS PAGE LOAD, AND THE RULE FOR READING IT AGAIN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `XKsVmmINput5`, and criterion U7 of design/settings/ACCEPTANCE.md. On the owner's live office
 * between 09:00 and 11:50 on 13 September 2026 the operation `runtime.resources` was called 4,315
 * times by the owner's own browser, 373 ms each — 1,616 s of server time, the costliest thing the server
 * did. `GET /api/runtime` reads /proc and asks the GPU, so each call is a sweep.
 *
 * The cause was measured in a test stack on 13 September 2026, not read off the source. A page
 * whose served code is older than the checkout draws the wrong-world banner, and while the banner
 * is up `WrongWorld` asked `GET /api/runtime` every three seconds to see whether the page had
 * caught up. One tab made 41 calls in 130 seconds; the banner appeared 16.7 s in and the gap
 * between calls after that was 3.04 s, the component's own timer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * One reading, held for the life of the page, shared by every component that draws it. The first
 * caller asks; every caller after it joins the same read or gets the answer already in hand. A
 * re-render, a remount, and a refresh of another band on the page never ask again.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN IT IS READ AGAIN: WHEN THE SERVER SAYS IT CHANGED, AND ON A TIMER ONLY WHILE BLOCKED
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13w round 25. Until then the page read it again every thirty
 * seconds while it was shown: 1,149 reads a day on the owner's office, 439 ms each at the median.
 * Now it is read again only
 *
 *   · when the server announces `machine.changed`. The server looks every fifteen seconds while a
 *     person has a page open, at the parts a page compares or shows (`whatAPageHoldsOfTheMachine` in
 *     src/server/lib/runtime.ts), and announces only when one moved;
 *   · when the event stream comes back after it was down, because nothing told this page what
 *     happened meanwhile;
 *   · when events were lost, for the same reason;
 *   · when a person presses for a newer reading (`readTheMachineAgain`);
 *   · every thirty seconds while the wrong-world sheet blocks the page, and only then
 *     (`readTheMachineWhileThePageIsBlocked`).
 *
 * A hidden page reads once when it is shown again, not while nobody can see it. A change heard
 * while a read is out is read again once that read settles, because the read that was out may
 * have been answered before the change.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT `oneRead`
 * ---------------------------------------------------------------------------------------
 *
 * `src/web/lib/oneread.ts` holds one answer per project and is the right shape for a door whose
 * answer is about the project on screen. This reading is not about a project, and more than one
 * component has to redraw when it changes, so it is a small store with subscribers rather than a
 * project-keyed slot: `useTheMachineState` is what a component reads it through.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { hearAlways, useChannel, whenEventsWereLost, whenTheStreamCameBack } from './channel.ts'
import { aMachineReadClock } from './oneclock.ts'
import type { RuntimeRecord } from '@shared/runtime.ts'

/** What the page has of the machine right now, and whether a read is on its way. */
export interface MachineReadingState {
  /** The last reading, or null when none has come back. */
  value: RuntimeRecord | null
  /** The last failure, or null. A failure does NOT throw away a reading already in hand. */
  failed: { message: string; fault?: Fault | null } | null
  /** True once a read has come back or failed, so a caller can tell loading from nothing yet. */
  settled: boolean
  /** True while a read is out. What is on screen does not move meanwhile. */
  inFlight: boolean
}

let state: MachineReadingState = { value: null, failed: null, settled: false, inFlight: false }
let inFlight: Promise<RuntimeRecord> | null = null
const listeners = new Set<() => void>()
/** A change was heard while a read was out, so one more read is owed when it settles. */
let owedAfterThisRead = false
/** A change was heard while the page was hidden, so one read is owed when it is shown. */
let owedWhenShown = false
/** The ways to stop hearing the channel, once this page has started to. */
let stopHearing: (() => void) | null = null
/** When the last read came back or failed, whatever asked for it, or null before the first. */
let lastSettledAtMs: number | null = null

function put(next: MachineReadingState): void {
  state = next
  for (const listener of listeners) listener()
}

/** The current reading, as one stable snapshot between changes. */
export function theMachineState(): MachineReadingState {
  return state
}

export function subscribeToTheMachine(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function start(): Promise<RuntimeRecord> {
  // A read already out is the one this caller wants: joining it is not a second sweep.
  if (inFlight !== null) return inFlight
  put({ ...state, inFlight: true, failed: null })
  const settled = (): void => {
    inFlight = null
    lastSettledAtMs = Date.now()
    if (!owedAfterThisRead) return
    owedAfterThisRead = false
    readBecauseItChanged()
  }
  const begun = api.runtime().then(
    (value) => {
      put({ value, failed: null, settled: true, inFlight: false })
      settled()
      return value
    },
    (err: unknown) => {
      put({ ...state, failed: { message: errorMessage(err), fault: faultOf(err) }, settled: true, inFlight: false })
      settled()
      throw err
    },
  )
  inFlight = begun
  return begun
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * READ AGAIN BECAUSE SOMETHING SAID THE READING MAY BE OLD: the server's `machine.changed`, the
 * stream coming back, or events lost. Only once something has been read, because the first read is
 * the page's own.
 */
function readBecauseItChanged(): void {
  if (!state.settled && inFlight === null) return
  if (hidden()) {
    owedWhenShown = true
    return
  }
  if (inFlight !== null) {
    owedAfterThisRead = true
    return
  }
  void start().catch(() => {
    // The failure is kept in the state for whatever draws it.
  })
}

/** Start hearing what says the reading changed, once for the page. It opens no connection. */
function hearWhatChangesIt(): void {
  if (stopHearing !== null) return
  const stops = [
    hearAlways(() => readBecauseItChanged(), ['machine.changed']),
    whenTheStreamCameBack(readBecauseItChanged),
    whenEventsWereLost(readBecauseItChanged),
  ]
  const shown = (): void => {
    if (hidden() || !owedWhenShown) return
    owedWhenShown = false
    readBecauseItChanged()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', shown)
  stopHearing = () => {
    for (const stop of stops) stop()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', shown)
  }
}

/** The reading for this page load. The first caller asks; everyone after joins it or reads it. */
export function readTheMachineOnce(): Promise<RuntimeRecord> {
  hearWhatChangesIt()
  if (state.value !== null) return Promise.resolve(state.value)
  return start()
}

/**
 * A fresh reading, now.
 *
 * FOR A PERSON'S PRESS, and for nothing that runs on its own, which is `readBecauseItChanged`.
 */
export function readTheMachineAgain(): Promise<RuntimeRecord> {
  hearWhatChangesIt()
  return start()
}

/** How long after the last read a page the wrong-world sheet blocks reads the machine again, in milliseconds. */
export const WHILE_BLOCKED_READ_EVERY_MS = 30_000

/**
 * READ AGAIN EVERY THIRTY SECONDS WHILE THE PAGE IS BLOCKED. It returns the way to stop.
 *
 * Wave 13w round 25. The wrong-world sheet clears when a reply comes back from the right server, and the sheet
 * itself stops every press. No event can say that another server stopped answering, because the stream may come
 * from that server. Without this a page with no other request of its own stays blocked after the right server is
 * back: tests/the-page-shouts-when-it-is-in-the-wrong-world.test.ts found that when the thirty-second read was taken
 * away. It runs only while the sheet stands, so a page that is where it thinks it is never runs it.
 */
export function readTheMachineWhileThePageIsBlocked(): () => void {
  hearWhatChangesIt()
  const beat = aMachineReadClock({
    everyMs: WHILE_BLOCKED_READ_EVERY_MS,
    inFlight: () => inFlight !== null,
    read: () => {
      void start().catch(() => {
        // The failure is kept in the state for whatever draws it.
      })
    },
  })
  // THE THIRTY SECONDS COUNT FROM THE LAST READ, whatever asked for it, and not from when the sheet went up: the
  // sheet usually goes up a moment after a read, and the right server may already be back.
  const fromTheLastRead = (): void => {
    if (!state.inFlight) beat.settled(lastSettledAtMs ?? undefined)
  }
  const stopListening = subscribeToTheMachine(fromTheLastRead)
  fromTheLastRead()
  return () => {
    stopListening()
    beat.stop()
  }
}

/**
 * The machine reading, for a component.
 *
 * THE HOOK ASKS ONCE ON MOUNT and then draws the shared answer, so two components that draw it
 * make one sweep between them, and a re-render makes none. IT ALSO HOLDS THE EVENT STREAM OPEN,
 * because the stream is what says the reading changed.
 */
export function useTheMachineState(): MachineReadingState {
  const held = useSyncExternalStore(subscribeToTheMachine, theMachineState, theMachineState)
  useChannel()
  useEffect(() => {
    void readTheMachineOnce().catch(() => {
      // The failure is drawn from the state this hook returns.
    })
  }, [])
  return held
}

/**
 * Forget everything and stop hearing the channel. For a test, and for nothing else.
 *
 * A page load is the life of this store, so outside a test there is nothing to forget: a fresh
 * document builds a fresh module graph.
 */
export function forgetTheMachineOnThisPage(): void {
  stopHearing?.()
  stopHearing = null
  inFlight = null
  lastSettledAtMs = null
  owedAfterThisRead = false
  owedWhenShown = false
  state = { value: null, failed: null, settled: false, inFlight: false }
  for (const listener of listeners) listener()
}
