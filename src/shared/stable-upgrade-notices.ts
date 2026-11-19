// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import type { LeftOutCounts, LeftOutGroup } from './disclosure.ts'

/** Existing message records carry this field in their declared extra bag. */
export const STABLE_UPGRADE_NOTICE_EVENT = 'stableUpgradeNotice'
export const STABLE_UPGRADE_HISTORY_LIMIT = 25
export const STABLE_UPGRADE_NOTICE_MAX = 4000
export const STABLE_UPGRADE_PUBLIC_REASONS = [
  'Upgrade was refused before publication.',
  'Upgrade failed and the baseline was restored.',
  'Upgrade failed and restoration was not verified.',
] as const

const id = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/)
const commit = z.string().regex(/^[0-9a-f]{40}$/)
const tree = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
const tag = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
const path = z.string().max(4096).regex(/^\/(?:[^\s\\\u0000-\u001f\u007f:]+\/?)+$/)
/** Public prose cannot carry credential syntax or private recovery paths. */
export function isPublicUpgradeNotice(text: string): boolean {
  return !/(?:\b(?:sk-[A-Za-z0-9_-]+|Bearer\s+\S+)|\b[A-Fa-f0-9]{64}\b|(?:key|token|password|secret|credential)\s*[:=]|(?:\/|[A-Za-z]:\\)|full[- ]?image|recoveryimagepaths)/i.test(text)
}
const notice = z.string().min(1).max(STABLE_UPGRADE_NOTICE_MAX)
  .refine(text => text.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) && isPublicUpgradeNotice(text))

export const stableUpgradeOriginalSchema = z.strictObject({ id, seq: z.literal(1), contentHash: z.string().regex(/^[0-9a-f]{16}$/) })
export type StableUpgradeOriginal = z.infer<typeof stableUpgradeOriginalSchema>
export const stableUpgradeApprovalSchema = stableUpgradeOriginalSchema.extend({ seq: z.number().int().positive() }).strict()
export const stableUpgradeAnnouncementSchema = z.strictObject({
  candidateTag: tag.regex(/^stable-\d{4}-\d{2}-\d{2}-[A-Za-z0-9][A-Za-z0-9._-]*$/),
  baselineTag: tag, fromCommit: commit, toCommit: commit, tree,
  evidence: stableUpgradeOriginalSchema, notice, noticeApproval: stableUpgradeApprovalSchema,
}).refine(a => a.fromCommit !== a.toCommit && a.candidateTag !== a.baselineTag)
export type StableUpgradeAnnouncement = z.infer<typeof stableUpgradeAnnouncementSchema>

export const stableUpgradeServingSchema = z.strictObject({ commit, repository: path, database: path, port: z.number().int().min(1024).max(65535) })
/** How many words the upgraded office shows in English on its Chinese pages, when that is above zero. */
const untranslatedWords = z.number().int().positive().optional()
const completed = z.strictObject({ state: z.literal('completed'), untranslatedWords, verification: z.strictObject({
  result: z.literal('completed'), evidence: stableUpgradeOriginalSchema, serving: stableUpgradeServingSchema,
}) })
export const stableUpgradeOutcomeSchema = z.discriminatedUnion('state', [
  completed,
  z.strictObject({ state: z.literal('refused'), reason: z.literal(STABLE_UPGRADE_PUBLIC_REASONS[0]) }),
  z.strictObject({ state: z.literal('failed-restored'), reason: z.literal(STABLE_UPGRADE_PUBLIC_REASONS[1]) }),
  z.strictObject({ state: z.literal('not-restored'), reason: z.literal(STABLE_UPGRADE_PUBLIC_REASONS[2]) }),
])
export type StableUpgradeOutcome = z.infer<typeof stableUpgradeOutcomeSchema>
const before = z.strictObject({ stage: z.literal('before'), sendId: id, announcement: stableUpgradeAnnouncementSchema })
const after = z.strictObject({ stage: z.literal('after'), sendId: id, before: stableUpgradeOriginalSchema, outcome: stableUpgradeOutcomeSchema })
export const stableUpgradeNoticeRequestSchema = z.discriminatedUnion('stage', [before, after])
export type StableUpgradeNoticeRequest = z.infer<typeof stableUpgradeNoticeRequestSchema>

const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
export const stableUpgradeNoticeEventSchema = z.strictObject({
  version: z.literal(1), project: id, date: stamp, request: stableUpgradeNoticeRequestSchema,
})
export type StableUpgradeNoticeEvent = z.infer<typeof stableUpgradeNoticeEventSchema>

