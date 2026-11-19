// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * DRIVE AN INSTALLED MOLE OFFICE WINDOW ON A MACHINE WITH NO NODE AND NO PLAYWRIGHT. Wave 13t,
 * round 13: the Linux installers that carry their own Node.
 *
 * It is run by the app's own program, told to run as Node (ELECTRON_RUN_AS_NODE=1), because the
 * machine has no other, and it needs nothing but that Node: it reaches the window's main process
 * through Electron's inspector, with Node's own WebSocket, and calls the hook src/desktop/main.mjs
 * keeps for tests (`globalThis.theMoleOfficeWindow`).
 *
 *   node drive-the-window.mjs --app <program> --name <deb|appimage> --lang <en|zh> --out <folder>
 *                             [--pictures] [--expect-fresh] [-- <more arguments for the program>]
 *
 * WHAT ONE RUN SHOWS, each written as one finding with what was seen:
 *   1. the window opens: its main process answers and its check page has lines;
 *   2. the service starts: its lock is in the per-user data folder (~/.config/mole-office/data), and
 *      the process the lock names runs on the installation's own Node, not on any other;
 *   3. the self-check passes: the window's answer is `healthy`, and /api/health says ok;
 *   4. closing the window hides it: the window is no longer visible, the window's program is still
 *      running, and the office still answers;
 *   5. Shut down stops the service: the window's program ends, the lock is gone, the service's process
 *      has ended and the port no longer answers.
 *
 * With --pictures it also writes the check page and the office, light and dark, and the tray's items.
 * It exits 0 only when every finding passed.
 *
 * ROUND 14. A picture is taken only once the page has drawn what it should, read from the page
 * itself: the check page shows as many lines as the window says, in the look asked for (its
 * background is the office's own colour for that look), and an office page shows its text. Round 13
 * waited 300 ms after loading, and one Chinese picture caught the page before it had its style.
 *
 * WITHOUT CHROMIUM'S SANDBOX the window says so at the end of its check page and opens a healthy
 * office only when Open is pressed. The driver pictures that warning, light and dark, and then presses
 * Open as a person does.
 *
 * ROUND 19. A window it pictures is started with --disable-dev-shm-usage: a picture through a container's
 * small /dev/shm ended the program (problem TKH0KMph-bMR). The driver says so in a NOTE.
 *
 * ROUND 19b. The window's inspector port is one the system says is free, not 9229: two test files that run
 * this driver side by side met at 9229 (the inspector's check n9aXRJuZT_a5).
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { THE_WINDOW_MAY_BE_DEBUGGED, aFreePort, aPlainEnvironment, askUntil, isTheInstallationsOwnNode } from './ask-until.mjs'

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
const LANG = value('--lang') ?? 'en'
const OUT = value('--out')
const PICTURES = own.includes('--pictures')
if (APP === null || NAME === null || OUT === null) {
  process.stderr.write('usage: drive-the-window.mjs --app <program> --name <name> --lang <en|zh> --out <folder> [--pictures] [-- <arguments>]\n')
  process.exit(2)
}
const OUT_FOLDER = OUT

const HOME = String(process.env['HOME'])
const DATA = join(HOME, '.config', 'mole-office', 'data')
const LOCK = join(DATA, 'mole-office.db.service.json')
// Asked of the system, so two drivers running at once do not meet at one port (round 19b).
const INSPECT_PORT = await aFreePort()
const sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms))
mkdirSync(join(OUT, 'pictures'), { recursive: true })

