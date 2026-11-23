// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL'S SETTINGS ARE IN ITS ENTRY ON THE SETTINGS PAGE. A tool's settings fold open in its
 * entry in the Tools category, with no second-level page and no window, and the mail tool gains a
 * press that turns it off without uninstalling it. Plan
 * 9y8_m1dheYm_: the browser asks the tool itself on 127.0.0.1, so no address passes through the
 * office.
 *
 * The entry is src/web/components/InstallTheMailTool.tsx with src/web/components/MailToolSettings.tsx inside it; what it
 * asks the tool is src/web/lib/the-mail-tool.ts; the tool's doors are serveTheDoors in tools/mail-the-summonses.mjs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. With a real tool on this computer, the entry draws the list the tool keeps, refuses a list with a line that is
 *      not an address whole with "Not saved", and saves a right list into the tool's own folder.
 *   2. A tool that answers only another origin's page is not read by this one: the browser keeps its answer, the entry
 *      says the tool did not answer, and nothing is saved; in developer mode it names this page's origin.
 *   3. The account it sends from, the accounts that cannot send and why, and what became of each test letter are drawn
 *      in the words of the lists, and developer mode alone draws what the servers said.
 *   4. With several accounts and none picked, the entry asks for one, and its press sends the one the person chose.
 *   5. A test letter that was not sent names what kept it, and an empty list reads "Not sent: the list is empty."
 *   6. The press that turns it off is drawn for an installed tool alone, reads "Turned off" after it, and the tool then
 *      reads as off.
 *   7. In Chinese, the entry's words are the Chinese list's.
 *   8. Where the tool answers is taken only as http on 127.0.0.1 with a secret, and only this computer is its own.
 *  10. At 1440 and 390, in English and Chinese, the entry fits in the theme the person stored, and no dark picture is
 *      its light one.
 *
 * THE PAGE IS SERVED FROM A SERVER OF THIS TEST'S OWN ON 127.0.0.1, as the office serves Settings: the browser lets a
 * page on this computer's loopback ask another loopback port, and blocks a page it cannot place (one a test hands it
 * with no server behind it) from asking this computer at all.
 *
 * THE OFFICE'S ANSWERS ARE STOOD IN FOR INSIDE THE BROWSER, so nothing is installed, turned off or started. In cases 1
 * and 2 the tool is real: tools/mail-the-summonses.mjs, in a folder of this test's own, answering on a port of its own;
 * its accounts reader is a program that is not there, so it reads no account of this computer. In cases 3 to 7 the
 * tool's answers are stood in for as well.
 *
 * ---------------------------------------------------------------------------------------
 * NEW CASE 9: two decisions and report H-forI_Vk5H7, with follow-up
 * 1awVCd7pq7ZM.
 * Mutations, each alone after a control and restored: key line omitted; last use in the old
 * numeric day form; Chinese space before 制作 restored. Each makes case 9 go red.
 *
 * NEW CASE 10: the pictures of the tool's computer, taken in the stored theme as the other device's are
 * (tests/the-mail-tools-settings-are-read-from-another-device.test.ts). Mutation, alone after a control and restored:
 * tokens.css's dark colours given to no theme, so a dark page is drawn in the light ones. Case 10 goes red.
 *
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   1. tools/mail-the-summonses.mjs: a page of any origin let read the doors' answers. Case 2 goes red.
 *   2. MailToolSettings.tsx: a refused list said as saved. Case 1 goes red.
 *   3. MailToolSettings.tsx: a letter the mail server refused said as sent. Case 3 goes red.
 *   4. InstallTheMailTool.tsx: the press that turns it off not drawn. Case 6 goes red.
 *   5. InstallTheMailTool.tsx: a tool turned off read as stopped. Case 6 goes red.
 *   6. src/web/lib/the-mail-tool.ts: where the tool answers taken from any host. Case 8 goes red.
 *   7. MailToolSettings.tsx: the page's own origin not named in developer mode when the tool does not answer it
 *      (problem cmlTxSP_m1rR). Case 2 goes red.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { createI18n, t } from '../src/shared/i18n.ts'
