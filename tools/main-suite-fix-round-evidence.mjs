// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Original receipt and actual Git evidence for the dormant concentrated repair controller. */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { verifyOriginalReceiptEvidence } from './stable/stable-upgrade-evidence.mjs'
import { requireIndependentGitObjects } from './independent-storage.mjs'
import { requireReadOnlyGitConfig } from './read-only-git-config.mjs'
import { mainSuiteFixDeadline, mainSuiteFixSchema } from '../src/shared/main-suite-fix.ts'

const fail = words => { throw new Error(`Fix round evidence refused: ${words}`) }
const hash = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const contains = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) }

function git(repository, args, author) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-C', repository, ...args], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1',
      ...(author === undefined ? { GIT_OPTIONAL_LOCKS: '0' } : { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email }) },
  })
  if (result.error || result.status !== 0) fail(`${args.includes('revert') ? 'revert failed; retain the clone for supervised recovery' : `Git ${args[0]} failed`} in ${repository}: ${result.stderr?.trim() ?? result.error?.message}`)
  return result.stdout.trim()
}

/** A bare local stamp must identify exactly one instant; no spring-gap or autumn-fold guess. */
export function fixRoundDeadline(endedAt, timeZone) {
  try { mainSuiteFixSchema.shape.timeZone.parse(timeZone) } catch { fail('Name the installation time zone explicitly.') }
  const { endedAtMs, deadlineMs } = mainSuiteFixDeadline(endedAt, timeZone)
  return endedAtMs === null ? null : { endedAtMs, deadlineMs }
}

export async function readFixRoundRed(input, { officeRequest }) {
  const verified = await verifyOriginalReceiptEvidence(input, { officeRequest })
  if (verified.complete !== true || verified.outcome !== 'red') fail('A complete original red main suite receipt is required.')
  if (!hash(input.tree) || verified.receipt.tree !== input.tree) fail('The explicit original tree differs from the receipt.')
  const deadline = fixRoundDeadline(verified.receipt.endedAt, input.timeZone)
  return { ...verified, ...(deadline ?? { endedAtMs: null, deadlineMs: null }), timeUnknown: deadline === null ? 'The original end time is missing, skipped or ambiguous in the installation time zone.' : null }
}

/** The caller reads these records through Office; this check matches every landed interval to real Git. */
export async function findFixRoundCauses(input, { officeRequest }) {
  const green = await verifyOriginalReceiptEvidence(input.baseline, { officeRequest })
  if (!green.green) fail('The original green baseline is not green.')
  const red = await readFixRoundRed(input, { officeRequest })
  if (green.receipt.repository !== input.repository) fail('The green baseline names another repository.')
  git(input.repository, ['merge-base', '--is-ancestor', green.receipt.commit, input.commit])
  const commits = git(input.repository, ['rev-list', '--reverse', '--first-parent', `${green.receipt.commit}..${input.commit}`]).split('\n').filter(Boolean)
  const unknown = words => ({ cause: [], unknown: words })
  if (!Array.isArray(input.entries) || input.entries.length === 0 || commits.length === 0) return unknown('No complete actual landed-entry interval follows the last original green receipt.')
  let cursor = green.receipt.commit
  const intervals = []
  const seen = new Set()
  for (const entry of input.entries) {
    const landed = entry.integrated
    if (seen.has(entry.id) || entry.state !== 'merged' || entry.changeset?.adapter !== 'git' || landed?.entry !== entry.id || landed.mainBefore !== cursor || landed.rebasedTip !== landed.mainAfter || !hash(landed.mainAfter) || typeof landed.sealId !== 'string' || landed.sealId === '') return unknown('A landed entry is missing, repeated or does not match the actual contiguous interval.')
    seen.add(entry.id)
    git(input.repository, ['merge-base', '--is-ancestor', cursor, landed.mainAfter])
    git(input.repository, ['merge-base', '--is-ancestor', landed.mainAfter, input.commit])
    const actual = git(input.repository, ['rev-list', '--reverse', '--first-parent', `${cursor}..${landed.mainAfter}`]).split('\n').filter(Boolean)
    if (actual.length === 0) return unknown('A landed entry has no actual commits in this interval.')
    intervals.push({ entry: entry.id, commits: actual, how: 'only-change' })
    cursor = landed.mainAfter
  }
  if (cursor !== input.commit || intervals.flatMap(one => one.commits).join() !== commits.join()) return unknown('The landed-entry receipts do not cover the exact original red main interval.')
  if (intervals.length === 1) return { cause: intervals, unknown: null }
  for (const entry of input.entries) {
    const bus = entry.machine?.tested?.busCause
    if (bus?.mainAt !== green.receipt.commit || bus.suite?.commit !== input.commit || bus.suite?.tree !== input.tree || !Array.isArray(bus.order) || bus.order.length !== intervals.length) continue
    const orderMatches = bus.order.every((one, index) => {
      const actual = intervals[index]
      return one.entry === actual.entry && one.commit === actual.commits.at(-1)
        && one.tree === git(input.repository, ['rev-parse', `${one.commit}^{tree}`])
        && Array.isArray(one.commits) && one.commits.join() === actual.commits.join()
    })
    const decided = bus.pairDecided
    if (!orderMatches || !Array.isArray(decided?.still) || [...decided.still].sort().join() !== [...red.receipt.failedFiles].sort().join()) continue
    const indices = red.receipt.failedFiles.map(file => decided.brokeBy?.[file])
    if (indices.length === 0 || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= intervals.length)) continue
    return { cause: [...new Set(indices)].sort((a, b) => a - b).map(index => ({ ...intervals[index], how: 'bisect' })), unknown: null }
  }
  return unknown('Several actual entries landed since the original green baseline; no verified per-file attribution is available. Ask the sheriff for a named-test diagnostic.')
}

