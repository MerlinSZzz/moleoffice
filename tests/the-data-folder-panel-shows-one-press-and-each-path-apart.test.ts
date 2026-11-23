// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DATA FOLDER PANEL SHOWS ONE PRESS AT A TIME, A MOVE'S TWO FOLDERS ON TWO ROWS, AND EACH PATH IN THE CODE STYLE.
 * The panel is src/web/components/DataFolderPanel.tsx. Each case of 1 to 3 runs at a desk's width, 1440, and a phone's,
 * 390, and each case of 4 at 1440.
 *
 * WHAT THIS PROVES
 *
 *   1. One press at a time, in the order a move takes. First the check alone. Once the check says a move to the folder
 *      would go ahead, the move alone, and the check is gone. Once the move is pressed, the warning's press with its
 *      cancel, and the move is gone. A refused check keeps the check as the one press, and a change to the folder
 *      brings the check back. A check's answer that comes after the field has changed is not about the folder in the
 *      field: the panel says nothing of that folder and brings no move, and the check stays the one press.
 *   2. A move's two folders are two rows, From and To, each with its label and its path, the From row above the To
 *      row. The folder the office uses is a row of its own, and no sentence of the panel holds a path.
 *   3. Each path and file name the panel draws is in a code element, drawn in the office's code style, and not in the
 *      style of the sentence beside it: the folder in use, From and To, an earlier folder, and a file the confirm kept.
 *   4. A refused check is drawn from the code and values the door gives, in the page's language. An English page draws
 *      the code's English. A Chinese page draws the code's Chinese with its values, not marked as English. A refusal
 *      whose one value is English the walk gave (`dataFolderMoveRefused`) is drawn as that English, marked as English.
 *
 * THE WORLD. A throwaway office from tests/helpers.ts, its page in the shared Chromium, in Normal mode and English, and
 * in Chinese for two cases of 4. The cases answer the three data folder doors with page.route, so every reading and
 * every move here is the test's own: the test starts no mover and changes no file. Every word is read by its key.
 */
import type {
  DataFolderConfirmed,
  DataFolderReading,
  TheMarkInTheReading,
  TheMoveMark,
  TheStateOfAMove,
} from '../src/shared/data-folder.ts'
import type { Page, Request as TheRequest, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createI18n } from '../src/shared/i18n.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const en = createI18n('en')
const zh = createI18n('zh')
const PANEL = '[data-target="uiSurface/settings.datafolder"]'
const READ = /\/api\/office\/data-folder(?:\?.*)?$/
const MOVE = /\/api\/office\/data-folder\/move$/
const CONFIRM = /\/api\/office\/data-folder\/confirm$/
const THE_OLD_FOLDER = '/srv/made-up/old-data'
const THE_NEW_FOLDER = '/srv/made-up/new-data'
const A_REFUSED_FOLDER = '/srv/made-up/full-data'
const AN_EARLIER_FOLDER = '/srv/made-up/first-data'
const A_KEPT_FILE = 'keys.json'
/** The panel's presses, each by its word key. */
const THE_PRESSES = ['dataFolder.check', 'dataFolder.move', 'dataFolder.move.sure', 'dataFolder.move.cancel', 'dataFolder.confirm'] as const

let app: LiveApp
/** The real door's reply headers once, so an answer the test fulfils is readable by a page on another origin. */
let answerHeaders: Record<string, string> = {}

