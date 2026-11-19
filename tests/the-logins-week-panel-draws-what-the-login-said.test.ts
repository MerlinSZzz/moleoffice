// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOGINS' WEEK PANEL DRAWS WHAT THE SANDBOXES' CLAUDE LOGIN SAID, AND WHEN. Wave 13p round E, step 3, for
 * problem LeL0ssxi2jje.
 *
 * The server reads the newest `rate_limit_event` Claude Code wrote in a sandbox reading round and puts that reading on
 * a secretary's page in Developer mode. The panel must draw the reading's own fields, not the server's whole English
 * sentence: one line for each window, the time and the round it was read from, and what the login said about its
 * requests. A window nobody gave is said to be not given, never drawn as 0%. A reading of nobody draws no figure. An
 * unreadable reading names its round and its time and draws no figure. A newer reading round that gave no event is
 * named. The receipts logins keep the lines their reading still carries.
 *
 * WHAT THIS FILE PROVES, on src/web/components/TheLoginsWeek.tsx:
 *   1. a current reading draws both windows with their percentages and reset stamps, and the read time and round;
 *   2. a seven-day use of 1.03 is drawn as 103%, and nothing is drawn as 100%;
 *   3. a stale reading's first line is "Not read since" with its stamp, and its figures are still drawn;
 *   4. a reading of nobody draws "Nobody has read this login's use.", and no percentage in that login's row;
 *   5. an unreadable reading names its round and time, and draws no percentage;
 *   6. a null window draws "not given in this reading", and never 0%;
 *   7. a newer reading round with no event is named with its time;
 *   8. a rejected reading draws that the login refused requests, and an allowed reading draws no status line.
 *
 * Every figure, stamp, sandbox and round here is made up. No token, key file, account or real reading is used.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names the logs.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoginsWeek, OwnEventReading } from '../src/shared/logins-week.ts'

type ThePanel = typeof import('../src/web/components/TheLoginsWeek.tsx')

let panel: ThePanel

/** A made-up zone, and the made-up stamps every reading here is written in. */
const ZONE = 'Europe/London'
const READ_AT = '2026-10-14 09:00:00'
const SEVEN_DAYS_RESET = '2026-10-18 09:00:00'
const FIVE_HOURS_RESET = '2026-10-14 12:00:00'
const SERVER_SENTENCE = 'The server writes this whole sentence, and the panel must not draw it.'

/** The sandboxes' Claude login at a made-up moment, with only the named facts changed. */
function ownEvent(changes: Partial<OwnEventReading> = {}): OwnEventReading {
  return {
    readFrom: 'own-event',
    login: 'sandboxes-claude',
    name: 'loginsWeek.login.sandboxesClaude',
    state: 'current',
    readAt: READ_AT,
    zone: ZONE,
    round: { sandbox: 'sandbox-a', folder: 'round-1' },
    status: 'allowed',
    windowType: 'five_hour',
    resetsAt: FIVE_HOURS_RESET,
    sevenDays: { used: 0.63, resetsAt: SEVEN_DAYS_RESET, from: 'unifiedWindows' },
    fiveHours: { used: 0.12, resetsAt: FIVE_HOURS_RESET, from: 'unifiedWindows' },
    newerRoundWithNoEvent: null,
    says: SERVER_SENTENCE,
    ...changes,
  }
}

/** Every login's reading with only the sandboxes' login in it, so the row holds everything drawn. */
function weekOf(one: OwnEventReading): LoginsWeek {
  return { at: READ_AT, zone: ZONE, logins: [one], runsThatDeclaredNoTool: 0, says: SERVER_SENTENCE }
}

function drawn(one: OwnEventReading): string {
  return renderToStaticMarkup(h(panel.TheLoginsWeek, { reading: weekOf(one) }))
}

