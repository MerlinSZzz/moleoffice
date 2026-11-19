// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The office's read-only evidence for overdue hand-backs, and its transactional writes. */
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { sayInEnglish } from '../../shared/i18n.ts'
import { inspectionTrunk } from '../../config/inspection-base.mjs'
import { nowStamp } from '../../shared/time.ts'
import { NEEDS_NO_CHECK, NEEDS_NO_CHECK_RULES } from '../../shared/releasing.ts'
import { takeBackTitle, whenAHandBackIsDue, type HandBackFacts } from '../../shared/merge-class.ts'
import type { PanelRecord } from '../../shared/types.ts'
import type { ParticipantRef } from '../../shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { createRecord, getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { handBackOfProblem, readMergeEntry, submitAMergeEntry, theDirectory, theProblemsWhere, THE_HAND_BACKS_THE_TAKE_BACK_PASS_READS, whoIsToldOfAnEntrysEnd, type MergeEntryReading } from './merge-queue.ts'
import { readGit } from './resources.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { whoHoldsTheSecretaryCard, writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import { asTheDoorOf } from './check-field-doors.ts'
import { tellThatAPushHandBackIsOverdue } from './emergency-push.ts'
import { thePushHandBackOf } from '@shared/push-hand-back.ts'
import { captureGit, readRunSeal, sealingTheArea } from './sealed-tip.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { aPersonAlreadyLooked } from '@shared/take-back-looked.ts'

const git = (root: string, args: string[]) => readGit(root, args, { timeoutMs: 10_000 }).toString('utf8')
const lines = (text: string) => text.trim().split('\n').filter(Boolean)
const paths = (root: string, before: string, after: string, only?: string[]) => git(root, ['diff-tree', '-r', '--no-renames', '--name-only', '-z', before, after, ...(only === undefined ? [] : ['--', ...only])]).split('\0').filter(Boolean)
function ancestor(root: string, before: string, after: string): boolean {
  try { git(root, ['merge-base', '--is-ancestor', before, after]); return true }
  catch (error) { if ((error as { status?: number }).status === 1) return false; throw error }
}
export function takeBackAlreadyExists(workspaceId: string, problem: string): string | null {
  const row = sqlite.prepare("SELECT record_id FROM revisions WHERE workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'merge_entry' AND json_extract(data, '$.fixRound.problem') = ? AND json_extract(data, '$.fixRound.kind') = 'takeout' LIMIT 1").get(workspaceId, problem) as { record_id: string } | undefined
  return row?.record_id ?? null
}
export { aPersonAlreadyLooked }

/** The same trunk choice the seal reads; an absent or ambiguous trunk never passes. */
export function takeBackMain(root: string): string {
  const trunk = inspectionTrunk({
    remoteHead: () => { try { return git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).trim() } catch (error) { if ((error as { status?: number }).status === 1) return null; throw error } },
    localExists: (ref: string) => { try { git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return true } catch (error) { if ((error as { status?: number }).status === 1) return false; throw error } },
  })
  if (trunk.branch === null) throw new Error(trunk.says)
  return git(root, ['rev-parse', '--verify', `${trunk.branch}^{commit}`]).trim()
}
interface Due { problem: string; entry: string; deadline: string; timeZone: string; hours: number }
interface Said { problem: string; says: string }
type Reading = { kind: 'due'; facts: HandBackFacts; entry: MergeEntryReading; before: string; after: string; main: string; paths: string[] } | { kind: 'person' | 'unreadable' | 'leave'; says: string }

/**
 * AN EMERGENCY PUSH'S HAND-BACK IS NEVER TAKEN BACK: undoing an emergency fix could bring the emergency back. Open past
 * its deadline, it needs a person, once.
 */
