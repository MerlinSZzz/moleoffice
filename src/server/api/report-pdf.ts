// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PDF DOOR, POST /api/report-pdf. The office prints a report's page as a PDF with the app's own window program.
 *
 * The body is the page's whole HTML, at most MAX_PAGE_TO_PRINT_BYTES. At each request the door:
 *
 *   1. works out where the print is shown (`theDisplayThePrintUses`). With no screen and no xvfb-run, it refuses
 *      with 409 before it writes or starts anything. While another print is running, it refuses with 409 too;
 *   2. makes a folder of its own in the system's temporary folder, and writes the page there as page.html;
 *   3. starts the command `theCommandThatPrints` answers, and waits at most PRINT_TIME_LIMIT_MS for it;
 *   4. waits until every process the program started has ended, and stops what is left;
 *   5. removes the folder with all it holds, and only then answers: the PDF, or why there is none.
 *
 * It stores nothing. The print mode itself is in src/desktop/print-a-page.mjs: it loads the one file the door
 * wrote, runs no script, and lets no other request leave except data: addresses.
 *
 * NO HELPER IN src/server/lib/ FITTED THE WAIT. runTheOpener (src/server/lib/a-terminal-outside.ts) starts a
 * program with a time limit, but it keeps only the first 4096 characters of stderr, and it does not wait for the
 * rest of the program's group. The print needs the last lines of both streams, because xvfb-run sends the
 * command's stderr to its own stdout. And it needs the group to end, because xvfb-run stops its Xvfb on the way out
 * without waiting for it.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sayInEnglish } from '@shared/i18n.ts'
import type { CodedRefusal } from '@shared/refusal-codes.ts'
import { whereIsThisTool } from '../../config/runtimes.mjs'
import { theInstallsWindowProgram } from '../../config/settings.mjs'
import { PRINT_A_PAGE_SWITCH } from '../../desktop/print-a-page.mjs'
import { PanelError } from '../lib/panel-error.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'

/** The largest body the door takes, in bytes: the page's whole HTML, with its pictures written into it. */
export const MAX_PAGE_TO_PRINT_BYTES = 64_000_000

/** How long the window program may take to print, before the door stops it and everything it started. */
export const PRINT_TIME_LIMIT_MS = 60_000

/**
 * WHETHER A PRINT IS RUNNING NOW. The door prints one page at a time: a print asked while another runs is refused
 * with 409, and is not queued or kept waiting. One office is one process, so this flag covers one office. A second
 * office on the same computer has its own flag.
 */
let aPrintIsRunning = false

/** The start of the name of each folder the door prints in. */
export const THE_PRINT_FOLDER_PREFIX = 'mole-office-print-'

/** How much of the end of each of the program's two streams the door keeps, in bytes. */
const THE_OUTPUT_KEPT_BYTES = 4096

/** How much of a failed print's last line the door gives back, in characters. */
export const THE_REASON_KEPT_CHARACTERS = 300

/** How long the door waits for the rest of the program's group to end, once before it stops it and once after. */
const THE_GROUP_MAY_TAKE_MS = 5_000

/** How often the door looks whether the program's group has ended. */
const THE_GROUP_IS_READ_EVERY_MS = 50

/** The two kernel settings that say whether a program that is not privileged may make user namespaces. */
const THE_RESTRICT_SETTING = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns'
const THE_CLONE_SETTING = '/proc/sys/kernel/unprivileged_userns_clone'

/** Chromium's sandbox helper, beside the window program. */
const THE_SANDBOX_HELPER = 'chrome-sandbox'

/** Fastify's own code for a body past the route's limit. */
const BODY_TOO_LARGE = 'FST_ERR_CTP_BODY_TOO_LARGE'

const REPORT_PDF_PRINT_NOTE =
  'Print a report\'s page as a PDF with the app\'s own window program. Body {html}: the page\'s whole HTML, at most 64 MB. ' +
  'It answers the PDF as application/pdf. On Linux with no screen it prints under xvfb-run, and with neither it refuses with 409. ' +
  'It prints one page at a time: a print asked while another is running is refused with 409, and nothing waits. ' +
  'A page past the limit is refused with 413. A print that fails answers 500 with a code that says how: it did not finish ' +
  'in time, it could not start, it wrote no PDF, or it ended with an exit code or a signal, with the program\'s last line where it wrote one. ' +
  'Stores nothing: the page and the PDF are written in a temporary folder that is removed before the answer.'

