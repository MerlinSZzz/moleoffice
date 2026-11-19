// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LANDING AND A MARK ANSWER THE SAME QUESTION ABOUT THE SAME PAGE, BECAUSE THEY ASK ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS HOLDS SHUT, MEASURED 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * "Which element on this page IS this part of this record" was worked out in two places, free to
 * disagree, and they did.
 *
 *   `elementDrawing`, then private to src/web/components/agent/MarkLayer.tsx, asked a map keyed by
 *   REGION, built by reading every addressable element on the page and converting the older
 *   `reportBlock/<record>/<block>` spelling through `regionIdOfLegacyTarget`. That is why a mark on
 *   a block survives all seven reading lengths.
 *
 *   `elementFor`, private to src/web/components/agent/original.ts, spelled the region key itself
 *   with `targetAttributeValue` and compared it against every `data-target` on the page. A block
 *   drawn under its older word matched nothing.
 *
 * On the owner's report OOOt4Kouc5dT drawn at "All of it": the write door accepts 488 part ids, the
 * exact compare found 122 and the map found 134. For the twelve — every top-level block of the
 * report — *View original* printed "is not drawn on this page, so there is nowhere here to go to"
 * about a block filling the reader's screen. A product asserting something untrue about its own
 * page is worse than one that says nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE THIS FILE RED
 * ---------------------------------------------------------------------------------------
 *
 * Any second answer to that question. The sweep below walks EVERY region of a record's derived tree
 * against one drawn page and asserts, id by id, that the element `elementDrawing` names and the
 * element the landing goes to are the SAME OBJECT — not two elements that happen to match, the same
 * one. Re-implementing `elementFor` as an exact key compare turns every block in the fixture red,
 * which is the shape of the fault as it was found.
 *
 * ---------------------------------------------------------------------------------------
 * NO DOM, AND WHY THAT IS NOT A WEAKER TEST HERE
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node` and this project has ruled out jsdom — the same reason
 * `tests/mode.test.ts` and `tests/graph-edit.test.ts` give. The document stand-in below answers
 * exactly what the two readers ask of a page: `querySelectorAll('[data-target]')` and
 * `getAttribute('data-target')`. Nothing under test measures a pixel, so there is nothing here a
 * real browser would decide differently. What a real browser decides is measured separately, on
 * 5173, against the owner's own report.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  findRegion,
  flatten,
  namesOfParts,
  recordRegionsOf,
  RECORD_ROOT_ID,
  type Region,
} from '../src/shared/regions.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

const RECORD = 'RECaaaaaaaaa1'
const OTHER = 'RECbbbbbbbbb2'
/**
 * WHAT THE RECORD BEING DRAWN IS CALLED. A record page always has one, and the two parts that ARE
 * the record are named by it — see `namesOfParts` in src/shared/regions.ts — so a fixture that
 * announced a tree with no title would be measuring a page the product does not draw.
 */
const TITLE = 'What the bench showed, and what it did not'

/**
 * ONE RECORD HOLDING THE THREE CASES THE TWO READERS USED TO DISAGREE ABOUT.
 *
 * `b-1` and `b-4` are TOP-LEVEL blocks, which a report page draws under `reportBlock/<record>/<id>`
 * and never under a region key — the note on `regionMark` in SummaryBlocks says why. `b-3` is a
 * table nested inside a section, which IS drawn under its region key. Its rows and cells are real
 * parts of the record that no element addresses at all.
 */
const BLOCKS: SummaryBlock[] = [
  {
    id: 'b-1',
    type: 'text',
    heading: 'What the bench said',
    text: 'The first paragraph runs to here.\n\nAnd a second one, which is longer than the first was.',
  } as SummaryBlock,
  {
    id: 'b-2',
    type: 'section',
    title: 'A section holding a table',
    blocks: [
      { id: 'b-3', type: 'table', caption: 'What broke', rows: [{ cells: ['mount', 'load'] }, { cells: ['printed', '40N'] }] },
    ],
  } as unknown as SummaryBlock,
  { id: 'b-4', type: 'list', items: ['first item', 'second item'] } as unknown as SummaryBlock,
]

const DATA = { blocks: BLOCKS }

let root: Region
let everyId: string[]

/**
 * One stand-in element. It answers what the readers ask of an element and nothing else.
 *
 * IT GREW A SHAPE AND A PLACE ON 1 SEPTEMBER 2026, because the landing now LOOKS at whether the
 * reader can see what it went to instead of assuming it. A stand-in with no rect and no parent
 * would have made every landing here answer "off the screen", which is the false sentence in the
 * other direction. The default is an element in the document, unfolded, filling the top of a
 * 1,200-tall window — the ordinary case — and the two unhappy cases are built by hand below.
 */
interface Stub {
  key: string
  getAttribute: (name: string) => string | null
  classList: { add: (...names: string[]) => void; remove: (...names: string[]) => void; contains: (name: string) => boolean }
  scrollIntoView: () => void
  isConnected: boolean
  parentElement: Stub | null
  tagName: string
  open?: boolean
  closest: (selector: string) => { getAttribute: (name: string) => string | null } | null
  getBoundingClientRect: () => { top: number; bottom: number; left: number; right: number; width: number; height: number }
  /** What React would write over the added class. See `redrawnByReact` below. */
  lit: Set<string>
}

let went: Stub[] = []

/**
 * WHAT READING LENGTH THIS PAGE'S REPORT IS DRAWN AT, and it is a fixture knob because it is the
 * thing the press used to assert without looking.
 *
 * `SummaryBlocks` writes `data-rung` onto the drawing it makes and `readingLengthAbove` reads it
 * back off the nearest such drawing above an element. A stand-in with no `closest` would make the
 * landing throw; a stand-in that always answered `full` would agree with the press about a screen
 * neither had seen, which is the exact fault the describe at the foot of this file exists for. So
 * this is set per test, and the refused-storage case sets it short.
 */
let reportDrawnAt: string | null = 'full'

/** Whether this browser refuses to keep a setting. See `shimTheBrowser`. */
let storageRefuses = false

/** Run exactly the next timer that is due, and no more. See `runTheClock`. */
function runOneTimer(): void {
  pending.sort((a, b) => a.at - b.at || a.seq - b.seq)
  const next = pending.shift()
  if (next === undefined) throw new Error('no timer was waiting')
  clock = Math.max(clock, next.at)
  next.fn()
}

/** Everything watching an element's class attribute right now. See `shimTheBrowser`. */
let watchers: { target: Stub; then: () => void }[] = []

/**
 * REACT RENDERS THIS ELEMENT AGAIN AND WRITES `className` OVER WHATEVER WAS ON IT.
 *
 * That is not a hypothesis about React: `className` is set from props as one whole string, so a
 * class something else added is gone and the element is neither replaced nor disconnected. On the
 * owner's report OOOt4Kouc5dT it happened to 6 of 488 presses — the part was lit, the sentence said
 * *Showing …*, and the reader was left looking at a page with nothing marked on it. `showingNow`
 * answers `gone` only for an element that has LEFT the document, so nothing saw it.
 */
function redrawnByReact(one: Stub): void {
  one.lit.clear()
  tellTheWatchers(one)
}

/** Everything watching this element's class attribute hears about it. */
function tellTheWatchers(one: Stub): void {
  for (const watcher of [...watchers]) if (watcher.target === one) watcher.then()
}

function stub(key: string): Stub {
  const one: Stub = {
    key,
    getAttribute: (name: string) => (name === 'data-target' ? key : null),
    // A REAL SET AND NOT TWO EMPTY FUNCTIONS. The light the landing puts on a part is a class it
    // adds to an element React owns, and whether that class is still there four seconds later is
    // the fault this fixture has to be able to see. A `classList` that forgot every add agreed with
    // the code about a page neither had looked at.
    lit: new Set<string>(),
    // AND A CHANGE TO IT TELLS WHATEVER IS WATCHING, which is what a browser does and what this
    // shim did not: a `MutationObserver` on `class` fires for `classList.remove` as well as for a
    // whole `className` write. Without it, a keeper left running from an earlier press could not be
    // seen putting a light back on after `unlight` took it off — which is a fault this file found
    // in a browser before it could put it here.
    classList: {
      add: (...names: string[]) => {
        for (const n of names) one.lit.add(n)
        tellTheWatchers(one)
      },
      remove: (...names: string[]) => {
        for (const n of names) one.lit.delete(n)
        tellTheWatchers(one)
      },
      contains: (name: string) => one.lit.has(name),
    },
    scrollIntoView: () => void went.push(one),
    isConnected: true,
    parentElement: null,
    tagName: 'DIV',
    // THE DRAWING THIS ELEMENT IS INSIDE, ANSWERING WHAT LENGTH IT WAS DRAWN AT. The real page has
    // one `[data-rung]` above every part of the report body, written by `drawnAtLength`.
    closest: (selector: string) =>
      selector === '[data-rung]' && reportDrawnAt !== null
        ? { getAttribute: (name: string) => (name === 'data-rung' ? reportDrawnAt : null) }
        : null,
    getBoundingClientRect: () => ({ top: 0, bottom: 200, left: 0, right: 900, width: 900, height: 200 }),
  }
  return one
}

/**
 * WHAT THIS PAGE IS DRAWING, in the two spellings a real report page really uses.
 *
 * Top-level blocks under `reportBlock`, everything else under its region key, and — deliberately —
 * nothing at all for the table's rows and cells, which is how a real page draws a stored table.
 */
function pageDrawing(): Stub[] {
  const drawn: Stub[] = []
  for (const id of ['b-1', 'b-2', 'b-4']) drawn.push(stub(`reportBlock/${RECORD}/${id}`))
  const topLevel = new Set(['data.blocks[#b-1]', 'data.blocks[#b-2]', 'data.blocks[#b-4]'])
  for (const region of flatten(root)) {
    if (/\.rows\[/.test(region.id)) continue
    // THE RECORD ROOT CARRIES NO TARGET ON A REAL PAGE, measured over the corpus: nothing on a
    // record page is the whole record. It is here as the one part that truly has nowhere to go.
    if (region.id === root.id) continue
    if (topLevel.has(region.id)) continue
    drawn.push(stub(targetAttributeValue({ kind: 'region', recordId: RECORD, regionId: region.id })))
  }
  return drawn
}

/**
 * THE BROWSER'S CLOCK AND ITS QUEUE OF TIMERS, WHICH ARE ORDERED BY WHEN THEY ARE DUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE OLD ONE WAS A WORLD THE PRODUCT DOES NOT LIVE IN
 * ---------------------------------------------------------------------------------------
 *
 * `setTimeout` used to run its callback AT ONCE and add the delay to a clock. That is not a fast
 * browser; it is a browser with no ordering at all. The landing schedules the light to go out in
 * four seconds and then samples the scroll every hundred milliseconds, and under the old shim the
 * four-second timer ran first — so in this file the part was never lit by the time a press
 * answered, and no test here could have asked whether it was. It also jumped the clock four
 * seconds forward before a single sample was taken, which made every deadline in this file
 * meaningless.
 *
 * SO TIMERS ARE QUEUED AND RUN EARLIEST FIRST, and the clock moves to each one's due moment as it
 * runs. That is the ordering a browser gives, which is the only thing the code under test depends
 * on. `runTheClock` is what drives it, and it stops the moment the press has answered so a test can
 * look at the page as the reader sees it — lit, mid-way through its four seconds — rather than only
 * after everything has finished.
 */
let clock = 1_000_000
let pending: { at: number; seq: number; fn: () => void }[] = []
let timerSeq = 0

/**
 * Run the queue forward until `stop()` says so, or until nothing is left to run.
 *
 * THE STEP CAP IS A DEADLOCK, NOT A DEADLINE. Nothing under test loops forever; if something did,
 * a test hanging the suite is worse than a test failing, and this is the difference.
 */
function runTheClock(stop: () => boolean): void {
  for (let step = 0; step < 100_000; step += 1) {
    if (stop() || pending.length === 0) return
    pending.sort((a, b) => a.at - b.at || a.seq - b.seq)
    const next = pending.shift()
    if (next === undefined) return
    clock = Math.max(clock, next.at)
    next.fn()
  }
  throw new Error('the fixture browser ran 100,000 timers without the press answering')
}

/** The browser this module reads. */
function shimTheBrowser(drawn: readonly Stub[]): void {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      // A BROWSER THAT WILL NOT KEEP A SETTING, which is Safari in private browsing and some
      // locked-down profiles. `src/web/lib/detailchoice.ts` line 31 names the case; this is it, put
      // rather than described, because the press writes the reading length through that file.
      if (storageRefuses) throw new Error('The operation is insecure.')
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  }
  const listeners = { addEventListener: () => {}, removeEventListener: () => {} }
  ;(globalThis as unknown as { Date: unknown }).Date = new Proxy(Date, {
    get: (target, prop, receiver) => (prop === 'now' ? () => clock : Reflect.get(target, prop, receiver)),
  })
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    // A WINDOW WITH A SIZE AND A SCROLL POSITION THAT DOES NOT MOVE. Two equal readings of
    // `scrollY` are how the landing decides the scroll has arrived, so a page that never scrolls is
    // measured at once — which is what this fixture is.
    scrollY: 0,
    innerHeight: 1200,
    innerWidth: 900,
    location: { hash: `#/r/${RECORD}`, href: `http://127.0.0.1/#/r/${RECORD}` },
    matchMedia: () => ({ matches: false, ...listeners }),
    setTimeout: (fn: () => void, ms: number) => {
      timerSeq += 1
      pending.push({ at: clock + ms, seq: timerSeq, fn })
      return timerSeq
    },
    clearTimeout: (id: number) => void (pending = pending.filter((one) => one.seq !== id)),
    ...listeners,
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = storage
  // WHAT WATCHES AN ELEMENT'S `class` ATTRIBUTE. The landing keeps its light on through one of
  // these, because React writes `className` as one whole string and an added class is not in it.
  // `redrawnByReact` below is what makes this fire.
  ;(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = class {
    private target: Stub | null = null
    constructor(private readonly then: () => void) {}
    observe(target: Stub): void {
      this.target = target
      watchers.push({ target, then: this.then })
    }
    disconnect(): void {
      for (let i = watchers.length - 1; i >= 0; i -= 1) {
        if (watchers[i]?.target === this.target && watchers[i]?.then === this.then) watchers.splice(i, 1)
      }
    }
  }
  ;(globalThis as unknown as { document: unknown }).document = {
    // TWO QUESTIONS THE PRODUCT ASKS THE DOCUMENT, AND BOTH ARE ANSWERED. `regionsDrawnOn` asks for
    // every addressable element; `unlight` asks for whatever is carrying the landing's own class.
    // Answering the second with an empty list — which this shim did — made the fixture a page on
    // which nothing had ever been lit, so `unlight` could not be seen failing to put a light out.
    querySelectorAll: (selector: string) =>
      selector === '[data-target]'
        ? drawn
        : selector.startsWith('.')
          ? drawn.filter((one) => one.lit.has(selector.slice(1)))
          : [],
    querySelector: () => null,
    getElementById: () => null,
    ...listeners,
  }
}

