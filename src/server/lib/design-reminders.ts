// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN MARKED AS METHOD WORK, THE REMINDER OF THE REVIEWED DESIGN IT LACKS, AND THE JUDGEMENT AND COUNT OF EACH
 * REMINDER. Part 6 of the design-first build of wave 13s's requirements, on the coordinator's decision
 * bYwACBK03tGT, the answers hL0xQI9EfpCO, the supervisor's decision vinDV1XnZ2dG and the owner's
 * trial. The closed lists and shapes
 * are in src/shared/design-reminders.ts; the doors are in src/server/api/project-rules.ts.
 *
 * THE MARK. The person, or the agent that started the agent a run serves, marks the run once as method work or as the
 * go for a pilot, with a reason, in the run's `methodWork`. The run's own agent may not. A run the office started
 * (`startedByMoleOffice`) is never marked. Only the mark door writes the field (./check-field-doors.ts).
 *
 * THE CHECK. A marked run's designs are the live design records it links by a told about link. A link never crosses
 * projects, so they are in the run's own project. Each is asked whether a review that counts approves it as it is now
 * (`theReviewAnswerOf` in ./project-rules.ts, the same answer a project's own reviewed-design rule gives), and the
 * project's own rules at the mark's trigger (`judgeADesign`). One design with nothing named is enough. A rule that does
 * not read, evidence that cannot be read, and a design that could not be checked are each named, and none is a pass.
 *
 * THE REMINDER. It rides on the reminder before the seal (./before-the-seal.ts asks `whatADesignReminderWouldSay` and
 * `keepADesignReminder`), so it is given only when that reminder is: the run's own key sends the first write that would
 * seal a run that submits work, and the setting MOLE_OFFICE_GATE_BEFORE_THE_SEAL is not off. With that setting off, no
 * design reminder is given either. MOLE_OFFICE_GATE_REVIEWED_DESIGN is this reminder's own setting: remind by default,
 * off to ask nothing, and block to refuse the next sealing write while the same check still names something. Each
 * reminder is kept as a design_reminder record about the run, written as the office.
 *
 * THE JUDGEMENT AND THE MISS. The person, and the secretary the marker answers to when that is not the marker itself,
 * judge each kept reminder once. The same judges file a miss for a marked run that sealed with no design reminder.
 * Only these doors write a design reminder (./project-rules-door.ts, asked by `assertMayWrite` in ./records/may-write.ts).
 *
 * THE COUNT. Each reminder and miss is counted on the day it was filed: right, wrong because the run was not method
 * work, wrong because what it named was there, not judged, and missed. Nothing here sets a threshold.
 */

import type { FastifyRequest } from 'fastify'
import { gatePosition } from '../../config/settings.mjs'
import {
  DESIGN_REMINDER_KIND,
  DESIGN_REMINDER_VERDICTS,
  METHOD_WORKS,
  type ADesignReminderJudgement,
  type ADesignReminderKept,
  type ADesignReminderListed,
  type ADesignReminderNamed,
  type AMethodMark,
  type DesignReminderVerdict,
  type DesignReminderWas,
  type MethodWork,
  type TheDesignReminderCount,
  type TheDesignReminderCounts,
} from '@shared/design-reminders.ts'
import { sameParticipant } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { DESIGN_KIND } from '@shared/project-rules.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { theRunsOwnRequest } from './before-the-seal.ts'
import { asTheDoorOf } from './check-field-doors.ts'
import { theKeyHolderIsTheRegisteredStarterOf, theSecretaryAgentAnswersTo } from './claims.ts'
import { gateMet } from './gate-counts.ts'
import { THE_OFFICE } from './the-office.ts'
import { type RegisteredAgent } from './participants.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { readParticipant } from '../db/read-participant.ts'
import { judgeADesign, readTheProjectChapter, theReviewAnswerOf } from './project-rules.ts'
import { asTheProjectRulesDoors } from './project-rules-door.ts'
import {
  createRecordWithReport,
  getRecord,
  patchRecord,
  recordInWorkspace,
  whetherThisWriteFinishesTheRun,
  type Actor,
  type RecordPatch,
} from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { numbering } from '../db/numbering.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'

/** What `keepADesignReminder` answers, as the reminder before the seal (before-the-seal.ts) reads it from this file. */
export type { ADesignReminderKept }

// ============================================================================ the mark

/** A mark as its writer sends it. Who marked it and when are written from the key and the clock. */
export interface AMethodMarkSent {
  work: MethodWork
  because: string
}

/** The run's mark, or null because nobody marked it. A stored value that is not a mark is a broken assumption. */
export function theMethodMarkOf(run: PanelRecord): AMethodMark | null {
  const stored = run.data['methodWork']
  if (stored === undefined || stored === null) return null
  const mark = stored as Partial<AMethodMark>
  if (
    typeof stored !== 'object' ||
    !(METHOD_WORKS as readonly unknown[]).includes(mark.work) ||
    typeof mark.because !== 'string' ||
    typeof mark.at !== 'string' ||
    typeof mark.by !== 'object' ||
    mark.by === null
  ) {
    throw new PanelError(`Run ${run.id} holds a methodWork that is not a mark, and only the mark door writes one. Nothing was read as method work.`, 500)
  }
  return mark as AMethodMark
}

/** The registered agent a run serves, or null because the run names none the office knows. */
function theAgentOf(run: PanelRecord): RegisteredAgent | null {
  const id = theAgentARunServes(run.data)?.id ?? null
  return id === null ? null : (readParticipant({ kind: 'agent', id }) as RegisteredAgent | null)
}

/** Whether this caller is the agent that started the run's agent, proved by its own agent key. */
function theStarterOfTheRunsAgentIsAsking(run: PanelRecord, actor: Actor): ParticipantRef | null {
  const proved = theAgentTheKeyProves(actor)
  if (actor.type !== 'agent' || actor.provedHolder !== undefined || proved === null || actor.keyHolder === undefined) return null
  const agent = theAgentOf(run)
  return agent !== null && theKeyHolderIsTheRegisteredStarterOf(agent, actor.keyHolder) ? { kind: 'agent', id: proved } : null
}

const thePerson = (actor: Actor): ParticipantRef | null => (actor.type === 'human' && thePersonIsProved(actor) ? { kind: 'person', id: THE_PERSON } : null)

/**
 * MARK A RUN AS METHOD WORK OR GO, once. The person, or the agent that started the run's agent with its own key, marks
 * it; the run's own agent, any other agent and a name with no key are refused. A run the office started is refused,
 * because the office tells its own runs by its own classification and not by a mark.
 */
export function markARunAsMethodWork(runId: string, workspaceId: string, sent: AMethodMarkSent, actor: Actor): { methodWork: AMethodMark } {
  const run = recordInWorkspace(runId, workspaceId)
  if (run.kind !== 'session') throw new PanelError(`${runId} is not a run, so it cannot be marked. Nothing was written.`, 400)
  if (run.deletedAt !== null) throw new PanelError(`The run ${runId} was deleted, so it cannot be marked. Nothing was written.`, 409)
  const by = thePerson(actor) ?? theStarterOfTheRunsAgentIsAsking(run, actor)
  if (by === null) {
    throw new PanelError(
      'A run is marked as method work by the person, or by the agent that started the agent the run serves, with its own key. The run\'s own agent may not mark it. Nothing was written.',
      403,
    )
  }
  if (run.data['startedByMoleOffice'] === true) {
    throw new PanelError(`Run ${run.id} was started by the office, and the office tells its own runs apart by itself, so it is not marked. Nothing was written.`, 409)
  }
  const held = theMethodMarkOf(run)
  if (held !== null) {
    throw new PanelError(`Run ${run.id} was already marked as ${held.work} at ${held.at}, and a run is marked once. Nothing was written.`, 409)
  }
  const methodWork: AMethodMark = { work: sent.work, because: sent.because, by, at: localStamp(new Date()) }
  asTheDoorOf('methodWork', () => patchRecord(run.id, { dataPatch: { methodWork } }, actor))
  return { methodWork }
}

// ============================================================================ the check

/** The live designs a run links by a told about link, oldest link first. */
function theDesignsARunLinks(run: PanelRecord): PanelRecord[] {
  const rows = sqlite
    .prepare(
      `SELECT r.id FROM links l JOIN records r ON r.id = l.to_id
       WHERE l.from_id = ? AND l.type = 'about' AND l.inferred = 0 AND r.kind = ? AND r.deleted_at IS NULL AND r.workspace_id = ?
       ORDER BY l.rowid`,
    )
    .all(run.id, DESIGN_KIND, run.workspaceId) as { id: string }[]
  return [...new Set(rows.map((row) => row.id))].map((id) => getRecord(id)).filter((one): one is PanelRecord => one !== null)
}

/** What one design lacks for a run marked with this work: nothing, or each lack in its own entry. */
function whatOneDesignLacks(design: PanelRecord, work: MethodWork): ADesignReminderNamed[] {
  const designRevision = numbering(design.id).highest
  let chapterRevision: number | null = null
  // THE REVIEW THAT COUNTED: the newest one whose reviewer may review this design. No review, or none that counts,
  // leaves it null, and so does a check that could not read the review at all.
  let counted: string | null = null
  const named = (answer: ADesignReminderNamed['answer'], rule: string | null, source: string | null, says: string): ADesignReminderNamed => ({
    design: design.id,
    answer,
    rule,
    source,
    designRevision,
    chapterRevision,
    review: counted,
    says: `Design ${design.id}: ${says}`,
  })
  // A DESIGN THAT CANNOT BE CHECKED IS NAMED, never passed: a project holding two chapters, say.
  try {
    const lacks: ADesignReminderNamed[] = []
    const chapter = readTheProjectChapter(design.workspaceId)
    chapterRevision = chapter.version
    const review = theReviewAnswerOf(design, designRevision, chapter.rules)
    // `names` begins with the newest review that counted, except where none did: `wrong-reviewer` names the reviews
    // that did not count, and `no-review` names none.
    counted = review.answer === 'no-review' || review.answer === 'wrong-reviewer' ? null : (review.names[0] ?? null)
    if (review.answer !== 'met' && review.answer !== 'off') lacks.push(named(review.answer, null, null, review.says))
    // THE PROJECT'S OWN REVIEW RULE asks what the review answer above already asked, so it is not named twice.
    for (const one of judgeADesign(design.id, work).answers) {
      if (one.answer === 'met' || one.answer === 'off' || one.check === 'reviewed-design-linked') continue
      lacks.push(named(one.answer, one.rule, one.source, one.says))
    }
    return lacks
  } catch (err) {
    return [named('not-checked', null, null, `it could not be checked: ${err instanceof Error ? err.message : String(err)}`)]
  }
}

/** What a run marked with this work lacks of a reviewed design: nothing, or each lack. */
export function whatTheDesignsOfARunLack(run: PanelRecord, work: MethodWork): ADesignReminderNamed[] {
  const designs = theDesignsARunLinks(run)
  if (designs.length === 0) {
    return [
      {
        design: null,
        answer: 'no-design',
        rule: null,
        source: null,
        designRevision: null,
        chapterRevision: null,
        review: null,
        says: `Run ${run.id} links no design. Link the design it follows to the run with an about link, and have the design reviewed.`,
      },
    ]
  }
  const lacks = designs.map((design) => whatOneDesignLacks(design, work))
  return lacks.some((one) => one.length === 0) ? [] : lacks.flat()
}

/** What the design reminder of one run would say, before it is kept. */
export interface ADesignReminderWouldSay {
  position: 'remind' | 'block'
  work: MethodWork
  markedBy: ParticipantRef
  named: ADesignReminderNamed[]
  says: string
}

/**
 * WHAT THE DESIGN REMINDER OF THIS RUN WOULD SAY, or null because none is due: nobody marked the run, the setting is
 * off, or one design the run links lacks nothing. It writes nothing.
 */
export function whatADesignReminderWouldSay(run: PanelRecord): ADesignReminderWouldSay | null {
  const mark = theMethodMarkOf(run)
  if (mark === null) return null
  const position = String(gatePosition('reviewed-design-before-method-work'))
  if (position === 'off') return null
  if (position !== 'remind' && position !== 'block') {
    throw new PanelError(`The setting of the reviewed design reminder holds "${position}", which is not remind, block or off.`, 500)
  }
  const named = whatTheDesignsOfARunLack(run, mark.work)
  if (named.length === 0) return null
  const as = mark.work === 'go' ? 'the go for a pilot' : 'method work'
  return {
    position,
    work: mark.work,
    markedBy: mark.by,
    named,
    says:
      `Reviewed design: this run is marked as ${as}, and no design it links has a review that counts and meets the project's rules. ` +
      named.map((one) => one.says).join(' ') +
      (position === 'block' ? ' At block, the next write that would seal is refused while the same check still names something.' : ''),
  }
}

/**
 * KEEP THE REMINDER AS A DESIGN REMINDER RECORD ABOUT THE RUN, written as the office, and count it. Never throws: what
 * could not be kept or counted is answered in `notKept`, beside a reminder that was still given in the office's line.
 */
export function keepADesignReminder(run: PanelRecord, would: ADesignReminderWouldSay, line: string): ADesignReminderKept {
  const failed: string[] = []
  let reminder: string | null = null
  try {
    reminder = asTheProjectRulesDoors(() =>
      createRecordWithReport({
        kind: DESIGN_REMINDER_KIND,
        title: `Reminder of a reviewed design for run "${run.title}"`,
        workspaceId: run.workspaceId,
        data: {
          run: run.id,
          work: would.work,
          markedBy: would.markedBy,
          was: 'reminded' satisfies DesignReminderWas,
          named: would.named,
          reminderLine: line,
          afterSeal: typeof run.data['sealedTip'] === 'string' ? run.data['sealedTip'] : null,
          missWords: null,
          judgement: null,
        },
        links: [{ type: 'about', toId: run.id }],
        actor: THE_OFFICE,
        bindCallerSession: false,
        namesWhatIsAlreadyFiled: false,
      }).record.id,
    )
  } catch (err) {
    failed.push(`The office could not keep the design reminder of run ${run.id}: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    gateMet('reviewed-design-before-method-work', would.position)
  } catch (err) {
    failed.push(`The office could not count the design reminder of run ${run.id}: ${err instanceof Error ? err.message : String(err)}`)
  }
  return { reminder, says: would.says, named: would.named, ...(failed.length === 0 ? {} : { notKept: failed.join(' ') }) }
}

/** The kept reminder of this run for its current seal, or null. */
function theReminderKeptFor(run: PanelRecord): PanelRecord | null {
  const afterSeal = typeof run.data['sealedTip'] === 'string' ? run.data['sealedTip'] : null
  const row = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL
       AND json_extract(data, '$.run') = ? AND json_extract(data, '$.was') = 'reminded'
       AND ${afterSeal === null ? "json_extract(data, '$.afterSeal') IS NULL" : "json_extract(data, '$.afterSeal') = ?"}
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(...[DESIGN_REMINDER_KIND, run.workspaceId, run.id, ...(afterSeal === null ? [] : [afterSeal])]) as { id: string } | undefined
  return row === undefined ? null : getRecord(row.id)
}

/**
 * ASKED BY THE RECORD DOOR AFTER THE REMINDER BEFORE THE SEAL, at block only. A write with the run's own key that
 * would finish a marked run, after the run was given a design reminder for this seal, is refused while the same check
 * still names something. The refusal is counted; nothing of the write is stored.
 */
export function refuseTheSealOverAMissingDesign(req: FastifyRequest, before: PanelRecord, patch: Pick<RecordPatch, 'kind' | 'data' | 'dataPatch'>): void {
  if (before.kind !== 'session' || (patch.kind !== undefined && patch.kind !== 'session')) return
  const { explicitlyFinishes, aVerdictClosedIt } = whetherThisWriteFinishesTheRun(before, patch)
  if (!explicitlyFinishes || aVerdictClosedIt !== undefined) return
  if (String(gatePosition('reviewed-design-before-method-work')) !== 'block') return
  const mark = theMethodMarkOf(before)
  if (mark === null || !theRunsOwnRequest(req, before) || theReminderKeptFor(before) === null) return
  const named = whatTheDesignsOfARunLack(before, mark.work)
  if (named.length === 0) return
  // The door has not entered patchRecord's transaction, so its refusal cannot roll this count back.
  gateMet('reviewed-design-before-method-work', 'block')
  throw new PanelError(
    `This run cannot seal: it is marked as ${mark.work}, and the check of its reviewed design still names what it lacks. ` +
      named.map((one) => one.says).join(' ') +
      ' Nothing was written: no seal was made and nothing on the run changed. Link a reviewed design that meets the rules, then seal again.',
    409,
    undefined,
    undefined,
    'A missing reviewed design refuses this seal.',
  )
}

// ============================================================================ the judgement and the miss

/** Who may judge a reminder of a run this participant marked: the person, and the secretary the marker answers to. */
export function whoMayJudgeADesignReminder(markedBy: ParticipantRef): ParticipantRef[] {
  const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
  if (markedBy.kind !== 'agent') return [person]
  const secretary = theSecretaryAgentAnswersTo(markedBy.id)
  if (secretary === null || secretary.id === markedBy.id) return [person]
  return [person, secretary]
}

/** The judge asking, proved by the person's key or by the secretary's own agent key, or null. */
function theJudgeAsking(markedBy: ParticipantRef, actor: Actor): ParticipantRef | null {
  const person = thePerson(actor)
  const proved = actor.type === 'agent' && actor.provedHolder === undefined ? theAgentTheKeyProves(actor) : null
  const asking: ParticipantRef | null = person ?? (proved === null ? null : { kind: 'agent', id: proved })
  return asking !== null && whoMayJudgeADesignReminder(markedBy).some((one) => sameParticipant(one, asking)) ? asking : null
}

const ONLY_THE_JUDGES =
  'A design reminder is judged, and a miss is filed, by the person or by the secretary the marker answers to, with its own key. Nothing was written.'

/** A judgement as its judge sends it. */
export interface ADesignReminderJudgementSent {
  verdict: DesignReminderVerdict
  words?: string | undefined
}

/** JUDGE ONE KEPT REMINDER, once. A miss is not judged: it is already a judge's word. */
export function judgeADesignReminder(id: string, workspaceId: string, sent: ADesignReminderJudgementSent, actor: Actor): { judgement: ADesignReminderJudgement } {
  const reminder = recordInWorkspace(id, workspaceId)
  if (reminder.kind !== DESIGN_REMINDER_KIND) throw new PanelError(`${id} is not a design reminder, so it cannot be judged. Nothing was written.`, 400)
  if (reminder.deletedAt !== null) throw new PanelError(`The design reminder ${id} was deleted, so it cannot be judged. Nothing was written.`, 409)
  const by = theJudgeAsking(reminder.data['markedBy'] as ParticipantRef, actor)
  if (by === null) throw new PanelError(ONLY_THE_JUDGES, 403)
  if (!(DESIGN_REMINDER_VERDICTS as readonly string[]).includes(sent.verdict)) {
    throw new PanelError(`A judgement's verdict is ${DESIGN_REMINDER_VERDICTS.join(', ')}. Nothing was written.`, 400)
  }
  if (reminder.data['was'] === 'missed') throw new PanelError(`${id} is a miss a judge filed, and a miss is not judged again. Nothing was written.`, 409)
  const held = reminder.data['judgement'] as ADesignReminderJudgement | null
  if (held !== null) throw new PanelError(`${id} was already judged ${held.verdict} at ${held.at}, and a reminder is judged once. Nothing was written.`, 409)
  const judgement: ADesignReminderJudgement = { verdict: sent.verdict, words: sent.words ?? null, by, at: localStamp(new Date()) }
  asTheProjectRulesDoors(() => patchRecord(reminder.id, { dataPatch: { judgement } }, actor))
  return { judgement }
}

/**
 * FILE A MISS: a marked run that sealed with no design reminder, and should have had one. The judges of its reminder
 * file it, with words, once; a run that was given a design reminder has no miss.
 */
export function fileAMissedDesignReminder(runId: string, workspaceId: string, words: string, actor: Actor): { reminder: string } {
  const run = recordInWorkspace(runId, workspaceId)
  if (run.kind !== 'session') throw new PanelError(`${runId} is not a run, so no miss is filed for it. Nothing was written.`, 400)
  if (run.deletedAt !== null) throw new PanelError(`The run ${runId} was deleted, so no miss is filed for it. Nothing was written.`, 409)
  const mark = theMethodMarkOf(run)
  if (mark === null) throw new PanelError(`Nobody marked run ${run.id} as method work, so it had no design reminder to miss. Nothing was written.`, 409)
  if (theJudgeAsking(mark.by, actor) === null) throw new PanelError(ONLY_THE_JUDGES, 403)
  if (typeof run.data['sealedTip'] !== 'string') throw new PanelError(`Run ${run.id} has not sealed, so its reminder may still come. Nothing was written.`, 409)
  const filed = sqlite
    .prepare(`SELECT id FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL AND json_extract(data, '$.run') = ? LIMIT 1`)
    .get(DESIGN_REMINDER_KIND, run.workspaceId, run.id) as { id: string } | undefined
  if (filed !== undefined) {
    throw new PanelError(`Run ${run.id} already has the design reminder or miss ${filed.id}, so no miss is filed. Nothing was written.`, 409)
  }
  const made = asTheProjectRulesDoors(() =>
    createRecordWithReport({
      kind: DESIGN_REMINDER_KIND,
      title: `Missed reminder of a reviewed design for run "${run.title}"`,
      workspaceId: run.workspaceId,
      data: { run: run.id, work: mark.work, markedBy: mark.by, was: 'missed' satisfies DesignReminderWas, named: [], reminderLine: null, afterSeal: null, missWords: words, judgement: null },
      links: [{ type: 'about', toId: run.id }],
      actor,
      bindCallerSession: false,
      namesWhatIsAlreadyFiled: false,
    }),
  )
  return { reminder: made.record.id }
}

// ============================================================================ the count

const A_DAY = /^\d{4}-\d{2}-\d{2}$/u

/** A day as YYYY-MM-DD that is a real date, or a refusal naming what was sent. */
function aDay(sent: string, which: 'from' | 'to'): string {
  // A month or day past the calendar's parses to no time at all, and a 31st of a short month rolls into the next one.
  const at = A_DAY.test(sent) ? Date.parse(`${sent}T00:00:00Z`) : Number.NaN
  const real = !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === sent
  if (!real) throw new PanelError(`"${which}" is a day written YYYY-MM-DD, and "${sent}" is not one. Nothing was counted.`, 400)
  return sent
}

/** The day `n` days before this one, by the calendar. */
const daysBefore = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

/**
 * COUNT THE DESIGN REMINDERS AND MISSES OF ONE PROJECT, by the day each was filed, from `from` to `to`, both counted.
 * Left out, the range is the seven days to today in the office's clock.
 */
export function countTheDesignReminders(workspaceId: string, from?: string, to?: string): TheDesignReminderCount {
  const last = to === undefined ? localStamp(new Date()).slice(0, 10) : aDay(to, 'to')
  const first = from === undefined ? daysBefore(last, 6) : aDay(from, 'from')
  if (first > last) throw new PanelError(`The range begins on ${first} and ends on ${last}, before it begins. Nothing was counted.`, 400)
  const rows = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at <= ?
       ORDER BY created_at, rowid`,
    )
    .all(DESIGN_REMINDER_KIND, workspaceId, `${first} 00:00:00`, `${last} 23:59:59`) as { id: string }[]
  const counts: TheDesignReminderCounts = { right: 0, wrongNotMethodWork: 0, wrongItWasThere: 0, notJudged: 0, misses: 0 }
  const reminders: ADesignReminderListed[] = []
  for (const row of rows) {
    const record = getRecord(row.id)
    if (record === null) continue
    const data = record.data as Record<string, unknown>
    const was = data['was'] as DesignReminderWas
    const judgement = (data['judgement'] ?? null) as ADesignReminderJudgement | null
    const markedBy = data['markedBy'] as ParticipantRef
    if (was === 'missed') counts.misses += 1
    else if (judgement === null) counts.notJudged += 1
    else if (judgement.verdict === 'right') counts.right += 1
    else if (judgement.verdict === 'wrong-not-method-work') counts.wrongNotMethodWork += 1
    else counts.wrongItWasThere += 1
    reminders.push({
      id: record.id,
      run: String(data['run']),
      was,
      at: record.createdAt,
      work: data['work'] as MethodWork,
      markedBy,
      named: (data['named'] ?? []) as ADesignReminderNamed[],
      words: (data['missWords'] ?? null) as string | null,
      judgement,
      judges: whoMayJudgeADesignReminder(markedBy),
    })
  }
  return {
    project: workspaceId,
    from: first,
    to: last,
    counts,
    reminders,
    says:
      reminders.length === 0
        ? `No design reminder was given and no miss was filed in this project from ${first} to ${last}.`
        : `From ${first} to ${last}: ${String(counts.right)} right, ${String(counts.wrongNotMethodWork)} wrong because the run was not method work, ` +
          `${String(counts.wrongItWasThere)} wrong because what it named was there, ${String(counts.notJudged)} not judged, and ${String(counts.misses)} missed.`,
  }
}
