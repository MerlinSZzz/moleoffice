// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROJECT'S OWN RULES SAY OF ONE DESIGN, AND THE ONE WRITER OF A DESIGN REVIEW. The design-first build of wave
 * 13s's requirements. src/shared/project-rules.ts holds the closed lists and the one reader of a rule; this file asks
 * them of a stored design.
 *
 * ONE PROJECT'S RULES ONLY. A design is judged by the chapter of the project it is filed in and by no other, so a rule
 * of one project says nothing of a design in another project, and the office's general chapters are never
 * read here.
 *
 * NONE OF THESE ANSWERS IS A PASS BUT `met`. A rule that does not read answers `not-checked`; evidence that cannot be
 * read answers `unreadable`, which counts as missing and is named apart; a review that is out of date, by somebody
 * else, or under rules that changed since, each answers in its own word. A rule only reminds: nothing here refuses.
 *
 * THE CHAPTER'S DOORS ARE HERE TOO: its read, its preview and its one writer. Only the person, or a secretary of this
 * project using its own key, writes it. Every write names the version it read and says why, the reason is kept with the
 * revision, and each rule it changes takes that revision's number, so a review written before it can tell.
 *
 * IT JUDGES A DESIGN, NOT A RUN. Which run is method work, and the reminder before the seal of such a run, are in
 * ./design-reminders.ts, which asks this file's review answer and its rules of each design the run links.
 */

import { sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  DESIGN_KIND,
  DESIGN_REVIEW_KIND,
  DESIGN_REVIEW_VERDICTS,
  PROJECT_CHAPTER_KIND,
  PROJECT_RULE_CHECK_NAMES,
  PROJECT_RULE_CHECKS,
  PROJECT_RULE_FIELDS,
  readAProjectRule,
  type AProjectRuleCheck,
  type DesignReviewVerdict,
  type ProjectRule,
  type ProjectRuleAnswer,
  type ProjectRuleCheckName,
  type ProjectRuleProblem,
  type ProjectRuleTrigger,
  type TheProjectChapter,
} from '@shared/project-rules.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { theSecretaryAgentAnswersTo } from './claims.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card-2.ts'
import { theDutiesPartFor } from '../db/the-duties-part-for.ts'
import { refuseChapterEdit } from './refuse-chapter-edit.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'
import { asTheProjectRulesDoors } from './project-rules-door.ts'
import { createRecord, getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { numbering } from '../db/numbering.ts'

/** What one rule answers of one design. */
export interface ProjectRuleJudgement {
  /** The rule's id, or null for a stored rule that has none. */
  rule: string | null
  heading: string | null
  check: ProjectRuleCheckName | null
  /** With "evidence-linked": the account the rule asks for. */
  evidence: string | null
  /** The record the rule comes from, so a reminder names it. */
  source: string | null
  answer: ProjectRuleAnswer
  /** The answer in a sentence. */
  says: string
  /** What the answer is about: the evidence records that do not read, the thresholds with no source, the reviews. */
  names: string[]
}

/** What a project's chapter says of one design, at one trigger. */
export interface DesignJudgement {
  design: string
  /** The design's revision that was judged. */
  designRevision: number
  project: string
  /** The project's chapter, or null because the project keeps none: then no rule is asked. */
  chapter: string | null
  chapterRevision: number | null
  trigger: ProjectRuleTrigger
  answers: ProjectRuleJudgement[]
  /** Whether any answer is a reminder: anything but `met` and `off`. */
  reminds: boolean
}

interface StoredDesign {
  assignedBy: ParticipantRef
  thresholds?: { what: string; source?: string }[]
  evidence?: { name: string; record: string; shows?: string }[]
}

interface StoredReview {
  design: string
  designRevision: number
  rulesRevision?: number
  verdict: DesignReviewVerdict
  reviewer: ParticipantRef
}

/**
 * THE ONE CHAPTER A PROJECT KEEPS, or null because it keeps none. Only its doors write one, and they write one per
 * project; two live chapters in one project is a broken assumption, so it is refused rather than one picked.
 */
export function theChapterOfProject(workspaceId: string): PanelRecord | null {
  const rows = sqlite
    .prepare('SELECT id FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid')
    .all(PROJECT_CHAPTER_KIND, workspaceId) as { id: string }[]
  if (rows.length > 1) {
    throw new PanelError(
      `The project "${workspaceId}" holds ${String(rows.length)} chapters of its own (${rows.map((row) => row.id).join(', ')}), ` +
        'and its doors write one. The office does not pick one of them. Nothing was judged.',
      500,
    )
  }
  return rows.length === 0 ? null : getRecord(rows[0]!.id)
}

/** Who may review this design: the person, and the secretary the assigning agent answers to when that is not itself. */
export function whoMayReviewADesign(design: PanelRecord): ParticipantRef[] {
  const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
  const assignedBy = (design.data as unknown as StoredDesign).assignedBy
  if (assignedBy.kind !== 'agent') return [person]
  const secretary = theSecretaryAgentAnswersTo(assignedBy.id)
  if (secretary === null || secretary.id === assignedBy.id) return [person]
  return [person, secretary]
}

/** The live reviews of one design, oldest first. */
function theReviewsOf(design: PanelRecord): PanelRecord[] {
  const rows = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL AND json_extract(data, '$.design') = ?
       ORDER BY created_at, rowid`,
    )
    .all(DESIGN_REVIEW_KIND, design.workspaceId, design.id) as { id: string }[]
  return rows.map((row) => getRecord(row.id)).filter((one): one is PanelRecord => one !== null)
}

/** Whether the record an evidence account names can be read: it is there and not deleted. */
function readable(id: string): boolean {
  const record = getRecord(id)
  return record !== null && record.deletedAt === null
}

/**
 * WHAT A PROJECT'S CHAPTER SAYS OF ONE DESIGN, AT ONE TRIGGER. Every rule of the design's own project is answered: a
 * rule asked at the other trigger is left out, a rule turned off answers `off`, and a stored rule that does not read is
 * answered `not-checked` whichever trigger is asked, because the office cannot tell when it is asked.
 */
export function judgeADesign(designId: string, trigger: ProjectRuleTrigger): DesignJudgement {
  const design = getRecord(designId)
  if (design === null || design.deletedAt !== null || design.kind !== DESIGN_KIND) {
    throw new PanelError(`No design has the id ${designId}. Nothing was judged.`, 404)
  }
  const designRevision = numbering(design.id).highest
  const chapter = theChapterOfProject(design.workspaceId)
  const judged: DesignJudgement = {
    design: design.id,
    designRevision,
    project: design.workspaceId,
    chapter: chapter?.id ?? null,
    chapterRevision: chapter === null ? null : numbering(chapter.id).highest,
    trigger,
    answers: [],
    reminds: false,
  }
  if (chapter === null) return judged
  const { rules, problems } = theStoredRules(chapter)
  const unread = new Map<number, ProjectRuleProblem[]>()
  for (const problem of problems) unread.set(problem.at, [...(unread.get(problem.at) ?? []), problem])
  for (const [at, found] of unread) {
    const id = found[0]!.rule
    judged.answers.push({
      rule: id,
      heading: null,
      check: null,
      evidence: null,
      source: null,
      answer: 'not-checked',
      says: `${id === null ? `Rule ${String(at + 1)}` : `Rule "${id}"`} does not read as a rule, so it was not checked: ${found.map((one) => one.says).join(' ')}`,
      names: [],
    })
  }
  for (const rule of rules) {
    if (rule.trigger !== trigger) continue
    judged.answers.push(answerOneRule(rule, design, designRevision, rules))
  }
  judged.reminds = judged.answers.some((one) => one.answer !== 'met' && one.answer !== 'off')
  return judged
}

function answerOneRule(rule: ProjectRule, design: PanelRecord, designRevision: number, rules: ProjectRule[]): ProjectRuleJudgement {
  const base = { rule: rule.id, heading: rule.heading, check: rule.check.name, evidence: rule.check.evidence ?? null, source: rule.source }
  const answer = (answer: ProjectRuleAnswer, says: string, names: string[] = []): ProjectRuleJudgement => ({ ...base, answer, says, names })
  const from = `Rule "${rule.id}" comes from ${rule.source}.`
  if (!rule.on) return answer('off', `Rule "${rule.id}" is turned off, so it was not asked.`)
  const data = design.data as unknown as StoredDesign
  switch (rule.check.name) {
    case 'evidence-linked': {
      const name = rule.check.evidence!
      const accounts = (data.evidence ?? []).filter((one) => one.name === name)
      if (accounts.length === 0) return answer('missing', `The design names no evidence account "${name}". ${from}`, [name])
      const unread = accounts.filter((one) => !readable(one.record)).map((one) => one.record)
      if (unread.length > 0) {
        return answer(
          'unreadable',
          `The evidence account "${name}" names ${unread.join(', ')}, which the office cannot read, so it counts as missing. ${from}`,
          unread,
        )
      }
      return answer('met', `The design names the evidence account "${name}", and its record reads.`)
    }
    case 'threshold-names-its-source': {
      const unsourced = (data.thresholds ?? []).filter((one) => (one.source ?? '').trim() === '').map((one) => one.what)
      if (unsourced.length > 0) {
        return answer('missing', `${String(unsourced.length)} threshold${unsourced.length === 1 ? '' : 's'} name no source: ${unsourced.map((one) => `"${one}"`).join(', ')}. ${from}`, unsourced)
      }
      return answer('met', 'Every threshold the design sets names its source.')
    }
    case 'reviewed-design-linked': {
      const review = theReviewAnswerOf(design, designRevision, rules)
      return answer(review.answer, review.answer === 'met' ? review.says : `${review.says} ${from}`, review.names)
    }
  }
}

/** What the review check answers of one design: its answer, its sentence, and the records the answer is about. */
export interface AReviewAnswer {
  answer: ProjectRuleAnswer
  says: string
  names: string[]
}

/**
 * WHETHER A REVIEW THAT COUNTS APPROVES THIS DESIGN AS IT IS NOW, under these rules. A review counts when its reviewer
 * is one `whoMayReviewADesign` names; the newest one that counts is read. It is asked by a project's own
 * "reviewed-design-linked" rule and by the reminder every marked run is given (./design-reminders.ts), so the two
 * cannot answer one design two ways. The sentence names no rule; the rule adds where it comes from.
 */
export function theReviewAnswerOf(design: PanelRecord, designRevision: number, rules: ProjectRule[]): AReviewAnswer {
  const answer = (answer: ProjectRuleAnswer, says: string, names: string[] = []): AReviewAnswer => ({ answer, says, names })
  const reviews = theReviewsOf(design)
  const mayReview = whoMayReviewADesign(design)
  const counted = reviews.filter((one) => mayReview.some((who) => sameParticipant(who, (one.data as unknown as StoredReview).reviewer)))
  if (counted.length === 0) {
    if (reviews.length > 0) {
      return answer(
        'wrong-reviewer',
        `The design's ${String(reviews.length)} review${reviews.length === 1 ? ' is' : 's are'} by somebody it does not count from: a design is reviewed by the agent its assigner answers to, or by the person.`,
        reviews.map((one) => one.id),
      )
    }
    return answer('no-review', 'Nobody has reviewed the design.')
  }
  const newest = counted[counted.length - 1]!
  const review = newest.data as unknown as StoredReview
  if (review.designRevision < designRevision) {
    return answer('stale-review', `The newest review is of the design's revision ${String(review.designRevision)}, and the design is now at ${String(designRevision)}.`, [newest.id])
  }
  if (review.verdict !== 'approved') {
    return answer('changes-asked', 'The newest review asks for changes.', [newest.id])
  }
  const reviewedUnder = review.rulesRevision ?? 0
  const changed = rules.filter((one) => one.revision > reviewedUnder).map((one) => one.id)
  if (changed.length > 0) {
    return answer('rule-changed', `The design was reviewed under the chapter's revision ${String(reviewedUnder)}, and since then ${changed.map((one) => `"${one}"`).join(', ')} changed.`, [newest.id, ...changed])
  }
  return answer('met', 'The newest review by somebody it counts from approves the design as it is now.', [newest.id])
}

