// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE TYPED INTO THE PERSON'S TERMINAL BY SOMEBODY ELSE IS NEVER READ AS THE PERSON'S TYPING. Wave 13s, round 83.
 *
 * The holder's request typeALine (src/holder/index.mjs) types one line and its Enter for somebody other than the person,
 * and never reads it as the person's typing. The office asks for it through one function, typeALineForSomebodyElse
 * (src/server/lib/terminals.ts), which first reads the holder's hello and refuses a holder that does not name the
 * request. A real holder runs for a database of this test's own, and the office's own code runs in this process against
 * it, as the another-computer test does (tests/terminal-holder-stand.ts). The note the server keeps is proved in
 * tests/typing-in-a-terminal-is-kept-as-the-persons-words.test.ts, case 8.
 *
 *   1. A whole line and its Enter are typed, the screen shows the command's output, and the answer says so. The same
 *      through the office's function. A line with Enter or another key in it is refused, and so is an ended terminal.
 *   2. The line is never the person's last line: not before the person typed one, and not after.
 *   3. With keeping on, the line is handed as left out, typed by another, and never with its text. A line the person
 *      types after it is kept as before. With keeping off, nothing is counted.
 *   4. A line the person has half typed is refused with half-typed, and through the office's function with a code of its
 *      own. Nothing is typed, and the person's half line, ended with Enter, is the person's line as before.
 *   5. When the person types in the pause before the Enter, the Enter is not sent and the answer says why. The mixed
 *      line, once the person ends it, is never kept as the person's words nor offered as the last line. It is counted as
 *      typed by another. A line the person types after it is the person's again.
 *   5b. When the person types and presses Enter in the pause, exactly one Enter reaches the terminal, the person's: the
 *      holder does not press its own, and the office's function answers why. The mixed line is never kept as the
 *      person's words nor offered as the last line, and it is counted as typed by another. The terminal numbers each
 *      line it is given, so a second Enter would be a second line (wave 13s, round 86).
 *   6. The holder's hello names typeALine among the requests it understands, and the office reads that list.
 *   7. A holder whose hello names no such list is older than this office: the office's function refuses it with a code
 *      before anything is sent, nothing is typed, and the older holder still serves. It is a real holder with a stand-in
 *      socket in front of it that takes the list out of its hello (startAnOlderHolder).
 *
 * MUTATIONS, each alone after a control run, on 23 October 2026, each put back before the next:
 *   1. typeALine reads its line and Enter as the person's typing (readTheTyping once the Enter is sent): cases 2 and 3
 *      go red, and case 8 of the keeping test.
 *   2. typeALine's check for a half-typed line is taken out: case 4 goes red.
 *   3. the mark on a line the person typed into in the pause is taken out: case 5 goes red, the mixed line answered as
 *      the person's last line.
 *   4a. typeALineForSomebodyElse no longer reads hello's list: case 7 goes red, the older holder typing the line.
 *   4b. hello's list names no request: cases 1, 4 and 6 go red, as the office refuses this holder as older. Case 7 stays
 *      green, because the stand-in takes the list out either way.
 *   5. takeTheLines no longer counts a line typed by another: case 8 of the keeping test goes red.
 *   6a. typeALine's check for Enter or another key in the text is taken out: case 1b goes red, the line with Enter
 *      typed.
 *   6b. typeALine's check for an ended terminal is taken out: case 1b goes red, the ended terminal answered with no
 *      refusal.
 * ROUND 86's MUTATIONS, each alone after a control run, on 23 October 2026, each put back before the next:
 *   7. the holder's check for a line the person ended in its pause is taken out: case 5b goes red, two Enters reaching
 *      the terminal, and case 10b of the secretary's line test.
 *   8. typeALine does not mark its line before it writes it: cases 1, 2, 3, 5 and 5b go red; in 5b the mixed line is the
 *      person's last line and is kept with its text.
 *   9. typeALine does not take the mark off after its own Enter: cases 2 and 3 go red, the person's next line read as
 *      typed by another, and case 8 of the keeping test.
 *  10. typeALineForSomebodyElse does not read the holder's new answer: case 5b goes red, the function refusing with 502.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_HOLDER_REQUESTS, askTheHolder, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { freshDb } from './helpers.ts'
import {
  aPlace,
  holder,
  openThroughTheHolder,
  sleep,
  startAHolder,
  startAnOlderHolder,
  stopEverything,
  until,
  untilTheScreenShows,
  watch,
  type HeldTerminal,
  type Place,
} from './terminal-holder-stand.ts'

type TheOffice = typeof import('../src/server/lib/terminals.ts')

let db: Awaited<ReturnType<typeof freshDb>> | undefined
let place: Place
let office: TheOffice
let xdgBefore: string | undefined

