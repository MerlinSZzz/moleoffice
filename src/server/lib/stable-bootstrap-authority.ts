// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isDeepStrictEqual as same } from 'node:util'
import {
  STABLE_BOOTSTRAP_PREPARED_BODY, STABLE_BOOTSTRAP_PREPARED_TITLE, stableBootstrapPreparedSchema,
  stableBootstrapStopAuthorityRequestSchema, stableBootstrapStopScopeSchema, stableBootstrapEvidenceWaiverSchema,
  type StableBootstrapEvidence, type StableBootstrapStopAuthorityRequest, type StableBootstrapStopAuthorityResult,
  dataFolderMoveStopScopeSchema, dataFolderMoveAuthorityRequestSchema, dataFolderMoveAuthorityLookupSchema, dataFolderMoveAuthorityOutcomeSchema,
  type DataFolderMoveStopScope,
  dataFolderMoveNoticeRequestSchema, dataFolderMoveNoticeEventSchema, dataFolderMoveBeforeText, dataFolderMoveAfterText,
} from '@shared/stable-bootstrap-notices.ts'
import type { StableUpgradeOriginal } from '@shared/stable-upgrade-notices.ts'
import type { BOOTSTRAP_STOP_REFUSAL_CODES } from '@shared/refusal-codes.ts'
import { nowStamp, theClockZone, uniqueMomentOfStoredStampInZone } from '@shared/time.ts'
import { readWarrant, warrantAsStored } from '@shared/warrant.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'
import { moleOffice } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { asStableUpgradeNoticeDoor, createRecord, everyAgentAStoredStampCouldName, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { enWave13q } from '@shared/words/en-wave-13q.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { writeASystemLineToOne } from './groups.ts'
import { getRevisionRow } from './get-revision-row.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theRoleCards } from './roles.ts'
import { theOfficeOwner } from '../db/the-office-owner.ts'
import { theCitedPlaceExists } from '../db/the-cited-place-exists.ts'
import { whyTheCitedPlaceMayNotBeCited } from './why-the-cited-place-may-not-be-cited.ts'
import { versionOf } from './version.ts'
import { authoredCreate, originalBootstrapReservation, receipt, requireAuthenticatedWriter } from './stable-upgrade-notices.ts'

export function failBootstrapStopAuthority(code: keyof typeof BOOTSTRAP_STOP_REFUSAL_CODES, message: string, status = 409): never {
  throw new PanelError(message, status, undefined, undefined, undefined, { code, values: {} })
}
type Revision = ReturnType<typeof getRevisionRow>
type Code = keyof typeof BOOTSTRAP_STOP_REFUSAL_CODES
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The pin identifies original content; editable current placement/provenance is checked separately. */
function original(pin: StableUpgradeOriginal, kind: 'note' | 'decision', project: string, code: Code): Revision {
  let row: Revision
  try { row = getRevisionRow(pin.id, 1) } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return failBootstrapStopAuthority(code, code === 'dataMoveDecisionRefused' ? enWave13q['server.dataMoveDecisionRefused'] : 'The pinned original first handoff authority record is missing.')
  }
  const current = sqlite.prepare('SELECT kind, workspace_id, origin, deleted_at FROM records WHERE id=?').get(pin.id) as {
    kind: string; workspace_id: string; origin: string | null; deleted_at: string | null
  } | undefined
  const content = { kind: row.kind, title: row.title, summary: row.summary, data: row.data, deletedAt: row.deletedAt }
  const author = everyAgentAStoredStampCouldName(row.actorId)
  if (current?.kind !== kind || current.workspace_id !== project || current.origin !== 'authored' || current.deleted_at !== null ||
      !authoredCreate(row) || row.workspaceId !== project || row.kind !== kind || row.contentHash !== pin.contentHash ||
      versionOf({ ...content, kind }) !== pin.contentHash || author.length !== 1 ||
      (row.provedHolder !== null && (row.provedHolder.how !== 'an-agent-key' || row.provedHolder.id !== author[0]!.id))) {
    failBootstrapStopAuthority(code, code === 'dataMoveDecisionRefused' ? enWave13q['server.dataMoveDecisionRefused'] : 'First handoff authority needs a matching authored original creation pin in this project, with its authenticated agent provenance.')
  }
  return row
}

