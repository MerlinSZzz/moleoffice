// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { Counted } from './home/Counted.tsx'
import { t, content, clausesJoined, endOfSentence } from '@shared/i18n.ts'
/**
 * Draw the attention reply without recomputing its rank. Closed rows show the record and
 * its urgency; the fold holds the reason and the recorded consequence. Developer mode adds
 * the server’s source explanation and counts. Home’s own sentences use the word lists.
 * Reports have a separate reading mark and never enter the attention ranking.
 *
 * THE RANKED LIST IS GONE. Item 6 of a decision removed `AttentionPanel` with its ranked rows, its
 * verdict, its arithmetic, its update offer and its passed-over buckets (problem EHvqbFQy1jY7): no
 * page had drawn it since wave 13k's round 16. What is left is drawn by
 * other pages (the reports, the questions, `MarkRead`, `ReportLine`, `codedReasonWords`) or waits
 * for the owner's answer on where it belongs (`RemainderByGroup`, the "by reason" groups).
 *
 * THE "BY REASON" GROUPS ARE GONE TOO. For the reasons round 19 gave (report bdR-Vb2wif9d), item 3
 * of a decision says they go on no page, Work to do included. With the
 * ranked list gone their heading "the other 60" pointed at nothing, most of what they counted was
 * not work, and Work to do already has Needs you for late work. Wave 13k's round 22 removed
 * `RemainderByGroup`, its `RemainderGroup` and `groupShare`, and `QuietRow`, the row only those
 * groups drew, with the parts of it nothing else used (`alarmOfRow`, `escalationOf`, `kindPrefix`
 * and the row's lead, title, age and facts), their styles and their words.
 */

// EVERY FOLD ON THIS BLOCK IS A NATIVE `<details>`: it survives Find-in-page, it can be opened
// before the JavaScript has run, and it cannot get out of step with the reply a copy of "which
// groups are open" would. THE TWO PIECES OF React STATE IN THIS FILE ARE BOTH ABOUT FOLDS, AND
// NEITHER IS A COPY OF THE FOLD'S OWN OPEN STATE: `RemainderGroup` remembers whether a group has
// EVER been opened, so its rows are built on the first open and kept after (criterion L6), and
// `MarkRead` holds whether its write is in flight and what came back, because a press that says
// nothing about what it recorded is a press a reader cannot trust. The `open` attribute itself
// stays the browser's. (Since wave 13k's round 22 only `MarkRead`'s is left: `RemainderGroup` went
// with the "by reason" groups.)
import { useEffect, useState, type ReactNode } from 'react'
import {
  PAUSE_STANDING_SENTENCES,
  mayMarkReportRead,
  reportNoteOnAPage,
  type AttentionRow,
  type PausedRow,
  type ReportRow,
} from '@shared/attention.ts'
import {
  ATTENTION_PART_ROWS,
  REPORTS_SHOWN,
  newestReports,
  type AttentionPart,
  type AttentionPartRow,
  type AttentionQuestions,
  type PausedOnTheList,
} from '@shared/attention-first-page.ts'
import { api, errorMessage, getActor, type AttentionHome } from '../api.ts'
import { useRecordTitles } from '../lib/titles.ts'
import { formatDue } from '../lib/attention.ts'
/* WHICH PROJECT THESE ROWS ARE FROM. GET /api/attention answers for the project in the header
   and for no other, so the project the switcher is on is the project every row here belongs to.
   It is read rather than passed down because this panel is mounted on Home and on a module's own
   page, and neither knows anything the store does not already hold. */
import { currentWorkspace } from '../lib/workspace.ts'
/* Developer mode is where a report row's whole read sentence and its size go. Read here rather
   than threaded down from Home, because these rows are drawn on a module's page too and that page
   passes no mode. */
import { useInspect } from '../lib/mode.ts'
import { familyPath, recordPath } from './router.tsx'
import {
  Absence,
  Btn,
  DataHealth,
  ErrorNote,
  Explain,
  Hint,
  NoStateMark,
  OriginMark,
  Panel,
  PauseMark,
  Row,
  Tag,
  UnclassifiedMark,
  type HealthGroup,
  shownState,
} from './ui.tsx'
import type { CodedReason } from '@shared/attention-reasons.ts'

// ============================================================================ small readings

/**
 * The parent record's title, for a row that is a checklist item.
 *
 * Handed in, because the attention reply carries the row's own text and the id of the record it
 * sits in, and not that record's title. Returning null is a real answer and the row prints it as
 * one — "in a record this page did not fetch" — rather than showing a bare id or nothing at all.
 */
export type TitleOf = (recordId: string) => string | null

// ============================================================================ the tally

/**
 * The four numbers the verdict is made of, without the sentences around them.
 *
 * The phone gets these as a line of counts and the desk gets them as prose, and they are counted
 * ONCE, here, so the two cannot disagree about how many things say a person could be hurt.
 *
 * The ranked list that drew both, with its verdict and its arithmetic, was removed in wave 13k's round 19, as item 6 of
 * a decision says. A module's own page still reads this (ModuleView.tsx).
 */