/** How long after an Enter the holder has asked the screen whether it showed the line (its SHOWN_AFTER_MS is 300). */
const AFTER_THE_SCREEN_MS = 500

beforeAll(async () => {
  db = await freshDb()
  const database = process.env['MOLE_OFFICE_DB']
  if (database === undefined) throw new Error('freshDb named no database.')
  // THE HOLDER OF THIS PROCESS'S DATABASE, with its socket in a folder this test made. The office's code in this process
  // reads XDG_CONFIG_HOME to find it, so it is set here and put back afterwards.
  const made = aPlace('tl')
  place = { ...made, database, socket: theTerminalHolderSocket(database, made.env), log: theTerminalHolderLog(database, made.env) }
  xdgBefore = process.env['XDG_CONFIG_HOME']
  process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
  await startAHolder(place)
  office = await import('../src/server/lib/terminals.ts')
}, 60_000)

afterAll(async () => {
  db?.close()
  await stopEverything()
  if (xdgBefore === undefined) delete process.env['XDG_CONFIG_HOME']
  else process.env['XDG_CONFIG_HOME'] = xdgBefore
}, 60_000)

/** A bash terminal opened straight through the holder, its process group recorded. */
const aShell = (at: Place, keeping: boolean): Promise<HeldTerminal> => openThroughTheHolder(at, { cols: 100, rows: 30, keeping })

/** A command that numbers each line it is given, so each Enter that reaches the terminal is one numbered line. */
const NUMBERS_ITS_LINES = 'n=0; while IFS= read -r line; do n=$((n+1)); printf \'line-%s:[%s]\\n\' "$n" "$line"; done'

/** Ask the holder one thing and give back its answer as it came, a refusal too. */
const asked = (at: Place, request: Record<string, unknown>): Promise<Record<string, unknown>> => askTheHolder(at.socket, request)

const typeALine = (at: Place, terminal: string, text: unknown) => asked(at, { op: 'typeALine', terminal, text })
const write = (at: Place, terminal: string, data: string) => holder(at, { op: 'write', terminal, data })
const lastLine = async (at: Place, terminal: string) => {
  const answer = await holder(at, { op: 'lastLine', terminal })
  return { line: answer['line'], why: answer['why'] }
}
const takeLines = async (at: Place, terminal: string) => {
  const answer = await holder(at, { op: 'takeLines', terminal })
  return { lines: answer['lines'] as Record<string, unknown>[], waiting: answer['waiting'] }
}

/** The office's own refusal, with its status, its code and its English, or what came instead. */
async function theRefusalOf(asking: Promise<unknown>): Promise<{ status: number; code: string | undefined; says: string }> {
  try {
    const answer = await asking
    throw new Error(`The office did not refuse. It answered ${JSON.stringify(answer)}.`)
  } catch (err) {
    const refusal = err as { status?: unknown; code?: string; message?: string }
    if (typeof refusal.status !== 'number') throw err
    return { status: refusal.status, code: refusal.code, says: String(refusal.message) }
  }
}