/** The original decision is the actual owner's, filed by an unretired secretary and never revoked. */
function ownerFiledDecision(pin: StableUpgradeOriginal, project: string, code: Code): Revision {
  const decision = original(pin, 'decision', project, code)
  const author = everyAgentAStoredStampCouldName(decision.actorId)[0]!
  const secretary = readParticipant({ kind: 'agent', id: author.id }) as RegisteredAgent | null
  if (secretary === null || secretary.retired === true || secretary.role !== theRoleCards().elevation.onlyThisCardCanHoldIt ||
      decision.data['decided_by'] !== theOfficeOwner().id || decision.data['authority'] !== 'the owner said so' || sqlite.prepare('SELECT 1 FROM revisions WHERE record_id=? AND revokes_seq=1 LIMIT 1').get(decision.recordId)) {
    return failBootstrapStopAuthority(code, 'The original decision must be an unrevoked secretary filing of the actual office owner\'s decision.')
  }
  return decision
}

/** The decision was filed directly, not promoted, with a warrant for its original title that cites the owner's recorded words. */
function directOwnerWarrant(decision: Revision, code: Code): NonNullable<ReturnType<typeof readWarrant>['warrant']> {
  const stored = warrantAsStored(decision.warrant)
  const promoted = sqlite.prepare("SELECT 1 FROM links l JOIN records r ON r.id=l.to_id WHERE l.from_id=? AND l.type=? AND r.kind='proposal' LIMIT 1").get(decision.recordId, RESOLVES_PROPOSAL)
  if (stored === null || !stored.for.includes(decision.title) || promoted !== undefined) {
    return failBootstrapStopAuthority(code, 'First handoff authority supports a directly filed decision with a warrant for its original creation title. Promoted decisions are not supported.')
  }
  const warranted = readWarrant(JSON.parse(decision.warrant!), { knownPerson: theOfficeOwner().id, now: nowStamp(), actingOn: decision.title,
    placeExists: theCitedPlaceExists, whyThePlaceMayNotBeCited: whyTheCitedPlaceMayNotBeCited })
  if (warranted.warrant === undefined || !/^(message|comment):/.test(warranted.warrant.where)) {
    return failBootstrapStopAuthority(code, warranted.refusal ?? 'The decision\'s warrant must cite the original recorded owner message or comment.')
  }
  return warranted.warrant
}

/**
 * What a first handoff's evidence establishes: the development repository whose target commit and tree it covers. A
 * receipt must be green for them. An owner decision must be a direct owner decision whose original
 * extra.stableBootstrapEvidence names them; it stands for the receipt and asserts no suite result.
 */
export function bootstrapEvidence(a: { evidence: StableBootstrapEvidence; tree: string; toCommit: string }, project: string): { repository: string } {
  if (!('kind' in a.evidence)) return receipt({ evidence: a.evidence, tree: a.tree, toCommit: a.toCommit }, project)
  const decision = ownerFiledDecision(a.evidence.decision, project, 'bootstrapStopPreparedRefused')
  const extra = decision.data['extra']
  const waiver = stableBootstrapEvidenceWaiverSchema.safeParse(object(extra) ? extra['stableBootstrapEvidence'] : undefined)
  if (!waiver.success || waiver.data.commit !== a.toCommit || waiver.data.tree !== a.tree) {
    return failBootstrapStopAuthority('bootstrapStopPreparedRefused', 'The original owner decision does not name this first handoff\'s commit and tree.')
  }
  directOwnerWarrant(decision, 'bootstrapStopPreparedRefused')
  return { repository: waiver.data.repository }
}

