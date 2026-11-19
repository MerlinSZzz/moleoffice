// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import type { FieldSpec, ShapeSpec, ValidationError } from './kinds.ts'
import { stampInZone, theHourAfter } from './time.ts'

const text = z.string().min(1).refine(s => s.trim() === s)
const gitHash = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
const unique = <T>(values: T[]): boolean => new Set(values.map(v => JSON.stringify(v))).size === values.length
const path = text.refine(s => !s.startsWith('/') && !/[\\\x00-\x1f]/.test(s) && s.split('/').every(p => p !== '' && p !== '.' && p !== '..'))
const strings = z.array(text).refine(unique)
export const mainSuiteFixReceiptSchema = z.object({ recordId: text, seq: z.literal(1), contentHash: z.string().regex(/^[a-f0-9]{16}$/) }).strict()
export const MAIN_SUITE_FIX_TAKEOUT_REASONS = ['hour expired', 'repair not green', 'verification unavailable', 'not fixed in time'] as const
export const mainSuiteFixReferenceSchema = z.object({ problem: text, kind: z.enum(['repair', 'takeout']), reason: z.enum(MAIN_SUITE_FIX_TAKEOUT_REASONS).optional() }).strict().superRefine((value, ctx) => {
  if (value.kind !== 'takeout' && value.reason !== undefined) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Only a take-out carries a reason.' })
})
export type MainSuiteFixReference = z.infer<typeof mainSuiteFixReferenceSchema>
export const takesOutSchema = strings.min(1)

/** The original end and its zone supply the only deadline. A fold or gap without an offset stays unknown. */
export function mainSuiteFixDeadline(originalEndedAt: string | null, timeZone: string): { endedAtMs: number | null; deadlineMs: number | null; deadline: string | null } {
  const hour = theHourAfter(originalEndedAt, timeZone, 60)
  return { endedAtMs: hour.fromMs, deadlineMs: hour.untilMs, deadline: hour.until }
}

