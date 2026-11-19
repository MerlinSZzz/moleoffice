// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW LOADS ONE PAGE AT A TIME, SO ITS OWN LOADS NEVER STOP EACH OTHER (wave 13t, round 25, problem
 * Pc5buYWGRfzy).
 *
 * The Mac agent saw the installed window log an unhandled ERR_ABORTED (-3) naming both the office's address and
 * check.html, and a later start stay on "Opening it". The cause, in src/desktop/main.mjs: the check page's load
 * was scheduled and began just after the office's, and in Electron a new load stops the one under way. Every load
 * now waits its turn in src/desktop/one-load-at-a-time.mjs, which this test drives with a fake window that does
 * what Electron does: a load started while another is under way stops that one with ERR_ABORTED.
 *
 * WHAT IS PROVED:
 *   1. the start's order, the check page asked for and then the office straight after, ends on the office, and
 *      no load fails; the same order without the queue ends on the check page with the office's load aborted,
 *      which is the Mac agent's report;
 *   2. a load that fails anyway is said in words and handed back to its caller, and the loads after it still run.
 *
 * MUTATION, in the commit message: in oneLoadAtATime, start `load` at once (`Promise.resolve().then(load)`)
 * instead of after `theLastLoad`. Part 1 fails: the window ends on the check page.
 */
import { describe, expect, it } from 'vitest'

import { oneLoadAtATime } from '../src/desktop/one-load-at-a-time.mjs'

/** A window that loads as Electron's does: a load takes a moment, and a new load stops the one under way. */
function aFakeWindow() {
  let shows = ''
  let underWay: { url: string; refuse: (err: Error) => void } | null = null
  return {
    shows: () => shows,
    load(url: string): Promise<void> {
      underWay?.refuse(new Error(`ERR_ABORTED (-3) loading '${underWay.url}'`))
      return new Promise<void>((resolve, reject) => {
        const mine = { url, refuse: reject }
        underWay = mine
        setTimeout(() => {
          if (underWay !== mine) return
          underWay = null
          shows = url
          resolve()
        }, 5)
      })
    },
  }
}

describe('the window loads one page at a time', () => {
  it('ends on the office when the check page and then the office are asked for at once', async () => {
    const window = aFakeWindow()
    const said: string[] = []
    const loadInTurn = oneLoadAtATime((one) => said.push(one))
    const check = loadInTurn('the check page', () => window.load('file:///check.html'))
    const office = loadInTurn('the office', () => window.load('http://127.0.0.1:8787/'))
    expect(await check).toBeNull()
    expect(await office).toBeNull()
    expect(window.shows()).toBe('http://127.0.0.1:8787/')
    expect(said).toEqual([])
  })

  it('is what went wrong without the queue: the office is aborted and the window stays on the check page', async () => {
    const window = aFakeWindow()
    const office = window.load('http://127.0.0.1:8787/')
    const check = window.load('file:///check.html')
    await expect(office).rejects.toThrow('ERR_ABORTED (-3)')
    await check
    expect(window.shows()).toBe('file:///check.html')
  })

  it('says a failed load in words, hands it back, and runs the loads after it', async () => {
    const window = aFakeWindow()
    const said: string[] = []
    const loadInTurn = oneLoadAtATime((one) => said.push(one))
    const office = loadInTurn('the office', () => Promise.reject(new Error('ERR_CONNECTION_REFUSED (-102)')))
    const check = loadInTurn('the check page', () => window.load('file:///check.html'))
    expect(await office).toBe('ERR_CONNECTION_REFUSED (-102)')
    expect(await check).toBeNull()
    expect(said).toEqual(['The window could not load the office: ERR_CONNECTION_REFUSED (-102)'])
    expect(window.shows()).toBe('file:///check.html')
  })
})