/** A review as its writer sends it. */
export interface ADesignReviewSent {
  designRevision: number
  verdict: DesignReviewVerdict
  words: string
}

/**
 * WRITE ONE REVIEW OF ONE DESIGN, the one way a design review is written. The reviewer is written from the key, never
 * from a body: the person proved, or an agent proved by its own agent key. Anybody proved may write one, and the judge
 * says whose review counts, so a review by the wrong agent is kept and answered `wrong-reviewer` rather than lost. The
 * review names the design's current revision, or it is refused, so a review is never of a design its writer did not
 * read. It also keeps the revision of the project's chapter it was written under.
 */
export function writeADesignReview(designId: string, workspaceId: string, sent: ADesignReviewSent, actor: Actor): PanelRecord {
  const design = recordInWorkspace(designId, workspaceId)
  if (design.kind !== DESIGN_KIND) throw new PanelError(`${designId} is not a design, so it cannot be reviewed. Nothing was written.`, 400)
  if (design.deletedAt !== null) throw new PanelError(`The design ${designId} was deleted, so it cannot be reviewed. Nothing was written.`, 409)
  const proved = actor.type === 'human' ? thePersonIsProved(actor) : actor.type === 'agent' && actor.provedBy === 'an-agent-key'
  const reviewer = proved ? participantForActor(actor) : null
  if (reviewer === null) {
    throw new PanelError(
      'A design review is written by the person, or by an agent with its own agent key, so that the office can write who reviewed it. Nothing was written.',
      403,
    )
  }
  if (!(DESIGN_REVIEW_VERDICTS as readonly string[]).includes(sent.verdict)) {
    throw new PanelError(`A review's verdict is ${DESIGN_REVIEW_VERDICTS.join(' or ')}. Nothing was written.`, 400)
  }
  const current = numbering(design.id).highest
  if (sent.designRevision !== current) {
    throw new PanelError(
      `The review names the design's revision ${String(sent.designRevision)}, and the design is at ${String(current)}. Read it again and review that. Nothing was written.`,
      409,
    )
  }
  const chapter = theChapterOfProject(design.workspaceId)
  return asTheProjectRulesDoors(() =>
    createRecord({
      kind: DESIGN_REVIEW_KIND,
      title: `Review of "${design.title}" at revision ${String(current)}`,
      data: {
        design: design.id,
        designRevision: current,
        ...(chapter === null ? {} : { rulesRevision: numbering(chapter.id).highest }),
        verdict: sent.verdict,
        words: sent.words,
        reviewer,
      },
      workspaceId: design.workspaceId,
      actor,
    }),
  )
}

