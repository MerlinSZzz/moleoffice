// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WEB PAGE'S BRIDGE ANSWERS ONLY THE OFFICE PAGE, AND CHECKS EVERY ARGUMENT (wave 13t, package OT-B).
 *
 * The office page reaches the window's web page through a bridge: src/desktop/preload.cjs gives it, and
 * src/desktop/main.mjs answers it. The checks are in src/desktop/the-web-page.mjs, so this test calls them with
 * stand-in events and arguments:
 *
 *   1. a call is answered only from the window's own contents, its main frame, on the office's own origin;
 *   2. what the office page asks to open is an address the page may go to, in one of the three places;
 *   3. the rectangle it asks for is in the window, in the window's own pixels;
 *   4. a download's answer is an id and a yes or a no;
 *   5. the page kept for the next start is checked again as it is read, and holds only its address and place;
 *   6. the preload, run with a stand-in Electron, gives the bridge only on the office's own origin, and the bridge
 *      passes on nothing but what each call is for;
 *   7. main.mjs asks the sender check first in every handler of the bridge, and asks the module's check of every
 *      argument it takes.
 */

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import {
  THE_KEPT_PAGES_FILE,
  THE_PLACES,
  fromTheOfficePage,
  theDownloadAnswerAsked,
  theKeptPage,
  theKeptPagesText,
  theOpeningAsked,
  thePlaceAsked,
  theRectangleAsked,
} from '../src/desktop/the-web-page.mjs'

/** A made-up office address, as the window has it. */
const OFFICE = 'http://127.0.0.1:28787'
const MAIN = readFileSync(new URL('../src/desktop/main.mjs', import.meta.url), 'utf8')
const PRELOAD = readFileSync(new URL('../src/desktop/preload.cjs', import.meta.url), 'utf8')

/** The window's own contents, stood in: its main frame is the fourth process's first frame. */
const theOfficesContents = { mainFrame: { processId: 4, routingId: 1 } }
const theOfficesFrame = (url = `${OFFICE}/?lang=en#/r/made-up`) => ({ url, parent: null, processId: 4, routingId: 1 })
/** An ipcMain event from the office page's main frame, with any part of it changed. */
const anEvent = (changed: Partial<{ sender: unknown; senderFrame: ReturnType<typeof theOfficesFrame> | { url: string; parent: unknown; processId: number; routingId: number } | null }> = {}) => ({
  sender: theOfficesContents,
  senderFrame: theOfficesFrame(),
  ...changed,
})

describe('1. a call from the office page', () => {
  it('is answered from the window’s own contents, its main frame, on the office’s own origin', () => {
    expect(fromTheOfficePage(anEvent(), theOfficesContents, OFFICE)).toBe(true)
    expect(fromTheOfficePage(anEvent({ senderFrame: theOfficesFrame(`${OFFICE}/`) }), theOfficesContents, `${OFFICE}/`)).toBe(true)
  })

  it('is refused from any other contents, the web page’s view among them', () => {
    const theWebPagesView = { mainFrame: { processId: 4, routingId: 1 } }
    expect(fromTheOfficePage(anEvent({ sender: theWebPagesView }), theOfficesContents, OFFICE)).toBe(false)
    expect(fromTheOfficePage(anEvent({ sender: null }), theOfficesContents, OFFICE)).toBe(false)
  })

  it('is refused from a frame inside the office page, and from a frame that is not the main one', () => {
    const inside = { url: `${OFFICE}/inside`, parent: theOfficesFrame(), processId: 4, routingId: 2 }
    expect(fromTheOfficePage(anEvent({ senderFrame: inside }), theOfficesContents, OFFICE)).toBe(false)
    expect(fromTheOfficePage(anEvent({ senderFrame: { ...theOfficesFrame(), routingId: 2 } }), theOfficesContents, OFFICE)).toBe(false)
    expect(fromTheOfficePage(anEvent({ senderFrame: { ...theOfficesFrame(), processId: 5 } }), theOfficesContents, OFFICE)).toBe(false)
    expect(fromTheOfficePage(anEvent({ senderFrame: null }), theOfficesContents, OFFICE), 'a frame already gone').toBe(false)
  })

  it('is refused from any other origin, in the main frame of the window’s own contents', () => {
    for (const url of ['https://example.com/', 'http://127.0.0.1:28788/', 'http://localhost:28787/', 'https://127.0.0.1:28787/', 'file:///made-up/check.html', 'about:blank', '']) {
      expect(fromTheOfficePage(anEvent({ senderFrame: theOfficesFrame(url) }), theOfficesContents, OFFICE), url).toBe(false)
    }
  })

  it('is refused while the window has no contents or no office address', () => {
    expect(fromTheOfficePage(anEvent(), null, OFFICE)).toBe(false)
    expect(fromTheOfficePage(anEvent(), theOfficesContents, null)).toBe(false)
    expect(fromTheOfficePage(anEvent(), theOfficesContents, 'not an address')).toBe(false)
  })
})

