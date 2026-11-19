// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import type { FieldSpec, ShapeSpec, ValidationError } from './kinds.ts'
import { enWave13q } from './words/en-wave-13q.ts'
import {
  STABLE_UPGRADE_HISTORY_LIMIT,
  stableUpgradeAnnouncementSchema, stableUpgradeApprovalSchema, stableUpgradeOriginalSchema, stableUpgradeServingSchema,
  stableUpgradeNoticeRequestSchema, stableUpgradeNoticeEventSchema, stableUpgradeNoticeResultSchema,
  stableUpgradeNoticeLookupResultSchema, stableUpgradeHistoryRowSchema, stableUpgradeHistoryPageSchema,
  stableEmergencyNoticeRequestSchema, stableEmergencyNoticeEventSchema, stableEmergencyHistoryRowSchema,
  type StableUpgradeHistoryRow, type StableUpgradeHistoryPage, type StableEmergencyHistoryRow,
} from './stable-upgrade-notices.ts'

export const STABLE_BOOTSTRAP_PUBLIC_REASONS = [
  'First handoff was refused before publication.',
  'First handoff failed and the development service was restored.',
  'First handoff failed and restoration was not verified.',
] as const
const { candidateTag, tree, notice: text } = stableUpgradeAnnouncementSchema.shape
const approvedWords = z.strictObject({ text, approval: stableUpgradeApprovalSchema })
const sameCodeHandoff = (a: { from: z.infer<typeof stableUpgradeServingSchema>; to: z.infer<typeof stableUpgradeServingSchema> }): boolean =>
  a.from.commit === a.to.commit && a.from.repository !== a.to.repository && a.from.database === a.to.database && a.from.port === a.to.port

export const STABLE_BOOTSTRAP_PREPARED_TITLE = 'Stable checkout prepared for first handoff'
export const STABLE_BOOTSTRAP_PREPARED_BODY = 'The stable checkout is prepared for its first handoff. This note records preparation; it records no handoff or service stop.'
export const stableBootstrapHandoffStopScopeSchema = z.strictObject({ version: z.literal(1), action: z.literal('stop-serve-dev-for-first-handoff'),
  candidateTag, tree, from: stableUpgradeServingSchema, to: stableUpgradeServingSchema }).refine(sameCodeHandoff)
export const dataFolderMoveStopScopeSchema = z.strictObject({ version: z.literal(1), action: z.literal('stop-to-move-the-data-folder'),
  database: stableUpgradeServingSchema.shape.database, port: stableUpgradeServingSchema.shape.port,
  checkout: stableUpgradeServingSchema.shape.repository, targetFolder: stableUpgradeServingSchema.shape.repository,
  targetMode: z.literal('700'), backup: z.strictObject({ path: stableUpgradeServingSchema.shape.database,
    sha256: z.string().regex(/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/) }) })
export type DataFolderMoveStopScope = z.infer<typeof dataFolderMoveStopScopeSchema>
export const stableBootstrapStopScopeSchema = z.union([stableBootstrapHandoffStopScopeSchema, dataFolderMoveStopScopeSchema])
export type StableBootstrapStopScope = z.infer<typeof stableBootstrapHandoffStopScopeSchema>
/**
 * What stands for the whole-suite receipt of a first handoff: the receipt's original pin, or the original pin of a
 * direct owner decision whose extra.stableBootstrapEvidence names the same repository, commit and tree.
 */
export const stableBootstrapEvidenceDecisionSchema = z.strictObject({ kind: z.literal('owner-decision'), decision: stableUpgradeOriginalSchema })
export const stableBootstrapEvidenceSchema = z.union([stableUpgradeOriginalSchema, stableBootstrapEvidenceDecisionSchema])
export type StableBootstrapEvidence = z.infer<typeof stableBootstrapEvidenceSchema>
export const stableBootstrapEvidenceWaiverSchema = z.strictObject({ version: z.literal(1), action: z.literal('first-handoff-without-a-whole-suite-receipt'),
  repository: stableUpgradeServingSchema.shape.repository, commit: stableUpgradeServingSchema.shape.commit, tree })
export type StableBootstrapEvidenceWaiver = z.infer<typeof stableBootstrapEvidenceWaiverSchema>
/** Canonical base64 for 32 bytes survives the canonical transport's masking of key-shaped hexadecimal. */
const stateDigest = z.string().regex(/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/)
export const stableBootstrapPreparedSchema = z.strictObject({ version: z.literal(1), scope: stableBootstrapHandoffStopScopeSchema,
  evidence: stableBootstrapEvidenceSchema, stateSha256Base64: stateDigest })