function readAPushHandBack(problem: PanelRecord, held: NonNullable<ReturnType<typeof thePushHandBackOf>>): Reading {
  if (problem.data['state'] !== 'open') return { kind: 'leave', says: `Problem ${problem.id} is ${String(problem.data['state'])}; only an open hand-back can be overdue.` }
  if (aPersonAlreadyLooked(problem)) return { kind: 'leave', says: `A person-must-look note already exists on problem ${problem.id}.` }
  if ('cannotBeRead' in held) return { kind: 'unreadable', says: `Problem ${problem.id}: ${held.cannotBeRead}` }
  const { push, deadline, timeZone, dueAt } = held.facts
  if (deadline === undefined || timeZone === undefined) return { kind: 'leave', says: `Problem ${problem.id} was filed before an emergency push's hand-back had a deadline, so it has none to pass.` }
  const due = whenAHandBackIsDue({ deadline, timeZone, ...(dueAt === undefined ? {} : { dueAt }) })
  if (due === null) return { kind: 'unreadable', says: `Problem ${problem.id}: the deadline ${deadline} in ${timeZone} cannot be read.` }
  if (Date.now() <= due) return { kind: 'leave', says: `Problem ${problem.id}: the deadline ${deadline} (${timeZone}) has not passed.` }
  return { kind: 'person', says: `Problem ${problem.id}: the hand-back of emergency push ${push} was due by ${deadline} (${timeZone}) and is still open, so it is overdue. The office never takes an emergency push back by itself. A person must look.` }
}

/** No mutation: even a person-needed reading is filed only through the message worker's door. */
export function readTakeBack(problem: PanelRecord): Reading {
  const pushed = problem.kind === 'problem' ? thePushHandBackOf(problem) : null
  if (pushed !== null) return readAPushHandBack(problem, pushed)
  const facts = handBackOfProblem(problem)
  if (problem.kind !== 'problem' || problem.data['state'] !== 'open' || facts === null) return { kind: 'leave', says: `Problem ${problem.id} is ${String(problem.data['state'])}; an open hand-back with complete facts is required.` }
  if (takeBackAlreadyExists(problem.workspaceId, problem.id) !== null) return { kind: 'leave', says: `A take-back already exists for problem ${problem.id}.` }
  if (aPersonAlreadyLooked(problem)) return { kind: 'leave', says: `A person-must-look note already exists on problem ${problem.id}.` }
  const deadline = whenAHandBackIsDue(facts)
  if (deadline === null) return { kind: 'unreadable', says: `Problem ${problem.id}: the deadline ${facts.deadline} in ${facts.timeZone} cannot be read.` }
  if (Date.now() <= deadline) return { kind: 'leave', says: `Problem ${problem.id}: the deadline ${facts.deadline} (${facts.timeZone}) has not passed.` }
  const person = (says: string): Reading => ({ kind: 'person', says: `Problem ${problem.id}: ${says} A person must look.` })
  const record = getRecord(facts.entry)
  if (record === null || record.workspaceId !== problem.workspaceId || record.kind !== 'merge_entry' || record.data['state'] !== 'merged') return person('the handed-back entry is missing or is not a merged merge entry.')
  const integrated = record.data['integrated'] as { mainBefore?: unknown; mainAfter?: unknown } | undefined
  const change = record.data['changeset'] as { adapter?: unknown; root?: unknown } | undefined
  if (change?.adapter !== 'git' || change.root !== facts.repository || typeof integrated?.mainBefore !== 'string' || typeof integrated.mainAfter !== 'string') return person('the entry has no matching git repository or stored integrated.mainBefore and integrated.mainAfter.')
  if (facts.line.agent === null || theOneAgentAStringNames(sqlite, facts.line.agent) === null) return person('the line names no registered agent.')
  try {
    const root = facts.repository, before = integrated.mainBefore, after = integrated.mainAfter
    const commits = lines(git(root, ['rev-list', '--reverse', `${before}..${after}`]))
    if (JSON.stringify(commits) !== JSON.stringify(facts.commits)) return person(`the landed commits differ: stored ${facts.commits.join(', ')}; git read ${commits.join(', ')}.`)
    const merges = lines(git(root, ['rev-list', '--merges', `${before}..${after}`]))
    if (merges.length > 0) return person(`the landed range contains merge commits: ${merges.join(', ')}.`)
    const changed = paths(root, before, after), main = takeBackMain(root)
    if (!ancestor(root, after, main)) return person(`main does not descend from the landing; its paths may have changed: ${changed.join(', ')}.`)
    const touched = changed.length === 0 ? [] : paths(root, after, main, changed)
    if (touched.length > 0) return person(`main has touched paths since the landing: ${touched.join(', ')}.`)
    return { kind: 'due', facts, entry: readMergeEntry(record), before, after, main, paths: changed }
  } catch (error) {
    return { kind: 'unreadable', says: `Problem ${problem.id}: the git evidence cannot be read: ${error instanceof Error ? error.message : String(error)}.` }
  }
}
export function takeBacksForProject(workspaceId: string, only?: string): { due: Due[]; forAPerson: Said[]; cannotBeRead: Said[] } {
  const result: { due: Due[]; forAPerson: Said[]; cannotBeRead: Said[] } = { due: [], forAPerson: [], cannotBeRead: [] }
  for (const problem of only === undefined ? theProblemsWhere(workspaceId, THE_HAND_BACKS_THE_TAKE_BACK_PASS_READS, ['state', 'extra']) : [recordInWorkspace(only, workspaceId)]) {
    const read = readTakeBack(problem)
    if (read.kind === 'due') result.due.push({ problem: problem.id, entry: read.facts.entry, deadline: read.facts.deadline, timeZone: read.facts.timeZone, hours: read.facts.hours })
    else if (read.kind === 'person') result.forAPerson.push({ problem: problem.id, says: read.says })
    else if (read.kind === 'unreadable') result.cannotBeRead.push({ problem: problem.id, says: read.says })
  }
  return result
}
export function noteTakeBackNeedsAPerson(workspaceId: string, id: string) {
  return sqlite.transaction(() => {
    const problem = recordInWorkspace(id, workspaceId), read = readTakeBack(problem)
    if (read.kind !== 'person') return { problem: id, says: read.kind === 'due' ? `Problem ${id} is due; no person-must-look note was written.` : `${read.says} Nothing was written.` }
    const extra = problem.data['extra'] as Record<string, unknown>
    patchRecord(id, { dataPatch: { extra: { ...extra, takeBack: { aPersonMustLook: { at: nowStamp(), says: read.says } } } } }, THE_OFFICE)
    const pushed = thePushHandBackOf(problem)
    if (pushed !== null && 'facts' in pushed) return { problem: id, says: `${read.says}${tellThatAPushHandBackIsOverdue(workspaceId, pushed.facts, read.says)}` }
    const secretary = whoHoldsTheSecretaryCard()
    if (secretary !== null) writeAMessage({ workspaceId, to: [{ kind: 'agent', id: secretary.id }], title: `Take-back needs a person: ${id}`, body: read.says, aboutRun: handBackOfProblem(problem)!.line.run, actor: THE_OFFICE, onlyThem: true, notice: 'takeBackNeedsAPerson' })
    return { problem: id, says: `${read.says}${secretary === null ? ' Nobody holds the secretary card, so no secretary was told.' : ''}` }
  }).immediate()
}