import { makeTheFolder, makeTheTool, saveTheAddresses, serveTheDoors, theOfficesOrigins } from '../tools/mail-the-summonses.mjs'
import { onTheToolsComputer, whereTheToolIs } from '../src/web/lib/the-mail-tool.ts'

// Problem h09tYuNl1nd9; Vv6h0HVryXOe: pictures belong to this file run, or the folder TEST_SHOTS names.
const shots = testShots('mail-tool-settings')

const SENDER = 'bell@example.test'
const A = 'first@example.test'
const B = 'second@example.test'
const C = 'third@example.test'

/** The tool as the office answers it. */
const NOT_INSTALLED = { key: null, keyWorks: null, unit: 'not installed', running: false, enabled: null, page: null, says: 'A stand-in.' }
const RUNNING = (page: string) => ({ key: { madeAt: '2026-09-30 20:00:00', lastUsedAt: '2026-09-30 20:01:00' }, keyWorks: true, unit: 'installed', running: true, enabled: true, page, says: 'A stand-in.' })
const TURNED_OFF = { key: { madeAt: '2026-09-30 20:00:00', lastUsedAt: '2026-09-30 20:01:00' }, keyWorks: true, unit: 'installed', running: false, enabled: false, page: null, says: 'A stand-in.' }
/** Where a stood-in tool answers: nothing does, since its answers are stood in for inside the browser. */
const A_STAND_IN = 'http://127.0.0.1:9/?s=a-stand-in'

/** A tool's answer, as GET /state gives it, with what a case changes. */
function aToolsState(change: Record<string, unknown> = {}) {
  return {
    reading: 'works',
    officeAnswers: true,
    roundAt: '2026-09-28 21:00:00',
    lastMailed: null,
    accounts: { usable: [{ id: 'account_1', address: SENDER, provider: 'Google' }], unusable: [] },
    sender: { account: { id: 'account_1', address: SENDER, provider: 'Google' }, reason: null, count: 1 },
    addresses: [A],
    mostAddresses: 50,
    lastSend: null,
    lastTest: null,
    details: { key: '', office: '', accounts: '', server: 'smtp.example.test:587 over STARTTLS', lastSend: '', lastTest: '', letters: [], events: [] },
    ...change,
  }
}

/** A word of a list, with its values put in. */
function said(words: Record<string, unknown>, key: string, values: Record<string, string | number> = {}): string {
  let text = String(words[key])
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value))
  return text
}

