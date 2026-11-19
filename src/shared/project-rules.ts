// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PROJECT'S OWN RULES, AND THE CLOSED LIST OF CHECKS A RULE MAY NAME. The design-first build of wave 13s's
 * requirements: a project keeps a chapter of its own, beside the office's general chapters and never one of them, and
 * each rule in it names one check from the list below. No project writes a check. A rule only reminds.
 *
 * WHAT IS HERE: the three kind words, the triggers, the one effect, the checks, a review's two verdicts, what a check
 * answers of a design, and `readAProjectRule`, the one reader of a rule that the door asks before it writes and the
 * judge asks before it checks. The browser may import it.
 *
 * A RULE'S TEXT IS NOT READ FOR ITS MEANING. The door refuses a rule by its fields: a field nobody declared, a field
 * that would set a general rule aside, a field or check that names a program, and every value outside the closed
 * lists. A heading or a text that says "ignore chapter 5" is stored as words, and it reminds of nothing but its check.
 */

export const PROJECT_CHAPTER_KIND = 'project_chapter' as const
export const DESIGN_KIND = 'design' as const
export const DESIGN_REVIEW_KIND = 'design_review' as const

/** WHEN A RULE IS ASKED: method work, or the go for a pilot. */
export const PROJECT_RULE_TRIGGERS = ['method-work', 'go'] as const
export type ProjectRuleTrigger = (typeof PROJECT_RULE_TRIGGERS)[number]

/** WHAT A RULE DOES WHEN ITS CHECK IS NOT MET. Only a reminder: a refusal is a later setting, off by default. */
export const PROJECT_RULE_EFFECTS = ['remind'] as const
export type ProjectRuleEffect = (typeof PROJECT_RULE_EFFECTS)[number]

/**
 * THE CLOSED LIST OF CHECKS, as data. Each says what it asks, and whether a rule naming it names one evidence account.
 * A project picks a check from here; it cannot add one.
 */
export const PROJECT_RULE_CHECKS = {
  'evidence-linked': {
    namesEvidence: true,
    asks: 'The design names an evidence account of this name, and the record it names can be read.',
  },
  'reviewed-design-linked': {
    namesEvidence: false,
    asks:
      "The design's newest review by the agent it answers to, or by the person, approves the design's current revision " +
      'under the rules as they are now.',
  },
  'threshold-names-its-source': {
    namesEvidence: false,
    asks: 'Every new threshold or gate the design sets names where its number comes from.',
  },
} as const
export type ProjectRuleCheckName = keyof typeof PROJECT_RULE_CHECKS
export const PROJECT_RULE_CHECK_NAMES = Object.keys(PROJECT_RULE_CHECKS) as ProjectRuleCheckName[]

/** A review's two verdicts. */
export const DESIGN_REVIEW_VERDICTS = ['approved', 'changes-asked'] as const
export type DesignReviewVerdict = (typeof DESIGN_REVIEW_VERDICTS)[number]

/**
 * WHAT ONE RULE ANSWERS OF ONE DESIGN. `met` alone is no reminder. `unreadable` counts as missing and is named apart, so
 * a reader can tell *nobody linked it* from *the office could not read what was linked*. `not-checked` is a stored rule
 * that does not read as a rule, and it is never taken as met. `off` is a rule its project turned off.
 */
export const PROJECT_RULE_ANSWERS = [
  'met',
  'missing',
  'unreadable',
  'no-review',
  'changes-asked',
  'stale-review',
  'wrong-reviewer',
  'rule-changed',
  'not-checked',
  'off',
] as const
export type ProjectRuleAnswer = (typeof PROJECT_RULE_ANSWERS)[number]

/** An evidence account's name, as a rule and a design both write it. */
export const EVIDENCE_NAME = /^[a-z][a-z0-9_]{1,59}$/u

/** One rule as it is stored. `revision` is written by the door: the chapter's revision at which this rule last changed. */
export interface ProjectRule {
  id: string
  heading: string
  text: string
  reason: string
  source: string
  trigger: ProjectRuleTrigger
  check: { name: ProjectRuleCheckName; evidence?: string }
  effect: ProjectRuleEffect
  on: boolean
  revision: number
}

/** The fields a rule is written with. `revision` is the door's, so a writer that sends one is refused. */
export const PROJECT_RULE_FIELDS = ['id', 'heading', 'text', 'reason', 'source', 'trigger', 'check', 'effect', 'on'] as const
const STORED_ONLY = 'revision'