interface TreeEntry { mode: string; type: string; object: string }
function treeEntry(root: string, commit: string, path: string): TreeEntry | null {
  const read = git(root, ['ls-tree', '-z', '--full-tree', commit, '--', path]).split('\0').filter(Boolean)
  if (read.length === 0) return null
  if (read.length !== 1 || read[0]!.slice(read[0]!.indexOf('\t') + 1) !== path) throw new Error(`The tree entry of ${path} cannot be read exactly.`)
  const [mode, type, object] = read[0]!.split('\t')[0]!.split(' ')
  if (!mode || !type || !object) throw new Error(`The mode, type and object of ${path} cannot be read.`)
  return { mode, type, object }
}
function difference(a: TreeEntry | null, b: TreeEntry | null): string | null {
  if (a === null || b === null) return a === b ? null : 'presence'
  if (a.mode !== b.mode) return 'mode'
  return a.type !== b.type || a.object !== b.object ? 'content' : null
}
function refuse(says: string): never { throw new PanelError(`${says} Nothing was written.`, 409) }

const fullCommit = z.string().regex(/^[a-f0-9]{40}$/)
const absoluteLog = z.string().min(1).refine(isAbsolute)
const fixedEvidence = z.object({ mainAt: fullCommit, files: z.array(z.object({ file: z.string().min(1), log: absoluteLog }).strict()) }).strict()
const stillRedEvidence = z.object({ mainAt: fullCommit, files: z.array(z.object({ file: z.string().min(1), result: z.enum(['red', 'passed', 'absent', 'no result']), log: absoluteLog.nullable() }).strict()) }).strict()
type DueReading = Extract<Reading, { kind: 'due' }>

