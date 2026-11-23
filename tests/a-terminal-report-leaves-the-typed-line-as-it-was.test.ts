// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT THE TERMINAL VIEW SENDS ON ITS OWN IS NOT TYPING, AND LEAVES THE PERSON'S LINE AS IT WAS. Wave 13s, round 209.
 *
 * The holder (src/holder/index.mjs) reads the person's keys to know whether a line is half typed. Any control character
 * but Enter, an erase, Ctrl+C and Ctrl+U marked the line as not plain typing, and the characters after it went into the
 * line. The page's terminal (@xterm/xterm 6.0.0) sends ESC [ I and ESC [ O when the view gains or loses focus, if the
 * program asked for focus reports. So opening or collapsing the view left an empty line half typed, and every line a
 * secretary or a quick input typed after it was refused as typed onto a half line.
 *
 * One report of each form the holder takes out, and every report that still marks the line, of those that library sends
 * back as input by its source (InputHandler.ts, CoreBrowserTerminal.ts and CoreMouseService.ts), is named below, with
 * what it does to the line now. A real holder runs for a database of this
 * test's own (tests/terminal-holder-stand.ts). Its terminals run /bin/sh reading lines with the terminal's own line
 * editing, so a report's bytes reach the program as they are and no shell reads them as a key.
 *
 *   1. focus in and focus out on an empty line leave it plain: a line typed for somebody else is typed after focus in,
 *      and a quick input after focus out. A report in the same piece as a key the person typed is taken out of it the
 *      same way;
 *   2. focus in and focus out on a half-typed line leave it half typed: a line for somebody else is refused, and the
 *      person's Enter keeps the person's line as they typed it;
 *   3. each other report that no key sends leaves the person's line as they typed it: the person's Enter keeps it;
 *   4. the reports a key may also send, and the person's own mouse, still mark an empty line as not plain typing.
 * The secretary's line through the office's door is case 6b of tests/a-secretary-types-a-line-in-a-terminal.test.ts.
 *
 * MUTATIONS, of src/holder/index.mjs, each alone after a control run, then restored, 5 November 2026, from the logs of
 * the runs:
 *   1. the holder reads every report as typing, as it did before: cases 1, 2 and 3 go red (3 of 4); case 1 on the line
 *      for somebody else after focus in, case 2 on the person's Enter, case 3 on every report.
 *   2. focus in is not taken out: cases 1 and 2 go red (2 of 4); case 1 on the line for somebody else after focus in.
 *   3. focus out is not taken out: cases 1 and 2 go red (2 of 4); case 1 on the quick input after focus out.
 *   4. a report is taken out only when it is the whole piece: case 1 goes red (1 of 4), on the line after the joined
 *      piece.
 *   5. a report is read as a printable character: cases 1, 2 and 3 go red (3 of 4); case 2 on the person's Enter, after
 *      its refusal held.
 *   6. focus in or out drops the person's line and makes it plain: case 2 goes red (1 of 4), on the refusal.
 *   7. only focus is taken out: case 3 goes red (1 of 4), on every report.
 *   8. the cursor position on the first row and both mouse forms are taken out too: case 4 goes red (1 of 4), on all
 *      three.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { askTheHolder, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { freshDb } from './helpers.ts'
import { aPlace, holder, openThroughTheHolder, sleep, startAHolder, stopEverything, untilTheScreenShows, type HeldTerminal, type Place } from './terminal-holder-stand.ts'

let db: Awaited<ReturnType<typeof freshDb>> | undefined
let place: Place
let xdgBefore: string | undefined

/** How long after an Enter the holder has asked the screen whether it showed the line (its SHOWN_AFTER_MS is 300). */
const AFTER_THE_SCREEN_MS = 500

/** Focus in and focus out, as the page's terminal sends them when the program asked for focus reports. */
const FOCUS_IN = '\x1b[I'
const FOCUS_OUT = '\x1b[O'

/** ONE REPORT OF EACH OTHER FORM THE HOLDER TAKES OUT (TERMINAL_REPORTS in src/holder/index.mjs), which no key sends, as the library writes it. */
const THE_REPORTS_NO_KEY_SENDS = [
  { report: 'the primary device attributes', bytes: '\x1b[?1;2c' },
  { report: 'the status report', bytes: '\x1b[0n' },
  { report: 'the cursor position on a row below the first', bytes: '\x1b[12;40R' },
  { report: 'the cursor position in its private form', bytes: '\x1b[?1;5R' },
  { report: "a private mode's state", bytes: '\x1b[?1004;1$y' },
  { report: "the text area's size in characters", bytes: '\x1b[8;30;100t' },
  { report: "a setting's value", bytes: '\x1bP1$r1;30r\x1b\\' },
  { report: "the background colour's value", bytes: '\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\' },
] as const

/**
 * THE REPORTS THAT STILL MARK THE LINE. The cursor position on the first row reads the same as F3 with Ctrl, Shift or
 * Alt, which a program may put on the line. A mouse report is the person's own click, sent only when the program asked
 * for the mouse, and what it does to the line is the program's.
 */
const THE_REPORTS_THAT_MAY_BE_KEYS = [
  { report: 'the cursor position on the first row, the same as Ctrl+F3', bytes: '\x1b[1;5R' },
  { report: 'a mouse click in its SGR form', bytes: '\x1b[<0;10;5M' },
  { report: 'a mouse click in its first form', bytes: '\x1b[M **' },
] as const

beforeAll(async () => {
  db = await freshDb()
  const database = process.env['MOLE_OFFICE_DB']
  if (database === undefined) throw new Error('freshDb named no database.')
  // THE HOLDER OF THIS PROCESS'S DATABASE, with its socket in a folder this test made. XDG_CONFIG_HOME is put back.
  const made = aPlace('tr')
  place = { ...made, database, socket: theTerminalHolderSocket(database, made.env), log: theTerminalHolderLog(database, made.env) }
  xdgBefore = process.env['XDG_CONFIG_HOME']
  process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
  await startAHolder(place)
}, 60_000)

afterAll(async () => {
  db?.close()
  await stopEverything()
  if (xdgBefore === undefined) delete process.env['XDG_CONFIG_HOME']
  else process.env['XDG_CONFIG_HOME'] = xdgBefore
}, 60_000)

/** A program that numbers each line it is given and prints it back, under /bin/sh, with no shell's line editing. */
const NUMBERS_ITS_LINES = 'n=0; while IFS= read -r line; do n=$((n+1)); printf \'line-%s:[%s]\\n\' "$n" "$line"; done'

const aTerminal = (keeping: boolean): Promise<HeldTerminal> =>
  openThroughTheHolder(place, { command: '/bin/sh', args: ['-c', NUMBERS_ITS_LINES], cols: 120, rows: 30, keeping })

const asked = (request: Record<string, unknown>): Promise<Record<string, unknown>> => askTheHolder(place.socket, request)
const write = (terminal: string, data: string) => holder(place, { op: 'write', terminal, data })
const lastLine = async (terminal: string) => {
  const answer = await holder(place, { op: 'lastLine', terminal })
  return { line: answer['line'] === null ? null : (answer['line'] as { text: unknown }).text, why: answer['why'] }
}

/** The person types a line with a report after its text, ends it with Enter, and the holder's last line is read. */
async function aLineWithAReport(terminal: string, text: string, report: string): Promise<{ line: unknown; why: unknown }> {
  await write(terminal, text)
  await write(terminal, report)
  await write(terminal, '\r')
  await untilTheScreenShows(place, terminal, text)
  await sleep(AFTER_THE_SCREEN_MS)
  return lastLine(terminal)
}

describe('a report the terminal view sends', () => {
  it('1: focus in and out on an empty line leave it plain, and a line for somebody else and a quick input are typed', async () => {
    const shell = await aTerminal(false)
    await write(shell.id, FOCUS_IN)
    const typed = await asked({ op: 'typeALine', terminal: shell.id, text: 'for-somebody-else-1' })
    expect(typed, JSON.stringify(typed)).toMatchObject({ ok: true, entered: true })
    await untilTheScreenShows(place, shell.id, 'for-somebody-else-1]')

    await write(shell.id, FOCUS_OUT)
    const quick = await asked({ op: 'quickInput', terminal: shell.id, input: 'a-quick-input-2' })
    expect(quick, JSON.stringify(quick)).toMatchObject({ ok: true, entered: true })
    await untilTheScreenShows(place, shell.id, 'a-quick-input-2]')

    // IN THE SAME PIECE AS A KEY: the page's typist joins what it has not sent yet, so a report can arrive between keys.
    // The person's erase takes their x off again. The terminal's own line editing erases the report's last byte instead,
    // so only the echo is looked for here: the program is given what is left of the report with the line.
    await write(shell.id, `x${FOCUS_IN}\x7f`)
    const joined = await asked({ op: 'typeALine', terminal: shell.id, text: 'after-a-joined-piece-3' })
    expect(joined, JSON.stringify(joined)).toMatchObject({ ok: true, entered: true })
    await untilTheScreenShows(place, shell.id, 'after-a-joined-piece-3')
  }, 30_000)

  it('2: focus in and out on a half-typed line leave it half typed, and the person\'s Enter keeps the line as typed', async () => {
    const shell = await aTerminal(false)
    await write(shell.id, 'half-typed-4')
    await write(shell.id, FOCUS_IN)
    await write(shell.id, FOCUS_OUT)
    expect(await asked({ op: 'typeALine', terminal: shell.id, text: 'never-on-a-half-line' })).toMatchObject({ ok: false, code: 'half-typed' })
    await write(shell.id, '\r')
    await untilTheScreenShows(place, shell.id, 'half-typed-4')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(shell.id)).toEqual({ line: 'half-typed-4', why: null })
  }, 30_000)

  it('3: each other report no key sends leaves the person\'s line as they typed it', async () => {
    const shell = await aTerminal(false)
    const read: Record<string, unknown> = {}
    for (const [at, one] of THE_REPORTS_NO_KEY_SENDS.entries()) {
      const text = `kept-after-report-${String(at)}`
      read[one.report] = (await aLineWithAReport(shell.id, text, one.bytes)).line
    }
    expect(read).toEqual(Object.fromEntries(THE_REPORTS_NO_KEY_SENDS.map((one, at) => [one.report, `kept-after-report-${String(at)}`])))
  }, 60_000)

  it('4: a report a key may also send, and the person\'s mouse, still mark an empty line as not plain typing', async () => {
    const shell = await aTerminal(false)
    const read: Record<string, unknown> = {}
    for (const one of THE_REPORTS_THAT_MAY_BE_KEYS) {
      await write(shell.id, one.bytes)
      read[one.report] = (await asked({ op: 'typeALine', terminal: shell.id, text: 'never-after-a-key' }))['code']
      // CTRL+U drops the line, so the next report starts on a plain one.
      await write(shell.id, '\x15')
    }
    expect(read).toEqual(Object.fromEntries(THE_REPORTS_THAT_MAY_BE_KEYS.map((one) => [one.report, 'half-typed'])))
  }, 30_000)
})
