// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW OPENS THE OFFICE: Electron draws the built page, takes one picture of it, and loads
 * better-sqlite3 in its main process.
 *
 * This is the proof the standalone window starts from (wave 13t, piece H0; design/window/ACCEPTANCE.md).
 * It starts its own office with the `mole-office` command, on a database and a port of its own, opens
 * that office in an Electron window, waits for the page to say it is ready, and takes one picture
 * with Electron's own `capturePage`. Electron's main process also opens an in-memory database with
 * better-sqlite3, so the one native module the server needs is shown to load inside Electron
 * without a rebuild. At the end it closes Electron, and stops the office by the process group the
 * service lock recorded.
 *
 * IT ALSO OPENS THE OFFICE AS THE WINDOW DOES, IN ENGLISH AND IN CHINESE. Its main process calls the
 * window's one `markEveryPageOf` (src/config/the-window-mark.mjs), so the new office's pairing page
 * must say "Pair this window" and "配对这个窗口", and never call itself a browser. Its pictures are
 * kept at 1440, 990, 660 and 390, in light and dark, when MOLE_OFFICE_WINDOW_PICTURES names a folder.
 *
 * MUTATION: `markEveryPageOf` adds nothing (src/config/the-window-mark.mjs): this case goes red, and so
 * do the two window cases in tests/the-window-finds-its-office.test.ts.
 *
 * IT SKIPS, WITH ONE SENTENCE, IN TWO CASES, and never fails for either:
 *   - Electron's binary is not in node_modules. npm leaves it to `node node_modules/electron/install.js`,
 *     which the secretary runs on the host after the lock file that names Electron has landed. This test never
 *     downloads anything itself.
 *   - It was not started by `node tools/run-named-tests.mjs --list window`, which runs it under a
 *     virtual display. tests/the-window-display.ts says why: a window test must never open a window
 *     on a person's real screen.
 *
 * Electron runs with --no-sandbox, because Chromium's own sandbox exits 133 inside the office's
 * containers (a measurement of 1 October 2026 on the window image).
 *
 * The server serves only this checkout's dist/web, so this test needs `npm run build` to have run,
 * and fails with the build's own sentence when it has not.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import type { ElectronApplication, Page } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { executableOf, theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment, waitForThePage } from './helpers.ts'
import { electronsBinary, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** A folder named here keeps a copy of the picture this test takes, for a person to look at. */
const WINDOW_PICTURES_VARIABLE = 'MOLE_OFFICE_WINDOW_PICTURES'
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const requireHere = createRequire(import.meta.url)

const WHY_NOT = whyNoWindowOpensHere()
// Printed, so the skip and its reason are in the run's log and not only in a count of skipped tests.
if (WHY_NOT !== null) console.log(`the-window-opens-the-office: skipped. ${WHY_NOT}`)

/** Every process group this file started (the office), so `afterAll` can stop each one. */
const groups = new Set<number>()
/**
 * Every Electron this file started: the pid Playwright gave when it started it, and the binary it ran.
 * Playwright starts Electron detached on Linux and macOS, so that pid leads a process group of its
 * own, the same number. `afterAll` stops a leftover Electron by that group, and only while the
 * group's leader still runs this binary.
 */
const electrons = new Map<number, string>()
/** Every folder this file made. */
const folders = new Set<string>()

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/**
 * Electron's main process for this test. It loads better-sqlite3 from this checkout and keeps what
 * it read, then opens one window on the office's address.
 */
const THE_MAIN_PROCESS = `
const { app, BrowserWindow } = require('electron')
try {
  const Database = require(process.env.THE_SQLITE_MODULE)
  const db = new Database(':memory:')
  globalThis.theSqliteVersion = db.prepare('select sqlite_version() as v').get().v
  db.close()
} catch (err) {
  globalThis.theSqliteError = String(err && err.message ? err.message : err)
}
app.whenReady().then(async () => {
  // The office opened from Electron is the window, so it carries the window's one mark, set by the
  // one function the window itself calls (src/config/the-window-mark.mjs).
  const { markEveryPageOf } = await import(process.env.THE_WINDOW_MARK_MODULE)
  markEveryPageOf(app)
  const window = new BrowserWindow({ width: 1280, height: 800, show: true })
  window.loadURL(process.env.THE_OFFICE_ADDRESS)
})
`

/** The four widths chapter 6 asks every screen to be looked at in. */
const PICTURE_WIDTHS = [1440, 990, 660, 390] as const

/**
 * THE PROOF THIS TEST WAS WRITTEN FOR: one picture with Electron's own capturePage, and
 * better-sqlite3 loaded in Electron's main process.
 */
async function theOnePictureAndTheDatabase(electron: ElectronApplication, dir: string): Promise<void> {
  const picture = await electron.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0]?.capturePage()
    if (image === undefined) return null
    const size = image.getSize()
    return { width: size.width, height: size.height, png: image.toPNG().toString('base64') }
  })
  expect(picture, 'capturePage gave a picture').not.toBeNull()
  expect(picture?.width ?? 0).toBeGreaterThan(0)
  expect(picture?.height ?? 0).toBeGreaterThan(0)
  const png = Buffer.from(picture?.png ?? '', 'base64')
  expect(png.subarray(0, 8).toString('hex'), 'the picture is a PNG').toBe('89504e470d0a1a0a')
  writeFileSync(join(dir, 'the-window.png'), png)
  // The test's own folder is removed at the end. A person who wants to look at the picture names a
  // folder of their own in MOLE_OFFICE_WINDOW_PICTURES, and the picture is kept there as well.
  const keepIn = process.env[WINDOW_PICTURES_VARIABLE]
  if (keepIn !== undefined && keepIn !== '') {
    mkdirSync(keepIn, { recursive: true })
    const kept = join(keepIn, 'the-window-opens-the-office.png')
    writeFileSync(kept, png)
    expect(readFileSync(kept).equals(png), 'the kept picture is the one capturePage gave').toBe(true)
    console.log(`the-window-opens-the-office: the picture capturePage took (${String(picture?.width)} by ${String(picture?.height)}) is kept at ${kept}.`)
  }

  const sqlite = await electron.evaluate(() => ({
    version: (globalThis as { theSqliteVersion?: string }).theSqliteVersion ?? null,
    error: (globalThis as { theSqliteError?: string }).theSqliteError ?? null,
  }))
  expect(sqlite.error, 'better-sqlite3 loaded in Electron').toBeNull()
  expect(sqlite.version ?? '').toMatch(/^3\.\d+\.\d+$/)
}