/** This read checks authority; only the existing notice transaction can reserve it. */
export function verifyBootstrapStopAuthority(project: string, input: unknown, actor: Actor, expectedEvidence?: StableBootstrapEvidence): StableBootstrapStopAuthorityResult {
  const parsed = stableBootstrapStopAuthorityRequestSchema.safeParse(input)
  if (!parsed.success) return failBootstrapStopAuthority('bootstrapStopShapeRefused', 'Stop authority needs the declared strict scope, original pins, digest and send id.', 400)
  const request = parsed.data
  try { requireAuthenticatedWriter(project, actor) } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return failBootstrapStopAuthority('bootstrapStopCallerRefused', error.message, error.status)
  }
  const caller = { agent: participantForActor(actor)!.id, run: actor.sessionId! }
  const prepared = original(request.authority.prepared, 'note', project, 'bootstrapStopPreparedRefused')
  const preparedExtra = prepared.data['extra']
  const preparation = stableBootstrapPreparedSchema.safeParse(object(preparedExtra) ? preparedExtra['stableBootstrapPrepared'] : undefined)
  if (!preparation.success || prepared.title !== STABLE_BOOTSTRAP_PREPARED_TITLE || prepared.data['body'] !== STABLE_BOOTSTRAP_PREPARED_BODY) {
    return failBootstrapStopAuthority('bootstrapStopPreparedRefused', 'The original prepared note does not carry the exact declared preparation event.')
  }
  if (!same(preparation.data.scope, request.scope) || preparation.data.stateSha256Base64 !== request.authority.stateSha256Base64) {
    return failBootstrapStopAuthority('bootstrapStopScopeRefused', 'The original preparation scope or state digest differs from this first handoff.')
  }
  if (expectedEvidence !== undefined && !same(preparation.data.evidence, expectedEvidence)) {
    return failBootstrapStopAuthority('bootstrapStopPreparedRefused', 'The announcement must retain the original evidence pinned by preparation.')
  }
  let green: { repository: string }
  try { green = bootstrapEvidence({ toCommit: request.scope.to.commit, tree: request.scope.tree, evidence: preparation.data.evidence }, project) } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return failBootstrapStopAuthority('bootstrapStopPreparedRefused', error.message, error.status)
  }
  if (green.repository !== request.scope.from.repository) {
    return failBootstrapStopAuthority('bootstrapStopPreparedRefused', 'The prepared original evidence names a different development repository.')
  }
  const decision = ownerFiledDecision(request.authority.decision, project, 'bootstrapStopDecisionRefused')
  const extra = decision.data['extra']
  const scope = stableBootstrapStopScopeSchema.safeParse(object(extra) ? extra['stableBootstrapStop'] : undefined)
  if (!scope.success || !same(scope.data, request.scope)) {
    return failBootstrapStopAuthority('bootstrapStopScopeRefused', 'The original decision does not name this exact first handoff stop scope.')
  }
  const warrant = directOwnerWarrant(decision, 'bootstrapStopWarrantRefused')
  const zone = theClockZone()
  const preparedAt = uniqueMomentOfStoredStampInZone(prepared.at, zone)
  const warrantedAt = uniqueMomentOfStoredStampInZone(warrant.when, zone)
  if (preparedAt === null || warrantedAt === null || warrantedAt <= preparedAt || warrantedAt > Date.now()) {
    return failBootstrapStopAuthority('bootstrapStopTimeRefused', enWave13q['server.bootstrapStopTimeRefused'])
  }
  const reservation = originalBootstrapReservation(project, request.authority)
  const state = reservation === null ? 'available' : reservation.outcome === null ? 'reserved' : 'consumed'
  if (request.expectedBefore !== undefined && (reservation === null || state !== 'reserved' || reservation.outcome !== null ||
      !same(request.expectedBefore, reservation.before) || reservation.sendId !== request.sendId ||
      !same(reservation.scope, request.scope) || !same(reservation.authority, request.authority) || !same(reservation.initiator, caller))) {
    return failBootstrapStopAuthority('bootstrapStopReservationRefused', 'Only the same original initiating agent and run may recheck its exact pending BEFORE before stopping.')
  }
  return { ...request, state, preparedAt: prepared.at, warrantWhen: warrant.when, caller,
    initiator: reservation?.initiator ?? null, reservation: reservation?.before ?? null, outcome: reservation?.outcome ?? null }
}

/** Called inside the notice transaction, after validation and before its single system message write. */
export function validateBootstrapStopAuthority(project: string, request: StableBootstrapStopAuthorityRequest, actor: Actor, evidence: StableBootstrapEvidence): void {
  const result = verifyBootstrapStopAuthority(project, request, actor, evidence)
  if (result.state !== 'available' || request.expectedBefore !== undefined) {
    failBootstrapStopAuthority('bootstrapStopReservationRefused', 'The original decision or prepared event already belongs to a first handoff attempt. Reconcile that attempt; a new execution needs fresh preparation and owner words.')
  }
}

