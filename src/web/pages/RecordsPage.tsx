// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
import { familyWord } from '@shared/words.ts'
import { content, count, t } from '@shared/i18n.ts'
import { theBranchedSummaryOnThePage } from '@shared/branched-agent.ts'
import { gapBetween } from '@shared/spacing.ts'
/**
 * THE CATALOGUE — and the one address that hands the five families and Modules to their own pages.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE USED TO BE, AND WHY IT CHANGED
 * ---------------------------------------------------------------------------------------
 * It was six pages in one component. `#/records`, `#/modules` and the five family addresses all
 * rendered the same thing: a kind select, a search box, and one prose list per family with a state
 * chip, a kind tag, a title, a one-line summary and `updated 3d ago` on every row. So `#/work`
 * sorted the four kinds of work by WRITE TIME and buried three overdue obligations behind "Show all
 * 26"; `#/structure` was three-quarters pipeline steps, each of them already drawn inside its own
 * pipeline; `#/belief` scattered the four proposals that need a person among seventeen claims; and
 * `#/modules` printed "Structure" under a heading that said "Modules", over a tally claiming two
 * kinds it was not showing had nothing in them.
 *
 * Those six are now six pages, in `pages/family/`, each built out of the fields ITS records store.
 * This page dispatches to them and is what is left: the catalogue.
 *
 * ---------------------------------------------------------------------------------------
 * THE CATALOGUE IS A TABLE, AND IT IS THE ONLY ONE IN THE PRODUCT
 * ---------------------------------------------------------------------------------------
 * Every other surface here is a list of rows, because every other surface is read to answer a
 * question about the work. This one is read to answer a question about the DATABASE — "is it in
 * there, what kind is it, when was it written, what is missing from it" — and that is a question
 * with eight comparable columns and an answer that wants sorting.
 *
 * So: sortable heads, the five families as facets carrying their own counts, and one sentence of
 * arithmetic that is always true. NOTHING FOLDS. The table draws one page of rows at a time
 * because a project of sixteen thousand records drawn at once was a page
 * over a million pixels tall; the counts, the search, the groups and the order are still over every
 * row, and the line above the table says which rows are shown out of how many.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHARED RULES, AND WHAT THIS PAGE SHOWS IN EACH MODE (wave 13j round 12)
 * ---------------------------------------------------------------------------------------
 * The owner took wave 13k's proposal as recommended (report n9Mjk3c_sJRu, block b-17): All records
 * is a table of Title, Kind, State and Updated, under the twelve shared
 * rules. So the page is the same head as every other page (the frame draws
 * the path and the tabs; this file draws the title "All records", one line and the one primary
 * press, "New record"); the filter is not a box; the whole row opens its record; and a state this
 * kind never has is the short mark with its reason on hover.
 *
 * NORMAL MODE draws the four columns. The three other facts the table used to draw in every mode are
 * still on the page:
 *   - Missing: a record with unfilled fields carries the incomplete mark on its title line, so an
 *     incomplete record is still marked on the row. A complete record draws nothing there.
 *   - Source: a made-up record carries "Made-up example" on its title line, or once beside the Title
 *     heading when every row on the page carries it (question 5 of the proposal). An ordinary row draws
 *     nothing, and the note at the foot says what an unmarked row means.
 *   - Created: on the record's own page. A list locates; the detail page explains.
 * DEVELOPER MODE draws all eight columns, in the order Title, Kind, State, Updated, Created, Missing,
 * Source, Id, and each of them can be sorted on.
 *
 * NO "NEEDS YOU" GROUP AND NO QUIET LINE. Nothing on this page judges whether a row waits on the
 * person; that is worked out for Home and Decisions, and a second reading of it here could come to
 * disagree with theirs. A page that never holds such a group shows neither (rule R6).
 *
 * EVERY STORED WORD ON THIS PAGE GOES THROUGH src/web/lib/words.ts. The kind on a tag, the kind in
 * the filter menu, the kind in the "no records of this kind" sentence and the kind named in the
 * count line are one call each, so `wanna_try` cannot reach a Normal screen from one of them while
 * another says "worth a try".
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FILTERS ARE NOT THE SAME FILTER, AND THE PAGE ALWAYS SAYS WHAT IS EXCLUDED
 * ---------------------------------------------------------------------------------------
 * The page draws ONE PAGE OF ROWS AT A TIME, so everything that narrows or
 * orders the list is sent to the server and worked out there over every row before the page is cut:
 * the kind Select (`kind=`), the search box (`q=`, the rule `GET /api/search` reads, body and all),
 * the group buttons (`family=`) and the column heads (`sort=` and `direction=`). The group buttons'
 * counts come back with the page (`tally=family`). `GET /api/search` is still asked, once per
 * search, for the two things only it answers: the record a pasted id names, and how many records
 * say the words in the other projects. `filterState` below is the one place that says which
 * narrowings are in force — printed beside the controls and again above the results, from that one
 * function, because a filter you have forgotten you set is a lie about the data.
 *
 * NOTHING IS DROPPED. A record whose `kind` is not in RECORD_KINDS, and a record whose kind no
 * family covers, both go into their own alarm panel at the top rather than falling off the page.
 *
 * ---------------------------------------------------------------------------------------
 * ALL RECORDS READS ACROSS PROJECTS, by a decision of 29 September 2026
 * ---------------------------------------------------------------------------------------
 * The page stands under All projects. It sends `?projects=` to `GET /api/records` and to
 * `GET /api/search`, starting at the project it was opened from, which is shown chosen in the one
 * control, `ProjectChoiceControl`, at the start of the filter bar. The reader can choose every
 * project or another one. Every row names its project in a Project column after Title. The count
 * line and the group counts add up over what is chosen, and the count line says so with
 * `countedOver`. New record says which project it files into, in its own Project field.
 *
 * A PAGE ABOUT ONE KIND (Pipelines) IS A PAGE OF ONE PROJECT and is unchanged: it reads the
 * project the request's header names, draws no project control and no Project column.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { RECORD_KINDS, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { KIND_FAMILIES, noHeadingHolds, type KindFamily } from '@shared/work.ts'
// THE THREE ATTRIBUTES THAT MAKE AN ELEMENT ADDRESSABLE, declared once in src/shared/targets.ts.
// Nothing here calls a hook: carrying the attribute IS the wiring, and one listener at the document
// reads it. See components/agent/pointing.ts.
import { targetAttributes, textAttributes } from '@shared/targets.ts'
import {
  CATALOGUE_COLUMNS,
  COLUMN_SORT,
  sortCatalogue,
  type CatalogueColumn,
  type SortDirection,
} from '@shared/catalogue.ts'
import { RESULT_WILL_BE_USED_TO } from '../components/Governance.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { GroupOriginMark, RowMarks, sharedOrigin } from '../components/family/parts.tsx'
import { faultOf, api, errorMessage, type ParticipantOnTheWire, type RecordListItem } from '../api.ts'
import { InReach } from '../components/InReach.tsx'
import { Pager } from '../components/Pager.tsx'
import { useLanguage } from '../lib/language.ts'
import { projectName } from '../components/projects.tsx'
import { RecordId } from '../components/RecordId.tsx'
import { navigate, parseRoute, recordPath, whoPath } from '../components/router.tsx'
import { preparedRecordKey, prepareRecord, theRecordPageKept } from '../lib/prepared-record.ts'
import { preparedPageKey, preparePage } from '../lib/prepared-page.ts'
import { preparedProfileKey, prepareProfile } from '../lib/prepared-profile.ts'
import { useForegroundWait, useLoadingLight } from '../lib/waiting-light.ts'
import { useMode, type Mode } from '../lib/mode.ts'
import { readParticipantsOnce, readWorkspacesOnce } from '../lib/oneread.ts'
import { theParticipantAStoredIdNames } from '../lib/participant-lookup.ts'
import { kindWord } from '../lib/words.ts'
import { currentWorkspace, setWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { ProjectChoiceControl, ProjectName, useProjectChoice, withCountedOver } from '../components/ProjectChoice.tsx'
import type { SearchReply } from '../../server/api/search.ts'
import { FamilyPage, hasFamilyPage } from './family/FamilyPage.tsx'
import {
  Absence,
  Btn,
  Empty,
  ErrorNote,
  Field,
  IncompleteMark,
  Loading,
  NoStateMark,
  OriginMark,
  Panel,
  Row,
  Select,
  Stamp,
  StoredState,
  Tag,
  TextInput,
  UnmarkedRowsNote,
  surfaceEmphasis,
  useAsync,
} from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/**
 * `stateOf` MOVED AND IS FORWARDED FROM HERE.
 *
 * It reads a record's stored state word and asks the shared table what it means, and it now lives
 * in `components/family/read.ts` beside every other reader the family pages use. It cannot stay in
 * this file: this page imports the family pages, they read state, and a reader imported back out of
 * the page that imports them is an import cycle.
 *
 * The forward is here rather than in the two callers because `QueriesPage` and `RecordPage` belong
 * to other agents this phase. It is a re-export and not a copy, so there is nothing to keep in step.
 */
export { stateOf, type RecordState } from '../components/family/read.ts'
import { stateOf } from '../components/family/read.ts'
import { waitingOnALimitUntil } from '../lib/a-long-wait.ts'
import { theNextTryOfALongWait } from '../../config/a-long-wait.mjs'

// ============================================================================ shared bits

/** '' is "every kind", which is a real choice on the select and not an absent value. */
type KindFilter = RecordKind | ''

/**
 * NO STORED IDENTIFIER REACHES THIS MENU IN NORMAL MODE. `kindWord` is the one table.
 *
 * It printed the stored kind, so a person choosing what to look at was offered `wanna_try`, which
 * is a column value nobody says out loud, and an underscore, which is a leak from the database.
 * The VALUE is still the stored kind, because that is what the server is asked for: it is what travels to
 * the server, not what a person reads.
 *
 * A FUNCTION AND NOT A CONSTANT, because the label depends on the mode. In Developer mode the
 * label IS the stored word, which is what the switch promises.
 */
function kindOptions(mode: Mode): { value: KindFilter; label: string }[] {
  return [
    { value: '', get label(): string { return t('g7a.records.allKinds') } },
    ...RECORD_KINDS.map((kind) => ({ value: kind as KindFilter, label: kindWord(kind, mode).text })),
  ]
}

/** '' is "every family", which is a real choice on the facet bar and not an absent value. */
type FamilyFacet = KindFamily | ''

const recordCount = (n: number) => t('g7a.records.count', { n, count: count(n) })

// ============================================================================ filtering, grouping

/** True when the text box should keep this record. Title and summary only — nothing hidden. */
export function matchesQuery(record: PanelRecord, needle: string): boolean {
  const lower = needle.toLowerCase()
  return (
    record.title.toLowerCase().includes(lower) || (record.summary ?? '').toLowerCase().includes(lower)
  )
}

/**
 * How long the box waits after the last keystroke before it asks the server.
 *
 * Short enough that a reader who stops typing sees the answer arrive; long enough that typing a
 * word is one request rather than seven. It is here rather than inline because it is a judgement,
 * and a judgement nobody can find is one nobody can argue with.
 */
export const SEARCH_DEBOUNCE_MS = 200

/**
 * Narrow a list of records by title and summary, IN THE BROWSER.
 *
 * NOT WHAT THE SEARCH BOX DOES ANY MORE. The box asks `GET /api/search`, which reads the body of
 * every record as well and is the one rule — two searches with different meanings, one of them
 * called "search" on a screen, is the drift this repository keeps finding. This is kept for callers
 * that really do mean "narrow what I am holding" and for the tests that pin that behaviour.
 */
export function filterRecords<T extends PanelRecord>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return records
  return records.filter((r) => matchesQuery(r, needle))
}

/** One kind's tally inside a family, INCLUDING the ones with nothing in them. */
export interface KindTally {
  kind: RecordKind
  count: number
}

