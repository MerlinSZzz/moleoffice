// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE AGENT USE PAGE DRAWS, ASSERTED ON THE MARKUP RATHER THAN ON A FLAG.
 *
 * Five waves of this campaign shipped a server half whose only door was an HTTP client, and every
 * one was caught by a verifier rather than by its builder. This file asks the only question that
 * separates the two: can a person do this without an HTTP client?
 *
 * THE HARDEST CLAIM HERE IS THE HOTSPOT SECTION, and it is the one that would have shipped wrong.
 * The overlap read exists, answers 200, and answers about WHAT OVERLAPS NOW. Drawing its rows under
 * a heading that says *keeps meeting* would put current state on a page about a range, with nothing
 * failing anywhere. So the page draws rows only when the read says which window it honoured.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { buildTheFirstOfficeInAHook } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { endedBecauseWord } from '../src/shared/words.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

/**
 * THE SMALLEST STAND-IN FOR A WINDOW, installed before anything that reaches one is loaded.
 *
 * The runner's environment is `node`, and `src/web/api.ts` reads `window.localStorage` at module
 * scope. Adding a DOM would be a new dependency this project has ruled out, so this is the same
 * stand-in `tests/freshness.test.ts` and two others already use.
 */
beforeAll(() => {
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
})

/** Draw the page with the reads stubbed, so this file is about the drawing and not about the server. */
async function draw(replies: Record<string, unknown>): Promise<string> {
  const { UsagePage } = await import('../src/web/pages/UsagePage.tsx')
  const api = (await import('../src/web/api.ts')).api as unknown as Record<string, unknown>
  const saved: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(replies)) {
    saved[name] = api[name]
    api[name] = () => Promise.resolve(value)
  }
  try {
    // `useAsync` starts in `loading` on the server, so this markup is the page's FIRST PAINT. That
    // is deliberate for the two assertions about what a reader meets before anything has answered.
    return renderToStaticMarkup(createElement(UsagePage))
  } finally {
    for (const [name, value] of Object.entries(saved)) api[name] = value
  }
}

const NOTHING = {
  usageSummary: () => ({}),
  usageTraces: () => ({}),
  usageOperations: () => ({}),
  usageOutsideReads: () => ({}),
  usagePatterns: () => ({}),
  usageSequences: () => ({}),
  workDomainOverlaps: () => ({}),
}