/**
 * NOTICE VERSION 4 IS AN EMERGENCY RELEASE: it names no receipt. Its announcement pins the owner's throw of the
 * emergency switch, by the change row that wrote it, and the chat message in which a secretary told the owner which
 * commit goes in. src/shared/stable-emergency.ts holds the rule that judges both.
 */
export const stableEmergencyPinsSchema = z.strictObject({
  throw: z.strictObject({ change: id, appendOrder: z.number().int().positive() }), message: stableUpgradeOriginalSchema,
})
export type StableEmergencyPins = z.infer<typeof stableEmergencyPinsSchema>
const { evidence: _receipt, ...announced } = stableUpgradeAnnouncementSchema.shape
export const stableEmergencyAnnouncementSchema = z.strictObject({ ...announced, emergency: stableEmergencyPinsSchema })
  .refine(a => a.fromCommit !== a.toCommit && a.candidateTag !== a.baselineTag)
export type StableEmergencyAnnouncement = z.infer<typeof stableEmergencyAnnouncementSchema>
export const stableEmergencyOutcomeSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('completed'), untranslatedWords, verification: z.strictObject({ result: z.literal('completed'), serving: stableUpgradeServingSchema }) }),
  ...stableUpgradeOutcomeSchema.options.slice(1),
])
export const stableEmergencyNoticeRequestSchema = z.discriminatedUnion('stage', [
  z.strictObject({ kind: z.literal('emergency'), stage: z.literal('before'), sendId: id, announcement: stableEmergencyAnnouncementSchema }),
  z.strictObject({ kind: z.literal('emergency'), stage: z.literal('after'), sendId: id, before: stableUpgradeOriginalSchema, outcome: stableEmergencyOutcomeSchema }),
])
export type StableEmergencyNoticeRequest = z.infer<typeof stableEmergencyNoticeRequestSchema>
export const stableEmergencyNoticeEventSchema = stableUpgradeNoticeEventSchema.extend({ version: z.literal(4), request: stableEmergencyNoticeRequestSchema })
export type StableEmergencyNoticeEvent = z.infer<typeof stableEmergencyNoticeEventSchema>
export interface StableUpgradeNoticeResult {
  original: StableUpgradeOriginal
  content: { kind: 'message'; title: string; summary: string | null; data: Record<string, unknown>; deletedAt: null }
  event: StableUpgradeNoticeEvent
  replayed: boolean
  narrowedByPermission?: unknown
}
export type StableUpgradeNoticeState = 'unchanged' | 'changed' | 'deleted' | 'missing'
export interface StableUpgradeHistoryRow {
  tag: string
  baselineTag: string
  date: string
  outcomeDate: string | null
  notice: string
  fromCommit: string
  toCommit: string
  tree: string
  outcome: 'unfinished' | StableUpgradeOutcome['state']
  reason: string | null
  before: StableUpgradeOriginal
  after: StableUpgradeOriginal | null
  notices: { before: StableUpgradeNoticeState; after: StableUpgradeNoticeState | null }
}
/** An emergency release's row, with the follow-up receipt and the report the office works out when the history is read. */
export interface StableEmergencyHistoryRow extends StableUpgradeHistoryRow {
  kind: 'emergency'
  emergency: StableEmergencyPins & { followUp: StableEmergencyFollowUp; report: StableEmergencyReport }
}
export interface StableUpgradeHistoryPage {
  entries: (StableUpgradeHistoryRow | StableEmergencyHistoryRow)[]
  older: string | null
  /** This bounded window and one older probe, never a whole-project total. */
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<'older'>[]
  narrowedByPermission?: unknown
}
export interface StableUpgradeNoticeLookupResult { notice: StableUpgradeNoticeResult | null; narrowedByPermission?: unknown }

