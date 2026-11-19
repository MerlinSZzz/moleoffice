// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DOCUMENTS THAT NO TEST READS: the record of what the suite reads, where it is kept, whether an entry is only
 * documents, and carrying an entry past documentation landings. Part of the merge tool, tools/the-merger.mjs. It
 * takes what it needs of the office from its caller, as land.mjs and testing.mjs pass office-keeper.mjs's functions
 * and arguments.mjs's THE_SUITE_WORKERS_READS.
 */

import './a-library-is-not-a-program.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { PROTECTED_AREAS_FILE, readProtectedAreas } from '../checks/protected-areas.mjs'
import { A_DOCUMENT, DOCUMENTS_LANE, askTheMergeList, theSuiteReads } from '../../src/shared/merge-queue.ts'
import { isTheQueuesOwnCode } from './the-queues-own-code.mjs'
import { chosen } from './arguments.mjs'
import { fail, log, stamp, writeState } from './log-and-state.mjs'
import { changedBetween, contentAt, git, gitBytes, tryGit } from './git.mjs'

/** What the three documents functions say when their caller leaves out an office function they need. */
export const THE_DOCUMENTS_NEED_THE_OFFICE_FUNCTIONS = "aMoveOfOnlyDocuments needs theLane, untilNoOtherLandingOf needs theLane, sleep and ask, and carryPastDocuments needs theLane and step, from their caller, as land.mjs and testing.mjs pass office-keeper.mjs's, so that documents.mjs reaches no office module itself."

/** What theSuiteWorkers says when its caller leaves out one of the suite-workers reads it needs. */
export const THE_SUITE_WORKERS_NEED_THE_SETTING_READS = "theSuiteWorkers needs given, fallback and bounds from its caller, as testing.mjs passes arguments.mjs's THE_SUITE_WORKERS_READS, so that documents.mjs reads no setting itself."

// ============================================================================ documents that no test reads

/** The record of what the suite reads on the tree main is at now: its tree, where it is kept, and it, or null. */
export function theRecordOfMain(root) {
  const tree = git(root, ['rev-parse', 'HEAD^{tree}'])
  const file = theReadsFile(tree)
  if (!existsSync(file)) return { tree, file, record: null }
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(record.files) || !Array.isArray(record.folders)) return { tree, file, record: null }
    return { tree, file, record: { ...record, listed: Array.isArray(record.listed) ? record.listed : [] } }
  } catch {
    return { tree, file, record: null }
  }
}

/** Whether a record says the suite reads a path's content: `theSuiteReads` in src/shared/merge-queue.ts, the one rule. */
function readByTheRecord(path, record) {
  return theSuiteReads(path, record)
}

/**
 * Whether a record says the suite lists the folder where a path's name appears or goes: the path's nearest folder that
 * exists on main. A listing sees names, so this counts for a path added, deleted or renamed, never for a changed file.
 */
function listedByTheRecord(path, root, record) {
  // A TREE OF NAMES LISTED WHOLE (a git diff limited to added, deleted or renamed paths) sees every name under it.
  if ((record.listedWhole ?? []).some((folder) => folder === '.' || path === folder || path.startsWith(`${folder}/`))) return true
  let folder = dirname(path)
  while (folder !== '.' && !existsSync(join(root, folder))) folder = dirname(folder)
  return record.listed.includes(folder)
}

/** Each path a commit range touches, with git's status letter: M changed, A added, D deleted, R renamed (and its old path). */
function statusesBetween(repo, from, to) {
  const fields = gitBytes(repo, ['diff', '--name-status', '-z', '--no-renames', from, to]).toString('utf8').split('\0').filter((one) => one !== '')
  const out = []
  for (let index = 0; index + 1 < fields.length; index += 2) out.push({ status: fields[index].slice(0, 1), path: fields[index + 1] })
  return out
}

/**
 * WHAT A GIT ENTRY IS OF DOCUMENTS: { documents: { tree, files } } when every path it changes is a document that no test
 * reads by the record on main's tree, and none is the queue's own code or a file the project regenerates; otherwise
 * { none: why }.
 */
export function theDocumentsOf(entry) {
  if (entry.changeset.adapter !== 'git') return { none: 'a files entry has no suite to spare' }
  const { root, commit, base } = entry.changeset
  const main = theRecordOfMain(root)
  if (main.record === null) return { none: `main's tree ${main.tree.slice(0, 12)} has no record of what the suite reads` }
  const touched = statusesBetween(root, base, commit)
  const paths = touched.map((one) => one.path)
  if (paths.length === 0) return { none: 'it changes no file' }
  const generated = generatedPathsOf(root, 'HEAD')
  const notDocuments = paths.filter((path) => !A_DOCUMENT.test(path) || isTheQueuesOwnCode(path) || generated.includes(path))
  if (notDocuments.length > 0) return { none: `${notDocuments.slice(0, 5).join(', ')}${notDocuments.length > 5 ? ' and more' : ''} ${notDocuments.length === 1 ? 'is' : 'are'} not a document` }
  // A CHANGED FILE IS READ BY ITS CONTENT; A FILE ADDED OR DELETED IS ALSO SEEN BY A LISTING OF ITS FOLDER.
  const read = touched
    .filter((one) => readByTheRecord(one.path, main.record) || (one.status !== 'M' && listedByTheRecord(one.path, root, main.record)))
    .map((one) => (one.status === 'M' ? one.path : `${one.path} (${one.status === 'A' ? 'added' : 'deleted'}, and its folder is listed)`))
  if (read.length > 0) return { none: `the suite reads ${read.join(', ')}, by main's record on tree ${main.tree.slice(0, 12)}` }
  return { documents: { tree: main.tree, files: paths } }
}

