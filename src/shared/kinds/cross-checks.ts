// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES THAT NEED MORE THAN ONE FIELD: the restriction's severity against its two lists, the
 * places a decision governs, and every kind's own cross-field rule.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `CROSS_CHECKS` gained the `export` word, because the
 * checker that stays in kinds.ts reads it. `CrossCheck`, `restrictionCrossCheck` and
 * `theGovernedPlacesAsWritten` stay private here.
 *
 * THIS FILE IMPORTS THE `RecordKind` TYPE FROM ../types.ts, THE `ValidationError` TYPE FROM
 * ./describe-value.ts, `claimProblem` FROM ../paths.ts, `STABLE_UPGRADE_NOTICE_EVENT` FROM
 * ../stable-upgrade-notices.ts, `stableBootstrapEvidenceWaiverSchema`, `stableBootstrapPreparedSchema`,
 * `stableBootstrapStopScopeSchema` AND `stableOfficeNoticeEventSchema` FROM
 * ../stable-bootstrap-notices.ts, `wholeSuiteReceiptCrossChecks` FROM ../whole-suite-receipt.ts,
 * `quickNoteCrossChecks` FROM ./quick-note.ts, `mainSuiteFixCrossChecks` FROM ../main-suite-fix.ts,
 * `theHandbookAsWritten` FROM ../handbooks.ts, `sessionWave13nCrossChecks` FROM
 * ../kind-fields/session-wave-13n.ts, `DEFAULT_REMIND_AFTER_MINUTES`, `SENT_AS` AND `SENT_AT` FROM
 * ../drafts.ts, `KEPT_HERE`, `PART_OF_THE_OFFICE` AND `TOOL_SLUG_PATTERN` FROM ../toolset.ts, AND
 * `whyThatIsNoRuntimeWord` FROM ../participants.ts.
 * IT IMPORTS NOTHING FROM ../kinds.ts: CROSS_CHECKS is built while this file loads, and every rule
 * it names is declared elsewhere or here.
 */
import type { RecordKind } from '../types.ts'
import type { ValidationError } from './describe-value.ts'
import { GOVERNS_FIELD } from '../governs.ts'
import { claimProblem } from '../paths.ts'
import { STABLE_UPGRADE_NOTICE_EVENT } from '../stable-upgrade-notices.ts'
import { stableBootstrapEvidenceWaiverSchema, stableBootstrapPreparedSchema, stableBootstrapStopScopeSchema, stableOfficeNoticeEventSchema } from '../stable-bootstrap-notices.ts'
import { wholeSuiteReceiptCrossChecks } from '../whole-suite-receipt.ts'
import { quickNoteCrossChecks } from './quick-note.ts'
import { mainSuiteFixCrossChecks } from '../main-suite-fix.ts'
import { theHandbookAsWritten } from '../handbooks.ts'
import { sessionWave13nCrossChecks } from '../kind-fields/session-wave-13n.ts'
import { DEFAULT_REMIND_AFTER_MINUTES, SENT_AS, SENT_AT } from '../drafts.ts'
import { KEPT_HERE, PART_OF_THE_OFFICE, TOOL_SLUG_PATTERN } from '../toolset.ts'
import { whyThatIsNoRuntimeWord } from '../participants.ts'

// ============================================================================ cross-field rules
//
// Rules that need more than one field. They are functions, so they cannot be serialised into the
// schema an agent reads over HTTP — which is why every one of them is also written in English in
// the `rules` array of its kind. If you add one here, add the sentence there.

type CrossCheck = (data: Record<string, unknown>) => ValidationError[]

/**
 * SEVERITY AND THE TWO LISTS HAVE TO AGREE, OR THE SEVERITY IS DECORATION.
 *
 * One rule, shared by the two kinds that carry `restrictionFields`, and it is what stops the word
 * being a label somebody picked. A `harmless` restriction that forbids something is a
 * contradiction; a `stops_final` one that names nothing it stops is a mark with nothing behind it.
 *
 * AN EMPTY LIST IS A COMPLETE ANSWER HERE, not an incompleteness — `isNotFilledIn` in
 * ./incompleteness.ts already says so, and its comment says why. `disallowed_claims: []` on a
 * harmless restriction is valid, complete, and means *nothing is forbidden*.
 */