export interface Tally {
  safety: number
  owed: number
  /** Of the owed, how many are past the date somebody agreed. */
  late: number
  /** Began and did not finish, by their own recorded state — the rows with nobody waiting. */
  stopped: number
  /** Everybody outside this project who is waiting, exactly as stored in `owedTo`. */
  parties: string[]
}

/** Count the rows the server already classified. Nothing here decides anything. */
export function tallyOf(rows: readonly AttentionRow[]): Tally {
  const owed = rows.filter((row) => row.reason.owed !== null)
  return {
    safety: rows.filter((row) => row.safety).length,
    owed: owed.length,
    late: owed.filter((row) => (row.reason.owed?.lateMs ?? 0) > 0).length,
    stopped: rows.filter((row) => row.reason.owed === null).length,
    parties: [...new Set(owed.map((row) => row.reason.owed?.party ?? ''))].filter((p) => p !== ''),
  }
}

// ============================================================================ a coded reason, in words

/** One coded clause in words. Every code the table declares has its sentence here. */
export function codedReasonWords(reason: CodedReason, kind: string): string {
  switch (reason.code) {
    case 'stoppedShort':
      return t('homeWords.reason.stoppedShort', { state: shownState(reason.values.state, kind) })
    case 'pauseElapsed':
      return t('homeWords.reason.pauseElapsed', { since: reason.values.since, until: reason.values.until })
    case 'doneDisagrees':
      return t('homeWords.reason.doneDisagrees')
    default: {
      const unhandled: never = reason
      throw new Error(`an attention reason carries the code ${JSON.stringify(unhandled)}, which this page does not draw`)
    }
  }
}
// ============================================================================ the questions

/**
 * What the paused group says about itself: the exact split, in the product's own words.
 *
 * Every standing that has any records in it is named with its count and the sentence from
 * `PAUSE_STANDING_SENTENCES`, so "6 paused" never stands on its own. The three that matter most
 * are the three answers `pauseElapsed` can give, and they are three different things to do:
 * renew the decision, wait, or go and write down what would end it.
 */
function pauseSplitSentence(holdingByStanding: AttentionQuestions['paused']['holdingByStanding']): string {
  const parts: string[] = []
  for (const { standing, count } of holdingByStanding) parts.push(t('home.pauseCount', { n: count, standing: PAUSE_STANDING_SENTENCES[standing] }))
  // CLAUSES OF ONE SENTENCE, joined in the page's language: "; " or "；" (clausesJoined).
  return clausesJoined(parts)
}

/**
 * The paused records that are ALSO on the attention list, named, under the health strip.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY THOSE RECORDS ARE NOT COUNTED IN THE STRIP
 * ---------------------------------------------------------------------------------------
 *
 * `DataHealth` prints one sentence about itself, from `DATA_HEALTH_LEAD` in ui.tsx: "None of these
 * is on the attention list. Each one is a question about what a record says, not a verdict about
 * the work." That is the whole meaning of the strip, and it has to stay true.
 *
 * Since a pause that has run past its date now goes ON the attention list, such a record is no
 * longer a question — it is work. So it is not counted in the strip, and this line says exactly how
 * many were moved, where they went and why. The arithmetic is stated both ways round: the group
 * says how many are still holding, and this says how many of the total are not in it.
 *
 * A pause that is on the list because somebody OUTSIDE is waiting lands here too, and it always
 * could have: a pause is a decision about your own plans, not about somebody else's promise.
 */
function PausedAndListed({ rows, total }: { rows: readonly PausedOnTheList[]; total: number }) {
  if (rows.length === 0) return null
  const many = rows.length !== 1
  return (
    <div className="att-questions-note">
      {/* THE CORRECTION ITSELF STAYS OUT IN THE OPEN, and only the correction. A count that has had
          something taken out of it has to say so where the count is read, and that is one clause.
          WHICH records were taken out, and why a pause stops being a question at all, are the
          explanation — behind the press, named and counted, exactly like every other fold here. */}
      <Explain declares={{ surface: 'home.needs.pauses' }}
        meaning={
          <Counted as="span" firstStrong text={t('home.pausedElsewhere', { n: rows.length, total })} />
        }
        opens={t('home.pausesOpens')}
        holds={{ count: rows.length, what: t('home.pausesOpenable', { n: rows.length }) }}
      >
        <p className="att-questions-which">
          {rows.map((row, index) => (
            <span key={row.key}>
              {index === 0 ? null : t('sentence.listGap')}
              <a className="px-nav" href={`#${recordPath(row.recordId, row.recordKind)}`}>
                {content(row.title)}
              </a>
            </span>
          ))}
        </p>
        <p className="att-questions-why">
          {t('home.pauseNoLongerHolds')}
        </p>
      </Explain>
    </div>
  )
}

