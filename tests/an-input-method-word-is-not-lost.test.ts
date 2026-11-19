// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD COMMITTED BY AN INPUT METHOD REACHES THE PROGRAM ONCE AND WHOLE, HOWEVER FAST THE NEXT KEY COMES. Wave 13u,
 * round 6.
 *
 * Typed fast through fcitx5's pinyin into the terminal view on 5 October 2026, words were cut, lost or sent twice.
 * The faults are timers in xterm 6.0.0's CompositionHelper that a fast typist overtakes, because Chromium handles
 * waiting keys before waiting timers. src/web/components/TerminalView.tsx's `sendEachCommittedWordOnce` gives the
 * counts, says which three faults, and replaces the two methods that hold them.
 *
 * HOW A FAST TYPIST IS MADE CERTAIN. The test suite has no input method, so this hands xterm's text box the events
 * fcitx5 gave Chromium, in the order recorded that day: a key the input method takes (key "Process", code 229),
 * compositionstart, a compositionupdate and an input for each step of the pinyin, the chosen word, compositionend.
 * Each burst runs inside one task of the page, so no timer of xterm's can run before the next key, which is what a
 * fast typist did by chance. Nothing waits for the shell's echo before the next key, because a person does not.
 *
 * Each case opens a terminal of its own that runs `cat > words` in a folder of its own, and reads what reached the
 * program from that file:
 *
 *   1. Ten words, each followed at once by a digit, and xterm's timers before Enter (changes 1 and 3 of
 *      `sendEachCommittedWordOnce`).
 *   2. Ten words one after another, and Enter at once (changes 1 and 2).
 *   3. Two words, a third typed between their two timers, and Enter (change 2).
 *
 * All three run on the English page and the Chinese page.
 *
 * MUTATION (after a control run; the commit message that added this file has the runs): the line in TerminalView
 * that calls `sendEachCommittedWordOnce` is removed, and all six go red. Change 1 taken out alone turns cases 1 and
 * 2 red; change 2 alone, cases 2 and 3; change 3 alone, case 1. On both pages each time.
 */

import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, stopEverything, until, type HeldTerminal, type Place } from './terminal-holder-stand.ts'

let app: LiveApp | null = null
let place: Place

/** Start liveApp with the place's XDG_CONFIG_HOME, HOME and a UTF-8 LANG, and put the variables back after. */
async function liveAppBesideTheHolder(): Promise<LiveApp> {
  const names = ['XDG_CONFIG_HOME', 'HOME', 'LANG'] as const
  const was = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  process.env['XDG_CONFIG_HOME'] = place.config
  process.env['HOME'] = place.home
  process.env['LANG'] = 'C.UTF-8'
  try {
    return await liveApp({ name: 'input-method', viewport: { width: 1000, height: 800 }, database: place.database })
  } finally {
    for (const name of names) {
      if (was[name] === undefined) delete process.env[name]
      else process.env[name] = was[name]
    }
  }
}

beforeAll(async () => {
  place = aPlace('im')
  await startAHolder(place)
  app = await liveAppBesideTheHolder()
}, 240_000)

afterAll(async () => {
  try {
    await app?.stop()
  } finally {
    await stopEverything()
  }
}, 90_000)

/**
 * One step a person's typing gives xterm's text box: a key the input method takes, a word composed from its pinyin,
 * a key the input method lets through (a digit or Enter), or the end of the page's task, after which every timer
 * already set runs before the next step. `meanwhile` sets a timer of its own at that point, which gives its steps in a
 * later task, after the timers set before it and before those set after it, while the steps after it go on at once.
 */
type Step =
  | { kind: 'taken' }
  | { kind: 'word'; pinyin: string[]; word: string }
  | { kind: 'key'; key: string; code: string; keyCode: number }
  | { kind: 'timers' }
  | { kind: 'meanwhile'; steps: Step[] }

/** The steps fcitx5's pinyin gave for 中文 on 5 October 2026: z, zh, zh o, zhon, zhong, zhong w, zhong w e, zhong wen. */
const ZHONGWEN: Step = { kind: 'word', pinyin: ['z', 'zh', 'zh o', 'zhon', 'zhong', 'zhong w', 'zhong w e', 'zhong wen'], word: '中文' }
const aDigit = (n: number): Step => ({ kind: 'key', key: String(n), code: `Digit${String(n)}`, keyCode: 48 + n })
const ENTER: Step = { kind: 'key', key: 'Enter', code: 'Enter', keyCode: 13 }

/** Open a terminal running `cat > words` in a folder of its own, and answer the folder. */
async function aTerminalThatKeepsWhatItIsSent(name: string): Promise<string> {
  if (app === null) throw new Error('No app.')
  const folder = join(place.dir, name)
  mkdirSync(folder)
  const opened = await ask(app.api, '/api/terminals', {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: { folder, command: '/bin/sh', args: ['-c', 'cat > words'] },
  })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  groups.add((opened.body['terminal'] as HeldTerminal).pid)
  return folder
}

