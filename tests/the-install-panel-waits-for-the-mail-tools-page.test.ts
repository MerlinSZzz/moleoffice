// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALL PANEL WAITS FOR THE MAIL TOOL'S PAGE. Problem SceBCWXSdyV2, 28 September 2026: after the person's press the panel
 * read the tool once, 20 ms before the tool wrote where its page is, so it drew no link to the page and never read
 * again, and the person took the install for stuck. The panel is src/web/components/InstallTheMailTool.tsx. Since 28 September
 * 2026 what it draws once the tool has said where it answers is the tool's own settings, not a
 * link. The office's two answers, and the tool's, are stood in for inside the browser, so nothing is installed, no
 * service is started and no tool answers.
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *   · After the person's press, the panel reads the tool again while it runs and has not said where it answers, draws the tool's
 *     own settings without Settings being opened again, and then stops reading.
 *   · Opening Settings while the tool is starting does the same, with no press.
 *   · A page that never says where it is is read LOOK_FOR_THE_PAGE_AT_MOST times after the first read, and no more:
 *     the panel keeps its words and draws no settings.
 *   · A press starts the count again: after the looks ran out, a press that starts the tool reads until its page is
 *     there.
 *   · A tool whose page is there already, and a tool not installed, are read once.
 *
 * A SLOW MACHINE CANNOT TURN A CASE RED: each case waits for the number of reads it claims, and then for two seconds more
 * to see that no read follows. Slowness makes fewer reads, never more.
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *   1. InstallTheMailTool.tsx, the effect that looks again: return at once, so the panel reads once after the press,
 *      as it did. The first four cases go red.
 *   2. InstallTheMailTool.tsx, the same effect: drop `looked.current >= LOOK_FOR_THE_PAGE_AT_MOST`. The third and fourth
 *      cases go red.
 *   3. InstallTheMailTool.tsx, `press`: drop `looked.current = 0`. The fourth case goes red.
 *   4. InstallTheMailTool.tsx, `waitingForThePage`: drop the test for the state that waits for the page, so the panel
 *      looks again whatever the tool says. The first, second, fourth and fifth cases go red.
 */

import { readFileSync } from 'node:fs'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { t } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'

/** The tool as the office answers it, in the three states these cases need. The page's address is a stand-in. */
const NOT_INSTALLED = { key: null, keyWorks: null, unit: 'not installed', running: false, page: null, says: 'A stand-in.' }
const STARTING = { key: { madeAt: '2026-09-30 20:00:00', lastUsedAt: '2026-09-30 20:01:00' }, keyWorks: true, unit: 'installed', running: true, page: null, says: 'A stand-in.' }
const RUNNING = { key: { madeAt: '2026-09-30 20:00:00', lastUsedAt: '2026-09-30 20:01:00' }, keyWorks: true, unit: 'installed', running: true, page: 'http://127.0.0.1:9/?s=a-stand-in', says: 'A stand-in.' }

