// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE READING FOR WHAT IS WAITING ON THE PERSON, ON HOME AND ON THE RAIL.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * The owner was told five different numbers about one idea, four of them on Home:
 *
 *   `1 waiting`                the decisions band, counting unsettled forks
 *   `8 waiting to be read`     the reports band, counting reports nobody had opened
 *   `48 need you · 7 shown`    the ranked list, counting what the attention rule selected
 *   `Needs you 48`             the rail badge, counting the same list as the one above
 *   `5 waiting on you`         the Schedule, counting kept words nobody had committed
 *
 * Each was honest about the question its own author had in mind. None was the number the owner was
 * looking for, and nothing made any two of them agree.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT W6 CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * On 16 September 2026 the owner met it again on the other side of the idea: the rail's Waiting-on-you
 * badge said 34 while only 7 were the owner's to settle (problem 8woJrf898igd). So the numbers split by
 * what each one answers, and each answer is worked out in one function:
 *
 *   `settleCount`   what a person can ACT ON NOW — the settle tier, the number the page's first
 *                   band shows. The rail's badge reads it.
 *   `oneNumber`     everything waiting on the person, the whole reading with its four parts
 *                   beside it. The page's own count draws it.
 *
 * The attention list got the same repair the same day (problem zKalIBZccv9F): its badge counts
 * `needsSomebodyNow` — what the page lists first — and the rest is named in one line under the
 * list, in tests/the-two-counts-count-what-a-person-can-act-on.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHY TWO NUMBERS THAT AGREE TODAY ARE NOT IT
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces printing the same number is what the product had before: five numbers, each right
 * about its own question, and no arrangement stopping them from drifting. So this file does not
 * assert that Home and the rail happen to show the same number. It changes WHAT ONE SOURCE
 * CONTRIBUTES and asserts that both places move together — which can only be true if there is one
 * reading behind them, because nothing else in this file touches either surface.
 *
 * `GET /api/waiting` is that reading. App.tsx fetches it once per navigation and hands the SAME
 * reply to the rail and to the page. Neither badge nor band counts anything itself, and the source
 * assertions at the foot are what keep that true.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AsyncState } from '../src/web/components/ui.tsx'
import type { WaitingReply } from '../src/web/lib/waiting.ts'
import { theWordListText } from './word-list-files.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type QueueModule = typeof import('../src/web/components/DecisionQueue.tsx')

let Sidebar: SidebarModule
let Queue: QueueModule

beforeAll(async () => {
  // The sidebar reads window.localStorage through api.ts at module scope, so the smallest possible
  // stand-in for a window goes in before it is imported. Nothing in it is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  Sidebar = await import('../src/web/components/Sidebar.tsx')
  Queue = await import('../src/web/components/DecisionQueue.tsx')
})

const read = (file: string): string => readFileSync(file, 'utf8')

/**
 * A reading of what is waiting, with each of the three sources contributing what it is given.
 *
 * The rows are the shape the wire carries and nothing more: this file is about the NUMBER, and the
 * number is the length of the list of rows.
 */
function reading(settle: number, asked: number, setAside: number): WaitingReply {
  const rows: WaitingReply['items'] = []
  const add = (tier: 'settle' | 'asked' | 'set-aside', many: number): void => {
    for (let at = 0; at < many; at += 1) {
      rows.push({
        id: `${tier}-${at}`,
        tier,
        act: tier === 'asked' ? 'answer' : 'settle',
        because: { rule: 'refused-act', doors: [] },
        why: 'only a person may do this',
        // Nothing on these fixture rows stands on the owner's quoted words, which is the ordinary answer.
        onThePersonsWords: null,
        replacedButStillHere: null,
        // And nobody passed these on: they are tier-1 rows, and only a `whose_move` question goes
        // through a starter. Criterion P55.
        passedOnBy: null,
        fromAgent: { answer: 'not-an-agent' },
        workspaceId: 'panelx',
        workspaceTitle: 'Mole Office',
        kind: 'proposal',
        title: `${tier} ${at}`,
        said: null,
        blocking: 0,
        since: null,
      })
    }
  }
  add('settle', settle)
  add('asked', asked)
  add('set-aside', setAside)
  return {
    items: rows,
    counts: { settle, asked, setAside },
    excluded: [],
    scope: 'every project, person-level',
    note: 'what is waiting on the person',
  }
}

const ready = (reply: WaitingReply): AsyncState<WaitingReply> => ({ status: 'ready', value: reply })

