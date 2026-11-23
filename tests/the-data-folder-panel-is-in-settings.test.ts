// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DATA FOLDER PANEL ON SETTINGS, ITS WORDS, AND ITS WAIT WHILE THE OFFICE IS STOPPED. Criteria DF18, DF22 and DF28
 * of design/window/the-data-folder-move.criteria.md. The panel is src/web/components/DataFolderPanel.tsx, and the words
 * it draws are the data folder block of src/shared/words/en-wave-13t.ts.
 *
 * WHAT THIS PROVES
 *
 *   1. DF18: the panel is in Settings, in "What the office keeps", straight after "What the office keeps" is decided,
 *      drawn in Normal mode and in a browser, titled with its surface's label.
 *   2. DF18: each state of the last move draws its own words, and the two folders the mark holds as a From row and a
 *      To row, each path in a code element and none inside the words. A moving state whose mover has died says the
 *      move did not finish and never says it is still moving.
 *   3. DF18: an office that does not run from a bundle reads "runs from source code" and draws no press; a caller who
 *      may not move gets no move field and no press; the person's own reading draws the field and the check press, and
 *      no move press before a check; a started mark draws the confirm press only when the caller may confirm, and
 *      never a move field.
 *   4. DF18: Developer mode draws the server's own English (who chose the folder, the mark's sentence and why an
 *      unreadable mark cannot be read), marked as English, and the database's file name in a code element; Normal mode
 *      draws none of it.
 *   5. DF22: the one exported question "does this reading keep the panel waiting?" answers true for each moving state
 *      while the mover lives, and false when the mover has died and for every state that is not a move in progress.
 *   6. DF19, as the panel draws it: in a browser with no route answered by the test, the panel draws the real door's
 *      reading of a scratch office that runs from a checkout: it reads "runs from source code" and draws no press.
 *   7. DF22: after the move press answers 202 the panel asks the office again every two seconds, one read at a time,
 *      draws the waiting words and the count of failed reads while the office does not answer, stops when a read
 *      answers a started mark, draws that reading and the confirm press, and asks no more.
 *   8. DF22: a read that fails when no move was pressed draws the unread note, not the waiting words.
 *   9. When TEST_SHOTS names a folder, the panel is photographed at 1440, 990, 660 and 390 wide, in light and dark,
 *      in eight states, and nothing on the page scrolls sideways.
 *  10. DF22: a reply from an office with another identity ends the wait, reads "Another office answered.", offers to
 *      load the page again, draws none of the waiting words and none of the older reading, asks no more, and the press
 *      loads the page again.
 *  11. DF28: after this page's own move press, a reply from the moved office is read as this page's new home. The moved
 *      office is the one this page opened against with only its database identity changed, and its moved-home header
 *      names that same database. No banner is drawn over the panel's press, the page keeps the new home and says so,
 *      the wait ends on the started reading, and the confirm can be pressed.
 *  12. DF28: during the move, a reply from an office that differs in more than its database, or whose moved-home header
 *      names another database or is missing, still raises the banner, and the panel says the office answered under
 *      another identity.
 *  13. DF28: with no move of this page under way, a reply from the moved office still raises the banner, and the page
 *      keeps the home it had.
 *  14. DF28: during the move, an event stream that reaches the moved office before any other request does is read as
 *      this page's new home. The page keeps the moved database as its home, draws no banner, and asks for the stream
 *      again when that answer ends. Once the data folder read answers, the confirm press is drawn with no banner.
 *  15. DF28: during the move, a terminal's stream that reaches the moved office before any other request does is read
 *      as this page's new home. The page keeps the moved database as its home, draws no banner, does not say in the
 *      view that another office answered, draws the terminal's screen, and reads the stream to its end.
 *  16. DF28: while the banner stands during this page's own move, it is drawn above the page with no sheet over it. The
 *      panel's load-again press is at its own centre and works, and the panel draws neither the move press nor the
 *      confirm press, so its writes are held.
 *  17. DF28: when the moved-home header arrives, the banner goes with nothing reloaded, the page keeps the moved
 *      database as its home, and the panel stops saying another identity and reads the new home.
 *  18. DF28: with no move of this page under way, the banner still shuts the page: a press at the panel's check press
 *      lands on the sheet, not on the press.
 *  19. DF28: with no move of this page under way, a check pressed through the banner reaches nothing, no move press
 *      comes after it, no move reaches the office, and the banner stays.
 *
 * THE WORLD WITHOUT A SERVER. The static cases draw the panel with renderToStaticMarkup and the real components from
 * ui.tsx, with only useAsync answered by the reading the case hands it. EVERY READING THOSE CASES DRAW IS MADE BY THE
 * TEST, in the shape src/shared/data-folder.ts gives: no server, no `.env` and no mark on this computer is read. The
 * mode is read through the module the panel reads it from, src/web/lib/mode.ts.
 *
 * THE WORLD IN A BROWSER. A throwaway office from tests/helpers.ts, its page in a Chromium, in Normal mode and
 * English. The first browser case changes no route, so the real door answers. The other cases answer the three data
 * folder doors with page.route and nothing else, so the moves the cases press exist only in the test's answers. The
 * test never starts a mover and changes no file on this computer.
 *
 * THE MOVED OFFICE WITHOUT A MOVE. The DF28 cases add one more route, on every request to the test's office. Once a case
 * turns it on, each reply is the test office's own reply with its world header's database changed to a made-up one, as
 * the office answers from the folder it moved to. A request that still sends the old home gets the moved-home header
 * the server writes for a page that remembers a former home. The test office still does the work; only the headers say
 * that another office answered.
 *
 * THE STREAM OF CASE 14. That route reads a whole reply, and the page's event stream never ends, so it leaves the
 * stream alone. Case 14 answers the stream with a route of its own, with a whole body that ends at once, and with the
 * headers of the test office's own reply.
 *
 * THE TERMINAL OF CASE 15. Case 15 goes from Settings to the Terminals page without loading the page again. The office
 * is stopped then, so the page asks before it leaves, and the case leaves anyway. It answers the terminal list and the
 * terminal's stream with routes of its own, for a terminal the test made up. The stream's body is one screen, and then
 * it ends.
 *
 * THE MUTATIONS, each red in the case named beside it, after its own control run, and green again when put back:
 *   - the panel's declaration is moved to the "work" category: case 1, DF18 place;
 *   - a moving state draws "moving" whatever moverAlive says: case 2, DF18 states;
 *   - the confirm press is drawn whatever mayConfirm says: case 3, DF18 presses;
 *   - the move press is drawn for a caller who may only press under the grant: the DF18 through-the-door case;
 *   - a dead switched mark draws no confirm, and a live one draws it: the DF21 ended-switch case;
 *   - the fromABundle check is dropped: case 3, DF18 presses (a checkout gets the field);
 *   - the mark's own sentence is drawn in Normal mode too: case 4, DF18 developer;
 *   - the move press sends the move at once: case 7, DF22 after the move;
 *   - the 202 does not start the wait: case 7, DF22 after the move;
 *   - a failed read ends the wait: case 7, DF22 after the move;
 *   - an answered started reading does not end the wait: case 7, DF22 after the move;
 *   - the wait reads again at once instead of after 2000 ms: case 7, DF22 after the move;
 *   - the exported question ignores moverAlive: case 5, DF22 the wait;
 *   - a state is taken out of the panel's list of moving states: case 5, DF22 the wait (and case 2);
 *   - the panel draws another word where the not-a-bundle sentence goes: case 6, DF19 (and case 3);
 *   - the panel draws another panel's title as its own: case 6, DF19 (and case 1);
 *   - the count of reads with no answer is passed as count rather than n: case 7, DF22 after the move;
 *   - the count of removed files is passed as count rather than n: case 8, DF22 a press waits;
 *   - "Check" gives the field's hint while a press waits: case 8, DF22 a press waits;
 *   - "Check" says a press is waiting when the field is empty: case 8, DF22 a press waits;
 *   - "Stop the office and move" gives the warning as its reason: case 8, DF22 a press waits;
 *   - Cancel gives the start-at-login panel's reason: case 8, DF22 a press waits;
 *   - "Remove the old copy" gives the start-at-login panel's reason: case 8, DF22 a press waits;
 *   - the words for removed files have one form for every count: case 8, DF22 a press waits;
 *   - the words for reads with no answer have one form for every count: case 8, DF22 a press waits;
 *   - a reply refused for its identity is counted as no answer: case 10, DF22 another identity;
 *   - the press that loads the page again does nothing: case 10, DF22 another identity;
 *   - a reply refused for its identity draws the new words and asks again two seconds later: case 10, DF22 another
 *     identity;
 *   - the world check does not ask whether this page's move is under way: case 13, DF28 no move under way;
 *   - any moved-home header is taken, whichever database it names: case 12, DF28 still the banner;
 *   - a reply that differs in more than its database is taken as the moved office: case 12, DF28 still the banner;
 *   - the new home is adopted but the world this page opened against is kept: case 11, DF28 the moved office;
 *   - the transport hands the world check no moved-home header: case 11, DF28 the moved office;
 *   - the panel never says that its move is under way: case 11, DF28 the moved office;
 *   - the stream hands the world check no moved-home header: case 14, DF28 the stream reaches the moved office first;
 *   - the stream stops at any world other than the one this page opened against, before the world check is asked:
 *     case 14, DF28 the stream reaches the moved office first;
 *   - the terminal's stream copies no moved-home header onto its reply: the op2-terminal-stream case of
 *     tests/the-person-key-outranks-the-remembered-world.test.ts;
 *   - the terminal's stream names a moved home for any home: the same op2-terminal-stream case, on the home of another
 *     installation;
 *   - the terminal's stream hands the world check no moved-home header: case 15, DF28 the terminal's stream reaches
 *     the moved office first;
 *   - the terminal's stream stops at any world other than the one this page opened against, before the world check is
 *     asked: case 15, DF28 the terminal's stream reaches the moved office first;
 *   - the banner is drawn over the page while this page's own move is under way: case 16, DF28 the banner above the
 *     panel;
 *   - the page treats the office after a move as a different one again, even when its moved-home header names the new
 *     database: case 17, DF28 the header arrives (and case 11);
 *   - the database-only exception does not ask whether this page's own move is under way: case 18 and case 19, DF28 no
 *     move under way;
 *   - the panel draws its move field beside the load-again press, so a write is pressable while the banner stands:
 *     case 16, DF28 the banner above the panel;
 *   - another world's reply raises no rows and returns no refusal: the third case of
 *     tests/the-page-shouts-when-it-is-in-the-wrong-world.test.ts;
 *   - the panel does not ask again when the page takes the moved home: case 17, DF28 the header arrives.
 */
import { mkdirSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page, Request as TheRequest, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { SETTINGS_PANELS } from '../src/shared/addresses.ts'
import { CATEGORY_TITLES, PANELS } from '../src/shared/settings-declaration.ts'
import type {
  DataFolderMoveStarted,
  DataFolderReading,
  TheMarkInTheReading,
  TheMoveMark,
  TheStateOfAMove,
} from '../src/shared/data-folder.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ListedTerminal, TheTerminalsNow } from '../src/shared/terminals.ts'
import { WORLD_HEADER, formatWorldHeader, parseWorldHeader, type WorldOnTheWire } from '../src/config/world-header.mjs'
import { HOME_HEADER, HOME_MOVED_HEADER } from '../src/config/visit-headers.mjs'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const supplied = vi.hoisted(() => ({ reading: null as unknown }))
vi.mock('../src/web/components/ui.tsx', async (original) => {
  const real = await original<typeof import('../src/web/components/ui.tsx')>()
  // The panel's one read, answered with the reading the case gave it. Every press is left as it is.
  return { ...real, useAsync: () => [{ status: 'ready', value: supplied.reading }, () => {}] }
})

let panel: typeof import('../src/web/components/DataFolderPanel.tsx')
let i18n: typeof import('../src/shared/i18n.ts')
let mode: typeof import('../src/web/lib/mode.ts')
let world: typeof import('../src/web/lib/world.ts')

const THE_OLD_FOLDER = '/srv/made-up/old-data'
const THE_NEW_FOLDER = '/srv/made-up/new-data'
const THE_MOVING_STATES = ['stopping', 'copying', 'checking', 'switching', 'switched'] as const
const THE_OTHER_STATES = ['started', 'confirmed', 'stopped-before-the-switch', 'switched-back'] as const

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '#/settings/datafolder', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
  panel = await import('../src/web/components/DataFolderPanel.tsx')
  i18n = await import('../src/shared/i18n.ts')
  mode = await import('../src/web/lib/mode.ts')
  world = await import('../src/web/lib/world.ts')
})

/** A mark a mover wrote, in the shape src/shared/data-folder.ts gives, with this test's two paths. */
function aMark(state: TheStateOfAMove, changes: Partial<TheMoveMark> = {}): TheMoveMark {
  return {
    version: 1,
    from: THE_OLD_FOLDER,
    to: THE_NEW_FOLDER,
    database: 'mole-office.db',
    state,
    mover: { pid: 4242, startedAt: '2026-11-12 01:00:00' },
    earlier: [],
    manifest: null,
    says: 'The test wrote this sentence into the mark.',
    at: '2026-11-12 01:01:00',
    ...changes,
  }
}

/** The mark as a reading gives it, with the mover it names alive or not. */
function aReadMark(state: TheStateOfAMove, moverAlive = true, changes: Partial<TheMoveMark> = {}): TheMarkInTheReading {
  return { state: 'read', mark: aMark(state, changes), moverAlive }
}

/** A reading of an installed office, in the shape src/shared/data-folder.ts gives. */
function aReading(changes: Partial<DataFolderReading> = {}): DataFolderReading {
  return {
    folder: THE_OLD_FOLDER,
    database: 'mole-office.db',
    chosenBy: 'the default',
    chosenBySays: 'The test says the default chose this folder.',
    fromABundle: true,
    mark: { state: 'absent' },
    theCallerIsThePerson: true,
    mayMove: true,
    mayConfirm: true,
    ...changes,
  }
}

