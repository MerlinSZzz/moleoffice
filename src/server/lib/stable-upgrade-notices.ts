// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import type { FastifyInstance } from 'fastify'
import {
  STABLE_UPGRADE_NOTICE_EVENT, STABLE_UPGRADE_HISTORY_LIMIT,
  stableEmergencyBeforeText, stableUpgradeOutcomeText,
  type StableEmergencyAnnouncement, type StableEmergencyHistoryRow, type StableEmergencyNoticeRequest, type StableUpgradeAnnouncement, type StableUpgradeHistoryRow,
  type StableUpgradeNoticeRequest, type StableUpgradeNoticeResult, type StableUpgradeNoticeState, type StableUpgradeOriginal,
} from '@shared/stable-upgrade-notices.ts'
import {
  STABLE_EMERGENCY_GATE, anEmergencyWentIn, stableEmergencyStandingLine, stableEmergencySwitchRowSchema,
  theEmergencyMessageRefusal, theEmergencySwitchRefusal, whatAnEmergencyStillOwes,
  type StableEmergencySwitchRow, type StableEmergencyThrow,
} from '@shared/stable-emergency.ts'
import { bootstrapStopScopeOf, stableOfficeNoticeEventSchema, stableOfficeNoticeRequestSchema, type StableBootstrapAuthorityReference, type StableBootstrapAnnouncement, type StableBootstrapNoticeRequest, type StableOfficeNoticeEvent, type StableOfficeNoticeRequest, type StableOfficeNoticeResult, type StableOfficeHistoryPage, type StableOfficeHistoryRow } from '@shared/stable-bootstrap-notices.ts'
import { bootstrapEvidence, dataFolderMoveNoticeForOwner, failBootstrapStopAuthority, validateBootstrapStopAuthority } from './stable-bootstrap-authority.ts'
import { bootstrapNoticeText, validateBootstrapBefore, validateBootstrapCompletion } from './stable-bootstrap-notices.ts'
import { stableReleaseAuthorizationSchema } from '@shared/stable-release-policy.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { isMoleOffice, moleOffice } from '@shared/participants.ts'
import { nowStamp, theClockZone, uniqueMomentOfStoredStampInZone } from '@shared/time.ts'
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup } from '@shared/disclosure.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptIsGreen } from '@shared/whole-suite-receipt.ts'
import {
  JUDGEMENT_REFUSALS, RECEIPT_JUDGEMENT, receiptJudgementSchema, theFileAProblemKeeps, theJudgementPinIn, whyTheJudgementDoesNotStand,
  type JudgementFacts, type StableReleaseJudgement,
} from '@shared/receipt-judgement.ts'
import { theServingInstall, readTheBuildStamp } from '../../config/settings.mjs'
import { whetherThePageIsTheCommits } from '../../config/build-stamp.mjs'
import { sqlite } from '../db/client.ts'
import { THE_FIRST_UPGRADE_NOTICE_INDEX, theFirstRevisionOfAnUpgradeNotice } from '../db/schema.ts'
import { asStableUpgradeNoticeDoor, everyAgentAStoredStampCouldName, getRecord, sameAgent, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { listRevisions } from './revisions.ts'
import { getRevisionRow } from './get-revision-row.ts'
import { versionOf } from './version.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRoleCards } from './roles.ts'
import { theOfficeOwner } from '../db/the-office-owner.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theEmergencyMessage, theFollowUp, theGateRows, theReport } from './stable/emergency.ts'

/** One page refusal code; the original technical reason stays in the error. */
export function failStableUpgradeHistory(message: string): never {
  throw new PanelError(message, 400, undefined, undefined, undefined, { code: 'upgradeHistoryReadRefused', values: {} })
}

type Revision = ReturnType<typeof getRevisionRow>
const fail = (message: string, status = 400): never => {
  throw new PanelError(message, status)
}
const same = isDeepStrictEqual
const digest = (text: string): string => createHash('sha256').update(text).digest('base64')
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const original = (row: Revision): StableUpgradeOriginal => ({ id: row.recordId, seq: 1, contentHash: row.contentHash })

/** Capture checkout identity while the route is built, before the listener accepts requests. */
export function captureStableUpgradeIdentity(app: FastifyInstance, webDir: string) {
  let startup: ReturnType<typeof theServingInstall> | null
  try { startup = theServingInstall() } catch { startup = null }
  return () => {
    let current: ReturnType<typeof theServingInstall>
    try { current = theServingInstall() } catch { return fail('The serving checkout identity could not be verified.', 409) }
    const bound = app.server.address()
    const built = readTheBuildStamp(webDir)
    if (startup === null || !same(startup, current) || bound === null || typeof bound === 'string' ||
        built.state !== 'read') {
      return fail('The startup checkout, current checkout, built page and listening socket do not establish one serving identity.', 409)
    }
    const page = whetherThePageIsTheCommits(startup.repository, built.commit, startup.commit)
    if (!page.same) return fail(`The built page is not shown to be the page of the serving commit: ${page.why}`, 409)
    return { ...current, database: realpathSync(sqlite.name), port: bound.port }
  }
}
export type StableUpgradeIdentityReader = ReturnType<typeof captureStableUpgradeIdentity>

/** Creation provenance is checked independently of editable current message fields. */
export function authoredCreate(row: Revision): boolean {
  if (row.seq !== 1 || row.op !== 'create' || row.deletedAt !== null || row.actorType !== 'agent' ||
      row.provedBy !== 'an-agent-key' || !row.sessionId || everyAgentAStoredStampCouldName(row.actorId).length !== 1) return false
  const stamp = sqlite.prepare("SELECT origin FROM records WHERE id = ?").get(row.recordId) as { origin: string | null } | undefined
  return stamp?.origin === 'authored'
}

/** What the notice door says of a receipt it does not take, beside what JUDGEMENT_REFUSALS says of a judgement. */
export const RECEIPT_REFUSALS = {
  notGreen: 'The original receipt does not establish a green result for the announced commit and tree.',
  notOfTheCommit: 'The original receipt is not of the announced commit and tree.',
} as const

/**
 * `standIn` is asked only when the receipt is not green for the announced commit and tree: the way back to an emergency release.
 * `judged` names the authorization note. When that note pins a judgement, the receipt goes in only if the judgement stands
 * (wave 13q item 6), and `now` says the decision is still to come, so a delete since the pin and the problems are read as
 * they are now. An AFTER takes the judgement as its BEFORE took it.
 */
export function receipt(a: Pick<StableUpgradeAnnouncement, 'evidence' | 'tree' | 'toCommit'>, project: string, standIn?: () => boolean,
  judged?: { noticeApproval: StableUpgradeAnnouncement['noticeApproval']; now: boolean }): ReturnType<typeof parseWholeSuiteReceipt> {
  let row: Revision
  try { row = getRevisionRow(a.evidence.id, a.evidence.seq) } catch { return fail('The original upgrade receipt is missing.') }
  if (!authoredCreate(row) || row.workspaceId !== project || row.kind !== 'whole_suite_receipt' || row.contentHash !== a.evidence.contentHash) {
    return fail('The upgrade evidence is not an authored original receipt in this project.')
  }
  let data: ReturnType<typeof parseWholeSuiteReceipt>
  try { data = parseWholeSuiteReceipt(row.data) } catch { return fail('The original upgrade receipt is invalid.') }
  const pinned = judged === undefined ? null : theJudgementPinnedBy(judged.noticeApproval)
  if (pinned !== null) {
    if (data.commit !== a.toCommit || data.tree !== a.tree) fail(RECEIPT_REFUSALS.notOfTheCommit)
    const why = whyTheJudgementDoesNotStand({ pin: pinned.pin, evidence: a.evidence, receipt: row.data },
      theJudgementFacts(pinned.pin, pinned.judge, project, judged!.now))
    if (why !== null) fail(why)
    return data
  }
  if ((!wholeSuiteReceiptIsGreen(data) || data.commit !== a.toCommit || data.tree !== a.tree) && standIn?.() !== true) {
    fail(RECEIPT_REFUSALS.notGreen)
  }
  return data
}

/**
 * The judgement the authorization note pins, and the agent who wrote that note, or null when it pins none. A note that is
 * missing or is another revision is approval's to refuse, so it is read here as pinning nothing.
 */
function theJudgementPinnedBy(noticeApproval: StableUpgradeAnnouncement['noticeApproval']): { pin: StableReleaseJudgement; judge: string | null } | null {
  let note: Revision
  try { note = getRevisionRow(noticeApproval.id, noticeApproval.seq) } catch { return null }
  if (note.contentHash !== noticeApproval.contentHash) return null
  const found = theJudgementPinIn(note.data['extra'])
  if (found === null) return null
  if ('refused' in found) return fail(found.refused)
  const author = note.actorType === 'agent' && note.provedBy === 'an-agent-key' ? everyAgentAStoredStampCouldName(note.actorId) : []
  const judge = author.length === 1 && (note.provedHolder === null || note.provedHolder.id === author[0]!.id) ? author[0]!.id : null
  return { pin: found.pin, judge }
}

/** What this office keeps about a pinned judgement, for the one rule in src/shared/receipt-judgement.ts. */
function theJudgementFacts(pin: StableReleaseJudgement, judge: string | null, project: string, now: boolean): JudgementFacts {
  const current = getRecord(pin.id)
  let row: Revision | null
  try { row = getRevisionRow(pin.id, pin.seq) } catch { row = null }
  const pinned = row === null || row.contentHash !== pin.contentHash || current?.workspaceId !== project ? null : { kind: row.kind, extra: row.data['extra'] }
  const listing = listRevisions(pin.id)
  if (listing.truncated) fail('The judgement has more revisions than this office reads at once, so whether it stands cannot be read.')
  const revisions = listing.revisions.map(one => ({ seq: one.seq, op: one.op, who: one.who, provedBy: one.provedBy, provedHolder: one.provedHolder }))
  if (!now) return { pinned, revisions, judge, now: null }
  const extra = pinned?.extra
  const kept = receiptJudgementSchema.safeParse(object(extra) ? extra[RECEIPT_JUDGEMENT] : undefined)
  const problems = new Map<string, string | null>()
  for (const one of kept.success ? kept.data.verdicts : []) problems.set(one.problem, theFileAProblemKeeps(getRecord(one.problem), project))
  return { pinned, revisions, judge, now: { deleted: current === null || current.deletedAt !== null, problems } }
}

function approval(a: Pick<StableUpgradeAnnouncement, 'notice' | 'noticeApproval'>, project: string): void {
  let row: Revision
  try { row = getRevisionRow(a.noticeApproval.id, a.noticeApproval.seq) } catch { return fail('The secretary notice approval revision is missing.') }
  const author = row.actorType === 'agent' ? everyAgentAStoredStampCouldName(row.actorId) : []
  const participant = author.length === 1 ? readParticipant({ kind: 'agent', id: author[0]!.id }) as RegisteredAgent | null : null
  if (row.kind !== 'note' || row.workspaceId !== project || row.deletedAt !== null || row.contentHash !== a.noticeApproval.contentHash ||
      row.provedBy !== 'an-agent-key' || participant === null ||
      participant.role !== theRoleCards().elevation.onlyThisCardCanHoldIt || participant.retired === true ||
      typeof row.data['body'] !== 'string' || digest(row.data['body']) !== digest(a.notice)) {
    fail('The pinned note revision must be authored by a holder of the secretary card and contain the exact notice text.')
  }
  const created = getRevisionRow(row.recordId, 1)
  if (!authoredCreate(created)) fail('The secretary approval note must have authored creation provenance.')
}

type Announcement = StableUpgradeAnnouncement | StableBootstrapAnnouncement | StableEmergencyAnnouncement
const bootstrapRequest = (request: StableOfficeNoticeRequest): request is StableBootstrapNoticeRequest => 'kind' in request && request.kind === 'first-handoff'
const emergencyRequest = (request: StableOfficeNoticeRequest): request is StableEmergencyNoticeRequest => 'kind' in request && request.kind === 'emergency'
/** Which contract a request is under. An AFTER is taken only under its BEFORE's. */
const kindOf = (request: StableOfficeNoticeRequest) => bootstrapRequest(request) ? 'first-handoff' : emergencyRequest(request) ? 'emergency' : 'upgrade'
function noticeText(request: StableOfficeNoticeRequest, announced: Announcement): string {
  if (bootstrapRequest(request)) return bootstrapNoticeText(request, announced as StableBootstrapAnnouncement)
  if (emergencyRequest(request) && request.stage === 'before') return stableEmergencyBeforeText(announced as StableEmergencyAnnouncement)
  const a = announced as StableUpgradeAnnouncement | StableEmergencyAnnouncement
  return request.stage === 'before' ? a.notice : outcomeText(request, a)
}
interface EventOriginal { row: Revision; event: Exclude<StableOfficeNoticeEvent, { version: 3 }> }
function eventOriginal(row: Revision, project: string): EventOriginal | null {
  const extra = row.data['extra']
  const parsed = stableOfficeNoticeEventSchema.safeParse(object(extra) ? extra[STABLE_UPGRADE_NOTICE_EVENT] : undefined)
  const sender = row.data['sentBy']
  const written = row.data['writtenIn']
  const recipients = row.data['to']
  if (!authoredCreate(row) || row.kind !== 'message' || !parsed.success || parsed.data.version === 3 || parsed.data.project !== project ||
      !object(sender) || sender['kind'] !== 'agent' || typeof sender['id'] !== 'string' || !isMoleOffice({ kind: 'agent', id: sender['id'] }) ||
      row.data['notice'] !== STABLE_UPGRADE_NOTICE_EVENT || !object(written) || written['project'] !== project ||
      !Array.isArray(recipients) || recipients.length !== 1 || !object(recipients[0]) || recipients[0]['kind'] !== 'person' ||
      typeof recipients[0]['id'] !== 'string') return null
  const request = parsed.data.request
  if (parsed.data.version === 2 && versionOf({ kind: row.kind, title: row.title, summary: row.summary, data: row.data, deletedAt: row.deletedAt }) !== row.contentHash) return null
  let announced: Announcement
  if (request.stage === 'before') announced = request.announcement
  else {
    let pinned: Revision
    try { pinned = getRevisionRow(request.before.id, request.before.seq) } catch { return null }
    const bag = pinned.data['extra']
    const parsedBefore = stableOfficeNoticeEventSchema.safeParse(object(bag) ? bag[STABLE_UPGRADE_NOTICE_EVENT] : undefined)
    if (!parsedBefore.success || parsedBefore.data.version === 3 || parsedBefore.data.version !== parsed.data.version || parsedBefore.data.request.stage !== 'before') return null
    const before = eventOriginal(pinned, project)
    if (before === null || pinned.contentHash !== request.before.contentHash) return null
    announced = parsedBefore.data.request.announcement
  }
  let body: string
  try { body = noticeText(request, announced) } catch (error) {
    if (parsed.data.version !== 2 || !(error instanceof PanelError)) throw error
    return failStableUpgradeHistory('The original first handoff notice words could not be verified.')
  }
  if (row.data['body'] !== body) return null
  return { row, event: parsed.data }
}

/** Select the wording from the exact pinned note, so a later edit cannot rewrite a notice. */
function outcomeText(request: Extract<StableUpgradeNoticeRequest | StableEmergencyNoticeRequest, { stage: 'after' }>, announced: StableUpgradeAnnouncement | StableEmergencyAnnouncement): string {
  let pinned: Revision
  try { pinned = getRevisionRow(announced.noticeApproval.id, announced.noticeApproval.seq) } catch { return failStableUpgradeHistory('The pinned release authorization note is missing.') }
  if (pinned.contentHash !== announced.noticeApproval.contentHash) return failStableUpgradeHistory('The release authorization note is not the revision the announcement named.')
  const extra = pinned.data['extra']
  const policy = object(extra) ? extra['stableReleaseAuthorization'] : undefined
  if (policy !== undefined && !stableReleaseAuthorizationSchema.safeParse(policy).success) {
    return failStableUpgradeHistory('The release authorization in the pinned note is not in the expected form.')
  }
  return stableUpgradeOutcomeText(request, announced, policy !== undefined)
}

/**
 * Every lookup asks for at most two originals, so duplicate authority is refused explicitly. The WHERE of migration 0301's
 * index comes first, and SQLite reads that index in the order asked. The index is named: without the name, SQLite picks
 * migration 0326's index of revisions by kind and reads every revision of every message.
 */
function originalsWhere(project: string, clause: string, values: unknown[], strict: boolean | 'bootstrap' = false): EventOriginal[] {
  const found = sqlite.prepare(`SELECT record_id AS id, json_extract(data, '$.extra.stableUpgradeNotice.version') AS version,
    json_extract(data, '$.extra.stableUpgradeNotice.request.kind') AS request_kind FROM revisions INDEXED BY ${THE_FIRST_UPGRADE_NOTICE_INDEX} WHERE ${theFirstRevisionOfAnUpgradeNotice()}
    AND json_extract(data, '$.extra.stableUpgradeNotice.project') = ? AND ${clause} ORDER BY at, record_id LIMIT 2`).all(project, ...values) as { id: string; version: unknown; request_kind: unknown }[]
  return found.flatMap(one => {
    const valid = eventOriginal(getRevisionRow(one.id, 1), project)
    if (valid === null && (strict === true || (strict === 'bootstrap' && (one.version === 2 || one.request_kind === 'first-handoff')))) return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'A matching original reservation event could not be verified. Its outcome is uncertain.')
    return valid === null ? [] : [valid]
  })
}

