// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A JUDGED RECEIPT (wave 13q item 6). A whole-suite receipt is evidence only; a person or an agent judges whether it
 * passes. A judgement is a note whose extra holds RECEIPT_JUDGEMENT: the receipt it judges, and one verdict for each file
 * that takes one, with how that file ran alone. The release's authorization note (Note B) pins one beside its
 * stableReleaseAuthorization, under STABLE_RELEASE_JUDGEMENT. The office's notice door and the release tool read their own
 * facts and ask whyTheJudgementDoesNotStand, so the two cannot judge the same judgement differently.
 */
import { z } from 'zod'
import { stableUpgradeApprovalSchema, stableUpgradeOriginalSchema, type StableUpgradeOriginal } from './stable-upgrade-notices.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptIsComplete, wholeSuiteReceiptIsGreen } from './whole-suite-receipt.ts'

export const RECEIPT_JUDGEMENT = 'receiptJudgement'
/** Note B's key for its pin, beside stableReleaseAuthorization and not inside it: that schema is strict, and an older office reads it. */
export const STABLE_RELEASE_JUDGEMENT = 'stableReleaseJudgement'
/** A problem a judged file opened keeps the file here, in its extra. */
export const JUDGED_FILE = 'judgedFile'
export const RECEIPT_VERDICTS = ['test-fault', 'feature-broken'] as const
export type ReceiptVerdict = (typeof RECEIPT_VERDICTS)[number]
/** How every page and sentence says a stored verdict. */
export const VERDICT_WORDS: Record<ReceiptVerdict, string> = { 'test-fault': "a test's fault", 'feature-broken': 'a feature broken' }
export const JUDGEMENT_REASON_MOST = 2000

const id = stableUpgradeOriginalSchema.shape.id
const file = z.string().min(1).max(4096)
const reason = z.string().max(JUDGEMENT_REASON_MOST).refine(text => text.trim().length > 0)
const verdict = z.enum(RECEIPT_VERDICTS)
const eachFileOnce = (verdicts: { file: string }[]) => new Set(verdicts.map(one => one.file)).size === verdicts.length

/** How a file that takes a verdict ran alone. A file green alone takes no verdict. */
export const VERDICT_ALONE_OUTCOMES = ['red', 'not run', 'no result'] as const
export type VerdictAloneOutcome = (typeof VERDICT_ALONE_OUTCOMES)[number]

/** What the judgement door is asked: the receipt, and for each file its verdict, the reason and the line that owns it. */
export const receiptJudgementRequestSchema = z.strictObject({
  receipt: stableUpgradeOriginalSchema,
  verdicts: z.array(z.strictObject({ file, verdict, reason, line: id })).min(1).refine(eachFileOnce),
})
export type ReceiptJudgementRequest = z.infer<typeof receiptJudgementRequestSchema>

/**
 * What the note keeps. Who judged and when are the note's create stamp, not stored a second time. Version 2 stores how
 * each judged file ran alone. Version 1 could only be filed when every file it judged was red alone, so its files read
 * as red; it is kept so a judgement already stored still parses and stands.
 */
const keptVerdict = { file, verdict, reason, problem: id }
export const receiptJudgementSchema = z.union([
  z.strictObject({
    version: z.literal(1),
    receipt: stableUpgradeOriginalSchema,
    verdicts: z.array(z.strictObject(keptVerdict)).min(1).refine(eachFileOnce),
  }),
  z.strictObject({
    version: z.literal(2),
    receipt: stableUpgradeOriginalSchema,
    verdicts: z.array(z.strictObject({ ...keptVerdict, ranAlone: z.enum(VERDICT_ALONE_OUTCOMES) })).min(1).refine(eachFileOnce),
  }),
])
export type ReceiptJudgement = z.infer<typeof receiptJudgementSchema>

export const stableReleaseJudgementSchema = stableUpgradeApprovalSchema
export type StableReleaseJudgement = z.infer<typeof stableReleaseJudgementSchema>

