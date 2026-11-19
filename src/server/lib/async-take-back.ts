// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Async, read-only overdue hand-back listing. See asyncTakeBacksForProject for its boundary. */
import { performance } from 'node:perf_hooks'
import { guardedGitArguments } from '../../config/guarded-git.mjs'
import { inspectionTrunk } from '../../config/inspection-base.mjs'
import { whenAHandBackIsDue } from '../../shared/merge-class.ts'
import { sqlite } from '../db/client.ts'
import { getRecord, recordInWorkspace } from './records.ts'
import { named } from './named-timers.ts'
import { handBackOfProblem, readMergeEntry, theProblemsWhere, THE_HAND_BACKS_THE_TAKE_BACK_PASS_READS } from './merge-queue.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { thePushHandBackOf } from '@shared/push-hand-back.ts'
import { aPersonAlreadyLooked } from '@shared/take-back-looked.ts'
import { osProbe } from './os-probe.ts'
import { THE_OVERDUE_HAND_BACK_HELPER, type OsProbe } from './resources.ts'

type Due = { problem: string; entry: string; deadline: string; timeZone: string; hours: number }
type Said = { problem: string; says: string }
type Result = { kind: 'ok'; due: Due[]; forAPerson: Said[]; cannotBeRead: Said[] } | { kind: 'stale'; reason: 'changed' | 'unpinnable' | 'deadline' | 'cancelled' | 'unavailable' }
type Options = { deadline?: number; signal?: AbortSignal }
/** A read that cannot be trusted: its inputs changed, it ran out of time, it was cancelled, or Git could not be used. */
export class Stale extends Error { constructor(readonly reason: Extract<Result, {kind:'stale'}>['reason']) { super(reason) } }
/** Git ran and failed: its exit status, or null when it could not be started, and what it said. */
export class GitFailure extends Error { constructor(readonly status: number | null, message: string) { super(message) } }

/** The child the probe starts for one GitSession. */
type AHandBackHelper = ReturnType<NonNullable<OsProbe['startTheOverdueHandBackHelper']>>

/** How long a helper has after stop to end its group before the parent ends it. */
const HELPER_STOP_GRACE_MS = 1000

/**
 * A helper that has not ended its group within the grace is unresponsive, so the parent ends the
 * group. It does so only while Node has not reaped the helper. The helper's pid is the group's id,
 * and an unreaped pid cannot have been given to another process. Node sets exitCode or signalCode
 * in the same callback that reaps the child, so no reaping can come between the check and the signal.
 */
