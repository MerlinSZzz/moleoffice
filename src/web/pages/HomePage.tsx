// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import {OfficePauseNotice} from '../components/OfficePauseControls.tsx'
import { ProgressCard } from '../components/ProgressCard.tsx'
import { Counted } from '../components/home/Counted.tsx'
import { count, t, content, dayInThePageLanguage, writtenDay } from '@shared/i18n.ts'
import { readDayKey } from '@shared/planning.ts'
import { wordWithSpacedValues } from '@shared/spacing.ts'
/**
 * Home is about all projects: the line under its title says so, and its sidebar row carries the
 * `everyProject` mark, so the top bar names no project over it. Needs you, Late or stuck, Agents at
 * work and Today read every project. Reports for you reads the selected project and names it.
 * Normal mode shows reading words; developer mode keeps the source details. The reading mark is
 * shared across the person’s devices. See 7FEOshq3mBGG and two decisions.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stateWord } from '@shared/words.ts'
import { HomeProjects, ProjectTag } from '../components/home/ProjectTag.tsx'
import { HomeSections } from '../components/home/HomeSections.tsx'
import { HomeWeek, useTheWeek } from '../components/home/HomeWeek.tsx'
import { pipelineLine, standsStill } from '../components/home/pipeline-line.ts'
import { pipelinePosition } from '@shared/blocks.ts'
import type { Change, ItemState, PanelRecord } from '@shared/types.ts'
import { progressOf } from '@shared/work.ts'
import {
  api,
  errorMessage,
  type AnchorReading,
  type AttentionHome,
  type ChangeSession,
  type ClaimsReply,
  type TodayReply,
  type WorkListReply,
} from '../api.ts'
/**
 * The two planning shapes the day band reads, IMPORTED from the server's own declarations rather
 * than restated, exactly as src/web/api.ts does it and for the same reason. Type-only, so the
 * import is erased at build and no server code reaches the browser bundle.
 */
import type { PlanReply } from '../../server/api/planning.ts'
import type { AllocationWithWork } from '../../server/lib/planning.ts'
import type { Rung } from '@shared/detail.ts'
/** The list of projects, for the same reason: one declaration, read by the frame and by this page. */
import type { WorkspacesReply } from '../../server/api/workspaces.ts'
import {
  ReportsForYou,
} from '../components/AttentionPanel.tsx'
import { DecisionQueue } from '../components/DecisionQueue.tsx'
import { ResidentProposals } from '../components/ResidentProposals.tsx'
// The one reading's shape, for the prop above. Type-only: this page draws the number through the
// band and never works one out.
import type { WaitingReply } from '../lib/waiting.ts'
import { ChangeBody, changeVerb as verbOf, type RecordTitles } from '../components/ChangeLog.tsx'
import { hoursNotSaid } from '../components/Planning.tsx'
import type { SessionsLineRead } from '../components/home/sessions-line.ts'
import { RouteLink, pathFor, planTodayPath, recordPath } from '../components/router.tsx'
// ONE STRING PER PAGE. `pageTitle` reads the rail row's own words out of `DESTINATIONS`, so a link
// from this page to another one cannot end up calling it something the navigation does not.
import { pageTitle } from '../components/Sidebar.tsx'
import { RAIL_WORD_KEYS } from '@shared/surfaces.ts'
import { useInspect, useMode } from '../lib/mode.ts'
import { useDetail } from '../lib/detailchoice.ts'
// THE DOORS THIS PAGE AND THE FRAME BOTH NEED, ASKED ONCE. See the module for why one answer for
// the whole page is the only way the two cannot be two clocks.
import { hurryTheAttentionHomeAsk, readWorkspacesOnce, oneRead } from '../lib/oneread.ts'
import { useSharedRead } from '../lib/homereads.ts'
import { wordsAt } from '@shared/detailsource.ts'
// EVERY STORED WORD REACHES A SCREEN THROUGH HERE. One reader, so a change row on this page and
// the same change row on the record page cannot describe one write two ways.
import { actorTypeWord } from '../lib/words.ts'
// THE ONE FUNCTION IN THE BROWSER THAT NAMES A PROJECT, aliased because this page passes a reader
// called `projectName` down as a prop and the two would shadow each other. Three places on this
// page drew a project's name without coming through it — the day rows, the line saying which
// project the bands below are about, and the buttons offering the projects that hold work — so
// Home printed the stored title while the sidebar printed a renamed one. See src/web/lib/projects.ts.
import { projectName as onScreen } from '../lib/projects.ts'
import { currentWorkspace, setWorkspace, workspaceOpenedNote, workspaceSight } from '../lib/workspace.ts'
import {
  Absence,
  Btn,
  ErrorNote,
  Explain,
  Loading,
  Panel,
  Row,
  ScanRow,
  ServerNote,
  StoredState,
  Tag,
  ageAlarm,
  useAsync,
  OriginMark,
  type AsyncState,
} from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { declaredAttributes, type Declares } from '../components/declares.ts'
import {
  anchorState,
  readPipelines,
  relativeToNow,
  type AnchorAnswer,
  type PipelineInfo,
  type RecordProblem,
} from '../lib/attention.ts'

// ---------------------------------------------------------------------------- constants

/**
 * Change rows asked of the anchor. Eight is enough for two days of agent work.
 *
 * `ALSO_ROWS` is how many are DRAWN, and it is smaller: the change log is one of three columns in
 * the "Also" strip now, not a panel of its own. The count is still asked for at eight so the lead
 * line above the rows can say how many there were before the cap.
 */
const ANCHOR_ROWS = 8

/**
 * The cap on every column in the "Also" strip. Three lists side by side, none taller than this.
 *
 * The number is the band's whole discipline. Home's bottom third was a masonry of five panels with
 * about 510px of dead page in it, because two blocks shared a row and the row was as tall as the
 * taller one; at 577px of column width a record title wrapped to seven lines of four words. Three
 * equal columns of at most five rows cannot do either.
 */
export const ALSO_ROWS = 5

/** "1 change" / "12 changes". Three words and one rule, written out rather than reached for. */
const plural = (n: number, word: 'step' | 'hour') => word === 'step' ? t('home.steps', { n }) : t('home.hours', { n })

// ---------------------------------------------------------------------------- since you looked

/**
 * THE ONE LINE THAT STANDS WHERE THE SERVER'S PARAGRAPH STOOD.
 *
 * The server writes a good paragraph for each of the three answers, with the counts and the stamp
 * in it, and at 1440 it was six lines of prose above eight change rows. Six lines to say that
 * nobody has marked a reading point is six lines a reader pays for on every visit. So the
 * paragraph moved behind one press — whole and unedited — and this is what stands in its place.
 *
 * THE HONESTY THAT MUST SURVIVE THE SHORTENING is the first answer. "No reading point recorded"
 * must never read as "nothing has changed", and the rows drawn under it are the newest writes in
 * the whole log rather than the ones you have not seen. Both halves of that are IN the line, not
 * behind the press: the line names what the rows are and says in the same breath what they are not.
 */
export function sinceLead(answer: AnchorAnswer, sinceAnchor: number | null, drawn: number): string {
  if (answer === 'never-looked') return drawn === 0 ? t('home.noWrites') : t('home.newestWrites', { n: drawn })
  return answer === 'nothing-since' ? t('home.noWritesSince') : t('home.writesSince', { n: sinceAnchor ?? 0 })
}

/** What the fold beside that line holds, named. The first answer needs two sentences, not one. */
export function sinceOpens(answer: AnchorAnswer): string {
 return answer === 'never-looked' ? t('home.readingPointWhy') : t('home.readingPointWhere')
}

// ---------------------------------------------------------------------------- many writes, one row

/**
 * WHY EIGHT CHANGE ROWS ARE NOT ALWAYS DRAWN AS EIGHT LINES.
 *
 * The server writes ONE ROW PER CHANGED FIELD. An agent that patches a module's state, its summary
 * and two checklist items in one request writes four rows, all with the same actor, the same
 * session, the same record and the same second — and drawn one by one they are four lines saying
 * four versions of the same sentence, which pushes three other writes off the block.
 *
 * So adjacent rows that match on all five fields below are drawn as one row, and the row says how
 * many it stands for. The five are stored, none is inferred, and the stamp is the server's own to
 * the second. One agent writing to two records in the same second is two records and stays two
 * rows; two writes a second apart are two stamps and stay two rows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE ROW SAYS: THE SAME SECOND, NEVER "ONE ACTION" (decision fR9Q3JgwclPn, option C of
 * proposal acsi4ZoHx6ZB)
 * ---------------------------------------------------------------------------------------
 *
 * The five fields cannot prove the rows were one action. With no session on the rows, two people
 * writing to one record, in one kind of change, in the same second, match all five. With a session,
 * one run's two requests in the same second match all five too. So the closed row says
 * "N writes, same second", and the note inside the fold says what the rows share and that this does
 * not prove one action. This was chosen over the two other options: leaving "one action" on
 * the row, and adding the writer's id to the key.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE KEY IS THE ACTOR'S KIND AND ITS SESSION, AND NOT THE ACTOR'S NAME
 * ---------------------------------------------------------------------------------------
 *
 * `actorId` is the field that would tell two writers apart, and this page may not read it.
 * tests/changes.test.ts asserts that exactly one component in src/web draws a change row, and its
 * signature for "draws a change row" is a `.tsx` file that reads BOTH the operation and
 * `actorId` — because a second renderer is what once put three different answers to "which session
 * wrote this" on three pages. That guard is right and it is not this file's to change.
 *
 * So the closed row never names a writer — it shows `agent` or `human`, which every row in the group
 * shares by construction — and each original inside the fold carries its own actor, drawn by the one
 * component that may draw it.
 *
 * NOTHING IS LOST AND THE ARITHMETIC IS EXACT. The count on the fold is the number of original
 * rows, every one of them is inside it, and each is drawn the way the record page's own history
 * draws it — the verb, the actor, the session and the values.
 */
export interface ChangeGroup {
  /** The newest row in the group. The closed row is drawn from this one. */
  head: Change
  /** Every original row, newest first, `head` included. Never empty. */
  rows: readonly Change[]
}

/** Are these two rows drawn as one? Five fields, all of them stored, none of them inferred. */
function sameWrite(a: Change, b: Change): boolean {
  return (
    a.recordId === b.recordId &&
    a.actorType === b.actorType &&
    a.sessionId === b.sessionId &&
    a.op === b.op &&
    a.at === b.at
  )
}

/**
 * The writes as the rows Home draws, in the order they arrived. Adjacent only: the log's order is the answer,
 * and gathering non-adjacent rows would reorder a list whose order is the thing it promises.
 */
export function groupChanges(rows: readonly Change[]): ChangeGroup[] {
  const groups: { head: Change; rows: Change[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last !== undefined && sameWrite(last.head, row)) {
      last.rows.push(row)
      continue
    }
    groups.push({ head: row, rows: [row] })
  }
  return groups
}

/**
 * The head of a stored field path: `parts[#p1].items[#i2].state` becomes `parts`.
 *
 * The whole path is the mechanics and it is behind the press, in the server's own spelling. What
 * a scan needs is which part of the record moved, and that is the first segment.
 */