/**
 * THREE COUNTS THAT ARE QUESTIONS RATHER THAN WORK, AND ARE NOT ON THE ATTENTION LIST.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A STRIP OF COUNTS AND NOT THREE OPEN LISTS ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * It used to be a full panel of three open sections directly under the ranked list: 6 paused rows
 * with their reasons, a paragraph about unclassified words, and a paragraph splitting 97 records
 * with no state three ways. On the seed that is about half of the home page, and every pixel of it
 * answers "what is untidy about my database" rather than "what will go wrong today". Those are
 * different questions and only one of them is what this page is for.
 *
 * So the three become three exact counts in the shared `DataHealth` strip, each opening in place
 * onto the whole list behind it. NOTHING IS DELETED and nothing is shortened: every row, every
 * sentence and every route that was here is one press away, and each count is exact.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE THREE ARE STILL THREE
 * ---------------------------------------------------------------------------------------
 *
 *   PAUSED — somebody decided to put it down, and said why. Not a failure. A pause whose date has
 *            PASSED is now on the attention list rather than here, because that decision expired;
 *            this group still counts it and says so, so a reader never sees it as put down when
 *            nothing is holding it any more.
 *
 *   NOT CLASSIFIED — the record has a state word and nobody has ever said what that word MEANS.
 *            A question, never a verdict. Most are words the schema itself publishes.
 *
 *   NO STATE AT ALL — a third thing again, splitting three ways: the kind carries a state and none
 *            was written, the kind has no state field, or Mole Office does not know the kind.
 */
export function QuestionsPanel({ questions, headed = true }: {
  questions: AttentionQuestions
  /** False on the page of its own name, whose h1 already says these words. */
  headed?: boolean
}) {
  const { paused, unclassified, noState } = questions
  // A pause that is on the attention list is not a question any more, it is work. It is counted
  // and named under the strip instead — see `PausedAndListed` — so the strip's own sentence about
  // itself, "none of these is on the attention list", stays true of every group in it.
  //
  // THE ROWS OF EACH GROUP ARE READ WHEN ITS FOLD IS OPENED, a page at a time (`PartRows`), and not
  // with the page. Until round 19 of wave 13w they came with the whole attention answer and every one
  // was mounted inside the closed folds: about 30,000 rows on an office of the owner's size, which
  // froze Home. The counts and the sentences come from the first page, worked out on the server.
  const groups: HealthGroup[] = [
    {
      label: t('home.pausesLabel'),
      count: paused.holding,
      note:
        t('home.pauseMeaning') + t('home.pauseSplit', { total: paused.total, n: paused.holding, which: pauseSplitSentence(paused.holdingByStanding) }),
      detail: <PartRows part="paused" drawAll={(rows) => <HoldingRows rows={rows} />} />,
    },
    {
      label: t('home.unclassifiedLabel'),
      count: unclassified.count,
      note:
        t('home.unclassifiedMeaning', { words: unclassified.words.map(({ word, count }) => `${count} × “${content(word)}”`).join(', ') }),
      href: '#/records',
      linkText: t('home.recordsArchive', { n: unclassified.count }),
      detail: (
        <PartRows
          part="unclassified"
          drawAll={(rows) => <UnclassifiedRows rows={rows} />}
        />
      ),
    },
    {
      label: t('home.noStateLabel'),
      count: noState.count,
      note:
        t('home.noStateMeaning', { written: noState.written, noField: noState.noField, unknown: noState.unknownKind }),
      href: '#/records',
      linkText: t('home.recordsArchive', { n: noState.count }),
      detail: (
        <PartRows
          part="noState"
          drawAll={(rows) =>
            rows.map((row) => (
              <Row
                key={row.key}
                sev={<NoStateMark expected={row.expected} />}
                leading={<Tag kind={row.recordKind} />}
                title={content(row.title)}
                meta={row.note}
                href={`#${recordPath(row.recordId, row.recordKind)}`}
                target={{ kind: 'record', recordId: row.recordId, workspaceId: currentWorkspace() }}
              />
            ))
          }
        />
      ),
    },
  ]

  return (
    <>
      <style href="mole-office-attention" precedence="default">
        {ATTENTION_CSS}
      </style>
      <section className="att-questions">
        {/* The heading IS the strip's own sentence, in four words, forty pixels above it — so the
            strip does not print it as well. `leadSaidAbove` is how it is told, rather than this
            page working around a constant it cannot see. */}
        {/* Plain words for what this strip is: three questions about what the records SAY, which is
            not the same as work that needs doing. "Not a verdict" was the internal way of putting
            it and needed the rest of the file to make sense. */}
        {headed ? <h2 className="att-questions-head">{t('home.questions')}</h2> : null}
        <DataHealth what={t('home.recordsWord')} groups={groups} leadSaidAbove />
        <PausedAndListed rows={paused.onList} total={paused.total} />
      </section>
    </>
  )
}