/**
 * THE DOCUMENTATION ENTRIES WHOSE LANDINGS JOIN `from` TO `to`, one after another, by their receipts; or null when main
 * moved some other way. The office checks the same chain when it is named.
 */
export async function aMoveOfOnlyDocuments(root, from, to, { theLane } = {}) {
  if (typeof theLane !== 'function') throw new Error(THE_DOCUMENTS_NEED_THE_OFFICE_FUNCTIONS)
  if (from === to) return []
  const merged = (await theLane(`${root} ${DOCUMENTS_LANE}`, ['merged'])).filter((one) => one.state === 'merged' && one.machine?.integrated)
  const ids = []
  let at = from
  while (at !== to) {
    const next = merged.find((one) => one.machine.integrated.mainBefore === at && !ids.includes(one.id))
    if (next === undefined) return null
    ids.push(next.id)
    at = next.machine.integrated.mainAfter
  }
  return ids
}

/** How long a landing waits for another landing of its repository to end before it asks anyway. */
const THE_LONGEST_WAIT_FOR_ANOTHER_LANDING_MS = 10 * 60 * 1000

/**
 * Wait while another entry of this repository is landing, in either of its lanes, or an emergency push is moving its
 * main (wave 13u round 82): one move of main at a time. The office refuses the landing while either holds main.
 */
export async function untilNoOtherLandingOf(root, { theLane, sleep, ask } = {}) {
  if (typeof theLane !== 'function' || typeof sleep !== 'function' || typeof ask !== 'function') throw new Error(THE_DOCUMENTS_NEED_THE_OFFICE_FUNCTIONS)
  const deadline = Date.now() + THE_LONGEST_WAIT_FOR_ANOTHER_LANDING_MS
  for (;;) {
    const landing = [...(await theLane(root, ['landing'])), ...(await theLane(`${root} ${DOCUMENTS_LANE}`, ['landing']))].find((one) => one.id !== chosen.entry && one.state === 'landing')
    const pushing = landing === undefined ? await thePushMovingMainIn(root, ask) : undefined
    if ((landing === undefined && pushing === undefined) || Date.now() >= deadline) return
    if (landing !== undefined) log(`merge entry ${landing.id} is landing in ${root}; main moves one landing at a time, so this entry waits`)
    else log(`emergency push ${pushing.id} is moving main in ${root}; main moves one writer at a time, so this entry waits`)
    await sleep(5000)
  }
}

/** The emergency push moving main in this checkout now, as the office's queue reply lists it, or undefined. */
async function thePushMovingMainIn(root, ask) {
  // ONLY THE PUSHES ARE READ, and they are the lane's whatever states are asked, so it asks for the fewest entries.
  const reply = await askTheMergeList({ lane: root, states: ['landing'] }, 'narrow', (path) => ask('GET', path), log)
  if (reply.status !== 200 || !Array.isArray(reply.body?.emergencyPushes)) {
    fail(`The office did not list the emergency pushes of ${root} (${reply.status}): ${reply.body?.error ?? 'no list in its answer'}`)
  }
  return reply.body.emergencyPushes.find((one) => one.state === 'pushing' && one.root === root)
}

/**
 * PUT THE ENTRY ON A MAIN MOVED ONLY BY DOCUMENTATION LANDINGS, with nothing to test again: its
 * commits go onto the new main in its clone, and the office is told with `moved-past-documents`, which it takes only
 * when the chain of documentation landings and the entry's files check out. Null when main moved some other way, or the
 * commits do not go onto the new main without a conflict: then it is an ordinary move of main, handled as before.
 */
