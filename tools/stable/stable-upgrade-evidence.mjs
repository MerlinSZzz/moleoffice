// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read original upgrade evidence without changing files, refs, records or processes. */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { A_KEY_SHOWN_AS } from '../office-request.mjs'
import { receiptFromArtifacts, theFilesLeftNotRunAlone } from '../periodic-main-suite.mjs'
import { requireIndependentGitObjects } from '../independent-storage.mjs'
import { requireReadOnlyGitConfig } from '../read-only-git-config.mjs'
import { readsOnDisk, THE_READS_ARCHIVE } from '../reads-archive.mjs'
import { parseWholeSuiteReceipt, wholeSuiteReceiptIsGreen, wholeSuiteReceiptOutcome } from '../../src/shared/whole-suite-receipt.ts'

const fail = (message) => { throw new Error(`Upgrade evidence refused: ${message}`) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hash = (value) => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)

function git(repository, words) {
  const ran = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0', '-C', repository, ...words], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1' },
  })
  if (ran.error || ran.status !== 0) fail(`Git could not verify ${words.join(' ')} in ${repository}.`)
  return ran.stdout.trim()
}

function regular(path, directory = false) {
  let stat, actual
  try {
    stat = lstatSync(path)
    actual = realpathSync(path)
  } catch { fail(`The evidence path ${path} is inaccessible.`) }
  if (actual !== path) fail(`The evidence path ${path} contains a symbolic link or is not canonical.`)
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) fail(`The evidence path ${path} is not a regular ${directory ? 'directory' : 'file'}.`)
}

function independentClone(repository, clone) {
  const contains = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) }
  if (contains(repository, clone) || contains(clone, repository)) fail('The development and clone roots must be separate, with neither inside the other.')
  const storage = join(clone, '.git')
  regular(storage, true)
  if (git(clone, ['rev-parse', '--absolute-git-dir']) !== storage || git(clone, ['rev-parse', '--path-format=absolute', '--git-common-dir']) !== storage || existsSync(join(storage, 'commondir')) || existsSync(join(storage, 'objects', 'info', 'alternates'))) fail('The clone must have independent Git storage, without a shared common directory or alternates.')
  try { requireIndependentGitObjects(storage) }
  catch (error) { fail(`The clone must have independent Git storage, without shared object hard links: ${error.message}`) }
}

function json(text, where, allowIgnoredMasks = false) {
  if (typeof text !== 'string' || (!allowIgnoredMasks && text.includes(A_KEY_SHOWN_AS))) fail(`${where} is missing or masked.`)
  let value
  try { value = JSON.parse(text) } catch { fail(`${where} is not readable JSON.`) }
  if (!object(value)) fail(`${where} is not a JSON object.`)
  return value
}

/**
 * THE LONGEST ANSWER A RECEIPT-EVIDENCE READ TAKES, in characters. The request helper hands back 60,000 unless a read
 * asks for more, and a receipt's original revision has been 83,414 bytes. The office sets no bound of its own on a
 * receipt. One create or change is at most Fastify's default of 1 MiB, but a record grows by its changes, its current
 * read carries them too, and SQLite's default length limit is past what Node holds in one string. So the bound is a
 * generous 16 MiB, about 200 times that receipt. A longer answer is still cut, and a cut answer is still refused.
 */
export const THE_LONGEST_RECEIPT_REPLY = 16 * 1024 * 1024

/** `longestReply` is handed to the request helper and never sent. */
export async function readReceiptEvidenceObject(officeRequest, path, allowIgnoredMasks = false) {
  const reply = await officeRequest({ method: 'GET', path, longestReply: THE_LONGEST_RECEIPT_REPLY })
  if (!object(reply) || reply.status !== 200 || reply.cut !== false || reply.location !== null) fail(`GET ${path} has an unsuccessful, cut or malformed transport envelope.`)
  return json(reply.body, `GET ${path}`, allowIgnoredMasks)
}

const read = readReceiptEvidenceObject