type MoveRequest = { scope: DataFolderMoveStopScope; decision: StableUpgradeOriginal; sendId?: string }
const movePin = (row: NonNullable<Revision>): StableUpgradeOriginal => ({ id: row.recordId, seq: 1, contentHash: row.contentHash })

function moveCaller(project: string, actor: Actor) {
  try { requireAuthenticatedWriter(project, actor) } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return failBootstrapStopAuthority('dataMoveCallerRefused', enWave13q['server.dataMoveCallerRefused'], error.status)
  }
  return { agent: participantForActor(actor)!.id, run: actor.sessionId! }
}

function moveDecision(project: string, request: MoveRequest) {
  const decision = original(request.decision, 'decision', project, 'dataMoveDecisionRefused')
  const author = everyAgentAStoredStampCouldName(decision.actorId)[0]!
  const secretary = readParticipant({ kind: 'agent', id: author.id }) as RegisteredAgent | null
  const owner = theOfficeOwner()
  if (secretary === null || secretary.retired === true || secretary.role !== theRoleCards().elevation.onlyThisCardCanHoldIt ||
      decision.data['decided_by'] !== owner.id || decision.data['authority'] !== 'the owner said so' ||
      sqlite.prepare('SELECT 1 FROM revisions WHERE record_id=? AND revokes_seq=1 LIMIT 1').get(decision.recordId)) {
    return failBootstrapStopAuthority('dataMoveDecisionRefused', enWave13q['server.dataMoveDecisionRefused'])
  }
  const extra = decision.data['extra']
  const scope = dataFolderMoveStopScopeSchema.safeParse(object(extra) ? extra['stableBootstrapStop'] : undefined)
  if (!scope.success || !same(scope.data, request.scope)) return failBootstrapStopAuthority('dataMoveScopeRefused', enWave13q['server.dataMoveScopeRefused'])
  const stored = warrantAsStored(decision.warrant)
  const promoted = sqlite.prepare("SELECT 1 FROM links l JOIN records r ON r.id=l.to_id WHERE l.from_id=? AND l.type=? AND r.kind='proposal' LIMIT 1").get(decision.recordId, RESOLVES_PROPOSAL)
  if (stored === null || !stored.for.includes(decision.title) || promoted !== undefined) return failBootstrapStopAuthority('dataMoveWarrantRefused', enWave13q['server.dataMoveWarrantRefused'])
  const warranted = readWarrant(JSON.parse(decision.warrant!), { knownPerson: owner.id, now: nowStamp(), actingOn: decision.title,
    placeExists: theCitedPlaceExists, whyThePlaceMayNotBeCited: whyTheCitedPlaceMayNotBeCited })
  if (warranted.warrant === undefined || !/^(message|comment):/.test(warranted.warrant.where)) return failBootstrapStopAuthority('dataMoveWarrantRefused', enWave13q['server.dataMoveWarrantRefused'])
  return decision
}