// ============================================================================ the chapter's doors

/** What one rule sent would be, beside what the chapter holds now. */
export interface AProjectRuleAsSent {
  rule: Omit<ProjectRule, 'revision'>
  is: 'new' | 'changed' | 'same'
}

/** What a write of these rules would do, and what would stop it. Nothing is written. */
export interface AProjectChapterPreview {
  project: string
  /** The version the chapter is at now, for the write to send back. */
  version: number | null
  problems: ProjectRuleProblem[]
  rules: AProjectRuleAsSent[]
  /** The ids of the stored rules the write would take out. */
  removed: string[]
  says: string
}

const theChecks = (): AProjectRuleCheck[] =>
  PROJECT_RULE_CHECK_NAMES.map((name) => ({ name, namesEvidence: PROJECT_RULE_CHECKS[name].namesEvidence, asks: PROJECT_RULE_CHECKS[name].asks }))

/** The stored rules of a chapter, each read, and those that do not read named. */
function theStoredRules(chapter: PanelRecord | null): { rules: ProjectRule[]; problems: ProjectRuleProblem[] } {
  if (chapter === null) return { rules: [], problems: [] }
  const stored = chapter.data['rules']
  if (!Array.isArray(stored)) {
    throw new PanelError(`The chapter ${chapter.id} holds no list of rules, which its doors always write. Nothing was read.`, 500)
  }
  const rules: ProjectRule[] = []
  const problems: ProjectRuleProblem[] = []
  stored.forEach((value, at) => {
    const read = readAProjectRule(value, at, true)
    if ('rule' in read) rules.push(read.rule as ProjectRule)
    else problems.push(...read.problems)
  })
  return { rules, problems }
}

