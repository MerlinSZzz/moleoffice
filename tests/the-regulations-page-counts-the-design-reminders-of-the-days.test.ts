// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGULATIONS PAGE COUNTS THE DESIGN REMINDERS OF THE DAYS, LISTS EACH ONE, AND OFFERS THE ONE PRESS THAT JUDGES IT.
 * Part 6 of the design-first build of wave 13s's requirements, on decision bYwACBK03tGT: at the week's end the
 * office shows right, wrong (not method work), wrong (it was there), not judged, and misses, and the secretary the
 * assigner answers to, or the person, judges each reminder with one press.
 *
 * The This project part draws GET /api/office-regulations/projects/current/design-reminders after the project's rules:
 * the days counted, the five counts, and each reminder or miss with its run, its record, what it named and how it was
 * judged. Each lack is drawn in the word lists' words by its answer, never by the server's English sentence. The page
 * hands `judge` to `TheRegulations` for the person only; the press itself, in a browser, is
 * tests/the-person-judges-a-design-reminder-with-one-press.test.ts.
 *
 * WHAT IS REAL: the page half `TheRegulations`, drawn with no server, and in Chromium with the page's own stylesheet.
 * The count it is given is made up here, in the shape the count door answers (src/shared/design-reminders.ts), and
 * every id in it is made up.
 *
 * THE CASES:
 *   1. the This project part draws the design reminders after its rules: their title, the days counted, and the five
 *      counts, each with its word;
 *   2. each reminder links its run and its record and names each lack by its word, with the design and the rule; a
 *      miss says it was missed, with its words; a judged one says its verdict and who judged it; an unjudged one says
 *      it is not judged;
 *   3. given `judge`, an unjudged reminder offers the three verdicts as presses, and a judged reminder and a miss offer
 *      none; with no `judge`, nothing offers a press;
 *   4. days with no reminder and no miss draw the state word "none", and draw no lone dash;
 *   5. on a Chinese page each label is the word a Chinese page draws for it, and no word is missing;
 *   6. at 1440, 990, 660 and 390, light and dark, the part with long words never scrolls sideways;
 *   7. a judge's words are drawn as a line of their own, after the verdict and who judged, and never run on after
 *      "Judged by the person" as if they were one sentence.
 *
 * RED BEFORE THE CODE, 8 November 2026, at 17adf3aef (since remade with its author set, as e6a155c12, the same tree),
 * with this file in the worktree and the code not yet written: cases 1 to 5 red, case 6 green. The page drew no design
 * reminders, and the Chinese page had no word for their title. Case 6 is green there because nothing was drawn; the
 * last mutation below is its proof.
 * MUTATION PROOF, 8 November 2026, after a control run of 6 green. Each mutation alone, then restored:
 * - each count drawn as 0: case 1 red.
 * - a lack drawn as the server's English sentence in place of its word: cases 2 and 5 red.
 * - a miss offered the presses: cases 2 and 3 red.
 * - days with no reminder drawn as a lone dash, with no words: case 4 red.
 * - the title's key misnamed: cases 1 and 5 red, by the ⟦ ⟧ the page draws for a missing word.
 * - a lack's words no longer broken anywhere (overflow-wrap removed): case 6 red. Its first run was green, because the
 *   case's long word then had hyphens and the browser broke the line at them. The word was made with no hyphen, a
 *   control run gave 6 green, and the mutation was then red.
 * CASE 7, 9 November 2026: the round's pictures drew a judge's words run on after "Judged by the person", as one
 * sentence. Red before the code at f5b9413e1, with this case in the worktree: case 7 red, the other six green. After a
 * control run of 7 green, each mutation alone, then restored:
 * - the words drawn on the verdict line again: case 7 red.
 * - the words' own line no longer broken anywhere (overflow-wrap removed): case 6 red.
 * - a dash drawn before the words in their own line: case 7 red.
 * WHAT THIS FILE DOES NOT CATCH YET: the Chinese of these labels is not written this round, so a Chinese page draws
 * their English. A label typed into the page in English instead of read by t() passes cases 2 and 5. Case 5 catches it
 * once the Chinese is written.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { drawInABrowser } from './what-the-browser-draws.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'
