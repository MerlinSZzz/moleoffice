// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL'S LOG AND ITS STATE: the stamps, the log file, the state file written before anything irreversible,
 * and the tool's own failure. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

import { localStamp, parseAnyStamp } from '../../src/shared/time.ts'
import { LOG, STATE_FILE, chosen } from './arguments.mjs'

// ============================================================================ the log and the state

/**
 * THE TOOL'S OWN STAMPS ARE LOCAL WALL-CLOCK TIME, as every stamp the office writes: chapter 4 rule 8 names one writer,
 * in src/shared/time.ts. Until 24 September 2026 this was `new Date().toISOString()`, UTC, so the tool's log, its state,
 * its steps and its record of what a suite read said a time an hour off the office's records beside them (acceptance
 * finding 61: the rule reaches a tool's own files).
 */
export function stamp() {
  return localStamp(new Date())
}

/** One line for a person, to stdout and to the log file. */
export function log(line) {
  const text = `${stamp()} ${line}`
  process.stdout.write(`${text}\n`)
  appendFileSync(LOG, `${text}\n`)
}

/** What this tool remembers between runs about this entry: written before anything irreversible. */
export function readState() {
  return readStateAt(STATE_FILE)
}

/**
 * THE STATE FILE OF ANY ENTRY, read the way this entry's own is. The sweep of sandboxes that ended entries left up
 * (office-keeper.mjs) reads the other entries' state files with it.
 */
export function readStateAt(file) {
  if (!existsSync(file)) return {}
  return stampsMadeLocal(JSON.parse(readFileSync(file, 'utf8')), file)
}

export function writeState(patch) {
  return writeStateAt(STATE_FILE, patch, chosen.entry)
}

/** Write cleanup of an entry whose hold was checked, preserving all its other state. */
export function writeStateAt(file, patch, entry) {
  const next = { ...readStateAt(file), ...patch, entry, writtenAt: stamp() }
  const tmp = `${file}.tmp-${String(process.pid)}`
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, file)
  return next
}

/** A failure of this tool: not a bounce, not a verdict. It ends the run with exit 1 after the office is told. */
export class MergerFailure extends Error {}

/**
 * A clone the tool would run git on names a program, or a place, that the tool did not write there
 * (what-a-clone-names.mjs). While the entry integrates, it bounces with the sentence; later, the run stops with it.
 */
export class ACloneNamesAProgram extends MergerFailure {
  /** @param {string} says @param {string} file @param {string} key */
  constructor(says, file, key) {
    super(says)
    this.file = file
    this.key = key
  }
}

export const fail = (sentence) => {
  throw new MergerFailure(sentence)
}

/** The keys under which this tool writes a stamp into its state, and the one form it writes them in. */
const STAMP_KEYS = new Set(['at', 'writtenAt', 'upAt', 'downAt', 'clearedAt', 'startedAt'])
const A_LOCAL_STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u

/**
 * A STATE WRITTEN BEFORE THE TOOL'S STAMPS WERE LOCAL holds them in UTC, with a trailing Z (acceptance finding 61), and
 * writeState keeps every field it is not given, so such a stamp would sit on beside the local ones. Each is read as the
 * moment it states, through src/shared/time.ts, and written back local; one that is no moment at all stops the tool in
 * words, rather than being carried as though it were one (read correctly or refused in
 * words, never read an hour off).
 */
function stampsMadeLocal(value, file, path = 'state') {
  if (Array.isArray(value)) return value.map((one, at) => stampsMadeLocal(one, file, `${path}[${String(at)}]`))
  if (value === null || typeof value !== 'object') return value
  const out = {}
  for (const [key, one] of Object.entries(value)) {
    if (STAMP_KEYS.has(key) && typeof one === 'string' && !A_LOCAL_STAMP.test(one)) {
      const when = parseAnyStamp(one)
      if (when === null) fail(`${file} holds ${path}.${key} = "${one}", which is not a moment this tool can read, so it was not read as one. Nothing was done; correct or remove that field, and run the tool again.`)
      out[key] = localStamp(when)
    } else out[key] = stampsMadeLocal(one, file, `${path}.${key}`)
  }
  return out
}
