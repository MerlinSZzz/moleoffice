// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PDF DOOR PRINTS ONE PAGE AT A TIME, AND SAYS EACH WAY A PRINT FAILS.
 *
 * POST /api/report-pdf prints with the app's own window program. On Linux with no screen it starts that program
 * under xvfb-run, which it looks for on the office's PATH. Here PATH is a folder of this test's own that holds one
 * made-up xvfb-run: a shell script that stands in for xvfb-run and the window program together. So no window is
 * opened and nothing the door hands the script is started. Each case decides what the print does.
 *
 *   1. ONE PRINT AT A TIME. While print A waits, print B is refused with 409 and reportPdfBusy, and only A's print
 *      folder exists. Once A is let go it answers its PDF, and print C after it answers too. No print folder is
 *      left.
 *   2. A PRINT THAT ENDS WITH AN EXIT CODE AND WRITES NOTHING is refused with 500 and reportPdfExited, with the
 *      code. The door is not left busy: the next print, with a script that prints, answers its PDF.
 *   3. A PRINT THAT ENDS WITH AN EXIT CODE AND A LAST LINE is refused with 500 and reportPdfExitedSaying, with the
 *      code and the line.
 *   4. A PRINT THAT CANNOT START, because the script's first line names an interpreter that does not exist, is
 *      refused with 500 and reportPdfCouldNotStart. The answer's detail holds the start error, and the office's
 *      log holds the same error once, at warn.
 *   5. THE SANDBOX LINE. In case 1's log, the line that says a print runs without Chromium's sandbox is there once
 *      for each print exactly when this machine's readings turn the sandbox off, and is not there at all when
 *      they do not.
 *
 * Every case runs only on Linux, where the door looks for xvfb-run, and only where Electron's binary is: the door
 * asks the install for its window program before it starts anything, and in a checkout that is Electron's binary.
 * The made-up xvfb-run is started instead, and it never starts the program it is handed.
 *
 * DISPLAY and WAYLAND_DISPLAY are unset, PATH is the test's own folder, and TMPDIR is another folder of the test's
 * own, for the whole of each case. So the door finds no screen and only the made-up xvfb-run, and the print folders
 * it makes are counted where nothing else is. Each script sets its own PATH to /usr/bin:/bin first, so it finds
 * the system's own tools. The four variables are put back whatever happens.
 *
 * The office is built as tests/a-file-ticket.test.ts builds it, with its log written into a list here, so the
 * cases can read what the door said.
 *
 * Before the door prints one page at a time and names each failure, cases 1 to 5 fail. B starts a second print
 * beside A instead of being refused. Each failure answers the one old code. The door says neither line in its log.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { settings } from '../src/config/settings.mjs'
import { THE_PRINT_FOLDER_PREFIX, theCommandThatPrints } from '../src/server/api/report-pdf.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { electronsBinary } from './the-window-display.ts'

/** The headers of a made-up agent asking the door. */
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-made-up-printer',
}

/** A small made-up page. The made-up xvfb-run never reads it. */
const A_SMALL_PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>A made-up page.</p></body></html>'

/** The bytes the made-up xvfb-run writes as its PDF. They start as a PDF does, and are nothing else of one. */
const A_MADE_UP_PDF = '%PDF-1.4 a made-up PDF, written by a made-up xvfb-run'

/** How long case 1's script waits to be let go, and how long the test waits for it to start, in seconds. */
const THE_LONGEST_WAIT_SECONDS = 30

/**
 * HOW LONG A CASE HERE MAY TAKE. Each print starts a process of its own, through the door, and case 1 may wait
 * THE_LONGEST_WAIT_SECONDS for its script to start before it fails and says so. The case's own limit is set
 * above that, so a wait that runs out is reported by the wait, and not by vitest as a time-out.
 */
const A_CASE_THAT_PRINTS_MS = 90_000

/** The start of the line the door says when the window program could not start. */
const COULD_NOT_START_SAID = 'The PDF door could not start the window program: '

/** The start of the detail of a refusal for a print that could not start. */
const COULD_NOT_START_DETAIL = 'The window program could not start: '

/** Pino's number for warn. */
const WARN = 40