function identifiesOriginal(original, recordId, contentHash) {
  return original.recordId === recordId && original.seq === 1 && original.op === 'create' && original.contentHash === contentHash && typeof original.contentHash === 'string' && /^[a-f0-9]{16}$/.test(original.contentHash) && object(original.content) && original.content.kind === 'whole_suite_receipt' && original.content.deletedAt === null && object(original.who) && original.who.actorType === 'agent' && typeof original.who.actorId === 'string' && original.who.actorId.trim() !== '' && typeof original.who.sessionId === 'string' && original.who.sessionId.trim() !== ''
}

/** Read creation facts, never a receipt's editable latest data. */
export async function readOriginalReceipt(recordId, { officeRequest }) {
  if (typeof recordId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(recordId)) fail('Name an exact receipt record id.')
  const original = await read(officeRequest, `/api/records/${encodeURIComponent(recordId)}/revisions/1`)
  if (!identifiesOriginal(original, recordId, original.contentHash)) fail('The pinned revision is not an identified original receipt create.')
  return { original, evidence: { recordId, seq: 1, contentHash: original.contentHash } }
}

/** Each refusal of an attempt's carried-over evidence begins with one of these sentences. */
export const CARRIED_OVER_REFUSALS = Object.freeze({
  unpinned: 'The cloud door says it was given carried-over files, but the attempt keeps no carried-over evidence that names any.',
  notAForm: 'The carried-over evidence is not one of the three forms the producer writes.',
  itself: 'The carried-over evidence names the receipt being verified as the receipt before it.',
  notTheOriginal: 'The carried-over evidence does not name the original revision of a receipt the office answers.',
  notItsFiles: 'The carried-over files differ from the files that receipt left not run alone.',
})

const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const aRecordId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)

/** The three forms the producer writes: no last receipt, a last receipt it could not read, and a last receipt it read. */
function aCarriedOverForm(kept) {
  if (exactKeys(kept, ['from', 'files']) && kept.from === null) return Array.isArray(kept.files) && kept.files.length === 0
  if (exactKeys(kept, ['from', 'files', 'unreadable'])) return exactKeys(kept.from, ['recordId']) && aRecordId(kept.from.recordId) && Array.isArray(kept.files) && kept.files.length === 0 && typeof kept.unreadable === 'string' && kept.unreadable.trim() !== ''
  return exactKeys(kept, ['from', 'files']) && exactKeys(kept.from, ['recordId', 'seq', 'contentHash']) && aRecordId(kept.from.recordId) && Number.isSafeInteger(kept.from.seq) && kept.from.seq >= 1 && typeof kept.from.contentHash === 'string' && /^[a-f0-9]{16}$/.test(kept.from.contentHash) && Array.isArray(kept.files) && kept.files.every((file) => typeof file === 'string' && file !== '')
}

/**
 * THE FILES THE ATTEMPT CARRIED OVER, as the producer gave them to receiptFromArtifacts: the red files the receipt before
 * this one left not run alone. They come from the attempt's carried-over.json, which no receipt hashes, so they count
 * only once they are pinned: the revision it names is read again from the office, it must be that receipt's original,
 * and the files are worked out again from it by the producer's own rule. An attempt made before the producer kept the
 * file has none, and carried nothing.
 */
