// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { progressWord } from '@shared/words.ts'
import { t, content, type WordKey } from '@shared/i18n.ts'
/**
 * WHERE THE SUBSYSTEMS STAND — a few of them, chosen by a rule that is printed on the page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND THE THING IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * It is an ORIENTATION panel: four or five modules, so a reader arriving at Home can see which
 * parts of the system are being worked on without opening the archive. It is NOT a second
 * attention list. Nothing here is ranked, nothing here is scored, and being on this list is not a
 * claim that anything needs a person — the panel above is the only thing on this page that says
 * that, and it says it about records rather than about subsystems.
 *
 * Home used to carry a modules panel and it was removed in the redesign, for a reason that still
 * holds and is written in HomePage.tsx: a module's progress was never the answer to "what needs me
 * now". What is answered here is a different question — "what am I in the middle of" — and it is
 * answered in four rows and two facts each rather than in a page of progress bars.
 *
 * ---------------------------------------------------------------------------------------
 * THE SELECTION RULE IS ON THE SCREEN, BECAUSE FIVE OF TWENTY-SEVEN IS A CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * A short list drawn out of a long one has to say why these and not the others, or the reader is
 * left to assume it is "the important ones" — which would be a ranking nobody computed. So the
 * rule is one visible line, the exact rule is one press behind it, and `HiddenCount` states the
 * arithmetic: how many are drawn, how many exist, and what the ones that are not drawn are.
 *
 * THREE SIGNALS, ALL OF THEM ALREADY IN THE PRODUCT, and not one of them invented here:
 *
 *   `active`          the stored lifecycle word. Somebody chose it; it is our posture toward the
 *                     subsystem and it is the only one of the four postures that says "now".
 *   `stopped-short`   the derived condition, from `moduleCondition` — the same function and the
 *                     same table the record page draws. Something on the checklist began and did
 *                     not finish.
 *   touched recently  one of the newest writes in the change log the home page has already
 *                     fetched names this record. The count is stated rather than implied.
 *
 * The ORDER is `updatedAt`, newest first, with the record id as the tie-break so two records
 * written in the same second cannot swap places between two draws. No weights, no points, no
 * score: a module is on the list or it is not, and then it is in date order.
 *
 * ---------------------------------------------------------------------------------------
 * ONE WORD SOMEBODY WROTE, ONE NOBODY DID
 * ---------------------------------------------------------------------------------------
 *
 * Each row is the module's title, its STORED lifecycle in the chip every stored word in this
 * product wears, and its DERIVED condition as a clause with `derived, not stored` beside it —
 * which is the short form the record page uses, in the same words. The one thing this panel must
 * never do is let a counted answer pass for an authored one, and the tag is where that is said.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS DRAWN NOW: A PROJECT'S OWN PAGE, NOT HOME
 * ---------------------------------------------------------------------------------------
 *
 * Home stopped drawing this panel when it was rebuilt in five sections, so
 * "a reader arriving at Home" above is history. Item 3 of a decision took round 19's
 * recommendation (report bdR-Vb2wif9d): the panel goes on a project's own page (CategoryPage.tsx,
 * #/project), in the right-hand column beside the cards, because it answers a question about one
 * project and that page had no fact about the project, only links. It reads
 * that project's modules, and its link goes to that project's Modules page. "The panel above" in the
 * first section meant Home's attention panel, and nothing on the project page claims anything needs
 * a person.
 */

import type { ModuleState } from '@shared/kinds.ts'
import type { Change, PanelRecord } from '@shared/types.ts'
import { progressOf } from '@shared/work.ts'
/**
 * THE CONDITION IS READ WITH THE RECORD PAGE'S OWN FUNCTION, not with a second reading of the
 * same checklist. `moduleCondition` is pure, it is exported, and it is the only place the
 * precedence between "something stopped short" and every other reading of a mixed checklist is
 * decided. A copy of that precedence here is this repository's recurring defect: change one and
 * the module page and the home page disagree about the same module with nothing failing.
 */
import { moduleCondition, parseModule, type ModuleCondition } from './ModuleView.tsx'
import { pathFor, recordPath } from './router.tsx'
import { Absence, OriginMark, Row, StoredState, Tag } from './ui.tsx'

// ---------------------------------------------------------------------------- the rule

/**
 * How many modules are drawn.
 *
 * THREE, DOWN FROM FIVE, because this is now one of three columns in Home's "Also" strip rather
 * than a panel of its own: the target shape for that band is no list taller than five rows, and
 * this column shares its height with the pipelines under it. Every module in the workspace is one
 * link away and the arithmetic line under the rows states exactly how many are not drawn.
 * (The "Also" strip is gone and the panel is on a project's page since round 22; three is kept,
 * which is the number round 19's drawing for that page showed.)
 */
