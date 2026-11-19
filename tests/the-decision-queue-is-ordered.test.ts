// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE HAS ONE ORDER BY DEFAULT, AND THE PERSON CAN ASK FOR THREE OTHERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR — problem `Dzq7hMCIFAA6`
 * ---------------------------------------------------------------------------------------
 *
 * Too many decisions and no order. One combined ranking — time, importance and the rest — with what
 * most needs the owner first, as the default; and manual sorts by time, by importance and by category.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE EACH HALF IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The combined ranking is `readForks` on the server, and it is proved here against real records in
 * a real database: the fixtures are a fork somebody pinned, a fork holding work up, and a plain new
 * one, which is the smallest set where the three facts disagree about the order.
 *
 * The three manual orders are `orderForks` and `orderDecided` in `src/web/lib/queueorder.ts`, and
 * they are proved against the same real forks after the browser has read them into cards — so a
 * change to the shape the page holds reaches this test rather than passing beside it.
 *
 * The remembered choice is `readChoice` in `src/web/lib/store.ts` reading a hand-made browser store,
 * because there is no DOM in this runner.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { localStamp } from '../src/shared/time.ts'
import { readDecisions, readEveryDecided } from '../src/web/components/home/decisions.ts'
import {
  DECIDED_ORDERS,
  DECIDED_ORDER_KEY,
  DECIDED_ORDER_WORDS,
  FORK_ORDERS,
  FORK_ORDER_KEY,
  FORK_ORDER_WORDS,
  kindOfAnswer,
  orderDecided,
  orderForks,
  rememberOrder,
  rememberedDecidedOrder,
  rememberedForkOrder,
  whatItHoldsUp,
} from '../src/web/lib/queueorder.ts'
import { freshDb, type TestDb } from './helpers.ts'

const AGENT = { type: 'agent' as const, id: 'claude-code' }
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let forks: typeof import('../src/server/lib/forks.ts')

beforeAll(async () => {
  t = await freshDb()
  forks = await import('../src/server/lib/forks.ts')
}, 60_000)

/**
 * THE QUEUE READS EVERY PROJECT, live only, and every case ranks the forks it filed against that
 * whole reading. Each case puts the proposals and decisions back as the office was found (it starts
 * with none) by the soft delete the office itself uses, instead of narrowing the reading.
 */
afterEach(() => {
  t.client.sqlite
    .prepare("update records set deleted_at = updated_at where kind in ('proposal', 'decision') and deleted_at is null")
    .run()
})

afterAll(() => {
  t.close()
})

const fork = (title: string, data: Record<string, unknown> = {}): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title,
    data: { question: `${title}?`, options: ['a — one way', 'b — the other'], ...data },
    actor: AGENT,
  }).id

const work = (title: string, data: Record<string, unknown> = {}): string =>
  t.api.createRecord({ workspaceId: 'default', kind: 'problem', title, data: { state: 'open', ...data }, actor: AGENT }).id

const holds = (from: string, to: string): void => {
  t.api.createLink({ fromId: from, toId: to, type: 'blocks', actor: AGENT })
}

/**
 * MOVE A RECORD'S FILING STAMP, because two records written in one test are written in one second.
 *
 * The stamps this product stores have one-second resolution, so nothing a test can do through the
 * ordinary door produces two forks a day apart. This writes the column, which is the only way to
 * ask the question the tie-break answers.
 */
const filedAt = (recordId: string, stamp: string): void => {
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, recordId)
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** A filing stamp this many milliseconds before now, written the way this product writes them. */
const agesAgo = (ms: number): string => localStamp(new Date(Date.now() - ms))

/** The open forks, in the order the server ranked them. */
const ranked = (): string[] => forks.readForks().open.map((one) => one.recordId)

/** The open forks as the browser holds them, which is what the page sorts. */
const asCards = () => readDecisions(forks.readForks().open, Date.now(), forks.readForks().leftTheQueue)