export async function carryPastDocuments(integrated, head, root, { theLane, step } = {}) {
  if (typeof theLane !== 'function' || typeof step !== 'function') throw new Error(THE_DOCUMENTS_NEED_THE_OFFICE_FUNCTIONS)
  const documents = await aMoveOfOnlyDocuments(root, integrated.M, head, { theLane })
  if (documents === null || documents.length === 0) return null
  const clone = integrated.clone
  git(clone, ['fetch', '--quiet', '--no-tags', root, head])
  if (!tryGit(clone, ['rebase', '--quiet', '--onto', head, integrated.M, integrated.Cfinal]).ok) {
    tryGit(clone, ['rebase', '--abort'])
    log(`the entry's commits do not go onto ${head} without a conflict; main's move is handled as an ordinary one`)
    return null
  }
  const Cfinal = git(clone, ['rev-parse', '--verify', 'HEAD^{commit}'])
  // THE RECORD OF WHAT THE SUITE READ GOES WITH THE ENTRY to the tree it now lands as (the inspector's note on the
  // documents release, acceptance finding 58): the documentation landings in between changed nothing the suite reads,
  // so what it read on the tested tree is what it reads on this one. Without it, main's tree after this landing would
  // have no record, and no document would land alone until the next code landing recorded one.
  theRecordCarriedForward(git(clone, ['rev-parse', `${integrated.Cfinal}^{tree}`]), git(clone, ['rev-parse', `${Cfinal}^{tree}`]))
  const entry = await step(
    'moved-past-documents',
    { mainAt: head, result: Cfinal, documents, files: contentAt(clone, Cfinal, changedBetween(clone, head, Cfinal)) },
    { from: integrated.M, to: head, before: integrated.Cfinal, after: Cfinal },
  )
  writeState({ integrated: { ...integrated, M: head, Cfinal } })
  return { entry, M: head, Cfinal }
}

/**
 * HOW MANY TEST WORKERS ONE SUITE RUN GETS: MOLE_OFFICE_MERGE_WORKERS, 8 unless said (the measurement of 23 and 24
 * September 2026). A value that is not a whole number within the bounds its caller gives is said, in
 * the log and on the entry's record, and the setting's own default is used, so a mistyped setting neither stalls the
 * queue nor runs an unbounded suite. `said` is null when the setting was used as written.
 *
 * AN ENTRY THAT NAMES ITS OWN COUNT RUNS AT IT (the suite-workers rule, part A): the person or the secretary
 * named it when they submitted, and the office checked it against MERGE_WORKERS_BOUNDS then. It is said in the log and
 * on the entry's record every time, so a trial of a count can be read off the entries it ran on.
 */
export function theSuiteWorkers(entry, { given, fallback, bounds } = {}) {
  if (typeof given !== 'function' || typeof fallback !== 'function' || bounds === null || typeof bounds !== 'object' || typeof bounds.fewest !== 'number' || typeof bounds.most !== 'number') throw new Error(THE_SUITE_WORKERS_NEED_THE_SETTING_READS)
  const own = entry?.suiteWorkers
  if (own !== undefined) {
    const said = `Merge entry ${String(entry.id)} names its own ${String(own.count)} suite workers, set by the ${String(own.by?.kind)} ${String(own.by?.id)} when it was submitted (the suite-workers rule), so the suite ran at ${String(own.count)} workers.`
    log(said)
    return { count: own.count, said }
  }
  const defaultValue = Number(fallback())
  const written = String(given() ?? '').trim()
  const count = /^[0-9]+$/u.test(written) ? Number(written) : Number.NaN
  if (Number.isInteger(count) && count >= bounds.fewest && count <= bounds.most) return { count, said: null }
  const said = `MOLE_OFFICE_MERGE_WORKERS is "${written}", which is not a whole number from ${String(bounds.fewest)} to ${String(bounds.most)}, so the suite ran at ${String(defaultValue)} workers.`
  log(said)
  return { count: defaultValue, said }
}

/**
 * Copy a record of what the suite reads from one tree to another that differs from it only by documents no test reads:
 * main's, across a documentation landing, and an entry's, when it is carried past documentation landings.
 */
export function theRecordCarriedForward(before, after) {
  const from = theReadsFile(before)
  if (before === after || !existsSync(from)) return
  const kept = JSON.parse(readFileSync(from, 'utf8'))
  writeFileSync(theReadsFile(after), JSON.stringify({ ...kept, tree: after, carriedFrom: before, carriedBy: chosen.entry, at: stamp() }, null, 1))
  log(`the record of what the suite reads is carried forward from tree ${before} to ${after}`)
}

/** The files the project regenerates (its declaration's `generated`), which a pair leaves out of "changed by both". */
export function generatedPathsOf(repo, commit) {
  const shown = tryGit(repo, ['show', `${commit}:${PROTECTED_AREAS_FILE}`])
  if (!shown.ok) return []
  try {
    return readProtectedAreas(shown.stdout, `${commit.slice(0, 12)}:${PROTECTED_AREAS_FILE}`).generated.flatMap((one) => one.paths)
  } catch {
    return []
  }
}

/**
 * WHERE WHAT A SUITE READ IS KEPT, by the tree it ran on, beside main's kept results (item 5): when the entry lands, main
 * is that tree, and the record is main's.
 */
export function theReadsFile(tree) {
  return join(dirname(chosen.workdir), 'reads', `${tree}.json`)
}