describe('2. what the office page asks to open', () => {
  it('is an address the page may go to, in one of the three places, and nothing else of what was sent', () => {
    for (const place of THE_PLACES) {
      expect(theOpeningAsked({ address: 'https://example.com', place }, OFFICE)).toEqual({ address: 'https://example.com/', place })
    }
    expect(theOpeningAsked({ address: 'https://example.com/', place: 'left', preload: '/made-up/preload.js' }, OFFICE)).toEqual({ address: 'https://example.com/', place: 'left' })
  })

  it('is refused when it is not an object holding an address and a place', () => {
    for (const asked of [null, undefined, 'https://example.com/', 5, [], {}, { address: 'https://example.com/' }, { place: 'body' }, { address: 5, place: 'body' }, { address: new URL('https://example.com/'), place: 'body' }]) {
      expect(theOpeningAsked(asked, OFFICE), JSON.stringify(asked) ?? String(asked)).toBeNull()
    }
  })

  it('is refused in a place that is not one of the three', () => {
    for (const place of ['top', 'BODY', '', 'body ', 0, null, '__proto__']) {
      expect(theOpeningAsked({ address: 'https://example.com/', place }, OFFICE), String(place)).toBeNull()
      expect(thePlaceAsked(place), String(place)).toBeNull()
    }
    for (const place of THE_PLACES) expect(thePlaceAsked(place)).toBe(place)
  })

  it('is refused for an address the page may not go to', () => {
    for (const address of [`${OFFICE}/`, 'http://localhost:3000/', 'http://[::1]/', 'file:///etc/hosts', 'javascript:alert(1)', 'ws://example.com/socket', 'example.com', 'not an address']) {
      expect(theOpeningAsked({ address, place: 'body' }, OFFICE), address).toBeNull()
    }
  })

  it('is refused for an address longer than 8192 characters', () => {
    const head = 'https://example.com/'
    expect(theOpeningAsked({ address: head + 'a'.repeat(8192 - head.length), place: 'body' }, OFFICE)).not.toBeNull()
    expect(theOpeningAsked({ address: head + 'a'.repeat(8193 - head.length), place: 'body' }, OFFICE)).toBeNull()
  })
})

describe('3. the rectangle the office page asks for', () => {
  const window = { width: 1440, height: 900, zoom: 1 }

  it('is taken in the window’s own pixels, which are the page’s times its zoom', () => {
    expect(theRectangleAsked({ x: 240, y: 0, width: 600, height: 900 }, window)).toEqual({ x: 240, y: 0, width: 600, height: 900 })
    expect(theRectangleAsked({ x: 100, y: 10, width: 200, height: 300 }, { ...window, zoom: 1.5 })).toEqual({ x: 150, y: 15, width: 300, height: 450 })
    expect(theRectangleAsked({ x: 100.4, y: 0, width: 500, height: 1000 }, { ...window, zoom: 0.8 })).toEqual({ x: 80, y: 0, width: 400, height: 800 })
  })

  it('allows a pixel over each edge for the rounding, and clips it', () => {
    expect(theRectangleAsked({ x: -0.6, y: 0, width: 1441, height: 900.4 }, window)).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
    expect(theRectangleAsked({ x: 840, y: 0, width: 601, height: 900 }, window)).toEqual({ x: 840, y: 0, width: 600, height: 900 })
  })

  it('is refused outside the window, empty, or not four finite numbers', () => {
    for (const asked of [
      { x: 840, y: 0, width: 602, height: 900 },
      { x: -2, y: 0, width: 600, height: 900 },
      { x: 0, y: -2, width: 600, height: 900 },
      { x: 0, y: 0, width: 600, height: 902 },
      { x: 0, y: 0, width: 0, height: 900 },
      { x: 0, y: 0, width: 0.4, height: 900 },
      { x: 0, y: 0, width: 600, height: -10 },
      { x: Number.NaN, y: 0, width: 600, height: 900 },
      { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 900 },
      { x: '0', y: 0, width: 600, height: 900 },
      { x: 0, y: 0, width: 600 },
      null,
      undefined,
      [0, 0, 600, 900],
    ]) {
      expect(theRectangleAsked(asked, window), JSON.stringify(asked) ?? String(asked)).toBeNull()
    }
  })
})