/**
 * FIELD NAMES THAT WOULD SET A GENERAL RULE ASIDE. A project's rule adds a reminder; it never overrides, replaces, waives
 * or exempts from a rule of the office's chapters, so a rule carrying one of these is refused with its own reason
 * rather than as a field nobody declared.
 */
export const WEAKENING_FIELDS = ['overrides', 'replaces', 'waives', 'exempts', 'instead', 'general', 'chapter', 'allow', 'skip'] as const

/** EFFECTS THAT WOULD SET A GENERAL RULE ASIDE, refused with the same reason. */
export const WEAKENING_EFFECTS = ['allow', 'waive', 'exempt', 'skip', 'override', 'pass'] as const

/** FIELD NAMES THAT WOULD MAKE A RULE RUN SOMETHING. A check is one of the closed list, and never a program. */
export const PROGRAM_FIELDS = ['program', 'script', 'command', 'code', 'expression', 'exec', 'run', 'url', 'path', 'regex', 'query', 'function'] as const

/** Why the door refuses a rule, one code each. */
export type ProjectRuleProblemCode =
  | 'notAnObject'
  | 'unknownField'
  | 'missingField'
  | 'weakensAGeneralRule'
  | 'namesAProgram'
  | 'unknownTrigger'
  | 'unknownEffect'
  | 'unknownCheck'
  | 'evidenceName'
  | 'duplicateId'
  | 'notASource'
  | 'revisionIsTheDoors'

export interface ProjectRuleProblem {
  /** The rule's place in the list, from 0. */
  at: number
  /** The rule's id where it has one. */
  rule: string | null
  code: ProjectRuleProblemCode
  says: string
}

/** The closed list of checks, as the doors show it beside the rules. */
export interface AProjectRuleCheck {
  name: ProjectRuleCheckName
  namesEvidence: boolean
  asks: string
}