const aPageSent = z.object({ html: z.string() }).strict()

/** Where the print is shown: on the office's own screen, under xvfb-run at this path, or nowhere. */
export type ThePrintsDisplay = { kind: 'own' } | { kind: 'xvfb-run'; path: string } | { kind: 'none' }

/**
 * WHERE THE PRINT IS SHOWN. On the Mac and on Windows the window program always has the computer's own screen. On
 * Linux it has one when DISPLAY or WAYLAND_DISPLAY says so, and a variable that is set but empty says nothing.
 * With neither, the print runs under xvfb-run, which gives it a screen of its own in memory. With no xvfb-run
 * either, there is nowhere to print.
 */
export function theDisplayThePrintUses(here: {
  platform: string
  display: string | undefined
  waylandDisplay: string | undefined
  xvfbRun: string | null
}): ThePrintsDisplay {
  if (here.platform !== 'linux') return { kind: 'own' }
  if ((here.display ?? '') !== '' || (here.waylandDisplay ?? '') !== '') return { kind: 'own' }
  if (here.xvfbRun !== null) return { kind: 'xvfb-run', path: here.xvfbRun }
  return { kind: 'none' }
}

/** The display rule, read from this process now. xvfb-run is looked for on the office's PATH at each call. */
function theDisplayHere(): ThePrintsDisplay {
  return theDisplayThePrintUses({
    platform: process.platform,
    display: process.env.DISPLAY,
    waylandDisplay: process.env.WAYLAND_DISPLAY,
    xvfbRun: whereIsThisTool('xvfb-run', process.env),
  })
}

/**
 * WHETHER THE PRINT TURNS CHROMIUM'S SANDBOX OFF, with --no-sandbox. Only on Linux, and only where both hold:
 *
 *   - the system refuses user namespaces to a program that is not privileged: AppArmor's restriction is on
 *     (kernel.apparmor_restrict_unprivileged_userns is 1, as on a stock Ubuntu 24.04), or the clone setting is
 *     off (kernel.unprivileged_userns_clone is 0);
 *   - and the sandbox helper beside the program, chrome-sandbox, is not set up: it is not owned by root with its
 *     setuid bit.
 *
 * There Chromium has no sandbox it can start, and it does not run without --no-sandbox. The Mole Office AppImage's
 * launcher adds --no-sandbox by itself on such a system (src/desktop/main.mjs says so). The door starts the program
 * itself and not through that launcher, so it decides here. A reading that could not be made counts as allowing
 * the sandbox, so the sandbox stays on unless the readings say it cannot start. What runs without it is the print
 * window, which loads the one file the door wrote, with script off and every other request refused.
 */
export function thePrintTurnsTheSandboxOff(here: {
  platform: string
  restrictSetting: string | null
  cloneSetting: string | null
  helper: { owner: number; mode: number } | null
}): boolean {
  if (here.platform !== 'linux' || here.helper === null) return false
  const SETUID = 0o4000
  if (here.helper.owner === 0 && (here.helper.mode & SETUID) !== 0) return false
  return here.restrictSetting?.trim() === '1' || here.cloneSetting?.trim() === '0'
}

/** A kernel setting's text, or null when it cannot be read: a kernel without the setting has no such file. */
function theSettingIfRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** The owner and mode of the sandbox helper beside the program, or null when there is no helper to read. */
function theHelperBeside(program: string): { owner: number; mode: number } | null {
  try {
    const found = statSync(join(dirname(program), THE_SANDBOX_HELPER))
    return { owner: found.uid, mode: found.mode }
  } catch {
    return null
  }
}

/** What the sandbox rule reads, for one window program. */
export type TheSandboxReadings = Parameters<typeof thePrintTurnsTheSandboxOff>[0]