describe('4. a download’s answer', () => {
  it('is a whole number id and a yes or a no, and nothing else of what was sent', () => {
    expect(theDownloadAnswerAsked({ id: 1, save: true })).toEqual({ id: 1, save: true })
    expect(theDownloadAnswerAsked({ id: 2, save: false })).toEqual({ id: 2, save: false })
    expect(theDownloadAnswerAsked({ id: 1, save: true, path: '/made-up/elsewhere' })).toEqual({ id: 1, save: true })
  })

  it('is refused in any other shape', () => {
    for (const answer of [null, undefined, true, 1, { id: '1', save: true }, { id: 1.5, save: true }, { id: Number.NaN, save: true }, { id: 1, save: 'yes' }, { id: 1 }, { save: true }]) {
      expect(theDownloadAnswerAsked(answer), JSON.stringify(answer) ?? String(answer)).toBeNull()
    }
  })
})

describe('5. the page kept for the next start', () => {
  it('is a file of its own name in the window’s own data folder', () => {
    expect(THE_KEPT_PAGES_FILE).toMatch(/^[a-z-]+\.json$/)
    expect(MAIN).toContain("const theKeptPagesPath = () => join(app.getPath('userData'), THE_KEPT_PAGES_FILE)")
  })

  it('holds only the address and the place, and reads back as it was kept', () => {
    const page = { address: 'https://example.com/a', place: 'left' as const, title: 'A made-up title', bounds: { x: 0, y: 0, width: 10, height: 10 } }
    const text = theKeptPagesText(page)
    expect(JSON.parse(text)).toEqual({ address: 'https://example.com/a', place: 'left' })
    expect(text.endsWith('\n')).toBe(true)
    expect(theKeptPage(text, OFFICE)).toEqual({ address: 'https://example.com/a', place: 'left' })
  })

  it('opens nothing when there is no file, the file is not a page, or the rules refuse its page now', () => {
    expect(theKeptPage(null, OFFICE)).toBeNull()
    for (const text of ['', 'not json', '[]', '"https://example.com/"', '{"address":"https://example.com/","place":"top"}', `{"address":"${OFFICE}/","place":"body"}`, '{"address":"file:///etc/hosts","place":"body"}']) {
      expect(theKeptPage(text, OFFICE), text).toBeNull()
    }
    const kept = theKeptPagesText({ address: 'http://192.168.1.20:28787/', place: 'body' })
    expect(theKeptPage(kept, OFFICE), 'another office’s page is kept').not.toBeNull()
    expect(theKeptPage(kept, 'http://192.168.1.20:28787'), 'the same page, now the office’s own').toBeNull()
  })
})

type AnApi = Record<string, (...args: unknown[]) => unknown>

/** Run the preload on a page, with a stand-in Electron whose main process answers the office's origin as `answered`. */
function thePreloadOn(page: { protocol: string; origin: string }, answered: unknown) {
  const exposed: Record<string, AnApi> = {}
  const asked: string[] = []
  const invoked: unknown[][] = []
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>()
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, api: AnApi) => { exposed[name] = api } },
    ipcRenderer: {
      sendSync: (channel: string) => {
        asked.push(channel)
        return answered
      },
      invoke: (channel: string, ...args: unknown[]) => {
        invoked.push([channel, ...args])
        return Promise.resolve(`the answer to ${channel}`)
      },
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => { listeners.set(channel, listener) },
    },
  }
  const require = (name: string) => {
    if (name !== 'electron') throw new Error(`the preload asked for ${name}`)
    return electron
  }
  runInNewContext(PRELOAD, { require, window: { location: page } }, { filename: 'preload.cjs' })
  return { exposed, asked, invoked, listeners }
}

