// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Approved upgrade messages use the canonical transport; delivery never recovers a service. */
import { constants, closeSync, fstatSync, fsyncSync, openSync, readFileSync, realpathSync, statSync, writeSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { askTheOffice, theRunsIdentity } from '../office-request.mjs'
import { versionOf } from '../../src/server/lib/version.ts'
import { localStamp } from '../../src/shared/time.ts'
import { MOLE_OFFICE_HANDLE } from '../../src/shared/participants.ts'
import {
  STABLE_UPGRADE_NOTICE_EVENT, STABLE_UPGRADE_PUBLIC_REASONS, stableEmergencyBeforeText, stableEmergencyNoticeEventSchema, stableEmergencyNoticeRequestSchema,
  stableUpgradeApprovalSchema, stableUpgradeNoticeLookupResultSchema, stableUpgradeNoticeRequestSchema, stableUpgradeNoticeResultSchema,
} from '../../src/shared/stable-upgrade-notices.ts'

const NOTICE_PATH = '/api/office/upgrades/notice'
const SPACING_COUNT_PATH = '/api/office/gates/release-spacing/met'
const EMERGENCY_COUNT_PATH = '/api/office/gates/stable-emergency/met'
const fail = (message) => { throw new Error(`Upgrade notice: ${message}`) }
const digest = (value) => createHash('sha256').update(value).digest('base64')

/**
 * HOW LONG A CALL TO THE LIVE OFFICE THAT GOT NO ANSWER IS TRIED AGAIN, AND THE PAUSE BETWEEN TRIES.
 * The 60-second window is the agreed design (upgrade-stable.criteria.md,
 * "A slimmer stable release" part (6)): upgrade 19 was killed by a 57-second stall of one office call,
 * so the same request is sent again for about a minute. The 1-second pause is this round's engineering
 * choice, pinned here so that a change to it is made on purpose.
 */
export const THE_RETRY_WINDOW_MS = 60_000
export const THE_PAUSE_BETWEEN_TRIES_MS = 1_000

export function validateNoticeConfig(c) {
  stableUpgradeApprovalSchema.parse(c.noticeApproval)
  if (!c.noticeSendIds || Object.keys(c.noticeSendIds).sort().join(',') !== 'after,before' ||
      ![c.noticeSendIds.before, c.noticeSendIds.after].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id)) || c.noticeSendIds.before === c.noticeSendIds.after) fail('Name distinct immutable noticeSendIds.before and noticeSendIds.after.')
}

export function beforeUpgradeRequest(c, baseline, tree) {
  return stableUpgradeNoticeRequestSchema.parse({ stage: 'before', sendId: c.noticeSendIds.before, announcement: {
    candidateTag: c.candidateTag, baselineTag: c.previousBaselineTag, fromCommit: baseline, toCommit: c.targetCommit, tree,
    evidence: { id: c.evidence.recordId, seq: c.evidence.seq, contentHash: c.evidence.contentHash }, notice: c.notice, noticeApproval: c.noticeApproval,
  } })
}

/** An emergency release's BEFORE names no receipt. It names the switch's throw and the message the release check read. */
export function beforeEmergencyRequest(c, baseline, tree, emergency) {
  return stableEmergencyNoticeRequestSchema.parse({ kind: 'emergency', stage: 'before', sendId: c.noticeSendIds.before, announcement: {
    candidateTag: c.candidateTag, baselineTag: c.previousBaselineTag, fromCommit: baseline, toCommit: c.targetCommit, tree,
    emergency, notice: c.notice, noticeApproval: c.noticeApproval,
  } })
}

/**
 * Only the notice POST and the two gate counts are available: a release refused for its spacing, and the use of the emergency switch. A dry transport refuses every write.
 * A request's `longestReply` is handed to the request helper and never sent: the release check raises it for its one read of the gate list.
 */