export function requireAuthenticatedWriter(project: string, actor: Actor): void {
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key' || actor.provedHolder !== undefined || participantForActor(actor) === null || !actor.sessionId) {
    return fail('An upgrade notice needs an authenticated registered agent and its current run.', 403)
  }
  const run = sqlite.prepare('SELECT kind, workspace_id, data, deleted_at FROM records WHERE id = ?').get(actor.sessionId) as {
    kind: string; workspace_id: string; data: string; deleted_at: string | null
  } | undefined
  const data = run === undefined ? null : JSON.parse(run.data) as Record<string, unknown>
  const serving = data?.['servingAgentId'] ?? data?.['servingAgent']
  if (run?.kind !== 'session' || run.workspace_id !== project || run.deleted_at !== null || data?.['state'] !== 'running' ||
      typeof serving !== 'string' || !sameAgent({ actorType: 'agent', actorId: serving }, actor)) {
    fail('The notice caller must name a running session of its own agent in this project.', 403)
  }
}

/** Validate the complete request before the single existing system-message write. */
export function fileStableUpgradeNotice(project: string, input: StableUpgradeNoticeRequest, actor: Actor, readIdentity: StableUpgradeIdentityReader): StableUpgradeNoticeResult
export function fileStableUpgradeNotice(project: string, input: unknown, actor: Actor, readIdentity: StableUpgradeIdentityReader): StableOfficeNoticeResult
export function fileStableUpgradeNotice(project: string, input: unknown, actor: Actor, readIdentity: StableUpgradeIdentityReader): StableOfficeNoticeResult {
  const parsed = stableOfficeNoticeRequestSchema.safeParse(input)
  if (!parsed.success) return fail('The upgrade notice must have the declared strict before or after shape.')
  requireAuthenticatedWriter(project, actor)
  const request = parsed.data
  return sqlite.transaction(() => {
    // THE INDEX OF MIGRATION 0301 IS NAMED, because SQLite did not pick it for a read with no order.
    if (sqlite.prepare(`SELECT 1 FROM revisions INDEXED BY ${THE_FIRST_UPGRADE_NOTICE_INDEX} WHERE ${theFirstRevisionOfAnUpgradeNotice()} AND json_extract(data,'$.extra.stableUpgradeNotice.version')=3 AND json_extract(data,'$.extra.stableUpgradeNotice.project')=? AND json_extract(data,'$.extra.stableUpgradeNotice.request.sendId')=? LIMIT 1`).get(project, request.sendId)) failBootstrapStopAuthority('dataMoveNoticeRefused', 'This send id already belongs to a data-folder move notice.')
    const earlier = originalsWhere(project, "json_extract(data, '$.extra.stableUpgradeNotice.request.sendId') = ?", [request.sendId], bootstrapRequest(request))
    if (earlier.length > 1) return fail('This send id has more than one original notice.', 409)
    if (earlier.length === 1) {
      requireOriginalWriter(earlier[0]!, actor)
      if (!same(earlier[0]!.event.request, request)) return fail('This send id already names a different event or payload.', 409)
      return result(earlier[0]!, true)
    }
    let announced: Announcement
    if (request.stage === 'before') {
      announced = request.announcement
      if (bootstrapRequest(request)) {
        validateBootstrapBefore(request.announcement, project, readIdentity(), { receipt: bootstrapEvidence, approval })
        validateBootstrapStopAuthority(project, { scope: bootstrapStopScopeOf(request.announcement), authority: request.announcement.authority, sendId: request.sendId }, actor, request.announcement.evidence)
      }
      else if (emergencyRequest(request)) {
        if (readIdentity().commit !== request.announcement.fromCommit) return fail('BEFORE does not match the actual serving baseline commit.', 409)
        approval(request.announcement, project)
        letTheEmergencyIn(project, request.announcement, actor)
      }
      else {
        if (readIdentity().commit !== request.announcement.fromCommit) return fail('BEFORE does not match the actual serving baseline commit.', 409)
        const a = request.announcement
        receipt(a, project, () => theWayBackToAnEmergency(project, a), { noticeApproval: a.noticeApproval, now: true })
        approval(a, project)
      }
    } else {
      let before: EventOriginal | null
      try { before = eventOriginal(getRevisionRow(request.before.id, request.before.seq), project) } catch { return fail('The original BEFORE notice is missing.') }
      if (before === null || before.row.contentHash !== request.before.contentHash || before.event.request.stage !== 'before' || kindOf(before.event.request) !== kindOf(request)) {
        return fail('AFTER must name the exact original BEFORE notice in this project.')
      }
      announced = before.event.request.announcement
      requireOriginalWriter(before, actor)
      const existing = bootstrapRequest(request)
        ? originalsWhere(project, "json_extract(data, '$.extra.stableUpgradeNotice.request.before.id') = ?", [request.before.id], true)
        : originalsWhere(project, "json_extract(data, '$.extra.stableUpgradeNotice.request.stage') = 'after' AND json_extract(data, '$.extra.stableUpgradeNotice.request.before.id') = ?", [request.before.id], false)
      if (existing.length !== 0) return fail('This BEFORE notice already has an AFTER outcome.', 409)
      if (bootstrapRequest(request)) {
        if (request.outcome.state === 'handed-off') validateBootstrapCompletion(request, announced as StableBootstrapAnnouncement, project, readIdentity(), { receipt: bootstrapEvidence })
      } else if (emergencyRequest(request)) {
        // An emergency release has no receipt to compare: its completion is the announced commit, serving here.
        const proof = request.outcome.state === 'completed' ? request.outcome.verification : null
        if (proof !== null && (proof.serving.commit !== (announced as StableEmergencyAnnouncement).toCommit || !same(proof.serving, readIdentity()))) {
          return fail('Completion does not match the announced commit and the actual serving identity.', 409)
        }
      } else if (request.outcome.state === 'completed') {
        const announced = before.event.request.announcement as StableUpgradeAnnouncement
        receipt(announced, project, () => theWayBackToAnEmergency(project, announced), { noticeApproval: announced.noticeApproval, now: false })
        const proof = request.outcome.verification
        if (!same(proof.evidence, announced.evidence) || proof.serving.commit !== announced.toCommit || !same(proof.serving, readIdentity())) {
          return fail('Completion does not match the original receipt and actual serving identities.', 409)
        }
      }
    }
    const event: StableOfficeNoticeEvent = bootstrapRequest(request)
      ? { version: 2, project, date: nowStamp(), request }
      : emergencyRequest(request) ? { version: 4, project, date: nowStamp(), request } : { version: 1, project, date: nowStamp(), request }
    const owner = theOfficeOwner()
    const text = noticeText(request, announced)
    const written = asStableUpgradeNoticeDoor(() => writeASystemLineToOne(
      { kind: 'person', id: owner.id }, project, SYSTEM_LINES.stableUpgradeNotice(text), actor,
      undefined, { [STABLE_UPGRADE_NOTICE_EVENT]: event },
    ))
    const saved = eventOriginal(getRevisionRow(written.id, 1), project)
    if (saved === null) throw new Error('The upgrade writer did not preserve its original event.')
    return result(saved, false)
  })()
}