import { setWordLanguage, t as word, writtenDayRange } from '../src/shared/i18n.ts'
import type { TheDesignReminderCount } from '../src/shared/design-reminders.ts'
import type { TheProjectChapter } from '../src/shared/project-rules.ts'
import type { WhatTheOfficeRegulationsSay } from '../src/shared/office-rules.ts'

type PageModule = typeof import('../src/web/pages/RegulationsPage.tsx')
type RouterModule = typeof import('../src/web/components/router.tsx')

let pg: PageModule
let router: RouterModule

const SAID: WhatTheOfficeRegulationsSay = { chapters: [], regulations: [], copiedFromTheDefaults: null } as unknown as WhatTheOfficeRegulationsSay

const PROJECT: TheProjectChapter = {
  project: 'made-up-robotics',
  chapter: 'made-up-chapter',
  version: 2,
  rules: [
    {
      id: 'grasp-trials',
      heading: 'Made-up rule grasp-trials',
      text: 'Made-up: a design names its grasp trials.',
      reason: 'Made-up: why grasp-trials is kept.',
      source: 'made-up-source',
      trigger: 'method-work',
      check: { name: 'evidence-linked', evidence: 'grasp_trials' },
      effect: 'remind',
      on: true,
      revision: 2,
    },
  ],
  problems: [],
  checks: [],
  says: 'Made-up.',
} as unknown as TheProjectChapter

const PERSON = { kind: 'person', id: 'made-up-person' } as const
const SECRETARY = { kind: 'agent', id: 'made-up-secretary' } as const
const MARKER = { kind: 'agent', id: 'made-up-assigner' } as const

/** A made-up count of two days: one reminder of each judgement, one not judged, and one miss. */
function aCount(): TheDesignReminderCount {
  const listed = (id: string, more: Partial<TheDesignReminderCount['reminders'][number]>): TheDesignReminderCount['reminders'][number] => ({
    id,
    run: `${id}-run`,
    was: 'reminded',
    at: '2026-11-07 10:00:00',
    work: 'method-work',
    markedBy: MARKER,
    named: [{ design: null, answer: 'no-design', rule: null, source: null, says: 'Made-up: the server says no design.' }],
    words: null,
    judgement: null,
    judges: [PERSON, SECRETARY],
    ...more,
  })
  return {
    project: 'made-up-robotics',
    from: '2026-11-07',
    to: '2026-11-08',
    counts: { right: 1, wrongNotMethodWork: 1, wrongItWasThere: 1, notJudged: 1, misses: 1 },
    reminders: [
      listed('made-up-right', { judgement: { verdict: 'right', words: 'Made-up: the run had no design.', by: SECRETARY, at: '2026-11-07 11:00:00' } }),
      listed('made-up-not-method-work', { judgement: { verdict: 'wrong-not-method-work', words: null, by: PERSON, at: '2026-11-07 12:00:00' } }),
      listed('made-up-it-was-there', {
        named: [{ design: 'made-up-design', answer: 'no-review', rule: null, source: null, says: 'Made-up: the server says no review.' }],
        judgement: { verdict: 'wrong-it-was-there', words: 'Made-up: the review was there.', by: SECRETARY, at: '2026-11-08 09:00:00' },
      }),
      listed('made-up-unjudged', {
        named: [
          { design: 'made-up-design', answer: 'missing', rule: 'grasp-trials', source: 'made-up-source', says: 'Made-up: the server says grasp_trials is missing.' },
          { design: 'made-up-older-design', answer: 'stale-review', rule: null, source: null, says: 'Made-up: the server says the review is of an earlier revision.' },
        ],
      }),
      listed('made-up-missed', { was: 'missed', named: [], words: 'Made-up: the run had no design and was not reminded.' }),
    ],
    says: 'Made-up: the server says five.',
  }
}