/**
 * ONE LIST BEHIND A FOLD, READ A PAGE AT A TIME FROM THE MOMENT THE FOLD IS OPENED.
 *
 * Mounted only while its fold is open (`DataHealth` and the read reports' fold draw their detail only
 * then), so nothing here is asked for on load. It reads the first page when it mounts, and the next one
 * when the reader presses for more. The count beside the button is the list's total as the server
 * gave it with the last page, which can be newer than the count on the fold.
 */
export function PartRows<P extends AttentionPart>({
  part,
  drawAll,
}: {
  part: P
  drawAll: (rows: readonly AttentionPartRow[P][]) => ReactNode
}) {
  const [rows, setRows] = useState<AttentionPartRow[P][]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [from, setFrom] = useState(0)
  const [tries, setTries] = useState(0)
  const [state, setState] = useState<{ status: 'reading' } | { status: 'ready' } | { status: 'error'; message: string }>({ status: 'reading' })
  useEffect(() => {
    let live = true
    setState({ status: 'reading' })
    api.attentionPart(part, from).then(
      (page) => {
        if (!live) return
        setRows((had) => [...had.slice(0, from), ...page.rows])
        setTotal(page.total)
        setState({ status: 'ready' })
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', message: errorMessage(error) })
      },
    )
    return () => {
      live = false
    }
  }, [part, from, tries])
  const left = total === null ? 0 : Math.max(0, total - rows.length)
  return (
    <div className="att-q-rows" data-part={part}>
      {drawAll(rows)}
      {state.status === 'reading' ? <p className="att-q-more">{t('w13w.part.reading')}</p> : null}
      {state.status === 'error' ? (
        <ErrorNote message={`${t('w13w.part.failed')} ${state.message}`} retry={() => setTries((n) => n + 1)} />
      ) : null}
      {state.status === 'ready' && total !== null && left > 0 ? (
        <p className="att-q-more">
          {t('w13w.part.shown', { n: rows.length, total })}{' '}
          <Btn onClick={() => setFrom(rows.length)}>{t('w13w.part.more', { n: Math.min(left, ATTENTION_PART_ROWS) })}</Btn>
        </p>
      ) : null}
    </div>
  )
}

/** The rows behind the unclassified fold, once it is opened and their page has come. */
export function UnclassifiedRows({ rows }: { rows: readonly AttentionPartRow['unclassified'][] }) {
  return rows.map((row) => (
    <Row
      key={row.key}
      sev={<UnclassifiedMark state={row.state} note={row.note} />}
      leading={<Tag kind={row.recordKind} />}
      title={content(row.title)}
      meta={row.note}
      href={`#${recordPath(row.recordId, row.recordKind)}`}
      target={{ kind: 'record', recordId: row.recordId, workspaceId: currentWorkspace() }}
    />
  ))
}

/** The paused records still holding, with the record each waits on named. */
function HoldingRows({ rows }: { rows: readonly PausedRow[] }) {
  // THE TITLES OF THE RECORDS A PAUSE WAITS ON, asked by id for the rows on screen.
  const titles = useRecordTitles(rows.flatMap((row) => (row.pause?.until?.recordId === undefined ? [] : [row.pause.until.recordId])))
  return <PausedRows rows={rows} titleOf={(id) => titles[id] ?? null} />
}

/** The paused rows as drawn, given what each record a pause waits on is called. */
export function PausedRows({ rows, titleOf }: { rows: readonly PausedRow[]; titleOf: TitleOf }) {
  return rows.map((row) => (
    <Row
      key={row.key}
      sev={<PauseMark pause={row.pause} dueToResume={row.dueToResume} />}
      leading={<Tag kind={row.recordKind} />}
      title={content(row.title)}
      meta={
        <span className="att-meta">
          <span className="att-meta-one">{row.note}</span>
          <ResumeRecord recordId={row.pause?.until?.recordId} titleOf={titleOf} />
          {/* Nothing here says "and it is on the list too". A row that is on the attention
              list is not in this group at all — it is named under the strip by
              `PausedAndListed`, with the count both ways round. */}
          {/* The three answers `pauseElapsed` gives, said in the product's own words on the
              row itself. Without this an open-ended pause and one whose date is still ahead
              look identical, and one of them is a decision nobody can ever act on. */}
          <span className="att-meta-one att-standing">
            {t('home.pauseReading', { standing: PAUSE_STANDING_SENTENCES[row.standing] })}
          </span>
        </span>
      }
      href={`#${recordPath(row.recordId, row.recordKind)}`}
      target={{ kind: 'record', recordId: row.recordId, workspaceId: currentWorkspace() }}
    />
  ))
}

/**
 * The record a pause is waiting on, by name, beside the server's sentence.
 *
 * Nothing is drawn when there is no such record. When there is one and this page did not fetch
 * its title, that is said — an id with no name is still better than a name Mole Office invented.
 */
