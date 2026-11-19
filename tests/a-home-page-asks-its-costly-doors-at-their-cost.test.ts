// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE OPEN HOME ASKS ITS COSTLY DOORS ONE AT A TIME, AND NO MORE OFTEN THAN THEIR ANSWERS ALLOW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 18 November 2026 one open Home in one browser was about three quarters of the live office's
 * server time in half an hour: the roster was read about every 5 s at 1.5 s an ask, the ranked
 * answer about three times a minute at 10 s an ask, and the project's progress on the minute at
 * 15 s an ask. Every one of those doors answered more slowly than the page asked again, so two
 * asks were on the server at once and the page kept asking while the last answer was still being
 * worked out.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO RULES THIS FILE HOLDS (src/web/lib/oneask.ts)
 * ---------------------------------------------------------------------------------------
 *
 *   1. AT MOST ONE ASK OF A DOOR AT A TIME. A reason to read again that comes while an ask is on
 *      its way is kept and becomes ONE ask after that one ends, never a second ask beside it. Every
 *      reason in the same burst shares that one ask.
 *   2. AFTER AN ANSWER THE NEXT ASK WAITS. It waits `READ_COST_FACTOR` times the time the last
 *      answer took, and never less than the door's floor: 60 s for the ranked answer and the
 *      backlog progress, which is the pace they already had; and a floor of the roster's own for
 *      the roster, because a dot may be a bound old and still say who is at work.
 *
 * A REFUSED ASK IS NOT AN ANSWER, and the next reason is asked at once: the page never got the
 * reading it was waiting for.
 *
 * A READER'S MOVE IS ASKED AT ONCE. The bound is for the reasons the page makes by itself, Home's
 * events and its minute. A change of key is a move, and so is `hurry()`, which the page calls when
 * the reader moves to another page. The hurry lasts until an ask a caller asked for has started; an
 * ask `hurry()` started early does not use it up. Asks are still one at a time.
 *
 * FAKE TIMERS AND A FAKE DOOR. `vi.useFakeTimers` moves the clock and the timers together, so an
 * answer's own cost is exact, and the door counts its own asks and when each began.
 *
 * WHAT EACH CASE IS THERE TO CATCH (no mutation was run against this file): a second ask
 * started beside one in flight makes case 1 red; a reason not kept, so nothing follows an ask,
 * makes case 1 red on the second ask; a next ask that ignores the floor makes case 3 red; one
 * that ignores the answer's cost makes case 4 red; a refused ask that holds the next one makes
 * case 5 red; a key that is not the project makes case 6 red; and an ask sent after its key
 * moved makes case 7 red. Since a change of key is a move, case 6 no longer catches one pace
 * shared by every key; case 9 does. A change of key that is not a move makes case 9 red; a
 * `hurry()` that does not start an ask waiting out its bound makes case 10 red; one that does not
 * shorten the wait after an ask on its way makes case 11 red; an early ask that uses the hurry up
 * makes case 12 red; and a hurry that is never used up makes case 13 red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATTENTION_ASK_FLOOR_MS,
  PROGRESS_ASK_FLOOR_MS,
  READ_COST_FACTOR,
  ROSTER_ASK_FLOOR_MS,
  oneAsk,
} from '../src/web/lib/oneask.ts'

/** One fixed moment, so every reading of the clock in this file is an exact number. */
const T0 = new Date(2026, 10, 18, 21, 0, 0).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

/** A door that counts its asks, begins each one, and answers `costMs` later with the ask's number. */
function aFakeDoor(costMs: number): { door: { asks: number; began: number[]; answered: number[] }; read: (key: string) => Promise<number> } {
  const door = { asks: 0, began: [] as number[], answered: [] as number[] }
  const read = (): Promise<number> => {
    door.asks += 1
    const which = door.asks
    door.began.push(Date.now())
    return new Promise<number>((resolve) => {
      setTimeout(() => {
        door.answered.push(Date.now())
        resolve(which)
      }, costMs)
    })
  }
  return { door, read }
}

