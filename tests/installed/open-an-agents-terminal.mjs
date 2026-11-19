// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * OPEN AN AGENT'S TERMINAL IN AN INSTALLED MOLE OFFICE, TYPE `echo 你好`, AND SEE IT COME BACK. Wave 13u, round 5:
 * the terminal in the Linux installers.
 *
 * Like drive-the-window.mjs beside it (wave 13t's), it is run by the Node the installation carries and needs nothing
 * else but ask-until.mjs beside it, for the environment it gives the window (since wave 13t's round 18): it reaches the window's main process through Electron's inspector with Node's own WebSocket. It asks that
 * inspector with the command line API on, which gives it `require`, so it can reach Electron's own window and page
 * without any hook of the office's.
 *
 *   node open-an-agents-terminal.mjs --app <program> --name <deb|appimage> --out <folder> [--pictures] [-- <arguments>]
 *
 * WHAT ONE RUN DOES, each step written as a finding with what was seen:
 *   1. the window opens on a fresh per-user data folder, and the office answers;
 *   2. the service started a terminal holder, from the bundle (holder.mjs), on the Node the installation carries;
 *   3. the welcome page is answered with a name on the page, and an agent is registered as the person, with Claude Code as its runtime and a start folder of its own;
 *   4. its profile page is opened in the window and "Open in a terminal" is pressed: the holder opens it;
 *   5. on the English page, then on the Chinese page, `echo ` is typed as keys and 你好 as an input method commits
 *      text, then Enter; the terminal's own screen, read from the page, shows a line that is only 你好;
 *   6. with --pictures, the window at 1440, 990, 660 and 390 wide, light and dark, in each language;
 *   7. Shut down stops the service, and the holder is stopped by its own process group.
 *
 * A STAND-IN FOR CLAUDE CODE. An agent's terminal runs its runtime's program, `claude`, and Claude Code would read
 * `echo 你好` as a message to its model. So this puts a stand-in named `claude` first on the PATH it gives the program:
 * a script that starts bash. The office finds it and runs it as it would run Claude Code; what answers the typing is
 * bash. Every finding says so.
 *
 * ACTING AS THE PERSON. Step 3 sends the person's headers to the office this run started, on its own data folder
 * under this run's HOME. It never reaches any other office.
 *
 * It exits 0 only when every finding passed.
 */

import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { THE_WINDOW_MAY_BE_DEBUGGED, aFreePort, aPlainEnvironment, isTheInstallationsOwnNode } from './ask-until.mjs'

const argv = process.argv.slice(2)
const dashes = argv.indexOf('--')
const own = dashes === -1 ? argv : argv.slice(0, dashes)
const more = dashes === -1 ? [] : argv.slice(dashes + 1)
/** @param {string} flag */
const value = (flag) => {
  const at = own.indexOf(flag)
  return at === -1 ? null : (own[at + 1] ?? null)
}
const APP = value('--app')
const NAME = value('--name')
const OUT = value('--out')
const PICTURES = own.includes('--pictures')
if (APP === null || NAME === null || OUT === null) {
  process.stderr.write('usage: open-an-agents-terminal.mjs --app <program> --name <name> --out <folder> [--pictures] [-- <arguments>]\n')
  process.exit(2)
}
const OUT_FOLDER = OUT
const HOME = String(process.env['HOME'])
const LOCK = join(HOME, '.config', 'mole-office', 'data', 'mole-office.db.service.json')
// Asked of the system, so two drivers running at once do not meet at one port (wave 13t, round 19b).
const INSPECT_PORT = await aFreePort()
const THE_PERSON = 'owner'
const WIDTHS = [1440, 990, 660, 390]
const HEIGHT = 900
const sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms))
mkdirSync(join(OUT, 'pictures'), { recursive: true })