export const JUDGEMENT_REFUSALS = {
  pin: "The authorization note's judgement pin has no valid declared shape.",
  revision: 'The pinned judgement revision is not in this project, or its content hash does not match.',
  shape: 'The pinned record is not a judgement of a whole-suite receipt.',
  deleted: 'The judgement was deleted, so it no longer stands. Restoring it does not change that: file a new judgement.',
  changed: 'The judgement was changed after the authorization note pinned it. Pin its newest revision.',
  author: 'The judgement was not written with an agent key by the agent who wrote the authorization note, nor by the person.',
  another: 'The judgement judges another receipt, not the one this upgrade names.',
  green: 'The receipt is green, so its authorization note pins no judgement.',
  emergency: 'An emergency release names no receipt, so its authorization note cannot pin a judgement.',
  incomplete: 'The receipt is not green, and no judgement can stand for it: a judged receipt needs version 2, a build that exited 0, ' +
    'a suite that exited 1, whole coverage, no errors outside the tests and every artifact.',
  noVerdict: (one: string) => `The judgement gives no verdict for ${one}, which was red, not run or gave no result when run alone.`,
  notRed: (one: string) => `The judgement gives a verdict for ${one}, which needs none in this receipt: it was green when run alone, or did not fail in the whole run.`,
  ranAlone: (one: string) => `The judgement's stored run alone for ${one} differs from the receipt's, so the judgement does not stand.`,
  featureBroken: (one: string) => `The judgement says a feature is broken in ${one}, so the upgrade does not go ahead.`,
  noProblem: (one: string) => `The judgement names no problem kept for ${one}, so the line that owns it was not told.`,
} as const

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Note B's pin: null when it pins none, the refusal when the key is there and is not a pin. */
export function theJudgementPinIn(extra: unknown): { pin: StableReleaseJudgement } | { refused: string } | null {
  if (!object(extra) || extra[STABLE_RELEASE_JUDGEMENT] === undefined) return null
  const parsed = stableReleaseJudgementSchema.safeParse(extra[STABLE_RELEASE_JUDGEMENT])
  return parsed.success ? { pin: parsed.data } : { refused: JUDGEMENT_REFUSALS.pin }
}

/** The files that take a verdict, with how each ran alone: every file not green alone, in the receipt's order. */
export function theFilesThatTakeAVerdict(receipt: unknown): { file: string; ranAlone: VerdictAloneOutcome }[] {
  let parsed
  try { parsed = parseWholeSuiteReceipt(receipt) } catch { return [] }
  return (parsed.aloneRuns ?? []).flatMap(run => run.outcome === 'green' ? [] : [{ file: run.file, ranAlone: run.outcome }])
}

/**
 * Why no judgement can stand for this receipt, or null when one can. It is not asked of a green receipt. A file not run
 * alone, or with no result alone, takes a verdict like a red one: the whole run still failed it.
 */
export function whyThisReceiptCannotBeJudged(receipt: unknown): string | null {
  if (!wholeSuiteReceiptIsComplete(receipt)) return JUDGEMENT_REFUSALS.incomplete
  const parsed = parseWholeSuiteReceipt(receipt)
  if (parsed.version !== 2 || parsed.suiteExitCode !== 1 || parsed.errorsOutsideTests !== 0 ||
      parsed.aloneRuns === undefined || parsed.aloneRuns.length === 0) return JUDGEMENT_REFUSALS.incomplete
  return null
}

/** Every file that takes a verdict has one, and no other file has one. */
export function whyTheVerdictsDoNotFit(receipt: unknown, verdicts: readonly { file: string }[]): string | null {
  const takes = theFilesThatTakeAVerdict(receipt).map(one => one.file)
  const judged = new Set(verdicts.map(one => one.file))
  for (const one of takes) if (!judged.has(one)) return JUDGEMENT_REFUSALS.noVerdict(one)
  for (const one of verdicts) if (!takes.includes(one.file)) return JUDGEMENT_REFUSALS.notRed(one.file)
  return null
}

/** The files a stored judgement judges, with how each says it ran alone. A version-1 judgement's files read as red. */
export function theFilesAStoredJudgementJudges(judged: ReceiptJudgement): { file: string; ranAlone: VerdictAloneOutcome }[] {
  if (judged.version === 1) return judged.verdicts.map(one => ({ file: one.file, ranAlone: 'red' }))
  return judged.verdicts.map(one => ({ file: one.file, ranAlone: one.ranAlone }))
}

/** One revision as the revision door's header gives it, and as the office reads it through listRevisions. */
export interface JudgementRevision {
  seq: number
  op: string
  who: { actorType: string; resolvedAgentId: string | null }
  provedBy: string | null
  provedHolder: string | null
}

/**
 * Every revision up to the pinned one was written by the judge: the person with the person's key, or `judge`, the agent who
 * wrote Note B, with its own agent key (decided in wave 13q item 6). A holder of the secretary card who is not that agent does not
 * count, and neither does their tool's key.
 */