/** Both writes accept exactly the handed-back files, on a real commit between the landing and current main. */
function checkMainEvidence(read: DueReading, evidence: { mainAt: string; files: { file: string }[] }) {
  const files = evidence.files.map(one => one.file)
  if (JSON.stringify([...files].sort()) !== JSON.stringify([...read.facts.files].sort())) refuse(sayInEnglish('takeBackMain.files'))
  try {
    const root = read.facts.repository
    if (git(root, ['rev-parse', '--verify', `${evidence.mainAt}^{commit}`]).trim() !== evidence.mainAt) refuse(sayInEnglish('takeBackMain.commit'))
    if (!ancestor(root, read.after, evidence.mainAt)) refuse(sayInEnglish('takeBackMain.beforeLanding'))
    if (!ancestor(root, evidence.mainAt, takeBackMain(root))) refuse(sayInEnglish('takeBackMain.offMain'))
  } catch (error) { if (error instanceof PanelError) throw error; refuse(sayInEnglish('takeBackMain.commit')) }
}

/** A green named run closes the due hand-back with its evidence and notice in one transaction. */
export function fixedOnMain(input: { workspaceId: string; problem: string; body: unknown; actor: Actor }) {
  const { workspaceId, problem: id, actor } = input
  recordInWorkspace(id, workspaceId)
  if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) throw new PanelError(sayInEnglish('takeBackMain.workerOnly'), 403)
  const parsed = fixedEvidence.safeParse(input.body)
  if (!parsed.success) refuse(sayInEnglish('takeBackMain.badGreenEvidence'))
  return sqlite.transaction(() => {
    const problem = recordInWorkspace(id, workspaceId), read = readTakeBack(problem)
    if (read.kind !== 'due') refuse(read.says)
    checkMainEvidence(read, parsed.data)
    const line = sayInEnglish('takeBackMain.fixed', { problem: id, mainAt: parsed.data.mainAt })
    const extra = problem.data['extra'] as Record<string, unknown>
    patchRecord(id, { dataPatch: { state: 'fixed', fix: line, extra: { ...extra, takeBack: { ...(extra['takeBack'] as object | undefined), fixedOnMain: { at: nowStamp(), ...parsed.data } } } } }, THE_OFFICE)
    const secretary = whoHoldsTheSecretaryCard(), agent = read.facts.line.agent === null ? null : theOneAgentAStringNames(sqlite, read.facts.line.agent)
    const to: ParticipantRef[] = []
    if (secretary !== null) to.push({ kind: 'agent', id: secretary.id })
    if (agent !== null && !to.some(one => one.kind === 'agent' && one.id === agent.id)) to.push({ kind: 'agent', id: agent.id })
    if (to.length > 0) writeAMessage({ workspaceId, to, title: line, body: line, aboutRun: read.facts.line.run, actor: THE_OFFICE, onlyThem: true, notice: 'handedBack' })
    return { problem: id, says: `${line} ${sayInEnglish(secretary === null ? 'takeBackMain.noSecretary' : 'takeBackMain.toldSecretary')} ${sayInEnglish(agent === null ? 'takeBackMain.noLine' : 'takeBackMain.toldLine')}` }
  }).immediate()
}