/** The rail, without its stylesheet: a class name in CSS is not a number on a screen. */
function rail(waiting: AsyncState<WaitingReply>): string {
  const html = renderToStaticMarkup(
    h(Sidebar.Sidebar, {
      page: 'home' as const,
      open: false,
      onClose: () => {},
      onRenamed: () => {},
      attention: { status: 'loading' as const },
      waiting,
      sight: { id: 'panelx', title: 'Mole Office', named: true, what: 'one project', fault: null },
      workspaces: { status: 'loading' as const },
    }),
  )
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * The count Home's band draws, and the same component the governance queue heads itself with.
 *
 * `DecisionQueue` itself cannot be rendered here: it fetches the forks and draws nothing until that
 * reply lands. `WaitingCount` is the part that carries the number, it is mounted by both surfaces,
 * and the source assertions below are what prove those two mounts are the only ones.
 */
const band = (waiting: AsyncState<WaitingReply>): string => renderToStaticMarkup(h(Queue.WaitingCount, { waiting }))

/** The badge on the governance row, out of the rail's markup. */
function badgeInTheRail(html: string): string | null {
  // The rail draws two badges — what needs somebody, and what is waiting on you. The attention
  // reading is left `loading` above, so the one badge that can be drawn is this one.
  const found = html.match(/<span class="shell-badge num"[^>]*>(\d+)<\/span>/)
  return found === null ? null : (found[1] ?? null)
}

/** Every number the band printed, in order, so a test cannot pick the one that suits it. */
function numbersOnTheBand(html: string): string[] {
  return [...html.matchAll(/>(\d+)</g)].map((m) => m[1] ?? '')
}

// ============================================================ the control

describe('the control', () => {
  it('draws a number in both places at all, so a test that measured nothing cannot pass', () => {
    const reply = ready(reading(3, 0, 0))
    expect(badgeInTheRail(rail(reply))).toBe('3')
    expect(numbersOnTheBand(band(reply))[0]).toBe('3')
  })
})

// ============================================================ the one number

describe('what is waiting on the person', () => {
  it('is the same number on Home and on the rail', () => {
    const reply = ready(reading(2, 5, 1))
    // PROBLEM 8woJrf898igd: the rail said 34 while only 7 were the owner's
    // to settle. So the badge now counts what a person can act on FIRST — the settle tier, what a
    // person may settle right now, the number the page's first band shows — from the same function
    // the page reads. The band still says the whole reading, with its four parts beside it.
    expect(badgeInTheRail(rail(reply))).toBe('2')
    expect(numbersOnTheBand(band(reply))[0]).toBe('8')
  })

  it('moves in BOTH places when the settle tier changes, because both count it', () => {
    /**
     * THE PROOF, AND IT IS NOT "THE TWO AGREE TODAY".
     *
     * The settle tier contributes two more rows and nothing else changes. If either surface were
     * counting for itself, one of these four assertions would hold its old value.
     */
    const before = ready(reading(2, 5, 0))
    expect(badgeInTheRail(rail(before))).toBe('2')
    expect(numbersOnTheBand(band(before))[0]).toBe('7')

    const after = ready(reading(4, 5, 0))
    expect(badgeInTheRail(rail(after))).toBe('4')
    expect(numbersOnTheBand(band(after))[0]).toBe('9')
  })

  it('moves in the band for the asked tier and the set-aside tier, which have no badge', () => {
    // The band counts everything, tiered and counted beside its number: an `asked` row and a
    // set-aside row move it. OFF THE OWNER'S QUEUE IS NOT OFF THE COUNT — pushing something away is the owner's
    // own act and the row stays counted on the page, which is where the owner finds it.
    const before = ready(reading(1, 1, 0))
    expect(badgeInTheRail(rail(before))).toBe('1')
    expect(numbersOnTheBand(band(before))[0]).toBe('2')

    const askedMore = ready(reading(1, 3, 0))
    expect(badgeInTheRail(rail(askedMore))).toBe('1')
    expect(numbersOnTheBand(band(askedMore))[0]).toBe('4')

    const after = ready(reading(1, 1, 3))
    expect(badgeInTheRail(rail(after))).toBe('1')
    expect(numbersOnTheBand(band(after))[0]).toBe('5')
  })

  it('draws the four parts beside the number, and they sum to it', () => {
    const html = band(ready(reading(2, 5, 1)))
    expect(html).toContain('to settle')
    expect(html).toContain('asked of you')
    expect(html).toContain('to read')
    expect(html).toContain('set aside')
    // The parts are drawn even when one of them is zero, so the arithmetic is visible. The fourth is the messages the
    // person has not read: the server files them in the asked tier, and the Decisions page lists them on their own.
    const zeros = band(ready(reading(2, 0, 0)))
    expect(zeros).toContain('set aside')
    expect(numbersOnTheBand(zeros)).toEqual(['2', '2', '0', '0', '0'])
  })

  it('says nothing rather than a zero while nobody has an answer', () => {
    // A badge reading 0 because a request failed and a badge reading 0 because nothing is waiting
    // must never look alike. The rail draws no badge at all, and the band says which of the two.
    expect(badgeInTheRail(rail({ status: 'loading' }))).toBe(null)
    expect(badgeInTheRail(rail({ status: 'error', message: 'fetch failed' }))).toBe(null)
    expect(band({ status: 'loading' })).toContain('counting')
    expect(band({ status: 'error', message: 'fetch failed' })).toContain('not counted')
  })
})

// ============================================================ nobody counts for themselves

describe('neither surface works the number out', () => {
  it('takes each number from the one function that has it', () => {
    // A NUMBER IS NOT A DRAWING. These lines are what make the assertions above hold for any reply
    // rather than for the ones this file happens to build: the rail's badge reads `railCount` and the
    // page's first band `settleCount`, both over the same reply, and the band's own count reads
    // `oneNumber`. The rail adds the agents asking at the door.
    expect(read('src/web/components/Sidebar.tsx')).toContain('railCount(waiting)')
    expect(read('src/web/pages/GovernancePage.tsx')).toContain('settleCount(reading)')
    expect(read('src/web/components/DecisionQueue.tsx')).toContain('oneNumber(waiting.value)')
  })

  it("is read by Home's Needs you, and the count is mounted by the governance queue and nothing else", () => {
    // THE APPROVED HOME mounts no decisions band, so Home's number is the one
    // Needs you draws beside its heading. It is `oneNumber`'s answer over the same reply, and not a
    // length Home works out for itself, which would be a second place for one fact.
    expect(read('src/web/components/home/HomeSections.tsx')).toMatch(/const countWord = [^\n]*oneNumber\(waiting\.value\)/)
    expect(read('src/web/components/DecisionQueue.tsx')).toContain('<WaitingCount waiting={waiting} />')
    expect(read('src/web/pages/GovernancePage.tsx')).toContain('<WaitingCount waiting={waiting} />')
  })

  it('is fetched once, by the frame, and handed to both', () => {
    // Two components fetching one route is two clocks: they would agree until the day one of them
    // was read a second later than the other, which is the failure mode this arrangement removes.
    const app = read('src/web/App.tsx')
    expect(app).toContain('api.waiting()')
    expect(app.match(/api\.waiting\(\)/g)).toHaveLength(1)
    expect(app).toContain('waiting={waiting}')
    expect(read('src/web/pages/GovernancePage.tsx')).not.toContain('api.waiting()')
    expect(read('src/web/components/DecisionQueue.tsx')).not.toContain('api.waiting()')
    expect(read('src/web/components/Sidebar.tsx')).not.toContain('api.waiting()')
  })

  it('leaves the four old claims saying what they really count', () => {
    // THE PHRASE IS RESERVED. Each of these surfaces still counts exactly what it counted; what
    // changed is that the attention count now carries the word `urgent`,
    // and only the decisions queue says a person is waiting.
    // The attention panel's own urgent count went with its ranked list in wave 13k's round 19, by item 6 of a
    // decision. The rail and the phone pill still carry the word. Mutation: put the old "need
    // you ·" words back into AttentionPanel.tsx and this case goes red.
    const attention = read('src/web/components/AttentionPanel.tsx')
    expect(attention).not.toContain('need you ·')
    // THE REPORTS' OWN COUNT, READ FROM ITS WORD. This asked for the bare words "to read" until wave
    // 13k's round 22, and they were only ever found in a comment about reading words back, which
    // went with the "by reason" rows; the count itself is drawn through the key below.
    expect(attention).toContain("t('home.toRead'")
    expect(read('src/web/App.tsx')).toContain('urgent')
    // The Schedule's fold counts kept words nobody has turned into hours. They are step-one things
    // under the eighth rule — in no total, and not facts — so the one place the phrase must never
    // mean is exactly that one. The comment saying so is allowed to quote the words it removed.
    expect(read('src/web/components/Planning.tsx')).not.toContain('} waiting on you')
    expect(read('src/web/components/Planning.tsx')).toContain("t('schedule.keptCount'")
    // Every file of the English list, en.ts and every wave's part (wave 13j, round 41).
    expect(theWordListText('en')).toContain('kept, none turned into hours')
  })
})