function moveReservation(project: string, decision: StableUpgradeOriginal) {
  const rows = sqlite.prepare("SELECT record_id FROM revisions WHERE workspace_id=? AND seq=1 AND kind='note' AND json_extract(data, '$.extra.dataFolderMoveReservation.decision.id')=?").all(project, decision.id) as { record_id: string }[]
  if (rows.length > 1) return failBootstrapStopAuthority('dataMoveReservationRefused', enWave13q['server.dataMoveReservationRefused'])
  if (!rows[0]) return null
  const row = getRevisionRow(rows[0].record_id, 1)
  const extra = row.data['extra']
  const event = object(extra) ? extra['dataFolderMoveReservation'] : null
  const parsed = dataFolderMoveAuthorityRequestSchema.safeParse(event)
  const writers = everyAgentAStoredStampCouldName(row.actorId)
  if (!parsed.success || !authoredCreate(row) || writers.length !== 1 || row.sessionId === null || !same(parsed.data.decision, decision)) {
    return failBootstrapStopAuthority('dataMoveReservationRefused', enWave13q['server.dataMoveReservationRefused'])
  }
  const pin = movePin(row), initiator = { agent: writers[0]!.id, run: row.sessionId }
  const endings = sqlite.prepare("SELECT record_id FROM revisions WHERE workspace_id=? AND seq=1 AND kind='note' AND json_extract(data, '$.extra.dataFolderMoveOutcome.reservation.id')=? LIMIT 2").all(project, pin.id) as { record_id: string }[]
  if (endings.length > 1) return failBootstrapStopAuthority('dataMoveReservationRefused', enWave13q['server.dataMoveReservationRefused'])
  let outcomeState: string | null = null
  if (endings[0]) {
    const ending = getRevisionRow(endings[0].record_id, 1), extra = ending.data['extra'] as Record<string, unknown>
    const outcome = dataFolderMoveAuthorityOutcomeSchema.safeParse(extra?.['dataFolderMoveOutcome'])
    const endingWriters = everyAgentAStoredStampCouldName(ending.actorId)
    if (!outcome.success || !authoredCreate(ending) || !same(outcome.data.reservation, pin) ||
        !same(outcome.data.decision, decision) || !same(outcome.data.scope, parsed.data.scope) || outcome.data.sendId !== parsed.data.sendId ||
        endingWriters.length !== 1 || endingWriters[0]!.id !== initiator.agent || ending.sessionId !== initiator.run) {
      return failBootstrapStopAuthority('dataMoveReservationRefused', enWave13q['server.dataMoveReservationRefused'])
    }
    outcomeState = outcome.data.outcome
  }
  return { pin, request: parsed.data, initiator, consumed: endings.length === 1, outcome: outcomeState }
}

/** Target-only discovery returns original creation content, never the current editable scope. */
export function readDataFolderMoveAuthority(project: string, input: unknown, actor: Actor) {
  const caller = moveCaller(project, actor)
  const lookup = dataFolderMoveAuthorityLookupSchema.safeParse(input)
  let request: MoveRequest
  if (lookup.success) {
    const rows = sqlite.prepare("SELECT r.record_id FROM revisions r JOIN records c ON c.id=r.record_id WHERE r.workspace_id=? AND r.seq=1 AND r.kind='decision' AND c.deleted_at IS NULL AND c.kind='decision' AND json_extract(r.data, '$.extra.stableBootstrapStop.action')='stop-to-move-the-data-folder' AND json_extract(r.data, '$.extra.stableBootstrapStop.targetFolder')=? AND NOT EXISTS(SELECT 1 FROM revisions v WHERE v.record_id=r.record_id AND v.revokes_seq=1)").all(project, lookup.data.targetFolder) as { record_id: string }[]
    const unused: { row: NonNullable<Revision>; pin: StableUpgradeOriginal }[] = []
    for (const found of rows) {
      const row = getRevisionRow(found.record_id, 1), pin = movePin(row)
      if (moveReservation(project, pin)?.consumed) continue
      unused.push({ row, pin })
    }
    if (!unused.length) return failBootstrapStopAuthority('dataMoveActMissing', enWave13q['server.dataMoveActMissing'])
    if (unused.length !== 1) return failBootstrapStopAuthority('dataMoveActAmbiguous', enWave13q['server.dataMoveActAmbiguous'])
    const { row, pin } = unused[0]!, extra = row.data['extra'] as Record<string, unknown>
    const scope = dataFolderMoveStopScopeSchema.safeParse(extra['stableBootstrapStop'])
    if (!scope.success) return failBootstrapStopAuthority('dataMoveShapeRefused', enWave13q['server.dataMoveShapeRefused'], 400)
    request = { scope: scope.data, decision: pin }
  } else {
    const parsed = dataFolderMoveAuthorityRequestSchema.safeParse(input)
    if (!parsed.success) return failBootstrapStopAuthority('dataMoveShapeRefused', enWave13q['server.dataMoveShapeRefused'], 400)
    request = parsed.data
  }
  moveDecision(project, request)
  const reservation = moveReservation(project, request.decision)
  return { ...request, state: reservation === null ? 'available' as const : reservation.consumed ? 'consumed' as const : 'reserved' as const,
    reservation: reservation?.pin ?? null, caller, initiator: reservation?.initiator ?? null }
}

