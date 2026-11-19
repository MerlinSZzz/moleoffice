// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The scheduled suite reads bounded main landings and proves a hand-back before the shared filer writes anything. */
import { realpathSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { EMERGENCY_PUSH_KIND } from '../../shared/emergency-push.ts'
import { sayInEnglish, type WordKey } from '../../shared/i18n.ts'
import { parseWholeSuiteReceipt, type WholeSuiteReceipt } from '../../shared/whole-suite-receipt.ts'
import { clockStamp } from '../../shared/time.ts'
import { sqlite } from '../db/client.ts'
import { readGit } from './resources.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readMergeEntry, theMergeEntry, theAgentAndStarterOfAnEntry } from './merge-queue.ts'
import { fileAHandBackProblem, openHandBackForEntry, theRoundOpenForAnEntry } from './merge-state-machine.ts'

const hash = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
const range = z.object({ repository: z.string().min(1), from: hash, to: hash }).strict()
const run = z.object({ commit: hash, exit: z.number().int().min(0).max(255), log: z.string().min(1) }).strict()
const handBack = z.object({ receipt: z.string().min(1), files: z.array(z.string().min(1)).min(1).refine(files => new Set(files).size === files.length), with: run, without: run }).strict()

function refuse(key: WordKey, status: number, values: Record<string, string | number> = {}): never {
  throw new PanelError(sayInEnglish(key, values), status)
}
function git(repository: string, ...args: string[]): string {
  return readGit(repository, args, { timeoutMs: 10_000, maxBuffer: 1024 * 1024 }).toString('utf8').trim()
}
function isAncestor(repository: string, from: string, to: string): boolean {
  try { git(repository, 'merge-base', '--is-ancestor', from, to); return true } catch { return false }
}
function actualCommit(repository: string, commit: string): boolean {
  try { return git(repository, 'rev-parse', '--verify', `${commit}^{commit}`) === commit } catch { return false }
}

/**
 * THE FILES AN EMERGENCY PUSH CHANGED, as git names them between main before it and its commit. The push's hand-back and
 * the landed-between page both read them here, so the trace asks about the files the hand-back will compare.
 */
export function theFilesAPushChanged(push: { root: string; mainBefore: string; commit: string }): string[] {
  return readGit(push.root, ['diff', '--name-only', '--no-renames', push.mainBefore, push.commit]).toString('utf8').split('\n').filter((file) => file !== '')
}

/**
 * The existence read returns one bit; the only entry-data read is limited to this repository and these commits. The
 * emergency pushes whose commit is in the range are listed too, in the order of the range, with the files each changed.
 */
export function landingsBetween(workspaceId: string, query: unknown) {
  const parsed = range.safeParse(query)
  if (!parsed.success) refuse('mainSuiteTrace.badRange', 400)
  const { repository, from, to } = parsed.data
  const known = sqlite.prepare("SELECT 1 FROM records WHERE workspace_id = ? AND kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.changeset.root') = ? LIMIT 1").get(workspaceId, repository)
  if (known === undefined) refuse('mainSuiteTrace.noRepository', 404)
  try {
    if (!isAbsolute(repository) || realpathSync(repository) !== repository || git(repository, 'rev-parse', '--show-toplevel') !== repository) refuse('mainSuiteTrace.rangeCommit', 409)
  } catch { refuse('mainSuiteTrace.rangeCommit', 409) }
  if (!actualCommit(repository, from) || !actualCommit(repository, to)) refuse('mainSuiteTrace.rangeCommit', 409)
  if (!isAncestor(repository, from, to) || !isAncestor(repository, to, 'refs/heads/main')) refuse('mainSuiteTrace.rangeAncestry', 409)
  const count = Number(git(repository, 'rev-list', '--count', `${from}..${to}`))
  if (!Number.isSafeInteger(count) || count > 200) refuse('mainSuiteTrace.rangeLimit', 409)
  const commits = git(repository, 'rev-list', '--reverse', `${from}..${to}`).split('\n').filter(Boolean)
  const rows = commits.length === 0 ? [] : sqlite.prepare(
    "SELECT id, title, json_extract(data, '$.run') AS run, json_extract(data, '$.integrated.mainBefore') AS mainBefore, json_extract(data, '$.integrated.mainAfter') AS mainAfter, json_extract(data, '$.integrated.at') AS landedAt FROM records WHERE workspace_id = ? AND kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.changeset.root') = ? AND json_extract(data, '$.state') = 'merged' AND json_extract(data, '$.integrated.mainAfter') IN (" + commits.map(() => '?').join(',') + ')',
  ).all(workspaceId, repository, ...commits) as { id: string; title: string; run: string; mainBefore: string; mainAfter: string; landedAt: string }[]
  const order = new Map([from, ...commits].map((commit, index) => [commit, index]))
  rows.sort((a, b) => order.get(a.mainAfter)! - order.get(b.mainAfter)! || a.id.localeCompare(b.id))
  const landings = rows.map(row => {
    const { agent, starter } = theAgentAndStarterOfAnEntry({ run: row.run })
    return { ...row, line: { agent: agent?.id ?? null, starter: starter?.kind === 'agent' ? starter.id : null } }
  })
  const gaps: { from: string; to: string }[] = []
  let last = from
  for (const landing of landings) {
    if (landing.mainBefore !== last) gaps.push({ from: last, to: landing.mainBefore })
    last = landing.mainAfter
  }
  if (last !== to) gaps.push({ from: last, to })
  const pushRows = commits.length === 0 ? [] : sqlite.prepare(
    "SELECT id, json_extract(data, '$.root') AS root, json_extract(data, '$.mainBefore') AS mainBefore, json_extract(data, '$.commit') AS pushedCommit FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL AND json_extract(data, '$.root') = ? AND json_extract(data, '$.state') = 'pushed' AND json_extract(data, '$.commit') IN (" + commits.map(() => '?').join(',') + ')',
  ).all(workspaceId, EMERGENCY_PUSH_KIND, repository, ...commits) as { id: string; root: string; mainBefore: string; pushedCommit: string }[]
  pushRows.sort((a, b) => order.get(a.pushedCommit)! - order.get(b.pushedCommit)! || a.id.localeCompare(b.id))
  const pushes = pushRows.map(push => ({ id: push.id, mainBefore: push.mainBefore, commit: push.pushedCommit, files: theFilesAPushChanged({ root: push.root, mainBefore: push.mainBefore, commit: push.pushedCommit }) }))
  return { repository, from, to, commits: count, landings, tiled: gaps.length === 0, gaps, pushes }
}

/**
 * Who may hand a red of the main suite back: an agent, asking by its own key and not on a holder's behalf. The entry
 * door and the emergency push door both ask this first.
 */
export function theMainSuiteCaller(actor: Actor): string {
  const caller = participantForActor(actor)
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key' || actor.provedHolder !== undefined || caller?.kind !== 'agent') refuse('mainSuiteTrace.caller', 403)
  return caller.id
}

/** The receipt as its creator first wrote it, read from its first revision. Only the agent that filed it may hand it back. */
export function theReceiptTheCallerFiled(workspaceId: string, receipt: string, caller: string): string {
  const original = sqlite.prepare("SELECT data, actor_type AS actorType, actor_id AS actorId FROM revisions WHERE workspace_id = ? AND record_id = ? AND seq = 1 AND op = 'create' AND kind = 'whole_suite_receipt'").get(workspaceId, receipt) as { data: string; actorType: string; actorId: string } | undefined
  if (original === undefined) refuse('mainSuiteTrace.receipt', 409)
  const filer = original.actorType === 'agent' ? participantForActor({ type: 'agent', id: original.actorId }) : null
  if (filer?.kind !== 'agent' || filer.id !== caller) refuse('mainSuiteTrace.caller', 403)
  return original.data
}

/** Each file handed back failed in the receipt, and a receipt of version 2 ran it alone and saw it red. */
export function redInTheReceipt(receipt: WholeSuiteReceipt, files: readonly string[]): void {
  if (!files.every(file => receipt.failedFiles?.includes(file))) refuse('mainSuiteTrace.files', 409)
  if (receipt.version === 2 && !files.every(file => receipt.aloneRuns?.find(one => one.file === file)?.outcome === 'red')) refuse('mainSuiteTrace.alone', 409)
}

/** All evidence is read before the transaction's first write; the receipt's original creator and facts are authoritative. */
export function handBackFromTheMainSuite(workspaceId: string, id: string, body: unknown, actor: Actor) {
  const entry = readMergeEntry(theMergeEntry(id, workspaceId))
  const caller = theMainSuiteCaller(actor)
  const parsed = handBack.safeParse(body)
  if (!parsed.success) refuse('mainSuiteTrace.badHandBack', 400)
  const proof = parsed.data
  const original = theReceiptTheCallerFiled(workspaceId, proof.receipt, caller)
  if (entry.state !== 'merged') refuse('mainSuiteTrace.merged', 409)
  const integrated = entry.machine?.['integrated'] as { mainBefore?: string; mainAfter?: string; at?: string } | undefined
  if (integrated?.mainAfter !== proof.with.commit) refuse('mainSuiteTrace.with', 409)
  if (integrated.mainBefore !== proof.without.commit) refuse('mainSuiteTrace.without', 409)
  if (proof.with.exit === 0) refuse('mainSuiteTrace.red', 409)
  if (proof.without.exit !== 0) refuse('mainSuiteTrace.green', 409)
  let receipt
  try { receipt = parseWholeSuiteReceipt(JSON.parse(original)) } catch { refuse('mainSuiteTrace.receipt', 409) }
  if (entry.changeset.adapter !== 'git' || receipt.repository !== entry.changeset.root) refuse('mainSuiteTrace.repository', 409)
  const repository = entry.changeset.root
  if (!actualCommit(repository, receipt.commit) || !isAncestor(repository, proof.with.commit, receipt.commit) || !isAncestor(repository, receipt.commit, 'refs/heads/main')) refuse('mainSuiteTrace.commit', 409)
  redInTheReceipt(receipt, proof.files)
  const round = theRoundOpenForAnEntry(entry)
  if (!round.open) refuse('mainSuiteTrace.round', 409, { reason: round.reason ?? 'no open round is recorded' })
  if (typeof integrated.at !== 'string' || !actualCommit(repository, proof.without.commit)) refuse('mainSuiteTrace.facts', 409)
  const commits = git(repository, 'rev-list', '--reverse', `${proof.without.commit}..${proof.with.commit}`).split('\n').filter(Boolean)
  if (commits.length === 0) refuse('mainSuiteTrace.facts', 409)
  return sqlite.transaction(() => {
    const already = openHandBackForEntry(entry)
    if (already !== null) return { problem: already.problem.id, filed: false, unnamedFiles: proof.files.filter(file => !already.facts.files.includes(file)) }
    const made = fileAHandBackProblem(entry, { files: proof.files, commits, roundOpen: round, landedAt: integrated.at!, clock: clockStamp(), mainSuiteTrace: { receipt: proof.receipt, with: proof.with, without: proof.without } })
    return { problem: made.problem, filed: true, unnamedFiles: [], says: made.says }
  })()
}