/** @type {{ step: string, passed: boolean, saw: string }[]} */
const findings = []
/** @param {string} step @param {boolean} passed @param {string} saw */
const found = (step, passed, saw) => {
  findings.push({ step, passed, saw })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${NAME} ${step}: ${saw}\n`)
}
const alive = (/** @type {number} */ pid) => existsSync(`/proc/${String(pid)}`)

// ---------------------------------------------------------------------------- the stand-in and the window

const standIns = join(HOME, 'stand-ins')
mkdirSync(standIns, { recursive: true })
writeFileSync(join(standIns, 'claude'), '#!/bin/sh\n# A stand-in for Claude Code (open-an-agents-terminal.mjs): bash answers the typing.\nexec /bin/bash --norc --noprofile -i\n')
chmodSync(join(standIns, 'claude'), 0o755)
const yard = join(HOME, 'agent-yard')
mkdirSync(yard, { recursive: true })

const log = openSync(join(OUT, `${NAME}-terminal-window.log`), 'a')
const window = spawn(APP, [...more, `--inspect=${String(INSPECT_PORT)}`], {
  // Nothing of the shell's office passes to the window, or to the office it starts (problem JQ3yaANBi1JC).
  // The one setting it is given lets it start with the inspector this driver reaches it through.
  env: { ...aPlainEnvironment(process.env), ...THE_WINDOW_MAY_BE_DEBUGGED, PATH: `${standIns}:${String(process.env['PATH'])}`, LANG: 'C.UTF-8' },
  stdio: ['ignore', log, log],
  detached: true,
})
const windowGroup = /** @type {number} */ (window.pid)
process.stdout.write(`NOTE ${NAME} the window's program is process group ${String(windowGroup)}\n`)
let windowEnded = /** @type {{ code: number | null, signal: string | null } | null} */ (null)
window.on('exit', (code, signal) => {
  windowEnded = { code, signal }
})
/** The holder's process group, once the office names it. @type {number | null} */
let holderGroup = null
/** The service's lock, once the window has started it. @type {{ port: number, pgid: number } | null} */
let lock = null

async function theInspector() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && windowEnded === null) {
    try {
      const list = /** @type {{ webSocketDebuggerUrl: string }[]} */ (await (await fetch(`http://127.0.0.1:${String(INSPECT_PORT)}/json/list`)).json())
      if (list[0]?.webSocketDebuggerUrl) return list[0].webSocketDebuggerUrl
    } catch {
      // Not listening yet.
    }
    await sleep(300)
  }
  return null
}

const url = await theInspector()
if (url === null) {
  found('the window opens', false, `its main process never answered on the inspector (it ended: ${JSON.stringify(windowEnded)})`)
  await finish()
}
const socket = new WebSocket(/** @type {string} */ (url))
await new Promise((done, fail) => {
  socket.addEventListener('open', done, { once: true })
  socket.addEventListener('error', fail, { once: true })
})
let nextId = 1
/** @type {Map<number, (reply: any) => void>} */
const waiting = new Map()
socket.addEventListener('message', (event) => {
  const reply = JSON.parse(String(event.data))
  if (typeof reply.id === 'number') waiting.get(reply.id)?.(reply)
})

/** Evaluate an expression in the window's main process, with `require`, and give back its value. @param {string} expression */
function inTheWindow(expression) {
  const id = nextId++
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`no answer to ${expression.slice(0, 120)}`)), 30_000)
    waiting.set(id, (reply) => {
      clearTimeout(timer)
      if (reply.error || reply.result?.exceptionDetails) fail(new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails).slice(0, 600)))
      else done(reply.result?.result?.value)
    })
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }))
  })
}
const WIN = "require('electron').BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())"
/** Run JavaScript in the office's page and give back its value. @param {string} script */
const inThePage = (script) => inTheWindow(`${WIN}.webContents.executeJavaScript(${JSON.stringify(script)}, true)`)

/** Wait until `look` gives something `ready` accepts. @template T @param {() => Promise<T>} look @param {(it: T) => boolean} ready */
async function until(look, ready, ms = 60_000) {
  const deadline = Date.now() + ms
  /** @type {T | null} */
  let last = null
  while (Date.now() < deadline) {
    last = await look().catch(() => null)
    if (last !== null && ready(last)) return last
    await sleep(300)
  }
  return last
}

// ---------------------------------------------------------------------------- 1. the window and the office