const NONE: TheDesignReminderCount['counts'] = { right: 0, wrongNotMethodWork: 0, wrongItWasThere: 0, notJudged: 0, misses: 0 }

/** The labels the part draws with no value in them. */
const LABELS = [
  'regulationsPage.reminders.title',
  'regulationsPage.reminders.right',
  'regulationsPage.reminders.wrongNotMethodWork',
  'regulationsPage.reminders.wrongItWasThere',
  'regulationsPage.reminders.notJudged',
  'regulationsPage.reminders.misses',
  // A miss is drawn with the record page's word for it, so the two say the same.
  'record.option.design_reminder.was.missed',
  'regulationsPage.reminders.openRun',
  'regulationsPage.reminders.openRecord',
  'regulationsPage.reminders.openDesign',
  'regulationsPage.reminders.bySecretary',
  'regulationsPage.reminders.byThePerson',
  'regulationsPage.reminders.answer.noDesign',
  'regulationsPage.reminders.answer.noReview',
  'regulationsPage.reminders.answer.missing',
  'regulationsPage.reminders.answer.staleReview',
] as const

/** React escapes these in text and in attributes; the words are compared as drawn. */
const asDrawn = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function drawn(reminders: TheDesignReminderCount | undefined, judge?: (reminder: string, verdict: string) => void): string {
  return renderToStaticMarkup(h(pg.TheRegulations, { said: SAID, project: PROJECT, reminders, judge } as Parameters<PageModule['TheRegulations']>[0]))
}

/** The design reminders as drawn: from their section's opening tag to the end of the page. */
function theReminders(html: string): string {
  const at = html.indexOf('data-design-reminders=')
  expect(at, 'the page draws no design reminders').toBeGreaterThanOrEqual(0)
  return html.slice(at)
}

/** One drawn reminder: its list item, by its id. */
function reminderIn(html: string, id: string): string {
  const at = html.indexOf(`data-design-reminder="${id}"`)
  expect(at, `the page draws no reminder ${id}`).toBeGreaterThanOrEqual(0)
  const next = html.indexOf('data-design-reminder="', at + 1)
  return html.slice(at, next === -1 ? undefined : next)
}

/** The verdicts a drawn reminder offers as presses. */
const pressesIn = (html: string): string[] => [...html.matchAll(/data-verdict="([a-z-]+)"/g)].map((m) => m[1]!)

const VERDICT_WORDS = {
  right: 'regulationsPage.reminders.right',
  'wrong-not-method-work': 'regulationsPage.reminders.wrongNotMethodWork',
  'wrong-it-was-there': 'regulationsPage.reminders.wrongItWasThere',
} as const

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} }
  pg = (await import('../src/web/pages/RegulationsPage.tsx')) as unknown as PageModule
  router = (await import('../src/web/components/router.tsx')) as unknown as RouterModule
})