/** Open that terminal's view on the page in `lang`, and give its text box the steps; answer what reached `cat`. */
async function typeInto(folder: string, lang: 'en' | 'zh', steps: Step[]): Promise<string> {
  if (app === null) throw new Error('No app.')
  const { page } = app
  await page.goto('about:blank')
  await page.goto(`${app.site}/?mode=inspect${lang === 'zh' ? '&lang=zh' : ''}#/terminals`, { waitUntil: 'domcontentloaded' })
  await waitForThePage(page)
  await page.locator('.tm-row').filter({ hasText: folder }).locator('.tm-row-press').click()
  await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
  expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang)
  await page.locator('.tm-view-screen').click()
  await page.evaluate(async (all: Step[]) => {
    const box = document.querySelector<HTMLTextAreaElement>('.tm-view .xterm-helper-textarea')
    if (box === null) throw new Error('The terminal view has no text box.')
    /** A keydown with the key code a real one carries, which a made event cannot be given any other way. */
    const aKey = (key: string, code: string, keyCode: number): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
      Object.defineProperty(event, 'keyCode', { get: () => keyCode })
      Object.defineProperty(event, 'which', { get: () => keyCode })
      return event
    }
    const run = (steps: Step[], done: () => void): void => {
      for (let at = 0; at < steps.length; at++) {
        const step = steps[at]!
        if (step.kind === 'timers') {
          setTimeout(() => run(steps.slice(at + 1), done), 0)
          return
        }
        if (step.kind === 'meanwhile') setTimeout(() => run(step.steps, () => undefined), 0)
        else if (step.kind === 'taken') box.dispatchEvent(aKey('Process', '', 229))
        else if (step.kind === 'key') box.dispatchEvent(aKey(step.key, step.code, step.keyCode))
        else {
          const before = box.value
          box.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }))
          for (const text of [...step.pinyin, step.word]) {
            box.dispatchEvent(new CompositionEvent('compositionupdate', { data: text, bubbles: true }))
            box.value = before + text
            box.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertCompositionText', isComposing: true, bubbles: true }))
          }
          box.dispatchEvent(new CompositionEvent('compositionend', { data: step.word, bubbles: true }))
        }
      }
      done()
    }
    await new Promise<void>((done) => run(all, done))
  }, steps)
  // WHAT REACHED THE PROGRAM, once its line has come: cat writes each line as the terminal hands it over.
  const words = join(folder, 'words')
  const line = await until(() => (existsSync(words) ? readFileSync(words, 'utf8') : ''), (text) => text.endsWith('\n'), 15_000)
  return line
}

/**
 * Ten words, each followed at once by the next digit; then, before Enter, every timer of xterm's still waiting runs,
 * as it does when a person stops before pressing Enter. (Enter empties xterm's text box, so a timer that runs after
 * it finds nothing to send twice.)
 */
const WORDS_THEN_DIGITS: Step[] = [...Array.from({ length: 10 }, (_, n) => [{ kind: 'taken' } as Step, ZHONGWEN, aDigit(n)]).flat(), { kind: 'timers' }, ENTER]
/** Ten words one after another, then Enter. */
const WORDS_ONE_AFTER_ANOTHER: Step[] = [...Array.from({ length: 10 }, () => [{ kind: 'taken' } as Step, ZHONGWEN]).flat(), ENTER]
/**
 * Two words in one task. The first word's timer runs after both and sends both; then a third word is typed, in the
 * task `meanwhile` set between the first word's timer and the second's; then the second word's timer runs, held back
 * past the third compositionend as a fast typist held it. Then Enter.
 */
const A_TIMER_HELD_BACK: Step[] = [
  { kind: 'taken' },
  ZHONGWEN,
  { kind: 'meanwhile', steps: [{ kind: 'taken' }, ZHONGWEN] },
  { kind: 'taken' },
  ZHONGWEN,
  { kind: 'timers' },
  ENTER,
]

for (const lang of ['en', 'zh'] as const) {
  describe(`typed fast on the ${lang === 'en' ? 'English' : 'Chinese'} page`, () => {
    it('1. ten words, each followed at once by a digit, reach the program whole, once and in order', async () => {
      const folder = await aTerminalThatKeepsWhatItIsSent(`digits-${lang}`)
      expect(await typeInto(folder, lang, WORDS_THEN_DIGITS)).toBe(`${Array.from({ length: 10 }, (_, n) => `中文${String(n)}`).join('')}\n`)
    }, 60_000)

    it('2. ten words typed one after another reach the program once each', async () => {
      const folder = await aTerminalThatKeepsWhatItIsSent(`words-${lang}`)
      expect(await typeInto(folder, lang, WORDS_ONE_AFTER_ANOTHER)).toBe(`${'中文'.repeat(10)}\n`)
    }, 60_000)

    it('3. a word whose timer is held back past the next word is not sent again', async () => {
      const folder = await aTerminalThatKeepsWhatItIsSent(`held-${lang}`)
      expect(await typeInto(folder, lang, A_TIMER_HELD_BACK)).toBe(`${'中文'.repeat(3)}\n`)
    }, 60_000)
  })
}