/** One drawing of the panel from one reading, in one mode, without its style sheet. */
function drawn(reading: DataFolderReading, look: 'normal' | 'inspect' = 'normal'): string {
  supplied.reading = reading
  mode.setMode(look)
  return renderToStaticMarkup(h(panel.DataFolderPanel)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** A word as the page draws it into markup. */
function asDrawn(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;')
}

/** Whether the markup draws this text inside an element that says it is English. */
function drawnAsEnglish(markup: string, text: string): boolean {
  return markup.includes(`lang="en">${asDrawn(text)}<`)
}

/** Whether the markup draws this text at all. */
function held(markup: string, text: string): boolean {
  return markup.includes(asDrawn(text))
}

/** A text as a pattern that matches only itself as it is drawn into markup. */
function asPattern(text: string): string {
  return asDrawn(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether the markup draws this path or file name, whole, in a code element. */
function inCode(markup: string, path: string): boolean {
  return new RegExp(`<code[^>]*>${asPattern(path)}</code>`).test(markup)
}

/** Whether the markup draws a row with this label and this path in a code element beside it. */
function aRow(markup: string, label: WordKey, path: string): boolean {
  return new RegExp(`<dt[^>]*>${asPattern(i18n.t(label))}</dt><dd[^>]*><code[^>]*>${asPattern(path)}</code></dd>`).test(markup)
}

/** The text of each sentence the markup draws. */
function theSentences(markup: string): string[] {
  return [...markup.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((sentence) => sentence[1] ?? '')
}

/** Whether the markup draws the mark's From row and To row, and no sentence holds a path. */
function theTwoRowsAndNoPathInASentence(markup: string): boolean {
  const sentences = theSentences(markup)
  return aRow(markup, 'dataFolder.row.from', THE_OLD_FOLDER)
    && aRow(markup, 'dataFolder.row.to', THE_NEW_FOLDER)
    && sentences.every((sentence) => !sentence.includes(THE_OLD_FOLDER) && !sentence.includes(THE_NEW_FOLDER))
}

describe('DF18: the panel is on Settings, in "What the office keeps"', () => {
  it('DF18: sits straight after "What the office keeps", in Normal mode and outside the window', () => {
    const declared = PANELS.find((one) => one.key === 'settings.datafolder')
    expect(declared).toBeDefined()
    expect(declared?.category).toBe('kept')
    expect(CATEGORY_TITLES.kept).toBe('settingsCats.cat.kept')
    expect(declared?.title).toBe('settingsPanel.title.datafolder')
    expect(declared?.developerOnly).toBe(false)
    expect(declared?.windowOnly).toBe(false)
    expect(SETTINGS_PANELS).toContain('settings.datafolder')
    expect(SETTINGS_PANELS.indexOf('settings.datafolder')).toBe(SETTINGS_PANELS.indexOf('settings.whatiskept') + 1)

    const markup = drawn(aReading())
    expect(markup).toContain('data-target="uiSurface/settings.datafolder"')
    expect(markup).toContain(`>${asDrawn(i18n.t('settingsPanel.title.datafolder'))}<`)
  })
})

describe('DF18: the words of the last move', () => {
  it('DF18: draws each of the nine states with the mark\'s own two folders as rows, and a dead mover is never said to be moving', () => {
    for (const state of THE_MOVING_STATES) {
      const moving = drawn(aReading({ mark: aReadMark(state) }))
      expect(moving, state).toContain(asDrawn(i18n.t('dataFolder.lastMove.moving')))
      expect(moving, state).toContain(asDrawn(i18n.t(panel.THE_STEP_WORDS[state])))
      expect(moving, state).not.toContain(asDrawn(i18n.t('dataFolder.lastMove.didNotFinish', { step: i18n.t(panel.THE_STEP_WORDS[state]) })))
      expect(theTwoRowsAndNoPathInASentence(moving), state).toBe(true)

      const dead = drawn(aReading({ mark: aReadMark(state, false) }))
      const didNotFinish = i18n.t('dataFolder.lastMove.didNotFinish', { step: i18n.t(panel.THE_STEP_WORDS[state]) })
      if (state === 'switched') {
        // A SWITCHED MARK WHOSE MOVER ENDED IS NOT A STEP THAT STOPPED: the office may run from the new folder, and the
        // confirm ends the move (DF21).
        expect(dead, state).toContain(asDrawn(i18n.t('dataFolder.lastMove.switchedAndEnded')))
        expect(dead, state).not.toContain(asDrawn(didNotFinish))
      } else {
        expect(dead, state).toContain(asDrawn(didNotFinish))
      }
      expect(dead, state).not.toContain(asDrawn(i18n.t('dataFolder.lastMove.moving')))
      expect(theTwoRowsAndNoPathInASentence(dead), state).toBe(true)
    }
    for (const [state, word] of [
      ['started', 'dataFolder.lastMove.started'],
      ['confirmed', 'dataFolder.lastMove.confirmed'],
      ['stopped-before-the-switch', 'dataFolder.lastMove.stoppedBeforeTheSwitch'],
      ['switched-back', 'dataFolder.lastMove.switchedBack'],
    ] as const) {
      const markup = drawn(aReading({ mark: aReadMark(state) }))
      expect(markup, state).toContain(asDrawn(i18n.t(word)))
      expect(theTwoRowsAndNoPathInASentence(markup), state).toBe(true)
    }
    const absent = drawn(aReading({ mark: { state: 'absent' } }))
    expect(absent).toContain(asDrawn(i18n.t('dataFolder.state.lastMoveNone')))
    const unreadable = drawn(aReading({ mark: { state: 'unreadable', why: 'The test made the mark unreadable.' } }))
    expect(unreadable).toContain(asDrawn(i18n.t('dataFolder.state.lastMoveNotRead')))
  })

  it('DF18: draws where the data is as a row, who chose it, and the earlier folders, each path in a code element', () => {
    const markup = drawn(aReading({
      chosenBy: 'the .env line',
      mark: aReadMark('confirmed', true, { earlier: ['/srv/made-up/first-data', '/srv/made-up/second-data'] }),
    }))
    expect(aRow(markup, 'dataFolder.row.folder', THE_OLD_FOLDER)).toBe(true)
    expect(markup).toContain(asDrawn(i18n.t('dataFolder.state.chosenBy.envLine')))
    expect(markup).toContain(asDrawn(i18n.t('dataFolder.earlier')))
    expect(inCode(markup, '/srv/made-up/first-data')).toBe(true)
    expect(inCode(markup, '/srv/made-up/second-data')).toBe(true)
    expect(theSentences(markup).some((sentence) => sentence.includes('/srv/made-up/')), 'a sentence holds a path').toBe(false)
  })
})

describe('DF18: what may be pressed', () => {
  it('DF18: an office that is not a bundle reads "runs from source code" and draws no press', () => {
    const markup = drawn(aReading({ fromABundle: false }))
    expect(markup).toContain(asDrawn(i18n.t('dataFolder.state.notABundle')))
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('<button')
  })

  it('DF18: a caller who may not move gets no field and no press', () => {
    const markup = drawn(aReading({ mayMove: false }))
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain(asDrawn(i18n.t('dataFolder.move')))
    expect(markup).not.toContain('<button')
  })

  it('DF18: a caller who may press only under the grant gets no field and no press', () => {
    const markup = drawn(aReading({ theCallerIsThePerson: false, mayMove: true }))
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('<button')
  })

  it("DF18: the person's own reading draws the field with the check press, and the confirm press after a move", () => {
    const move = drawn(aReading())
    expect(move).toContain('<input')
    expect(move).toContain(asDrawn(i18n.t('dataFolder.check')))
    // ONE PRESS AT A TIME: the move press comes only once a check has said a move to the folder would go ahead.
    expect(move).not.toContain(asDrawn(i18n.t('dataFolder.move')))

    const confirm = drawn(aReading({ mark: aReadMark('started') }))
    expect(confirm).toContain(asDrawn(i18n.t('dataFolder.confirm')))
    expect(confirm).toContain('<button')
  })

  it('DF21: a switched mark whose mover has ended draws the confirm, and one whose mover lives draws none', () => {
    const ended = drawn(aReading({ mark: aReadMark('switched', false) }))
    expect(ended).toContain(asDrawn(i18n.t('dataFolder.lastMove.switchedAndEnded')))
    expect(ended).toContain(asDrawn(i18n.t('dataFolder.confirm')))
    expect(ended).toContain('<button')

    const alive = drawn(aReading({ mark: aReadMark('switched', true) }))
    expect(alive).not.toContain(asDrawn(i18n.t('dataFolder.lastMove.switchedAndEnded')))
    expect(alive).not.toContain(asDrawn(i18n.t('dataFolder.confirm')))
    expect(alive).not.toContain('<button')
  })

  it('DF18: a started mark draws the confirm press only when the caller may confirm, and never a move field', () => {
    const may = drawn(aReading({ mark: aReadMark('started') }))
    expect(may).toContain(asDrawn(i18n.t('dataFolder.confirm')))
    expect(may).not.toContain('<input')
    expect(may).not.toContain(asDrawn(i18n.t('dataFolder.move')))

    const mayNot = drawn(aReading({ mark: aReadMark('started'), mayConfirm: false }))
    expect(mayNot).not.toContain('<button')
    expect(mayNot).not.toContain(asDrawn(i18n.t('dataFolder.confirm')))
    expect(mayNot).not.toContain('<input')
  })

  it('DF18: a move in progress draws no field and no press', () => {
    for (const state of THE_MOVING_STATES) {
      const markup = drawn(aReading({ mark: aReadMark(state) }))
      expect(markup, state).not.toContain('<input')
      expect(markup, state).not.toContain('<button')
    }
  })
})

describe('DF18: Developer mode shows the office\'s own English', () => {
  it('DF18: shows who chose the folder, the mark\'s sentence and an unreadable mark\'s why, marked English, and the database\'s file name in code; Normal shows none', () => {
    const reading = aReading({
      mark: aReadMark('started', true, { says: 'The test mover says the office is up.' }),
      chosenBy: 'the process environment',
      chosenBySays: 'The environment of this process chose the folder.',
    })
    const developer = drawn(reading, 'inspect')
    expect(drawnAsEnglish(developer, reading.chosenBySays)).toBe(true)
    // A FILE NAME IS NOT ENGLISH: it is drawn in the office's code style, as every path on the panel is.
    expect(inCode(developer, reading.database)).toBe(true)
    expect(drawnAsEnglish(developer, (reading.mark as Extract<TheMarkInTheReading, { state: 'read' }>).mark.says as string)).toBe(true)

    const normal = drawn(reading, 'normal')
    expect(held(normal, reading.chosenBySays)).toBe(false)
    expect(held(normal, reading.database)).toBe(false)
    expect(held(normal, (reading.mark as Extract<TheMarkInTheReading, { state: 'read' }>).mark.says as string)).toBe(false)

    const unreadable = aReading({ mark: { state: 'unreadable', why: 'The test wrote a mark that cannot be read.' } })
    expect(drawnAsEnglish(drawn(unreadable, 'inspect'), 'The test wrote a mark that cannot be read.')).toBe(true)
    expect(held(drawn(unreadable, 'normal'), 'The test wrote a mark that cannot be read.')).toBe(false)
  })
})

describe('DF22: whether a reading keeps the panel waiting', () => {
  it('DF22: true for each moving state while the mover lives, false when it has died and for every other state', () => {
    for (const state of THE_MOVING_STATES) {
      expect(panel.theReadingKeepsThePanelWaiting(aReading({ mark: aReadMark(state, true) })), state).toBe(true)
      expect(panel.theReadingKeepsThePanelWaiting(aReading({ mark: aReadMark(state, false) })), state).toBe(false)
    }
    for (const state of THE_OTHER_STATES) {
      expect(panel.theReadingKeepsThePanelWaiting(aReading({ mark: aReadMark(state) })), state).toBe(false)
    }
    expect(panel.theReadingKeepsThePanelWaiting(aReading({ mark: { state: 'absent' } }))).toBe(false)
    expect(panel.theReadingKeepsThePanelWaiting(aReading({ mark: { state: 'unreadable', why: 'not readable' } }))).toBe(false)
    // EVERY MOVING STATE HAS ITS OWN STEP WORDS, read by the cases above and never copied into this file.
    expect(Object.keys(panel.THE_STEP_WORDS).sort()).toEqual([...THE_MOVING_STATES].sort())
  })
})

// ---------------------------------------------------------------------------------------------------- the browser

const PANEL = '[data-target="uiSurface/settings.datafolder"]'
const ENTRY = '[data-settings-panel="settings.datafolder"]'
const READ = /\/api\/office\/data-folder(?:\?.*)?$/
const MOVE = /\/api\/office\/data-folder\/move$/
const CONFIRM = /\/api\/office\/data-folder\/confirm$/

let app: LiveApp
/** The real door's reply headers once, so a fulfilled answer is readable by a page on another origin. */
let answerHeaders: Record<string, string> = {}
let shots = ''

beforeAll(async () => {
  app = await liveApp({ name: 'data-folder-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const reading = await fetch(`${app.api}/api/office/data-folder`, {
    headers: {
      Origin: app.site,
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
  })
  expect(reading.ok, await reading.clone().text()).toBe(true)
  answerHeaders = theHeadersAnAnswerKeeps([...reading.headers])
  await app.context.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
  if (process.env['TEST_SHOTS'] !== undefined && process.env['TEST_SHOTS'] !== '') {
    shots = testShots('the-data-folder-panel-is-in-settings')
    mkdirSync(shots, { recursive: true })
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** A reply's headers without the ones about its bytes on the wire, which a fulfilled answer works out for itself. */
function theHeadersAnAnswerKeeps(headers: ReadonlyArray<readonly [string, string]>): Record<string, string> {
  const dropped = ['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive', 'date', 'set-cookie']
  return Object.fromEntries(headers.filter(([name]) => !dropped.includes(name.toLowerCase())))
}

/** A window of this test's own, so one case's routes are never another case's. */
async function aPage(): Promise<Page> {
  const page = await app.context.newPage()
  page.setDefaultTimeout(30_000)
  return page
}

/** Open the panel by its Settings address and wait until it has answered and drawn. */
async function openThePanel(page: Page, width = 1440, look = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en&mode=normal&look=${look}#/settings/datafolder`)
  await waitForThePage(page, 60_000)
  await page.locator(`${PANEL}`).waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('.set .px-loading').length === 0, undefined, { timeout: 30_000 })
}

/** Why a page on another origin is allowed to send and read the test's answers. */
function theCrossOriginHeaders(request: TheRequest): Record<string, string> {
  const sent = request.headers()
  return {
    'access-control-allow-origin': sent['origin'] ?? app.site,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': sent['access-control-request-headers'] ?? 'content-type',
    'access-control-expose-headers': 'x-mole-office-world, x-mole-office-freshness, x-mole-office-call',
    vary: 'Origin',
  }
}

/** A route's preflight, answered, or false when this request is not a preflight. */
async function answerThePreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false
  await route.fulfill({ status: 204, headers: theCrossOriginHeaders(route.request()) })
  return true
}

/** Answer one request with a JSON body and the headers a page on another origin may read. */
async function answerWithJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, headers: answerHeaders, body: JSON.stringify(body) })
}

/** The reply headers of a world whose only difference from this page's first reply is its database identity. */
function theOtherWorldHeaders(): Record<string, string> {
  return {
    ...answerHeaders,
    [WORLD_HEADER]: formatWorldHeader({ ...theTestOfficesWorld(), database: 'a-made-up-other-database-identity' }),
  }
}

/** The world the test's own office says it is, read off its first reply. */
function theTestOfficesWorld(): WorldOnTheWire {
  const parsed = parseWorldHeader(answerHeaders[WORLD_HEADER])
  if (!parsed.ok) throw new Error(parsed.why)
  return parsed.world
}

function aMoveStarted(to: string): DataFolderMoveStarted {
  return {
    mover: { pid: 4242 },
    mark: aMark('stopping', { to }),
    logPath: '/srv/made-up/data-folder-move.log',
    says: 'The test mover started, and the office stops now.',
  }
}

/** A started mark as a reading gives it: the office now keeps its data in the new folder, which the .env line names. */
function aStartedReading(changes: Partial<DataFolderReading> = {}): DataFolderReading {
  return aReading({ folder: THE_NEW_FOLDER, chosenBy: 'the .env line', mark: aReadMark('started'), ...changes })
}

// ----------------------------------------------------------------------------------------- DF28: the moved office

/** The database identity the moved office answers with, made up: no office on this computer has it. */
const THE_MOVED_DATABASE = 'a-made-up-moved-database-identity'
/** A database identity that is neither the test office's nor the moved office's, for a moved-home header that lies. */
const A_THIRD_DATABASE = 'a-made-up-third-database-identity'

/**
 * HOW THE OFFICE THAT ANSWERS AFTER THE MOVE DIFFERS FROM THE ONE THIS PAGE OPENED AGAINST. The first is the moved
 * office DF28 names. Each of the others is an office the page must still refuse.
 */
type HowTheMovedOfficeAnswers = 'the moved office' | 'its port differs too' | 'its header names a third database' | 'it sends no moved-home header'

/**
 * THE HEADERS OF ONE REPLY FROM THE OFFICE THAT ANSWERS AFTER THE MOVE, made from a reply of the test's own office.
 *
 * The world header is the test office's world with the moved database in it, and for one variant a port beside it.
 * The moved-home header is written as the server writes it: only on a reply to a request that sends the home this
 * page had before the move, and naming the database that is home now.
 */
function theMovedOfficeHeaders(real: Record<string, string>, request: TheRequest, how: HowTheMovedOfficeAnswers): Record<string, string> {
  const before = theTestOfficesWorld()
  const port = how === 'its port differs too' ? String(Number(before.port) + 1) : before.port
  const headers: Record<string, string> = { ...real, [WORLD_HEADER]: formatWorldHeader({ ...before, database: THE_MOVED_DATABASE, port }) }
  delete headers[HOME_MOVED_HEADER]
  if (how !== 'it sends no moved-home header' && request.headers()[HOME_HEADER] === before.database) {
    headers[HOME_MOVED_HEADER] = how === 'its header names a third database' ? A_THIRD_DATABASE : THE_MOVED_DATABASE
  }
  return headers
}

/**
 * THE ONE HELPER A DF28 CASE TURNS ON: EVERY OTHER REQUEST OF THE PAGE IS ANSWERED BY THE OFFICE AFTER THE MOVE.
 *
 * It is registered before the case's own routes, so those answer first and everything else comes here. While `how`
 * answers null it passes every request on as it is. Once a case turns it on, the request goes to the test's own office
 * and the reply comes back with the headers above. A request that sends the moved database as its home is sent on with
 * the test office's own, because to the office that really moved, that database is its own home.
 *
 * NOT THE PAGE'S EVENT STREAM, which never ends, while `route.fetch` reads a whole reply. NOT A PREFLIGHT, which carries
 * no world header and which the test office answers as it is.
 */
async function answerAsTheOfficeAfterTheMove(page: Page, how: () => HowTheMovedOfficeAnswers | null): Promise<void> {
  await page.route((url) => url.origin === app.api && url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request()
    const now = how()
    if (now === null || request.method() === 'OPTIONS' || new URL(request.url()).pathname === '/api/events') return route.fallback()
    const sent = await request.allHeaders()
    const response = await route.fetch(sent[HOME_HEADER] === THE_MOVED_DATABASE
      ? { headers: { ...sent, [HOME_HEADER]: theTestOfficesWorld().database } }
      : {})
    return route.fulfill({ response, headers: theMovedOfficeHeaders(theHeadersAnAnswerKeeps(Object.entries(response.headers())), request, now) })
  })
}

/** Press the check, and wait for its words that a move to the folder would go ahead, after which the move press is drawn. */
async function checkTheNewFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: i18n.t('dataFolder.check') }).click()
  await page.getByText(i18n.t('dataFolder.check.thisFolderIsFine'), { exact: true }).waitFor({ timeout: 15_000 })
}