export function upgradeOfficeRequest(env, timeoutMs, dry = false) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) fail('The transport timeout must be from 1 to 15000 milliseconds.')
  const officeRequest = async (asked, destination) => {
    const { longestReply, ...request } = asked
    if (request.method !== 'GET' && dry) fail('A dry run sends no write, so it files no notice and counts no refusal.')
    if (request.method !== 'GET' && (request.method !== 'POST' || ![NOTICE_PATH, SPACING_COUNT_PATH, EMERGENCY_COUNT_PATH].includes(request.path))) fail('Only GET, the real upgrade notice POST, the count of a release refused for its spacing and the count of an emergency release are permitted.')
    // A CALL THAT GOT NO ANSWER IS THE FETCH ITSELF THROWING (its time ran out, or the connection was
    // refused or reset), never an answer with a status. `fetchThrew` notes that for this one call, so
    // the caller can tell "no answer" from every other failure. A reply with any status is returned as
    // it is, and nothing else in this transport changes.
    let fetchThrew = false
    const fetchThatNotesNoAnswer = (url, init) => {
      let attempt
      try { attempt = fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }) } catch (error) { fetchThrew = true; throw error }
      return attempt.catch((error) => { fetchThrew = true; throw error })
    }
    try {
      return await askTheOffice(request, {
        env: { ...env, ...(destination ? { MOLE_OFFICE_API: destination.api } : {}) },
        fetchImpl: fetchThatNotesNoAnswer,
        ...(longestReply === undefined ? {} : { longestReply }),
      })
    } catch (error) {
      if (!fetchThrew) throw error
      // The same sentence the transport already wrote, now marked so the retry wrapper can tell it
      // from a refusal or any other error.
      const noAnswer = new Error(error instanceof Error ? error.message : String(error))
      noAnswer.noAnswer = true
      throw noAnswer
    }
  }
  const { agent, session, workspace } = theRunsIdentity(env)
  officeRequest.identity = { agent, session, project: workspace }
  return officeRequest
}

/** One line for each try again, naming the method, the path, the reason and the seconds since the first try. */
const aTryAgain = (method, path, seconds, reason) => `Trying the ${method} ${path} again after ${seconds} seconds, because it got no answer: ${reason}`

/**
 * A CALL TO THE LIVE OFFICE BEFORE DOWNTIME IS TRIED AGAIN FOR ABOUT A MINUTE. Upgrade 19 was killed by
 * a 57-second stall of one call, so when the office gives no answer (the transport's time ran out, or
 * the connection was refused or reset) this sends the same request again, the same method, path and
 * body, until the window has passed.
 *
 * WHAT IS SENT AGAIN: a GET anywhere on the office, and the notice POST. The notice carries a sendId,
 * so sending it again files the same notice once. WHAT IS NOT: a gate count, which carries no sendId
 * and would count twice; it is passed through once, and its own answer or error goes back unchanged.
 * A reply with any status is an answer and is returned at once, and an error that is not "no answer"
 * is thrown at once. The body is copied once before the first try, so a caller that changes its
 * request object afterwards cannot change what is sent.
 *
 * THE CALLER USES THIS ONLY FOR THE LIVE OFFICE AND ONLY BEFORE DOWNTIME: from the first stop of the
 * old version on, no call is tried again this way, and a call to the candidate's scratch port never is
 * (its start has its own wait). A call that still has no answer after the window stops the release
 * before downtime with the state unchanged.
 *
 * `now`, `pause` and `say` are the caller's own clock, wait and report, for a test that cannot spend a
 * real minute. The returned function has the same shape as `officeRequest` and its `identity`.
 * @param {(request: any, destination?: any) => Promise<any>} officeRequest
 * @param {{ windowMs?: number, pauseMs?: number, now?: () => number, pause?: (ms: number) => Promise<void>, say?: (line: string) => void }} [options]
 * @returns {((request: any, destination?: any) => Promise<any>) & { identity?: unknown }}
 */