/** What the read of a project with no chapter says. */
export const NO_CHAPTER_OF_ITS_OWN =
  "This project keeps no chapter of its own: nobody has written one. The person, or this project's own secretary, may write one."

/** READ THIS PROJECT'S CHAPTER. Any reader may; a project with none answers so, rather than with an empty list. */
export function readTheProjectChapter(workspaceId: string): TheProjectChapter {
  const chapter = theChapterOfProject(workspaceId)
  const { rules, problems } = theStoredRules(chapter)
  const version = chapter === null ? null : numbering(chapter.id).highest
  return {
    project: workspaceId,
    chapter: chapter?.id ?? null,
    version,
    rules,
    problems,
    checks: theChecks(),
    says:
      chapter === null
        ? NO_CHAPTER_OF_ITS_OWN
        : `This project's chapter holds ${String(rules.length)} rule${rules.length === 1 ? '' : 's'} at revision ${String(version)}.` +
          (problems.length === 0 ? '' : ` Some stored rules do not read as rules, and are named in problems.`),
  }
}

/** The fields of a rule a writer sends, in one order, so two rules are compared field by field. */
const asWritten = (rule: Omit<ProjectRule, 'revision'> | ProjectRule): string =>
  JSON.stringify(PROJECT_RULE_FIELDS.map((key) => [key, rule[key]]))

/**
 * READ THE RULES A WRITER SENT, against the closed lists and against each other: each rule as `readAProjectRule` reads
 * it, no id twice, and a source that is a live record of this project.
 */
function readTheRulesSent(sent: unknown[], workspaceId: string): { rules: Omit<ProjectRule, 'revision'>[]; problems: ProjectRuleProblem[] } {
  const rules: Omit<ProjectRule, 'revision'>[] = []
  const problems: ProjectRuleProblem[] = []
  const seen = new Set<string>()
  sent.forEach((value, at) => {
    const read = readAProjectRule(value, at, false)
    if ('problems' in read) {
      problems.push(...read.problems)
      return
    }
    const rule = read.rule
    if (seen.has(rule.id)) {
      problems.push({ at, rule: rule.id, code: 'duplicateId', says: `Rule "${rule.id}" is sent twice. Each rule has its own id.` })
      return
    }
    seen.add(rule.id)
    const source = getRecord(rule.source)
    if (source === null || source.deletedAt !== null || source.workspaceId !== workspaceId) {
      problems.push({ at, rule: rule.id, code: 'notASource', says: `Rule "${rule.id}" names ${rule.source} as its source, and no live record of this project has that id.` })
      return
    }
    rules.push(rule)
  })
  return { rules, problems }
}

/** What the rules sent would change, beside the stored rules. */
function theChange(sent: Omit<ProjectRule, 'revision'>[], stored: ProjectRule[]): { rules: AProjectRuleAsSent[]; removed: string[] } {
  const rules = sent.map((rule): AProjectRuleAsSent => {
    const old = stored.find((one) => one.id === rule.id)
    return { rule, is: old === undefined ? 'new' : asWritten(old) === asWritten(rule) ? 'same' : 'changed' }
  })
  const removed = stored.filter((one) => !sent.some((rule) => rule.id === one.id)).map((one) => one.id)
  return { rules, removed }
}