function result(saved: EventOriginal, replayed: boolean): StableOfficeNoticeResult {
  return { original: original(saved.row), event: saved.event, replayed, content: {
    kind: 'message', title: saved.row.title, summary: saved.row.summary, data: saved.row.data, deletedAt: null,
  } }
}

/**
 * THE DOOR'S EMERGENCY CHECK, the second after the release tool's. The note must authorize this release with this
 * message, and the switch, the message and what earlier emergency releases owe are judged by the one shared rule.
 */
function letTheEmergencyIn(project: string, a: StableEmergencyAnnouncement, actor: Actor): void {
  const note = getRevisionRow(a.noticeApproval.id, a.noticeApproval.seq).data['extra']
  if (theJudgementPinIn(note) !== null) fail(JUDGEMENT_REFUSALS.emergency, 409)
  const policy = stableReleaseAuthorizationSchema.safeParse(object(note) ? note['stableReleaseAuthorization'] : undefined)
  if (!policy.success || policy.data.mode !== 'emergency' || !same(policy.data.message, a.emergency.message) ||
      policy.data.candidateTag !== a.candidateTag || policy.data.baselineTag !== a.baselineTag || policy.data.fromCommit !== a.fromCommit ||
      policy.data.toCommit !== a.toCommit || policy.data.tree !== a.tree) {
    fail('The pinned note does not authorize this emergency release with this message.', 409)
  }
  const judged = theEmergencyAsJudged(project, actor, { pin: a.emergency.throw, message: a.emergency.message, commit: a.toCommit })
  if (judged.switched !== null) fail(judged.switched, 409)
  if (judged.told !== null) fail(judged.told, 409)
  for (const one of judged.earlier) {
    const owes = whatAnEmergencyStillOwes({ tag: one.tag, outcome: one.outcome, ...one.emergency })
    if (owes !== null) fail(owes, 409)
  }
}

