// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** First-handoff delivery uses the existing notice door and retained, verified reconciliation journal. */
import { isDeepStrictEqual as same } from 'node:util'
import {
  STABLE_BOOTSTRAP_PUBLIC_REASONS, stableBootstrapAnnouncementSchema, stableBootstrapNoticeRequestSchema,
  stableOfficeNoticeResultSchema, stableOfficeNoticeLookupResultSchema,
  bootstrapStopScopeOf, stableBootstrapStopAuthorityRequestSchema, stableBootstrapStopAuthorityResultSchema,
} from '../../src/shared/stable-bootstrap-notices.ts'
import { validateNoticeConfig, verifyNoticeReply, announceUpgrade, finishUpgradeNotice, retryUpgradeNotice, noticeRetryTimeout } from './stable-upgrade-notices.mjs'
import { A_KEY_SHOWN_AS } from '../office-request.mjs'
import { bootstrapEvidencePin } from './stable-bootstrap-support.mjs'

const fail = words => { throw new Error(`First handoff notice: ${words}`) }
function outcomeFor(result, evidence, serving) {
  if (result.state === 'published') return { state: 'handed-off', verification: { result: 'handed-off', evidence, serving } }
  if (result.state === 'unchanged') return { state: 'refused', reason: STABLE_BOOTSTRAP_PUBLIC_REASONS[0] }
  if (result.state === 'restored') return { state: 'failed-restored', reason: STABLE_BOOTSTRAP_PUBLIC_REASONS[1] }
  if (result.state === 'NOT RESTORED') return { state: 'not-restored', reason: STABLE_BOOTSTRAP_PUBLIC_REASONS[2] }
  fail('There is no settled first handoff outcome to announce.')
}
const contract = {
  requestSchema: stableBootstrapNoticeRequestSchema, resultSchema: stableOfficeNoticeResultSchema,
  lookupSchema: stableOfficeNoticeLookupResultSchema, outcomeFor, successState: 'handed-off',
  afterFields: { kind: 'first-handoff' }, beforeText: a => a.notices.before.text,
  pendingText: 'First handoff outcome retained; notice not filed.',
}

export function validateBootstrapNoticeConfig(c) {
  stableBootstrapAnnouncementSchema.shape.notices.parse(c.notices)
  validateNoticeConfig({ ...c, noticeApproval: c.notices.before.approval })
}
/**
 * The owner decision that stands for the whole-suite receipt, read from its original creation: a decision on the owner's
 * word whose extra.stableBootstrapEvidence names this development checkout, target commit and tree. The server checks the
 * owner, the secretary and the warrant again before anything stops.
 */
export async function verifyBootstrapEvidenceDecision(c, { officeRequest, api } = {}) {
  const { id, contentHash } = c.evidence.decision
  const reply = await officeRequest({ method: 'GET', path: `/api/records/${encodeURIComponent(id)}/revisions/1` }, api === undefined ? undefined : { api })
  if (!reply || reply.status !== 200 || reply.cut !== false || reply.location !== null || typeof reply.body !== 'string' || reply.body.includes(A_KEY_SHOWN_AS)) {
    fail('The original evidence decision read was refused, masked, partial, redirected or unavailable.')
  }
  const original = JSON.parse(reply.body), content = original?.content
  const names = { version: 1, action: 'first-handoff-without-a-whole-suite-receipt', repository: c.developmentRepository, commit: c.targetCommit, tree: c.targetTree }
  if (original?.recordId !== id || original.seq !== 1 || original.op !== 'create' || original.contentHash !== contentHash || content?.kind !== 'decision' ||
      content.deletedAt !== null || content.data?.authority !== 'the owner said so' || !same(content.data?.extra?.stableBootstrapEvidence, names)) {
    fail('The evidence decision is not an original owner decision that names this first handoff\'s checkout, commit and tree.')
  }
  return { decision: c.evidence.decision }
}
export function bootstrapStopScope(c, from, tree) {
  const expected = { commit: c.targetCommit, repository: c.developmentRepository, database: c.database, port: c.servicePort }
  if (!same(from, expected) || tree !== c.targetTree) fail('The configured commit, tree and complete source identity must match the verified first handoff.')
  return bootstrapStopScopeOf({ candidateTag: c.candidateTag, tree, from, to: { ...from, repository: c.stableCheckout } })
}
export function beforeBootstrapRequest(c, from, tree) {
  validateBootstrapNoticeConfig(c)
  const scope = bootstrapStopScope(c, from, tree)
  if (c.stopAuthority?.kind !== 'owner-decision' || Object.keys(c.stopAuthority).sort().join(',') !== 'decision,kind') {
    fail('The first handoff needs its pinned original owner decision; rehearsal is no server authority bypass.')
  }
  return stableBootstrapNoticeRequestSchema.parse({ kind: 'first-handoff', stage: 'before', sendId: c.noticeSendIds.before,
    announcement: { candidateTag: scope.candidateTag, from: scope.from, to: scope.to, tree: scope.tree,
      evidence: bootstrapEvidencePin(c), notices: c.notices,
      authority: { prepared: c.prepared?.event, decision: c.stopAuthority.decision, stateSha256Base64: c.prepared?.sha256Base64 } } })
}

