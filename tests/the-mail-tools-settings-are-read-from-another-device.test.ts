// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON ANOTHER DEVICE, THE MAIL TOOL'S SETTINGS ARE READ AND CHANGED THROUGH THE OFFICE. Settings > Tools showed an error
 * for the mail tool on any device but the office's own computer, because the tool answers there alone. The office on the
 * tool's computer asks the tool for the person and passes the answer on (GET /api/office/mail-tool/state,
 * tests/the-mail-tools-state-is-read-through-the-office.test.ts), and passes each of the person's three presses on in
 * the same way (tests/the-mail-tools-settings-are-changed-through-the-office.test.ts).
 *
 * The entry is src/web/components/InstallTheMailTool.tsx with src/web/components/MailToolSettings.tsx inside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. On another device the entry draws the settings the office passed on with the presses of the office's
 *      computer: the account it sends from and the accounts to choose from, the list of addresses in its box, and the
 *      presses that pick, save and send a test letter.
 *      It asks the office's read alone: not the office's door for the tool's install, which is kept on its computer,
 *      and not the tool itself.
 *   2. An empty list is an empty box, and the last test letter is drawn as the tool says it.
 *   3. When the office has no answer of the tool's, the entry names what kept it in a short word, such as "Tool: no
 *      answer", as a status and not as a failure, and developer mode alone draws what the office said.
 *   4. When the office's own read fails, the entry says the office did not pass the settings on, and its press asks
 *      again.
 *   5. It fits each width the page is drawn at, in both themes, with the tool's answer, without one, and after a change
 *      the tool did not confirm; and at 1440 and 390 in Chinese as well, with the tool's answer and without one.
 *   6. Each press asks the office, never the tool, with what the person typed or chose, and draws what the tool did. A
 *      change the tool did not confirm is named with what kept it, as a status, and developer mode alone draws what the
 *      office said; a press the office itself refused says so under the same heading.
 *
 * THE PAGE IS SERVED FROM 127.0.0.2, a loopback address that is not one of this computer's own names for the tool
 * (`onTheToolsComputer` in src/web/lib/the-mail-tool.ts), so the browser draws the entry as on another device. THE
 * OFFICE'S ANSWERS ARE STOOD IN FOR INSIDE THE BROWSER, and every question the entry asks is noted.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   1. InstallTheMailTool.tsx: the entry drawn as on the tool's computer on every device. Case 1 goes red.
 *   2. MailToolSettings.tsx: the presses left off on another device. Case 1 goes red.
 *   3. MailToolSettings.tsx: an answer with no state of the tool's drawn as a failure. Case 3 goes red.
 *   4. tokens.css: the dark theme's colours given to no theme, so a dark page is drawn in the light ones. Case 5 goes red.
 *   5. PresetBar.tsx: the stored theme not put on the page. Case 5 goes red.
 *   6. MailToolSettings.tsx: a change the tool did not confirm drawn as nothing. Case 6 goes red.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import type { WhyTheToolWasNotRead } from '../src/shared/the-mail-tool-through-the-office.ts'
import { onTheToolsComputer } from '../src/web/lib/the-mail-tool.ts'

const shots = testShots('mail-tool-from-another-device')

/** A loopback address the browser can serve from, and which is not this computer's own name for the tool. */
const ANOTHER_DEVICE = '127.0.0.2'

const SENDER = 'bell@example.test'
const OTHER = 'second-sender@example.test'
const A = 'first@example.test'
const B = 'second@example.test'

/** The tool's answer, as GET /state gives it, with what a case changes. */
function aToolsState(change: Record<string, unknown> = {}) {
  return {
    reading: 'works',
    officeAnswers: true,
    roundAt: '2026-11-02 09:00:00',
    lastMailed: null,
    accounts: {
      usable: [
        { id: 'account_1', address: SENDER, provider: 'Google' },
        { id: 'account_2', address: OTHER, provider: 'Google' },
      ],
      unusable: [],
    },
    sender: { account: { id: 'account_1', address: SENDER, provider: 'Google' }, reason: null, count: 2 },
    addresses: [A, B],
    mostAddresses: 50,
    lastSend: null,
    lastTest: null,
    details: { key: '', office: '', accounts: '', server: 'smtp.example.test:587 over STARTTLS', lastSend: '', lastTest: '', letters: [], events: [] },
    ...change,
  }
}