export type StableBootstrapPrepared = z.infer<typeof stableBootstrapPreparedSchema>
export const stableBootstrapAuthorityReferenceSchema = z.strictObject({ prepared: stableUpgradeOriginalSchema,
  decision: stableUpgradeOriginalSchema, stateSha256Base64: stateDigest })
export type StableBootstrapAuthorityReference = z.infer<typeof stableBootstrapAuthorityReferenceSchema>
const sendId = stableUpgradeNoticeRequestSchema.options[0].shape.sendId
export const stableBootstrapStopAuthorityRequestSchema = z.strictObject({ scope: stableBootstrapHandoffStopScopeSchema,
  authority: stableBootstrapAuthorityReferenceSchema, sendId, expectedBefore: stableUpgradeOriginalSchema.optional() })
export type StableBootstrapStopAuthorityRequest = z.infer<typeof stableBootstrapStopAuthorityRequestSchema>
const initiatingRun = z.strictObject({ agent: sendId, run: sendId })
export const dataFolderMoveAuthorityRequestSchema = z.strictObject({ scope: dataFolderMoveStopScopeSchema,
  decision: stableUpgradeOriginalSchema, sendId })
export const dataFolderMoveAuthorityOutcomeSchema = dataFolderMoveAuthorityRequestSchema.extend({
  reservation: stableUpgradeOriginalSchema, outcome: z.enum(['moved', 'restored', 'not-restored', 'refused']) })
export const dataFolderMoveAuthorityLookupSchema = z.strictObject({ action: z.literal('stop-to-move-the-data-folder'),
  targetFolder: stableUpgradeServingSchema.shape.repository })
export const dataFolderMoveAuthorityResultSchema = z.strictObject({ scope: dataFolderMoveStopScopeSchema,
  decision: stableUpgradeOriginalSchema, state: z.enum(['available', 'reserved', 'consumed']),
  reservation: stableUpgradeOriginalSchema.nullable(), caller: initiatingRun, initiator: initiatingRun.nullable(),
  sendId: sendId.optional(), narrowedByPermission: z.unknown().optional() })
export const stableBootstrapStopAuthorityResultSchema = stableBootstrapStopAuthorityRequestSchema.extend({
  state: z.enum(['available', 'reserved', 'consumed']), preparedAt: stableUpgradeNoticeEventSchema.shape.date,
  warrantWhen: z.string().min(1), reservation: stableUpgradeOriginalSchema.nullable(),
  outcome: z.enum(['handed-off', 'refused', 'failed-restored', 'not-restored']).nullable(),
  caller: initiatingRun, initiator: initiatingRun.nullable(), narrowedByPermission: z.unknown().optional(),
})
export type StableBootstrapStopAuthorityResult = z.infer<typeof stableBootstrapStopAuthorityResultSchema>

/** The new dated tag names the first stable baseline; no previous stable release is implied. */
export const stableBootstrapAnnouncementSchema = z.strictObject({
  candidateTag, from: stableUpgradeServingSchema, to: stableUpgradeServingSchema, tree,
  evidence: stableBootstrapEvidenceSchema,
  notices: z.strictObject({ before: approvedWords, after: approvedWords }),
  authority: stableBootstrapAuthorityReferenceSchema,
}).refine(sameCodeHandoff)
export type StableBootstrapAnnouncement = z.infer<typeof stableBootstrapAnnouncementSchema>

export const stableBootstrapOutcomeSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('handed-off'), verification: z.strictObject({ result: z.literal('handed-off'),
    evidence: stableBootstrapEvidenceSchema, serving: stableUpgradeServingSchema }) }),
  z.strictObject({ state: z.literal('refused'), reason: z.literal(STABLE_BOOTSTRAP_PUBLIC_REASONS[0]) }),
  z.strictObject({ state: z.literal('failed-restored'), reason: z.literal(STABLE_BOOTSTRAP_PUBLIC_REASONS[1]) }),
  z.strictObject({ state: z.literal('not-restored'), reason: z.literal(STABLE_BOOTSTRAP_PUBLIC_REASONS[2]) }),
])
export type StableBootstrapOutcome = z.infer<typeof stableBootstrapOutcomeSchema>
export const stableBootstrapNoticeRequestSchema = z.discriminatedUnion('stage', [
  z.strictObject({ kind: z.literal('first-handoff'), stage: z.literal('before'), sendId, announcement: stableBootstrapAnnouncementSchema }),
  z.strictObject({ kind: z.literal('first-handoff'), stage: z.literal('after'), sendId, before: stableUpgradeOriginalSchema, outcome: stableBootstrapOutcomeSchema }),
])
export type StableBootstrapNoticeRequest = z.infer<typeof stableBootstrapNoticeRequestSchema>
export const stableBootstrapNoticeEventSchema = stableUpgradeNoticeEventSchema.extend({
  version: z.literal(2), request: stableBootstrapNoticeRequestSchema,
})
export type StableBootstrapNoticeEvent = z.infer<typeof stableBootstrapNoticeEventSchema>