/** A new BEFORE needs availability; the immediate before-stop recheck needs this run's exact pending original. */
export async function verifyBootstrapStopAuthority(input, { officeRequest, api, expectedBefore } = {}) {
  if (expectedBefore !== undefined && input?.expectedBefore !== undefined && !same(expectedBefore, input.expectedBefore)) fail('The expected original BEFORE pins disagree.')
  const request = stableBootstrapStopAuthorityRequestSchema.parse({ ...input, ...(expectedBefore === undefined ? {} : { expectedBefore }) })
  const reply = await officeRequest({ method: 'GET', path: `/api/office/bootstrap-stop-authority?request=${encodeURIComponent(JSON.stringify(request))}` }, api === undefined ? undefined : { api })
  if (!reply || reply.status !== 200 || reply.cut !== false || reply.location !== null || typeof reply.body !== 'string' || reply.body.includes(A_KEY_SHOWN_AS)) {
    fail('The original stop authority read was refused, masked, partial, redirected or unavailable.')
  }
  const result = stableBootstrapStopAuthorityResultSchema.parse(JSON.parse(reply.body))
  const echo = { scope: result.scope, authority: result.authority, sendId: result.sendId,
    ...(result.expectedBefore === undefined ? {} : { expectedBefore: result.expectedBefore }) }
  if (!same(echo, request) || (result.narrowedByPermission !== undefined && result.narrowedByPermission !== null)) fail('The stop authority response does not echo this exact request.')
  if (officeRequest.identity?.session !== undefined && result.caller.run !== officeRequest.identity.session) fail('The stop authority read belongs to another initiating run.')
  if (request.expectedBefore === undefined) {
    if (result.state !== 'available' || result.reservation !== null || result.initiator !== null || result.outcome !== null) fail('The original stop authority is already reserved or consumed.')
  } else if (result.state !== 'reserved' || result.outcome !== null || !same(result.reservation, request.expectedBefore) || !same(result.initiator, result.caller)) {
    fail('The original reservation is not this initiating run\'s exact pending first handoff.')
  }
  return result
}
export function verifyBootstrapNoticeReply(reply, request, project, office) {
  stableBootstrapNoticeRequestSchema.parse(request)
  return verifyNoticeReply(reply, request, project, office, contract)
}
export function announceBootstrap(input, options) { return announceUpgrade(input, { ...options, contract }) }
export function finishBootstrapNotice(input, options) { return finishUpgradeNotice(input, { ...options, contract }) }
export function retryBootstrapNotice(path, options) { return retryUpgradeNotice(path, { ...options, contract }) }
export function bootstrapNoticeRetryTimeout(path) { return noticeRetryTimeout(path) }