/**
 * THE SWITCH AND THE MESSAGE, judged by the one shared rule with the facts this office keeps. The notice door asks it
 * for an emergency release, and the emergency push to main (src/server/lib/emergency-push.ts) for a push, so one throw
 * of the switch declares an emergency for both halves (wave 13u round 82). `pin` is the throw a release names; a push
 * names none. `switched` is why the switch lets nothing in, and while it says so the message is not read, so `told` is
 * null. `row` is the switch's row as it was judged.
 */
export function theEmergencyAsJudged(project: string, actor: Actor, asked: { pin?: StableEmergencyThrow; message: StableUpgradeOriginal; commit: string }): {
  row: StableEmergencySwitchRow
  earlier: ReturnType<typeof earlierEmergencies>
  switched: string | null
  told: string | null
} {
  const found = theGateRows(actor, STABLE_EMERGENCY_GATE)
  const row = stableEmergencySwitchRowSchema.safeParse(found.length === 1 ? found[0] : undefined)
  if (!row.success) return fail("The office's gate list row for the emergency switch could not be read.", 409)
  const earlier = earlierEmergencies(project)
  const newestCompleted = theNewestCompletedOrder(project)
  const zone = theClockZone()
  const switched = theEmergencySwitchRefusal(row.data, { ...(asked.pin === undefined ? {} : { pin: asked.pin }), newestCompleted,
    spent: change => earlier.some(one => one.emergency.throw.change === change),
    momentOf: stamp => uniqueMomentOfStoredStampInZone(stamp, zone) })
  if (switched !== null) return { row: row.data, earlier, switched, told: null }
  const message = theEmergencyMessage(asked.message, authoredCreate)
  if (message === 'another-revision') return fail('The pinned revision identity or content hash does not match.', 409)
  const told = theEmergencyMessageRefusal(message, { owner: theOfficeOwner().id,
    commit: asked.commit, newestCompleted, pinned: id => earlier.some(one => one.emergency.message.id === id) })
  return { row: row.data, earlier, switched: null, told }
}