/** Prepare code only. Sealing, inspection, submission, landing and notices are separate observed acts. */
export function prepareFixRoundRevert({ repository, clone, main, cause, author }) {
  if (!isAbsolute(repository ?? '') || realpathSync(repository) !== repository || git(repository, ['rev-parse', '--show-toplevel']) !== repository) fail('Name the canonical development repository.')
  requireReadOnlyGitConfig(repository)
  if (!isAbsolute(clone ?? '') || contains(repository, clone) || contains(clone, repository)) fail('The take-out clone must be separate from the development repository.')
  if (existsSync(clone) || !existsSync(dirname(clone)) || realpathSync(dirname(clone)) !== dirname(clone)) fail('Name a new canonical external take-out clone path.')
  if (!hash(main) || git(repository, ['rev-parse', 'refs/heads/main']) !== main) fail('The prepared base must be the exact current development main.')
  if (!Array.isArray(cause) || cause.length === 0 || !author?.name || !author?.email) fail('Verified causes and an explicit tool author are required.')
  const entries = new Set(), causal = new Set()
  for (const one of cause) {
    if (!one.entry || entries.has(one.entry) || !['only-change', 'bisect'].includes(one.how) || !Array.isArray(one.commits) || one.commits.length === 0) fail('Every named causal entry needs its actual landed commits once.')
    entries.add(one.entry)
    for (const commit of one.commits) {
      if (!hash(commit) || causal.has(commit)) fail('A causal commit is missing or repeated.')
      git(repository, ['merge-base', '--is-ancestor', commit, main])
      if (git(repository, ['rev-list', '--parents', '-n', '1', commit]).split(' ').length !== 2) fail('Automatic reversion requires ordinary single-parent landed commits.')
      causal.add(commit)
    }
  }
  mkdirSync(clone, { mode: 0o700 })
  git(repository, ['clone', '--no-local', '--no-checkout', repository, clone], author)
  const storage = join(clone, '.git')
  if (!lstatSync(storage).isDirectory() || existsSync(join(storage, 'commondir')) || existsSync(join(storage, 'objects', 'info', 'alternates'))) fail('The take-out must have independent Git storage.')
  requireIndependentGitObjects(storage)
  git(clone, ['checkout', '-b', 'fix-round-takeout', main], author)
  const ordered = git(repository, ['rev-list', '--first-parent', main]).split('\n').filter(one => causal.has(one))
  if (ordered.length !== causal.size) fail('A causal commit is not on the actual main first-parent history.')
  const commits = []
  for (const target of ordered) {
    git(clone, ['-c', 'commit.gpgSign=false', 'revert', '--no-edit', target], author)
    commits.push(git(clone, ['rev-parse', 'HEAD']))
  }
  if (git(clone, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('The prepared revert is not clean; retain it for recovery.')
  return { clone, base: main, commit: git(clone, ['rev-parse', 'HEAD']), tree: git(clone, ['rev-parse', 'HEAD^{tree}']), commits, takesOut: [...entries] }
}
