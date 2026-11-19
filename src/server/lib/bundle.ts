// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PORTABLE CONTEXT: TEXT A PERSON PASTES INTO AN AGENT MOLE OFFICE DOES NOT RUN.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS FILE IS A PROJECTION. THE READING IS `src/server/lib/continuation.ts`
 * ---------------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/context-bundle.md` §1. A bundle is a reading of records that already
 * exist, at a scope and a length, so every fact in it comes from the reader that already answers
 * that question. NOTHING HERE COMPUTES A FACT OF ITS OWN.
 *
 * UNTIL 27 AUGUST 2026 THIS FILE SAID SO WHILE DOING THE OPPOSITE, and it said that too, in its own
 * header: *"THE PLAN NAMES A FILE THAT DOES NOT EXIST … So this file calls the readers that DO
 * exist, one per slot."* The file it named is now written, and this one calls it. Two facts that
 * were worked out here have gone with the change:
 *
 *   · WHICH RECORD A LIMIT BELONGS BESIDE. This file used to guess — *if the restriction record is
 *     itself carried attach it to itself, otherwise to the anchor, otherwise to whichever record
 *     happens to be first in the carried list* — because it called the reader that flattens that
 *     mapping away. `restrictionsReaching` answers the question and the assembler asks it.
 *   · WHICH SLOTS PRINT WHAT. Six slot names drove four sections, because two pairs were the same
 *     `if`. Asking for what was tried printed what was open. All twenty-three parts are distinct
 *     now, and each one names the reader it called.
 *
 * WHAT REMAINS HERE IS THE PAGE ITSELF: the framing sentences, the order the parts are printed in,
 * and the record of what left the building.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW A RESTRICTION SURVIVES INTO TEXT THAT LEAVES THE BUILDING
 * ---------------------------------------------------------------------------------------------
 *
 * This is the requirement that must not fail. G.8: an outside agent must not be handed
 * `fx = 600` while losing *"temporary placeholder; not valid for geometry"*. Four rules, each
 * answering one way it could be lost. Rules 1 to 3 are kept in `continuation.ts` now, because that
 * is where the entries are built; rule 4 is kept in `src/server/api/bundle.ts`, at the door.
 *
 * RULE 1 — A RESTRICTION RIDES INSIDE THE ENTRY OF THE RECORD IT REACHES, and is exempt from
 * shortening. `placeholder.md` §9.1's argument, taken whole: *a slot can be dropped; a field that
 * travels with its value cannot*.
 *
 * RULE 2 — A RESTRICTION IS CARRIED WHENEVER THE RECORD IT REACHES IS CARRIED, at every length.
 *
 * RULE 3 — THE RESTRICTION IS PRINTED TWICE, IN TWO PLACES, FROM ONE READ: once whole under
 * VALIDITY LIMITS near the top, and once inline under the record it belongs to. It is not the same
 * fact stored twice; it is read once and placed twice.
 *
 * RULE 4 — AN EXPORT REFUSES RATHER THAN GOING OUT WITH RESTRICTIONS IT COULD NOT READ. And the
 * refusal is NOT a blanket one, which took a measurement to get right: `restrictionsInScope`
 * always returns one `couldNotCheck` entry, because the implementation map has no read that rolls
 * the import graph up to records, and that gap is true of every call this product will ever make.
 * A refusal keyed on `couldNotCheck.length > 0` would refuse every export for ever and would look
 * like a working guard. So the refusal is keyed on entries that name a RECORD IN SCOPE, and the
 * standing product-wide gap is DISCLOSED in the text instead.
 */
import { createHash } from 'node:crypto'
import {
  BUNDLE_PRESETS,
  BUNDLE_PRESET_NAMES,
  BUNDLE_RUNGS,
  BUNDLE_SHIFT_LIMIT,
  isBundleRung,
  isBundleShift,
  rungsMoved,
  SCOPES,
  sharesOf,
  slotsOf,
  whyTheseAdditionalRecordsCannotBeUsed,
  whyTheseModulesAndPipelinesCannotBeUsed,
  whyTheseSlotsCannotBeUsed,
  type BundlePreset,
  type BundleSpec,
  type ScopeName,
} from '@shared/bundles.ts'
import {
  NO_LEVEL_WAS_MOVED,
  THOSE_RECORDS_HAVE_NOTHING_AT_THAT_LEVEL,
  partsLongerThanTheirShare,
} from '@shared/a-copys-levels-in-words.ts'
/**
 * `readerWord` HANDS BACK A `Word`, NOT A STRING, and the difference cost a line of the owner's own
 * corpus reading `About: Mole Office — work-state rules ([object Object])`. Every call below spells
 * `readerWord(x).text` AT THE SITE rather than through a local helper, because the machine-word gate
 * scans for the reading table at the place the value is printed and cannot see through a wrapper —
 * and a gate that cannot see a site is a site nobody is checking.
 */
import { levelLabel, RUNG_SPECS, type Rung } from '@shared/detail.ts'
import { referenceLine } from '@shared/reference.ts'
import { readerWord } from '@shared/words.ts'
import { nowStamp } from '@shared/time.ts'
import {
  assembleContinuation,
  type AssembledFrom,
  type AssembledPart,
  type BundleLeftOut,
  type Continuation,
} from './continuation.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { ZipExportFilesRecord } from '@shared/zip-export/manifest.ts'
import type { ScreeningAnswer } from './screening.ts'
import {
  AN_EXPORT_IS_WRITTEN_BY_THE_SERVER,
  getRecord,
  patchRecord,
  type Actor,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { referenceTo } from './references.ts'
import { refuseAMessageThisReaderMayNotRead, theMessagesHiddenFrom, type AMessageReader } from './messages.ts'
import { theReadingOpenWorkIsRankedBy } from './openwork.ts'
import { versionOf } from './version.ts'
import {
  CHARS_PER_TOKEN,
  theTokenEstimateSentence,
  tokensEstimatedFor,
} from '../../config/token-estimate.mjs'

export type { BundleLeftOut } from './continuation.ts'

/** One record the text carried, and the version it held at that moment. */
export interface CarriedRecord {
  recordId: string
  contentHash: string
}

/** One restriction the text carried, and the version the restriction record held. */
export interface CarriedRestriction {
  restrictionId: string
  contentHash: string
}

/** What one part of the text did, so a screen can draw the choice without re-reading the text. */
export interface BundlePart {
  name: ScopeName
  label: string
  /** The reader it called, named. Null when nothing could answer it here. */
  reader: string | null
  answered: boolean
  why?: string
  says: string
  carried: number
  considered: number
  bytes: number
  /** The share of the size this part was given, so a screen can say what a position cost. */
  share: number
  /** True when the position somebody picked needed more room than this part's share. B25. */
  tookMoreRoom: boolean
  /**
   * WHICH LEVEL THIS PART GOT AND WHY. Criteria B30 and B31.
   *
   * `automatic` is the longest level whose lines fit this part's share of the size — the base,
   * chosen per part and not for the copy. `shift` is how far the person moved it with less and
   * more, `level` is where that landed, and `fits` says whether what was drawn is inside the
   * share. Absent when this part chose nothing: it carries no members, it is the validity limits,
   * which are drawn whole at every size, or somebody named one absolute level for the whole copy.
   */
  chose?: { level: Rung; automatic: Rung; shift: number; fits: boolean }
  /**
   * THE HIGHEST RUNG ANY ENTRY OF THIS PART IS REALLY WRITTEN AT. Criterion B32.
   *
   * Where *more* stops for this part, and a fact about the records rather than about the size. Null
   * when the part carries no entries, which is not the same answer as *the title alone*.
   */
  top: Rung | null
}

export interface ResolvedBundle {
  text: string
  carried: CarriedRecord[]
  restrictions: CarriedRestriction[]
  leftOut: BundleLeftOut[]
  /** What each part of the text carried, and what answered it. */
  parts: BundlePart[]
  /** Entries naming a record in scope the restriction walk could not go through. Empty is normal. */
  couldNotCheckInScope: { what: string; because: string }[]
  /** Gaps that are true of every call, disclosed in the text rather than refused. */
  standingGaps: { what: string; because: string }[]
  characters: number
  bytes: number
  /**
   * THE SAME SIZE, IN TOKENS, AND IT IS AN ESTIMATE. Criterion T3.
   *
   * The rule that turns characters into a token estimate, and the sentence saying no tokenizer is
   * installed, are read from `src/config/token-estimate.mjs`, the one declaration the brief and
   * the measuring tool also read. `tokensEstimated` is the field name the brief already uses, so
   * the two replies read alike. Nothing here counted a token; the name and the sentence say so.
   */
  tokensEstimated: number
  charsPerTokenAssumed: number
  tokensAreAnEstimate: string
  fits: boolean
  /** The position every entry was asked to be drawn at. */
  detail: Rung
  /**
   * HOW FAR THE PERSON MOVED EVERY PART FROM THE LEVEL ITS SHARE CHOSE. Criterion B31.
   *
   * Zero means nobody moved anything, which is the automatic base and what every copy did before
   * this existed. Negative is less and positive is more, one rung a press.
   */
  shift: number
  /** How many entries were drawn shorter than asked, and where they landed. */
  drawnShorter: { count: number; ofEntries: number; at: Partial<Record<Rung, number>> }
  /**
   * THE HIGHEST RUNG ANYTHING IN THIS COPY IS REALLY WRITTEN AT. Criterion B32.
   *
   * Where *more* stops. Null when the copy carries no entries at all.
   */
  top: Rung | null
  /** The readings this copy was assembled from, each taken once, with the parts that drew on each. */
  assembledFrom: AssembledFrom[]
}

// ============================================================================ resolving

/**
 * Build the text for a spec, now, from the records as they stand.
 *
 * IT WRITES NOTHING. Resolving a bundle is a read: `GET /api/bundles/preview` calls this and so
 * does the export, and the export is the only one of the two that records anything.
 */
export async function resolveBundle(
  spec: BundleSpec,
  workspaceId: string,
  // WHO IS READING. A message this reader may not read is refused as the subject
  // or as a record named beside it, and is in no part of the copy. Left out by a caller that answers no
  // request, which reads every message.
  reader?: AMessageReader,
): Promise<ResolvedBundle> {
  // THE PARTS, REFUSED RATHER THAN NARROWED. `slotsOf` throws the sentence that says why, and the
  // route turns it into a refusal a caller can read. A spec that asks for a part Mole Office has no name
  // for used to be answered 200 with the request quietly shortened.
  let parts: readonly ScopeName[]
  try {
    parts = slotsOf(spec)
  } catch (err) {
    throw new PanelError(err instanceof Error ? err.message : String(err), 400)
  }

  // A MESSAGE THIS READER MAY NOT READ IS ANSWERED AS AN ID NAMING NOTHING: as the
  // record the bundle is of, with the same refusal, and among the records named beside it, below.
  if (spec.scope.kind === 'record') {
    const scopeId = spec.scope.recordId
    const nothingToBundle = (): PanelError =>
      new PanelError(`No record with id ${scopeId}, so there is nothing to make a bundle of. Nothing was written.`, 404)
    if (reader !== undefined) refuseAMessageThisReaderMayNotRead(reader, scopeId, nothingToBundle)
    if (getRecord(scopeId) === null) throw nothingToBundle()
  }

  // ---- WHICH MODULES AND PIPELINES, REFUSED RATHER THAN NARROWED. Criterion B6.
  //
  // The shape is decided in `src/shared/bundles.ts`, which both doors read; whether each id names a
  // module or a pipeline that exists is a question about records and is asked here. A name that
  // answers to nothing is a refusal that says which name, because the alternative is a copy that
  // carries four of the five somebody asked for and says it carried what was asked.
  const cannot = whyTheseModulesAndPipelinesCannotBeUsed(parts, spec.modulesAndPipelines)
  if (cannot !== null) throw new PanelError(cannot, 400)

  // ---- THE DETAIL POSITION, REFUSED RATHER THAN ROUNDED. Criterion B9.
  //
  // The five a copy offers are `BUNDLE_RUNGS`. A rung of the ladder this list does not hold — a
  // label, or a report's digest — is a real position of a real ladder and still not one a copy
  // draws, so it is named in the refusal rather than rounded to a neighbour.
  // TWO WAYS OF NAMING A LEVEL, NEVER BOTH AT ONCE. Criterion B31. `detail` names one absolute
  // level for the whole copy and `shift` moves each part from the level its own share chose, so a
  // request carrying both has asked two different questions and there is no honest way to rank them.
  // The page sends only the second; the first is here for bundles filed before B31 existed.
  if (spec.detail !== undefined && spec.shift !== undefined && spec.shift !== 0) {
    throw new PanelError(
      'This copy names an absolute level and also asks to move every level. Those are two different ' +
        'questions and Mole Office will not choose between them. Send one: a level for the whole copy, or ' +
        'an offset from the level each part\'s share of the size chooses for it. Nothing was assembled.',
      400,
    )
  }
  // A STORED SHIFT IS HELD TO THE BOUND THE PREVIEW DOOR HOLDS ITS QUERY TO. The kind can only say
  // "a number", so a filed bundle could carry 2.5 or 40; neither is a number of presses, and using
  // one would draw a copy nobody asked for. Problem MEFFlH9J6nY5. A write refuses one too (problem
  // -gdJAlC4S0ob); this stays for a bundle filed before it did.
  if (spec.shift !== undefined && !isBundleShift(spec.shift)) {
    throw new PanelError(
      `This copy asks to move every part by ${String(spec.shift)} levels. ` +
        `A move is a whole number from -${String(BUNDLE_SHIFT_LIMIT)} to ${String(BUNDLE_SHIFT_LIMIT)}, ` +
        'one level for each press of Less or More. Nothing was assembled.',
      400,
    )
  }
  if (spec.detail !== undefined && !isBundleRung(spec.detail)) {
    // FULL IS A REAL POSITION OF THE LADDER AND IS NO LONGER ONE A COPY GOES TO, so the refusal says
    // that rather than leaving somebody to read a list and wonder where their level went. Criterion
    // B32, on problem `AQZm6esnQqCr`.
    const wentAway =
      spec.detail === 'full'
        ? ' Full is the record itself, and a copy stops below it: every entry is drawn at the highest ' +
          'level really written on its record, because the record itself can say less than its own ' +
          'conclusion. Ask for nothing and each entry lands on its own top.'
        : ''
    throw new PanelError(
      `A copy is drawn at one of ${BUNDLE_RUNGS.map((one) => levelLabel(one)).join(', ')}, and "${spec.detail}" ` +
        `is not one of them.${wentAway} Nothing was assembled.`,
      400,
    )
  }
  // ---- THE RECORDS SOMEBODY NAMED, REFUSED RATHER THAN NARROWED. Criterion B8.
  //
  // Same rule as the modules and pipelines above and the same reason: a copy that carried four of
  // the five records somebody asked for, and said it carried what was asked, is the silent
  // narrowing this repository is written against.
  if (spec.additionalRecords !== undefined) {
    const hidden = reader === undefined ? new Set<string>() : theMessagesHiddenFrom(reader, spec.additionalRecords)
    const notHere = spec.additionalRecords.filter((id) => {
      const record = hidden.has(id) ? null : getRecord(id)
      return record === null || record.workspaceId !== workspaceId
    })
    if (notHere.length > 0) {
      throw new PanelError(
        `${notHere.map((one) => `"${one}"`).join(', ')} name(s) no live record in this project, so nothing was ` +
          'assembled. Nothing was quietly left out either: a copy that carried the rest would say it carried ' +
          'what was asked for.',
        400,
      )
    }
  }

  if (spec.modulesAndPipelines !== undefined) {
    const notOne = spec.modulesAndPipelines.filter((id) => {
      const record = getRecord(id)
      return record === null || record.workspaceId !== workspaceId || (record.kind !== 'module' && record.kind !== 'pipeline')
    })
    if (notOne.length > 0) {
      throw new PanelError(
        `${notOne.map((one) => `"${one}"`).join(', ')} name(s) no module and no pipeline in this project, so ` +
          'nothing was assembled. Nothing was quietly left out either: a copy that carried the rest would say it ' +
          'carried what was asked for.',
        400,
      )
    }
  }

  // THE ATTENTION RULE RUNS ON ITS OWN THREAD, after every refusal above and before anything is read for
  // the copy, and only when the open loops are asked for (`theReadingOpenWorkIsRankedBy`, problem CtH8CGBkE5Bz).
  const ranking = parts.includes('openLoops') ? await theReadingOpenWorkIsRankedBy(workspaceId) : undefined
  const reading = assembleContinuation({
    workspaceId,
    ...(ranking === undefined ? {} : { ranking }),
    ...(reader === undefined ? {} : { reader }),
    subject: spec.scope,
    parts,
    budgetBytes: spec.budgetBytes,
    shares: sharesOf(spec),
    ...(spec.reach === undefined ? {} : { reach: spec.reach }),
    ...(spec.modulesAndPipelines === undefined ? {} : { modulesAndPipelines: spec.modulesAndPipelines }),
    ...(spec.additionalRecords === undefined ? {} : { additionalRecords: spec.additionalRecords }),
    ...(spec.detail === undefined ? {} : { detail: spec.detail as Rung }),
    ...(spec.shift === undefined ? {} : { shift: spec.shift }),
  })

  const leftOut = reading.parts.flatMap((part) => part.leftOut)
  const text = renderBundleText(spec, reading, leftOut)
  const bytes = Buffer.byteLength(text, 'utf8')
  return {
    text,
    carried: reading.carried
      .map((id) => ({ recordId: id, contentHash: hashOf(id) }))
      .filter((c) => c.contentHash !== ''),
    restrictions: reading.restrictions.map((one) => ({
      restrictionId: one.restrictionId,
      contentHash: hashOf(one.restrictionId),
    })),
    leftOut,
    parts: reading.parts.map(asBundlePart),
    couldNotCheckInScope: reading.couldNotCheckInScope,
    standingGaps: reading.standingGaps,
    characters: text.length,
    bytes,
    tokensEstimated: tokensEstimatedFor(text.length),
    charsPerTokenAssumed: CHARS_PER_TOKEN,
    tokensAreAnEstimate: theTokenEstimateSentence(),
    fits: bytes <= spec.budgetBytes,
    detail: reading.detail,
    shift: spec.shift ?? 0,
    drawnShorter: reading.drawnShorter,
    top: reading.top,
    assembledFrom: reading.assembledFrom,
  }
}

function asBundlePart(part: AssembledPart): BundlePart {
  return {
    name: part.name,
    label: part.label,
    reader: part.reader,
    answered: part.answered,
    ...(part.why === undefined ? {} : { why: part.why }),
    says: part.says,
    carried: part.carried,
    considered: part.considered,
    bytes: part.bytes,
    share: part.share,
    tookMoreRoom: part.tookMoreRoom,
    ...(part.chose === undefined ? {} : { chose: part.chose }),
    top: part.top,
  }
}

/** The record's version token, from the one function that computes it. Empty if it is gone. */
function hashOf(recordId: string): string {
  const record = getRecord(recordId)
  return record === null ? '' : versionOf(record)
}

// ============================================================================ the text

const RULE = '='.repeat(78)
const THIN = '-'.repeat(78)

/**
 * THE LIMITS ARE PRINTED FIRST WHATEVER ORDER THEY WERE ASKED IN.
 *
 * A heading reading *read this before anything below* has to be above the things it is about, and a
 * preset's list is written for what belongs in the copy rather than for what a stranger reads first.
 * This is a printing order and not a second opinion about what is in the copy.
 */
function inPrintingOrder(parts: readonly AssembledPart[]): AssembledPart[] {
  return [...parts].sort((a, b) => Number(b.name === 'validityLimits') - Number(a.name === 'validityLimits'))
}

function renderBundleText(
  spec: BundleSpec,
  reading: Continuation,
  leftOut: readonly BundleLeftOut[],
): string {
  const body = theBody(spec, reading, leftOut)
  const head = theHead(spec, reading, body)
  return [...head, ...body].join('\n')
}

/**
 * THE OPENING OF THE COPY: what it is, when it was made, and two things about the reading itself.
 *
 * ---------------------------------------------------------------------------------------
 * HOW MANY RECORDS WERE DRAWN SHORTER THAN ASKED
 * ---------------------------------------------------------------------------------------
 *
 * Their rule of 6 September 2026: a level nobody wrote falls back to the shorter one, and the copy says
 * at the top how many that was. A reader who asked for each record's
 * children and got a title has to be told, or the copy has quietly answered a different question.
 * A copy where nothing fell back says so; the two never read the same. Criterion B11.
 *
 * ---------------------------------------------------------------------------------------
 * WHETHER IT FITTED THE SIZE ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * Every part is held to its share of the size and the opening, the headings and the left-out list
 * are not, so a copy can be over the ceiling with every part inside its own. It used to say nothing
 * about that in its own text; the reply's `fits` was the only place it appeared, and a person
 * reading the pasted text was not the person reading the reply. Criterion B15.
 *
 * THE NUMBER IS EXACT AND IT IS THE BODY'S. Saying "this text is N characters" is circular — adding
 * the sentence changes N — so the sentence names what is BELOW it, which is a number nothing about
 * this sentence can change.
 */
function theHead(spec: BundleSpec, reading: Continuation, body: readonly string[]): string[] {
  const preset = BUNDLE_PRESETS[spec.preset]
  const anchor = reading.anchor
  const lines: string[] = []
  lines.push(RULE)
  lines.push(`CONTEXT FROM MOLE OFFICE — ${preset.word.toUpperCase()}`)
  lines.push(`About: ${anchor === null ? 'this whole project' : `${anchor.title} (${readerWord(anchor.kind).text})`}`)
  lines.push(`Made: ${nowStamp()}`)
  // HOW DETAILED, AND HOW THE LEVELS WERE ARRIVED AT. Criteria B30 and B31: the base is worked out
  // per part from its share of the size, and what a person moves is that base. A reader of the text
  // has to be able to tell a copy somebody shortened from one that was always this short.
  lines.push(
    spec.detail !== undefined
      ? `How detailed: ${levelLabel(reading.detail)} — ${RUNG_SPECS[reading.detail].phrase}`
      : spec.shift === undefined || spec.shift === 0
        ? NO_LEVEL_WAS_MOVED
        : `How detailed: each part ${rungsMoved(spec.shift)} the longest level its share of the size fits`,
  )
  lines.push(RULE)
  lines.push('')
  lines.push(
    'This text was assembled by Mole Office from records a person and their agents wrote. It is a reading of ' +
      'those records as they stand right now, not a copy kept anywhere. Nothing in it was invented for this ' +
      'text.',
  )
  lines.push('')

  // ---- HOW MANY WERE DRAWN SHORTER THAN ASKED, AND IT STANDS OUT.
  //
  // THEY READ THE COPY AND DID NOT SEE THIS LINE. Their first try of the page asked for the Conclusion
  // and 101 of its 132 entries came back as titles; the copy said so, in a paragraph among other
  // paragraphs, and they read the titles as a defect in the copy button. Criterion B25 says the count
  // line stays and stands out, so it is ruled off above and below rather than made longer.
  //
  // AND IT IS ABOUT WHAT WAS WRITTEN, NOT ABOUT WHERE THE LEVELS ENDED UP. Since criterion B31 the
  // levels are chosen per part and then moved by the person, so "the level that was asked for" is
  // no longer one level for the copy. What this count is really about is unchanged and is worth
  // saying once: how many entries have nothing written at the longest position, whatever level
  // their own part came to draw them at. Each part's own level is beside its name in the table on
  // the page and in its own sentence in the text.
  const shorter = reading.drawnShorter
  const theLongest = levelLabel(reading.detail)
  if (shorter.count === 0) {
    lines.push(
      `Every one of the ${String(shorter.ofEntries)} entries below has words written at ${theLongest}, ` +
        'so none of them fell back to a shorter position for want of any. Which level each part was ' +
        'drawn at is said beside that part below.',
    )
  } else {
    const where = Object.entries(shorter.at)
      .map(([rung, n]) => `${String(n)} at ${levelLabel(rung as Rung)}`)
      .join(', ')
    lines.push(THIN)
    lines.push(
      `${String(shorter.count)} OF THE ${String(shorter.ofEntries)} ENTRIES BELOW HAVE NOTHING WRITTEN AT ` +
        `${theLongest.toUpperCase()}, THE LONGEST POSITION THERE IS.`,
    )
    lines.push(
      `${THOSE_RECORDS_HAVE_NOTHING_AT_THAT_LEVEL}: ${where}. Nothing was invented to fill the gap, and the ` +
        'size of this copy had nothing to do with it.',
    )
    lines.push(THIN)
  }
  lines.push('')

  // ---- WHAT THE POSITION SOMEBODY PICKED COST, when it cost more than the size would have given.
  //
  // Criterion B25: a position a person picks is honoured, the copy takes the room that position
  // needs, and it says its size. The part budgets shape the position only when nobody picked one.
  const overspent = reading.parts.filter((part) => part.tookMoreRoom)
  if (overspent.length > 0) {
    lines.push(
      `${partsLongerThanTheirShare(overspent.length)}, because ${levelLabel(reading.detail)} was asked for ` +
        'and the level asked for is the level given: ' +
        overspent
          .map((part) => `“${part.label}” took ${String(part.bytes)} of the ${String(part.share)} it was given`)
          .join(', ') +
        '. Nothing was left out of them to make them fit.',
    )
    lines.push('')
  }

  // ---- WHAT THIS COPY WAS ASSEMBLED FROM, named, each reading taken once.
  //
  // Criterion B20 of design/bundle/ACCEPTANCE.md and a decision say the copy is made of the
  // readings the fast context routes answer out of, not of a second walk of the corpus. A
  // reading two parts drew on is named once with both parts beside it, which is what says they
  // cannot disagree; a part that went round the shared reading would be missing from that line.
  //
  // IT NAMES FUNCTIONS AND NOT REQUESTS. A reader of this text has no API — criterion B19 — so the
  // sentence says what produced the answer, which is provenance, rather than what to ask for.
  lines.push('WHAT THIS COPY WAS ASSEMBLED FROM, each reading taken once:')
  for (const one of reading.assembledFrom) {
    lines.push(
      `  - ${one.reader} — for ${one.forParts.map((name) => `“${SCOPES[name].label}”`).join(', ')}`,
    )
  }
  lines.push('')

  const bytes = Buffer.byteLength(body.join('\n'), 'utf8')
  if (bytes > spec.budgetBytes) {
    lines.push(
      `THIS COPY IS LARGER THAN THE SIZE ASKED FOR: ${String(spec.budgetBytes)} bytes were asked for and what is ` +
        `below this line is ${String(bytes)}. Every part was held to its share; the headings and this opening ` +
        'were not.',
    )
    lines.push('')
  }
  return lines
}

/** Everything under the opening: the parts in printing order, then what is not here. */
function theBody(spec: BundleSpec, reading: Continuation, leftOut: readonly BundleLeftOut[]): string[] {
  const lines: string[] = []
  for (const part of inPrintingOrder(reading.parts)) {
    lines.push(THIN)
    lines.push(SCOPES[part.name].heading)
    lines.push(THIN)
    // WHAT ANSWERED THIS PART, NAMED, so a reader can go and ask the same thing themselves. A part
    // nothing could answer says that instead, and the two never read the same.
    lines.push(
      part.reader === null
        ? 'Nothing in Mole Office answers this part here.'
        : `Mole Office read this from ${part.reader}.`,
    )
    for (const line of part.lines) lines.push(line)
    lines.push('')
  }

  // ---- what was left out. Never a bare count, and never a bare id.
  //
  // THE IDS USED TO BE PRINTED HERE WITH NOTHING BESIDE THEM, and that was almost all of problem
  // `F2NxzxAnRkb2`: four lines of this section were 898 record ids and half of a small copy's whole
  // text. A record is named by its title with its id beside it, for as many as the room allows, and
  // what could not be named is one sentence at the end saying how many and why. Criterion B13.
  lines.push(THIN)
  lines.push('WHAT IS NOT IN THIS TEXT')
  lines.push(THIN)
  if (leftOut.length === 0) {
    lines.push('Everything in scope is above.')
  }
  let room = Math.max(0, Math.floor(spec.budgetBytes / WHAT_IS_NOT_HERE_GETS))
  let couldNotName = 0
  for (const one of leftOut) {
    lines.push(`- ${String(one.count)}: ${one.says}`)
    const named = namesOf(one.ids ?? [], one.meansHere ?? null, room)
    for (const line of named.lines) {
      lines.push(line)
      room -= Buffer.byteLength(line, 'utf8') + 1
    }
    couldNotName += named.couldNotName
  }
  // ONE SENTENCE FOR THE WHOLE SECTION, said once rather than under each group. It is the account
  // of the second cut this section can make, and invariant 9 of USER.md says one fact is worked out
  // in one place.
  if (couldNotName > 0) {
    lines.push('')
    lines.push(
      `${String(couldNotName)} of the records above are not named here, because this list is given ` +
        `${String(Math.max(0, Math.floor(spec.budgetBytes / WHAT_IS_NOT_HERE_GETS)))} bytes of the ` +
        `${String(spec.budgetBytes)} asked for and their names come to more than that. They are not named by id ` +
        'either, because an id with nothing beside it is a name for a thing you have nothing about. Ask for a ' +
        'larger size and they come back with their names.',
    )
  }
  lines.push('')
  // WHAT A READER CAN ACTUALLY QUOTE BACK, and this line used to name something the copy does not
  // carry. It said "quote the export number on the bundle"; a copy holds no export number, because
  // the text is assembled before anything leaves the building and a preview never leaves at all.
  // Found by the cold read of criterion B21 on 7 September 2026, in its own words: *No export number
  // appears anywhere in the text. So I cannot quote the export number, and I am not going to invent
  // or go looking for one.* That is criterion B19's failure — a part telling a reader with no API to
  // do a thing they cannot do — in the one line nobody had read as an instruction.
  lines.push(
    'Mole Office ran this. It did not send it anywhere and does not know whether it was read. If you send ' +
      'a result back, quote the two lines at the top of this text that begin About and Made, so Mole Office can say ' +
      'which reading of which project you were working from.',
  )
  return lines
}

/**
 * WHAT SHARE OF THE SIZE THE LIST OF WHAT IS MISSING MAY SPEND, as a divisor of the whole.
 *
 * ONE TWELFTH, and the number is what the parts already imply rather than a taste: a copy of twelve
 * parts gives each of them a twelfth, and this list is one more thing to read. Before this the list
 * was held to nothing at all and was 49.7% of a small copy.
 */
const WHAT_IS_NOT_HERE_GETS = 12

/**
 * NAME THE RECORDS A READER LEFT OUT, never by id alone, and stop when the room runs out.
 *
 * A title with an id beside it is a reference somebody can use. An id on its own names a thing the
 * reader has nothing about — their own counter-example, from register section 7, is
 * `93 records finished (id1, id2, id3...)`.
 *
 * THE LINE IS WRITTEN BY `referenceLine` AND NOT HERE. This function and `nameTheDropped` in
 * `src/server/lib/continuation.ts` each wrote their own `title (kind, id)`, which is one fact in
 * two places: a change to one would have left the other printing the old shape with nothing
 * failing. Criterion B18 of design/bundle/ACCEPTANCE.md.
 */
function namesOf(
  ids: readonly string[],
  meansHere: string | null,
  room: number,
): { lines: string[]; couldNotName: number } {
  if (ids.length === 0) return { lines: [], couldNotName: 0 }
  const lines: string[] = []
  let spent = 0
  let named = 0
  for (const id of ids) {
    const line = `    ${referenceLine(referenceTo(id, meansHere))}`
    const cost = Buffer.byteLength(line, 'utf8') + 1
    if (spent + cost > room) break
    lines.push(line)
    spent += cost
    named += 1
  }
  return { lines, couldNotName: ids.length - named }
}

/** `versionOf`'s hash function over the exported text. Sixteen hex characters. */
export function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

// ============================================================================ recording what left

/**
 * ONE ENTRY IN A CONTEXT BUNDLE'S `exports` LIST, as the server writes it.
 *
 * This is the shape `POST /api/bundles/export` has always written, named here so the one function
 * that writes it and the readers of it agree. The fields are the bundle's own; `textHash`,
 * `characters` and `bytes` are over the text that actually left, and `fits` says whether the
 * bundle's own body was inside the size it was assembled under.
 */
export interface AnExportEntry {
  n: number
  at: string
  by: { actorType: string; actorId: string }
  characters: number
  bytes: number
  textHash: string
  carried: CarriedRecord[]
  restrictions: CarriedRestriction[]
  leftOut: { bucket: string; count: number; says: string }[]
  fits: boolean
  /**
   * WHAT WENT WITH THE TEXT, when the caller asked for the related files. Absent when only the text
   * left, and then this entry is exactly what it was before the zip export existed.
   */
  files?: ZipExportFilesRecord
  /**
   * WHAT THE OUTSIDE-TEXT SCREEN SAID BEFORE A ZIP LEFT, recorded on the zip press that asked for
   * the related files. Absent on a text press, whose reply already carries the screen's answer, so
   * a text press writes exactly the entry it wrote before this field existed.
   */
  screening?: ScreeningAnswer
}

/** The exports on a bundle, as stored. Anything unreadable contributes none rather than throwing. */
export function exportsOf(data: unknown): AnExportEntry[] {
  const bag = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const list = bag['exports']
  if (!Array.isArray(list)) return []
  return list.filter((e): e is AnExportEntry =>
    typeof e === 'object' && e !== null && typeof (e as { n?: unknown }).n === 'number',
  )
}

/**
 * RECORD THAT TEXT LEFT THE BUILDING, through the one door every export already goes through.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT A COPY OF THE ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16 point 6: an outside export records what left the way `POST /api/bundles/export`
 * already records it, because that entry is the only evidence Mole Office has of what an outside
 * reader was handed. A second writer of the entry would be a second answer to "what does the record
 * of one leaving say", free to drift from the first with nothing failing. The two doors call this.
 *
 * `text` IS THE TEXT THAT ACTUALLY LEFT, and the size and the hash are over it. The bundle route
 * passes the bundle's own text; the F16 door passes the bundle text with its three extra sections
 * appended, so the hash it records is a hash of what the person pasted, not of the part of it that
 * came from the bundle. `carried`, `restrictions` and `leftOut` are the bundle's, because the
 * bundle is the reading those facts come from.
 *
 * WRITTEN BY THE SERVER, THROUGH THE ORDINARY PATCH DOOR, exactly as the route did it before: the
 * change log, the revision ledger and every guard on a write are the ones every other edit goes
 * through. The symbol `AN_EXPORT_IS_WRITTEN_BY_THE_SERVER` is what tells the guard on the `exports`
 * list that this write is the server's own act rather than an agent's imitation; it cannot be
 * produced by `JSON.parse`, so no request body can carry it.
 */
export function recordAnExport(input: {
  bundle: PanelRecord
  resolved: ResolvedBundle
  text: string
  actor: Actor
  /** What went with the text, when the caller asked for the related files. */
  files?: ZipExportFilesRecord
  /**
   * What the outside-text screen said before a zip left. Given only by a zip press, so a text press
   * records exactly the entry it recorded before this field existed.
   */
  screening?: ScreeningAnswer
}): AnExportEntry {
  const already = exportsOf(input.bundle.data)
  const entry: AnExportEntry = {
    n: already.length + 1,
    at: nowStamp(),
    by: { actorType: input.actor.type, actorId: input.actor.id },
    characters: input.text.length,
    bytes: Buffer.byteLength(input.text, 'utf8'),
    textHash: textHash(input.text),
    carried: input.resolved.carried,
    restrictions: input.resolved.restrictions,
    leftOut: input.resolved.leftOut.map((one) => ({ bucket: one.bucket, count: one.count, says: one.says })),
    fits: input.resolved.fits,
    ...(input.files === undefined ? {} : { files: input.files }),
    ...(input.screening === undefined ? {} : { screening: input.screening }),
  }
  patchRecord(
    input.bundle.id,
    { dataPatch: { exports: [...already, entry] }, [AN_EXPORT_IS_WRITTEN_BY_THE_SERVER]: true },
    input.actor,
  )
  return entry
}

// ============================================================================ reading a stored spec

/**
 * THE SPEC A BUNDLE RECORD STORES, READ BACK OUT OF ITS `data`.
 *
 * IT REFUSES A SPEC IT CANNOT READ, AND THAT IS A CHANGE. It used to fall back to `continue` for an
 * unknown preset, silently, while the preview door answered 400 for the same word — so the same bad
 * spec was a refusal through one door and a different bundle through the other. A stored spec
 * nothing can read is now a refusal that names the value, and the list route draws the row saying
 * so rather than dropping it.
 *
 * IT LIVES HERE rather than in the route file because two doors read a stored bundle: the bundle
 * routes and the F16 outside-export door, which takes the bundle the package points at. One reader
 * of a stored spec is what keeps the two from disagreeing about what a bundle says.
 */
export function specOf(data: unknown): BundleSpec {
  const bag = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const preset = String(bag['preset'] ?? 'continue')
  if (!(BUNDLE_PRESET_NAMES as readonly string[]).includes(preset)) {
    throw new PanelError(
      `This bundle is stored with a preset called "${preset}", and Mole Office has no such preset, so it cannot say ` +
        `what the copy would contain. The presets are ${BUNDLE_PRESET_NAMES.join(', ')}. Nothing was assembled ` +
        'and nothing was written.',
      422,
    )
  }
  const scopeRecordId = typeof bag['scopeRecordId'] === 'string' ? bag['scopeRecordId'] : null
  const slots = Array.isArray(bag['slots']) ? (bag['slots'] as unknown[]).map((one) => String(one)) : undefined
  // THE SAME REFUSAL BOTH DOORS MAKE, from the one function that decides it.
  const why = whyTheseSlotsCannotBeUsed(preset as BundlePreset, slots)
  if (why !== null) throw new PanelError(why, 422)
  const reach = typeof bag['reach'] === 'number' ? (bag['reach'] as 1 | 2 | 3) : undefined
  // ABSENT MEANS ALL OF THEM. A stored key that is not an array is not read as an empty choice —
  // that would be a copy carrying nothing under a part somebody asked for. Criterion B6.
  const chosenStructure = Array.isArray(bag['modulesAndPipelines'])
    ? (bag['modulesAndPipelines'] as unknown[]).map((one) => String(one))
    : undefined
  // ABSENT MEANS NONE. A stored key that is not an array is not read as an empty choice, which
  // would be a bundle refusing to resolve because of how it was written down. Criterion B8.
  const added = Array.isArray(bag['additionalRecords'])
    ? (bag['additionalRecords'] as unknown[]).map((one) => String(one))
    : undefined
  // THE SAME REFUSAL BOTH DOORS MAKE, from the one function that decides it — the same rule the
  // parts above go through. Without it a bundle stored with an empty list read as a bundle with no
  // list at all through this door and was refused through the other, and the list route drew the
  // row as if nothing were wrong. Criterion B8.
  const cannotAdd = whyTheseAdditionalRecordsCannotBeUsed(added)
  if (cannotAdd !== null) throw new PanelError(cannotAdd, 422)
  const detail = typeof bag['detail'] === 'string' ? bag['detail'] : undefined
  const shift = typeof bag['shift'] === 'number' ? bag['shift'] : undefined
  return {
    scope:
      bag['scope'] === 'record' && scopeRecordId !== null
        ? { kind: 'record', recordId: scopeRecordId }
        : { kind: 'project' },
    preset: preset as BundlePreset,
    ...(slots === undefined ? {} : { slots: slots as ScopeName[] }),
    ...(reach === undefined ? {} : { reach }),
    ...(chosenStructure === undefined ? {} : { modulesAndPipelines: chosenStructure }),
    ...(added === undefined ? {} : { additionalRecords: added }),
    ...(detail === undefined ? {} : { detail }),
    ...(shift === undefined ? {} : { shift }),
    budgetBytes: budgetFor(preset as BundlePreset, typeof bag['budgetBytes'] === 'number' ? bag['budgetBytes'] : undefined),
  }
}

/**
 * THE SIZE A COPY IS ASSEMBLED UNDER WHEN NOBODY SAYS.
 *
 * IT IS THE PRESET'S OWN NUMBER, and that is the fix rather than a tidier constant. `16 * 1024` was
 * written out four times — twice in this file, once in `openloops.ts` and once in the kind's own
 * documentation — and it was also WRONG for the governance pack, which needs about three times it
 * to carry a fork whole. Both doors read the number off the preset now.
 */
export function budgetFor(preset: BundlePreset, asked: number | undefined): number {
  return asked ?? BUNDLE_PRESETS[preset].budgetBytes
}