afterAll(() => {
  setWordLanguage('en')
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('the design reminders in the This project part', () => {
  it('1. are drawn after the rules, with the days counted and the five counts', () => {
    const html = drawn(aCount())
    const project = html.indexOf('data-part="project"')
    const rule = html.indexOf('data-project-rule="grasp-trials"')
    const reminders = html.indexOf('data-design-reminders=')
    expect(project, 'the This project part').toBeGreaterThanOrEqual(0)
    expect(rule, 'the rule is drawn before the reminders').toBeGreaterThan(project)
    expect(reminders, 'the reminders are drawn after the rules').toBeGreaterThan(rule)
    const part = theReminders(html)
    expect(part).toContain(asDrawn(word('regulationsPage.reminders.title')))
    const days = writtenDayRange(new Date(2026, 10, 7), new Date(2026, 10, 8), { day: 'numeric', month: 'long', year: 'numeric' })
    expect(part).toContain(asDrawn(word('regulationsPage.reminders.range', { range: days })))
    const counts = { ...aCount().counts, right: 4, misses: 7 }
    const counted = theReminders(drawn({ ...aCount(), counts }))
    for (const [count, key] of [
      ['right', 'regulationsPage.reminders.right'],
      ['wrongNotMethodWork', 'regulationsPage.reminders.wrongNotMethodWork'],
      ['wrongItWasThere', 'regulationsPage.reminders.wrongItWasThere'],
      ['notJudged', 'regulationsPage.reminders.notJudged'],
      ['misses', 'regulationsPage.reminders.misses'],
    ] as const) {
      const at = counted.indexOf(`data-count="${count}"`)
      expect(at, `the count ${count} is not drawn`).toBeGreaterThanOrEqual(0)
      const one = counted.slice(at, counted.indexOf('</div>', at))
      expect(one, count).toContain(asDrawn(word(key)))
      expect(one, count).toContain(`>${String(counts[count])}<`)
    }
  })

  it('2. each reminder links its run and its record, names each lack by its word, and says how it was judged', () => {
    const html = theReminders(drawn(aCount()))
    for (const one of aCount().reminders) {
      const item = reminderIn(html, one.id)
      expect(item, one.id).toContain(`href="#${router.recordPath(one.run)}"`)
      expect(item, one.id).toContain(`href="#${router.recordPath(one.id)}"`)
      for (const named of one.named) expect(item, `${one.id}: the server's sentence is drawn`).not.toContain(asDrawn(named.says))
    }

    const unjudged = reminderIn(html, 'made-up-unjudged')
    expect(unjudged).toContain(asDrawn(word('regulationsPage.reminders.answer.missing')))
    expect(unjudged).toContain('grasp-trials')
    expect(unjudged).toContain(`href="#${router.recordPath('made-up-design')}"`)
    expect(unjudged).toContain(`href="#${router.recordPath('made-up-source')}"`)
    expect(unjudged).toContain(asDrawn(word('regulationsPage.reminders.answer.staleReview')))
    expect(unjudged).toContain(`href="#${router.recordPath('made-up-older-design')}"`)
    expect(unjudged).toContain(asDrawn(word('regulationsPage.reminders.notJudged')))

    expect(reminderIn(html, 'made-up-right')).toContain(asDrawn(word('regulationsPage.reminders.answer.noDesign')))
    expect(reminderIn(html, 'made-up-it-was-there')).toContain(asDrawn(word('regulationsPage.reminders.answer.noReview')))

    for (const [id, verdict, by, words] of [
      ['made-up-right', 'right', 'regulationsPage.reminders.bySecretary', 'Made-up: the run had no design.'],
      ['made-up-not-method-work', 'wrong-not-method-work', 'regulationsPage.reminders.byThePerson', null],
      ['made-up-it-was-there', 'wrong-it-was-there', 'regulationsPage.reminders.bySecretary', 'Made-up: the review was there.'],
    ] as const) {
      const item = reminderIn(html, id)
      expect(item, id).toContain(asDrawn(word(VERDICT_WORDS[verdict])))
      expect(item, id).toContain(asDrawn(word(by)))
      if (words !== null) expect(item, id).toContain(asDrawn(words))
      expect(item, id).not.toContain(asDrawn(word('regulationsPage.reminders.notJudged')))
    }

    const missed = reminderIn(html, 'made-up-missed')
    expect(missed).toContain(asDrawn(word('record.option.design_reminder.was.missed')))
    expect(missed).toContain(asDrawn('Made-up: the run had no design and was not reminded.'))
    expect(missed).not.toContain(asDrawn(word('regulationsPage.reminders.notJudged')))
  })

  it('3. given judge, only an unjudged reminder offers the three verdicts as presses', () => {
    const offered = theReminders(drawn(aCount(), () => {}))
    expect(pressesIn(reminderIn(offered, 'made-up-unjudged'))).toEqual(['right', 'wrong-not-method-work', 'wrong-it-was-there'])
    for (const verdict of ['right', 'wrong-not-method-work', 'wrong-it-was-there'] as const) {
      const unjudged = reminderIn(offered, 'made-up-unjudged')
      const at = unjudged.indexOf(`data-verdict="${verdict}"`)
      expect(unjudged.slice(at, unjudged.indexOf('</button>', at)), verdict).toContain(asDrawn(word(VERDICT_WORDS[verdict])))
    }
    for (const id of ['made-up-right', 'made-up-not-method-work', 'made-up-it-was-there', 'made-up-missed']) {
      expect(pressesIn(reminderIn(offered, id)), id).toEqual([])
    }
    expect(pressesIn(theReminders(drawn(aCount()))), 'a press is drawn with no judge').toEqual([])
  })

  it('4. days with no reminder and no miss draw the state word "none", with no lone dash', () => {
    const html = theReminders(drawn({ ...aCount(), counts: NONE, reminders: [] }))
    expect(html).toContain(`>${asDrawn(word('absence.none'))}</span>`)
    expect(html).not.toContain('data-design-reminder="')
    const lone = [...html.matchAll(/class="px-absent"/g)]
    expect(lone, 'a lone dash is drawn').toEqual([])
    expect(html).toContain(`data-count="misses"`)
  })

  it('5. on a Chinese page each label is the word a Chinese page draws, and no word is missing', () => {
    setWordLanguage('zh')
    let html = ''
    let empty = ''
    try {
      html = drawn(aCount(), () => {})
      empty = drawn({ ...aCount(), counts: NONE, reminders: [] })
    } finally {
      setWordLanguage('en')
    }
    expect(html).not.toContain('⟦')
    expect(empty).not.toContain('⟦')
    for (const key of LABELS) {
      const drawnWord = theWordAPageDraws('zh', key)
      expect(drawnWord, `the Chinese page has no word for ${key}`).toBeDefined()
      expect(html, key).toContain(asDrawn(drawnWord!))
    }
    const none = theWordAPageDraws('zh', 'absence.none')
    expect(none, 'the Chinese page has no word for absence.none').toBeDefined()
    expect(theReminders(empty)).toContain(`>${asDrawn(none!)}</span>`)
  })

  it("7. a judge's words are drawn as a line of their own, not run on after who judged", () => {
    const html = theReminders(drawn(aCount()))
    for (const [id, by, words] of [
      ['made-up-right', 'regulationsPage.reminders.bySecretary', 'Made-up: the run had no design.'],
      ['made-up-it-was-there', 'regulationsPage.reminders.bySecretary', 'Made-up: the review was there.'],
    ] as const) {
      const item = reminderIn(html, id)
      const who = item.indexOf(asDrawn(word(by)))
      expect(who, `${id}: who judged it is not drawn`).toBeGreaterThanOrEqual(0)
      expect(item.slice(who, item.indexOf('</p>', who)), `${id}: the words run on after who judged`).not.toContain(asDrawn(words))
      expect(item, `${id}: the words are not a paragraph of their own`).toContain(`>${asDrawn(words)}</p>`)
    }
  })
})

describe('the design reminders fit at four widths in both themes', () => {
  it('6. never scroll sideways', async () => {
    const long = aCount()
    // No hyphen in it, because a browser may break a line at a hyphen and the word would then wrap with no wrap rule.
    const unbroken = 'averylongunbrokenword'.repeat(6)
    long.reminders = long.reminders.map((one) => ({
      ...one,
      words: one.words === null ? null : `${one.words} ${unbroken}`,
      named: one.named.map((named) => ({ ...named, rule: named.rule === null ? null : `${named.rule}-${unbroken}` })),
      judgement: one.judgement === null ? null : { ...one.judgement, words: `${one.judgement.words ?? ''} ${unbroken}` },
    }))
    const browser = await drawInABrowser(`<style>${pg.REGULATIONS_CSS}</style>${drawn(long, () => {})}`, { width: 1440, height: 900 })
    try {
      for (const width of [1440, 990, 660, 390]) {
        await browser.page.setViewportSize({ width, height: 900 })
        for (const theme of [null, 'dark'] as const) {
          await browser.palette(theme)
          const overflow = await browser.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(overflow, `${String(width)}px, ${theme ?? 'light'}: the page scrolls sideways`).toBeLessThanOrEqual(0)
        }
      }
    } finally {
      await browser.close()
    }
  })
})