type Original = typeof import('../src/web/components/agent/original.ts')
type DrawnHere = typeof import('../src/web/lib/drawnhere.ts')
type DrawnReport = typeof import('../src/web/lib/drawnreport.ts')

let marks: typeof import('../src/web/components/agent/marks.ts')
let original: Original
let drawnhere: DrawnHere
let drawnreport: DrawnReport
let drawn: Stub[]

beforeAll(async () => {
  // THE TREE THE PRODUCT ANNOUNCES, DERIVED THE WAY THE PRODUCT DERIVES IT.
  //
  // This one line was a lie for one day. `SummaryBlocks` announced `regionsOf`, whose root is
  // `data.blocks`, and this fixture handed the readers `recordRegionsOf`, whose root is `data` —
  // so the two tests below passed on a page the browser has never drawn, while the browser printed
  // "there is nowhere here to go to" about the whole report. `theFixtureIsTheProduct` at the foot
  // of this file is what stops that happening again: it asserts, against the component's own
  // source, that this is the derivation the drawing really announces.
  root = recordRegionsOf({ relations: [], title: TITLE, summary: 'One line about the report.', kind: 'report', data: DATA })
  everyId = flatten(root).map((one) => one.id)
  drawn = []
  shimTheBrowser(drawn)
  drawnhere = await import('../src/web/lib/drawnhere.ts')
  drawnreport = await import('../src/web/lib/drawnreport.ts')
  original = await import('../src/web/components/agent/original.ts')
  marks = await import('../src/web/components/agent/marks.ts')
})