export const mainSuiteFixSchema = z.object({
  receipt: mainSuiteFixReceiptSchema,
  repository: text.refine(s => s.startsWith('/')), commit: gitHash, tree: gitHash,
  failedTests: z.array(z.object({ file: path, name: text }).strict()).refine(unique),
  failedFiles: z.array(path).min(1).refine(unique),
  cause: z.array(z.object({ entry: text, commits: z.array(gitHash).min(1).refine(unique), how: z.enum(['bisect', 'only-change']) }).strict()),
  causeUnknown: text.optional(),
  originalEndedAt: text.nullable(),
  timeZone: text.refine(zone => { try { stampInZone(0, zone); return true } catch { return false } }),
  endedAtMs: z.number().int().safe().nullable(), deadlineMs: z.number().int().safe().nullable(),
  fixRound: z.object({ run: text.nullable(), startedAt: text.nullable(), deadline: text.nullable() }).strict(),
  claim: z.object({ agent: text, run: text }).strict(),
  dispatch: z.object({ previousRun: text, sheriff: text, brief: z.object({ path: text, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), state: z.enum(['planned', 'asked', 'started']) }).strict().optional(),
  repair: z.object({ run: text, entry: text.optional() }).strict().optional(),
  takeout: z.object({ run: text.optional(), entry: text.optional(), clone: text.optional(), base: gitHash.optional(), commit: gitHash.optional() }).strict().optional(),
  pending: z.object({ phase: text, says: text }).strict().optional(),
  notices: z.array(z.object({ sendId: text, to: strings.min(1), phase: text, message: text.optional() }).strict()).optional(),
  fixedReceipt: mainSuiteFixReceiptSchema.optional(),
  verification: z.object({ repairCommit: gitHash, targetCommit: gitHash, state: z.enum(['planned', 'attempted', 'complete', 'unavailable']), attempt: text.optional(), receipt: mainSuiteFixReceiptSchema.optional(), outcome: z.enum(['green', 'red', 'build-failed', 'incomplete']).optional(), says: text.optional() }).strict().optional(),
  outcome: z.union([z.object({ fixed: gitHash }).strict(), z.object({ returned: text }).strict()]).optional(),
}).strict().superRefine((value, ctx) => {
  const fail = (field: string, message: string): void => { ctx.addIssue({ code: 'custom', path: [field], message }) }
  const deadline = mainSuiteFixDeadline(value.originalEndedAt, value.timeZone)
  if (value.endedAtMs !== deadline.endedAtMs || value.deadlineMs !== deadline.deadlineMs || value.fixRound.deadline !== deadline.deadline) fail('fixRound', 'The deadline must remain the original receipt end plus 60 minutes in its explicit zone.')
  if ((value.cause.length === 0) !== (value.causeUnknown !== undefined)) fail('causeUnknown', 'An empty cause array requires an explicit unknown reason; known causes have none.')
  if (!unique(value.cause.map(c => c.entry))) fail('cause', 'Each actual causal entry appears once.')
  if (value.failedTests.some(t => !value.failedFiles.includes(t.file))) fail('failedTests', 'Every failed test belongs to an original failed file.')
  if ((value.fixRound.run === null) !== (value.fixRound.startedAt === null)) fail('fixRound', 'An actual run and its actual start are recorded together.')
  if (value.outcome && 'fixed' in value.outcome && !value.fixedReceipt) fail('fixedReceipt', 'Fixed requires a later original green receipt pin.')
  if (value.outcome && 'returned' in value.outcome && value.fixedReceipt) fail('fixedReceipt', 'Returned carries no fixed receipt.')
  if (value.notices && !unique(value.notices.map(n => n.sendId))) fail('notices', 'Notice send IDs are unique.')
  const verification = value.verification
  if (verification) {
    if (verification.state !== 'planned' && !verification.attempt) fail('verification', 'An invocation reserves its one attempt before it asks the producer.')
    if (verification.state === 'complete' && (!verification.receipt || !verification.outcome)) fail('verification', 'Completed verification requires its actual original receipt and derived result.')
    if (verification.state !== 'complete' && (verification.receipt || verification.outcome)) fail('verification', 'Only completed verification carries observed evidence.')
    if (verification.state === 'unavailable' && !verification.says) fail('verification', 'Unavailable verification says what could not run or be reconciled.')
    if (value.fixedReceipt && verification.receipt && JSON.stringify(value.fixedReceipt) !== JSON.stringify(verification.receipt)) fail('fixedReceipt', 'The fixed pin must be the original verification receipt.')
  }
})
export type MainSuiteFix = z.infer<typeof mainSuiteFixSchema>

const exampleDeadline = mainSuiteFixDeadline('2026-10-15 09:20:00', 'UTC')
/** Made-up documentation data, never an observation or a ready-to-file machine claim. */
export const MAIN_SUITE_FIX_EXAMPLE: MainSuiteFix = {
  receipt: { recordId: 'example-original-red', seq: 1, contentHash: '0'.repeat(16) },
  repository: '/srv/example/development', commit: 'a'.repeat(40), tree: 'b'.repeat(40),
  failedFiles: ['tests/example.test.ts'], failedTests: [{ file: 'tests/example.test.ts', name: 'Synthetic failing test' }],
  cause: [], causeUnknown: 'This made-up example has no observed attribution.',
  originalEndedAt: '2026-10-15 09:20:00', timeZone: 'UTC', endedAtMs: exampleDeadline.endedAtMs, deadlineMs: exampleDeadline.deadlineMs,
  fixRound: { run: null, startedAt: null, deadline: exampleDeadline.deadline }, claim: { agent: 'example-controller', run: 'example-controller-run' },
}

/** Original-create correlation, compared again before any machine action. Ordinary prose remains editable. */
export function mainSuiteFixPinned(value: MainSuiteFix) {
  const { receipt, repository, commit, tree, failedTests, failedFiles, cause, causeUnknown, originalEndedAt, timeZone, endedAtMs, deadlineMs } = value
  return { receipt, repository, commit, tree, failedTests, failedFiles, cause, causeUnknown, originalEndedAt, timeZone, endedAtMs, deadlineMs, deadline: value.fixRound.deadline }
}
export function mainSuiteFixCrossChecks(data: Record<string, unknown>): ValidationError[] {
  if (data['mainSuiteFix'] === undefined) return []
  const parsed = mainSuiteFixSchema.safeParse(data['mainSuiteFix'])
  return parsed.success ? [] : parsed.error.issues.map(issue => ({ path: `data.mainSuiteFix.${issue.path.join('.')}`, message: issue.message }))
}

/** Made-up dispatch brief identity: the brief a sheriff was started on, never a real brief. */
const MADE_UP_BRIEF_PATH = '/srv/example/briefs/main-suite-repair-7.md'
const MADE_UP_BRIEF_SHA256 = 'e'.repeat(64)
/** The later green-run receipt; the original red receipt is MAIN_SUITE_FIX_EXAMPLE.receipt. */
const MADE_UP_GREEN_RECEIPT = { recordId: 'example-original-green', seq: 1, contentHash: '1'.repeat(16) }
const field = (key: string, type: string, required: boolean, description: string, example: unknown = undefined, exampleWith?: Record<string, unknown>): FieldSpec =>
  ({ key, type, required, description, example, ...(exampleWith === undefined ? {} : { exampleWith }) })
/** Published by the existing problem kind; runtime cross-checks also enforce exact nested keys and correlations. */
export const MAIN_SUITE_FIX_SHAPES: Record<string, ShapeSpec> = {
  MainSuiteFix: { name: 'MainSuiteFix', description: 'Strict original receipt correlation and the active controller claim, dispatch, repair, return and original green evidence.', fields: [
    field('receipt','MainSuiteFixReceipt',true,'The original create revision and its hash.', MAIN_SUITE_FIX_EXAMPLE.receipt),
    field('repository','string',true,'Exact original source or explicit interpretation.', MAIN_SUITE_FIX_EXAMPLE.repository),
    field('commit','string',true,'Exact original source or explicit interpretation.', MAIN_SUITE_FIX_EXAMPLE.commit),
    field('tree','string',true,'Exact original source or explicit interpretation.', MAIN_SUITE_FIX_EXAMPLE.tree),
    field('timeZone','string',true,'Exact original source or explicit interpretation.', MAIN_SUITE_FIX_EXAMPLE.timeZone),
    field('failedTests','WholeSuiteFailedTest[]',true,'Original failing tests.', MAIN_SUITE_FIX_EXAMPLE.failedTests),
    field('failedFiles','string[]',true,'Original failing files.', MAIN_SUITE_FIX_EXAMPLE.failedFiles),
    field('cause','MainSuiteFixCause[]',true,'Verified causal entries and actual landed commits, or empty when unknown.', MAIN_SUITE_FIX_EXAMPLE.cause),
    field('causeUnknown','string',false,'Why the cause is unknown, exactly when cause is empty.', MAIN_SUITE_FIX_EXAMPLE.causeUnknown),
    field('originalEndedAt','string | null',true,'The unchanged original end, or null when absent.', MAIN_SUITE_FIX_EXAMPLE.originalEndedAt),
    field('endedAtMs','number | null',true,'Validated original instant, or null when ambiguous.', MAIN_SUITE_FIX_EXAMPLE.endedAtMs),
    field('deadlineMs','number | null',true,'Original instant plus 60 minutes, or null.', MAIN_SUITE_FIX_EXAMPLE.deadlineMs),
    field('fixRound','MainSuiteFixRound',true,'Only an actual started run; the original deadline never resets.', MAIN_SUITE_FIX_EXAMPLE.fixRound),
    field('claim','MainSuiteFixClaim',true,'Exclusive controller agent and its proved own run.', MAIN_SUITE_FIX_EXAMPLE.claim),
    field('dispatch','MainSuiteFixDispatch',false,'Persisted before the next-round request.', { previousRun: 'example-previous-run', sheriff: 'example-sheriff', brief: { path: MADE_UP_BRIEF_PATH, sha256: MADE_UP_BRIEF_SHA256 }, state: 'planned' }),
    field('repair','MainSuiteFixRepair',false,'Actual repair run and optional entry reference.', { run: 'example-repair-run', entry: 'example-repair-entry' }),
    field('takeout','MainSuiteFixTakeout',false,'Pending author and normal queue submission references.', { run: 'example-takeout-run', entry: 'example-takeout-entry', clone: '/srv/example/takeout-clone', base: 'c'.repeat(40), commit: 'd'.repeat(40) }),
    field('pending','MainSuiteFixPending',false,'An unresolved action and its explanation.', { phase: 'example-pending-takeout', says: 'The made-up take-out has not landed yet.' }),
    field('notices','MainSuiteFixNotice[]',false,'Durable sends with stable IDs and reconciled messages.', [{ sendId: 'example-send-1', to: ['example-agent-1'], phase: 'example-pending-takeout', message: 'example-message-1' }]),
    field('fixedReceipt','MainSuiteFixReceipt',false,'Later original green receipt required for fixed.', MADE_UP_GREEN_RECEIPT),
    field('verification','MainSuiteFixVerification',false,'One reserved producer attempt for an actually landed repair; progress is not a repair outcome.', { repairCommit: 'c'.repeat(40), targetCommit: 'd'.repeat(40), state: 'complete', attempt: 'example-attempt-1', receipt: MADE_UP_GREEN_RECEIPT, outcome: 'green' }),
    field('outcome','MainSuiteFixFixed | MainSuiteFixReturned',false,'Fixed after repair landing and original green; returned after take-out landing.', { fixed: 'c'.repeat(40) }),
  ] },
  MainSuiteFixReceipt: {name:'MainSuiteFixReceipt',description:'An original create revision pin.',fields:[field('recordId','string',true,'Record ID.', MAIN_SUITE_FIX_EXAMPLE.receipt.recordId),field('seq','number',true,'Exactly revision 1.', 1),field('contentHash','string',true,'Original content hash.', MAIN_SUITE_FIX_EXAMPLE.receipt.contentHash)]},
  MainSuiteFixReference: {name:'MainSuiteFixReference',description:'A problem reference and closed take-out reason on the normal queue entry.',fields:[field('problem','string',true,'Authoritative problem ID.', 'example-problem'),field('kind',"'repair' | 'takeout'",true,'The normal submission purpose.', 'repair'),field('reason',"'hour expired' | 'repair not green' | 'verification unavailable' | 'not fixed in time'",false,'Required for a new take-out; omitted for a repair. The queue validates the reason and computes its title.', 'hour expired', { kind: 'takeout' })]},
  MainSuiteFixCause: {name:'MainSuiteFixCause',description:'One actual causal merge entry.',fields:[field('entry','string',true,'Entry ID.', 'example-entry-1'),field('commits','string[]',true,'Nonempty exact landed commits.', ['a'.repeat(40)]),field('how',"'bisect' | 'only-change'",true,'The verified attribution method.', 'bisect')]},
  MainSuiteFixRound: {name:'MainSuiteFixRound',description:'An actual repair start and original deadline.',fields:[field('run','string | null',true,'Actual value, or explicit unknown.', MAIN_SUITE_FIX_EXAMPLE.fixRound.run),field('startedAt','string | null',true,'Actual value, or explicit unknown.', MAIN_SUITE_FIX_EXAMPLE.fixRound.startedAt),field('deadline','string | null',true,'Actual value, or explicit unknown.', MAIN_SUITE_FIX_EXAMPLE.fixRound.deadline)]},
  MainSuiteFixClaim: {name:'MainSuiteFixClaim',description:'No lease or automatic takeover.',fields:[field('agent','string',true,'Exact normalized registry or session record ID.', MAIN_SUITE_FIX_EXAMPLE.claim.agent),field('run','string',true,'Exact normalized registry or session record ID.', MAIN_SUITE_FIX_EXAMPLE.claim.run)]},
  MainSuiteFixBrief: {name:'MainSuiteFixBrief',description:'The dispatch brief pin.',fields:[
    field('path','string',true,'Exact dispatch brief identity.', MADE_UP_BRIEF_PATH),
    field('sha256','string',true,'Exact dispatch brief identity.', MADE_UP_BRIEF_SHA256),
  ]},
  MainSuiteFixDispatch: {name:'MainSuiteFixDispatch',description:'Planned before asking and reconciled to the actual start.',fields:[field('previousRun','string',true,'Prior sheriff run.', 'example-previous-run'),field('sheriff','string',true,'Sheriff identity.', 'example-sheriff'),field('brief','MainSuiteFixBrief',true,'Pinned brief.', { path: MADE_UP_BRIEF_PATH, sha256: MADE_UP_BRIEF_SHA256 }),field('state',"'planned' | 'asked' | 'started'",true,'Dispatch reconciliation phase.', 'planned')]},
  MainSuiteFixRepair: {name:'MainSuiteFixRepair',description:'Repair references without duplicated entry state.',fields:[field('run','string',true,'Actual repair run.', 'example-repair-run'),field('entry','string',false,'Submitted repair entry.', 'example-repair-entry')]},
  MainSuiteFixTakeout: {name:'MainSuiteFixTakeout',description:'Pending take-out author and submission correlation.',fields:[field('run','string',false,'Exact author or submission identity.', 'example-takeout-run'),field('entry','string',false,'Exact author or submission identity.', 'example-takeout-entry'),field('clone','string',false,'Exact author or submission identity.', '/srv/example/takeout-clone'),field('base','string',false,'Exact author or submission identity.', 'c'.repeat(40)),field('commit','string',false,'Exact author or submission identity.', 'd'.repeat(40))]},
  MainSuiteFixPending: {name:'MainSuiteFixPending',description:'Unresolved work, never a success.',fields:[field('phase','string',true,'Pending action or explanation.', 'example-pending-takeout'),field('says','string',true,'Pending action or explanation.', 'The made-up take-out has not landed yet.')]},
  MainSuiteFixNotice: {name:'MainSuiteFixNotice',description:'One durable phase send to its exact canonical recipients.',fields:[field('sendId','string',true,'Stable send correlation.', 'example-send-1'),field('phase','string',true,'Stable send correlation.', 'example-pending-takeout'),field('to','string[]',true,'Unique nonempty canonical agent IDs for one actual message.', ['example-agent-1']),field('message','string',false,'Actual sent message ID.', 'example-message-1')]},
  MainSuiteFixVerification: {name:'MainSuiteFixVerification',description:'One original producer attempt; result must match the pinned original receipt.',fields:[field('repairCommit','string',true,'Actually landed repair commit.', 'c'.repeat(40)),field('targetCommit','string',true,'Exact main target containing that repair.', 'd'.repeat(40)),field('state',"'planned' | 'attempted' | 'complete' | 'unavailable'",true,'Verification progress only.', 'complete'),field('attempt','string',false,'The one immutable producer attempt.', 'example-attempt-1'),field('receipt','MainSuiteFixReceipt',false,'Actual original result receipt.', MADE_UP_GREEN_RECEIPT),field('outcome',"'green' | 'red' | 'build-failed' | 'incomplete'",false,'Derived from the original receipt.', 'green'),field('says','string',false,'Explanation of pending or unavailable evidence.', 'The made-up producer run could not be reconciled yet.', { state: 'unavailable' })]},
  MainSuiteFixFixed: {name:'MainSuiteFixFixed',description:'Landed repair with later original green evidence.',fields:[field('fixed','string',true,'Actual repaired main commit.', 'c'.repeat(40))]},
  MainSuiteFixReturned: {name:'MainSuiteFixReturned',description:'The normal take-out actually landed.',fields:[field('returned','string',true,'Merged take-out entry.', 'example-returned-entry')]},
}
