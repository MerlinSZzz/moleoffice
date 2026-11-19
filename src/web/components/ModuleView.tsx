// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The module page: everything Mole Office knows about one subsystem, in the order you need it.
 *
 * Context, then the curated summary a human wrote on purpose, then the Parts with their
 * progress checklists, then the paths out to the files on disk, and on the side rail the links
 * both ways and the change log. This file also carries the Links and Changes panels, which
 * every record kind uses, so RecordPage can assemble the same page for a `claim` as for a
 * `module`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS FULL OF CHECKING CODE
 * ---------------------------------------------------------------------------------------
 * A module's fields live in the record's free-form `data` column, which the database does not
 * check. So this file checks them, and anything that is not the shape ModuleData promises is
 * reported in an alarm panel at the top of the module in plain words. A checklist that silently
 * showed nothing because one field was misspelled would be worse than no checklist at all --
 * you would trust it.
 *
 * The same rule runs the other way: a key in `data` that this view has no idea about is listed
 * at the bottom rather than dropped, because something wrote it on purpose.
 */

import type { RecordKind } from '@shared/types.ts'
import type { RecordRegionSource } from '@shared/regions.ts'
import { useEffect, useRef, useState } from 'react'
import { content, t, type WordKey } from '@shared/i18n.ts'
import { kindWord, linkWord } from '@shared/words.ts'
import { useCopy } from '../lib/copy.ts'
import {
  ITEM_STATES,
  LINK_TYPES,
  PATH_KINDS,
  type ItemState,
  type LinkType,
  type ModulePart,
  type PathRef,
  type ProgressItem,
  type ResolvedLink,
  type Change,
} from '@shared/types.ts'
import { KIND_SPECS, MODULE_STATES, completenessOf, type ModuleState } from '@shared/kinds.ts'
/**
 * THE FOUR LIFECYCLE WORDS AS A READER WOULD SAY THEM.
 *
 * The module list already draws these four as headings — "Being worked on", "Put down on purpose",
 * "Good enough for now", "Out of use" — and this panel drew the stored spellings in monospace, so
 * one product had two vocabularies for one field and only one of them was English. This is that
 * vocabulary in lower case, for the middle of a sentence.
 *
 * KEYED ON `ModuleState`, so a fifth word added to MODULE_STATES does not compile until somebody
 * has said what it means to a person.
 */
const MODULE_SAID: Readonly<Record<ModuleState, WordKey>> = {
  active: 'moduleView.moduleSaid.active',
  paused: 'moduleView.moduleSaid.paused',
  stable: 'moduleView.moduleSaid.stable',
  retired: 'moduleView.moduleSaid.retired',
}
import { reportReading, type ReportRow } from '@shared/attention.ts'
import { PROGRESS, progressOf, type Progress } from '@shared/work.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import type { RecordImplementationReply } from '../../server/api/implementation.ts'
/** Whether the reader has asked to see the machinery. See the derived-versus-stored tag below. */
import { useInspect } from '../lib/mode.ts'
/**
 * ONE DRAWING OF A REPORT, ON BOTH SURFACES THAT DRAW ONE.
 *
 * Home draws the reports waiting for a person and this page draws the reports written about this
 * module. They are the same rows saying the same things, so they are the same component — a second
 * one here would be free to word "nobody has said whether you read it" differently from the band on
 * Home, which is the defect this repository keeps finding.
 */
import { ReportLine } from './AttentionPanel.tsx'
import { ModuleSource } from './ModuleSource.tsx'
import { recordPath } from './router.tsx'

/**
 * WHAT A MODULE PANEL TELLS THE BLOCKS COMPONENT ABOUT ITSELF.
 *
 * The panel draws the module's own `summary` as the paragraph immediately above the blocks
 * (`p.mv-abstract`), inside a panel whose own title is the fixed words "Curated summary". So the
 * blocks are told the summary is already on the screen and are NOT told the title is, because it
 * is not.
 *
 * UNREACHED TODAY AND SAID SO. This call passes no `stored`, so the blocks component never reaches
 * the opening lines here at all and the list is never read. It is written against the surface as it
 * will be when a module gets a stored source; see the constant's own note.
 */
function panelHolds(
  moduleId: string,
  whole: RecordRegionSource,
): { recordId: string; kind: string; wholeRecord: RecordRegionSource } {
  // EVERYTHING THE MODULE HOLDS, CARRIED IN, so the tree this panel announces is the tree the write
  // door validates against and not the curated blocks alone. The three parts are the same three
  // `sectionsOf` is asked for a few lines below — one reading, so the panel's sections and the
  // announced tree cannot disagree about what this module is made of. See
  // `BlocksInRecord.wholeRecord` in SummaryBlocks.tsx.
  return { recordId: moduleId, kind: 'module', wholeRecord: whole }
}
import { NO_SUMMARY, SummaryBlocks, paragraphsOf, type SummaryBlock } from './SummaryBlocks.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  Explain,
  Field,
  Hint,
  IncompleteMark,
  Loading,
  Panel,
  PROGRESS_WORDS,
  Row,
  Select,
  StateChip,
  StateGlyph,
  Stamp,
  StoredState,
  Tag,
  TextInput,
  type AsyncState,
} from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
// WHAT A PANEL DRAWING ONE SECTION OF THIS MODULE SAYS IT IS. See components/sections.ts.
import { sectionsOf, titleHere } from './sections.ts'
import type { Declares } from './declares.ts'
import {
  CLAIMED_SOURCE_KEY,
  READING_MATTER_KEY,
  REPORTS_ABOUT_KEY,
  STANDING_KEY,
} from '@shared/sections.ts'

// ============================================================================ reading `data`

/**
 * The keys this view understands. Anything else in `data` is listed, not dropped.
 *
 * READ OFF THE SCHEMA, NEVER TYPED OUT HERE. This list used to be five hand-written strings and
 * it fell behind KIND_SPECS by three: `claims`, `source` and `extra` are all documented at
 * GET /api/kinds/module, and a module that used them had them filed under the panel headed "not
 * part of a module" — the canonical layer and its own page disagreeing about what a module is.
 * Derived from KIND_SPECS, a field added to the schema is understood here the moment it is
 * declared, and the only way to fall behind again is to add a field and draw nothing for it,
 * which is what tests/surface-fixes.test.ts fails on.
 */
const KNOWN_MODULE_KEYS: readonly string[] = [
  ...KIND_SPECS.module.fields.map((field) => field.key),
  // AND `claims`, WHICH THE SCHEMA NO LONGER DECLARES AND THIS PAGE STILL DRAWS.
  //
  // Window B emptied `data.claims` into `implementation_map` and deleted the declaration in the same
  // commit, so no record written after it holds the key — but a corpus restored from a backup taken
  // before it does, and `parseModule` above still reads one into its own panel. Without this line
  // that record's claims would be drawn TWICE: once as claims, and once again underneath as "not one
  // of a module's own fields". Named here rather than left to the schema, because the fact this
  // line states is about this page rather than about the kind.
  'claims',
]

/** PathRef.kind is a closed set. An unknown one is reported rather than quietly drawn as "other". */
// PATH_KINDS is imported from the contract, not typed out here. It was a hand-written copy of
// the same eight words, from back when the list was declared inline on PathRef and there was
// nothing to import; the const exists now, so a ninth kind added to the schema is understood
// here the moment it is declared instead of being reported as "not one of" and drawn as "other".

