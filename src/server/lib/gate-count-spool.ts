// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GATE-COUNT SPOOL'S READER. Wave 13r round O.
 *
 * The sandbox tools hold no key, so they cannot send a count to the office's door. Each appends one line per encounter
 * to a day file in `<sandboxes>/.gate-counts/`, in the form src/config/gate-count-spool.mjs makes and reads. This
 * reads each new line once and counts it on the day it happened.
 *
 * ONCE, ALSO ACROSS A RESTART. `gate_count_spool_reads` keeps how many bytes of each day file are read. A line is read
 * only once it ends in a newline, so a line still being written waits for the next read. How far a file was read, the
 * counts of its new lines and its new length are read and written in one immediate transaction (BEGIN IMMEDIATE). So a
 * line is never counted twice and never lost, also when two offices of one world read the spool at once (round Q).
 *
 * A LINE IT CANNOT USE GOES TO THE REJECTS FILE, `rejects.jsonl` in the spool, inside that transaction and before the
 * counts and the new length are written, with the file, the line's first byte, its text, the reason's code and its
 * sentence, and when it was read. It is not counted. If the office stops before the transaction ends, the next read
 * sends the same line to the rejects file again; it never counts one twice.
 *
 * WHAT IT REFUSES, by name, counting nothing: a spool that is a link, is not a folder, or is not at 0700. In a spool it
 * reads, a name that is not a day file or a day file that is not a plain file is named and skipped, and so is a day
 * file shorter than what was already read from it, since that file was changed rather than appended to.
 *
 * ONLY A CANONICAL OFFICE READS IT. A scratch office, such as a test's or a worktree's, never reads the machine's
 * spool or writes its rejects file.
 *
 * AND ONLY ONE WORLD'S OFFICES (wave 13r round Q). A machine can run two canonical offices, the
 * stable one and a developer's, and each would count every line in its own database. So the first office that reads
 * the spool writes its world's identity into `.world` at 0600, once. An office of another world never reads the spool:
 * it says so once, naming both worlds, and counts nothing. No code path writes over `.world`: a claim creates it only
 * where there is none, and only the press below removes it. A `.world` that is a link, not a plain file, not at 0600
 * or not one identity on one line is refused by name, and never claimed afresh. An office whose world has no identity
 * never guesses one, so it reads nothing.
 *
 * THE PERSON HANDS THE SPOOL TO ANOTHER WORLD WITH A PRESS (round W): "Give the spool to this office's world", in the
 * Gates panel on the Settings page of the office that wants the spool. The panel shows it only while another world
 * owns the spool. Only the person presses it, proved as the person; no grant and no raise presses it. The press
 * removes `.world` only when this office reads the spool, another world owns it now, `.world` still names the world
 * the person saw, and the person gave a reason. Otherwise it refuses and changes nothing. It writes one line in the
 * rejects file before the removal: who pressed, how the office knew it was the person, why, and from which byte of
 * each day file this office counts. A removal that fails adds a second line. Then this office reads the spool again
 * at once, and so claims it, and the other world's office stops reading at its next read, as above. Nothing prevents
 * a person from removing `.world` by hand, and then the next office that reads the spool claims it, as before.
 *
 * WHERE THIS OFFICE COUNTS FROM AFTER THE PRESS, for each day file. A file this office has a row for in
 * `gate_count_spool_reads` continues from that row. A file it has no row for starts where the file's last whole line
 * ended at the press, which is the file's length unless a line is still being written, and the press stores that byte
 * as the file's row. So no line the other world counted is counted here, and the lines written after the other
 * office's last read and before the press are counted by nobody. One case is written down and not built: a row read
 * before the press may be old. If this office owned the spool before, the lines another office counted in between are
 * counted here again. The press's answer and its line in the rejects file say so whenever a file continues from a
 * row. Telling the two apart would need each row to keep the world that owned the spool when it was read, which is a
 * new column, so it waits until it is needed.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, readSync, type Stats, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { GATE_COUNT_LINE_REFUSED, GATE_COUNT_SPOOL, readAGateCountLine, THE_GATE_COUNT_SPOOL_FOLDER } from '../../config/gate-count-spool.mjs'