/** The sandbox readings of this machine now, for the window program at `program`. */
function theReadingsHere(program: string): TheSandboxReadings {
  return {
    platform: process.platform,
    restrictSetting: theSettingIfRead(THE_RESTRICT_SETTING),
    cloneSetting: theSettingIfRead(THE_CLONE_SETTING),
    helper: theHelperBeside(program),
  }
}

/** A command that prints, and the line the door says when it runs without Chromium's sandbox, or null. */
export interface ThePrintCommand {
  program: string
  args: string[]
  withoutTheSandbox: string | null
}

/**
 * THE COMMAND THAT PRINTS `page` INTO `pdf`: the install's window program (`theInstallsWindowProgram` in
 * src/config/settings.mjs) and its arguments, --no-sandbox where `thePrintTurnsTheSandboxOff` says so, then the
 * print switch, the page and the PDF. Under xvfb-run the same command follows xvfb-run and its -a, which picks a
 * free screen number. With nowhere to print it throws; the door refuses before it asks.
 *
 * `readingsOf` gives the sandbox readings for the window program it is handed, so a test can give made-up ones.
 * Where the sandbox is turned off, `withoutTheSandbox` is the line that says so, and it names the window program
 * under xvfb-run too: the helper it names sits beside that program.
 */
export function theCommandThatPrints(
  page: string,
  pdf: string,
  display: ThePrintsDisplay = theDisplayHere(),
  readingsOf: (program: string) => TheSandboxReadings = theReadingsHere,
): ThePrintCommand {
  if (display.kind === 'none') throw new Error('There is no screen to print on and no xvfb-run, so no command can print.')
  const window = theInstallsWindowProgram()
  const withoutTheSandbox = thePrintTurnsTheSandboxOff(readingsOf(window.program))
    ? "A PDF print runs without Chromium's sandbox: this system does not let a program that is not privileged make user " +
      `namespaces, and ${THE_SANDBOX_HELPER} beside ${window.program} is not owned by root with its setuid bit.`
    : null
  const args = [...window.args, ...(withoutTheSandbox === null ? [] : ['--no-sandbox']), PRINT_A_PAGE_SWITCH, page, pdf]
  if (display.kind === 'xvfb-run') return { program: display.path, args: ['-a', window.program, ...args], withoutTheSandbox }
  return { program: window.program, args, withoutTheSandbox }
}

/** The end of a stream, kept to its last THE_OUTPUT_KEPT_BYTES. */
function keptEnd(kept: Buffer, chunk: Buffer): Buffer {
  const both = Buffer.concat([kept, chunk])
  return both.length > THE_OUTPUT_KEPT_BYTES ? both.subarray(both.length - THE_OUTPUT_KEPT_BYTES) : both
}

/** The last line in `bytes` that is not empty, or null. */
function theLastLine(bytes: Buffer): string | null {
  const lines = bytes.toString('utf8').split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== '')
  return lines.at(-1) ?? null
}

