// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isDeepStrictEqual as same } from 'node:util'
import type { StableBootstrapAnnouncement, StableBootstrapEvidence, StableBootstrapNoticeRequest } from '@shared/stable-bootstrap-notices.ts'
import { stableBootstrapOutcomeText } from '@shared/stable-bootstrap-notices.ts'
import type { StableUpgradeAnnouncement } from '@shared/stable-upgrade-notices.ts'
import { PanelError } from './panel-error.ts'
import { getRevisionRow } from './get-revision-row.ts'

type Serving = StableBootstrapAnnouncement['from']
type ReceiptScope = { evidence: StableBootstrapEvidence; tree: string; toCommit: string }
type ApprovalScope = Pick<StableUpgradeAnnouncement, 'notice' | 'noticeApproval'>
type Validators = {
  receipt: (scope: ReceiptScope, project: string) => { repository: string }
  approval: (scope: ApprovalScope, project: string) => void
}
const fail = (words: string): never => { throw new PanelError(words, 409) }

function receiptScope(a: StableBootstrapAnnouncement): ReceiptScope {
  return { evidence: a.evidence, tree: a.tree, toCommit: a.to.commit }
}

/** Reuse the ordinary provenance checks; equal commits additionally need different exact repositories. */
export function validateBootstrapBefore(a: StableBootstrapAnnouncement, project: string, serving: Serving, validators: Validators): void {
  if (!same(a.from, serving)) fail('The first handoff BEFORE does not match the complete actual source identity.')
  if (validators.receipt(receiptScope(a), project).repository !== a.from.repository) fail('The original first handoff evidence names another source repository.')
  for (const stage of ['before', 'after'] as const) {
    const words = a.notices[stage]
    validators.approval({ notice: words.text, noticeApproval: words.approval }, project)
  }
}

export function validateBootstrapCompletion(request: Extract<StableBootstrapNoticeRequest, { stage: 'after' }>, a: StableBootstrapAnnouncement,
  project: string, serving: Serving, validators: Pick<Validators, 'receipt'>): void {
  if (request.outcome.state !== 'handed-off') return
  if (validators.receipt(receiptScope(a), project).repository !== a.from.repository) fail('The original first handoff evidence names another source repository.')
  const proof = request.outcome.verification
  if (!same(proof.evidence, a.evidence) || !same(proof.serving, a.to) || !same(proof.serving, serving)) {
    fail('First handoff completion does not match the original evidence and complete target serving identity.')
  }
}

/** A later note edit cannot supply either successful notice body. Failure never borrows success prose. */
export function bootstrapNoticeText(request: StableBootstrapNoticeRequest, a: StableBootstrapAnnouncement): string {
  if (request.stage === 'after' && request.outcome.state !== 'handed-off') return stableBootstrapOutcomeText(request, a)
  const words = a.notices[request.stage]
  const pinned = getRevisionRow(words.approval.id, words.approval.seq)
  if (pinned.kind !== 'note' || pinned.contentHash !== words.approval.contentHash || pinned.data['body'] !== words.text) {
    fail('The first handoff words do not match their original approved note revision.')
  }
  return request.stage === 'before' ? words.text : stableBootstrapOutcomeText(request, a)
}