/** How far a DF28 move has gone, for a case's own routes: the move press has had its 202, and the office after the move answers. */
interface HowFarTheMoveIs {
  pressed: () => boolean
  movedOn: () => boolean
}

/**
 * DF28: OPEN THE PANEL, PRESS THE MOVE, AND LET THE OFFICE AFTER THE MOVE ANSWER.
 *
 * The move exists only in the test's answers, as in the DF22 cases. Before the move press every request reaches the
 * test's own office. After the 202 a data folder read fails as a stopped office's does, until the panel draws its
 * waiting words. Then the helper above is turned on, and from then on the office after the move answers everything:
 * the reads with a started mark, and the confirm with no file removed. A read after the confirm answers a confirmed
 * mark. This returns once the helper is on.
 *
 * A CASE'S OWN ROUTES are registered after this helper's, so they answer first, and before the panel opens, so they
 * answer the page's first requests too.
 */
async function moveIntoTheOfficeAfterTheMove(
  page: Page,
  how: HowTheMovedOfficeAnswers,
  width = 1440,
  look = 'light',
  theCasesOwnRoutes: (theMove: HowFarTheMoveIs) => Promise<void> = async () => {},
): Promise<void> {
  let pressed = false
  let movedOn = false
  let confirmed = false
  await answerAsTheOfficeAfterTheMove(page, () => (movedOn ? how : null))
  await page.route(READ, async (route) => {
    if (await answerThePreflight(route)) return
    if (route.request().method() !== 'GET') return route.fallback()
    if (movedOn) {
      const reading = confirmed
        ? aReading({ folder: THE_NEW_FOLDER, chosenBy: 'the .env line', mark: aReadMark('confirmed') })
        : aStartedReading()
      return route.fulfill({ status: 200, headers: theMovedOfficeHeaders(answerHeaders, route.request(), how), body: JSON.stringify(reading) })
    }
    if (pressed) return route.abort('failed')
    return answerWithJson(route, 200, aReading())
  })
  await page.route(MOVE, async (route) => {
    if (await answerThePreflight(route)) return
    pressed = true
    return answerWithJson(route, 202, aMoveStarted(THE_NEW_FOLDER))
  })
  await page.route(CONFIRM, async (route) => {
    if (await answerThePreflight(route)) return
    confirmed = true
    return route.fulfill({
      status: 200,
      headers: theMovedOfficeHeaders(answerHeaders, route.request(), how),
      body: JSON.stringify({ removed: [], kept: [], says: 'The test answered the confirm.' }),
    })
  })
  await theCasesOwnRoutes({ pressed: () => pressed, movedOn: () => movedOn })
  await openThePanel(page, width, look)
  await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
  await checkTheNewFolder(page)
  await page.getByRole('button', { name: i18n.t('dataFolder.move') }).click()
  await page.getByRole('button', { name: i18n.t('dataFolder.move.sure') }).click()
  await page.waitForFunction(
    (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
    i18n.t('dataFolder.state.stopped'),
    { timeout: 15_000 },
  )
  movedOn = true
}

/**
 * DF28: THE OFFICE AFTER THE MOVE ANSWERS, BUT THIS PAGE PRESSED NO MOVE.
 *
 * The panel is open and a check is pressed, which is a read, so the page's own move is NOT under way. The office after
 * the move answers from then on. It returns how many move presses reached the test, so a case can say that a write
 * pressed through the banner never arrived.
 */
async function theMovedOfficeWithoutAMoveOfThisPage(page: Page): Promise<{ movePresses: () => number }> {
  let movedOn = false
  let movePresses = 0
  await answerAsTheOfficeAfterTheMove(page, () => (movedOn ? 'the moved office' : null))
  await page.route(READ, async (route) => {
    if (await answerThePreflight(route)) return
    if (route.request().method() !== 'GET') return route.fallback()
    const asked = new URL(route.request().url()).searchParams.get('to')
    const reading = aReading(asked === null ? {} : { wouldRefuse: { to: asked, why: null, code: null, values: null } })
    if (!movedOn) return answerWithJson(route, 200, reading)
    return route.fulfill({ status: 200, headers: theMovedOfficeHeaders(answerHeaders, route.request(), 'the moved office'), body: JSON.stringify(reading) })
  })
  await page.route(MOVE, async (route) => {
    if (await answerThePreflight(route)) return
    movePresses += 1
    return answerWithJson(route, 409, { error: 'This test never presses the move.' })
  })
  await page.route(CONFIRM, async (route) => {
    if (await answerThePreflight(route)) return
    return answerWithJson(route, 409, { error: 'This test never presses the confirm.' })
  })
  await openThePanel(page)
  await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
  movedOn = true
  await page.getByRole('button', { name: i18n.t('dataFolder.check') }).click()
  await page.getByText(i18n.t('frameFiles.wrongWorld.head'), { exact: true }).waitFor({ timeout: 25_000 })
  return { movePresses: () => movePresses }
}

/**
 * A WHOLE EVENT-STREAM BODY THAT ENDS AT ONCE. It is one comment block, which the page skips, so the stream says nothing
 * and the page opens it again when it ends. These are the test's own words and not a line the office sends.
 */
const A_STREAM_THAT_ENDS = ': the test answered this stream, and it ends here\n\n'

/** The headers of a stream answered by the test: the test office's own reply headers, which a page on another origin may read, as a stream's. */
function theStreamHeaders(): Record<string, string> {
  return { ...answerHeaders, 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform' }
}

/** CASE 15'S TERMINAL, made up by the test. The test answers the terminal list with it, and no holder holds it. */
const A_MADE_UP_TERMINAL: ListedTerminal = {
  id: 'a-made-up-terminal',
  who: { kind: 'person', id: THE_PERSON },
  agent: null,
  project: 'default',
  command: '/bin/sh',
  args: [],
  folder: '/srv/made-up/terminal-folder',
  envNames: [],
  state: 'running',
  pid: 4243,
  cols: 80,
  rows: 24,
  openedAt: '2026-11-12 01:00:00',
  endedAt: null,
  exit: null,
  keeping: false,
  paneView: null,
}

/** The terminal list case 15 answers: a holder that runs, and the made-up terminal. */
const A_MADE_UP_TERMINAL_LIST: TheTerminalsNow = {
  holder: { state: 'running', pid: 4244, startedAt: '2026-11-12 01:00:00' },
  terminals: [A_MADE_UP_TERMINAL],
}

/** The one line on the made-up terminal's screen. These are the test's own words, and no program printed them. */
const THE_TERMINALS_LINE = 'the test wrote this line on the screen of a made-up terminal'

/** The database identity this page keeps as its home, as the page itself reads it, or null when it keeps none. */
async function theHomeThePageKeeps(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    const said = localStorage.getItem(key)
    return said === null ? null : ((JSON.parse(said) as { database?: string }).database ?? null)
  }, world.HOME_WORLD_KEY)
}