export const dataFolderMoveNoticeRequestSchema = z.discriminatedUnion('stage', [
  z.strictObject({ kind: z.literal('data-folder-move'), stage: z.literal('before'), sendId, announcement: z.strictObject({
    scope: dataFolderMoveStopScopeSchema, decision: stableUpgradeOriginalSchema, reservation: stableUpgradeOriginalSchema,
    evidence: stableUpgradeOriginalSchema, moveSendId: sendId, notice: z.string().min(1).max(12000),
  }) }),
  z.strictObject({ kind: z.literal('data-folder-move'), stage: z.literal('after'), sendId, before: stableUpgradeOriginalSchema,
    outcome: z.strictObject({ state: z.enum(['moved', 'restored', 'not-restored', 'refused']), database: stableUpgradeServingSchema.shape.database.nullable() })
      .refine(o => o.state === 'not-restored' || o.database !== null) }),
])
export type DataFolderMoveNoticeRequest = z.infer<typeof dataFolderMoveNoticeRequestSchema>
export const dataFolderMoveNoticeEventSchema = stableUpgradeNoticeEventSchema.extend({ version: z.literal(3), request: dataFolderMoveNoticeRequestSchema })
export function dataFolderMoveBeforeText(scope: DataFolderMoveStopScope): string {
  return enWave13q['move.noticeBefore'].replace('{target}', () => scope.targetFolder)
}
export function dataFolderMoveAfterText(outcome: { state: string; database: string | null }): string {
  const key = outcome.state === 'moved' ? 'move.noticeMoved' : outcome.state === 'restored' ? 'move.noticeRestored' : outcome.state === 'refused' ? 'move.noticeRefused' : 'move.noticeNotRestored'
  return enWave13q[key].replace('{database}', () => outcome.database ?? '')
}

/** Both successful messages preserve the exact approved note body, with no added prose. */
export function stableBootstrapOutcomeText(request: Extract<StableBootstrapNoticeRequest, { stage: 'after' }>, announcement: StableBootstrapAnnouncement): string {
  return request.outcome.state === 'handed-off' ? announcement.notices.after.text : request.outcome.reason
}

/** These combined readers accept every version without changing the ordinary upgrade contract. */
export const stableOfficeNoticeRequestSchema = z.union([stableUpgradeNoticeRequestSchema, stableBootstrapNoticeRequestSchema, stableEmergencyNoticeRequestSchema])
export type StableOfficeNoticeRequest = z.infer<typeof stableOfficeNoticeRequestSchema>
export const stableOfficeNoticeEventSchema = z.discriminatedUnion('version', [stableUpgradeNoticeEventSchema, stableBootstrapNoticeEventSchema, dataFolderMoveNoticeEventSchema, stableEmergencyNoticeEventSchema])
export type StableOfficeNoticeEvent = z.infer<typeof stableOfficeNoticeEventSchema>
export const stableOfficeNoticeResultSchema = stableUpgradeNoticeResultSchema.extend({ event: stableOfficeNoticeEventSchema })
export type StableOfficeNoticeResult = z.infer<typeof stableOfficeNoticeResultSchema>
export const stableOfficeNoticeLookupResultSchema = stableUpgradeNoticeLookupResultSchema.extend({ notice: stableOfficeNoticeResultSchema.nullable() })
export type StableOfficeNoticeLookupResult = z.infer<typeof stableOfficeNoticeLookupResultSchema>
export const dataFolderMoveNoticeResultSchema = stableUpgradeNoticeResultSchema.extend({ event: dataFolderMoveNoticeEventSchema })
export const dataFolderMoveNoticeLookupSchema = z.strictObject({ notice: dataFolderMoveNoticeResultSchema.nullable(), narrowedByPermission: z.unknown().optional() })
export const stableBootstrapHistoryRowSchema = stableUpgradeHistoryRowSchema.extend({
  kind: z.literal('first-handoff'), baselineTag: z.null(),
  fromRepository: stableUpgradeServingSchema.shape.repository, toRepository: stableUpgradeServingSchema.shape.repository,
  outcome: z.enum(['unfinished', 'handed-off', 'refused', 'failed-restored', 'not-restored']),
  reason: z.enum(STABLE_BOOTSTRAP_PUBLIC_REASONS).nullable(),
})
export type StableBootstrapHistoryRow = z.infer<typeof stableBootstrapHistoryRowSchema>
export const stableOfficeHistoryRowSchema = z.union([stableUpgradeHistoryRowSchema, stableBootstrapHistoryRowSchema, stableEmergencyHistoryRowSchema])
export type StableOfficeHistoryRow = StableUpgradeHistoryRow | StableBootstrapHistoryRow | StableEmergencyHistoryRow
export const stableOfficeHistoryPageSchema = stableUpgradeHistoryPageSchema.extend({ entries: z.array(stableOfficeHistoryRowSchema).max(STABLE_UPGRADE_HISTORY_LIMIT) })
export interface StableOfficeHistoryPage extends Omit<StableUpgradeHistoryPage, 'entries'> { entries: StableOfficeHistoryRow[] }