describe('the combined ranking is the default, and it is the server that works it out', () => {
  it('puts the pinned one first, then the one holding work up, then the plain new one', () => {
    // THE THREE FIXTURES, filed oldest first so that the newest is the one with nothing to say for
    // itself. If the ranking were only time, this order would come out backwards.
    const pinned = fork('The owner pinned this one')
    t.api.patchRecord(pinned, { dataPatch: { pinned: true } }, HUMAN)
    const blocked = fork('This one is holding two things up')
    holds(blocked, work('The first stuck thing'))
    holds(blocked, work('The second stuck thing'))
    const plain = fork('A plain new question with nothing behind it')
    filedAt(pinned, '2026-09-01 09:00:00')
    filedAt(blocked, '2026-09-02 09:00:00')
    filedAt(plain, '2026-09-03 09:00:00')

    expect(ranked()).toEqual([pinned, blocked, plain])
  })

  it('says on each fork which fact put it where it is, so the order can be argued with', () => {
    const pinned = fork('The owner pinned this one')
    t.api.patchRecord(pinned, { dataPatch: { pinned: true } }, HUMAN)
    const plain = fork('A plain new question')

    const read = forks.readForks().open
    expect(read.find((one) => one.recordId === pinned)?.priority.because).toContain('pinned')
    expect(read.find((one) => one.recordId === plain)?.priority.because).toContain('Nothing recorded')
  })

  it('puts the newest of equals first, which is the line that used to read the other way', () => {
    /**
     * TWO FORKS WITH NOTHING TO SEPARATE THEM. Neither is pinned, neither holds anything up, both
     * offer the same two options, and both are the same age IN WHOLE DAYS — which is what the sixth
     * key counts. Every one of the seven keys ties, so the filing stamp is what decides, and the
     * newer of the two goes first.
     *
     * THE STAMPS ARE MEASURED FROM NOW rather than written out, because the sixth key counts days
     * back from the moment of the read: a pair of fixed stamps falls in one day-bucket on some days
     * and two on others, and the test would then be about the calendar.
     */
    const older = fork('The one filed first')
    const newer = fork('The one filed second')
    filedAt(older, agesAgo(3 * DAY_MS + 2 * HOUR_MS))
    filedAt(newer, agesAgo(3 * DAY_MS + 1 * HOUR_MS))

    const read = forks.readForks().open
    expect(read.map((one) => one.priority.waitingDays)).toEqual([3, 3])
    expect(read.map((one) => one.recordId)).toEqual([newer, older])
  })

  it('does not put the newest first when an earlier key separates them, which is the whole point', () => {
    // THE TIE-BREAK IS ONLY A TIE-BREAK. A new fork with nothing behind it does not climb over an
    // older one that is holding work up.
    const busy = fork('An old question holding work up')
    holds(busy, work('The stuck thing'))
    const fresh = fork('A new question holding nothing up')
    filedAt(busy, '2026-08-01 09:00:00')
    filedAt(fresh, '2026-09-04 09:00:00')

    expect(ranked()).toEqual([busy, fresh])
  })
})

