// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { momentOfAnInstant, stampInZone } from './time.ts'
import { stableUpgradeAnnouncementSchema, stableUpgradeApprovalSchema, stableUpgradeOriginalSchema, stableUpgradeServingSchema } from './stable-upgrade-notices.ts'

// The release rule puts releases at least about three hours apart. Its number is the gate
// release-spacing in src/config/gates.mjs, which the office reads and the release tool reads from the office.
export const STABLE_RELEASE_EXCEPTION_MINUTES = 15
export const STABLE_RELEASE_AUTHORIZATION = 'stableReleaseAuthorization'
export const STABLE_RELEASE_BASELINE = 'stableReleaseBaseline'

const instant = z.string().refine(value => momentOfAnInstant(value) !== null)
const timeZone = z.string().min(1).max(120).refine(value => {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false
  try { stampInZone(0, value); return true } catch { return false }
})
const { candidateTag, baselineTag, fromCommit, toCommit, tree, evidence, notice: reason } = stableUpgradeAnnouncementSchema.shape

/** A source pin says which original to read, never what today's editable note claims happened. */
export const stableReleaseBaselineSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed-after'), after: stableUpgradeOriginalSchema }),
  z.strictObject({ kind: z.literal('bootstrap'), note: stableUpgradeApprovalSchema }),
])

/** The explicit first-baseline or manual-restore attestation is a note, not a release event. */
export const stableReleaseBaselineSchema = z.strictObject({
  version: z.literal(1), kind: z.literal('operator-attestation'), reason, baselineTag,
  serving: stableUpgradeServingSchema, establishedAt: instant,
})

/**
 * The existing noticeApproval revision carries this exact shape beside its unchanged notice body. Mode emergency names
 * no receipt: it pins the original chat message in which a secretary told the owner which commit goes in.
 */
const authorized = {
  version: z.literal(1), reason, timeZone, candidateTag, baselineTag, fromCommit, toCommit, tree,
  serving: stableUpgradeServingSchema, validFrom: instant, validUntil: instant,
  baselineSource: stableReleaseBaselineSourceSchema,
}
export const stableReleaseAuthorizationSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...authorized, mode: z.enum(['spacing', 'outside-use', 'urgent-fix']), evidence }),
  z.strictObject({ ...authorized, mode: z.literal('emergency'), message: stableUpgradeOriginalSchema }),
]).refine(value => value.fromCommit !== value.toCommit && value.candidateTag !== value.baselineTag)

export type StableReleaseAuthorization = z.infer<typeof stableReleaseAuthorizationSchema>
export type StableReleaseBaseline = z.infer<typeof stableReleaseBaselineSchema>
export type StableReleaseBaselineSource = z.infer<typeof stableReleaseBaselineSourceSchema>
