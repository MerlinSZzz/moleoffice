// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTES FOR VIEWS ALREADY REMOVED COME FROM THE BATCH LINE (tools/inspector-view-sweep.mjs, notes). Views removed
 * by hand before the sweep existed each left a <check>.REMOVED.txt in check-views/ and one line in a deletion log. The
 * note writer reads those two, and only those, and writes checks/<check folder>/view-removed.json for each check the
 * line names, whose REMOVED.txt has the batch's layout and names the given place. Dry, it only prints.
 *
 * Every instance folder, REMOVED.txt and deletion log here is made up under this file's own temporary folder. No real
 * store, log, view or checks folder is read.
 */
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VIEW_REMOVED_NOTE } from '../tools/inspector-view-sweep.mjs'

const TOOL = fileURLToPath(new URL('../tools/inspector-view-sweep.mjs', import.meta.url))
const AT = '2026-10-30 10:00:00'
const STORE = 'synthetic-store snapshot-0001 2026-10-30T10:00'
const PLACE = `${STORE}, folder <check>`
const FIRST = 'chkAAAAAAAA1'
const SECOND = 'chkBBBBBBBB2'

let root = ''
let instanceDir = ''
let log = ''
const unreadable: string[] = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'the-view-removed-notes-'))
  instanceDir = join(root, 'sandboxes', 'inspector-synthetic')
  mkdirSync(join(instanceDir, 'check-views'), { recursive: true })
  mkdirSync(join(instanceDir, 'checks'), { recursive: true })
  log = join(root, 'a-synthetic-deletion-log.txt')
})
afterEach(() => {
  for (const path of unreadable) chmodSync(path, 0o755)
  unreadable.length = 0
  rmSync(root, { recursive: true, force: true })
})

/** A REMOVED.txt in the batch's layout, for `check`, naming `place`. */
const theBatchNote = (check: string, bytes: number, place = `${STORE}, folder ${check}`): string =>
  `Removed 30 Oct 2026 at 10:00 by A Person (a synthetic authority; another synthetic authority): the home, tmp and work copy of ended check ${check}, ${String(bytes)} bytes. ` +
  `On the lab NAS as ${place}. Logged in A Person's synthetic deletion log.\n`

/** The batch's line in the deletion log, naming `checks`, with `count` as the count it says. */
const theBatchLine = (checks: string[], { at = AT, count = checks.length, from = instanceDir } = {}): string =>
  `${at} removed /synthetic/store/views (${String(checks.length * 1000)} bytes: the views of ${String(count)} ended inspector checks, ` +
  `renamed there from ${from}/check-views/<check>: ${checks.join(' ')}); whole snapshot ${STORE}, kept by a synthetic schedule\n`

/** A removed check: its REMOVED.txt, and its checks folder with model-session.json and a record. */
function aRemovedCheck(check: string, bytes: number, note = theBatchNote(check, bytes)): string {
  writeFileSync(join(instanceDir, 'check-views', `${check}.REMOVED.txt`), note)
  const folder = join(instanceDir, 'checks', `a-check-of-run_${check.slice(3)}-${check}`)
  mkdirSync(join(folder, 'records'), { recursive: true })
  writeFileSync(join(folder, 'model-session.json'), JSON.stringify({ run: `run_${check.slice(3)}`, check, runtime: 'claude-code', model: 'none', session: 'synthetic-session' }))
  writeFileSync(join(folder, 'records', 'a-record.json'), '{"synthetic":true}')
  return folder
}