/** The commit is made elsewhere. Only this read-only exact tree proof authorizes the office's run. */
export function submitATakeBack(input: { workspaceId: string; problem: string; workingDirectory: string; branch: string; actor: Actor; stillRed?: unknown }) {
  const { workspaceId, problem: id, branch, actor } = input
  const problem = recordInWorkspace(id, workspaceId)
  if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id) throw new PanelError("Only the office's message worker asks for a take-back. Nothing was written.", 403)
  const read = readTakeBack(problem)
  if (read.kind !== 'due') refuse(read.says)
  const parsed = stillRedEvidence.safeParse(input.stillRed)
  if (!parsed.success) refuse(sayInEnglish('takeBackMain.badRedEvidence'))
  if (!parsed.data.files.some(one => one.result === 'red')) refuse(sayInEnglish('takeBackMain.noRed'))
  const folder = theDirectory(input.workingDirectory, 'The take-back working folder', 400)
  let head: string, parent: string
  try {
    head = git(folder, ['rev-parse', '--verify', 'HEAD^{commit}']).trim()
    const tip = git(folder, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]).trim()
    if (head !== tip) refuse(`HEAD ${head} is not the tip ${tip} of branch ${branch}.`)
    const parents = lines(git(folder, ['rev-list', '--parents', '-n', '1', head]))[0]!.split(' ').slice(1)
    if (parents.length !== 1) refuse('The take-back HEAD must have exactly one parent.')
    parent = parents[0]!
    if (!ancestor(folder, read.after, parent)) refuse('The take-back parent does not descend from the landed mainAfter.')
    if (!ancestor(folder, parent, read.main)) refuse('The take-back parent is not current main or an ancestor of it.')
    const touched = read.paths.filter(path => difference(treeEntry(folder, parent, path), treeEntry(folder, read.after, path)) !== null)
    if (touched.length > 0) refuse(`Main has touched paths since the landing: ${touched.join(', ')}. A person must look.`)
    const changed = paths(folder, parent, head), extra = changed.filter(path => !read.paths.includes(path)), missing = read.paths.filter(path => !changed.includes(path))
    if (extra.length || missing.length) refuse(`The take-back paths differ; extra paths: ${extra.join(', ') || 'none'}; missing paths: ${missing.join(', ') || 'none'}.`)
    for (const path of read.paths) {
      const differs = difference(treeEntry(folder, head, path), treeEntry(folder, read.before, path))
      if (differs !== null) refuse(`The take-back ${differs} differs at ${path}.`)
    }
  } catch (error) { if (error instanceof PanelError) throw error; refuse(`The take-back git tree cannot be read: ${String(error)}.`) }
  const captured = captureGit(folder, null, read.paths)
  if (captured.commit !== head || captured.forkBase !== parent) refuse('The seal reader found a different HEAD or parent base.')
  const repository = listRepositories(workspaceId).find(row => row.root === read.facts.repository)
  if (repository === undefined) refuse('The handed-back repository is not registered.')
  return sqlite.transaction(() => {
    // Re-read the office's own records and clock while holding the write transaction. Nothing survives a refusal.
    const again = readTakeBack(recordInWorkspace(id, workspaceId))
    if (again.kind !== 'due') refuse(again.says)
    if (JSON.stringify(again.facts) !== JSON.stringify(read.facts)) refuse('The hand-back facts changed during the tree check.')
    checkMainEvidence(again, parsed.data)
    const agent = theOneAgentAStringNames(sqlite, read.facts.line.agent!)
    if (agent === null) refuse('The line no longer names a registered agent; a person must look.')
    const run = asTheDoorOf(NEEDS_NO_CHECK, () => sealingTheArea(read.paths, () => createRecord({ kind: 'session', title: takeBackTitle(read.entry.title, read.facts.hours), workspaceId, actor: THE_OFFICE,
      data: { state: 'finished', servingAgent: agent.handle, servingAgentId: agent.id, workingDirectory: folder, cutFrom: captured.forkBase,
        doing: `The office filed this run to take back merge entry ${read.facts.entry}, which was handed back and not fixed in ${read.facts.hours} hours. Reverted commits: ${read.facts.commits.join(', ')}. Nobody ran it.`,
        extra: { purpose: 'take-back', problem: id }, [NEEDS_NO_CHECK]: { rule: NEEDS_NO_CHECK_RULES[0], at: nowStamp(), because: 'The exact inverse tree restores previously checked content and writes no new code.' } } })))
    const seal = readRunSeal(run.id)
    if (seal === null || seal.seal.git?.commit !== head) refuse('The office could not seal the checked take-back commit.')
    const filed = submitAMergeEntry({ workspaceId, actor: THE_WORKER, submission: { run: run.id, changeset: { adapter: 'git', repository: repository.id, branch }, fixRound: { problem: id, kind: 'takeout', reason: 'not fixed in time' } } })
    const current = recordInWorkspace(id, workspaceId), extra = current.data['extra'] as Record<string, unknown>
    patchRecord(id, { dataPatch: { extra: { ...extra, takeBack: { ...(extra['takeBack'] as object | undefined), stillRed: { at: nowStamp(), ...parsed.data } } } } }, THE_OFFICE)
    return { ...filed, run: run.id, commit: head }
  }).immediate()
}

/** End notices reuse the original hand-back selection, never the message worker who submitted the take-back. */
export function whoIsToldOfATakeBack(entry: MergeEntryReading): { to: ParticipantRef[]; says: string } {
  const take = entry.takeBackOf
  if (take === undefined) return whoIsToldOfAnEntrysEnd(entry)
  const original = recordInWorkspace(take.entry, entry.workspaceId), selected = whoIsToldOfAnEntrysEnd(readMergeEntry(original))
  const to = [...selected.to], secretary = whoHoldsTheSecretaryCard()
  if (secretary !== null && !to.some(one => one.kind === 'agent' && one.id === secretary.id)) to.push({ kind: 'agent', id: secretary.id })
  return { to, says: `The original line and secretary are told about hand-back ${take.problem}.` }
}