async function theCarriedOverPinned(attempt, receiptId, answer, officeRequest) {
  const path = join(attempt, 'carried-over.json')
  let there = true
  // Only absence is handled: the attempt was made before the producer kept the file. A link is still there, and refused.
  try { lstatSync(path) } catch (error) { if (error.code !== 'ENOENT') throw error; there = false }
  let kept = null
  if (there) {
    regular(path)
    const text = readFileSync(path, 'utf8')
    // A file that is not JSON is not one of the three forms.
    try { kept = JSON.parse(text) } catch { kept = undefined }
    if (!aCarriedOverForm(kept)) fail(`${CARRIED_OVER_REFUSALS.notAForm} It is at ${path}.`)
  }
  const files = kept?.files ?? []
  if (files.length === 0) {
    // The producer gives the door carried-over files only when there are some, and the door answers carriedOverFirst only then.
    if (Object.hasOwn(answer, 'carriedOverFirst')) fail(CARRIED_OVER_REFUSALS.unpinned)
    return []
  }
  const named = kept.from
  if (named.recordId === receiptId) fail(CARRIED_OVER_REFUSALS.itself)
  let read
  try { read = await readOriginalReceipt(named.recordId, { officeRequest }) } catch (error) {
    // The one case handled here: the read refused what the office answered for that receipt, and its reason is kept.
    // Any other error, such as an office that gave no answer, goes through as it is.
    if (!(error instanceof Error) || !error.message.startsWith('Upgrade evidence refused: ')) throw error
    fail(`${CARRIED_OVER_REFUSALS.notTheOriginal} Receipt ${named.recordId} could not be read as an original receipt: ${error.message.replace(/^Upgrade evidence refused: /, '')}`)
  }
  const pinned = { evidence: read.evidence, files: theFilesLeftNotRunAlone(read.original) }
  if (!isDeepStrictEqual(named, pinned.evidence)) fail(`${CARRIED_OVER_REFUSALS.notTheOriginal} It names seq ${named.seq} with content hash ${named.contentHash} of receipt ${named.recordId}, whose original is seq 1 with content hash ${pinned.evidence.contentHash}.`)
  if (!isDeepStrictEqual(files, pinned.files)) fail(`${CARRIED_OVER_REFUSALS.notItsFiles} It names ${files.join(', ')}; receipt ${named.recordId} left ${pinned.files.length > 0 ? pinned.files.join(', ') : 'none'} not run alone.`)
  return files
}

/**
 * Verify the pinned create revision against the original producer's method, artifacts and Git.
 * officeRequest is the office-request.mjs transport: {status, location, body, cut, added}.
 * Current data is never used as receipt evidence. GET bookkeeping follows the office contract.
 */