let app: LiveApp
let scratch = ''
/** The server of this test's own that serves its page, and the page's origin. */
let pageServer: Server | null = null
let pageAt = ''
const errors: string[] = []

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mail-tool-settings-'))
  app = await liveApp({ name: 'mail-tool-settings', workspace: 'default', viewport: { width: 1000, height: 900 } })
  const built = await bundlePageCode({ stdin: { resolveDir: process.cwd(), sourcefile: 'mail-tool-settings.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {InstallTheMailTool} from './src/web/components/InstallTheMailTool.tsx';
    import {UI_CSS} from './src/web/components/ui.tsx';
    import {restorePresets} from './src/web/components/PresetBar.tsx';
    import {api} from './src/web/api.ts'; import {theApiIsOnPort} from './src/web/lib/api-address.ts';
    import {theTool} from './src/web/lib/the-mail-tool.ts';
    import {setWordLanguage} from './src/shared/i18n.ts'; import {setMode} from './src/web/lib/mode.ts';
    theApiIsOnPort(null);
    const root=createRoot(document.getElementById('test'));
    // THE OFFICE, STOOD IN FOR: it answers the tool as the case says, and the press that turns it off puts the case's
    // answer after it in its place. THE TOOL: real, or stood in for with the case's answers; every ask is noted.
    const real={...theTool};
    const stand={office:null,afterOff:null,asked:[],tool:null};
    api.theMailTool=async()=>stand.office;
    api.installTheMailTool=async()=>({keyMade:false,wrote:[],service:'already running',says:'A stand-in.'});
    api.takeBackTheMailToolsKey=async()=>{stand.asked.push('take-back-key');stand.office={...stand.office,key:null,keyWorks:false,page:null};return {takenBack:true,says:'A stand-in.'}};
    api.disableTheMailTool=async()=>{stand.asked.push('disable');stand.office=stand.afterOff;return {service:'turned off',says:'A stand-in.'}};
    let drawn=0;
    window.mts={stand,
      draw(office,afterOff,tool,language,mode){
        stand.office=office;stand.afterOff=afterOff;stand.asked=[];stand.tool=tool;
        Object.assign(theTool,real);
        if(tool!==null){
          theTool.state=async()=>{stand.asked.push('state');return stand.tool.state};
          theTool.saveTheAddresses=async(w,typed)=>{stand.asked.push('save:'+typed);return {done:stand.tool.saved,state:stand.tool.state}};
          theTool.pickTheAccount=async(w,id)=>{stand.asked.push('pick:'+id);return {done:{picked:true},state:stand.tool.afterPick??stand.tool.state}};
          theTool.sendATest=async()=>{stand.asked.push('test');return {done:{tested:true},state:stand.tool.afterTest??stand.tool.state}};
        }
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
  await new Promise<void>((done) => pageServer?.listen(0, '127.0.0.1', () => done()))
  pageAt = `http://127.0.0.1:${String((pageServer.address() as AddressInfo).port)}`
  await page.goto(`${pageAt}/mail-tool-settings`)
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') })
  await page.addScriptTag({ type: 'module', content: built.outputFiles[0]!.text })
  await page.waitForFunction(() => Boolean((window as any).mts), null, { timeout: 10_000 }).catch((error) => { throw new Error(`${errors.join('\n')}\n${String(error)}`) })
}, 120_000)

afterAll(async () => {
  await app?.stop()
  await new Promise<void>((done) => (pageServer === null ? done() : pageServer.close(() => done())))
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** Draw the entry afresh, and wait for the office's answer to be on screen. */
async function draw(office: object, afterOff: object | null, tool: object | null, language = 'en', mode = 'normal'): Promise<void> {
  await app.page.evaluate(({ office, afterOff, tool, language, mode }) => (window as any).mts.draw(office, afterOff, tool, language, mode), { office, afterOff, tool, language, mode })
  await app.page.waitForFunction(() => document.querySelector('#test .imt-said') !== null)
}

const theList = () => app.page.locator('#test .mts textarea')
const theEntry = () => app.page.locator('#test')
const press = (name: string) => app.page.getByRole('button', { name, exact: true }).click()
const asked = () => app.page.evaluate(() => (window as any).mts.stand.asked as string[])

let tools = 0
/** A real tool in a folder of its own, answering pages of the given origins, with the given list. */
async function aRealTool(origins: string[], addresses: string[]) {
  tools += 1
  const dir = join(scratch, `tool-${String(tools)}`)
  makeTheFolder(dir)
  saveTheAddresses(dir, addresses.join('\n'))
  const tool = makeTheTool({ dir, api: 'http://127.0.0.1:9', busctl: join(scratch, 'no-busctl-here'), say: () => undefined })
  const secret = `a-secret-for-tool-${String(tools)}`
  const doors = await serveTheDoors(tool, { secret, origins })
  return { dir, doors, page: `http://127.0.0.1:${String(doors.port)}/?s=${secret}`, list: () => JSON.parse(readFileSync(join(dir, 'addresses.json'), 'utf8')) as { addresses: string[] } }
}

describe("the mail tool's settings are in its entry", () => {
  it('1: draws the list a real tool keeps, refuses a wrong list whole, and saves a right one into its folder', async () => {
    const tool = await aRealTool(theOfficesOrigins([pageAt]), [A])
    try {
      await draw(RUNNING(tool.page), null, null)
      await theList().waitFor()
      expect(await theList().inputValue()).toBe(A)
      // ITS ACCOUNTS READER IS NOT THERE, so it reads no account of this computer, and the account reads "not read".
      await expect.poll(() => theEntry().innerText()).toContain(t('settingsState.notRead'))
      await theList().fill(`${B}\nnot an address`)
      await press(en['settingsPanel.mailtool.addresses.save'])
      await expect.poll(() => theEntry().innerText()).toContain(t('settingsPanel.mailtool.addresses.notSaved.notAnAddress', { which: 'not an address' }))
      expect(tool.list()).toEqual({ addresses: [A] })
      await theList().fill(`${B}\n${A}`)
      await press(en['settingsPanel.mailtool.addresses.save'])
      await expect.poll(() => theEntry().innerText()).toContain(en['settingsPanel.mailtool.addresses.saved'])
      expect(tool.list()).toEqual({ addresses: [B, A] })
      expect(errors).toEqual([])
    } finally {
      await tool.doors.close()
    }
  }, 60_000)

  it("2: does not read a tool that answers only another origin's page, says it did not answer, and saves nothing", async () => {
    const tool = await aRealTool(['http://127.0.0.1:1'], [A])
    try {
      await draw(RUNNING(tool.page), null, null)
      await expect.poll(() => theEntry().innerText()).toContain(en['settingsPanel.mailtool.tool.noAnswer'])
      expect(await theList().count()).toBe(0)
      expect(await theEntry().innerText()).not.toContain(A)
      expect(tool.list()).toEqual({ addresses: [A] })
      // IN DEVELOPER MODE, THE PAGE'S OWN ORIGIN IS NAMED, so a page the tool refused can tell whether it is the office's.
      expect(await theEntry().innerText()).not.toContain(t('settingsPanel.mailtool.tool.pageOrigin', { origin: pageAt }))
      await draw(RUNNING(tool.page), null, null, 'en', 'inspect')
      await expect.poll(() => theEntry().innerText()).toContain(t('settingsPanel.mailtool.tool.pageOrigin', { origin: pageAt }))
    } finally {
      await tool.doors.close()
    }
  }, 60_000)

  it('3: draws the account, the accounts that cannot send, and each test letter in the words of the lists', async () => {
    const letters = [{ to: A, outcome: 'sent' }, { to: B, outcome: 'refused' }, { to: C, outcome: 'later' }]
    const state = aToolsState({ accounts: { usable: [{ id: 'account_1', address: SENDER, provider: 'Google' }], unusable: [{ name: 'old@example.test', provider: 'IMAP and SMTP', reason: 'asks a password' }] } })
    const afterTest = { ...state, lastTest: { at: '2026-09-28 21:05:00', outcome: 'sent', reason: null, letters } }
    await draw(RUNNING(A_STAND_IN), null, { state, afterTest })
    await theList().waitFor()
    const drawn = await theEntry().innerText()
    expect(drawn).toContain(said(en, 'settingsPanel.mailtool.from.one', { address: SENDER, provider: 'Google' }))
    expect(drawn).toContain(said(en, 'settingsPanel.mailtool.cannot.item', { name: 'old@example.test', provider: 'IMAP and SMTP', why: en['settingsPanel.mailtool.cannot.asksAPassword'] }))
    // WHAT THE SERVERS SAID IS NOT DRAWN IN NORMAL MODE.
    expect(drawn).not.toContain('over STARTTLS')
    await press(en['settingsPanel.mailtool.test.send'])
    await expect.poll(() => theEntry().innerText()).toContain(said(en, 'settingsPanel.mailtool.test.letterSent', { to: A }))
    const after = await theEntry().innerText()
    expect(after).toContain(said(en, 'settingsPanel.mailtool.test.letterRefused', { to: B }))
    expect(after).toContain(said(en, 'settingsPanel.mailtool.test.letterLater', { to: C }))
    expect(await asked()).toContain('test')
    // IN DEVELOPER MODE, what the mail server said is drawn as well.
    await draw(RUNNING(A_STAND_IN), null, { state }, 'en', 'inspect')
    await theList().waitFor()
    await expect.poll(() => theEntry().innerText()).toContain('smtp.example.test:587 over STARTTLS')
    expect(errors).toEqual([])
  }, 60_000)

  it('4: with several accounts and none picked, asks for one, and its press sends the one the person chose', async () => {
    const two = { usable: [{ id: 'account_1', address: SENDER, provider: 'Google' }, { id: 'account_2', address: 'other@example.test', provider: 'Microsoft' }], unusable: [] }
    await draw(RUNNING(A_STAND_IN), null, { state: aToolsState({ accounts: two, sender: { account: null, reason: 'pick one', count: 2 } }) })
    await theList().waitFor()
    expect(await theEntry().innerText()).toContain(said(en, 'settingsPanel.mailtool.from.pickOne', { count: 2 }))
    await app.page.getByLabel(said(en, 'settingsPanel.mailtool.from.choice', { address: 'other@example.test', provider: 'Microsoft' })).check()
    await press(en['settingsPanel.mailtool.from.pick'])
    await expect.poll(asked).toContain('pick:account_2')
    expect(errors).toEqual([])
  }, 60_000)

  it('5: names what kept a test letter from being sent, and that the list was empty', async () => {
    const state = aToolsState()
    await draw(RUNNING(A_STAND_IN), null, { state, afterTest: { ...state, lastTest: { at: '2026-09-28 21:06:00', outcome: 'not sent', reason: 'login refused', letters: [] } } })
    await theList().waitFor()
    await press(en['settingsPanel.mailtool.test.send'])
    await expect.poll(() => theEntry().innerText()).toContain(en['settingsPanel.mailtool.notSent.loginRefused'])
    await draw(RUNNING(A_STAND_IN), null, { state, afterTest: { ...state, addresses: [], lastTest: { at: '2026-09-28 21:07:00', outcome: 'empty list', reason: null, letters: [] } } })
    await theList().waitFor()
    await press(en['settingsPanel.mailtool.test.send'])
    await expect.poll(() => theEntry().innerText()).toContain(t('settingsPanel.mailtool.test.notSentEmpty'))
    expect(errors).toEqual([])
  }, 60_000)

  it('6: draws the press that turns it off for an installed tool alone, reads "Turned off" after it, and then reads the tool as off', async () => {
    await draw(NOT_INSTALLED, null, { state: aToolsState() })
    expect(await app.page.getByRole('button', { name: en['settingsPanel.mailtool.disable'], exact: true }).count()).toBe(0)
    await draw(RUNNING(A_STAND_IN), TURNED_OFF, { state: aToolsState() })
    await theList().waitFor()
    await press(en['settingsPanel.mailtool.disable'])
    await expect.poll(() => theEntry().innerText()).toContain(t('settingsPanel.mailtool.done.nowOff'))
    await expect.poll(() => theEntry().innerText()).toContain(t('settingsPanel.mailtool.state.isOff'))
    expect(await asked()).toContain('disable')
    // TURNED OFF, IT HAS NO SETTINGS TO READ: the tool is not asked again.
    expect(await theList().count()).toBe(0)
    expect(errors).toEqual([])
  }, 60_000)

  it("7: in Chinese, draws the entry in the Chinese list's words", async () => {
    await draw(RUNNING(A_STAND_IN), null, { state: aToolsState() }, 'zh')
    await theList().waitFor()
    const drawn = await theEntry().innerText()
    expect(drawn).toContain(said(zh, 'settingsPanel.mailtool.from.one', { address: SENDER, provider: 'Google' }))
    expect(drawn).toContain(zh['settingsPanel.mailtool.addresses.save'])
    expect(drawn).toContain(zh['settingsPanel.mailtool.test.send'])
    expect(drawn).not.toContain(en['settingsPanel.mailtool.test.send'])
    expect(errors).toEqual([])
  }, 60_000)

  it('9: shows the person\'s tool key and its times, no mailer card, and takes it back in the person\'s entry [mutation: key line omitted]', async () => {
    for (const [language, words] of [['en', en], ['zh', zh]] as const) {
      for (const theme of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          await app.page.setViewportSize({ width, height: 900 })
          await draw(RUNNING(A_STAND_IN), null, { state: aToolsState() }, language)
          await app.page.evaluate((theme) => { document.documentElement.dataset.theme = theme }, theme)
          await theList().waitFor()
          const text = await theEntry().innerText()
          expect(text).toContain(language === 'en'
            ? 'Your tool’s key: made 30 Sept 2026; last use: 30 Sept 2026 20:01.'
            : '你的工具密钥：2026 年 9 月 30 日制作；上次使用：2026 年 9 月 30 日 20:01。')
          expect(text).not.toMatch(/mailer|邮件员|邮差/)
          expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
          // Look at the rendered entry at each required width and theme; keep review artifacts local.
          await app.page.screenshot({ path: join(shots, `mail-tool-${language}-${theme}-${width}.png`), fullPage: true })
        }
      }
      await press(words['settingsPanel.mailtool.key.takeBack'])
      await expect.poll(() => theEntry().innerText()).toContain(createI18n(language).t('settingsPanel.mailtool.key.takenBackState'))
      expect(await asked()).toContain('take-back-key')
      expect(await app.page.locator('.imt-key').count()).toBe(0)
      expect(await app.page.getByRole('button', { name: words['settingsPanel.mailtool.key.takeBack'], exact: true }).count()).toBe(0)
      await draw({ ...RUNNING(A_STAND_IN), key: { madeAt: '2026-09-30 20:00:00', lastUsedAt: null } }, null, { state: aToolsState() }, language)
      await expect.poll(() => theEntry().innerText()).toContain(words['settingsPanel.mailtool.key.noUseRecorded'])
    }
    expect(errors).toEqual([])
  }, 120_000)

  it('10: fits 1440 and 390 in English and Chinese, in the theme the person stored, and no dark picture is its light one', async () => {
    // EACH LIGHT PICTURE, by language and width, so the dark one taken of the same can be refused if it is the same.
    const light = new Map<string, Buffer>()
    try {
      for (const theme of ['light', 'dark']) {
        // THE THEME IS STORED AS THE PERSON'S CHOICE IS, and each draw reads it back through restorePresets, as the
        // app does when it starts.
        await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
        for (const language of ['en', 'zh']) {
          for (const width of [1440, 390]) {
            const pass = `${language} ${theme} ${String(width)}`
            await app.page.setViewportSize({ width, height: 900 })
            await draw(RUNNING(A_STAND_IN), null, { state: aToolsState({ addresses: [A, B] }) }, language)
            await expect.poll(() => app.page.evaluate(() => document.documentElement.dataset.theme), { message: pass }).toBe(theme)
            await expect.poll(() => theList().inputValue(), { message: pass }).toBe([A, B].join('\n'))
            expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), pass).toBe(true)
            const picture = await app.page.screenshot({ path: join(shots, `mail-tool-stored-theme-${language}-${theme}-${String(width)}.png`), fullPage: true })
            if (theme === 'light') light.set(`${language} ${String(width)}`, picture)
            else expect(picture.equals(light.get(`${language} ${String(width)}`)!), `${pass} is its light picture`).toBe(false)
          }
        }
      }
    } finally {
      await app.page.evaluate(() => localStorage.removeItem('mole-office.preset.theme'))
      await app.page.setViewportSize({ width: 1000, height: 900 })
    }
    expect(errors).toEqual([])
  }, 120_000)

  it('8: takes where the tool answers only as http on 127.0.0.1 with a secret, and only this computer as its own', () => {
    expect(whereTheToolIs('http://127.0.0.1:4242/?s=abc')).toEqual({ origin: 'http://127.0.0.1:4242', secret: 'abc' })
    for (const not of [null, 'http://127.0.0.1:4242/', 'https://127.0.0.1:4242/?s=abc', 'http://somewhere.example:4242/?s=abc', 'http://localhost:4242/?s=abc', 'not an address']) {
      expect(whereTheToolIs(not), String(not)).toBeNull()
    }
    for (const here of ['127.0.0.1', 'localhost', '::1', '[::1]']) expect(onTheToolsComputer(here), here).toBe(true)
    for (const there of ['phone.example', 'the-other-computer', '203.0.113.7']) expect(onTheToolsComputer(there), there).toBe(false)
  })
})
