// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PRESSING "TALK ABOUT SOMETHING" ALWAYS DOES SOMETHING, AND THE CHIP NAMES THE THING PRESSED.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DEFECTS THIS PINS, BOTH READ OFF A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * THE CONTROL MARKED NOTHING AND WAITED. A page can hold nothing that says what it is: on
 * 18 August 2026 the Schedule board held none at all. Pressing the control there changed its name
 * to "Press what you mean", outlined nothing, and swallowed the next press — which came back as a
 * comment about the whole page. Somebody asking to talk about a report row was quietly given the
 * page. docs/UX-CONTRACT.md names this by hand: a capability whose entry point is hidden is not
 * done, and eventually finding that blank space is clickable does not count.
 *
 * So the press asks the page first. With something to mark it marks it. With nothing to mark it
 * opens the box on the page at once, which is the one honest thing that page has to offer, and the
 * control never enters a state that promises a press it cannot answer.
 *
 * THE CHIP READ BACK THE ROW'S CONTROLS, RUN TOGETHER. What the composer says a comment is about is
 * scraped off the drawn row, and `textContent` puts no gap between one element and the next.
 * Measured on the work list: "done导出 240 段 transplant 片段stepMade-up example" — a state word, a
 * title, a kind and a provenance mark with nothing between them. On a plan line it also read out
 * the row's buttons, so the chip named three controls the person had not pointed at.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * The two decisions, as functions over plain values, because the runner has no DOM. What the
 * browser then does with them was driven in Chromium against a scratch database on 18 August 2026:
 * on the Schedule, with 0 addressable elements, the press opened the box saying "Page · Schedule";
 * on Work to do, with 126, it outlined all 126 and waited; and the work row's chip came back as
 * "done 导出 240 段 transplant 片段 step Made-up example".
 */

import { beforeAll, describe, expect, it } from 'vitest'

type Pointing = typeof import('../src/web/components/agent/PointingLayer.tsx')
type Reading = typeof import('../src/web/components/agent/pointing.ts')

let pointing: Pointing
let reading: Reading

beforeAll(async () => {
  // Both modules reach src/web/api.ts, which reads storage as it is imported. Nothing here is
  // under test; it is the smallest stand-in that lets the import finish.
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
  pointing = await import('../src/web/components/agent/PointingLayer.tsx')
  reading = await import('../src/web/components/agent/pointing.ts')
})

// ---------------------------------------------------------------------------- the press

describe('pressing the control in the frame', () => {
  it('marks what can be talked about when the page holds anything at all', () => {
    expect(pointing.whatThePressDoes(false, true)).toBe('mark')
  })

  it('talks about the page itself when the page holds nothing smaller', () => {
    // THE DEAD END, GONE. It used to answer "mark" here: nothing was marked, and the person was
    // left in a state whose only exit was a press that came back as the page anyway.
    expect(pointing.whatThePressDoes(false, false)).toBe('thePage')
  })

  it('puts the marking away when it is already showing, whatever the page holds', () => {
    expect(pointing.whatThePressDoes(true, true)).toBe('stop')
    expect(pointing.whatThePressDoes(true, false)).toBe('stop')
  })
})

describe('what the control calls itself', () => {
  it('says what the next press does, in both states', () => {
    expect(pointing.pointingControlWords(false).name).toBe('Ask agent')
    // "Press what you mean" is a riddle in the two seconds a reader has before deciding the mode
    // is broken; a first-time user cannot guess that pressing anything on the page is now an
    // option. Nit 37 of the language audit, 19 August 2026.
    expect(pointing.pointingControlWords(true).name).toBe('Choose what to talk about')
  })

  it('does not promise to mark things on a page that has none', () => {
    // The description used to say only "Mark everything on this page that can be talked about, then
    // press one of them", which on such a page is a promise the press cannot keep.
    const said = pointing.pointingControlWords(false).description
    expect(said).toContain('the smallest thing to point at')
    expect(said).toContain('it talks about the page')
  })

  it('says how to stop, once it is showing', () => {
    expect(pointing.pointingControlWords(true).description).toContain('Escape')
  })
})

// ---------------------------------------------------------------------------- the chip

describe('what the composer says you pointed at', () => {
  const part = (words: string) => ({ words, control: false })
  const button = (words: string) => ({ words, control: true })

  it('puts a space between pieces that are separate on the screen', () => {
    // "done导出 240 段 transplant 片段stepMade-up example", measured, is this list run together.
    expect(reading.nameFromParts([part('done'), part('导出 240 段 transplant 片段'), part('step')])).toBe(
      'done 导出 240 段 transplant 片段 step',
    )
  })

  it('leaves out the words on the row’s own controls, which nobody pointed at', () => {
    expect(reading.nameFromParts([part('small title 33'), button('+ todo'), button('Open the record')])).toBe(
      'small title 33',
    )
  })

  it('uses the controls when the controls are all there is, rather than saying nothing', () => {
    expect(reading.nameFromParts([button('Open the record'), button('+ todo')])).toBe('Open the record + todo')
  })

  it('is empty only when the thing really holds no words', () => {
    expect(reading.nameFromParts([])).toBe('')
  })
})