/**
 * FORGET THE HOME A DF28 CASE LEFT. Every page of this file shares one browser storage, so a page that adopted the moved
 * office's home would make every later page send it. The next page learns its home again from its first reply.
 */
async function forgetTheHomeThisCaseLeft(page: Page): Promise<void> {
  await page.evaluate((key) => localStorage.removeItem(key), world.HOME_WORLD_KEY)
}

describe('DF19: the panel draws the real door\'s reading', () => {
  it('DF19: a checkout office is not a bundle, so the panel reads "runs from source code" and draws no press', async () => {
    const page = await aPage()
    try {
      await openThePanel(page)
      expect(await page.locator(ENTRY).count()).toBe(1)
      expect((await page.locator(`${PANEL} .px-panel-title`).innerText()).trim()).toBe(i18n.t('settingsPanel.title.datafolder'))
      expect(await page.locator(PANEL).innerText()).toContain(i18n.t('dataFolder.state.notABundle'))
      expect(await page.locator(`${PANEL} input`).count()).toBe(0)
      expect(await page.locator(`${PANEL} button`).count()).toBe(0)
    } finally {
      await page.close()
    }
  }, 120_000)
})

describe('DF22: the panel waits for the office during a move', () => {
  it('DF22: the move press warns first, the 202 starts a wait every two seconds, and a started reading ends it', async () => {
    const page = await aPage()
    const readTimes: number[] = []
    const moveBodies: unknown[] = []
    let readsAfterTheMove = 0
    let pressedAt = 0
    let answer: 'reading' | 'abort' = 'reading'
    try {
      await page.route(READ, async (route) => {
        if (await answerThePreflight(route)) return
        if (route.request().method() !== 'GET') return route.fallback()
        const asked = new URL(route.request().url()).searchParams.get('to')
        // THE CHECK'S OWN READ IS NOT ONE OF THE WAIT'S, so it is not timed with them.
        if (asked === null) readTimes.push(Date.now())
        if (pressedAt > 0) readsAfterTheMove += 1
        if (answer === 'abort') {
          // THE FIRST THREE READS AFTER THE 202 FAIL; THE FOURTH ANSWERS A STARTED MARK.
          if (readsAfterTheMove <= 3) return route.abort('failed')
          return answerWithJson(route, 200, aStartedReading())
        }
        return answerWithJson(route, 200, aReading(asked === null ? {} : { wouldRefuse: { to: asked, why: null, code: null, values: null } }))
      })
      await page.route(MOVE, async (route) => {
        if (await answerThePreflight(route)) return
        moveBodies.push(route.request().postDataJSON() as unknown)
        pressedAt = Date.now()
        return answerWithJson(route, 202, aMoveStarted(THE_NEW_FOLDER))
      })
      await page.route(CONFIRM, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 200, { removed: [], kept: [], says: 'The test answered the confirm.' })
      })

      await openThePanel(page)
      await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
      await checkTheNewFolder(page)
      await page.getByRole('button', { name: i18n.t('dataFolder.move') }).click()
      // NOTHING IS SENT BY THE MOVE PRESS: only the warning and its two presses are drawn.
      expect(await page.getByText(i18n.t('dataFolder.move.warn')).count()).toBe(1)
      expect(moveBodies).toEqual([])
      expect(pressedAt).toBe(0)

      await page.getByRole('button', { name: i18n.t('dataFolder.move.sure') }).click()
      expect(pressedAt).toBeGreaterThan(0)
      expect(moveBodies).toEqual([{ to: THE_NEW_FOLDER }])

      // THE 202 IS ANSWERED; THE OFFICE NOW DOES NOT ANSWER FOR THREE READS.
      answer = 'abort'
      await page.waitForFunction(
        (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
        i18n.t('dataFolder.state.stopped'),
        { timeout: 15_000 },
      )
      // ONE FAILED READ, THEN TWO, EACH COUNTED IN ITS OWN WORDS: the word for one is not the word for many.
      for (const n of [1, 2]) {
        await page.waitForFunction(
          (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
          i18n.t('dataFolder.waiting.asked', { n }),
          { timeout: 15_000 },
        )
      }
      expect(await page.locator(`${PANEL} .px-error`).count(), 'a failed read while waiting draws no refusal').toBe(0)

      // THE FOURTH READ ANSWERS A STARTED MARK, AND THE PANEL STOPS ASKING.
      const started = i18n.t('dataFolder.lastMove.started')
      await page.waitForFunction(
        (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
        started,
        { timeout: 25_000 },
      )
      expect(await page.getByRole('button', { name: i18n.t('dataFolder.confirm') }).count()).toBe(1)
      expect(readsAfterTheMove, 'the started reading came after at least three failed reads').toBeGreaterThanOrEqual(4)
      for (let at = 1; at < readTimes.length; at += 1) {
        expect(readTimes[at]! - readTimes[at - 1]!, `read ${String(at)} came too soon`).toBeGreaterThanOrEqual(1500)
      }
      const afterItStopped = readTimes.length
      await new Promise((resolve) => setTimeout(resolve, 5000))
      expect(readTimes.length, 'the panel asked again after a started reading ended its wait').toBe(afterItStopped)
      expect(moveBodies).toHaveLength(1)
    } finally {
      await page.close()
    }
  }, 180_000)

  it('DF22: a reply from an office with another identity ends the wait, reads "Another office answered.", and offers to load the page again', async () => {
    const page = await aPage()
    const readTimes: number[] = []
    let pressedAt = 0
    const otherWorld = theOtherWorldHeaders()
    try {
      await page.route(READ, async (route) => {
        if (await answerThePreflight(route)) return
        if (route.request().method() !== 'GET') return route.fallback()
        readTimes.push(Date.now())
        if (pressedAt === 0) return answerWithJson(route, 200, aReading())
        return route.fulfill({ status: 200, headers: otherWorld, body: JSON.stringify(aStartedReading()) })
      })
      await page.route(MOVE, async (route) => {
        if (await answerThePreflight(route)) return
        pressedAt = Date.now()
        return answerWithJson(route, 202, aMoveStarted(THE_NEW_FOLDER))
      })
      await page.route(CONFIRM, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 409, { error: 'This test never presses the confirm.' })
      })

      await openThePanel(page)
      await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
      await checkTheNewFolder(page)
      await page.getByRole('button', { name: i18n.t('dataFolder.move') }).click()
      await page.getByRole('button', { name: i18n.t('dataFolder.move.sure') }).click()

      const otherIdentity = i18n.t('dataFolder.state.otherIdentity')
      await page.waitForFunction(
        (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
        otherIdentity,
        { timeout: 25_000 },
      )
      const panel = page.locator(PANEL)
      expect(await panel.innerText()).toContain(i18n.t('dataFolder.state.otherIdentity'))
      expect(await page.getByRole('button', { name: i18n.t('dataFolder.loadAgain') }).count()).toBe(1)
      const drawn = await panel.innerText()
      expect(drawn, 'the waiting words are not drawn').not.toContain(i18n.t('dataFolder.state.stopped'))
      for (const n of [1, 2, 3]) expect(drawn, `the count for ${String(n)} is not drawn`).not.toContain(i18n.t('dataFolder.waiting.asked', { n }))
      expect(drawn, 'no older reading is drawn').not.toContain(i18n.t('dataFolder.row.folder'))
      expect(drawn, 'no older reading is drawn').not.toContain(THE_OLD_FOLDER)

      const atTheWords = readTimes.length
      await new Promise((resolve) => setTimeout(resolve, 5000))
      expect(readTimes.length, 'the panel asked again after another identity ended its wait').toBe(atTheWords)

      const loaded = page.waitForEvent('load', { timeout: 60_000 })
      await page.getByRole('button', { name: i18n.t('dataFolder.loadAgain') }).click()
      await loaded
    } finally {
      await page.close()
    }
  }, 180_000)

  it('DF22: a read that fails when no move was pressed draws the unread note and not the waiting words', async () => {
    const page = await aPage()
    try {
      await page.route(READ, async (route) => {
        if (await answerThePreflight(route)) return
        if (route.request().method() !== 'GET') return route.fallback()
        return route.abort('failed')
      })
      await page.route(MOVE, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 409, { error: 'This test never presses the move.' })
      })
      await page.route(CONFIRM, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 409, { error: 'This test never presses the confirm.' })
      })
      await openThePanel(page)
      expect(await page.locator(PANEL).innerText()).toContain(i18n.t('dataFolder.unread'))
      expect(await page.locator(PANEL).innerText()).not.toContain(i18n.t('dataFolder.state.stopped'))
      expect(await page.getByRole('button', { name: i18n.t('error.tryAgain') }).count()).toBe(1)
    } finally {
      await page.close()
    }
  }, 120_000)
})

