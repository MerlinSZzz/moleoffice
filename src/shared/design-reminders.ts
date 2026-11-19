// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN MARKED AS METHOD WORK, AND THE REMINDER OF THE REVIEWED DESIGN IT LACKS: the closed lists and the shapes the
 * server and the page share. Part 6 of the design-first build of wave 13s's requirements, on the coordinator's decision
 * bYwACBK03tGT and the supervisor's vinDV1XnZ2dG. The rules are in src/server/lib/design-reminders.ts. The browser may
 * import this file.
 *
 * THE MARK. Whoever answers for a run says, once, whether it is method work or the go for a pilot, and why. Only that
 * mark makes a run method work; the office never guesses it from a run's words.
 *
 * THE REMINDER. Before the seal of a marked run, the office asks the designs the run links. One design that a review
 * counts for, and that meets the project's own rules at the mark's work, is enough. Otherwise the reminder names what
 * each design lacks, and the office keeps it as a design reminder record.
 *
 * THE JUDGEMENT. The secretary the marker answers to, or the person, judges each kept reminder once: right, wrong
 * because the run was not method work, or wrong because what it named was there. A reminder nobody judged is counted
 * as not judged, never as right or wrong. A marked run that was sealed with no reminder, and should have had one, is a
 * miss when one of the same judges files it.
 */

import type { ParticipantRef } from './participants.ts'
import { PROJECT_RULE_ANSWERS, PROJECT_RULE_TRIGGERS, type ProjectRuleAnswer, type ProjectRuleTrigger } from './project-rules.ts'

export const DESIGN_REMINDER_KIND = 'design_reminder' as const

/** WHAT A MARK SAYS A RUN IS: method work, or the go for a pilot. They are the triggers a project's rules are asked at. */
export const METHOD_WORKS = PROJECT_RULE_TRIGGERS
export type MethodWork = ProjectRuleTrigger

/** A run's mark, as its door stores it in the run's `methodWork`. */
export interface AMethodMark {
  work: MethodWork
  because: string
  by: ParticipantRef
  at: string
}

/** WHAT A JUDGE SAYS OF ONE REMINDER. The two wrongs are counted apart. */
export const DESIGN_REMINDER_VERDICTS = ['right', 'wrong-not-method-work', 'wrong-it-was-there'] as const
export type DesignReminderVerdict = (typeof DESIGN_REMINDER_VERDICTS)[number]

/** Whether a record is a reminder the office gave before a seal, or a miss a judge filed after one. */
export const DESIGN_REMINDER_WAS = ['reminded', 'missed'] as const
export type DesignReminderWas = (typeof DESIGN_REMINDER_WAS)[number]

/**
 * WHAT ONE LACK IS. `no-design` is a run that links no design of its project. Every other answer is what the review
 * check, or one of the project's own rules, answers of one design; `met` and `off` are never a lack.
 */
export type DesignReminderAnswer = 'no-design' | Exclude<ProjectRuleAnswer, 'met' | 'off'>
export const DESIGN_REMINDER_ANSWERS: readonly DesignReminderAnswer[] = [
  'no-design',
  ...PROJECT_RULE_ANSWERS.filter((one): one is Exclude<ProjectRuleAnswer, 'met' | 'off'> => one !== 'met' && one !== 'off'),
]

/**
 * One lack a reminder names. The revision fields were added after the first reminders were kept, so a record kept
 * before them holds no such fields: a reader treats an absent one as null rather than as a fault. The office never
 * rewrites an old reminder to fill them in.
 */
export interface ADesignReminderNamed {
  /** The design it is about, or null for `no-design`. */
  design: string | null
  answer: DesignReminderAnswer
  /** The project's own rule that answered, or null for the review check every marked run is asked. */
  rule: string | null
  /** The record the rule comes from, or null. */
  source: string | null
  /** The design's revision the check read, or null for `no-design`. */
  designRevision?: number | null
  /** The project's chapter revision the check read, or null because the project keeps none or it could not be read. */
  chapterRevision?: number | null
  /** The review record that counted for the design, or null because none counted. */
  review?: string | null
  /** The lack in an English sentence, for an agent. A page draws `answer` in its own words instead. */
  says: string
}

/** One judgement of one reminder. */
export interface ADesignReminderJudgement {
  verdict: DesignReminderVerdict
  words: string | null
  by: ParticipantRef
  at: string
}

/** What the reply to a sealing write carries of the reminder, beside the reminder before the seal. */
export interface ADesignReminderKept {
  /** The design reminder record, or null because the office could not keep it, and then `notKept` says why. */
  reminder: string | null
  says: string
  named: ADesignReminderNamed[]
  notKept?: string
}

/** One reminder or miss in the count. */
export interface ADesignReminderListed {
  id: string
  run: string
  was: DesignReminderWas
  /** When the office kept it, or when the miss was filed. */
  at: string
  work: MethodWork
  markedBy: ParticipantRef
  named: ADesignReminderNamed[]
  /** A miss's words; null on a reminder. */
  words: string | null
  judgement: ADesignReminderJudgement | null
  /** Who may judge it: the person, and the secretary the marker answers to. */
  judges: ParticipantRef[]
}

/** The five counts, as the week's end shows them. */
export interface TheDesignReminderCounts {
  right: number
  wrongNotMethodWork: number
  wrongItWasThere: number
  notJudged: number
  misses: number
}

/** What GET /api/office-regulations/projects/current/design-reminders answers. */
export interface TheDesignReminderCount {
  project: string
  /** The first and last day counted, both counted, as YYYY-MM-DD in the office's clock. */
  from: string
  to: string
  counts: TheDesignReminderCounts
  reminders: ADesignReminderListed[]
  says: string
}

// ============================================================================ the refusal

/** Why a design reminder is refused at POST /api/records and every other general write door. */
export const A_DESIGN_REMINDER_IS_WRITTEN_BY_ITS_DOORS =
  'A design reminder is written only by the office before a seal, and judged or filed as a miss only through its own ' +
  'doors, so that the office writes who judged it from the key and the count stays true. Nothing was written.'

/** The same refusal with the doors named. */
export const THE_DESIGN_REMINDER_DOORS =
  'Judge one with POST /api/design-reminders/<id>/judgement, and file a miss with POST /api/runs/<run>/missed-design-reminder.'