describe('the three orders a person can ask for instead', () => {
  let pinned = ''
  let blocked = ''
  let plain = ''

  beforeEach(() => {
    pinned = fork('The owner pinned this one')
    t.api.patchRecord(pinned, { dataPatch: { pinned: true } }, HUMAN)
    blocked = fork('This one is holding a step of work up')
    // A STEP OF WORK, the category of a fork that blocks work.
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'The pipeline the stuck step belongs to',
      data: {},
      actor: AGENT,
    }).id
    const step = t.blocks.addBlock(pipeline, { name: 'The stuck step', state: 'doing' }, AGENT).block
    holds(blocked, step.id)
    plain = fork('A plain new question with nothing behind it')
    filedAt(pinned, '2026-09-01 09:00:00')
    filedAt(blocked, '2026-09-02 09:00:00')
    filedAt(plain, '2026-09-03 09:00:00')
  })

  it('leaves the list exactly as the server sent it when nothing else was asked for', () => {
    const rows = asCards()

    expect(orderForks(rows, 'what-needs-you-most').map((one) => one.recordId)).toEqual(rows.map((one) => one.recordId))
    // AND THAT IS THE COMBINED RANKING, not a coincidence: it is the same list the server ranked.
    expect(orderForks(rows, 'what-needs-you-most').map((one) => one.recordId)).toEqual([pinned, blocked, plain])
  })

  it('sorts by time with the newest first, whatever else is true of a fork', () => {
    const order = orderForks(asCards(), 'newest-first').map((one) => one.recordId)

    // THE PLAIN NEW ONE IS NOW AT THE TOP AND THE PINNED ONE AT THE BOTTOM, which is the sort doing
    // something rather than agreeing with the default.
    expect(order).toEqual([plain, blocked, pinned])
  })

  it('sorts by importance: pinned first, then what is stuck behind it', () => {
    const order = orderForks(asCards(), 'most-important').map((one) => one.recordId)

    expect(order).toEqual([pinned, blocked, plain])
  })

  it('and importance is a different list from the default, because a long wait is not importance', () => {
    /**
     * TWO FORKS THAT ARE EQUALLY IMPORTANT AND VERY DIFFERENT AGES. Neither is pinned, neither
     * holds anything up, and neither is anybody's to settle in particular — so every importance
     * fact ties, and the two orders have nothing left to agree about.
     *
     * THE DEFAULT PUTS THE OLD ONE FIRST, because it counts how long a question has waited.
     * IMPORTANCE PUTS THE NEW ONE FIRST, because it does not.
     *
     * Without a case like this the control does nothing: the importance keys are the first five of
     * the default's seven and sorting is stable, so a list already in the default order sorted
     * again by a prefix of the same keys comes back unchanged. That is exactly what happened, and
     * it is what the last line of `most-important` in lib/queueorder.ts exists to fix.
     */
    const forgotten = fork('A question that has been sitting for a month')
    const today = fork('A question filed this morning')
    filedAt(forgotten, agesAgo(30 * DAY_MS))
    filedAt(today, agesAgo(2 * HOUR_MS))
    const rows = readDecisions(
      forks.readForks().open.filter((one) => one.recordId === forgotten || one.recordId === today),
      Date.now(),
      [],
    )

    expect(rows.map((one) => one.recordId)).toEqual([forgotten, today])
    expect(orderForks(rows, 'most-important').map((one) => one.recordId)).toEqual([today, forgotten])
  })

  it('sorts by category: a step of work first, then the rest, then whatever holds nothing up', () => {
    const rows = asCards()

    expect(whatItHoldsUp(rows.find((one) => one.recordId === blocked) as (typeof rows)[number])).toBe('block')
    expect(whatItHoldsUp(rows.find((one) => one.recordId === plain) as (typeof rows)[number])).toBeNull()
    const order = orderForks(rows, 'what-it-holds-up').map((one) => one.recordId)
    expect(order[0]).toBe(blocked)
    // THE TWO HOLDING NOTHING UP KEEP THE ORDER THEY CAME IN, which is the combined ranking.
    expect(order.slice(1)).toEqual([pinned, plain])
  })

  it('leaves the list it was handed alone, so the page can draw two orders of one reading', () => {
    const rows = asCards()
    const before = rows.map((one) => one.recordId)

    orderForks(rows, 'newest-first')

    expect(rows.map((one) => one.recordId)).toEqual(before)
  })

  it('names every order in words a reader hears, and never in the word the code uses', () => {
    for (const order of FORK_ORDERS) {
      // A NAME AND NOT A KEY: the machine's word for the order never reaches the screen.
      expect(FORK_ORDER_WORDS[order].length).toBeGreaterThan(0)
      expect(FORK_ORDER_WORDS[order]).not.toContain('-')
    }
    // AND NO PARAGRAPH BESIDE THEM. The UX contract calls a sentence added to explain a control a
    // failed fix, and every fork already carries `priority.because` saying why it is where it is.
    expect(Object.values(FORK_ORDER_WORDS).every((name) => typeof name === 'string')).toBe(true)
  })
})