/** The word each reason is said in. */
const SAID_AS = {
  'no address': 'settingsPanel.mailtool.throughTheOffice.state.noAddress',
  'no answer': 'settingsPanel.mailtool.throughTheOffice.state.noAnswer',
  refused: 'settingsPanel.mailtool.throughTheOffice.state.refused',
  'not the tool': 'settingsPanel.mailtool.throughTheOffice.state.notTheTool',
} as const satisfies Record<WhyTheToolWasNotRead, WordKey>

/** A word of the English list, with its values put in. */
function said(key: WordKey, values: Record<string, string | number> = {}): string {
  let text = String(englishWords()[key])
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value))
  return text
}

let app: LiveApp
let pageServer: Server | null = null
let pageAt = ''
const errors: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'mail-tool-from-another-device', workspace: 'default', viewport: { width: 1000, height: 900 } })
  const built = await bundlePageCode({ stdin: { resolveDir: process.cwd(), sourcefile: 'mail-tool-from-another-device.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {InstallTheMailTool} from './src/web/components/InstallTheMailTool.tsx';
    import {UI_CSS} from './src/web/components/ui.tsx';
    import {restorePresets} from './src/web/components/PresetBar.tsx';
    import {api} from './src/web/api.ts'; import {theApiIsOnPort} from './src/web/lib/api-address.ts';
    import {theTool} from './src/web/lib/the-mail-tool.ts';
    import {setWordLanguage} from './src/shared/i18n.ts'; import {setMode} from './src/web/lib/mode.ts';
    theApiIsOnPort(null);
    const root=createRoot(document.getElementById('test'));
    // THE OFFICE, STOOD IN FOR: its read through the office answers as the case says, or fails. Every question the
    // entry asks, of the office or of the tool, is noted.
    const stand={through:null,fails:false,asked:[],change:null,changeFails:false};
    api.theMailToolsState=async()=>{stand.asked.push('through the office');if(stand.fails){throw new Error('A stand-in failure.')}return stand.through};
    // AND ITS THREE PRESSES PASSED ON: each answers the case's change, or fails.
    const changed=async(what)=>{stand.asked.push(what);if(stand.changeFails){throw new Error('A stand-in failure of the office.')}return stand.change};
    api.saveTheMailToolsAddresses=(addresses)=>changed('save through the office: '+addresses);
    api.pickTheMailToolsAccount=(id)=>changed('pick through the office: '+id);
    api.sendTheMailToolsTest=()=>changed('test through the office');
    api.theMailTool=async()=>{stand.asked.push('the install');return {key:null,keyWorks:null,unit:'not installed',running:false,enabled:null,page:null,says:'A stand-in.'}};
    for(const name of Object.keys(theTool)){theTool[name]=async()=>{stand.asked.push('the tool: '+name);throw new Error('A stand-in: the tool is not asked from here.')}}
    let drawn=0;
    window.mfad={stand,
      draw(through,fails,mode,language){
        stand.through=through;stand.fails=fails;stand.asked=[];stand.change=null;stand.changeFails=false;
        restorePresets(document.documentElement);setMode(mode);setWordLanguage(language);document.documentElement.lang=language;drawn+=1;
        flushSync(()=>root.render(<React.Fragment key={drawn}><style>{UI_CSS}</style><InstallTheMailTool/></React.Fragment>));
      }};
  ` }, write: false, bundle: true, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })
  const page = app.page
  page.setDefaultTimeout(8000)
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message))
  await app.context.addInitScript(() => localStorage.setItem('mole-office.workspace', 'default'))
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><main id="test" class="page"></main></body></html>'
  pageServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise<void>((done) => pageServer?.listen(0, ANOTHER_DEVICE, () => done()))
  pageAt = `http://${ANOTHER_DEVICE}:${String((pageServer.address() as AddressInfo).port)}`
  await page.goto(`${pageAt}/mail-tool-from-another-device`)
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: built.outputFiles[0]!.text })
  await page.waitForFunction(() => Boolean((window as any).mfad), null, { timeout: 10_000 }).catch((error) => { throw new Error(`${errors.join('\n')}\n${String(error)}`) })
}, 120_000)