export function bootstrapStopScopeOf(a: Pick<StableBootstrapAnnouncement, 'candidateTag' | 'tree' | 'from' | 'to'>): StableBootstrapStopScope {
  return stableBootstrapHandoffStopScopeSchema.parse({ version: 1, action: 'stop-serve-dev-for-first-handoff',
    candidateTag: a.candidateTag, tree: a.tree, from: a.from, to: a.to })
}

// The existing kind reader publishes these reserved extra contracts and their valid made-up examples.
const originalExample = { id: 'example-receipt', seq: 1 as const, contentHash: 'a'.repeat(16) }
const approvalExample = { ...originalExample, id: 'example-approval', seq: 2 }
const fromExample = { commit: 'a'.repeat(40), repository: '/srv/example/development', database: '/srv/example/data/office.db', port: 29991 }
const toExample = { ...fromExample, repository: '/srv/example/stable' }
const scopeExample = { version: 1 as const, action: 'stop-serve-dev-for-first-handoff' as const, candidateTag: 'stable-2026-10-17-first', tree: 'b'.repeat(40), from: fromExample, to: toExample }
const digestExample = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
const authorityExample = { prepared: { ...originalExample, id: 'example-prepared' }, decision: { ...originalExample, id: 'example-decision' }, stateSha256Base64: digestExample }
const beforeWords = { text: 'The stable checkout will serve the same code. No feature will change.', approval: approvalExample }
const afterWords = { text: 'The stable checkout now serves the same code. No feature changed.', approval: { ...approvalExample, id: 'example-after-approval' } }
const announcementExample = { candidateTag: scopeExample.candidateTag, from: fromExample, to: toExample, tree: scopeExample.tree,
  evidence: originalExample, notices: { before: beforeWords, after: afterWords }, authority: authorityExample }