describe('a line typed for somebody else', () => {
  it('1: is typed whole with its Enter, the screen shows what it ran, and the office types one too', async () => {
    const shell = await aShell(place, false)
    const typed = await typeALine(place, shell.id, 'echo typed-for-$((6*7))')
    expect(typed, JSON.stringify(typed)).toMatchObject({ ok: true, entered: true, linesToTake: 0 })
    expect((await untilTheScreenShows(place, shell.id, 'typed-for-42')).some((line) => line.includes('typed-for-42'))).toBe(true)

    const through = await office.typeALineForSomebodyElse(shell.id, 'echo through-the-office-$((7*7))')
    expect(through).toEqual({ entered: true, linesToTake: 0 })
    expect((await untilTheScreenShows(place, shell.id, 'through-the-office-49')).some((line) => line.includes('through-the-office-49'))).toBe(true)
    // WITH KEEPING OFF NOTHING IS COUNTED.
    expect(await takeLines(place, shell.id)).toEqual({ lines: [], waiting: 0 })
  }, 30_000)

  it('1b: with Enter or another key in it, or no text, is refused and nothing is typed; an ended terminal is refused', async () => {
    const shell = await aShell(place, false)
    const seen = await watch(place, shell.id)
    for (const text of ['echo with-enter-1\r', 'echo with-an-arrow-2\x1b[A', 'echo with-a-tab-3\t', '', 4]) {
      const refused = await typeALine(place, shell.id, text)
      expect(refused, JSON.stringify(text)).toMatchObject({ ok: false })
      expect(refused['code'], JSON.stringify(text)).toBeUndefined()
    }
    await sleep(AFTER_THE_SCREEN_MS)
    expect(seen.output()).not.toMatch(/with-enter|with-an-arrow|with-a-tab/)
    seen.close()

    const ended = await openThroughTheHolder(place, { command: '/bin/sh', args: ['-c', 'exit 0'] })
    await until(() => holder(place, { op: 'list' }), (list) => (list['terminals'] as HeldTerminal[]).some((one) => one.id === ended.id && one.state === 'ended'))
    expect(await typeALine(place, ended.id, 'echo too-late')).toMatchObject({ ok: false, code: 'ended' })
  }, 30_000)

  it('2: is never the person\'s last line, before the person typed one or after', async () => {
    const shell = await aShell(place, false)
    await typeALine(place, shell.id, 'echo first-for-them-$((1+1))')
    await untilTheScreenShows(place, shell.id, 'first-for-them-2')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(place, shell.id)).toEqual({ line: null, why: 'none' })

    await write(place, shell.id, 'echo mine-$((2+2))\r')
    await untilTheScreenShows(place, shell.id, 'mine-4')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(place, shell.id)).toMatchObject({ line: { text: 'echo mine-$((2+2))' }, why: null })
    await typeALine(place, shell.id, 'echo then-for-them-$((3+3))')
    await untilTheScreenShows(place, shell.id, 'then-for-them-6')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(place, shell.id)).toMatchObject({ line: { text: 'echo mine-$((2+2))' }, why: null })
  }, 30_000)

  it('3: with keeping on, is handed as left out, typed by another, and a later line of the person\'s is kept', async () => {
    const shell = await aShell(place, true)
    const typed = await typeALine(place, shell.id, 'echo for-the-person-$((4+4))')
    expect(typed, JSON.stringify(typed)).toMatchObject({ ok: true, entered: true, linesToTake: 1 })
    await untilTheScreenShows(place, shell.id, 'for-the-person-8')
    await write(place, shell.id, 'echo the-persons-own-$((5+5))\r')
    await untilTheScreenShows(place, shell.id, 'the-persons-own-10')
    await sleep(AFTER_THE_SCREEN_MS)
    const taken = await takeLines(place, shell.id)
    expect(taken.waiting).toBe(0)
    expect(taken.lines.map(({ at: _at, ...line }) => line)).toEqual([{ left: 'typed-by-another' }, { text: 'echo the-persons-own-$((5+5))' }])
    expect(JSON.stringify(taken.lines)).not.toContain('for-the-person')
  }, 30_000)

  it('4: is refused while the person has a line half typed, nothing is typed, and the half line stays the person\'s', async () => {
    const shell = await aShell(place, true)
    const seen = await watch(place, shell.id)
    await write(place, shell.id, 'echo half')
    await untilTheScreenShows(place, shell.id, 'echo half')
    const refused = await typeALine(place, shell.id, 'echo never-typed-here')
    expect(refused, JSON.stringify(refused)).toMatchObject({ ok: false, code: 'half-typed' })
    const throughTheOffice = await theRefusalOf(office.typeALineForSomebodyElse(shell.id, 'echo never-typed-either'))
    expect(throughTheOffice).toMatchObject({ status: 409, code: 'terminalLineHalfTyped' })
    expect(throughTheOffice.says).toContain('half typed')
    expect(throughTheOffice.says).toContain('nothing was typed')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(seen.output()).not.toContain('never-typed')
    seen.close()

    await write(place, shell.id, '-alone\r')
    await untilTheScreenShows(place, shell.id, 'half-alone')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(place, shell.id)).toMatchObject({ line: { text: 'echo half-alone' }, why: null })
    const taken = await takeLines(place, shell.id)
    expect(taken.lines.map(({ at: _at, ...line }) => line)).toEqual([{ text: 'echo half-alone' }])
  }, 30_000)

  it('5: is not entered when the person types in the pause, and the mixed line is never the person\'s', async () => {
    const shell = await aShell(place, true)
    const seen = await watch(place, shell.id)
    const typing = typeALine(place, shell.id, 'echo mixed-$((5+5))')
    // THE PERSON TYPES ONCE THE LINE IS ON THE SCREEN, inside the holder's pause of 100 ms before its Enter.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('mixed-$((5+5))') && Date.now() < deadline) await sleep(2)
    await write(place, shell.id, ' person-part')
    const answer = await typing
    expect(answer, JSON.stringify(answer)).toMatchObject({ ok: true, entered: false, why: 'the-person-typed', linesToTake: 0 })
    seen.close()

    await write(place, shell.id, '\r')
    await untilTheScreenShows(place, shell.id, 'mixed-10 person-part')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(place, shell.id)).toEqual({ line: null, why: 'none' })
    const taken = await takeLines(place, shell.id)
    expect(taken.lines.map(({ at: _at, ...line }) => line)).toEqual([{ left: 'typed-by-another' }])

    // THE NEXT LINE IS THE PERSON'S AGAIN.
    await write(place, shell.id, 'echo after-$((1+2))\r')
    await untilTheScreenShows(place, shell.id, 'after-3')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await lastLine(place, shell.id)).toMatchObject({ line: { text: 'echo after-$((1+2))' }, why: null })
  }, 30_000)

  it('5b: when the person presses Enter in the pause, one Enter reaches the terminal and the mixed line is never the person\'s', async () => {
    const counter = await openThroughTheHolder(place, { command: '/bin/sh', args: ['-c', NUMBERS_ITS_LINES], cols: 100, rows: 30, keeping: true })
    const seen = await watch(place, counter.id)
    const typing = office.typeALineForSomebodyElse(counter.id, 'for-another').catch((err: unknown) => ({ refused: String(err) }))
    // THE PERSON TYPES AND PRESSES ENTER ONCE THE LINE IS ON THE SCREEN, inside the holder's pause of 100 ms.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('for-another') && Date.now() < deadline) await sleep(2)
    await write(place, counter.id, ' person-part\r')
    const answer = await typing
    seen.close()
    await untilTheScreenShows(place, counter.id, 'line-1:')
    await sleep(AFTER_THE_SCREEN_MS)
    const kept = { last: await lastLine(place, counter.id), taken: (await takeLines(place, counter.id)).lines.map(({ at: _at, ...line }) => line) }

    // THE PERSON'S NEXT LINE IS THE TERMINAL'S SECOND only when no other Enter reached it in between.
    await write(place, counter.id, 'next\r')
    const screen = await untilTheScreenShows(place, counter.id, ':[next]')
    expect({ answer, ...kept, numbered: screen.filter((line) => /^line-\d+:/.test(line)) }).toEqual({
      answer: { entered: false, why: 'the-person-ended-the-line', linesToTake: 1 },
      last: { line: null, why: 'none' },
      taken: [{ left: 'typed-by-another' }],
      numbered: ['line-1:[for-another person-part]', 'line-2:[next]'],
    })
  }, 30_000)

  it('6: is a request the holder\'s hello names, and the office reads the list', async () => {
    const hello = await holder(place, { op: 'hello' })
    expect(THE_HOLDER_REQUESTS).toContain('typeALine')
    expect(hello['understands']).toEqual(THE_HOLDER_REQUESTS)
    expect((await office.theHolder()).understands).toEqual(THE_HOLDER_REQUESTS)
  }, 30_000)
})