/**
 * Every original emergency BEFORE in this project, oldest first, verified, with its outcome and what it owes worked out
 * now. The index of migration 0301 is named, because SQLite did not pick it.
 */
function earlierEmergencies(project: string): { tag: string; outcome: string; emergency: StableEmergencyHistoryRow['emergency'] }[] {
  const rows = sqlite.prepare(`SELECT record_id AS id FROM revisions INDEXED BY ${THE_FIRST_UPGRADE_NOTICE_INDEX} WHERE ${theFirstRevisionOfAnUpgradeNotice()}
    AND json_extract(data, '$.extra.stableUpgradeNotice.project') = ? AND json_extract(data, '$.extra.stableUpgradeNotice.version') = 4
    AND json_extract(data, '$.extra.stableUpgradeNotice.request.stage') = 'before'
    AND json_extract(data, '$.sentBy.kind') = 'agent' AND json_extract(data, '$.sentBy.id') = ?
    ORDER BY at, record_id`).all(project, moleOffice().id) as { id: string }[]
  return rows.map(({ id }) => {
    const first = eventOriginal(getRevisionRow(id, 1), project)
    if (first === null || first.event.version !== 4 || first.event.request.stage !== 'before') {
      return fail('An earlier emergency release could not be verified, so whether it owes could not be checked.', 409)
    }
    const ending = theEnding(project, first)
    const outcome = ending !== null && ending.event.request.stage === 'after' ? ending.event.request.outcome.state : 'unfinished'
    return { tag: first.event.request.announcement.candidateTag, outcome, emergency: emergencyOf(project, first, outcome) }
  })
}

