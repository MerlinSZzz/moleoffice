// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ASK OF A DOOR AT A TIME, AND NO MORE OFTEN THAN ITS LAST ANSWER ALLOWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 18 November 2026 one open Home in one browser was about three quarters of the live office's
 * server time in half an hour. It read the roster about every 5 s, and an answer took 1.5 s; it read
 * the ranked answer about three times a minute, and an answer took 10 s; it read the project's
 * backlog progress on the minute, and an answer took 15 s. A door answered more slowly than the
 * page asked again, so asks piled up: two or three were being worked out at once, and every one of
 * them held the office's thread and the other reads behind it.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * This module is the one pace every costly Home door keeps. A door asked through `oneAsk` is asked:
 *
 *   - ONCE AT A TIME. A reason that comes while an ask is on its way is kept, and becomes ONE ask
 *     after that one ends, never a second ask beside it. Reasons that come while that next ask
 *     waits out its bound share the one ask already waiting.
 *   - NO SOONER AFTER AN ANSWER THAN THE ANSWER'S OWN COST ALLOWS. The next ask waits
 *     `READ_COST_FACTOR` times the time the last ask took, and never less than the door's floor.
 *     The floor is what keeps a cheap answer from being read again on every event; the factor is
 *     what keeps an expensive one from taking more than a fraction of the office's time.
 *
 * A READER'S MOVE IS ASKED AT ONCE. The bound is for the reasons the page makes by itself: Home's
 * events and Home's minute, which are what the measurement counted. A reader who moves is waiting
 * for the page they moved to, so the next ask after a move is not held by the bound. It is still
 * one at a time: a move while an ask is on its way is asked as soon as that ask ends. Two things
 * are a move:
 *
 *   - A CHANGE OF KEY. The first ask after the key in force changed, to another project or another
 *     reader, is not held by that key's bound, even when the reader comes back to a key asked a
 *     moment ago.
 *   - `hurry()`, which the page calls when the reader has moved to another page or acted on one. An
 *     ask of the key in force that is waiting out its bound starts at once.
 *
 * The hurry lasts until an ask a caller asked for has started. An ask that `hurry()` started early
 * does not use it up, because the read on its way may have begun before the move, and the read the
 * page asks after it (`oneRead`'s `.again()`, src/web/lib/oneread.ts) is the move's real answer. So
 * one move costs at most two asks outside the pace, and the reasons after it keep the pace again.
 * Moves in a row are not bounded: a reader who moves at least once per answer keeps the door asked
 * back to back, which for the ranked answer, at 10 s an answer and a gap of 100 s, is ten times its
 * paced rate.
 *
 * A REFUSED ASK IS NOT AN ANSWER. It stores nothing, costs nothing, and the next reason is asked at
 * once, because the page never got the reading it was waiting for. A failure is still handed to
 * every caller that was waiting for its ask.
 *
 * KEYED BY PROJECT, AND BY WHO IS ASKING WHEN THE DOOR'S ANSWER IS THE READER'S OWN. Home asks
 * every project's roster and the project on screen's other doors, and those are different questions
 * with different answers. So each key keeps its own pace, and a read that has to wait names the key
 * it was asked about when it finally starts, never the project on screen at that moment. A key that
 * changes is a move, so it is not held by the old key's bound or by the new key's. A delayed ask
 * whose key has changed before its turn is refused without a request, because a request sent after
 * the change would read as the new project or reader and be handed to the old one's callers.
 *
 * NOT A CACHE. Nothing here is handed back without an ask: this decides WHEN the next ask is made
 * and how many are made at once. The answer still comes from the door, and the page still draws it
 * through the reading that asked.
 */

/** How many times the last answer's own cost the next ask waits, where that is longer than the floor. */
export const READ_COST_FACTOR = 10

/**
 * How soon the roster may be asked again after an answer, in milliseconds.
 *
 * The live page's presence events came about every 5 s and one roster answer took 1.5 s, so ten
 * times an answer is 15 s: the floor is set where an ordinary answer's cost alone would put it. A
 * dot that is a bound (15 s) old still says who is at work, because a run lasts minutes; and the
 * page asks this door a third as often as it did, which is most of what the measurement found.
 */
export const ROSTER_ASK_FLOOR_MS = 10_000

/**
 * How soon the page's ranked answer may be asked again after an answer, in milliseconds.
 *
 * The page's own minute was the pace it had, and the rule behind the answer reads every record of
 * the project, so a minute is the floor. At the measured 10 s an answer, the factor makes the real
 * gap about 100 s, and the answer still arrives within one gap of the change that caused it.
 */
export const ATTENTION_ASK_FLOOR_MS = 60_000

/**
 * How soon the project's backlog progress may be asked again after an answer, in milliseconds.
 *
 * It was read on the page's minute too, and a minute is the floor. At the measured 15 s an answer,
 * the factor makes the real gap about 150 s; a backlog count does not move faster than the work
 * behind it, and the card still says exactly what it said before.
 */
export const PROGRESS_ASK_FLOOR_MS = 60_000

/** How a door is paced: the project each ask is about, the floor, and the factor. */
export interface AskPace {
  /** The project the ask is about, read when the ask is made. A different key is a different pace. */
  key: () => string
  /** The least time between an answer and the next ask, in milliseconds. */
  floorMs: number
  /** How many times the last answer's own cost the next ask waits, where that is longer. */
  factor: number
}

/** A door asked at most once at a time, and no sooner after an answer than the pace allows. */
export interface OneAsk<T> {
  (): Promise<T>
  /**
   * THE READER HAS JUST MOVED, so the next ask of the key in force is not held by the bound. An ask
   * waiting out its bound starts now; an ask on its way is followed as soon as it ends.
   */
  hurry(): void
}

/** One promise and the two ways it ends, kept so the ask that answers it can be started later. */
interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function aDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolveIt, rejectIt) => {
    resolve = resolveIt
    reject = rejectIt
  })
  return { promise, resolve, reject }
}