const state = await until(
  () => /** @type {Promise<{ officeAddress: string | null } | null>} */ (inTheWindow('globalThis.theMoleOfficeWindow?.state() ?? null')),
  (it) => it !== null && it.officeAddress !== null,
  150_000,
)
lock = existsSync(LOCK) ? /** @type {{ port: number, pgid: number }} */ (JSON.parse(readFileSync(LOCK, 'utf8'))) : null
const api = lock === null ? null : `http://127.0.0.1:${String(lock.port)}`
found('the window opens and the office answers', state?.officeAddress != null && api !== null, `the window shows ${String(state?.officeAddress)}; the service's lock ${lock === null ? 'is absent' : `names port ${String(lock.port)}`}`)
if (api === null || state?.officeAddress == null) await finish()
const office = /** @type {string} */ (api)
const address = String(state?.officeAddress)

/** @param {string} path @param {{ method?: string, body?: unknown }} [options] */
async function ask(path, options = {}) {
  const reply = await fetch(`${office}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: reply.status, body: /** @type {Record<string, any>} */ (await reply.json().catch(() => ({}))) }
}

// ---------------------------------------------------------------------------- 2. the holder

const holder = await until(async () => (await ask('/api/terminals')).body['holder'], (it) => it?.state === 'running', 30_000)
let holderRuns = null
let holderArgs = ''
if (typeof holder?.pid === 'number') {
  holderGroup = holder.pid
  process.stdout.write(`NOTE ${NAME} the holder is process ${String(holder.pid)}, its own process group\n`)
  try {
    holderRuns = readlinkSync(`/proc/${String(holder.pid)}/exe`)
    holderArgs = readFileSync(`/proc/${String(holder.pid)}/cmdline`, 'utf8').split('\0').filter(Boolean).slice(1, 2).join(' ')
  } catch (err) {
    holderRuns = `unreadable (${String(err)})`
  }
}
found(
  'the service started the bundled holder on the installation\'s Node',
  holder?.state === 'running' && typeof holderRuns === 'string' && isTheInstallationsOwnNode(holderRuns) && holderArgs.endsWith('/resources/office/holder.mjs'),
  `the office says the holder is ${String(holder?.state)}; process ${String(holder?.pid)} runs ${String(holderRuns)} ${holderArgs}`,
)

// ---------------------------------------------------------------------------- 3 and 4. the agent and its terminal

try {
await theSteps()
} catch (err) {
  found('the run went on to the end', false, `it stopped: ${err instanceof Error ? err.message : String(err)}`)
  await whatThePageShows('stopped')
}
await finish()

/** What the page shows, written beside the findings, when a step fails. @param {string} why */
async function whatThePageShows(why) {
  try {
    const seen = await inThePage("JSON.stringify({ at: location.href, text: document.body.innerText.slice(0, 3000) })")
    writeFileSync(join(OUT_FOLDER, `${NAME}-terminal-page-${why}.json`), String(seen))
    const png = /** @type {string} */ (await inTheWindow(`${WIN}.webContents.capturePage().then((image) => image.toPNG().toString('base64'))`))
    writeFileSync(join(OUT_FOLDER, 'pictures', `${NAME}-terminal-page-${why}.png`), Buffer.from(png, 'base64'))
  } catch (err) {
    process.stdout.write(`NOTE ${NAME} what the page showed could not be read: ${String(err)}\n`)
  }
}

async function theSteps() {
// THE CHECK PAGE WAITS FOR OPEN when the window runs without Chromium's sandbox (src/desktop/main.mjs), and Open is
// pressed as tests/installed/drive-the-window.mjs presses it. A refused load is noted, and the page that follows is judged.
const checked = await until(
  () => inTheWindow('globalThis.theMoleOfficeWindow?.state() ?? null'),
  (it) => it !== null && ((it.check.answer !== null && !it.check.busy) || it.showing?.url.startsWith('http') === true),
  60_000,
)
if (checked?.check.offers?.includes('openTheOffice')) {
  process.stdout.write(`NOTE ${NAME} the check page waits for Open, and Open is pressed\n`)
  await inTheWindow('globalThis.theMoleOfficeWindow.openTheOffice()').catch((err) => {
    process.stdout.write(`NOTE ${NAME} the load Open started was refused part way: ${String(err instanceof Error ? err.message : err).slice(0, 300)}\n`)
  })
}
// A FRESH OFFICE ASKS THE PERSON'S NAME FIRST (src/web/pages/WelcomePage.tsx). It is typed and sent on that page.
await until(() => inThePage("!!document.querySelector('.wlc-input')"), (it) => it === true, 60_000)
await inThePage("const box = document.querySelector('.wlc-input'); box.focus(); box.select(); true")
await inTheWindow(`${WIN}.webContents.insertText('Terminal Tester')`)
await inThePage("document.querySelector('.wlc-form button[type=submit]').click(); true")
const named = await until(() => inThePage("!document.querySelector('.wlc-form')"), (it) => it === true, 30_000)
found('the welcome page takes a name', named === true, named === true ? 'the page went on to the office after Open my office' : 'the welcome form is still showing')
const started = await ask('/api/agents/started', { method: 'POST', body: { handle: 'terminal-proof', name: 'Terminal proof', runtime: 'claude-code' } })
const agentId = String(started.body['agent']?.id)
const folder = await ask('/api/participants/agent/terminal-proof/start-folder', { method: 'POST', body: { startFolder: yard, because: 'The installed terminal test: its terminal opens here' } })
found('an agent is registered with a start folder', started.status === 201 && folder.status === 200, `registered ${String(started.status)} (${agentId}); start folder ${String(folder.status)} ${yard}`)

/** Open the agent's profile page in the window, in a language. @param {'en' | 'zh'} lang */
async function theProfile(lang) {
  const where = new URL(address)
  if (lang === 'zh') where.searchParams.set('lang', 'zh')
  else where.searchParams.delete('lang')
  where.hash = `/who/agent/${agentId}`
  await inTheWindow(`${WIN}.webContents.loadURL(${JSON.stringify(where.href)})`)
  return until(() => inThePage("!!document.querySelector('.tm-prof-open button')"), (it) => it === true, 60_000)
}

if ((await theProfile('en')) !== true) throw new Error("the profile page never showed the open press")
await inThePage("document.querySelector('.tm-prof-open button').click(); true")
const opened = await until(
  async () => /** @type {any[]} */ ((await ask('/api/terminals')).body['terminals'] ?? []).find((one) => one.agent?.id === agentId && one.state === 'running'),
  (it) => it !== undefined,
  30_000,
)
found(
  "the agent's terminal opens from its profile page",
  opened !== undefined && opened !== null && String(opened.command).endsWith('/claude') && opened.folder === yard,
  `terminal ${String(opened?.id)} runs ${String(opened?.command)} ${JSON.stringify(opened?.args ?? null)} in ${String(opened?.folder)}, which is the stand-in for Claude Code`,
)

// ---------------------------------------------------------------------------- 5. echo 你好, in each language

/** The terminal's screen as the page draws it, one string per row. */
const theScreen = () => /** @type {Promise<string[]>} */ (inThePage("[...document.querySelectorAll('.xterm-rows > div')].map((row) => row.textContent ?? '')"))

/** Send one command of Chromium's DevTools protocol to the office's page. @param {string} method @param {object} params */
const toThePage = (method, params) =>
  inTheWindow(`(() => { const d = ${WIN}.webContents.debugger; if (!d.isAttached()) d.attach('1.3'); return d.sendCommand(${JSON.stringify(method)}, ${JSON.stringify(params)}).then(() => true) })()`)

/**
 * Type `echo 你好` and Enter into the open terminal view: `echo ` as key presses, then 你好 as an input method gives it,
 * composed from "ni hao" and then committed (Input.imeSetComposition, then Input.insertText), then Enter.
 */
async function typeIt() {
  await inThePage("document.querySelector('.xterm-helper-textarea').focus(); true")
  for (const key of 'echo ') {
    await toThePage('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, unmodifiedText: key })
    await toThePage('Input.dispatchKeyEvent', { type: 'keyUp', key })
  }
  for (const text of ['n', 'ni', 'ni h', 'ni hao', '你好']) {
    await toThePage('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
  }
  await toThePage('Input.insertText', { text: '你好' })
  await sleep(300)
  await toThePage('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' })
  await toThePage('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

for (const lang of /** @type {const} */ (['en', 'zh'])) {
  await inTheWindow(`${WIN}.setContentSize(1440, ${String(HEIGHT)})`)
  // The view is open after the press (English); on a page loaded again it is opened by its row.
  if ((await theProfile(lang)) !== true) throw new Error(`the ${lang} profile page never showed the open press`)
  if (lang === 'zh') await inThePage("document.querySelector('.tm-prof-press').click(); true")
  await until(() => inThePage("!!document.querySelector('.xterm-helper-textarea')"), (it) => it === true, 30_000)
  const before = (await theScreen()).filter((row) => row.trim() === '你好').length
  await typeIt()
  const screen = await until(theScreen, (rows) => rows.filter((row) => row.trim() === '你好').length > before, 15_000)
  const answered = (screen ?? []).filter((row) => row.trim() === '你好').length > before
  const shown = (screen ?? []).map((row) => row.trimEnd()).filter(Boolean).slice(-4)
  found(`echo 你好 comes back, on the ${lang === 'en' ? 'English' : 'Chinese'} page`, answered, `the terminal's last rows: ${JSON.stringify(shown)} (bash answering in the stand-in for Claude Code)`)

  if (PICTURES) {
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      await inTheWindow(`require('electron').nativeTheme.themeSource = '${theme}'`)
      for (const width of WIDTHS) {
        await inTheWindow(`${WIN}.setContentSize(${String(width)}, ${String(HEIGHT)})`)
        await sleep(900)
        const size = /** @type {number[]} */ (await inTheWindow(`${WIN}.getContentSize()`))
        await inThePage("document.querySelector('.xterm')?.scrollIntoView({ block: 'center' }); true")
        await sleep(300)
        const png = /** @type {string} */ (await inTheWindow(`${WIN}.webContents.capturePage().then((image) => image.toPNG().toString('base64'))`))
        const file = join(OUT_FOLDER, 'pictures', `${NAME}-terminal-${String(width)}-${theme}-${lang}.png`)
        writeFileSync(file, Buffer.from(png, 'base64'))
        process.stdout.write(`NOTE ${NAME} picture ${file}: asked ${String(width)}x${String(HEIGHT)}, the window's page is ${size.join('x')}\n`)
      }
    }
    await inTheWindow("require('electron').nativeTheme.themeSource = 'light'")
  }
}
}