export function triedAgainForAMinute(officeRequest, { windowMs = THE_RETRY_WINDOW_MS, pauseMs = THE_PAUSE_BETWEEN_TRIES_MS, now = Date.now, pause = (ms) => new Promise(resolve => setTimeout(resolve, ms)), say = () => {} } = {}) {
  const tried = async (request, destination) => {
    const method = String(request.method ?? '').toUpperCase()
    // ONLY A READ AND THE NOTICE POST ARE SAFE TO SEND AGAIN. A gate count has no sendId, so a second
    // count is a second count: it is sent once, and its own error is thrown as it came.
    if (method !== 'GET' && !(method === 'POST' && request.path === NOTICE_PATH)) return officeRequest(request, destination)
    const sent = structuredClone(request)
    const beganAt = now()
    let tries = 0
    let lastReason = 'no reason was given'
    for (;;) {
      if (tries > 0 && now() - beganAt >= windowMs) break
      tries += 1
      try {
        return await officeRequest(sent, destination)
      } catch (error) {
        if (error?.noAnswer !== true) throw error
        lastReason = error instanceof Error ? error.message : String(error)
        const waited = now() - beganAt
        if (waited >= windowMs) break
        say(aTryAgain(method, request.path, waited / 1000, lastReason))
        await pause(pauseMs)
      }
    }
    const waited = now() - beganAt
    const refused = new Error(`The ${method} ${request.path} got no answer after ${Math.round(waited / 100) / 10} seconds in ${tries} tries; the last reason was: ${lastReason}`)
    refused.noAnswer = true
    throw refused
  }
  tried.identity = officeRequest.identity
  return tried
}

/** Where the office's registry row is read, by its handle. */
export const THE_OFFICES_ROW = `/api/participants/agent/${MOLE_OFFICE_HANDLE}`

/**
 * The id the office's registry row holds now, from the office's answer to THE_OFFICES_ROW. The id can
 * differ from the handle, so a notice is the office's only when its sender
 * is this id. A row that cannot be read is an error, never the handle in its place.
 */
export function theOfficesIdIn(reply) {
  let row
  try { row = JSON.parse(reply.body).participant } catch { row = undefined }
  if (reply?.status !== 200 || reply.cut !== false || reply.location !== null || typeof row?.id !== 'string' || row.id === '' ||
      row.handle !== MOLE_OFFICE_HANDLE || row.retired !== false) throw new Error(`The office's registry row could not be read (${reply?.status ?? 'no status'}), so no notice can be shown to be the office's.`)
  return row.id
}

/** The same id, read through the caller's own transport. */
export async function readTheOfficesId(officeRequest, destination) {
  return theOfficesIdIn(await officeRequest({ method: 'GET', path: THE_OFFICES_ROW }, destination))
}

/** The content is the original ledger content, not a current message or a claimed hash. The office is the id readTheOfficesId returned. */
export function verifyNoticeReply(reply, request, project, office, contract = upgradeNoticeContract) {
  if (typeof office !== 'string' || office === '') fail('No office id was given to compare the notice sender with.')
  if (!reply || ![200, 201].includes(reply.status) || reply.cut !== false || reply.location !== null) fail(`The original notice response was refused, redirected, cut or unavailable (${reply?.status ?? 'no status'}); delivery is unconfirmed. ${typeof reply?.body === 'string' ? reply.body.slice(0, 500) : ''}`)
  const value = contract.resultSchema.parse(JSON.parse(reply.body))
  const { original, event } = value
  const content = value.content
  if (!content || content.kind !== 'message' || content.deletedAt !== null || typeof content.title !== 'string' || (content.summary !== null && typeof content.summary !== 'string') || !content.data ||
      versionOf(content) !== original.contentHash || !isDeepStrictEqual(content.data.extra?.[STABLE_UPGRADE_NOTICE_EVENT], event) || !isDeepStrictEqual(event.request, request) ||
      (project !== undefined && event.project !== project) || content.data.sentBy?.kind !== 'agent' || content.data.sentBy?.id !== office ||
      !Array.isArray(content.data.to) || content.data.to.length !== 1 || content.data.to[0]?.kind !== 'person' || typeof content.data.to[0]?.id !== 'string' ||
      typeof value.replayed !== 'boolean' || value.replayed !== (reply.status === 200) || (request.stage === 'before' && content.data.body !== contract.beforeText(request.announcement))) fail('The response does not prove the original system message, payload and content hash.')
  return { original, event, content, replayed: value.replayed }
}