/** Draw one component of the page, with the hoisted style blocks removed. */
function drawPart(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

/** A summary with nothing measured, so a case can change the one field it is about. */
const A_SUMMARY = {
  workspace: 'default',
  recording: true,
  calls: 0,
  foldedCalls: 0,
  tracedCalls: 0,
  untracedCalls: 0,
  outsideReads: 0,
  stretchSummaries: 0,
  oldestCallAt: null,
  windowDays: { untraced: 14, traced: 180 },
  lastPrune: null as { at: string; untracedDeleted: number; tracesPruned: number; stretchesWritten: number } | null,
  rowsNotWritten: 0,
  traceHeadersIgnored: 0,
}

/** One stretch, as `GET /api/usage/traces` answers it. */
const A_STRETCH = {
  traceId: 'trace-1',
  seq: 1,
  purpose: 'building',
  startedAt: '2026-08-27 10:00',
  minutes: 12,
  endedBecause: 'quiet',
  calls: 40,
  reads: 30,
  writes: 8,
  refused: 2,
  bytes: 4096,
  distinctOperations: 6,
  outsideReads: 0,
  gapVerdicts: 0,
  localCalls: 40,
  remoteCalls: 0,
  unknownCalls: 0,
  actorId: 'claude-code',
  sessionId: 'sess-1',
}

describe('the page exists and says what it is', () => {
  it('draws its heading and every band, so nothing on it is reachable only by curl', async () => {
    const html = await draw(NOTHING)
    expect(html).toContain('Agent use')
    expect(html).toContain('Pieces of work, newest first')
    expect(html).toContain('What agents keep asking for')
    expect(html).toContain('What agents went outside Mole Office for')
    expect(html).toContain('What has crossed a threshold')
    // THE SEVENTH BAND. `GET /api/usage/sequences` shipped with this page and had no consumer in the
    // browser at all, so the page built to end the curl-only habit shipped one more of them.
    expect(html).toContain('What agents do next')
    expect(html).toContain('keeps meeting')
    expect(html).toContain('How long agents spent working')
  })

  it('says an outside read is something an agent said, at the top of the band that draws them', async () => {
    const html = await draw(NOTHING)
    // THE ONE SENTENCE THIS TABLE MAY NOT LOSE. Every row under it is a claim, and a reader who
    // took it for a measurement would read an agent's habit as evidence about Mole Office.
    expect(html).toContain(sayInEnglish('dev.usage.everyRowHereIsSomethingAnAgent'))
    expect(html.slice(html.indexOf(sayInEnglish('dev.usage.whatAgentsWentOutsideMoleOfficeFor'))), 'the sentence is not under the band heading').toContain(sayInEnglish('dev.usage.everyRowHereIsSomethingAnAgent'))
  })

  it('says nothing is filed automatically, where the crossings are drawn', async () => {
    const html = await draw(NOTHING)
    expect(html).toContain(sayInEnglish('dev.usage.nothingHereIsFiledForYouA'))
  })
})

/**
 * THE COUNT SAYS WHICH PART OF IT WAS FOLDED. Criterion U6 and the third invariant: a number whose
 * meaning changed when the fold landed must say so where it is drawn, or a reader draws the office
 * as having been asked less than it was.
 */
describe('a folded count says which part of it was folded', () => {
  const A_FOLDED = {
    operation: 'handle.waiting',
    calls: 120,
    foldedCalls: 120,
    refused: 0,
    bytes: 0,
    msMedian: null,
    readBackShare: null,
    readBackOf: 0,
  }
  const A_STORED = { ...A_FOLDED, operation: 'record.list', calls: 5, foldedCalls: 0, bytes: 100 }

  it('draws the folded part and the sentence saying what a counted-by-the-hour count is', async () => {
    const { Operations } = await import('../src/web/pages/UsagePage.tsx')
    const html = drawPart(
      createElement(Operations, {
        rows: [A_FOLDED, A_STORED],
        threshold: { share: 0.3, occurrences: 20, traces: 3 },
        showAll: true,
        onShowAll: () => {},
        developer: false,
      }),
    )
    expect(html).toContain('handle.waiting')
    expect(html, 'the folded count does not say it was folded').toContain('120 calls counted by the hour')
    expect(html).toContain(sayInEnglish('dev.usage.someOperationsAreCountedOnceAnHour'))
    // AND THE UNFOLDED ROW IS DRAWN THE WAY IT ALWAYS WAS, so the folded branch is not the only one.
    expect(html).toContain('5 calls · 100 bytes')
  })

  it('says nothing about folding when every operation is stored one call at a time', async () => {
    const { Operations } = await import('../src/web/pages/UsagePage.tsx')
    const html = drawPart(
      createElement(Operations, {
        rows: [A_STORED],
        threshold: { share: 0.3, occurrences: 20, traces: 3 },
        showAll: true,
        onShowAll: () => {},
        developer: false,
      }),
    )
    // THE CONTROL. A page that drew the sentence unconditionally would pass the case above and be
    // wrong about every operation that is stored the ordinary way.
    expect(html).not.toContain('counted by the hour')
  })
})

/**
 * NOBODY HAS TIDIED AND A TIDY THAT FOUND NOTHING ARE TWO FACTS, AND THE PAGE HAS TO DRAW THEM APART.
 *
 * `lastPruneSentence`'s own docstring said it was a function *so that a test can hold the
 * difference*, and no test held it. The wave-13 fault this closes is the windows being published by
 * a page with no way of knowing whether anything had enforced them; the fault that repair then
 * introduced is a third one — "nobody has enforced them" written as an ordinary paragraph, which
 * reads exactly like a report that everything is fine.
 */
describe('whether anything has enforced the windows, told apart from a tidy that found nothing', () => {
  const WINDOWS = { untraced: 14, traced: 180 }

  it('says nothing at all when no prune has run, so the caller must draw an absence', async () => {
    const { lastPruneSentence } = await import('../src/web/pages/UsagePage.tsx')
    expect(lastPruneSentence({ lastPrune: null, windowDays: WINDOWS })).toBeNull()
  })

  it('says what the prune did when one has run and found nothing past either window', async () => {
    const { lastPruneSentence } = await import('../src/web/pages/UsagePage.tsx')
    const sentence = lastPruneSentence({
      lastPrune: { at: '2026-08-27 02:00', untracedDeleted: 0, tracesPruned: 0, stretchesWritten: 0 },
      windowDays: WINDOWS,
    })
    // A ROW OF ZEROES IS AN ANSWER. Somebody looked at both windows and there was nothing past
    // them, which is the fact the null above does not carry.
    expect(sentence).toContain('Last tidied at 2026-08-27 02:00')
    expect(sentence).toContain('0 requests')
  })

  /**
   * WHAT A READER MEETS IN EACH OF THE TWO STATES, DRAWN AND COMPARED.
   *
   * This used to read this file's own source: find the sentence, walk backwards to the nearest
   * `<Absence`, and check the characters `looked={false}` sat between them. That stays green if the
   * component is moved, renamed or given a branch that never runs, and it goes red on an edit that
   * changes nothing a reader sees. Both drawings are now asked for and compared.
   */
  it('draws nobody-has-tidied differently from a tidy that found nothing', async () => {
    const { TheWindow } = await import('../src/web/pages/UsagePage.tsx')
    const nobodyLooked = drawPart(
      createElement(TheWindow, { summary: { ...A_SUMMARY, lastPrune: null }, developer: false }),
    )
    const lookedAndFoundNone = drawPart(
      createElement(TheWindow, {
        summary: {
          ...A_SUMMARY,
          lastPrune: { at: '2026-08-27 02:00', untracedDeleted: 0, tracesPruned: 0, stretchesWritten: 0 },
        },
        developer: false,
      }),
    )

    // NOBODY HAS TIDIED. The word and the sentence a reader meets, and no claim that anything ran.
    expect(nobodyLooked).toContain('nothing tidied away yet')
    expect(nobodyLooked).toContain(sayInEnglish('dev.usage.nothingHasBeenTidiedAwaySinceThis'))
    expect(nobodyLooked, 'a prune that never ran is being reported as one that ran').not.toContain('Last tidied at')

    // SOMEBODY LOOKED AND THERE WAS NOTHING PAST EITHER WINDOW. A row of zeroes is an answer.
    expect(lookedAndFoundNone).toContain('Last tidied at 2026-08-27 02:00')
    expect(lookedAndFoundNone).toContain('0 requests')
    expect(lookedAndFoundNone).not.toContain('nothing tidied away yet')

    // AND THE TWO ARE NOT ONE DRAWING. The absence carries a mark beside its word; the report of a
    // tidy that found nothing is a sentence. A reader can tell them apart without reading either.
    expect(nobodyLooked).not.toBe(lookedAndFoundNone)
    expect(nobodyLooked, 'nobody-has-tidied is drawn as an ordinary paragraph').toContain('<svg')
    expect(lookedAndFoundNone).not.toContain('<svg')
  })
})

describe('the lifecycle band refuses to invent a duration', () => {
  it('says Mole Office cannot answer how much working time this campaign took, and draws no zero', async () => {
    const html = await draw(NOTHING)
    // *DO NOT FABRICATE HISTORICAL TRANSITION TIMESTAMPS THAT PANELX NEVER OBSERVED.* A zero here
    // would be invented precision wearing a tidy face: it says the answer is none, when the answer
    // is that nobody ever recorded it.
    expect(html).toContain(sayInEnglish('dev.usage.workingTimeIsCountedFromTheMoment'))
    // THE ABSENCE IS A WORD AND ITS SENTENCE SURVIVES ON THE TOOLTIP, which is where a reader who
    // wants the reason finds it and where a screen reader reads it out.
    expect(html).toContain('never recorded')
    expect(html).toContain('has never recorded when an agent became Working')
    expect(html).toContain('no attachment has ever been filed here')
    expect(html).not.toContain('0 minutes working')
  })

  it('says the time something last arrived claiming to be an agent is not shown on this page', async () => {
    const html = await draw(NOTHING)
    // THE REQUEST LOG HOLDS THIS TIME, and no read sends it to the page (wave 13y round 142). So the row says the
    // page does not show it. "never recorded" would be false, and a count of requests does not say when.
    expect(html).toContain(sayInEnglish('dev.usage.notShownOnThisPageYet'))
    expect(html).toContain(sayInEnglish('dev.usage.theRequestLogHoldsThisTimeBut'))
  })
})

describe('the tools band says its empty line', () => {
  it('draws the sentence when nothing has called, where a phone with no hover can read it', async () => {
    const { Frameworks } = await import('../src/web/pages/UsagePage.tsx')
    const html = drawPart(createElement(Frameworks, { reading: { byFramework: [] } as never }))
    // WHAT A READER SEES: the screen reader's copy and every tag taken out, so a sentence only on the hover is not seen.
    const seen = html.replace(/<span class="px-sr">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '')
    expect(seen).toContain(sayInEnglish('dev.usage.nothingHasCalledMoleOfficeInThis'))
  })
})

describe('the hotspot section draws rows only when the read said which window it honoured', () => {
  it('draws none, and says why, for the read as it exists today', async () => {
    const { hotspotRows, HOTSPOTS_ANSWER_ABOUT_NOW } = await import('../src/web/pages/UsagePage.tsx')
    // THE FIXTURE IS THE ROUTE AS IT IS: present, 200, no window echoed, and a list of overlaps that
    // are open NOW. This is the failure that would actually have happened, and it is not an absent
    // route — it is a present one answering a different question under the right-looking heading.
    const rows = hotspotRows({ overlaps: [{ key: 'a|b|src/shared/time.ts', overlapClass: 'write_write' }] })
    expect(rows).toBeNull()
    expect(HOTSPOTS_ANSWER_ABOUT_NOW).toBe(sayInEnglish('dev.usage.hotspotsNow'))
  })

  it('draws them the day the read echoes a window, so this is a rule and not a switch left off', async () => {
    const { hotspotRows } = await import('../src/web/pages/UsagePage.tsx')
    const rows = hotspotRows({
      window: { from: '2026-08-01 00:00:00', to: '2026-08-27 00:00:00' },
      overlaps: [{ key: 'a|b|src/shared/time.ts', overlapClass: 'write_write' }],
    })
    expect(rows?.length).toBe(1)
  })

  /**
   * THE SIX CLASSES, WRITTEN OUT BY HAND, WHICH IS THE WHOLE POINT.
   *
   * The assertion this replaces built its fixture from `Object.keys(OVERLAP_CLASSES)` and then
   * compared the result against `Object.keys(OVERLAP_CLASSES)`, so it compared the shared list with
   * itself and could not fail for any content of that list. The design's own named mutation for this
   * page — *add a seventh class to the shared list and watch it go red* — was run and the file
   * stayed at 8 passed.
   *
   * A hand-written list is a second copy of the six names, which is normally this repository's named
   * defect. It is right here for the same reason a control is right: the list under test cannot also
   * be the list the test is written against. The two are held equal by the first assertion below, so
   * they cannot drift silently — a seventh class fails here, in this file, by name.
   */
  const THE_SIX = ['write_write', 'write_dependency', 'interface_impact', 'create_in_area', 'semantic_only', 'read_read']

  it('draws only class words the Work Domain thread declares, because severity is that thread’s', async () => {
    const { OVERLAP_CLASSES } = await import('../src/shared/workdomain.ts')
    const { hotspotRows } = await import('../src/web/pages/UsagePage.tsx')
    // THE SHARED LIST IS EXACTLY THESE SIX. Add a seventh to `src/shared/workdomain.ts` and this
    // line goes red, which is the mutation the design names and the old assertion could not feel.
    expect(Object.keys(OVERLAP_CLASSES).sort()).toEqual([...THE_SIX].sort())
    const rows = hotspotRows({
      window: { from: 'a', to: 'b' },
      overlaps: THE_SIX.map((overlapClass, i) => ({ key: `k${String(i)}`, overlapClass, subject: 'src/shared/time.ts' })),
    })
    // THE PAGE SHOWS THE CLASS IN THAT THREAD'S OWN WORD AND NEVER COMPUTES IT. Ranking by a
    // severity this thread does not own would put one thread's judgement on another thread's fact.
    expect(rows?.map((r) => r.word)).toEqual(THE_SIX.map((key) => OVERLAP_CLASSES[key as keyof typeof OVERLAP_CLASSES].word))
  })

  it('never draws the stored key, for the subject or for the class', async () => {
    const { hotspotRows } = await import('../src/web/pages/UsagePage.tsx')
    // THE KEY IS A COMPOSITE OF TWO RECORD IDS AND A PATH and was drawn raw on a Normal-mode screen.
    // It is latent only because the band draws nothing until the read echoes a window.
    const rows = hotspotRows({
      window: { from: 'a', to: 'b' },
      overlaps: [{ key: 'a|b|src/shared/time.ts', overlapClass: 'write_write', subject: 'src/shared/time.ts' }],
    })
    expect(rows?.[0]?.subject).toBe('src/shared/time.ts')
    expect(rows?.[0]?.word).toBe('Both changing the same file')
    expect(JSON.stringify(rows?.map((r) => ({ subject: r.subject, word: r.word })))).not.toContain('|')
    expect(JSON.stringify(rows?.map((r) => ({ subject: r.subject, word: r.word })))).not.toContain('write_write')
  })

  it('says it has no word for a class the shared list does not declare, rather than printing the key', async () => {
    const { hotspotRows } = await import('../src/web/pages/UsagePage.tsx')
    // ABSENCE BEATS A GUESS, and a stored key is a guess wearing a machine's clothes. If the Work
    // Domain thread ever answers with a class this page's copy of the list has not got, the page
    // says so instead of showing what the database happens to hold.
    const rows = hotspotRows({
      window: { from: 'a', to: 'b' },
      overlaps: [{ key: 'k', overlapClass: 'invented_class', subject: 'src/shared/time.ts' }],
    })
    expect(rows?.[0]?.word).toBeNull()
  })
})

describe('the trace read has a door that is not curl', () => {
  /**
   * THE RAW REQUESTS ARE DRAWN, AND ONLY IN DEVELOPER MODE AND ONLY FOR AN OPEN ROW.
   *
   * This used to read this file's own source: find `<TraceEvents`, walk backwards to the nearest
   * `developer ? (`, and pass if one was there. A component moved into a different branch, or a
   * second copy drawn outside the check, would leave that green. The three states are now drawn.
   *
   * WHAT THE DRAWING CAN AND CANNOT SHOW, SAID PLAINLY. `react-dom/server` runs no effect, so
   * `useAsync` never resolves and the raw-request list appears in its first-paint state — the line
   * that says it is reading. That is enough to say WHETHER it was mounted, which is the whole of
   * this rule. That the read it then makes is `GET /api/usage/trace/<id>` is held by the door gate
   * at the bottom of this file.
   */
  const OPENED = `${A_STRETCH.traceId}-${String(A_STRETCH.seq)}`

  it('draws the raw request list for an open row in Developer mode', async () => {
    const { Stretches } = await import('../src/web/pages/UsagePage.tsx')
    const html = drawPart(
      createElement(Stretches, { rows: [A_STRETCH], developer: true, open: OPENED, onOpen: () => {} }),
    )
    expect(html, 'the raw-request list was not mounted for an open row').toContain('Reading its requests')
    expect(html).toContain(`Piece of work: ${A_STRETCH.traceId}`)
  })

  it('draws no raw request in Normal mode, however far a reader opens a row', async () => {
    const { Stretches } = await import('../src/web/pages/UsagePage.tsx')
    const html = drawPart(
      createElement(Stretches, { rows: [A_STRETCH], developer: false, open: OPENED, onOpen: () => {} }),
    )
    // THE ROW REALLY IS OPEN, so this is not an empty drawing agreeing with everything.
    expect(html).toContain('30 reads, 8 writes')
    expect(html, 'Normal mode is drawing raw requests').not.toContain('Reading its requests')
    expect(html).not.toContain('Piece of work:')
  })

  it('names the line that says why a piece of work ended, and leaves the name off one still going', async () => {
    const { Stretches } = await import('../src/web/pages/UsagePage.tsx')
    const drawn = (endedBecause: string) =>
      drawPart(createElement(Stretches, { rows: [{ ...A_STRETCH, endedBecause }], developer: false, open: OPENED, onOpen: () => {} }))
    expect(drawn('went-quiet')).toContain(sayInEnglish('dev.usage.whyItEnded', { why: endedBecauseWord('went-quiet').text }))
    // STILL GOING IS NOT AN END, so "Why it ended" above it would be false.
    expect(drawn('still-open')).toContain(endedBecauseWord('still-open').text)
    expect(drawn('still-open'), 'a piece of work still going is drawn as ended').not.toContain(sayInEnglish('dev.usage.whyItEnded', { why: '' }))
  })

  it('asks for nothing until a row is opened, so forty stretches cost forty nothing', async () => {
    const { Stretches } = await import('../src/web/pages/UsagePage.tsx')
    const html = drawPart(
      createElement(Stretches, { rows: [A_STRETCH], developer: true, open: null, onOpen: () => {} }),
    )
    expect(html).toContain(A_STRETCH.startedAt)
    expect(html, 'the raw-request list is mounted before anybody opened the row').not.toContain(
      'Reading its requests',
    )
  })
})

/**
 * EVERY MEASUREMENT READ HAS A DOOR IN THE BROWSER, AND THE ONE THAT DOES NOT IS NAMED HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS GATE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Six waves of this campaign in a row shipped a server half whose only door was curl, and every one
 * was found by a person reading the tree afterwards rather than by anything in the suite. Wave 13
 * shipped the page that was meant to end that — and shipped `GET /api/usage/sequences` with no
 * consumer anywhere under `src/web`. The page existed, the route existed, and the two had never been
 * introduced. NOTHING IN 8,800 TESTS NOTICED, because no test anywhere asked the question.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS DRIVEN, NOT READ
 * ---------------------------------------------------------------------------------------
 *
 * This used to match `app.get(...)` in `src/server/api/usage.ts` with a regular expression and then
 * look for the path as a substring of `src/web/api.ts`. Two source files compared as text: a browser
 * call naming a route that does not exist passed it, and so did a route whose path appeared in a
 * comment. Now `fetch` is pointed at the REAL server through `app.inject`, every usage call the
 * browser offers is made, and what arrives is checked against the server's own registered route
 * table. The same method `tests/workspace-switcher.test.ts` uses.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN EXEMPTION LIST AND NOT A RULE
 * ---------------------------------------------------------------------------------------
 *
 * One route in this family genuinely has no browser door and should not have one:
 * `POST /api/usage/outside-reads` is an agent saying where it went, and a person filing one by hand
 * would be a person filing somebody else's claim. That is a JUDGEMENT, so it is a line somebody can
 * read and argue with rather than a clause in a matcher. A wrong exemption is visible here; a wrong
 * rule is not.
 */
describe('no measurement read is reachable only by curl', () => {
  /** A route this family serves that deliberately has no door in the browser, and why. */
  const NO_DOOR_ON_PURPOSE: Record<string, string> = {
    'POST /api/usage/outside-reads':
      'an agent reporting where it went; a person filing one by hand would be filing somebody else’s claim',
    'POST /api/usage/patterns/proposals':
      'it files proposals for the person, so a button on the person’s own page would be them asking to be ' +
      'asked; the crossings are already drawn on this page and the proposals land in their governance queue',
    'GET /api/usage/receipts':
      'the page already draws these receipts, read from GET /api/usage/agents; this is the same part alone, for ' +
      'an agent that wants the receipts without the arrivals the server finds by scanning its call log',
  }

  it('makes a request the real server answers for every usage route, or has a written reason', async () => {
    const { apiApp, freshDb } = await import('./helpers.ts')
    const t = await freshDb()
    const built = await apiApp()
    const app = built.app
    await app.ready()

    const asked: { method: string; url: string; status: number }[] = []
    const globals = globalThis as unknown as { fetch: unknown }
    const savedFetch = globals.fetch
    globals.fetch = async (input: unknown, init: { method?: string; headers?: HeadersInit; body?: string } = {}) => {
      const res = await app.inject({
        method: (init.method ?? 'GET') as 'GET',
        url: String(input),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(init.body === undefined ? {} : { payload: init.body }),
      })
      asked.push({ method: init.method ?? 'GET', url: String(input), status: res.statusCode })
      return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => res.body }
    }

    try {
      const api = (await import('../src/web/api.ts')).api as unknown as Record<string, unknown>
      for (const [name, value] of Object.entries(api)) {
        if (!name.startsWith('usage') || typeof value !== 'function') continue
        // One argument, ignored by the calls that take none. A trace id nothing has written is
        // still a real request, and it is the REQUEST this case is about.
        await Promise.resolve((value as (arg: string) => unknown)('a-piece-of-work-nobody-filed')).then(
          () => {},
          () => {},
        )
      }
    } finally {
      globals.fetch = savedFetch
      await app.close()
      t.close()
    }

    // THE BROWSER REALLY CALLED SOMETHING. A run where nothing was called would agree with every
    // line below in silence, which is this repository's most-met failure.
    expect(asked.length, 'the browser made no usage request at all').toBeGreaterThan(5)

    const registered = built.listApiRoutes().filter((one) => one.path.startsWith('/api/usage'))
    expect(registered.length, 'the server registered no usage routes').toBeGreaterThan(5)

    const undoored = registered
      .map((one) => `${one.method} ${one.path}`)
      .filter((one) => {
        if (one in NO_DOOR_ON_PURPOSE) return false
        const [method = '', path = ''] = one.split(' ')
        // A path parameter is filled in by the caller, so the door is matched on the part before it.
        const stem = path.split('/:')[0] ?? path
        return !asked.some((call) => call.method === method && (call.url === stem || call.url.startsWith(`${stem}/`)))
      })
    expect(undoored, 'these usage routes are reachable only by curl').toEqual([])

    // AND EVERY DOOR OPENS ONTO A ROUTE THIS SERVER SERVES. A browser calling a path the server has
    // never registered is the failure a comparison of two source texts cannot see, and the reply
    // does not say so: a route that is not there and a record that is not there both answer 404.
    // So the address is matched against the route table, with a path parameter standing for one
    // segment.
    const matches = (call: { method: string; url: string }): boolean =>
      registered.some((route) => {
        if (route.method !== call.method) return false
        const pattern = new RegExp(`^${route.path.replace(/:[^/]+/g, '[^/]+')}$`)
        return pattern.test(call.url)
      })
    expect(asked.filter((call) => !matches(call)), 'these browser calls name no route on this server').toEqual([])

    // AND A CALL THAT NAMES NO RECORD REALLY ANSWERS. The reads with no path parameter are the
    // page's own first paint; a 404 or a 500 on one of those is a door that does not open.
    const plain = new Set(registered.filter((r) => !r.path.includes(':')).map((r) => `${r.method} ${r.path}`))
    const shut = asked.filter((call) => plain.has(`${call.method} ${call.url}`) && call.status >= 400)
    expect(shut, 'these usage reads refused the browser on an empty database').toEqual([])
  })

  it('draws the ordered pairs as a band of the page, in both modes', async () => {
    const { setMode } = await import('../src/web/lib/mode.ts')
    const { targetAttributes } = await import('../src/shared/targets.ts')
    const declared = Object.entries(targetAttributes({ kind: 'uiSurface', surfaceId: 'usage.sequences' }))
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')

    try {
      for (const mode of ['normal', 'inspect'] as const) {
        setMode(mode)
        const html = await draw(NOTHING)
        expect(html, `the sequences band is missing in ${mode} mode`).toContain('What agents do next')
        expect(html, `the sequences band declares no region in ${mode} mode`).toContain(declared)
        // ITS OWN READ IS IN FLIGHT AT FIRST PAINT, which is what says the band is wired to one at
        // all rather than drawn as a heading over nothing.
        expect(html).toContain(sayInEnglish('dev.usage.readingThePairs'))
      }
    } finally {
      setMode('normal')
    }
  })
})