beforeAll(async () => {
  app = await liveApp({ name: 'data-folder-one-press', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const reading = await fetch(`${app.api}/api/office/data-folder`, {
    headers: {
      Origin: app.site,
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
  })
  expect(reading.ok, await reading.clone().text()).toBe(true)
  const dropped = ['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive', 'date', 'set-cookie']
  answerHeaders = Object.fromEntries([...reading.headers].filter(([name]) => !dropped.includes(name.toLowerCase())))
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** A mark a mover wrote, in the shape src/shared/data-folder.ts gives, with this test's two folders. */
function aMark(state: TheStateOfAMove, changes: Partial<TheMoveMark> = {}): TheMoveMark {
  return {
    version: 1,
    from: THE_OLD_FOLDER,
    to: THE_NEW_FOLDER,
    database: 'mole-office.db',
    state,
    mover: { pid: 4242, startedAt: '2026-11-20 22:59:00' },
    earlier: [],
    manifest: null,
    says: 'The test wrote this sentence into the mark.',
    at: '2026-11-20 23:00:00',
    ...changes,
  }
}

/** The mark as a reading gives it, with its mover alive. */
function aReadMark(state: TheStateOfAMove, changes: Partial<TheMoveMark> = {}): TheMarkInTheReading {
  return { state: 'read', mark: aMark(state, changes), moverAlive: true }
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

type ACheck = NonNullable<DataFolderReading['wouldRefuse']>

/** A check's answer that refuses the folder with this code and values, with the English the door gives beside them. */
function aRefusedCheck(to: string, code: NonNullable<ACheck['code']>, values: NonNullable<ACheck['values']>): ACheck {
  return { to, why: en.t(`server.${code}` as WordKey, values), code, values }
}

/** A check's answer that lets the folder through. */
function aPassedCheck(to: string): ACheck {
  return { to, why: null, code: null, values: null }
}

/** Why a page on another origin is allowed to send and read the test's answers. */
function theCrossOriginHeaders(request: TheRequest): Record<string, string> {
  const sent = request.headers()
  return {
    'access-control-allow-origin': sent['origin'] ?? app.site,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': sent['access-control-request-headers'] ?? 'content-type',
    vary: 'Origin',
  }
}

/** Answer one of the panel's doors: a preflight, or the body the case gives. */
async function answer(route: Route, status: number, body: () => unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: theCrossOriginHeaders(route.request()) })
    return
  }
  await route.fulfill({ status, headers: answerHeaders, body: JSON.stringify(body()) })
}

/** A window of this test's own at one width, in one language, with the panel open and drawn. */
async function thePanelAt(width: number, routes: (page: Page) => Promise<void>, language: 'en' | 'zh' = 'en'): Promise<Page> {
  const page = await app.context.newPage()
  page.setDefaultTimeout(30_000)
  await page.setViewportSize({ width, height: 1000 })
  await routes(page)
  await page.goto(`${app.site}/?lang=${language}&mode=normal#/settings/datafolder`)
  await waitForThePage(page, 60_000)
  await page.locator(PANEL).waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('.set .px-loading').length === 0, undefined, { timeout: 30_000 })
  return page
}

/** One of the panel's presses, by its word key, in the page's language. */
function press(page: Page, key: WordKey, words = en) {
  return page.locator(PANEL).getByRole('button', { name: words.t(key), exact: true })
}

/** The word keys of the presses the panel draws now, in the order of THE_PRESSES. */
async function thePressesDrawn(page: Page): Promise<string[]> {
  const drawn: string[] = []
  for (const key of THE_PRESSES) if ((await press(page, key).count()) > 0) drawn.push(key)
  return drawn
}

/** Each label of the panel's rows with the text and the element of the path on its row. */
async function theRows(page: Page): Promise<{ label: string; path: string; tag: string }[]> {
  return page.locator(PANEL).evaluate((panel) =>
    [...panel.querySelectorAll('dt')].map((term) => {
      const value = term.nextElementSibling
      const path = value?.firstElementChild ?? null
      return { label: term.textContent ?? '', path: value?.textContent ?? '', tag: path?.tagName ?? 'none' }
    }),
  )
}

/** How a path is drawn: the element that holds exactly this text, its font, and the font a code element has there. */
async function howThePathIsDrawn(page: Page, path: string): Promise<{ tag: string; font: string; codeFont: string }> {
  return page.locator(PANEL).evaluate((panel, text) => {
    const holders = [...panel.querySelectorAll('*')].filter((one) => one.children.length === 0 && one.textContent === text)
    const holder = holders[0]
    const code = document.createElement('code')
    code.textContent = text
    panel.appendChild(code)
    const codeFont = getComputedStyle(code).fontFamily
    code.remove()
    return { tag: holder?.tagName ?? 'none', font: holder === undefined ? 'none' : getComputedStyle(holder).fontFamily, codeFont }
  }, path)
}

/** The font of the sentence that says this text, whole. */
async function theSentencesFont(page: Page, text: string): Promise<string> {
  return page.locator(PANEL).getByText(text, { exact: true }).evaluate((sentence) => getComputedStyle(sentence).fontFamily)
}

for (const width of [1440, 390]) {
  describe(`the data folder panel at ${String(width)} wide`, () => {
    it('shows one press at a time, and the next press only once the step before it is done', async () => {
      const moves: unknown[] = []
      const page = await thePanelAt(width, async (page) => {
        await page.route(READ, (route) => answer(route, 200, () => {
          const asked = new URL(route.request().url()).searchParams.get('to')
          if (asked === null) return aReading()
          return aReading({ wouldRefuse: asked === A_REFUSED_FOLDER ? aRefusedCheck(asked, 'dataFolderPlaceNotEmpty', { to: asked }) : aPassedCheck(asked) })
        }))
        await page.route(MOVE, (route) => answer(route, 409, () => {
          moves.push(route.request().postData())
          return { error: 'This test never moves.' }
        }))
      })
      try {
        const field = page.locator(`${PANEL} input`)
        // THE FIRST STEP: the check alone, before the folder is written and after.
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.check'])
        await field.fill(A_REFUSED_FOLDER)
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.check'])

        // A REFUSED CHECK IS NOT A DONE STEP: the check stays the one press.
        await press(page, 'dataFolder.check').click()
        await page.locator(PANEL).getByText(en.t('dataFolder.check.thisFolderIsRefused'), { exact: true }).waitFor()
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.check'])

        // A CHECK THAT SAYS THE MOVE WOULD GO AHEAD IS THE DONE STEP: the move alone.
        await field.fill(THE_NEW_FOLDER)
        await press(page, 'dataFolder.check').click()
        await page.locator(PANEL).getByText(en.t('dataFolder.check.thisFolderIsFine'), { exact: true }).waitFor()
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.move'])

        // THE MOVE PRESSED: the warning's press with its cancel, and the move gone.
        await press(page, 'dataFolder.move').click()
        await page.locator(PANEL).getByText(en.t('dataFolder.move.warn'), { exact: true }).waitFor()
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.move.sure', 'dataFolder.move.cancel'])

        // THE CANCEL goes back one step, to the move.
        await press(page, 'dataFolder.move.cancel').click()
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.move'])

        // ANOTHER FOLDER HAS NOT BEEN CHECKED: the check comes back, and the move goes.
        await field.fill(`${THE_NEW_FOLDER}-elsewhere`)
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.check'])
        expect(moves, 'a press reached the move door').toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      } finally {
        await page.close()
      }
    }, 120_000)

    it('brings no move for a folder nobody checked, when the field changes while a check is answering', async () => {
      const moves: unknown[] = []
      let theCheckArrived = (): void => {}
      const arrived = new Promise<void>((resolve) => {
        theCheckArrived = resolve
      })
      let letItAnswer = (): void => {}
      const released = new Promise<void>((resolve) => {
        letItAnswer = resolve
      })
      const page = await thePanelAt(width, async (page) => {
        await page.route(READ, async (route) => {
          const asked = new URL(route.request().url()).searchParams.get('to')
          // THE CHECK OF THE FIRST FOLDER IS HELD until the field holds another folder.
          if (asked === THE_NEW_FOLDER && route.request().method() !== 'OPTIONS') {
            theCheckArrived()
            await released
          }
          await answer(route, 200, () => (asked === null ? aReading() : aReading({ wouldRefuse: aPassedCheck(asked) })))
        })
        await page.route(MOVE, (route) => answer(route, 409, () => {
          moves.push(route.request().postData())
          return { error: 'This test never moves.' }
        }))
      })
      try {
        const field = page.locator(`${PANEL} input`)
        const thisFolderIsFine = page.locator(PANEL).getByText(en.t('dataFolder.check.thisFolderIsFine'), { exact: true })
        const aFolderNobodyChecked = `${THE_NEW_FOLDER}-nobody-checked`
        await field.fill(THE_NEW_FOLDER)
        await press(page, 'dataFolder.check').click()
        await arrived

        // THE FIELD CHANGES WHILE THE CHECK IS ANSWERING, and then the answer about the first folder comes.
        await field.fill(aFolderNobodyChecked)
        letItAnswer()
        await expect.poll(() => press(page, 'dataFolder.check').getAttribute('aria-disabled')).toBeNull()

        // THE ANSWER IS NOT ABOUT THE FOLDER IN THE FIELD: it says nothing of this folder, and the check stays the one press.
        expect(await field.inputValue()).toBe(aFolderNobodyChecked)
        expect(await thisFolderIsFine.count()).toBe(0)
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.check'])

        // A CHECK OF THE FOLDER IN THE FIELD is a done step, so the move comes, as it does when nothing changes meanwhile.
        await press(page, 'dataFolder.check').click()
        await thisFolderIsFine.waitFor()
        expect(await thePressesDrawn(page)).toEqual(['dataFolder.move'])
        expect(moves, 'a press reached the move door').toEqual([])
      } finally {
        letItAnswer()
        await page.close()
      }
    }, 120_000)

    it("draws a move's two folders as two rows, From above To, and no sentence holds a path", async () => {
      const page = await thePanelAt(width, async (page) => {
        await page.route(READ, (route) => answer(route, 200, () => aReading({ folder: THE_NEW_FOLDER, chosenBy: 'the .env line', mark: aReadMark('started') })))
      })
      try {
        await press(page, 'dataFolder.confirm').waitFor()
        await page.locator(PANEL).getByText(en.t('dataFolder.lastMove.started'), { exact: true }).waitFor()
        expect((await theRows(page)).map(({ label, path }) => ({ label, path }))).toEqual([
          { label: en.t('dataFolder.row.folder'), path: THE_NEW_FOLDER },
          { label: en.t('dataFolder.row.from'), path: THE_OLD_FOLDER },
          { label: en.t('dataFolder.row.to'), path: THE_NEW_FOLDER },
        ])
        // TWO ROWS: the To row starts below the end of the From row, at this width as at any.
        const where = await page.locator(PANEL).evaluate((panel) => {
          const terms = [...panel.querySelectorAll('dt')]
          const from = terms[1]?.nextElementSibling?.getBoundingClientRect()
          const to = terms[2]?.getBoundingClientRect()
          return { fromBottom: from?.bottom ?? null, toTop: to?.top ?? null }
        })
        expect(where.fromBottom).not.toBeNull()
        expect(where.toTop).not.toBeNull()
        expect(where.toTop!, 'the To row is not below the From row').toBeGreaterThanOrEqual(where.fromBottom! - 1)
        for (const sentence of await page.locator(`${PANEL} p`).allInnerTexts()) {
          expect(sentence, 'a sentence holds the old folder').not.toContain(THE_OLD_FOLDER)
          expect(sentence, 'a sentence holds the new folder').not.toContain(THE_NEW_FOLDER)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      } finally {
        await page.close()
      }
    }, 120_000)

    it("draws each path and file name in the office's code style, and not in the style of the sentence beside it", async () => {
      const kept: DataFolderConfirmed = { removed: [], kept: [A_KEPT_FILE], says: 'The test kept one file.' }
      const page = await thePanelAt(width, async (page) => {
        await page.route(READ, (route) => answer(route, 200, () => aReading({
          folder: THE_NEW_FOLDER,
          chosenBy: 'the .env line',
          mark: aReadMark('started', { earlier: [AN_EARLIER_FOLDER] }),
        })))
        await page.route(CONFIRM, (route) => answer(route, 200, () => kept))
      })
      try {
        await press(page, 'dataFolder.confirm').click()
        await page.locator(PANEL).getByText(en.t('dataFolder.confirmed.kept'), { exact: true }).waitFor()
        const sentence = await theSentencesFont(page, en.t('dataFolder.lastMove.started'))
        for (const row of await theRows(page)) expect(row.tag, `the path under ${row.label}`).toBe('CODE')
        for (const path of [THE_OLD_FOLDER, AN_EARLIER_FOLDER, A_KEPT_FILE]) {
          const drawn = await howThePathIsDrawn(page, path)
          expect(drawn.tag, `${path} is not in a code element`).toBe('CODE')
          expect(drawn.font, `${path} is not in the office's code font`).toBe(drawn.codeFont)
          expect(drawn.font, `${path} is drawn in the sentence's font`).not.toBe(sentence)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      } finally {
        await page.close()
      }
    }, 120_000)
  })
}

/** Check the refused folder in the page's language and answer the sentence under the refusal and its language mark. */
async function theRefusalDrawn(page: Page, words: typeof en): Promise<{ text: string; lang: string | null }> {
  await page.locator(`${PANEL} input`).fill(A_REFUSED_FOLDER)
  await press(page, 'dataFolder.check', words).click()
  await page.locator(PANEL).getByText(words.t('dataFolder.check.thisFolderIsRefused'), { exact: true }).waitFor()
  const why = page.locator(`${PANEL} .dfp-why`)
  return { text: (await why.textContent()) ?? '', lang: await why.getAttribute('lang') }
}

describe('a refused check in the page language', () => {
  const values = { to: A_REFUSED_FOLDER }
  const theRoutes = (check: ACheck) => async (page: Page) => {
    await page.route(READ, (route) => answer(route, 200, () => {
      const asked = new URL(route.request().url()).searchParams.get('to')
      return asked === null ? aReading() : aReading({ wouldRefuse: { ...check, to: asked } })
    }))
  }

  it("draws the English of the check's code on an English page", async () => {
    const page = await thePanelAt(1440, theRoutes(aRefusedCheck(A_REFUSED_FOLDER, 'dataFolderPlaceNotEmpty', values)))
    try {
      const drawn = await theRefusalDrawn(page, en)
      expect(drawn.text).toBe(en.t('server.dataFolderPlaceNotEmpty', values))
      expect(drawn.text).toContain(A_REFUSED_FOLDER)
      expect(drawn.lang).toBeNull()
    } finally {
      await page.close()
    }
  }, 120_000)

  it("draws the Chinese of the check's code with its values on a Chinese page, not marked as English", async () => {
    const page = await thePanelAt(1440, theRoutes(aRefusedCheck(A_REFUSED_FOLDER, 'dataFolderPlaceNotEmpty', values)), 'zh')
    try {
      const drawn = await theRefusalDrawn(page, zh)
      expect(zh.t('server.dataFolderPlaceNotEmpty', values), 'the Chinese list has no sentence of its own').not.toBe(
        en.t('server.dataFolderPlaceNotEmpty', values),
      )
      expect(drawn.text).toBe(zh.t('server.dataFolderPlaceNotEmpty', values))
      expect(drawn.text).toContain(A_REFUSED_FOLDER)
      expect(drawn.lang).toBeNull()
    } finally {
      await page.close()
    }
  }, 120_000)

  it("draws the walk's own English of dataFolderMoveRefused on a Chinese page, marked as English", async () => {
    const why = "EACCES: permission denied, scandir '/srv/made-up/old-data/held'"
    const page = await thePanelAt(1440, theRoutes(aRefusedCheck(A_REFUSED_FOLDER, 'dataFolderMoveRefused', { why })), 'zh')
    try {
      const drawn = await theRefusalDrawn(page, zh)
      expect(drawn.text).toBe(why)
      expect(drawn.lang).toBe('en')
    } finally {
      await page.close()
    }
  }, 120_000)
})