const restrictionCrossCheck = (kind: string): CrossCheck => (data) => {
  const severity = data['severity']
  if (severity === undefined) return []
  const listed = (key: string): number | null => {
    const value = data[key]
    if (value === undefined) return null
    return Array.isArray(value) ? value.length : null
  }
  const allowed = listed('allowed_uses')
  const disallowed = listed('disallowed_claims')
  const errors: ValidationError[] = []
  if (severity === 'harmless') {
    for (const [key, count] of [
      ['allowed_uses', allowed],
      ['disallowed_claims', disallowed],
    ] as const) {
      if (count !== null && count > 0) {
        errors.push({
          path: `data.${key}`,
          message:
            `data.severity is "harmless", which says nothing rests on this ${kind}, so data.allowed_uses and ` +
            `data.disallowed_claims must both be empty — data.${key} has ${count}. A harmless restriction that ` +
            'forbids something is a contradiction: either the entries are real, in which case the severity is ' +
            '"limits_claims" or "stops_final", or they are not, in which case send [].',
        })
      }
    }
    return errors
  }
  for (const [key, count] of [
    ['allowed_uses', allowed],
    ['disallowed_claims', disallowed],
  ] as const) {
    if (count === 0) {
      errors.push({
        path: `data.${key}`,
        message:
          `data.severity is ${JSON.stringify(severity)}, so data.allowed_uses and data.disallowed_claims must ` +
          `each name at least one thing — data.${key} is empty. A ${severity === 'stops_final' ? 'restriction ' +
          'that stops something being called final' : 'restriction that limits what can be claimed'} which names ` +
          'nothing it stops is a mark with nothing behind it. If nothing really is restricted, the severity is ' +
          '"harmless".',
      })
    }
  }
  return errors
}

/**
 * EACH PLACE IN A DECISION'S `governs` NAMES ONE THING, AND A PATH IS ONE THE REPOSITORY COULD HOLD. The shape check
 * has already refused anything but strings in `record` and `path` and a boolean in `wholeProject`; this refuses an
 * entry with more than one or none, a `wholeProject` that is not true, and a path no claim could ever match
 * (`claimProblem`). Whether a named record is there is the server's question. A path stored here before governsFiles
 * is still read; the doors refuse a new one (src/server/lib/what-a-record-names.ts).
 */
function theGovernedPlacesAsWritten(governs: unknown): ValidationError[] {
  if (!Array.isArray(governs)) return []
  const errors: ValidationError[] = []
  governs.forEach((place: unknown, at) => {
    if (place === null || typeof place !== 'object') return
    const { record, path, wholeProject } = place as { record?: unknown; path?: unknown; wholeProject?: unknown }
    const named = [record, path, wholeProject].filter((one) => one !== undefined).length
    if (named !== 1) {
      errors.push({
        path: `data.${GOVERNS_FIELD}[${at}]`,
        message:
          `data.${GOVERNS_FIELD}[${at}] must name exactly one place: a page by its id in \`record\`, or the whole project ` +
          `with \`wholeProject\` true. It names ${named === 0 ? 'none' : 'more than one'}. A file goes in governsFiles.`,
      })
      return
    }
    if (wholeProject !== undefined && wholeProject !== true) {
      errors.push({
        path: `data.${GOVERNS_FIELD}[${at}].wholeProject`,
        message: `data.${GOVERNS_FIELD}[${at}].wholeProject is false, so it names nothing. Send true, or name a page in \`record\`.`,
      })
    }
    if (typeof path === 'string') {
      const problem = claimProblem(path)
      if (problem !== null) errors.push({ path: `data.${GOVERNS_FIELD}[${at}].path`, message: `data.${GOVERNS_FIELD}[${at}].path ${problem}.` })
    }
    if (typeof record === 'string' && record.trim() === '') {
      errors.push({ path: `data.${GOVERNS_FIELD}[${at}].record`, message: `data.${GOVERNS_FIELD}[${at}].record is blank, so it names nothing.` })
    }
  })
  return errors
}