/** One key's pace. */
interface Slot<T> {
  /** The ask on its way, or null. */
  inFlight: Promise<T> | null
  /** The one ask a reason is waiting for: either waiting out the bound, or waiting for an ask to end. */
  waiting: Deferred<T> | null
  /** The timer that will start `waiting`, when it is waiting out the bound. */
  timer: ReturnType<typeof setTimeout> | null
  /** The moment the next ask may begin, as epoch milliseconds. 0 until an answer has set it. */
  notBefore: number
  /** The reader has moved, and no ask a caller asked for has started since: the bound does not hold the next one. */
  hurried: boolean
}

export function oneAsk<T>(read: (key: string) => Promise<T>, pace: AskPace): OneAsk<T> {
  const byKey = new Map<string, Slot<T>>()
  /** The key the last caller asked about, so a change of key is seen as a move. */
  let askedAbout: string | null = null

  const slotFor = (key: string): Slot<T> => {
    const held = byKey.get(key)
    if (held !== undefined) return held
    const made: Slot<T> = { inFlight: null, waiting: null, timer: null, notBefore: 0, hurried: false }
    byKey.set(key, made)
    return made
  }

  /**
   * Start the ask `slot.waiting` holds, or a new one when the bound has passed and a caller asked
   * for it outright. Returns the promise that caller is holding. `forACaller` is false only for the
   * ask `hurry()` starts early, which does not use the hurry up.
   */
  const start = (slot: Slot<T>, key: string, forACaller = true): Promise<T> => {
    if (slot.timer !== null) {
      clearTimeout(slot.timer)
      slot.timer = null
    }
    const waiting = slot.waiting
    slot.waiting = null
    const deferred = waiting ?? aDeferred<T>()
    // WHO OR WHAT IS ASKING CHANGED BEFORE THIS ASK'S TURN. The request would be sent as the new
    // project or reader and its answer handed to the old one's callers, which is a lie about who
    // read it. The ask is refused without a request; the new key's own ask is not held by this one.
    if (pace.key() !== key) {
      slot.notBefore = 0
      deferred.reject(new Error('The page changed project or reader before this ask could be made.'))
      return deferred.promise
    }
    if (forACaller) slot.hurried = false
    const began = Date.now()
    const started = read(key)
    slot.inFlight = started
    const answered = (value: T): void => {
      if (slot.inFlight === started) slot.inFlight = null
      const cost = Date.now() - began
      slot.notBefore = Date.now() + Math.max(pace.floorMs, pace.factor * cost)
      deferred.resolve(value)
      // A REASON THAT CAME WHILE THIS ASK WAS ON ITS WAY is one ask after it ends, at the bound this
      // answer has just set. Nothing else starts it: nobody asked between the two.
      if (slot.waiting !== null) schedule(slot, key)
    }
    const refused = (error: unknown): void => {
      if (slot.inFlight === started) slot.inFlight = null
      // A REFUSED ASK IS NOT AN ANSWER, so the next one is not held back by it.
      slot.notBefore = 0
      deferred.reject(error)
      if (slot.waiting !== null) schedule(slot, key)
    }
    started.then(answered, refused)
    return deferred.promise
  }

  /** Begin `slot.waiting` when its bound has passed, or as soon as it can when the reader has moved. */
  const schedule = (slot: Slot<T>, key: string): void => {
    if (slot.timer !== null || slot.inFlight !== null || slot.waiting === null) return
    const wait = slot.hurried ? 0 : Math.max(0, slot.notBefore - Date.now())
    slot.timer = setTimeout(() => {
      slot.timer = null
      void start(slot, key)
    }, wait)
  }

  const ask = (() => {
    const key = pace.key()
    const slot = slotFor(key)
    // A CHANGE OF KEY IS A MOVE: the reader went to another project or became another reader, and
    // this key's bound, set a moment ago perhaps, does not hold the first ask after it.
    if (askedAbout !== null && askedAbout !== key) slot.hurried = true
    askedAbout = key
    if (slot.inFlight !== null) {
      // A REASON WHILE AN ASK IS ON ITS WAY: keep one ask for after it, and let every reason in the
      // same burst share it. It is scheduled when that ask ends, at the bound its answer sets, or at
      // once after a move.
      slot.waiting ??= aDeferred<T>()
      return slot.waiting.promise
    }
    // AN ASK WAITING OUT ITS BOUND is shared, and started now when this ask comes after a move.
    if (slot.waiting !== null) return slot.hurried ? start(slot, key) : slot.waiting.promise
    if (Date.now() < slot.notBefore && !slot.hurried) {
      slot.waiting = aDeferred<T>()
      schedule(slot, key)
      return slot.waiting.promise
    }
    return start(slot, key)
  }) as OneAsk<T>

  ask.hurry = (): void => {
    const key = pace.key()
    const slot = slotFor(key)
    slot.hurried = true
    // AN ASK WAITING OUT ITS BOUND STARTS NOW. It is not the ask a caller made after the move, so it
    // does not use the hurry up: the read the page asks after it is not held by the bound it sets.
    if (slot.timer !== null) void start(slot, key, false)
  }

  return ask
}