afterAll(async () => {
  await app?.stop()
  await new Promise<void>((done) => (pageServer === null ? done() : pageServer.close(() => done())))
})

type NotAnswered = { answered: false; because: WhyTheToolWasNotRead; status: number | null; says: string }
type Through = { answered: true; state: object } | NotAnswered

/** Draw the entry afresh, and wait until it has drawn more than its first line. */
async function draw(through: Through | null, fails = false, mode = 'normal', language = 'en'): Promise<void> {
  await app.page.evaluate(({ through, fails, mode, language }) => (window as any).mfad.draw(through, fails, mode, language), { through, fails, mode, language })
  await app.page.waitForFunction(() => document.querySelector('#test .mts, #test .px-error') !== null)
}

/** What the office answers the next press with: the tool's own answer, or why it has none. */
async function theOfficeAnswers(change: { answered: true; answer: { done: object; state: object } } | NotAnswered): Promise<void> {
  await app.page.evaluate((change) => {
    const stand = (window as any).mfad.stand
    stand.change = change
    stand.changeFails = false
  }, change)
}

const theEntry = () => app.page.locator('#test')
const theBox = () => app.page.locator('#test .mts textarea')
const press = (name: string) => app.page.getByRole('button', { name, exact: true }).click()
const asked = () => app.page.evaluate(() => (window as any).mfad.stand.asked as string[])