function ResumeRecord({ recordId, titleOf }: { recordId: string | undefined; titleOf: TitleOf | undefined }) {
  if (recordId === undefined) return null
  const title = titleOf?.(recordId) ?? null
  return (
    <span className="att-meta-one">
      {t('home.thatRecord')}{' '}
      <a className="px-nav" href={`#${recordPath(recordId)}`}>
        {title === null ? recordId : content(title)}
      </a>
      {title === null ? t('home.recordTitleMissing') : '.'}
    </span>
  )
}

// ============================================================================ reports

/**
 * HOW MANY REPORTS THE HOME PAGE DRAWS, AND WHICH. Worked out in src/shared/attention-first-page.ts,
 * where the server picks the five Home is sent; exported here as well so the checks of the cap and
 * the order read it from the panel that draws it.
 */
export { REPORTS_SHOWN, newestReports }

/**
 * REPORTS WRITTEN FOR A PERSON, AND WHETHER THAT PERSON HAS READ THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A BAND OF ITS OWN AND NOT A ROW IN THE RANKED LIST
 * ---------------------------------------------------------------------------------------
 *
 * A report is not work. It cannot be late, nothing is blocked by it, and it carries no state word,
 * so the ranked list above has nothing to weigh it with — putting one in there would mean inventing
 * an urgency the record does not have. What a report IS is a person still waiting, and this product
 * already has a colour for that: `--ask`, the hue that means somebody is waiting on a person. It is
 * spent here for the same reason it is spent on the decision band, and nowhere else on this panel.
 *
 * The band sits between the decisions and the ranked list because that is the reading order of the
 * two claims: only you can settle a fork, only you can read something written for you, and then
 * comes everything that is late or stuck.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN, AND WHAT IS NOT GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * Every row says its title, the day it is about, who it is for, and where it stands with its
 * reader — and the three answers to that last question are kept apart. "read" and "unread" are
 * statements somebody made. NOBODY HAS SAID is the third answer, it is the common one, and it is
 * never printed as "unread": one is a gap in the record and the other is a claim about a person.
 * The sentence on every row is `row.note`, written by the rule in src/shared/attention.ts, so this
 * band and a module's page cannot word one situation two ways.
 *
 * A REPORT THAT HAS BEEN READ STOPS ASKING and does not disappear: it is counted in the head, and
 * the reports page lists it. Home no longer folds the read ones open in place.
 * So the press to that page is drawn whenever anything is not listed here.
 */
export function ReportsForYou({ reply, onMarkedRead }: { reply: Pick<AttentionHome, 'reports' | 'reportCounts'>; onMarkedRead: () => void }) {
 // THE FIVE WAITING REPORTS ARE SENT WHOLE; the rest are counts.
 const { waiting, read } = reply.reportCounts
 const waitingShown = reply.reports
 const waitingHidden = waiting - waitingShown.length
 return <><style href="mole-office-attention" precedence="default">{ATTENTION_CSS}</style>
  <Panel titleIs="label" declares={{ surface: 'home.reports' }} title={t('home.reports')} rank={waiting === 0 ? 1 : 0} tone="ask" actions={<span className="att-count"><Hint label={t('home.reportAbout')}><p>{t('home.reportMeaning')}</p></Hint> {waiting + read === 0 ? null : <>{t('home.toRead', { n: waiting })}{read === 0 ? null : ` · ${t('home.alreadyRead', { n: read })}`}</>}</span>}>
   {waiting + read === 0 ? <Absence title={t('home.noReports')} /> : null}
   {/* ON HOME THE PRESS "I HAVE READ THIS" SAYS NOBODY HAS MARKED THE REPORT, so the row draws no mark for it. */}
   {waitingShown.length === 0 ? null : <ul className="att-rep-list">{waitingShown.map(row => <ReportLine key={row.key} row={row} onMarkedRead={onMarkedRead} marksNobodySaid={false} />)}</ul>}
   {waitingHidden <= 0 ? null : <p className="att-rep-more" aria-label={t('home.reportsShown', { n: waitingShown.length, total: waiting })}><Counted text={t('home.reportsShown', { n: waitingShown.length, total: waiting })} /> · {t('home.reportsHidden', { n: waitingHidden })} · <a href={`#${familyPath('notes')}`}>{t('home.allReports')}</a></p>}
   {waitingHidden > 0 || read === 0 ? null : <p className="att-rep-more"><a href={`#${familyPath('notes')}`}>{t('home.allReports')}</a></p>}
  </Panel>
 </>
}

