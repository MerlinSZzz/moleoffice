// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER A SWITCH OF WHOM THE PAGE WRITES AS, ITS WORDS CHANGE LANGUAGE ONCE: WHEN THE READING THE SWITCH STARTED ANSWERS.
 *
 * src/web/lib/language.ts reads the language of the person the page writes as, and reads it again each time the page
 * switches whom it writes as (`setActor` in src/web/api.ts, which the writer switch in the settings calls). Until wave
 * 13y round 82 the reading began by putting the browser's language on the page, which is a guess, and then the
 * answer's. So a person who chose Chinese and switched to writing as Mole Office saw the page drawn in English before
 * the reading had answered. Now the page keeps the language it is drawn in while the reading is on its way, and the
 * reading says it is reading. The first language drawn after the switch is the answer's. Where the reading ends is
 * unchanged: a writer who is not a person gets the browser's language, and the person gets their choice.
 *
 * HOW THIS FILE HOLDS THE READING. It holds the page's request for the participants, looks at the page, and then lets
 * the request go. Its page draws one probe, which redraws when the writer changes, as the app does, and shows one word,
 * the reading's state and the writer. The probe keeps every word it drew, so the case can say which words were drawn
 * before the answer and which after.
 *
 * MUTATION PROOF (after a green control), in src/web/lib/language.ts: put the browser's language back on the page when
 * a reading begins (`...languageForPage(address, null, browser)` in the first `announce` of `readLanguage`). The case is
 * red: while the reading is held, the probe is drawn in English.
 */

import { bundlePageCode } from './a-bundle-of-page-code.ts'
import type { Route } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICE_ID } from './a-page-of-a-test-office.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const KEY = 'nav.writerChoice'
const ENGLISH = theWordAPageDraws('en', KEY)!
const CHINESE = theWordAPageDraws('zh', KEY)!
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let app: LiveApp
let bundle: string
const errors: string[] = []
/** While true, the page's requests for the participants wait in `held` until the case lets them go. */
let holding = false
const held: (() => void)[] = []

interface Drawn { word: string; status: string; writer: string }
interface ThePage { word: string; status: string; lang: string; drawn: Drawn[] }