export interface FamilyGroup {
  family: KindFamily
  label: string
  /** Every kind this family covers, in the order KIND_FAMILIES declares, zeroes included. */
  kinds: KindTally[]
  /** Newest first, so a family reads as what has moved lately across the kinds in it. */
  records: RecordListItem[]
}

/** A record that could not be filed under a family, and the reason, in the words the page prints. */
export interface UnfiledRecord {
  record: RecordListItem
  problem: string
}

/**
 * Split records into the five families, plus whatever could not be filed under one.
 *
 * WHAT IT IS FOR NOW: the counts on the facet bar, and the alarm panel of records no family covers.
 * It used to build the page's five panels as well; the families are pages of their own now, and a
 * facet is a count and a narrowing rather than a heading with rows under it.
 *
 * EMPTY FAMILIES ARE KEPT. A family with nothing in it is an answer — "no work is recorded" — and a
 * facet bar that dropped its zeroes would leave a reader unable to tell "I have recorded no
 * purchases" from "this product has no notion of a purchase".
 *
 * Two different failures are told apart rather than merged. A kind that is not in RECORD_KINDS is
 * something writing a word this build has never heard of. A kind that IS in RECORD_KINDS but that
 * no family covers is a gap in KIND_FAMILIES. Both are worth knowing and they need different
 * repairs, so they carry different sentences.
 *
 * AND A THIRD CASE IS NOT A FAILURE AT ALL. `message` has no family on purpose since criterion E1,
 * and it is read on `#/messages`; `KINDS_READ_ON_THEIR_OWN_PAGE` names it, and this function does
 * not report it as a gap. Without that, every message in the project would fill the alarm panel
 * under a heading left over from when the notes family held it.
 */