const CONDITION_KEYS = {
  "no-parts": "home.moduleCondition.no-parts",
  "no-items": "home.moduleCondition.no-items",
  "cannot-tell": "home.moduleCondition.cannot-tell",
  "stopped-short": "home.moduleCondition.stopped-short",
  "all-finished": "home.moduleCondition.all-finished",
  "in-progress": "home.moduleCondition.in-progress",
  "not-started": "home.moduleCondition.not-started",
  "part-done": "home.moduleCondition.part-done"
} as const satisfies Record<ModuleCondition['name'], WordKey>

export const MODULES_SHOWN = 3

// ---------------------------------------------------------------------------- one module, read

export interface ModuleReading {
  record: PanelRecord
  /** The word somebody wrote, or null when nobody has. Null is an answer and is drawn as one. */
  lifecycle: ModuleState | null
  /** Worked out from the checklist, every time, by the record page's own function. */
  condition: ModuleCondition
  /** Which of the three signals put it on the list. In the order the rule states them. */
  because: ModuleSignal[]
}

/** Why a module is on this list. Never a score — a module either carries a signal or it does not. */
export type ModuleSignal = 'active' | 'stopped-short' | 'written-to'

export interface ModulePick {
  /** The modules drawn, in the order drawn. Never longer than the cap. */
  shown: ModuleReading[]
  /** Every module record in the workspace. The denominator of the line under the rows. */
  total: number
  /** How many carried a signal, before the cap. `qualified - shown.length` is what the cap cut. */
  qualified: number
}

/**
 * Which modules to draw, and in what order. Pure: same records in, same rows out, every time.
 *
 * `touched` is the set of record ids the newest writes name. It is handed in rather than read
 * here, because how much of the change log this page fetched is the caller's fact and the sentence
 * on screen has to state the same number the set was built from.
 */
export function pickModules(
  records: readonly PanelRecord[],
  touched: ReadonlySet<string>,
  cap: number = MODULES_SHOWN,
): ModulePick {
  const modules = records.filter((record) => record.kind === 'module')
  const readings: ModuleReading[] = []
  for (const record of modules) {
    const parsed = parseModule(record.data)
    const condition = moduleCondition(parsed.parts)
    const because: ModuleSignal[] = []
    if (parsed.lifecycle === 'active') because.push('active')
    if (condition.name === 'stopped-short') because.push('stopped-short')
    if (touched.has(record.id)) because.push('written-to')
    if (because.length === 0) continue
    readings.push({ record, lifecycle: parsed.lifecycle, condition, because })
  }
  // Newest write first, and the id when two were written in the same second. Without the second
  // key two draws of one workspace can put the same two rows in either order, which is a list that
  // moves under a reader for no reason anybody could point at.
  readings.sort((a, b) => {
    if (a.record.updatedAt !== b.record.updatedAt) return a.record.updatedAt < b.record.updatedAt ? 1 : -1
    return a.record.id < b.record.id ? -1 : 1
  })
  return { shown: readings.slice(0, cap), total: modules.length, qualified: readings.length }
}

// ---------------------------------------------------------------------------- the panel

export interface ModulesPanelProps {
  /** Every record the page fetched. The modules are filtered out here, not by the caller. */
  records: readonly PanelRecord[]
  /**
   * The newest writes in the log, as the page fetched them.
   *
   * The rows are not drawn; only which records they name, and how many of them there were — which
   * is printed, so "written to recently" means an exact number of writes rather than a feeling.
   */
  changes: readonly Change[]
  /** How many rows to draw. Home's "Also" strip sets it; the default is `MODULES_SHOWN`. */
  cap?: number
  /** Inspect. Adds the selection rule, the stored lifecycle chip and the derived-vs-stored tag. */
  inspect?: boolean
}

/**
 * WHAT THIS PANEL LOOKS LIKE NOW, AND WHY IT IS THREE LINES INSTEAD OF A PANEL
 *
 * Measured at 1440 on 2026-08-13: this block printed its own selection rule as body text — "Active,
 * something stopped short, or just written to — newest first" — above five rows, each of which
 * carried the phrase `derived, not stored` beside its condition. Five modules, five provenance
 * tags, and a sentence about how the list was chosen, all in first-glance space on a page whose
 * question is "what needs me now". None of it is what a reader is here for.
 *
 * `docs/UX-CONTRACT.md` puts derived-vs-stored diagnostics in Inspect by name, and the density
 * test settles the rest: the selection rule does not change what a reader does about the module on
 * row one. So Normal is three titles and a progress word, and Inspect is everything that was here.
 *
 * THE ARITHMETIC IS NOT INSPECT AND NEVER WILL BE. "3 of 27 modules shown" is a claim about the
 * other 24 and it stays out in the open with the route beside it, at both settings.
 */
