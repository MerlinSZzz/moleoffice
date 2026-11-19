// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THIRTY-SECOND RULE, IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U7 of design/settings/ACCEPTANCE.md states one rule for every automatic read of a
 * machine: a read happens at most every thirty seconds, and only while the page is visible. Two
 * different readings obey it and neither is the other's:
 *
 *   - the one shared machine reading, in `src/web/lib/onemachine.ts`, but only while the
 *     wrong-world sheet blocks the page. It obeyed the rule on every page until wave 13w round 25;
 *     it is now read again when the server says it changed;
 *   - the open conversation with an agent, in `src/web/components/Chat.tsx`, which no event says
 *     has started or stopped answering.
 *
 * A third obeyed it until wave 13y round 32: the home page's sessions panel, through
 * `useMachineReading` in `src/web/components/SessionPanel.tsx`. The panel was removed then, and the
 * sessions page reads only on a press.
 *
 * They are different readings with different lifetimes and different callers. The rule is one
 * rule. So it lives here and both callers bring their own read, their own state and their own
 * in-flight guard.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE RULE IS, EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * The next automatic read is counted from the moment the LAST ONE SETTLED, not from when the
 * component mounted. A `setInterval` anchored at mount drifts: a read that takes four seconds
 * moves every later read four seconds late, and a tick that lands while a read is still out is
 * either stacked or dropped, and neither is visible anywhere.
 *
 * While `document.hidden` the automatic read does not happen. The timer is NOT torn down on the
 * way into the background, because a page that stopped scheduling while hidden would never start
 * again when it came back — it keeps its thirty-second beat and each beat that finds the page
 * hidden re-arms instead of reading. When the page becomes visible again, the next beat reads if
 * thirty seconds have passed, which is the ceiling the criterion names.
 *
 * A PERSON'S PRESS IS NOT THE TIMER. Nothing here is on the path a caller takes when it reads
 * because somebody pressed something; that read is immediate and this module never sees it.
 */

/** What a caller of `aMachineReadClock` is handed back. */
export interface MachineReadClock {
  /**
   * A read has settled — it came back, or it failed. The next automatic read is thirty seconds
   * from here. `atMs` is for a caller that measured the settle itself; left out, it is now.
   */
  settled(atMs?: number): void
  /** Make sure a timer is armed, without starting the thirty seconds again. */
  arm(): void
  /** Clear the timer for good. A stopped clock never fires and never re-arms. */
  stop(): void
}

/** What a caller tells the clock about its own read. */
export interface MachineReadClockOptions {
  /** The shortest gap between two automatic reads, in milliseconds. */
  everyMs: number
  /** True while a read is already out, so a beat that lands mid-read waits rather than stacks. */
  inFlight: () => boolean
  /** The automatic read. Called only while the page is visible and the gap has passed. */
  read: () => void
  /** The clock. `Date.now` outside a test. */
  now?: () => number
  /** The page's hidden flag. `document.hidden` outside a test, and `undefined` outside a page. */
  hidden?: () => boolean
}

/**
 * Build one clock. Each caller gets its own; there is no shared timer in this module.
 *
 * `everyMs` is the shortest gap between two automatic reads. `inFlight` says whether a read is
 * already out, so a beat that lands mid-read re-arms rather than stacking a second one. `read`
 * is the automatic read and is called only while the page is visible and the gap has passed.
 */
export function aMachineReadClock(options: MachineReadClockOptions): MachineReadClock {
  const now = options.now ?? ((): number => Date.now())
  const hidden = options.hidden ?? ((): boolean => typeof document !== 'undefined' && document.hidden)
  // A timer is only armed where there is a page to hide. Outside a browser with no injected
  // `hidden` there is no page and no clock, which is the same guard `onemachine` used.
  const thereIsAPage = options.hidden !== undefined || typeof document !== 'undefined'

  /** When the last read SETTLED. The thirty seconds are counted from here. */
  let lastSettledAtMs = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  /** How long until the next automatic read: the rest of the thirty seconds, or all of it. */
  const theGap = (): number => {
    const sinceTheLast = now() - lastSettledAtMs
    return sinceTheLast >= options.everyMs ? options.everyMs : options.everyMs - sinceTheLast
  }

  const arm = (): void => {
    if (stopped || !thereIsAPage) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(onTheBeat, theGap())
  }

  const onTheBeat = (): void => {
    timer = null
    if (stopped) return
    // NOT WHILE THE PAGE IS HIDDEN. This is the cost the rule exists to stop; the beat goes on.
    if (hidden()) {
      arm()
      return
    }
    // A read already out is the one the next beat would have asked for. Wait for it to settle.
    if (options.inFlight()) {
      arm()
      return
    }
    // A PRESS MAY HAVE READ SINCE THE BEAT WAS ARMED. If so this beat is early, and it waits.
    if (now() - lastSettledAtMs < options.everyMs) {
      arm()
      return
    }
    options.read()
  }

  return {
    settled(atMs?: number) {
      lastSettledAtMs = atMs ?? now()
      arm()
    },
    arm,
    stop() {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