beforeAll(async () => {
  app = await liveApp({ name: 'switch-language', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const chosen = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ language: 'zh' }) })
  expect(chosen.status, await chosen.clone().text()).toBe(200)
  expect(ENGLISH).not.toBe(CHINESE)
  const result = await bundlePageCode({
    stdin: { resolveDir: process.cwd(), sourcefile: 'switch-proof.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
      import React, {useSyncExternalStore} from 'react';
      import {createRoot} from 'react-dom/client';
      import {theApiIsOnPort} from './src/web/lib/api-address.ts';
      theApiIsOnPort(${app.apiPort});
      const {setWorkspace} = await import('./src/web/lib/workspace.ts');
      const {setActor, getActor, subscribeActor} = await import('./src/web/api.ts');
      const {readLanguage, useLanguage} = await import('./src/web/lib/language.ts');
      const {t} = await import('./src/shared/i18n.ts');
      setWorkspace('default');
      setActor({type:'human',id:${JSON.stringify(THE_PERSON)}});
      await readLanguage();
      const drawn = [];
      function Probe() {
        const writer = useSyncExternalStore(subscribeActor, getActor, getActor);
        const reading = useLanguage();
        const word = t(${JSON.stringify(KEY)});
        drawn.push({word, status: reading.status, writer: writer.type});
        return <p id="probe" data-status={reading.status}>{word}</p>;
      }
      window.switchProof = {
        drawn,
        switchTo(actor) { drawn.length = 0; setActor(actor); },
        now() {
          const probe = document.getElementById('probe');
          return {word: probe.textContent, status: probe.dataset.status, lang: document.documentElement.lang, drawn: [...drawn]};
        },
      };
      createRoot(document.getElementById('root')).render(<Probe/>);
    ` },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  bundle = result.outputFiles[0]!.text
  await app.page.route('**/switch-proof', (route) => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="root"></main></body></html>' }))
  await app.page.route((url) => url.pathname === '/api/participants', async (route: Route) => {
    if (holding) await new Promise<void>((resolve) => held.push(resolve))
    await route.continue()
  })
  app.page.on('pageerror', (error) => errors.push(error.message))
}, 240_000)

afterAll(async () => { await app?.stop() })

const thePage = (): Promise<ThePage> => app.page.evaluate(() => (window as any).switchProof.now())

/** Switches whom the page writes as with the reading held, returns the page while it is held, then lets it go. */
async function aSwitchWhileTheReadingIsHeld(actor: { type: string; id: string }): Promise<ThePage> {
  holding = true
  await app.page.evaluate((one) => (window as any).switchProof.switchTo(one), actor)
  await expect.poll(() => held.length, { timeout: 10_000, message: 'the switch started no reading of the participants' }).toBeGreaterThan(0)
  const whileHeld = await thePage()
  holding = false
  for (const release of held.splice(0)) release()
  return whileHeld
}

/** The words the probe drew since the switch, with each run of the same word told once. */
const theWordsInTurn = (drawn: Drawn[]): string[] => drawn.map((one) => one.word).filter((word, at, all) => at === 0 || all[at - 1] !== word)

it('after a switch, keeps the language on the page until the reading the switch started answers, then draws the answer’s', async () => {
  const page = app.page
  await page.goto(`${app.api}/switch-proof`)
  await page.addScriptTag({ type: 'module', content: bundle })
  await page.waitForFunction(() => document.getElementById('probe')?.dataset.status === 'ready', undefined, { timeout: 20_000 })
  expect(await thePage(), 'the person chose Chinese, and the page should be drawn in it before any switch').toMatchObject({ word: CHINESE, lang: 'zh' })

  // TO MOLE OFFICE, a writer who is not a person: the reading ends with the browser's language, English here.
  const toTheOffice = await aSwitchWhileTheReadingIsHeld({ type: 'system', id: THE_TEST_OFFICE_ID })
  expect(toTheOffice.drawn.some((one) => one.writer === 'system'), 'the probe did not redraw for the switch while the reading was held').toBe(true)
  expect(toTheOffice, 'while the reading is held, the page keeps its Chinese and says it is reading').toMatchObject({ word: CHINESE, lang: 'zh', status: 'loading' })
  expect(theWordsInTurn(toTheOffice.drawn), 'a word was drawn in English before the reading answered').toEqual([CHINESE])
  await page.waitForFunction(() => document.getElementById('probe')?.dataset.status === 'error', undefined, { timeout: 10_000 })
  const afterTheOffice = await thePage()
  expect(afterTheOffice, 'the reading answered that Mole Office is not a person, so the page is in the browser’s language').toMatchObject({ word: ENGLISH, lang: 'en' })
  expect(theWordsInTurn(afterTheOffice.drawn), 'the words changed language more than once after the switch').toEqual([CHINESE, ENGLISH])

  // BACK TO THE PERSON: the page keeps its English until the reading answers with the person's Chinese.
  const toThePerson = await aSwitchWhileTheReadingIsHeld({ type: 'human', id: THE_PERSON })
  expect(toThePerson, 'while the reading is held, the page keeps its English and says it is reading').toMatchObject({ word: ENGLISH, lang: 'en', status: 'loading' })
  expect(theWordsInTurn(toThePerson.drawn)).toEqual([ENGLISH])
  await page.waitForFunction(() => document.getElementById('probe')?.dataset.status === 'ready', undefined, { timeout: 10_000 })
  const afterThePerson = await thePage()
  expect(afterThePerson).toMatchObject({ word: CHINESE, lang: 'zh' })
  expect(theWordsInTurn(afterThePerson.drawn), 'the words changed language more than once after the switch').toEqual([ENGLISH, CHINESE])
  expect(errors).toEqual([])
}, 120_000)