/**
 * One report: what it is, where it stands with its reader, and the press.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SENTENCE UNDER THE TITLE IS GONE, AND WHAT REPLACED IT
 * ---------------------------------------------------------------------------------------
 *
 * MEASURED ON HOME, 16 August 2026: each of these rows drew a 39-word paragraph inside a bordered
 * box on a second background — "Nobody has said whether it has been read, which is not the same as
 * saying it is unread. It is written for <name>… It is about 2026-08-16." — set at 14px in the full
 * text colour, with the button that resolves it on the row above. That box gave
 * the absence more weight than the title above it.
 *
 * THE RULE IT BROKE is in docs/UX-CONTRACT.md: an absence has almost no visual weight unless the
 * absence itself requires action. Nobody having said whether a report was read is an absence one
 * press closes, and the press is on the row — so the absence needs a word, not a paragraph.
 *
 * WHAT IS DRAWN NOW. The head line carries the title, the day it is about, a small mark saying
 * where it stands with its reader, and the press. Under it, one quiet line saying what the report
 * is about. The rule's whole sentence is still written by src/shared/attention.ts, is still the
 * only wording of it, and is on the mark's tooltip and in Developer mode — nothing is destroyed.
 *
 * THE THREE READ ANSWERS ARE STILL THREE. "Nobody has said" takes the dashed mark that means a gap
 * somebody can close; "unread" is a statement somebody made and is drawn as a plain word; "read"
 * draws nothing here because those rows sit under a fold that already says they were marked read.
 * Collapsing the first two into one drawing would be the fifth invariant broken to save two words.
 * Home's band leaves the "nobody has said" mark out with `marksNobodySaid={false}`, because the press
 * beside it says the same; a module's page draws it.
 */
export function ReportLine({ row, onMarkedRead, marksNobodySaid = true }: { row: ReportRow; onMarkedRead: () => void; marksNobodySaid?: boolean }) {
  const inspect = useInspect()
  return (
    <li className="att-rep">
      {/* THE ROW SHIPS ITS OWN GEOMETRY, because it is drawn on two pages and only one of them
          renders the attention panel. React 19 hoists this into the head and de-duplicates it by
          href, so Home gets one style element and a module page gets the same one. Without it the
          module page drew these rows with no rules at all. */}
      <style href="mole-office-attention" precedence="default">
        {ATTENTION_CSS}
      </style>
      <div className="att-rep-head">
        <a className="px-nav att-rep-title" href={`#${recordPath(row.recordId)}`}>
          {content(row.title)}
        </a>
        {/* The day the report is ABOUT, which is not the day it was filed. Said in those words, so
            a reader never reads it as "written on". Absent is drawn as absent. The day is written in
            the page's language by `formatDue`, the one reader of a stored day; it used to be the
            stored "2026-09-29" as it came. */}
        <span className="att-rep-date">
          {row.date === null ? <Absence title={t('home.noReportDate')} /> : t('home.aboutDate', { date: formatDue(row.date) })}
        </span>
        <ReportReadMark row={row} marksNobodySaid={marksNobodySaid} />
        {/* HOW IT GOT HERE. In normal mode only where it is an exception — a made-up example has to
            be legible as one wherever it is drawn — and in full in Developer, which is where the
            rest of the storage model lives. The sentence that says what an unmarked row means is
            drawn once for the page by the panel below this band. */}
        <OriginMark record={{ origin: row.origin }} only={inspect ? 'every' : 'exceptions'} />
        {row.waiting ? <MarkRead row={row} onMarkedRead={onMarkedRead} /> : null}
      </div>
      {/* WHAT THE REPORT IS ABOUT, AND HOW MUCH OF IT THERE IS, IN DEVELOPER MODE.
          docs/UX-CONTRACT.md: a list row exists to help somebody find the thing — a clear title,
          a small state where that helps, a warning where somebody must act, and then stop. Measured
          on Home with the real corpus, these subject links ran to three wrapped lines of record
          titles per row and the row was 205px tall. Every one of them is on the report's own page,
          which is one press away on the title. */}
      {inspect ? (
        <p className="att-rep-about">
          {row.about.length === 0 ? (
            <Absence
              word={t('home.noReportSubject')}
              title={t('home.noReportSubjectWhy')}
            />
          ) : (
            <>
              {t('home.reportAboutLabel')}{' '}
              {row.about.map((subject, index) => (
                <span key={subject.recordId}>
                  {index === 0 ? null : t('sentence.listGap')}
                  <a className="px-nav" href={`#${recordPath(subject.recordId)}`}>
                    {content(subject.title)}
                  </a>
                </span>
              ))}
              {/* THE SENTENCE ENDS IN THE PAGE'S LANGUAGE ("." or "。"), from the one sentence end (endOfSentence). */}
              {endOfSentence()}
            </>
          )}{' '}
          {/* THE ROW'S SENTENCE IN THE PAGE'S LANGUAGE (wave 13k round 34): `row.note` is the API's English. */}
          {reportNoteOnAPage(row, t, formatDue)}{' '}
          {/* AN EMPTY REPORT IS SAID ONCE, by the row's sentence before this (round 124, item 61). */}
          {row.blocks === 0 ? null : t('home.reportBlocks', { n: row.blocks })}
        </p>
      ) : null}
    </li>
  )
}