export function groupByFamily(
  records: readonly RecordListItem[],
  mode: Mode = 'normal',
): {
  families: FamilyGroup[]
  unfiled: UnfiledRecord[]
} {
  const known = new Set<string>(RECORD_KINDS)
  const unfiled: UnfiledRecord[] = []

  const families: FamilyGroup[] = Object.entries(KIND_FAMILIES).map(([name, family]) => {
    const kinds = family.kinds as readonly RecordKind[]
    const mine = records.filter((r) => kinds.includes(r.kind))
    return {
      family: name as KindFamily,
      label: familyWord(name).text,
      kinds: kinds.map((kind) => ({ kind, count: mine.filter((r) => r.kind === kind).length })),
      records: [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }
  })

  // THE LIST OF KINDS IS IN THE READER'S WORDS IN NORMAL MODE AND THE STORED ONES IN DEVELOPER.
  // One list, read once, so the two modes cannot come to name different sets. It used to be
  // `RECORD_KINDS.join(', ')`, which put `wanna_try` and `block` on a Normal screen inside an
  // alarm panel — the one place a reader is least able to work out what a word means.
  const kindsItKnows = RECORD_KINDS.map((kind) => kindWord(kind, mode).text).join(', ')

  for (const record of records) {
    if (!known.has(record.kind)) {
      unfiled.push({
        record,
        // The record's OWN kind is quoted raw in both modes, and that is words.ts's third rule:
        // a value nothing has a word for is said loudly rather than hidden, because hiding it is
        // how a missing word survives for months.
        problem:
          mode === 'inspect' ? t('g7a.records.unknownDetail', { kind: record.kind, kinds: kindsItKnows }) : t('g7a.records.unknown'),
      })
      continue
    }
    if (noHeadingHolds(record.kind)) {
      unfiled.push({
        record,
        problem:
          t('g7a.records.noGroup'),
      })
    }
  }

  return { families, unfiled }
}

// ============================================================================ what is being excluded

export interface FilterInput {
  /** How many the server sent, under the kind filter in force. */
  loaded: number
  /** How many survived the text box. */
  shown: number
  kind: KindFilter
  query: string
}

/**
 * What this page is NOT showing right now, one clause per cause.
 *
 * THE ONE PLACE. It is printed beside the controls and again above the results, from this one
 * function, because a filter you have forgotten you set is a lie about the data — and two hand
 * -written versions of the same sentence would eventually say two different things.
 */
export function filterState({
  loaded,
  shown,
  kind,
  query,
  locked = false,
  facet = '',
  mode = 'normal',
}: FilterInput & { locked?: boolean; facet?: FamilyFacet; mode?: Mode }): {
  /** True when a control is hiding something the page could otherwise draw. */
  filtered: boolean
  /** One clause per cause of exclusion, longest-lived first. */
  clauses: string[]
  sentence: string
} {
  const q = query.trim()
  const clauses: string[] = []
  // NOT SAID WHEN THE KIND IS THE PAGE'S OWN SUBJECT. On Records a chosen kind hides things the
  // page could otherwise draw, and saying so is the point of this sentence. On a locked page it
  // explains that a page about modules is not showing tasks — which is a sentence about the
  // implementation, to a reader who navigated there on purpose.
  const kindSaid = kind !== '' && !locked
  // THE GROUP BUTTON IS THE THIRD WAY THIS PAGE HIDES SOMETHING. The server keeps only that group's
  // records before it cuts the page, so the others are not in this list at
  // all. A reader who left one on and read the count as the size of the project would be wrong by
  // four fifths. With a kind chosen as well, the two are said in one sentence.
  if (kindSaid && facet !== '') {
    clauses.push(t('records.onlyKindInGroup', { kind: kindWord(kind, mode).text, group: familyWord(facet).text }))
  } else if (kindSaid) {
    clauses.push(t('g7a.records.kindFilter', { kind: kindWord(kind, mode).text }))
  } else if (facet !== '') {
    clauses.push(t('g7a.records.groupFilter', { group: familyWord(facet).text }))
  }
  // NO CLAUSE FOR THE SEARCH ITSELF, and that is deliberate. It used to say "N loaded records do
  // not match in the title or the summary and are not drawn", which described a narrowing this page
  // no longer does: the server answers the search and returns only what matched, so there is no
  // local remainder to count. What replaced it belongs in the head sentence — see `countLine`.
  // No "Excluded right now:" in front. Every clause already ends in what it excludes, so the label
  // was a heading for a list of headings.
  // EACH CLAUSE IS A WHOLE SENTENCE, joined by the office's spacing rule. They were phrases joined
  // with "and", made for the middle of a sentence, and the count line stood one between two whole
  // sentences: "1 record. showing only “report” Counted in Default." at 390 in round 166's pictures.
  const said = clauses.reduce((line, clause) => (line === '' ? clause : line + gapBetween(line, clause) + clause), '')
  return {
    filtered: kind !== '' || q !== '' || facet !== '',
    clauses,
    sentence: said,
  }
}

/**
 * The one line that has to be true: what is on screen, what was fetched, and what is excluded.
 *
 * "3 records" on a page that holds two hundred is the exact half-truth that makes somebody believe
 * their work has disappeared, so the numbers and the exclusions are never separated.
 */
export function countLine(input: FilterInput & { locked?: boolean; facet?: FamilyFacet; mode?: Mode }): string {
  const q = input.query.trim()
  // WHEN A SEARCH IS RUNNING, `loaded` AND `shown` ARE THE SAME NUMBER, and saying "3 of 3 loaded
  // records shown" would be arithmetic about a remainder that does not exist. The server returns
  // what matched and nothing else, so the honest head count is how many records say the word.
  // "FETCHED" IS WHAT THE BROWSER DID, NOT WHAT THE READER HAS. It read "229 records fetched."
  // A person has 229 records; a request fetched them.
  //
  // AND A SEARCH THAT MATCHED NOTHING SAYS NOTHING HERE. The empty state where the rows would have
  // been says it, once, with the way out beside it. This line used to say the result and the method
  // and the exclusion, the empty state said the result and the method again in different words, and
  // "deleted records are never in this list" was on the screen twice more. One screen, one answer.
  if (q !== '' && input.shown === 0) return ''
  const head =
    q === ''
      ? t('g7a.records.countLine', { n: input.loaded, count: count(input.loaded) })
      : t('g7a.records.matches', { n: input.shown, count: count(input.shown), query: q })
  // JOINED BY THE OFFICE'S SPACING RULE: no space after 。 in Chinese, and none at all when there is no
  // filter to name, so the line never ends in a stray space (wave 13q's round 28).
  const sentence = filterState(input).sentence
  return head + gapBetween(head, sentence) + sentence
}

// ============================================================================ the new-record form

/**
 * A multi-line field.
 *
 * ui.tsx has TextInput and Select and nothing that takes a paragraph, and a module's `context`
 * is a paragraph — the one that says why the module exists. The label is wired to the textarea by
 * hand (`useId` + htmlFor) rather than dropped inside a Field, because Field hands its generated id
 * to its control through a context only TextInput and Select read: a textarea in there would get a
 * label pointing at nothing, which is worse than no label at all.
 */
function LongTextField({
  label,
  optional = false,
  value,
  onChange,
  rows,
}: {
  label: string
  /** Draws the word Field draws for a box that may be left out. */
  optional?: boolean
  value: string
  onChange: (next: string) => void
  rows: number
}) {
  const id = `${useId()}-c`
  return (
    <div className="rec-longfield">
      <div className="rec-longlabelrow">
        <label className="rec-longlabel" htmlFor={id}>
          {label}
        </label>
        {optional ? <span className="px-field-optional">{t('sheet.fieldOptional')}</span> : null}
      </div>
      <textarea
        className="rec-longinput"
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/**
 * The full create form, with the kind select — and this is the one page where that is right.
 *
 * IT USED TO BE ON ALL SIX PAGES AND DEFAULTED TO `module` ON EVERY ONE OF THEM, so filing a task
 * from `#/work` began with changing a select to a word you had to already know. The family pages
 * file their own kinds now, in one field, through `QuickFile`. What is left here is the form for
 * "I want to file a record and I know which kind" — on the page that is about the shape of the
 * database, where a sixteen-option select is the subject rather than an obstacle.
 *
 * `defaultKind` is passed rather than assumed, so a kind-locked catalogue opens on its own kind.
 */
function NewRecordForm({
  defaultKind,
  into,
  onCreated,
  onCancel,
}: {
  defaultKind: RecordKind
  /**
   * WHICH PROJECT THE RECORD IS FILED IN, on the page that reads across projects: the projects to
   * choose from, by id and title, and the one the field starts at. The field is always drawn there,
   * so the form never files silently into the project the page was opened from. Absent on a page of
   * one project, which files into the project in the switcher.
   */
  into?: { titles: ReadonlyMap<string, string>; start: string }
  onCreated: () => void
  onCancel: () => void
}) {
  const mode = useMode()
  const [kind, setKind] = useState<RecordKind>(defaultKind)
  const [project, setProject] = useState<string>(into?.start ?? '')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [context, setContext] = useState('')
  /**
   * WHAT THE ANSWER TO A FORK WILL BE USED TO DO. The owner's own field, asked for at the moment a
   * proposal is filed rather than left to be filled in later — *"A Proposal should make the human
   * answer, explicitly or structurally: Result will be used to: ______"*.
   *
   * IT IS ASKED FOR AND NOT REQUIRED. A fork somebody has already reached is worth filing whether
   * or not the writer can say what the answer will be spent on; the card draws the blank, so an
   * unanswered one is visible rather than lost. `KIND_SPECS.proposal` declares it optional and this
   * form does not add a rule the server does not have.
   */
  const [usedTo, setUsedTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const stillHere = stillOnThisPage()
    if (title.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const record = await api.createRecord(
        {
        kind,
        title: title.trim(),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        // A module is born with the shape a module page expects, so its page is never a
        // half-broken screen full of "missing field" warnings.
        ...(kind === 'module' ? { data: { context: context.trim(), parts: [], paths: [] } } : {}),
        // AND A PIPELINE IS BORN WITH AN EMPTY ORDER, for the same reason and one more. Filed with
        // no `data` it is stored incomplete — `blockIds is not filled in` — which is true and is a
        // poor first thing to show somebody who has just made one. An empty array is not a guess:
        // it is what the kind's own worked example is, and it is the only value the create path
        // accepts other than real block ids, because a made-up id is exactly what it refuses.
        ...(kind === 'pipeline' ? { data: { blockIds: [] } } : {}),
        // Sent only when it was written. An empty string would be a stored answer of "nothing",
        // which is not what a blank box means.
        ...(kind === 'proposal' && usedTo.trim() !== ''
          ? { data: { [RESULT_WILL_BE_USED_TO]: usedTo.trim() } }
          : {}),
        },
        into === undefined ? undefined : project,
      )
      setTitle('')
      setSummary('')
      setContext('')
      setUsedTo('')
      onCreated()
      // THE RECORD'S OWN PROJECT IS OPENED WITH IT, as the record an id names is (`ExactRecordHit`),
      // so its page does not first land on the note that it is in another project.
      if (!stillHere()) return
      if (into !== undefined && project !== currentWorkspace()) setWorkspace(project)
      navigate(recordPath(record.id, kind))
    } catch (err) {
      setError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'records.new' }} title={t('g7a.records.new')}>
      <form className="rec-form" onSubmit={(e) => void submit(e)}>
        <div className="rec-form-line">
          {into === undefined ? null : (
            <Field label={t('g7a.records.filesInto')}>
              <Select<string>
                value={project}
                onChange={setProject}
                options={[...new Set([project, ...into.titles.keys()])].map((id) => ({ value: id, label: into.titles.get(id) ?? id }))}
              />
            </Field>
          )}
          <Field label={t('g7a.records.kind')} hint={t('g7a.records.decisionHint')}>
            <Select<RecordKind>
              value={kind}
              onChange={setKind}
              // The words a person reads, never the stored identifier — the same table the kind
              // filter above the list reads. The value sent to the server is unchanged.
              options={RECORD_KINDS.map((k) => ({ value: k, label: kindWord(k, mode).text }))}
            />
          </Field>
          <Field label={t('g7a.records.titleLabel')}>
            <TextInput value={title} onChange={setTitle} autoFocus />
          </Field>
        </div>

        <Field label={t('g7a.records.summary')} optional>
          <TextInput value={summary} onChange={setSummary} />
        </Field>

        {kind === 'module' ? (
          <LongTextField
            label={t('g7a.records.context')}
            value={context}
            onChange={setContext}
            rows={3}
          />
        ) : null}

        {/* THE ONE QUESTION A FORK IS ASKED AT THE MOMENT IT IS FILED. It is here rather than on an
            edit screen because that is the moment somebody knows the answer — and because a fork
            whose answer nobody would act on is worth not asking, which is only findable while it is
            being written. Left empty it is not sent, and the card draws the blank. */}
        {kind === 'proposal' ? (
          <LongTextField
            label={t('g7a.records.result')}
            optional
            value={usedTo}
            onChange={setUsedTo}
            rows={2}
          />
        ) : null}

        {/* The refusal in the server's own words, and not pinned to a field: a duplicate title,
            a kind an agent may not write, and an unreachable server all arrive here, and marking
            the title box invalid for the second and third would be a small lie about which
            control is wrong. */}
        {error ? <ErrorNote message={error.message} fault={error.fault} /> : null}

        <div className="rec-form-act">
          <Btn
            type="submit"
            variant="primary"
            pending={busy}
            disabled={title.trim() === ''}
            reason={t('g7a.family.titleNeeded')}
          >
            {t('g7a.records.create')}</Btn>
          <Btn variant="ghost" onClick={onCancel}>
            {t('g7a.cancel')}</Btn>
        </div>
      </form>
    </Panel>
  )
}

// ============================================================================ the table

/**
 * The eight columns, declared as data, in src/shared/catalogue.ts.
 *
 * A TABLE RATHER THAN EIGHT `if`s, because every column needs the same four things — a heading, a
 * cell, a sort key and whether it is numeric — and a column that has three of the four is a column
 * that sorts by something other than what it shows. The declaration is shared because the server
 * does the sorting now, over every row, and the head a person presses has to name the order the
 * server answers in.
 */
export { CATALOGUE_COLUMNS, type CatalogueColumn, type SortDirection }

/**
 * The columns drawn in this mode, in the order they are drawn, and the ONE place that decides it.
 *
 * NORMAL MODE DRAWS FOUR: Title, Kind, State and Updated, the table the owner took (report
 * n9Mjk3c_sJRu, block b-17). The title comes first because it is what a person reads to choose a
 * row; the three facts sit at its right. DEVELOPER MODE adds Created, Missing, Source and Id after
 * them. What normal mode does with Missing and Source instead is on `CatalogueRow`.
 *
 * The head, the cell, the sort key and the card label are all derived from this list, so a mode
 * cannot end up with a heading and no cell under it, which is the shape the recurring defect takes
 * in a table.
 */
export const NORMAL_COLUMNS: readonly CatalogueColumn[] = ['title', 'kind', 'state', 'updated']
export const DEVELOPER_COLUMNS: readonly CatalogueColumn[] = [...NORMAL_COLUMNS, 'created', 'incomplete', 'origin', 'id']

export function columnsFor(mode: Mode): readonly CatalogueColumn[] {
  return mode === 'inspect' ? DEVELOPER_COLUMNS : NORMAL_COLUMNS
}

/**
 * A COLUMN THE TABLE DRAWS: one of the catalogue's own, or Project, which only the page that reads
 * across projects draws. Project is not one of the columns the door sorts on, so its head is a
 * heading and not a press.
 */
export type DrawnColumn = CatalogueColumn | 'project'

/** The columns drawn: `columnsFor`, with Project right after Title when the page reads across projects. */
export function drawnColumns(mode: Mode, across: boolean): readonly DrawnColumn[] {
  const columns = columnsFor(mode)
  if (!across) return columns
  const at = columns.indexOf('title') + 1
  return [...columns.slice(0, at), 'project', ...columns.slice(at)]
}

/**
 * What the table opens on, and what it falls back to when the sorted column is not drawn.
 *
 * One declaration, because the second reader of it is `CatalogueTable`: a table whose opening order
 * and whose fallback order were typed out separately could come to disagree, and nothing would fail.
 */
export const OPENING_SORT: { column: CatalogueColumn; direction: SortDirection } = {
  column: 'updated',
  direction: 'desc',
}

/** What each head says. */
export const COLUMN_WORDS: Readonly<Record<DrawnColumn, { head: string }>> = {
  project: { get head(): string { return t('g7a.records.projectHead') } },
  kind: { get head(): string { return t('g7a.records.kindHead') } },
  state: { get head(): string { return t('g7a.records.stateHead') } },
  title: { get head(): string { return t('g7a.records.titleHead') } },
  updated: { get head(): string { return t('g7a.records.updated') } },
  created: { get head(): string { return t('g7a.records.created') } },
  incomplete: { get head(): string { return t('g7a.records.missing') } },
  origin: { get head(): string { return t('g7a.records.origin') } },
  id: { get head(): string { return t('g7a.records.id') } },
}

/**
 * Put the rows in order: the order `GET /api/records?sort=` answers in, from src/shared/catalogue.ts.
 *
 * THE PAGE DOES NOT SORT ITS ROWS ITSELF ANY MORE. It holds one page, and sorting one page would put
 * that page in order and say nothing about the rest. It is named here for the tests that pin how
 * each column orders, and it is the same function the server runs.
 */
export const sortRecords = sortCatalogue

/** Which way a press moves a column: its own opening direction first, then the other one. */
export function nextSort(
  current: { column: CatalogueColumn; direction: SortDirection },
  pressed: CatalogueColumn,
): { column: CatalogueColumn; direction: SortDirection } {
  if (current.column !== pressed) return { column: pressed, direction: COLUMN_SORT[pressed].opens }
  return { column: pressed, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

function catalogueAgent(record: RecordListItem, agents: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'record'>[] | null) {
  if (record.kind !== 'agent' || agents === null) return undefined
  return agents.find(agent => agent.record === record.id || (typeof record.data.handle === 'string' && agent.handle === record.data.handle))
}
function cataloguePath(record: RecordListItem, agents: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'record'>[] | null): string {
  if (record.kind !== 'agent') return recordPath(record.id, record.kind)
  const agent = catalogueAgent(record, agents)
  return agent === undefined ? recordPath(record.id) : whoPath('agent', agent.id)
}

function CatalogueWaitLight({ element, status }: { element: HTMLElement; status:'loading'|'error' }) {
  const target = useRef<HTMLElement>(null)
  useLayoutEffect(() => { target.current = element }, [element])
  useLoadingLight(target, status, 2)
  return null
}

function CatalogueTable({
  records,
  sort,
  onSort,
  titles,
}: {
  records: readonly RecordListItem[]
  sort: { column: CatalogueColumn; direction: SortDirection }
  onSort: (column: CatalogueColumn) => void
  /** Every project's title by id, on the page that reads across projects; then Project is drawn. */
  titles?: ReadonlyMap<string, string>
}) {
  useLanguage()
  const mode = useMode()
  const columns = drawnColumns(mode, titles !== undefined)
  const serial = useRef(0)
  const destinationHash = useRef<string | null>(null)
  const destinationWorkspace = useRef<string | null>(null)
  const [waitingFor, setWaitingFor] = useState<{serial:number; element:HTMLElement; status:'loading'|'error'; failure?:{message:string; fault:ReturnType<typeof faultOf>}} | null>(null)
  useEffect(() => {
    const cancel = () => { serial.current += 1; destinationHash.current = null; destinationWorkspace.current = null; setWaitingFor(null) }
    const changed = () => { if (window.location.hash !== destinationHash.current) cancel() }
    window.addEventListener('hashchange', changed)
    const unsubscribe = subscribeWorkspace(() => { if (window.location.hash !== destinationHash.current || currentWorkspace() !== destinationWorkspace.current) cancel() })
    return () => { serial.current += 1; window.removeEventListener('hashchange', changed); unsubscribe() }
  }, [])
  const open = (record:RecordListItem, element:HTMLElement) => {
    destinationHash.current = null
    destinationWorkspace.current = null
    if (record.kind === 'agent') {
      const sequence=++serial.current, originalHash=window.location.hash, identity=preparedPageKey(recordPath(record.id))
      setWaitingFor({serial:sequence,element,status:'loading'})
      const stillHere=()=>serial.current===sequence && window.location.hash===originalHash && preparedPageKey(recordPath(record.id))===identity
      void readParticipantsOnce().then(async roster=>{
        if(!stillHere())return
        let agent=catalogueAgent(record,roster.agents)
        let value:Awaited<ReturnType<typeof import('./RecordPage.tsx').loadRecordPage>> | undefined
        if(agent===undefined && record.workspaceId!==currentWorkspace()) {
          const {loadRecordPage}=await import('./RecordPage.tsx')
          value=await loadRecordPage(record.id,false,record.workspaceId)
          if(!stillHere())return
          const handle=value.detail.record.data.handle
          if(typeof handle==='string')agent=roster.agents.find(one=>one.handle===handle)
        }
        if(agent===undefined) {
          const path=recordPath(record.id), workspace=record.workspaceId, key=preparedRecordKey(record.id,false,workspace), pageKey=preparedPageKey(path,workspace)
          if(value===undefined){const {loadRecordPage}=await import('./RecordPage.tsx');value=await loadRecordPage(record.id,false)}
          if(!stillHere() || preparedRecordKey(record.id,false,workspace)!==key)return
          prepareRecord(record.id,false,key,value,workspace)
          preparePage(path,pageKey,true,workspace)
          destinationHash.current=`#${path}`
          destinationWorkspace.current=workspace
          navigate(path,workspace)
        } else {
          const path=whoPath('agent',agent.id), key=preparedProfileKey('agent',agent.id)
          const value=await api.profile('agent',agent.id)
          if(!stillHere() || preparedProfileKey('agent',agent.id)!==key)return
          prepareProfile('agent',agent.id,key,value)
          destinationHash.current=`#${path}`
          navigate(path)
        }
      }).catch((error:unknown)=>{
        if(stillHere())setWaitingFor({serial:sequence,element,status:'error',failure:{message:errorMessage(error),fault:faultOf(error)}})
      })
      return
    }
    const path=recordPath(record.id, record.kind), route=parseRoute(`#${path}`), sequence=++serial.current
    if(route.name === 'who') {
      const originalHash=window.location.hash, key=preparedProfileKey(route.kind,route.id)
      setWaitingFor({serial:sequence,element,status:'loading'})
      void api.profile(route.kind,route.id).then(value=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedProfileKey(route.kind,route.id)!==key)return
        prepareProfile(route.kind,route.id,key,value)
        destinationHash.current = `#${path}`
        navigate(path)
      },(error:unknown)=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedProfileKey(route.kind,route.id)!==key)return
        setWaitingFor({serial:sequence,element,status:'error',failure:{message:errorMessage(error),fault:faultOf(error)}})
      })
      return
    }
    if(route.name === 'session' || route.name === 'pipeline') {
      const originalHash=window.location.hash, key=preparedPageKey(path)
      setWaitingFor({serial:sequence,element,status:'loading'})
      const read = route.name === 'session'
        ? import('./SessionPage.tsx').then(({loadSessionPage})=>loadSessionPage(route.id))
        : import('./PipelinePage.tsx').then(({loadPage})=>loadPage())
      void read.then(value=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedPageKey(path)!==key)return
        preparePage(path,key,value)
        destinationHash.current = `#${path}`
        navigate(path)
      },(error:unknown)=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedPageKey(path)!==key)return
        setWaitingFor({serial:sequence,element,status:'error',failure:{message:errorMessage(error),fault:faultOf(error)}})
      })
      return
    }
    if(route.name === 'incident') {
      const originalHash=window.location.hash, key=preparedPageKey(path)
      setWaitingFor({serial:sequence,element,status:'loading'})
      void import('./IncidentPage.tsx').then(({loadIncidentScene})=>loadIncidentScene(route.id)).then(value=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedPageKey(path)!==key)return
        preparePage(path,key,value)
        destinationHash.current = `#${path}`
        navigate(path)
      },(error:unknown)=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedPageKey(path)!==key)return
        setWaitingFor({serial:sequence,element,status:'error',failure:{message:errorMessage(error),fault:faultOf(error)}})
      })
      return
    }
    if(route.name === 'handbook') {
      const originalHash=window.location.hash, key=preparedPageKey(path)
      setWaitingFor({serial:sequence,element,status:'loading'})
      void api.getRecord(route.id).then(value=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedPageKey(path)!==key)return
        preparePage(path,key,value)
        destinationHash.current = `#${path}`
        navigate(path)
      },(error:unknown)=>{
        if(serial.current!==sequence || window.location.hash!==originalHash || preparedPageKey(path)!==key)return
        setWaitingFor({serial:sequence,element,status:'error',failure:{message:errorMessage(error),fault:faultOf(error)}})
      })
      return
    }
    if(route.name !== 'record' && route.name !== 'problem') { setWaitingFor(null); navigate(path); return }
    // A RECORD OPENED BEFORE OPENS AT ONCE: its page draws the answer it kept, marked "Refreshing…", and reads again
    // behind it. Only a record whose page has kept nothing waits here for that page's reads.
    if(theRecordPageKept(route.id,false)) { setWaitingFor(null); navigate(path); return }
    const originalHash=window.location.hash, key=preparedRecordKey(route.id,false)
    setWaitingFor({serial:sequence,element,status:'loading'})
    void import('./RecordPage.tsx').then(({loadRecordPage})=>loadRecordPage(route.id,false)).then(value=>{
      if(serial.current!==sequence || window.location.hash!==originalHash || preparedRecordKey(route.id,false)!==key)return
      prepareRecord(route.id,false,key,value)
      destinationHash.current = `#${path}`
      navigate(path)
    },(error:unknown)=>{
      if(serial.current!==sequence || window.location.hash!==originalHash || preparedRecordKey(route.id,false)!==key)return
      setWaitingFor({serial:sequence,element,status:'error',failure:{message:errorMessage(error),fault:faultOf(error)}})
    })
  }
  // THE REGISTRY, FOR THE NAME A BRANCHED AGENT'S SUMMARY GIVES THE OLD AGENT. The once-only read the side rail
  // already makes, so the table asks nothing new. Until it answers, or if it fails, the summary names the old agent
  // by its handle, which is the fact the record stores.
  const [registry] = useProjectAsync(() => readParticipantsOnce(), [])
  // THE ROWS ARRIVE IN ORDER. The server sorted every row by the column `sort` names before it cut
  // this page, and the caller asked for the order this head is marked with,
  // so the arrow and the rows cannot disagree. Nothing is sorted again here: sorting one page would
  // say nothing about the rows on the other pages.
  const ordered = records
  // "MADE-UP EXAMPLE" ONCE, BESIDE THE TITLE HEADING, WHEN EVERY ROW ON THE PAGE CARRIES IT (question
  // 5 of report n9Mjk3c_sJRu), and then on no row. Only where the Source column is not drawn: in
  // developer mode the column says it on every row.
  const originOnHeading = !columns.includes('origin') && sharedOrigin(ordered) !== null
  return (
    <InReach box="rec-tablewrap" name={t('g7a.records.list')} shape={String(ordered.length)}>
      {waitingFor === null ? null : <CatalogueWaitLight key={waitingFor.serial} element={waitingFor.element} status={waitingFor.status} />}
      {waitingFor?.failure === undefined ? null : <ErrorNote message={waitingFor.failure.message} fault={waitingFor.failure.fault} />}
      {/* `data-many` is set when developer mode draws all eight columns. The table turns into cards
          at a wider width then, because eight columns need more room than four. */}
      <table className="rec-table" data-many={columns.length > NORMAL_COLUMNS.length + (titles === undefined ? 0 : 1) ? '1' : undefined}>
        {/* Read aloud, never drawn. It says what the table is and how to sort it, which is what a
            caption is for. */}
        <caption className="px-sr">{t('g7a.records.sortHint')}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                data-col={column}
                // The one thing a screen reader needs to know that the arrow says visually.
                aria-sort={column === 'project' ? undefined : sort.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {column === 'project' ? (
                  <span className="rec-th rec-th-plain">
                    {COLUMN_WORDS[column].head}
                  </span>
                ) : (
                  <button type="button" className="rec-th" onClick={() => onSort(column)}>
                    {COLUMN_WORDS[column].head}
                    <span className="rec-th-mark" aria-hidden="true">
                      {sort.column === column ? (sort.direction === 'asc' ? '▲' : '▼') : '·'}
                    </span>
                  </button>
                )}
                {column === 'title' && originOnHeading ? (
                  <span className="rec-th-shared">
                    <GroupOriginMark records={ordered} />
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        {/* THE CARD LABEL AND THE COLUMN HEAD ARE ONE STRING. When the table becomes one card per
            record, each cell carries `data-label` instead of a heading, read from the same
            declaration as the head, so the two cannot come to say different words. */}
        <tbody>
          {ordered.map((record) => (
            <CatalogueRow
              key={record.id}
              record={record}
              columns={columns}
              mode={mode}
              originOnHeading={originOnHeading}
              onOpen={open}
              agents={registry.status === 'ready' ? registry.value.agents : null}
              {...(titles === undefined ? {} : { titles })}
            />
          ))}
        </tbody>
      </table>
    </InReach>
  )
}

/**
 * THE SUMMARY A ROW DRAWS. Row 55 of report rFBoQG6mAEI0: the row of an agent made by the Start a new agent press
 * drew the English the server stores, naming the old agent by its bare handle, on a Chinese page too. The row now
 * draws what the record's own page draws (`theBranchedSummaryOnThePage`, src/shared/branched-agent.ts): the sentence
 * in the page's language, naming the old agent by the name the registry holds. A summary somebody rewrote, and every
 * other record's summary, is drawn as stored. Developer mode draws what is stored.
 */
export function summaryOnARow(
  record: RecordListItem,
  mode: Mode,
  agents: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name'>[] | null,
): string | null {
  if (mode === 'inspect') return record.summary
  const branched = theBranchedSummaryOnThePage(t, record, (agent) => {
    const row = agents === null ? undefined : theParticipantAStoredIdNames(agents, agent)
    return row === undefined ? null : content(row.name)
  })
  return branched ?? record.summary
}

/**
 * A PRESS ON A ROW OPENS ITS RECORD, except where the press meant something else:
 *   - it landed on a link, a button or a form control, which does its own thing;
 *   - it was not a plain press of the main button (a modified press is left to the title link);
 *   - it ended a text selection, which is how words in a row are chosen to quote in a comment.
 */
function opensTheRecord(event: React.MouseEvent<HTMLElement>, path: string): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, summary') !== null) return
  const selection = window.getSelection()
  if (selection !== null && !selection.isCollapsed && selection.toString().trim() !== '') return
  navigate(path)
}

/**
 * ONE RECORD, AS A ROW OF THE CATALOGUE, AND SOMETHING YOU CAN TALK TO AN AGENT ABOUT.
 *
 * THE WHOLE ROW OPENS THE RECORD (rule R11). The title is the one link, for the keyboard and for a
 * new tab. A press anywhere else on the row opens the same address (`opensTheRecord`). Nothing is
 * laid over the row, so the marks that give their reason on hover still give it.
 *
 * THE ROW IS THE RECORD FOR A RIGHT-CLICK TOO. One listener at the document reads the attributes on
 * the row and opens the composer on a right-click or on a selection inside it; nothing here calls a
 * hook. See components/agent/pointing.ts. The title is marked as words worth quoting, so selecting
 * some of them makes a comment about those exact words.
 *
 * WHERE MISSING AND SOURCE GO IN NORMAL MODE. Their columns are drawn in developer mode only, so in
 * normal mode the title line carries the two marks a row may never fold away: the incomplete mark
 * when fields are unfilled, and the origin mark when the record is not ordinary authored work
 * (`RowMarks`, the family lists' own). The origin mark is left off the row when the Title heading
 * already says it for every row (`originOnHeading`).
 *
 * EXPORTED SO A TEST CAN DRAW ONE WITHOUT A SERVER.
 */
export function CatalogueRow({
  record,
  columns,
  mode,
  originOnHeading = false,
  titles = new Map(),
  agents = null,
  onOpen,
}: {
  record: RecordListItem
  columns: readonly DrawnColumn[]
  mode: Mode
  originOnHeading?: boolean
  onOpen?: (record:RecordListItem, element:HTMLElement) => void
  /** The registry's agents, for the name a branched agent's summary gives the old agent, or null while unread. */
  agents?: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name' | 'record'>[] | null
  /** Every project's title by id, for the Project cell. A project whose title is not read is named by its id. */
  titles?: ReadonlyMap<string, string>
}) {
  const state = stateOf(record)
  // A RUN WAITING MORE THAN AN HOUR ON A USAGE LIMIT is drawn as waiting until its next try, and its stored state stays running.
  const waitsUntil = record.kind === 'session' ? theNextTryOfALongWait(record.data) : null
  const summary = summaryOnARow(record, mode, agents)
  const marksOnTitle = !columns.includes('origin') || !columns.includes('incomplete')
  const cell = (column: DrawnColumn) => {
    switch (column) {
      case 'project':
        return <ProjectName id={record.workspaceId} titles={titles} />
      case 'kind':
        // NO CHILDREN. `Tag` given a kind and nothing else asks `kindWord` itself and draws the
        // family glyph from the same answer.
        return <Tag kind={record.kind} />
      case 'state':
        // A KIND WITH NO STATE FIELD IS THE SHORT MARK, with the reason on hover (rule R4). It is
        // ordinary: nothing is missing and there is nothing to do. The two other nothings, a state
        // that was never written and a kind nobody knows, stay words, because each is something to
        // look at.
        if (state.progress !== null) {
          const chip = <StoredState state={state.word} progress={state.progress} {...(waitsUntil === null ? {} : { shownAs: waitingOnALimitUntil(waitsUntil) })} />
          // A LONG WAIT'S WORDS WRAP, in a box of their own (.rec-cell-waits below).
          return waitsUntil === null ? chip : <span className="rec-cell-waits">{chip}</span>
        }
        if (state.expected === false) return <Absence title={t('sheet.noState.noFieldDetail')} />
        return <NoStateMark expected={state.expected} />
      case 'title':
        // ONE BOX AROUND ALL OF IT. When the table is cards every cell is a flex row of [label,
        // content], and loose children would become items side by side.
        return (
          <span className="rec-cell-titlebox">
            <span className="rec-cell-titlerow">
              {/* `px-nav` is the resting underline. `recordPath` and never `#/r/${id}` by hand. */}
              <a className="px-nav rec-cell-title" href={`#${cataloguePath(record, agents)}`} {...textAttributes('title', 0)}>
                {record.title}
              </a>
            </span>
            {summary === null ? null : <span className="rec-cell-summary">{summary}</span>}
            {marksOnTitle ? (
              <span className="rec-cell-marks">
                <RowMarks record={record} origin={!columns.includes('origin') && !originOnHeading} />
              </span>
            ) : null}
          </span>
        )
      case 'updated':
        return <Stamp at={record.updatedAt} />
      case 'created':
        return <Stamp at={record.createdAt} />
      case 'incomplete':
        // A DASH, NOT THE WORD "none", and never a blank: `incompleteCount` is counted by the server
        // on every read, so 0 means Mole Office looked and found nothing unfilled.
        return record.incompleteCount === 0 ? (
          <Absence title={t('g7a.records.nothingMissing')} />
        ) : (
          <IncompleteMark count={record.incompleteCount} what={kindWord(record.kind, mode).text} />
        )
      case 'origin':
        // THE LOUD MODE: in developer mode the column IS the question, so every reading is drawn,
        // the ordinary one included.
        return <OriginMark record={record} />
      case 'id':
        return <RecordId id={record.id} where="card" />
    }
  }
  return (
    <tr
      {...targetAttributes({ kind: 'record', recordId: record.id, workspaceId: record.workspaceId })}
      onClick={(event) => {
        if(onOpen === undefined) { opensTheRecord(event, cataloguePath(record, agents)); return }
        if(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return
        const target=event.target instanceof Element ? event.target : null
        if(target?.closest('button, input, select, textarea, summary'))return
        const link=target?.closest('a')
        if(link !== null && link !== undefined && !link.matches('.rec-cell-title'))return
        const selection=window.getSelection()
        if(selection !== null && !selection.isCollapsed && selection.toString().trim() !== '')return
        event.preventDefault()
        onOpen(record,event.currentTarget)
      }}
    >
      {columns.map((column) => (
        <td key={column} data-col={column} data-label={COLUMN_WORDS[column].head}>
          {cell(column)}
        </td>
      ))}
    </tr>
  )
}

// ============================================================================ the results

/**
 * Records this page could not file under a family.
 *
 * They get their own alarm panel instead of vanishing. Something wrote them on purpose, and the
 * disagreement between that writer and the contract is the fact worth showing.
 */
function UnfiledPanel({ unfiled }: { unfiled: readonly UnfiledRecord[] }) {
  return (
    <Panel titleIs="label" declares={{ surface: 'records.unfiled' }}
      title={t('g7a.records.unfiled', { n: unfiled.length, count: count(unfiled.length) })}
      kind={t('g7a.records.noHeading')}
      rank={0}
      tone="broken"
    >
      {/* No note above the rows. That they are listed rather than dropped is what the panel IS —
          drawn in the alarm tone under "N records this page cannot file" — and which of the two
          problems each one is differs per row, so each row says it in its own meta line. */}
      {unfiled.map(({ record, problem }) => (
        <Row
          key={record.id}
          cols="150px minmax(0, 1fr) auto"
          state="broken"
          leading={
            <span className="rec-lead">
              {/* No children, for the reason on the catalogue's kind cell. `Tag` draws a kind it
                  has no word for as a warning and says so, which is most rows in this panel. */}
              <Tag kind={record.kind} />
              {/* THE LOUD MARK, like the Origin column below and unlike every other list in the
                  product. A record this page cannot file is still a record and whether it is
                  fixture is the first thing to know about it — arguably more so here, since a kind
                  nothing recognises is exactly what a stray fixture write would look like. The
                  exceptions-only setting would make this a page that hides the authored mark, which
                  owes its reader the sentence saying what an unmarked row means; on the one page
                  where provenance is a COLUMN, that sentence would be about nothing. */}
              <OriginMark record={record} />
            </span>
          }
          title={record.title}
          href={`#${recordPath(record.id, record.kind)}`}
          meta={problem}
          right={<Stamp at={record.updatedAt} />}
        />
      ))}
    </Panel>
  )
}

/**
 * "This id IS this record" — the direct answer, above the text matches.
 *
 * It says the project, because an id is global and the reader may be looking at another one, and it
 * says when the record is deleted, because a deleted record found by id is a different fact from no
 * record at all. Everything else about it is one press away and is not restated here.
 */
export function ExactRecordHit({
  exact,
  projectTitle,
}: {
  exact: NonNullable<SearchReply['exact']>
  /**
   * What the installation calls the project this record is in, from `GET /api/workspaces`.
   *
   * OPTIONAL, AND ITS ABSENCE IS A REAL STATE RATHER THAN A SHORTCUT. `SearchReply.exact` carries a
   * workspace id and no title, so until that list arrives — or in a test that draws this component
   * on its own — nobody here knows the title, and `projectName` prints the id. That is honest: the
   * id is the true name of what the browser asked about, and it is never another project's title.
   */
  projectTitle?: string | null
}) {
  return (
    <div className="rec-exact">
      {/* "This is the record you typed the id of." The label is what the reader did, not what the
          search did. It is also the reason the id column can be Developer-only: pasting an id into
          the search box is how a record is reached by id, in both modes. */}
      <span className="rec-exact-label">{t('g7a.records.exact')}</span>
      {/* CARRIES THE READER ACROSS, like the governance panel does. An id is global and this hit is
          often in another project, so a bare link landed on the cross-project refusal — which
          correctly told a human to send an HTTP header. That failure had already been found and
          fixed once, in Governance.tsx, and the fix reached one of the two surfaces. */}
      <button
        type="button"
        className="rec-exact-title"
        onClick={() => {
          if (exact.workspaceId !== currentWorkspace()) setWorkspace(exact.workspaceId)
          navigate(exact.path)
        }}
      >
        {exact.title}
      </button>
      <span className="rec-exact-meta">
        <Tag kind={exact.kind} />
        {/* `projectName` is the ONE function in the browser that names a project, so this reads
            exactly what the sidebar reads. IT NEEDS A TITLE TO DO THAT and `SearchReply.exact`
            carries a workspace id and no title, so this tag used to print the raw id — "unassigned"
            beside a sidebar saying "Unassigned". The page reads the list of projects and hands the
            title down; until that list arrives the id is printed, which is the honest answer while
            nothing knows the name.

            THE NAME IS QUOTED IN THE FIRST TAG for the reason src/web/lib/projects.ts gives: quotes
            say the words inside them are a name, whatever somebody has called their project. The
            second tag names the project you are already reading, so it has no preposition to break
            and takes no quotes. */}
        {exact.elsewhere ? (
          <Tag tone="warn">{t('g7a.records.inProject', { project: projectTitle ?? t('g7a.records.unnamedProject') })}</Tag>
        ) : (
          <Tag tone="quiet">{projectTitle ?? t('g7a.records.unnamedProject')}</Tag>
        )}
        {exact.deleted ? <Tag tone="warn">{t('g7a.records.deleted')}</Tag> : null}
      </span>
    </div>
  )
}

export function RecordResults({
  records,
  kind,
  query,
  onClearKind,
  onClearQuery,
  onNew,
  only,
  family,
  facets,
  onFacet,
  elsewhereRows = [],
  total,
  tally,
  sort = OPENING_SORT,
  onSort,
  paging,
  across,
}: {
  /**
   * SET ON THE PAGE THAT READS ACROSS PROJECTS: what is chosen, every project's title by id, and how
   * to choose another project. Then every row names its project, the count line says what it is
   * counted over, and a match in a project not chosen is a press that chooses it. Absent on a page of
   * one project, which draws none of these.
   */
  across?: { choice: ProjectChoice; titles: ReadonlyMap<string, string>; onChoose: (choice: ProjectChoice) => void }
  /** The rows to draw: one page of them, in the order the server sorted every row into. */
  records: RecordListItem[]
  /**
   * How many records the list holds in all, on every page, from the door's `matched`. Absent when
   * the caller hands over the whole list, and then it is how many rows were handed over.
   */
  total?: number
  /**
   * How many records each group holds, and the records no group holds, from the door's `tally`,
   * over every row. Absent: counted from `facets`, and the alarm panel judges the rows handed over.
   */
  tally?: { everything: number; families: Record<KindFamily, number>; unfiled: RecordListItem[] }
  /** The order the rows are in, which is what the column heads are marked with. */
  sort?: { column: CatalogueColumn; direction: SortDirection }
  onSort?: (column: CatalogueColumn) => void
  /** Where this page starts and how to reach the others. Absent: no way to other pages is drawn. */
  paging?: { offset: number; pageSize: number; onGo: (offset: number) => void }
  /**
   * How many records in the OTHER projects match this query, per project. Counts, never rows.
   *
   * A search reads one project, which is right — and a reviewer searched "force gauge" from Mole Office,
   * read "nothing matches", and went away believing the record did not exist. It was in Greenhouse.
   */
  elsewhereRows?: SearchReply['elsewhere']
  kind: KindFilter
  /** Set when the page is about ONE kind, which changes what is worth drawing. See below. */
  only?: RecordKind
  /** The family facet in force, or absent for "every family". Narrows what is drawn, in the browser. */
  family?: KindFamily
  /** Every family with its count, for the facet bar. Absent when the caller draws no facets. */
  facets?: FamilyGroup[]
  onFacet?: (next: FamilyFacet) => void
  query: string
  onClearKind: () => void
  onClearQuery: () => void
  onNew: () => void
  /**
   * Ignored, and kept so the five surfaces that render this component do not all have to change.
   *
   * The rows used to fade with the age of their own `updatedAt`, which is the alarm treatment the
   * lists use. A table does not fade: every row in it is being COMPARED with every other, and a
   * column of dates drawn at four different strengths is a column that cannot be scanned. The age
   * is in the Updated column, in words, where it can be sorted on.
   */
  now?: number
}) {
  // NO SECOND NARROWING. `records` is what the search returned, and filtering it again here by
  // title and summary would throw away every result whose match is in the body — which is most of
  // them, and the whole reason the box stopped narrowing locally.
  const mode = useMode()
  const shown = records
  const inAll = total ?? records.length
  // THE ALARM PANEL SPEAKS FOR EVERY ROW. With the door's tally it judges the records the door found
  // over the whole list; judging `shown` would judge one page and say nothing of the others.
  const judged = tally?.unfiled ?? shown
  const { unfiled } = useMemo(() => groupByFamily(judged, mode), [judged, mode])
  /** How many records one group holds: the server's count over every row, or, with none, the rows handed over. */
  const groupCount = (group: FamilyGroup): number => tally?.families[group.family] ?? group.records.length
  // WORKED OUT ONCE. `countLine` answers with nothing for a search that matched nothing, and the
  // paragraph is not drawn at all then rather than drawn empty and still taking its margin. Calling
  // it twice — once to ask whether to draw it and once to draw it — would be two readings of one
  // answer, which is the shape this repository names as its own defect.
  const line = countLine({
    loaded: inAll,
    shown: inAll,
    kind,
    query,
    mode,
    ...(only === undefined ? {} : { locked: true }),
    ...(family === undefined ? {} : { facet: family }),
  })
  // WHAT THE COUNTS ARE COUNTED OVER, on the page that reads across projects. The group buttons'
  // counts are over the same rows as this line, so the one sentence speaks for both.
  const counted = line === '' || across === undefined ? line : withCountedOver(line, across.choice, across.titles)

  return (
    <>
      {counted === '' ? null : <p className="rec-count">{counted}</p>}

      {/* THE FIVE FAMILIES AS FACETS, WITH THEIR COUNTS — not as five headings with rows under
          them. Each one is also a place: the sidebar leads to a page built out of that family's own
          fields, and pressing one here narrows the table without leaving the catalogue. */}
      {facets === undefined || onFacet === undefined ? null : (
        // "family" IS OUR WORD, NOT A READER'S. The buttons are named after the headings on the
        // left of the screen, which is where a reader met these five groups; the one that clears
        // them says "Everything", which is what it does. Nothing about the grouping changed.
        <div className="rec-facets" role="group" aria-label={t('g7a.records.facet')}>
          <button
            type="button"
            className="rec-facet"
            data-on={family === undefined ? '1' : undefined}
            aria-pressed={family === undefined}
            onClick={() => onFacet('')}
            title={recordCount(tally?.everything ?? inAll)}
          >
            {t('g7a.records.all')}<span className="rec-facet-n num">{count(tally?.everything ?? inAll)}</span>
          </button>
          {facets.map((group) => (
            <button
              key={group.family}
              type="button"
              className="rec-facet"
              data-on={family === group.family ? '1' : undefined}
              aria-pressed={family === group.family}
              onClick={() => onFacet(group.family)}
              title={recordCount(groupCount(group))}
            >
              {group.label}
              <span className="rec-facet-n num">{count(groupCount(group))}</span>
            </button>
          ))}
        </div>
      )}

      {/* MATCHES IN THE PROJECTS THIS SEARCH DID NOT READ. Under the count, so it is beside the
          answer whether the answer was empty or not: three results here and eleven next door is the
          same trap as none here and one next door. Each is a press, because knowing where it is and
          having to go and find it are not the same thing. */}
      {elsewhereRows.length === 0 ? null : (
        <p className="rec-elsewhere">
          {t('g7a.records.elsewhere', { query: query.trim() })}
          {elsewhereRows.map((w) => (
            <Btn
              key={w.workspaceId}
              size="sm"
              variant="ghost"
              // ON THE PAGE THAT READS ACROSS PROJECTS the press chooses that project on this page;
              // on a page of one project it switches the project, as it always has.
              onClick={() => (across === undefined ? setWorkspace(w.workspaceId) : across.onChoose(w.workspaceId))}
            >
              {w.title} · {w.matched}
            </Btn>
          ))}
        </p>
      )}

      {/* FOUR DIFFERENT NOTHINGS, FOUR DIFFERENT ANSWERS. Every one of these is kept, because which
          one you are looking at decides what you would do next — that is the density test passing,
          not furniture. What each says is shorter: the sentence about which parts of a record the
          search read is kept, because it is the only place a reader can learn that a word inside a
          FILE the record points at was never looked at, and without it an empty result reads as
          "that word is nowhere in Mole Office". */}
      {/* THE NEW-RECORD PRESS HERE IS NOT PRIMARY. The page's one primary press is the same one at
          the right of the title (rule R5). The dash carries its reason on hover (rule R4). */}
      {records.length === 0 ? (
        <Empty
          message={
            <Absence
              title={
                query.trim() !== ''
                  ? t('g7a.records.emptySearch', { query: query.trim() })
                  : kind !== '' || family !== undefined
                    ? t('g7a.records.emptyChosen')
                    : across === undefined
                      ? t('g7a.records.emptyProject')
                      : across.choice === EVERY_PROJECT
                        ? t('g7a.records.emptyEvery')
                        : t('g7a.records.emptyOne', { project: across.titles.get(across.choice) ?? across.choice })
              }
            />
          }
          action={
            query.trim() !== '' ? <Btn size="sm" onClick={onClearQuery}>{t('g7a.records.clearSearch')}</Btn>
              : kind !== '' ? <Btn size="sm" onClick={onClearKind}>{t('g7a.records.everyKind')}</Btn>
                : <Btn size="sm" onClick={onNew}>{t('g7a.records.new')}</Btn>
          }
        />
      ) : null}
      {unfiled.length > 0 ? <UnfiledPanel unfiled={unfiled} /> : null}

      {/* ONE PAGE OF ROWS, with the way to the others above and below it.
          The line saying which rows are shown is drawn once, above; below are only the two presses,
          for a reader who has come to the end of the page. */}
      {shown.length > 0 && paging !== undefined ? (
        <Pager offset={paging.offset} pageSize={paging.pageSize} total={inAll} onGo={paging.onGo} />
      ) : null}
      {shown.length > 0 ? (
        <CatalogueTable
          records={shown}
          sort={sort}
          onSort={(column) => onSort?.(column)}
          {...(across === undefined ? {} : { titles: across.titles })}
        />
      ) : null}
      {shown.length > 0 && paging !== undefined ? (
        <Pager offset={paging.offset} pageSize={paging.pageSize} total={inAll} onGo={paging.onGo} line={false} />
      ) : null}
      {/* WHAT A ROW WITH NO ORIGIN MARK MEANS, at the foot, in normal mode, where an ordinary row
          draws no mark. In developer mode the Source column says it on every row. */}
      {shown.length > 0 && mode !== 'inspect' ? (
        <div className="rec-foot">
          <UnmarkedRowsNote />
        </div>
      ) : null}
    </>
  )
}

// ============================================================================ the page

/**
 * What a page about ONE kind calls itself, and the one line under it.
 *
 * Only for kinds with a destination in the frame — two of them — rather than a table over all
 * sixteen. A kind with no destination cannot be landed on, so a name for it here would be a name
 * nothing uses.
 */
const KIND_TITLES: Partial<Record<RecordKind, string>> = { get module(): string { return t('g7a.modules.title') }, get pipeline(): string { return t('g7a.structure.pipelines') } }
const KIND_LEDES: Partial<Record<RecordKind, string>> = {
  get module(): string { return t('g7a.records.moduleLead') },
  get pipeline(): string { return t('g7a.records.pipelineLead') },
}

export function RecordsPage({ only, family }: { only?: RecordKind; family?: KindFamily } = {}) {
  // ---------------------------------------------------------------------------------------
  // THE SIX ADDRESSES THAT ARE NOT THE CATALOGUE.
  //
  // They arrive here because App.tsx routes them here and because a module is stored as a record —
  // which is an internal fact, and navigation is about where a person thinks they are. What each of
  // them draws has nothing in common with a catalogue any more, so the dispatch is the first thing
  // this component does rather than a set of branches threaded through it.
  // ---------------------------------------------------------------------------------------
  // `decisions` IS A FAMILY WITH NO PAGE OF ITS OWN, and that is settled rather than missing:
  // `#/decisions` is the cross-project decisions page, `src/web/pages/DecisionsPage.tsx`. The router
  // reads FLAT_ROUTES before family keys, so that address never becomes a family route and this
  // branch never runs — it is here so that a hand-built call cannot silently draw a blank page. The
  // whole reasoning is on `FamilySurface` in pages/family/FamilyPage.tsx.
  if (family !== undefined && hasFamilyPage(family)) return <FamilyPage key={family} surface={family} />
  if (family !== undefined) {
    return (
      <ErrorNote
        label={t('g7a.records.notPage')}
        message={
          t('g7a.records.noPage', { family: familyWord(family).text })
        }
      />
    )
  }
  if (only === 'module') return <FamilyPage key="modules" surface="modules" />
  return <Catalogue {...(only === undefined ? {} : { only })} />
}

/**
 * How many rows one page of the Everything page draws.
 *
 * Measured on a copy of the office's data, 16,557 rows drawn at once made the page 1.2 million
 * pixels tall and took seven to nine seconds to open. A page of fifty is a few screens tall.
 */
export const RECORDS_PAGE_SIZE = 50

function FilterWaitLight({ element, status }: { element: HTMLElement; status: 'loading' | 'ready' | 'error' }) {
  const target = useRef<HTMLElement | null>(element)
  useForegroundWait(status === 'loading')
  useLoadingLight(target, status, 2)
  return null
}

function Catalogue({ only }: { only?: RecordKind }) {
  const mode = useMode()
  /** The page about every kind reads across projects; a page about one kind reads one project. */
  const across = only === undefined
  const [choice, setChoiceAlone] = useProjectChoice()
  /** What the doors are asked for: the choice on the page that reads across projects, else nothing. */
  const projectsAsked = across ? choice : undefined
  const [kind, setKindAlone] = useState<KindFilter>(only ?? '')
  const [facet, setFacetAlone] = useState<FamilyFacet>('')
  const [query, setQuery] = useState('')
  const [filterWait, setFilterWait] = useState<{ element: HTMLElement; key: string; status: 'loading' | 'ready' | 'error'; answer?: unknown; failed?: boolean } | null>(null)
  const filterKey = (kindValue: string, queryValue: string) => JSON.stringify([kindValue, queryValue.trim()])
  const [creating, setCreating] = useState(false)
  const [sort, setSortAlone] = useState<{ column: CatalogueColumn; direction: SortDirection }>(OPENING_SORT)
  /** How many rows come before the page on screen. Every change to what the list holds goes back to 0. */
  const [offset, setOffset] = useState(0)
  const setKind = (next: KindFilter): void => {
    setKindAlone(next)
    setOffset(0)
  }
  const setFacet = (next: FamilyFacet): void => {
    setFacetAlone(next)
    setOffset(0)
  }
  const onSort = (column: CatalogueColumn): void => {
    setSortAlone((current) => nextSort(current, column))
    setOffset(0)
  }
  const setChoice = (next: ProjectChoice): void => {
    setChoiceAlone(next)
    setOffset(0)
  }
  // THE ORDER ASKED FOR IS ALWAYS THE ORDER A HEAD IS MARKED WITH. A column that is not drawn in
  // this mode cannot carry the arrow, so the opening order is asked for instead, and the arrow moves
  // to Updated with the rows. Every column is drawn in both modes today, so this is the answer only
  // if one stops being drawn.
  const shownSort = columnsFor(mode).includes(sort.column) ? sort : OPENING_SORT
  /** The top of the list, which a press below the table brings back into view. */
  const top = useRef<HTMLDivElement>(null)

  /**
   * THE BOX ASKS THE SERVER, and that is the change: it used to narrow what had already arrived, by
   * title and one-line summary, in this file. Honest, and not enough — of the 20 records in the
   * live corpus that mention "clamp", 9 have it in a title or summary, and of the 100 that
   * mention "workspace", 13 do. Everything else is in the body, which this page never had.
   *
   * DEBOUNCED, because a request per keystroke is a request per keystroke. 200 ms is short enough
   * that a reader who stops typing sees the answer arrive, and long enough that typing a word is
   * one request rather than seven. `useAsync` re-runs on the debounced value, never on `query`.
   */
  const [asked, setAsked] = useState('')
  /** The words last sent, so a pause in typing that changed nothing does not send the reader back to page one. */
  const lastAsked = useRef('')
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim()
      if (next === lastAsked.current) return
      lastAsked.current = next
      setAsked(next)
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  /**
   * ONE PAGE OF ROWS, searched, grouped and ordered by the server over every
   * row. The answer says how many rows there are in all and how many each
   * group holds.
   */
  //
  // THE ANSWER CARRIES THE OFFSET IT WAS ASKED FOR. The rows on screen stay until the next page has
  // arrived, so the line saying which rows are shown is worked out from the answer on screen and
  // never from the page that was pressed for and has not come back yet.
  const [state, reload] = useProjectAsync(
    () =>
      api
        .recordsPage({
          ...(kind === '' ? {} : { kind }),
          ...(facet === '' ? {} : { family: facet }),
          ...(asked === '' ? {} : { q: asked }),
          sort: shownSort.column,
          direction: shownSort.direction,
          limit: RECORDS_PAGE_SIZE,
          offset,
          ...(projectsAsked === undefined ? {} : { projects: projectsAsked }),
        })
        .then((reply) => {
          const answer = { ...reply, offset }
          const key = filterKey(kind, asked)
          setFilterWait(current => current?.status === 'loading' && current.key === key ? { ...current, answer } : current)
          return answer
        }, error => {
          const key = filterKey(kind, asked)
          setFilterWait(current => current?.status === 'loading' && current.key === key ? { ...current, failed: true } : current)
          throw error
        }),
    [kind, facet, asked, shownSort.column, shownSort.direction, offset, projectsAsked],
    // AND READ AGAIN WHEN A RECORD OF THE KIND SHOWN CHANGES, at most once in 5 seconds (item 87 of wave 13y).
    { saysRefreshing: true, follows: { kinds: kind === '' ? 'every kind' : [kind], atMostEveryMs: 5000 } },
  )
  useLayoutEffect(() => {
    if (filterWait?.status !== 'loading' || state.status !== 'ready') return
    if (filterWait.answer !== undefined && state.value === filterWait.answer)
      setFilterWait({ ...filterWait, status: 'ready' })
    else if (filterWait.failed && state.reReadError !== undefined)
      setFilterWait({ ...filterWait, status: 'error' })
  }, [filterWait, state])
  /**
   * WHAT ONLY THE SEARCH DOOR ANSWERS, asked once per search: the record a pasted id names, and how
   * many records say the words in the other projects. One result is asked for, because the rows
   * themselves come from the page above.
   */
  const [found] = useProjectAsync(
    () =>
      asked === ''
        ? Promise.resolve({ exact: null as SearchReply['exact'], elsewhere: [] as SearchReply['elsewhere'] })
        : api.search(asked, kind === '' ? undefined : kind, 1, projectsAsked),
    [kind, asked, projectsAsked],
  )

  /**
   * WHICH PROJECTS THIS INSTALLATION HOLDS, so the record a pasted id names can say which project
   * it is in by NAME.
   *
   * `SearchReply.exact` carries a workspace id and no title — it is an id-shaped answer to an
   * id-shaped question — so without this the tag under that hit printed "unassigned" while every
   * other surface printed "Unassigned". Asked once for the page rather than per search, because the
   * answer changes only when somebody establishes a project.
   *
   * IT GOES THROUGH `readWorkspacesOnce`, LIKE THE FRAME AND HOME. The frame already reads this
   * list for the switcher and the phone bar, and Home reads it for its scope line; this page read
   * the same door a fourth time with `api.listWorkspaces()`. One list of projects per load, and an
   * answer already in flight is joined rather than started again (src/web/lib/oneread.ts).
   */
  const [projects] = useAsync(() => readWorkspacesOnce(), [])
  const projectTitle = (id: string): string | null =>
    (projects.status === 'ready' ? projects.value.workspaces.find((w) => w.id === id)?.title : undefined) ?? null
  /** Every project's title by id, from the same one read, for the control, the Project column and the form. */
  const titles = useMemo(
    () => new Map(projects.status === 'ready' ? projects.value.workspaces.map((w) => [w.id, w.title] as const) : []),
    [projects],
  )

  const shown = state.status === 'ready' ? state.value.records : []
  // THE GROUP BUTTONS' NAMES AND ORDER. Their counts are the server's `tally`, counted over every row;
  // the rows grouped here are only the page's, and are not what the buttons count.
  const { families } = useMemo(() => groupByFamily([]), [])
  const inAll = state.status === 'ready' ? state.value.matched : 0
  const elsewhere = found.status === 'ready' ? found.value.elsewhere : []
  const exact = found.status === 'ready' ? found.value.exact : null
  const filterInput = { loaded: inAll, shown: inAll, kind, query: asked, locked: only !== undefined, facet, mode }
  const filter = filterState(filterInput)
  /** Whether the count line under the filter is drawn, and so already says `filter.sentence`. */
  const countLineSaysIt = state.status === 'ready' && countLine(filterInput) !== ''

  return (
    // WHICH QUESTION THIS SURFACE ANSWERS, declared once, on the element the whole page hangs off.
    // The catalogue is read to compare records with one another, which is `analytical`. See THE
    // SAME SEMANTIC FACT in ui.tsx: a state word means the same thing here as on Home, and only how
    // loudly a chip may be drawn differs.
    <div className="rec" {...surfaceEmphasis('analytical')}>
      <style href="mole-office-records" precedence="default">
        {RECORDS_CSS}
      </style>

      {/* THE SAME HEAD AS EVERY PAGE (rule R9). The frame draws the path and the neighbour tabs
          above it; this draws the title, one line and the one primary press. */}
      <header className="rec-head">
        <div className="rec-ident">
          {/* THE HEADING READS THE SIDEBAR ROW'S OWN KEY, nav.records, so the row and the heading
              are one word in every language (problem IfJ_JmeZ-3vr). The facet below that clears
              the families still says "Everything", because it names what it shows, not the page. A kind-locked catalogue
              is named after its kind. */}
          <h1 className="rec-title" data-title-is="its-label">
            {only !== undefined ? KIND_TITLES[only] ?? kindWord(only, mode).text : t('nav.records')}
          </h1>
          <p className="rec-lede">
            {only === undefined
              ? t('g7a.records.allLead')
              : KIND_LEDES[only] ?? t('g7a.records.everyKindLead', { kind: kindWord(only, mode).text })}
          </p>
        </div>
        <div className="rec-head-act">
          {creating ? (
            <Btn disabled reason={t('g7a.records.formOpen')}>
              {t('g7a.records.new')}</Btn>
          ) : (
            <Btn variant="primary" onClick={() => setCreating(true)}>
              {t('g7a.records.new')}</Btn>
          )}
        </div>
      </header>

      {creating ? (
        <NewRecordForm
          defaultKind={only ?? (kind === '' ? 'note' : kind)}
          // ON THE PAGE THAT READS ACROSS PROJECTS the form says which project it files into: the
          // one chosen, or, with every project chosen, the project the page was opened from, shown
          // in the field where the reader can change it.
          {...(across ? { into: { titles, start: choice === EVERY_PROJECT ? currentWorkspace() : choice } } : {})}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {/* THE FILTER IS NOT A BOX (rule R10): the two controls and the press that clears them, on the
          page itself. It is still the part of the screen called "Filter", so a comment can be left
          on it.

          A RESET MUST NOT UNDO THE PAGE. On a kind-locked catalogue the kind is the page's subject,
          so the press clears only the search box and the groups, and says which. */}
      <div className="rec-filterbar" {...declaredAttributes({ surface: 'records.filter' })}>
        <div className="rec-filters" data-across={across ? '1' : undefined} onChangeCapture={event => {
          const element = event.target
          if (element instanceof HTMLInputElement) {
            const key = filterKey(kind, element.value)
            setFilterWait(key === filterKey(kind, asked) ? null : { element, key, status: 'loading' })
          } else if (element instanceof HTMLSelectElement && element.classList.contains('px-select')) {
            const key = filterKey(element.value, query)
            setFilterWait(key === filterKey(kind, asked) ? null : { element, key, status: 'loading' })
          }
        }}>
          {filterWait === null ? null : <FilterWaitLight key={filterWait.key} element={filterWait.element} status={filterWait.status} />}
          {across ? <ProjectChoiceControl choice={choice} onChoose={setChoice} titles={titles} /> : null}
          {/* A KIND-LOCKED PAGE HAS NO KIND CONTROL: what the page is about is a statement, not a
              control that can only be used wrong. */}
          {only !== undefined ? (
            <Field label={t('g7a.records.kind')}>
              <p className="rec-locked-kind">{kindWord(only, mode).text}</p>
            </Field>
          ) : (
            <Field label={t('g7a.records.kind')}>
              <Select<KindFilter> value={kind} onChange={setKind} options={kindOptions(mode)} />
            </Field>
          )}
          {/* NO PLACEHOLDER: it would repeat the label. */}
          <Field label={t('g7a.records.search')}>
            <TextInput value={query} onChange={setQuery} />
          </Field>
          <div className="rec-clear">
            {(only === undefined ? filter.filtered : query.trim() !== '' || facet !== '') ? (
              <Btn
                size="sm"
                onClick={() => {
                  if (only === undefined) setKind('')
                  setFacet('')
                  setQuery('')
                }}
              >
                {only === undefined ? t('g7a.records.clearBoth') : t('g7a.records.clear')}
              </Btn>
            ) : (
              <Btn
                size="sm"
                disabled
                reason={only === undefined ? t('g7a.records.noFilters') : t('g7a.records.noKindFilter')}
              >
                {only === undefined ? t('g7a.records.clearBoth') : t('g7a.records.clear')}
              </Btn>
            )}
          </div>
        </div>
        {/* Said beside the controls ONLY when a control is actually hiding something AND the count
            line just below is not drawn. The count line ends in the same sentence whenever it is
            drawn, and printing it twice on one screen reads as a stutter. It is not drawn when a
            search matched nothing, and then this line is the one place the page says what is hidden. */}
        {filter.filtered && filter.sentence !== '' && !countLineSaysIt ? <p className="rec-excluded">{filter.sentence}</p> : null}
      </div>

      <Loading label={t('g7a.records.loading')} rows={5} status={state.status} />

      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}

      {/* THE RECORD THIS QUERY *IS*, when the query is an id — first, and told apart from the
          records that merely mention it. The owner searched a proposal's id to reach the proposal
          and got back a message quoting the id in a command and a note citing it, with the record
          itself indistinguishable among them. Every hit was correct and the answer was useless. */}
      {exact !== null ? <ExactRecordHit exact={exact} projectTitle={projectTitle(exact.workspaceId)} /> : null}

      <div ref={top} className="rec-top" />
      {state.status === 'ready' ? (
        <RecordResults
          records={shown}
          total={inAll}
          tally={state.value.tally}
          sort={shownSort}
          onSort={onSort}
          paging={{
            offset: state.value.offset,
            pageSize: RECORDS_PAGE_SIZE,
            onGo: (next) => {
              setOffset(next)
              top.current?.scrollIntoView({ block: 'start' })
            },
          }}
          elsewhereRows={elsewhere}
          {...(only === undefined ? {} : { only })}
          {...(facet === '' ? {} : { family: facet })}
          {...(only === undefined ? { facets: families, onFacet: setFacet } : {})}
          {...(across ? { across: { choice, titles, onChoose: setChoice } } : {})}
          kind={kind}
          query={query}
          onClearKind={() => setKind('')}
          onClearQuery={() => setQuery('')}
          onNew={() => setCreating(true)}
        />
      ) : null}
    </div>
  )
}

// ============================================================================ styles

/**
 * THE CARD RULES, written once and used at two widths: one for the four columns of normal mode and
 * one for the eight of developer mode. `table` is the selector of the table they apply to.
 */
function cardRules(table: string): string {
  return `
  ${table}, ${table} tbody, ${table} tbody tr, ${table} tbody td { display: block; width: 100%; }
  ${table} thead, ${table} thead tr { display: flex; flex-wrap: wrap; gap: 0 var(--gut); }
  ${table} thead th { display: flex; align-items: center; border: 0; padding: 0; }
  ${table} thead th .rec-th { min-height: 44px; }
  ${table} tbody tr {
    border: var(--border-w) solid var(--border);
    border-radius: var(--radius);
    padding: var(--pad);
    margin-bottom: var(--pad);
  }
  ${table} tbody td, ${table} tbody td:first-child { border: 0; padding: 2px 0; display: flex; gap: var(--pad); align-items: baseline; white-space: normal; min-width: 0; }
  ${table} tbody td::before {
    content: attr(data-label);
    flex: 0 0 5.5rem;
    font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
    color: var(--text-3);
  }
  ${table} tbody td > * { flex: 0 1 auto; min-width: 0; }
  ${table} tbody td[data-col="title"] > * { flex: 1 1 auto; }
  ${table} tbody td[data-col="id"] { width: 100%; }
`
}

/**
 * This page's own geometry.
 *
 * styles.css and ui.tsx's stylesheet belong to other agents this phase, so the few layouts that are
 * only this page's business live with it. React 19 hoists `<style href>` into <head> and
 * de-duplicates by href, so this is one element no matter how often the page renders.
 *
 * THE RULE, the same one the component library follows: every value below is a token from
 * tokens.css. There is no colour and no type size written out, so swapping data-theme,
 * data-density, data-radius or data-font re-skins all of it with no code change.
 */
const RECORDS_CSS = `
/* The direct answer to "which record is this id", above the text matches. Given a border and a
   label rather than a colour: it is not an alarm, it is the thing you asked for. */
.rec-exact { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad) var(--pad-lg); padding: var(--pad) var(--pad-lg); margin-bottom: var(--pad-lg); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel-2); }
.rec-exact-label { font-size: var(--fs-1); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-3); }
.rec-exact-title { font-size: var(--fs-3); color: var(--text); text-decoration: none; overflow-wrap: anywhere; flex: 1 1 16rem; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; font-family: inherit; }
.rec-exact-title:hover { text-decoration: underline; }
.rec-exact-meta { display: flex; gap: var(--pad); flex-wrap: wrap; align-items: center; }

.rec { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.rec-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--gut) var(--pad-lg); flex-wrap: wrap;
  min-width: 0;
}
.rec-ident { min-width: 0; flex: 1 1 24rem; display: flex; flex-direction: column; gap: 4px; }
.rec-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.rec-lede {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.rec-head-act { flex: none; display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }

.rec-locked-kind {
  margin: 0;
  min-height: var(--row-h);
  display: flex;
  align-items: center;
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text-2);
}

/* THE FILTER, ON THE PAGE AND NOT IN A BOX (rule R10). The kind, the search box and the press that
   clears them share one line where there is room, and stack on a phone. */
.rec-filterbar { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; container-type: inline-size; container-name: recfilter; }
.rec-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--pad) var(--gut);
  min-width: 0;
}
.rec-clear { display: flex; align-items: flex-end; }
@container recfilter (min-width: 36rem) {
  .rec-filters { grid-template-columns: minmax(0, 12rem) minmax(0, 32rem) auto; align-items: end; }
}
/* ON THE PAGE THAT READS ACROSS PROJECTS the project control comes first, on the same line where
   there is room for all four. */
@container recfilter (min-width: 52rem) {
  .rec-filters[data-across="1"] { grid-template-columns: auto minmax(0, 12rem) minmax(0, 28rem) auto; }
}
@container recfilter (min-width: 36rem) and (max-width: 52rem) {
  .rec-filters[data-across="1"] > .pch-choice { grid-column: 1 / -1; }
}

/* NO max-width. This is one sentence of bookkeeping, and breaking it into four short lines makes
   it look longer than it is — which is what the owner saw and called the line-break problem. It was
   capped at 88ch, 688px at this size, inside a container half as wide again. */
.rec-count, .rec-excluded {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.rec-elsewhere {
  margin: var(--pad) 0 0;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad);
  color: var(--text-2);
}
.rec-excluded { margin-top: var(--pad); font-size: var(--fs-1); color: var(--text-3); }

/* THE FIVE FAMILIES AS FACETS. Each carries its own count, so the bar is also the answer to "how
   much of this project is work" — which is what the five panel headings used to be for, in a
   fifteenth of the height. Pressed state is a fill AND aria-pressed AND the count going bold: no
   state is carried by colour alone. */
.rec-facets { display: flex; flex-wrap: wrap; gap: var(--pad); }
.rec-facet {
  display: inline-flex; align-items: baseline; gap: 6px;
  min-height: 26px; padding: 2px 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text-2);
  font-family: var(--font-ui); font-size: var(--fs-1); line-height: var(--lh-tight);
  cursor: pointer;
}
.rec-facet:hover { background: var(--hover); border-color: var(--text-3); }
.rec-facet[data-on="1"] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
.rec-facet-n { font-variant-numeric: tabular-nums; }

/* ---------------------------------------------------------------- the one table in the product */
/* The wrapper scrolls, not the page. Nothing in this product may scroll the BODY sideways. Where the
   table has too little room it stops being a table altogether (the card rules below), so neither a
   phone nor a desk with the sidebar open reaches the scroll. */
.rec-tablewrap { min-width: 0; overflow-x: auto; container-name: rectable; container-type: inline-size; }
.rec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
}
.rec-table th, .rec-table td {
  text-align: left;
  vertical-align: top;
  padding: var(--pad) var(--pad-lg) var(--pad) 0;
  border-bottom: var(--border-w) solid var(--border);
}
.rec-table thead th { border-bottom: 2px solid var(--border-strong); padding-bottom: 6px; }
.rec-th {
  display: inline-flex; align-items: baseline; gap: 6px;
  background: none; border: 0; padding: 0;
  font-family: var(--font-ui); font-size: var(--fs-1); font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--text-3); cursor: pointer;
}
.rec-th:hover { color: var(--text); }
.rec-th-mark { font-size: var(--fs-1); color: var(--text-3); }
.rec-th-shared { display: inline-flex; margin-left: var(--pad); vertical-align: baseline; }
/* THE PROJECT HEAD IS A HEADING AND NOT A PRESS: the door does not sort on the project. */
.rec-th-plain, .rec-th-plain:hover { cursor: default; color: var(--text-3); }
.rec-table th[aria-sort="ascending"] .rec-th, .rec-table th[aria-sort="descending"] .rec-th { color: var(--text); }

/* THE WHOLE ROW OPENS THE RECORD (rule R11): a press anywhere on it, see opensTheRecord. */
.rec-table tbody tr { cursor: pointer; }
.rec-table tbody tr:hover { background: var(--hover); }

/* THE TITLE TAKES WHAT IS LEFT, AND THE FACTS SIT AT ITS RIGHT, each as wide as its widest word, so
   they line up down the page beside the title rather than at the end of one long line. */
.rec-table td[data-col="title"] { width: 100%; min-width: 12rem; }
.rec-table td[data-col="kind"], .rec-table td[data-col="state"], .rec-table td[data-col="updated"], .rec-table td[data-col="created"] { white-space: nowrap; }
.rec-table td[data-col="state"] * { white-space: nowrap; }
/* A LONG WAIT ON A USAGE LIMIT WRAPS, in a box at most 10rem wide. Its words are the longest a state
   holds, and on one line they ran past the card at 390 and past the table's edge at 660
   (photographed 6 November 2026). */
.rec-table td[data-col="state"] .rec-cell-waits { display: inline-block; width: max-content; max-width: 10rem; }
.rec-table td[data-col="state"] .rec-cell-waits * { white-space: normal; }
/* A ROW'S PROJECT stays on one line, and a long project title is cut with an ellipsis rather than
   taking the title's room. */
.rec-table td[data-col="project"] { white-space: nowrap; }
.rec-table td[data-col="project"] .pch-name { display: inline-block; max-width: 14rem; vertical-align: top; }
.rec-cell-titlebox { display: block; min-width: 0; }
.rec-cell-titlerow { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.rec-cell-title { color: var(--text); font-weight: 600; display: block; overflow-wrap: anywhere; }
.rec-cell-summary { display: block; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.rec-cell-marks { display: flex; flex-wrap: wrap; gap: var(--pad); font-size: var(--fs-1); }
.rec-cell-marks:has(> .fam-marks:empty) { display: none; }
/* THE ID COLUMN IS AS NARROW AS ONE ID AND NO NARROWER. What an id looks like is decided by
   components/RecordId.tsx. */
.rec-table td[data-col="id"], .rec-table th[data-col="id"] { width: 1%; white-space: nowrap; }
/* A CHINESE WORD STAYS ON ONE LINE. Chinese has no spaces, so the browser may break it after any
   character, and in narrow columns it did: a state word stood one character to a line at 1440
   (photographed 27 September 2026). keep-all breaks only where there is a space. */
.rec-table td[data-col="state"], .rec-table td[data-col="origin"] { word-break: keep-all; }
/* AND IN THE COLUMN HEADS, which are Chinese too (photographed 27 September 2026). */
.rec-table thead th { word-break: keep-all; }

/* THE PHONE, AND ANY DESK WHERE THE TABLE HAS TOO LITTLE ROOM: the table becomes one card per record,
   with each cell labelled by the column it came from. Nothing is dropped and nothing scrolls
   sideways. The column heads stay, as a line of presses that sort the list, so a person on a phone
   can still choose the order.
   IT ASKS THE TABLE'S OWN WIDTH, NOT THE WINDOW'S, so an open sidebar counts. Four columns turn into
   cards at 40rem or less. Developer mode's eight columns turn at 64rem or less, because a 1,100 px
   window with the sidebar open left eight columns 824 px and the id column out of sight behind a
   sideways scroll (measured on a copy of the office's data, 27 September 2026). */
@container rectable (max-width: 40rem) {
${cardRules('.rec-table')}
}
@container rectable (max-width: 64rem) {
${cardRules('.rec-table[data-many="1"]')}
}

.rec-lead { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }

/* ---------------------------------------------------------------- the new-record form */
/* Capped: the panel is as wide as the page, and a 1400px-wide box for a record title is a
   target nobody needs and a line nobody can scan back along. */
.rec-form { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; max-width: 56rem; }
.rec-form-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--pad) var(--gut);
  min-width: 0;
}
@container panel (min-width: 30rem) {
  .rec-form-line { grid-template-columns: minmax(0, 12rem) minmax(0, 1fr); align-items: start; }
}
.rec-form-act { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; margin-top: var(--pad); }

/* The textarea is dressed exactly like .px-input, in the same tokens, so the one multi-line
   field on the page cannot drift away from every other control as themes change. */
.rec-longfield { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rec-longlabelrow { display: flex; align-items: center; gap: var(--gut); min-width: 0; }
.rec-longlabel {
  font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-3); line-height: var(--lh-tight);
}
.rec-longinput {
  width: 100%;
  padding: var(--pad) 12px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  resize: vertical;
}
.rec-longinput:hover { border-color: var(--text-3); }
.rec-longinput:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: 1px;
  border-color: var(--focus);
}

/* Phone: the header stops trying to keep the button on the title's line, and the one text
   field goes to 16px because anything smaller makes iOS zoom the page on focus. */
@media (max-width: 480px) {
  .rec-head-act { width: 100%; }
  .rec-head-act > * { flex: 1 1 auto; }
  .rec-longinput { font-size: var(--fs-4); }
}
/* A PRESS ON A PHONE IS AT LEAST 44px TALL (rule R8). */
@media (max-width: 40rem) {
  .rec-facet { min-height: 44px; align-items: center; }
}

/* WHAT AN UNMARKED ROW MEANS, at the foot of the table, quiet. */
.rec-foot { font-size: var(--fs-1); color: var(--text-3); }
`
