// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../../lib/pagechoice.ts'
import { t } from '@shared/i18n.ts'
/**
 * The pieces every family page is built from: a head, a band, a fact line, and one-keystroke filing.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS THAT WERE WRONG WITH THE PAGE THESE REPLACE
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE HEADING PRINTED TWICE. `<h1>Work</h1>`, and three centimetres below it a panel headed
 *    "Work · 53 RECORDS". `FamilyHead` draws the name once; a `Band` below it is named for what is
 *    IN it — "Needs a person" — so the second heading on the page is never the page's own name.
 *
 * 2. THE WIDEST, LEFTMOST, LOUDEST COLUMN WAS A NON-ANSWER. Ten of ten rows on `greenhouse
 *    #/structure` read NO STATE FIELD or NO STATE WRITTEN, drawn in a 150px column at the head of
 *    every row. So a `Fact` line replaced it on the pages where the answer is counted rather than
 *    stored, and the state chip is kept only where a stored word really is what tells two rows
 *    apart — `#/work` and `#/might-do`.
 *
 * 3. THE MACHINERY WAS IN FRONT OF THE CONTENT. Two lines of provenance prose above the first row,
 *    on all six pages, and the same exclusion sentence twice on the locked ones. Both are true and
 *    neither is what a person came for, so both are in inspect — `MachineryNote` below is the one
 *    place that decides it, so a page cannot forget and put one back in normal mode.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A `Fact` IS FOR, AND THE ONE RULE ABOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * A fact is a stored field with the label the schema gives it — `waiting on: printer queue`,
 * `recommends: option B`. It is a LABEL AND A VALUE, never a bare value, because a row carrying
 * three unlabelled clauses is three sentences a reader has to guess the subject of. A fact whose
 * value is null is not drawn at all: an empty fact and a missing one look identical, and only one
 * of them is a record somebody has not finished.
 */

import { useState } from 'react'
import type { RecordKind } from '@shared/types.ts'
import { progressOf } from '@shared/work.ts'
import { kindWord } from '@shared/words.ts'
import { faultOf, api, errorMessage } from '../../api.ts'
import { useInspect } from '../../lib/mode.ts'
import { navigate, recordPath } from '../router.tsx'
import {
  Btn,
  Absence,
  ErrorNote,
  Hint,
  IncompleteMark,
  OriginMark,
  originReading,
  originSaid,
  Panel,
  Row,
  StoredState,
  Tag,
  TextInput,
  UnmarkedRowsNote,
} from '../ui.tsx'
import type { Declares } from '../declares.ts'
import type { ModuleReading } from './read.ts'

// ============================================================================ the head of a page

export interface FamilyHeadProps {
  title: string
  /**
   * OPTIONAL, AND FIVE OF THE SIX PAGES NOW PASS NOTHING.
   *
   * The owner, reading the redesigned product: *"these description or explanation of UIs are
   * literally not needed if we design our UI or UX good."* A lede saying "Everything this project
   * owes, is doing, or is stuck on" under an `<h1>` reading **Work**, above bands headed *Needs a
   * person* / *Being worked on* / *Put down on purpose* / *Settled*, is the heading said a second
   * time in longer words. It is deleted rather than shortened.
   *
   * WHAT SURVIVES IS NAVIGATION, and there is exactly one of it: `#/ideas` sends a reader to the
   * family that holds directions, because a cold reviewer asked to find "future ideas and
   * directions" opened the page whose name promises both, found no direction, and abandoned the
   * task. A sentence that names a PLACE is a signpost; a sentence that explains a concept is the
   * failed fix docs/UX-CONTRACT.md forbids.
   */
  lede?: React.ReactNode
  /**
   * The page's primary action and whatever sits beside it.
   *
   * EVERY FAMILY PAGE HAS ONE AND IT NAMES THE THING IT FILES. All six pages used to carry "New
   * record", which opened a form defaulting to kind `module` — so filing a task from `#/work`
   * required knowing that a task is a record and that the select had to be changed first.
   */
  actions: React.ReactNode
}

export function FamilyHead({ title, lede, actions }: FamilyHeadProps) {
  return (
    <header className="fam-head">
      <div className="fam-ident">
        <h1 className="fam-title" data-title-is="its-label">{title}</h1>
        {lede === undefined ? null : <p className="fam-lede">{lede}</p>}
      </div>
      <div className="fam-act">{actions}</div>
    </header>
  )
}