const THE_OFFICE_PAGE = { protocol: 'http:', origin: OFFICE }
const THE_BRIDGES_CALLS = ['answerDownload', 'back', 'close', 'forward', 'hide', 'onChange', 'open', 'openHttpsOutside', 'openOutside', 'place', 'read', 'reload', 'show']

describe('6. the preload', () => {
  it('gives the window’s check page only its check, and asks nothing of the office', () => {
    const { exposed, asked } = thePreloadOn({ protocol: 'file:', origin: 'null' }, OFFICE)
    expect(Object.keys(exposed)).toEqual(['theWindowsCheck'])
    expect(asked).toEqual([])
  })

  it('gives the office page only the web page’s bridge, on the office’s own origin', () => {
    const { exposed, asked } = thePreloadOn(THE_OFFICE_PAGE, OFFICE)
    expect(asked).toEqual(['the-offices-origin'])
    expect(Object.keys(exposed)).toEqual(['theWindowsWebPage'])
    expect(Object.keys(exposed['theWindowsWebPage'] ?? {}).sort()).toEqual(THE_BRIDGES_CALLS)
  })

  it('gives a page on any other origin nothing, and a page the window names no origin for nothing', () => {
    for (const [page, answered] of [
      [{ protocol: 'https:', origin: 'https://example.com' }, OFFICE],
      [{ protocol: 'http:', origin: 'http://127.0.0.1:28788' }, OFFICE],
      [{ protocol: 'https:', origin: 'https://127.0.0.1:28787' }, OFFICE],
      [THE_OFFICE_PAGE, null],
      [THE_OFFICE_PAGE, undefined],
      [THE_OFFICE_PAGE, { origin: OFFICE }],
    ] as const) {
      expect(thePreloadOn(page, answered).exposed, `${page.origin}, the window answering ${String(answered)}`).toEqual({})
    }
  })

  it('passes on only what each call is for: an address, a rectangle or an answer, and nothing for the rest', async () => {
    const { exposed, invoked } = thePreloadOn(THE_OFFICE_PAGE, OFFICE)
    const bridge = exposed['theWindowsWebPage']
    if (bridge === undefined) throw new Error('the office page was given no bridge')
    const asked = { address: 'https://example.com/', place: 'right' }
    const box = { x: 1, y: 2, width: 3, height: 4 }
    const answer = { id: 1, save: true }
    expect(await bridge['read']?.('more')).toBe('the answer to the-web-page')
    await bridge['open']?.(asked, 'more')
    await bridge['place']?.(box, 'more')
    for (const call of ['hide', 'show', 'back', 'forward', 'reload', 'close']) await bridge[call]?.('more')
    await bridge['openOutside']?.('https://example.com/elsewhere')
    await bridge['openHttpsOutside']?.('https://example.com/sign-in', 'more')
    await bridge['answerDownload']?.(answer, 'more')
    expect(invoked).toEqual([
      ['the-web-page'],
      ['web-page-open', asked],
      ['web-page-place', box],
      ['web-page-hide'],
      ['web-page-show'],
      ['web-page-back'],
      ['web-page-forward'],
      ['web-page-reload'],
      ['web-page-close'],
      ['web-page-outside'],
      ['web-page-https', 'https://example.com/sign-in'],
      ['web-page-download', answer],
    ])
  })

  it('hands the office page the window’s state alone, not the event it came in', () => {
    const { exposed, listeners } = thePreloadOn(THE_OFFICE_PAGE, OFFICE)
    const heard: unknown[][] = []
    exposed['theWindowsWebPage']?.['onChange']?.((...args: unknown[]) => { heard.push(args) })
    const changed = listeners.get('the-web-page-changed')
    if (changed === undefined) throw new Error('the bridge does not listen for the window’s changes')
    changed({ sender: 'a made-up event' }, { open: false, said: null, asked: null })
    expect(heard).toEqual([[{ open: false, said: null, asked: null }]])
  })
})

/** The part of main.mjs from `function name(` to the end of that function. */
function theFunction(name: string): string {
  const start = MAIN.indexOf(`\nfunction ${name}(`)
  if (start < 0) throw new Error(`main.mjs has no function ${name}`)
  return MAIN.slice(start, MAIN.indexOf('\n}\n', start) + 2)
}