describe('a door asked at most once at a time and paced after each answer', () => {
  it('1. a reason that comes while one ask is in flight becomes one ask after it ends, never a second beside it', async () => {
    const { door, read } = aFakeDoor(1_000)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 0, factor: 0 })
    const first = ask()
    await vi.advanceTimersByTimeAsync(100)
    const second = ask()
    const third = ask()
    expect(door.asks, 'three reasons inside one ask are still one ask').toBe(1)
    await vi.advanceTimersByTimeAsync(900)
    await expect(first).resolves.toBe(1)
    // THE NEXT ASK STARTS ON A TIMER OF NO DELAY, set as the first answer arrives, and the fake clock runs a
    // timer set during its own tick one millisecond later.
    await vi.advanceTimersByTimeAsync(1)
    expect(door.asks, 'the reasons became one ask after the first ended').toBe(2)
    expect(door.began[1], 'the second ask began after the first answered').toBeGreaterThanOrEqual(door.answered[0] ?? Infinity)
    expect(second, 'the reasons share one ask').toBe(third)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(second).resolves.toBe(2)
    expect(door.asks, 'and no third ask came of them').toBe(2)
  })

  it('2. a reason that comes while the next ask waits out its bound shares that one ask', async () => {
    const { door, read } = aFakeDoor(100)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 1_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(100)
    await expect(first).resolves.toBe(1)
    const answeredAt = Date.now()
    const second = ask()
    const third = ask()
    await vi.advanceTimersByTimeAsync(999)
    expect(door.asks, 'nothing is asked before the bound').toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(door.asks, 'the reasons are one ask at the bound').toBe(2)
    expect(door.began[1], 'the ask began exactly a bound after the answer').toBe(answeredAt + 1_000)
    expect(second).toBe(third)
    await vi.advanceTimersByTimeAsync(100)
    await expect(second).resolves.toBe(2)
  })

  it('3. a cheap answer holds the next ask for the floor', async () => {
    const { door, read } = aFakeDoor(10)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(10)
    await expect(first).resolves.toBe(1)
    const answeredAt = Date.now()
    const second = ask()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(door.asks, 'the floor still holds it').toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(door.asks, 'it is asked at the floor').toBe(2)
    expect(door.began[1], 'a cheap answer waits the whole floor').toBe(answeredAt + 60_000)
    await vi.advanceTimersByTimeAsync(10)
    await expect(second).resolves.toBe(2)
  })

  it('4. an answer slower than a tenth of the floor holds the next ask for the factor times its own time', async () => {
    const { door, read } = aFakeDoor(8_000)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(first).resolves.toBe(1)
    const answeredAt = Date.now()
    const second = ask()
    const bound = 8_000 * READ_COST_FACTOR
    await vi.advanceTimersByTimeAsync(bound - 1)
    expect(door.asks, 'the factor holds it').toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(door.asks, 'it is asked at the factor').toBe(2)
    expect(door.began[1], 'a slow answer waits ten times its own time').toBe(answeredAt + bound)
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(second).resolves.toBe(2)
  })

  it('5. a refused ask is not an answer: the next reason is asked at once', async () => {
    let attempts = 0
    const ask = oneAsk(() => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('The made-up door refused.')) : Promise.resolve(attempts)
    }, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    await expect(ask()).rejects.toThrow('The made-up door refused.')
    await expect(ask()).resolves.toBe(2)
    expect(attempts, 'the second ask did not wait the floor').toBe(2)
  })

  it('6. each project keeps its own pace, and a delayed ask names the project it was asked about', async () => {
    const heard: string[] = []
    let onScreen = 'the first project'
    const ask = oneAsk((project) => {
      heard.push(project)
      return Promise.resolve(project)
    }, { key: () => onScreen, floorMs: 60_000, factor: READ_COST_FACTOR })
    await expect(ask()).resolves.toBe('the first project')
    onScreen = 'the second project'
    // THE SECOND PROJECT HAS ITS OWN PACE: the first project's bound does not hold it.
    await expect(ask()).resolves.toBe('the second project')
    expect(heard).toEqual(['the first project', 'the second project'])
  })

  it('7. an ask whose page has moved to another project or reader before its turn is refused, not sent as the new one', async () => {
    let key = 'a project'
    let asked = 0
    const ask = oneAsk(() => {
      asked += 1
      return Promise.resolve(asked)
    }, { key: () => key, floorMs: 60_000, factor: READ_COST_FACTOR })
    await expect(ask()).resolves.toBe(1)
    const waiting = ask()
    // THE REFUSAL IS WAITED FOR BEFORE THE CLOCK MOVES, so it is never a rejection that nobody holds.
    const refused = expect(waiting).rejects.toThrow('changed project or reader')
    key = 'another project'
    await vi.advanceTimersByTimeAsync(60_000)
    await refused
    expect(asked, 'the changed page sent no ask for the old one').toBe(1)
    // AND THE NEW PROJECT IS NOT HELD by the old one's bound.
    await expect(ask()).resolves.toBe(2)
  })

  it('8. the floors and the factor are the ones the rule names', () => {
    // THE ROSTER'S EVENTS CAME ABOUT EVERY 5 s, so its floor has to be longer than that to read it
    // less often than the live page did.
    expect(ROSTER_ASK_FLOOR_MS).toBeGreaterThan(5_000)
    // THE RANKED ANSWER AND THE BACKLOG PROGRESS KEEP THE MINUTE THEY ALREADY HAD, no less.
    expect(ATTENTION_ASK_FLOOR_MS).toBeGreaterThanOrEqual(60_000)
    expect(PROGRESS_ASK_FLOOR_MS).toBeGreaterThanOrEqual(60_000)
    expect(READ_COST_FACTOR).toBe(10)
  })
})