// ---------------------------------------------------------------------------- 7. shut down

async function finish() {
  const before = lock
  if (windowEnded === null) {
    await inTheWindow("globalThis.theMoleOfficeWindow.press('shutDown')")
    const asked = await inTheWindow('globalThis.theMoleOfficeWindow.shutDownQuestion() !== null')
    if (!asked) throw new Error('the menu did not show its question')
    await inTheWindow("globalThis.theMoleOfficeWindow.answerTheShutDownQuestion('yes')").catch(() => undefined)
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline && existsSync(LOCK)) await sleep(250)
    try {
      socket.close()
    } catch {
      // Not open.
    }
    while (Date.now() < deadline + 30_000 && windowEnded === null) await sleep(250)
  }
  if (before !== null) found('Shut down stops the service', windowEnded !== null && !existsSync(LOCK), `the window's program ${windowEnded === null ? 'is still running' : 'ended'}; the lock ${existsSync(LOCK) ? 'is still there' : 'is gone'}`)
  for (const [what, group] of /** @type {const} */ ([['window', windowGroup], ['service', lock?.pgid ?? null], ['holder', holderGroup]])) {
    if (group === null || !alive(group)) {
      process.stdout.write(`NOTE ${NAME} the ${what}'s process group ${String(group)} had ended by itself\n`)
      continue
    }
    try {
      process.kill(-group, 'SIGTERM')
      process.stdout.write(`NOTE ${NAME} the ${what}'s process group ${String(group)} was stopped with SIGTERM\n`)
    } catch (err) {
      process.stdout.write(`NOTE ${NAME} the ${what}'s process group ${String(group)} could not be stopped: ${String(err)}\n`)
    }
  }
  writeFileSync(join(OUT_FOLDER, `${NAME}-terminal.json`), `${JSON.stringify({ name: NAME, findings }, null, 2)}\n`)
  const failed = findings.filter((one) => !one.passed).length
  process.stdout.write(`${NAME} terminal: ${String(findings.length - failed)} of ${String(findings.length)} findings passed.\n`)
  process.exit(failed === 0 && findings.length > 0 ? 0 : 1)
}