import { localStamp } from '@shared/typed-time.mjs'
import { sqlite } from '../db/client.ts'
import { gateMet } from './gate-counts.ts'
import { named } from './named-timers.ts'
import { theWorldThisDatabaseIs } from './world.ts'

/** This machine's spool. */
export const THE_GATE_COUNT_SPOOL = THE_GATE_COUNT_SPOOL_FOLDER

/**
 * What one read did. `refused` names why the spool was not read at all, and is null when it was read or is absent.
 * `anotherWorld` is there only when the spool is refused because `.world` names another world, and is that world.
 */
export type ASpoolRead = {counted: number; rejected: number; refused: string | null; says: string[]; anotherWorld?: string}

/**
 * Read every day file's new lines, count the good ones and send the rest to the rejects file. `world` is the identity
 * of this office's world, and null when it has none.
 */
export function readTheGateCountSpool(folder: string = THE_GATE_COUNT_SPOOL, world: string | null = theWorldThisDatabaseIs()): ASpoolRead {
  const theFolder = theFolderRefused(folder)
  if (theFolder === 'absent') return {counted: 0, rejected: 0, refused: null, says: [`There is no gate-count spool at ${folder}, so nothing was counted from it.`]}
  const refusing = (why: string): ASpoolRead => {
    const refused = `The gate-count spool ${folder} ${why}, so it was not read and nothing was counted.`
    return {counted: 0, rejected: 0, refused, says: [refused]}
  }
  if (theFolder !== null) return refusing(theFolder.refused)
  if (world === null) return refusing("cannot be matched to this office's world, which has no identity")
  const owner = theSpoolsWorld(folder, world)
  if ('refused' in owner) return refusing(owner.refused)
  if ('anotherWorld' in owner) {
    const refused = `The gate-count spool ${folder} belongs to the world ${owner.anotherWorld}, as its ${GATE_COUNT_SPOOL.world} says, and this office is in the world ${world}, so this office does not read it and counted nothing. To give it to this office's world, the person presses "Give the spool to this office's world" in the Gates panel on this office's Settings page.`
    return {counted: 0, rejected: 0, refused, says: [refused], anotherWorld: owner.anotherWorld}
  }
  const read: ASpoolRead = {counted: 0, rejected: 0, refused: null, says: owner.claimed ? [`The gate-count spool ${folder} belonged to no world, so this office wrote its world ${world} into ${GATE_COUNT_SPOOL.world}, and only offices of that world read it from now on.`] : []}
  const storedBytes = sqlite.prepare('SELECT bytes FROM gate_count_spool_reads WHERE file = ?')
  const storeBytes = sqlite.prepare('INSERT INTO gate_count_spool_reads (file, bytes) VALUES (?, ?) ON CONFLICT(file) DO UPDATE SET bytes = excluded.bytes')
  for (const entry of theSpoolsEntries(folder)) {
    if ('notADayFile' in entry) { read.says.push(`${entry.name} in the gate-count spool is not a day file, so it was not read.`); continue }
    if ('notAPlainFile' in entry) { read.says.push(`${entry.name} in the gate-count spool is not a plain file, so it was not read.`); continue }
    const {name, day} = entry
    // ONE IMMEDIATE TRANSACTION, from reading how far the file was read to storing its new length. Two offices of one
    // world share this table in their one database. The first takes the write lock before it reads how far, so the
    // second waits for it and then starts after the lines the first counted.
    const done = sqlite.transaction((): {counted: number; rejected: number; says: string | null} => {
      const from = (storedBytes.get(name) as {bytes: number} | undefined)?.bytes ?? 0
      const fd = openSync(join(folder, name), constants.O_RDONLY | constants.O_NOFOLLOW)
      let bytes: Buffer
      try {
        const size = fstatSync(fd).size
        if (size < from) return {counted: 0, rejected: 0, says: `${name} in the gate-count spool is ${size} bytes, shorter than the ${from} already read, so it was changed rather than appended to, and nothing more is counted from it.`}
        bytes = Buffer.alloc(size - from)
        let got = 0
        while (got < bytes.length) {
          const n = readSync(fd, bytes, got, bytes.length - got, from + got)
          if (n === 0) break
          got += n
        }
        bytes = bytes.subarray(0, got)
      } finally {
        closeSync(fd)
      }
      const end = bytes.lastIndexOf(0x0a)
      if (end === -1) return {counted: 0, rejected: 0, says: null}
      const counted: {gate: string; position: string}[] = []
      const rejected: string[] = []
      let at = 0
      for (const text of bytes.subarray(0, end).toString('utf8').split('\n')) {
        const line = readAGateCountLine(text, day)
        if ('line' in line) counted.push(line.line)
        else rejected.push(JSON.stringify({file: name, byte: from + at, text, refused: line.refused, why: GATE_COUNT_LINE_REFUSED[line.refused], readAt: localStamp(new Date())}) + '\n')
        at += Buffer.byteLength(text, 'utf8') + 1
      }
      if (rejected.length > 0) theRejectsFileTakes(folder, rejected.join(''))
      for (const line of counted) gateMet(line.gate, line.position, day)
      storeBytes.run(name, from + end + 1)
      return {counted: counted.length, rejected: rejected.length, says: null}
    }).immediate()
    if (done.says !== null) read.says.push(done.says)
    read.counted += done.counted
    read.rejected += done.rejected
    if (done.counted > 0) read.says.push(`${done.counted} ${done.counted === 1 ? 'line' : 'lines'} of ${name} in the gate-count spool counted.`)
    if (done.rejected > 0) read.says.push(`${done.rejected} ${done.rejected === 1 ? 'line' : 'lines'} of ${name} in the gate-count spool not counted, and sent to ${GATE_COUNT_SPOOL.rejects}.`)
  }
  return read
}