/**
 * The order of the newest verified completed AFTER in this project, of any kind, or null when none completed. The index of
 * migration 0301 is named, because SQLite did not pick it: it finds the notices, and SQLite sorts those few by the order
 * of their creation.
 */
function theNewestCompletedOrder(project: string): number | null {
  const rows = sqlite.prepare(`SELECT r.record_id AS id, c.append_order AS at FROM revisions r INDEXED BY ${THE_FIRST_UPGRADE_NOTICE_INDEX} JOIN changes c ON c.record_id = r.record_id AND c.op = 'create'
    WHERE ${theFirstRevisionOfAnUpgradeNotice('r')}
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.project') = ?
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.version') IN (1,2,4)
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.request.stage') = 'after'
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.request.outcome.state') IN ('completed','handed-off')
    AND json_extract(r.data, '$.sentBy.kind') = 'agent' AND json_extract(r.data, '$.sentBy.id') = ?
    ORDER BY c.append_order DESC`).all(project, moleOffice().id) as { id: string; at: number }[]
  return rows.find(one => eventOriginal(getRevisionRow(one.id, 1), project) !== null)?.at ?? null
}

/** The follow-up receipt and the report an emergency release owes, worked out now. A release that did not go in owes neither. */
function emergencyOf(project: string, first: EventOriginal, outcome: string): StableEmergencyHistoryRow['emergency'] {
  if (first.event.version !== 4 || first.event.request.stage !== 'before') throw new Error('An emergency row was asked of a BEFORE that is not an emergency release.')
  const a = first.event.request.announcement
  if (!anEmergencyWentIn(outcome)) return { ...a.emergency, followUp: { state: 'not-owed' }, report: { state: 'not-owed' } }
  return { ...a.emergency, followUp: theFollowUp(project, first.row.recordId, a.toCommit, authoredCreate), report: theReport(project, first.row.recordId) }
}

/**
 * THE WAY BACK TO AN EMERGENCY RELEASE. It never had a receipt of its own, so only here its green follow-up receipt
 * stands for one: the release completed under this tag, commit and tree, the announcement names that follow-up as its
 * evidence, and its notice carries the line that says so.
 */
function theWayBackToAnEmergency(project: string, a: Pick<StableUpgradeAnnouncement, 'candidateTag' | 'toCommit' | 'tree' | 'evidence' | 'notice'>): boolean {
  const found = originalsWhere(project, "json_extract(data, '$.extra.stableUpgradeNotice.version') = 4 AND json_extract(data, '$.extra.stableUpgradeNotice.request.stage') = 'before' " +
    "AND json_extract(data, '$.extra.stableUpgradeNotice.request.announcement.candidateTag') = ? AND json_extract(data, '$.extra.stableUpgradeNotice.request.announcement.toCommit') = ? " +
    "AND json_extract(data, '$.extra.stableUpgradeNotice.request.announcement.tree') = ?", [a.candidateTag, a.toCommit, a.tree])
  if (found.length !== 1) return false
  const ending = theEnding(project, found[0]!)
  if (ending === null || ending.event.request.stage !== 'after' || ending.event.request.outcome.state !== 'completed') return false
  const { followUp } = emergencyOf(project, found[0]!, 'completed')
  return followUp.state === 'filed' && followUp.green && same(followUp.receipt, a.evidence) &&
    a.notice.includes(stableEmergencyStandingLine(a.candidateTag, followUp.receipt.id, followUp.commit))
}