/** Every line the server's logger writes, whole, as pino writes it: one JSON object a line. */
class TheServersLog {
  readonly lines: string[] = []
  private waiting = ''

  write(chunk: string): void {
    this.waiting += chunk
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.lines.push(line)
      end = this.waiting.indexOf('\n')
    }
  }
}
const THE_LOG = new TheServersLog()

/** One line of the server's log, as far as these cases read it. */
interface ALogLine {
  level: number
  msg: string
}

/** The lines of `lines` whose message starts with `start`. A line that is not pino's JSON fails the case. */
function theLinesSaying(lines: readonly string[], start: string): ALogLine[] {
  return lines
    .map((line) => JSON.parse(line) as { level?: unknown; msg?: unknown })
    .filter((one): one is ALogLine => typeof one.msg === 'string' && one.msg.startsWith(start) && typeof one.level === 'number')
}

/** Ask the door for one print. The request is sent as soon as this is called, whether or not it is awaited. */
function askedToPrint(door: FastifyInstance): Promise<LightMyRequestResponse> {
  return Promise.resolve(door.inject({ method: 'POST', url: '/api/report-pdf', headers: HEADERS, payload: JSON.stringify({ html: A_SMALL_PAGE }) }))
}

/** Wait until `path` exists, at most THE_LONGEST_WAIT_SECONDS, and fail with a sentence if it never does. */
async function untilThereIs(path: string, what: string): Promise<void> {
  const until = Date.now() + THE_LONGEST_WAIT_SECONDS * 1000
  while (!existsSync(path)) {
    if (Date.now() >= until) throw new Error(`${what} did not appear within ${String(THE_LONGEST_WAIT_SECONDS)} seconds.`)
    await new Promise((wake) => setTimeout(wake, 50))
  }
}

/** A path written into a script between single quotes. A path holding one cannot be, and fails the case. */
function quoted(path: string): string {
  if (path.includes("'")) throw new Error(`The test's folder ${path} holds a single quote, so no script here can name it.`)
  return `'${path}'`
}

/** The lines that find the last argument a script was given, which is the PDF the door asked for. */
const THE_LAST_ARGUMENT = 'for last in "$@"; do :; done'

/** A script that writes the made-up PDF to its last argument and ends with 0. */
const IT_PRINTS = [THE_LAST_ARGUMENT, `printf '%s' ${quoted(A_MADE_UP_PDF)} > "$last"`, 'exit 0'].join('\n')

/**
 * A SCRIPT THAT SAYS IT STARTED, WAITS TO BE LET GO, AND THEN PRINTS. It writes `started` into `signals`, waits at
 * most THE_LONGEST_WAIT_SECONDS for `may-end` there, and ends with 9 if it was never let go.
 */
function itWaitsAndThenPrints(signals: string): string {
  return [
    THE_LAST_ARGUMENT,
    `: > ${quoted(join(signals, 'started'))}`,
    `deadline=$(( $(date +%s) + ${String(THE_LONGEST_WAIT_SECONDS)} ))`,
    `while [ ! -e ${quoted(join(signals, 'may-end'))} ]; do`,
    '  if [ "$(date +%s)" -ge "$deadline" ]; then exit 9; fi',
    '  sleep 0.1',
    'done',
    `printf '%s' ${quoted(A_MADE_UP_PDF)} > "$last"`,
    'exit 0',
  ].join('\n')
}

/** What a case has to work with: where its script signals, and what the door left. */
interface ThePlace {
  /** The folder case 1's script writes `started` into, and the test writes `may-end` into. */
  readonly signals: string
  /** A path in the test's own folder where nothing is, and nothing is ever made. */
  readonly nothingIsHere: string
  /** Put `body` in as the made-up xvfb-run, after a first line naming `interpreter` and the line that sets PATH. */
  script(body: string, interpreter?: string): void
  /** The print folders the door has in TMPDIR now, by name. */
  printFolders(): string[]
}

/**
 * RUN `work` WITH NO SCREEN, A PATH THAT HOLDS ONLY THE MADE-UP XVFB-RUN, AND A TMPDIR OF THE TEST'S OWN. The four
 * variables are put back, and the folder removed, whatever happens.
 */