describe('a holder older than this office', () => {
  it('7: is refused with a code before anything is sent, nothing is typed, and it still serves', async () => {
    // A SECOND PLACE FOR THE SAME DATABASE, so the office in this process finds the older holder while this case runs.
    const made = aPlace('to')
    const old: Place = { ...made, database: place.database, socket: theTerminalHolderSocket(place.database, made.env), log: theTerminalHolderLog(place.database, made.env) }
    const older = await startAnOlderHolder(old)
    process.env['XDG_CONFIG_HOME'] = old.env.XDG_CONFIG_HOME
    try {
      expect('understands' in (await holder(old, { op: 'hello' }))).toBe(false)
      // A HOLDER WITH NO LIST IS NOT REFUSED FOR THAT: only for what it cannot do.
      const hello = await office.theHolder()
      expect(hello).toMatchObject({ pid: older.holder.pid, protocol: 1 })
      expect(hello.understands).toBeUndefined()

      const shell = await aShell(old, false)
      const seen = await watch(old, shell.id)
      const refused = await theRefusalOf(office.typeALineForSomebodyElse(shell.id, 'echo not-for-an-older-holder'))
      expect(refused).toMatchObject({ status: 409, code: 'terminalHolderTooOld' })
      expect(refused.says).toContain('older than this office')
      expect(refused.says).toContain('cannot type a line for somebody else')
      expect(refused.says).toContain('Nothing was typed')
      expect(refused.says).toContain('ends every terminal the person has open')
      await sleep(AFTER_THE_SCREEN_MS)
      expect(seen.output()).not.toContain('not-for-an-older-holder')
      seen.close()

      // AND IT STILL SERVES: a write reaches the terminal.
      await write(old, shell.id, 'echo still-serves-$((2*3))\r')
      expect((await untilTheScreenShows(old, shell.id, 'still-serves-6')).some((line) => line.includes('still-serves-6'))).toBe(true)
    } finally {
      process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
      await older.close()
    }
  }, 60_000)
})