beforeEach(() => {
  went = []
  reportDrawnAt = 'full'
  storageRefuses = false
  watchers = []
  pending = []
  drawn.length = 0
  drawn.push(...pageDrawing())
  // `rung` AND `parts` ARE WHAT THE DRAWING ANNOUNCES ABOUT ITSELF, and this fixture is a report
  // drawn whole with no by-part summary written, so it announces Full and no parts. What a landing
  // reads about the length is the `data-rung` attribute the stub above supplies, which is
  // `reportDrawnAt` and is what the cases below move; nothing in `original.ts` reads either of
  // these two. They are announced because the composer's chip for a part reads them.
  drawnreport.noteReportDrawn({
    recordId: RECORD,
    root,
    blocksField: 'blocks',
    kind: 'report',
    title: TITLE,
    rung: 'full',
    parts: null,
    form: null,
  })
})

/** Press *View original* for one part and hand back what the press did and where it went. */
function press(regionId: string, name = 'the part'): { says: string; landing: string; showing: string; at: Stub | null } {
  let out: { landing: string; says: string; showing: string } | null = null
  went = []
  original.viewTheOriginal(RECORD, [{ regionId, name, stillThere: true }], (landed) => void (out = landed))
  // AND THE BROWSER'S CLOCK IS RUN UNTIL IT ANSWERS, AND NOT ONE TIMER FURTHER. The light is due
  // out four seconds after the press; stopping here is what leaves the page in the state the reader
  // is looking at when the sentence appears.
  runTheClock(() => out !== null)
  const answered = out as unknown as { landing: string; says: string; showing: string } | null
  if (answered === null) throw new Error(`the press about ${regionId} answered nothing at all`)
  return { says: answered.says, landing: answered.landing, showing: answered.showing, at: went[0] ?? null }
}