function openJournal(path, create = false) {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(dirname(path)) !== dirname(path)) fail('The notice journal needs a canonical absolute private path.')
  const fd = openSync(path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW | (create ? constants.O_CREAT | constants.O_EXCL : 0), 0o600)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 1024 * 1024) fail('The notice journal must be one private ordinary file owned by this user, at most one megabyte.')
    return fd
  } catch (error) { closeSync(fd); throw error }
}
function append(path, row, create = false) {
  const fd = openJournal(path, create)
  try { writeSync(fd, JSON.stringify({ at: localStamp(new Date()), ...row }) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
  if (create) { const parent = openSync(dirname(path), 'r'); try { fsyncSync(parent) } finally { closeSync(parent) } }
}
const identityOf = (officeRequest) => officeRequest.identity ?? null

/** A refusal has no announcement; its local audit uses only a verified configured directory. */
export function beginUpgradePreflight(config) {
  try {
    const root = config?.recoveryRoot
    if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) fail('No canonical recoveryRoot was configured.')
    const info = statSync(root)
    if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) fail('The recoveryRoot is not a private directory owned by this user.')
    for (const source of [config.developmentRepository, config.stableCheckout]) {
      if (typeof source !== 'string' || !isAbsolute(source)) fail('The repository paths are unavailable for checking journal separation.')
      const actual = realpathSync(source)
      if (root === actual || root.startsWith(actual + sep) || actual.startsWith(root + sep)) fail('The recoveryRoot overlaps a repository.')
    }
    const path = join(root, `preflight-${randomUUID()}.jsonl`)
    append(path, { step: 'preflight', state: 'attempt', announcement: 'not-attempted' }, true)
    return { path, unavailable: null }
  } catch (error) { return { path: null, unavailable: `refusal journal unavailable: ${String(error.message ?? error)}` } }
}
export function retainUpgradeRefusal(preflight, error) {
  if (!preflight?.path) return preflight?.unavailable ?? 'refusal journal unavailable: configuration could not be read.'
  try {
    append(preflight.path, { step: 'preflight', state: 'refused', announcement: 'not-attempted', reason: String(error.message ?? error) })
    return `Local refusal retained in ${preflight.path}.`
  } catch (failure) { return `refusal journal unavailable: ${String(failure.message ?? failure)}` }
}

/** Persist exactly what will be posted before asking the ordinary service to file it. */
export async function announceUpgrade({ path, api, request, serving, afterSendId, timeoutMs }, { officeRequest, contract = upgradeNoticeContract }) {
  const pinned = contract.requestSchema.parse(request)
  const context = { version: 1, api, serving, afterSendId, timeoutMs, caller: identityOf(officeRequest), before: pinned }
  append(path, { step: 'before-request', context }, true)
  try {
    const office = await readTheOfficesId(officeRequest, { api })
    const receipt = verifyNoticeReply(await officeRequest({ method: 'POST', path: NOTICE_PATH, body: structuredClone(pinned) }, { api }), pinned, context.caller?.project, office, contract)
    append(path, { step: 'before-filed', receipt })
    return receipt.original
  } catch (error) {
    try { append(path, { step: 'before-unconfirmed', error: String(error.message ?? error) }) } catch { /* The attempted request remains the last durable fact. */ }
    throw error
  }
}