async function inAPlaceOfItsOwn(what: string, work: (place: ThePlace) => Promise<void>): Promise<void> {
  const folder = aTestDatabaseFolder(what)
  const bin = join(folder, 'bin')
  const signals = join(folder, 'signals')
  const temporary = join(folder, 'temporary')
  for (const one of [bin, signals, temporary]) mkdirSync(one)
  const kept = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY, PATH: process.env.PATH, TMPDIR: process.env.TMPDIR }
  try {
    delete process.env.DISPLAY
    delete process.env.WAYLAND_DISPLAY
    process.env.PATH = bin
    process.env.TMPDIR = temporary
    await work({
      signals,
      nothingIsHere: join(folder, 'no-such-interpreter'),
      script: (body, interpreter = '/bin/sh') => {
        // WRITTEN BESIDE AND MOVED IN, so the door never finds half a script.
        const next = join(folder, 'xvfb-run.next')
        writeFileSync(next, `#!${interpreter}\nPATH=/usr/bin:/bin\nexport PATH\n${body}\n`)
        chmodSync(next, 0o755)
        renameSync(next, join(bin, 'xvfb-run'))
      },
      printFolders: () => readdirSync(temporary).filter((name) => name.startsWith(THE_PRINT_FOLDER_PREFIX)).sort(),
    })
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    removeThisTestFolder(folder)
  }
}