/** The note's original creation is the reservation, written once in this transaction. */
export function reserveDataFolderMoveAuthority(project: string, input: unknown, actor: Actor) {
  const ending = dataFolderMoveAuthorityOutcomeSchema.safeParse(input)
  if (ending.success) return sqlite.transaction(() => {
    const { reservation, outcome, ...request } = ending.data
    const checked = readDataFolderMoveAuthority(project, request, actor)
    if (checked.state !== 'reserved' || !same(checked.reservation, reservation) || !same(checked.caller, checked.initiator) ||
        moveReservation(project, request.decision)?.request.sendId !== request.sendId) return failBootstrapStopAuthority('dataMoveReservationRefused', enWave13q['server.dataMoveReservationRefused'])
    createRecord({ workspaceId: project, kind: 'note', title: enWave13q['move.consumed'],
      data: { body: enWave13q['move.consumed'], extra: { dataFolderMoveOutcome: ending.data } }, actor })
    void outcome
    return readDataFolderMoveAuthority(project, request, actor)
  })()
  const parsed = dataFolderMoveAuthorityRequestSchema.safeParse(input)
  if (!parsed.success) return failBootstrapStopAuthority('dataMoveShapeRefused', enWave13q['server.dataMoveShapeRefused'], 400)
  return sqlite.transaction(() => {
    const checked = readDataFolderMoveAuthority(project, parsed.data, actor)
    if (checked.state !== 'available') return failBootstrapStopAuthority('dataMoveReservationRefused', enWave13q['server.dataMoveReservationRefused'])
    createRecord({ workspaceId: project, kind: 'note', title: enWave13q['move.reserved'],
      data: { body: enWave13q['move.reserved'], extra: { dataFolderMoveReservation: parsed.data } }, actor })
    return readDataFolderMoveAuthority(project, parsed.data, actor)
  })()
}

const noticeRefusal = (): never => failBootstrapStopAuthority('dataMoveNoticeRefused', enWave13q['server.dataMoveNoticeRefused'])
function moveNoticeOriginal(id: string, project: string) {
  let row: Revision
  try { row = getRevisionRow(id, 1) } catch { return noticeRefusal() }
  const extra = row.data['extra'] as Record<string, unknown> | undefined
  const parsed = dataFolderMoveNoticeEventSchema.safeParse(extra?.['stableUpgradeNotice'])
  const content = { kind: 'message' as const, title: row.title, summary: row.summary, data: row.data, deletedAt: row.deletedAt }
  const sender = row.data['sentBy'] as Record<string, unknown> | undefined, to = row.data['to'] as { kind: string; id: string }[] | undefined
  if (!parsed.success || !authoredCreate(row) || row.kind !== 'message' || row.workspaceId !== project || parsed.data.project !== project ||
      versionOf(content) !== row.contentHash || sender?.['kind'] !== 'agent' || sender?.['id'] !== moleOffice().id || row.data['notice'] !== 'stableUpgradeNotice' ||
      !Array.isArray(to) || to.length !== 1 || to[0]?.kind !== 'person') return noticeRefusal()
  const request = parsed.data.request
  if (row.data['body'] !== (request.stage === 'before' ? dataFolderMoveBeforeText(request.announcement.scope) : dataFolderMoveAfterText(request.outcome))) return noticeRefusal()
  return { row, event: parsed.data, original: movePin(row), content }
}
function moveNoticeWriter(row: Revision, caller: { agent: string; run: string }) {
  const authors = everyAgentAStoredStampCouldName(row.actorId)
  if (authors.length !== 1 || authors[0]!.id !== caller.agent || row.sessionId !== caller.run) noticeRefusal()
}
export function lookupDataFolderMoveNotice(project: string, sendId: string, actor: Actor) {
  const caller = moveCaller(project, actor)
  const rows = sqlite.prepare("SELECT record_id FROM revisions WHERE seq=1 AND kind='message' AND json_extract(data,'$.extra.stableUpgradeNotice.version')=3 AND json_extract(data,'$.extra.stableUpgradeNotice.project')=? AND json_extract(data,'$.extra.stableUpgradeNotice.request.sendId')=? LIMIT 2").all(project, sendId) as { record_id: string }[]
  if (!rows.length) return null
  if (rows.length !== 1) return noticeRefusal()
  const saved = moveNoticeOriginal(rows[0]!.record_id, project); moveNoticeWriter(saved.row, caller)
  return { notice: { original: saved.original, event: saved.event, content: saved.content, replayed: true } }
}
export function dataFolderMoveNoticeForOwner(id: string, project: string, owner: string): boolean {
  const saved = moveNoticeOriginal(id, project)
  return (saved.row.data['to'] as { id: string }[])[0]?.id === owner
}