function fieldHead(field: string): string {
  const cut = field.search(/[.[]/)
  return cut === -1 ? field : field.slice(0, cut)
}

/**
 * What one write was, in two or three words. NOT `changeVerb`, which is the mechanics.
 *
 * `changeVerb` prints `changed parts[#p1].items[#i2].state` and `linked (blocks)`, and both belong
 * in the fold: a path and a link type are what you read when you have decided this row matters.
 * This is what you read while deciding.
 */
export function changeGist(change: Change): string {
 if (change.op === 'update') return t('home.changedField', { field: change.field ? fieldHead(change.field) : t('home.recordItself') })
 if (change.op === 'link') return t('home.linked')
 if (change.op === 'unlink') return t('home.unlinked')
 return change.op === 'create' ? t('home.created') : t('home.deleted')
}

/** The same, for a whole action: every part of the record it touched, named once each. */
export function groupGist(group: ChangeGroup): string {
  if (group.rows.length === 1 || group.head.op !== 'update') return changeGist(group.head)
  const heads = [...new Set(group.rows.map((row) => (row.field ? fieldHead(row.field) : t('home.recordItself'))))]
  return t('home.changedField', { field: heads.join(', ') })
}

/**
 * ONE ROW, SCANNABLE CLOSED AND COMPLETE OPEN.
 *
 * Closed it is the three things this block is read for: WHO did it, WHAT they touched, and WHEN.
 * The mechanics — the exact field path, the link type in `linked (blocks)`, which session it was
 * attributed to, and the before-and-after values — are what the press opens, and they are drawn by
 * the same components the record page's history uses so that one write does not read two ways.
 */
export function ChangeRow({
  group,
  sessions,
  titles,
  titleOf,
  now,
}: {
  group: ChangeGroup
  sessions: readonly ChangeSession[]
  /** Names the record a `link` row points at, so the fold shows a title rather than an id. */
  titles: RecordTitles
  titleOf: (recordId: string) => string | null
  now: number
}) {
  const many = group.rows.length > 1
  const mode = useMode()
  // The reader's word for the stored actor type. See the tag below for why it is not printed raw.
  const who = actorTypeWord(group.head.actorType, 'normal')
  return (
    <ScanRow
      linkText={t('home.openRecord')}
      // NO SEVERITY COLUMN. A change has no severity, and the column that used to carry the actor
      // is fixed furniture: in the 373px track this block now lives in it took a fifth of the width
      // and put "agent" on a line of its own above every title. The actor is inline with the gist
      // instead, which is where it reads as one phrase — "agent · changed data".
      leading={
        <>
          {/* WHO WROTE IT, IN THE READER'S WORD AND NOT THE STORED ONE. This printed the actor
              type straight out of the column, so a row said "human" and another said "system" —
              two database values on the first panel of the front page. `actorTypeWord` answers
              "person" and "Mole Office", and it is the same reader who answers for the change log on
              the record page, so one write cannot be described two ways on two screens. Developer
              mode still shows the stored word, which is what the switch is for.

              A WORD AND NOT A COLOUR: who wrote it is one of the two answers that change what you
              do next, so it is text. The writer's NAME is on every original inside the fold and
              not here -- see the note on `sameWrite` for the guard that decides that. */}
          <Tag tone={group.head.actorType === 'agent' ? 'accent' : 'neutral'}>{who.text}</Tag>
          <span className="hp-gist">{mode === 'inspect' ? groupGist(group) : t('home.changedRecord')}</span>
          {/* HOW THE RECORD THIS ROW IS ABOUT GOT HERE. The change log is the first panel on this
              page, so it is read before any record — and a list of "X changed" where X may be
              furniture and may be the project's own history, with nothing saying which, leaves the
              reader unable to tell what the row is about. Null when the record is gone, which the
              mark says in words. */}
          <OriginMark record={group.head} only="exceptions" />
        </>
      }
      title={content(titleOfChange(group.head, titleOf(group.head.recordId), mode === 'inspect'))}
      age={mode === 'inspect' ? relativeToNow(group.head.at, now) : <time>{group.head.at}</time>}
      opens={mode === 'inspect' ? t(many ? 'home.changeWrites' : 'home.changeFields') : t('home.openChange')}
      // Only where the count means something. "1 write" on a row that stands for one write is
      // arithmetic about nothing; the count is here precisely because the row stands for more than
      // it says.
      //
      // A LOG ENTRY IS A "WRITE", and that name is not free choice: the lead line above these rows
      // says "8 newest writes in the log", it is protected copy, and one panel calling the same
      // thing two names is this repository's recurring defect said out loud. The row says "same
      // second", not "one action", because the key cannot prove one action (see above).
      {...(many ? { holds: { count: group.rows.length, what: t('home.writesOneSecond') } } : {})}
      href={`#${recordPath(group.head.recordId)}`}
      // THE ROW IS THE RECORD THAT WAS WRITTEN TO. The change log reads one project, which is
      // the project in the switcher, so that is the project the record is in.
      target={{ kind: 'record', recordId: group.head.recordId, workspaceId: currentWorkspace() }}
    >
      {mode === 'inspect' ? <>{many ? <p className="hp-note"><Counted text={t('home.writesTogether', { n: group.rows.length })} /></p> : null}<ul className="hp-raw">
        {group.rows.map(change => <li className="hp-raw-one" key={change.id}>
          <span className="hp-raw-verb">{verbOf(change)}</span>
          <ChangeBody change={change} sessions={sessions} titles={titles} />
        </li>)}
      </ul></> : <span>{t('home.changedRecord')}</span>}
    </ScanRow>
  )
}

/**
 * What changed while you were away — the brief's second question.
 *
 * THREE ANSWERS, AND COLLAPSING ANY PAIR IS A LIE. `anchorState` in lib/attention.ts names them:
 * nobody has ever marked a reading point, or there is one and nothing has been written since, or
 * there is one and here is what happened. An empty list drawn for the first reads as "nothing
 * happened", which is the one answer this product must never give by mistake — so the server
 * sends `changes: null` there rather than `[]`, and this keeps them apart.
 *
 * THE MARK IS ON THE SERVER AND IS MOVED BY A PRESS. It is keyed by the person, not the browser,
 * because the phone is always the second browser: a mark in local storage is one the phone could
 * never read and never move. And it only moves when somebody says they have read it — a mark that
 * moved on its own every time the page was opened would silently swallow a night of agent work.
 */
function SinceYouLooked({
  reading,
  newest,
  sessions,
  titles,
  titleOf,
  now,
  onMarked,
}: {
  reading: AnchorReading
  /** The newest rows in the whole log, for the case where there is no mark to measure against. */
  newest: readonly Change[]
  sessions: readonly ChangeSession[]
  /** Record id -> title, so a link row inside a fold names what it points at. */
  titles: RecordTitles
  /** Names the record a change row is about. A row that printed `record Fb1HoQRgLAi_` is a
   *  lookup key standing where a name belongs — the same defect the session column had. */
  titleOf: (recordId: string) => string | null
  now: number
  onMarked: () => void
}) {
  const state = anchorState(reading)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const mark = () => {
    setPending(true)
    setFailed(null)
    api.markReadTo().then(
      () => {
        setPending(false)
        onMarked()
      },
      (err: unknown) => {
        setPending(false)
        setFailed(errorMessage(err))
      },
    )
  }

  // Which rows to draw. On `never-looked` there is no "since" to measure, so the newest end of the
  // log is shown instead — and the lede says that is what it is, rather than letting it read as
  // "these are the new ones".
  const all = state.answer === 'never-looked' ? newest.slice(0, ANCHOR_ROWS) : (state.changes ?? [])
  // GROUPED FIRST, THEN CAPPED. One request that touched four fields is ONE action; capping the
  // raw rows would draw five lines saying one thing and call it five writes.
  const groups = groupChanges(all)
  const drawn = groups.slice(0, ALSO_ROWS)

  return (
    <AlsoColumn
      title={t('home.recentWrites')}
      /* One line, and behind the press the same thing said in the reader's words.
         WHAT USED TO BE HERE, AND WHY IT IS NOT. The server's own paragraph was printed whole,
         on the grounds that a second wording would be two places free to disagree. It said:

           "No anchor is recorded for human:<the owner's id>, so Mole Office cannot say what has changed since you
           last looked... The log holds 949 change rows in total. PUT /api/anchor marks the point
           you have read to..."

         That paragraph is right and it is written for somebody reading JSON. `human:<id>` is a
         composite key, `anchor` is a table, and `PUT /api/anchor` is an HTTP method offered as the
         instruction — twenty pixels above the button that does exactly that. So the press now holds
         the sentence a person needs, naming the button, and `ServerNote` keeps the server's own
         paragraph one mode away, whole and unedited, for an agent and for Developer mode. */
      lead={
        <Explain declares={{ surface: 'home.since' }} meaning={all.length === 0 ? <Absence title={sinceLead(state.answer, state.sinceAnchor, all.length)} /> : sinceLead(state.answer, state.sinceAnchor, all.length)} opens={sinceOpens(state.answer)}>
          <p className="hp-note">{state.answer === 'never-looked' ? t('home.readingPointStart') : t('home.readingPointSaved')}</p>
          <ServerNote text={state.sentence} />
        </Explain>
      }
      foot={
        <Btn
          size="sm"
          variant="ghost"
          onClick={mark}
          pending={pending}
          title={t('home.markReadHint')}
        >
          {t('home.markRead')}
        </Btn>
      }
    >
      {failed === null ? null : <ErrorNote message={t('home.markReadFailed')} retry={mark} />}

      {/* MORE ARE NEW THAN WERE FETCHED, AS TWO NUMBERS. The sentence said which number was the
          true one and which was drawn, and the words `of` and `drawn` say the same in a line a
          reader takes in without reading it. */}
      {state.truncated ? (
        <p className="hp-note">
          {t('home.rowsDrawn', { n: all.length, total: state.sinceAnchor ?? 0 })}
        </p>
      ) : null}

      {/* NO EMPTY BLOCK HERE. The lead line above already says which of the two answers this is, in
          those words — "Nothing has been written since you marked it" — so a box repeating the same
          sentence was the same absence stated twice, one line apart. The owner's fourth finding was
          that Home is full of these. Nothing is lost: the answer is still on the screen, once. */}
      {drawn.length === 0 ? null : (
        <div className="hp-since-rows">
          {drawn.map((group) => (
            <ChangeRow
              key={group.head.id}
              group={group}
              sessions={sessions}
              titles={titles}
              titleOf={titleOf}
              now={now}
            />
          ))}
        </div>
      )}

      {/* WHAT THE CAP CUT, EXACTLY. A list that shows five of eight without saying so is a list a
          reader has no reason to distrust and every reason to. */}
      {groups.length > drawn.length ? (
        <p className="hp-more">
          {t('home.actionsShown', { n: drawn.length, total: groups.length })} ·
          <RouteLink to="/records" className="hp-link">
            {t('home.openChanges')}
          </RouteLink>
        </p>
      ) : null}
    </AlsoColumn>
  )
}

/**
 * What to call the record a change row is about.
 *
 * The live title when the record is still there. When it is not, a delete row carries the title it
 * deleted, so that one can still be named exactly. Only when neither exists is the id printed —
 * an identifier that can be looked up, rather than an invented placeholder.
 */
function titleOfChange(change: Change, live: string | null, inspect = false): string {
 if (live !== null) return live
 if (change.op === 'delete' && change.oldValue) return t('home.deletedTitle', { title: content(change.oldValue) })
 return inspect ? change.recordId : t('home.titleUnavailable')
}

/**
 * `changeVerb` and `ChangeMeta` are re-exported here because tests/panels-follow.test.ts names
 * them on this module. One definition, in components/ChangeLog.tsx, drawn identically on this page
 * and on a record's own history: a verb that read one way on one page and another on the other
 * would be two vocabularies for one column.
 */
export { ChangeMeta, changeVerb } from '../components/ChangeLog.tsx'

// ---------------------------------------------------------------------------- sessions

/**
 * The compact session preview, and the machine underneath it.
 *
 * IT FETCHES ON ITS OWN. GET /api/sessions derives a session's state from what is observable now —
 * a live process, when the log last grew, whether it ended on an error — which is why it can say
 * `orphaned` and `unknown` at all. A stored answer to "is this alive" is only ever right by
 * accident. That request and the resource ledger are slower and more failure-prone than the
 * database, and neither is allowed to blank the attention list above.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT READS ITSELF AGAIN, WHICH IS THE ONE THING ON THIS PAGE THAT DOES
 * ---------------------------------------------------------------------------------------
 *
 * Approved decision 9. This block is an observation of a live machine and is wrong the instant it
 * is drawn, so it re-reads on a timer and carries the moment of the reading on its face. The
 * machine strip has its own reading, separate from the workspace attention answer.
 *
 * IT HAS ITS OWN CLOCK, and that is why `now` is no longer passed in. Every age in this block is
 * measured from the moment THIS block was read, which after the first thirty seconds is not the
 * moment the page was loaded. Handing it the page's frozen clock would have printed "idle 4m" for
 * a session that had been quiet for half an hour, off a reading taken seconds ago.
 */
// RUNNING NOW LEFT HOME. What is running is on the Agent runs page, and its 1.7 MB reading
// is no longer asked by Home at all. `SessionsLine` below stays, as the line that page's counts are told in.

/**
 * WHAT THE 928-PIXEL SESSIONS BLOCK BECAME: one line of counts, each opening `#/sessions`.
 *
 * Every number here is counted from one reading, in `readSessionsLine`, and every one of them is a
 * link — because the only thing Home has to do about a crashed run is send you to the page that
 * can show you the transcript, the resume command and what it was doing when it died.
 *
 * THE TWO SENTENCES THAT ARE NOT COUNTS ARE THE HONEST ONES. "nothing was swept" is what stands
 * where "0 unclaimed" would be a clean bill nobody established, and the all-zero branch says which
 * of "nothing is wrong" and "nothing was read" this is, with the total beside it.
 */
export function SessionsLine({ read }: { read: SessionsLineRead }) {
 return <p className="hp-sessline">
   <span className="hp-sess-part"><Counted text={t('home.runsRead', { n: read.total })} /></span>{read.counts.length === 0 ? <span className="hp-sess-part">{t('home.noLiveRuns')}</span> : null}
   {read.counts.map(one => <span className="hp-sess-part" key={one.state}><a className="px-nav" href="#/sessions"><b className="num">{one.count}</b> {stateWord(one.state).text}</a></span>)}
   {read.quiet.length === 0 ? null : <span className="hp-sess-part"><Counted text={t('home.quietRuns', { n: read.quiet.reduce((sum, one) => sum + one.count, 0), states: read.quiet.map(one => stateWord(one.state).text).join(t('home.or')) })} /></span>}
   {read.held === 0 ? null : <span className="hp-sess-part"><a className="px-nav" href="#/sessions"><Counted text={t('home.heldProcesses', { n: read.held })} /></a></span>}
   {read.unclaimed === null ? <Absence tier="told-apart" looked={false} word={t('home.noSweepWord')} title={t('home.noMachineSweep')} /> : read.unclaimed === 0 ? null : <span className="hp-sess-part"><a className="px-nav" href="#/sessions"><Counted text={t('home.unclaimedProcesses', { n: read.unclaimed })} /></a></span>}
 </p>
}

// ---------------------------------------------------------------------------- pipelines

/**
 * The order the step states are counted in: finished first, then what is moving, then what stopped.
 *
 * Written down rather than taken from ITEM_STATES, because that list is the schema's order and this
 * is a reading order. They happen to differ, and a sentence that read "4 todo, 1 doing, 3 done"
 * puts the answer last.
 */
const STEP_READING_ORDER: readonly ItemState[] = ['done', 'doing', 'blocked', 'failed', 'todo']

/**
 * What a pipeline's steps add up to, in one short sentence.
 *
 * It is the strip's words. A strip of coloured segments is not readable on its own — colour in this
 * product always has words beside it — so this is what the strip is labelled with, and it is what a
 * screen reader is given instead of the picture.
 */
export function stepSummary(steps: readonly { state: ItemState }[]): string {
  const counts = new Map<ItemState, number>()
  for (const step of steps) counts.set(step.state, (counts.get(step.state) ?? 0) + 1)
  const parts = STEP_READING_ORDER.filter((state) => (counts.get(state) ?? 0) > 0).map(
    (state) => `${counts.get(state) ?? 0} ${stateWord(state).text}`,
  )
  return `${plural(steps.length, 'step')}: ${parts.join(', ')}`
}

/**
 * ONE PIPELINE'S STEPS AS A STRIP, IN ORDER.
 *
 * WHY THIS IS NOT DECORATION. The row already said "standing on step 3 of 5" and "2/5", and both
 * are exact. Neither says what SHAPE the run is in: whether the two done steps are the first two or
 * the first and the fourth, whether the stop is one step from the end or one from the start, and
 * whether eight pipelines are all stuck in the same place. That is the answer a person reads a
 * column of these for, and it is in the stored step states already.
 *
 * EVERY STRIP IS THE SAME WIDTH whatever the step count, so a five-step pipeline and a twelve-step
 * one can be compared down the column. The state is carried by HEIGHT and PATTERN as well as by
 * colour — a hairline for todo, half height for doing, full for done, and full with a hatch for the
 * two that stopped — because this product does not let colour carry a state on its own.
 */
export function StepStrip({ steps }: { steps: readonly { id: string; name: string; state: ItemState }[] }) {
  const summary = stepSummary(steps)
  return (
    <span className="hp-steps" role="img" aria-label={summary} title={summary}>
      {steps.map((step, index) => (
        <span
          key={step.id}
          className="hp-step"
          data-state={step.state}
          // Every segment names itself, so the picture is never the only place a step's state is
          // written. The whole strip's sentence is on the strip; this is the one step.
          title={t('home.stepTitle', { n: index + 1, total: steps.length, name: content(step.name), state: stateWord(step.state).text })}
        />
      ))}
    </span>
  )
}

/**
 * Where each pipeline is standing, in one row each.
 *
 * COMPACT ON PURPOSE. This block used to draw every step of every pipeline as a chip, which is a
 * whole-page answer to a question Home only asks in passing. The step-by-step view, the modules
 * that carry each step and the gates between them are the pipeline page's job, and the link is
 * right here.
 */
function PipelinesBlock({
  pipelines,
  problems,
  now,
  cap,
}: {
  pipelines: readonly PipelineInfo[]
  problems: readonly RecordProblem[]
  /** One clock for the block, so two rows cannot disagree about how old a stop is. */
  now: number
  /** How many rows this may draw. What the cap cuts is stated under them, exactly. */
  cap: number
}) {
  const drawn = pipelines.slice(0, cap)
  return (
    <>
      {/* WHAT THIS SAID BEFORE WAS AN API LESSON. "Create a record of kind pipeline, then add its
          blocks with POST /api/records/<id>/blocks" is two lines of instructions on a home page,
          shown to somebody who did not ask how to make one. The fact — there are none — is the
          answer, and it fits in three words. */}
      {pipelines.length === 0 ? (
        // ORDINARY EMPTINESS. A project with no pipelines is a normal project, and the reader does
        // nothing about it, so it is two dimmed words under the heading rather than a bold sentence
        // in a box. It is drawn at all — never as a blank — because a column that drew nothing
        // would leave "there are none" and "this block did not load" looking identical.
        <Absence title={t('home.noPipelines')} />
      ) : (
        drawn.map((pipeline) => {
          const at = pipelinePosition(pipeline.blocks)
          const done = pipeline.blocks.filter((step) => step.state === 'done').length
          return (
            <Row
              key={pipeline.record.id}
              state={at === null ? 'done' : at.state}
              // How loud, from the same scale everything else on this page uses. Without it eight
              // pipelines drew eight full-strength alarm rails together — the exact competition
              // approved decision 2 exists to remove. The stamp is the
              // record's own updated stamp, which is the best this block has; the pipelines page
              // has the server's per-step answer and uses that instead.
              {...(() => {
                const level = ageAlarm(progressOf(at === null ? 'done' : at.state), pipeline.record.updatedAt, now)
                return level === undefined ? {} : { alarm: level }
              })()}
              title={content(pipeline.record.title)}
              // The state word is NOT repeated here. It is in the severity chip at the head of the
              // row, and a row that prints "— blocked" beside a chip saying Blocked is one row
              // saying one thing twice.
              meta={pipelineLine(pipeline.blocks)}
              right={
                <span className="hp-prog">
                  <StepStrip steps={pipeline.blocks} />
                  <span className="num">
                    {done}/{pipeline.blocks.length}
                  </span>
                </span>
              }
              href={`#${recordPath(pipeline.record.id, pipeline.record.kind)}`}
              target={{ kind: 'record', recordId: pipeline.record.id, workspaceId: pipeline.record.workspaceId }}
            />
          )
        })
      )}
      {/* WHAT THE CAP CUT. Never a bare "more": the exact numbers and the route to all of them. */}
      {pipelines.length > drawn.length ? (
        <p className="hp-more">
          {t('home.pipelinesShown', { n: drawn.length, total: pipelines.length })} ·
          <RouteLink to="/pipeline" className="hp-link">
            {t('home.allPipelines')}
          </RouteLink>
        </p>
      ) : null}
      {/* A RECORD THAT CANNOT BE READ IS NOT FURNITURE, so it survives the cap and the band: it is
          drawn however many there are, and it is the one thing in this column that is loud. */}
      {problems.map((problem) => (
        <ErrorNote
          key={`${problem.record.id}:${problem.problem}`}
          // Not "Failed.": nothing failed. The record is stored and is missing the one field that
          // makes a pipeline a pipeline, which is a thing to go and fill in.
          label={t('home.cannotDraw')}
          /* THE SENTENCE FOR A PERSON, NOT THE READING FOR AN AGENT. This printed `problem.said`'s
             sibling — *"block 16 of 16 (lfLve4F30JIy): its state is undefined, which is not one of
             todo, doing, done, failed, blocked"* — in the only red panel on the default page of the
             default project. An id, a field name, a JavaScript value and a stored union, in one
             sentence, with three colons in it, and nothing a reader could act on. Both halves are
             built together in src/shared/blocks.ts; the long one is in Developer mode. */
          message={
            // The pipeline is named unless the sentence has already named it. A step's stored title
            // is "<its pipeline> › <its own name>", so a sentence about a step can already carry the
            // pipeline's title, and adding it again prints the same title twice in one line.
            t('home.pipelineFailed', { title: content(problem.record.title) })
          }
        >
          {/* THE STEP THAT IS WRONG, WHERE THERE IS ONE. "Open it" opened the pipeline, so a reader
              told about step 16 had to count to it. */}
          <RouteLink to={recordPath(problem.openId ?? problem.record.id)} className="hp-link">
            {t('home.openIt')}
          </RouteLink>
        </ErrorNote>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------- band 3

/**
 * ONE COLUMN OF THE "ALSO" STRIP: a heading, an optional one-line lead, rows, an optional foot.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACES, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The bottom of Home was a masonry of five full panels — the change log, the sessions block, the
 * modules, the pipelines and the questions — with about 510 pixels of dead page in it: two blocks
 * shared a grid row and the row was as tall as the taller one. At 577px of column width a record
 * title wrapped to seven lines of four words.
 *
 * The band is now three equal columns of at most `ALSO_ROWS` rows each, inside ONE panel. That is
 * what makes the strip a strip: the eye reads three headings across, not five panels down, and no
 * column can push another one's height around because they are grid tracks of the same row.
 *
 * IT IS A COLUMN AND NOT A PANEL. No card, no elevation and no eyebrow — three panels inside a
 * panel would be three borders saying what one heading says.
 */
function AlsoColumn({
  title,
  lead,
  foot,
  children,
}: {
  title: string
  /** One line under the heading, where the column has something true to say about its own rows. */
  lead?: React.ReactNode
  /** The column's one control or stamp, under the rows. */
  foot?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="hp-also-col" aria-label={title}>
      <h3 className="hp-also-head">{title}</h3>
      {lead === undefined ? null : <div className="hp-also-lead">{lead}</div>}
      <div className="hp-also-body">{children}</div>
      {foot === undefined ? null : <div className="hp-also-foot">{foot}</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------- band 0

/**
 * TODAY AND THIS WEEK, AND WHY THEY ARE THE FIRST THING ON THIS PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * The owner's standard for this product begins *"I should be able to open Mole Office, understand what I
 * have to do"*. Home answered a narrower question: what in ONE project has stopped short or is owed.
 * It drew no day, no week and no hours at all, and the answer to "what am I doing today" lived on
 * `#/plan`, which a reader has to know exists and go and find. That is the whole reason this band is
 * here, and it is why it sits above everything else: it is the page's own question.
 *
 * ---------------------------------------------------------------------------------------
 * IT DOES NOT READ A PROJECT, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/planning/today`, `GET /api/planning/week/<week>` and `GET /api/work` all refuse a
 * project header, because what a person has to do is a fact about the person and not about one
 * project — the header of src/server/api/planning.ts argues it in full and this band inherits the
 * argument rather than repeating it. So this band says the same thing whichever project is in the
 * switcher, and a reader who lands in an empty project is still shown their own work.
 *
 * Everything BELOW the scope line further down reads one project, and that line names it.
 *
 * ---------------------------------------------------------------------------------------
 * THE HONESTY THIS BAND EXISTS TO KEEP, AND IT IS NOT A DETAIL
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the live corpus on 14 August 2026: 203 pieces of work, 3 of them with any hours, none
 * with an estimate. So "this week" is nearly empty on real data, and an empty week that reads as
 * "you have nothing to do" would be the biggest lie this product could tell.
 *
 * **NOTHING IS SCHEDULED AND YOU HAVE NOTHING TO DO ARE DIFFERENT FACTS.** So the empty week says
 * the first, in those words, and the standing count under both columns says the second is false:
 * how many pieces of work are not finished, in how many projects, and how many of them have ever
 * been given an hour. On this corpus that reads "114 pieces of work are not finished, in 3
 * projects" under "Nothing is scheduled for today".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PERSON GETS IN THE FIRST TWO SECONDS, AND WHAT WAITS FOR A PRESS
 * ---------------------------------------------------------------------------------------
 *
 * A tester called Home's first screen "a status report about the database", and the sentence they
 * meant was on this band: "13 more have no state Mole Office can read, so it cannot say whether they are
 * finished." It is exact, it is honest, and nothing a reader does in their first two seconds
 * depends on it. So the reading order of this band is now:
 *
 *   1. WHAT IS ON TODAY AND THIS WEEK, as rows, biggest commitment first.
 *   2. WHETHER THE WEEK FITS, from the server's own arithmetic, in the Schedule page's own terms.
 *   3. HOW MUCH IS NOT FINISHED, in every project — the sentence that stops an empty week reading
 *      as an empty life.
 *   4. Behind one press named "what this count leaves out": the records Mole Office cannot classify, and
 *      anything a cut reply left out.
 *   5. WHEN ALL OF IT WAS READ, and the press that reads it again.
 *
 * Nothing was deleted to get there and nothing was shortened. The press names what it holds, so the
 * count above it can never be read as complete.
 */

/**
 * How many rows Today and This week each draw before saying what the cap cut.
 *
 * Six rather than the five of the "Also" strip, and that is not a copy of a number: a day with seven
 * things on it is a day whose seventh thing matters, and this band is the one place on Home where
 * the rows ARE the answer rather than a sample of it. Whatever the cap cuts is stated exactly under
 * the rows, with the way to all of them.
 */
const DAY_ROWS = 6

/** "1 piece of work" / "12 pieces of work". Written out because `plural` cannot inflect a phrase. */
const pieces = (n: number) => t('home.pieces', { n })

/** "10 hours" / "1 hour" / "2.5 hours". The one spelling of an hour count in this band. */
const hours = (n: number) => plural(n, 'hour')

interface DayData {
  today: TodayReply
  /**
   * WHEN THIS READING CAME BACK. Not now, and not when the page was opened.
   *
   * THE DEFECT IT CLOSES, OBSERVED IN A BROWSER ON 14 AUGUST 2026. A tester filed eleven new tasks
   * while Home was open and the count under the two columns did not move — it still said the number
   * it had read minutes earlier, with nothing on the screen saying when that was. The count itself
   * was right: leaving Home and coming back showed 164 where it had shown 154, and the eleventh row
   * was a task filed after the first reading. So this is a stale read and not a wrong count, and
   * what was missing was the one thing approved decision 9 demands of anything that reads as
   * current — the moment it was read, on its face, with the press that reads it again.
   */
  at: number
}

/**
 * THE SERVER'S CLOCK SAYS WHICH DAY AND WHICH WEEK THIS IS. The browser never works one out.
 *
 * Since a decision, Home asks only for today. The week's hours are on the
 * plan page, which asks `GET /api/planning/week/current` itself, so the server resolves `current`
 * from the same clock `/planning/today` reads.
 */
async function loadDay(): Promise<DayData> {
  // THE WEEK'S HOURS ARE NOT ASKED FOR: they left Home for the plan page, which reads them itself.
  // Schedule's next seven days are read one day each from this day (HomeWeek.tsx).
  const today = await api.today()
  // Stamped when the answer came back, which is the moment every number below is true of.
  return { today, at: Date.now() }
}

/**
 * THE DAY BAND'S THREE READS, STARTED BY HomePage BEFORE THE BAND MOUNTS.
 *
 * The band is inside Home's data gate, so its read used to begin only after the page's two big
 * reads had finished and then chained three more requests behind that. HomePage starts this slot at
 * mount; `DayBand` joins it, and Recheck asks again. See homereads.ts for the pattern and why it
 * costs no extra requests.
 *
 * KEYED BY NOTHING. The server answers today's plan without reading the project of the request, so a
 * switch of project does not read it again.
 */
const readDayOnce = oneRead(() => loadDay(), () => 'every project')

/**
 * SCHEDULE'S WEEK, counted from the today Today's band reads: the same shared read, so today is asked once.
 *
 * A PART OF ITS OWN, drawn again only when what it is handed changed. Today's answer carries the moment it was
 * read, so it is a new answer every minute. Read by the page, it drew the whole page again every minute; read
 * here, it draws only this part again.
 */
const ScheduleWeek = memo(function ScheduleWeek({ again, projectName, onRetry }: { again: number; projectName: (id: string) => string; onRetry: () => void }) {
  const [todayRead] = useSharedRead(readDayOnce, [again], { startFromHeld: true })
  const week = useTheWeek(todayRead.status === 'ready' ? { status: 'ready', value: todayRead.value.today } : todayRead, again)
  return <HomeWeek week={week} projectName={projectName} onRetry={onRetry} />
})

/**
 * WHAT IS STILL TO DO, ACROSS EVERY PROJECT, counted from `GET /api/work`.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLASSIFIER IS THE PRODUCT'S ONE CLASSIFIER
 * ---------------------------------------------------------------------------------------
 *
 * `progressOf` in src/shared/work.ts is the only thing in this product that says what a state word
 * means, and it is what this counts with. There is no second table here and no list of words: a
 * kind that gains a word gains it for this count too, on the same day, without anybody remembering.
 *
 * ---------------------------------------------------------------------------------------
 * THREE ANSWERS, AND MERGING ANY TWO WOULD BE A GUESS
 * ---------------------------------------------------------------------------------------
 *
 * `unfinished`  — it has not reached its end: it has not begun, somebody is on it, it stopped short,
 *                 or it was deliberately put down. Every one of those is honestly "not finished".
 * `finished`    — it reached its end.
 * `cannotSay`   — Mole Office cannot tell. Either nothing wrote a state word, or the word written is one
 *                 nothing has classified, or the word says outright that nobody could tell. Rolling
 *                 these into `unfinished` would turn a question into an answer, which is the fifth
 *                 invariant, and rolling them into `finished` would hide work.
 *
 * `withHours` counts the UNFINISHED rows that have hours in any period, past or future. It is not a
 * sum of hours: hours at different horizons are never added, and the route says so on its own face.
 */
export interface WorkStanding {
  unfinished: number
  finished: number
  cannotSay: number
  /** How many projects the unfinished work sits in. */
  projects: number
  /** How many of the unfinished have ever been given hours, in any period at any horizon. */
  withHours: number
  /** How many pieces of work the reply left out. Zero means it is all of them. */
  leftOut: number
}

export function workStanding(reply: WorkListReply): WorkStanding {
  let unfinished = 0
  let finished = 0
  let cannotSay = 0
  let withHours = 0
  const projects = new Set<string>()
  for (const row of reply.rows) {
    const progress = progressOf(row.state)
    if (progress === 'finished') {
      finished += 1
      continue
    }
    if (progress === null || progress === 'unknown' || progress === 'unclassified') {
      cannotSay += 1
      continue
    }
    unfinished += 1
    projects.add(row.workspaceId)
    if (row.hoursGiven.length > 0) withHours += 1
  }
  return { unfinished, finished, cannotSay, projects: projects.size, withHours, leftOut: reply.leftOut }
}

/**
 * THE LINE THAT STOPS AN EMPTY WEEK READING AS AN EMPTY LIFE.
 *
 * It is drawn whether or not anything is scheduled, because it is a standing fact rather than a
 * consolation for an empty column. When there is genuinely no work at all it says that instead, and
 * that is the only reading on this band that means "you are clear".
 *
 * IT IS A COUNT AND A LABEL, NOT A SENTENCE, and the three answers still read apart, which is the
 * only thing that mattered about the wording. `Nothing unfinished` is the clear one. `Nothing known
 * to be unfinished` is the one where Mole Office could not classify some of it — the word `known` is
 * doing the same work it did in the sentence — and the count of what it could not classify is drawn
 * beside it. The third is the ordinary case and puts the number first, where a number belongs.
 */
export function standingLead(standing: WorkStanding): string {
 if (standing.unfinished === 0) return standing.cannotSay === 0 ? t('home.nothingUnfinished') : t('home.nothingKnownUnfinished')
 return t('home.unfinished', { work: pieces(standing.unfinished), projects: t('home.projectsCount', { n: standing.projects }) })
}

/**
 * NOTHING IS ON THIS PERIOD. One test, read by the sentence and by the drawing.
 *
 * Both need the answer: `todayLead` writes the sentence for it and `DayColumn` draws a dash instead
 * of that sentence. Two `.length === 0` tests would be the same fact worked out in two places, and
 * the day they parted the column would draw a dash under a sentence saying three things are on.
 */
export function nothingOn(rows: readonly unknown[]): boolean {
  return rows.length === 0
}

/** What is on today, in one line. `Nothing is scheduled` is never `nothing to do` — see the header. */
export function todayLead(today: TodayReply): string {
 return nothingOn(today.allocations) ? t('home.todayEmpty') : t('home.todayWork', { work: pieces(today.allocations.length) })
}

/**
 * What is on this week, in one line, with the two things that make the hours readable.
 *
 * THE PLANNED TOTAL IS A FLOOR WHENEVER AN ALLOCATION GAVE NO NUMBER, and the line says so in the
 * same breath rather than printing a total a reader would take as the whole. `fit` is the server's
 * arithmetic; nothing here adds an hour to another.
 */
export function weekLead(week: PlanReply): string {
 if (nothingOn(week.entries)) return t('home.weekEmpty')
 return week.fit.unstated === 0 ? t('home.weekWork', { work: pieces(week.entries.length), hours: hours(week.fit.load.plannedHours) }) : t(week.fit.unstated === 1 ? 'home.weekWorkOneUnstated' : 'home.weekWorkUnstated', { work: pieces(week.entries.length), hours: hours(week.fit.load.plannedHours), n: week.fit.unstated })
}

/**
 * How many hours the period holds, in words, or the sentence that says nobody has ever said.
 *
 * NULL IS NOT ZERO AND IS NOT A FULL WORKING WEEK. Every reader in the planning layer treats it as
 * unknown for that reason, and a period drawn as "0 hours free" off a capacity nobody set would
 * report an empty week as a full one.
 *
 * TODAY ONLY. `GET /api/planning/today` carries a capacity and no arithmetic against it, so this is
 * all Home may honestly say about a day. The week has the server's own arithmetic and says more —
 * see `weekHoldsLead` below.
 */
export function capacityLead(capacityHours: number | null, period: 'today' | 'this week'): string {
 if (capacityHours === null) return hoursNotSaid(period === 'today' ? t('schedule.todayLower') : t('schedule.thisWeekLower'))
 return t('home.capacity', { hours: hours(capacityHours) })
}

/**
 * HOW THE WEEK'S HOURS STAND: what it holds, what is planned into it, and whether that fits.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES, OBSERVED IN A BROWSER ON 14 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Home said "This week holds 10 hours." One press away, on the Schedule page, the same week said
 * "40h planned of 10h this week · over by 30h". Both were true and a reader met them a link apart.
 * Home printed the capacity and the planned total in two separate sentences at two ends of a
 * column, and never said the one thing the pair adds up to.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY NUMBER HERE IS THE SERVER'S. NOTHING IS WORKED OUT A SECOND TIME
 * ---------------------------------------------------------------------------------------
 *
 * `fitOf` in src/shared/planning.ts computes `freeHours` and `overcommitted` once, on the server,
 * and sends them. This prints them. The only operation performed here is flipping the sign of
 * `freeHours` to say "over by 30 hours" rather than "-30 hours left", which is one number read
 * aloud rather than a second answer to the question.
 *
 * ---------------------------------------------------------------------------------------
 * A FLOOR AND A CEILING, AND THEY ARE NOT THE SAME WORD
 * ---------------------------------------------------------------------------------------
 *
 * `unstated` is how many allocations gave no number. While any exist the planned total is a FLOOR,
 * so the overage is a floor too and both take "at least" — but the hours LEFT are then a CEILING,
 * because the unsized commitments can only eat into them, so that one takes "at most".
 */
export function weekHoldsLead(fit: PlanReply['fit']): string {
 if (fit.capacityHours === null) return capacityLead(null, 'this week')
 const floor = fit.unstated > 0 ? t('home.atLeast') : ''
 const head = t('home.weekCapacity', { hours: hours(fit.capacityHours), floor, planned: hours(fit.load.plannedHours) })
 if (fit.overcommitted === true) return t('home.overCapacity', { head, floor, hours: hours(Math.abs(fit.freeHours ?? 0)) })
 if ((fit.freeHours ?? 0) === 0) return t('home.fullCapacity', { head })
 return t('home.freeCapacity', { head, ceiling: fit.unstated > 0 ? t('home.atMost') : '', hours: hours(fit.freeHours ?? 0) })
}

/** The work text a diary row shows at Home's chosen reading length. */
function workAtHomeLength(work: NonNullable<AllocationWithWork['work']>, rung: Rung): string {
  if (rung === 'label' && work.label !== undefined && work.label !== null) return work.label
  const record = {
    id: work.id,
    workspaceId: work.workspaceId,
    kind: work.kind,
    title: work.title,
    summary: work.summary ?? null,
    data: {},
  } as PanelRecord
  const answer = wordsAt(record, rung)
  return answer.kind === 'text' && answer.from !== 'title' ? answer.text : work.name
}

/**
 * ONE ALLOCATION, AS A ROW. The work it names, which project owns it, and the hours it was given.
 *
 * AN ALLOCATION WHOSE RECORD IS GONE IS DRAWN, NOT DROPPED. `work` is null there, and a week that
 * quietly lost two hours would be worse than one that says it is pointing at nothing.
 *
 * THE PROJECT IS ON EVERY ROW because this band spans all of them: a day holding an hour of Mole Office
 * and an hour of Greenhouse is two projects' work in one afternoon, and that is the fact a
 * person-level plan exists to show.
 */
function AllocationRow({ entry, projectName }: { entry: AllocationWithWork; projectName: (id: string) => string }) {
  const { allocation, work } = entry
  // NOT SIZED IS NOT ZERO, so it is one of the absences that has to stay tellable from an answer:
  // it is a commitment somebody made without saying how long it takes, and `biggestFirst` below
  // sorts it after the numbers rather than among them as if it were nothing. The dashed edge is
  // what says a person can close this gap; a plain dash here would read as "no hours needed".
  const given =
    allocation.plannedHours === null ? (
      <Absence
        tier="told-apart"
        looked={false}
        word={t('home.notSized')}
        title={t('home.notSizedWhy')}
      />
    ) : (
      <span className="num">{hours(allocation.plannedHours)}</span>
    )

  if (work === null) {
    return (
      <Row
        cols="minmax(0, 1fr) auto"
        title={t('home.deletedWork')}
        meta={<><ProjectTag /> {t('home.deletedHours')}</>}
        right={given}
      />
    )
  }
  return (
    <Row
      cols="var(--px-col-sev) minmax(0, 1fr) auto"
      /* THE SAME DRAWING OF A STATE WORD THE PLAN PAGE USES, from the one component that draws one.
         `sev` rather than `state`: `state` takes this interface's own ten-word vocabulary, and a
         piece of work carries whatever word its kind uses. */
      sev={work.state === null ? undefined : <StoredState state={work.state} source={work.stateSource} progress={progressOf(work.state)} kind={work.kind} />}
      title={content(work.name)}
      meta={
        <>
          <ProjectTag name={projectName(work.workspaceId)} />
          {work.within === null ? null : <span className="hp-day-within">{content(work.within)}</span>}
          {/* A DELETED THING ON THIS WEEK IS SOMETHING TO ACT ON, so it is a mark rather than a
              trailing clause. It used to be a bare span beside the project's name with no separator
              between them, and the two ran together on screen into one word: "PanelXthis record has
              been deleted". Not a sentence and not two sentences. */}
          {work.deleted ? (
            <span className="hp-day-gone">
              {t('home.deletedWorkAction')}
            </span>
          ) : null}
        </>
      }
      right={given}
      href={`#${recordPath(work.id)}`}
      // A DAY ROW IS THE PIECE OF WORK. The work's own project, never the switcher's: this band reads
      // every project and a row from another one would otherwise be pointed at under the wrong name.
      target={{ kind: 'record', recordId: work.id, workspaceId: work.workspaceId }}
    />
  )
}

/**
 * THE ROWS IN THE ORDER A CAP MAY SAFELY CUT: the biggest commitment first.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES, OBSERVED IN A BROWSER ON 14 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The week drew "6 of 9 shown" and the three it left out were 10 hours, 8 hours and 8 hours — the
 * largest allocation in the week among them. The rows arrived in the server's own order, which is
 * about when they were written and not about how big they are, and the cap then took whatever fell
 * off the end. A reader who trusted the six they could see was reading the week's small change.
 *
 * ---------------------------------------------------------------------------------------
 * WHY SORTING IS SAFE HERE AND WOULD NOT BE EVERYWHERE
 * ---------------------------------------------------------------------------------------
 *
 * Every row in one of these columns belongs to ONE period — one day, or one week — and nothing in
 * an allocation says what time of day it happens. So there is no chronology to destroy: the
 * server's order carries no meaning this reordering can take away. The order is named on the screen
 * under the rows, so a reader is never left to infer it.
 *
 * AN ALLOCATION WITH NO HOURS IS NOT A SMALL ONE. It is a commitment nobody has sized, so it is not
 * sorted among the numbers as if it were zero — it goes after them, and the line under the rows
 * counts how many were left out for that reason rather than implying they were the least of it.
 */
export function biggestFirst(entries: readonly AllocationWithWork[]): AllocationWithWork[] {
  const sized = entries.filter((entry) => entry.allocation.plannedHours !== null)
  const unsized = entries.filter((entry) => entry.allocation.plannedHours === null)
  sized.sort((a, b) => (b.allocation.plannedHours ?? 0) - (a.allocation.plannedHours ?? 0))
  return [...sized, ...unsized]
}

/**
 * WHAT THE CAP CUT, IN WORDS, and it is never a bare "and more".
 *
 * The rows are biggest first, so the largest thing left out is the first row of the cut — which
 * means the exact ceiling on everything cut can be stated without adding a single hour together.
 * Nothing here sums hours; the whole sentence is read off the ordering.
 */
export function cutLead(cut: readonly AllocationWithWork[]): string {
 if (cut.length === 0) return ''
 const unsized = cut.filter(entry => entry.allocation.plannedHours === null).length
 const largest = cut[0]?.allocation.plannedHours ?? null
 if (largest === null) return t('home.cutUnsized', { n: cut.length })
 const size = t('home.cutSized', { n: cut.length, hours: hours(largest) })
 return unsized === 0 ? size : t('home.cutMixed', { size, n: unsized })
}

/**
 * ONE COLUMN OF THE DAY BAND: a heading, the one line that is the answer, the rows, the hours it
 * holds, and what the cap cut.
 *
 * IT IS THE SAME SHAPE AS `AlsoColumn` DELIBERATELY BUT IS NOT THAT COMPONENT. `AlsoColumn` is
 * three quiet lists at the foot of the page; this is the page's first answer and its rows carry
 * hours, a project and a state. Sharing the component would have meant one of them growing options
 * for the other, which is the abstraction the sixth invariant forbids.
 *
 * EXPORTED FOR ONE TEST, and the test is the reason the export is worth it: `biggestFirst` and
 * `cutLead` can both be right while this component quietly stops calling them, and that is exactly
 * the shape of the defect they were written for. tests/home-day-band.test.ts renders this with eight
 * rows and checks that the largest one survives the cap.
 */
export function DayColumn({
  declares,
  title,
  words,
  note,
  opens,
  explains,
  entries,
  projectName,
  seeAll,
  after,
}: {
  /**
   * WHICH COLUMN THIS IS. Two of them are on screen at once — today and this week — so the name
   * cannot be decided in here: one name on two live elements would paint one person's comment on
   * both and jump to the first.
   */
  declares: Declares
  title: string
  /**
   * WHAT THIS COLUMN SAYS AND HOW LOUDLY, decided in `dayBandWords` and printed here.
   *
   * The two flags on it are why it is one object rather than two strings: this column draws an
   * absence as a mark and an answer as a sentence, and which of those it is may not be worked out
   * a second time here.
   */
  words: DayBandWords
  /** The server's own paragraph about this period. Developer mode only — see `ServerNote`. */
  note: string
  /** What that press opens, named. */
  opens: string
  /**
   * WHAT THE PRESS HOLDS, IN THE READER'S WORDS, AND WITH NO NUMBER IN IT.
   *
   * Every number this column shows is already on the column, worked out once by the server and
   * printed by `words`. So this says how those numbers were arrived at and never restates one —
   * which is what keeps it from becoming a second place the same arithmetic is done.
   */
  explains: React.ReactNode
  entries: readonly AllocationWithWork[]
  projectName: (id: string) => string
  seeAll: string
  /** One more line this period has to say, under the hours it holds. Today has one; a week has none. */
  after?: React.ReactNode
}) {
  // BIGGEST FIRST, THEN CUT. Cutting the server's order silently dropped the largest allocation in
  // the week — see `biggestFirst`. The order is stated under the rows, because a reader who cannot
  // see the order cannot check the sentence that says what was left out.
  const ordered = biggestFirst(entries)
  const drawn = ordered.slice(0, DAY_ROWS)
  const cut = ordered.slice(DAY_ROWS)
  return (
    <section className="hp-day-col" aria-label={title}>
      <h3 className="hp-day-head">{title}</h3>
      {/* THE LINE I WRITE, AND HOW IT WAS WORKED OUT ONE PRESS BEHIND IT.

          THE SERVER'S PARAGRAPH USED TO BE WHAT THE PRESS HELD, on the grounds that a second
          wording would be two places free to disagree about a number. It disagreed with nothing and
          it was not English: "2 allocations in 2026-W34, 0 hours planned... Anything listed under
          `recurring` comes round today and is NOT on the plan" — the table's name, the field's name
          and an ISO week code, on the first screen a stranger sees. The way out of the two-places
          trap is not to repeat the server's prose; it is to PUT NO NUMBER HERE AT ALL. Every number
          is above, from `words`, worked out once. This says only how it was arrived at, and
          `ServerNote` carries the server's own paragraph into Developer mode, whole.

          AN EMPTY PERIOD IS A DASH, NOT A SENTENCE. "Nothing is scheduled for today." is ordinary
          emptiness — the reader does nothing about it, and the standing count under both columns is
          what tells them whether they have work. So the heading above says which day this is, the
          dash says there is nothing on it, and the sentence is on the dash's tooltip with the
          server's whole paragraph one press away. Nothing was deleted to make it quiet.

          IT IS A DASH RATHER THAN A DASHED MARK BECAUSE IT IS AN ANSWER. The day route replied and
          its list was empty; nobody failed to look. A dashed edge in this product means a gap
          somebody can close, and putting one here would say the schedule had never been read. */}
      <Explain declares={declares} meaning={words.nothingOn ? <Absence title={words.lead} /> : <strong>{words.lead}</strong>} opens={opens}>
        <p className="hp-note">{explains}</p>
        <ServerNote text={note} />
      </Explain>
      {drawn.length === 0 ? null : (
        <div className="hp-day-rows">
          {drawn.map((entry) => (
            <AllocationRow key={entry.allocation.id} entry={entry} projectName={projectName} />
          ))}
        </div>
      )}
      {/* HOW MANY HOURS IT HOLDS, and "nobody has said" where nobody has. It is under the rows
          rather than in the lead because it is a fact about the period and not about the work.

          NOT-SET IS A MARK AND IT KEEPS ITS DASHED EDGE. Null is not zero: a period drawn as "0
          hours free" off a capacity nobody set reports an empty week as a full one, so this is one
          of the absences that must stay tellable from an answer. The label names the fact, the mark
          says nobody set it, and `capacityLead`'s whole sentence is on the tooltip. */}
      {words.holdsUnset ? (
        <p className="hp-day-unset">
          {t(words.period === 'today' ? 'home.hoursToday' : 'home.hoursWeek')}{' '}
          <Absence tier="told-apart" looked={false} word={t('home.notSet')} title={words.holds} />
        </p>
      ) : (
        <p className="hp-day-holds">{words.holds}</p>
      )}
      {after}
      {cut.length > 0 ? (
        <p className="hp-more">
          {t('home.shownBiggest', { n: drawn.length, total: entries.length })} ·
          {cutLead(cut)} ·{' '}
          <RouteLink to="/plan" className="hp-link">
            {seeAll}
          </RouteLink>
        </p>
      ) : entries.length > 1 ? (
        // NOTHING WAS CUT AND THE ORDER IS STILL STATED, IN TWO WORDS. Rows sized 2 hours then 1
        // hour read as morning then afternoon to somebody who has not been told otherwise, and an
        // order nobody named is a claim the list is making without saying so. There is no count
        // here because nothing was left out for a count to be about.
        <p className="hp-more">{t('home.biggestFirst')}</p>
      ) : null}
    </section>
  )
}

/**
 * THE WORDS ON BOTH COLUMNS OF THE DAY BAND, decided in one place.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT FOUR EXPRESSIONS IN THE MARKUP
 * ---------------------------------------------------------------------------------------
 *
 * `weekHoldsLead` was written, tested and then not called: the week column went on printing the
 * capacity alone, every test stayed green, and the defect it was written for was still on the
 * screen. Four sentences chosen inside a `return` are four things a test cannot reach.
 *
 * So which sentence each column carries is decided here, the markup prints what comes back, and
 * tests/home-day-band.test.ts calls this directly. A column that stops saying whether the week fits
 * now fails a test instead of only looking wrong.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO COLUMNS DO NOT SAY THE SAME AMOUNT, AND THAT IS NOT AN OVERSIGHT
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/planning/week/<week>` carries the server's arithmetic — planned against capacity, what
 * is left, whether it is over. `GET /api/planning/today` carries a capacity and no arithmetic
 * against it. So the week says whether it fits and the day says only what it holds. Working the
 * day's fit out here would be this repository's recurring defect: the same fact worked out in a
 * second place, free to disagree with the server's.
 */
export interface DayBandWords {
  /** The one line that is the answer for this period. */
  lead: string
  /**
   * Nothing is on this period, so the lead is not drawn as a sentence: a column draws a dash, and Home's Today band nothing.
   *
   * IT IS DECIDED HERE AND NOT IN THE MARKUP, for the reason the whole of this function exists: a
   * column that worked its own emptiness out could end up drawing a dash under a lead saying three
   * things are on. One answer, read by both.
   */
  nothingOn: boolean
  /** How its hours stand: what it holds, and for the week whether that fits. */
  holds: string
  /** The period in its own words, for the label beside the hours. */
  period: 'today' | 'this week'
  /**
   * Nobody has said how many hours this period holds, so the hours are drawn as a quiet mark.
   *
   * NULL IS NOT ZERO. `capacityLead` says the same thing in a sentence and this says it as a flag,
   * from the same value, so the mark and the sentence cannot come to disagree about which case
   * this is.
   */
  holdsUnset: boolean
}

/** Today's words, the half of `dayBandWords` Home still draws. */
export function dayWords(today: TodayReply): DayBandWords {
  const todayCapacity = today.capacity?.hours ?? null
  return {
    lead: todayLead(today),
    nothingOn: nothingOn(today.allocations),
    holds: capacityLead(todayCapacity, 'today'),
    period: 'today',
    holdsUnset: todayCapacity === null,
  }
}

export function dayBandWords(today: TodayReply, week: PlanReply): { today: DayBandWords; week: DayBandWords } {
  return {
    today: dayWords(today),
    week: {
      lead: weekLead(week),
      nothingOn: nothingOn(week.entries),
      holds: weekHoldsLead(week.fit),
      period: 'this week',
      holdsUnset: week.fit.capacityHours === null,
    },
  }
}

/**
 * BAND 0. What you have to do, in every project, today and this week.
 *
 * ---------------------------------------------------------------------------------------
 * IT FETCHES ON ITS OWN, LIKE THE SESSIONS BLOCK, AND FOR THE SAME REASON
 * ---------------------------------------------------------------------------------------
 *
 * A planning route that is down must not blank the attention section below, and an attention
 * section that is fine must not imply the plan was read. This band says what it could not read in
 * its own space, and the rest of the page is untouched.
 */
function DayBand({ reloadKey, projectName, homeRung, onRetry }: { reloadKey: number; projectName: (id: string) => string; homeRung: Rung; onRetry?: () => void }) {
  // FROM THE DAY THIS PAGE LOAD HOLDS, so Home opened again draws it at once. Without it the band drew
  // "Loading today, this week and your work…" on every return to Home and replaced it a moment later
  // with the answer the read already held. A day from an earlier page load is never drawn under Today:
  // a reload reads first, and a failed read offers Today's own retry (round 55 of wave 13y).
  const [state] = useSharedRead(readDayOnce, [reloadKey], { startFromHeld: true })
  if (state.status === 'loading') {
    return <section {...declaredAttributes({ surface: 'home.today' })} className="hm-section hm-today" data-home-section="today"><h2 className="hm-section-title">{t('home.today')}</h2><Loading label={t('home.readingPlan')} rows={3} /></section>
  }
  if (state.status === 'error') {
    return <section {...declaredAttributes({ surface: 'home.today' })} className="hm-section hm-today" data-home-section="today"><h2 className="hm-section-title">{t('home.today')}</h2><ErrorNote message={t('home.planFailed')} retry={onRetry} /></section>
  }

  const { today } = state.value
  const words = { today: dayWords(today) }

  return (
    <section {...declaredAttributes({ surface: 'home.today' })} className="hm-section hm-today" data-home-section="today">
      <header className="hm-section-head"><h2 className="hm-section-title">{t('home.today')}</h2></header>
      {/* THE WEEK'S HOURS ARE ON THE PLAN PAGE, and Home draws only today. */}
      <div {...declaredAttributes({ surface: 'home.today.day' })} className="hm-day-top">
        <div className="hm-day-date">
          <h3>{todayTitle(today.day)}</h3>
          {/* NOTHING ON TODAY DRAWS NOTHING UNDER THE DATE: the week above already leaves today with nothing beside it. */}
          {words.today.nothingOn ? null : <p className="hm-period-note">{words.today.lead}</p>}
        </div>
        {/* NO HOURS SET FOR TODAY DRAWS THE PRESS ALONE, which already says they are not set. */}
        <p className="hm-day-capacity">
          {words.today.holdsUnset ? <RouteLink to="/plan" className="hm-say-how">{t('home.sayHowMany')}</RouteLink> : <span>{words.today.holds}</span>}
        </p>
      </div>

      {today.allocations.length === 0 ? null : (
        <ul className="hm-agenda">
          {today.allocations.map(({ allocation, work }) => {
            const given = allocation.plannedHours === null
              ? <Absence tier="told-apart" looked={false} word="—" title={t('home.notSizedWhy')} />
              : <><span>{count(allocation.plannedHours)}</span><small>{t('home.hourShort')}</small></>
            const copy = work === null ? (
              <span className="hm-agenda-copy"><span className="hm-row-title">{t('home.deletedWork')}</span><span className="hm-row-meta">{t('home.deletedHours')}</span></span>
            ) : (
              <span className="hm-agenda-copy">
                <span className="hm-row-title">{content(workAtHomeLength(work, homeRung))}</span>
                <span className="hm-row-meta">{content(projectName(work.workspaceId))}{work.within === null ? null : ` · ${content(work.within)}`}</span>
              </span>
            )
            const stateMark = work === null || work.state === null ? null : <span className="hm-agenda-state"><StoredState state={work.state} source={work.stateSource} progress={progressOf(work.state)} kind={work.kind} /></span>
            return (
              <li className="hm-agenda-item" key={allocation.id}>
                {work === null ? (
                  <div className="hm-agenda-link"><span className="hm-hours">{given}</span>{copy}</div>
                ) : (
                  <a className="hm-agenda-link" href={`#${recordPath(work.id)}`} onClick={() => setWorkspace(work.workspaceId)}>
                    <span className="hm-hours">{given}</span>{copy}{stateMark}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {today.recurring.length === 0 ? null : (
        <p className="hm-recurring">
          {/* WHAT IS OFFERED FOR TODAY IS ONE PRESS AWAY: the plan of today draws each
              offer with its own press that puts it on today. */}
          {t('home.recurringToday', { n: today.recurring.length })} · <RouteLink to={planTodayPath()} className="hm-link" data-home-goes="offers">{t('home.putOnToday')}</RouteLink>
        </p>
      )}
    </section>
  )
}

/**
 * The standing count as one line, so the version with a press behind it and the version without
 * cannot come to say different things.
 */
function StandingLine({ standing }: { standing: WorkStanding }) {
  // NOUGHT UNFINISHED IS AN ABSENCE AND IT GOES THROUGH THE ONE COMPONENT THAT DRAWS ONE. `looked`
  // is the difference the two zero branches were always about: with nothing unclassified Mole Office
  // read every state and there are none, and with some unclassified nobody wrote a state on part of
  // the corpus, so it cannot say. That is a shape, not an adjective a reader has to catch.
  if (standing.unfinished === 0) {
    return (
      <Absence
        tier={standing.cannotSay === 0 ? 'ordinary' : 'told-apart'}
        looked={standing.cannotSay === 0}
        title={t('home.standingNoneWhy')}
      />
    )
  }
  return (
    <>
      <strong>{standingLead(standing)}</strong>{' · '}
      {standing.unfinished === 0 ? null : (
        <span className="hp-standing-hours">
          {t('home.givenHours', { n: standing.withHours })}
        </span>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------- the page

/**
 * HOW OFTEN HOME READS ITSELF AGAIN. Question 8 of report n9Mjk3c_sJRu, answered as recommended
 * Home updates itself every minute, so the Recheck press goes. The foot line
 * that said when it last read is gone too: Home reads itself again without saying so.
 */
export const HOME_REREAD_MS = 60_000

/**
 * A PLAN'S DAY KEY AS A DAY, by the office's one day formatter: "3 Oct", "10 月 3 日". Home wrote the keys
 * themselves ("2026-10-03") until wave 13q's round 28. A key that is not a day is drawn as it came.
 */
function dayOrAsItCame(day: string): string {
  const at = readDayKey(day)
  return at === null ? content(day) : dayInThePageLanguage(at, false)
}

/** Home's today: "Today, 3 Oct", "今天，10 月 3 日". */
export function todayTitle(day: string): string {
  return t('home.todayDated', { day: dayOrAsItCame(day) })
}

/** Home's this week, spaced by the office's rule where a day meets Chinese: "本周，9 月 28 日至 10 月 4 日". */
export function weekTitle(from: string, to: string): string {
  return wordWithSpacedValues(t, 'home.weekDated', { from: dayOrAsItCame(from), to: dayOrAsItCame(to) })
}

/** The day under Home's title, in the page's language, by the one formatter: "Monday 28 September", "9 月 28 日星期一". */
function dayUnderTheTitle(at: number): string {
  return writtenDay(new Date(at), { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Whether Home has read the list of projects since the page was loaded. */
let homeHasReadTheProjects = false

export function HomePage({ waiting, onWaitingChanged, attention, onAttentionChanged }: {
  waiting: AsyncState<WaitingReply>
  onWaitingChanged: () => void
  attention: AsyncState<AttentionHome>
  onAttentionChanged: () => void
}) {
  const inspect = useInspect()
  // THE MINUTE'S RE-READ. The frame holds the waiting door's and this project's attention readings,
  // and Home asks it to read both again; Today, the records and the developer parts re-read on `tick`.
  // The callbacks are held in a ref so a new function from the frame does not restart the timer.
  const [tick, setTick] = useState(0)
  const [readAt, setReadAt] = useState(() => Date.now())
  const [todayTries, setTodayTries] = useState(0)
  const readTodayAgain = useCallback(() => setTodayTries((n) => n + 1), [])
  const again = useRef({ onWaitingChanged, onAttentionChanged })
  again.current = { onWaitingChanged, onAttentionChanged }
  useEffect(() => {
    const timer = setInterval(() => {
      again.current.onWaitingChanged()
      again.current.onAttentionChanged()
      setTick((n) => n + 1)
      setReadAt(Date.now())
    }, HOME_REREAD_MS)
    return () => clearInterval(timer)
  }, [])
  // THE LIST OF PROJECTS, READ AGAIN EACH TIME HOME IS OPENED EXCEPT THE FIRST. On the first load the frame
  // has just asked for it, so Home takes that answer; asking again was the same answer fetched twice in one
  // load (round 19 of wave 13w).
  const [projects] = useAsync(() => {
    const read = homeHasReadTheProjects ? readWorkspacesOnce.again() : readWorkspacesOnce()
    homeHasReadTheProjects = true
    return read
  }, [], { keep: 'home.projects' })
  // THIS PROJECT'S PIPELINES THAT STAND STILL, for Late or stuck: every
  // unfinished step paused. Read from the records in Home's shape, as the old pipelines band did;
  // it is this project only, as that band was, and an earlier round's report says so.
  //
  // ONLY THE PIPELINES AND THEIR STEPS ARE ASKED FOR, not every record of the project. A pipeline's
  // steps are its `block` records, and `readPipelines` reads nothing else. Home asked for the whole
  // project every minute; on the office made up for round 31 of wave 13k that was 237 KB a minute,
  // most of it the project's runs and messages, for a band that draws at most four rows.
  const [records] = useProjectAsync(
    () =>
      Promise.all([api.listRecords('pipeline', 'home'), api.listRecords('block', 'home')]).then(([pipelines, steps]) => [
        ...pipelines.records,
        ...steps.records,
      ]),
    [tick],
    // AND READ AGAIN WHEN A PIPELINE OR A STEP CHANGES, at most once in 5 seconds (item 87 of wave 13y).
    { follows: { kinds: ['pipeline', 'block'], atMostEveryMs: 5000 } },
  )
  const stillPipelines = useMemo(
    () =>
      records.status !== 'ready'
        ? []
        : readPipelines(records.value)
            .pipelines.filter((pipeline) => standsStill(pipeline.blocks) !== null)
            .map((pipeline) => ({
              id: pipeline.record.id,
              title: pipeline.record.title,
              workspaceId: pipeline.record.workspaceId,
              line: pipelineLine(pipeline.blocks),
            })),
    [records],
  )
  const homeDetail = useDetail('home', null)
  const projectName = useMemo(
    () => projectNameOn(projects.status === 'ready' ? projects.value : null),
    [projects],
  )
  // REPORTS ARE A PART ONLY WHEN THE PROJECT HOLDS ONE. The office's answer counts the reports waiting and the ones
  // already read; when both are none, the part is not drawn at all rather than drawing a dash. While the answer is on
  // its way nothing is drawn there yet, and when it failed the part says why, both as before.
  const reportsHeld = attention.status === 'ready'
    ? attention.value.reportCounts.waiting + attention.value.reportCounts.read
    : null

  return (
    <HomeSections
      title={t(RAIL_WORD_KEYS['rail.home'])}
      waiting={waiting}
      attention={attention}
      homeRung={homeDetail.rung}
      projects={projects}
      stillPipelines={stillPipelines}
      // THE PAUSE NOTICE STANDS ABOVE THE PARTS, so a moved Schedule never carries it out of sight.
      pause={<OfficePauseNotice tick={tick}/>}
      today={<><ScheduleWeek again={tick + todayTries} projectName={projectName} onRetry={readTodayAgain} /><ProgressCard tick={tick} /><DayBand reloadKey={tick + todayTries} projectName={projectName} homeRung={homeDetail.rung} onRetry={readTodayAgain} /></>}
      // A PROPOSAL TO MAKE AN AGENT A PERMANENT RESIDENT, with the person's Confirm and Not now on its row.
      presses={<ResidentProposals onAnswered={onWaitingChanged} />}
      projectName={projectName}
      // THE THISPROJECT LINE'S PLACE. The drawing's line under the title says the day and that Home is
      // about all projects; every part that reads one project names it (claims, the reports band's
      // project, the project cards).
      lead={t('home.leadLine', { day: dayUnderTheTitle(readAt), scope: t('home.leadAllProjects') })}
      // THE REPORTS WAITING FOR THE PERSON, capped at five (REPORTS_SHOWN).
      // They read this project's attention answer, as the old band did. A REPORT MARKED READ IS THE READER'S
      // ACT, so the answer that takes its row out is asked at once and not at the pace of Home's minute.
      reports={
        attention.status === 'ready'
          ? reportsHeld === 0
            ? null
            : <ReportsForYou reply={attention.value} onMarkedRead={() => { hurryTheAttentionHomeAsk(); onAttentionChanged() }} />
          : attention.status === 'error'
            ? <ErrorNote message={t('home.reportListMissing')} fault={attention.fault ?? null} retry={onAttentionChanged} />
            : null
      }
      // WHAT HAS BEEN SAID AND THE QUESTIONS ABOUT THE RECORDS ARE ONE PRESS AWAY in Developer mode, each on its own
      // page. What is running is on the Agent runs page.
      developer={
        inspect ? (
          <p className="hm-elsewhere">
            <RouteLink to={pathFor('said')} className="hm-section-link" data-home-goes="said">{t('home.said')}</RouteLink>
            {' · '}
            <RouteLink to={pathFor('recordquestions')} className="hm-section-link" data-home-goes="recordquestions">{t('home.questions')}</RouteLink>
          </p>
        ) : null
      }
    />
  )
}

export function projectsWithWork(
  here: string,
  records: number,
  workspaces: readonly { id: string; title: string; records: number }[],
): { id: string; title: string; records: number }[] {
  // BOTH HALVES, and the second is why an empty database gets no banner: there is nothing to send
  // a reader to, so the sentence would be a complaint rather than a way out.
  if (records > 0) return []
  return workspaces.filter((w) => w.id !== here && w.records > 0).sort((a, b) => b.records - a.records)
}

/**
 * WHICH PROJECT THE TWO BANDS BELOW ARE ABOUT, and where the work is when this one holds none.
 *
 * TWO STATES, ONE COMPONENT, because they are one fact said at two strengths. Normally it is one
 * quiet line naming the project, how many projects there are, and — when nobody chose this one —
 * why Mole Office opened it. When this project is empty and another has work in it, the same fact is the
 * most important thing on the screen and gets a panel with the way out on it.
 *
 * IT DOES NOT FETCH. `HomePage` reads the list of projects once and hands it here, so this and the
 * day band above cannot end up with two different names for one project.
 *
 * THE "WHY THIS PROJECT" SENTENCE COMES FROM `workspaceOpenedNote()` IN lib/workspace.ts, which is
 * module state and not a prop, because the interface that would have carried it as a prop is thrown
 * away by the very switch it describes. That header says what was observed.
 */
/**
 * WHAT TO CALL A PROJECT ON THIS PAGE: the title once the installation names it, the id until then.
 *
 * TWO READERS, IN ORDER, AND NEITHER IS A COPY OF THE OTHER. `workspaceSight` is the app frame's own
 * reader and answers "what does this browser know about this project"; `projectName` is the one
 * function that turns that into the words on a screen. Going through both means the day rows here,
 * the sidebar and the phone bar cannot end up spelling one project three ways — which they did:
 * this page read the stored title straight off the registry while `projectName` was renaming one
 * project, so Home and the sidebar disagreed. Problem `YP_OaLwgMk-j`.
 *
 * EXPORTED so it can be tested without a server. The day band is drawn from a fetch and cannot be
 * rendered on its own; this is the whole of what it does with a project's name.
 */
export function projectNameOn(listed: WorkspacesReply | null): (id: string) => string {
  return (id: string) => { const title = workspaceSight(id, listed).title; return title === null ? t('decisions.unnamedProject') : content(onScreen(id, title)) }
}

/* Exported for the same reason `projectNameOn` is: it is one of the places that used to draw a
   project's name without coming through the one function, and a test has to be able to draw it. */
export function ThisProject({ records, projects }: { records: number; projects: WorkspacesReply | null }) {
 const sight = workspaceSight(currentWorkspace(), projects)
 const here = sight.title === null ? t('decisions.unnamedProject') : content(onScreen(sight.id, sight.title))
 const elsewhere = projects === null ? [] : projectsWithWork(currentWorkspace(), records, projects.workspaces)
 return <div className="hp-scope">
   <p>{t('home.projectScope', { name: here })}</p>
   {records === 0 ? <span {...declaredAttributes({ surface: 'home.empty' })}><Absence title={t('home.projectEmpty')} /></span> : null}
   {elsewhere.length === 0 ? null : <div className="hp-empty-picks">{elsewhere.map(one => <Btn key={one.id} onClick={() => setWorkspace(one.id)}>{content(onScreen(one.id, one.title))} · {one.records}</Btn>)}</div>}
 </div>
}

// ---------------------------------------------------------------------------- styles

/**
 * This page's own geometry, carried in the component.
 *
 * React 19 hoists a `<style href precedence>` into the head and de-duplicates it by href, so this
 * is one style element however many times the page renders. It is here rather than in styles.css
 * because that file belongs to another agent this phase — and every value below is a token, so a
 * preset swap still reaches all of it.
 *
 * WHAT WAS REMOVED WITH THE OLD PAGE, so nobody goes looking for it: `.hp-bar`, `.hp-pipe` and
 * `.hp-more` belonged to the OLD modules panel — every module on file, each with a progress bar and
 * a "show all" fold. That panel was right to go: it was a page of progress bars answering a
 * question Home does not ask.
 *
 * WHAT CAME BACK IS NOT THAT PANEL. components/ModulesPanel.tsx draws four or five modules chosen
 * by a rule printed on its own face, two facts each, and a link to all of them. It answers "what am
 * I in the middle of", which is not "what needs me now" and is not ranked against it — and it has
 * no bars, because a bar is what the old one spent the page on.
 *
 * `.hp-steps` is back and is NOT what it used to be. It used to be a row of labelled chips, one per
 * step, which is a whole-page answer to a question Home asks in passing; it is now a fixed-width
 * strip of segments carrying the same states, drawn small enough that eight of them read as a
 * column. The chips themselves live on the pipeline page.
 *
 * EXPORTED so a test can check the two facts about the strip that no screenshot makes obvious: that
 * it is a fixed width whatever the step count, and that all five step states are drawn. A strip
 * sized by its contents would stop being comparable down the column and nothing would say so.
 */
export const HOME_CSS = `
/* The two regions stack, at every width. There is no arrangement to choose and none to store: the
   day band is first because it says what needs doing today, and the smaller blocks follow it. The
   questions — paused, unclassified, no state at all — are the LAST block in that band, because
   they are questions about what a record says and not answers to "what needs me now". */
.hp-project { display: inline-flex; max-width: 100%; }
.hp-project .px-tag { overflow-wrap: anywhere; white-space: normal; }
html:not([data-mode="inspect"]) .hp-page :is(.rid-card, .rid-text) { display: none; }
.hp-page { display: flex; flex-direction: column; gap: var(--gut); }

/* NO BACKTICKS ANYWHERE IN THIS STRING -- it is a template literal, and one closes it. */

/* ---- BAND 0. TODAY AND THIS WEEK: two equal columns inside one panel.
   The same two rules the "Also" strip below is built on, and for the same measured reasons: equal
   tracks with a zero minimum, so a long piece-of-work name wraps inside its own column instead of
   pushing the one beside it off the screen; and align-items: start, so the week does not inherit
   the height of a day with six things on it. */
.hp-day {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: var(--pad-lg);
  min-width: 0;
}
@media (min-width: 900px) {
  .hp-day { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.hp-day-col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
/* A COLUMN HEADING, NOT A PANEL TITLE. Two panels inside a panel would be two borders saying what
   one heading says -- the rule the "Also" columns already follow. */
.hp-day-head {
  margin: 0;
  color: var(--text);
  font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
}
.hp-day-rows { display: flex; flex-direction: column; min-width: 0; }
/* WHICH PROJECT THIS HOUR BELONGS TO, on every row, because this band spans all of them. It is the
   first thing in the row's quiet line: an afternoon holding an hour of two different projects is
   the fact a person-level plan exists to show, and it cannot be read off the names alone. */
.hp-day-where, .hp-day-within {
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.hp-day-where + .hp-day-within::before { content: " · "; }
/* A DELETED RECORD ON THIS WEEK. It carries the separator its neighbours carry, so it cannot run
   into the project's name again, and it is inked as a thing to act on rather than as quiet meta:
   somebody has hours on a week for work that is not there any more. */
.hp-day-gone {
  color: var(--st-failed);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.hp-day-where + .hp-day-gone::before, .hp-day-within + .hp-day-gone::before { content: " · "; }
.hp-day-gone-do { font-weight: 400; color: var(--text-2); }
/* NOT A ZERO, and it is the shared absence mark that says so now. An allocation with no hours is
   somebody planning to work on this without saying for how long, and drawing it as 0 would say they
   looked and decided it takes no time. It used to be italic grey words written here; the class is
   gone because the mark carries the meaning and carries it the same way on every page. */
.hp-day-holds, .hp-day-unset {
  margin: 4px 0 0;
  color: var(--text-2);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
/* THE LABEL BESIDE THE MARK IS A LABEL, so it is ordinary quiet ink. It used to be the inferred
   amber, because the whole sentence "Nobody has said how many hours today holds." lived here and
   the ink was what marked it as Mole Office talking about its own reading. The mark says that now — the
   dashed edge and the word — and inking the words "Hours today" as well would be the same fact
   drawn twice, in the one channel this product spends carefully. */

/* ---- THE STANDING COUNT, under both columns.
   It is what stops an empty week reading as an empty life, so it is full width, it is drawn on
   every visit, and it is the same size as the two leads above it rather than a footnote. */
.hp-standing {
  margin: var(--pad-lg) 0 0;
  padding-top: var(--pad);
  border-top: 1px solid var(--border);
  color: var(--text-2);
  font: var(--fs-2)/var(--lh-body) var(--font-ui);
  overflow-wrap: break-word;
}
.hp-standing strong { color: var(--text); font-weight: 700; }
.hp-standing b, .hp-standing .num { color: var(--text); font-variant-numeric: tabular-nums; }
.hp-standing-hours { color: var(--text-2); }
/* WHAT MOLE OFFICE COULD NOT CLASSIFY, AND WHAT A CUT LIST LEFT OUT. Quieter than the count, because
   neither changes what a reader does next -- but never absent, because an unstated gap is a count
   read as complete. */
.hp-standing-gap {
  margin: 4px 0 0;
  color: var(--st-inferred);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.hp-standing-gap b { font-variant-numeric: tabular-nums; }
/* THE STANDING COUNT CARRIES A PRESS NOW, so it is a block rather than a paragraph, and the way to
   all of your work is the line under it. Forcing the press inline was tried and it broke: the
   summary is a flex row of two parts by design, and inlining it put the label on its own line with
   an empty box under it. */
.hp-standing-link { margin: var(--pad) 0 0; }
.hp-standing-plain { margin: 0; }

/* ---- WHEN THIS BAND WAS READ, AND THE PRESS THAT READS IT AGAIN. Quiet: it is a fact about the
   reading and not about the work, and it belongs under everything the reading produced. */
.hp-day-read {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--pad);
  margin: var(--pad) 0 0;
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}

/* ---- WHICH PROJECT THE BANDS BELOW READ. One line, quiet, on every visit. It names the selected
   project after a switch, so the reader can tell which workspace the Home bands describe. */
.hp-scope {
  margin: 0;
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.hp-scope strong { color: var(--text-2); font-weight: 600; }
/* WHY THIS PROJECT, WHEN NOBODY CHOSE IT. Louder than the line it sits in, because a browser that
   moved you has to say so where you will read it, not where you might. */
.hp-scope-opened { color: var(--text); font-weight: 700; }

.hp-empty-note { margin: 0 0 var(--pad); color: var(--text-2); font-size: var(--fs-2); }
.hp-empty-note + .hp-empty-picks { margin-bottom: var(--pad); }
.hp-empty-picks { display: flex; flex-wrap: wrap; gap: var(--gut); }

/* ---- BAND 3. THE "ALSO" STRIP: three equal columns inside ONE panel.
   WHAT IT REPLACED, MEASURED: a masonry of five full panels with about 510px of dead page in it,
   because two blocks shared a grid row and the row was as tall as the taller one; at 577px of
   column width a record title wrapped to seven lines of four words.
   EQUAL TRACKS, NOT auto-fit, and the 0 minimum is what does the work: three 1fr tracks that may
   shrink to nothing means a long title wraps inside its own column instead of pushing the two
   beside it off the screen. The columns stack below the desk width, in reading order.
   THE HEIGHTS ARE INDEPENDENT. align-items: start rather than stretch, so a column with two rows
   is two rows tall and does not inherit the height of the one with five -- which is the exact
   failure the masonry had. */
.hp-also {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: var(--pad-lg);
  min-width: 0;
}
@media (min-width: 900px) {
  .hp-also { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.hp-near { min-width: 0; }
.hp-also-col { container: panel / inline-size; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
/* A COLUMN HEADING, NOT A PANEL TITLE. Three panels inside a panel would be three borders saying
   what one heading says, so there is no card, no elevation and no eyebrow here. */
.hp-also-head {
  margin: 0;
  color: var(--text);
  font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
}
.hp-also-lead { min-width: 0; }
.hp-also-body { min-width: 0; }
.hp-also-rows { display: flex; flex-direction: column; min-width: 0; }
.hp-also-foot { min-width: 0; padding-top: 2px; }
/* The severity column is FIXED FURNITURE at 112px, which is a third of a 373px track. In this band
   it sizes to its own chip instead, so a row with no chip spends nothing and a row with one spends
   exactly what the word needs. Zeroing it was tried and was wrong: a pipeline row draws a state
   chip into that column and it overflowed the title beside it. */
.hp-also .px-row { --px-col-sev: auto; }
.hp-also .px-row-sev:empty { display: none; }

/* ---- A ScanRow IN A 373px COLUMN IS A PHONE-WIDTH ROW, AND IS DRAWN AS ONE.
   ui.tsx lays a ScanRow out as three grid tracks -- severity, title, and a right-hand track holding
   the age and the words that name what opens. The third track is auto-sized, and "the field, the values
   and the session" does not shrink: measured at 1440 in this column, the third track took 228px of
   373, the severity column took 78 more, and the TITLE was left with 30px -- one character per
   line, 520px tall, five times down the column, which is 4,612px of change log in a band whose
   whole discipline is five rows.
   ui.tsx already has the right answer to a narrow ScanRow and applies it below 480px. This is the
   same answer, applied where the COLUMN is narrow rather than where the window is; the values are
   copied deliberately rather than reached for, because a container query on a track this file does
   not own would be a second opinion about what "narrow" means.
   NO BACKTICKS IN THIS BLOCK -- it is a template literal, and one closes the string. */
.hp-also .px-scan { --px-col-sev: 0px; }
.hp-also .px-scan-sum { grid-template-columns: minmax(0, 1fr) auto; }
.hp-also .px-scan-sev:empty { display: none; }
.hp-also .px-scan-sev, .hp-also .px-scan-main { grid-column: 1 / -1; }
.hp-also .px-scan-age { grid-column: 1; text-align: left; }
.hp-also .px-scan-open { grid-column: 2; }
.hp-also .px-scan-body { padding-left: var(--pad); }
.hp-also .px-scan-holds, .hp-also .px-explain-holds { border-left: 0; padding-left: 0; }
/* The change log's own lead wraps rather than holding an intrinsic width it cannot have here. */
.hp-also .px-scan-lead { flex: 0 1 auto; min-width: 0; }

/* WHAT A RUNNING SESSION IS DOING, CLAMPED TO ONE LINE, and the clamp is not cosmetic: the doing
   field is free text an agent wrote, one of them held a 900-character status report, and in a
   373px column it set one character per line and made this column 1,283px tall. The whole string
   stays in the DOM and on the row's tooltip. */
.hp-doing, .hp-read {
  display: block;
  min-width: 0;
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hp-read { overflow: visible; white-space: normal; }
/* WHAT A CAP CUT, EXACTLY, wherever one is applied. Never the bare word "more". */
.hp-more {
  margin: 4px 0 0;
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.hp-more b, .hp-more .num { color: var(--text-2); font-variant-numeric: tabular-nums; }

/* ---- THE SESSIONS BLOCK, AS ONE LINE.
   It was 928px of transcript excerpts, a six-way tally, a five-line breakdown of where the server
   looked, a read stamp and a Read again button -- a compressed copy of the sessions page on a page
   that asks a different question. What is left is the counts, each of them a link into the page
   that can actually do something about them. */
.hp-sessline {
  margin: 0;
  color: var(--text-2);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  overflow-wrap: break-word;
}
.hp-sess-part + .hp-sess-part::before { content: " · "; color: var(--text-3); }
.hp-sessline b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
/* NOT A ZERO. A reply that carried no sweep does not answer "is anything running that no session
   claims", and this is what stands where a clean bill would otherwise be read. */
/* NO INK RULE FOR THE UNSWEPT PART. It used to be the inferred amber, because the sentence "nobody
   looked for processes with no agent run" was plain words in this line and the ink was the only
   thing marking it as different from the counts beside it. It is the shared absence mark now, which
   brings its own tone and its own dashed edge, and a colour written here as well would be one fact
   drawn in two places — the one free to disagree the day the mark's tone changes. */
.hp-sess-quiet { color: var(--text-3); }
.hp-sess-quiet b { color: var(--text-3); }
/* The server qualifying its own sweep. The inferred rail and ink, not the failed tone: nothing is
   broken, and the loudest colour on this page means a person could be hurt. */
.hp-warn {
  margin: 4px 0 0;
  padding: 2px var(--pad);
  border-left: var(--rail) solid var(--st-inferred-line);
  color: var(--st-inferred);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  overflow-wrap: break-word;
}

/* The fold that stands where "Since you last looked" used to print six lines of the server's
   paragraph. Only its FIT is set here — the component is the app's shared Explain, so this block
   cannot drift into a fourth kind of disclosure. It sits inside a panel that already has padding,
   so it gives its own horizontal padding back and keeps a gap under itself before the rows. */
.hp-since { margin: 0 0 var(--gut); }
/* The Explain body already sets its own padding and gap, so the paragraphs inside it give theirs
   back. Without this the server's sentence sits indented twice and a full line lower than the
   fold that opened it. */
.hp-since .hp-note { margin: 0; padding: 0; }

.hp-note {
  margin: var(--gut) 0 0;
  padding: 0 var(--pad);
  max-width: var(--measure-in-box);
  color: var(--text-3);
  font: var(--fs-1)/1.72 var(--font-ui);
}
.hp-note b { color: var(--text); font-weight: 700; }
.hp-note code, .px-empty code { font-family: var(--font-mono); font-size: .95em; }
.num { font-variant-numeric: tabular-nums; }

/* ---- one row in the change log.
   THE SEVERITY COLUMN HOLDS THE ACTOR HERE. A change has no severity, and that column is the only
   fixed one a row has -- so it carries the thing every row of this block is scanned by, and
   "agent" lines up under "agent" down the page. It is much narrower than a state chip needs,
   because one word is all it ever holds. */
.hp-since-rows .px-scan { --px-col-sev: 78px; }
/* What the write was, in two or three words, in front of the title. The exact path is in the fold:
   this says which part of the record moved, and the title says which record. */
/* It WRAPS, and that is not a detail: .px-scan-lead is flex: none, so a gist that refused to wrap
   could not shrink either, and "changed parts, summary, context" would push a 390px row off its
   own screen. NO BACKTICKS IN THIS BLOCK -- it is a template literal, and one closes the string. */
.hp-gist {
  min-width: 0;
  color: var(--text-2);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  overflow-wrap: break-word;
}
/* The originals, inside the fold, one per row the log actually wrote. */
.hp-raw { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.hp-raw-one { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hp-raw-verb {
  color: var(--text);
  font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
  overflow-wrap: anywhere;
}
/* The sentence that says what the one row stands for. It sits above the originals it is about. */
.hp-collapsed { margin: 0; padding: 0; }

/* ---- one pipeline's steps, in order, in the right-hand cell.
   The strip and the exact count sit together: the strip says what SHAPE the run is in and the
   number says exactly how much of it is done, and neither is a substitute for the other. */
.hp-prog { display: flex; align-items: center; gap: var(--pad); font-variant-numeric: tabular-nums; }
/* FIXED WIDTH, whatever the step count, so a five-step pipeline and a twelve-step one can be
   compared straight down the column. The segments share the width between them. */
.hp-steps { display: flex; align-items: flex-end; gap: 2px; width: 84px; height: 12px; flex: none; }
.hp-step { flex: 1 1 0; min-width: 2px; border-radius: 1px; }
/* HEIGHT AND PATTERN CARRY THE STATE AS WELL AS COLOUR. Print this page in greyscale and the five
   step states are still four different silhouettes and two different hatches — the same rule the
   state glyphs follow in ui.tsx, and the reason no state in this product is colour alone. */
.hp-step[data-state="todo"] { height: 3px; background: var(--st-todo-line); }
.hp-step[data-state="doing"] { height: 7px; background: var(--st-doing); }
.hp-step[data-state="done"] { height: 12px; background: var(--st-done); }
/* THE TWO STOPPED STATES ARE HATCHED, NOT RED. Eight pipelines drawn together put a column of
   alarm-coloured segments beside each other, all about work that stopped at some point rather than
   about anything owed today. The hatch angle already separates failed from blocked in greyscale, so
   nothing is carried by colour here and no channel is lost by giving it up. */
.hp-step[data-state="failed"] {
  height: 12px;
  background: repeating-linear-gradient(135deg, var(--text-2) 0 2px, var(--panel-3) 2px 4px);
}
.hp-step[data-state="blocked"] {
  height: 12px;
  background: repeating-linear-gradient(0deg, var(--text-2) 0 2px, var(--panel-3) 2px 4px);
}

.hp-link {
  color: var(--accent);
  font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
  text-decoration: underline;
  text-underline-offset: .16em;
}

/* THE STRIP IS GIVEN BACK WHEREVER THE ROW IS NARROW, and a 373px column in the "Also" band is
   narrow whatever the window is. Measured at 1440: with the strip in that column a pipeline title
   wrapped to four lines to make room for 84px of picture. The exact count and the step sentence
   are both still on the row, so what is lost is the SHAPE of the run — which is what the pipeline
   page is for, and the link to it is under these rows. */
.hp-also .hp-steps { display: none; }
`