describe('the PDF door prints one page at a time, and says each way a print fails', () => {
  let t: TestDb | undefined
  let app: FastifyInstance | undefined
  /** Case 1's lines of the server's log, for case 5. Null until case 1 has run to its end. */
  let theLinesOfCaseOne: string[] | null = null

  beforeAll(async () => {
    t = await freshDb()
    const { buildApp } = await import('../src/server/index.ts')
    app = (await buildApp({
      production: false,
      webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
      webAppUrl: settings().webAddress,
      logLevel: 'info',
      logStream: THE_LOG,
    })).app
    await app.ready()
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  /** The office, or a failure that says it was not built. */
  function theOffice(): FastifyInstance {
    if (app === undefined) throw new Error('The made-up office was not built, so the door cannot be asked.')
    return app
  }

  it.skipIf(process.platform !== 'linux')('1. a second print while one is running is refused with 409, and the first and a later one answer their PDFs', async (context) => {
    const binary = electronsBinary()
    if ('missing' in binary) context.skip(binary.missing)
    const door = theOffice()
    await inAPlaceOfItsOwn('one-pdf-at-a-time', async (place) => {
      place.script(itWaitsAndThenPrints(place.signals))
      const from = THE_LOG.lines.length
      const a = askedToPrint(door)
      let answerA: LightMyRequestResponse
      try {
        await untilThereIs(join(place.signals, 'started'), "Print A's started file")
        const b = await askedToPrint(door)
        expect(b.statusCode, b.body).toBe(409)
        expect(b.json()).toMatchObject({ code: 'reportPdfBusy', values: {} })
        expect(place.printFolders(), 'the print folders while A prints and B is refused').toHaveLength(1)
      } finally {
        // A IS LET GO WHATEVER HAPPENED ABOVE, and waited for, so nothing is printing when the folder is removed.
        writeFileSync(join(place.signals, 'may-end'), '')
        answerA = await a
      }
      expect(answerA.statusCode, answerA.body).toBe(200)
      expect(String(answerA.headers['content-type'])).toMatch(/^application\/pdf/u)
      expect(answerA.rawPayload).toEqual(Buffer.from(A_MADE_UP_PDF, 'latin1'))

      const c = await askedToPrint(door)
      expect(c.statusCode, c.body).toBe(200)
      expect(c.rawPayload).toEqual(Buffer.from(A_MADE_UP_PDF, 'latin1'))
      expect(place.printFolders(), 'print folders the door left behind').toEqual([])
      theLinesOfCaseOne = THE_LOG.lines.slice(from)
    })
  }, A_CASE_THAT_PRINTS_MS)

  it.skipIf(process.platform !== 'linux')('2. a print that ends with an exit code and writes nothing is refused with 500 and the code, and the next print answers', async (context) => {
    const binary = electronsBinary()
    if ('missing' in binary) context.skip(binary.missing)
    const door = theOffice()
    await inAPlaceOfItsOwn('a-print-that-exits', async (place) => {
      place.script('exit 3')
      const d = await askedToPrint(door)
      expect(d.statusCode, d.body).toBe(500)
      expect(d.json()).toMatchObject({ code: 'reportPdfExited', values: { code: 3 } })

      place.script(IT_PRINTS)
      const e = await askedToPrint(door)
      expect(e.statusCode, e.body).toBe(200)
      expect(e.rawPayload).toEqual(Buffer.from(A_MADE_UP_PDF, 'latin1'))
      expect(place.printFolders(), 'print folders the door left behind').toEqual([])
    })
  }, A_CASE_THAT_PRINTS_MS)

  it.skipIf(process.platform !== 'linux')('3. a print that ends with an exit code and a last line is refused with 500, the code and the line', async (context) => {
    const binary = electronsBinary()
    if ('missing' in binary) context.skip(binary.missing)
    const door = theOffice()
    await inAPlaceOfItsOwn('a-print-that-says-why', async (place) => {
      place.script(["printf '%s\\n' 'a made-up last line' >&2", 'exit 3'].join('\n'))
      const reply = await askedToPrint(door)
      expect(reply.statusCode, reply.body).toBe(500)
      expect(reply.json()).toMatchObject({ code: 'reportPdfExitedSaying', values: { code: 3, line: 'a made-up last line' } })
      expect(place.printFolders(), 'print folders the door left behind').toEqual([])
    })
  }, A_CASE_THAT_PRINTS_MS)

  it.skipIf(process.platform !== 'linux')('4. a print that cannot start is refused with 500, names the start error, and the log says it once at warn', async (context) => {
    const binary = electronsBinary()
    if ('missing' in binary) context.skip(binary.missing)
    const door = theOffice()
    await inAPlaceOfItsOwn('a-print-that-cannot-start', async (place) => {
      place.script(IT_PRINTS, place.nothingIsHere)
      const from = THE_LOG.lines.length
      const reply = await askedToPrint(door)
      expect(reply.statusCode, reply.body).toBe(500)
      expect(reply.json()).toMatchObject({ code: 'reportPdfCouldNotStart', values: {} })
      const detail = String(reply.json().detail)
      expect(detail.startsWith(COULD_NOT_START_DETAIL), detail).toBe(true)
      const startError = detail.slice(COULD_NOT_START_DETAIL.length)
      // THE SYSTEM'S OWN ERROR: a first line naming an interpreter that does not exist is ENOENT on Linux.
      expect(startError).toContain('ENOENT')
      expect(place.printFolders(), 'print folders the door left behind').toEqual([])

      // pino writes a line as it is logged, and the reply is sent after it, so the line is here by now.
      const said = theLinesSaying(THE_LOG.lines.slice(from), COULD_NOT_START_SAID)
      expect(said, 'the lines that say the window program could not start').toEqual([{ ...said[0], level: WARN, msg: `${COULD_NOT_START_SAID}${startError}` }])
    })
  }, A_CASE_THAT_PRINTS_MS)

  it.skipIf(process.platform !== 'linux')("5. the sandbox line is in case 1's log once for each print exactly when this machine turns the sandbox off", (context) => {
    const binary = electronsBinary()
    if ('missing' in binary) context.skip(binary.missing)
    if (theLinesOfCaseOne === null) throw new Error('Case 1 did not run to its end, so there is no log of its prints to read.')
    const withoutTheSandbox = theCommandThatPrints('a.html', 'a.pdf', { kind: 'own' }).withoutTheSandbox
    // CASE 1 PRINTED TWICE, A AND C. B was refused before anything was printed.
    const printsInCaseOne = 2
    if (withoutTheSandbox === null) {
      expect(theLinesSaying(theLinesOfCaseOne, "A PDF print runs without Chromium's sandbox"), 'this machine keeps the sandbox on').toEqual([])
    } else {
      expect(theLinesSaying(theLinesOfCaseOne, withoutTheSandbox).filter((one) => one.msg === withoutTheSandbox)).toHaveLength(printsInCaseOne)
    }
  })
})