/**
 * WHERE THIS REPORT STANDS WITH ITS READER, in as little ink as the answer needs.
 *
 * Three answers and three drawings, and the words are the rule's own: `row.note` is written in
 * src/shared/attention.ts so that this band and a module's page cannot word one situation two ways.
 * What this component chooses is how much of that wording is DRAWN, which is a question about
 * weight rather than about truth.
 */
function ReportReadMark({ row, marksNobodySaid }: { row: ReportRow; marksNobodySaid: boolean }) {
  // Already read. The rows this can happen on sit inside a fold whose own summary says "2 reports
  // you have marked read", so a mark here would be the same fact twice on one screen.
  if (row.read === 'read') return null
  // Somebody wrote "unread". That is a statement, not a gap, so it takes no absence drawing at all
  // — a dashed edge would say nobody had looked, and somebody did.
  if (row.read === 'unread') return <span className="att-rep-unread">{t('home.reportUnread')}</span>
  // Nobody has said. `looked={false}` is what draws the dashed edge that means exactly that, and
  // the whole sentence rides on the tooltip. Where the press beside it says it, nothing is drawn.
  if (!marksNobodySaid) return null
  return <Absence tier="told-apart" looked={false} word={t('home.notMarkedRead')} title={t('home.reportReadUnknown')} />
}

/**
 * SAY YOU HAVE READ IT. One press, one stored fact, and a sentence saying what was recorded.
 *
 * ONLY A PERSON MAY, and the rule is `mayMarkReportRead` in src/shared/attention.ts rather than a
 * comparison written here — the same function the write path should be calling. See its docstring:
 * the server does not call it yet, so today this is a refusal the browser makes and not a
 * guarantee the product makes. That is said in the refusal itself rather than left to be found.
 *
 * IT IS THE PLAN'S PATTERN. `markPlanRead` refuses an agent and refuses a request that named
 * nobody, because "I have read this" is a claim about somebody's eyes and nobody else can make it.
 * The plan's door also lets a secretary mark a plan for the person under their grant, and names the
 * secretary; a report has no such way.
 *
 * IT SHIPS ITS OWN GEOMETRY, for the reason the row above gives: it is drawn on three surfaces now
 * — Home, a module's page, and the report's own page — and only one of them renders anything else
 * from this file. React 19 hoists the style by href and de-duplicates it, so this is still one
 * style element on a page that draws twenty of these.
 */
export function MarkRead({ row, onMarkedRead }: { row: ReportRow; onMarkedRead: () => void }) {
  const actor = getActor()
  const inspect = useInspect()
  const [state, setState] = useState<
    { status: 'idle' } | { status: 'writing' } | { status: 'done'; said: string } | { status: 'failed'; message: string }
  >({ status: 'idle' })

  const geometry = (
    <style href="mole-office-attention" precedence="default">
      {ATTENTION_CSS}
    </style>
  )

  if (!mayMarkReportRead(actor)) {
    return (
      <span className="att-rep-refused">
        {geometry}
        {inspect ? t('home.refusalInspector', { type: actor.type, id: actor.id }) : t('home.reportReadRefused')}
      </span>
    )
  }

  if (state.status === 'done')
    return (
      <span className="att-rep-said">
        {geometry}
        {state.said}
      </span>
    )

  const press = () => {
    setState({ status: 'writing' })
    void api
      .updateRecord(row.recordId, { dataPatch: { read: 'read' } })
      .then(() => {
        // WHAT WAS RECORDED, IN THE WORDS OF THE FIELD THAT NOW HOLDS IT. Not "done" and not a
        // tick: a press that will not say what it wrote is a press a reader has to go and check.
        //
        // THIS SENTENCE IS THE SHORT-LIVED HALF, AND SAYING SO HERE IS THE POINT. `onMarkedRead`
        // reads the project again, the band redraws, and this row moves out of the waiting list —
        // so what the reader is left with is the row's own note, "Somebody has marked this read, so
        // it is not waiting on anybody", written by the rule from the field that now holds it.
        // That is the durable statement; this one covers the moment before the answer comes back.
        setState({ status: 'done', said: t('home.reportReadDone') })
        onMarkedRead()
      })
      .catch((err: unknown) => {
        setState({ status: 'failed', message: errorMessage(err) })
      })
  }

  return (
    <span className="att-rep-press">
      {geometry}
      <Btn size="sm" variant="ask" pending={state.status === 'writing'} pendingFailed={state.status === 'failed'} onClick={press}>
        {t('home.iHaveRead')}
      </Btn>
      {state.status === 'failed' ? (
        <span className="att-rep-failed">{t('home.reportReadFailed')}</span>
      ) : null}
    </span>
  )
}

// ============================================================================ styles