export const stableUpgradeNoticeResultSchema = z.strictObject({
  narrowedByPermission: z.unknown().optional(), original: stableUpgradeOriginalSchema, event: stableUpgradeNoticeEventSchema, replayed: z.boolean(),
  content: z.strictObject({ kind: z.literal('message'), title: z.string(), summary: z.string().nullable(),
    data: z.record(z.string(), z.unknown()), deletedAt: z.null() }),
})
export const stableUpgradeNoticeLookupResultSchema = z.strictObject({ notice: stableUpgradeNoticeResultSchema.nullable(), narrowedByPermission: z.unknown().optional() })
const noticeState = z.enum(['unchanged', 'changed', 'deleted', 'missing'])
export const stableUpgradeHistoryRowSchema = z.strictObject({
  tag, baselineTag: tag, date: stamp, outcomeDate: stamp.nullable(), notice,
  fromCommit: commit, toCommit: commit, tree,
  outcome: z.enum(['unfinished', 'completed', 'refused', 'failed-restored', 'not-restored']),
  reason: z.enum(STABLE_UPGRADE_PUBLIC_REASONS).nullable(),
  before: stableUpgradeOriginalSchema, after: stableUpgradeOriginalSchema.nullable(),
  notices: z.strictObject({ before: noticeState, after: noticeState.nullable() }),
})
/**
 * THE FOLLOW-UP RECEIPT: the first whole-suite receipt filed after the BEFORE whose commit contains the released commit
 * and is on main, green or red. `unknown` says git could not answer; `not-owed` is a release that did not go in.
 */
export const stableEmergencyFollowUpSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('missing') }),
  z.strictObject({ state: z.literal('filed'), receipt: stableUpgradeOriginalSchema, commit, green: z.boolean() }),
  z.strictObject({ state: z.literal('unknown'), because: z.string().min(1).max(1000) }),
  z.strictObject({ state: z.literal('not-owed') }),
])
export type StableEmergencyFollowUp = z.infer<typeof stableEmergencyFollowUpSchema>
/** THE REPORT: a report record with an `about` link to the BEFORE. */
export const stableEmergencyReportSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('missing') }),
  z.strictObject({ state: z.literal('filed'), id }),
  z.strictObject({ state: z.literal('unknown'), because: z.string().min(1).max(1000) }),
  z.strictObject({ state: z.literal('not-owed') }),
])
export type StableEmergencyReport = z.infer<typeof stableEmergencyReportSchema>
export const stableEmergencyHistoryRowSchema = stableUpgradeHistoryRowSchema.extend({
  kind: z.literal('emergency'),
  emergency: stableEmergencyPinsSchema.extend({ followUp: stableEmergencyFollowUpSchema, report: stableEmergencyReportSchema }),
})
export const stableUpgradeHistoryPageSchema = z.strictObject({
  entries: z.array(z.union([stableUpgradeHistoryRowSchema, stableEmergencyHistoryRowSchema])).max(STABLE_UPGRADE_HISTORY_LIMIT), older: z.string().nullable(),
  subtraction: z.strictObject({ candidates: z.number().int().nonnegative(), carried: z.number().int().nonnegative(),
    leftOut: z.number().int().nonnegative(), shortened: z.number().int().nonnegative() }),
  leftOutGroups: z.array(z.strictObject({ cause: z.literal('budget'), bucket: z.literal('older'),
    count: z.number().int().min(0).max(1), ids: z.array(id).max(1) })).max(1),
  narrowedByPermission: z.unknown().optional(),
})


/** The line an emergency release's notices carry above the approved words. */
export function stableEmergencyLine(message: string): string {
  return `Emergency release: no complete test receipt was read for this version. Message ${message} told the owner.`
}
export function stableEmergencyBeforeText(announcement: StableEmergencyAnnouncement): string {
  return `${stableEmergencyLine(announcement.emergency.message.id)}\n\n${announcement.notice}`
}

/** One wording for the original AFTER body, retaining earlier notices without a policy approval. */
export function stableUpgradeOutcomeText(
  request: Extract<StableUpgradeNoticeRequest | StableEmergencyNoticeRequest, { stage: 'after' }>,
  announcement: StableUpgradeAnnouncement | StableEmergencyAnnouncement,
  hasReleaseAuthorization: boolean,
): string {
  const count = request.outcome.state === 'completed' ? request.outcome.untranslatedWords : undefined
  const words = count === undefined ? '' : count === 1 ? ' 1 word is not yet translated into Chinese, so the Chinese pages show it in English.'
    : ` ${count} words are not yet translated into Chinese, so the Chinese pages show them in English.`
  const outcome = request.outcome.state === 'completed' ? `Upgrade completed and verified.${words}` : request.outcome.reason
  const line = 'emergency' in announcement ? `${stableEmergencyLine(announcement.emergency.message.id)}\n\n` : ''
  const body = `${outcome}\n\n${line}${announcement.notice}`
  return hasReleaseAuthorization
    ? `${body}\n\nRelease authorization: note ${announcement.noticeApproval.id}, version ${announcement.noticeApproval.seq}.`
    : body
}