/** A count of untranslated words above zero goes in a completed AFTER (upgrade-stable.criteria.md, item 15 (d)). */
const theCount = result => result.untranslatedWords > 0 ? { untranslatedWords: result.untranslatedWords } : {}
function outcomeFor(result, evidence, serving) {
  if (result.state === 'published') return { state: 'completed', ...theCount(result), verification: { result: 'completed', evidence, serving } }
  if (result.state === 'unchanged') return { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] }
  if (result.state === 'restored') return { state: 'failed-restored', reason: STABLE_UPGRADE_PUBLIC_REASONS[1] }
  if (result.state === 'NOT RESTORED') return { state: 'not-restored', reason: STABLE_UPGRADE_PUBLIC_REASONS[2] }
  fail('There is no final transaction outcome to announce.')
}
function pending(result, path, error, contract = upgradeNoticeContract) {
  const says = contract.pendingText ?? (result.state === 'published' ? 'upgrade verified; notice not filed' : 'Upgrade outcome retained; notice not filed.')
  return { ...result, notices: { state: 'pending', journal: path, says, uncertainty: String(error.message ?? error) } }
}

/** Called only after the transaction has closed its descriptors and settled recovery. */
export async function finishUpgradeNotice({ path, before, result, evidence, serving, sendId }, options) {
  const contract = options.contract ?? upgradeNoticeContract
  options = { ...options, contract }
  try {
    const request = contract.requestSchema.parse({ ...contract.afterFields, stage: 'after', sendId, before, outcome: contract.outcomeFor(result, evidence, serving) })
    const payload = JSON.stringify(request)
    append(path, { step: 'after-ready', result, payload, sha256Base64: digest(payload) })
    return await retryUpgradeNotice(path, options)
  } catch (error) { return pending(result, path, error, contract) }
}

/** One bounded delivery attempt. It never calls the upgrade or changes a service. */
export async function retryUpgradeNotice(path, { officeRequest, verifyService, contract: given }) {
  const fd = openJournal(path)
  let rows
  try { rows = readFileSync(fd, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line)) } finally { closeSync(fd) }
  const [first] = rows
  const ready = rows.filter(row => row.step === 'after-ready')
  const beforeFiled = rows.filter(row => row.step === 'before-filed')
  if (first?.step !== 'before-request' || first.context?.version !== 1 || ready.length !== 1 || beforeFiled.length !== 1) fail('No single settled AFTER request is recorded; crash recovery is not supported.')
  const { context } = first
  // A retry from the command line names no contract. The retained BEFORE says whether it was an emergency release.
  const contract = given ?? (context.before?.kind === 'emergency' ? emergencyNoticeContract : upgradeNoticeContract)
  const kept = ready[0]
  if (typeof kept.payload !== 'string' || digest(kept.payload) !== kept.sha256Base64) fail('The retained AFTER payload is damaged.')
  const request = contract.requestSchema.parse(JSON.parse(kept.payload))
  const prior = beforeFiled[0].receipt
  // The office's id is read only when a notice has to be compared with it. On the delivery path that is after the
  // lookup, so a service that does not answer is recorded as an unconfirmed lookup, as before the id was read.
  const officeAndPrior = async () => {
    const office = await readTheOfficesId(officeRequest, { api: context.api })
    verifyNoticeReply({ status: prior.replayed ? 200 : 201, body: JSON.stringify(prior), cut: false, location: null }, context.before, context.caller?.project, office, contract)
    return office
  }
  if (request.stage !== 'after' || request.sendId !== context.afterSendId || !isDeepStrictEqual(request.before, prior.original) ||
      !isDeepStrictEqual(request.outcome, contract.outcomeFor(kept.result, context.before.announcement.evidence, context.serving))) fail('The retained AFTER request differs from the final outcome and original BEFORE.')
  const filed = rows.filter(row => row.step === 'after-filed').at(-1)
  if (filed) {
    const office = await officeAndPrior()
    verifyNoticeReply({ status: filed.receipt.replayed ? 200 : 201, body: JSON.stringify(filed.receipt), cut: false, location: null }, request, context.caller?.project, office, contract)
    return { ...kept.result, notices: { state: 'filed', journal: path, before: prior.original, after: filed.receipt.original } }
  }
  try {
    append(path, { step: 'after-lookup', caller: identityOf(officeRequest), sendId: request.sendId })
    const lookup = await officeRequest({ method: 'GET', path: `/api/office/upgrades?sendId=${encodeURIComponent(request.sendId)}&limit=1` }, { api: context.api })
    if (!lookup || lookup.status !== 200 || lookup.cut !== false || lookup.location !== null) fail('The original delivery lookup was refused, redirected, cut or unavailable.')
    const found = contract.lookupSchema.parse(JSON.parse(lookup.body))
    const office = await officeAndPrior()
    if (found.notice !== null) {
      const receipt = verifyNoticeReply({ status: 200, cut: false, location: null, body: JSON.stringify(found.notice) }, request, context.caller?.project, office, contract)
      append(path, { step: 'after-filed', receipt, reconciled: true, caller: identityOf(officeRequest) })
      return { ...kept.result, notices: { state: 'filed', journal: path, before: prior.original, after: receipt.original } }
    }
    // An intervening upgrade or a lost service cannot be called completed by an old retry.
    if (request.outcome.state === contract.successState) await verifyService(context.serving)
    append(path, { step: 'after-attempt', payload: kept.payload, sha256Base64: kept.sha256Base64, caller: identityOf(officeRequest) })
    const receipt = verifyNoticeReply(await officeRequest({ method: 'POST', path: NOTICE_PATH, body: JSON.parse(kept.payload) }, { api: context.api }), request, context.caller?.project, office, contract)
    append(path, { step: 'after-filed', receipt })
    return { ...kept.result, notices: { state: 'filed', journal: path, before: prior.original, after: receipt.original } }
  } catch (error) {
    try { append(path, { step: 'after-unconfirmed', error: String(error.message ?? error) }) } catch { /* The immutable pending request remains available for inspection. */ }
    return pending(kept.result, path, error, contract)
  }
}