async function notesWith(env: Record<string, string>, ...more: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return await new Promise((done) => {
    execFile(process.execPath, [TOOL, 'notes', instanceDir, '--log', log, '--at', AT, '--place', PLACE, ...more],
      { cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MOLE_'))), ...env } },
      (error, stdout, stderr) => { done({ status: error === null ? 0 : typeof error.code === 'number' ? error.code : null, stdout, stderr }) })
  })
}

const notes = (...more: string[]) => notesWith({}, ...more)

/** Every entry under `path`, with its kind, size, mode and times, and each file's text. */
function theTree(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (at: string): void => {
    const info = lstatSync(at)
    out[at] = `${info.isDirectory() ? 'd' : 'f'} ${String(info.size)} ${info.mode.toString(8)} ${String(info.mtimeMs)} ${String(info.ctimeMs)}` +
      (info.isFile() ? ` ${readFileSync(at, 'utf8')}` : '')
    if (info.isDirectory()) for (const name of readdirSync(at)) walk(join(at, name))
  }
  walk(path)
  return out
}

const theNoteOf = (folder: string): unknown => JSON.parse(readFileSync(join(folder, VIEW_REMOVED_NOTE), 'utf8'))
const theNoteFor = (check: string, bytes: number): unknown => ({
  check, moved: `nothing; the whole view is on the network store at ${STORE}, folder ${check}`, bytes, removedAt: AT,
  resume: 'This check can no longer resume: its view is not on this machine.',
  from: { note: join(instanceDir, 'check-views', `${check}.REMOVED.txt`), log },
})

describe('the notes for views already removed come from the batch line', () => {
  it('dry, prints each note it would write and where, and writes nothing', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    const second = aRemovedCheck(SECOND, 5678)
    writeFileSync(log, `2026-10-29 09:00:00 removed something else (1 bytes)\n${theBatchLine([FIRST, SECOND])}`)
    const before = theTree(root)
    const ran = await notes()
    expect(ran.status, ran.stderr).toBe(0)
    expect(theTree(root)).toEqual(before)
    for (const [check, folder, bytes] of [[FIRST, first, 1234], [SECOND, second, 5678]] as const) {
      expect(ran.stdout).toContain(`check ${check}: would write ${join(folder, VIEW_REMOVED_NOTE)}:\n${JSON.stringify(theNoteFor(check, bytes), null, 2)}\n`)
    }
    expect(ran.stdout).toContain('Dry: 2 notes would be written and nothing was. Add --write to write them.')
  })

  it('with --write, writes the note for each check the line names, in the batch layout, at the given place', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    const second = aRemovedCheck(SECOND, 5678)
    writeFileSync(log, theBatchLine([FIRST, SECOND]))
    const ran = await notes('--write')
    expect(ran.status, ran.stderr).toBe(0)
    expect(theNoteOf(first)).toEqual(theNoteFor(FIRST, 1234))
    expect(theNoteOf(second)).toEqual(theNoteFor(SECOND, 5678))
    expect(lstatSync(join(first, VIEW_REMOVED_NOTE)).mode & 0o777).toBe(0o600)
    expect(ran.stdout).toContain(`check ${FIRST}: wrote ${join(first, VIEW_REMOVED_NOTE)}.`)
  })

  it('reads a leading ~/ in the batch line as the home folder, and says what it read it as', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    writeFileSync(log, theBatchLine([FIRST], { from: '~/sandboxes/inspector-synthetic' }))
    const wrote = await notesWith({ HOME: root }, '--write')
    expect(wrote.status, wrote.stderr).toBe(0)
    expect(theNoteOf(first)).toEqual(theNoteFor(FIRST, 1234))

    rmSync(join(first, VIEW_REMOVED_NOTE))
    writeFileSync(log, theBatchLine([FIRST], { from: '~/sandboxes/inspector-another' }))
    const refused = await notesWith({ HOME: root }, '--write')
    expect(refused.status).toBe(1)
    expect(refused.stdout).toBe('')
    expect(existsSync(join(first, VIEW_REMOVED_NOTE))).toBe(false)
    expect(refused.stderr).toBe(`the line of ${log} at ${AT} names the instance folder ~/sandboxes/inspector-another, read as ${join(root, 'sandboxes', 'inspector-another')}, not ${instanceDir}. Nothing is written.\n`)
  })

  it('leaves a REMOVED.txt in another layout alone, and says so', async () => {
    const first = aRemovedCheck(FIRST, 1234, 'Removed by hand, some time ago.\n')
    const second = aRemovedCheck(SECOND, 5678, theBatchNote(SECOND, 5678).trimEnd())
    writeFileSync(log, theBatchLine([FIRST, SECOND]))
    const ran = await notes('--write')
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`check ${FIRST}: removed earlier, in another layout; left alone.`)
    expect(ran.stdout).toContain(`check ${SECOND}: removed earlier, in another layout; left alone.`)
    expect(existsSync(join(first, VIEW_REMOVED_NOTE)) || existsSync(join(second, VIEW_REMOVED_NOTE))).toBe(false)
  })

  it('writes no note for a check the batch line does not name', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    const second = aRemovedCheck(SECOND, 5678)
    writeFileSync(log, theBatchLine([FIRST]))
    const ran = await notes('--write')
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`check ${SECOND}: the batch line does not name it.`)
    expect(existsSync(join(second, VIEW_REMOVED_NOTE))).toBe(false)
    expect(theNoteOf(first)).toEqual(theNoteFor(FIRST, 1234))
  })

  it('writes no note for a REMOVED.txt that names another place', async () => {
    const elsewhere = `another-store snapshot-0002 2026-10-31T11:00, folder ${FIRST}`
    const first = aRemovedCheck(FIRST, 1234, theBatchNote(FIRST, 1234, elsewhere))
    writeFileSync(log, theBatchLine([FIRST]))
    const ran = await notes('--write')
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`check ${FIRST}: its REMOVED.txt names another place: ${elsewhere}.`)
    expect(existsSync(join(first, VIEW_REMOVED_NOTE))).toBe(false)
  })

  it('writes nothing for a check with no checks folder, or two', async () => {
    rmSync(aRemovedCheck(FIRST, 1234), { recursive: true })
    aRemovedCheck(SECOND, 5678)
    mkdirSync(join(instanceDir, 'checks', `a-check-of-run_another-${SECOND}`))
    writeFileSync(log, theBatchLine([FIRST, SECOND]))
    const before = theTree(join(instanceDir, 'checks'))
    const ran = await notes('--write')
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`check ${FIRST}: no checks folder a-check-of-<run>-${FIRST}.`)
    expect(ran.stdout).toContain(`check ${SECOND}: 2 checks folders end in -${SECOND}.`)
    expect(theTree(join(instanceDir, 'checks'))).toEqual(before)
  })

  it('never writes over a view-removed.json already there', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    writeFileSync(join(first, VIEW_REMOVED_NOTE), '{"written":"earlier, by somebody else"}\n')
    writeFileSync(log, theBatchLine([FIRST]))
    const before = theTree(first)
    for (const more of [[], ['--write']]) {
      const ran = await notes(...more)
      expect(ran.status, ran.stderr).toBe(0)
      expect(ran.stdout).toContain(`check ${FIRST}: ${VIEW_REMOVED_NOTE} is there already; left as it is.`)
      expect(theTree(first)).toEqual(before)
    }
  })

  it('writes nothing at all when the batch line is missing, doubled, miscounted or about another instance folder', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    for (const [text, why] of [
      ['2026-10-29 09:00:00 removed something else (1 bytes)\n', `0 lines of ${log} begin "${AT} removed "; exactly one must. Nothing is written.`],
      [theBatchLine([FIRST]) + theBatchLine([FIRST]), `2 lines of ${log} begin "${AT} removed "; exactly one must. Nothing is written.`],
      [theBatchLine([FIRST], { count: 2 }), `the line of ${log} at ${AT} says 2 checks and lists 1. Nothing is written.`],
      [theBatchLine([FIRST], { from: join(root, 'sandboxes', 'inspector-another') }),
        `the line of ${log} at ${AT} names the instance folder ${join(root, 'sandboxes', 'inspector-another')}, not ${instanceDir}. Nothing is written.`],
    ] as const) {
      writeFileSync(log, text)
      const ran = await notes('--write')
      expect(ran.status).toBe(1)
      expect(ran.stderr).toBe(`${why}\n`)
      expect(ran.stdout).toBe('')
      expect(existsSync(join(first, VIEW_REMOVED_NOTE))).toBe(false)
    }
  })

  it('reads no view: an unreadable view folder beside the REMOVED.txt changes nothing it says', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    writeFileSync(log, theBatchLine([FIRST]))
    const dry = await notes()
    const view = join(instanceDir, 'check-views', FIRST)
    mkdirSync(view)
    chmodSync(view, 0o000)
    unreadable.push(view)
    const again = await notes()
    expect(again).toEqual(dry)
    const written = await notes('--write')
    expect(written.status, written.stderr).toBe(0)
    expect(theNoteOf(first)).toEqual(theNoteFor(FIRST, 1234))
  })

  it('leaves model-session.json and everything else in the checks folder as it was', async () => {
    const first = aRemovedCheck(FIRST, 1234)
    writeFileSync(log, theBatchLine([FIRST]))
    const before = theTree(first)
    const logBefore = theTree(log)
    const ran = await notes('--write')
    expect(ran.status, ran.stderr).toBe(0)
    const after = theTree(first)
    expect(Object.keys(after).filter((path) => !(path in before))).toEqual([join(first, VIEW_REMOVED_NOTE)])
    delete after[join(first, VIEW_REMOVED_NOTE)]
    delete after[first]
    delete before[first]
    expect(after).toEqual(before)
    expect(theTree(log)).toEqual(logBefore)
  })
})