/**
 * THE FOOT OF A FAMILY PAGE: what an unmarked row means, and — in inspect — how the page was built.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PROVENANCE SENTENCE IS IN NORMAL MODE, AND WHY IT IS AT THE FOOT
 * ---------------------------------------------------------------------------------------
 * The audit asked for both of these to go into inspect. One of them may and one may not, and the
 * difference is worth writing down because it looks like an inconsistency.
 *
 * `UnmarkedRowsNote` is the whole of what makes `OriginMark only="exceptions"` honest. The rows
 * below draw a mark for fixture content, for a record nobody stamped and for a word Mole Office cannot
 * read, and draw NOTHING for ordinary authored work — so without this sentence the absence of a
 * mark means two things at once, and the second is the one that lets 290 generated records in this
 * workspace read as real work. Hiding it would not be a density decision; it would be removing the
 * thing that licenses the hiding. tests/provenance-ui.test.ts pins the pairing.
 *
 * What the audit was actually right about is WHERE it was: two lines of provenance standing between
 * the page heading and the first row of content, on all six pages. It is at the foot now — one
 * quiet line, after the rows it is about, which is where a statement about a list belongs.
 *
 * The exclusion sentence is a different case and does go to inspect. It is in force whatever the
 * page is showing, so it can never distinguish two states of the screen, which is the density test
 * failing. It is conditionally RENDERED rather than hidden with CSS, so a screen reader does not
 * read out a sentence the screen does not show.
 */
export function PageFoot({ what, exclusions }: { what: string; exclusions: string }) {
  const inspect = useInspect()
  return (
    <div className="fam-foot">
      <UnmarkedRowsNote what={what} />
      {inspect ? <p className="fam-excl">{exclusions}</p> : null}
    </div>
  )
}

/**
 * The two marks a row may never fold away, drawn in one place for all six pages.
 *
 * BOTH ARE THINGS A READER WOULD OTHERWISE TAKE ON TRUST. Whether the content was generated is
 * USER.md invariant 3 — a placeholder is labelled in the place it appears — and 290 of the 385 records
 * in this workspace are fixture. How many of a record's own fields are unfilled is what tells a
 * finished record from a stub, and the server computes it on every read and sends it on every row.
 *
 * IT IS HERE AND NOT IN THE PAGES so that `only="exceptions"` is written once. The pairing test in
 * tests/provenance-ui.test.ts finds the surfaces that hide the authored mark by reading the source
 * for that string, and a page that spelled it out itself would have to carry the sentence itself
 * too — six copies of one pairing is six chances for one of them to lose its half.
 */
export function RowMarks({
  record,
  origin = true,
}: {
  record: { origin?: unknown; kind: string; incompleteCount?: number }
  /** False when the group heading above the row already carries this row's origin mark. See `GroupOriginMark`. */
  origin?: boolean
}) {
  return (
    <span className="fam-marks">
      {origin ? <OriginMark record={record} only="exceptions" /> : null}
      {record.incompleteCount === undefined ? null : (
        <IncompleteMark count={record.incompleteCount} what={kindWord(record.kind).text} />
      )}
    </span>
  )
}

/**
 * THE ORIGIN EVERY ROW OF A GROUP SHARES, OR NULL WHEN THE ROWS DIFFER OR ARE ORDINARY WORK.
 *
 * As settled for question 5 of report n9Mjk3c_sJRu: say "Made-up
 * example" once beside a group heading when every row carries it, and on the row otherwise. The same
 * holds for the other marks `OriginMark only="exceptions"` draws, so the rule compares what the mark
 * would say (its key and any stored word), not only whether a row is made up. An empty group and a
 * group of authored rows share nothing that is drawn, so both answer null.
 */
export function sharedOrigin(records: readonly { origin?: unknown }[]): { origin?: unknown } | null {
  const first = records[0]
  if (first === undefined) return null
  const said = originSaid(originReading(first))
  if (said.key === 'authored') return null
  for (const record of records) {
    const other = originSaid(originReading(record))
    if (other.key !== said.key || other.count !== said.count) return null
  }
  return first
}

/** The mark every row of a group shares, drawn once beside the group's heading. Nothing when `sharedOrigin` is null. */
export function GroupOriginMark({ records }: { records: readonly { origin?: unknown }[] }) {
  const shared = sharedOrigin(records)
  return shared === null ? null : <OriginMark record={shared} only="exceptions" />
}