/** PREVIEW A WRITE OF THESE RULES. Any reader may. Nothing is written. */
export function previewTheProjectChapter(workspaceId: string, sent: unknown[]): AProjectChapterPreview {
  const chapter = theChapterOfProject(workspaceId)
  const stored = theStoredRules(chapter)
  const read = readTheRulesSent(sent, workspaceId)
  const change = theChange(read.rules, stored.rules)
  const changes = change.rules.filter((one) => one.is !== 'same').length + change.removed.length
  return {
    project: workspaceId,
    version: chapter === null ? null : numbering(chapter.id).highest,
    problems: read.problems,
    ...change,
    says:
      read.problems.length > 0
        ? `${String(read.problems.length)} problem${read.problems.length === 1 ? '' : 's'} would stop this write. Nothing was written.`
        : changes === 0
          ? 'A write of these rules would change nothing, so it would be refused. Nothing was written.'
          : `A write would change ${String(changes)} rule${changes === 1 ? '' : 's'}. Nothing was written.`,
  }
}

/**
 * WHO WRITES THIS PROJECT'S CHAPTER: the person, proved, or a secretary using its own key whose duties are filed in this
 * project. A secretary of another project, an agent with no secretary card, and a name sent without a key do not.
 */
export function mayWriteTheProjectChapter(actor: Actor, workspaceId: string): boolean {
  if (thePersonIsProved(actor)) return true
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key') return false
  const who = participantForActor(actor)
  if (who?.kind !== 'agent') return false
  const row = theAgentRowAnIdNames(who.id)
  return row !== null && row.retired !== true && holdsTheSecretaryCard(row) && theDutiesPartFor(workspaceId, row.id).yours !== null
}

/** A write of the chapter as its writer sends it. */
export interface AProjectChapterSent {
  /** The version read: the chapter's revision, or null when there was no chapter. */
  version: number | null
  because: string
  rules: unknown[]
}

/**
 * WRITE THIS PROJECT'S CHAPTER, the one way it is written. The writer is asked first, then the version, then every rule;
 * any refusal changes nothing. A rule that is new or changed takes the number of the revision this write makes, and a
 * rule sent as it stands keeps its own, so a review counts as out of date only for the rules that changed after it.
 */
export function writeTheProjectChapter(workspaceId: string, sent: AProjectChapterSent, actor: Actor): TheProjectChapter {
  if (!mayWriteTheProjectChapter(actor, workspaceId)) {
    refuseChapterEdit("Only the person, or a secretary of this project using its own key, writes this project's chapter.", 403)
  }
  sqlite.transaction(() => {
    const existing = theChapterOfProject(workspaceId)
    const version = existing === null ? null : numbering(existing.id).highest
    if (sent.version !== version) {
      refuseChapterEdit(`The chapter changed after you read it: you read version ${String(sent.version)}, and it is at ${String(version)}. Read it again before applying.`, 409)
    }
    const stored = theStoredRules(existing)
    const read = readTheRulesSent(sent.rules, workspaceId)
    if (read.problems.length > 0) refuseChapterEdit(read.problems.map((one) => one.says).join(' '))
    const change = theChange(read.rules, stored.rules)
    if (change.removed.length === 0 && change.rules.every((one) => one.is === 'same')) {
      refuseChapterEdit(
        existing === null
          ? 'No rule was sent, and the project keeps no chapter, so there is nothing to write.'
          : 'These are the rules the chapter holds, so there is nothing to change.',
      )
    }
    asTheProjectRulesDoors(() => {
      const chapter =
        existing ??
        createRecord({ kind: PROJECT_CHAPTER_KIND, title: "This project's own rules", data: { rules: [] }, workspaceId, actor })
      const next = numbering(chapter.id).highest + 1
      const rules: ProjectRule[] = change.rules.map(({ rule, is }) => ({
        ...rule,
        revision: is === 'same' ? stored.rules.find((one) => one.id === rule.id)!.revision : next,
      }))
      patchRecord(chapter.id, { dataPatch: { rules } }, actor, { op: 'update', note: sent.because })
      const made = numbering(chapter.id).highest
      if (made !== next) {
        throw new PanelError(`The chapter's write made revision ${String(made)}, and its rules were numbered ${String(next)}. Nothing was changed.`, 500)
      }
    })
  })()
  return readTheProjectChapter(workspaceId)
}