/**
 * This block's own geometry.
 *
 * Every value is a token from src/web/tokens.css, so a preset swap reaches all of it. React 19
 * hoists a `<style href precedence>` into the head and de-duplicates it by href, so this is one
 * style element however many times the page renders.
 *
 * TWO RULES HERE COME FROM docs/CATALOGUE.md §14 AND ARE ABOUT MIXED SCRIPT, not about taste:
 * line height 1.72 on anything that can hold Chinese, and no uppercase or letter-spacing on any
 * label that can. OCR 与二值化 in small caps with tracking is unreadable, and record titles here are
 * routinely half Chinese.
 */
export const ATTENTION_CSS = `
.att-count {
  color: var(--text-2);
  font: var(--fs-2)/var(--lh-tight) var(--font-ui);
  font-variant-numeric: tabular-nums;
}
.att-count b { color: var(--text); font-weight: 700; }

.att-meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
/* Prose stops at a measure. A pause reason set across 1,100px of desk is one line the eye has to
   track back across, and docs/CATALOGUE.md §14 rules out sizing the box in character units,
   because a line of Chinese and a line of English do not hold the same number of them. */
.att-meta-one { min-width: 0; max-width: var(--measure-in-box); line-height: 1.72; overflow-wrap: break-word; }
.att-meta-one b { color: var(--text); font-weight: 700; }
/* What Mole Office can and cannot say about one pause. Quieter than the server's own sentence above it,
   because it is this product describing its own reading rather than quoting the author. */
.att-standing { color: var(--text-3); font-size: var(--fs-1); }

/* ---- the three questions, now a strip of counts rather than three open lists.
   The strip itself is DataHealth from ui.tsx and brings its own box, so all that is left here is
   the block's name above it and the geometry of the lists that open inside a count.
   NO BACKTICKS IN THIS BLOCK. It is a template literal, so one closes the string and the file
   stops parsing — which has happened three times in this repository in one afternoon. */
.att-questions { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.att-questions-head {
  margin: 0;
  color: var(--text-2);
  font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui);
}
/* The correction to the strip's own sentence: which paused records are NOT counted in it, and
   why. The CORRECTION is outside the fold on purpose — a count that has had something taken out of
   it has to say so where the count is read, not one press behind it. What is behind the press is
   which records and why, which is explanation and reads like it. */
.att-questions-note { min-width: 0; }
.att-questions-note b { color: var(--text); font-variant-numeric: tabular-nums; }
.att-questions-which, .att-questions-why {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text-2);
  font: var(--fs-2)/1.72 var(--font-ui);
  overflow-wrap: break-word;
}
.att-questions-why { color: var(--text-3); font-size: var(--fs-1); }
/* The rows behind a count. Full-bleed inside the opened group, and separated from the group's own
   sentence above them rather than running straight on from it. */
.att-q-rows { margin-top: 4px; display: flex; flex-direction: column; min-width: 0; }

/* ---- REPORTS WRITTEN FOR A PERSON.
   Two visible lines per row and a fold. Nothing here carries a hue: the band's Panel is what
   carries --ask, and the design contract allows one urgency channel per object. NO BACKTICKS IN
   THIS BLOCK -- it is a template literal. */
.att-rep-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--gut); }
.att-rep { min-width: 0; padding: var(--gut) 0 0; border-top: var(--border-w) solid var(--border); }
.att-rep-list > .att-rep:first-child { border-top: 0; padding-top: 0; }
/* The title, the day and the press on one line, wrapping to their own lines on a phone rather than
   squeezing a Chinese title into four characters a line. */
.att-rep-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--gut); min-width: 0; }
.att-rep-title { font: 600 var(--fs-3)/1.72 var(--font-ui); min-width: 0; overflow-wrap: break-word; }
.att-rep-date {
  color: var(--text-2);
  font: var(--fs-2)/var(--lh-tight) var(--font-ui);
  font-variant-numeric: tabular-nums;
}
/* The press sits at the end of the line on a desk and drops under the title on a phone. */
.att-rep-press { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.att-rep-said, .att-rep-refused, .att-rep-failed {
  color: var(--text-2);
  font: var(--fs-2)/1.72 var(--font-ui);
  max-width: var(--measure-in-box);
  overflow-wrap: break-word;
}
.att-rep-failed { color: var(--st-failed); }
.att-rep-note { color: var(--text-2); font: var(--fs-2)/1.72 var(--font-ui); overflow-wrap: break-word; }
/* SOMEBODY SAID THIS IS UNREAD. A statement, so it is drawn as a plain quiet word with no
   enclosure at all -- the dashed enclosure next to it means nobody has said, and the two must not
   look alike. Same size and ink as the day beside it, because they are two small facts about the
   same row and neither is louder than the other. */
.att-rep-unread { color: var(--text-2); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
.att-rep-about, .att-rep-size {
  margin: 0 0 4px;
  max-width: var(--measure-in-box);
  color: var(--text-2);
  font: var(--fs-2)/1.72 var(--font-ui);
  overflow-wrap: break-word;
}
@media (max-width: 480px) {
  .att-rep-press { margin-left: 0; }
}
`