/** Validate every field before the single system message write; exact retries retain the original. */
export function fileDataFolderMoveNotice(project: string, input: unknown, actor: Actor, identity: () => { database: string; repository: string; port: number }) {
  const parsed = dataFolderMoveNoticeRequestSchema.safeParse(input)
  if (!parsed.success) return noticeRefusal()
  const request = parsed.data, caller = moveCaller(project, actor)
  return sqlite.transaction(() => {
    const found = lookupDataFolderMoveNotice(project, request.sendId, actor)
    if (found) { if (!same(found.notice.event.request, request)) return noticeRefusal(); return found.notice }
    if (sqlite.prepare("SELECT 1 FROM revisions WHERE seq=1 AND kind='message' AND json_extract(data,'$.extra.stableUpgradeNotice.project')=? AND json_extract(data,'$.extra.stableUpgradeNotice.request.sendId')=? LIMIT 1").get(project, request.sendId)) return noticeRefusal()
    let text: string
    if (request.stage === 'before') {
      const a = request.announcement
      const checked = readDataFolderMoveAuthority(project, { scope: a.scope, decision: a.decision, sendId: a.moveSendId }, actor)
      if (checked.state !== 'reserved' || !same(checked.initiator, caller) || !same(checked.reservation, a.reservation) || !same(a.evidence, a.decision)) return noticeRefusal()
      const at = identity()
      if (at.database !== a.scope.database || at.repository !== a.scope.checkout || at.port !== a.scope.port) return noticeRefusal()
      text = dataFolderMoveBeforeText(a.scope)
      if (a.notice !== text) return noticeRefusal()
    } else {
      const before = moveNoticeOriginal(request.before.id, project); moveNoticeWriter(before.row, caller)
      if (!same(before.original, request.before) || before.event.request.stage !== 'before') return noticeRefusal()
      if (sqlite.prepare("SELECT 1 FROM revisions WHERE seq=1 AND kind='message' AND json_extract(data,'$.extra.stableUpgradeNotice.project')=? AND json_extract(data,'$.extra.stableUpgradeNotice.request.before.id')=? LIMIT 1").get(project, before.original.id)) return noticeRefusal()
      const a = before.event.request.announcement, reservation = moveReservation(project, a.decision)
      if (!reservation || !same(reservation.pin, a.reservation) || !same(reservation.initiator, caller)) return noticeRefusal()
      const targetDatabase = a.scope.targetFolder + '/' + a.scope.database.split('/').at(-1)
      if (!['not-restored', 'refused'].includes(request.outcome.state) && reservation.outcome !== request.outcome.state) return noticeRefusal()
      if (!['not-restored', 'refused'].includes(request.outcome.state)) {
        const expected = request.outcome.state === 'moved' ? targetDatabase : a.scope.database, at = identity()
        if (request.outcome.database !== expected || at.database !== expected || at.repository !== a.scope.checkout || at.port !== a.scope.port) return noticeRefusal()
      } else if (request.outcome.database !== null && ![a.scope.database, targetDatabase].includes(request.outcome.database)) return noticeRefusal()
      text = dataFolderMoveAfterText(request.outcome)
    }
    const event = { version: 3 as const, project, date: nowStamp(), request }
    const written = asStableUpgradeNoticeDoor(() => writeASystemLineToOne({ kind: 'person', id: theOfficeOwner().id }, project,
      SYSTEM_LINES.stableUpgradeNotice(text), actor, undefined, { stableUpgradeNotice: event }))
    const saved = moveNoticeOriginal(written.id, project)
    return { original: saved.original, event: saved.event, content: saved.content, replayed: false }
  })()
}