describe('DF28: during its own move the page reads the moved office as its new home', () => {
  it('DF28: after the move the page reads the moved office as its new home, draws no banner, and the confirm can be pressed', async () => {
    const page = await aPage()
    const confirm = i18n.t('dataFolder.confirm')
    try {
      await moveIntoTheOfficeAfterTheMove(page, 'the moved office')
      // THE WAIT ENDS EITHER WAY: on the started reading, with the confirm, or on the other identity, with the press that
      // loads the page again. Whichever is drawn must be the thing at its own centre, with nothing drawn over it.
      const ended = page.locator(PANEL).getByRole('button', { name: confirm, exact: true })
        .or(page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.loadAgain'), exact: true }))
      await ended.first().waitFor({ timeout: 25_000 })
      await ended.first().scrollIntoViewIfNeeded()
      const atItsCentre = await ended.first().evaluate((press) => {
        const box = press.getBoundingClientRect()
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return {
          reached: top !== null && (top === press || press.contains(top)),
          over: top === null
            ? 'nothing'
            : `<${top.tagName.toLowerCase()}> named "${top.getAttribute('data-name') ?? ''}" saying "${(top.textContent ?? '').trim()}"`,
          press: (press.textContent ?? '').trim(),
          banners: [...document.querySelectorAll('[role="alert"]')].map((one) => (one.textContent ?? '').trim()),
        }
      })
      expect(
        atItsCentre.reached,
        `the press "${atItsCentre.press}" is under ${atItsCentre.over}; the banner says: ${atItsCentre.banners.join(' | ') || 'no banner is drawn'}`,
      ).toBe(true)
      expect(atItsCentre.press, 'the wait ended on the started reading').toBe(confirm)
      expect(await page.getByText(i18n.t('frameFiles.wrongWorld.head'), { exact: true }).count(), 'no banner is drawn').toBe(0)
      expect(await page.getByText(i18n.t('frameFiles.homeMoved'), { exact: true }).count(), 'the page says it uses the new home').toBe(1)
      expect(await theHomeThePageKeeps(page)).toBe(THE_MOVED_DATABASE)

      await page.locator(PANEL).getByRole('button', { name: confirm, exact: true }).click()
      await page.getByText(i18n.t('dataFolder.confirmed.removed', { n: 0 })).waitFor({ timeout: 15_000 })
      expect(await page.getByText(i18n.t('frameFiles.wrongWorld.head'), { exact: true }).count(), 'no banner after the confirm').toBe(0)
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 180_000)

  it('DF28: an event stream that reaches the moved office first is read as the new home, raises no banner, and is opened again when it ends', async () => {
    const page = await aPage()
    const banner = i18n.t('frameFiles.wrongWorld.head')
    const confirm = i18n.t('dataFolder.confirm')
    /** Who answered each of this page's stream requests, in the order the page sent them. */
    const streams: Array<'the test office' | 'nobody' | 'the moved office'> = []
    /** Whether a request other than the stream may be answered after the move press. */
    let theRestMayAnswer = false
    const isTheStream = (url: URL): boolean => url.origin === app.api && url.pathname === '/api/events'
    try {
      await moveIntoTheOfficeAfterTheMove(page, 'the moved office', 1440, 'light', async (theMove) => {
        // EVERY OTHER REQUEST FAILS AFTER THE MOVE PRESS, AS A STOPPED OFFICE'S DOES, until this case lets it answer. The
        // data folder read is one of them. An ordinary reply from the moved office would make it this page's world
        // before the stream reached it, and the stream would then pass for that reason and not for its own.
        await page.route((url) => url.origin === app.api && url.pathname.startsWith('/api/') && !isTheStream(url), async (route) => {
          if (route.request().method() === 'OPTIONS' || !theMove.pressed() || theRestMayAnswer) return route.fallback()
          return route.abort('failed')
        })
        // THE STREAM, answered at once with a whole body that ends: by the test office before the move press, by nobody
        // from the 202 until the office after the move answers, and by the moved office from then on.
        await page.route(isTheStream, async (route) => {
          if (await answerThePreflight(route)) return
          if (!theMove.pressed()) {
            streams.push('the test office')
            return route.fulfill({ status: 200, headers: theStreamHeaders(), body: A_STREAM_THAT_ENDS })
          }
          if (!theMove.movedOn()) {
            streams.push('nobody')
            return route.abort('failed')
          }
          streams.push('the moved office')
          return route.fulfill({
            status: 200,
            headers: theMovedOfficeHeaders(theStreamHeaders(), route.request(), 'the moved office'),
            body: A_STREAM_THAT_ENDS,
          })
        })
      })
      expect(streams[0], 'this page holds its own stream, and the test office answered it before the move').toBe('the test office')
      // WHO ANSWERED EACH STREAM REQUEST, so a stream that never reached the moved office says who did answer it.
      await expect.poll(() => streams.join(', '), { timeout: 30_000 }).toContain('the moved office')

      await expect.poll(() => theHomeThePageKeeps(page), {
        timeout: 15_000,
        message: 'the page did not keep the moved office\'s database as its home after the stream reached it',
      }).toBe(THE_MOVED_DATABASE)
      expect(await page.getByText(banner, { exact: true }).count(), 'no banner is drawn').toBe(0)
      await expect.poll(() => streams.filter((one) => one === 'the moved office').length, {
        timeout: 15_000,
        message: 'the page did not ask for the stream again after the moved office\'s answer ended',
      }).toBeGreaterThanOrEqual(2)

      theRestMayAnswer = true
      await page.locator(PANEL).getByRole('button', { name: confirm, exact: true }).waitFor({ timeout: 25_000 })
      expect(await page.getByText(banner, { exact: true }).count(), 'no banner once the data folder read answers').toBe(0)
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 180_000)

  it('DF28: a terminal\'s stream that reaches the moved office first is read as the new home, raises no banner, and draws the terminal', async () => {
    const page = await aPage()
    const banner = i18n.t('frameFiles.wrongWorld.head')
    const { pathFor } = await import('../src/web/components/router.tsx')
    /** How many times the page asked for the terminal's stream. */
    let terminalStreams = 0
    const isTheEventStream = (url: URL): boolean => url.origin === app.api && url.pathname === '/api/events'
    const isTheTerminalList = (url: URL): boolean => url.origin === app.api && url.pathname === '/api/terminals'
    const isTheTerminalsStream = (url: URL): boolean =>
      url.origin === app.api && url.pathname === `/api/terminals/${encodeURIComponent(A_MADE_UP_TERMINAL.id)}/stream`
    try {
      await moveIntoTheOfficeAfterTheMove(page, 'the moved office', 1440, 'light', async (theMove) => {
        // WHO ANSWERS WHAT, SO THAT THE TERMINAL'S STREAM IS THE FIRST REPLY FROM THE MOVED OFFICE. After the move press,
        // every other request to the office fails, as a stopped office's does. The data folder read is one of them. An
        // ordinary reply from the moved office would make it this page's world before the terminal's stream reached it,
        // and the stream would then pass for that reason and not for its own.
        await page.route(
          (url) => url.origin === app.api && url.pathname.startsWith('/api/') && !isTheEventStream(url) && !isTheTerminalList(url) && !isTheTerminalsStream(url),
          async (route) => {
            if (route.request().method() === 'OPTIONS' || !theMove.pressed()) return route.fallback()
            return route.abort('failed')
          },
        )
        // THE PAGE'S EVENT STREAM, for the same reason: answered at once by the test office before the move press, as in
        // case 14, and failing from then on.
        await page.route(isTheEventStream, async (route) => {
          if (await answerThePreflight(route)) return
          if (!theMove.pressed()) return route.fulfill({ status: 200, headers: theStreamHeaders(), body: A_STREAM_THAT_ENDS })
          return route.abort('failed')
        })
        // THE TERMINAL LIST, answered by the test with the made-up terminal and the headers of the office this page
        // opened against. The page needs the list to draw the terminal's press, and that office is no new world.
        await page.route(isTheTerminalList, async (route) => {
          if (await answerThePreflight(route)) return
          if (route.request().method() !== 'GET') return route.fallback()
          return answerWithJson(route, 200, A_MADE_UP_TERMINAL_LIST)
        })
        // THE TERMINAL'S STREAM, answered by the moved office with one screen. THE BODY HAS NO CLOSING EVENT. A closing
        // event makes the Terminals page put the view away at once, before xterm draws the screen. A stream that ends
        // with none leaves the view drawn, and the view then says that it stopped.
        await page.route(isTheTerminalsStream, async (route) => {
          if (await answerThePreflight(route)) return
          terminalStreams += 1
          const screen = { terminal: A_MADE_UP_TERMINAL, screen: `${THE_TERMINALS_LINE}\r\n` }
          return route.fulfill({
            status: 200,
            headers: theMovedOfficeHeaders(theStreamHeaders(), route.request(), 'the moved office'),
            body: `event: screen\ndata: ${JSON.stringify(screen)}\n\n`,
          })
        })
      })
      // TO THE TERMINALS PAGE WITHOUT LOADING THE PAGE AGAIN, as a press on a link to it goes. The office is stopped, so
      // the page cannot read whether a review on this page holds comments not sent. It asks before it leaves, and the
      // case leaves anyway. The terminal is then opened by its own press.
      await page.evaluate((address) => {
        location.hash = address
      }, `#${pathFor('terminals')}`)
      await page.getByRole('button', { name: i18n.t('review.leave.anyway'), exact: true }).click()
      await page.getByRole('button', { name: i18n.t('terminals.open'), exact: true }).click()
      await expect.poll(() => terminalStreams, { timeout: 30_000, message: 'the page did not ask for the terminal\'s stream' }).toBeGreaterThan(0)

      await expect.poll(() => theHomeThePageKeeps(page), {
        timeout: 15_000,
        message: 'the page did not keep the moved office\'s database as its home after the terminal\'s stream reached it',
      }).toBe(THE_MOVED_DATABASE)
      expect(await page.getByText(banner, { exact: true }).count(), 'no banner is drawn').toBe(0)
      expect(await page.locator('.tm-view').innerText(), 'the view says another office answered').not.toContain(i18n.t('terminals.view.otherWorld'))
      await expect.poll(() => page.locator('.tm-view .xterm-rows').innerText().catch(() => ''), {
        timeout: 15_000,
        message: 'the terminal\'s screen was not drawn',
      }).toContain(THE_TERMINALS_LINE)
      await expect.poll(() => page.locator('.tm-view .tm-view-broken').innerText().catch(() => ''), {
        timeout: 15_000,
        message: 'the view did not say that it stopped, so the page did not read the stream to its end',
      }).toContain(i18n.t('terminals.view.gone'))
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 180_000)

  it('DF28: during the move a reply from an office that differs in more than its database, or whose moved-home header names another database, still raises the banner', async () => {
    const hows = ['its port differs too', 'its header names a third database', 'it sends no moved-home header'] as const
    for (const how of hows) {
      const page = await aPage()
      try {
        await moveIntoTheOfficeAfterTheMove(page, how)
        await page.getByText(i18n.t('frameFiles.wrongWorld.head'), { exact: true }).waitFor({ timeout: 25_000 })
        await page.waitForFunction(
          (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
          i18n.t('dataFolder.state.otherIdentity'),
          { timeout: 25_000 },
        )
        expect(await page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.confirm'), exact: true }).count(), how).toBe(0)
        expect(await theHomeThePageKeeps(page), how).toBe(theTestOfficesWorld().database)
      } finally {
        await forgetTheHomeThisCaseLeft(page)
        await page.close()
      }
    }
  }, 300_000)

  it('DF28: with no move of this page under way, a reply from the moved office still raises the banner', async () => {
    const page = await aPage()
    let movedOn = false
    try {
      await answerAsTheOfficeAfterTheMove(page, () => (movedOn ? 'the moved office' : null))
      await page.route(READ, async (route) => {
        if (await answerThePreflight(route)) return
        if (route.request().method() !== 'GET') return route.fallback()
        const asked = new URL(route.request().url()).searchParams.get('to')
        const reading = aReading(asked === null ? {} : { wouldRefuse: { to: asked, why: null, code: null, values: null } })
        if (!movedOn) return answerWithJson(route, 200, reading)
        return route.fulfill({ status: 200, headers: theMovedOfficeHeaders(answerHeaders, route.request(), 'the moved office'), body: JSON.stringify(reading) })
      })
      await page.route(MOVE, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 409, { error: 'This test never presses the move.' })
      })
      await page.route(CONFIRM, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 409, { error: 'This test never presses the confirm.' })
      })
      await openThePanel(page)
      await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
      movedOn = true
      await page.getByRole('button', { name: i18n.t('dataFolder.check') }).click()
      await page.getByText(i18n.t('frameFiles.wrongWorld.head'), { exact: true }).waitFor({ timeout: 25_000 })
      expect(await page.getByText(i18n.t('frameFiles.homeMoved'), { exact: true }).count(), 'the page does not say it moved').toBe(0)
      expect(await theHomeThePageKeeps(page)).toBe(theTestOfficesWorld().database)
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 120_000)

  it('DF28: while the banner stands during this page\'s own move, it is drawn above the panel, no sheet is over it, and the panel\'s writes are held', async () => {
    const page = await aPage()
    const banner = i18n.t('frameFiles.wrongWorld.head')
    try {
      await moveIntoTheOfficeAfterTheMove(page, 'it sends no moved-home header')
      await page.getByText(banner, { exact: true }).waitFor({ timeout: 25_000 })
      await page.waitForFunction(
        (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
        i18n.t('dataFolder.state.otherIdentity'),
        { timeout: 25_000 },
      )

      // THE BANNER IS ABOVE THE PAGE, IN ORDINARY FLOW. Its own `px-ww` position is fixed; the wrapper's class turns it
      // off, and the page starts below the banner rather than behind it.
      const where = await page.evaluate(() => {
        const banner = document.querySelector('.px-ww')
        const panel = document.querySelector('[data-target="uiSurface/settings.datafolder"]')
        return {
          sheet: document.querySelector('.px-ww-block') !== null,
          position: banner === null ? 'missing' : getComputedStyle(banner).position,
          bannerBottom: banner?.getBoundingClientRect().bottom ?? null,
          panelTop: panel?.getBoundingClientRect().top ?? null,
        }
      })
      expect(where.sheet, 'a sheet is drawn over the page during this page\'s own move').toBe(false)
      expect(where.position, 'the banner is still fixed over the page').toBe('static')
      expect(where.bannerBottom).not.toBeNull()
      expect(where.panelTop).not.toBeNull()
      expect(where.bannerBottom!, 'the panel starts above the end of the banner').toBeLessThanOrEqual(where.panelTop!)

      // WRITES STAY HELD: no move and no confirm is drawn while the banner says the page cannot tell which office
      // answered. The one press the panel draws is the one that loads the page again.
      expect(await page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.move'), exact: true }).count()).toBe(0)
      expect(await page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.confirm'), exact: true }).count()).toBe(0)
      const loadAgain = page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.loadAgain'), exact: true })
      expect(await loadAgain.count()).toBe(1)

      // AND IT IS AT ITS OWN CENTRE, so no sheet swallows it.
      await loadAgain.scrollIntoViewIfNeeded()
      const atItsCentre = await loadAgain.evaluate((press) => {
        const box = press.getBoundingClientRect()
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return { reached: top !== null && (top === press || press.contains(top)), over: top?.className ?? 'nothing' }
      })
      expect(atItsCentre.reached, `the load-again press is under ${atItsCentre.over}`).toBe(true)

      const loaded = page.waitForEvent('load', { timeout: 60_000 })
      await loadAgain.click()
      await loaded
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 180_000)

  it('DF28: when the moved-home header arrives, the banner goes and the panel reads the new home without a reload', async () => {
    const page = await aPage()
    const banner = i18n.t('frameFiles.wrongWorld.head')
    try {
      await moveIntoTheOfficeAfterTheMove(page, 'it sends no moved-home header')
      await page.getByText(banner, { exact: true }).waitFor({ timeout: 25_000 })
      await page.waitForFunction(
        (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
        i18n.t('dataFolder.state.otherIdentity'),
        { timeout: 25_000 },
      )
      // A MARKER THAT ONLY A RELOAD TAKES AWAY.
      await page.evaluate(() => {
        ;(window as unknown as { neverReloaded?: string }).neverReloaded = 'the document this case opened'
      })

      // THE HEADER ARRIVES ON EVERY LATER REPLY, as the server sends it once the new office knows the old home.
      await page.route((url) => url.origin === app.api && url.pathname.startsWith('/api/'), async (route) => {
        const request = route.request()
        if (request.method() === 'OPTIONS' || new URL(request.url()).pathname === '/api/events') return route.fallback()
        const sent = await request.allHeaders()
        const response = await route.fetch(sent[HOME_HEADER] === THE_MOVED_DATABASE
          ? { headers: { ...sent, [HOME_HEADER]: theTestOfficesWorld().database } }
          : {})
        return route.fulfill({
          response,
          headers: theMovedOfficeHeaders(theHeadersAnAnswerKeeps(Object.entries(response.headers())), request, 'the moved office'),
        })
      })

      // THE PAGE'S OWN THIRTY-SECOND READ WHILE A BANNER STANDS IS WHAT BRINGS IT.
      await page.getByText(banner, { exact: true }).waitFor({ state: 'detached', timeout: 45_000 })
      expect(await page.evaluate(() => (window as unknown as { neverReloaded?: string }).neverReloaded), 'the page was reloaded, so this proves nothing').toBe('the document this case opened')
      expect(await theHomeThePageKeeps(page)).toBe(THE_MOVED_DATABASE)
      await expect.poll(() => page.locator(PANEL).innerText(), {
        timeout: 15_000,
        message: 'the panel still says an office answered under another identity after the page took the new home',
      }).not.toContain(i18n.t('dataFolder.state.otherIdentity'))
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 120_000)

  it('DF28: with no move of this page under way, the banner still shuts the page', async () => {
    const page = await aPage()
    try {
      await theMovedOfficeWithoutAMoveOfThisPage(page)
      const press = page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.check'), exact: true })
      await press.scrollIntoViewIfNeeded()
      const hit = await press.evaluate((button) => {
        const box = button.getBoundingClientRect()
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        return { reached: top !== null && (top === button || button.contains(top)), over: top?.className ?? 'nothing' }
      })
      expect(hit.reached, 'a press at the check press lands on the page').toBe(false)
      expect(hit.over, 'the sheet is not what a press lands on').toMatch(/^px-ww/)
      expect(await page.locator('.px-ww-block').count(), 'no sheet is drawn').toBe(1)
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 120_000)

  it('DF28: a check pressed while the banner shuts the page reaches nothing, and no move press comes after it', async () => {
    const page = await aPage()
    const banner = i18n.t('frameFiles.wrongWorld.head')
    try {
      const seen = await theMovedOfficeWithoutAMoveOfThisPage(page)
      const press = page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.check'), exact: true })
      await press.scrollIntoViewIfNeeded()
      const box = await press.boundingBox()
      if (box === null) throw new Error('the check press has no box to press')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await new Promise((resolve) => setTimeout(resolve, 500))
      // THE CHECK IS THE FIRST STEP OF A MOVE: the move press comes only after a check that says a move would go ahead,
      // the warning only after the move press, and the sure press under the warning is the write. The check under the
      // banner was answered by another office, so none of them is drawn, and the write is held at its first step.
      expect(await page.getByText(i18n.t('dataFolder.check.thisFolderIsFine'), { exact: true }).count(), 'a check under the banner said the move would go ahead').toBe(0)
      expect(await page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.move'), exact: true }).count(), 'a move press came after a check under the banner').toBe(0)
      expect(await page.getByText(i18n.t('dataFolder.move.warn')).count(), 'the warning was drawn under the banner').toBe(0)
      expect(await page.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.move.sure'), exact: true }).count()).toBe(0)
      expect(seen.movePresses(), 'a write pressed through the banner reached the office').toBe(0)
      expect(await page.getByText(banner, { exact: true }).count(), 'the banner went without the world being right').toBe(1)
    } finally {
      await forgetTheHomeThisCaseLeft(page)
      await page.close()
    }
  }, 120_000)
})

describe('DF22: a press waits for its answer, and says so', () => {
  it('DF22: an empty field says what to write, a press in flight says the office has not answered, and one removed file is one', async () => {
    const page = await aPage()
    const held: Array<() => void> = []
    /** Hold an answer until the case lets it go, so the press is still in flight. */
    const holdThen = (send: () => Promise<void>): Promise<void> => new Promise((resolve) => {
      held.push(() => void send().then(resolve))
    })
    let confirmed = false
    try {
      await page.route(READ, async (route) => {
        if (await answerThePreflight(route)) return
        const asked = new URL(route.request().url()).searchParams.get('to')
        if (asked !== null) return holdThen(() => answerWithJson(route, 200, aReading({ wouldRefuse: { to: asked, why: null, code: null, values: null } })))
        return answerWithJson(route, 200, aReading())
      })
      await page.route(MOVE, async (route) => {
        if (await answerThePreflight(route)) return
        return holdThen(() => answerWithJson(route, 409, { error: 'The test refuses this move.' }))
      })
      await openThePanel(page)
      const press = (name: string) => page.locator(PANEL).getByRole('button', { name })
      // A PRESS'S REASON IS DRAWN STRAIGHT AFTER IT, by Btn in src/web/components/ui.tsx.
      const why = (name: string) => page.locator(PANEL).locator(`button:has-text("${name}") + .px-why`)

      // THE FIELD IS EMPTY: the press says what to write. A press that is off is pressed with force, because
      // Playwright waits for an aria-disabled button to come on.
      await press(i18n.t('dataFolder.check')).click({ force: true })
      expect(await why(i18n.t('dataFolder.check')).innerText()).toBe(i18n.t('dataFolder.toHint'))

      // A CHECK IS IN FLIGHT: the check says the office has not answered, and not what to write. It is still the one
      // press, because the step it is is not done.
      await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
      await press(i18n.t('dataFolder.check')).click()
      await expect.poll(() => held.length, { timeout: 10_000 }).toBe(1)
      await press(i18n.t('dataFolder.check')).click({ force: true })
      expect(await why(i18n.t('dataFolder.check')).innerText()).toBe(i18n.t('dataFolder.busy'))
      expect(await press(i18n.t('dataFolder.move')).count(), 'the move press is drawn before the check has answered').toBe(0)
      held.shift()?.()
      await page.getByText(i18n.t('dataFolder.check.thisFolderIsFine'), { exact: true }).waitFor({ timeout: 15_000 })
      expect(await press(i18n.t('dataFolder.check')).count(), 'the check press is still drawn after its step is done').toBe(0)

      // A MOVE IS IN FLIGHT: the sure press and the cancel say the office has not answered, and not the warning.
      await press(i18n.t('dataFolder.move')).click()
      await press(i18n.t('dataFolder.move.sure')).click()
      await expect.poll(() => held.length, { timeout: 10_000 }).toBe(1)
      for (const name of [i18n.t('dataFolder.move.sure'), i18n.t('dataFolder.move.cancel')]) {
        await press(name).click({ force: true })
        expect(await why(name).innerText()).toBe(i18n.t('dataFolder.busy'))
      }
      held.shift()?.()
      await page.getByText(i18n.t('dataFolder.notChanged')).waitFor({ timeout: 15_000 })
    } finally {
      await page.close()
    }

    const second = await aPage()
    try {
      await second.route(READ, async (route) => {
        if (await answerThePreflight(route)) return
        return answerWithJson(route, 200, confirmed
          ? aReading({ folder: THE_NEW_FOLDER, chosenBy: 'the .env line', mark: aReadMark('confirmed') })
          : aStartedReading())
      })
      await second.route(CONFIRM, async (route) => {
        if (await answerThePreflight(route)) return
        return holdThen(async () => {
          confirmed = true
          await answerWithJson(route, 200, { removed: ['keys.json'], kept: [], says: 'The test answered the confirm.' })
        })
      })
      await openThePanel(second)
      const confirm = second.locator(PANEL).getByRole('button', { name: i18n.t('dataFolder.confirm') })
      await confirm.click()
      await expect.poll(() => held.length, { timeout: 10_000 }).toBe(1)
      // THE CONFIRM IS IN FLIGHT: the press says the office has not answered.
      await confirm.click({ force: true })
      expect(await second.locator(PANEL).locator(`button:has-text("${i18n.t('dataFolder.confirm')}") + .px-why`).innerText()).toBe(i18n.t('dataFolder.busy'))
      held.shift()?.()
      await second.getByText(i18n.t('dataFolder.confirmed.removed', { n: 1 })).waitFor({ timeout: 15_000 })
      // ONE FILE IS ONE: the word for one file is not the word for many with the number changed.
      expect(i18n.t('dataFolder.confirmed.removed', { n: 1 }).replace('1', '2')).not.toBe(i18n.t('dataFolder.confirmed.removed', { n: 2 }))
      expect(i18n.t('dataFolder.waiting.asked', { n: 1 }).replace('1', '2')).not.toBe(i18n.t('dataFolder.waiting.asked', { n: 2 }))
    } finally {
      await second.close()
    }
  }, 180_000)
})

describe('DF22: the panel photographed', () => {
  it.skipIf(!process.env['TEST_SHOTS'])('DF22: nothing scrolls sideways at four widths in both looks, in eight states', async () => {
    const states = ['refused', 'waiting', 'started', 'throughTheDoor', 'switchedAndEnded', 'otherIdentity', 'moved', 'movedBeforeHeader'] as const
    const otherWorld = theOtherWorldHeaders()
    for (const state of states) {
      for (const width of [1440, 990, 660, 390]) {
        for (const look of ['light', 'dark']) {
          const page = await aPage()
          const theSecretsFilePath = page.locator('[data-storage-credentials] code')
          try {
            if (state === 'refused') {
              await page.route(READ, async (route) => {
                if (await answerThePreflight(route)) return
                const url = new URL(route.request().url())
                const asked = url.searchParams.get('to')
                return answerWithJson(route, 200, asked === null
                  ? aReading()
                  : aReading({
                    wouldRefuse: {
                      to: asked,
                      why: i18n.sayInEnglish('server.dataFolderPlaceNotEmpty', { to: asked }),
                      code: 'dataFolderPlaceNotEmpty',
                      values: { to: asked },
                    },
                  }))
              })
            } else if (state === 'waiting') {
              await page.route(READ, async (route) => {
                if (await answerThePreflight(route)) return
                return answerWithJson(route, 200, aReading({ mark: aReadMark('copying') }))
              })
            } else if (state === 'otherIdentity') {
              // THE FIRST REPLY IS THIS PAGE'S OWN WORLD, WHICH STARTS A WAIT; EVERY LATER REPLY COMES FROM AN OFFICE
              // WITH ANOTHER DATABASE IDENTITY, WHICH ENDS THAT WAIT.
              let reads = 0
              await page.route(READ, async (route) => {
                if (await answerThePreflight(route)) return
                reads += 1
                if (reads === 1) return answerWithJson(route, 200, aReading({ mark: aReadMark('copying') }))
                return route.fulfill({ status: 200, headers: otherWorld, body: JSON.stringify(aStartedReading()) })
              })
            } else if (state === 'throughTheDoor') {
              // A SECRETARY WHOSE GRANT MAY PRESS: the panel draws where the data is, and no press.
              await page.route(READ, async (route) => {
                if (await answerThePreflight(route)) return
                return answerWithJson(route, 200, aReading({ theCallerIsThePerson: false, mayMove: true }))
              })
            } else if (state === 'switchedAndEnded') {
              // A MOVE THAT SWITCHED AND WHOSE MOVER ENDED: the confirm is what ends it.
              await page.route(READ, async (route) => {
                if (await answerThePreflight(route)) return
                return answerWithJson(route, 200, aReading({ mark: aReadMark('switched', false) }))
              })
            } else if (state === 'moved') {
              // DF28: THE PAGE'S OWN MOVE, AND THE MOVED OFFICE ANSWERING AFTER IT, as the DF28 case draws them.
              await moveIntoTheOfficeAfterTheMove(page, 'the moved office', width, look)
            } else if (state === 'movedBeforeHeader') {
              // DF28: THE PAGE'S OWN MOVE, AND THE MOVED OFFICE ANSWERING BEFORE ITS MOVED-HOME HEADER ARRIVES. The banner
              // stands above the page with no sheet, which is the state the fault drew as a sheet over the panel.
              await moveIntoTheOfficeAfterTheMove(page, 'it sends no moved-home header', width, look)
            } else {
              await page.route(READ, async (route) => {
                if (await answerThePreflight(route)) return
                return answerWithJson(route, 200, aStartedReading())
              })
            }
            if (state !== 'moved' && state !== 'movedBeforeHeader') await openThePanel(page, width, look)
            if (state === 'refused') {
              await page.locator(`${PANEL} input`).fill(THE_NEW_FOLDER)
              await page.getByRole('button', { name: i18n.t('dataFolder.check') }).click()
              await page.waitForFunction(
                (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
                i18n.t('dataFolder.check.thisFolderIsRefused'),
                { timeout: 15_000 },
              )
            } else if (state === 'waiting') {
              await page.waitForFunction(
                (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
                i18n.t('dataFolder.state.stopped'),
                { timeout: 15_000 },
              )
            } else if (state === 'throughTheDoor') {
              await page.waitForFunction(
                (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
                THE_OLD_FOLDER,
                { timeout: 15_000 },
              )
            } else if (state === 'otherIdentity') {
              await page.waitForFunction(
                (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
                i18n.t('dataFolder.state.otherIdentity'),
                { timeout: 25_000 },
              )
            } else if (state === 'movedBeforeHeader') {
              await page.getByText(i18n.t('frameFiles.wrongWorld.head'), { exact: true }).waitFor({ timeout: 25_000 })
              await page.waitForFunction(
                (word) => document.querySelector('[data-target="uiSurface/settings.datafolder"]')?.textContent?.includes(word) === true,
                i18n.t('dataFolder.state.otherIdentity'),
                { timeout: 25_000 },
              )
            } else {
              await page.locator(`${PANEL}`).getByRole('button', { name: i18n.t('dataFolder.confirm') }).waitFor()
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${state} ${String(width)} ${look}`).toBe(true)
            if (state === 'movedBeforeHeader') {
              // THE WHOLE PAGE, because the banner is above the panel in ordinary flow and the picture has to show both.
              await page.evaluate(() => window.scrollTo(0, 0))
              await page.screenshot({ path: `${shots}/data-folder-${state}-en-${String(width)}-${look}.png`, fullPage: true, mask: [theSecretsFilePath] })
            } else {
              await page.locator(PANEL).scrollIntoViewIfNeeded()
              await page.screenshot({ path: `${shots}/data-folder-${state}-en-${String(width)}-${look}.png`, fullPage: false, mask: [theSecretsFilePath] })
            }
          } finally {
            if (state === 'moved' || state === 'movedBeforeHeader') await forgetTheHomeThisCaseLeft(page)
            await page.close()
          }
        }
      }
    }
  }, 600_000)
})