interface ParsedModule {
  context: string | null
  /**
   * The LIFECYCLE word somebody wrote on this module, or null when nobody has.
   *
   * NULL IS NOT A DEFAULT AND MUST NEVER BE DRAWN AS ONE. `active`, `paused`, `stable` and
   * `retired` are four postures a person chooses; "nobody has chosen" is a fifth answer and it is
   * the true one for most modules. It is deliberately kept apart from the CONDITION below, which
   * nobody writes at all — see `moduleCondition`.
   */
  lifecycle: ModuleState | null
  /** The one-paragraph curated summary. `summaryBlocks` is the long form of the same job. */
  summary: string | null
  parts: ModulePart[]
  paths: PathRef[]
  /**
   * Repository-relative paths and globs this module has taken responsibility for.
   *
   * The opposite direction to `paths`, which is why they are drawn as two panels and never as
   * one list: a PathRef points OUT of the repository at a report or a capture, absolute, on a
   * machine that may not be this one; a claim points IN, at code the source index scans.
   */
  claims: string[]
  /** Where the module's material came from, when it was taken from somewhere else. */
  source: string | null
  /**
   * The `extra` field: the declared bag for anything a module needs that has no field of its own.
   *
   * NOT `extras` below. This one is a documented field of the module kind and its contents were
   * put there on purpose; `extras` is keys nothing declared. Null means the key is absent, which
   * is different from an empty object somebody stored.
   */
  extra: Record<string, unknown> | null
  blocks: SummaryBlock[]
  /** Keys in `data` that are not part of ModuleData, with their values, shown at the bottom. */
  extras: [string, unknown][]
  /** Anything that was not the shape ModuleData promises. Shown, never hidden. */
  problems: string[]
  /**
   * How many of `problems` are about something that reached NO count on this page.
   *
   * `problems.length` IS THE WRONG NUMBER FOR THE DERIVED CONDITION, and using it there was the
   * page contradicting itself inside one paragraph. An item whose state word is not one of
   * ITEM_STATES is still DRAWN — as `todo`, which `parseItem` says out loud in the alarm panel —
   * so it is in the tally like every other item. The standing panel printed "Worked out from 1
   * checklist item in 1 part: 1 not started." and then, of that same item, "1 thing in this record
   * could not be read at all and is counted in none of the above."
   *
   * So the substituted ones are subtracted here and the panel counts what is genuinely missing
   * from its arithmetic. They are not lost: the alarm panel at the top names every problem, and
   * names the substitution as a substitution.
   */
  uncounted: number
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/**
 * One checklist item, and whether reading it required a substitution.
 *
 * `substituted` is not decoration. An item drawn under a state word this view does not recognise
 * is still an item on the checklist and is still counted by `moduleCondition`, so the caller has to
 * be able to tell it apart from an item that was dropped — see `ParsedModule.uncounted`.
 */
function parseItem(
  raw: unknown,
  where: string,
  problems: string[],
): { item: ProgressItem; substituted: boolean } | null {
  if (!isObject(raw)) {
    problems.push(t('moduleView.problem.notAnObject', { where: content(where) }))
    return null
  }
  const text = str(raw['text'])
  if (text === null) {
    problems.push(t('moduleView.problem.hasNoText', { where: content(where) }))
    return null
  }
  const stateRaw = str(raw['state'])
  const state = ITEM_STATES.includes(stateRaw as ItemState) ? (stateRaw as ItemState) : null
  if (state === null) {
    problems.push(
      t('moduleView.problem.badItemState', {
        where: content(where),
        state: content(JSON.stringify(raw['state'])),
        allowed: content(ITEM_STATES.join(', ')),
      }),
    )
  }
  return {
    item: {
      id: str(raw['id']) ?? where,
      text,
      state: state ?? 'todo',
      ...(str(raw['note']) !== null ? { note: str(raw['note']) as string } : {}),
      ...(typeof raw['hours'] === 'number' ? { hours: raw['hours'] } : {}),
    },
    substituted: state === null,
  }
}

export function parseModule(data: Record<string, unknown>): ParsedModule {
  const problems: string[] = []
  /** Problems whose subject this view drew anyway, and which are therefore still counted. */
  let drawnAnyway = 0

  const context = str(data['context'])
  if (context === null && data['context'] !== undefined) problems.push('`context` is present but is not text.')

  const summary = str(data['summary'])
  if (summary === null && data['summary'] !== undefined) problems.push('`summary` is present but is not text.')

  // -------------------------------------------------------------------------- lifecycle
  //
  // ABSENT AND UNREADABLE ARE TWO DIFFERENT THINGS AND THEY LAND IN TWO DIFFERENT PLACES. A module
  // with no `state` key has had no posture chosen, which is the ordinary case and is drawn as an
  // answer by the panel below. A module whose `state` holds a word that is not one of the four has
  // something stored that this view cannot honour, so it goes in the alarm panel and the word is
  // NOT shown as a lifecycle -- a posture nobody could have chosen is not one of the four, and
  // printing it would put a fifth word on screen that the vocabulary does not have.
  let lifecycle: ModuleState | null = null
  const rawState = data['state']
  if (rawState !== undefined) {
    const word = str(rawState)
    if (word !== null && (MODULE_STATES as readonly string[]).includes(word)) {
      lifecycle = word as ModuleState
    } else {
      problems.push(
        `\`state\` is ${JSON.stringify(rawState)}, which is not one of ${MODULE_STATES.join(', ')}. ` +
          t('moduleView.problem.notALifecycle'),
      )
    }
  }

  // -------------------------------------------------------------------------- parts
  const parts: ModulePart[] = []
  const rawParts = data['parts']
  if (Array.isArray(rawParts)) {
    rawParts.forEach((rawPart, i) => {
      if (!isObject(rawPart)) {
        problems.push(t('moduleView.problem.partNotObject', { n: i + 1 }))
        return
      }
      const name = str(rawPart['name'])
      if (name === null) {
        problems.push(t('moduleView.problem.partNoName', { n: i + 1 }))
        return
      }
      const rawItems = rawPart['items']
      const items: ProgressItem[] = []
      if (Array.isArray(rawItems)) {
        rawItems.forEach((rawItem, j) => {
          const read = parseItem(rawItem, `Part "${name}" item ${j + 1}`, problems)
          if (read === null) return
          items.push(read.item)
          if (read.substituted) drawnAnyway += 1
        })
      } else if (rawItems !== undefined) {
        problems.push(t('moduleView.problem.partItemsNotList', { name: content(name) }))
      }
      parts.push({ id: str(rawPart['id']) ?? `part-${i}`, name, items })
    })
  } else if (rawParts !== undefined) {
    problems.push('`parts` is present but is not a list.')
  }

  // -------------------------------------------------------------------------- paths
  const paths: PathRef[] = []
  const rawPaths = data['paths']
  if (Array.isArray(rawPaths)) {
    rawPaths.forEach((rawPath, i) => {
      if (!isObject(rawPath)) {
        problems.push(t('moduleView.problem.pathNotObject', { n: i + 1 }))
        return
      }
      const path = str(rawPath['path'])
      if (path === null) {
        problems.push(t('moduleView.problem.pathNoPath', { n: i + 1 }))
        return
      }
      const kindRaw = str(rawPath['kind'])
      // An unrecognised kind is named out loud. Folding it into "other" would hide the fact
      // that whatever wrote this record and this view disagree about the vocabulary.
      const kind = PATH_KINDS.find((k) => k === kindRaw)
      if (kind === undefined) {
        problems.push(
          t('moduleView.problem.pathBadKind', {
            n: i + 1,
            path: content(path),
            kind: content(JSON.stringify(rawPath['kind'])),
            allowed: content(PATH_KINDS.join(', ')),
          }),
        )
      }
      paths.push({
        id: str(rawPath['id']) ?? `path-${i}`,
        label: str(rawPath['label']) ?? path,
        path,
        kind: kind ?? 'other',
        ...(str(rawPath['machine']) !== null ? { machine: str(rawPath['machine']) as string } : {}),
      })
    })
  } else if (rawPaths !== undefined) {
    problems.push('`paths` is present but is not a list.')
  }

  // -------------------------------------------------------------------------- claims
  const claims: string[] = []
  const rawClaims = data['claims']
  if (Array.isArray(rawClaims)) {
    rawClaims.forEach((rawClaim, i) => {
      const claim = str(rawClaim)
      if (claim === null) {
        // Named rather than skipped: a claim that is not text resolves to nothing, and a module
        // that appears to claim nothing is how a file ends up with no owner and nobody notices.
        problems.push(
          t('moduleView.problem.claimNotText', { n: i + 1, value: content(JSON.stringify(rawClaim)) }),
        )
        return
      }
      claims.push(claim)
    })
  } else if (rawClaims !== undefined) {
    problems.push('`claims` is present but is not a list.')
  }

  // -------------------------------------------------------------------------- provenance
  const source = str(data['source'])
  if (source === null && data['source'] !== undefined) problems.push('`source` is present but is not text.')

  // -------------------------------------------------------------------------- the extra bag
  //
  // `extra` is declared as Record<string, unknown>, so its VALUES are nobody's business to check
  // -- that is the point of the field. Only the container is checked, because a string or a list
  // here cannot be drawn as key/value at all.
  let extra: Record<string, unknown> | null = null
  const rawExtra = data['extra']
  if (isObject(rawExtra)) {
    extra = rawExtra
  } else if (rawExtra !== undefined) {
    problems.push('`extra` is present but is not an object of keys and values.')
  }

  // -------------------------------------------------------------------------- curated summary
  //
  // Only the structure is checked here -- is it a list, is each entry an object with a `type`.
  // What each block type MEANS is SummaryBlocks' business, and it already draws a block it
  // cannot render as a labelled refusal rather than as a gap. Checking the same thing twice in
  // two files is how the two end up disagreeing.
  const blocks: SummaryBlock[] = []
  const rawBlocks = data['summaryBlocks']
  if (Array.isArray(rawBlocks)) {
    rawBlocks.forEach((rawBlock, i) => {
      if (!isObject(rawBlock)) {
        problems.push(t('moduleView.problem.summaryBlockNotObject', { n: i + 1 }))
        return
      }
      if (str(rawBlock['type']) === null) {
        problems.push(t('moduleView.problem.summaryBlockNoType', { n: i + 1 }))
        return
      }
      blocks.push(rawBlock as unknown as SummaryBlock)
    })
  } else if (rawBlocks !== undefined) {
    problems.push('`summaryBlocks` is present but is not a list.')
  }

  const extras = Object.entries(data).filter(([key]) => !KNOWN_MODULE_KEYS.includes(key))

  return {
    context,
    lifecycle,
    summary,
    parts,
    paths,
    claims,
    source,
    extra,
    blocks,
    extras,
    problems,
    // One subtraction, in one place, from two numbers this function is the only producer of, so
    // there is no second opinion anywhere about which problems are in the tally.
    uncounted: problems.length - drawnAnyway,
  }
}

// ============================================================================ small shared pieces

/**
 * Point one element's tone variables at one state's semantic tokens.
 *
 * Same trick ui.tsx uses, and for the same reason: meaning lives in `--st-failed`, never in
 * `--red`, so a theme may recolour "failed" but can never change what it means.
 */
function toneVars(state: ItemState): React.CSSProperties {
  return {
    '--mv-tone': `var(--st-${state})`,
    '--mv-tone-bg': `var(--st-${state}-bg)`,
    '--mv-tone-row': `var(--st-${state}-row)`,
    '--mv-tone-line': `var(--st-${state}-line)`,
  } as unknown as React.CSSProperties
}

// The copy hook lives in ../lib/copy.ts since 8 September 2026: one fact in one place, and the
// fallback for an insecure origin (their other machine) is written once there.

/**
 * The alarm panel that carries everything this view could not read.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS NOT THE SAME THING AS AN INCOMPLETE RECORD, AND MUST NEVER LOOK LIKE ONE
 * ---------------------------------------------------------------------------------------
 * A reader tells them apart by what the page does, before reading a word of either:
 *
 *   THIS panel   rank 0, tone `broken`: an alarm colour, a filled tint, a spine down the left
 *                edge, weight 700. It fires when something IS in `data` and is not the shape
 *                ModuleData promises — `parts` is a string, a part has no name, a summary block
 *                has no type. Content that exists and lies. The page around it cannot be
 *                trusted until somebody fixes the record.
 *
 *   <Incomplete> the `todo` tone, no spine, no alarm fill, weight 500. It fires when a field
 *                that a finished module carries is not there AT ALL. Nothing lies; there is
 *                simply less of the record than a finished one has, which the server allows on
 *                purpose so a stub can be filed the minute work starts.
 *
 * Two different things happened, so two different treatments, and no channel they share carries
 * the same value. If these ever converge, a misspelt field and an honestly-unwritten one look
 * identical, and the whole point of showing either is lost.
 *
 * The two also cannot both be true of the same field: a `context` that is present but not text
 * lands here, and a `context` that is absent lands in the incomplete list. Never both.
 */
function ProblemPanel({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null
  return (
    <Panel declares={{ surface: null }}
      title={t('pageWords.ModuleView.unreadableCount', { n: problems.length })}
      kind="stored data"
      rank={0}
      tone="broken"
    >
      <ul className="mv-problems">
        {problems.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </Panel>
  )
}

// ============================================================================ progress tally

const STATE_MEANING: Record<ItemState, WordKey> = {
  todo: 'moduleView.itemMeaning.todo',
  doing: 'moduleView.itemMeaning.doing',
  done: 'moduleView.itemMeaning.done',
  failed: 'moduleView.itemMeaning.failed',
  blocked: 'moduleView.itemMeaning.blocked',
}

/**
 * How a part is going, three ways at once: a bar, a set of counts, and words.
 *
 * The bar alone would be colour-only, which is banned. The counts beside it carry the same
 * information as a word plus a shape, so the tally survives greyscale, a mono theme and a
 * reader who cannot tell the red segment from the green one.
 */
function PartTally({ items }: { items: ProgressItem[] }) {
  const inspect = useInspect()
  if (items.length === 0) return null
  const counts = ITEM_STATES.map((state) => ({ state, n: items.filter((i) => i.state === state).length })).filter(
    (c) => c.n > 0,
  )
  const done = items.filter((i) => i.state === 'done').length

  return (
    <div className="mv-tally">
      <span className="mv-tally-count num">
        {t('moduleView.tally.done', { done, n: items.length })}
      </span>
      <span className="mv-meter" aria-hidden="true">
        {counts.map((c) => (
          <span key={c.state} className="mv-meter-seg" style={{ ...toneVars(c.state), flexGrow: c.n }} />
        ))}
      </span>
      <span className="mv-tally-items">
        {counts.map((c) => (
          <span
            key={c.state}
            className="mv-tally-item"
            style={toneVars(c.state)}
            title={t('moduleView.tally.itemTitle', { n: c.n, meaning: t(STATE_MEANING[c.state]) })}
          >
            <StateGlyph state={c.state} />
            {/* THE CHIP'S OWN WORD FOR THE STATE, and the stored word in Developer mode (problem oQdFG3cyRWI_ item 9). */}
            <span className="num">{c.n}</span> {inspect ? c.state : t(`state.${c.state}`)}
          </span>
        ))}
      </span>
    </div>
  )
}

// ============================================================================ the derived condition

/**
 * ---------------------------------------------------------------------------------------
 * A MODULE'S CONDITION IS WORKED OUT FROM ITS PARTS, AND IT IS NAMED AS WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * A module has no field that says how it is going, and it is not getting one: a subsystem is not
 * todo or done, its parts are. The consequence on screen was that twenty-six of twenty-seven
 * modules sat in the bucket labelled *nobody wrote a state here* — literally true, and useless.
 *
 * The answer is not a new stored word. It is that the reading surface STOPS ASKING A MODULE FOR A
 * CONDITION and counts one from the checklist it already counts for the progress strip. Two rules
 * bind that, and both of them are about naming rather than arithmetic:
 *
 *   1. IT MUST BE NAMED AS DERIVED. The panel says it was worked out, from what, and that nothing
 *      here is stored. It gets no state chip, because a chip is what a STORED word wears everywhere
 *      else in this product and wearing one would be the lie.
 *
 *   2. IT MUST NOT BE SERVED UNDER A STORED-SOUNDING NAME. None of the phrases below is one of
 *      MODULE_STATES, and none of them is a bare state word at all: they are short clauses about
 *      the checklist — "something stopped short", "work under way" — because a reader who saw
 *      `active` here could not tell it from the `active` somebody typed. tests/vocab-lifecycle.ts
 *      fails if a phrase here ever collides with a lifecycle word.
 *
 * THE CONDITION AND THE LIFECYCLE ARE TWO DIFFERENT FACTS about the same module and the panel draws
 * them as two. Lifecycle is our posture toward the subsystem, authored, often absent. Condition is
 * where the checklist has got to, never authored, always computable from what is there. A module
 * can honestly be `stable` with three items still open, and `active` with every item finished.
 *
 * ONE CLASSIFICATION TABLE, NOT A SECOND ONE. Every item is classified by `progressOf` — the same
 * flat table every other surface in Mole Office reads — so an item state word can never mean one thing
 * on the attention list and another here.
 */
export const MODULE_CONDITIONS = [
  /** No `parts` at all. There is nothing to count, and Mole Office will not name a condition. */
  'no-parts',
  /** Parts exist and not one of them holds a checklist item. Still nothing to count. */
  'no-items',
  /**
   * Items exist and not one of them classifies into a bucket this rule reads.
   *
   * IT CANNOT FIRE TODAY AND IT IS STILL HERE. `parseModule` draws an item whose state word it does
   * not recognise as `todo` and says so in the alarm panel, and tests/state-vocabulary.test.ts
   * fails if any ITEM_STATES word is missing from STATE_MEANING — so every item reaching this
   * function classifies. It is a line in a precedence chain rather than a feature: deleting it
   * would make an all-unclassified checklist fall through to `part-done`, which is a guess.
   */
  'cannot-tell',
  /** At least one item began and did not finish. Said first, because it is the thing to act on. */
  'stopped-short',
  /** Every item finished. */
  'all-finished',
  /** Somebody is on at least one item right now, and nothing stopped short. */
  'in-progress',
  /** Some items finished, none under way, none stopped short. */
  'part-done',
  /** Every item is still to be started. */
  'not-started',
] as const
export type ModuleConditionName = (typeof MODULE_CONDITIONS)[number]

/**
 * The words each condition prints.
 *
 * CLAUSES, NOT STATE WORDS, and that is the whole point of them. A single word here would be read
 * as the module's own — the exact thing the decision forbids — so each one says something about the
 * checklist that no stored field could have said.
 */
export const CONDITION_PHRASE: Readonly<Record<ModuleConditionName, WordKey>> = {
  'no-parts': 'moduleView.conditionPhrase.no-parts',
  'no-items': 'moduleView.conditionPhrase.no-items',
  'cannot-tell': 'moduleView.conditionPhrase.cannot-tell',
  'stopped-short': 'moduleView.conditionPhrase.stopped-short',
  'all-finished': 'moduleView.conditionPhrase.all-finished',
  'in-progress': 'moduleView.conditionPhrase.in-progress',
  'part-done': 'moduleView.conditionPhrase.part-done',
  'not-started': 'moduleView.conditionPhrase.not-started',
}

export interface ModuleCondition {
  name: ModuleConditionName
  /** The clause shown on screen. Never a lifecycle word. */
  phrase: string
  /** The sentence under it: what was counted, and that none of it is stored. */
  because: string
  parts: number
  items: number
  /** How many items landed in each classification, in PROGRESS order, zeroes left out. */
  tally: { progress: Progress; n: number }[]
  /**
   * How many checklist items carry each of the five item words, counted in the same walk.
   *
   * WHY THE STATE WORDS AND NOT ONLY THE CLASSIFICATION ABOVE. `blocked` and `failed` both
   * classify as `stopped_short`, so `tally` can say that fifteen items stopped and cannot say
   * which of them was tried and broke and which is waiting on something else. Those are two
   * different things to do, and a module list that showed only what finished hid both: measured on
   * the live corpus, the twelve modules in `greenhouse` hold 6 failed and 9 blocked items and every
   * row said only "N / M checked".
   *
   * COUNTED HERE AND NOT A SECOND TIME BY THE CALLER. Every surface that wants the numbers takes
   * them from this one walk, so a module page and a module row cannot come to disagree.
   */
  byState: Readonly<Record<ItemState, number>>
}

/**
 * How many items classify each way. `progressOf` is the one table; `null` cannot come back from an
 * `ItemState`, and if it ever did the item would count towards nothing and `cannot-tell` would say
 * so rather than the item being quietly filed as not started.
 */
function tallyOf(parts: readonly ModulePart[]): Map<Progress, number> {
  const counts = new Map<Progress, number>()
  for (const part of parts) {
    for (const item of part.items) {
      const progress = progressOf(item.state)
      if (progress === null) continue
      counts.set(progress, (counts.get(progress) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * How many items carry each of the five item words.
 *
 * Every word starts at zero and stays in the object, because a caller asking "how many failed"
 * must get 0 and not undefined -- the two read the same in a template and only one of them is an
 * answer.
 */
function stateTallyOf(parts: readonly ModulePart[]): Record<ItemState, number> {
  const counts = Object.fromEntries(ITEM_STATES.map((state) => [state, 0])) as Record<ItemState, number>
  for (const part of parts) {
    for (const item of part.items) counts[item.state] += 1
  }
  return counts
}

/** Each classification's word. A table and not a template, so the machine-word gate sees no stored word reach prose. */
const PROGRESS_WORD: Readonly<Record<Progress, WordKey>> = {
  not_started: 'g2b.progress.not_started',
  in_flight: 'g2b.progress.in_flight',
  stopped_short: 'g2b.progress.stopped_short',
  finished: 'g2b.progress.finished',
  paused: 'g2b.progress.paused',
  unknown: 'g2b.progress.unknown',
  unclassified: 'g2b.progress.unclassified',
}

/** One count of the classification, in the page's words: "1 not started" / "未开始 1 项" (problem oQdFG3cyRWI_ item 7). */
function progressCount(progress: Progress, n: number): string {
  return t('moduleView.condition.progressCount', { n, progress: t(PROGRESS_WORD[progress]) })
}

/**
 * A module's condition, worked out from its parts. Pure, and nothing about it is stored.
 *
 * The precedence is the order of MODULE_CONDITIONS above and each step is a fact rather than a
 * preference: nothing to count comes before anything counted, and "something stopped short" comes
 * before every other reading of a mixed checklist because it is the one a person can act on.
 */
export function moduleCondition(parts: readonly ModulePart[]): ModuleCondition {
  const counts = tallyOf(parts)
  const items = parts.reduce((n, part) => n + part.items.length, 0)
  const n = (progress: Progress): number => counts.get(progress) ?? 0
  const tally = PROGRESS.map((progress) => ({ progress, n: n(progress) })).filter((entry) => entry.n > 0)
  const counted = n('not_started') + n('in_flight') + n('finished') + n('stopped_short')

  const name: ModuleConditionName =
    parts.length === 0
      ? 'no-parts'
      : items === 0
        ? 'no-items'
        : counted === 0
          ? 'cannot-tell'
          : n('stopped_short') > 0
            ? 'stopped-short'
            : n('finished') === items
              ? 'all-finished'
              : n('in_flight') > 0
                ? 'in-progress'
                : n('not_started') === items
                  ? 'not-started'
                  : 'part-done'

  const counting = tally.map((entry) => progressCount(entry.progress, entry.n)).join(t('moduleView.condition.countGap'))
  // The arithmetic and nothing else. That it was counted rather than written is said by the
  // `derived, not stored` tag beside it and by the section head "worked out from the parts below",
  // both of which are on screen at the same moment; a third saying of it was furniture.
  const worked = t('moduleView.condition.workedOutFrom', {
    items: content(t('moduleView.condition.itemsCount', { n: items })),
    parts: content(t('moduleView.condition.partsCount', { n: parts.length })),
    counting: content(counting),
  })

  const because =
    name === 'no-parts'
      ? t('moduleView.condition.noParts')
      : name === 'no-items'
        ? t('moduleView.condition.noItems', { n: parts.length })
        : name === 'cannot-tell'
          ? t('moduleView.condition.cannotTell', { n: items })
          : worked

  return {
    name,
    phrase: t(CONDITION_PHRASE[name]),
    because,
    parts: parts.length,
    items,
    tally,
    byState: stateTallyOf(parts),
  }
}

/**
 * Where this module stands: one word somebody wrote, and one nobody did.
 *
 * TWO ROWS, DRAWN DIFFERENTLY ON PURPOSE. The lifecycle wears the chip every stored state word in
 * this product wears, so it reads as stored. The condition wears no chip at all and carries a tag
 * that says it was worked out — because the one thing this must never do is let a counted answer
 * pass for an authored one.
 *
 * IT SITS DIRECTLY ABOVE `Parts`, and that placement is the argument. The thing the condition was
 * counted from is the next panel down, so a reader who doubts the clause can check the arithmetic
 * without leaving the screen.
 */
function StandingPanel({
  declares,
  lifecycle,
  condition,
  uncounted,
}: {
  /**
   * WHICH SECTION OF THE MODULE THIS PANEL DRAWS — `section.standing`, from the caller's own
   * `sectionsOf`. It is passed in rather than worked out here for the reason `Evolution` takes one:
   * `sectionsOf` needs the record's kind, data, summary and relations, and this panel has none of
   * the four.
   */
  declares: Declares
  lifecycle: ModuleState | null
  condition: ModuleCondition
  /**
   * How many unreadable things are in NO tally on this panel, so the counting can admit it.
   *
   * `ParsedModule.uncounted`, never `problems.length`: an item drawn under a substituted state
   * word IS counted, and saying otherwise contradicted the arithmetic in the sentence above it.
   */
  uncounted: number
}) {
  const progress = lifecycle === null ? null : progressOf(lifecycle)
  const inspect = useInspect()

  return (
    // No eyebrow. "One word written, one worked out" was a third label for the two column heads
    // directly under it, which say the same thing about the column each one is over.
    <Panel declares={declares} title={t('record.section.standing')}>
      <div className="mv-standing">
        <section className="mv-stand">
          {/* NOT "Lifecycle — our posture toward this subsystem". Three words wrong in one line:
              `lifecycle` is the ontology's name for the field, `posture` is a metaphor a reader has
              to be taught, and `subsystem` is not what this page calls this thing anywhere else —
              it calls it a module. The half that was doing real work is "written by a person",
              which is what separates this row from the derived one beneath it; it survives as
              "you choose this". */}
          <h3 className="mv-stand-head">
            {t('moduleView.standing.head')} <span className="mv-stand-note">{t('moduleView.standing.youChoose')}</span>
          </h3>
          {lifecycle === null ? (
            <>
              <p className="mv-stand-line">
                {/* `StoredState` with no word, and not `NoStateMark`. Both draw an empty slot, and
                    NoStateMark's sentence is "Mole Office cannot tell whether this stopped short" —
                    which would contradict the panel beside it, where Mole Office has just worked out
                    from the checklist whether it did. Two rows on one panel must not disagree. */}
                <StoredState state={null} progress={null} />
              </p>
              {/* The vocabulary is read once and skipped for every visit afterwards, so it folds.
                  What stays visible is the part that is a fact about THIS record: nobody chose,
                  and no word arrives by itself. */}
              <Explain declares={{ surface: null }}
                meaning={t('moduleView.standing.noDefault')}
                opens={t('moduleView.standing.theFour')}
              >
                {/* THE FOUR IN PLAIN WORDS, NOT FOUR STORED WORDS IN MONOSPACE. The stored spelling
                    is what Developer mode is for and is on every module tag already. `MODULE_SAID`
                    is keyed on MODULE_STATES, so a fifth word does not compile until somebody has
                    said what it means to a reader. */}
                <p className="mv-note">{MODULE_STATES.map((word) => t(MODULE_SAID[word])).join(' · ')}</p>
              </Explain>
            </>
          ) : (
            <>
              <p className="mv-stand-line">
                <StoredState state={lifecycle} progress={progress} />
              </p>
              {progress === null ? null : <p className="mv-note">{t('moduleView.standing.itMeans', { meaning: PROGRESS_WORDS[progress] })}</p>}
            </>
          )}
        </section>

        <section className="mv-stand">
          <h3 className="mv-stand-head">
            {t('moduleView.condition.head')}{' '}
            <span className="mv-stand-note">{t('moduleView.condition.headNote')}</span>
          </h3>
          <p className="mv-stand-line">
            {/* No chip. A chip is what a stored word wears everywhere in this app, and this word
                was written by nobody. The phrase and the tag carry it instead. */}
            <span className="mv-condition" data-condition={condition.name}>
              {condition.phrase}
            </span>
            {/* DEVELOPER MODE ONLY. docs/UX-CONTRACT.md lists derived-versus-stored diagnostics
                among the things that belong in Inspect, by name, and this was drawn in Normal. It is
                also the same fact as the eyebrow directly above it, which already says "worked out
                from the parts below" in English. Rendered conditionally rather than hidden with
                CSS, so a screen reader on a Normal page is not read it either. */}
            {inspect ? (
              <Tag
                tone="quiet"
                title={t('moduleView.condition.derivedTitle')}
              >
                {t('moduleView.condition.derived')}
              </Tag>
            ) : null}
          </p>
          <p className="mv-note">
            {condition.because}
            {/* The tail used to be "— the panel at the top of the page names them", which described
                where a rank-0 alarm panel on the same page is. The count and its consequence for
                this arithmetic are the parts a reader cannot see. */}
            {uncounted > 0 ? (
              <>
                {t('moduleView.condition.uncountedGap')}
                {t('moduleView.condition.uncounted', { n: uncounted })}
              </>
            ) : null}
          </p>
        </section>
      </div>
    </Panel>
  )
}

// ============================================================================ paths

/**
 * One pointer into the archive.
 *
 * DELIBERATELY NOT AN ANCHOR. A `file:///...` link from a page served over http is
 * refused by every browser without firing an error the page can see, so a link here would be a
 * control that does nothing and says nothing -- worse than no control. The path is shown in
 * full instead, selectable, with a copy button, because pasting it into a terminal or a file
 * manager is what you actually came here to do.
 */
function PathRow({ path }: { path: PathRef }) {
  const { state, copy } = useCopy()
  const inspect = useInspect()
  const id = `mv-path-${path.id}`

  return (
    <li className="mv-path">
      <div className="mv-path-head">
        {/* THE KIND IN WORDS, and the stored word in Developer mode (problem oQdFG3cyRWI_ item 12). */}
        <Tag tone="quiet">{inspect ? path.kind : t(`moduleView.pathKind.${path.kind}`)}</Tag>
        <span className="mv-path-label">{path.label}</span>
        {path.machine ? (
          <Tag tone="warn" title={t('moduleView.path.elsewhereTitle')}>
            {t('moduleView.path.onMachine', { machine: path.machine })}
          </Tag>
        ) : null}
      </div>
      <div className="mv-path-line">
        {/* THE PATH ITSELF IS DEVELOPER MODE'S, AND THE PRESS THAT COPIES IT IS NOT: normal mode keeps
            the label and the copy press (plan 7FEOshq3mBGG, G2c). */}
        {inspect ? (
          <code className="mv-path-value wrap-anywhere" id={id}>
            {path.path}
          </code>
        ) : null}
        <span className="mv-path-act">
          <Btn size="sm" variant="ghost" onClick={() => copy(path.path)} title={t('moduleView.path.copyTitle', { path: path.path })}>
            {state === 'copied' ? t('moduleView.path.copied') : state === 'failed' ? t('moduleView.path.copyBlocked') : t('sb.path.copyPath')}
          </Btn>
        </span>
      </div>
      {state === 'failed' ? (
        <p className="mv-note mv-note-bad" role="status">
          {t('moduleView.path.clipboardRefused')}
        </p>
      ) : null}
    </li>
  )
}

// ============================================================================ reports about this

/**
 * The reports written ABOUT this module, and how many of them have been deleted.
 *
 * WHAT A REPORT IS ABOUT IS A LINK AND NEVER A FIELD, so this is read from the links on the
 * module's own record: an incoming `about` link from a record of kind `report`. Nothing here parses
 * a title or guesses a subject, and there is no second stored copy that could disagree with the
 * link — that is the whole reason the report kind has no `about` field.
 *
 * EACH REPORT IS THEN READ IN FULL, one request each, because who it is for and whether it has been
 * read live in the report's own `data` and a link projection carries only id, kind and title. There
 * are usually one or two; a module with fifty reviews would be a different problem and does not
 * exist. The full subject list comes off the report's OWN outgoing `about` links, so a report about
 * two things says so on the page of either.
 *
 * A DELETED REPORT IS COUNTED, NEVER DROPPED. Its link comes back `broken`, and a page that quietly
 * showed one fewer row would be hiding the fact that somebody deleted a review.
 */
export interface ReportsAboutRead {
  rows: ReportRow[]
  /** Reports pointed at this module whose record has been deleted. Reported, never hidden. */
  deleted: number
}

export async function readReportsAbout(moduleId: string): Promise<ReportsAboutRead> {
  const detail = await api.getRecord(moduleId)
  const pointed = detail.links.filter(
    (link) => link.type === 'about' && link.isBacklink && link.other.kind === 'report',
  )
  const live = pointed.filter((link) => !link.broken)
  const reports = await Promise.all(live.map((link) => api.getRecord(link.other.id)))
  const rows = reports.map((reply) =>
    reportReading(
      reply.record,
      reply.links
        .filter((link) => link.type === 'about' && !link.isBacklink && !link.broken)
        .map((link) => ({ recordId: link.other.id, title: link.other.title })),
    ),
  )
  return { rows, deleted: pointed.length - live.length }
}

/**
 * WHAT HAS BEEN WRITTEN ABOUT THIS MODULE, ON THE MODULE'S OWN PAGE.
 *
 * This panel is the owner's rule made real: a formal report or review is read inside the module it
 * belongs to, not as a link to a page somewhere else. It does not touch the module's own fields —
 * `summary` and `summaryBlocks` say where this subsystem stands NOW and are rewritten as it
 * changes, while a report is about a day and stays as it was written. The two are read together
 * here and neither overwrites the other.
 *
 * WHY THE TWO EMPTY STATES ARE DRAWN DIFFERENTLY, AND THEY MUST STAY THAT WAY. There are two ways
 * this panel can have no rows and they are not the same fact. Either Mole Office could not ask — the
 * view was mounted without the record id — or it asked and nobody has written one. The first is
 * broken wiring a person has to fix, so it keeps a whole sentence. The second is ordinary and quiet
 * now: a short mark that says nobody has written one, with the sentence on its tooltip.
 *
 * WHAT A REPORT IS MOVED BEHIND THE HELP MARK. The empty state used to spend three sentences
 * explaining what a report is and how one gets here. That explanation is true whether or not the
 * panel is empty, so it belongs on the panel and not in the hole.
 *
 * IT IS NOT A MODULE'S PANEL, IT IS A RECORD'S. `subjectId` is any record and `what` is the plain
 * noun for it, so the pipeline page mounts the same panel with `what="pipeline"` and the campaign
 * page — which is a pipeline — gets it with them. That is one word of generality and it is there
 * for a measured reason: three pages needing this and each writing its own would be three wordings
 * of "nobody has said whether you have read it", free to disagree.
 */
export function ReportsAbout({
  declares,
  subjectId,
  what,
}: {
  /** Which section of the subject this panel draws — `section.reportsAbout`, from its caller. */
  declares: Declares
  subjectId?: string
  what: string
}) {
  const [state, reload] = useProjectAsync(
    async () => (subjectId === undefined ? null : await readReportsAbout(subjectId)),
    [subjectId],
  )

  return (
    <Panel declares={declares}
      title={titleHere(what as RecordKind, REPORTS_ABOUT_KEY)}
      rank={2}
      actions={
        <Hint label={t('moduleView.reportsAbout.hintLabel')}>
          <p>{t('moduleView.reportsAbout.hint', { what: kindWord(what).text, about: linkWord('about', 'forward').text })}</p>
        </Hint>
      }
    >
      {subjectId === undefined ? (
        /* NOBODY HAS LOOKED, WHICH IS NOT THE SAME AS THERE BEING NONE — the fifth invariant, in
           the one case where this panel cannot answer its own question. This view was handed a
           record's fields and not told which record they came from, so it has nothing to look up.
           Drawing "nobody has written one" here would be a claim Mole Office has not checked.

           IT IS WORDS RATHER THAN AN ALARM, on purpose. What is missing is one line where this view
           is mounted, not a fault in the subsystem, and a red box on every module page would say the
           subsystem is broken. The sentence says exactly what is missing and what it is not. */
        <Absence
          tier="must-act-on"
          sentence={
            <>
              <b>{t('moduleView.reportsAbout.notLookedLead')}</b>{' '}
              {t('moduleView.reportsAbout.notLookedBody', { what: content(kindWord(what).text) })}
            </>
          }
        />
      ) : state.status === 'loading' ? (
        <Loading label={t('moduleView.reportsAbout.loading', { what: kindWord(what).text })} rows={1} />
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : state.value === null ? null : (
        <>
          {state.value.rows.length === 0 ? (
            <Absence
              tier="told-apart"
              looked
              word={t('moduleView.reportsAbout.none')}
              title={t('moduleView.reportsAbout.noneTitle', { what: kindWord(what).text })}
            />
          ) : (
            <ul className="att-rep-list">
              {state.value.rows.map((row) => (
                <ReportLine key={row.key} row={row} onMarkedRead={reload} />
              ))}
            </ul>
          )}
          {state.value.deleted === 0 ? null : (
            <p className="mv-note">
              {t('moduleView.reportsAbout.deleted', { n: state.value.deleted, what: kindWord(what).text })}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

// ============================================================================ claimed source

/**
 * WHICH CODE THIS MODULE IS SAID TO BE — read from the implementation map, not from a field.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY IT LOOKED LIKE LOST WORK
 * ---------------------------------------------------------------------------------------
 *
 * This panel used to read `data.claims`. Window B moved 152 claims off that field and into
 * `implementation_map`, across fifteen of the owner's modules, and deleted the field's declaration
 * in the same commit. The panel went on reading the emptied field, so every one of those fifteen
 * pages drew *"This module claims no code in the Mole Office repository"* — module cegP4HnIk9nd among
 * them, which has a row in that table. To a reader that is indistinguishable from the migration
 * having lost their work, and there was nothing on the screen saying otherwise.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS, KEPT APART
 * ---------------------------------------------------------------------------------------
 *
 * NOBODY COULD LOOK. Without a record id there is nothing to ask the map about. That is drawn as an
 * unlooked absence, never as "no code claimed" — the difference between *nothing is there* and
 * *nobody has looked* is the fifth engineering rule and this panel used to break it.
 *
 * NOTHING IS THERE. The read landed, the map holds no statement about this record, and no claim is
 * still sitting on the record. Then the old sentence is true and it is drawn.
 *
 * HERE IS WHAT IT CLAIMS. The stated rows, by repository, each carrying the word the SERVER sent for
 * how it is known — `stated`, `worked out by Mole Office`, `guessed by a machine` — so this file cannot
 * say something different from what the server means.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND READ OF THE SAME ROUTE IS NOT TWO PLACES WORKING OUT ONE FACT
 * ---------------------------------------------------------------------------------------
 *
 * "Where this lives" on the same page reads `GET /api/implementation/record/:id` too. That is one
 * reader asked twice, not one fact derived twice: neither panel works anything out, so they cannot
 * disagree. What they draw is different — this one answers *which patterns has somebody claimed for
 * this module*, and that one answers *every repository, candidate and proposal this record touches*.
 *
 * A CLAIM STILL ON THE RECORD IS DRAWN AS WELL, and said to be still on the record. A corpus
 * restored from a backup taken before window B holds `data.claims`, and the write path refuses that
 * key now, so a page that quietly ignored it would hide a person's list with no way to see it.
 */
function ClaimedSource({
  declares,
  moduleId,
  stored,
}: {
  declares: Declares
  moduleId?: string
  stored: string[]
}) {
  const [reading] = useProjectAsync(
    async () => (moduleId === undefined ? null : await api.implementationForRecord(moduleId)),
    [moduleId],
  )
  return <ClaimedSourceRead declares={declares} reading={reading} stored={stored} />
}

/**
 * EVERYTHING THE PANEL DRAWS ONCE THE READ HAS LANDED, WITH NOTHING FETCHING INSIDE IT.
 *
 * SPLIT OUT SO IT CAN BE RENDERED FROM A REPLY, which is the same split `ImplementationRead` in
 * Implementation.tsx is under and for the same reason: `useAsync` runs in an effect and
 * `renderToStaticMarkup` does not run effects, so a test of the fetching component can only ever
 * photograph its loading state. A surface "tested" by a test that has never seen a row is how this
 * panel came to be drawing a sentence about an emptied field for a fortnight.
 *
 * `reading.value === null` MEANS NOBODY COULD LOOK. It is the shape the shell hands down when it was
 * never told which record the fields came from, and it is drawn as an unlooked absence rather than
 * as an empty answer.
 */
export function ClaimedSourceRead({
  declares,
  reading,
  stored,
}: {
  /**
   * Which section of the record this panel draws — `section.claimedSource`, from its caller.
   *
   * REQUIRED, with no default, because this component is rendered from a reply in a test as well as
   * from the page. A see-through default would let a caller forget and get back the silence this
   * step removed, which is the hazard `Declares` exists to make impossible.
   */
  declares: Declares
  reading: AsyncState<RecordImplementationReply | null>
  stored: string[]
}) {
  const claimed =
    reading.status === 'ready' && reading.value !== null
      ? reading.value.repositories.flatMap((held) =>
          held.stated.map((row) => ({
            rowId: row.rowId,
            repository: held.repository.name,
            pattern: row.pattern,
            says: row.says,
            stale: row.stale,
          })),
        )
      : []
  const repositories =
    reading.status === 'ready' && reading.value !== null ? reading.value.repositories.length : 0
  const total = claimed.length + stored.length
  const untold = reading.status === 'ready' && reading.value === null

  return (
    <Panel
      declares={declares}
      title={t('record.section.claimedSource')}
      kind="code in this repository"
      actions={
        total > 0 ? (
          <span className="mv-count num">
            {t('pageWords.ModuleView.claimCount', { n: total })}
          </span>
        ) : undefined
      }
    >
      {/* A CLAIM STILL ON THE RECORD IS DRAWN FIRST AND WITHOUT WAITING FOR ANYTHING. It is already
          in hand — it came down with the record — so it does not belong behind a request that may be
          in flight, may fail, or may never be made because nobody said which record this is. */}
      {stored.length === 0 ? null : (
        <>
          <ul className="mv-claims">
            {stored.map((claim, i) => (
              <li key={`${claim}-${i}`}>
                <code className="mv-claim wrap-anywhere">{claim}</code>
                <span className="mv-claim-says">{t('pageWords.ModuleView.002')}</span>
              </li>
            ))}
          </ul>
          <p className="mv-note">
            {t('pageWords.ModuleView.claimSubject', { n: stored.length })}{t('pageWords.ModuleView.003')}<code>claims</code>{t('pageWords.ModuleView.004')}{' '}
            <code>npm run db:migrate</code>{t('pageWords.ModuleView.005')}{t('pageWords.ModuleView.claimObject', { n: stored.length })}{t('pageWords.ModuleView.006')}</p>
        </>
      )}

      {/* DRAWN WHETHER OR NOT A CLAIM IS STILL ON THE RECORD, because it says something different
          from what the list above says: the list is what the record holds, and this is that nothing
          asked the map whether there is more. */}
      {untold ? (
        <Absence
          tier="told-apart"
          looked={false}
          word="nobody could look"
          title={t('pageWords.ModuleView.007')}
        />
      ) : reading.status === 'loading' ? (
        <Loading label={t('pageWords.ModuleView.008')} rows={1} />
      ) : reading.status === 'error' ? (
        <ErrorNote message={reading.message} fault={reading.fault} />
      ) : claimed.length > 0 ? (
        <ul className="mv-claims">
          {claimed.map((row) => (
            <li key={row.rowId}>
              <code className="mv-claim wrap-anywhere">{row.pattern}</code>
              <span className="mv-claim-says">
                {/* THE SERVER'S OWN WORD FOR HOW THIS IS KNOWN, at rest, with no fold to open. A
                    guess and a statement are different things, and colour alone would carry the
                    whole distinction for a reader who cannot see it. */}
                <span className="mv-claim-glyph">{row.says.glyph}</span> {row.says.word}
                {repositories > 1 ? ` · ${row.repository}` : ''}
                {row.stale ? t('pageWords.ModuleView.expression01') : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : stored.length > 0 ? null : (
        <Absence
          word="no code claimed"
          title={t('pageWords.ModuleView.009')}
        />
      )}

      {/* Stored-not-resolved is the load-bearing half, so it is the line that stays on screen; what
          does resolve them belongs behind the press. */}
      {total === 0 ? null : (
        <Explain
          declares={{ surface: null }}
          meaning={
            <>{t('pageWords.ModuleView.010')}<strong>{t('pageWords.ModuleView.011')}</strong>{t('pageWords.ModuleView.012')}</>
          }
          opens={t('pageWords.ModuleView.013')}
        >
          <p className="mv-note">
            <strong>{t('record.section.whereItLives')}</strong>{t('pageWords.ModuleView.014')}</p>
        </Explain>
      )}
    </Panel>
  )
}

// ============================================================================ the module body

export function ModuleView({
  data,
  title,
  summary,
  moduleId,
  relations,
  editable,
  onSave,
}: {
  data: Record<string, unknown>
  /**
   * THE MODULE'S OWN TITLE — the envelope column.
   *
   * Asked for on the same grounds as `summary` below: `sectionsOf` decides which sections this
   * record HAS, and on a kind that declares short forms the title is reading length 2 and has a
   * section of its own. This view draws neither column; the header above it draws both.
   */
  title: string
  /**
   * THE MODULE'S ONE-LINE SUMMARY — the envelope column, which is NOT `data.summary`.
   *
   * This view draws neither: the header above it draws the envelope line and the curated summary
   * panel below draws `data.summary`. It is asked for it for the same reason it is asked for
   * `relations` — `sectionsOf` decides which sections this record HAS, and a view handed a shorter
   * answer would disagree with the header about what this page is made of.
   */
  summary: string | null
  /**
   * The id of the record these fields came from.
   *
   * OPTIONAL ONLY BECAUSE THE PLACE THAT MOUNTS THIS VIEW IS ANOTHER AGENT'S FILE THIS PHASE.
   * `src/web/pages/RecordPage.tsx` already has the id in hand — the line under this one passes
   * `moduleId={props.record.id}` to `Evolution` — and until it passes the same thing here the
   * reports panel says out loud that it was not told which record this is, rather than drawing an
   * empty list. It should be made required the moment that one line lands.
   */
  moduleId?: string
  /**
   * THE RELATION PHRASE OF EVERY LINK ON THIS MODULE'S PAGE — `ResolvedLink.label`, one per link.
   *
   * This view draws none of those rows itself; the rail above it does. It is asked for all the
   * same, because `sectionsOf` refuses a key the record does not declare, and the record's declared
   * sections are its kind's PLUS one per relation it has links of. Handing this view a shorter list
   * would make it disagree with the rail about what this page is made of.
   */
  relations: readonly string[]
  /** False for a deleted record: you can look, but you cannot change it until it is restored. */
  editable: boolean
  /**
   * Save the fields this view changed. It is handed ONLY those fields, to be merged.
   *
   * IT USED TO BE HANDED THE WHOLE `data` OBJECT, rebuilt from the copy this page was rendered
   * from, and the page above sent that as a wholesale replace. Two things were wrong with it. A
   * field written by anybody else since this page loaded was in the copy this view never saw, so
   * ticking one checklist line wrote that field back to what it said when the page opened. And it
   * is the write the server now refuses outright unless the caller says the loss is meant.
   *
   * `again` builds the same change on the data another writer stored since, for when the person keeps
   * their own change over theirs: a list sent whole from this copy would undo what they wrote in it.
   */
  onSave: (change: Record<string, unknown>, again: (theirs: Record<string, unknown>) => Record<string, unknown>) => Promise<void>
}) {
  const parsed = parseModule(data)

  /**
   * WHAT EACH OF THIS MODULE'S OWN PANELS SAYS IT IS, so a right-click lands on the section.
   *
   * MEASURED BEFORE THIS EXISTED, on module `cegP4HnIk9nd`: twenty-one headings, twenty-one
   * presses, and every one of them answered the whole module. Their acceptance is that five presses
   * on five sections give five different answers, and this is the half of it that lives here —
   * Context, Parts, Paths and the curated summary.
   *
   * NOT TOLD WHICH RECORD THIS IS, IT DECLARES NOTHING, exactly as the summary below does with
   * `inRecord`. A region id names a record; without one there is no honest target to write, and a
   * made-up one would be a comment filed against nothing.
   */
  const sectionHere =
    moduleId === undefined ? null : sectionsOf({ id: moduleId, kind: 'module', data, title, summary, relations })
  const section = (key: string): Declares => (sectionHere === null ? { surface: null } : sectionHere(key))

  /**
   * What this module still needs, so each section can carry the marker for its own missing
   * field. The page above lists all of it in one place with the full explanation; this puts the
   * same mark on the section it belongs to, so "Context is empty" and "and that is why this
   * module is a stub" are not two discoveries a reader has to join up themselves.
   *
   * Worked out here rather than passed in, deliberately. It is the same pure function on the
   * same `data` that RecordPage runs for the block at the top, so the two cannot disagree — and
   * a prop could be handed a list belonging to a different record, which is a way for a page to
   * lie that simply does not exist if the view asks the question itself. Nothing is stored.
   */
  const incomplete = completenessOf('module', data)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const inspect = useInspect()

  /** Save one checklist line's new state, and nothing else. */
  async function setItemState(partId: string, itemId: string, next: ItemState) {
    setBusyItem(itemId)
    setSaveError(null)
    const ticked = (parts: ReturnType<typeof parseModule>['parts']) => parts.map((part) =>
      part.id !== partId
        ? part
        : { ...part, items: part.items.map((i) => (i.id === itemId ? { ...i, state: next } : i)) },
    )
    try {
      // THE CHECKLIST AND NOTHING ELSE. A merge replaces an array whole, so the parts really are
      // rewritten; every other field of the module is left exactly as it is, including the ones
      // this page never read. WHEN ANOTHER WRITER CHANGED THE MODULE FIRST and the person keeps their own
      // change, the one line is set again on the parts the other writer left (wave 13y round 146).
      await onSave({ parts: ticked(parsed.parts) }, (theirs) => ({ parts: ticked(parseModule(theirs).parts) }))
    } catch (err) {
      setSaveError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusyItem(null)
    }
  }

  const itemCount = parsed.parts.reduce((n, p) => n + p.items.length, 0)
  const hasAbstract = parsed.summary !== null && parsed.summary.trim() !== ''

  // Whole-path equality, never a prefix strip. `completenessOf` addresses a field as
  // `data.<key>`, but it is allowed to return `data` or `kind` on a record that could not have
  // been written through the gate, and a view that chopped "data." off the front would turn
  // those two into nonsense. Comparing the whole string is exact and cannot mislead.
  const isUnfilled = (path: string) => incomplete.some((item) => item.path === path)

  return (
    <>
      <style href="mole-office-module" precedence="default">
        {MODULE_CSS}
      </style>

      <ProblemPanel problems={parsed.problems} />

      {saveError ? (
        <ErrorNote message={saveError.message} fault={saveError.fault}>
          <span className="mv-note">
            {t('moduleView.parts.saveErrorNote')}
          </span>
        </ErrorNote>
      ) : null}

      {/* Context first. It is the one paragraph that says why any of the rest exists, and it is
          short enough that it costs nothing to read before the summary. */}
      <Panel declares={section('context')}
        title={titleHere('module', 'context')}
        kind={t('moduleView.context.kind')}
        rank={2}
        // The marker rather than a sentence: the sentence, with the example and the reason the
        // field exists, is in the incomplete block at the top of the page. Saying it twice in
        // full would train the reader to skip both.
        actions={isUnfilled('data.context') ? <IncompleteMark count={1} what={kindWord('module').text} /> : undefined}
      >
        {parsed.context === null || parsed.context.trim() === '' ? (
          <Absence word={t('moduleView.context.notWritten')} title={t('moduleView.context.notWrittenTitle')} />
        ) : (
          // Through the shared splitter, so a context written in two paragraphs arrives as two.
          <Prose text={parsed.context} />
        )}
        {/* `data.source` is provenance -- a file and section, a thread, a run -- and it is one
            line about where the words above were taken from. It belongs under them rather than
            in a panel of its own, and it is drawn only when it is there: it is an optional field,
            and an empty "where this came from" on every module would be furniture.

            NOT the source index. That is the derived scan of this repository, and this field has
            nothing to do with it, which is why the label is the question rather than the key. */}
        {parsed.source !== null && parsed.source.trim() !== '' ? (
          <p className="mv-source">
            <span className="mv-source-tag">{t('moduleView.context.sourceTag')}</span>
            <span className="wrap-anywhere">{parsed.source}</span>
          </p>
        ) : null}
      </Panel>

      {/* WHERE IT STANDS AND WHAT IS IN IT COME BEFORE THE ESSAY, and that is a change from the
          order this file shipped in.

          The curated summary is the best-written thing on a module page and it was directly under
          the context, so two panels of prose ran before the reader reached a single fact about the
          module's condition. "How far along is this and what is left" is the question somebody
          opens a module to answer; the essay is what they read once they care. Context stays first,
          because it is one paragraph saying why any of the rest exists, and the argument for that
          is unchanged.

          Standing stays directly above Parts, for the reason it always did: the panel below is what
          the condition was counted from, and a reader who doubts the clause should be able to check
          it without scrolling away. */}
      <StandingPanel
        declares={section(STANDING_KEY)}
        lifecycle={parsed.lifecycle}
        condition={moduleCondition(parsed.parts)}
        uncounted={parsed.uncounted}
      />

      {/* WHAT HAS BEEN WRITTEN ABOUT THIS MODULE, directly under where it stands.

          It is here rather than at the foot because of what it is: a review of this subsystem is
          the most considered thing anybody has written about it, and burying it under the parts,
          the paths and the stored fields would be the same failure as delivering it as a link to a
          page outside the product. It is BELOW the standing panel because "how far along is this"
          is the question somebody opens a module to answer, and a review is what they read once
          they care. It does not touch the curated summary: that says where the subsystem stands
          now, and a report is about a day and stays as it was written. */}
      <ReportsAbout declares={section(REPORTS_ABOUT_KEY)} subjectId={moduleId} what="module" />

      <Panel declares={section('parts')}
        title={titleHere('module', 'parts')}
        kind={t('moduleView.parts.kind')}
        actions={
          isUnfilled('data.parts') || parsed.parts.length > 0 ? (
            <span className="mv-panel-actions">
              {/* `parts: []` counts as COMPLETE — an empty checklist is an answer. So this
                  marker appears only when the key is absent altogether, which is exactly the
                  question isUnfilled asks. */}
              {isUnfilled('data.parts') ? <IncompleteMark count={1} what={kindWord('module').text} /> : null}
              {parsed.parts.length > 0 ? (
                <span className="mv-count num">
                  {t('moduleView.parts.count', {
                    parts: t('moduleView.condition.partsCount', { n: parsed.parts.length }),
                    items: t('moduleView.condition.itemsCount', { n: itemCount }),
                  })}
                </span>
              ) : null}
            </span>
          ) : undefined
        }
      >
        {parsed.parts.length === 0 ? (
          <Absence word={t('moduleView.parts.none')} title={t('moduleView.parts.noneTitle')} />
        ) : (
          <div className="mv-parts">
            {parsed.parts.map((part) => (
              <section className="mv-part" key={part.id}>
                <header className="mv-part-head">
                  <h3 className="mv-part-name wrap-anywhere">{part.name}</h3>
                  <PartTally items={part.items} />
                </header>
                {part.items.length === 0 ? (
                  <Absence word={t('moduleView.parts.noItems')} title={t('moduleView.parts.noItemsTitle')} />
                ) : (
                  <div className="mv-items">
                    {part.items.map((item) => (
                      <Row
                        key={item.id}
                        state={item.state}
                        // Dropping the handler while a save is in flight turns the chip back
                        // into a label, so the same click cannot be sent twice and the chip
                        // never shows a state the server has not confirmed.
                        onStateChange={
                          editable && busyItem !== item.id
                            ? (next) => void setItemState(part.id, item.id, next)
                            : undefined
                        }
                        title={item.text}
                        meta={item.note ?? undefined}
                        right={
                          <>
                            {busyItem === item.id ? <span className="mv-saving">{t('moduleView.parts.saving')}</span> : null}
                            {item.hours !== undefined ? <span className="num">{t('moduleView.parts.hours', { n: item.hours })}</span> : null}
                          </>
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
            {editable ? null : (
              // That the record is deleted is already the rank-0 banner at the top of the page and
              // the `deleted` tag beside its kind. What is not visible anywhere else is that these
              // chips have stopped being controls, and what brings them back.
              <p className="mv-note">
                {t('moduleView.parts.readOnlyNote')}
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* The curated summary. This is the part a human wrote on purpose, so it gets the plot,
          the equation and the table — and it now sits BELOW the checklist it used to sit above,
          because a reader who has seen where the module stands is the reader this essay is for. */}
      {/* THE MODULE'S READING MATTER, AND ONE THING ABOUT IT THAT IS NOT NEAT.
          `section.summary` is the module's reading matter, and this panel is where the module's own
          reading matter is written: the paragraph and the curated blocks, which is exactly what
          `SectionFrom.readingMatter` names for a module. So this panel carries it.
          WHAT DOES NOT LINE UP, MEASURED RATHER THAN GLOSSED: in the region tree the body sections
          — Context, Parts, Paths — are declared INSIDE `section.summary`, and on the screen they
          are panels of their own, above and below this one. So the tree's containment and the
          page's containment differ on a module. Nothing is mis-filed by it: a press on Context
          still answers `section.context`, and its ancestor in the tree is still the reading matter.
          What it does mean is that "what this region holds", asked of `section.summary` on a
          module, answers with the context and the parts as well as with this panel. The `inside`
          field is declared in src/shared/sections.ts and changing it is that file's business. */}
      <Panel declares={section(READING_MATTER_KEY)}
        title={titleHere('module', READING_MATTER_KEY)}
        kind={t('moduleView.summary.kind')}
        actions={
          parsed.blocks.length > 0 ? (
            <span className="mv-count num">
              {t('moduleView.summary.blockCount', { n: parsed.blocks.length })}
            </span>
          ) : undefined
        }
      >
        {hasAbstract ? (
          <p className="mv-abstract prose wrap-anywhere">
            <span className="mv-abstract-tag">{t('moduleView.summary.inOneParagraph')}</span>
            {parsed.summary}
          </p>
        ) : null}
        {/* Two curated fields, one job: `summary` is the paragraph, `summaryBlocks` is the long
            form with the plot and the equation. Only the missing one is reported, so a module
            that has the paragraph is never told it has no summary. */}
        {parsed.blocks.length > 0 ? (
          // Told which record it is, the summary marks every block and every run of text with
          // where it is stored, so a person can point at one of them. Not told, it draws the same
          // thing and claims nothing — see the note on `moduleId` above for why it can be absent.
          <SummaryBlocks
            blocks={parsed.blocks}
            {...(moduleId === undefined
              ? {}
              : { inRecord: panelHolds(moduleId, { kind: 'module', data, title, summary, relations }) })}
          />
        ) : hasAbstract ? (
          // "Nothing beyond the paragraph above yet" was the visible content saying itself: the
          // paragraph is on screen and nothing follows it. What a reader cannot see is what KIND of
          // thing could follow, so that is the half that stays.
          <p className="mv-note">
            {t('moduleView.summary.noBlocksYet')}
          </p>
        ) : (
          // The sentence itself comes from SummaryBlocks, which prints it in the other case, so the
          // two cannot say it differently. It is on the tooltip now rather than on the page, which
          // is the quietening and not a second wording of it.
          <Absence title={NO_SUMMARY} />
        )}
      </Panel>

      {/* PATHS IS A SECTION ONLY WHEN THIS MODULE HAS ANY. The panel is drawn either way, because
          "no files are linked from this module" is an answer worth the box — but a module with no
          paths has no `section.paths` in its region tree, so `sectionsOf` hands back see-through
          here and the press goes on up to the record. A target on the empty box would name a
          region the server would answer `gone` about, under a heading a reader is looking at. */}
      <Panel declares={section('paths')} title={titleHere('module', 'paths')} kind={t('moduleView.paths.kind')}>
        {parsed.paths.length === 0 ? (
          <Absence word={t('moduleView.paths.none')} title={t('moduleView.paths.noneTitle')} />
        ) : (
          <>
            <ul className="mv-paths">
              {parsed.paths.map((p) => (
                <PathRow key={p.id} path={p} />
              ))}
            </ul>
            {/* Inside the non-empty branch: a module with no paths was being given three sentences
                about paths it does not have, under an empty panel.

                THE NOTE ABOUT THE MISSING "open" LINK IS GONE. It was a paragraph explaining a
                control that is not there, which nobody notices is not there. The copy button on
                every row is what a person came here to press. */}
            <p className="mv-note">
              {t('moduleView.paths.onDiskBefore')}<strong>{t('moduleView.paths.notCopied')}</strong>{t('moduleView.paths.onDiskAfter')}
            </p>
          </>
        )}
      </Panel>

      {/* Claims sit directly under Paths because the pair is the thing that gets confused, and
          seeing both at once is what teaches the difference. Always drawn, even when empty: a
          module with no claims is a real and common answer -- a hardware module claims no code --
          and the absence is only informative if the panel is there to say it. */}
      {/* WHICH CODE THIS MODULE IS: repository paths and how the map knows them. No press on it, so
          the whole panel is developer mode's (plan 7FEOshq3mBGG, G2c). */}
      {inspect ? (
        <ClaimedSource
          declares={section(CLAIMED_SOURCE_KEY)}
          {...(moduleId === undefined ? {} : { moduleId })}
          stored={parsed.claims}
        />
      ) : null}

      {/* THE SCAN'S ANSWER ABOUT THE FILES THIS MODULE CLAIMS. It is derived from the repository,
          so it belongs beside the stated map above and is available only when the reader asks for
          developer details. SourcePage remains a separate, unrouted page. */}
      {inspect && moduleId !== undefined ? <ModuleSource moduleId={moduleId} /> : null}

      {/* `extra` is a declared field of the module kind, so it is drawn as one. It is the same
          key/value rendering the panel below uses, and that similarity is the point of the two
          different headings: what is in here was put in a field that exists, and what is in the
          panel below was put in no field at all. */}
      {/* DRAWN AS STORED KEYS AND VALUES, the way Stored fields draws them, so it is developer mode's
          too (plan 7FEOshq3mBGG, G2c). */}
      {inspect && parsed.extra !== null ? (
        <Panel declares={{ surface: null }} title={t('pageWords.ModuleView.015')} kind="anything else this module needs" rank={2}>
          <FieldList data={parsed.extra} />
        </Panel>
      ) : null}

      {/* Keys that are no field of a module are stored fields, which are developer mode's (plan
          7FEOshq3mBGG, G2c). */}
      {inspect && parsed.extras.length > 0 ? (
        <Panel declares={{ surface: null }} title={t('pageWords.ModuleView.016')} kind="not one of a module’s own fields" rank={2}>
          <FieldList data={Object.fromEntries(parsed.extras)} />
        </Panel>
      ) : null}
    </>
  )
}

// ============================================================================ stored fields

/**
 * A record's `data` object, shown as it is stored.
 *
 * Used for every kind that has no bespoke view yet, and for a module's leftover keys. Showing
 * the raw object is honest about what exists; an empty screen would not be, and a pretty
 * rendering that guessed at meaning would be worse than either.
 */
export function FieldList({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <Absence word={t('pageWords.ModuleView.noExtra')} title={t('pageWords.ModuleView.017')} />
  }
  return (
    <>
      {/* ITS OWN STYLESHEET, the one every part of this file draws with. The record page's Stored fields panel draws
          this list outside a ModuleView, and without it the JSON of a nested value did not wrap there and made a run's
          page about 1,727 pixels wide in developer mode (problem 64NQ16zegyMP). React loads one stylesheet per href. */}
      <style href="mole-office-module" precedence="default">
        {MODULE_CSS}
      </style>
      <dl className="mv-fields">
      {entries.map(([key, value]) => (
        <div className="mv-field" key={key}>
          {/* The key is shown exactly as stored, underscores and all. It is the name you would
              grep the database for, and prettifying it into "alternatives rejected" would put a
              word on screen that exists nowhere in the record. */}
          <dt className="mv-field-key">{key}</dt>
          <dd className="mv-field-value">
            <FieldValue name={key} value={value} />
          </dd>
        </div>
      ))}
      </dl>
    </>
  )
}

/**
 * A stored string, drawn as the paragraphs it was written in.
 *
 * IT USED TO BE ONE `<span>`, AND THAT DELETED SOMETHING. HTML collapses whitespace, so the blank
 * lines ten live records store in `data.body` and `data.detail` -- a note holding ten of them --
 * arrived on screen as one run-on block. Every kind with no bespoke view renders through here, so
 * that was most of the prose in the product. A `max-width` on an inline span is also a no-op, which
 * is why the reading measure has never applied to any of it.
 *
 * The split is `paragraphsOf`, the same one the curated summary uses, so there is no second opinion
 * about what a paragraph is. It is NOT `renderMarkdown`: this panel is drawn under "shown exactly
 * as the database holds it" and a stored value must not grow headings and lists it never had.
 */
function Prose({ text }: { text: string }) {
  const paragraphs = paragraphsOf(text)
  if (paragraphs.length <= 1) {
    // One paragraph: one <p>, still a block, so the measure applies and it reflows with the column.
    return <p className="prose wrap-anywhere mv-prose">{paragraphs[0] ?? text}</p>
  }
  return (
    <div className="mv-prose-stack">
      {paragraphs.map((para, i) => (
        <p className="prose wrap-anywhere mv-prose" key={i}>
          {para}
        </p>
      ))}
    </div>
  )
}

function FieldValue({ name, value }: { name: string; value: unknown }) {
  // `state` holds the same five words everywhere in Mole Office, so it gets the same chip everywhere.
  // One vocabulary drawn two ways is how a reader stops believing either drawing.
  if (name === 'state' && typeof value === 'string' && (ITEM_STATES as readonly string[]).includes(value)) {
    return <StateChip state={value as ItemState} />
  }
  if (typeof value === 'string') {
    return <Prose text={value} />
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="mv-field-num num">{String(value)}</span>
  }
  if (value === null) {
    // Stored null is a fact: someone wrote "no value" rather than leaving the key out.
    return <span className="mv-field-null">{t('pageWords.ModuleView.018')}</span>
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (
      <ul className="mv-field-list">
        {(value as string[]).map((v, i) => (
          <li key={i} className="wrap-anywhere">
            {v}
          </li>
        ))}
      </ul>
    )
  }
  // TWO SHAPES THIS PRODUCT REALLY DECLARES GET READ OUT IN WORDS. Everything else stays JSON.
  //
  // `consequence` and `paused` are not hypothetical: they are declared on eight kinds and nine
  // kinds respectively, they carry the two facts the attention rule ranks by, and a record page
  // was showing them as `{ "bearer": "person", "what": "…" }` — an internal representation, in a
  // panel a person reads to decide what to do about a safety item.
  //
  // THIS IS NOT A JSON-TO-CARD FRAMEWORK. There are two renderers because there are two shapes
  // worth the deliberate reading; a general one would have to guess at meaning, which is the thing
  // the JSON fallback below is honest about not doing.
  const known = knownShape(name, value)
  if (known !== null) return known

  // Anything else is shown as the JSON it is. Guessing at a layout for a shape nobody declared
  // would be inventing structure that is not there.
  // IT WRAPS RATHER THAN SCROLLING, AND THE BOX THAT SCROLLED IS GONE. Stored JSON drawn two spaces
  // in has one long line for every long value, and that line used to run off the right of an
  // `overflow-x: auto` box with no scrollbar on this platform: the end of the value was simply not
  // there. Wrapping loses nothing — JSON has no significant line breaks — so this is one of the two
  // boxes in this campaign that was fixed rather than marked.
  return <pre className="mv-field-json">{JSON.stringify(value, null, 2)}</pre>
}

/** The bearer word, said as the sentence it stands for rather than as the key it is stored under. */
const BEARER_WORDS: Readonly<Record<string, string>> = {
  get person() { return t('pageWords.ModuleView.bearer.person') },
  get outside() { return t('pageWords.ModuleView.bearer.outside') },
  get property() { return t('pageWords.ModuleView.bearer.property') },
  get dependent() { return t('pageWords.ModuleView.bearer.dependent') },
  get owner() { return t('pageWords.ModuleView.bearer.owner') },
  get none() { return t('pageWords.ModuleView.bearer.none') },
}

/**
 * The two declared shapes, drawn as what they mean. `null` when this is not one of them.
 *
 * The stored words are shown as well as read out — `person`, `2026-08-01` — because the reader may
 * be checking what is in the database, and a rendering that replaced the value would make the page
 * unable to answer that.
 */
function knownShape(name: string, value: unknown): React.ReactElement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>

  if (name === 'consequence' && typeof obj['bearer'] === 'string') {
    const bearer = obj['bearer']
    const what = typeof obj['what'] === 'string' ? obj['what'] : null
    return (
      <div className="mv-shape">
        <span className="mv-shape-head">
          <StateChip state={bearer === 'person' ? 'blocked' : 'todo'} label={bearer} readOnly />
          <span className="mv-shape-says">{BEARER_WORDS[bearer] ?? t('pageWords.ModuleView.expression02', { bearer: String(bearer) })}</span>
        </span>
        {what === null ? (
          <span className="mv-field-null">{t('pageWords.ModuleView.019')}</span>
        ) : (
          <p className="mv-prose wrap-anywhere">{what}</p>
        )}
      </div>
    )
  }

  if (name === 'paused' && typeof obj['since'] === 'string') {
    const why = typeof obj['why'] === 'string' ? obj['why'] : null
    const until = obj['until']
    const untilWords =
      typeof until === 'object' && until !== null
        ? typeof (until as Record<string, unknown>)['date'] === 'string'
          ? t('pageWords.ModuleView.until', { until: String((until as Record<string, unknown>)['date']) })
          : typeof (until as Record<string, unknown>)['condition'] === 'string'
            ? t('pageWords.ModuleView.until', { until: String((until as Record<string, unknown>)['condition']) })
            : null
        : null
    return (
      <div className="mv-shape">
        <span className="mv-shape-head">
          <StateChip state="todo" label={t('pageWords.ModuleView.expression03', { value1: String(obj['since']) })} readOnly />
          {/* Open-ended is the common and honest case, and saying so beats an empty space that
              reads as though somebody forgot. */}
          <span className="mv-shape-says">{untilWords ?? t('pageWords.ModuleView.expression04')}</span>
        </span>
        {why === null ? null : <p className="mv-prose wrap-anywhere">{why}</p>}
      </div>
    )
  }

  return null
}

// ============================================================================ links

const LINK_TYPE_KEYS = Object.keys(LINK_TYPES) as LinkType[]

/**
 * One link, from the point of view of the record you are looking at.
 *
 * THE BROKEN TREATMENT IS THE POINT OF THIS COMPONENT. A link whose other end was deleted comes
 * back marked `broken`; it keeps its place in the list and gets the severity chip, the tint and
 * the spine that every other alarm in the app gets, plus the button that undoes the deletion.
 * Hiding it would lose the fact that the connection ever existed, which is the exact failure
 * this whole project is aimed at.
 */
/**
 * How much of the record at the FAR end of a link exists.
 *
 * Three cases, and they are three words rather than a number-or-undefined, because a missing
 * number could mean either of the last two and the row draws them completely differently.
 *
 *   a number     that many fields are not filled in. 0 means complete.
 *   'unknown'    the panel is showing completeness, but this record was not in the listing it
 *                was given. Expected for a deleted record; a bug for any other, and said so.
 *   'not-shown'  this panel was not given completeness at all, so it makes no claim either way.
 */
type Unfilled = number | 'unknown' | 'not-shown'

function LinkRow({
  link,
  unfilled,
  editable,
  onChanged,
}: {
  link: ResolvedLink
  unfilled: Unfilled
  editable: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  // Broken outranks inferred: if the far end is gone, that is the thing to say first. The
  // inferred fact is not lost -- it moves to a tag on the title line.
  const state = link.broken ? 'broken' : link.inferred ? 'inferred' : undefined

  return (
    <div className="mv-link">
      <Row
        state={state}
        leading={
          <span className="mv-lead">
            <Tag tone="accent" title={t('pageWords.ModuleView.expression05', { type: String(link.type) })}>
              {link.label}
            </Tag>
            <Tag kind={link.other.kind} />
            {link.broken && link.inferred ? (
              <Tag tone="quiet" title={t('g7b.Evolution.mole_office_worked_this_link_out_itself')}>{t('pageWords.ModuleView.020')}</Tag>
            ) : null}
            {/* Seeing that the far end is a stub before opening it is the whole point of the
                marker: it is the difference between "there is a claim about this" and "there is
                a claim about this and nobody has written down what it rests on yet". */}
            {typeof unfilled === 'number' ? (
              <IncompleteMark count={unfilled} what={kindWord(link.other.kind).text} />
            ) : null}
            {/* A deleted record is absent from the listing by design, and the row already says
                `broken`, which is the bigger fact about it. Any OTHER absence is a disagreement
                between two things that should agree, and it is named rather than passed off as
                a complete record. */}
            {unfilled === 'unknown' && !link.broken ? (
              <Tag
                tone="warn"
                title={
                  t('pageWords.ModuleView.expression06') +
                  t('pageWords.ModuleView.expression07') +
                  t('pageWords.ModuleView.expression08')
                }
              >{t('record.links.notChecked')}</Tag>
            ) : null}
          </span>
        }
        title={link.other.title}
        href={link.broken ? undefined : `#${recordPath(link.other.id)}`}
        meta={
          link.broken
            ? `“${link.other.title}” was deleted. The link is kept.`
            : (link.other.summary ?? undefined)
        }
        right={
          <>
            {link.broken ? (
              <Btn
                size="sm"
                variant="primary"
                pending={busy}
                onClick={() => void run(() => api.restoreRecord(link.other.id))}
              >{t('pageWords.ModuleView.021')}</Btn>
            ) : null}
            {editable ? (
              <Btn size="sm" variant="ghost" pending={busy} onClick={() => void run(() => api.deleteLink(link.linkId))}>{t('pageWords.ModuleView.022')}</Btn>
            ) : null}
          </>
        }
      />
      {error ? <ErrorNote message={error.message} fault={error.fault} /> : null}
    </div>
  )
}

function AddLinkForm({
  fromId,
  knownTitles,
  onChanged,
}: {
  fromId: string
  knownTitles: string[]
  onChanged: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<LinkType>('relates_to')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      // Deliberately sends the title, not an id: an unknown title must be the server's refusal,
      // not a record this form invented to make itself succeed.
      await api.createLink({ fromId, toTitle: title.trim(), type })
      setTitle('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mv-addlink" onSubmit={(e) => void submit(e)}>
      <Field label={t('pageWords.ModuleView.023')}>
        <Select<LinkType>
          value={type}
          onChange={setType}
          options={LINK_TYPE_KEYS.map((key) => ({ value: key, label: LINK_TYPES[key].forward }))}
        />
      </Field>
      <Field
        label={t('record.links.title')}
        error={error ?? undefined}
        hint={t('moduleView.links.reverseHint')}
      >
        <TextInput value={title} onChange={setTitle} placeholder={t('record.links.titleExample')} />
      </Field>
      <div className="mv-addlink-act">
        <Btn
          type="submit"
          variant="primary"
          pending={busy}
          disabled={title.trim() === ''}
          reason={t('moduleView.links.addTitleReason')}
        >{t('record.links.add')}</Btn>
      </div>
      {/* A native datalist, because it is the only suggestion list that keeps working with the
          keyboard, on a phone, and with a screen reader without a line of code. */}
      <datalist id="mole-office-titles">
        {knownTitles.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </form>
  )
}

/**
 * Every link touching this record, in two groups.
 *
 * The direction split is the point. A link is stored once, in one direction, and the server
 * hands back a label already written from the point of view of the record you are looking at,
 * so both groups read as a sentence about THIS record: outgoing rows say what it does, incoming
 * rows say what has been done to it.
 */
export function LinksPanel({
  recordId,
  links,
  knownTitles,
  unfilledByRecord,
  editable,
  onChanged,
}: {
  recordId: string
  links: ResolvedLink[]
  knownTitles: string[]
  /**
   * How many fields each record in the workspace still needs, by record id.
   *
   * A link does not carry the other record's `data`, so its completeness cannot be worked out
   * from the link alone. It comes instead from the workspace listing the page already loads for
   * the link form's suggestions — no extra request, and the same `completenessOf` the other
   * record's own page will run when you open it.
   *
   * A record MISSING from this map is a deleted one: the listing is the only thing that leaves
   * deleted records out, and a link to a deleted record already comes back `broken`, which is
   * the more important fact about it. Any other absence is drawn as an explicit "unknown"
   * rather than passed off as complete — see LinkRow.
   *
   * OPTIONAL, the same way `Row`'s `state` is optional: leaving it out means this panel is not
   * in the business of completeness, not that everything is complete. Every link then draws
   * exactly as it did before any of this existed. Mole Office's own record page always passes it.
   */
  unfilledByRecord?: ReadonlyMap<string, number>
  editable: boolean
  onChanged: () => void
}) {
  const outgoing = links.filter((l) => !l.isBacklink)
  const incoming = links.filter((l) => l.isBacklink)
  const broken = links.filter((l) => l.broken).length

  const unfilledFor = (otherId: string): Unfilled =>
    unfilledByRecord === undefined ? 'not-shown' : (unfilledByRecord.get(otherId) ?? 'unknown')

  return (
    <>
      <style href="mole-office-module" precedence="default">
        {MODULE_CSS}
      </style>
      <Panel declares={{ surface: null }}
        title={t('pageWords.ModuleView.024')}
        kind="both directions"
        // A broken link is the one fact on this panel that needs a human, so the whole panel
        // becomes an alarm when there is one. Nothing else on the page ranks itself up.
        rank={broken > 0 ? 0 : 1}
        tone="broken"
        actions={
          <span className="mv-panel-actions">
            {broken > 0 ? <StateChip state="broken" label={t('pageWords.ModuleView.expression09', { broken: String(broken) })} /> : null}
            <span className="mv-count num">{links.length}</span>
          </span>
        }
      >
        <h3 className="mv-group">{t('pageWords.ModuleView.025')}<span className="mv-group-note">{t('record.links.outgoingNote')}</span>
        </h3>
        {outgoing.length === 0 ? (
          <Absence word="none" title={t('record.links.noOutgoing')} />
        ) : (
          <div className="mv-links">
            {outgoing.map((l) => (
              <LinkRow
                key={l.linkId}
                link={l}
                unfilled={unfilledFor(l.other.id)}
                editable={editable}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}

        <h3 className="mv-group">{t('pageWords.ModuleView.026')}<span className="mv-group-note">{t('record.links.incomingNote')}</span>
        </h3>
        {incoming.length === 0 ? (
          <Absence word="none" title={t('record.links.noIncoming')} />
        ) : (
          <div className="mv-links">
            {incoming.map((l) => (
              <LinkRow
                key={l.linkId}
                link={l}
                unfilled={unfilledFor(l.other.id)}
                editable={editable}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}

        {editable ? (
          <AddLinkForm fromId={recordId} knownTitles={knownTitles} onChanged={onChanged} />
        ) : (
          <p className="mv-note">{t('moduleView.links.restoreBeforeAdding')}</p>
        )}
      </Panel>
    </>
  )
}

/**
 * ============================================================================ changes
 *
 * THERE IS NO CHANGES PANEL HERE ANY MORE, and this note is why there must not be one again.
 *
 * This file used to draw its own change list. It said `session ${c.sessionId}` on the actor's
 * tooltip — and `Change.sessionId` holds a session RECORD ID, so what a reader got was
 * `session NS6wp_rmduzo`: a lookup key in the one place a run's NAME belongs. Two other copies of
 * the same row existed at the same time, one of which named no session at all, so "which session
 * did this" had three answers on three pages, two of them useless.
 *
 * components/ChangeLog.tsx is the one that draws a change row now. It reads the `sessions` block
 * that GET /api/changes sends beside the rows, shows the session's title linked to its record, and
 * says which of the three ways the join failed when it did rather than falling back to the id.
 * RecordPage.tsx fetches through `api.listChanges`, which carries that block; a caller that hands
 * ChangeLog no block gets rows that say so. The home page's "what changed" panel draws its rows
 * with the same file's `ChangeMeta`, so there is one wording and one resolution, not two.
 *
 * This note used to end "tests/changes.test.ts fails if a change row is rendered anywhere but
 * there", and no such test existed — a sentence describing a guard nobody had written. It does
 * now: tests/changes.test.ts greps src/web for a second renderer of `change.op` / `change.actorId`
 * and fails naming the file.
 */

// ============================================================================ styles

/**
 * This view's own rules.
 *
 * styles.css and ui.tsx's stylesheet belong to other agents this phase, so the handful of
 * layouts that are specific to a module page live here. React 19 hoists `<style href>` into
 * <head> and de-duplicates by href, so rendering it from four components produces one element.
 *
 * THE RULE, the same one ui.tsx follows: every value below is a token from tokens.css or a
 * local `--mv-*` variable pointed at one. There is no colour and no type size written out, so
 * a preset swap on <html> re-skins all of it.
 */
/* WHERE THE READING MEASURE APPLIES ON THIS PAGE, AND WHERE IT DOES NOT.
 *
 * It applies to the record's own reading matter -- the context paragraphs, the curated abstract and
 * a stored prose field -- and every one of those carries the shared .prose class, which sets it
 * once in styles.css. Nothing below sets it a second time.
 *
 * It does NOT apply to a note, a problem list or the provenance line. Those are the panel talking
 * about the record, they are one or two sentences, and each already sits inside something that
 * constrains it: a panel body, one of the two standing columns, the side rail. A reading measure on
 * top of that is a second constraint inside the first, and it is what put a 512px ribbon of 12px
 * text in a 773px panel and made the page look hard-wrapped. */
const MODULE_CSS = `
.mv-note {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.mv-note-bad { color: var(--st-failed); font-weight: var(--st-failed-weight); }
.mv-note code { font-family: var(--font-mono); font-size: 0.94em; }

.mv-count {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}
.mv-panel-actions { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }

/* Two or three tags at the head of a row's title cell. Row hands its \`leading\` straight to a
   span, so the gap between the tags has to come from whoever put them there -- and two tags
   with no gap read as one long tag with a colour change in the middle. */
.mv-lead { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; min-width: 0; }

.mv-problems {
  margin: var(--gut) 0 0;
  padding-left: var(--pad-lg);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
}
.mv-problems li { margin-top: 4px; }

/* ---------------------------------------------------------------- curated summary */
.mv-abstract {
  margin: 0 0 var(--gut);
  padding-left: var(--pad-lg);
  border-left: var(--rail) solid var(--accent-soft);
  color: var(--text);
}
.mv-abstract-tag {
  display: block;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 2px;
}

/* ---------------------------------------------------------------- provenance */
.mv-source {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.mv-source-tag {
  display: block;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 2px;
}

/* ---------------------------------------------------------------- claims */
.mv-claims { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.mv-claim {
  display: inline-block;
  min-width: 0;
  padding: 2px var(--pad);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  user-select: all;
}
/* The row wraps, so at 390px the pattern keeps its own line and the word for how it is known
   drops under it rather than squeezing the path into two characters a line. Measured. */
.mv-claims li { display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
.mv-claim-says { color: var(--text-3); font-size: var(--fs-1); }
.mv-claim-glyph { font-family: var(--font-mono); }

/* ---------------------------------------------------------------- where it stands */
/* Two columns above 460px and one below, so the authored word and the counted one sit side by
   side where there is room and never squeeze each other into two-word lines where there is not. */
.mv-standing { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gut); }
@container panel (min-width: 460px) {
  .mv-standing { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--pad-lg); }
}
.mv-stand { min-width: 0; }
.mv-stand-head {
  margin: 0 0 var(--pad);
  font-size: var(--fs-1);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-2);
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
}
.mv-stand-note {
  font-size: var(--fs-1);
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-3);
}
.mv-stand-line { margin: 0; display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
/* NO CHIP, and no border that could be mistaken for one: a chip is what a stored word wears in
   this app. The condition is set in the body face at full contrast and carries its tag beside it. */
.mv-condition {
  font-size: var(--fs-3);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  min-width: 0;
}
.mv-stand .mv-note { margin-top: var(--pad); }
.mv-stand code { font-family: var(--font-mono); font-size: 0.94em; }

/* ---------------------------------------------------------------- parts */
.mv-parts { display: flex; flex-direction: column; gap: var(--pad-lg); }
.mv-part { min-width: 0; }
.mv-part-head {
  display: flex; align-items: baseline; justify-content: space-between;
  flex-wrap: wrap; gap: var(--pad) var(--gut);
  padding: 0 var(--pad) var(--pad);
  border-bottom: var(--border-w) solid var(--border);
}
.mv-part-name { margin: 0; font-size: var(--fs-3); font-weight: 600; color: var(--text); }
.mv-items { padding-top: 2px; }
.mv-saving { font-size: var(--fs-1); color: var(--text-3); font-style: italic; }

.mv-tally { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.mv-tally-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-2); white-space: nowrap; }
.mv-meter {
  display: flex; gap: 2px;
  width: 88px; height: 6px; flex: none;
  background: var(--panel-3);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.mv-meter-seg { background: var(--mv-tone); min-width: 3px; }
.mv-tally-items { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.mv-tally-item {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--fs-1); font-weight: 600; color: var(--mv-tone);
  white-space: nowrap;
}
.mv-tally-item .px-glyph { width: 12px; height: 12px; flex: none; fill: none; }

/* ---------------------------------------------------------------- paths */
.mv-paths { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.mv-path {
  min-width: 0;
  padding: var(--pad);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
}
.mv-path-head { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.mv-path-label { font-size: var(--fs-3); font-weight: 600; color: var(--text); min-width: 0; }
.mv-path-line {
  display: flex; align-items: center; gap: var(--gut);
  flex-wrap: wrap; margin-top: 4px; min-width: 0;
}
.mv-path-value {
  flex: 1 1 auto; min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  user-select: all;
}
.mv-path-act { flex: none; display: flex; align-items: center; gap: var(--pad); }

/* ---------------------------------------------------------------- stored fields */
.mv-fields { margin: 0; display: flex; flex-direction: column; gap: var(--pad); }
.mv-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  padding-bottom: var(--pad);
  border-bottom: var(--border-w) solid var(--border);
  min-width: 0;
}
.mv-field:last-child { border-bottom: 0; padding-bottom: 0; }
@container panel (min-width: 460px) {
  .mv-field { grid-template-columns: 11rem minmax(0, 1fr); gap: var(--gut); align-items: baseline; }
}
.mv-field-key {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--text-3);
}
.mv-field-value { margin: 0; min-width: 0; font-size: var(--fs-2); color: var(--text); }
.mv-field-value .prose { font-size: var(--fs-2); color: var(--text); }
/* A stored paragraph. No default margin, and a real gap between two of them, so the space is this
   file's spacing scale rather than the browser's default 1em. */
/* FIELD PROSE FILLS THE PANEL IT IS IN. It carried the prose class, which caps at the measure
   token (32rem), and every stored string in the product renders through here — so a 512px ribbon
   sat inside a 780px panel on every record page, which is exactly what the "strange wrapping"
   complaint was about. The stored text was never hard-wrapped; this rule was doing it.
   A book measure is for long-form reading, not for a field value inside a card that is already
   narrow. Where a genuinely long-form surface wants one, it asks for the prose class on its own. */
.mv-prose { margin: 0; }
/* A single line break inside a paragraph is kept as written: the boxes people write
   these in take Enter as a new line. A blank line still makes a new paragraph, above. */
.mv-prose { white-space: pre-line; }
.mv-prose-stack { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mv-shape { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mv-shape-head { display: flex; align-items: baseline; gap: var(--pad); flex-wrap: wrap; }
.mv-shape-says { font-size: var(--fs-2); color: var(--text-2); }
.mv-field-num { font-family: var(--font-mono); font-size: var(--fs-2); color: var(--text); }
.mv-field-null { font-size: var(--fs-1); color: var(--text-3); font-style: italic; }
.mv-field-list { margin: 0; padding-left: var(--pad-lg); }
.mv-field-list li { margin-top: 2px; }
.mv-field-json {
  margin: 0;
  padding: var(--pad);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  /* A long value wraps where it has to rather than running off the right of a box with no
     scrollbar. Wrapping in the pre-wrap way keeps the indenting, which is what makes it readable. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------------------------------------------------------------- links */
.mv-group {
  margin: var(--pad-lg) 0 var(--pad);
  font-size: var(--fs-1);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-2);
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
}
.mv-group:first-child { margin-top: 0; }
.mv-group-note {
  font-size: var(--fs-1);
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-3);
}
.mv-links { display: flex; flex-direction: column; }
.mv-link { min-width: 0; }

.mv-addlink {
  margin-top: var(--pad-lg);
  padding-top: var(--pad-lg);
  border-top: var(--border-w) solid var(--border);
  display: flex; flex-direction: column; gap: var(--pad);
}
.mv-addlink-act { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
`