export async function verifyOriginalReceiptEvidence({ repository, commit, evidence }, { officeRequest }) {
  if (typeof officeRequest !== 'function') fail('An office_request reader is required.')
  if (typeof repository !== 'string' || !isAbsolute(repository) || !hash(commit)) fail('Name an absolute repository and an exact full commit.')
  regular(repository, true)
  if (git(repository, ['rev-parse', '--show-toplevel']) !== repository) fail('The repository is not its actual Git root.')
  requireReadOnlyGitConfig(repository)
  if (!object(evidence) || typeof evidence.recordId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(evidence.recordId) || evidence.seq !== 1 || typeof evidence.contentHash !== 'string' || !/^[a-f0-9]{16}$/.test(evidence.contentHash)) fail('Name the original sequence 1 and its exact content hash.')
  const path = `/api/records/${encodeURIComponent(evidence.recordId)}`
  const { original } = await readOriginalReceipt(evidence.recordId, { officeRequest })
  if (original.contentHash !== evidence.contentHash) fail('The pinned revision is not the original undeleted whole-suite receipt create by an identified agent run.')
  const currentReply = await read(officeRequest, path, true)
  const current = currentReply.record
  if (!object(current) || current.id !== evidence.recordId || current.kind !== 'whole_suite_receipt' || current.origin !== 'authored' || current.deletedAt !== null) fail('The current record does not establish authored, undeleted receipt provenance.')
  // Latest receipt data and its change history supply no facts about the original create.
  const { data: ignoredData, ...currentMetadata } = current
  const { record: ignoredRecord, changes: ignoredChanges, ...currentEnvelope } = currentReply
  void ignoredData; void ignoredRecord; void ignoredChanges
  if (JSON.stringify({ ...currentEnvelope, record: currentMetadata }).includes(A_KEY_SHOWN_AS)) fail('The current receipt provenance or metadata is masked.')
  const receipt = parseWholeSuiteReceipt(original.content.data)
  const tree = git(repository, ['rev-parse', '--verify', `${commit}^{tree}`])
  if (git(repository, ['rev-parse', '--verify', `${commit}^{commit}`]) !== commit) fail('The requested object is not the exact commit.')
  git(repository, ['merge-base', '--is-ancestor', commit, 'refs/heads/main'])
  if (receipt.repository !== repository || receipt.commit !== commit || receipt.tree !== tree) fail('The original repository, commit or tree differs from the requested target.')
  const clone = receipt.clone
  regular(clone, true)
  requireReadOnlyGitConfig(clone)
  independentClone(repository, clone)
  if (clone === repository || git(clone, ['rev-parse', '--show-toplevel']) !== clone || git(clone, ['rev-parse', '--verify', 'HEAD']) !== commit || git(clone, ['rev-parse', '--verify', 'HEAD^{tree}']) !== tree) fail('The actual suite clone HEAD or tree differs from the target.')
  if (git(clone, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('The actual suite clone is not clean.')
  const attempt = dirname(clone)
  if (clone !== join(attempt, 'clone')) fail('The clone is outside the original producer layout.')
  const layout = { log: join(attempt, 'suite.log'), report: join(attempt, 'report.json'), manifest: join(attempt, 'manifest.json'), reads: join(attempt, 'reads'), alone: join(attempt, 'alone') }
  const reads = receipt.artifacts.find((artifact) => artifact.name === 'reads')
  for (const artifact of receipt.artifacts) {
    const allowed = artifact.name === 'reads' ? [layout.reads, join(attempt, THE_READS_ARCHIVE)] : [layout[artifact.name]]
    if (!allowed.includes(artifact.path)) fail(`The ${artifact.name} artifact is outside the original producer layout.`)
    if (artifact.name !== 'reads') regular(artifact.path)
    else {
      const form = readsOnDisk(artifact.path)
      regular(form.path, form.folder)
    }
  }
  const paths = { ...layout, reads: reads?.path ?? layout.reads }
  const resultPath = join(attempt, 'door-result.json')
  regular(resultPath)
  const result = json(readFileSync(resultPath, 'utf8'), 'The original door result')
  const output = join(attempt, 'door-output.log')
  const answer = result.answer
  const completedPhase = answer?.phase === 'test' || (answer?.phase === 'build' && answer.buildExitCode > 0 && !Object.hasOwn(answer, 'suiteExitCode'))
  if (result.output !== output || !object(answer) || answer.ran !== true || !completedPhase || answer.commit !== commit || !Number.isFinite(answer.wallSec) || answer.wallSec < 0 || !Number.isSafeInteger(answer.workers) || answer.workers < 1) fail('The original method does not identify a completed cloud build or suite with its worker count and duration.')
  regular(output)
  const last = readFileSync(output, 'utf8').trim().split('\n').at(-1)
  if (!isDeepStrictEqual(json(last, 'The original door output'), answer)) fail('The original door result disagrees with its kept final output.')
  const carriedOver = await theCarriedOverPinned(attempt, evidence.recordId, answer, officeRequest)
  // Version 2 rebuilds each run alone from its own files in alone/; version 1 reads none of them.
  const rebuilt = receiptFromArtifacts({ repository, commit, tree, clone, paths, result, startedAt: receipt.startedAt, endedAt: receipt.endedAt, allowsVersion2: receipt.version === 2, allowsWorkerCrashes: receipt.workerCrashes !== undefined, namesSkippedCases: receipt.skippedCases !== undefined, carriedOver })
  if (!isDeepStrictEqual(receipt, rebuilt)) fail('The original receipt facts or artifact hashes differ from the recomputed evidence.')
  const green = wholeSuiteReceiptIsGreen(rebuilt)
  const outcome = wholeSuiteReceiptOutcome(rebuilt)
  const complete = outcome !== 'incomplete'
  return { receipt, original, result, artifacts: rebuilt.artifacts, green, complete, outcome }
}

/**
 * A complete green original suite authorizes a stable upgrade. One that is not green does only when the authorization
 * note, `input.noticeApproval`, pins a judgement of it that stands (wave 13q item 6); the release policy reads that
 * judgement again at every check.
 */
export async function verifyUpgradeEvidence(input, doors) {
  const verified = await verifyOriginalReceiptEvidence(input, doors)
  if (verified.green) return verified
  const judgement = input.noticeApproval === undefined ? null
    : await (await import('./stable-release-policy.mjs')).theJudgementThatStands(doors.officeRequest, input.noticeApproval, verified.original)
  if (judgement === null) fail('The original complete suite evidence is not green.')
  return { ...verified, judgement }
}