/** Whether any process of the group `leader` leads is still there. EPERM means one is, and it is not ours to signal. */
function aMemberIsLeft(leader: number): boolean {
  try {
    process.kill(-leader, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    throw error
  }
}

/** Whether the group has ended within `within` milliseconds. */
async function theGroupEnds(leader: number, within: number): Promise<boolean> {
  const until = Date.now() + within
  for (;;) {
    if (!aMemberIsLeft(leader)) return true
    if (Date.now() >= until) return false
    await new Promise((wake) => setTimeout(wake, THE_GROUP_IS_READ_EVERY_MS))
  }
}

/** SIGKILL to the whole group. It answers why the signal could not be sent, or null when it was, or nobody was left. */
function killTheGroup(leader: number): string | null {
  try {
    process.kill(-leader, 'SIGKILL')
    return null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null
    return error instanceof Error ? error.message : String(error)
  }
}

/** How a print run ended, as the door read it. */
export type Ended =
  | { kind: 'ended'; code: number | null; signal: NodeJS.Signals | null; stdout: Buffer; stderr: Buffer }
  | { kind: 'timed-out' }
  | { kind: 'could-not-start'; message: string }

/**
 * START THE COMMAND AND WAIT FOR IT, at most PRINT_TIME_LIMIT_MS. On Linux and the Mac the program is started
 * detached, so it leads a process group of its own, and the door stops that whole group. On Windows it stops the
 * program itself. After the program ends, the door waits until the rest of its group has ended too, and stops
 * what is left: under xvfb-run, xvfb-run stops its Xvfb as it ends but does not wait for it.
 */
async function printWith(command: { program: string; args: string[] }, say: (line: string) => void): Promise<Ended> {
  let child: ChildProcess
  try {
    child = spawn(command.program, command.args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
  } catch (error) {
    return { kind: 'could-not-start', message: error instanceof Error ? error.message : String(error) }
  }
  let stdout: Buffer = Buffer.alloc(0)
  let stderr: Buffer = Buffer.alloc(0)
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = keptEnd(stdout, chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = keptEnd(stderr, chunk)
  })
  const leader = process.platform === 'win32' ? undefined : child.pid

  const ended = await new Promise<Ended>((done) => {
    const limit = setTimeout(() => {
      if (leader === undefined) child.kill('SIGKILL')
      else {
        const notSent = killTheGroup(leader)
        if (notSent !== null) say(`The PDF door could not stop the window program's group ${String(leader)} at its time limit: ${notSent}`)
      }
      done({ kind: 'timed-out' })
    }, PRINT_TIME_LIMIT_MS)
    child.once('error', (error) => {
      clearTimeout(limit)
      done({ kind: 'could-not-start', message: error.message })
    })
    child.once('close', (code, signal) => {
      clearTimeout(limit)
      done({ kind: 'ended', code, signal, stdout, stderr })
    })
  })

  if (leader !== undefined && !(await theGroupEnds(leader, THE_GROUP_MAY_TAKE_MS))) {
    const notSent = killTheGroup(leader)
    if (notSent !== null) say(`The PDF door could not stop what was left of the window program's group ${String(leader)}: ${notSent}`)
    else if (!(await theGroupEnds(leader, THE_GROUP_MAY_TAKE_MS))) {
      say(`The window program's group ${String(leader)} was still there ${String(THE_GROUP_MAY_TAKE_MS)} ms after SIGKILL.`)
    }
  }
  return ended
}

/** The ways a print gives no PDF, each with its own code and its own values. */
type APrintThatFailed = Extract<
  CodedRefusal,
  {
    code:
      | 'reportPdfTimedOut'
      | 'reportPdfCouldNotStart'
      | 'reportPdfWroteNoPdf'
      | 'reportPdfExited'
      | 'reportPdfExitedSaying'
      | 'reportPdfSignalled'
      | 'reportPdfSignalledSaying'
  }
>

/**
 * THE REFUSAL FOR A PRINT THAT GAVE NO PDF: 500, its code and values, and its English read from the same word the
 * page draws, so the two cannot differ. `detail` is for an agent and Developer mode.
 */
function aPrintThatFailed(refusal: APrintThatFailed, detail?: string): PanelError {
  return new PanelError(sayInEnglish(`server.${refusal.code}`, refusal.values), 500, detail, undefined, undefined, refusal)
}

/**
 * The PDF a print run wrote, or the refusal that says why there is none. A run that ended with a failure is named
 * by its exit code, or by its signal when it has no code, and by its last line as well when it wrote one. The line
 * is cut to THE_REASON_KEPT_CHARACTERS characters.
 */
export function whatThePrintGave(ended: Ended, pdf: string): Buffer | PanelError {
  if (ended.kind === 'timed-out') {
    return aPrintThatFailed({ code: 'reportPdfTimedOut', values: { seconds: PRINT_TIME_LIMIT_MS / 1000 } })
  }
  if (ended.kind === 'could-not-start') {
    return aPrintThatFailed({ code: 'reportPdfCouldNotStart', values: {} }, `The window program could not start: ${ended.message}`)
  }
  if (ended.code === 0) {
    let bytes: Buffer | null = null
    try {
      bytes = readFileSync(pdf)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (bytes !== null && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return bytes
    return aPrintThatFailed({ code: 'reportPdfWroteNoPdf', values: {} })
  }
  // Under xvfb-run the program's stderr arrives on stdout, and xvfb-run's own complaints on stderr.
  const lastLine = theLastLine(ended.stderr) ?? theLastLine(ended.stdout)
  const line = lastLine === null ? null : [...lastLine].slice(0, THE_REASON_KEPT_CHARACTERS).join('')
  if (ended.code !== null) {
    const code = ended.code
    if (line === null) return aPrintThatFailed({ code: 'reportPdfExited', values: { code } })
    return aPrintThatFailed({ code: 'reportPdfExitedSaying', values: { code, line } })
  }
  const signal = String(ended.signal)
  if (line === null) return aPrintThatFailed({ code: 'reportPdfSignalled', values: { signal } })
  return aPrintThatFailed({ code: 'reportPdfSignalledSaying', values: { signal, line } })
}

/**
 * MAKE THE COMMAND AND RUN IT, or say why it could not start. The line about the sandbox is said once, before the
 * program starts, when the print runs without it.
 */
async function runThePrint(page: string, pdf: string, display: ThePrintsDisplay, say: (line: string) => void): Promise<Ended> {
  let command: ThePrintCommand
  try {
    command = theCommandThatPrints(page, pdf, display)
  } catch (error) {
    return { kind: 'could-not-start', message: error instanceof Error ? error.message : String(error) }
  }
  if (command.withoutTheSandbox !== null) say(command.withoutTheSandbox)
  return printWith(command, say)
}

/**
 * PRINT `html` IN A FOLDER OF ITS OWN, and remove that folder with all it holds before answering. The folder is
 * made in os.tmpdir(), which reads TMPDIR at each call. The page is page.html in it, the PDF page.pdf, and the
 * window program makes its own folder, profile, beside them. A print that could not start is said once, here,
 * whichever of the three ways it failed: the command could not be made, spawn threw, or the program sent 'error'.
 */
async function printInAFolderOfItsOwn(html: string, display: ThePrintsDisplay, say: (line: string) => void): Promise<Buffer | PanelError> {
  const folder = mkdtempSync(join(tmpdir(), THE_PRINT_FOLDER_PREFIX))
  try {
    const page = join(folder, 'page.html')
    const pdf = join(folder, 'page.pdf')
    writeFileSync(page, html)
    const ended = await runThePrint(page, pdf, display, say)
    if (ended.kind === 'could-not-start') say(`The PDF door could not start the window program: ${ended.message}`)
    return whatThePrintGave(ended, pdf)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

export async function reportPdfRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/report-pdf',
    {
      bodyLimit: MAX_PAGE_TO_PRINT_BYTES,
      errorHandler: (error, request, reply) => {
        if ((error as { code?: unknown }).code === BODY_TOO_LARGE) {
          const megabytes = MAX_PAGE_TO_PRINT_BYTES / 1_000_000
          const refused = new PanelError(sayInEnglish('server.reportPdfTooLarge', { megabytes }), 413, undefined, undefined, undefined, {
            code: 'reportPdfTooLarge',
            values: { megabytes },
          })
          return app.errorHandler(refused, request, reply)
        }
        return app.errorHandler(error, request, reply)
      },
      ...route('report-pdf.print', 'remote', REPORT_PDF_PRINT_NOTE),
    },
    async (req, reply) => {
      const sent = parse(aPageSent, req.body ?? {}, 'The page to print')
      const display = theDisplayHere()
      if (display.kind === 'none') {
        throw new PanelError(sayInEnglish('server.reportPdfNoDisplay'), 409, undefined, undefined, undefined, {
          code: 'reportPdfNoDisplay',
          values: {},
        })
      }
      if (aPrintIsRunning) {
        throw new PanelError(sayInEnglish('server.reportPdfBusy'), 409, undefined, undefined, undefined, {
          code: 'reportPdfBusy',
          values: {},
        })
      }
      aPrintIsRunning = true
      let given: Buffer | PanelError
      try {
        given = await printInAFolderOfItsOwn(sent.html, display, (line) => req.log.warn(line))
      } finally {
        aPrintIsRunning = false
      }
      if (given instanceof PanelError) throw given
      return reply.type('application/pdf').send(given)
    },
  )
}