export const CROSS_CHECKS: Partial<Record<RecordKind, CrossCheck>> = {
  problem: mainSuiteFixCrossChecks,
  note: (data) => {
    const extra = data['extra']
    if (!extra || typeof extra !== 'object' || Array.isArray(extra) || !Object.hasOwn(extra, 'stableBootstrapPrepared')) return []
    return stableBootstrapPreparedSchema.safeParse((extra as Record<string, unknown>)['stableBootstrapPrepared']).success ? [] : [{
      path: 'data.extra.stableBootstrapPrepared', message: 'The original preparation event must have the strict first handoff prepared shape.',
    }]
  },
  message: (data) => {
    const extra = data['extra']
    if (!extra || typeof extra !== 'object' || Array.isArray(extra) || !Object.hasOwn(extra, STABLE_UPGRADE_NOTICE_EVENT)) return []
    const event = (extra as Record<string, unknown>)[STABLE_UPGRADE_NOTICE_EVENT]
    return stableOfficeNoticeEventSchema.safeParse(event).success ? [] : [{
      path: `data.extra.${STABLE_UPGRADE_NOTICE_EVENT}`,
      message: 'The structured upgrade event must have the strict shared notice shape. Only the upgrade notice door writes it.',
    }]
  },
  whole_suite_receipt: wholeSuiteReceiptCrossChecks,
  quick_note: quickNoteCrossChecks,
  handbook: theHandbookAsWritten,
  session: sessionWave13nCrossChecks,
  /**
   * AN AGENT'S RUNTIME WORD IS ANY HARNESS'S NAME, WITHIN ONE LENGTH. The bound is the one the hold door
   * reads, so a word this kind takes is a word the agent can hold the heartbeat in. A value that is not text is
   * refused by the field's own type, so it is not refused twice here.
   */
  agent: (data) => {
    if (typeof data['runtime'] !== 'string') return []
    const why = whyThatIsNoRuntimeWord(data['runtime'])
    return why === null ? [] : [{ path: 'data.runtime', message: why }]
  },
  /**
   * A FLOW RUN SAYS WHICH VERSION OF A FLOW IT FOLLOWED, OR SAYS WHY IT CANNOT. Exactly one of the two, so a
   * reader never meets a flow run that is silent about its flow, and never one that claims both.
   */
  flow_run: (data) => {
    const errors: ValidationError[] = []
    const hasRevision = data['flowRevision'] !== undefined
    const hasNoFlow = data['noFlow'] !== undefined
    if (hasRevision === hasNoFlow) {
      errors.push({
        path: 'data.noFlow',
        message: hasRevision
          ? 'A flow run carries flowRevision or noFlow, never both: a run that followed a known flow has nothing missing to explain.'
          : 'A flow run carries flowRevision or noFlow. With neither, it says nothing about which flow the run followed.',
      })
    }
    if (hasRevision && data['flow'] === undefined) {
      errors.push({ path: 'data.flow', message: 'A flow run with a flowRevision names the flow it is a revision of, in data.flow.' })
    }
    return errors
  },
  /**
   * A DRAFT'S REMINDER TIME IS A WHOLE NUMBER OF MINUTES, AND ITS TWO SENT FIELDS COME TOGETHER.
   *
   * `remindAfterMinutes` is read by the reminder tick as minutes. A fraction, a zero or a negative
   * number would be a time the tick cannot honestly use. `sentAs` and `sentAt` are written only by the
   * send door and always both; one without the other is a record nobody could have written.
   */
  draft: (data) => {
    const errors: ValidationError[] = []
    const minutes = data['remindAfterMinutes']
    if (minutes !== undefined && (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1)) {
      errors.push({
        path: 'data.remindAfterMinutes',
        message:
          `data.remindAfterMinutes is ${JSON.stringify(minutes)}, and it must be a whole number of minutes, at least 1. ` +
          `Leave it out for ${String(DEFAULT_REMIND_AFTER_MINUTES)} minutes.`,
      })
    }
    if ((data[SENT_AS] === undefined) !== (data[SENT_AT] === undefined)) {
      errors.push({
        path: `data.${data[SENT_AS] === undefined ? SENT_AS : SENT_AT}`,
        message: `A sent draft carries both ${SENT_AS} and ${SENT_AT}, and the send door writes them together.`,
      })
    }
    return errors
  },

  /**
   * A TOOL'S SLUG, ITS CATEGORY AND ITS LOCATION, AS FAR AS THE SHAPE CAN SAY. Whether the category is
   * a live tool_category, and whether another tool holds the slug, are asked of the database by
   * src/server/lib/toolset.ts on both write paths; this runs in the browser too and cannot.
   */
  tool: (data) => {
    const errors: ValidationError[] = []
    const slug = data['slug']
    if (typeof slug === 'string' && !TOOL_SLUG_PATTERN.test(slug)) {
      errors.push({
        path: 'data.slug',
        message:
          `data.slug is ${JSON.stringify(slug)}, and a slug is lowercase letters, digits and hyphens, with no hyphen ` +
          'at either end. It is the short name in the address GET /api/toolset/<slug>. Example: "data-copy".',
      })
    }
    if (data['entry'] === PART_OF_THE_OFFICE && data['category'] !== undefined) {
      errors.push({
        path: 'data.category',
        message:
          'data.entry is "part of the office", and a "part of the office" entry names no category: it is a how-to ' +
          'page for a foundation part, listed apart from the categories. Leave data.category out, or make the entry ' +
          'a "tool" or a "service".',
      })
    }
    const location = data['location']
    if (data['kept'] === KEPT_HERE && typeof location === 'string') {
      const where = location.trim()
      if (where.startsWith('/') || where.includes('://') || where.split('/').includes('..')) {
        errors.push({
          path: 'data.location',
          message:
            `data.kept is "in this repository", so data.location is a path inside the repository, relative to its ` +
            `root. ${JSON.stringify(location)} is ${where.startsWith('/') ? 'an absolute path' : where.includes('://') ? 'an address' : 'a path that climbs out with ".."'}. ` +
            'Example: "tools/office-copy.mjs". A tool kept somewhere else says data.kept: "elsewhere".',
        })
      }
    }
    return errors
  },
  /**
   * A STAND-IN WITH NO VALUE, AND AN EMPTY SLOT WITH ONE, ARE BOTH REFUSED.
   *
   * `slot` is the field that says whether anything is standing in the gap. Storing "stand_in" with
   * no `substitute` puts a value nobody can see on the record; storing "empty" with one says the
   * slot is empty and then shows what is in it. The refusal names both fields, the way `claim`'s
   * `retracted_because` rule does.
   */
  placeholder: (data) => {
    const errors = restrictionCrossCheck('placeholder')(data)
    const slot = data['slot']
    const substitute = data['substitute']
    const hasSubstitute = substitute !== undefined && substitute !== null && substitute !== ''
    if (slot === 'stand_in' && !hasSubstitute) {
      errors.push({
        path: 'data.substitute',
        message:
          'data.slot is "stand_in", so data.substitute is needed too: it holds the temporary value actually in ' +
          'use, in your own words. A stand-in nobody can read is a made-up value with nothing saying what it is. ' +
          'If the slot is deliberately left open with nothing in it, send data.slot: "empty" instead.',
      })
    }
    if (slot === 'empty' && hasSubstitute) {
      errors.push({
        path: 'data.substitute',
        message:
          'data.slot is "empty", which says the slot is deliberately left open with nothing standing in it, so ' +
          'data.substitute must not be sent. If a temporary value is in use, send data.slot: "stand_in" with it.',
      })
    }
    return errors
  },

  ran_instead: restrictionCrossCheck('fallback'),

  purchase: (data) => {
    const hasCost = data['cost'] !== undefined
    const hasCurrency = data['currency'] !== undefined
    if (hasCost && !hasCurrency) {
      return [{ path: 'data.currency', message: 'data.cost is set, so data.currency is needed too — a bare number is not a price. Example: "GBP".' }]
    }
    if (hasCurrency && !hasCost) {
      return [{ path: 'data.cost', message: 'data.currency is set, so data.cost is needed too. Example: 240.' }]
    }
    return []
  },

  /**
   * WHICH OPTION WAS TAKEN, AND THE WORDS OF IT, HAVE TO ARRIVE TOGETHER.
   *
   * §38 was settled as "a recorded option OR an explicit custom one, either may carry free text".
   * The two stored fields are `option_taken` — the words — and `option_index` — which of the
   * proposal's options those words are. An index on its own is a letter with no fork beside it,
   * which is the exact record §38 was settled to stop producing, so it is refused at write time
   * rather than reported afterwards.
   *
   * THE OTHER DIRECTION IS NOT AN ERROR AND MUST NOT BECOME ONE: `option_taken` with no index is
   * how "none of these, here is what I am doing instead" is stored.
   */
  decision: (data) => {
    const errors: ValidationError[] = theGovernedPlacesAsWritten(data[GOVERNS_FIELD])
    const extra = data['extra']
    if (extra && typeof extra === 'object' && !Array.isArray(extra) && Object.hasOwn(extra, 'stableBootstrapStop') &&
        !stableBootstrapStopScopeSchema.safeParse((extra as Record<string, unknown>)['stableBootstrapStop']).success) {
      errors.push({ path: 'data.extra.stableBootstrapStop', message: 'The original stop decision must have the declared scope for a first handoff or a data folder move.' })
    }
    if (extra && typeof extra === 'object' && !Array.isArray(extra) && Object.hasOwn(extra, 'stableBootstrapEvidence') &&
        !stableBootstrapEvidenceWaiverSchema.safeParse((extra as Record<string, unknown>)['stableBootstrapEvidence']).success) {
      errors.push({ path: 'data.extra.stableBootstrapEvidence', message: 'The decision must name the first handoff it lets go ahead without a whole-suite receipt: its repository, commit and tree.' })
    }
    const index = data['option_index']
    if (index === undefined) return errors
    if (typeof index === 'number' && (!Number.isInteger(index) || index < 0)) {
      errors.push({
        path: 'data.option_index',
        message:
          `data.option_index is ${JSON.stringify(index)}. It is a position in the proposal's own options list, ` +
          'counted from 0, so it is a whole number and never negative.',
      })
    }
    if (data['option_taken'] === undefined) {
      errors.push({
        path: 'data.option_taken',
        message:
          'data.option_index is set, so data.option_taken is needed too: it holds the words of the option that ' +
          'was taken. An index on its own cannot be read without the proposal open beside it, and a decision is ' +
          'read for what was decided.',
      })
    }
    return errors
  },

  claim: (data) => {
    const state = data['state']
    if (data['retracted_because'] === undefined || state === 'retracted') return []
    // A MISSING `state` is refused here, not reported as an incompleteness, and that is the
    // whole point of the rule. `retracted_because` with no state stores the reason a claim was
    // withdrawn on a claim that nothing anywhere marks as withdrawn: every panel, every link
    // and every reader goes on treating it as live, and the retraction sits in a field nobody
    // reads. That is worse than not recording the retraction at all, because the record now
    // looks like it was handled. The fix costs one word, so it is asked for at write time.
    return [
      {
        path: 'data.state',
        message:
          state === undefined
            ? 'data.retracted_because is set, so this claim is withdrawn, but data.state is not set at all — send data.state: "retracted" with it. ' +
              'A withdrawal that nothing marks as withdrawn leaves everything that consumed this claim still reading as sound.'
            : `data.retracted_because is set, so this claim is withdrawn and data.state must be "retracted", not ${JSON.stringify(state)}. ` +
              'A retracted claim keeps its record so that whatever consumed it shows as broken rather than disappearing.',
      },
    ]
  },

  direction: (data) => {
    const depth = data['depth']
    const deep = depth === 'measured' || depth === 'integrated' || depth === 'defended'
    if (!deep) return []

    // An EMPTY LIST is the case this rule was written for, not an edge of it. `evidence: []`
    // says in as many words that nothing was observed, while `depth` says something was
    // measured — a flatter contradiction than leaving the key out, which is at least only an
    // omission. Checking that the key is merely PRESENT would let the louder one through.
    //
    // Nothing else has to be checked here: by the time a cross-check runs the field itself has
    // passed, so `evidence` is a list of non-blank strings or it is not there.
    const evidence = data['evidence']
    const nothingBehindIt = evidence === undefined || (Array.isArray(evidence) && evidence.length === 0)
    if (!nothingBehindIt) return []

    return [
      {
        path: 'data.evidence',
        message:
          `data.depth is "${String(depth)}", which claims something was actually measured, so data.evidence is required` +
          (evidence === undefined ? '. ' : ', and an empty list is not evidence — it says nothing was observed. ') +
          'Write what was run and what came out, one entry per piece. Example: ["240 replayed transplants, mean error 33 mm"]. ' +
          'If nothing has been measured yet, the honest depth is "ran".',
      },
    ]
  },

  obligation: (data) => {
    const errors: ValidationError[] = []
    const state = typeof data['state'] === 'string' ? data['state'] : null
    const stateDischarges = state === 'fulfilled' || state === 'cancelled'
    const done = data['done']

    // `done` and `state` are two ways of saying the same thing, and readFulfilment in
    // shared/work.ts reads them TOGETHER — it treats the obligation as discharged if either says
    // so. That is right for reading old records, and it means a record that contradicts itself
    // has one of its two halves silently thrown away. So the contradiction is refused on the way
    // in, where the author is still there to say which one they meant.
    if (done === false && stateDischarges) {
      errors.push({
        path: 'data.done',
        message:
          `data.state is "${String(state)}", which discharges this obligation, but data.done is false. Those are ` +
          'two ways of saying opposite things about the same obligation, and a reader that takes either one is ' +
          'right half the time. Send done: true with that state, or change the state to "open".',
      })
    }
    if (done === true && state === 'open') {
      errors.push({
        path: 'data.state',
        message:
          'data.done is true, which says this obligation has been discharged, but data.state is "open", which says ' +
          'it is still owed. Send state: "fulfilled" if it was delivered, or "cancelled" if it stopped being owed, ' +
          'or leave done out while it is still open.',
      })
    }

    // A discharge date on an obligation nothing marks as discharged. Same shape of failure as a
    // `retracted_because` on a claim nothing marks as retracted: the proof is stored, every panel
    // goes on showing the obligation as owed, and the record looks handled.
    const settled = done === true || stateDischarges
    const proof = ['fulfilledAt', 'fulfilledNote'].filter((key) => data[key] !== undefined)
    if (!settled && proof.length > 0) {
      errors.push({
        path: 'data.done',
        message:
          `${proof.map((k) => `data.${k}`).join(' and ')} ${proof.length === 1 ? 'says' : 'say'} this obligation was ` +
          'discharged, but nothing marks it as discharged: data.done is not true and data.state does not say ' +
          '"fulfilled" or "cancelled". Send data.done: true — or the matching state — in the same write. Without it ' +
          'the obligation goes on reading as owed everywhere, while the proof that it was met sits in a field ' +
          'nothing reads.',
      })
    }

    // A DAILY OBLIGATION IS DUE ON A DATE, because its next day is the same time on the day after. A condition or a
    // record has no day after it, and an obligation with no due has nothing to count from.
    const due = data['due']
    if (data['repeat'] !== undefined && typeof due !== 'string') {
      errors.push({
        path: 'data.repeat',
        message:
          `data.repeat is ${JSON.stringify(data['repeat'])}, which owes this every day at the time it is due, but data.due ` +
          `${due === undefined ? 'is not written' : 'is a condition or a record, which has no next day'}. Send data.due ` +
          'as a date, such as "2026-10-29 06:30", or leave data.repeat out.',
      })
    }
    return errors
  },

  /**
   * The one rule about `blockIds` that can be checked without reading the database.
   *
   * A duplicate id is refused here because a pipeline that lists one block at two positions has no
   * order at all, and the answer is the same whatever else is stored. The other two rules —
   * "every id is a live block" and "a block belongs to one pipeline" — need other rows and are
   * enforced on the server in lib/records.ts, which is also where the block routes live. This file
   * runs in the browser and has no database, so a check it cannot really do would be a check that
   * quietly passes.
   */
  pipeline: (data) => {
    const ids = data['blockIds']
    if (!Array.isArray(ids)) return []
    const seen = new Set<string>()
    const errors: ValidationError[] = []
    ids.forEach((id, i) => {
      if (typeof id !== 'string') return
      if (seen.has(id)) {
        errors.push({
          path: `data.blockIds[${i}]`,
          message:
            `data.blockIds[${i}] is "${id}", which is already listed earlier in this pipeline. A block can only be ` +
            'at one position, and a list holding it twice says the work happens in two places at once. Two steps ' +
            'sharing one id is what this change was built to make impossible, so it is refused rather than stored.',
        })
      }
      seen.add(id)
    })
    return errors
  },

  /**
   * WHOM THIS BINDS IS ONE FACT, SENT AS TWO FIELDS, AND THEY MAY NOT DISAGREE.
   *
   * `binds` is the closed choice — the person themselves, or a role — and `role` is the open text
   * naming which role, sent only when `binds` is "role". The same shape `purchase`'s cost/currency
   * pairing already checks, and the same reason: one of the pair with nothing to pair it with is
   * stored ambiguous rather than refused where it could still be asked about.
   *
   * AND `revoked_because` IS REQUIRED WITH `revoked_at`, the pairing `claim.retracted_because` uses:
   * a stamp with no reason is unreadable and a reason with no stamp is a regulation the record still
   * calls standing.
   */
  regulation: (data) => {
    const errors: ValidationError[] = []
    const binds = data['binds']
    const role = data['role']
    const hasRole = role !== undefined && role !== null && role !== ''
    if (binds === 'role' && !hasRole) {
      errors.push({
        path: 'data.role',
        message:
          'data.binds is "role", so data.role is needed too: it names which role this binds. Without it, whom this ' +
          'regulation binds is not a role at all — it is nothing.',
      })
    }
    if (binds === 'person' && hasRole) {
      errors.push({
        path: 'data.role',
        message:
          'data.binds is "person", which says this binds the person themselves, so data.role must not be sent — naming ' +
          'a role as well would say two different things about whom this binds. If this really binds a role, send ' +
          'data.binds: "role" instead.',
      })
    }
    const revokedAt = data['revoked_at']
    const revokedBecause = data['revoked_because']
    const hasRevokedAt = revokedAt !== undefined && revokedAt !== null && revokedAt !== ''
    const hasRevokedBecause = revokedBecause !== undefined && revokedBecause !== null && revokedBecause !== ''
    if (hasRevokedAt && !hasRevokedBecause) {
      errors.push({
        path: 'data.revoked_because',
        message:
          'data.revoked_at is set, so data.revoked_because is needed too: it holds why, in their own words. A ' +
          'revocation with no reason is a stamp nobody can check.',
      })
    }
    if (hasRevokedBecause && !hasRevokedAt) {
      errors.push({
        path: 'data.revoked_at',
        message: 'data.revoked_because is set, so data.revoked_at is needed too — a reason with no stamp is not a revocation.',
      })
    }
    return errors
  },

  /**
   * A GOAL'S END IS ONE FACT, SAID AS THREE FIELDS, AND THEY MAY NOT DISAGREE.
   *
   * `state` says which of open, met and dropped the goal is. `state_at` and `state_because` date
   * and explain an END, so they are required together when the state is `met` or `dropped` — the
   * pairing `claim.retracted_because` and `regulation`'s revocation fields already use, for the
   * same reason: a stamp with no reason is a fact nobody can check and a reason with no stamp is an
   * end nobody can date. While the goal is `open` both are REFUSED: a goal that has not ended has
   * no end to date or explain, and carrying them would say two things about whether it is over.
   */
  goal: (data) => {
    const errors: ValidationError[] = []
    const state = data['state']
    const stateAt = data['state_at']
    const stateBecause = data['state_because']
    const hasAt = stateAt !== undefined && stateAt !== null && stateAt !== ''
    const hasBecause = stateBecause !== undefined && stateBecause !== null && stateBecause !== ''
    const ended = state === 'met' || state === 'dropped'
    if (ended) {
      if (!hasAt) {
        errors.push({
          path: 'data.state_at',
          message:
            `data.state is "${String(state)}", so data.state_at is needed too: when the goal was met or dropped. ` +
            'An end with no date is a change nobody can put in order.',
        })
      }
      if (!hasBecause) {
        errors.push({
          path: 'data.state_because',
          message:
            `data.state is "${String(state)}", so data.state_because is needed too: why it was met or dropped, in ` +
            'words. An end with no reason is a change nobody can check.',
        })
      }
    } else {
      // REPORTED AT `data.state`, AND THAT IS DELIBERATE. A field's own worked example is checked
      // on its own against the kind's required examples, so an error reported at `data.state_at`
      // for a record whose `state` example is "open" would make `state_at`'s own example look
      // wrong. The rule is about the pair, so the refusal names the field that decides it and the
      // message names the one that must not be there.
      if (hasAt) {
        errors.push({
          path: 'data.state',
          message:
            'data.state_at is only for a goal that has ended, and this goal is still open. Set data.state to "met" ' +
            'or "dropped" with the date and the reason, or leave both out while it is open.',
        })
      }
      if (hasBecause) {
        errors.push({
          path: 'data.state',
          message:
            'data.state_because is only for a goal that has ended, and this goal is still open. Set data.state to ' +
            '"met" or "dropped" with the date and the reason, or leave both out while it is open.',
        })
      }
    }
    return errors
  },
}