/** The one verified original AFTER that ends this BEFORE, or null while it is unfinished. */
function theEnding(project: string, first: EventOriginal): EventOriginal | null {
  const endings = originalsWhere(project, "json_extract(data, '$.extra.stableUpgradeNotice.request.stage') = 'after' AND json_extract(data, '$.extra.stableUpgradeNotice.request.before.id') = ?", [first.row.recordId])
  const last = endings.length === 1 ? endings[0]! : null
  return last?.event.request.stage === 'after' && last.event.version === first.event.version && same(last.event.request.before, original(first.row)) ? last : null
}

function noticeState(one: EventOriginal): StableUpgradeNoticeState {
  const current = sqlite.prepare('SELECT data, deleted_at FROM records WHERE id = ?').get(one.row.recordId) as { data: string; deleted_at: string | null } | undefined
  if (!current) return 'missing'
  if (current.deleted_at !== null) return 'deleted'
  const data = JSON.parse(current.data) as Record<string, unknown>
  return same(data['body'], one.row.data['body']) && same(data['extra'], one.row.data['extra']) ? 'unchanged' : 'changed'
}

/** A cursor pins an original BEFORE and resumes below its creation ledger order. */
export function stableUpgradeHistory(project: string, limit = STABLE_UPGRADE_HISTORY_LIMIT, before?: string): StableOfficeHistoryPage {
  if (!Number.isInteger(limit) || limit < 1 || limit > STABLE_UPGRADE_HISTORY_LIMIT) return failStableUpgradeHistory('Upgrade history takes 1 to 25 rows.')
  let cursor: number | null = null
  if (before !== undefined) {
    try {
      const id = Buffer.from(before, 'base64url').toString('utf8')
      if (Buffer.from(id).toString('base64url') !== before) return failStableUpgradeHistory('The upgrade history cursor is invalid.')
      const found = eventOriginal(getRevisionRow(id, 1), project)
      if (found === null || found.event.request.stage !== 'before') return failStableUpgradeHistory('The upgrade history cursor is not an announcement in this project.')
      const order = sqlite.prepare("SELECT append_order FROM changes WHERE record_id = ? AND op = 'create' LIMIT 1").get(found.row.recordId) as { append_order: number } | undefined
      if (order === undefined) return failStableUpgradeHistory("The upgrade history cursor has no place in the office's order.")
      cursor = order.append_order
    } catch (error) {
      if (error instanceof PanelError && error.code === 'upgradeHistoryReadRefused') throw error
      return failStableUpgradeHistory('The upgrade history cursor is invalid.')
    }
  }
  // THE INDEX OF MIGRATION 0301 IS NAMED, because SQLite did not pick it: it finds the notices, and SQLite sorts those few
  // by the order of their creation.
  const rows = sqlite.prepare(`SELECT r.record_id AS id FROM revisions r INDEXED BY ${THE_FIRST_UPGRADE_NOTICE_INDEX} JOIN changes c ON c.record_id = r.record_id AND c.op = 'create'
    WHERE ${theFirstRevisionOfAnUpgradeNotice('r')}
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.project') = ?
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.request.stage') = 'before'
    AND json_extract(r.data, '$.extra.stableUpgradeNotice.version') IN (1,2,4)
    AND json_extract(r.data, '$.sentBy.kind') = 'agent' AND json_extract(r.data, '$.sentBy.id') = ?
    ${cursor === null ? '' : 'AND c.append_order < ?'} ORDER BY c.append_order DESC LIMIT ?`)
    .all(project, moleOffice().id, ...(cursor === null ? [] : [cursor]), limit + 1) as { id: string }[]
  const candidates = rows.map(row => {
    const one = eventOriginal(getRevisionRow(row.id, 1), project)
    if (one === null || one.event.request.stage !== 'before') return failStableUpgradeHistory('A matched original upgrade announcement could not be verified.')
    return one
  })
  const carried = candidates.slice(0, limit)
  const entries: StableOfficeHistoryRow[] = carried.map(first => {
    if (first.event.request.stage !== 'before') throw new Error('The verified history candidate was not a BEFORE event.')
    const a = first.event.request.announcement
    const after = theEnding(project, first)
    const common = { tag: a.candidateTag, date: first.event.date, outcomeDate: after?.event.date ?? null, tree: a.tree,
      before: original(first.row), after: after === null ? null : original(after.row),
      notices: { before: noticeState(first), after: after === null ? null : noticeState(after) } }
    if (bootstrapRequest(first.event.request)) {
      const announcement = first.event.request.announcement
      const ending = after?.event.version === 2 && after.event.request.stage === 'after' ? after.event.request.outcome : null
      return { ...common, kind: 'first-handoff', baselineTag: null, notice: announcement.notices.before.text,
        fromCommit: announcement.from.commit, toCommit: announcement.to.commit,
        fromRepository: announcement.from.repository, toRepository: announcement.to.repository,
        outcome: ending?.state ?? 'unfinished', reason: ending !== null && ending.state !== 'handed-off' ? ending.reason : null }
    }
    const announcement = first.event.request.announcement as StableUpgradeAnnouncement | StableEmergencyAnnouncement
    const ending = after !== null && after.event.version !== 2 && after.event.request.stage === 'after' && !bootstrapRequest(after.event.request) ? after.event.request.outcome : null
    const outcome: StableUpgradeHistoryRow['outcome'] = ending?.state ?? 'unfinished'
    const row: StableUpgradeHistoryRow = { ...common, baselineTag: announcement.baselineTag, notice: announcement.notice,
      fromCommit: announcement.fromCommit, toCommit: announcement.toCommit,
      outcome, reason: ending !== null && ending.state !== 'completed' ? ending.reason : null }
    return first.event.version === 4 ? { ...row, kind: 'emergency' as const, emergency: emergencyOf(project, first, row.outcome) } : row
  })
  const leftOutGroups: LeftOutGroup<'older'>[] = candidates.length > carried.length ? [{
    cause: 'budget', bucket: 'older', count: candidates.length - carried.length,
    ids: candidates.slice(limit).map(one => one.row.recordId),
  }] : []
  const subtraction: LeftOutCounts = { candidates: candidates.length, carried: entries.length,
    leftOut: candidates.length - entries.length, shortened: 0 }
  checkSubtraction('stableUpgradeHistory bounded window', subtraction, leftOutGroups)
  const oldest = carried.at(-1)
  return { entries, older: candidates.length > limit && oldest ? Buffer.from(oldest.row.recordId).toString('base64url') : null,
    subtraction, leftOutGroups }
}