/** A project's chapter as its doors read it (src/server/lib/project-rules.ts), and as the regulations page draws it. */
export interface TheProjectChapter {
  project: string
  /** The chapter's record, or null because this project keeps none. */
  chapter: string | null
  /** What a writer sends back as the version it read: the chapter's revision, or null while there is no chapter. */
  version: number | null
  rules: ProjectRule[]
  /** Stored rules that do not read as rules, each named, so the list above is never taken for the whole chapter. */
  problems: ProjectRuleProblem[]
  checks: AProjectRuleCheck[]
  says: string
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const isAnObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const listed = (list: readonly string[], value: string): boolean => list.includes(value.toLowerCase())

/**
 * READ ONE RULE AS A WRITER SENT IT, or as it is stored. Answers the rule, without its revision, or every problem found.
 * `stored` true reads a stored rule, which carries the door's revision; false reads a writer's, which may not.
 */
export function readAProjectRule(value: unknown, at: number, stored: boolean): { rule: Omit<ProjectRule, 'revision'> & { revision?: number } } | { problems: ProjectRuleProblem[] } {
  if (!isAnObject(value)) return { problems: [{ at, rule: null, code: 'notAnObject', says: `Rule ${String(at + 1)} is not an object of named fields.` }] }
  const id = isText(value['id']) ? value['id'].trim() : null
  const problems: ProjectRuleProblem[] = []
  const say = (code: ProjectRuleProblemCode, says: string): void => void problems.push({ at, rule: id, code, says })
  const name = id === null ? `Rule ${String(at + 1)}` : `Rule "${id}"`
  for (const key of Object.keys(value)) {
    if ((PROJECT_RULE_FIELDS as readonly string[]).includes(key)) continue
    if (key === STORED_ONLY) {
      if (!stored) say('revisionIsTheDoors', `${name} sends a revision. The door writes a rule's revision itself; leave it out.`)
      continue
    }
    if (listed(WEAKENING_FIELDS, key)) say('weakensAGeneralRule', `${name} has the field "${key}". A project's rule adds a reminder and never sets a general rule aside.`)
    else if (listed(PROGRAM_FIELDS, key)) say('namesAProgram', `${name} has the field "${key}". A rule names one check from the closed list and never a program.`)
    else say('unknownField', `${name} has the field "${key}", which a rule does not have. A rule has ${PROJECT_RULE_FIELDS.join(', ')}.`)
  }
  for (const key of ['id', 'heading', 'text', 'reason', 'source'] as const) {
    if (!isText(value[key])) say('missingField', `${name} has no ${key} in words.`)
  }
  const trigger = value['trigger']
  if (typeof trigger !== 'string' || !(PROJECT_RULE_TRIGGERS as readonly string[]).includes(trigger)) {
    say('unknownTrigger', `${name} has the trigger ${JSON.stringify(trigger ?? null)}. A rule is asked at ${PROJECT_RULE_TRIGGERS.join(' or ')}.`)
  }
  const effect = value['effect']
  if (typeof effect === 'string' && listed(WEAKENING_EFFECTS, effect)) {
    say('weakensAGeneralRule', `${name} has the effect "${effect}". A project's rule only reminds, and never sets a general rule aside.`)
  } else if (typeof effect !== 'string' || !(PROJECT_RULE_EFFECTS as readonly string[]).includes(effect)) {
    say('unknownEffect', `${name} has the effect ${JSON.stringify(effect ?? null)}. A rule's one effect is ${PROJECT_RULE_EFFECTS.join(', ')}.`)
  }
  if (typeof value['on'] !== 'boolean') say('missingField', `${name} does not say whether it is on, as true or false.`)
  if (stored && (typeof value[STORED_ONLY] !== 'number' || !Number.isInteger(value[STORED_ONLY]) || (value[STORED_ONLY] as number) < 0)) {
    say('missingField', `${name} has no revision the door wrote.`)
  }
  const check = value['check']
  let readCheck: ProjectRule['check'] | null = null
  if (!isAnObject(check)) {
    say('unknownCheck', `${name} names no check. A rule names one of ${PROJECT_RULE_CHECK_NAMES.join(', ')}.`)
  } else {
    for (const key of Object.keys(check)) {
      if (key === 'name' || key === 'evidence') continue
      if (listed(PROGRAM_FIELDS, key)) say('namesAProgram', `${name}'s check has the field "${key}". A check is one of the closed list and never a program.`)
      else if (listed(WEAKENING_FIELDS, key)) say('weakensAGeneralRule', `${name}'s check has the field "${key}". A project's rule never sets a general rule aside.`)
      else say('unknownField', `${name}'s check has the field "${key}", which a check does not have. A check has a name, and an evidence name where it asks for one.`)
    }
    const checkName = check['name']
    if (typeof checkName !== 'string' || !Object.hasOwn(PROJECT_RULE_CHECKS, checkName)) {
      say('unknownCheck', `${name} names the check ${JSON.stringify(checkName ?? null)}, which is not on the closed list: ${PROJECT_RULE_CHECK_NAMES.join(', ')}. No project writes a check.`)
    } else {
      const spec = PROJECT_RULE_CHECKS[checkName as ProjectRuleCheckName]
      const evidence = check['evidence']
      if (spec.namesEvidence && (typeof evidence !== 'string' || !EVIDENCE_NAME.test(evidence))) {
        say('evidenceName', `${name}'s check "${checkName}" needs the evidence name it asks for: lower-case letters, digits and underscores, 2 to 60 of them.`)
      } else if (!spec.namesEvidence && evidence !== undefined) {
        say('unknownField', `${name}'s check "${checkName}" asks for no evidence name; leave it out.`)
      } else {
        readCheck = spec.namesEvidence ? { name: checkName as ProjectRuleCheckName, evidence: evidence as string } : { name: checkName as ProjectRuleCheckName }
      }
    }
  }
  if (problems.length > 0 || readCheck === null) return { problems }
  return {
    rule: {
      id: id!,
      heading: (value['heading'] as string).trim(),
      text: (value['text'] as string).trim(),
      reason: (value['reason'] as string).trim(),
      source: (value['source'] as string).trim(),
      trigger: trigger as ProjectRuleTrigger,
      check: readCheck,
      effect: effect as ProjectRuleEffect,
      on: value['on'] as boolean,
      ...(stored ? { revision: value[STORED_ONLY] as number } : {}),
    },
  }
}

// ============================================================================ the refusals

/**
 * WHY A PROJECT CHAPTER IS REFUSED AT POST /api/records AND EVERY OTHER GENERAL WRITE DOOR. It is the reason of a
 * chapter edit's refusal, so the page reads it as one, and the office adds "Nothing was changed." after it.
 */
export const A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS =
  "A project chapter is written only through its own doors, so that only the person or the project's own secretary " +
  'writes a rule, and every change says why and keeps a revision. Read it with GET ' +
  '/api/office-regulations/projects/current/chapters and write it with POST ' +
  '/api/office-regulations/projects/current/chapters.'

/** Why a design review is refused at POST /api/records and every other general write door. */
export const A_DESIGN_REVIEW_IS_WRITTEN_BY_ITS_DOOR =
  'A design review is written only through its own door, so that the office writes who reviewed it from the key. ' +
  'Nothing was written.'

/** The same refusal with the door named. */
export const THE_DESIGN_REVIEW_DOOR = 'Write one with POST /api/designs/<id>/reviews.'