export function ModulesPanel({ records, changes, cap = MODULES_SHOWN, inspect = false }: ModulesPanelProps) {
  const touched = new Set(changes.map((change) => change.recordId))
  const pick = pickModules(records, touched, cap)
  const cut = pick.qualified - pick.shown.length
  const quiet = pick.total - pick.qualified

  return (
    <>
      <style href="mole-office-modules" precedence="default">
        {MODULES_CSS}
      </style>
      {pick.shown.length === 0 ? (
        // TWO DIFFERENT FACTS, AND THE READER HAS TO TELL THEM APART. "There are no modules at all"
        // and "there are modules and none of them is on this list" look identical as a blank, and
        // they send a reader to different places. The weight is gone — a short mark rather than a
        // sentence — and each sentence survives on its mark.
        //
        // BOTH ARE `looked`, because this panel has read every module in the project either way.
        // Neither is "nobody looked", and drawing one of them as though it were would be the guess
        // this component exists to stop.
        <Absence title={pick.total === 0 ? t('home.moduleEmpty') : t('home.moduleNone', { n: pick.total })} />
      ) : (
        <div className="mp-rows">
          {pick.shown.map((reading) => (
            <ModuleRow key={reading.record.id} reading={reading} inspect={inspect} />
          ))}
        </div>
      )}

      {/* THE ARITHMETIC, AND THE WAY OUT. `HiddenCount` refuses to draw without a route to the
          whole list and refuses to say "the other 24" without naming what they are, which is
          exactly what a list showing three of twenty-seven owes its reader. */}
      {/* THE WAY OUT IS THIS PROJECT'S MODULES PAGE (round 22), which lists every module the
          arithmetic counts. It went to the list of all records while the panel was on Home. The
          separator between the clauses is a word too, so the test language marks it like the rest. */}
      {pick.total === 0 ? null : (
        <p className="mp-note">{t('home.moduleShown', { n: pick.shown.length, total: pick.total })}{cut === 0 ? null : `${t('modulesPanel.separator')}${t('home.modulesCut', { n: cut, cap })}`}{quiet === 0 ? null : `${t('modulesPanel.separator')}${t('home.modulesQuiet', { n: quiet })}`}{t('modulesPanel.separator')}<a href={`#${pathFor('modules')}`}>{t('home.allModules', { n: pick.total })}</a></p>
      )}
    </>
  )
}

/**
 * ONE MODULE: THE TITLE, AND ONE WORD FOR WHERE IT STANDS.
 *
 * The progress word is the DERIVED condition — "something stopped short", "everything finished" —
 * because that is the one that answers "am I in the middle of this". The word somebody WROTE (the
 * stored lifecycle) and the tag that keeps the two apart are Inspect: `docs/UX-CONTRACT.md` names
 * derived-vs-stored diagnostics as one of the things that live there, and a column of
 * `derived, not stored` beside three phrases was the panel explaining its own epistemology on a
 * page about work.
 *
 * The asymmetry itself is NOT abandoned. It is the same asymmetry the record page draws, from the
 * same function, and in Inspect it is drawn here in the same words as before.
 */
function conditionExplanation(condition: ModuleCondition): string {
  if (condition.name === 'no-parts') return t('home.moduleNoParts')
  if (condition.name === 'no-items') return t('home.moduleNoItems', { n: condition.parts })
  if (condition.name === 'cannot-tell') return t('home.moduleUnclassifiedItems', { n: condition.items })
  return t('home.moduleCounted', {
    items: t('home.moduleItemCount', { n: condition.items }),
    parts: t('home.modulePartCount', { n: condition.parts }),
    counts: condition.tally.map(one => `${one.n} ${progressWord(one.progress).text}`).join(', '),
  })
}