/** Each of the bridge's handlers in main.mjs: its channel, what it takes, and the first line of its body. */
function theBridgesHandlers() {
  const code = theFunction('giveTheOfficePageItsBridge')
  const looped = [...code.matchAll(/\['(web-page-[a-z]+)', (?:true|false)\]/g)].map((one) => one[1] ?? '')
  return [...code.matchAll(/ipcMain\.handle\((?:'([a-z-]+)'|channel), (?:async )?\(event(?:, ([a-z]+))?\) => \{\n *(.*)\n/g)].flatMap((one) => {
    const handler = { takes: one[2] ?? null, first: one[3] ?? '' }
    return one[1] === undefined ? looped.map((channel) => ({ channel, ...handler })) : [{ channel: one[1], ...handler }]
  })
}

describe('7. main.mjs', () => {
  it('answers every call the preload makes, and asks the sender check before anything else in each', async () => {
    const { exposed, invoked } = thePreloadOn(THE_OFFICE_PAGE, OFFICE)
    for (const call of THE_BRIDGES_CALLS) if (call !== 'onChange') await exposed['theWindowsWebPage']?.[call]?.({})
    const handlers = theBridgesHandlers()
    expect(handlers.map((one) => one.channel).sort()).toEqual(invoked.map((one) => String(one[0])).sort())
    for (const { channel, first } of handlers) expect(first, channel).toMatch(/^if \(!fromTheOffice\(event\)(\)| \|\|)/)
    expect(theFunction('giveTheOfficePageItsBridge')).toContain('const fromTheOffice = (event) => fromTheOfficePage(event, theWindow?.webContents ?? null, theOfficeAddress)')
  })

  it('answers no call of the bridge anywhere else', () => {
    const everywhere = MAIN.match(/ipcMain\.handle\('(?:the-web-page|web-page-[a-z]+)'/g) ?? []
    const inTheBridge = theFunction('giveTheOfficePageItsBridge').match(/ipcMain\.handle\('(?:the-web-page|web-page-[a-z]+)'/g) ?? []
    expect(everywhere).toEqual(inTheBridge)
    expect(MAIN.match(/^\s*giveTheOfficePageItsBridge\(\)$/gm), 'the bridge is given once').toHaveLength(1)
  })

  it('asks the module’s check of every argument a handler takes', () => {
    const takes = theBridgesHandlers().filter((one) => one.takes !== null)
    expect(takes.map((one) => one.channel).sort()).toEqual(['web-page-download', 'web-page-https', 'web-page-open', 'web-page-place'])
    const code = theFunction('giveTheOfficePageItsBridge')
    expect(code).toContain('theOpeningAsked(asked, theOfficeAddress)')
    expect(code).toContain('theRectangleAsked(asked, {')
    expect(code).toContain('theDownloadAnswerAsked(asked)')
    expect(code).toContain('theHttpsAddressAsked(asked)')
    for (const { channel, takes: name } of takes) expect(name, channel).toBe('asked')
  })

  it('gives the office’s origin only to the window’s own contents', () => {
    expect(theFunction('giveTheOfficePageItsBridge')).toMatch(
      /ipcMain\.on\('the-offices-origin', \(event\) => \{\n *event\.returnValue = theWindow !== null && event\.sender === theWindow\.webContents && theOfficeAddress !== null \? new URL\(theOfficeAddress\)\.origin : null\n/,
    )
  })

  it('makes the view with the module’s preferences alone, puts its rules on before it loads, and keeps the question on top', () => {
    const open = theFunction('openTheWebPage')
    expect(open).toContain('new WebContentsView({ webPreferences: theWebPagesPreferences() })')
    const loads = open.indexOf('void contents.loadURL(address)')
    expect(loads).toBeGreaterThan(0)
    expect(open.indexOf('keepTheWebPagesSessionOut(contents.session)')).toBeGreaterThan(0)
    expect(open.indexOf('keepTheWebPagesSessionOut(contents.session)')).toBeLessThan(loads)
    expect(open.indexOf('keepTheContentsOut({ contents,')).toBeGreaterThan(0)
    expect(open.indexOf('keepTheContentsOut({ contents,')).toBeLessThan(loads)
    const added = open.indexOf('theWindow.contentView.addChildView(view)')
    expect(added).toBeGreaterThan(0)
    expect(open.indexOf('if (theQuestion !== null) theWindow.contentView.addChildView(theQuestion)')).toBeGreaterThan(added)
    expect(theFunction('keepTheWebPagesSessionOut')).toContain('userAgent: withoutTheWindowsMarks(app.userAgentFallback),')
  })
})