/**
 * ONE MODULE ROW, shared by `#/structure` and `#/modules`.
 *
 * ---------------------------------------------------------------------------------------
 * THE LEFT COLUMN IS THE COUNTED ANSWER, NOT THE STORED WORD, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 * The audit's fourth finding was that "the widest, leftmost, loudest column is a non-answer": ten
 * of ten rows on `greenhouse #/structure` read NO STATE FIELD or NO STATE WRITTEN. Measured on the
 * live corpus, ALL fifteen modules in `panelx` and ALL twelve in `greenhouse` carry no lifecycle
 * word — so a column drawn from that field could never tell one row from another, on either page.
 *
 * What CAN is the checklist, which is counted from the module's own `parts` on every read and
 * differs on every row. So it takes the fixed column, drawn the same way a pipeline's
 * `5 / 10 steps done` is drawn on the same page, and the lifecycle word is drawn beside the title
 * WHEN THERE IS ONE. When there is not — which is every module in both projects today — the page
 * says so once, above the rows, through `postureNote`.
 *
 * IT IS NOT A CHIP. A chip is what a STORED word wears everywhere in this product, and dressing a
 * figure this component counted as one would be exactly the confusion the module page has always
 * been careful about: one word somebody wrote, one nobody did.
 */
export function ModuleRowView({
  reading,
  cols,
  /** True when the rows differ on this field — see `postureNote`. False draws no lifecycle at all. */
  sayPosture,
  /** True when the rows differ on this field — see `problemLinkNote`. */
  sayNoProblems,
}: {
  reading: ModuleReading
  cols: string
  sayPosture: boolean
  sayNoProblems: boolean
}) {
  // ONE LABELLED FACT, AND THEN THE DESCRIPTION AS PROSE. The summary used to be a fact labelled
  // "what it is", which printed those three words down the left of all fifteen rows to introduce a
  // sentence that is plainly a description of the thing named on the line above it. A label earns
  // its place when it says which of several questions a clause answers; here there is only one.
  const facts: Fact[] = [
    {
      get label(): string { return t('g7a.family.problems') },
      value:
        reading.linkedProblems === 0
          ? null
          : reading.openProblems === 0
            ? t('g7a.family.allClosed', { n: reading.linkedProblems })
            : t('g7a.family.openOf', { open: reading.openProblems, total: reading.linkedProblems }),
      lead: reading.openProblems > 0,
      urgent: reading.openProblems > 0,
    },
  ]
  return (
    <Row
      cols={cols}
      sev={
        reading.items === 0 ? (
          // AN EMPTY CHECKLIST IS AN ANSWER AND IS NOT `0 / 0`. Sending `parts: []` is what
          // kinds.ts asks a caller to do when there is nothing on the list yet, and it counts as
          // complete rather than as no progress.
          <span className="fam-count" data-empty="1">
            <Absence />
          </span>
        ) : (
          <span className="fam-count">
            <b className="num">
              {reading.checked} / {reading.items}
            </b>
            <span>{t('g7a.family.checked')}</span>
          </span>
        )
      }
      leading={
        <>
          <RowMarks record={reading.record} />
          {/* THE STORED WORD, and only when one is stored. `StoredState` would print "no state"
              for a null, which is true and is the same true thing on every row of both pages. */}
          {sayPosture && reading.lifecycle !== null ? (
            <StoredState state={reading.lifecycle} progress={progressOf(reading.lifecycle)} />
          ) : null}
        </>
      }
      title={reading.record.title}
      href={`#${recordPath(reading.record.id, reading.record.kind)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      meta={
        <>
          <Facts facts={facts} />
          {reading.record.summary === null ? null : (
            <span className="fam-body">{reading.record.summary}</span>
          )}
        </>
      }
      right={
        sayNoProblems && reading.linkedProblems === 0 ? (
          <span className="fam-when">
            <Absence />
          </span>
        ) : null
      }
    />
  )
}

// ============================================================================ a band of rows

export interface BandProps {
  /**
   * WHAT THIS BAND IS, passed straight through to the panel it draws. Required, and the band never
   * decides it: the same band component draws "Waiting on you" on one page and "Nothing is
   * blocked" on another, so the page that knows which one this is has to say.
   */
  declares: Declares
  heading: string
  /**
   * One line under the heading. LEFT OUT ALMOST EVERYWHERE NOW — see the note on `FamilyHead.lede`.
   *
   * "Somebody is on it now. That is what the word active means" under a heading reading **Being
   * worked on** is the heading paraphrased, and there were fifteen of these across the six pages.
   * What is left is a statement about THE DATA that the rows cannot make for themselves — "no
   * problem in this project is linked to any module" — and never a gloss on the heading above it.
   */
  what?: string
  /** How many rows are in the band, drawn or not. Always printed, including zero. */
  count: number
  /**
   * A small round `?` beside the count, for a concept no arrangement of pixels can carry.
   *
   * ONE BAND IN THE PRODUCT USES IT. See `Hint` in ui.tsx: deletion is the first answer and this is
   * the exception. A hint that could be a clearer heading is a heading that was not written.
   */
  hint?: React.ReactNode
  /**
   * How many rows to draw before folding. Absent means the band never folds.
   *
   * A FOLD ALWAYS SAYS ITS EXACT COUNT and never the word "more" — the rule the rest of the
   * product follows. See `HiddenCount` in ui.tsx for the version used when the remainder lives on
   * another surface; here it is one press away in this same band, so the way out is a button.
   */
  foldPast?: number
  /** Set on the band a page exists for. Drawn with the alarm tint and the spine. */
  rank?: 0 | 1 | 2
  tone?: 'failed' | 'ask'
  /**
   * What to say when the band holds nothing — AND WHETHER THE BAND IS DRAWN AT ALL.
   *
   * ---------------------------------------------------------------------------------------
   * THE OWNER'S FOURTH FINDING: "a lot of 'Nothing is ...' descriptions everywhere"
   * ---------------------------------------------------------------------------------------
   * This used to be required, so every band on every page drew a panel whose only content was a
   * sentence saying it had none. On `#/work` in an empty project that is four panels; across the
   * six pages it was eleven of them, and nine said nothing a reader would act on.
   *
   * It is optional now, and OMITTING IT DROPS THE BAND. What decides which way a band goes is the
   * one question in docs/UX-CONTRACT.md's density test: would this absence change what I do next.
   * "Nothing is waiting on you" is an answer somebody came to the page for. "Nothing has been
   * deliberately put down" is furniture beside three bands that hold the rows.
   *
   * IT IS NOT "HIDE THE EMPTY ONES". Invariant 5 of USER.md still holds — nothing is there and
   * nobody has looked are different facts — and the count line above the bands is where the whole
   * denominator is stated, on every page, whatever the bands are showing.
   */
  empty?: React.ReactNode
  children: (shown: number) => React.ReactNode
}

export function Band({ declares, heading, what, count, hint, foldPast, rank, tone, empty, children }: BandProps) {
  const [open, setOpen] = useState(false)
  const cap = foldPast === undefined || open ? count : Math.min(foldPast, count)
  const hidden = count - cap

  // A BAND WITH NOTHING IN IT AND NOTHING TO SAY ABOUT THAT IS NOT DRAWN. See `empty` above.
  if (count === 0 && empty === undefined) return null

  return (
    <Panel titleIs="label" declares={declares}
      title={heading}
      rank={rank ?? 1}
      {...(tone === undefined ? {} : { tone })}
      actions={
        <>
          <Tag tone="quiet">{count}</Tag>
          {hint === undefined ? null : <Hint label={t('g7a.family.headingMeaning', { heading })}>{hint}</Hint>}
        </>
      }
    >
      {what ? <p className="fam-what">{what}</p> : null}
      {count === 0 ? <Absence /> : children(cap)}
      {hidden > 0 ? (
        <p className="fam-fold">
          <span>
            {t('g7a.family.shown', { shown: cap, total: count })}
          </span>
          <Btn size="sm" onClick={() => setOpen(true)}>
            {t('g7a.family.showAll', { n: count })}
          </Btn>
        </p>
      ) : null}
      {hidden === 0 && open && foldPast !== undefined && count > foldPast ? (
        <p className="fam-fold">
          <span>{t('g7a.family.allShown', { n: count })}</span>
        </p>
      ) : null}
    </Panel>
  )
}

// ============================================================================ the fact line

export interface Fact {
  /** The words the field's own schema uses. Never a synonym invented on the page. */
  label: string
  /** Null is not drawn. An empty fact and a missing one look identical on screen. */
  value: React.ReactNode | null
  /** The one fact on the row that leads it: drawn first, in the row's own weight. */
  lead?: boolean
  /** A number that carries escalation — days late, days waiting. Drawn in the alarm ink. */
  urgent?: boolean
}

/**
 * A row's facts, in the order they were passed, separated by a mid dot.
 *
 * THE ORDER IS THE DESIGN AND IT IS THE CALLER'S. What leads a row differs per family — how late it
 * is on `#/work`, how much of the checklist is ticked on `#/structure` — and a component that
 * sorted them would be a second opinion about what matters, held in the one place nobody would
 * think to look.
 */
export function Facts({ facts }: { facts: readonly Fact[] }) {
  const drawn = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '')
  if (drawn.length === 0) return null
  return (
    <span className="fam-facts">
      {drawn.map((fact, i) => (
        <span
          className="fam-fact"
          key={`${fact.label}-${i}`}
          data-lead={fact.lead ? '1' : undefined}
          data-urgent={fact.urgent ? '1' : undefined}
        >
          <span className="fam-fact-label">{fact.label}</span>
          <span className="fam-fact-value">{fact.value}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * THE FACTS A ROW DOES NOT LEAD WITH, behind one press that says what is under it.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S SECOND AND THIRD FINDINGS, WHICH ARE ONE FINDING
 * ---------------------------------------------------------------------------------------
 * On `#/work`: *"the text like cost, what it is are not needed to be expand by default — expand by
 * need."* On `#/decisions`: *"the long text the small text `recommendation, what it is` made it
 * difficult to read."* Both rows were carrying every stored field the kind has, at 13px, joined by
 * mid dots, so the one clause that says why the row is on the page — what it waits on, what the
 * measurement was — was a sixth of a paragraph rather than the first thing read.
 *
 * A row at rest is now the state, the title, and the fact that makes it urgent. Everything else is
 * here. NOTHING IS DELETED: a stored field somebody wrote is still on the page, one press away, in
 * the DOM for find-in-page and for a screen reader.
 *
 * THE SUMMARY NAMES WHAT IS INSIDE, never "more" or "details". A fold whose label does not say what
 * it holds is a fold nobody opens.
 *
 * ---------------------------------------------------------------------------------------
 * `summary` IS A PHRASE. THE LIST OF FIELD NAMES IT REPLACES WAS NOT ONE
 * ---------------------------------------------------------------------------------------
 * The label used to be the fact labels joined with commas, which produced "costs, what it is",
 * "measured on, method, confidence, what it is" and "reopen when, turned down" on the rows a person
 * reads most. Those are stored field names, printed at somebody who has never seen the schema, and
 * docs/UX-CONTRACT.md says a thing on screen is named after what it is to the reader.
 *
 * The joined labels are still the answer when a caller gives no phrase, so nothing loses its fold
 * and no row goes silent. A caller that knows what the fold is for says it in words.
 */
export function MoreFacts({ facts, summary }: { facts: readonly Fact[]; summary?: string }) {
  const drawn = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '')
  if (drawn.length === 0) return null
  return (
    <details className="fam-more">
      <summary className="fam-more-sum">
        <span>{summary ?? drawn.map((f) => f.label).join(', ')}</span>
      </summary>
      <div className="fam-more-body">
        <Facts facts={drawn} />
      </div>
    </details>
  )
}

/** A fact with no label: a phrase that is already a sentence, like `2 days overdue`. */
export function Said({ children, urgent }: { children: React.ReactNode; urgent?: boolean }) {
  return (
    <span className="fam-said" data-urgent={urgent ? '1' : undefined}>
      {children}
    </span>
  )
}

// ============================================================================ filing one thing

export interface QuickFileProps {
  /** The kind this button files. Never a select — the page knows what it is for. */
  kind: RecordKind
  /** What the button says at rest: "File a problem", "Jot an idea". */
  label: string
  /** The label above the one field. "What went wrong", "The idea, in one line". */
  fieldLabel: string
  variant?: 'primary' | 'secondary'
  /**
   * Fields the kind needs to be born complete, beyond the title.
   *
   * A module filed with no `parts` is stored incomplete, and a pipeline with no `blockIds` cannot
   * be given a block at all — so the two kinds that have a required list field are born with an
   * empty one. An empty list is not a guess: it is the worked example in kinds.ts, and it is the
   * only value the create path accepts other than real ids.
   */
  born?: Record<string, unknown>
  onFiled: () => void
}

/**
 * FILE ONE THING, IN ONE FIELD, WITHOUT KNOWING THE SCHEMA.
 *
 * The form this replaces on every family page opened with a sixteen-option kind select defaulting
 * to `module`, a title, a summary and — on the default kind — a three-line `context` textarea.
 * Filing a task from `#/work` therefore began with changing a select. This one knows its kind,
 * because the page it is on knows what the page is about, and the only thing it asks for is the
 * one field every kind requires: a title, which is what every link to a record is typed as.
 *
 * IT NAVIGATES TO THE NEW RECORD, exactly as the old form did. Everything else about the record is
 * filled in on its own page, which is the page that draws its kind's own fields.
 */
export function QuickFile({ kind, label, fieldLabel, variant = 'secondary', born, onFiled }: QuickFileProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  async function file() {
    const stillHere = stillOnThisPage()
    if (title.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const record = await api.createRecord({
        kind,
        title: title.trim(),
        ...(born === undefined ? {} : { data: born }),
      })
      setTitle('')
      setOpen(false)
      onFiled()
      if (stillHere()) navigate(recordPath(record.id, kind))
    } catch (err) {
      setError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Btn variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Btn>
    )
  }

  return (
    <form
      className="fam-file"
      onSubmit={(e) => {
        e.preventDefault()
        void file()
      }}
    >
      <label className="fam-file-label" htmlFor={`fam-file-${kind}`}>
        {fieldLabel}
      </label>
      <div className="fam-file-line">
        <TextInput value={title} onChange={setTitle} autoFocus id={`fam-file-${kind}`} />
        <Btn
          type="submit"
          variant="primary"
          pending={busy}
          disabled={title.trim() === ''}
          reason={t('g7a.family.titleNeeded')}
        >
          {t('g7a.family.file')}</Btn>
        <Btn variant="ghost" onClick={() => setOpen(false)}>
          {t('g7a.cancel')}</Btn>
      </div>
      {/* The server's own refusal, not pinned to the field: a duplicate title, a kind an agent may
          not write and an unreachable server all arrive here. */}
      {error ? <ErrorNote message={error.message} fault={error.fault} /> : null}
    </form>
  )
}

/**
 * A link dressed as a button, for a primary action that is a place rather than a write.
 *
 * IT IS AN ANCHOR AND NOT A `Btn` WITH A `navigate` CALL, because "Draw the structure" goes to
 * `#/pipeline` and a person should be able to middle-click it, copy its address, and see where it
 * goes in the status bar. It borrows `.px-btn` rather than restating it, so a change to the button
 * in ui.tsx reaches this too; the one rule it adds is the one an anchor needs and a button does not.
 */
export function LinkBtn({ to, title, children }: { to: string; title?: string; children: React.ReactNode }) {
  return (
    <a href={`#${to}`} className="px-btn fam-linkbtn" data-variant="secondary" title={title}>
      {children}
    </a>
  )
}

// ============================================================================ the arithmetic line

/**
 * How much of the project this page is showing, and the way to the rest.
 *
 * ONE SENTENCE, AND IT IS ALWAYS TRUE. "N of M records in this project" is what stops a family page
 * reading as the whole database — which is exactly how the old `#/notes` came to print a session
 * count that disagreed with `#/sessions` and nothing on either page said the two were counting
 * different things.
 */
export function Arithmetic({ children }: { children: React.ReactNode }) {
  return <p className="fam-arith">{children}</p>
}

// ============================================================================ styles

export const FAMILY_CSS = `
.fam { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.fam-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--gut) var(--pad-lg); flex-wrap: wrap; min-width: 0;
}
.fam-ident { min-width: 0; flex: 1 1 22rem; display: flex; flex-direction: column; gap: 4px; }
.fam-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
/* NO max-width. The owner opened the product and the first thing they said about three of these
   pages was that the text breaks. It did: every caption on a family page was capped, so a sentence
   inside a 1146px panel wrapped at 688px and read as four short lines of nothing much. The global
   --measure is the reading measure for a PARAGRAPH; one line of navigation is not one. */
.fam-lede { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); }
.fam-act { flex: none; display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }

/* NO SIDE PADDING. This line, the count line and the page name all start at the page's own left
   edge, which is where the panels between them start. See the note on the family head rule in
   pages/family/rows.tsx for the measurement. */
.fam-foot { display: flex; flex-direction: column; gap: 4px; padding: 0; }
.fam-excl { margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3); max-width: 88ch; }

/* The two marks a row may never fold away. They flow with the title rather than taking a column:
   the fixed left column belongs to the row's one answer, and a column that sometimes holds a mark
   and sometimes an answer is a column nobody can scan. */
.fam-marks { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }

/* ONE SENTENCE OF ARITHMETIC, and it is allowed the width it is given — see .fam-lede above. It
   was capped at 88ch, which at 14px is 688px inside a 1146px panel, so "12 modules and 8 pipelines.
   The 61 steps they are made of are not listed here" broke in the middle of its own clause. */
.fam-arith {
  /* NO SIDE PADDING — it starts where the page name and the panel edges start. See the foot rule above. */
  margin: 0; padding: 0;
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.fam-arith b { color: var(--text); }

.fam-what {
  margin: 0 0 var(--pad); padding: 0 var(--pad);
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-3);
}

.fam-fold {
  margin: var(--pad) 0 0; padding: 0 var(--pad);
  display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap;
  font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2);
}
.fam-fold b { color: var(--text); font-variant-numeric: tabular-nums; }

/* THE ROW'S FACT LINE. Labels are quiet and values carry the weight, so the line scans as a list
   of answers with their questions attached rather than as a paragraph. It wraps rather than
   truncating: every clause on it is a stored field somebody wrote, and cutting one at 1440 to keep
   a row one line high is the density this redesign is undoing.

   IT SETS ITS OWN SIZE, ONE STEP ABOVE .px-row-meta, and that is the owner's third finding rather
   than a preference: "the small text recommendation, what it is made it difficult to read". A row's
   meta line is --fs-1 at --lh-tight, which is right for a stamp and wrong for five clauses of
   somebody's prose. --fs-2 at --lh-body is the same treatment the count line above the rows gets,
   and the number of clauses came down at the same time -- see MoreFacts. */
.fam-facts {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad); min-width: 0;
  font-size: var(--fs-2); line-height: var(--lh-body);
}
.fam-fact { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; max-width: 100%; }
.fam-fact + .fam-fact::before { content: "·"; color: var(--text-3); margin-right: 5px; }
.fam-fact-label { color: var(--text-3); white-space: nowrap; }
.fam-fact-label::after { content: ":"; }
.fam-fact-value { color: var(--text-2); min-width: 0; overflow-wrap: anywhere; }
.fam-fact[data-lead="1"] .fam-fact-value { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
/* THE ONE HUE A ROW MAY CARRY. The contract allows one urgency mark per row and this is it: a
   missed date, drawn in ink with the word beside it, never as colour alone. */
.fam-fact[data-urgent="1"] .fam-fact-value { color: var(--st-failed); font-weight: 600; }

.fam-said { color: var(--text-2); font-variant-numeric: tabular-nums; }
.fam-said[data-urgent="1"] { color: var(--st-failed); font-weight: 600; }

/* One field, one button, on one line while there is room. This is the whole cost of filing an
   idea, and it is deliberately the cheapest write in the product. */
.fam-file { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 22rem; }
.fam-file-label {
  font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-3); line-height: var(--lh-tight);
}
.fam-file-line { display: flex; gap: var(--pad); align-items: center; flex-wrap: wrap; min-width: 0; }
.fam-file-line > *:first-child { flex: 1 1 16rem; min-width: 0; }

/* The one thing an anchor needs that a button does not. Everything else about this control comes
   from .px-btn in ui.tsx, so it cannot drift away from the buttons beside it.
   TWO CLASSES IN THE SELECTOR, because one would tie with .px-btn on specificity and ui.tsx's
   sheet is hoisted after this one — the rule would simply not apply. */
.px-btn.fam-linkbtn { text-decoration: none; }

/* A COUNTED ANSWER IN THE COLUMN A STORED WORD USUALLY HOLDS — 7 / 12 checked, 5 / 10 steps done.
   It is deliberately NOT a chip: a chip is what a stored word wears everywhere in this product, and
   dressing a figure the page counted as one would let a counted answer pass for an authored one. */
.fam-count {
  display: inline-flex; align-items: baseline; gap: 5px; flex-wrap: wrap;
  font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-tight);
}
.fam-count b { font-size: var(--fs-3); font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.fam-count[data-empty="1"] { font-style: italic; }

/* One line of somebody else's prose on a row. Clamped rather than cut, so find-in-page and a
   screen reader reach the end of it and the ellipsis is the browser's own. */
.fam-body {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
  overflow: hidden; color: var(--text-2);
}

/* The right-hand cell: when it happened, and the word that stops a bare date reading as a deadline.
   IT WRAPS BETWEEN ITS PIECES AND NEVER INSIDE ONE. It used to set white-space: nowrap on the
   container, which is right for a stamp and catastrophic for anything else: one claim's
   measured_on — a sentence, not a date — drawn in here pushed #/decisions 588px wider than a phone,
   and the page scrolled sideways in every theme and both modes. Prose does not belong in this cell
   at all, and this is the second guard rather than the first. */
.fam-when { display: inline-flex; align-items: baseline; gap: 4px; flex-wrap: wrap; min-width: 0; color: var(--text-3); }
.fam-when > * { white-space: normal; }
.fam-when b { color: var(--text-2); font-weight: 400; font-variant-numeric: tabular-nums; }

/* A proposal's question, which is the row's title on #/decisions. It is a whole question rather than a
   label, so it wraps instead of being truncated -- but it is NOT capped at --measure any more. The
   row's title cell is already minmax(0, 1fr) inside a grid, so the column is the measure; a second
   cap on top of it broke a one-line question into two inside a cell with 250px to spare. */
.fam-question { display: block; overflow-wrap: anywhere; }

/* ------------------------------------------------------------------ what a row does not lead with
   The fold is a quiet line, not a control that competes with the title above it. Its arrow is the
   browser's own marker, kept, because a disclosure that looks like a link is a disclosure people
   press expecting to leave the page. */
.fam-more { min-width: 0; }
.fam-more-sum {
  cursor: pointer; list-style-position: outside;
  font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3);
  min-width: 0; overflow-wrap: anywhere;
}
.fam-more-sum:hover { color: var(--text-2); }
.fam-more-sum:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }
.fam-more-sum > span { position: relative; z-index: 2; }
.fam-more-body { padding: 2px 0 var(--pad); }

/* ------------------------------------------------------------ the round question mark, corrected
   MEASURED, NOT ASSUMED. Hint is new in ui.tsx and a family page is its first caller. Its body is
   position: absolute with left: 0 and width: max-content, and the mark sits at the RIGHT edge of a
   panel header -- so opening one pushed the document from 1440px to 1780px, and from 390px to
   728px. Nothing in this product may scroll the body sideways, and that is one of the five things
   docs/UX-CONTRACT.md says a redesign has broken the product by breaking.

   It opens leftward here instead, and its width is capped against the VIEWPORT rather than against
   its own 16px anchor, which is what 100% would mean inside a relatively positioned mark. Both
   widths were re-measured afterwards. The general fix belongs in ui.tsx, where every future caller
   would get it; this is the correction for the one surface that has a caller today. */
/* -------------------------------------------------------- the state treatments have MOVED OUT
   The four drawings a stored state word gets -- filled block, outline, plain text, dashed outline
   -- used to be written here, scoped to .fam, and that scope was the defect. A word stored on a
   record is a fact about the record, not an opinion of the page it is drawn on, so scoping the
   drawing to six pages meant "open" looked like one thing on #/work and like something else on
   Home and on #/records. Measured in Chromium in "light" before the move: three drawings, one
   stored fact.

   They now live in ui.tsx, ungated, and reach every surface in the product. Search that file for
   "one stored word, one drawing". The reasoning that was written here went with them -- why the
   fill is --text and not the state's own tint, why there is no rule for the danger family, and
   why the selector must OUT-WEIGH the alarm scale rather than tie with it and win on file order.

   THE TRIPLE CLASS IS GONE WITH THEM AND IT WAS NOT SUPERSTITION. .fam.fam.fam existed because
   this stylesheet is hoisted BEFORE ui.tsx's, so a rule here that merely ties loses; a two-class
   version was read as winning and measured as losing, with "todo" still computing its filled grey
   ground. That problem disappears when the rule is in ui.tsx itself. It still applies to
   .px-btn.fam-linkbtn and .px-btn.fam-decide below, which is why both carry a second class. */

@media (max-width: 480px) {
  .fam-act { width: 100%; }
  .fam-file { width: 100%; }
}
`
