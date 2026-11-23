// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PDF DOOR'S REFUSALS, THE PROGRAM IT STARTS, AND WHEN IT TURNS CHROMIUM'S SANDBOX OFF.
 *
 * POST /api/report-pdf prints a report's page with the app's own window program. This file checks what
 * can be checked without opening a window. tests/the-window-program-prints-a-page-as-a-pdf.test.ts opens
 * one and checks the print itself.
 *
 *   3. A PAGE PAST THE LIMIT is refused with 413 and reportPdfTooLarge, with the limit in megabytes, and
 *      no print folder is left.
 *   4. ON LINUX WITH NO SCREEN AND NO XVFB-RUN, neither DISPLAY nor WAYLAND_DISPLAY set and PATH a
 *      made-up empty folder, the door refuses with 409 and reportPdfNoDisplay, before it writes or starts
 *      anything, and no print folder is left. The three variables are put back whatever happens.
 *   5. THE INSTALL'S WINDOW PROGRAM, from `theInstallsWindowProgram` in src/config/settings.mjs: Electron
 *      and the window's entry in a checkout, the bundle's own program on the Mac, on Windows and on Linux,
 *      and a refusal that names any other system. Every root here is made up, and no file of it exists.
 *   6. THE SANDBOX RULE: on Linux the print turns Chromium's sandbox off only when the system refuses user
 *      namespaces and chrome-sandbox is not owned by root with its setuid bit. Every reading here is made
 *      up, and none is read from this machine.
 *   7. THE DISPLAY RULE, `theDisplayThePrintUses`: on Linux the print uses the office's own screen when
 *      DISPLAY or WAYLAND_DISPLAY names one, xvfb-run at the path it was found at when neither does, and
 *      none when xvfb-run was not found either. An empty variable names no screen. On the Mac and on
 *      Windows the print always uses its own screen. Every reading here is made up.
 *   9. WHAT A PRINT GAVE, `whatThePrintGave`: the PDF's bytes when the program ended with 0 and wrote a PDF, and
 *      otherwise the refusal that names how the print ended, each with status 500 and its own code and values.
 *      The program's last line is read from stderr first and then from stdout, and is cut to
 *      THE_REASON_KEPT_CHARACTERS characters. Every ending here is made up, and so is every file.
 *  10. THE COMMAND AND ITS SANDBOX LINE, `theCommandThatPrints` with made-up readings: where the readings turn
 *      the sandbox off, the command carries --no-sandbox and the line that says so, which names the window
 *      program; where they do not, it carries neither. The readings are asked about the window program. The
 *      case needs the install's window program, which in a checkout is Electron's binary, so it is skipped
 *      where that binary is missing.
 *
 * A test looks only at what it made. The door makes its print folder in the system's temporary folder,
 * which is TMPDIR, so cases 3 and 4 set TMPDIR to an empty folder of their own and list only that.
 *
 * The cases are numbered with the window test's, 1, 2 and 8, so the two files read as one list. Cases 9 and
 * 10 also follow tests/the-pdf-door-prints-one-page-at-a-time.test.ts, 1 to 5, and
 * tests/a-visitor-may-not-print-a-pdf.test.ts, 6 to 8.
 */

import { readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_WINDOWS_EXECUTABLE } from '../scripts/the-windows-build.mjs'
import { THE_WINDOW_ENTRY, theInstallsWindowProgram } from '../src/config/settings.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER } from '../src/config/systems/the-installer-of-a-folder.mjs'
import {
  type Ended,
  MAX_PAGE_TO_PRINT_BYTES,
  PRINT_TIME_LIMIT_MS,
  THE_PRINT_FOLDER_PREFIX,
  THE_REASON_KEPT_CHARACTERS,
  theCommandThatPrints,
  theDisplayThePrintUses,
  thePrintTurnsTheSandboxOff,
  whatThePrintGave,
} from '../src/server/api/report-pdf.ts'
import { PanelError } from '../src/server/lib/panel-error.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { electronsBinary } from './the-window-display.ts'

/** The headers of a made-up agent asking the door. */
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-made-up-printer',
}

/** A small made-up page, for the refusals that come before anything is printed. */
const A_SMALL_PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>A made-up page.</p></body></html>'