/**
 * WHETHER THE SPOOL'S FOLDER MAY BE READ: 'absent', null when it may, or `refused`, which finishes the sentence that
 * begins with the folder. The reader, the Gates panel and the press all ask this one check.
 */
function theFolderRefused(folder: string): 'absent' | {refused: string} | null {
  let spool: Stats
  try {
    spool = lstatSync(folder)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return 'absent'
  }
  if (spool.isSymbolicLink()) return {refused: 'is a link'}
  if (!spool.isDirectory()) return {refused: 'is not a folder'}
  if ((spool.mode & 0o777) !== GATE_COUNT_SPOOL.folderMode) return {refused: `is at mode ${(spool.mode & 0o777).toString(8).padStart(4, '0')}, not 0700`}
  return null
}

/**
 * THE SPOOL'S NAMES, sorted, without the rejects file and `.world`: each a day file, with its day, or a name that is not
 * one, or a day file that is not a plain file. The reader reads the first and names the others; the press counts from
 * the first.
 */
function theSpoolsEntries(folder: string): ({name: string; day: string} | {name: string; notADayFile: true} | {name: string; notAPlainFile: true})[] {
  return readdirSync(folder, {withFileTypes: true})
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .filter(entry => entry.name !== GATE_COUNT_SPOOL.rejects && entry.name !== GATE_COUNT_SPOOL.world)
    .map(entry => {
      const day = GATE_COUNT_SPOOL.dayFile.exec(entry.name)?.[1]
      if (day === undefined) return {name: entry.name, notADayFile: true as const}
      if (!entry.isFile()) return {name: entry.name, notAPlainFile: true as const}
      return {name: entry.name, day}
    })
}

/**
 * WHICH WORLD THE SPOOL BELONGS TO, and whether this office may read it. A spool with no `.world` is claimed for this
 * office's world by creating the file, which fails if another office created it first; then that file is read as
 * any other. A `.world` that is there is only ever read, never written. `refused` finishes the sentence that begins
 * with the spool's folder, and `anotherWorld` is the world a sound `.world` names when it is not this office's.
 */
