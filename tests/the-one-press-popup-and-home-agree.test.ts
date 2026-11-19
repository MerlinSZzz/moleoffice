// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE POPUP AND HOME DRAW THE SAME REQUESTS FOR ONE PRESS, FROM ONE READING.
 * Wave 13n round 45.
 *
 * The popup on every page (components/OnePress.tsx) and Home's Needs you (components/home/HomeSections.tsx) are both
 * drawn from the one waiting reading (src/server/lib/waiting.ts). This test hands both the same reply, holding two
 * requests and one other row, and checks:
 *   1. Home draws every request with the popup's card, the popup draws the first and says how many more wait, and the
 *      ids and sentences are the same in both;
 *   2. the person sees Agree and Refuse in both, and anybody else sees only that the person can answer;
 *   3. the agent's own words show in both only in Developer mode;
 *   4. the sentence after a press says what the office answered.
 *
 * MUTATIONS, each run red and then restored (round 45's report says so):
 *   - `theOnePressRows` keeps only the newest request: tests 1 and 3 fail.
 *   - Home's row for a request draws the plain linked row instead of the card: tests 1, 2 and 3 fail.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { ONE_PRESS_REQUEST } from '../src/shared/one-press.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WaitingReply } from '../src/server/api/waiting.ts'
import type { WaitingItem } from '../src/server/lib/waiting.ts'
import type { AOnePressRequest } from '../src/server/lib/one-press.ts'
import { setActor } from '../src/web/api.ts'
import { OnePressPopup, theOnePressRows, whatThePressDid } from '../src/web/components/OnePress.tsx'
import { HomeNeedsYou } from '../src/web/components/home/HomeSections.tsx'
import { setMode } from '../src/web/lib/mode.ts'
import { oneNumber } from '../src/web/lib/waiting.ts'

function aRequest(id: string, shows: string, because: string | null): WaitingItem {
  return {
    id,
    tier: 'asked',
    act: 'answer',
    because: {} as WaitingItem['because'],
    why: 'Made up for this test.',
    workspaceId: 'paper-lanterns',
    workspaceTitle: 'Paper lanterns',
    kind: ONE_PRESS_REQUEST,
    title: shows,
    said: null,
    blocking: 0,
    since: '2026-10-07 09:00:00',
    onThePersonsWords: null,
    passedOnBy: null,
    theOnePress: { act: 'change-a-setting', shows, because, askedBy: 'agent-made-up', askedByHandle: 'made-up-agent' },
  } as WaitingItem
}

const OTHER = {
  id: 'a-message',
  tier: 'settle',
  act: 'read',
  because: {} as WaitingItem['because'],
  why: 'Made up for this test.',
  workspaceId: 'paper-lanterns',
  workspaceTitle: 'Paper lanterns',
  kind: 'message',
  title: 'A made-up message',
  said: null,
  blocking: 0,
  since: '2026-10-07 08:00:00',
  onThePersonsWords: null,
  passedOnBy: null,
} as WaitingItem

const FIRST = aRequest('press-first', 'Keep 14 backups instead of 7.', 'The disk has room for more.')
const SECOND = aRequest('press-second', 'Show the plan in weeks.', null)

const reply = {
  items: [OTHER, FIRST, SECOND],
  counts: { settle: 1, asked: 2, setAside: 0 },
  excluded: [],
  workspaceId: 'paper-lanterns',
  note: 'Made-up waiting rows.',
} as unknown as WaitingReply
const waiting = { status: 'ready' as const, value: reply }

const home = (): string => renderToStaticMarkup(h(HomeNeedsYou, { waiting }))
const popup = (): string => renderToStaticMarkup(h(OnePressPopup, { waiting, readWaitingAgain: () => undefined }))
const ids = (html: string): string[] => [...html.matchAll(/data-one-press="([^"]+)"/g)].map((m) => m[1] ?? '')
const escaped = (text: string): string => renderToStaticMarkup(h('span', null, text)).slice('<span>'.length, -'</span>'.length)

beforeAll(() => {
  setWordLanguage('en')
  setActor({ type: 'human', id: THE_PERSON })
  setMode('normal')
})
afterAll(() => setMode('normal'))

describe('the popup and Home draw one reading', () => {
  it('draws every request on Home, the first in the popup, with the same ids and sentences', () => {
    const rows = theOnePressRows(waiting)
    expect(rows.map((row) => row.id)).toEqual([FIRST.id, SECOND.id])

    const onHome = home()
    expect(ids(onHome), 'Home draws every request with the card').toEqual(rows.map((row) => row.id))
    expect(onHome).toContain(`data-home-waiting-id="${FIRST.id}"`)
    expect(onHome, "Home's number counts the requests").toContain(`>${String(oneNumber(reply))}</span>`)

    const inThePopup = popup()
    expect(ids(inThePopup), 'the popup draws the first request').toEqual([FIRST.id])
    expect(inThePopup).toContain(escaped(t('onePress.more', { n: rows.length - 1 })))
    for (const html of [onHome, inThePopup]) {
      expect(html).toContain(escaped(FIRST.theOnePress?.shows ?? 'missing'))
      expect(html).toContain(escaped(t('onePress.asks', { agent: 'made-up-agent' })))
    }
  })

  it('gives the person Agree and Refuse in both, and anybody else only the sentence that the person answers', () => {
    for (const html of [home(), popup()]) {
      expect(html).toContain(`>${t('onePress.agree')}<`)
      expect(html).toContain(`>${t('onePress.refuse')}<`)
      expect(html).not.toContain(t('onePress.onlyThePerson'))
    }
    setActor({ type: 'agent', id: 'agent-made-up' })
    try {
      for (const html of [home(), popup()]) {
        expect(html).not.toContain(`>${t('onePress.agree')}<`)
        expect(html).toContain(t('onePress.onlyThePerson'))
      }
    } finally {
      setActor({ type: 'human', id: THE_PERSON })
    }
  })

  it("shows the agent's own words in both only in Developer mode", () => {
    const words = escaped(t('onePress.theAgentSays', { because: FIRST.theOnePress?.because ?? 'missing' }))
    expect(home()).not.toContain(words)
    expect(popup()).not.toContain(words)
    setMode('inspect')
    try {
      expect(home()).toContain(words)
      expect(popup()).toContain(words)
    } finally {
      setMode('normal')
    }
  })

  it('says after a press what the office answered', () => {
    const answered = (state: AOnePressRequest['state'], outcome: string | null) =>
      ({ request: { id: FIRST.id, state, outcome } as AOnePressRequest })
    expect(whatThePressDid(answered('done', 'Backups kept: 14.'))).toBe('Done. Backups kept: 14.')
    expect(whatThePressDid(answered('could-not', 'The setting is gone.'))).toBe('It could not be done. The setting is gone.')
    expect(whatThePressDid(answered('refused', null))).toBe('Refused. Nothing was done.')
    expect(whatThePressDid({ id: FIRST.id, failed: 'No connection.' })).toBe('Your press did not reach the office: No connection.')
  })
})