const beforeExample = { kind: 'first-handoff' as const, stage: 'before' as const, sendId: 'example-before', announcement: announcementExample }
const verificationExample = { result: 'handed-off' as const, evidence: originalExample, serving: toExample }
const preparedExample = { version: 1 as const, scope: scopeExample, evidence: originalExample, stateSha256Base64: digestExample }
const evidenceDecisionExample = { kind: 'owner-decision' as const, decision: { ...originalExample, id: 'example-evidence-decision' } }
const waiverExample = { version: 1 as const, action: 'first-handoff-without-a-whole-suite-receipt' as const, repository: fromExample.repository, commit: fromExample.commit, tree: scopeExample.tree }
const moveScopeExample = { version: 1 as const, action: 'stop-to-move-the-data-folder' as const, database: '/srv/example/development/data/office.db', port: 29991, checkout: fromExample.repository, targetFolder: '/srv/example/private-data', targetMode: '700' as const, backup: { path: '/srv/example/backup.db', sha256: digestExample } }
const moveAnnouncementExample = { scope: moveScopeExample, decision: originalExample, reservation: originalExample, evidence: originalExample, moveSendId: 'example-move', get notice() { return dataFolderMoveBeforeText(moveScopeExample) } }
const field = (key: string, type: string, example: unknown, description: string, required = true): FieldSpec => ({ key, type, required, description, example })
const shape = (name: string, description: string, fields: FieldSpec[], rules?: string[]): ShapeSpec => ({ name, description, fields, ...(rules === undefined ? {} : { rules }) })
const pinFields = (seq: number): FieldSpec[] => [field('id', 'string', 'example-receipt', 'The exact original record id.'), field('seq', 'number', seq, 'Creation revision 1, or a positive approved note revision.'), field('contentHash', 'string', originalExample.contentHash, 'The 16-character content hash of that exact revision.')]
export const STABLE_BOOTSTRAP_SHAPES: Record<string, ShapeSpec> = {
  DataFolderMoveAnnouncement: shape('DataFolderMoveAnnouncement', 'One planned move and its original act and reservation.', [field('scope', 'DataFolderMoveStopScope', moveScopeExample, 'The owner-approved move.'), field('decision', 'StableNoticeOriginal', originalExample, 'The original decision.'), field('reservation', 'StableNoticeOriginal', originalExample, 'This run’s one-use reservation.'), field('evidence', 'StableNoticeOriginal', originalExample, 'The same original decision.'), field('moveSendId', 'string', 'example-move', 'The reservation send id.'), field('notice', 'string', moveAnnouncementExample.notice, 'The server checks the exact planned act, target and expected outage words.')]),
  DataFolderMoveOutcome: shape('DataFolderMoveOutcome', 'The settled move result and its recorded database path.', [field('state', "'moved' | 'restored' | 'not-restored' | 'refused'", 'moved', 'A truthful settled result.'), field('database', 'string | null', '/srv/example/private-data/office.db', 'The verified path for success or restoration; otherwise a recorded path or null when its location is unverified.')]),
  DataFolderMoveBefore: shape('DataFolderMoveBefore', 'A notice required before the recorded stop.', [field('kind', "'data-folder-move'", 'data-folder-move', 'The distinct move contract.'), field('stage', "'before'", 'before', 'The planned stop.'), field('sendId', 'string', 'example-move-before', 'The immutable delivery id.'), field('announcement', 'DataFolderMoveAnnouncement', moveAnnouncementExample, 'The exact planned move.')]),
  DataFolderMoveAfter: shape('DataFolderMoveAfter', 'An original notice after health or settled recovery.', [field('kind', "'data-folder-move'", 'data-folder-move', 'The distinct move contract.'), field('stage', "'after'", 'after', 'The settled result.'), field('sendId', 'string', 'example-move-after', 'The immutable delivery id.'), field('before', 'StableNoticeOriginal', originalExample, 'The original planned-stop message.'), field('outcome', 'DataFolderMoveOutcome', { state: 'moved', database: '/srv/example/private-data/office.db' }, 'The settled outcome.')]),
  DataFolderMoveNoticeRequest: { name: 'DataFolderMoveNoticeRequest', description: 'A strict planned-stop or settled move notice.', fields: [], discriminator: { key: 'stage', variants: { before: 'DataFolderMoveBefore', after: 'DataFolderMoveAfter' } } },
  DataFolderMoveBackup: shape('DataFolderMoveBackup', 'A database-only backup approved for this move.', [field('path', 'string', '/srv/example/backups/office.db', 'The canonical absolute backup path.'), field('sha256', 'string', digestExample, 'SHA-256 in canonical base64; hexadecimal is masked by the request transport.')]),
  DataFolderMoveStopScope: shape('DataFolderMoveStopScope', 'The exact data-folder move the original owner decision covers.', [field('version', 'number', 1, 'Scope version 1.'), field('action', "'stop-to-move-the-data-folder'", 'stop-to-move-the-data-folder', 'Stop for this separate data-folder move.'), field('database', 'string', fromExample.database, 'The absolute current database.'), field('port', 'number', fromExample.port, 'The current service port.'), field('checkout', 'string', fromExample.repository, 'The absolute running checkout.'), field('targetFolder', 'string', '/srv/example/private-data', 'The target named in the owner words; no default.'), field('targetMode', "'700'", '700', 'The target folder mode.'), field('backup', 'DataFolderMoveBackup', { path: '/srv/example/backups/office.db', sha256: digestExample }, 'The database-only backup path and digest.')]),
  StableNoticeOriginal: shape('StableNoticeOriginal', 'An exact original creation pin; seq must be 1.', pinFields(1), ['The strict original schema requires creation revision 1 and a 16-character content hash.']),
  StableNoticeApproval: shape('StableNoticeApproval', 'An exact secretary note revision; seq is positive.', pinFields(2), ['The strict approval schema requires a positive revision and a 16-character content hash.']),
  StableNoticeServing: shape('StableNoticeServing', 'A full serving identity, not an abbreviated commit.', [field('commit', 'string', fromExample.commit, 'The full 40-character code commit.'), field('repository', 'string', fromExample.repository, 'The canonical absolute checkout.'), field('database', 'string', fromExample.database, 'The explicit absolute existing database.'), field('port', 'number', fromExample.port, 'The service listening port from 1024 to 65535.')], ['The shared strict serving schema checks the full commit, safe absolute paths and port range.']),
  StableBootstrapStopScope: { name: 'StableBootstrapStopScope', description: 'One exact owner-approved stop act.', fields: [], discriminator: { key: 'action', variants: { 'stop-serve-dev-for-first-handoff': 'StableBootstrapHandoffStopScope', 'stop-to-move-the-data-folder': 'DataFolderMoveStopScope' } } },
  StableBootstrapHandoffStopScope: shape('StableBootstrapHandoffStopScope', 'The exact first handoff stop scope.', [field('version', 'number', 1, 'Scope version 1.'), field('action', "'stop-serve-dev-for-first-handoff'", scopeExample.action, 'Only this first handoff stop act.'), field('candidateTag', 'string', scopeExample.candidateTag, 'The new dated stable tag, never a previous stable release.'), field('tree', 'string', scopeExample.tree, 'The full tree of the target commit.'), field('from', 'StableNoticeServing', fromExample, 'The development serving identity.'), field('to', 'StableNoticeServing', toExample, 'The stable serving identity.')], ['Version is 1. Source and target commits are equal, repositories differ, and database and port are identical.']),
  StableBootstrapPrepared: shape('StableBootstrapPrepared', 'Reserved note.extra.stableBootstrapPrepared, filed after preparation and the tag.', [field('version', 'number', 1, 'Prepared event version 1.'), field('scope', 'StableBootstrapHandoffStopScope', scopeExample, 'The exact prepared handoff.'), field('evidence', 'StableNoticeOriginal | StableBootstrapEvidenceDecision', originalExample, 'The original green receipt, or the owner decision that stands for it.'), field('stateSha256Base64', 'string', digestExample, 'Canonical base64 SHA-256 of the private prepared state; no private path.')], ['Version is 1 and the digest is canonical base64 for 32 bytes. The original server creation time, not a supplied timestamp, establishes preparation.']),
  StableBootstrapEvidenceDecision: shape('StableBootstrapEvidenceDecision', 'The owner decision that stands for the whole-suite receipt of a first handoff.', [field('kind', "'owner-decision'", 'owner-decision', 'Evidence by owner decision, not by receipt.'), field('decision', 'StableNoticeOriginal', evidenceDecisionExample.decision, 'The original direct secretary decision on the recorded owner words, whose extra.stableBootstrapEvidence names this handoff.')]),
  StableBootstrapEvidenceWaiver: shape('StableBootstrapEvidenceWaiver', 'The first handoff an owner decision lets go ahead without a whole-suite receipt.', [field('version', 'number', 1, 'Version 1.'), field('action', "'first-handoff-without-a-whole-suite-receipt'", waiverExample.action, 'Only a first handoff.'), field('repository', 'string', waiverExample.repository, 'The absolute development checkout.'), field('commit', 'string', waiverExample.commit, 'The full 40-character target commit.'), field('tree', 'string', waiverExample.tree, 'The full tree of that commit.')]),
  StableBootstrapAuthorityReference: shape('StableBootstrapAuthorityReference', 'Original preparation and directly warranted decision, bound to private prepared state.', [field('prepared', 'StableNoticeOriginal', authorityExample.prepared, 'The original prepared note.'), field('decision', 'StableNoticeOriginal', authorityExample.decision, 'The original directly filed secretary decision on the recorded owner words.'), field('stateSha256Base64', 'string', digestExample, 'The same canonical prepared state digest.')], ['The digest is canonical base64 for 32 bytes. The keyed authority read checks the original pins and scope.']),
  StableBootstrapApprovedWords: shape('StableBootstrapApprovedWords', 'Exact public words from a pinned secretary note revision.', [field('text', 'string', beforeWords.text, 'The complete approved public notice body.'), field('approval', 'StableNoticeApproval', approvalExample, 'The exact secretary approval revision.')], ['Public prose excludes credentials and private paths. The server compares the exact approved original note body.']),
  StableBootstrapWords: shape('StableBootstrapWords', 'Separate approved before and successful after words.', [field('before', 'StableBootstrapApprovedWords', beforeWords, 'The original announcement words.'), field('after', 'StableBootstrapApprovedWords', afterWords, 'Successful handoff words; failures never use this success body.')]),
  StableBootstrapAnnouncement: shape('StableBootstrapAnnouncement', 'A first handoff of the same code to another checkout, with no previous stable tag.', [field('candidateTag', 'string', scopeExample.candidateTag, 'The dated first stable baseline tag.'), field('from', 'StableNoticeServing', fromExample, 'The actual development serving identity.'), field('to', 'StableNoticeServing', toExample, 'The exact target stable identity.'), field('tree', 'string', scopeExample.tree, 'The target tree.'), field('evidence', 'StableNoticeOriginal | StableBootstrapEvidenceDecision', originalExample, 'The receipt or owner decision pinned by preparation.'), field('notices', 'StableBootstrapWords', announcementExample.notices, 'Both exact approved note bodies.'), field('authority', 'StableBootstrapAuthorityReference', authorityExample, 'Original stop authority and preparation pins.')], ['The shared announcement schema requires equal commits, different repositories and identical database and service port. No previous baselineTag is accepted.']),
  StableBootstrapVerification: shape('StableBootstrapVerification', 'The settled handoff result and exact target identity.', [field('result', "'handed-off'", 'handed-off', 'Distinct from an ordinary completed upgrade.'), field('evidence', 'StableNoticeOriginal | StableBootstrapEvidenceDecision', originalExample, 'The same original receipt or owner decision.'), field('serving', 'StableNoticeServing', toExample, 'The complete actual stable serving identity.')]),
  StableBootstrapHandedOff: shape('StableBootstrapHandedOff', 'A verified first handoff, never an ordinary upgrade completion.', [field('state', "'handed-off'", 'handed-off', 'Verified first handoff.'), field('verification', 'StableBootstrapVerification', verificationExample, 'The original evidence and serving proof.')]),
  StableBootstrapRefused: shape('StableBootstrapRefused', 'An attempt refused before publication.', [field('state', "'refused'", 'refused', 'No handoff was published.'), field('reason', `'${STABLE_BOOTSTRAP_PUBLIC_REASONS[0]}'`, STABLE_BOOTSTRAP_PUBLIC_REASONS[0], 'The fixed public refusal reason.')]),
  StableBootstrapRestored: shape('StableBootstrapRestored', 'A failed attempt whose development service was restored.', [field('state', "'failed-restored'", 'failed-restored', 'Failed first handoff with verified restoration.'), field('reason', `'${STABLE_BOOTSTRAP_PUBLIC_REASONS[1]}'`, STABLE_BOOTSTRAP_PUBLIC_REASONS[1], 'The fixed public restored-failure reason.')]),
  StableBootstrapNotRestored: shape('StableBootstrapNotRestored', 'A failed attempt whose restoration was not verified.', [field('state', "'not-restored'", 'not-restored', 'Restoration remains unverified.'), field('reason', `'${STABLE_BOOTSTRAP_PUBLIC_REASONS[2]}'`, STABLE_BOOTSTRAP_PUBLIC_REASONS[2], 'The fixed public unverified-restoration reason.')]),
  StableBootstrapOutcome: { name: 'StableBootstrapOutcome', description: 'One truthful first handoff outcome.', fields: [], discriminator: { key: 'state', variants: { 'handed-off': 'StableBootstrapHandedOff', refused: 'StableBootstrapRefused', 'failed-restored': 'StableBootstrapRestored', 'not-restored': 'StableBootstrapNotRestored' } } },
  StableBootstrapBefore: shape('StableBootstrapBefore', 'The strict first handoff BEFORE request.', [field('kind', "'first-handoff'", 'first-handoff', 'The separate first handoff variant.'), field('stage', "'before'", 'before', 'The original announcement.'), field('sendId', 'string', 'example-before', 'The stable id for this exact attempt.'), field('announcement', 'StableBootstrapAnnouncement', announcementExample, 'The complete approved announcement.')]),
  StableBootstrapAfter: shape('StableBootstrapAfter', 'The strict first handoff AFTER request.', [field('kind', "'first-handoff'", 'first-handoff', 'The separate first handoff variant.'), field('stage', "'after'", 'after', 'One original final outcome.'), field('sendId', 'string', 'example-after', 'The stable outcome send id.'), field('before', 'StableNoticeOriginal', { ...originalExample, id: 'example-before-message' }, 'The exact original BEFORE.'), field('outcome', 'StableBootstrapOutcome', { state: 'handed-off', verification: verificationExample }, 'The settled result; failure cannot claim success.')]),
  StableBootstrapNoticeRequest: { name: 'StableBootstrapNoticeRequest', description: 'One first handoff request to the existing notice door.', fields: [], discriminator: { key: 'stage', variants: { before: 'StableBootstrapBefore', after: 'StableBootstrapAfter' } } },
  StableOfficeNoticeEvent: shape('StableOfficeNoticeEvent', 'Reserved message.extra.stableUpgradeNotice, written only by the Office notice door.', [field('version', 'number', 2, 'Version 1 upgrade, version 2 first handoff, version 3 data-folder move, or version 4 emergency release.'), field('project', 'string', 'example-project', 'The exact project id.'), field('date', 'date', '2026-10-17 01:00:00', 'Original server local creation time.'), field('request', 'StableBootstrapNoticeRequest | DataFolderMoveNoticeRequest | Record<string, unknown>', beforeExample, 'The version selects its strict notice contract.')], ['Each version has its strict shared request schema, with no unknown fields.']),
  StableBootstrapNoteExtra: shape('StableBootstrapNoteExtra', 'The reserved preparation entry in the existing open extra bag.', [field('stableBootstrapPrepared', 'StableBootstrapPrepared', preparedExample, 'Original prepared event, not a release or stop notice.', false)]),
  StableBootstrapDecisionExtra: shape('StableBootstrapDecisionExtra', 'The reserved stop scope and first handoff evidence in the existing decision extra bag.', [field('stableBootstrapStop', 'StableBootstrapStopScope', scopeExample, 'The exact act covered by the original direct decision and warrant.', false), field('stableBootstrapEvidence', 'StableBootstrapEvidenceWaiver', waiverExample, 'The exact first handoff the original direct decision lets go ahead without a whole-suite receipt.', false)]),
  StableOfficeMessageExtra: shape('StableOfficeMessageExtra', 'The reserved original notice event in the existing message extra bag.', [field('stableUpgradeNotice', 'StableOfficeNoticeEvent', { version: 2, project: 'example-project', date: '2026-10-17 01:00:00', request: beforeExample }, 'The original notice event; only the existing notice door writes it.', false)]),
}
const shapeSchemas: Record<string, z.ZodType> = {
  DataFolderMoveAnnouncement: dataFolderMoveNoticeRequestSchema.options[0].shape.announcement,
  DataFolderMoveOutcome: dataFolderMoveNoticeRequestSchema.options[1].shape.outcome,
  DataFolderMoveBefore: dataFolderMoveNoticeRequestSchema.options[0], DataFolderMoveAfter: dataFolderMoveNoticeRequestSchema.options[1], DataFolderMoveNoticeRequest: dataFolderMoveNoticeRequestSchema,
  StableNoticeOriginal: stableUpgradeOriginalSchema, StableNoticeApproval: stableUpgradeApprovalSchema, StableNoticeServing: stableUpgradeServingSchema,
  StableBootstrapStopScope: stableBootstrapStopScopeSchema, StableBootstrapHandoffStopScope: stableBootstrapHandoffStopScopeSchema,
  DataFolderMoveStopScope: dataFolderMoveStopScopeSchema, DataFolderMoveBackup: dataFolderMoveStopScopeSchema.shape.backup, StableBootstrapPrepared: stableBootstrapPreparedSchema,
  StableBootstrapAuthorityReference: stableBootstrapAuthorityReferenceSchema, StableBootstrapApprovedWords: approvedWords,
  StableBootstrapEvidenceDecision: stableBootstrapEvidenceDecisionSchema, StableBootstrapEvidenceWaiver: stableBootstrapEvidenceWaiverSchema,
  StableBootstrapAnnouncement: stableBootstrapAnnouncementSchema, StableBootstrapHandedOff: stableBootstrapOutcomeSchema.options[0],
  StableBootstrapRefused: stableBootstrapOutcomeSchema.options[1], StableBootstrapRestored: stableBootstrapOutcomeSchema.options[2], StableBootstrapNotRestored: stableBootstrapOutcomeSchema.options[3],
  StableBootstrapBefore: stableBootstrapNoticeRequestSchema.options[0], StableBootstrapAfter: stableBootstrapNoticeRequestSchema.options[1],
  StableOfficeNoticeEvent: stableOfficeNoticeEventSchema,
}
export const STABLE_BOOTSTRAP_SHAPE_CHECKS: Record<string, (value: Record<string, unknown>, path: string) => ValidationError[]> = Object.fromEntries(
  Object.entries(shapeSchemas).map(([name, schema]) => [name, (value: Record<string, unknown>, path: string) =>
    schema.safeParse(value).success ? [] : [{ path, message: `${path} must satisfy the strict shared ${name} contract.` }]]),
)