function ModuleRow({ reading, inspect }: { reading: ModuleReading; inspect: boolean }) {
  const explanation = conditionExplanation(reading.condition)
  return (
    <Row
      cols="minmax(0, 1fr) auto"
      leading={<OriginMark record={reading.record} only="exceptions" />}
      title={content(reading.record.title)}
      meta={
        inspect ? (
          <span className="mp-cond">
            <StoredState state={reading.lifecycle} progress={progressOf(reading.lifecycle)} />
            {/* The tooltip is this module's OWN arithmetic — what was counted, and from how many
                items — rather than a second general sentence about derivation. */}
            <Tag tone="quiet" title={explanation}>
              {t('home.moduleDerived')}
            </Tag>
          </span>
        ) : undefined
      }
      right={
        <span className="mp-phrase" title={explanation}>
          {t(CONDITION_KEYS[reading.condition.name])}
        </span>
      }
      href={`#${recordPath(reading.record.id)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
    />
  )
}

// ---------------------------------------------------------------------------- styles

export const MODULES_CSS = `
.mp-note {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text-3);
  font: var(--fs-1)/1.72 var(--font-ui);
}
.mp-note b { color: var(--text); font-variant-numeric: tabular-nums; }
.mp-note code { font-family: var(--font-mono); font-size: .95em; }
.mp-rows { display: flex; flex-direction: column; min-width: 0; }
/* WHEN THIS LIST IS TOO NARROW TO DRAW A TITLE AND A NOTE SIDE BY SIDE, THE NOTE GOES UNDER THE
   TITLE. Measured on Home at 1440 on 29 August 2026, before this rule existed: the "In progress"
   column is 373px, the note cell took its full 270px, and the title track was left 76px. The title
   "PanelX -- database schema and migrations" drew on six lines and the browser split "migrations"
   across two of them, leaving a single letter "s" alone on the last line. At a 1200px window the
   same track was 0px and three words broke; at 1300px it was 30px. Stacked in the same 373px
   column the title draws on ONE line at 325px, the note on one line under it, and nothing breaks --
   so this is shorter as well as readable.

   THIRTY REM IS THE THRESHOLD AND IT WAS MEASURED, not chosen. The note's widest drawn form is
   270px, so a row narrower than about 480px has under 190px left for the title. At a 486px row the
   title draws 190px on two lines with every word whole; at 380px it draws 72px on six with a word
   split. 30rem is the first whole rem at or above the crossover, and it follows the reader's text
   size for free.

   IT ASKS THIS LIST, NOT THE PANEL, AND THAT WAS THE ACTUAL DEFECT. ui.tsx already carries this
   exact rule for every row -- "@container panel (max-width: 340px)" turns a row into one column --
   and it never fired here, because the container named "panel" is the 1164px Also panel and the row
   only ever had a third of it. One fact, how much room the row has, was being read off the wrong
   box. This list is its own container so the question is asked of the box that answers it. */
.mp-rows { container-type: inline-size; container-name: modules; }
/* THE ROW HAS TWO CELLS HERE, NOT THREE, AND THAT WAS THE OTHER HALF OF THE DEFECT. Each row is
   drawn with two tracks (the title, then the progress word), but Row always writes three cells:
   the severity cell first, which this panel never fills. So above 30rem the empty severity cell
   took the title's track, the title was pushed into the narrow right-hand track, and the progress
   word wrapped onto a second line under an empty cell. Round 19 saw it, and it was measured again
   on a project's page at 990 in round 22: the title stood at the far right with its word under it.
   Below 30rem the one column hid it, because three cells stack in any order. With the empty cell
   taken out of the layout the title takes the first track and the word the second, at every width.
   The empty lead before the title goes for the same reason: the origin mark draws nothing for an
   ordinary record, and its empty box still took a gap and pushed the title right of the word under
   it. NO BACKTICKS IN THIS BLOCK -- it is a template literal. */
.mp-rows .px-row-sev { display: none; }
.mp-rows .px-row-lead:empty { display: none; }
@container modules (max-width: 30rem) {
  .mp-rows .px-row { grid-template-columns: minmax(0, 1fr); }
  .mp-rows .px-row-right { justify-content: flex-start; }
  /* Right-aligned under a left-aligned title would be a note pointing at nothing. */
  .mp-rows .mp-phrase { text-align: left; }
}
/* The stored word and its tag sit on one line and wrap together. Inspect only. */
.mp-cond { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
/* THE PROGRESS WORD, in the right-hand cell, where the eye can run down a column of them. It is a
   short phrase and not a chip: a chip is what a STORED word wears in this product, and this one is
   counted from a checklist on every read. NO BACKTICKS IN THIS BLOCK -- it is a template literal. */
.mp-phrase {
  min-width: 0;
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  text-align: right;
  overflow-wrap: break-word;
}
`