describe("a reader's move is asked at once, and only the page's own reasons wait out the bound", () => {
  it("9. a switch back to a key asked a moment ago asks at once, beside the other key's ask still on its way", async () => {
    const { door, read } = aFakeDoor(1_000)
    const heard: string[] = []
    let onScreen = 'the first project'
    const ask = oneAsk((project) => {
      heard.push(project)
      return read(project)
    }, { key: () => onScreen, floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(first).resolves.toBe(1)
    onScreen = 'the second project'
    const second = ask()
    await vi.advanceTimersByTimeAsync(500)
    onScreen = 'the first project'
    const movedBackAt = Date.now()
    const back = ask()
    expect(door.asks, 'the first project is asked again at once, a moment after its last answer').toBe(3)
    expect(door.began[2]).toBe(movedBackAt)
    expect(heard).toEqual(['the first project', 'the second project', 'the first project'])
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(second).resolves.toBe(2)
    await expect(back).resolves.toBe(3)
  })

  it('10. hurry() starts an ask that was waiting out its bound, and the door is asked at that moment', async () => {
    const { door, read } = aFakeDoor(100)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(100)
    await expect(first).resolves.toBe(1)
    const waiting = ask()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(door.asks, 'the bound holds it until the reader moves').toBe(1)
    const movedAt = Date.now()
    ask.hurry()
    expect(door.asks, 'the move starts it').toBe(2)
    expect(door.began[1], 'at the moment of the move').toBe(movedAt)
    await vi.advanceTimersByTimeAsync(100)
    await expect(waiting).resolves.toBe(2)
  })

  it('11. after hurry() while an ask is on its way, the next reason is asked as soon as that ask ends, not at the bound', async () => {
    const { door, read } = aFakeDoor(1_000)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(500)
    ask.hurry()
    expect(door.asks, 'a move starts no second ask beside the one on its way').toBe(1)
    const next = ask()
    await vi.advanceTimersByTimeAsync(500)
    await expect(first).resolves.toBe(1)
    // THE NEXT ASK STARTS ON A TIMER OF NO DELAY, as in case 1, one fake millisecond after the answer.
    await vi.advanceTimersByTimeAsync(1)
    expect(door.asks, 'the reason is asked as soon as the ask on its way ended').toBe(2)
    expect(door.began[1]).toBeLessThanOrEqual((door.answered[0] ?? -Infinity) + 1)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(next).resolves.toBe(2)
  })

  it('12. the ask hurry() started early does not use the hurry up: the reason right after it is asked as soon as it ends', async () => {
    const { door, read } = aFakeDoor(1_000)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(first).resolves.toBe(1)
    const waiting = ask()
    await vi.advanceTimersByTimeAsync(2_000)
    ask.hurry()
    expect(door.asks, 'the move started the ask that was waiting').toBe(2)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(waiting).resolves.toBe(2)
    // THE MOVE'S OWN READ, as `oneRead`'s `.again()` asks it after a read that began before a change.
    const theMovesRead = ask()
    expect(door.asks, 'it is asked at once, not at the bound the early ask set').toBe(3)
    expect(door.began[2]).toBe(door.answered[1])
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(theMovesRead).resolves.toBe(3)
  })

  it("13. a reason with no move still waits out the bound, so the pace of Home's own reasons is unchanged", async () => {
    const { door, read } = aFakeDoor(100)
    const ask = oneAsk(read, { key: () => 'a project', floorMs: 60_000, factor: READ_COST_FACTOR })
    const first = ask()
    await vi.advanceTimersByTimeAsync(100)
    await expect(first).resolves.toBe(1)
    ask.hurry()
    const theMovesRead = ask()
    expect(door.asks, 'the move is asked at once').toBe(2)
    await vi.advanceTimersByTimeAsync(100)
    await expect(theMovesRead).resolves.toBe(2)
    const answeredAt = Date.now()
    // HOME'S OWN REASON, its event or its minute, with no move after the one already asked.
    const homesOwn = ask()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(door.asks, 'the bound holds it again').toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(door.asks, 'it is asked at the bound').toBe(3)
    expect(door.began[2]).toBe(answeredAt + 60_000)
    await vi.advanceTimersByTimeAsync(100)
    await expect(homesOwn).resolves.toBe(3)
  })
})