/** Only reads delivery metadata; the retry itself validates its pinned outcome and caller. */
export function noticeRetryTimeout(path) {
  const fd = openJournal(path)
  try { return JSON.parse(readFileSync(fd, 'utf8').split('\n')[0]).context.timeoutMs } finally { closeSync(fd) }
}

/** Ordinary delivery is the default; a first handoff supplies its separate strict contract. */
const upgradeNoticeContract = { requestSchema: stableUpgradeNoticeRequestSchema, resultSchema: stableUpgradeNoticeResultSchema,
  lookupSchema: stableUpgradeNoticeLookupResultSchema, outcomeFor, successState: 'completed', afterFields: {}, beforeText: a => a.notice }

/** An emergency release's notices are version 4. Its completed AFTER names no receipt, because none was read. */
function emergencyOutcomeFor(result, _evidence, serving) {
  if (result.state === 'published') return { state: 'completed', ...theCount(result), verification: { result: 'completed', serving } }
  return outcomeFor(result, undefined, serving)
}

/** The AFTER outcome a published upgrade with this count would send. The upgrade asks the candidate's contract to take it. */
export function completedOutcome(emergency, untranslatedWords, evidence, serving) {
  return (emergency ? emergencyNoticeContract : upgradeNoticeContract).outcomeFor({ state: 'published', untranslatedWords }, evidence, serving)
}
const emergencyResultSchema = stableUpgradeNoticeResultSchema.extend({ event: stableEmergencyNoticeEventSchema })
export const emergencyNoticeContract = { requestSchema: stableEmergencyNoticeRequestSchema, resultSchema: emergencyResultSchema,
  lookupSchema: stableUpgradeNoticeLookupResultSchema.extend({ notice: emergencyResultSchema.nullable() }), outcomeFor: emergencyOutcomeFor,
  successState: 'completed', afterFields: { kind: 'emergency' }, beforeText: stableEmergencyBeforeText }
