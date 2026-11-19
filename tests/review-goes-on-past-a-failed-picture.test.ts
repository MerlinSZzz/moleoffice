// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * tools/review.mjs goes on past a picture it cannot take (problem Xykek3p-dw2q).
 *
 * On 27 September 2026 Chromium could not capture the records page at 1440 and the browser closed
 * under the tool. Every later picture asked the same dead browser, so none was taken. The walk now
 * closes that browser, starts a fresh one, takes the rest, and names the failed picture at the end.
 *
 * review.mjs starts its whole run when it is loaded, so this reads `photographEach` out of the source
 * and runs it with a stand-in browser. The stand-in dies on one named picture the way the real one
 * did: that capture throws, and every later use of the same browser throws too.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

interface StandInBrowser {
  readonly n: number
  dead: boolean
  closed: boolean
  close(): Promise<void>
}
interface Picture {
  readonly page: { readonly name: string }
  readonly viewport: { readonly width: number }
  readonly theme: string
}
type Walk = (
  hold: { browser: StandInBrowser },
  pictures: readonly Picture[],
  takeOne: (browser: StandInBrowser, picture: Picture) => Promise<void>,
  launch: () => Promise<StandInBrowser>,
  say: (line: string) => void,
) => Promise<{ which: string; error: string }[]>

const source = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')

it('takes every picture after the one the browser could not capture, with a fresh browser, and names the failed one', async () => {
  const text = /async function photographEach\([^]*?\n\}/.exec(source)?.[0]
  expect(text, 'photographEach is missing from tools/review.mjs').toBeDefined()
  const photographEach = runInNewContext(`(${text})`, {}) as Walk

  const launched: StandInBrowser[] = []
  const launch = async (): Promise<StandInBrowser> => {
    const browser: StandInBrowser = {
      n: launched.length + 1,
      dead: false,
      closed: false,
      async close() { this.closed = true },
    }
    launched.push(browser)
    return browser
  }
  const pictures: Picture[] = []
  for (const name of ['home', 'records', 'usage']) {
    for (const width of [1440, 990]) {
      for (const theme of ['light', 'dark']) pictures.push({ page: { name }, viewport: { width }, theme })
    }
  }
  const taken: string[] = []
  const takeOne = async (browser: StandInBrowser, picture: Picture) => {
    if (browser.dead || browser.closed) throw new Error('browser.newContext: Target page, context or browser has been closed')
    const which = `${picture.page.name} ${picture.viewport.width} ${picture.theme}`
    if (which === 'records 1440 light') {
      browser.dead = true
      throw new Error('page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot\nCall log: ...')
    }
    taken.push(`${which} on browser ${browser.n}`)
  }
  const said: string[] = []
  const hold = { browser: await launch() }

  const lost = await photographEach(hold, pictures, takeOne, launch, (line) => said.push(line))

  expect(lost).toEqual([
    {
      which: 'records at 1440px light',
      error: 'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot',
    },
  ])
  // Every other picture was taken, and the ones after the failure on the fresh browser.
  expect(taken).toEqual([
    'home 1440 light on browser 1',
    'home 1440 dark on browser 1',
    'home 990 light on browser 1',
    'home 990 dark on browser 1',
    'records 1440 dark on browser 2',
    'records 990 light on browser 2',
    'records 990 dark on browser 2',
    'usage 1440 light on browser 2',
    'usage 1440 dark on browser 2',
    'usage 990 light on browser 2',
    'usage 990 dark on browser 2',
  ])
  expect(launched).toHaveLength(2)
  expect(launched[0]?.closed, 'the browser that failed was not closed').toBe(true)
  expect(hold.browser, 'the caller is not handed the fresh browser to close at the end').toBe(launched[1])
  expect(said[0]).toBe('FAILED records at 1440px light: page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot')
})