/** A made-up folder an install could be in. Nothing is made there. */
const A_MADE_UP_INSTALL = resolve(tmpdir(), 'a-made-up-install-nothing-is-made-here')

/**
 * THE DOOR ASKED WITH A TEMPORARY FOLDER OF THE TEST'S OWN. The door makes its print folder in the system's
 * temporary folder, which is TMPDIR. `ask` runs with TMPDIR set to a new empty folder this test made, and the
 * answer names the print folders the door left there. TMPDIR is put back and the folder removed whatever happens.
 */
async function askedWithATemporaryFolderOfItsOwn<T>(ask: () => Promise<T>): Promise<{ answer: T; printFoldersLeft: string[] }> {
  const folder = aTestDatabaseFolder('a-temporary-folder-for-the-door')
  const kept = process.env.TMPDIR
  try {
    process.env.TMPDIR = folder
    const answer = await ask()
    return { answer, printFoldersLeft: readdirSync(folder).filter((name) => name.startsWith(THE_PRINT_FOLDER_PREFIX)).sort() }
  } finally {
    if (kept === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = kept
    removeThisTestFolder(folder)
  }
}

describe('the PDF door refuses, and the install finds its window program', () => {
  let t: TestDb | undefined
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    t = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('3. a page past the limit is refused with 413, and no print folder is left', async () => {
    const door = app
    if (door === undefined) throw new Error('The made-up office was not built, so the door cannot be asked.')
    const megabytes = MAX_PAGE_TO_PRINT_BYTES / 1_000_000
    const { answer: reply, printFoldersLeft } = await askedWithATemporaryFolderOfItsOwn(() => door.inject({
      method: 'POST',
      url: '/api/report-pdf',
      headers: HEADERS,
      payload: JSON.stringify({ html: 'a'.repeat(MAX_PAGE_TO_PRINT_BYTES) }),
    }))
    expect(reply.statusCode, reply.body.slice(0, 2000)).toBe(413)
    expect(reply.json()).toMatchObject({ code: 'reportPdfTooLarge', values: { megabytes } })
    expect(String(reply.json().error)).toContain(`${String(megabytes)} MB`)
    expect(printFoldersLeft, 'print folders the door left behind').toEqual([])
  }, 60_000)

  it.skipIf(process.platform !== 'linux')('4. on Linux with no screen and no xvfb-run the door refuses with 409, and no print folder is left', async () => {
    const door = app
    if (door === undefined) throw new Error('The made-up office was not built, so the door cannot be asked.')
    // A PATH of one empty folder, so the door finds no xvfb-run on it.
    const anEmptyFolder = aTestDatabaseFolder('a-path-with-no-xvfb-run')
    const kept = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY, PATH: process.env.PATH }
    try {
      delete process.env.DISPLAY
      delete process.env.WAYLAND_DISPLAY
      process.env.PATH = anEmptyFolder
      const { answer: reply, printFoldersLeft } = await askedWithATemporaryFolderOfItsOwn(() =>
        door.inject({ method: 'POST', url: '/api/report-pdf', headers: HEADERS, payload: JSON.stringify({ html: A_SMALL_PAGE }) }),
      )
      expect(reply.statusCode, reply.body).toBe(409)
      expect(reply.json()).toMatchObject({ code: 'reportPdfNoDisplay', values: {} })
      expect(printFoldersLeft, 'print folders the door left behind').toEqual([])
    } finally {
      for (const [name, value] of Object.entries(kept)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      removeThisTestFolder(anEmptyFolder)
    }
  })

  it('5. the install finds its window program in a checkout and in each bundle, and names any other system', () => {
    // A checkout: Electron's own binary from node_modules, and the window's entry in the checkout.
    const binary = electronsBinary()
    if ('missing' in binary) {
      expect(() => theInstallsWindowProgram({ from: 'checkout', root: A_MADE_UP_INSTALL })).toThrow()
    } else {
      expect(theInstallsWindowProgram({ from: 'checkout', root: A_MADE_UP_INSTALL })).toEqual({
        program: binary.path,
        args: [join(A_MADE_UP_INSTALL, THE_WINDOW_ENTRY)],
      })
    }

    // A Mac bundle: the office is in Mole Office.app/Contents/Resources/office, and the program in Contents/MacOS,
    // named after the app's product name (scripts/the-mac-build.mjs).
    const mac = join(A_MADE_UP_INSTALL, 'Mole Office.app', 'Contents')
    expect(theInstallsWindowProgram({ from: 'bundle', platform: 'darwin', root: join(mac, 'Resources', 'office') })).toEqual({
      program: join(mac, 'MacOS', 'Mole Office'),
      args: [],
    })

    // A Windows bundle: the office is in resources/office of the installed folder, and the program beside resources.
    expect(theInstallsWindowProgram({ from: 'bundle', platform: 'win32', root: join(A_MADE_UP_INSTALL, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER) })).toEqual({
      program: join(A_MADE_UP_INSTALL, THE_WINDOWS_EXECUTABLE),
      args: [],
    })

    // A Linux bundle: the window's own program is the program this one runs as.
    const aMadeUpProgram = join(A_MADE_UP_INSTALL, 'a-made-up-window-program')
    expect(theInstallsWindowProgram({ from: 'bundle', platform: 'linux', execPath: aMadeUpProgram, root: join(A_MADE_UP_INSTALL, 'office') })).toEqual({
      program: aMadeUpProgram,
      args: [],
    })

    // Any other system is named in the refusal.
    expect(() => theInstallsWindowProgram({ from: 'bundle', platform: 'freebsd', root: join(A_MADE_UP_INSTALL, 'office') })).toThrow(/freebsd/)
  })

  it('6. the print turns the sandbox off only on Linux, where user namespaces are refused and the helper is not set up', () => {
    // Made-up readings: the text of the two kernel settings, and the helper's owner and mode as stat gives them.
    const A_MADE_UP_OWNER_THAT_IS_NOT_ROOT = 1000
    const ROOT = 0
    const A_MADE_UP_PLAIN_MODE = 0o100755
    const A_MADE_UP_SETUID_MODE = 0o104755
    const notSetUp = { owner: A_MADE_UP_OWNER_THAT_IS_NOT_ROOT, mode: A_MADE_UP_PLAIN_MODE }
    const setUp = { owner: ROOT, mode: A_MADE_UP_SETUID_MODE }

    // Refused by AppArmor, or by the clone setting, with a helper that is not set up: off.
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '1\n', cloneSetting: '1\n', helper: notSetUp })).toBe(true)
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '0\n', cloneSetting: '0\n', helper: notSetUp })).toBe(true)
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: null, cloneSetting: '0\n', helper: notSetUp })).toBe(true)
    // Root without the setuid bit, or the setuid bit without root, is not set up either.
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '1\n', cloneSetting: '1\n', helper: { owner: ROOT, mode: A_MADE_UP_PLAIN_MODE } })).toBe(true)
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '1\n', cloneSetting: '1\n', helper: { owner: A_MADE_UP_OWNER_THAT_IS_NOT_ROOT, mode: A_MADE_UP_SETUID_MODE } })).toBe(true)

    // User namespaces allowed: on.
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '0\n', cloneSetting: '1\n', helper: notSetUp })).toBe(false)
    // A helper owned by root with its setuid bit: on.
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '1\n', cloneSetting: '0\n', helper: setUp })).toBe(false)
    // A reading that could not be made counts as the sandbox allowed: on.
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: null, cloneSetting: null, helper: notSetUp })).toBe(false)
    expect(thePrintTurnsTheSandboxOff({ platform: 'linux', restrictSetting: '1\n', cloneSetting: '0\n', helper: null })).toBe(false)

    // On the Mac and on Windows the sandbox stays on, whatever the readings say.
    for (const platform of ['darwin', 'win32']) {
      expect(thePrintTurnsTheSandboxOff({ platform, restrictSetting: '1\n', cloneSetting: '0\n', helper: notSetUp }), platform).toBe(false)
    }
  })

  it('7. the print uses its own screen where there is one, xvfb-run on Linux where there is none, and nothing where neither is', () => {
    // Made-up readings: the two display variables, and where xvfb-run was found on PATH. Nothing is made there.
    const A_MADE_UP_XVFB_RUN = join(A_MADE_UP_INSTALL, 'xvfb-run')

    // On Linux, a screen of its own, by X or by Wayland, is used, whether xvfb-run was found or not.
    expect(theDisplayThePrintUses({ platform: 'linux', display: ':7', waylandDisplay: undefined, xvfbRun: A_MADE_UP_XVFB_RUN })).toEqual({ kind: 'own' })
    expect(theDisplayThePrintUses({ platform: 'linux', display: ':7', waylandDisplay: undefined, xvfbRun: null })).toEqual({ kind: 'own' })
    expect(theDisplayThePrintUses({ platform: 'linux', display: undefined, waylandDisplay: 'wayland-7', xvfbRun: null })).toEqual({ kind: 'own' })

    // No screen: xvfb-run, at the path it was found at. An empty variable names no screen.
    expect(theDisplayThePrintUses({ platform: 'linux', display: undefined, waylandDisplay: undefined, xvfbRun: A_MADE_UP_XVFB_RUN })).toEqual({ kind: 'xvfb-run', path: A_MADE_UP_XVFB_RUN })
    expect(theDisplayThePrintUses({ platform: 'linux', display: '', waylandDisplay: '', xvfbRun: A_MADE_UP_XVFB_RUN })).toEqual({ kind: 'xvfb-run', path: A_MADE_UP_XVFB_RUN })

    // No screen and no xvfb-run: none, and the door refuses.
    expect(theDisplayThePrintUses({ platform: 'linux', display: undefined, waylandDisplay: undefined, xvfbRun: null })).toEqual({ kind: 'none' })
    expect(theDisplayThePrintUses({ platform: 'linux', display: '', waylandDisplay: '', xvfbRun: null })).toEqual({ kind: 'none' })

    // On the Mac and on Windows the print always uses its own screen, whatever the readings say.
    for (const platform of ['darwin', 'win32']) {
      expect(theDisplayThePrintUses({ platform, display: undefined, waylandDisplay: undefined, xvfbRun: null }), platform).toEqual({ kind: 'own' })
      expect(theDisplayThePrintUses({ platform, display: undefined, waylandDisplay: undefined, xvfbRun: A_MADE_UP_XVFB_RUN }), platform).toEqual({ kind: 'own' })
    }
  })

  it('9. a print gives its PDF, or a refusal that names how it ended, with the last line cut to its length', () => {
    const folder = aTestDatabaseFolder('made-up-print-endings')
    try {
      // MADE-UP FILES: a PDF the program wrote, a file that is not one, and a path where nothing was written.
      const A_MADE_UP_PDF = Buffer.from('%PDF-1.4 a made-up PDF, written by a test', 'latin1')
      const aPdf = join(folder, 'a-made-up.pdf')
      const notAPdf = join(folder, 'not-a-pdf.pdf')
      const nothingWritten = join(folder, 'nothing-was-written.pdf')
      writeFileSync(aPdf, A_MADE_UP_PDF)
      writeFileSync(notAPdf, 'a made-up file that is not a PDF')
      const none = Buffer.alloc(0)
      const ended = (code: number | null, signal: NodeJS.Signals | null, stdout = '', stderr = ''): Ended => ({
        kind: 'ended',
        code,
        signal,
        stdout: stdout === '' ? none : Buffer.from(stdout, 'utf8'),
        stderr: stderr === '' ? none : Buffer.from(stderr, 'utf8'),
      })
      // What a refusal is, as these checks read it; a PDF given instead fails the case.
      const refusal = (given: Buffer | PanelError): { status: number; code: string | undefined; values: unknown; detail: string | undefined } => {
        if (!(given instanceof PanelError)) throw new Error(`The print gave ${String(given.length)} bytes and not a refusal.`)
        return { status: given.status, code: given.code, values: given.values, detail: given.detail }
      }

      // ENDED WITH 0 AND A PDF WRITTEN: its bytes.
      expect(whatThePrintGave(ended(0, null), aPdf)).toEqual(A_MADE_UP_PDF)

      // DID NOT FINISH IN TIME, OR COULD NOT START.
      expect(refusal(whatThePrintGave({ kind: 'timed-out' }, aPdf))).toEqual({
        status: 500, code: 'reportPdfTimedOut', values: { seconds: PRINT_TIME_LIMIT_MS / 1000 }, detail: undefined,
      })
      expect(refusal(whatThePrintGave({ kind: 'could-not-start', message: 'a made-up start error' }, aPdf))).toEqual({
        status: 500, code: 'reportPdfCouldNotStart', values: {}, detail: 'The window program could not start: a made-up start error',
      })

      // ENDED WITH 0 AND NO PDF: nothing written, or a file that does not start as a PDF does.
      expect(refusal(whatThePrintGave(ended(0, null), nothingWritten))).toMatchObject({ status: 500, code: 'reportPdfWroteNoPdf', values: {} })
      expect(refusal(whatThePrintGave(ended(0, null), notAPdf))).toMatchObject({ status: 500, code: 'reportPdfWroteNoPdf', values: {} })

      // AN EXIT CODE: with no output; with a line on stderr, which is read before stdout; with a line on stdout alone.
      expect(refusal(whatThePrintGave(ended(3, null), nothingWritten))).toMatchObject({ status: 500, code: 'reportPdfExited', values: { code: 3 } })
      expect(refusal(whatThePrintGave(ended(3, null, 'a made-up line on stdout\n', 'a made-up first line\na made-up line on stderr\n\n'), nothingWritten))).toMatchObject({
        status: 500, code: 'reportPdfExitedSaying', values: { code: 3, line: 'a made-up line on stderr' },
      })
      expect(refusal(whatThePrintGave(ended(3, null, 'a made-up line on stdout\n'), nothingWritten))).toMatchObject({
        status: 500, code: 'reportPdfExitedSaying', values: { code: 3, line: 'a made-up line on stdout' },
      })

      // A SIGNAL AND NO CODE: with no output, and with a line.
      expect(refusal(whatThePrintGave(ended(null, 'SIGKILL'), nothingWritten))).toMatchObject({ status: 500, code: 'reportPdfSignalled', values: { signal: 'SIGKILL' } })
      expect(refusal(whatThePrintGave(ended(null, 'SIGTERM', '', 'a made-up line before the signal\n'), nothingWritten))).toMatchObject({
        status: 500, code: 'reportPdfSignalledSaying', values: { signal: 'SIGTERM', line: 'a made-up line before the signal' },
      })

      // A LINE PAST THE LENGTH KEPT is cut to THE_REASON_KEPT_CHARACTERS characters, counted as characters and not
      // as bytes: each character here is three bytes in UTF-8.
      const aLongLine = '一'.repeat(THE_REASON_KEPT_CHARACTERS + 50)
      expect(refusal(whatThePrintGave(ended(3, null, '', `${aLongLine}\n`), nothingWritten))).toMatchObject({
        status: 500, code: 'reportPdfExitedSaying', values: { code: 3, line: '一'.repeat(THE_REASON_KEPT_CHARACTERS) },
      })
    } finally {
      removeThisTestFolder(folder)
    }
  })

  it('10. the command carries --no-sandbox and the line that says so exactly when the readings turn the sandbox off', (context) => {
    const binary = electronsBinary()
    if ('missing' in binary) context.skip(binary.missing)
    const window = theInstallsWindowProgram()
    // MADE-UP READINGS, as in case 6, and the program each was asked about. None is read from this machine.
    const notSetUp = { owner: 1000, mode: 0o100755 }
    const askedAbout: string[] = []
    const off = (program: string) => {
      askedAbout.push(program)
      return { platform: 'linux', restrictSetting: '1\n', cloneSetting: '1\n', helper: notSetUp }
    }
    const on = (program: string) => {
      askedAbout.push(program)
      return { platform: 'linux', restrictSetting: '0\n', cloneSetting: '1\n', helper: notSetUp }
    }
    const theLine =
      "A PDF print runs without Chromium's sandbox: this system does not let a program that is not privileged make user " +
      `namespaces, and chrome-sandbox beside ${window.program} is not owned by root with its setuid bit.`
    const displays = [{ kind: 'own' }, { kind: 'xvfb-run', path: join(A_MADE_UP_INSTALL, 'xvfb-run') }] as const
    for (const display of displays) {
      const without = theCommandThatPrints('a.html', 'a.pdf', display, off)
      expect(without.withoutTheSandbox, display.kind).toBe(theLine)
      expect(without.args, display.kind).toContain('--no-sandbox')
      const withIt = theCommandThatPrints('a.html', 'a.pdf', display, on)
      expect(withIt.withoutTheSandbox, display.kind).toBeNull()
      expect(withIt.args, display.kind).not.toContain('--no-sandbox')
    }
    expect(askedAbout).toEqual(displays.flatMap(() => [window.program, window.program]))
  })
})