/** The text a reader sees, with the markup and the escaped punctuation taken out. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The sandboxes' login row alone, so a percentage in the panel's own title cannot answer for it. */
function theRow(markup: string): string {
  const row = /<li[^>]*data-login="sandboxes-claude"[^>]*>([\s\S]*?)<\/li>/.exec(markup)
  if (row === null) throw new Error('the sandboxes’ login row was not drawn')
  return textOf(row[1]!)
}

beforeAll(async () => {
  panel = await import('../src/web/components/TheLoginsWeek.tsx')
})

describe('the sandboxes’ Claude login, as its own reading said', () => {
  it('draws both windows of a current reading, and the time and round it was read from', () => {
    const text = textOf(drawn(ownEvent()))
    expect(text).toContain('Seven days: 63% used, resets at 2026-10-18 09:00')
    expect(text).toContain('Five hours: 12% used, resets at 2026-10-14 12:00')
    expect(text).toContain('Read at 2026-10-14 09:00')
    expect(text).toContain('sandbox-a/round-1')
    expect(text, 'the panel drew the server’s whole sentence').not.toContain(SERVER_SENTENCE)
  })

  it('draws a seven-day use of 1.03 as 103%, and nothing as 100%', () => {
    const text = textOf(drawn(ownEvent({ sevenDays: { used: 1.03, resetsAt: SEVEN_DAYS_RESET, from: 'unifiedWindows' } })))
    expect(text).toContain('103%')
    expect(text).not.toContain('100%')
  })

  it('says first that a stale reading was not read since its stamp, and still draws its figures', () => {
    const text = textOf(drawn(ownEvent({ state: 'stale' })))
    expect(text).toContain('Not read since 2026-10-14 09:00')
    expect(text.indexOf('Not read since')).toBeLessThan(text.indexOf('Seven days'))
    expect(text).toContain('Seven days: 63% used, resets at 2026-10-18 09:00')
    expect(text).toContain('Five hours: 12% used, resets at 2026-10-14 12:00')
  })

  it('draws that nobody has read the login, and no figure at all', () => {
    const row = theRow(drawn(ownEvent({ state: 'none', readAt: null, round: null, status: null, windowType: null, resetsAt: null, sevenDays: null, fiveHours: null })))
    expect(row).toContain("Nobody has read this login's use.")
    expect(row).not.toContain('%')
  })

  it('names the round and time of an unreadable reading, and draws no figure', () => {
    const row = theRow(drawn(ownEvent({ state: 'unreadable', status: null, windowType: null, resetsAt: null, sevenDays: null, fiveHours: null })))
    expect(row).toContain('2026-10-14 09:00')
    expect(row).toContain('sandbox-a/round-1')
    expect(row).toContain('a shape the office does not know')
    expect(row).not.toContain('%')
  })

  it('says a window the reading did not give was not given, and never draws it as 0%', () => {
    const row = theRow(drawn(ownEvent({ sevenDays: null })))
    expect(row).toContain('Seven days: not given in this reading')
    expect(row).not.toContain('0%')
    expect(row).toContain('Five hours: 12% used, resets at 2026-10-14 12:00')
  })

  it('names a newer reading round that gave no rate-limit event, with its time', () => {
    const row = theRow(drawn(ownEvent({ newerRoundWithNoEvent: { sandbox: 'sandbox-b', folder: 'round-2', at: '2026-10-14 10:00:00' } })))
    expect(row).toContain('sandbox-b/round-2')
    expect(row).toContain('2026-10-14 10:00')
    expect(row).toContain('gave no rate-limit event')
  })

  it('draws that a rejected reading refused requests, and draws no status line for an allowed one', () => {
    const rejected = theRow(drawn(ownEvent({ status: 'rejected' })))
    expect(rejected).toContain('The login refused requests at that reading.')
    const allowed = theRow(drawn(ownEvent({ status: 'allowed' })))
    expect(allowed).not.toContain('refused')
    expect(allowed).not.toContain('with a warning')
  })
})