// ============================================================ the sweep, over every part, no sample

describe('one page, one answer about which element is which part', () => {
  it('has a fixture worth sweeping', () => {
    // THE CONTROL. A fixture deriving four regions would pass everything below and prove nothing.
    expect(everyId.length).toBeGreaterThan(25)
    expect(everyId).toContain('data.blocks[#b-1]')
    expect(everyId.filter((id) => /\.rows\[/.test(id)).length).toBeGreaterThan(3)
  })

  it('lands on the very element elementDrawing names, for every part of the record', () => {
    const disagreed: string[] = []
    for (const id of everyId) {
      const named = drawnhere.elementDrawing({ kind: 'region', recordId: RECORD, regionId: id })
      const done = press(id)
      if (named === null) {
        // NOT DRAWN IS AN ANSWER AND IT IS CHECKED TOO: the press must not claim it landed on the
        // part when the one reader says no element is it.
        if (done.landing === 'thePart') disagreed.push(`${id}: nothing draws it and the press claims it landed on it`)
        continue
      }
      if (done.landing !== 'thePart') disagreed.push(`${id}: an element draws it and the press answered "${done.landing}"`)
      // IDENTITY, NOT EQUALITY. The stand-in element and the DOM's `Element` are different types to
      // the checker and the same object at run time, which is the whole claim being made.
      else if ((done.at as unknown) !== (named as unknown)) disagreed.push(`${id}: the mark's element and the landing's element are different objects`)
    }
    expect(disagreed, 'a landing and a mark answered differently about the same part').toEqual([])
  })

  it('finds an element for every part — the part, what holds it, or a part of it', () => {
    const nowhere = everyId.filter((id) => press(id).landing === 'nowhere')
    // NOT ONE PART OF THIS RECORD IS ABSENT FROM THIS PAGE, and until 1 September 2026 the record
    // root was. Nothing HOLDS the whole record, so the up-walk gave up and the press told a reader
    // that the report they were looking at was not on the page. It is INSIDE the root that the
    // answer lives: the blocks of it are all drawn. The walk down is what says so.
    expect(nowhere).toEqual([])
  })

  it('lands inside the record root rather than calling the whole record absent', () => {
    const done = press('data', 'the body of the report')
    expect(done.landing, 'the top of the tree was called absent while the page drew all of it').toBe('aPartOfIt')
    expect(done.showing).toBe('onTheScreen')
    // AND IT SAYS WHICH SECTION IT LANDED IN. *Showing the section inside it* named a KIND, which
    // is the one thing the sentence cannot be about: this record has four of them.
    expect(done.says).toBe(
      'This page does not draw the body of the report whole. Showing the section “Summary” inside it. The whole report is drawn.',
    )
  })

  it('goes to the biggest piece of a part the page has and not the deepest', () => {
    // BREADTH FIRST, AND THIS IS WHAT IT BUYS. Depth first and breadth first only differ when the
    // first child is not drawn and something under it is: depth first dives, and lands a reader who
    // asked for the whole body of the report on one sentence of the first block, with a whole later
    // block on the screen. This is that page: the first block is not drawn, one paragraph of it is,
    // and the second block is.
    const paragraph = flatten(root).find((one) => one.parentId === 'data.blocks[#b-1]')
    expect(paragraph, 'the fixture derived no part inside the first block').toBeDefined()
    const drawnHere = new Set([(paragraph as Region).id, 'data.blocks[#b-2]'])
    expect(marks.firstDrawnInside(root, 'data.blocks', drawnHere)).toBe('data.blocks[#b-2]')
  })
})

// ============================================================ the fault as it was found

describe('a block drawn under its older word is a block the reader is taken to', () => {
  it('lands on the reportBlock element for a top-level block', () => {
    const done = press('data.blocks[#b-1]', 'the passage')
    expect(done.landing).toBe('thePart')
    expect(done.at?.key).toBe(`reportBlock/${RECORD}/b-1`)
    expect(done.says).toBe('Showing the passage these words stand for. The whole report is drawn.')
  })

  it('never says a block on the screen is not on the screen', () => {
    for (const id of ['data.blocks[#b-1]', 'data.blocks[#b-2]', 'data.blocks[#b-4]']) {
      expect(press(id).says, id).not.toContain('is not drawn on this page')
    }
  })

  it('lands on the two accepted spellings of one paragraph alike', () => {
    // THE WORKED EXAMPLE IN src/server/api/zoom.ts AND THE ID A RIGHT-CLICK GIVES. They name two
    // different parts — a block and one run inside it — and the door accepts both. What it must not
    // do is accept both and behave differently, which is what it did until this landed.
    const block = press('data.blocks[#b-1]')
    const run = press('data.blocks[#b-1].text@0')
    expect([block.landing, run.landing]).toEqual(['thePart', 'thePart'])
  })
})

// ============================================================ what is genuinely not drawn

describe('a part with no element of its own is held, not absent', () => {
  it('lands on the table and says it is the table, for a stored row', () => {
    const row = everyId.find((id) => /\.rows\[\d+\]$/.test(id))
    expect(row, 'the fixture derived no table row').toBeDefined()
    const done = press(row as string, 'the row')
    expect(done.landing).toBe('whatHoldsIt')
    expect(done.at?.key).toContain('b-3')
    // AND IT SAYS WHICH TABLE. *the table* is what `wordForRegion` answers about all of them.
    expect(done.says).toBe(
      'This page does not draw the row on its own. Showing the table “mount load printed 40N What broke” that holds it. The whole report is drawn.',
    )
  })

  /**
   * THE SWEEP BEHIND THE TWO SENTENCES ABOVE: every press that lands somewhere OTHER than the part
   * asked for says WHICH part it landed on, in the one namer's words.
   *
   * Measured in a browser on 2 September 2026, before this: a press against the record root landed
   * and said *"Showing the section inside it"*, while `namesOfParts` had *the section “The short
   * answer”* for that very element. This asserts the sentence against that map rather than against
   * a string written here, so a second namer growing back in this file fails whatever it says.
   */
  it('names which part it landed on instead, in the words the one namer uses', () => {
    const names = namesOfParts(root, 'report', TITLE)
    /** Which element draws which part, through the one reader of that question. */
    const drawing = new Map<string, unknown>()
    for (const id of everyId) {
      const at = drawnhere.elementDrawing({ kind: 'region', recordId: RECORD, regionId: id })
      if (at !== null) drawing.set(id, at)
    }
    const wrong: string[] = []
    let landedElsewhere = 0
    for (const id of everyId) {
      const done = press(id)
      if (done.landing !== 'whatHoldsIt' && done.landing !== 'aPartOfIt') continue
      landedElsewhere += 1
      const on = [...drawing.entries()].find(([, at]) => at === (done.at as unknown))?.[0]
      if (on === undefined) {
        wrong.push(`${id}: landed on an element that draws no part of this record`)
        continue
      }
      const name = names.get(on)
      if (name === undefined) {
        wrong.push(`${id}: the namer has no name for ${on}, which it must, being in this tree`)
        continue
      }
      if (!done.says.includes(`Showing the ${name} `)) {
        wrong.push(`${id}: landed on ${on} — "the ${name}" — and said "${done.says}"`)
      }
    }
    expect(wrong, 'a landing named something other than the part it landed on').toEqual([])
    // THE CONTROL. A sweep where nothing lands elsewhere asserts nothing at all.
    expect(landedElsewhere, 'no press in this fixture landed anywhere but on the part itself').toBeGreaterThan(3)
  })

  it('says nowhere only when nothing on the page draws it, holds it, or is part of it', () => {
    drawnreport.noteReportDrawn({ recordId: OTHER, root, blocksField: 'blocks', kind: 'report', title: TITLE, rung: 'full', parts: null, form: null })
    const done = press('data.blocks[#b-1]', 'the passage')
    expect(done.landing).toBe('nowhere')
    expect(done.showing).toBe('noPlace')
    // AND IT STARTS WITH A CAPITAL. The names are written to sit inside a sentence — "the passage",
    // "the body of the report" — and this is the one place one of them is the first word.
    expect(done.says).toBe(
      'The passage is not drawn on this page, nothing on this page holds it and this page draws no part of it, so there is nowhere here to go to.',
    )
  })
})

// ============================================================ it never claims to have shown it

/**
 * THE SEVENTH DOOR'S SECOND HALF, PUT WITHOUT A BROWSER.
 *
 * `section.links` lives inside a closed `<details class="rd-fold">` on every record page, and the
 * press answered *"Showing the section “Links” … with the whole report drawn."* while `scrollY` had
 * not moved, the rect sat at 13,079 in a 1,200-tall window and `innerText` was empty. An element
 * existing was being read as an element being seen.
 *
 * These three put the three ways that can fail. WHAT THEY CANNOT PUT is the scroll, because nothing
 * here scrolls — the moment the landing chooses to measure at is a real browser's problem and is
 * measured in tests/view-original-lands-where-it-says.test.ts against a real one. What they hold is
 * that the SENTENCE follows the looking.
 */
describe('a landing says what it found and not what it meant to do', () => {
  /** Put one drawn element in a state and press the part it draws. */
  const inState = (regionId: string, change: (one: Stub) => void) => {
    // THE ONE READER NAMES THE ELEMENT, here as everywhere. Finding it by a key spelled in this
    // file would miss every block drawn under its older word, which is the fault the sweep above
    // exists for.
    const one = drawnhere.elementDrawing({ kind: 'region', recordId: RECORD, regionId }) as unknown as Stub | null
    expect(one, `the fixture draws no element for ${regionId}`).not.toBeNull()
    change(one as Stub)
    return press(regionId, 'the section')
  }

  it('says a part shut inside a fold is inside a fold, and not that it was shown', () => {
    // A FOLD THAT WILL NOT OPEN. The landing sets `open` on every closed `<details>` above the
    // element before it scrolls, so the only way to reach this answer is a fold that refuses —
    // which is what a fold rebuilt by React underneath the press behaves like.
    const stuck: Stub = { ...stub('shut'), tagName: 'DETAILS', open: false }
    Object.defineProperty(stuck, 'open', { get: () => false, set: () => {}, configurable: true })
    const done = inState('data.blocks[#b-2]', (one) => void (one.parentElement = stuck))
    expect(done.landing, 'the element is drawn, so the place it landed is still the part').toBe('thePart')
    expect(done.showing).toBe('insideAFold')
    expect(done.says).toBe('The section is on this page inside a fold that would not open, so it is not on the screen.')
    expect(done.says, 'the press claimed to have shown something the reader cannot see').not.toContain('Showing')
  })

  it('says a part below the window is off the screen, and not that it was shown', () => {
    const done = inState(
      'data.blocks[#b-2]',
      (one) =>
        void (one.getBoundingClientRect = () => ({
          top: 13_079,
          bottom: 13_279,
          left: 0,
          right: 900,
          width: 900,
          height: 200,
        })),
    )
    expect(done.showing).toBe('offScreen')
    expect(done.says).toBe('The section is on this page but this press could not bring it onto the screen.')
  })

  /**
   * A SCROLL THAT HAS NOT BEGUN IS NOT A SCROLL THAT HAS ARRIVED, AND THE OLD TEST COULD NOT TELL
   * THEM APART.
   *
   * `whenTheScrollHasStopped` sampled `window.scrollY` and read two equal readings as arrival. A
   * smooth scroll does not move in its first hundred milliseconds, so a scroll that had not started
   * gave the same two equal readings a page already in place gives, and the rect was taken before
   * anything had moved. Measured over 488 presses on OOOt4Kouc5dT, twice, on 1 September 2026: the
   * same 19 ids printed "is on this page but this press could not bring it onto the screen" both
   * times, and all 19 sat at rect top 32 three and a half seconds later. `offScreen` was printed
   * truthfully zero times out of 19.
   *
   * THIS PUTS THAT PAGE. The element is at 13,079 in a 1,200-tall window and arrives at rect top 32
   * three and a half seconds later — the two numbers that were measured — and the window never
   * moves, which is what made the old sampler answer at once. The press must wait for it. The test
   * beside this one, where the rect never arrives, is what stops the fix being "always wait".
   */
  it('waits for a scroll that has not begun rather than calling the part off the screen', () => {
    // THE JOURNEY IS COUNTED IN READS OF THE BOX AND NOT IN THIS FIXTURE'S MILLISECONDS, and that
    // is a fact about the fixture rather than about the product: the fake `setTimeout` moves the
    // clock forward by whatever delay is ASKED FOR, so scheduling the four-second light on the
    // landed element jumps the clock past any deadline written in time. Reads are what the wait
    // really spends, so reads are what the page's journey is written in. Off the screen for the
    // first five, at rect top 32 from the sixth — the two positions that were measured.
    let read = 0
    const done = inState('data.blocks[#b-2]', (one) => {
      one.getBoundingClientRect = () => {
        read += 1
        return read > 5
          ? { top: 32, bottom: 232, left: 0, right: 900, width: 900, height: 200 }
          : { top: 13_079, bottom: 13_279, left: 0, right: 900, width: 900, height: 200 }
      }
    })
    expect(done.showing, 'the press answered before the page had gone anywhere').toBe('onTheScreen')
    expect(done.says, 'the press said it could not bring onto the screen a part it brought').not.toContain(
      'could not bring it onto the screen',
    )
  })

  it('says the page redrew when the element it lit has left the document', () => {
    const done = inState('data.blocks[#b-2]', (one) => void (one.isConnected = false))
    expect(done.showing).toBe('gone')
    expect(done.says).toBe(
      'The page redrew while this press was on its way to the section, so it is no longer on this page.',
    )
  })
})

// ============================================================ the light stays on the part

describe('the part the press landed on stays lit while the page redraws under it', () => {
  it('is lit at all, which is what the sentence is telling the reader to look at', () => {
    const done = press('data.blocks[#b-1]', 'the passage')
    expect(done.at?.lit.has(original.LANDED_ON), 'the press said Showing and lit nothing').toBe(true)
  })

  it('is the only thing lit, because the press before it was put out and stayed out', () => {
    // ONE PRESS, ONE LIGHT — `unlight`'s own claim. The keeper is what makes it a claim worth
    // testing: it puts the class back whenever something writes over it, and the thing that writes
    // over it next is `unlight` on behalf of the NEXT press. Measured in a browser over 488 presses
    // with the keeper in and the stop-the-keeper line out: the number of presses that lit something
    // outside the window went from 15 to 32, because the part the previous press landed on was
    // still lit and still first in the document.
    const first = press('data.blocks[#b-1]', 'the passage').at as Stub
    expect(first.lit.has(original.LANDED_ON)).toBe(true)
    const second = press('data.blocks[#b-2]', 'the section').at as Stub
    expect(second.lit.has(original.LANDED_ON), 'the second press lit nothing').toBe(true)
    expect(first.lit.has(original.LANDED_ON), 'two parts were lit at once').toBe(false)
  })

  it('is not put out by the four-second timer belonging to an earlier press', () => {
    // PRESSES COME CLOSER TOGETHER THAN FOUR SECONDS, so the earlier press's timer comes due while
    // the later press is the one being shown. Measured over 488 presses on OOOt4Kouc5dT with that
    // timer putting out whatever was lit rather than its own light: 279 of them said "Showing" with
    // nothing lit on the page at all — a sentence pointing at a mark that was not there.
    const first = press('data.blocks[#b-1]', 'the passage').at as Stub
    const second = press('data.blocks[#b-2]', 'the section').at as Stub
    expect(second.lit.has(original.LANDED_ON)).toBe(true)
    // THE EARLIEST TIMER STILL WAITING IS THE FIRST PRESS'S, because it was scheduled first and both
    // are four seconds after their own press.
    runOneTimer()
    expect(first.lit.has(original.LANDED_ON), 'the first press was left lit').toBe(false)
    expect(second.lit.has(original.LANDED_ON), 'an earlier press put out the light of a later one').toBe(true)
  })

  it('is lit again after React writes className over the added class', () => {
    const done = press('data.blocks[#b-1]', 'the passage')
    const at = done.at as Stub
    expect(at.lit.has(original.LANDED_ON)).toBe(true)
    redrawnByReact(at)
    // NOT `gone`, NOT DISCONNECTED, NOT MOVED — just unlit, which is why nothing caught this.
    expect(at.isConnected, 'the fixture disconnected the element, which is a different fault').toBe(true)
    expect(at.lit.has(original.LANDED_ON), 'the light went out and stayed out under a redraw').toBe(true)
  })
})

// ============================================================ the eighth door: how much is drawn

/**
 * THE SENTENCE SAYS HOW MUCH OF THE REPORT IS DRAWN BECAUSE IT LOOKED, NOT BECAUSE IT ASKED.
 *
 * `viewTheOriginal` puts the reading length to Full and every landed sentence used to end *"with
 * the whole report drawn."* Nothing read the page back. Measured in Chromium on 1 September 2026
 * with `sessionStorage` writes refused: the report body was 4,525 characters before the press AND
 * 4,525 after it — Full is 30,297 — 34 of 141 regions on the page, no preset drawn as chosen, and
 * the composer said the whole report was drawn. At the card length it called `section.summary`
 * absent while sitting at 8,647 of 30,297.
 *
 * THE FOUR HERE ARE THE FOUR STATES THE PAGE CAN BE IN AFTERWARDS, and the fixture puts each of
 * them rather than describing it: the drawing says Full; it says something shorter; it says
 * something shorter AND the browser refused to keep the choice, which is the reason; and nothing on
 * the page says at all. The last is not a hole — a landing on a section panel is outside the
 * report's own drawing — and what it must not do is claim the whole report is drawn.
 */
describe('a landing says how much of the report the press really left drawn', () => {
  it('says the whole report is drawn only where the drawing says it is', () => {
    expect(press('data.blocks[#b-1]', 'the passage').says).toBe(
      'Showing the passage these words stand for. The whole report is drawn.',
    )
  })

  it('says which shorter length the report is still at, rather than claiming it is whole', () => {
    reportDrawnAt = 'outline'
    const done = press('data.blocks[#b-1]', 'the passage')
    expect(done.says).toBe(
      "Showing the passage these words stand for. The report is still drawn at Level 4 and not in full.",
    )
    expect(done.says, 'the press claimed a screen it had not looked at').not.toContain('The whole report is drawn')
  })

  it('says the browser would not keep the length, where that is why it is still short', () => {
    storageRefuses = true
    reportDrawnAt = 'outline'
    const done = press('data.blocks[#b-1]', 'the passage')
    expect(done.says).toBe(
      "Showing the passage these words stand for. This browser would not keep the reading length, so the report is still drawn at Level 4 and not in full.",
    )
  })

  it('claims nothing about the length where nothing on the page says one', () => {
    reportDrawnAt = null
    const done = press('data.blocks[#b-1]', 'the passage')
    expect(done.says).toBe('Showing the passage these words stand for.')
    expect(done.says).not.toContain('whole report')
  })
})

// ============================================================ the fixture is the product's world

/**
 * A TEST THAT AGREES WITH THE CODE BY BEING GIVEN A WORLD THE CODE DOES NOT LIVE IN IS WORSE THAN
 * NO TEST, AND THIS FILE WAS ONE FOR A DAY.
 *
 * Everything above hands the readers a tree built by `recordRegionsOf`. Until 1 September 2026 the
 * product handed them a tree built by `regionsOf` — the report body, whose root is `data.blocks`
 * and which holds nothing above it. So `nearestDrawn` and `firstDrawnInside` were blind above
 * `data.blocks` in the browser and sighted in this file, and the two tests that say no part answers
 * "nowhere" were green while every "nowhere" sentence the owner's report could print was false:
 * `data` with 23 drawn descendants and `section.summary` with 12 both answered "is not drawn on
 * this page, nothing on this page holds it and this page draws no part of it", with 30,297
 * characters of exactly that part on the screen.
 *
 * SO THE FIXTURE IS TIED TO THE PRODUCT HERE, and not by a comment asking somebody to keep them in
 * step. The first case below holds the tree's root to the record root the write door validates
 * against. The second presses the two parts the browser once called absent. The browser
 * measurement is in tests/view-original-lands-where-it-says.test.ts and on 5173 by hand.
 */
describe('the fixture is the world the product really draws in', () => {
  it('is rooted at the record, which is what the write door validates against', () => {
    // THE DOOR'S ROOT AND NOT THE BODY'S. `data.blocks` here would mean this file had gone back to
    // measuring a page with no sections above the writing.
    expect(root.id).toBe(RECORD_ROOT_ID)
    expect(root.id).toBe('data')
    expect(findRegion(root, 'data.blocks'), 'the record tree has lost the report body').not.toBeNull()
    expect(findRegion(root, 'section.summary'), 'the record tree has lost its sections').not.toBeNull()
  })

  it('lands on the two parts the browser called absent while drawing 30,297 characters of them', () => {
    for (const [id, name] of [['data', 'the body of the report'], ['section.summary', 'the report']] as const) {
      const done = press(id, name)
      expect(done.landing, `${id} was called absent`).not.toBe('nowhere')
      expect(done.says, id).not.toContain('there is nowhere here to go to')
    }
  })
})