function theSpoolsWorld(folder: string, world: string): {claimed: boolean} | {refused: string} | {anotherWorld: string} {
  const file = join(folder, GATE_COUNT_SPOOL.world)
  const held = whatTheWorldFileSays(file, world)
  if (held !== 'absent') return held
  try {
    const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, GATE_COUNT_SPOOL.fileMode)
    try {
      writeSync(fd, `${world}\n`)
    } finally {
      closeSync(fd)
    }
    return {claimed: true}
  } catch (claiming) {
    if ((claiming as NodeJS.ErrnoException).code !== 'EEXIST') throw claiming
  }
  const theirs = whatTheWorldFileSays(file, world)
  if (theirs === 'absent') throw new Error(`${file} was made by another office and gone again before this office could read it.`)
  return theirs
}

/**
 * WHAT A `.world` SAYS, read and never written: 'absent' when there is none, `claimed: false` when it names this
 * office's world, `anotherWorld` when it soundly names another, and `refused`, which finishes the sentence that begins
 * with the spool's folder, when it cannot be trusted.
 */
function whatTheWorldFileSays(file: string, world: string): 'absent' | {claimed: false} | {refused: string} | {anotherWorld: string} {
  let held: Stats
  try {
    held = lstatSync(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return 'absent'
  }
  if (held.isSymbolicLink()) return {refused: `has a ${GATE_COUNT_SPOOL.world} that is a link`}
  if (!held.isFile()) return {refused: `has a ${GATE_COUNT_SPOOL.world} that is not a plain file`}
  const mode = held.mode & 0o777
  if (mode !== GATE_COUNT_SPOOL.fileMode) return {refused: `has a ${GATE_COUNT_SPOOL.world} at mode ${mode.toString(8).padStart(4, '0')}, not 0600`}
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  let text: string
  try {
    text = readFileSync(fd, 'utf8')
  } finally {
    closeSync(fd)
  }
  if (text === `${world}\n`) return {claimed: false}
  const theirs = /^(\S+)\n$/.exec(text)?.[1]
  if (theirs === undefined) return {refused: `has a ${GATE_COUNT_SPOOL.world} that does not hold one world's identity on one line`}
  return {anotherWorld: theirs}
}

/**
 * THE SPOOL'S OWNER NOW, read without claiming it: another world, with this office's, or a sentence saying why it is
 * not another world's. The Gates panel and the press ask this; only the reader claims.
 */
function theSpoolsOwnerNow(folder: string, world: string | null): {anotherWorld: string; thisWorld: string} | {not: string} {
  const theFolder = theFolderRefused(folder)
  if (theFolder === 'absent') return {not: `There is no gate-count spool at ${folder}.`}
  if (theFolder !== null) return {not: `The gate-count spool ${folder} ${theFolder.refused}.`}
  if (world === null) return {not: `The gate-count spool ${folder} cannot be matched to this office's world, which has no identity.`}
  const says = whatTheWorldFileSays(join(folder, GATE_COUNT_SPOOL.world), world)
  if (says === 'absent') return {not: `The gate-count spool ${folder} belongs to no world now, so the next office that reads it claims it.`}
  if ('refused' in says) return {not: `The gate-count spool ${folder} ${says.refused}.`}
  if ('claimed' in says) return {not: `The gate-count spool ${folder} belongs to this office's world, ${world}, already.`}
  return {anotherWorld: says.anotherWorld, thisWorld: world}
}

/** Append to the rejects file, made at 0600, in one write. A link in its place is refused by the open. */
function theRejectsFileTakes(folder: string, text: string): void {
  const fd = openSync(join(folder, GATE_COUNT_SPOOL.rejects), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, GATE_COUNT_SPOOL.fileMode)
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
}

/**
 * THE READER A CANONICAL OFFICE STARTED, kept so the press can start it again: where it logs, its spool, how often it
 * reads, and its timer while one runs. Set only by `startReadingTheGateCountSpool`, and null in an office that never
 * started one, which a scratch office never does.
 */
type AReader = {log: (line: string) => void; folder: string; every: number; watch: NodeJS.Timeout | null}
let theReader: AReader | null = null

/**
 * READ THE SPOOL NOW AND ONCE A MINUTE, in a canonical office only. One unref'd named timer, the shape of the others the
 * server starts, so it never holds the server open, and a read that fails is a line in the log, never a server down.
 * A read that counted or rejected a line is always logged. Any other read is logged when its sentences differ from the
 * last read's, so an absent spool is said once.
 *
 * A SPOOL ANOTHER WORLD OWNS ENDS THE READING, said once and naming both worlds. Found at start, it is the line this
 * answers, and no timer starts. Found by a later read, it is logged and the timer stops. Only the press starts the
 * reading again, without a restart.
 */
export function startReadingTheGateCountSpool(standing: 'canonical' | 'scratch', log: (line: string) => void, folder: string = THE_GATE_COUNT_SPOOL, every = 60_000): {line: string; watch: NodeJS.Timeout | null} {
  if (standing !== 'canonical') return {line: `This office is a scratch one, so it does not read the gate-count spool at ${folder}.`, watch: null}
  if (theReader?.watch) clearInterval(theReader.watch)
  theReader = {log, folder, every, watch: null}
  const {line, watch} = theReading(theReader)
  return {line, watch}
}

/** Start one reader's reading: a read now, then the timer, unless another world owns the spool. `said` is what the read now said. */
function theReading(reader: AReader): {line: string; watch: NodeJS.Timeout | null; said: string[]} {
  let last = ''
  /** One read. `theirs` is the refusal when another world owns the spool, which nothing has logged yet, and else null. */
  const tick = (): {theirs: string | null; says: string[]} => {
    let says: string[], read = 0
    try {
      const done = readTheGateCountSpool(reader.folder)
      if (done.anotherWorld !== undefined && done.refused !== null) return {theirs: done.refused, says: done.says}
      says = done.says
      read = done.counted + done.rejected
    } catch (error) {
      says = [`The gate-count spool at ${reader.folder} could not be read: ${error instanceof Error ? error.message : String(error)}`]
    }
    const now = says.join('\n')
    if (now !== last || read > 0) for (const line of says) reader.log(line)
    last = now
    return {theirs: null, says}
  }
  const first = tick()
  if (first.theirs !== null) return {line: first.theirs, watch: null, said: first.says}
  const watch = setInterval(named('the gate-count spool', reader.log, () => {
    const refused = tick().theirs
    if (refused === null) return
    clearInterval(watch)
    reader.watch = null
    reader.log(refused)
  }), reader.every)
  watch.unref()
  reader.watch = watch
  return {line: `This office reads the gate-count spool at ${reader.folder} at start and once a minute.`, watch, said: first.says}
}

/**
 * THE SPOOL ANOTHER WORLD OWNS, as the Gates panel shows it: its folder, the world that owns it and this office's world.
 * Null when this office does not read the spool, and when no other world owns it now.
 */
export function aSpoolAnotherWorldOwns(): {folder: string; itsWorld: string; thisWorld: string} | null {
  if (theReader === null) return null
  const owner = theSpoolsOwnerNow(theReader.folder, theWorldThisDatabaseIs())
  return 'anotherWorld' in owner ? {folder: theReader.folder, itsWorld: owner.anotherWorld, thisWorld: owner.thisWorld} : null
}

/** Where this office counts a day file from after the press, and which way, as the answer and the rejects line say it. */
export type WhereADayFileIsCountedFrom = {file: string; way: 'continues from this office\'s row' | 'starts at the press'; byte: number}

/** The one sentence the press's answer and its rejects line carry when a day file continues from a row read before. */
export const A_ROW_READ_BEFORE_THE_PRESS = 'These rows were read before the press, so if this office owned the spool before, the lines another office counted in between are counted here again.'

/**
 * WHAT THE PRESS DID. `refused` is a condition that failed, with nothing done. `failed` is a removal that failed after
 * the rejects line was written, and says so. `handedOver` is a removal that was done: what `.world` named, the world it
 * was given to, where each day file is counted from, the sentence about rows read before when a file continues from
 * one, whether this office reads the spool now, and what its read after the press said.
 */
export type AHandOver =
  | {refused: 'this-office-does-not-read-the-spool'}
  | {refused: 'no-other-world-owns-it'; now: string}
  | {refused: 'another-world-than-the-one-seen'; saw: string; now: string}
  | {failed: string}
  | {handedOver: {removed: string; itNamed: string; givenTo: string; countingFrom: WhereADayFileIsCountedFrom[]; readBefore: string | null; readsItNow: boolean; said: string[]}}

/**
 * GIVE THE SPOOL TO THIS OFFICE'S WORLD, the person's press. The door asks who pressed and checks the body; this checks
 * the three conditions on the spool, in order, and changes nothing when one fails. `saw` is the world the page showed as
 * the owner. `pressedBy` and `provedBy` are written in the rejects line as they are given.
 */
export function handTheGateCountSpoolToThisWorld(press: {saw: string; because: string; pressedBy: string; provedBy: Record<string, string | boolean | null>}): AHandOver {
  const reader = theReader
  if (reader === null) return {refused: 'this-office-does-not-read-the-spool'}
  const owner = theSpoolsOwnerNow(reader.folder, theWorldThisDatabaseIs())
  if ('not' in owner) return {refused: 'no-other-world-owns-it', now: owner.not}
  if (owner.anotherWorld !== press.saw) return {refused: 'another-world-than-the-one-seen', saw: press.saw, now: owner.anotherWorld}
  const storedBytes = sqlite.prepare('SELECT bytes FROM gate_count_spool_reads WHERE file = ?')
  const countingFrom = theSpoolsEntries(reader.folder).flatMap((entry): WhereADayFileIsCountedFrom[] => {
    if (!('day' in entry)) return []
    const row = storedBytes.get(entry.name) as {bytes: number} | undefined
    return [row === undefined ? {file: entry.name, way: 'starts at the press', byte: whereTheLastWholeLineEnds(join(reader.folder, entry.name))} : {file: entry.name, way: 'continues from this office\'s row', byte: row.bytes}]
  })
  const readBefore = countingFrom.some(one => one.way === 'continues from this office\'s row') ? A_ROW_READ_BEFORE_THE_PRESS : null
  const file = join(reader.folder, GATE_COUNT_SPOOL.world)
  // THE LINE GOES IN BEFORE THE REMOVAL, so the file never lacks the who and why of a removal that was done.
  theRejectsFileTakes(reader.folder, JSON.stringify({removing: GATE_COUNT_SPOOL.world, itNamed: owner.anotherWorld, givenTo: owner.thisWorld, pressedBy: press.pressedBy, provedBy: press.provedBy, because: press.because, countingFrom, readBefore, at: localStamp(new Date())}) + '\n')
  try {
    unlinkSync(file)
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    theRejectsFileTakes(reader.folder, JSON.stringify({notRemoved: GATE_COUNT_SPOOL.world, why, at: localStamp(new Date())}) + '\n')
    return {failed: `${file} was not removed: ${why}. The spool's ${GATE_COUNT_SPOOL.rejects} says so in a second line, under the line of the press.`}
  }
  const storeBytes = sqlite.prepare('INSERT INTO gate_count_spool_reads (file, bytes) VALUES (?, ?) ON CONFLICT(file) DO NOTHING')
  for (const one of countingFrom) if (one.way === 'starts at the press') storeBytes.run(one.file, one.byte)
  if (reader.watch !== null) clearInterval(reader.watch)
  reader.watch = null
  const again = theReading(reader)
  reader.log(again.line)
  return {handedOver: {removed: file, itNamed: owner.anotherWorld, givenTo: owner.thisWorld, countingFrom, readBefore, readsItNow: again.watch !== null, said: again.said}}
}

/** The byte after a day file's last whole line: its length, unless a line is still being written. */
function whereTheLastWholeLineEnds(file: string): number {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    return readFileSync(fd).lastIndexOf(0x0a) + 1
  } finally {
    closeSync(fd)
  }
}