/** @type {{ step: string, passed: boolean, saw: string }[]} */
const findings = []
/** @param {string} step @param {boolean} passed @param {string} saw */
const found = (step, passed, saw) => {
  findings.push({ step, passed, saw })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${NAME} ${LANG} ${step}: ${saw}\n`)
}

/** Is a process with this pid still there? @param {number} pid */
const alive = (pid) => existsSync(`/proc/${String(pid)}`)

/**
 * Whether the window's main process runs with Chromium's sandbox: found among this user's processes as
 * the one whose program file is named mole-office and that is no helper (no --type=).
 */
function whetherTheSandboxIsOn() {
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    let words
    let program
    try {
      // Chromium rewrites its own command line as one string, so it is split at spaces as well as at NULs.
      words = readFileSync(`/proc/${entry}/cmdline`, 'utf8').split(/[\0 ]/).filter(Boolean)
      program = readlinkSync(`/proc/${entry}/exe`)
    } catch {
      continue
    }
    if (!program.endsWith('/mole-office') || words.some((word) => word.startsWith('--type='))) continue
    const line = words.join(' ').slice(0, 200)
    return words.includes('--no-sandbox') ? `off (process ${entry} runs with --no-sandbox: ${line})` : `on (process ${entry} runs without --no-sandbox: ${line})`
  }
  return 'not known (the window\'s main process was not found)'
}

// ---------------------------------------------------------------------------- the window's program

// ANYTHING THE DRIVER DID NOT EXPECT ends the run through finish(), which stops the window and the
// service it started. In round 14's first container run an uncaught refusal left both running, and the
// next installer met that office at the same port.
process.on('unhandledRejection', (err) => {
  found('the driver ran to its end', false, String(err instanceof Error ? err.message : err).slice(0, 500))
  finish()
})

// PICTURES KEEP OUT OF /dev/shm (round 19; problem TKH0KMph-bMR). Without Chromium's sandbox a picture comes
// back from the GPU process through a file in /dev/shm, and a container's /dev/shm is 64 MB, of which the
// window alone uses about 45 MB. When a picture does not fit, the browser refuses it, kills the GPU process,
// and ends the program on the third time. So a window this driver pictures keeps that memory in /tmp.
const PICTURE_MEMORY = PICTURES ? ['--disable-dev-shm-usage'] : []
if (PICTURES) process.stdout.write(`NOTE ${NAME} ${LANG} the window is started with --disable-dev-shm-usage, because it is pictured (problem TKH0KMph-bMR)\n`)
const log = openSync(join(OUT, `${NAME}-${LANG}-window.log`), 'a')
const window = spawn(APP, [...more, ...PICTURE_MEMORY, `--inspect=${String(INSPECT_PORT)}`, `--lang=${LANG === 'zh' ? 'zh-CN' : 'en-US'}`], {
  // Nothing of the shell's office passes to the window, or to the office it starts (problem JQ3yaANBi1JC).
  // The one setting it is given lets it start with the inspector this driver reaches it through.
  env: { ...aPlainEnvironment(process.env), ...THE_WINDOW_MAY_BE_DEBUGGED },
  stdio: ['ignore', log, log],
  detached: true,
})
const windowPid = /** @type {number} */ (window.pid)
let windowEnded = /** @type {{ code: number | null, signal: string | null } | null} */ (null)
window.on('exit', (code, signal) => {
  windowEnded = { code, signal }
})

// ---------------------------------------------------------------------------- the inspector

/** The main process's inspector, found by its list. */
async function theInspector() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (windowEnded !== null) return null
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

/** @type {WebSocket | null} */
let socket = null
/** Whether Chromium's sandbox is on, once the window has opened. @type {string | null} */
let sandbox = null
const url = await theInspector()
if (url === null) {
  found('the window opens', false, `its main process never answered on the inspector (it ended: ${JSON.stringify(windowEnded)}); see ${NAME}-${LANG}-window.log`)
  finish()
}
const connected = new WebSocket(/** @type {string} */ (url))
socket = connected
await new Promise((done, fail) => {
  connected.addEventListener('open', done, { once: true })
  connected.addEventListener('error', fail, { once: true })
})
let nextId = 1
/** @type {Map<number, (reply: any) => void>} */
const waiting = new Map()
connected.addEventListener('message', (event) => {
  const reply = JSON.parse(String(event.data))
  if (typeof reply.id === 'number') waiting.get(reply.id)?.(reply)
})

/** Evaluate an expression in the window's main process and give back its value. @param {string} expression */
function inTheWindow(expression) {
  const id = nextId++
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`no answer to ${expression}`)), 30_000)
    waiting.set(id, (reply) => {
      clearTimeout(timer)
      if (reply.error || reply.result?.exceptionDetails) fail(new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails)))
      else done(reply.result?.result?.value)
    })
    connected.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
}

/** The window's state, once its hook is there. */
async function theState() {
  return /** @type {{ check: { lines: unknown[], answer: string | null, busy: boolean, offers: string[] }, officeAddress: string | null, about?: string, visible: boolean, showing: { url: string, loading: boolean } | null } | null} */ (
    await inTheWindow('globalThis.theMoleOfficeWindow?.state() ?? null')
  )
}

/** Write a picture of what the window shows. @param {string} what */
async function aPicture(what) {
  if (!PICTURES) return
  // A page that has not been drawn yet has nothing to capture, so a picture is asked for a few times.
  let last = null
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const png = await inTheWindow('globalThis.theMoleOfficeWindow.picture()')
      if (typeof png !== 'string') throw new Error('the window gave no picture')
      writeFileSync(join(OUT_FOLDER, 'pictures', `${NAME}-${LANG}-${what}.png`), Buffer.from(png, 'base64'))
      return
    } catch (err) {
      last = err
      await sleep(400)
    }
  }
  found(`a picture of ${what}`, false, String(last instanceof Error ? last.message : last))
}

/**
 * THE OFFICE'S OWN BACKGROUND IN EACH LOOK (--bg in src/web/tokens.css), as a page reports it. The check
 * page reads the same tokens, so in either look it is drawn in these colours or it is not drawn yet.
 */
const BACKGROUND = { light: 'rgb(243, 239, 228)', dark: 'rgb(9, 9, 11)' }

/**
 * Wait until the window shows a page that has drawn itself: the check page with every line the window
 * says, in this look; or an office page with its text, in this look. Gives back what it last saw.
 *
 * @param {'check' | 'office'} which @param {'light' | 'dark'} look
 */
async function untilDrawn(which, look, ms = 30_000) {
  // EACH ASK HAS 5 SECONDS OF ITS OWN (round 16): in round 15 the GPU process exited after a picture, the
  // next ask hung for the whole 30 seconds, and the probe never asked again. ask-until.mjs says more.
  const asked = await askUntil({
    ask: async () => ({ drawn: await inTheWindow('globalThis.theMoleOfficeWindow.drawn()'), state: await theState().catch(() => null) }),
    right: ({ drawn, state }) =>
      drawn !== null &&
      drawn.background === BACKGROUND[look] &&
      (which === 'check'
        ? drawn.url.startsWith('file:') && state !== null && drawn.lines === state.check.lines.length
        : drawn.url.startsWith('http') && drawn.text > 40),
    waitMs: ms,
    eachAskMs: 5_000,
  })
  const last = asked.last !== null && 'drawn' in asked.last ? asked.last.drawn : asked.last
  const unanswered = asked.unanswered === 0 ? '' : `; ${String(asked.unanswered)} of ${String(asked.asked)} asks had no answer within 5 seconds and were asked again`
  if (asked.right) {
    if (unanswered !== '') process.stdout.write(`NOTE ${NAME} ${LANG} the ${which} page drawn in the ${look} look${unanswered}\n`)
    await sleep(200)
    return last
  }
  found(`the ${which} page drawn in the ${look} look`, false, `it last showed ${JSON.stringify(last)}${unanswered}`)
  return last
}

/**
 * Press Open on the check page, as the person does, when the window offers it. Electron refuses the
 * load's promise when the load is stopped part way (round 14's first container run met ERR_FAILED in
 * Chinese), so the refusal is noted and what the window then shows is what is judged.
 */
async function openWhenOffered() {
  const state = await until((one) => one.check.answer !== null && !one.check.busy || one.showing?.url.startsWith('http') === true)
  if (!state?.check.offers?.includes('openTheOffice')) return
  await inTheWindow('globalThis.theMoleOfficeWindow.openTheOffice()').catch((err) => {
    process.stdout.write(`NOTE ${NAME} ${LANG} the load Open started was refused part way: ${String(err instanceof Error ? err.message : err).slice(0, 300)}\n`)
  })
}

/** Wait until the state says what `ready` asks, for up to `ms`. @param {(state: any) => boolean} ready */
async function until(ready, ms = 120_000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await theState().catch(() => null)
    if (last !== null && ready(last)) return last
    await sleep(250)
  }
  return last
}

// ---------------------------------------------------------------------------- 1. the window opens

await inTheWindow("globalThis.theMoleOfficeWindow?.look('light')").catch(() => undefined)
const first = await until((state) => state.check.lines.length > 0, 60_000)
if (PICTURES) {
  // THE FIRST START'S CHECK PAGE, light and then dark, while the office starts. Round 14's first
  // container run took the dark one after the tray's Restart, and a sandboxed window had already gone
  // on to the office.
  await untilDrawn('check', 'light')
  await aPicture('check-light')
  await inTheWindow("globalThis.theMoleOfficeWindow.look('dark')")
  await untilDrawn('check', 'dark')
  await aPicture('check-dark')
  await inTheWindow("globalThis.theMoleOfficeWindow.look('light')")
}
found('the window opens', first !== null && first.check.lines.length > 0, `its check page says: ${JSON.stringify(first?.check.lines ?? null)}`)
// THE VERSION this window is, as its About line says it (decision sKPFWjOuQVEe; round 15).
process.stdout.write(`NOTE ${NAME} ${LANG} the About line: ${String(first?.about ?? 'not read')}\n`)

// WHETHER CHROMIUM'S SANDBOX IS ON, read from the running window's own command line. It is noted and not
// passed or failed: an AppImage's launcher adds --no-sandbox by itself where user namespaces are refused.
sandbox = whetherTheSandboxIsOn()
process.stdout.write(`NOTE ${NAME} ${LANG} Chromium's sandbox: ${sandbox}\n`)

// ---------------------------------------------------------------------------- 2 and 3. the service and the self-check

const settled = await until((state) => state.check.answer !== null && !state.check.busy || state.officeAddress !== null)
const answered = await until((state) => state.officeAddress !== null || (state.check.answer !== null && !state.check.busy))
// WITHOUT THE SANDBOX the window holds a healthy office on its check page, under the warning.
const held = answered?.check.offers?.includes('openTheOffice') === true
const warned = JSON.stringify(answered?.check.lines ?? []).includes('--no-sandbox')
process.stdout.write(`NOTE ${NAME} ${LANG} the check page ${warned ? 'warns' : 'does not warn'} that the sandbox is off, and ${held ? 'waits for Open' : 'opened the office by itself'}\n`)
found('the self-check passes', answered?.check.answer === 'healthy', `the window's answer is ${String(answered?.check.answer)}; it says ${JSON.stringify(answered?.check.lines ?? settled?.check.lines ?? null)}`)

const lock = existsSync(LOCK) ? /** @type {{ pid: number, pgid: number, port: number }} */ (JSON.parse(readFileSync(LOCK, 'utf8'))) : null
const servicePid = lock?.pid ?? null
let runsOn = null
try {
  runsOn = servicePid === null ? null : readlinkSync(`/proc/${String(servicePid)}/exe`)
} catch (err) {
  runsOn = `unreadable (${String(err)})`
}
// THE INSTALLATION'S OWN NODE: on Linux the app's own program, beside resources/ (isTheInstallationsOwnNode in
// ask-until.mjs). An AppImage unpacks itself into a folder of its own each time, so no one path is expected.
found(
  "the service starts on the per-user data folder, on the installation's own Node",
  lock !== null && typeof runsOn === 'string' && isTheInstallationsOwnNode(runsOn),
  `lock ${existsSync(LOCK) ? LOCK : 'absent'}; the service is process ${String(servicePid)}, running ${String(runsOn)}`,
)
let health = null
try {
  health = lock === null ? null : await (await fetch(`http://127.0.0.1:${String(lock.port)}/api/health`)).json()
} catch (err) {
  health = { error: String(err) }
}
found('the office says it is healthy', health?.ok === true, `GET /api/health at port ${String(lock?.port)} said ${JSON.stringify(health).slice(0, 300)}`)

if (PICTURES && held) {
  // THE WARNING, light and dark, as the person sees it before pressing Open.
  await untilDrawn('check', 'light')
  await aPicture('warning-light')
  await inTheWindow("globalThis.theMoleOfficeWindow.look('dark')")
  await untilDrawn('check', 'dark')
  await aPicture('warning-dark')
  await inTheWindow("globalThis.theMoleOfficeWindow.look('light')")
}
await openWhenOffered()
if (PICTURES) {
  await untilDrawn('office', 'light', 60_000)
  await aPicture('office-light')
  await inTheWindow("globalThis.theMoleOfficeWindow.look('dark')")
  await untilDrawn('office', 'dark')
  await aPicture('office-dark')
  writeFileSync(join(OUT, 'pictures', `${NAME}-${LANG}-tray.json`), `${JSON.stringify(await inTheWindow('globalThis.theMoleOfficeWindow.trayItems()'), null, 2)}\n`)
  await inTheWindow("globalThis.theMoleOfficeWindow.look('light')")
}

// ---------------------------------------------------------------------------- 4. closing hides it

await inTheWindow('globalThis.theMoleOfficeWindow.closeTheWindow()')
const hidden = await until((state) => state.visible === false, 15_000)
let stillAnswering = false
try {
  const port = lock === null ? null : JSON.parse(readFileSync(LOCK, 'utf8')).port
  stillAnswering = port !== null && (await (await fetch(`http://127.0.0.1:${String(port)}/api/health`)).json()).ok === true
} catch {
  stillAnswering = false
}
found(
  'closing the window hides it',
  hidden?.visible === false && alive(windowPid) && stillAnswering,
  `visible ${String(hidden?.visible)}; the window's program ${alive(windowPid) ? 'is still running' : 'ended'}; the office ${stillAnswering ? 'still answers' : 'does not answer'}`,
)

// ---------------------------------------------------------------------------- 5. Shut down stops the service

const before = existsSync(LOCK) ? /** @type {{ pid: number, port: number }} */ (JSON.parse(readFileSync(LOCK, 'utf8'))) : null
await inTheWindow("globalThis.theMoleOfficeWindow.press('shutDown')")
const asked = await inTheWindow('globalThis.theMoleOfficeWindow.shutDownQuestion() !== null')
if (!asked) throw new Error('the menu did not show its question')
await inTheWindow("globalThis.theMoleOfficeWindow.answerTheShutDownQuestion('yes')").catch(() => undefined)
const deadline = Date.now() + 60_000
while (Date.now() < deadline && (existsSync(LOCK) || (before !== null && alive(before.pid)))) await sleep(250)
// ELECTRON WAITS FOR ITS INSPECTOR CLIENT TO LET GO BEFORE IT EXITS ("Waiting for the debugger to
// disconnect"), so the driver lets go once the service has stopped, and then waits for the window.
connected.close()
while (Date.now() < deadline + 30_000 && windowEnded === null) await sleep(250)
let portAnswers = false
try {
  portAnswers = before !== null && (await fetch(`http://127.0.0.1:${String(before.port)}/api/health`)).ok
} catch {
  portAnswers = false
}
found(
  'Shut down stops the service',
  windowEnded !== null && !existsSync(LOCK) && before !== null && !alive(before.pid) && !portAnswers,
  `the window's program ${windowEnded === null ? 'is still running' : `ended (${JSON.stringify(windowEnded)})`}; the lock ${existsSync(LOCK) ? 'is still there' : 'is gone'}; ` +
    `the service's process ${before === null ? 'was never known' : alive(before.pid) ? 'is still running' : 'has ended'}; its port ${portAnswers ? 'still answers' : 'no longer answers'}`,
)

finish()

function finish() {
  try {
    socket?.close()
  } catch {
    // Already closed with the window.
  }
  if (windowEnded === null && alive(windowPid)) {
    try {
      process.kill(-windowPid, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
  // AND THE SERVICE THE WINDOW STARTED, by the group its lock records, if it is still there.
  try {
    const left = existsSync(LOCK) ? /** @type {{ pgid: number }} */ (JSON.parse(readFileSync(LOCK, 'utf8'))) : null
    if (left !== null && alive(left.pgid)) {
      process.kill(-left.pgid, 'SIGTERM')
      process.stdout.write(`NOTE ${NAME} ${LANG} stopped the service the window left, group ${String(left.pgid)}\n`)
    }
  } catch {
    // Ended between the look and the signal, or the lock went as it was read.
  }
  writeFileSync(join(/** @type {string} */ (OUT), `${NAME}-${LANG}.json`), `${JSON.stringify({ name: NAME, lang: LANG, sandbox, findings }, null, 2)}\n`)
  const failed = findings.filter((one) => !one.passed).length
  process.stdout.write(`${NAME} ${LANG}: ${String(findings.length - failed)} of ${String(findings.length)} findings passed.\n`)
  process.exit(failed === 0 && findings.length > 0 ? 0 : 1)
}