let app: LiveApp
let every = 0
let atMost = 0
const errors: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'mail-panel-waits', workspace: 'default', viewport: { width: 1000, height: 800 } })
  const built = await bundlePageCode({ stdin: { resolveDir: process.cwd(), sourcefile: 'mail-panel-waits.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {InstallTheMailTool, LOOK_FOR_THE_PAGE_AT_MOST, LOOK_FOR_THE_PAGE_EVERY_MS} from './src/web/components/InstallTheMailTool.tsx';
    import {UI_CSS} from './src/web/components/ui.tsx';
    import {restorePresets} from './src/web/components/PresetBar.tsx';
    import {api} from './src/web/api.ts'; import {theApiIsOnPort} from './src/web/lib/api-address.ts';
    import {theTool} from './src/web/lib/the-mail-tool.ts';
    import {setWordLanguage} from './src/shared/i18n.ts'; import {setMode} from './src/web/lib/mode.ts';
    theApiIsOnPort(null);
    const root=createRoot(document.getElementById('test'));
    // THE OFFICE, STOOD IN FOR: each read answers the next of its answers and keeps answering the last one; the press
    // answers that it made the key and started the tool, and puts the answers after the press in their place.
    const stand={reads:0,presses:0,answers:[],afterThePress:[]};
    api.theMailTool=async()=>{stand.reads+=1;return stand.answers.length>1?stand.answers.shift():stand.answers[0]};
    api.installTheMailTool=async()=>{stand.presses+=1;stand.answers=stand.afterThePress.slice();
      return {keyMade:true,wrote:['a stand-in unit'],service:'started',says:'A stand-in.'}};
    // THE TOOL, STOOD IN FOR: once the panel knows where it answers, it asks it; this answers as a tool with a list.
    theTool.state=async()=>({reading:'works',officeAnswers:true,roundAt:null,lastMailed:null,
      accounts:{usable:[{id:'account_1',address:'bell@example.test',provider:'Google'}],unusable:[]},
      sender:{account:{id:'account_1',address:'bell@example.test',provider:'Google'},reason:null,count:1},
      addresses:['first@example.test'],mostAddresses:50,lastSend:null,lastTest:null,
      details:{key:'',office:'',accounts:'',server:'',lastSend:'',lastTest:'',letters:[],events:[]}});
    let drawn=0;
    window.mip={stand,every:LOOK_FOR_THE_PAGE_EVERY_MS,atMost:LOOK_FOR_THE_PAGE_AT_MOST,
      draw(answers,afterThePress,language){
        stand.reads=0;stand.presses=0;stand.answers=answers.slice();stand.afterThePress=afterThePress.slice();
        restorePresets(document.documentElement);setMode('normal');setWordLanguage(language);document.documentElement.lang=language;drawn+=1;
        flushSync(()=>root.render(<React.Fragment key={drawn}><style>{UI_CSS}</style><InstallTheMailTool/></React.Fragment>));
      }};
  ` }, write: false, bundle: true, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })
  const page = app.page
  page.setDefaultTimeout(5000)
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message))
  await app.context.addInitScript(() => localStorage.setItem('mole-office.workspace', 'default'))
  await page.route('**/mail-panel-waits', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main id="test" class="page"></main></body></html>' }))
  await page.goto(`${app.api}/mail-panel-waits`)
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: built.outputFiles[0]!.text })
  await page.waitForFunction(() => Boolean((window as any).mip), null, { timeout: 10_000 }).catch((error) => { throw new Error(`${errors.join('\n')}\n${String(error)}`) })
  ;({ every, atMost } = await page.evaluate(() => ({ every: (window as any).mip.every as number, atMost: (window as any).mip.atMost as number })))
  expect(every).toBeGreaterThan(0)
  expect(atMost).toBeGreaterThan(0)
})

afterAll(async () => {
  await app?.stop()
})

/** Draw the panel afresh on these answers, and wait for its first answer to be on screen. */
async function draw(answers: object[], afterThePress: object[], language = 'en'): Promise<void> {
  await app.page.evaluate(({ answers, afterThePress, language }) => (window as any).mip.draw(answers, afterThePress, language), { answers, afterThePress, language })
  await app.page.waitForFunction(() => document.querySelector('#test .imt-said') !== null)
}

async function counted(): Promise<{ reads: number; presses: number }> {
  return app.page.evaluate(() => ({ reads: (window as any).mip.stand.reads as number, presses: (window as any).mip.stand.presses as number }))
}

/**
 * How many times the panel read, once it has read `n` times and then two seconds more have passed. The count it
 * answers is `n` when the panel stops where it should; fewer when it stopped too soon; more when it went on.
 */
async function readsOnceTheyStop(n: number, within: number): Promise<number> {
  await app.page.waitForFunction((n) => (window as any).mip.stand.reads >= n, n, { timeout: within, polling: 50 }).catch(() => undefined)
  await app.page.waitForTimeout(8 * every)
  return (await counted()).reads
}

/** The tool's own settings, which the panel draws once the tool has said where it answers. */
const theSettings = () => app.page.locator('#test .mts')
const theState = () => app.page.locator('#test .imt-said').first()
const press = () => app.page.getByRole('button', { name: en['settingsPanel.mailtool.install'] }).click()

describe('the install panel waits for the mail tool’s page', () => {
  it('after the person\'s press, reads until the tool says where it answers, draws its settings, and stops', async () => {
    await draw([NOT_INSTALLED], [STARTING, STARTING, RUNNING])
    expect(await theState().innerText()).toBe(en['settingsPanel.mailtool.state.notInstalled'])
    await press()
    expect(await readsOnceTheyStop(4, 20 * every + 5000)).toBe(4)
    await theSettings().waitFor({ state: 'visible' })
    expect(await theSettings().count()).toBe(1)
    expect(await theState().innerText()).toBe(en['settingsPanel.mailtool.state.running'])
    expect((await counted()).presses).toBe(1)
    expect(errors).toEqual([])
  }, 60_000)

  it('opening Settings while the tool is starting reads until it says where it answers, with no press', async () => {
    await draw([STARTING, STARTING, RUNNING], [])
    expect(await readsOnceTheyStop(3, 20 * every + 5000)).toBe(3)
    await theSettings().waitFor({ state: 'visible' })
    expect(await theSettings().count()).toBe(1)
    expect((await counted()).presses).toBe(0)
    expect(errors).toEqual([])
  }, 60_000)

  it('reads a tool that never says where it answers a bounded number of times, and keeps its words', async () => {
    await draw([STARTING], [])
    expect(await readsOnceTheyStop(1 + atMost, (atMost + 8) * every + 10_000)).toBe(1 + atMost)
    // Test change (as decided, the panel draws no explanation): the words it keeps are the state word "Starting",
    // where they were a sentence saying the tool runs and has not yet said where its page is.
    expect(await theState().innerText()).toBe(t('settingsPanel.mailtool.state.starting'))
    expect(await theSettings().count()).toBe(0)
    expect(errors).toEqual([])
  }, 60_000)

  it('starts the count again at a press, after the looks ran out', async () => {
    await draw([STARTING], [STARTING, STARTING, RUNNING])
    expect(await readsOnceTheyStop(1 + atMost, (atMost + 8) * every + 10_000)).toBe(1 + atMost)
    await press()
    expect(await readsOnceTheyStop(1 + atMost + 3, 20 * every + 5000)).toBe(1 + atMost + 3)
    await theSettings().waitFor({ state: 'visible' })
    expect(await theSettings().count()).toBe(1)
    expect(errors).toEqual([])
  }, 60_000)

  it('reads a tool that has said where it answers, and a tool not installed, once', async () => {
    await draw([RUNNING], [])
    expect(await readsOnceTheyStop(1, 5000)).toBe(1)
    await theSettings().waitFor({ state: 'visible' })
    expect(await theSettings().count()).toBe(1)
    await draw([NOT_INSTALLED], [])
    expect(await readsOnceTheyStop(1, 5000)).toBe(1)
    expect(await theSettings().count()).toBe(0)
    expect(errors).toEqual([])
  }, 60_000)
})