function endAnUnresponsiveHelper(child: AHandBackHelper) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  try { osProbe().killProcessGroup(child.pid, 'SIGKILL') } catch (error) {
    console.warn(`The overdue hand-back reader could not end the group of its unresponsive helper ${child.pid}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * A parent timer settles independently of Git and its pipes. The detached helper receives stop over
 * IPC and signals its own group while alive. If it has not exited within the grace, the parent
 * ends its group, but only while the helper is unreaped. Three cases are not cleaned. A helper that
 * dies before the parent closes it leaves its remaining descendants, because its group id may
 * already belong to another process. A descendant that starts its own session leaves the group,
 * and no signal here reaches it. An unresponsive helper is not ended if the parent exits within
 * the grace. Guarded Git is not supposed to start repository-selected programs. Parent settlement
 * does not wait for cleanup. Every public call has its own helper and deadline. The territory comparison in
 * claims.ts reads a run's changed paths with it too, one session for each worktree it reads.
 */
export class GitSession {
  private child: AHandBackHelper | null = null
  private dead = false
  private stopped = false

  read(root: string, args: string[], until: number, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Stale('cancelled')); return }
      if (osProbe().platform === 'win32' || this.dead || this.stopped) { reject(new Stale('unavailable')); return }
      const left = until - performance.now()
      if (left <= 0) { reject(new Stale('deadline')); return }
      if (this.child === null) {
        try {
          const probe = osProbe()
          const started = probe.startTheOverdueHandBackHelper?.(THE_OVERDUE_HAND_BACK_HELPER)
          if (started === undefined) { reject(new Stale('unavailable')); return }
          this.child = started
          this.child.on('error', () => { this.dead = true })
          this.child.on('exit', () => { this.dead = true })
        } catch { reject(new Stale('unavailable')); return }
      }
      const child = this.child
      if (!child.connected || child.exitCode !== null || child.signalCode !== null) { reject(new Stale('unavailable')); return }
      let done = false
      const finish = (error?: Error, value?: string) => {
        if (done) return
        done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
        child.removeListener('message', onMessage); child.removeListener('error', onLost); child.removeListener('exit', onLost)
        if (error instanceof Stale) this.close()
        if (error) reject(error); else resolve(value ?? '')
      }
      const timer = setTimeout(named('the overdue hand-back read deadline', (line) => console.warn(line), () => finish(new Stale('deadline'))), left)
      const abort = () => finish(new Stale('cancelled'))
      const onLost = () => finish(new Stale('unavailable'))
      const onMessage = (message: unknown) => {
        const result = message as { status: number | null; stdout?: string; stderr?: string; error?: string; unavailable?: boolean }
        if (result.unavailable) finish(new Stale('unavailable'))
        else if (result.error) finish(new GitFailure(result.status, result.error))
        else if (result.status === 0) finish(undefined, result.stdout ?? '')
        else finish(new GitFailure(result.status, (result.stderr ?? '').trim() || `git exited ${result.status}`))
      }
      signal?.addEventListener('abort', abort, { once: true })
      child.on('message', onMessage); child.on('error', onLost); child.on('exit', onLost)
      try {
        child.send({ args: guardedGitArguments(root, args, { before: ['--literal-pathspecs'] }) }, error => { if (error) onLost() })
      } catch { onLost() }
    })
  }

  close() {
    if (this.stopped) return
    this.stopped = true
    const child = this.child
    if (child === null) return
    if (child.connected) { try { child.send('stop', () => {}) } catch { /* already gone */ } }
    child.unref(); child.channel?.unref()
    setTimeout(named('the overdue hand-back helper stop grace', (line) => console.warn(line), () => endAnUnresponsiveHelper(child)), HELPER_STOP_GRACE_MS).unref()
  }
}
function git(root: string, args: string[], until: number, signal: AbortSignal | undefined, session: GitSession) {
  return session.read(root, args, until, signal)
}
const lines = (value: string) => value.trim().split('\n').filter(Boolean)
const person = (id: string, says: string): Said => ({ problem: id, says: `Problem ${id}: ${says} A person must look.` })

/** Captures the selected problems and all database inputs used by this listing in one short read transaction. */
function capture(workspaceId: string, only?: string) {
  return sqlite.transaction(() => {
    const problems = only === undefined
      ? theProblemsWhere(workspaceId, THE_HAND_BACKS_THE_TAKE_BACK_PASS_READS, ['state', 'extra'])
      : [recordInWorkspace(only, workspaceId)]
    return problems.map(problem => {
      const status = sqlite.prepare('SELECT deleted_at FROM records WHERE id = ?').get(problem.id) as { deleted_at: string | null } | undefined
      if (status === undefined || status.deleted_at !== null) throw new Stale('changed')
      const facts = handBackOfProblem(problem)
      const entry = facts === null ? null : getRecord(facts.entry)
      if (entry !== null) {
        const status = sqlite.prepare('SELECT deleted_at FROM records WHERE id = ?').get(entry.id) as { deleted_at: string | null } | undefined
        if (status === undefined || status.deleted_at !== null) throw new Stale('changed')
      }
      const agent = facts?.line.agent == null ? null : theOneAgentAStringNames(sqlite, facts.line.agent)
      const takeouts = sqlite.prepare("SELECT record_id, data FROM revisions WHERE workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'merge_entry' AND json_extract(data, '$.fixRound.problem') = ? AND json_extract(data, '$.fixRound.kind') = 'takeout' ORDER BY record_id").all(workspaceId, problem.id)
      const push = problem.kind === 'problem' ? thePushHandBackOf(problem) : null
      const due = push !== null && 'facts' in push && push.facts.deadline !== undefined && push.facts.timeZone !== undefined
        ? whenAHandBackIsDue({ deadline: push.facts.deadline, timeZone: push.facts.timeZone, ...(push.facts.dueAt === undefined ? {} : { dueAt: push.facts.dueAt }) })
        : facts === null ? null : whenAHandBackIsDue(facts)
      let entryReading: { value: unknown } | { error: string } | null = null
      if (entry?.kind === 'merge_entry' && entry.data['state'] === 'merged') {
        try { entryReading = { value: readMergeEntry(entry) } } catch (error) { entryReading = { error: error instanceof Error ? error.message : String(error) } }
      }
      return { problem, facts, entry, entryReading, agent, takeouts, push, due, overdue: due !== null && Date.now() > due }
    })
  }).deferred()
}
type Captured = ReturnType<typeof capture>[number]
type Pins = { root: string; beforeInput: string; afterInput: string; before: string; after: string; trunk: string | null; trunkSays: string; main: string | null; remote: string | null; localMain: string | null; localMaster: string | null; localRemote: string | null }
async function optionalGit(root: string, args: string[], until: number, signal: AbortSignal | undefined, session: GitSession): Promise<string | null> {
  try { return (await git(root, args, until, signal, session)).trim() } catch (e) { if (e instanceof GitFailure && e.status === 1) return null; throw e }
}
async function commit(root: string, ref: string, until: number, signal: AbortSignal | undefined, session: GitSession): Promise<string> {
  try {
    const value = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], until, signal, session)).trim()
    if (!/^[a-f0-9]{40,64}$/.test(value)) throw new Stale('unpinnable')
    return value
  } catch (e) { if (e instanceof Stale || (e instanceof GitFailure && e.status === null)) throw e; throw new Stale('unpinnable') }
}
async function pins(root: string, beforeInput: string, afterInput: string, until: number, signal: AbortSignal | undefined, session: GitSession): Promise<Pins> {
  const before = await commit(root, beforeInput, until, signal, session), after = await commit(root, afterInput, until, signal, session)
  const remote = await optionalGit(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], until, signal, session)
  const local = async (name: string) => optionalGit(root, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], until, signal, session)
  const localMain = await local('main'), localMaster = await local('master')
  const short = remote ? (remote.includes('/') ? remote.slice(remote.indexOf('/') + 1) : remote) : null
  const localRemote = short === null ? null : await local(short)
  const selected = inspectionTrunk({ remoteHead: () => remote, localExists: (ref: string) => ref === 'main' ? localMain !== null : ref === 'master' ? localMaster !== null : ref === short && localRemote !== null })
  const main = selected.branch === null ? null : await commit(root, selected.branch, until, signal, session)
  return { root, beforeInput, afterInput, before, after, trunk: selected.branch, trunkSays: selected.says, main, remote, localMain, localMaster, localRemote }
}
async function examine(item: Captured, result: Extract<Result,{kind:'ok'}>, until: number, signal: AbortSignal | undefined, session: GitSession): Promise<Pins | null> {
  const { problem, facts, entry, entryReading, agent, takeouts, push, due, overdue } = item, id = problem.id
  if (push !== null) {
    if (problem.data['state'] !== 'open' || aPersonAlreadyLooked(problem)) return null
    if ('cannotBeRead' in push) result.cannotBeRead.push({ problem: id, says: `Problem ${id}: ${push.cannotBeRead}` })
    else if (push.facts.deadline !== undefined && push.facts.timeZone !== undefined) {
      const { deadline, timeZone } = push.facts
      if (due === null) result.cannotBeRead.push({ problem: id, says: `Problem ${id}: the deadline ${deadline} in ${timeZone} cannot be read.` })
      else if (overdue) result.forAPerson.push({ problem: id, says: `Problem ${id}: the hand-back of emergency push ${push.facts.push} was due by ${deadline} (${timeZone}) and is still open, so it is overdue. The office never takes an emergency push back by itself. A person must look.` })
    }
    return null
  }
  if (problem.kind !== 'problem' || problem.data['state'] !== 'open' || facts === null || takeouts.length || aPersonAlreadyLooked(problem)) return null
  if (due === null) { result.cannotBeRead.push({ problem: id, says: `Problem ${id}: the deadline ${facts.deadline} in ${facts.timeZone} cannot be read.` }); return null }
  if (!overdue) return null
  if (entry === null || entry.workspaceId !== problem.workspaceId || entry.kind !== 'merge_entry' || entry.data['state'] !== 'merged') { result.forAPerson.push(person(id, 'the handed-back entry is missing or is not a merged merge entry.')); return null }
  const integrated = entry.data['integrated'] as { mainBefore?: unknown; mainAfter?: unknown } | undefined
  const change = entry.data['changeset'] as { adapter?: unknown; root?: unknown } | undefined
  if (change?.adapter !== 'git' || change.root !== facts.repository || typeof integrated?.mainBefore !== 'string' || typeof integrated.mainAfter !== 'string') { result.forAPerson.push(person(id, 'the entry has no matching git repository or stored integrated.mainBefore and integrated.mainAfter.')); return null }
  if (facts.line.agent === null || agent === null) { result.forAPerson.push(person(id, 'the line names no registered agent.')); return null }
  let p: Pins | null = null
  try {
    const root = facts.repository
    p = await pins(root, integrated.mainBefore, integrated.mainAfter, until, signal, session)
    if (p.main === null) throw new GitFailure(null, p.trunkSays)
    const commits = lines(await git(root, ['rev-list', '--reverse', `${p.before}..${p.after}`], until, signal, session))
    if (JSON.stringify(commits) !== JSON.stringify(facts.commits)) { result.forAPerson.push(person(id, `the landed commits differ: stored ${facts.commits.join(', ')}; git read ${commits.join(', ')}.`)); return p }
    const merges = lines(await git(root, ['rev-list', '--merges', `${p.before}..${p.after}`], until, signal, session))
    if (merges.length) { result.forAPerson.push(person(id, `the landed range contains merge commits: ${merges.join(', ')}.`)); return p }
    const paths = async (a: string, b: string, only?: string[]) => (await git(root, ['diff-tree', '-r', '--no-renames', '--name-only', '-z', a, b, ...(only === undefined ? [] : ['--', ...only])], until, signal, session)).split('\0').filter(Boolean)
    const changed = await paths(p.before, p.after)
    let ancestor = true
    try { await git(root, ['merge-base', '--is-ancestor', p.after, p.main], until, signal, session) } catch (e) { if (e instanceof GitFailure && e.status === 1) ancestor = false; else throw e }
    if (!ancestor) { result.forAPerson.push(person(id, `main does not descend from the landing; its paths may have changed: ${changed.join(', ')}.`)); return p }
    const touched = changed.length ? await paths(p.after, p.main, changed) : []
    if (touched.length) result.forAPerson.push(person(id, `main has touched paths since the landing: ${touched.join(', ')}.`))
    else if (entryReading !== null && 'error' in entryReading) result.cannotBeRead.push({ problem: id, says: `Problem ${id}: the git evidence cannot be read: ${entryReading.error}.` })
    else result.due.push({ problem: id, entry: facts.entry, deadline: facts.deadline, timeZone: facts.timeZone, hours: facts.hours })
  } catch (e) {
    if (e instanceof Stale) throw e
    result.cannotBeRead.push({ problem: id, says: `Problem ${id}: the git evidence cannot be read: ${e instanceof Error ? e.message : String(e)}.` })
  }
  return p
}

/**
 * Lists the same due/person/unreadable shapes as takeBacksForProject. `deadline` is an absolute
 * Date.now() millisecond time; signal cancels. At most three attempts and two seconds wall time
 * (including asynchronous waits); stale is for the caller to translate to 503/Retry-After.
 * On Windows a reading requiring Git returns stale/unavailable: the required Unix process group is absent.
 * SQLite capture is synchronous and cannot be interrupted by the timer. Captures include selected
 * problem data/order, entries, resolved agents, takeout creation revisions and the deadline's due
 * state, and merge-entry reading, then compares them after Git. Git inputs and trunk selection are pinned and compared again.
 * A graph, ref or record that changes and is restored between comparisons can escape detection;
 * this is not a graph snapshot. Pinning peels commit-ish inputs first: unpinnable inputs now fail
 * closed instead of becoming unreadable evidence, and symbolic/revision expressions are evaluated
 * once per pin, not independently by each graph command. Invalid or option-like commit-ish inputs
 * fail closed; a deleted explicitly named problem or linked entry also fails closed instead of
 * reading a deleted row as the synchronous reader can. Diff arguments/pathspec semantics remain; the child caps stdout and stderr together
 * at 64 MiB, whereas the synchronous helper caps each separately.
 */
export async function asyncTakeBacksForProject(workspaceId: string, only?: string, options: Options = {}): Promise<Result> {
  const until = performance.now() + Math.max(0, Math.min(2000, (options.deadline ?? Infinity) - Date.now()))
  let reason: Extract<Result,{kind:'stale'}>['reason'] = 'changed'
  const session = new GitSession()
  try {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal?.aborted) return { kind: 'stale', reason: 'cancelled' }
    if (performance.now() >= until) return { kind: 'stale', reason: 'deadline' }
    try {
      let before: ReturnType<typeof capture>
      try { before = capture(workspaceId, only) } catch (e) { if (attempt === 0) throw e; throw new Stale('changed') }
      const result: Extract<Result,{kind:'ok'}> = { kind: 'ok', due: [], forAPerson: [], cannotBeRead: [] }, captured: Pins[] = []
      for (const item of before) { const p = await examine(item, result, until, options.signal, session); if (p) captured.push(p) }
      for (const p of captured) {
        let again: Pins
        try { again = await pins(p.root, p.beforeInput, p.afterInput, until, options.signal, session) }
        catch (e) { if (e instanceof Stale && (e.reason === 'deadline' || e.reason === 'cancelled' || e.reason === 'unavailable')) throw e; throw new Stale('changed') }
        if (JSON.stringify(p) !== JSON.stringify(again)) throw new Stale('changed')
      }
      let after: ReturnType<typeof capture>
      try { after = capture(workspaceId, only) } catch { throw new Stale('changed') }
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Stale('changed')
      if (options.signal?.aborted) throw new Stale('cancelled')
      if (performance.now() >= until) throw new Stale('deadline')
      return result
    } catch (e) {
      if (!(e instanceof Stale)) throw e
      reason = e.reason
      if (reason === 'deadline' || reason === 'cancelled' || reason === 'unavailable') return { kind: 'stale', reason }
    }
  }
  return { kind: 'stale', reason }
  } finally { session.close() }
}