describe('what you decided is ordered too, and offers what a decision really carries', () => {
  let took = ''
  let ownWords = ''
  let onItsOwn = ''

  const aDecision = (title: string, data: Record<string, unknown>): string =>
    t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data, actor: HUMAN }).id

  beforeEach(() => {
    const asked = fork('A question somebody asked')
    took = aDecision('Took the first option', { option_taken: 'a — one way', option_index: 0 })
    t.api.createLink({ fromId: took, toId: asked, type: 'derived_from', actor: HUMAN })

    const asked2 = fork('A second question somebody asked')
    ownWords = aDecision('Neither of those', { option_taken: 'Something else entirely' })
    t.api.createLink({ fromId: ownWords, toId: asked2, type: 'derived_from', actor: HUMAN })

    onItsOwn = aDecision('A decision filed with no question in front of it', { option_taken: 'We are doing this' })

    filedAt(took, '2026-09-01 09:00:00')
    filedAt(ownWords, '2026-09-02 09:00:00')
    filedAt(onItsOwn, '2026-09-03 09:00:00')
  })

  const cards = () => readEveryDecided(forks.readForks().decisions, Date.now())

  it('is newest first by default, which is the order the list is built in', () => {
    expect(orderDecided(cards(), 'newest-first').map((one) => one.recordId)).toEqual([onItsOwn, ownWords, took])
  })

  it('tells the three kinds of answer apart from what is stored, not from a judgement', () => {
    const rows = cards()
    const of = (id: string) => kindOfAnswer(rows.find((one) => one.recordId === id) as (typeof rows)[number])

    expect(of(took)).toBe('took-an-option')
    expect(of(ownWords)).toBe('your-own-answer')
    expect(of(onItsOwn)).toBe('no-question')
  })

  it('groups by the kind of answer, newest first inside each group', () => {
    expect(orderDecided(cards(), 'kind-of-answer').map((one) => one.recordId)).toEqual([took, ownWords, onItsOwn])
  })

  it('offers two orders and not four, because a decision carries no pin and holds nothing up', () => {
    expect([...DECIDED_ORDERS]).toEqual(['newest-first', 'kind-of-answer'])
    for (const order of DECIDED_ORDERS) expect(DECIDED_ORDER_WORDS[order]).not.toContain('-')
  })
})

/**
 * THE CHOICE IS REMEMBERED IN THIS BROWSER, AND A BROWSER THAT REFUSES SAYS SO.
 *
 * There is no DOM in this runner, so the store is hand-made. `theBrowsersStore` in lib/store.ts
 * reads `window.localStorage` and refuses when there is no window, which is what makes both halves
 * of this testable at all: the refusing case is what this process does with no window installed.
 */
describe('the order this browser last asked for', () => {
  const held = new Map<string, string>()

  const aBrowserThatRemembers = (): void => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => held.get(key) ?? null,
        setItem: (key: string, value: string) => {
          held.set(key, value)
        },
        removeItem: (key: string) => {
          held.delete(key)
        },
      },
    }
  }

  const aBrowserWithNoStore = (): void => {
    delete (globalThis as { window?: unknown }).window
  }

  afterEach(() => {
    held.clear()
    aBrowserWithNoStore()
  })

  it('is the combined ranking until somebody chooses, which is not a stored choice', () => {
    aBrowserThatRemembers()

    expect(rememberedForkOrder()).toEqual({ order: 'what-needs-you-most', fault: null })
    expect(rememberedDecidedOrder()).toEqual({ order: 'newest-first', fault: null })
  })

  it('comes back the way it was left', () => {
    aBrowserThatRemembers()

    expect(rememberOrder(FORK_ORDER_KEY, 'what-it-holds-up')).toBeNull()
    expect(rememberOrder(DECIDED_ORDER_KEY, 'kind-of-answer')).toBeNull()

    expect(rememberedForkOrder().order).toBe('what-it-holds-up')
    expect(rememberedDecidedOrder().order).toBe('kind-of-answer')
  })

  it('drops a stored order this build has no meaning for, and says it did', () => {
    aBrowserThatRemembers()
    held.set(FORK_ORDER_KEY, 'by-whatever-a-later-build-called-it')

    const read = rememberedForkOrder()

    expect(read.order).toBe('what-needs-you-most')
    expect(String(read.fault)).toContain('by-whatever-a-later-build-called-it')
    // AND THE BAD VALUE IS GONE, so the complaint is made once rather than on every load.
    expect(held.has(FORK_ORDER_KEY)).toBe(false)
  })

  it('says so when the browser will not remember, rather than forgetting quietly', () => {
    // NO WINDOW AT ALL, which is how `theBrowsersStore` refuses: a locked-down profile does the same.
    aBrowserWithNoStore()

    const read = rememberedForkOrder()
    expect(read.order).toBe('what-needs-you-most')
    expect(String(read.fault)).toContain('remember')

    const written = rememberOrder(FORK_ORDER_KEY, 'newest-first')
    expect(String(written)).toContain('will not let Mole Office remember')
  })
})