export function writtenByTheJudge(revisions: readonly JudgementRevision[], pinnedSeq: number, judge: string | null): boolean {
  const upTo = revisions.filter(one => one.seq <= pinnedSeq)
  const byTheJudge = (one: JudgementRevision) => (one.who.actorType === 'human' && one.provedBy === 'the-person-key') ||
    (judge !== null && one.who.actorType === 'agent' && one.who.resolvedAgentId === judge && one.provedBy === 'an-agent-key' &&
      (one.provedHolder === null || one.provedHolder === judge))
  return upTo.length === pinnedSeq && upTo.some(one => one.seq === 1 && one.op === 'create') &&
    upTo.some(one => one.seq === pinnedSeq) && upTo.every(byTheJudge)
}

/** The file a problem keeps for a judgement, or null when it is not a problem in this project that a judged file opened. */
export function theFileAProblemKeeps(record: { kind: string; workspaceId: string; deletedAt: string | null; data: unknown } | null, project: string): string | null {
  if (record === null || record.kind !== 'problem' || record.workspaceId !== project || record.deletedAt !== null || !object(record.data)) return null
  const extra = record.data['extra']
  const judged = object(extra) ? extra[JUDGED_FILE] : undefined
  return object(judged) && typeof judged['file'] === 'string' ? judged['file'] : null
}

/**
 * What the reader found. `pinned` is null when there is no such revision, its content hash differs or the record is not
 * in this project now: the release tool, asking in this project, is told no more than that. `revisions` is the
 * judgement's whole list. `judge` is the agent who wrote Note B's pinned
 * revision, or null. `now` is read only when the decision is still to come (the office's BEFORE and every run of the
 * tool's check): whether the judgement is deleted now, and for each problem a verdict names, the file it keeps.
 */
export interface JudgementFacts {
  pinned: { kind: string; extra: unknown } | null
  revisions: readonly JudgementRevision[]
  judge: string | null
  now: { deleted: boolean; problems: ReadonlyMap<string, string | null> } | null
}

/** THE ONE RULE. Null when the pinned judgement lets this receipt in; otherwise the sentence that says why not. */
export function whyTheJudgementDoesNotStand(asked: { pin: StableReleaseJudgement; evidence: StableUpgradeOriginal; receipt: unknown }, facts: JudgementFacts): string | null {
  if (wholeSuiteReceiptIsGreen(asked.receipt)) return JUDGEMENT_REFUSALS.green
  const unjudgeable = whyThisReceiptCannotBeJudged(asked.receipt)
  if (unjudgeable !== null) return unjudgeable
  if (facts.pinned === null) return JUDGEMENT_REFUSALS.revision
  const extra = facts.pinned.extra
  const parsed = receiptJudgementSchema.safeParse(object(extra) ? extra[RECEIPT_JUDGEMENT] : undefined)
  if (facts.pinned.kind !== 'note' || !parsed.success) return JUDGEMENT_REFUSALS.shape
  const deletes = (one: JudgementRevision) => one.op === 'delete'
  if (facts.revisions.some(one => one.seq <= asked.pin.seq && deletes(one)) ||
      (facts.now !== null && (facts.now.deleted || facts.revisions.some(deletes)))) return JUDGEMENT_REFUSALS.deleted
  if (facts.now !== null && Math.max(...facts.revisions.map(one => one.seq)) !== asked.pin.seq) return JUDGEMENT_REFUSALS.changed
  if (!writtenByTheJudge(facts.revisions, asked.pin.seq, facts.judge)) return JUDGEMENT_REFUSALS.author
  const judged = parsed.data
  if (judged.receipt.id !== asked.evidence.id || judged.receipt.seq !== asked.evidence.seq ||
      judged.receipt.contentHash !== asked.evidence.contentHash) return JUDGEMENT_REFUSALS.another
  const misfit = whyTheVerdictsDoNotFit(asked.receipt, judged.verdicts)
  if (misfit !== null) return misfit
  const ranAlone = new Map(theFilesThatTakeAVerdict(asked.receipt).map(one => [one.file, one.ranAlone]))
  for (const one of theFilesAStoredJudgementJudges(judged)) {
    if (one.ranAlone !== ranAlone.get(one.file)) return JUDGEMENT_REFUSALS.ranAlone(one.file)
  }
  const broken = judged.verdicts.find(one => one.verdict === 'feature-broken')
  if (broken !== undefined) return JUDGEMENT_REFUSALS.featureBroken(broken.file)
  if (facts.now !== null) {
    const problems = facts.now.problems
    const untold = judged.verdicts.find(one => problems.get(one.problem) !== one.file)
    if (untold !== undefined) return JUDGEMENT_REFUSALS.noProblem(untold.file)
  }
  return null
}