/** Original agent stamps are compared only with the live authenticated caller. */
function requireOriginalWriter(one: EventOriginal, actor: Actor): void {
  if (!sameAgent({ actorType: 'agent', actorId: one.row.actorId }, actor)) {
    fail('Only the original notice writer may resolve this notice.', 403)
  }
}

export function lookupStableUpgradeNotice(project: string, sendId: string, actor: Actor): { notice: StableOfficeNoticeResult | null } {
  requireAuthenticatedWriter(project, actor)
  const found = originalsWhere(project, "json_extract(data, '$.extra.stableUpgradeNotice.request.sendId') = ?", [sendId], 'bootstrap')
  if (found.length > 1) return fail('This send id has more than one original notice.', 409)
  if (found.length === 0) return { notice: null }
  requireOriginalWriter(found[0]!, actor)
  return { notice: result(found[0]!, true) }
}

/**
 * Contact visibility follows an original addressed notice, without widening any message read. The WHERE of migration
 * 0301's index comes first, and SQLite reads that index backwards from the newest notice. The index is named: without
 * the name, SQLite picks migration 0326's index of revisions by kind and reads every revision of every message.
 */
export function hasOriginalUpgradeNoticeForOwner(owner: string, project?: string): boolean {
  const row = sqlite.prepare(`SELECT record_id AS id, json_extract(data, '$.extra.stableUpgradeNotice.project') AS project,
    json_extract(data, '$.extra.stableUpgradeNotice.version') AS version
    FROM revisions INDEXED BY ${THE_FIRST_UPGRADE_NOTICE_INDEX} WHERE ${theFirstRevisionOfAnUpgradeNotice()}
    AND json_extract(data, '$.sentBy.kind') = 'agent' AND json_extract(data, '$.sentBy.id') = ?
    AND json_extract(data, '$.to[0].kind') = 'person' AND json_extract(data, '$.to[0].id') = ?
    ${project === undefined ? '' : "AND json_extract(data, '$.extra.stableUpgradeNotice.project') = ?"}
    ORDER BY at DESC, record_id DESC LIMIT 1`).get(moleOffice().id, owner, ...(project === undefined ? [] : [project])) as { id: string; project: string; version: number } | undefined
  return row !== undefined && (row.version === 3 ? dataFolderMoveNoticeForOwner(row.id, row.project, owner) : eventOriginal(getRevisionRow(row.id, 1), row.project) !== null)
}

/** Both original pins belong to one attempt; no mutable reservation shadow is kept. */
export function originalBootstrapReservation(project: string, authority: StableBootstrapAuthorityReference) {
  const matches = originalsWhere(project,
    "(json_extract(data, '$.extra.stableUpgradeNotice.request.announcement.authority.decision.id') = ? OR " +
    "json_extract(data, '$.extra.stableUpgradeNotice.request.announcement.authority.prepared.id') = ?)",
    [authority.decision.id, authority.prepared.id], true)
  if (matches.length > 1) return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'More than one original first handoff reserves these pins. The authority is uncertain.')
  const first = matches[0]
  if (first === undefined) return null
  if (first.event.version !== 2 || first.event.request.stage !== 'before') {
    return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'The matching original reservation is not a first handoff BEFORE.')
  }
  const endings = originalsWhere(project,
    "json_extract(data, '$.extra.stableUpgradeNotice.request.before.id') = ?",
    [first.row.recordId], true)
  if (endings.length > 1) return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'The original reservation has more than one outcome. Its use is uncertain.')
  const last = endings[0]
  if (last !== undefined && (last.event.version !== 2 || last.event.request.stage !== 'after' || !same(last.event.request.before, original(first.row)))) {
    return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'The reservation outcome does not pin its exact original first handoff BEFORE.')
  }
  const initiators = everyAgentAStoredStampCouldName(first.row.actorId)
  if (initiators.length !== 1 || first.row.sessionId === null) {
    return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'The original reservation initiator and run could not be verified.')
  }
  return { before: original(first.row), sendId: first.event.request.sendId, scope: bootstrapStopScopeOf(first.event.request.announcement),
    authority: first.event.request.announcement.authority, initiator: { agent: initiators[0]!.id, run: first.row.sessionId },
    outcome: last?.event.version === 2 && last.event.request.stage === 'after' ? last.event.request.outcome.state : null }
}