/** The page at 1440, 990, 660 and 390, in light and dark, when MOLE_OFFICE_WINDOW_PICTURES names a folder. */
async function picturesAtEveryWidth(electron: ElectronApplication, page: Page, name: string): Promise<void> {
  const keepIn = process.env[WINDOW_PICTURES_VARIABLE]
  if (keepIn === undefined || keepIn === '') return
  mkdirSync(keepIn, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    for (const width of PICTURE_WIDTHS) {
      await electron.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900)
      }, width)
      await new Promise((done) => setTimeout(done, 400))
      writeFileSync(join(keepIn, `${name}-${String(width)}-${theme}.png`), await page.screenshot({ fullPage: true }))
    }
  }
}

afterAll(async () => {
  // An Electron that `electron.close()` did not end is stopped by its process group, whose id is the
  // pid recorded at its start. The group is signalled only while its leader still runs the Electron
  // binary this test started, so a pid the system has given to another program since is never
  // signalled. If the leader has already ended, nothing proves the group is still this test's, and it
  // is left alone.
  const stillOurs = (pid: number): boolean => {
    const binary = electrons.get(pid)
    const running = executableOf(pid)
    return binary !== undefined && running !== null && running === realpathSync(binary)
  }
  const leftover = [...electrons.keys()].filter(stillOurs)
  for (const group of leftover) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const electronDeadline = Date.now() + 5_000
  while (leftover.some(stillOurs) && Date.now() < electronDeadline) await sleep(200)
  for (const group of leftover.filter(stillOurs)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  // Every group still running is asked to stop, by the id recorded when it was started, and given
  // the server's own shutdown time. Only if it is still there after that is it killed.
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 40_000)

describe('the window opens the office', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  it('draws the built page, takes one picture with capturePage, and loads better-sqlite3 in Electron', async () => {
    const missing = missingWebBuild(THE_BUILT_PAGE)
    if (missing !== null) throw new Error(`This test starts the office in production, which serves the built page. ${missing}`)
    const binary = electronsBinary()
    if ('missing' in binary) throw new Error(binary.missing)

    // An office of its own: its own folder, database, home and port.
    const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}window-opens-`)
    folders.add(dir)
    const home = join(dir, 'home')
    mkdirSync(home)
    const database = join(dir, 'office.db')
    const port = await aFreePort()
    const env: NodeJS.ProcessEnv = {
      ...devStackEnvironment(dir, port, await aFreePort(), { database }),
      HOME: home,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
    }
    const started = await new Promise<{ code: number | null; out: string }>((done) => {
      const child = spawn(process.execPath, [THE_COMMAND, 'start'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (chunk) => (out += String(chunk)))
      child.stderr.on('data', (chunk) => (out += String(chunk)))
      child.on('close', (code) => {
        // Recorded first, before any assertion can fail: the server the lock names is ours to stop.
        const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: database }))
        if (lock.state === 'read') groups.add(lock.lock.pgid)
        done({ code, out })
      })
    })
    expect(started.code, started.out).toBe(0)

    // Electron, in a group of its own, through Playwright: once in English and once in Chinese.
    const main = join(dir, 'main.cjs')
    writeFileSync(main, THE_MAIN_PROCESS)
    const { _electron } = await import('playwright')
    for (const [lang, pairThisWindow, aBrowser] of [
      [undefined, 'Pair this window', /this browser/i],
      ['zh-CN', '配对这个窗口', /浏览器/],
    ] as const) {
      const electron = await _electron.launch({
        executablePath: binary.path,
        args: ['--no-sandbox', ...(lang === undefined ? [] : [`--lang=${lang}`]), main],
        env: {
          ...(process.env as Record<string, string>),
          HOME: home,
          THE_OFFICE_ADDRESS: `http://127.0.0.1:${String(port)}/`,
          THE_SQLITE_MODULE: requireHere.resolve('better-sqlite3'),
          THE_WINDOW_MARK_MODULE: pathToFileURL(join(REPO, 'src', 'config', 'the-window-mark.mjs')).href,
        },
        timeout: 60_000,
      })
      const electronPid = electron.process().pid
      if (electronPid !== undefined) electrons.set(electronPid, binary.path)
      try {
        const page = await electron.firstWindow()
        await waitForThePage(page)
        expect(await page.title()).toBe('Mole Office')
        // A new office asks to be paired, and from Electron it calls itself a window, never a browser
        // (the review of round 9 of wave 13t, on this test's own picture).
        await page.getByText(pairThisWindow, { exact: true }).first().waitFor({ timeout: 60_000 })
        expect(await page.getByText(aBrowser).count()).toBe(0)
        if (lang === undefined) await theOnePictureAndTheDatabase(electron, dir)
        await picturesAtEveryWidth(electron, page, `the-window-opens-the-office-${lang === undefined ? 'en' : 'zh'}`)
      } finally {
        await electron.close()
      }
    }
  }, 180_000)
})