describe("on another device, the mail tool's settings are read through the office", () => {
  it('1: draws the settings the office passed on with their presses, and asks the office alone', async () => {
    // THE PAGE IS ON ANOTHER DEVICE, as the entry tells it.
    expect(await app.page.evaluate(() => window.location.hostname)).toBe(ANOTHER_DEVICE)
    expect(onTheToolsComputer(ANOTHER_DEVICE)).toBe(false)

    await draw({ answered: true, state: aToolsState() })
    await expect.poll(() => theBox().inputValue()).toBe([A, B].join('\n'))
    const drawn = await theEntry().innerText()
    expect(drawn).toContain(said('settingsPanel.mailtool.from.one', { address: SENDER, provider: 'Google' }))
    // THE ACCOUNTS TO CHOOSE FROM, AND EACH PRESS, as on the office's computer: each is passed on through the office.
    expect(await app.page.getByLabel(said('settingsPanel.mailtool.from.choice', { address: OTHER, provider: 'Google' })).count()).toBe(1)
    for (const name of ['settingsPanel.mailtool.from.pick', 'settingsPanel.mailtool.addresses.save', 'settingsPanel.mailtool.test.send'] as const) {
      expect(await app.page.getByRole('button', { name: said(name), exact: true }).count(), name).toBe(1)
    }
    expect(await app.page.locator('#test .px-error').count()).toBe(0)
    expect(await asked()).toEqual(['through the office'])
    expect(errors).toEqual([])
  }, 60_000)

  it('2: draws an empty list as an empty box, and the last test letter as the tool says it', async () => {
    const lastTest = { at: '2026-11-02 08:55:00', outcome: 'sent', reason: null, letters: [{ to: A, outcome: 'sent' }] }
    await draw({ answered: true, state: aToolsState({ addresses: [], lastTest }) })
    await expect.poll(() => theEntry().innerText()).toContain(said('settingsPanel.mailtool.test.letterSent', { to: A }))
    expect(await theEntry().innerText()).toContain(said('settingsPanel.mailtool.test.head'))
    expect(await theBox().inputValue()).toBe('')
    expect(await asked()).toEqual(['through the office'])
    expect(errors).toEqual([])
  }, 60_000)

  it("3: names in a short word what kept the office from the tool's answer, as a status, and what the office said in developer mode alone", async () => {
    const says = 'What the office said, in its own English.'
    for (const [because, key] of Object.entries(SAID_AS) as [WhyTheToolWasNotRead, WordKey][]) {
      await draw({ answered: false, because, status: because === 'refused' ? 403 : null, says })
      const status = app.page.locator('#test .mts [role="status"]')
      await expect.poll(() => status.innerText(), { message: because }).toBe(said(key))
      expect(await app.page.locator('#test .px-error').count(), because).toBe(0)
      expect(await app.page.locator('#test button').count(), because).toBe(0)
      expect(await theEntry().innerText(), because).not.toContain(says)
      await draw({ answered: false, because, status: null, says }, false, 'inspect')
      await expect.poll(() => theEntry().innerText(), { message: because }).toContain(says)
    }
    expect(await asked()).toEqual(['through the office'])
    expect(errors).toEqual([])
  }, 60_000)

  it("4: says the office did not pass the settings on when its own read fails, and its press asks again", async () => {
    await draw(null, true)
    await expect.poll(() => theEntry().innerText()).toContain(said('settingsPanel.mailtool.throughTheOffice.unread'))
    expect(await app.page.locator('#test .px-error').count()).toBe(1)
    expect(await asked()).toEqual(['through the office'])
    await app.page.evaluate((state) => {
      const stand = (window as any).mfad.stand
      stand.fails = false
      stand.through = { answered: true, state }
    }, aToolsState())
    await app.page.locator('#test .px-error button').click()
    await expect.poll(() => theBox().inputValue()).toBe([A, B].join('\n'))
    expect(await asked()).toEqual(['through the office', 'through the office'])
    expect(errors).toEqual([])
  }, 60_000)

  it("5: fits each width the page is drawn at, in both themes, with the tool's answer and without one, and in Chinese", async () => {
    // WHAT EACH PICTURE SHOWS, and what is on screen once it is drawn: the list in its box, or why there is none, or
    // why a change was not confirmed. That last is pressed in English alone, by the English name of its press.
    const shown = [
      { name: '', through: { answered: true, state: aToolsState() }, pressed: false, drawn: (): Promise<unknown> => theBox().inputValue(), is: [A, B].join('\n') },
      {
        name: 'no-answer-',
        through: { answered: false, because: 'no answer', status: null, says: 'A stand-in.' },
        pressed: false,
        drawn: (): Promise<unknown> => app.page.locator('#test .mts [role="status"]').count(),
        is: 1,
      },
      {
        name: 'not-confirmed-',
        through: { answered: true, state: aToolsState() },
        pressed: true,
        drawn: (): Promise<unknown> => app.page.locator('#test .mts-not-confirmed[role="status"]').count(),
        is: 1,
      },
    ] as const
    // EACH WIDTH IN ENGLISH, and the widest and the narrowest in Chinese, whose lines break differently.
    const passes = [
      ...[1440, 990, 660, 390].map((width) => ({ language: 'en', width })),
      ...[1440, 390].map((width) => ({ language: 'zh', width })),
    ]
    // EACH LIGHT PICTURE, by what it shows and its width, so the dark one taken of the same can be refused if it is the same.
    const light = new Map<string, Buffer>()
    try {
      for (const theme of ['light', 'dark']) {
        // THE THEME IS STORED AS THE PERSON'S CHOICE IS, and each draw reads it back through restorePresets, as the
        // app does when it starts.
        await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
        for (const { language, width } of passes) {
          await app.page.setViewportSize({ width, height: 900 })
          for (const { name, through, pressed, drawn, is } of shown) {
            if (pressed && language !== 'en') continue
            // THE ENGLISH PICTURES KEEP THE NAMES THEY HAD.
            const which = `${name}${language === 'en' ? '' : `${language}-`}`
            const pass = `${which}${theme} ${String(width)}`
            await draw(through, false, 'normal', language)
            await expect.poll(() => app.page.evaluate(() => document.documentElement.dataset.theme), { message: pass }).toBe(theme)
            if (pressed) {
              await theOfficeAnswers({ answered: false, because: 'no answer', status: null, says: 'A stand-in.' })
              await press(said('settingsPanel.mailtool.test.send'))
            }
            await expect.poll(drawn, { message: pass }).toBe(is)
            expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), pass).toBe(true)
            const picture = await app.page.screenshot({ path: join(shots, `mail-tool-from-another-device-${which}${theme}-${String(width)}.png`), fullPage: true })
            if (theme === 'light') light.set(`${which}${String(width)}`, picture)
            else expect(picture.equals(light.get(`${which}${String(width)}`)!), `${pass} is its light picture`).toBe(false)
          }
        }
      }
    } finally {
      await app.page.evaluate(() => localStorage.removeItem('mole-office.preset.theme'))
      await app.page.setViewportSize({ width: 1000, height: 900 })
    }
    expect(errors).toEqual([])
  }, 180_000)

  it('6: passes each press on through the office, never to the tool, draws what the tool did, and says why a change was not confirmed', async () => {
    await draw({ answered: true, state: aToolsState() })
    await expect.poll(() => theBox().inputValue()).toBe([A, B].join('\n'))
    const C = 'third@example.test'

    // THE LIST, SAVED AS TYPED.
    await theOfficeAnswers({ answered: true, answer: { done: { saved: true, addresses: [A, C] }, state: aToolsState({ addresses: [A, C] }) } })
    await theBox().fill(`${A}\n${C}`)
    await press(said('settingsPanel.mailtool.addresses.save'))
    await expect.poll(() => theEntry().innerText()).toContain(said('settingsPanel.mailtool.addresses.saved'))
    expect(await theBox().inputValue()).toBe([A, C].join('\n'))
    // THE ACCOUNT, PICKED.
    const other = { id: 'account_2', address: OTHER, provider: 'Google' }
    await theOfficeAnswers({ answered: true, answer: { done: { picked: true }, state: aToolsState({ sender: { account: other, reason: null, count: 2 } }) } })
    await app.page.getByLabel(said('settingsPanel.mailtool.from.choice', { address: OTHER, provider: 'Google' })).check()
    await press(said('settingsPanel.mailtool.from.pick'))
    await expect.poll(() => theEntry().innerText()).toContain(said('settingsPanel.mailtool.from.one', { address: OTHER, provider: 'Google' }))
    // A TEST LETTER, SENT.
    const lastTest = { at: '2026-11-02 15:00:00', outcome: 'sent', reason: null, letters: [{ to: C, outcome: 'sent' }] }
    await theOfficeAnswers({ answered: true, answer: { done: { tested: true }, state: aToolsState({ addresses: [A, C], lastTest }) } })
    await press(said('settingsPanel.mailtool.test.send'))
    await expect.poll(() => theEntry().innerText()).toContain(said('settingsPanel.mailtool.test.letterSent', { to: C }))
    expect(await asked()).toEqual(['through the office', `save through the office: ${A}\n${C}`, 'pick through the office: account_2', 'test through the office'])

    // A CHANGE THE TOOL DID NOT CONFIRM: said, with why, as a status and not as a failure.
    const says = 'What the office said, in its own English.'
    for (const [because, key] of Object.entries(SAID_AS) as [WhyTheToolWasNotRead, WordKey][]) {
      await theOfficeAnswers({ answered: false, because, status: because === 'refused' ? 403 : null, says })
      await press(said('settingsPanel.mailtool.test.send'))
      const status = app.page.locator('#test .mts-not-confirmed[role="status"]')
      await expect.poll(() => status.innerText(), { message: because }).toContain(said(key))
      expect(await status.innerText(), because).toContain(said('settingsPanel.mailtool.throughTheOffice.notConfirmed'))
      expect(await app.page.locator('#test .px-error').count(), because).toBe(0)
      expect(await theEntry().innerText(), because).not.toContain(says)
    }
    // WHAT THE OFFICE SAID, in developer mode alone.
    await draw({ answered: true, state: aToolsState() }, false, 'inspect')
    await expect.poll(() => theBox().inputValue()).toBe([A, B].join('\n'))
    await theOfficeAnswers({ answered: false, because: 'no answer', status: null, says })
    await press(said('settingsPanel.mailtool.test.send'))
    await expect.poll(() => theEntry().innerText()).toContain(says)

    // A PRESS THE OFFICE ITSELF REFUSED: said under the same heading.
    await draw({ answered: true, state: aToolsState() })
    await expect.poll(() => theBox().inputValue()).toBe([A, B].join('\n'))
    await app.page.evaluate(() => {
      ;(window as any).mfad.stand.changeFails = true
    })
    await press(said('settingsPanel.mailtool.test.send'))
    await expect.poll(() => app.page.locator('#test .px-error').innerText()).toContain(said('settingsPanel.mailtool.throughTheOffice.notConfirmed'))

    // AND THE TOOL ITSELF WAS NEVER ASKED FROM HERE.
    expect((await asked()).filter((one) => one.startsWith('the tool'))).toEqual([])
    expect(errors).toEqual([])
  }, 120_000)
})
