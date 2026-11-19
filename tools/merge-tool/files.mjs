// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES ADAPTER: pinning, integrating, testing and landing a folder of files that is not in git. It is the
 * office's own. The caller passes the office's functions. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import {
  closeSync,
  copyFileSync,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

import { ABSENT, LOG, WORKDIR, chosen } from './arguments.mjs'
import { fail, log, readState, stamp, writeState } from './log-and-state.mjs'
import { hashOfPath, sha256 } from './git.mjs'
import { failuresSaid, reportOf, runChecker } from './integrate.mjs'

/** What each function of this adapter needs from its caller, said in the sentence it refuses with. */
export const THE_FILES_ADAPTER_NEEDS = Object.freeze({
  pinFiles: "pinFiles needs step and theSeal from its caller, as the-merger.mjs passes office-keeper.mjs's, so that files.mjs reaches no office module itself.",
  integrateFiles: "integrateFiles needs step from its caller, as the-merger.mjs passes office-keeper.mjs's, so that files.mjs reaches no office module itself.",
  testFiles: "testFiles needs step from its caller, as the-merger.mjs passes office-keeper.mjs's, so that files.mjs reaches no office module itself.",
  landFiles: "landFiles needs readBackThroughTheOffice and step from its caller, as the-merger.mjs passes office-keeper.mjs's, so that files.mjs reaches no office module itself.",
})

/** What testFiles says in its tested step: a files changeset runs no test suite, and the files checker's checks are its checks. */
export const A_FILES_CHANGESET_RUNS_NO_TEST_SUITE = "A files changeset has no test suite. Its checks are the files checker's, reported under the integrated step; nothing else was run."

// ============================================================================ the files adapter

const HOLD = join(WORKDIR, 'hold')

/** Where an add or a modify lands under keep-both when the main world's file is not the one it expected. */
function keptBothName(path) {
  const ext = extname(path)
  const stem = basename(path, ext)
  return join(dirname(path), `${stem}.kept-from-${chosen.entry.slice(0, 8)}${ext}`)
}

/** The checker's manifest for this changeset, over blobs held at `<hold>/<path>`. */
function manifestFor(changeset, landAtOf, origins = {}) {
  return {
    why: `Merge entry ${chosen.entry}, written by tools/the-merger.mjs from the entry's changeset.`,
    // THE FOLDER IT WAS STAGED IN, so the checker knows a source there is the new file itself and not an
    // original (acceptance finding 45).
    stagedAt: changeset.stagedAt,
    operations: changeset.operations.map((one) => {
      const target = landAtOf(one)
      const entry = { op: one.op, target, before_hash: one.before, after_hash: one.after, source: one.source }
      if (one.op === 'rename') entry.from = one.from
      if (one.op === 'delete') delete entry.after_hash
      if (one.op !== 'delete' && existsSync(join(HOLD, one.path))) entry.blob = one.path
      if (one.record !== undefined) entry.record = one.record
      // WHERE THE FILE CAME FROM, AS ITS FILES SEAL RECORDED IT AT FINISH: read off the seal, never off
      // the entry, so the checker judges the original the run named when it finished and nothing typed
      // later.
      if (origins[one.path] !== undefined && (one.op === 'add' || one.op === 'modify')) entry.origin = origins[one.path]
      return entry
    }),
  }
}

/** {path: origin} for every file of the entry's files seal that names an original; empty for any other seal. */
async function theOriginsOf(entry, theSeal) {
  const seal = await theSeal(entry)
  if (seal.kind !== 'files' || !seal.files) return {}
  return Object.fromEntries(seal.files.files.filter((one) => one.origin !== undefined).map((one) => [one.path, one.origin]))
}

/** The content by path a files changeset carries, as the office holds it: each operation's path at its after-hash. */
function submittedContentOf(changeset) {
  return Object.fromEntries(changeset.operations.map((one) => [one.path, one.after]))
}

/**
 * PIN A FILES CHANGESET: copy each staged file into the hold, write the checker's manifest over the
 * hold, and run the files checker. The step reports the content REALLY held (a missing blob is
 * "absent", a blob with other bytes its own hash) with the checker's report, so a staging folder that
 * is not what was submitted bounces as a guard with the checker's words. Whether a target is free in
 * the main world is the integrate step's question, asked of the main world as it is then, so the
 * checker's no-overwrite results are left out here.
 */
export async function pinFiles(entry, { step, theSeal } = {}) {
  if (typeof step !== 'function' || typeof theSeal !== 'function') throw new Error(THE_FILES_ADAPTER_NEEDS.pinFiles)
  const { root, stagedAt, operations } = entry.changeset
  rmSync(HOLD, { recursive: true, force: true })
  mkdirSync(HOLD, { recursive: true })
  const held = {}
  for (const one of operations) {
    if (one.op === 'delete') {
      held[one.path] = ABSENT
      continue
    }
    const staged = join(stagedAt, one.path)
    if (!existsSync(staged)) {
      // A RENAME THAT CARRIES NO NEW BYTES moves what is at `from` in the main world, and holds nothing.
      held[one.path] = one.op === 'rename' && one.before === one.after ? one.after : ABSENT
      continue
    }
    mkdirSync(dirname(join(HOLD, one.path)), { recursive: true })
    copyFileSync(staged, join(HOLD, one.path))
    held[one.path] = hashOfPath(join(HOLD, one.path)) ?? ABSENT
  }
  const manifest = join(HOLD, 'manifest.json')
  writeFileSync(manifest, JSON.stringify(manifestFor(entry.changeset, (one) => one.path, await theOriginsOf(entry, theSeal)), null, 2))
  const checker = runChecker('files-changeset.mjs', ['--manifest', manifest, '--root', root])
  writeState({ adapter: 'files', pinned: { hold: HOLD, held, at: stamp() } })
  return step(
    'pinned',
    { files: held, checker: reportOf(checker, { drop: (one) => one.check === 'no-overwrite' }) },
    { hold: HOLD, manifest, checkerSaved: checker.saved, leftForIntegrate: 'no-overwrite' },
  )
}

/** Whether the entry carries the secretary's confirmation of its deletes, as the state machine wrote it. This only reads it. */
export function deletesAreConfirmed(entry) {
  const confirmed = entry.machine?.deletes?.confirmed
  return confirmed !== undefined && confirmed !== null && typeof confirmed === 'object'
}

/** The paths a files changeset deletes. */
export function deletesOf(entry) {
  return entry.changeset.operations.filter((one) => one.op === 'delete').map((one) => one.path)
}

/**
 * WHERE THE MAIN WORLD STANDS FOR A FILES ENTRY, in one word: sha256 over every path the plan touches
 * (each target, and each rename's `from`) and what is there now (its sha256, or "absent"). The files
 * adapter's `mainAt` and `mainAfter`, so landing is a compare-and-swap here too: the office refuses a
 * landing whose main world is not the one the entry was integrated on.
 */
function folderState(root, plan) {
  return `folder-sha256:${sha256(JSON.stringify(Object.entries(whatIsThere(root, plan))))}`
}

/** {path: sha256 | "absent"} for every path a landing plan touches: each target, and each rename's `from`. */
function whatIsThere(root, plan) {
  const paths = [...new Set(plan.flatMap((one) => [one.landAt, ...(one.from === null ? [] : [one.from])]))].sort()
  return Object.fromEntries(paths.map((path) => [path, hashOfPath(join(root, path)) ?? ABSENT]))
}

/** {path: sha256 | "absent"} for what each touched path holds once the plan has landed. */
function whatLands(plan) {
  const after = {}
  for (const one of plan) {
    if (one.from !== null) after[one.from] = ABSENT
    after[one.landAt] = one.op === 'delete' ? ABSENT : one.after
  }
  return after
}

/** The landing plan: where each operation lands, given the main world as it stands now. */
function planFiles(entry, checker) {
  const { root, onConflict, operations } = entry.changeset
  const conflicted = new Set(checker.failed.filter((one) => one.check === 'no-overwrite').map((one) => one.path))
  const plan = []
  const conflicts = []
  const keptBoth = []
  for (const one of operations) {
    let landAt = one.path
    if (conflicted.has(one.path) || (one.op === 'rename' && conflicted.has(one.from))) {
      if (onConflict === 'keep-both' && (one.op === 'add' || one.op === 'modify')) {
        landAt = keptBothName(one.path)
        if (hashOfPath(join(root, landAt)) !== null) conflicts.push({ path: one.path, keptBothAt: landAt, why: 'the keep-both name is taken as well' })
        else keptBoth.push({ path: one.path, landsAt: landAt })
      } else {
        conflicts.push({ path: one.path, why: `the main world does not hold ${one.before} at ${one.op === 'rename' ? one.from : one.path}${one.op === 'add' || one.op === 'rename' ? ', or the target is already there' : ''}` })
      }
    }
    plan.push({ op: one.op, path: one.path, from: one.from ?? null, landAt, before: one.before, after: one.after, ...(one.mode === undefined ? {} : { mode: one.mode }), blob: one.op !== 'delete' && existsSync(join(HOLD, one.path)) ? join(HOLD, one.path) : null })
  }
  return { plan, conflicts, keptBoth }
}

export async function integrateFiles(entry, { step } = {}) {
  if (typeof step !== 'function') throw new Error(THE_FILES_ADAPTER_NEEDS.integrateFiles)
  const { root } = entry.changeset
  if (!existsSync(join(HOLD, 'manifest.json'))) fail(`Nothing is held for entry ${chosen.entry} under ${HOLD}; it has to be pinned again.`)
  const checker = runChecker('files-changeset.mjs', ['--manifest', join(HOLD, 'manifest.json'), '--root', root])
  const other = checker.failed.filter((one) => one.check !== 'no-overwrite')
  if (other.length > 0) {
    return step(
      'guard-failed',
      { guard: 'files-changeset', files: [...new Set(other.map((one) => one.path))].sort(), detail: failuresSaid(other).slice(0, 4000), log: checker.saved },
      { decided: other },
    )
  }
  const { plan, conflicts, keptBoth } = planFiles(entry, checker)
  if (conflicts.length > 0) {
    return step(
      'conflict',
      {
        files: conflicts.map((one) => one.path).sort(),
        log: checker.saved,
        says: `The main world does not hold what the entry expected at ${conflicts.map((one) => `${one.path} (${one.why})`).join('; ')}, and nothing is overwritten (R3).`,
      },
      { conflicts, onConflict: entry.changeset.onConflict ?? 'bounce' },
    )
  }
  const mainAt = folderState(root, plan)
  // A MODE IS PART OF THE PLAN WHERE AN OPERATION NAMES ONE, and only there, so a plan without modes
  // hashes as it always did.
  const result = `landing-plan-sha256:${sha256(JSON.stringify(plan.map((one) => [one.op, one.path, one.from, one.landAt, one.before, one.after, ...(one.mode === undefined ? [] : [one.mode])])))}`
  // A FILE DECIDED BY ITS HASH OVER THE CONTENT LIMIT LANDS UNREAD, and the landing says so by name
  // kept here with the checker's own words, which name its original.
  const unread = (checker.verdict.decided ?? []).filter((one) => one.check === 'content-limit' && one.ok === true).map((one) => ({ path: one.path, said: one.detail }))
  writeState({ adapter: 'files', integrated: { root, plan, mainAt, before: whatIsThere(root, plan), result, unread, at: stamp() }, landing: null })
  // KEEP-BOTH ANSWERS THE NO-OVERWRITE FAILURE IT MET: the add or modify lands under another name, which
  // this tool found free, so that check is reported as decided on the name it lands at.
  const keptDecided = keptBoth.map((one) => ({ path: one.path, check: 'no-overwrite', ok: true, detail: `Kept both: the main world's file stays, and this one lands at ${one.landsAt}, which is free.` }))
  const answered = new Set(keptBoth.map((one) => one.path))
  return step(
    'integrated',
    {
      result,
      mainAt,
      files: submittedContentOf(entry.changeset),
      checker: reportOf(checker, { extra: keptDecided, drop: (one) => one.check === 'no-overwrite' && one.ok !== true && answered.has(one.path) }),
    },
    { plan: plan.map((one) => ({ op: one.op, path: one.path, landsAt: one.landAt, before: one.before, after: one.after, ...(one.mode === undefined ? {} : { mode: one.mode }) })), keptBoth, checkerSaved: checker.saved },
  )
}

export async function testFiles({ step } = {}) {
  if (typeof step !== 'function') throw new Error(THE_FILES_ADAPTER_NEEDS.testFiles)
  return step(
    'tested',
    { green: true, log: LOG, says: A_FILES_CHANGESET_RUNS_NO_TEST_SUITE },
    { ran: {} },
  )
}

/**
 * Write bytes to `target` only by creating it: an existing file is never overwritten. With a mode (100644
 * or 100755) the file is made with exactly that mode, set on the open file before a byte is written, so
 * it never exists with another one; fchmod is not narrowed by the umask as the mode of an open is.
 * Acceptance finding 41. Without one, it is made as it always was.
 */
function createExclusively(target, bytes, mode = undefined) {
  mkdirSync(dirname(target), { recursive: true })
  const fd = openSync(target, 'wx')
  try {
    if (mode !== undefined) fchmodSync(fd, mode === '100755' ? 0o755 : 0o644)
    // ONE WRITE MAY WRITE LESS THAN IT WAS GIVEN, so it is asked again until every byte is written.
    for (let written = 0; written < bytes.length; ) written += writeSync(fd, bytes, written, bytes.length - written)
  } finally {
    closeSync(fd)
  }
}

/** Replace `target` atomically, after checking that it still holds `before` right now. */
function replaceChecked(target, before, bytes, mode = undefined) {
  const now = hashOfPath(target)
  if (now !== before) fail(`${target} holds ${String(now)} now, not ${before}; it was not overwritten.`)
  const tmp = join(dirname(target), `.${basename(target)}.merge-queue-${chosen.entry.slice(0, 8)}.tmp`)
  createExclusively(tmp, bytes, mode)
  renameSync(tmp, target)
}

/**
 * THE BYTES ONE STEP OF THE PLAN LANDS, read from the hold and checked against the hash the entry was
 * pinned and judged on, in memory, before any of them is written — so what is written is exactly what
 * was hashed. The rule and a secretary's review: the check's copy protects the check, not the
 * landing, so the landing hashes what it writes itself. Until then it read the hold and trusted it, and
 * only the read-back after writing could see a changed file, by which time it had landed.
 */
function theBytesToLand(one) {
  if (one.blob === null) return null
  const bytes = readFileSync(one.blob)
  const found = sha256(bytes)
  if (found !== one.after) fail(`The held file for ${one.path} (${one.blob}) is sha256 ${found} now, not ${one.after}, which the entry was pinned and judged on; it was not written.`)
  return bytes
}

export async function landFiles(entry, { readBackThroughTheOffice, step } = {}) {
  if (typeof readBackThroughTheOffice !== 'function' || typeof step !== 'function') throw new Error(THE_FILES_ADAPTER_NEEDS.landFiles)
  const { root } = entry.changeset
  const state = readState()
  if (!state.integrated || !Array.isArray(state.integrated.plan)) fail(`No landing plan is recorded for entry ${chosen.entry} under ${WORKDIR}; it has to be integrated again.`)
  const { plan, mainAt, before, unread = [] } = state.integrated
  if (deletesOf(entry).length > 0 && !deletesAreConfirmed(entry)) fail(`The deletes of merge entry ${chosen.entry} are not confirmed by a secretary on the entry; nothing was written.`)

  // STATE FIRST, as for git: the landing step names the folder state the entry was integrated on.
  if (entry.state === 'testing') {
    writeState({ landing: { startedAt: stamp(), applied: [] } })
    entry = await step('landing', { mainAt }, { files: plan.length, plan: plan.map((one) => ({ op: one.op, path: one.path, landsAt: one.landAt })), workdir: WORKDIR })
    if (entry.state !== 'landing') {
      log(`the office did not put the entry into landing (it is ${entry.state}); nothing is written`)
      return entry
    }
  }
  // THE COMPARE-AND-SWAP, PATH BY PATH. Each path the plan touches must hold what it held when the entry
  // was integrated, or what the plan lands there (a landing cut off part way and started again). Any
  // other content means the folder moved under the entry: that is reported, and nothing is written.
  const there = whatIsThere(root, plan)
  const lands = whatLands(plan)
  const movedPaths = Object.keys(there).filter((path) => there[path] !== before?.[path] && there[path] !== lands[path])
  if (before === undefined || movedPaths.length > 0) {
    const now = folderState(root, plan)
    log(`the folder ${root} is not as it was when this entry was integrated: ${movedPaths.join(', ') || 'nothing was recorded of it'}`)
    return step('main-moved', { mainAt: now }, { expected: mainAt, found: now, moved: movedPaths.map((path) => ({ path, was: before?.[path] ?? null, is: there[path] })) })
  }
  // EVERY HELD FILE IS HASHED BEFORE ANYTHING IS WRITTEN, so a hold that changed after the pin stops the
  // landing with nothing written rather than half way through it. Each is hashed again as it is written.
  for (const one of plan) {
    if (one.blob === null) continue
    const found = hashOfPath(one.blob)
    if (found !== one.after) fail(`The held file for ${one.path} (${one.blob}) is ${found === null ? 'gone' : `sha256 ${found}`} now, not ${one.after}, which the entry was pinned and judged on. Nothing was written.`)
  }
  const applied = []
  for (const one of plan) {
    const target = join(root, one.landAt)
    const from = one.from === null ? null : join(root, one.from)
    const already = hashOfPath(target)
    if (one.op === 'add') {
      if (already === one.after) applied.push({ ...one, did: 'already there with the right content' })
      else {
        createExclusively(target, theBytesToLand(one), one.mode)
        applied.push({ ...one, did: 'created' })
      }
    } else if (one.op === 'modify') {
      if (already === one.after) applied.push({ ...one, did: 'already there with the right content' })
      else {
        replaceChecked(target, one.before, theBytesToLand(one), one.mode)
        applied.push({ ...one, did: 'replaced' })
      }
    } else if (one.op === 'delete') {
      if (already === null) applied.push({ ...one, did: 'already absent' })
      else if (already !== one.before) fail(`${target} holds ${already} now, not ${one.before}; it was not deleted.`)
      else {
        unlinkSync(target)
        applied.push({ ...one, did: 'deleted' })
      }
    } else if (one.op === 'rename') {
      const fromNow = hashOfPath(from)
      if (already === one.after && fromNow === null) applied.push({ ...one, did: 'already renamed' })
      else {
        if (fromNow !== one.before) fail(`${from} holds ${String(fromNow)} now, not ${one.before}; nothing was renamed.`)
        createExclusively(target, theBytesToLand(one) ?? readFileSync(from), one.mode)
        unlinkSync(from)
        applied.push({ ...one, did: 'renamed' })
      }
    }
    writeState({ landing: { ...readState().landing, applied } })
  }
  const readBack = []
  for (const one of applied) {
    if (one.op === 'delete') {
      readBack.push({ path: one.landAt, expected: ABSENT, found: hashOfPath(join(root, one.landAt)) === null ? ABSENT : 'present', through: 'the file system' })
      continue
    }
    const read = await readBackThroughTheOffice(join(root, one.landAt))
    // A NAMED MODE IS READ BACK TOO, from the file system: the office's read serves bytes, not modes.
    const mode = one.mode === undefined ? undefined : (lstatSync(join(root, one.landAt)).mode & 0o111) !== 0 ? '100755' : '100644'
    readBack.push({ path: one.landAt, expected: one.after, found: read.hash, through: read.through, officeSaid: read.officeSaid, ...(mode === undefined ? {} : { modeExpected: one.mode, modeFound: mode }) })
  }
  const wrong = readBack.filter((one) => one.expected !== one.found || one.modeExpected !== one.modeFound)
  if (wrong.length > 0) {
    fail(
      `After landing, ${wrong
        .map((one) => (one.expected !== one.found ? `${one.path} reads back as ${String(one.found)} (expected ${one.expected})` : `${one.path} reads back with mode ${String(one.modeFound)} (expected ${String(one.modeExpected)})`))
        .join('; ')}.`,
    )
  }
  const throughTheOffice = readBack.filter((one) => one.through === 'the office (GET /api/file)').length
  return step(
    'landed',
    {
      mainAfter: folderState(root, plan),
      says:
        `${String(applied.length)} ${applied.length === 1 ? 'file' : 'files'} landed in ${root} and read back with the expected sha256 ` +
        `(${String(throughTheOffice)} through the office, ${String(readBack.length - throughTheOffice)} from the file system). Nothing was backed up, migrated or restarted: a files changeset moves no server.` +
        (unread.length === 0
          ? ''
          : ` ${String(unread.length)} ${unread.length === 1 ? 'file' : 'files'} landed that nobody read, each decided by its hash: ${unread.map((one) => `${one.path} — ${one.said}`).join('; ')}`),
    },
    { root, applied: applied.map((one) => ({ op: one.op, path: one.path, landsAt: one.landAt, did: one.did })), readBack },
  )
}
