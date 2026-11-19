// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { consumePreparedPage, peekPreparedPage } from '../lib/prepared-page.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import { UsageReceipt } from '../components/UsageReceipt.tsx'
import { FlowRunSteps } from '../components/FlowRunSteps.tsx'
import { ModulePlanningPanel } from '../components/ModulePlanningPanel.tsx'
import { FlowReasons } from '../components/FlowReasons.tsx'
import { DecisionBasis } from '../components/DecisionBasis.tsx'
import { FileAsMyWords, TheMarkOnADecision } from '../components/TheirOwnWords.tsx'
import type { UsageReceipt as RuntimeReceipt } from '../../shared/usage-receipts.ts'
import type { PickUpCost } from '../../shared/pick-up-cost.ts'
/**
 * One record, everything about it: its own fields, its links both ways, and its history.
 *
 * The page's requests all leave together and are awaited together (see `useAsyncRecord`), so what
 * you see is one consistent moment rather than three answers that might disagree.
 *
 * THE HISTORY IS FETCHED SEPARATELY, AND THAT IS THE POINT. `GET /api/records/:id` does return
 * `changes`, and this page used to draw them from there — rows carrying a session RECORD ID and
 * nothing to turn it into a name. `GET /api/changes?recordId=` sends the same rows WITH the
 * `sessions` block that resolves each one to its session record and title, so that is what is
 * asked for and components/ChangeLog.tsx is handed both halves. The whole app draws a change row
 * with that one component; this page used to have its own, and so did ModuleView.
 *
 * TWO THINGS THIS PAGE DOES ON PURPOSE, both of them refusals to hide something:
 *
 *   Deleting does not navigate away. The record stays on screen with an alarm banner and a
 *   restore button, because a soft delete is a state a record is IN, not a disappearance.
 *
 *   A kind with no bespoke view still shows every field it stores. `module` is the only kind
 *   with a designed page so far; the rest render their `data` as it sits in the database, which
 *   is honest about what exists. A blank page would not be.
 *
 * ---------------------------------------------------------------------------------------
 * READING IS WHAT THIS PAGE OPENS AS
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING ON A RECORD YOU ARE READING CAN BE TYPED INTO OR CHOSEN FROM. This page was the clearest
 * place in the product where that was not true: it had an Edit button at the top right AND a live
 * "where it stands" dropdown a few inches below it, so it taught a rule and then broke it.
 *
 * `#/r/<id>` reads. `#/r/<id>/edit` is the same record with its facts turned into fields, in the
 * same panels, in the same order. The state is in the address, so Back leaves editing and every
 * fresh visit is reading. Nothing remembers that you were editing.
 *
 * THREE THINGS ARE STILL PRESSES WHILE READING, because a press records one fact and says what it
 * recorded: ticking a checklist item on a module, deciding a fork, and the deadline panel's own
 * questions. THE DEADLINE PANEL'S CONTROLS WERE A CHECKBOX AND A DROPDOWN AND ARE NOW PRESSES —
 * they save nothing and never did, but a box on the screen is the signal this pass spends, and
 * spending it on a thing that writes nothing would cost it everywhere else.
 */

import { useId, useRef, useState, useEffect } from 'react'
import { peekPreparedRecord, consumePreparedRecord, recordPageKeepName } from '../lib/prepared-record.ts'
import { content, LANGUAGES, listJoined, t, WORD_LISTS, writtenMoment, type WordKey } from '@shared/i18n.ts'
import { theNameASelfRegistrationIsReadBy } from '@shared/profile.ts'
import { FLOW_RUN_KIND, FLOW_RUN_TITLE } from '@shared/flow-run.ts'
import { HOST_JOB_KIND } from '@shared/host-jobs.ts'
import { DRAFT_KIND, draftForOf, sentAsOf, sentAtOf } from '@shared/drafts.ts'
import { A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES, isATurnDraft, theOfficeWillSendThisTurnDraft, TURN } from '@shared/turn-drafts.ts'
import { theParticipantAStoredIdNames, writerNamed, type ParticipantsNamed } from '../lib/participant-lookup.ts'
import { THE_OFFICE_WRITER_ID } from '@shared/participants.ts'
import { theBranchedSummaryOnThePage } from '@shared/branched-agent.ts'
import { gapBetween, wordWithSpacedValues } from '@shared/spacing.ts'
import { familyWord, stateWord, linkWord, actorTypeWord, kindWord } from '@shared/words.ts'
import { isADoorTheListNames, whatThisDoorDoes } from '@shared/what-the-grant-carries-words.ts'
import { TieredPress } from '../components/TieredPress.tsx'
import { DecisionGovernance, DecisionHalves, ProposalGovernance } from '../components/Governance.tsx'
// THE PERSON'S PRESS ON A WAITING ASK, the same component the agent's page draws it with.
import { TheAskItself, ThePressOnAnAsk, TheGrantToWithdraw } from '../components/TheirCard.tsx'
import { kindDeclaresState, reportReading } from '@shared/attention.ts'
/* THE PRESS THAT SAYS A REPORT HAS BEEN READ, borrowed rather than written again. Home draws it on
   every report waiting for somebody; this page is the other place a person meets one, and two
   presses recording one fact would be two wordings of what was recorded. */
import { MarkRead } from '../components/AttentionPanel.tsx'
// THE ONE READER OF WHAT A RECORD IS PART OF. This page used to filter its own `part_of` links,
// which saw one of the three stores Mole Office keeps containment in — see the note on
// `WhereThisSits` below for what that got wrong on screen.
import { parentOf, type Containment, type ContainmentContext } from '@shared/containment.ts'
import { DEADLINE_GAP_SENTENCES, type DeadlineOutlook } from '@shared/deadlines.ts'
import { CHAPTERS_READ } from '@shared/chapters.ts'
import { joined } from '@shared/zoom.ts'
import type { TitleOption } from '@shared/blocks.ts'
// WHAT THIS RECORD SPENT — criterion T2. The shape and the words come from the shared file, so the
// panel and the reader that fills it cannot disagree about either.
import type { SpentOnThis } from '@shared/spent.ts'
import {
  KIND_SPECS,
  REPORT_READ_ANSWERS,
  SHAPE_SPECS,
  completenessOf,
  recordIncompleteness,
  declaredTypeOf,
  OBLIGATION_STATES,
  type FieldSpec,
  type Incompleteness,
  type MoveActor,
  type ObligationState,
} from '@shared/kinds.ts'
import { GRAINS, type Grain } from '@shared/planning.ts'
/* WHERE A LENGTH SITS ON THE LADDER, and the reader's own choice of how much a report says.
   The *Shorter forms* panel follows the length the report body is drawn at, and it reads that
   length through the same hook the body reads it through. */
import { FLOORED_KIND, FLOORED_SURFACE, RUNG_SPECS, type DetailSource, type Rung } from '@shared/detail.ts'
import type { WaitingReply } from '../../server/api/waiting.ts'
import { RESOLVES_PROPOSAL, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { UNASSIGNED_WORKSPACE, type WorkspaceReading } from '@shared/workspaces.ts'
// THE NAME OF A SURFACE, so the breadcrumb for a kind read on a page of its own prints the same
// words the rail row does rather than spelling "Messages" a second time here.
import {
  DUE_STANDING_SENTENCES,
  thePageAKindIsReadOn,
  familyOf,
  isSafety,
  progressOf,
  readConsequence,
  readDue,
  readFulfilment,
  readPause,
  readWorkState,
  whoseMoveNow,
  type Consequence,
  type Fulfilment,
  type Pause,
  type Progress,
} from '@shared/work.ts'
// THE THREE ATTRIBUTES THAT MAKE AN ELEMENT ADDRESSABLE, declared once in src/shared/targets.ts.
// THE WHOLE ARTICLE IS THE RECORD, so a right-click anywhere on this page talks about the record,
// and every element below that names a stored string makes the words inside it quotable. Nothing
// here calls a hook: one listener at the document reads the attributes. See agent/pointing.ts.
import { spanNamedBy, targetAttributes, textAttributes } from '@shared/targets.ts'
import { inlinePieces } from '@shared/inline.ts'
// THE KEY A RECORD'S SHORTER FORMS ARE STORED UNDER, from the one declaration that spells it, and
// the phrase that says who wrote one and when. That phrase is written once, in the shared file, so
// this panel and the report's own opening line cannot word one stored fact two ways.
import { SHORT_FORMS_FIELD } from '@shared/zoom.ts'
// WHAT A RECORD PAGE IS MADE OF. The sections a kind declares, the fields its headline already
// answers, and the fields that are machinery rather than reading matter — one declaration, read
// here to draw the body and read in `src/shared` to derive the regions a press walks.
import {
  EFFORT_KEY,
  bodyHeading,
  englishHeading,
  filledBodySections,
  ATTEMPTS_KEY,
  CHANGES_KEY,
  SPENT_KEY,
  DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL,
  HISTORY_KEY,
  IN_HEADLINE,
  isWritten,
  DECIDED_HERE_KEY,
  KINDS_WITH_COMPOSITION,
  LINKS_KEY,
  MADE_OF_KEY,
  MAY_EVOLVE_KEY,
  holdsDoors,
  namesAParticipant,
  namesAWriter,
  namesRecords,
  participantIn,
  writerIn,
  datedWordsIn,
  holdsDatedWords,
  holdsGovernedPlaces,
  NOT_BODY,
  OPEN_AROUND_KEY,
  READING_MATTER_KEY,
  relationGroups,
  SUMMARY_LINE_FIELD,
  SUMMARY_LINE_KEY,
  SYMPTOM_KEY,
  TOOL_USES_KEY,
  WHERE_IT_LIVES_KEY,
  WHERE_IT_SITS_KEY,
  WHOSE_MOVE_KEY,
} from '@shared/sections.ts'
// THE ONE WRITER OF A SHORT FORM'S REGION ID. The panel below, the report body and the region tree
// all spell it with this, so a comment left on one is found by the other two.
// WHAT A PANEL DRAWING ONE SECTION OF THIS RECORD SAYS IT IS, so a right-click on the panel lands
// on that section rather than walking past it to the whole record. See components/sections.ts.
import { sectionsOf, theLinkedRecord, theRegion, titleHere } from '../components/sections.ts'
import { theGovernedPlaces } from '@shared/governs.ts'
import { bodySectionsDeclaredBy, titleOfSection } from '@shared/sections.ts'
import { declaredAttributes, type Declares } from '../components/declares.ts'
import { DRAWS_THE_NAME } from '../components/agent/pointing.ts'
import { KeptLines } from '../components/KeptLines.tsx'
import { aCommentsNewWords } from '../api-parts/records.ts'
import { KEPT_FROM_TERMINAL } from '@shared/terminals.ts'
import { saveAnswer } from '@shared/save-answer.ts'
import {
  api,
  errorMessage,
  faultOf,
  getActor,
  moleOfficeRequest,
  type AnnotationView,
  type ChangesReply,
  type DataPatchOutcome,
  type ParticipantsReply,
  type RecordDetail as RecordReply,
} from '../api.ts'
// THE TYPE ONLY, which is erased at build time — the same way RecordHistory.tsx reads the revision
// ledger's shapes. The reader itself opens the database and never reaches the browser.
import type { LeftOutBucket, OpenLoop, OpenLoops } from '../../server/lib/openloops.ts'
import type { DecisionAbout as DecisionAboutThis, DecisionsAbout } from '../../server/lib/decisionsabout.ts'
// THE TYPE ONLY, for the same reason. The panel draws what the server worked out about an act made
// on the person's own words; nothing about it is re-derived here.
import type { ActOnTheirWords } from '../../server/lib/warrants.ts'
// WHERE A QUESTION AN AGENT ASKED THE PERSON IS, criterion P55. Type only.
import { sayWhereTheQuestionIs, type WhereTheQuestionIs } from '@shared/confirming.ts'
// Where each of the five shorter forms of one record stands, as the server answers it.
import type { ShortFormsReading } from '../../server/lib/zoom.ts'
// THE ONE MAP FROM A THING SOMEBODY POINTED AT TO THE PAGE HOLDING IT, and the one reading of
// whether a quote has moved under a comment. Both already serve the review pane. A comment's own
// page borrows them rather than working the same two facts out again, because a second copy would
// be free to send this page somewhere else and to word a stale quote another way.
// `ReadingBesideIt` is the third: what Mole Office made of a comment, with the press that changes it
// and the press that takes it away, worded once for the two screens it appears on.
import { pageHolding, ReadingBesideIt, rememberTheCardACommentWasOn, seenOnWords, staleWords } from '../components/agent/ReviewBar.tsx'
// The half that lights the exact words once the page holding them has drawn them.
import { showMeThat, stopShowing } from '../components/agent/MarkLayer.tsx'
import { ChangeLog, theModelOfAChange, theModelSaid } from '../components/ChangeLog.tsx'
// WHAT THIS RECORD HELD BEFORE, and the way to put one of those versions back. Four routes
// have answered for weeks and no screen had ever reached one of them.
import { RecordHistory, historyFieldName } from '../components/RecordHistory.tsx'
// WHO ELSE CHANGED THIS RECORD WHILE THE PERSON WROTE IN IT, and the choice on save.
import { AnotherWriterLine, useWriteThisRecord, WritingThisRecord } from '../components/AnotherWriter.tsx'
import { LinkPanel, type GatedLink } from '../components/LinkPanel.tsx'
// WHAT THIS RECORD MAY NOT BE USED TO CLAIM, from a reader an earlier piece of work built and nothing drew.
import { RestrictionsHere, RestrictionsStyle } from '../components/Restrictions.tsx'
// THE CHECK ON A RUN, in sentences a person reads. Criterion C27 and problem r0vUx5VGffP2: the API
// has answered all of this since 7 September and no page drew any of it, because every field it
// lives in is an object and the body draws objects only behind Inspect.
import { CheckPanelStyle, TheCheckOnARun } from '../components/TheCheckOnARun.tsx'
import { TheRunThatAskedForIt, TheWorkersOfARun } from '../components/TheWorkersOfARun.tsx'
// WHY A RUN STOPPED AND ITS WAIT ON A USAGE LIMIT: two object fields the body keeps behind Inspect, drawn in words.
import { TheStopOfARun, TheWaitOfARun } from '../components/TheStopAndWaitOfARun.tsx'
// THE PACKAGE, ON THE TASK'S OWN PAGE. Criterion F16. A task with no package draws nothing at all.
import { taskHasAPackage, TaskPackagePanel, TaskPackagePanelStyle } from '../components/TaskPackagePanel.tsx'
import { PackageWorkers } from '../components/PackageWorkers.tsx'
// AN EMERGENCY PUSH, WHOLE, ON ITS OWN PAGE (wave 13u round 88): who pushed, the line, the message, the switch, how it
// ended and the follow-up, which the body keeps behind Inspect or does not hold.
import { ThePushOnItsPage } from '../components/MergeQueuePush.tsx'
import { TheHostJobOnItsPage } from '../components/HostJobOnItsPage.tsx'
import { TheFixRoundOnItsPage } from '../components/MergeQueueFixRound.tsx'
import { TheSealInTheQueue } from '../components/MergeQueueAtTheSeal.tsx'
import { TheSubmitterOnItsPage } from '../components/MergeQueueSubmitter.tsx'
import { MoveToProject } from '../components/projects.tsx'
// THE ONE COMPONENT THAT DRAWS A RECORD ID, and the one place that decides where an id sits. This
// page is the reason it exists: an agent quotes an id, the owner opens the page the id names, and
// until now the page did not print the id anywhere a person could see, copy or Ctrl+F.
import { RecordId } from '../components/RecordId.tsx'
import { RoleCard } from '../components/RoleCard.tsx'
import { ActsOnYourWords } from '../components/OnYourWords.tsx'
import { WhoIsWorkingHere } from '../components/Claims.tsx'
import { holdsCode, WhereThisLives } from '../components/Implementation.tsx'
import { ToolUses } from '../components/ToolUses.tsx'
import { FieldList, ModuleView } from '../components/ModuleView.tsx'
// The blocks a report is made of are the blocks a module's curated summary is made of, drawn by
// the one component that draws them. The reading style is that component's own answer to how a page
// of blocks is set; nothing about the drawing is written here, and the list of styles is its list.
import {
  SummaryBlocks,
  type SummaryBlock,
} from '../components/SummaryBlocks.tsx'
import { ReportQuestions } from '../components/ReportQuestions.tsx'
import { answersOf } from '@shared/answers.ts'
// THE ONE READER OF A RECORD INTO WHAT THE DETAIL LADDER NEEDS. It is a browser-side accessor
// because `detailOf` refuses to read a database; every surface that draws a record at a position
// goes through it, so no page invents its own idea of which stored field is which rung.
import { detailSourceOf } from '@shared/detailsource.ts'
import { CompositionEvolution, Evolution } from '../components/graph/Evolution.tsx'
import type { EvolutionLink } from '../components/graph/evolution-model.ts'
import { editingAddress, familyPath, incidentPath, navigate, pathFor, pipelinePath, recordPath, RouteLink, useRoute, whoPath } from '../components/router.tsx'
// THE PRODUCT'S OWN WORD FOR A DRAWING, from the one place it is declared — criterion D26. The head
// of a pipeline's page uses it for the press that opens that drawing, so the entry and the control
// on the drawing itself cannot come to be called two different things.
import type { RecordSection } from '../components/router.tsx'
import { formatDue, formatWhen, readDueStamp } from '../lib/attention.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { useDetail } from '../lib/detailchoice.ts'
import { aGoalConfirmed } from '../lib/confirm-a-goal.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { useThePageScrollsInItsBox } from '../lib/page-scroll.ts'
// The one reading of "what state is this record in", shared with the records list rather than
// written twice. Its natural home is a module both pages import; src/web/lib/ belongs to another
// agent this phase, so it lives with the page that reads it most and is imported here.
import { stateOf } from './RecordsPage.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
import { CloseThisProblem } from '../components/CloseThisProblem.tsx'
import { WhoClosedIt } from '../components/WhoClosedIt.tsx'
import {
  Absence,
  Btn,
  ConsequenceMark,
  inlineMark,
  Mark,
  ErrorNote,
  Explain,
  FamilyTag,
  Field,
  Hint,
  Incomplete,
  latePhrase,
  Loading,
  NoStateMark,
  OriginMark,
  originReading,
  originSaid,
  Panel,
  PauseMark,
  PROGRESS_WORDS,
  Row,
  Select,
  Stamp,
  StampAfter,
  drawnDayWithTime,
  relativeTime,
  StateChip,
  StoredState,
  Tag,
  TextArea,
  TextInput,
  UnclassifiedMark,
  useAsync,
  type AsyncState,
} from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

// ============================================================================ editing the header

/**
 * THE TITLE AND THE SUMMARY, AS FIELDS, WHERE THE TITLE AND THE SUMMARY ARE.
 *
 * This used to be a panel headed "Edit this record" that REPLACED the header: pressing Edit made
 * the record's name disappear and a form take its place, three inches higher up the page. Now the
 * two boxes sit exactly where the two pieces of text sit, at the same sizes, so pressing Edit moves
 * nothing on the screen and a person can see which thing they are changing.
 *
 * SAVE IS A BUTTON AND NOT A BLUR, and it only appears once something has been changed. What is on
 * the screen and what is stored are two different facts while a box is dirty, and this says which
 * is which rather than letting a person assume.
 */
function HeadFields({
  record,
  derivedTitle,
  onSaved,
}: {
  record: PanelRecord
  /**
   * TRUE WHEN THIS KIND'S TITLE IS WRITTEN FROM ONE OF ITS FIELDS AND IS NOT A THING TO TYPE.
   *
   * A comment is the one kind that works this way: `annotationTitle` cuts the first words off the
   * body, and every write of the body writes the title through it. Offering the title as a box
   * offers a person a machine's shortening of their own sentence, and a person who changes it has
   * changed the name and not what they said — which the next write of the body silently undoes.
   * So there is no box, the name stays on screen exactly where it is while reading, and the words
   * themselves are what `CommentSource` offers further down the page.
   */
  derivedTitle: boolean
  onSaved: () => void
}) {
  const write = useWriteThisRecord(record.id, 'opened')
  const [title, setTitle] = useState(record.title)
  const [summary, setSummary] = useState(record.summary ?? '')
  // WHAT THE BOXES STARTED FROM, so a title another writer stored since is not drawn as the person's unsaved change.
  const [from, setFrom] = useState({ title: record.title, summary: record.summary ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = (!derivedTitle && title !== from.title) || summary !== from.summary

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!dirty || (!derivedTitle && title.trim() === '')) return
    setBusy(true)
    setError(null)
    try {
      // ONLY THE BOXES THE PERSON CHANGED ARE SENT. Save mine puts the person's change on another writer's version,
      // so a box the person left alone must not write the copy the form opened over theirs.
      const written = await write({
        ...(!derivedTitle && title !== from.title ? { title: title.trim() } : {}),
        ...(summary !== from.summary ? { summary: summary.trim() || null } : {}),
      })
      if ('notNow' in written) return
      // THE BOXES SHOW WHAT IS STORED NOW: the person's own write, or the other writer's version they kept.
      const now = 'keptTheirs' in written ? written.keptTheirs : written.saved.record
      setTitle(now.title)
      setSummary(now.summary ?? '')
      setFrom({ title: now.title, summary: now.summary ?? '' })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="rp-edit" onSubmit={(e) => void submit(e)}>
      {/* NO HINTS UNDER THESE BOXES. Two sentences used to sit here. "Titles are unique in a
          workspace" described a rule that no longer exists — the owner settled on 17 August 2026
          that titles may repeat — and "one line, generated for most kinds" described the field
          rather than helping anybody fill it in. Both were prose standing between a person and two
          text boxes labelled title and summary.

          WHAT COULD EARN A HINT HERE, AND WHY THERE IS NONE. A rename that lands on a name other
          work already holds is worth saying, and Mole Office cannot say it here yet for two reasons, both
          real. PATCH /api/records/:id does not answer sameTitle at all — only the create path does,
          in api/records.ts — so there is nothing to show. And src/web/api.ts does not carry the
          field even where the server sends it. Both have to land before this box can say anything
          true. Nothing is guessed here in the meantime. */}
      {/* A DERIVED TITLE STAYS ON THE SCREEN AND IS NOT A BOX. Leaving it out altogether would make
          the record's name vanish the moment somebody pressed Edit, which is the defect the note
          above this component says it fixed. */}
      {derivedTitle ? (
        <h1 className="rp-title wrap-anywhere" {...textAttributes('title', 0)}>
          {record.title}
        </h1>
      ) : (
        <Field label={t('record.title')}>
          <TextInput value={title} onChange={setTitle} autoFocus />
        </Field>
      )}
      <Field label={t('record.summary')} error={error ?? undefined}>
        <TextInput value={summary} onChange={setSummary} />
      </Field>
      {dirty ? (
        <div className="rp-edit-act">
          <span className="rp-unsaved">{t('record.unsaved')}</span>
          <Btn
            type="submit"
            variant="primary"
            pending={busy}
            disabled={!derivedTitle && title.trim() === ''}
            reason={t('record.titleRequired')}
          >
            {derivedTitle ? t('record.saveSummary') : t('record.saveHead')}
          </Btn>
        </div>
      ) : null}
    </form>
  )
}

// ============================================================================ the header

/**
 * WHETHER THE HEADER'S EDIT PRESS OPENS EDITING RIGHT NOW, worked out here and only here.
 *
 * The header draws its press from this answer, and the History panel draws its sentence that says to press Edit
 * from the same answer, so the sentence is never drawn beside a press that is not there or cannot be pressed. It is
 * false while the page is being edited, when the press stops editing; on a deleted record, whose press is drawn but
 * cannot be pressed; and on a flow run or a host job, which draws no press at all.
 */
export function theEditPressOpensEditing(kind: RecordKind, deleted: boolean, editing: boolean): boolean {
  return !editing && !deleted && kind !== FLOW_RUN_KIND && kind !== HOST_JOB_KIND
}

/**
 * Exported so tests/project-move.test.ts can render it. The words it prints for a project are the
 * ones a person sees on every record page, and a test of `projectName` alone would prove the
 * function and not the line.
 */
export function RecordHead({
  record,
  incomplete,
  deleted,
  editing,
  busy,
  projects,
  relations,
  participants,
  onSaved,
  onDelete,
}: {
  record: PanelRecord
  /** Every project this installation holds, so the line below can print a name rather than an id. */
  projects: readonly WorkspaceReading[]
  /**
   * EVERY PARTICIPANT THE REGISTRY HOLDS, or absent because the caller did not read them.
   *
   * It is what turns an agent record's stored handle into the registry id its citizen page is
   * addressed by. Absent is a real answer: the press falls back to the handle, which is the id on
   * every row registered before the mint. See `citizenId` below.
   */
  participants?: ParticipantsReply
  /**
   * THE RELATION PHRASE OF EVERY LINK ON THIS PAGE — `ResolvedLink.label`, one per link.
   *
   * The header draws none of those rows; the rail below it does. It is asked for them all the same,
   * because `sectionsOf` refuses a key the record does not declare and a record's declared sections
   * are its kind's PLUS one per relation it has links of. A header handed a shorter list would
   * disagree with the rail about what this page is made of.
   */
  relations: readonly string[]
  /** What the record still needs. The marker here; the actionable list further down the page. */
  incomplete: readonly Incompleteness[]
  /** Soft-deleted. Nothing about it can be written until it is restored. */
  deleted: boolean
  /** True when the address ends in `/edit`. Reading is what every fresh visit gets. */
  editing: boolean
  busy: boolean
  onSaved: () => void
  onDelete: () => Promise<void>
}) {
  const inspect = useInspect()
  // A BRANCHED AGENT'S SUMMARY IN THE PAGE'S LANGUAGE, or null. Developer mode draws what is stored.
  const branchedSummary = inspect
    ? null
    : theBranchedSummaryOnThePage(t, record, (agent) => {
        const row = participants === undefined ? undefined : theParticipantAStoredIdNames(participants.agents, agent)
        return row === undefined ? null : content(row.name)
      })
  /**
   * THE REGISTRY ID THIS AGENT'S OWN PAGE IS ADDRESSED BY, or null because this record has none.
   *
   * A citizen's page is `/who/agent/<registry id>`, and the record's own `data.handle` is the
   * address a person types, which is NOT the registry id for an agent registered after the mint.
   * Criterion M97 and criterion I4: the press must carry the id, because the page resolves the
   * agent it names by exact id.
   *
   * THE ROW IS FOUND BY ITS OWN RECORD, not by the handle. A handle is free again after retirement,
   * so a lookup by handle could land on a later live agent and send the reader to the wrong page. A
   * registry row names the record it belongs to, so the row whose own `record` is THIS record is the
   * one. Only where the caller read no rows does this fall back to the handle, which is the id on
   * every row registered before the mint and the best answer there is.
   *
   * NULL ON EVERY OTHER KIND, and on an agent record whose handle nobody wrote — absence beats a
   * guess, and a press to an address nobody answers to would be the fault this criterion closes,
   * moved one page further on.
   */
  const citizenId: string | null = (() => {
    if (record.kind !== 'agent') return null
    const held = (record.data as Record<string, unknown>)['handle']
    const handle = typeof held === 'string' && held.trim() !== '' ? held.trim() : null
    const byRecord = participants?.agents.find((one) => one.record === record.id)
    if (byRecord !== undefined) return byRecord.id
    const byHandle = participants?.agents.find((one) => one.handle === handle && one.retired !== true)
    return byHandle?.id ?? handle
  })()

  return (
    <header className="rp-head">
      <div className="rp-ident">
        <div className="rp-kindline">
          {/* The kind tag takes its colour, its corner radius and its type from tokens, so it
              follows a theme, a density and a radius preset without a line of code here. */}
          <Tag kind={record.kind} />
          {/* The reading family the kind belongs to, which is how the records list is organised.
              It is a heading word and nothing else: monochrome, no state, and never a filter. */}
          <FamilyTag kind={record.kind} />
          {/* THE AUTHORED CHIP IS GONE FROM THIS LINE, and that is `only="exceptions"` doing it.
              Nine records in ten on a normal page are authored, so the chip was a permanent piece
              of furniture saying "this is ordinary" — and permanent furniture stops being read,
              which cost the mark its meaning on the records that have one. Fixture, unserved and
              unrecorded are still drawn, every time, because whether you may quote this as an
              observation is a question you need answered before you read a word of it.
              In Inspect the origin section says the whole sentence for each of those readings. An
              authored record has no mark here and no origin section, in either mode. */}
          <OriginMark record={record} only="exceptions" />
          {record.deletedAt !== null ? <Tag tone="warn">{t('record.deleted')}</Tag> : null}
          {/* NO COUNT OF MISSING DETAILS HERE. The missing-details box says it, once, with its chip
              (round 38, review AEczCyDHb-Xu): a chip here as well said it twice. */}
        </div>
        {/* A COMMENT IS THE ONE KIND WHOSE TITLE IS NOT A THING SOMEBODY TYPES. The prop is called
            derivedTitle and the note on HeadFields says why there is no box for it. */}
        {editing && !deleted ? (
          <>
            <AnotherWriterLine />
            <HeadFields record={record} derivedTitle={record.kind === 'annotation'} onSaved={onSaved} />
          </>
        ) : (
          <>
            <h1 className="rp-title wrap-anywhere" {...textAttributes('title', 0)}>
              {titleToDraw(record, participants)}
            </h1>
            {/* THE SUMMARY IS NOT DRAWN HERE ON A REPORT, AT ANY READING LENGTH.
                It is reading length 3 of the report, drawn in the report's own body — the owner's
                decision of 3 September 2026: on a report the summary is shown only in the body, at reading
                length 3, and is not repeated at the top. Drawing it here as well would put the same paragraph on the page
                twice, once as the record's one-line summary and once as the report's conclusion,
                and would put two elements on one page carrying `section.summaryLine`, which is the
                fault criterion B3 exists to remove. Criterion A14b.
                THE HEADING KEEPS THE TITLE, and the body draws the title again at length 2. That
                pair is accepted: the heading is the page naming the record and the line in the body
                is the report's own length 2, and there is no special case for it. */}
            {/* AND A ROLE CARD, FOR THE SAME REASON AND ON THE SAME RULE. The mirror writes the
                card's What it is for line into the record's summary, and the card below draws that
                line under its own label. Drawing it here as well would put one sentence on the page
                twice, which is what this branch exists to stop. Problem `76Yh8qLhHdGY`.
                IT IS ITS OWN CONDITION AND NOT THE REPORT'S, since 1 October 2026: item 3 of a
                decision makes a role card a kind of its own and not a report, so the page asks
                about each kind by name rather than drawing a card on a report's
                path. */}
            {record.kind === 'report' ? null : record.kind === 'role_card' ? null : record.summary ? (
              // No tooltip. It said "the record's one-line summary" over a paragraph already labelled
              // SUMMARY, which is the label read out loud.
              //
              // THE PARAGRAPH SAYS WHICH SECTION IT IS, so a right-click on the summary answers the
              // summary. Measured on 30 August 2026 before this line existed: on a module, a report,
              // a problem and a note the walk went up four elements from this paragraph and stopped
              // at the whole record, four presses out of four. Summary is the FIRST item on the
              // owner's own list of the meaningful sections of a page.
              //
              // `section.summaryLine` AND NOT `section.summary`. The second is the record's reading
              // matter — on a module the curated summary panel, on a report the report itself — and
              // one id on two elements is the fault `MarkLayer` cannot survive. See
              // `SUMMARY_LINE_KEY` in src/shared/sections.ts.
              <p
                className="rp-lede prose wrap-anywhere"
                {...declaredAttributes(sectionsOf({ ...record, relations })(SUMMARY_LINE_KEY))}
              >
                <span className="rp-lede-tag" data-title-is="its-label">{t('record.summary')}</span>
                {/* THE MARK IS ON THE WORDS AND NOT ON THE PARAGRAPH, and that is the whole care
                    here. The server looks a quote up in the stored `summary` and checks it is where
                    the comment said it was. The label beside it is seven characters this record
                    does not hold, so a mark on the paragraph would shift every offset by seven and
                    Mole Office would report a summary nobody had touched as changed.
                    IT ALSO DRAWS THE NAME, for the same reason: the chip above the composer would
                    otherwise read the label as part of the summary. */}
                {branchedSummary === null || branchedSummary === record.summary ? (
                  <span {...DRAWS_THE_NAME} {...textAttributes(SUMMARY_LINE_FIELD, 0)}>
                    {record.summary}
                  </span>
                ) : (
                  // AN AGENT THE START A NEW AGENT PRESS MADE: the sentence it stored in English, drawn from
                  // `data.branchedFrom` in the page's language (src/shared/branched-agent.ts). No text mark, because
                  // these words are not the stored ones and a quote from them could not be found again.
                  <span {...DRAWS_THE_NAME}>{branchedSummary}</span>
                )}
              </p>
            ) : incomplete.some((item) => item.path === 'summary') ? null : (
              // The missing-details panel already names the summary, so say its absence once.
              // NO TARGET ON THIS ONE, AND THAT IS THE RULE RATHER THAN AN OVERSIGHT. A record with
              // no summary has no `section.summaryLine` in its tree — `sectionsOnThisRecord` asks
              // `isWritten` of it — so a target here would name a region the server would answer
              // `gone` about. The walk carries on to the record, which is the honest answer for a
              // sentence saying nobody wrote one.
              <div className="rp-lede rp-lede-none">
                {/* Its words, not a lone dash under the title (wave 13k round 34). */}
                <Absence word={t('record.noSummary')} />
              </div>
            )}
          </>
        )}
        {/* No separator characters between these. Every one of them dangles at the end of a
            line the moment the row wraps, which on a phone it always does; the words "created"
            and "updated" and the id's own pill already say where each item starts. */}
        <div className="rp-meta">
          {/* WHICH PROJECT THIS RECORD IS IN, on the reading page as well as the editing one.
              Every other number and row on the screen is scoped to one project and always was;
              what changed is that Home and the work list now gather work from all of them, so a
              reader arrives here from a list that mixed projects and "which one is this" is a
              question they now genuinely have. It is the project's NAME, never its id — the id is
              what the header carries and it is in Inspect with the record id. */}
          <span className="rp-project">
            {t('record.inProject', { project: projects.find((w) => w.id === record.workspaceId)?.title ?? t('record.projectUnspecified') })}
          </span>
          <span>
            <StampAfter label={t('record.created')} at={record.createdAt} />
          </span>
          <span>
            <StampAfter label={t('record.updated')} at={record.updatedAt} />
          </span>
          {/* Record addresses belong to developer mode. Plan 7FEOshq3mBGG. */}
          {inspect ? <RecordId id={record.id} where="page" /> : null}
          {inspect ? (
            <code className="rp-id" title={t('record.projectId')}>
              {record.workspaceId}
            </code>
          ) : null}
        </div>
      </div>

      <div className="rp-actions">
        {/* THE WAY INTO THIS PIPELINE'S OWN DRAWING — the owner's item 2 of 6 September 2026.

            On one of the owner's own pipelines, the owner looked for a long time on this page and
            found no way into the drawing at all. The whole request is in design/messages/ACCEPTANCE.md
            section 32.

            ONE PRESS, IN THE HEAD, and only on a pipeline. The drawing is the other way of reading
            this one record — Graph and List, which is `THE_TWO_READINGS` — so it belongs beside
            Edit rather than in a panel somewhere down the page, where the thing the owner could not
            find would still need finding. */}
        {record.kind === 'pipeline' && !deleted ? (
          <RouteLink
            to={pipelinePath(record.id)}
            className="rp-mode rp-mode-drawing"
            title={t('record.drawingHint')}
          >
            {t('record.drawing')}
          </RouteLink>
        ) : null}
        {/* THE WAY INTO THIS INCIDENT'S OWN SCENE, criterion I3. The record page draws an incident
            like any record; the scene is the other way of reading the same record — the loss in the person's
            words first, the timeline with its evidence one press away — so it belongs beside the
            pipeline's drawing link above, in the head, ONE press away from the title. */}
        {record.kind === 'incident' && !deleted ? (
          <RouteLink
            to={incidentPath(record.id)}
            className="rp-mode rp-mode-scene"
            title={t('record.sceneHint')}
          >
            {t('record.scene')}
          </RouteLink>
        ) : null}
        {/* THE WAY FROM AN AGENT'S RECORD TO THAT CITIZEN'S OWN PAGE. Criterion M97.

            On 9 September 2026 the owner followed a lead a secretary wrote (problem `6lGc8BlpClOG`),
            landed on a report's summary of an agent, and could not find Change work area, the press
            the lead had been sent for. The lead had gone to the agent's RECORD, which is a record like any
            other; the presses that act on that citizen — Change work area among them — are on the
            citizen's page, and nothing on the record said where that was.

            IT IS A LINK IN THE HEAD, beside the pipeline's drawing above, for the same reason: the
            citizen's page is the other way of reading this same agent, so it belongs where the other
            way of reading a record already is rather than in a panel further down.

            DRAWN ONLY WHERE THERE IS A PAGE TO GO TO. A citizen's page is addressed by the registry
            id, so a record whose agent no registry row and no handle can name gets no press — a
            press that landed on the not-found page would be exactly the fault this criterion is
            about, one page further on. */}
        {record.kind === 'agent' && !deleted && citizenId !== null ? (
          <RouteLink
            to={whoPath('agent', citizenId)}
            className="rp-mode rp-mode-citizen"
            title={t('record.agentHint')}
          >
            {t('record.agentPage')}
          </RouteLink>
        ) : null}
        {/* THE ONE PRESS THAT STARTS THE FILING JOB. 92 records on this installation are in no
            project, and until now nothing in the product could take one out of there. It is drawn
            only on those records — on a record that is already in a project it would be a permanent
            piece of furniture — and it goes to the editing address, where the panel that moves it
            sits directly under this header. Moving is a change to the record, so it lives where the
            other changes live rather than on the page you are reading. */}
        {!deleted && !editing && record.workspaceId === UNASSIGNED_WORKSPACE ? (
          <RouteLink to={editingAddress(recordPath(record.id))} className="rp-mode">
            {t('record.fileProject')}
          </RouteLink>
        ) : null}
        {/* ONE BUTTON, TOP RIGHT, AND IT IS A LINK, because reading and editing is an address. Back
            leaves editing, the address can be sent, and the review tool can photograph both states
            by asking for them by name.

            IT SAID "Done" UNTIL 18 AUGUST 2026 AND THAT WAS THE WRONG WORD, measured. A tester
            listed three things on this product called Done: this one, which stops editing; the
            state "done" on a record, which means the work is finished; and the schedule's Done
            press, which also means the work is finished. The tester pressed this one expecting the second.
            Two of the three mean one thing and keep the word. This one means something else, so it
            says what it does.

            A FLOW RUN HAS NO EDIT PRESS. Only the office writes one: assertMayWrite in
            src/server/lib/records.ts refuses every other writer, the person included, and a step
            done by hand goes through the steps door. The press led to a page whose every save was
            refused (for line 13p, message 1nUYgNOacCEs). Stop editing stays, for an address typed
            by hand, and so does the filing press above, since a move is allowed.

            A HOST JOB HAS NONE EITHER, for the same reason (wave 13q round 60): only its own doors write one, and
            assertMayWrite refuses every other writer, so every save the press led to was refused.

            WHEN THE PRESS OPENS EDITING IS theEditPressOpensEditing, because the History panel's sentence
            names this press and has to be drawn only when it is here to be pressed. */}
        {theEditPressOpensEditing(record.kind, deleted, editing) ? (
          <RouteLink to={editingAddress(recordPath(record.id))} className="rp-mode">
            {t('record.edit')}
          </RouteLink>
        ) : (record.kind === FLOW_RUN_KIND || record.kind === HOST_JOB_KIND) && !editing ? null : deleted ? (
          <Btn disabled reason={t('record.restoreFirst')}>
            {t('record.edit')}
          </Btn>
        ) : (
          <RouteLink to={recordPath(record.id)} className="rp-mode rp-mode-done">
            {t('record.stopEditing')}
          </RouteLink>
        )}
        {/* DELETE IS NOT AN ALARM UNTIL IT IS ONE. Drawn in the failure colour at rest it was the
            loudest control on every record page — including a proposal page, where the one act the
            product reserves for a person sat beside it in a plain outline. A hue means "this
            changes what you do next", and an idle Delete does not; the confirmation below, which is
            the destructive act, keeps the red. */}
        {/* DELETING IS EDITING, so it lives where the other changes live. It was on every record
            page at rest, beside a button that only opened a form. */}
        {editing && !deleted ? (
          <TieredPress tier="confirm" press={t('record.delete')} confirm={t('record.deleteConfirm', { title: record.title })} pending={t('record.deleting')}
            question={t('record.deleteQuestion')} quote={record.title} warning={t('record.deleteWarning')}
            cancel={t('record.keep')} disabled={busy} onPress={onDelete} />
        ) : null}
      </div>
    </header>
  )
}

// ============================================================================ what the state says

/**
 * Does this kind declare a field at all?
 *
 * Read from KIND_SPECS, the schema Mole Office publishes, so "there is no consequence on this record" is
 * told apart from "records of this kind cannot carry one". Drawing "nobody has said who is hurt" on
 * a `note`, which has no such field, would invent a gap nobody can close.
 */
function kindDeclares(kind: string, key: string): boolean {
  const spec = KIND_SPECS[kind as keyof typeof KIND_SPECS] as { fields: { key: string }[] } | undefined
  return spec === undefined ? false : spec.fields.some((field) => field.key === key)
}

/** One fact about the record: a mark, and the sentence that belongs to it. */
function Fact({ mark, said }: { mark: React.ReactNode; said: React.ReactNode }) {
  return (
    <div className="rp-fact">
      <span className="rp-fact-mark">{mark}</span>
      <span className="rp-fact-said">{said}</span>
    </div>
  )
}

/**
 * How this record got here, in a sentence, above everything the record says.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A PANEL AND WHY IT IS FIRST
 * ---------------------------------------------------------------------------------------
 * The chip in the header carries the word. It cannot carry the sentence, and the sentence is what
 * a reader — a person or the next agent — needs before quoting anything on this page: `fixture`
 * means the record entered the corpus through the seed and must never be quoted as an observation,
 * while saying nothing at all about whether its content is true. That distinction does not fit in
 * a chip, and getting it wrong in either direction is a real cost: 290 of this workspace's 385
 * records are fixture, and two agents have already read them as project record.
 *
 * IT RENDERS NOTHING FOR AN AUTHORED RECORD (decision 8SkQQo1x69IV, revision 3). Authored is what
 * almost every record is, so the sentence told the reader nothing they act on. Every other reading
 * is still drawn: made-up, nobody recorded one, a word this build cannot read, and no origin sent.
 * It is NOT an alarm panel — rank 1, and fixture content is not bad news.
 *
 * THE WORDS ARE `originSaid`, the component library's one table, so this panel and the chip in the
 * header cannot describe one record two ways.
 */
export function OriginSays({ record }: { record: PanelRecord }) {
  const said = originSaid(originReading(record))
  if (said.key === 'authored') return null
  return (
    <Panel declares={{ surface: null }} title={t('g2b.origin.title')} rank={1}>
      <div className="rp-facts">
        <Fact mark={<OriginMark record={record} />} said={said.sentence} />
      </div>
    </Panel>
  )
}

/**
 * The record's own recorded state, and the two facts that qualify it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A PANEL AND NOT A CHIP IN THE HEADER
 * ---------------------------------------------------------------------------------------
 * Three separate things are being said and each needs a sentence. What the stored WORD means, who
 * is hurt if this is LEFT ALONE, and whether it was put down on PURPOSE are different questions
 * with different answers, and the last two are stored fields that nothing in this interface has
 * ever shown. A chip can carry the first. It cannot carry "the lane keeps moving after the stop
 * button is pressed, and somebody stands next to it during transplant trials."
 *
 * THE STORED STATE STAYS LITERAL. The canonical work reader can separately report a derived state;
 * its source qualifies the absence sentence without supplying a stored word. `progressOf`,
 * `readConsequence` and `readPause` are the same functions the server ran to build the attention list.
 * The sentence for an unclassified word is the
 * page-language copy of `unclassifiedNote`, the sentence the server prints. In particular `idle` prints as
 * `idle` — the stored name is kept and the reason is shown beside it, and nothing reads "waiting on
 * you" out of free text.
 *
 * IT IS AN ALARM PANEL FOR ONE STORED VALUE AND NO OTHER: a consequence whose bearer is `person`.
 * That is the only thing in Mole Office that means somebody could be physically hurt, it is stored
 * rather than read off a title, and it is what gives a record a rank floor that age cannot move.
 * Everything else here is drawn quietly, because a pause is a decision and an unclassified word is
 * a question, and neither is bad news.
 */
export function StateSays({ record }: { record: PanelRecord }) {
  const state = stateOf(record)
  const workState = readWorkState(record.data)
  const consequence: Consequence | null = readConsequence(record.data)
  const pause: Pause | null = readPause(record.data)
  const takesConsequence = kindDeclares(record.kind, 'consequence')
  const takesPause = kindDeclares(record.kind, 'paused')
  const safety = isSafety(consequence)
  // A KIND WITH NO STATE FIELD HAS NO STATE LINE (decision 8SkQQo1x69IV, revision 3): "No state field"
  // told the reader nothing they act on. So the section is drawn only when a line is left in it, which on
  // such a kind is a pause or a consequence. An unknown kind and a blank state field still get their line.
  const stateLine = !(state.progress === null && state.expected === false)
  const pauseLine = takesPause && (pause !== null || state.progress === 'paused')
  if (!stateLine && !pauseLine && !takesConsequence && !safety) return null

  return (
    <Panel declares={{ surface: null }}
      // No eyebrow: it would print the kind, which the tag two lines above the panel already says.
      title={t('g2b.state.title')}
      rank={safety ? 0 : 1}
      tone="failed"
    >
      <div className="rp-facts">
        {!stateLine ? null : state.progress === null ? (
          <Fact
            mark={<NoStateMark expected={state.expected} />}
            said={
              state.expected === null
                ? t('g2b.state.unknownKind', { kind: record.kind })
                : /*
                   * A MODULE IS THE ONE KIND WHERE THE ABSENCE DOES NOT MEAN MOLE OFFICE CANNOT TELL,
                   * and this branch exists because for one pass it said it did. The generic
                   * sentence below ends "so Mole Office cannot tell whether this stopped short" — and
                   * further down this same page, the module panel counts exactly that from the
                   * checklist and prints "something stopped short". Two statements on one screen,
                   * flatly contradicting each other, each written by somebody who could not see
                   * the other panel.
                   *
                   * The absence still means something and is still worth saying: nobody chose a
                   * posture. It just does not mean the question is unanswerable, because decision 4
                   * moved that question to the parts. That it is a DIFFERENT question is carried by
                   * the module panel's two column heads -- "Lifecycle … written by a person" beside
                   * "Condition … worked out from the parts below" -- rather than by a sentence here
                   * that says it again for the reader who has already seen them.
                   *
                   * TIED TO THE BRANCH THAT RENDERS `ModuleView` further down this file: if a
                   * module ever stops getting the counted-condition panel, this sentence becomes
                   * wrong in the other direction. tests/record-page.test.ts fails if the page
                   * carries both this claim and the counted condition for one record.
                   */
                  record.kind === 'module'
                  ? t('g2b.state.noLifecycle')
                  : workState.source === 'derived from mainSuiteFix'
                    ? t('w13q.state.noneStoredDerived')
                    : t('g2b.state.noneWritten', { kind: kindWord(record.kind).text })
            }
          />
        ) : state.progress === 'unclassified' ? (
          // Drawn as a QUESTION and not as a verdict: Mole Office has not decided this record is in
          // trouble, it has discovered that it cannot tell. The words are the page-language copy of
          // `unclassifiedNote`, the sentence the server writes, so a reader in Chinese reads it too.
          <Fact
            mark={<UnclassifiedMark state={state.word ?? ''} />}
            said={t('g2b.state.unclassified', { word: state.word ?? '' })}
          />
        ) : (
          <Fact
            mark={<StoredState state={state.word} progress={state.progress} />}
            said={<StateMeaning progress={state.progress} word={state.word ?? ''} />}
          />
        )}

        {takesPause && pause !== null ? (
          <Fact
            mark={<PauseMark pause={pause} />}
            said={
              <>
                {t('sheet.pause.detail', { since: formatDue(pause.since), why: pause.why })}{' '}
                <span className="rp-fact-until">{resumeSentence(pause)}</span>
              </>
            }
          />
        ) : null}
        {takesPause && pause === null && state.progress === 'paused' ? (
          <Fact
            mark={<PauseMark pause={null} />}
            // The rule's sentence rather than a copy of it. This page said "no reason … was
            // recorded", which stopped being true when `parked` was classified as paused and an
            // idea's reason turned out to live in `parked_because`.
            said={t('g2b.state.noPause')}
          />
        ) : null}

        {takesConsequence ? (
          <Fact
            mark={<ConsequenceMark consequence={consequence} />}
            said={
              consequence === null
                ? t('g2b.state.noConsequence')
                : consequence.what
            }
          />
        ) : null}
      </div>

      {safety ? (
        <p className="rp-fact-floor">
          {/* "Safety", not "Safety floor". "Floor" means a safety rule here and a lower bound on
              the plan page, and one word doing two jobs is one job too many. The sentence still
              says the whole rule. */}
          {t('g2b.state.safety')}
        </p>
      ) : null}
    </Panel>
  )
}

/**
 * What a classification means, in the component library's own phrase.
 *
 * `PROGRESS_WORDS` rather than a sentence written here: it is the same table the chip's tooltip and
 * the component sheet read, so the page and the chip beside it cannot describe one word two ways.
 */
function StateMeaning({ progress, word }: { progress: Progress; word: string }) {
  return (
    <>
      {t('g2b.state.meaning', { word, progress: t(PROGRESS_NAMES[progress]), meaning: PROGRESS_WORDS[progress] })}
    </>
  )
}

/** The name of each classification, as this panel has always printed it: the stored name in words. */
const PROGRESS_NAMES: Readonly<Record<Progress, WordKey>> = {
  not_started: 'g2b.progress.not_started',
  in_flight: 'g2b.progress.in_flight',
  stopped_short: 'g2b.progress.stopped_short',
  finished: 'g2b.progress.finished',
  paused: 'g2b.progress.paused',
  unknown: 'g2b.progress.unknown',
  unclassified: 'g2b.progress.unclassified',
}

/** What should bring a pause back, or the honest admission that nothing says. */
function resumeSentence(pause: Pause): string {
  const until = pause.until
  if (until === undefined) return t('g2b.state.openEnded')
  const parts: string[] = []
  if (until.date !== undefined) parts.push(t('g2b.state.resumeOn', { day: formatDue(until.date) }))
  if (until.condition !== undefined) parts.push(t('g2b.state.resumeWhen', { condition: until.condition }))
  if (until.recordId !== undefined) parts.push(t('g2b.state.resumeWithRecord'))
  return t('g2b.state.resumes', { parts: parts.join(t('g2b.state.resumeAnd')) })
}

// ============================================================================ discharging a promise

/**
 * An obligation, and the action that ends it.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIELD EXISTED FROM THE START AND NOTHING EVER OFFERED THE ACTION
 * ---------------------------------------------------------------------------------------
 * `data.done` has been declared in kinds.ts and read by the alarm rules since the first slice.
 * Nothing ever WROTE it — no interface offered the action and the seed never set one — so every
 * obligation in the database looked permanent, and an analysis concluded, wrongly, that Mole Office had
 * no way to record that a promise had been kept.
 *
 * `POST /api/records/:id/fulfil` is that way, and this is the control. The note is REQUIRED by the
 * action even though `fulfilledNote` is optional on the record, and that is right: this is the one
 * moment the person who knows what settled it is still here to say so. A year later, "it was
 * delivered" and "the reviewer acknowledged both pages on the 9th" are worth very different amounts.
 *
 * `cancelled` is offered beside `fulfilled` because they are different news. An obligation that
 * stopped being owed was not met, and a record that cannot say which of the two happened is a
 * record that quietly claims the better one.
 *
 * DISCHARGING SOMETHING ALREADY DISCHARGED WRITES NOTHING, and the server says so rather than moving
 * `fulfilledAt` to today for a promise kept last week. That sentence is shown, not swallowed.
 */
/** The two words that discharge an obligation. `open` is what it already is. */
type DischargeState = Exclude<ObligationState, 'open'>

const DISCHARGE_OPTIONS: { value: DischargeState; label: string }[] = OBLIGATION_STATES.filter(
  (s): s is DischargeState => s !== 'open',
).map((s) => ({
  value: s,
  // A getter, so the label is read in the page's language when it is drawn and not when this file loads.
  get label() {
    return s === 'fulfilled' ? t('g2b.obligation.fulfilledOption') : t('g2b.obligation.cancelledOption')
  },
}))


// ============================================================================ whose move it is

/**
 * THE FOUR PICTURES FOR "WHO", drawn once and used by both rows below.
 *
 * A person is a figure, an agent is a card, either is both, and nobody-has-said is a broken ring —
 * the same broken edge the state chip uses for a word nobody has classified, and for the same
 * reason: it is a question rather than an answer. None of the four is told apart by colour.
 */
const PERSON_GLYPH = (
  <>
    <circle cx="8" cy="5" r="2.5" fill="currentColor" stroke="none" />
    <path d="M3.2 13.6c0-2.7 2.2-4.4 4.8-4.4s4.8 1.7 4.8 4.4" fill="none" strokeWidth="1.6" strokeLinecap="round" />
  </>
)

const AGENT_GLYPH = (
  <>
    <rect x="2.8" y="3.6" width="10.4" height="8.8" rx="1.6" fill="none" strokeWidth="1.6" />
    <path d="M5.6 7h4.8M5.6 9.6h3.2" strokeWidth="1.5" strokeLinecap="round" />
  </>
)

const EITHER_GLYPH = (
  <>
    <circle cx="5" cy="8" r="2.3" fill="currentColor" stroke="none" />
    <rect x="8.6" y="5.4" width="5.2" height="5.2" rx="1.2" fill="none" strokeWidth="1.6" />
  </>
)

const UNSAID_GLYPH = <circle cx="8" cy="8" r="4.8" fill="none" strokeWidth="1.6" strokeDasharray="2 2" />

/** The work has ended, so nobody has a move: a whole ring with a tick inside it. */
const ENDED_GLYPH = (
  <>
    <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.6" />
    <path d="M5.4 8.2l1.9 1.9 3.4-3.8" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </>
)

/** The picture for each stored word. `null` is the fourth answer and has its own, and so has an ended record. */
function moveGlyph(move: MoveActor | 'ended' | null): React.ReactNode {
  if (move === 'ended') return ENDED_GLYPH
  if (move === 'person') return PERSON_GLYPH
  if (move === 'agent') return AGENT_GLYPH
  if (move === 'either') return EITHER_GLYPH
  return UNSAID_GLYPH
}

/**
 * THE WORDS FOR WHOSE MOVE IT IS, in the page's language. `g2b.move.*` in the word lists is the
 * only place they are written.
 */
function moveWord(move: MoveActor | 'ended' | null): string {
  if (move === 'ended') return t('g2b.move.ended')
  if (move === 'person') return t('g2b.move.person')
  if (move === 'agent') return t('g2b.move.agent')
  if (move === 'either') return t('g2b.move.either')
  return t('g2b.move.unsaid')
}
function moveMeaning(move: MoveActor | 'ended' | null): string {
  if (move === 'ended') return t('g2b.move.endedMeaning')
  if (move === 'person') return t('g2b.move.personMeaning')
  if (move === 'agent') return t('g2b.move.agentMeaning')
  if (move === 'either') return t('g2b.move.eitherMeaning')
  return t('g2b.move.unsaidMeaning')
}



/**
 * THE SENTENCE ABOUT WHERE THE QUESTION IS, in the page's language, with every name and time the
 * server's reading carries. `sayWhereTheQuestionIs` is the one function the server also builds its
 * English sentence with, so the page and the door say one thing. A case this page's build does not
 * know keeps the server's own sentence, which is honest, if English.
 */
const KNOWN_QUESTION_CASES: ReadonlySet<WhereTheQuestionIs['case']> = new Set([
  'not-a-question', 'asker-not-recorded', 'person-wrote-it', 'ambiguous-asker', 'asker-not-registered',
  'asker-has-no-starter', 'starter-chain-cannot-be-followed', 'nobody-above-asker', 'passed-to-person',
  'waiting-with-agent',
])
function theQuestionInPageLanguage(question: WhereTheQuestionIs): string {
  return KNOWN_QUESTION_CASES.has(question.case) && question.facts !== undefined ? sayWhereTheQuestionIs(t, question) : question.says
}

/**
 * WHO MADE THIS, AND WHOSE MOVE IT IS. One row for each, and neither is inferred from the other.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TWO SIT TOGETHER AND WHY THEY ARE NOT ONE FACT
 * ---------------------------------------------------------------------------------------
 *
 * Who WROTE a record has always been stored, on the change row, from the actor headers. Who has to
 * ACT NEXT was stored nowhere — 78 fields in this schema name a person or an agent and every one of
 * them is about something else. They are drawn side by side because a reader asks them together and
 * answers them apart: an agent filed 116 of the problems here, and that says nothing at all about
 * whether an agent can close one.
 *
 * NOBODY HAS SAID IS DRAWN, NOT SKIPPED, and it is drawn with the broken ring rather than as
 * "either". One is a gap somebody can close in a second; the other is a decision somebody made.
 */
export function WhoseMoveSays({
  record,
  context,
  question,
  declares,
  participants,
}: {
  record: PanelRecord
  /** Everybody the registries hold, so who filed it is named (`writerNamed`, wave 13k round 34). */
  participants?: ParticipantsReply
  context: AsyncState<OpenLoops>
  /**
   * WHERE THE QUESTION ON THIS RECORD IS, off the record read. Criterion P55.
   *
   * Undefined where the reply carried none, which is every record that asks the person nothing. It
   * is the SERVER'S sentence and is never rebuilt here: the reading needs the revision ledger and
   * the registry, and a browser has neither.
   */
  question: WhereTheQuestionIs | undefined
  /**
   * `section.whoseMove` OF THIS RECORD, worked out by the caller for the reason `WhatWasTried`
   * below takes its own: `sectionsOf` throws on a key the kind does not declare, and this panel is
   * drawn only for the four kinds that declare `whose_move`. The caller already asks that question
   * before drawing it, so the section is asked for in the same place and not a second time here.
   */
  declares: Declares
}) {
  // WHOSE MOVE IT IS NOW, NOT THE STORED WORD RAW. A closed problem keeps `whose_move: person` so that
  // reopening it puts it back on the person's list, and the card drew that stored word as "Needs a
  // person" after the problem was closed. `whoseMoveNow` answers `ended` for a record whose work has
  // ended, from the same `theWorkHasEnded` the waiting list asks.
  const move = whoseMoveNow(record.data)
  // WHO FILED IT IS THE SERVER'S ANSWER, NOT A SECOND READING OF THE CHANGE LOG. The browser has
  // exactly one component that reads change rows — the one that draws them — and a second place
  // working out who wrote a record is how three pages once gave three answers to "which session did
  // this". While the reading is still on its way, this row is not drawn at all: an empty row would
  // claim nobody recorded an author, which is a different fact from nobody having looked yet.
  const made = context.status === 'ready' ? (context.value.standingAt?.filedBy ?? null) : undefined
  const madeByAgent = made != null && made.actorType === 'agent'
  const inspect = useInspect()

  return (
    // WHAT THIS PANEL DRAWS IS `section.whoseMove`, AND IT SAID NOTHING UNTIL 31 AUGUST 2026. Five
    // presses inside it on `a62SOh9fsPe5` answered the whole problem: the heading, *Filed by an
    // agent*, the filer's own name, *Needs an agent* and the sentence saying what that means. The
    // first row is provenance — who made this record — which criterion 8 of
    // design/problem-03/ACCEPTANCE.md names by name.
    <Panel declares={declares} title={titleHere(record.kind, WHOSE_MOVE_KEY)} rank={1}>
      <div className="rp-facts rp-whose-move">
        {made === undefined ? null : (
          <Fact
            mark={
              <Mark
                glyph={made === null ? UNSAID_GLYPH : madeByAgent ? AGENT_GLYPH : PERSON_GLYPH}
                word={made === null ? t('g2b.move.nobodyFiled') : madeByAgent ? t('g2b.move.filedByAgent') : t('g2b.move.filedByPerson')}
                tone="todo"
                mark={inlineMark(made === null ? 'hollow' : 'filled', made === null ? 'dashed' : 'solid')}
                // A TOOLTIP AND NOT A SENTENCE. What it names is a row of this record's own change
                // log, and the log itself is one panel down the page.
                detail={made === null ? t('g2b.move.noCreateRow') : t('g2b.move.createRow', { who: actorTypeWord(made.actorType).text })}
              />
            }
            // WHO FILED IT, BY NAME (wave 13k round 34): the handle is developer mode's.
            said={made === null ? null : inspect ? made.actorId : writerNamed(made, participants)}
          />
        )}
        <Fact
          mark={
            <Mark
              glyph={moveGlyph(move)}
              word={moveWord(move)}
              tone="todo"
              mark={inlineMark(move === null ? 'hollow' : 'filled', move === null ? 'dashed' : 'solid')}
              detail={moveMeaning(move)}
            />
          }
          said={moveMeaning(move)}
        />
      </div>
      {/* AND WHERE THE QUESTION IS, criterion P55. A question an agent with a starter asks is with
          that starter until somebody passes it on; only then does it reach the person. The page says
          the server's reading in its own language: the same facts (who asked, who holds it, who
          passed it on and when, why the chain breaks), through the same words and the one function
          the server builds its English sentence with, the sentence the closing gate prints in its
          refusals. So on an English page this line is that sentence, word for word, and the page,
          the door and the list cannot say three different things about one record. Absent where
          nothing asks the person anything, which is most records. */}
      {/* NOT ON A RECORD WHOSE WORK HAS ENDED. Each of the sentences says where the question is now, and
          on a closed record nobody holds it. The question stays stored, and the line is drawn again once
          the record is live. */}
      {question === undefined || move === 'ended' ? null : <p className="rp-question-is">{theQuestionInPageLanguage(question)}</p>}
    </Panel>
  )
}

// ============================================================================ what was tried

/** One recorded attempt, as stored. Nothing here is worked out; every string is somebody's own. */
interface StoredAttempt {
  id?: unknown
  tried?: unknown
  result?: unknown
  failed_because?: unknown
  still_useful?: unknown
  do_not_repeat?: unknown
}

const said = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/**
 * WHAT HAS ALREADY BEEN TRIED ON THIS PROBLEM, AND WHAT MUST NOT BE TRIED AGAIN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN PANEL
 * ---------------------------------------------------------------------------------------
 *
 * Before this, the only record of a dead end was a chat transcript belonging to whichever session
 * hit it. The next agent had no way to reach it, so the same hour was spent twice — which is the
 * incident the whole open-loop cluster answers.
 *
 * WHAT MUST NOT BE REPEATED IS DRAWN FIRST INSIDE EACH ATTEMPT and is the one line the open-loop
 * reader hands to a fresh agent, so the page and that reply cannot disagree about which line it is.
 */
export function WhatWasTried({ record, declares }: { record: PanelRecord; declares: Declares }) {
  const stored = (record.data as Record<string, unknown>)[ATTEMPTS_KEY]
  const attempts: StoredAttempt[] = Array.isArray(stored) ? (stored as StoredAttempt[]) : []
  if (attempts.length === 0) return null

  return (
    // WHAT THIS PANEL DRAWS IS `section.attempts`, AND IT SAID NOTHING UNTIL 31 AUGUST 2026.
    // Fourteen presses inside it on `a62SOh9fsPe5` — the *What was seen* headings, the sentences
    // under them, the *Do not repeat* chips and the lines beside them — walked five to seven
    // silent elements and answered the whole problem. The words in here are somebody's writing
    // about what they tried, so the root was arriving first for reading matter.
    //
    // THE ANSWER IS HANDED IN RATHER THAN WORKED OUT HERE, like every other section on this page:
    // `sectionsOf` needs the record's relations to know which sections exist, and a panel that
    // guessed `[]` would be stating a fact about the record it cannot see.
    <Panel declares={declares} title={titleHere(record.kind, ATTEMPTS_KEY)} rank={1}>
      <ol className="rp-attempts">
        {attempts.map((attempt, at) => {
          const dead = said(attempt.do_not_repeat)
          return (
            <li className="rp-attempt" key={said(attempt.id) ?? String(at)}>
              {dead === null ? null : (
                <p className="rp-attempt-dead">
                  <Mark
                    glyph={STRUCK_GLYPH}
                    word={t('g2b.tried.doNotRepeat')}
                    tone="failed"
                    alarm="raised"
                    mark={inlineMark('struck')}
                    detail={dead}
                  />
                  <span className="rp-attempt-dead-said">{dead}</span>
                </p>
              )}
              <p className="rp-attempt-tried">{said(attempt.tried) ?? record.title}</p>
              <dl className="rp-attempt-facts">
                <dt>{t('g2b.tried.seen')}</dt>
                <dd>{said(attempt.result) ?? <Absence tier="ordinary" title={t('g2b.tried.seenUnwritten')} />}</dd>
                {said(attempt.failed_because) === null ? null : (
                  <>
                    <dt>{t('g2b.tried.whyFailed')}</dt>
                    <dd>{said(attempt.failed_because)}</dd>
                  </>
                )}
                {said(attempt.still_useful) === null ? null : (
                  <>
                    <dt>{t('g2b.tried.stillUseful')}</dt>
                    <dd>{said(attempt.still_useful)}</dd>
                  </>
                )}
              </dl>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

/** A direction's depth, in the page's language. The stored words are `DIRECTION_DEPTHS` in src/shared/types.ts. */
function depthWord(depth: string): string {
  return Object.hasOwn(DEPTH_WORDS, depth) ? t(DEPTH_WORDS[depth as keyof typeof DEPTH_WORDS]) : t('g2b.depth.unknown', { depth })
}
const DEPTH_WORDS = {
  noticed: 'g2b.depth.noticed',
  read: 'g2b.depth.read',
  ran: 'g2b.depth.ran',
  measured: 'g2b.depth.measured',
  integrated: 'g2b.depth.integrated',
  defended: 'g2b.depth.defended',
} as const satisfies Record<string, WordKey>

/** A struck-through ring: this was tried and it is closed off. */
const STRUCK_GLYPH = (
  <>
    <circle cx="8" cy="8" r="5" fill="none" strokeWidth="1.6" />
    <path d="M4.5 11.5L11.5 4.5" strokeWidth="1.7" strokeLinecap="round" />
  </>
)

// ============================================================================ what is still open

/**
 * WHAT IS STILL OPEN AROUND THIS RECORD — the same answer an agent gets, on the page.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FACT DRAWN TWICE, FROM ONE READING
 * ---------------------------------------------------------------------------------------
 *
 * This panel draws `GET /api/records/:id/context`, which is `openLoopsFor` — the same function the
 * session hook and `GET /api/open-loops` read. Nothing here decides what is open, how far away is
 * near enough, or what to leave out. A second opinion about what is still open is the one piece of
 * duplication in this product that would send an agent to the wrong work.
 *
 * THE LINE ABOUT MODULES IS THE SERVER'S OWN SENTENCE AND IS ALWAYS DRAWN. Most of this project's
 * open loops are linked to no module at all, so a short list under a module reads as a quiet module
 * unless the page says otherwise.
 */
/**
 * How many open loops the panel draws before the rest go behind a press.
 *
 * Eight, which is one more than the attention rule shows, because this list is not ranked: it is
 * everything within reach, and a reader scanning it is looking for a name they recognise rather
 * than for the top of a list.
 */
export const OPEN_LOOPS_DRAWN = 8

/**
 * HOW MANY OPEN LOOPS A REPORT'S PANEL DRAWS BEFORE THE FOLD, AT THE READER'S LENGTH.
 *
 * An idea, built by a decision. A verifier measured a
 * report at length 1 (report fmjhHtrQr4-7, defect 2): 973 words on the page, 467 of them in this
 * panel, so at the shortest length this panel was the longest thing on the page. The panel now reads
 * the same length the report body reads, through the same hook and for the same kind, and draws less
 * at a shorter length:
 *
 *   levels 1 to 3, one text about the whole report     no rows open; every row is in the fold
 *   levels 4 to 6, written part by part                 the nearest three rows open
 *   Full                                                the nearest eight, as on every other kind
 *
 * `RUNG_SPECS[rung].wordsPer` is what tells the three apart, so a length added to the ladder lands
 * in one of the three without a change here. Nothing is dropped at any length: the fold holds the
 * rest, and its label says how many.
 */
export const OPEN_LOOPS_AT_A_PART_LENGTH = 3
export function openLoopsDrawnAt(rung: Rung): number {
  const per = RUNG_SPECS[rung].wordsPer
  return per === 'form' ? 0 : per === 'part' ? OPEN_LOOPS_AT_A_PART_LENGTH : OPEN_LOOPS_DRAWN
}

/** Why a record was left out of the list, in the page's language. The English is `LEFT_OUT_SENTENCES` in src/server/lib/openloops.ts. */
const LEFT_OUT_WORDS: Readonly<Record<LeftOutBucket, WordKey>> = {
  finished: 'g2b.open.leftOut.finished',
  shelved: 'g2b.open.leftOut.shelved',
  settled: 'g2b.open.leftOut.settled',
  beyond_reach: 'g2b.open.leftOut.beyond_reach',
  not_linked_to_here: 'g2b.open.leftOut.not_linked_to_here',
  where_you_are_standing: 'g2b.open.leftOut.where_you_are_standing',
  quiet_the_longest: 'g2b.open.leftOut.quiet_the_longest',
}

export function StillOpenHere({
  record,
  relations,
  reading,
}: {
  record: PanelRecord
  relations: readonly string[]
  reading: AsyncState<OpenLoops>
}) {
  // THE THIRD PANEL THE OWNER'S DOGFOOD PHOTOGRAPHED — "related/open-around-this content". It is
  // `section.openAround`, which every kind declares, because something can be open around any record.
  // The panel is drawn when something is open or when the reading failed, and on no page otherwise.
  const thisPanel = sectionsOf({ ...record, relations })(OPEN_AROUND_KEY)
  const inspect = useInspect()
  // THE READER'S LENGTH, read before the early returns because it is a hook. It is the length the
  // report body is drawn at: the same surface, and the same kind, so the floor applies the same way.
  const says = useDetail(FLOORED_SURFACE, record.kind)
  if (reading.status === 'loading') return null
  if (reading.status === 'error') {
    return (
      <Panel declares={thisPanel} title={titleHere(record.kind, OPEN_AROUND_KEY)} rank={2}>
        <ErrorNote message={reading.message} fault={reading.fault} />
      </Panel>
    )
  }

  const answer = reading.value
  // NOTHING OPEN AROUND IT DRAWS NOTHING, IN EITHER MODE. A panel whose whole content is "nothing is open around this
  // record" tells a reader what the absence of the panel tells them, and the owner named that line as one of the ones
  // that read as written by an AI. Decision 8SkQQo1x69IV, revision 3, took it out of developer mode too. A reading
  // that failed is still drawn, above, because that is not the same answer as nothing open.
  if (answer.loops.length === 0) return null
  // NEAREST FIRST, WHICH IS A DRAWING DECISION AND NOT A SECOND OPINION ABOUT MEMBERSHIP. The reply
  // is ordered by when each loop last changed, because that is the order the reader drops from when
  // an answer will not fit. On a page the useful order is how close each one is to where you are.
  const ordered = [...answer.loops].sort(
    (a, b) => (a.hops ?? 0) - (b.hops ?? 0) || b.lastChanged.localeCompare(a.lastChanged),
  )
  // ON A REPORT THE PANEL FOLLOWS THE READING LENGTH; on every other kind it draws at Full.
  const drawn = record.kind === FLOORED_KIND ? openLoopsDrawnAt(says.rung) : OPEN_LOOPS_DRAWN
  const whole = drawn === OPEN_LOOPS_DRAWN
  const first = ordered.slice(0, drawn)
  const rest = ordered.slice(drawn)
  // THE TWO LINES UNDER THE LIST, rebuilt from the numbers the reply carries so they read in the
  // page's language. At a shorter length they go into the fold with the rows. Null draws neither.
  // HOW THE READING WAS TAKEN: which loops it carried and which it left out. That is the reader
  // explaining itself, so it is developer mode's (plan 7FEOshq3mBGG, G2c); the loops themselves are
  // drawn in both modes. Built once, and placed after the list at Full or inside the fold (G2b).
  const lines: React.ReactNode | null = !inspect ? null : (
    <>
      <p className="rp-open-attach">
        {t('g2b.open.attachment', { n: answer.attachment.attachedToNoModule, total: answer.attachment.openLoopsInProject })}
      </p>
      <p className="rp-open-cut">
        {answer.leftOut.map((group) => (
          <span className="rp-open-cut-one" key={`${group.bucket}:${group.stateSource ?? 'stored'}`}>
            <span className="num">{group.count}</span>{' '}
            {group.bucket === 'finished' && group.stateSource === 'derived from mainSuiteFix'
              ? t('g2b.open.leftOut.finishedDerived')
              : Object.hasOwn(LEFT_OUT_WORDS, group.bucket) ? t(LEFT_OUT_WORDS[group.bucket]) : group.sentence}
          </span>
        ))}
      </p>
    </>
  )
  return (
    <Panel declares={thisPanel} title={titleHere(record.kind, OPEN_AROUND_KEY)} rank={2}>
      {first.length === 0 ? null : (
        <ul className="rp-open-list">
          {first.map((loop) => (
            <OpenLoopRow key={loop.id} loop={loop} workspaceId={record.workspaceId} />
          ))}
        </ul>
      )}
      {/* NOTHING IS DROPPED FROM THE PAGE — the rest are one press away, and the press says how many
          there are and how far out they start. A record two links from a campaign block that names
          fifty things really does have fifty open loops around it, and a panel that printed all
          fifty would make the eight that are next to it unfindable. */}
      {rest.length === 0 && (whole || lines === null) ? null : (
        <details className="rd-fold rp-open-rest">
          <summary>
            {rest.length === 0
              ? t('g2b.open.leftOutFold')
              : first.length === 0
                ? t('g2b.open.allFolded', { n: rest.length })
                : t('g2b.open.more', { n: rest.length, from: t('g2b.open.fromHops', { n: rest[0]?.hops ?? 0 }) })}
          </summary>
          {rest.length === 0 ? null : (
            <ul className="rp-open-list">
              {rest.map((loop) => (
                <OpenLoopRow key={loop.id} loop={loop} workspaceId={record.workspaceId} />
              ))}
            </ul>
          )}
          {whole ? null : lines}
        </details>
      )}
      {whole ? lines : null}
    </Panel>
  )
}

// ============================================================================ what was settled here

/**
 * THE DECISIONS ABOUT THIS RECORD — what an agent opening a module meets before it starts.
 *
 * Criterion P37, on the owner's question of 6 September 2026: is there a way to remind an agent that
 * joins the work later of the decisions already made about the project? It draws `decisionsAboutThis` from the SAME reply `StillOpenHere` draws, so
 * the two panels cannot disagree and the page asks one question rather than two.
 *
 * IT IS BESIDE *WHAT IS STILL OPEN AROUND THIS*, NOT INSIDE IT. That panel's population is the six
 * open-loop kinds and its own declaration says why a decision is not one of them: what happened is
 * not something anybody has to finish. So this is a second reading, and the two answer different
 * questions — what is left to do here, and what has already been settled here.
 *
 * DRAWN ONLY WHERE THE KIND DECLARES IT, which today is the module. `titleHere` throws on a kind
 * that declares no such section, and that is the check rather than a comment.
 */
export function DecidedHere({
  record,
  relations,
  reading,
}: {
  record: PanelRecord
  relations: readonly string[]
  reading: AsyncState<OpenLoops & { decisionsAboutThis?: DecisionsAbout }>
}) {
  const inspect = useInspect()
  if (titleOfSection(record.kind, DECIDED_HERE_KEY) === null) return null
  const thisPanel = sectionsOf({ ...record, relations })(DECIDED_HERE_KEY)
  const title = titleHere(record.kind, DECIDED_HERE_KEY)
  if (reading.status === 'loading') return null
  if (reading.status === 'error') {
    return (
      <Panel declares={thisPanel} title={title} rank={2}>
        <ErrorNote message={reading.message} fault={reading.fault} />
      </Panel>
    )
  }
  const answer = reading.value.decisionsAboutThis
  if (answer === undefined) {
    // THE READING DID NOT CARRY IT, WHICH IS NOT THE SAME AS THERE BEING NONE. An older server
    // answers this route without the section, and drawing "nothing has been decided" on that reply
    // would be a claim nothing checked.
    return (
      <Panel declares={thisPanel} title={title} rank={2}>
        <Absence
          tier="must-act-on"
          sentence={
            <>
              <b>{t('g2b.decided.notLooked')}</b> {t('g2b.decided.notLookedWhy', { kind: kindWord(record.kind).text })}
            </>
          }
        />
      </Panel>
    )
  }
  const row = (one: DecisionAboutThis) => (
    <li
      key={one.id}
      className="rp-open"
      data-kind="decision"
      {...declaredAttributes(theLinkedRecord(one.id, record.workspaceId))}
    >
      <span className="rp-open-head">
        <Tag kind="decision" />
        <RouteLink to={recordPath(one.id)} className="rp-open-says" {...DRAWS_THE_NAME}>
          {one.title}
        </RouteLink>
      </span>
      <span className="rp-open-facts">
        {/* THE DAY, AND A TOLD-APART ABSENCE WHEN THE DAY IS ONLY WHEN IT WAS FILED. Almost every
            decision in this corpus carries no `decided_on`, so almost every row needs this — and a
            whole sentence per row would be weight on something nobody has to act on. It goes
            through `Absence` at the told-apart tier: the word on the row, the sentence in the
            tooltip and read out to a screen reader, which is the one place it is written. */}
        <span className="rp-open-state">{one.decidedOn}</span>
        {one.nobodyWroteWhen ? (
          <Absence
            tier="told-apart"
            looked
            word={t('g2b.decided.filed')}
            title={t('g2b.decided.filedTitle')}
          />
        ) : null}
        {/* HOW IT IS ABOUT THIS, in the server's own two words. A decision reached through a fork is
            not a decision somebody wrote about this module, and a row that did not say so would
            present the weaker fact as the stronger one. */}
        <span className="rp-open-state">{one.how === 'governs it' ? t('w13q.decided.governs') : one.how === 'linked to it' ? t('g2b.decided.linked') : t('g2b.decided.throughFork')}</span>
        {one.throughTheFork === null ? null : (
          <RouteLink to={recordPath(one.throughTheFork.id)} className="rp-open-hops">
            {one.throughTheFork.title}
          </RouteLink>
        )}
      </span>
      <DecisionBasis basis={one.basis} />
    </li>
  )

  // THE SAME FOLD AS THE PANEL ABOVE, and the same number, because the two lists sit together and a
  // module with 29 settled forks would otherwise bury everything under it. Nothing is dropped: the
  // press says how many are behind it.
  const first = answer.decisions.slice(0, OPEN_LOOPS_DRAWN)
  const rest = answer.decisions.slice(OPEN_LOOPS_DRAWN)
  return (
    <Panel declares={thisPanel} title={title} rank={2}>
      {answer.decisions.length === 0 ? (
        <p className="rp-open-none">
          <Absence tier="told-apart" looked word={t('g2b.decided.none')} title={t('g2b.decided.noneTitle')} />
        </p>
      ) : (
        <ul className="rp-open-list">{first.map(row)}</ul>
      )}
      {rest.length === 0 ? null : (
        <details className="rd-fold rp-open-rest">
          <summary>{t('g2b.decided.more', { n: rest.length })}</summary>
          <ul className="rp-open-list">{rest.map(row)}</ul>
        </details>
      )}
      {/* The reading's own note says how it looked, so it is developer mode's (plan 7FEOshq3mBGG,
          G2c). Its words are the lists' (G2b). */}
      {inspect ? <p className="rp-open-attach">{answer.decisions.length === 0 ? t('g2b.decided.noneNote') : t('g2b.decided.note', { n: answer.decisions.length })}</p> : null}
    </Panel>
  )
}

/**
 * One open loop, as the reader answered it. Every value is drawn as it came; none is worked out.
 *
 * IT NAMES THE RECORD IT IS A ROW ABOUT. The owner's dogfood put *"related/open-around-this content"* in the
 * same sentence as the link rows, and it is the same fault: the row draws another record's title and
 * carried nothing, so a press on it answered the record the list is printed on. The list around it
 * is `section.openAround`, so the walk from a row still reaches the page it was read on.
 */
function OpenLoopRow({ loop, workspaceId }: { loop: OpenLoop; workspaceId: string }) {
  return (
    <li className="rp-open" data-kind={loop.kind} {...declaredAttributes(theLinkedRecord(loop.id, workspaceId))}>
      <span className="rp-open-head">
        <Tag kind={loop.kind as RecordKind} />
        <RouteLink to={recordPath(loop.id)} className="rp-open-says" {...DRAWS_THE_NAME}>
          {loop.says}
        </RouteLink>
      </span>
      <span className="rp-open-facts">
        {loop.state === null ? null : <span className="rp-open-state">{stateWord(loop.state, 'normal', loop.kind).text}</span>}
        {loop.depth === undefined ? null : <span className="rp-open-state">{depthWord(loop.depth)}</span>}
        <Mark
          glyph={moveGlyph(loop.whoseMove)}
          word={moveWord(loop.whoseMove)}
          tone="todo"
          mark={inlineMark(loop.whoseMove === null ? 'hollow' : 'filled', loop.whoseMove === null ? 'dashed' : 'solid')}
          detail={moveMeaning(loop.whoseMove)}
        />
        {loop.hops === null ? null : (
          <span className="rp-open-hops num" title={t('g2b.open.hops', { n: loop.hops })}>
            {loop.hops}
          </span>
        )}
      </span>
      {loop.doNotRepeat === undefined
        ? null
        : loop.doNotRepeat.map((line) => (
            <span className="rp-open-dead" key={line}>
              <Mark glyph={STRUCK_GLYPH} word={t('g2b.tried.doNotRepeat')} tone="failed" alarm="raised" mark={inlineMark('struck')} detail={line} />
              <span className="rp-open-dead-said">{line}</span>
            </span>
          ))}
    </li>
  )
}

export function ObligationPanel({
  record,
  editable,
  records,
  onChanged,
}: {
  record: PanelRecord
  editable: boolean
  /**
   * The workspace's records, so a `due` owed on ANOTHER RECORD can print that record's name.
   * Nothing is invented: an id nothing here answers to is drawn as the id it is.
   */
  records: readonly NamedRecord[]
  onChanged: () => void
}) {
  const [note, setNote] = useState('')
  // `open` is not offered: this control DISCHARGES an obligation, and the two words that do that
  // are the two `readFulfilment` treats as discharged. The list is derived from OBLIGATION_STATES
  // rather than typed out, so a fourth word added to the contract shows up here.
  const [state, setState] = useState<DischargeState>('fulfilled')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const fulfilment: Fulfilment = readFulfilment(record.data)
  /**
   * THE ONE READER OF `due`, AND IT USED TO BE A NARROWER ONE HERE THAN ANYWHERE ELSE.
   *
   * This panel read `data.due` only as a string, so an obligation owed on a condition or on another
   * record — both declared, both stored by the same field, both handled by `readDue` — printed "no
   * date is stored, so this can never come due", three inches above a deadline panel on the same
   * page printing "the trigger, in words: …". Two panels answering one question two ways is the
   * defect this file already carries a long comment about, and it became reachable from the browser
   * the moment a person could write those forms.
   */
  const due = readDue(record.data)
  const nameFor = (id: string): string | null => records.find((r) => r.id === id)?.title ?? null
  const owedTo =
    typeof record.data['owedTo'] === 'string'
      ? record.data['owedTo']
      : typeof record.data['owed_to'] === 'string'
        ? (record.data['owed_to'] as string)
        : null
  const proves =
    typeof record.data['what_proves_it_done'] === 'string' ? record.data['what_proves_it_done'] : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (note.trim() === '') return
    setBusy(true)
    setError(null)
    setSaid(null)
    try {
      const reply = await api.fulfilObligation(record.id, { note: note.trim(), state })
      setSaid(reply.dischargeNote)
      setNote('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel declares={{ surface: null }} title={t('g2b.obligation.title')}>
      <dl className="rp-owed">
        <dt>{t('g2b.obligation.owedTo')}</dt>
        <dd>{owedTo ?? <span className="rp-none">{t('g2b.obligation.nobodyOwed')}</span>}</dd>
        <dt>{t('g2b.obligation.due')}</dt>
        <dd>
          {due.when === 'unstated' ? (
            <span className="rp-none">
              {t('g2b.obligation.noDate')}
            </span>
          ) : (
            // EVERYTHING WRITTEN IS SHOWN, which is `readDue`'s own contract: an obligation
            // carrying both a date and a condition has said two things and a reader must not drop
            // one of them. Only the date can make it late, and the sentences say which is which.
            <div className="rp-due-forms">
              {due.date === undefined ? null : (
                <span>
                  <time dateTime={due.date}>{formatDue(due.date)}</time> <span className="rp-owed-raw">{t('g2b.obligation.storedAs', { value: due.date })}</span>
                </span>
              )}
              {due.condition === undefined ? null : (
                <span>
                  {t('g2b.obligation.when', { condition: due.condition })}{' '}
                  <span className="rp-owed-raw">
                    {t('g2b.obligation.conditionInWords')}
                  </span>
                </span>
              )}
              {due.recordId === undefined ? null : (
                <span>
                  {t('g2b.obligation.whenRecordBefore')}{' '}
                  <RouteLink to={recordPath(due.recordId)}>{nameFor(due.recordId) ?? due.recordId}</RouteLink>{' '}
                  {t('g2b.obligation.whenRecordAfter')} <span className="rp-owed-raw">{t('g2b.obligation.notChecked')}</span>
                </span>
              )}
            </div>
          )}
        </dd>
        {proves === null ? null : (
          <>
            <dt>{t('g2b.obligation.whatSettles')}</dt>
            <dd>{proves}</dd>
          </>
        )}
      </dl>

      {fulfilment.done ? (
        <div className="rp-facts">
          <Fact
            mark={<StoredState state={typeof record.data['state'] === 'string' ? (record.data['state'] as string) : 'done'} progress="finished" />}
            said={
              <>
                {fulfilment.at === null
                  ? t('g2b.obligation.dischargedNoDay')
                  : t('g2b.obligation.dischargedOn', { at: formatWhen(fulfilment.at) })}{' '}
                {fulfilment.note ?? t('g2b.obligation.noSettleNote')}
              </>
            }
          />
        </div>
      ) : editable ? (
        // NO CAPTION ABOVE THE FORM. It read "Nothing infers this. Until it is recorded here, the
        // obligation goes on being owed" — a paragraph above two boxes and a button that already
        // say what they do. The one thing a person needs is on the button, when they press it
        // without a note.
        <form className="rp-discharge" onSubmit={(e) => void submit(e)}>
          <Field label={t('g2b.obligation.whatSettled')} error={error ?? undefined}>
            <TextInput value={note} onChange={setNote} />
          </Field>
          <Field label={t('g2b.obligation.whatHappened')}>
            <Select<DischargeState> value={state} onChange={setState} options={DISCHARGE_OPTIONS} />
          </Field>
          <div className="rp-edit-act">
            <Btn
              type="submit"
              variant="primary"
              pending={busy}
              disabled={note.trim() === ''}
              reason={t('g2b.obligation.needsNote')}
            >
              {t('g2b.obligation.record')}
            </Btn>
          </div>
        </form>
      ) : null}

      {said === null ? null : <p className="rp-said">{said}</p>}
    </Panel>
  )
}

// ============================================================================ a fixed deadline

/**
 * IS THERE ENOUGH TIME LEFT — the report `GET /api/planning/deadline/:id` computes, on the page.
 *
 * ---------------------------------------------------------------------------------------
 * NONE OF THE ARITHMETIC IS HERE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 * `src/shared/deadlines.ts` sizes the work, walks the window, counts one horizon at a time and
 * decides what it could not count. This section FETCHES that answer and draws it. There is no
 * second sum anywhere below — not a subtraction, not a total, not a rounding — because the whole
 * value of the report is that a person disagreeing with a buffer is disagreeing with arithmetic
 * over stored fields rather than with a judgement made inside a page.
 *
 * The gap sentences are the same: `DEADLINE_GAP_SENTENCES` publishes one line per missing input so
 * that every surface says the same thing about the same silence, and this prints those lines. It
 * does not paraphrase them and it never prints the gap's key, which is a name for programs.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PERSON TICKS THE WORK
 * ---------------------------------------------------------------------------------------
 * The route deliberately does not guess which work a deadline depends on: `blocked_by` is declared
 * as free text, and a rule that read prose to decide would be a rule prose can fool. So this offers
 * CANDIDATES from two places that are stored facts rather than readings —
 *
 *   linked      a link somebody wrote between this record and another, with the link's own label
 *   allocated   a record the plan already gives time to, in a period between now and the deadline
 *
 * — and a person ticks which are actually relevant. The ticked set is component state and nothing
 * else: it is not in the address, not in the database, and not remembered between visits. It is a
 * question being asked, not an answer being recorded, and writing it down would make it look like
 * one.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY NOTHING SAYS WHICH NOTHING IT IS
 * ---------------------------------------------------------------------------------------
 * Not one null below is drawn as a zero, a dash or an empty cell. "Nobody has said how many hours
 * these periods hold" and "these periods hold no hours" are different answers and only one of them
 * is a reason to move a deadline; the same holds for an estimate, for a buffer, and for a piece of
 * work whose row has no window to be placed in.
 */

/**
 * THE PAGE-LANGUAGE WORDS FOR THE SHARED DEADLINE SENTENCES. The English says what
 * `DEADLINE_GAP_SENTENCES` in src/shared/deadlines.ts and `DUE_STANDING_SENTENCES` in
 * src/shared/work.ts say, with the gap sentences' first letter up; where those name a stored field
 * (`effort_hours`, `due`), the page's words name what it holds instead. The tables below say which
 * key holds each one.
 */
const DEADLINE_GAP_WORDS: Readonly<Record<keyof typeof DEADLINE_GAP_SENTENCES, WordKey>> = {
  'no-work-named': 'g2b.deadline.gap.no-work-named',
  'nothing-estimated': 'g2b.deadline.gap.nothing-estimated',
  'some-work-unestimated': 'g2b.deadline.gap.some-work-unestimated',
  'no-date': 'g2b.deadline.gap.no-date',
  'deadline-passed': 'g2b.deadline.gap.deadline-passed',
  'no-whole-period-in-window': 'g2b.deadline.gap.no-whole-period-in-window',
  'periods-overlap-the-window': 'g2b.deadline.gap.periods-overlap-the-window',
  'no-capacity-stated': 'g2b.deadline.gap.no-capacity-stated',
  'some-periods-without-capacity': 'g2b.deadline.gap.some-periods-without-capacity',
  'some-allocations-without-hours': 'g2b.deadline.gap.some-allocations-without-hours',
  'plan-at-another-horizon': 'g2b.deadline.gap.plan-at-another-horizon',
  'plan-in-a-clipped-period': 'g2b.deadline.gap.plan-in-a-clipped-period',
}

/** A size of period, in the page's language. The stored word is `GRAINS` in src/shared/planning.ts. */
function grainWord(grain: Grain): string {
  return grain === 'month' ? t('g2b.grain.month') : grain === 'week' ? t('g2b.grain.week') : t('g2b.grain.day')
}
const DUE_STANDING_WORDS: Readonly<Record<keyof typeof DUE_STANDING_SENTENCES, WordKey>> = {
  'dated': 'g2b.deadline.standing.dated',
  'date-unreadable': 'g2b.deadline.standing.date-unreadable',
  'waiting-on-a-condition': 'g2b.deadline.standing.waiting-on-a-condition',
  'waiting-on-a-record': 'g2b.deadline.standing.waiting-on-a-record',
  'no-due-recorded': 'g2b.deadline.standing.no-due-recorded',
}

/**
 * WHICH PERIODS THE PLAN IS READ FOR, taken from the report itself rather than worked out again.
 *
 * The reply already says which periods of the counted horizon lie wholly inside the window
 * (`planned.periods`) and which the window only clips (`capacity.partial`). Recomputing them in the
 * browser would be a second answer to one question — the defect this repository keeps finding — and
 * the two would disagree the moment the browser's clock and the server's fell on different sides of
 * midnight.
 *
 * THE CLIPPED PERIODS ARE INCLUDED, deliberately. Their hours are NOT counted by the arithmetic and
 * must not be; but the week today falls in is clipped by definition and is exactly where near work
 * is already planned, so a candidate list that left it out would hide the most relevant work on the
 * plan. Offering a record as a candidate is not counting it.
 */
export function candidatePeriods(outlook: DeadlineOutlook): string[] {
  if (outlook.between === null) return []
  const all = [...outlook.between.planned.periods, ...outlook.between.capacity.partial]
  return [...new Set(all)].sort()
}

/** How many periods' plans one panel will read. Bounded, and what is left out is said on screen. */
export const CANDIDATE_PERIODS_READ = 12

/** One record the plan gives time to, in a period between now and the deadline. */
export interface AllocatedCandidate {
  period: string
  id: string
  /** What to call it in a list, which for a block is not its title — see `AllocatedWork.name`. */
  name: string
  kind: string
  workspaceId: string
  effortHours: number | null
}

/**
 * What a candidate row can say about how big the work is. THREE ANSWERS, NOT TWO.
 *
 * `not-carried` is the one that would otherwise be lost: a link row carries the other record's id,
 * kind, title and summary and NOT its `effort_hours`, so a linked candidate drawn as "nobody
 * estimated it" would be this page inventing a finding out of a field it never asked for.
 */
export type CandidateEstimate =
  | { at: 'stated'; hours: number }
  | { at: 'nobody-said' }
  | { at: 'not-carried' }

/** One piece of work a person may tick, and where the offer came from. */
export interface DeadlineCandidate {
  id: string
  name: string
  kind: string
  /** Every source that offered it, in the words of the source. A record can be in both lists. */
  from: string[]
  /** Which project owns it. A plan spans projects, so a row that did not say would be unreadable. */
  project: string
  estimate: CandidateEstimate
}

/**
 * The two offers merged into one list, each row keeping every source that named it.
 *
 * A LINKED CANDIDATE'S PROJECT IS THIS RECORD'S OWN, and that is a stored fact rather than an
 * assumption: a link across a workspace boundary is refused on create and on restore, so the other
 * end of a link is in the same project as this end. An allocated candidate says its own, because
 * the plan is person-level and one week legitimately holds three projects.
 *
 * A BROKEN LINK IS COUNTED, NOT DROPPED. It cannot be sized — there is no record left to read an
 * estimate off — but silently offering a shorter list would be this panel deciding, on its own, that
 * some of what was written down does not exist. Allocations whose record is gone are counted the
 * same way, one level up, where the plan is read.
 */
export function mergeCandidates(input: {
  /** The record the deadline is on. It is never offered as its own work. */
  self: { id: string; workspaceId: string }
  links: readonly GatedLink[]
  allocated: readonly AllocatedCandidate[]
}): { candidates: DeadlineCandidate[]; brokenLinks: number } {
  const byId = new Map<string, DeadlineCandidate>()
  let brokenLinks = 0
  for (const link of input.links) {
    if (link.other.id === input.self.id) continue
    if (link.broken) {
      brokenLinks++
      continue
    }
    const existing = byId.get(link.other.id)
    const said = t('g2b.deadline.fromLink', { label: link.label })
    if (existing !== undefined) {
      if (!existing.from.includes(said)) existing.from.push(said)
      continue
    }
    byId.set(link.other.id, {
      id: link.other.id,
      name: link.other.title,
      kind: link.other.kind,
      from: [said],
      project: input.self.workspaceId,
      estimate: { at: 'not-carried' },
    })
  }
  for (const row of input.allocated) {
    if (row.id === input.self.id) continue
    const said = t('g2b.deadline.fromPlan', { period: row.period })
    const existing = byId.get(row.id)
    if (existing !== undefined) {
      if (!existing.from.includes(said)) existing.from.push(said)
      // The plan DOES carry the estimate, so a row a link could not size can be sized now. The
      // other direction never happens: a stated estimate is never replaced by "not carried".
      if (existing.estimate.at === 'not-carried') {
        existing.estimate = row.effortHours === null ? { at: 'nobody-said' } : { at: 'stated', hours: row.effortHours }
      }
      existing.project = row.workspaceId
      continue
    }
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      kind: row.kind,
      from: [said],
      project: row.workspaceId,
      estimate: row.effortHours === null ? { at: 'nobody-said' } : { at: 'stated', hours: row.effortHours },
    })
  }
  return { candidates: [...byId.values()], brokenLinks }
}

/**
 * Ids a person ticked that the report did not size.
 *
 * `?work=` names records BY ID, and an id no record answers to used to be dropped in silence — a
 * total covering three of the four things you ticked, drawn as though it covered four, which is
 * exactly the confident-number-about-nothing this whole report exists to prevent. This page found
 * it by comparing what it asked for against what came back.
 *
 * THE ROUTE ANSWERS IT NOW, as `named.missing`, and this stays as the page's own check of the same
 * question rather than being deleted: the comparison is between what THIS SCREEN asked for and what
 * arrived, which is a question only the caller can ask — a reply that dropped an id AND forgot to
 * list it would still be caught here. The two are asserted to agree in tests/deadline-panel.test.ts.
 */
export function unsizedIds(asked: readonly string[], outlook: DeadlineOutlook): string[] {
  const sized = new Set(outlook.work.map((row) => row.recordId))
  return asked.filter((id) => !sized.has(id))
}

/**
 * Remember what a record is CALLED, at the moment it is ticked.
 *
 * FOUND BY DRIVING THIS IN A BROWSER, and it is not a tidiness. The offer is rebuilt from the
 * periods between now and the deadline, so changing the horizon rebuilds it: tick a block the plan
 * gives time to this week, then count at the day horizon, and the offer is now made of ten DAYS that
 * hold no allocation — the block is no longer in it, and the row that sizes the block printed
 * `PiQzVdq42ufa` where its name had been. A nanoid on screen where a name belongs is the exact
 * complaint the whole of this surface was built to answer.
 *
 * IT REMEMBERS AND IT DOES NOT INVENT. An id no offer has ever named is not added, and the row for
 * it still draws the id marked as an id, which is the truthful answer to "what is this called".
 */
export function nameMemory(
  remembered: ReadonlyMap<string, string>,
  candidates: readonly DeadlineCandidate[],
  ticked: string,
): ReadonlyMap<string, string> {
  if (remembered.has(ticked)) return remembered
  const offered = candidates.find((candidate) => candidate.id === ticked)
  if (offered === undefined) return remembered
  return new Map(remembered).set(ticked, offered.name)
}

/** An amount of hours that is known. Split out so the nullable one below cannot be given no words. */
function HoursNum({ hours }: { hours: number }) {
  return (
    <span className="num dp-hours">
      {hours} <span className="dp-unit">{t('g2b.deadline.hourUnit')}</span>
    </span>
  )
}

/**
 * An amount of hours, or the sentence saying WHICH silence this is.
 *
 * `none` is required and is a sentence rather than a flag, because there is no wording that is
 * right for every null on this panel: an unknown capacity, an unknown estimate and a row with no
 * window to be placed in are three different facts, and one shared "—" for all three would be the
 * empty cell that reads as "nothing" — which is the one thing this report must never say by
 * accident.
 */
function Hours({ hours, none }: { hours: number | null; none: string }) {
  if (hours === null) return <span className="rp-none">{none}</span>
  return <HoursNum hours={hours} />
}

/**
 * The report, drawn. Takes the whole outlook and draws it; it fetches nothing and computes nothing.
 *
 * Separated from the panel below so that it can be rendered against a report built by
 * `deadlineOutlook` itself in a test — which is the only way to check that a null in the arithmetic
 * reaches the screen as words rather than as a nought.
 */
export function DeadlineOutlookView({
  outlook,
  asked,
  nameFor,
}: {
  outlook: DeadlineOutlook
  /** Every id the reader ticked, so this can say which of them the report left out. */
  asked: readonly string[]
  /** A title for an id, or null when this page has not loaded one. Never invents one. */
  nameFor: (id: string) => string | null
}) {
  const { deadline, between, estimate, buffer, horizon } = outlook
  // HOW LONG IS LEFT, in `latePhrase`'s words: the app's one wording for a date that has passed or is
  // still ahead, read by the work chip and Home too, so late is 逾期 in Chinese on all three (wave 13q's
  // round 28). The moment the outlook was worked out is the due moment less the time remaining, and the
  // days are calendar days counted by `dueCount` (problem R74WVeH6LZPU).
  const readAt = deadline.atMs === null || deadline.remainingMs === null ? null : deadline.atMs - deadline.remainingMs
  // A DATE OR A MOMENT, as it was stored: `readDueStamp` says which, so the record page counts it the way the work page does.
  const form = deadline.date === null ? null : (readDueStamp(deadline.date)?.due ?? null)
  const left = readAt === null || form === null ? null : latePhrase(deadline.atMs, readAt, undefined, form)
  const unsized = unsizedIds(asked, outlook)

  return (
    <div className="dp-report">
      <dl className="rp-owed">
        <dt>{t('g2b.obligation.due')}</dt>
        <dd>
          {deadline.date === null ? (
            <span className="rp-none">{t('g2b.deadline.noDate')}</span>
          ) : (
            <>
              <time dateTime={deadline.date}>{formatDue(deadline.date)}</time> <span className="rp-owed-raw">{t('g2b.obligation.storedAs', { value: deadline.date })}</span>
            </>
          )}
        </dd>

        <dt>{t('g2b.deadline.left')}</dt>
        <dd>
          {left === null ? (
            <span className="rp-none">
              {t('g2b.deadline.noTimeLeft', { because: t(DUE_STANDING_WORDS[deadline.standing]) })}
            </span>
          ) : deadline.past === true ? (
            <StateChip state="overdue" label={left.text} />
          ) : (
            <span className="dp-left num">{left.text}</span>
          )}
        </dd>

        {deadline.condition === null ? null : (
          <>
            <dt>{t('g2b.deadline.trigger')}</dt>
            <dd>
              {deadline.condition}{' '}
              <span className="rp-owed-raw">{t('g2b.deadline.personJudges')}</span>
            </dd>
          </>
        )}

        {deadline.recordId === null ? null : (
          <>
            <dt>{t('g2b.deadline.owedWhen')}</dt>
            <dd>
              <RouteLink to={recordPath(deadline.recordId)}>
                {nameFor(deadline.recordId) ?? deadline.recordId}
              </RouteLink>{' '}
              {t('g2b.deadline.finishesUnchecked')}
            </dd>
          </>
        )}

        {between === null ? null : (
          <>
            <dt>{t('g2b.deadline.stretch')}</dt>
            <dd>
              {t('g2b.deadline.window', { n: between.window.days, from: formatDue(between.window.from), to: formatDue(between.window.to) })}
            </dd>
          </>
        )}
      </dl>

      {estimate.items === 0 ? null : (
        <dl className="rp-owed dp-sums">
          <dt>{t('g2b.deadline.size')}</dt>
          <dd>
            {estimate.estimated === 0 ? (
              <span className="rp-none">
                {t('g2b.deadline.noSize', { n: estimate.items })}
              </span>
            ) : (
              <>
                <HoursNum hours={estimate.hours} />{' '}
                <span className="dp-qual">
                  {t('g2b.deadline.sizeOver', { n: estimate.items, estimated: estimate.estimated })}
                  {estimate.unestimated > 0
                    ? t('g2b.deadline.sizeOthers', { n: estimate.unestimated })
                    : ''}
                </span>
              </>
            )}
          </dd>

          {between === null ? (
            <>
              <dt>{t('g2b.deadline.planCapacityBuffer')}</dt>
              <dd>
                <span className="rp-none">
                  {t('g2b.deadline.noStretch')}
                </span>
              </dd>
            </>
          ) : (
            <>
              <dt>{t('g2b.deadline.planned')}</dt>
              <dd>
                <HoursNum hours={between.planned.hours} />{' '}
                <span className="dp-qual">
                  {t('g2b.deadline.plannedOver', { n: between.planned.allocations, horizon: grainWord(horizon) })}
                  {between.planned.periods.length === 0
                    ? t('g2b.deadline.plannedNoPeriod')
                    : t('g2b.deadline.plannedIn', { periods: between.planned.periods.join(', ') })}
                  {between.planned.unstated > 0
                    ? t('g2b.deadline.plannedUnstated', { n: between.planned.unstated })
                    : ''}
                  {between.planned.atOtherHorizons > 0
                    ? t('g2b.deadline.plannedOtherHorizons', { n: between.planned.atOtherHorizons })
                    : ''}
                  {between.planned.inClippedPeriods > 0
                    ? t('g2b.deadline.plannedClipped', { n: between.planned.inClippedPeriods })
                    : ''}
                </span>
              </dd>

              <dt>{t('g2b.deadline.unplaced')}</dt>
              <dd>
                <Hours
                  hours={between.unplaced.hours}
                  none={t('g2b.deadline.unplacedNone')}
                />{' '}
                {between.unplaced.hours === null ? null : (
                  <span className="dp-qual">
                    {t('g2b.deadline.unplacedOver', { n: between.unplaced.counted })}
                    {between.unplaced.uncounted > 0
                      ? t('g2b.deadline.unplacedUncounted', { n: between.unplaced.uncounted })
                      : ''}
                    {between.unplaced.hoursAgainstUnestimated > 0
                      ? t('g2b.deadline.unplacedAgainst', { hours: between.unplaced.hoursAgainstUnestimated })
                      : ''}
                  </span>
                )}
              </dd>

              <dt>{t('g2b.deadline.capacity')}</dt>
              <dd>
                <Hours
                  hours={between.capacity.hours}
                  none={t('g2b.deadline.capacityNone')}
                />{' '}
                <span className="dp-qual">
                  {t('g2b.deadline.capacityStated', { n: between.capacity.periods.length, stated: between.capacity.stated, horizon: grainWord(horizon) })}
                  {between.capacity.unstated > 0
                    ? t('g2b.deadline.capacityUnstated', { n: between.capacity.unstated })
                    : ''}
                  {between.capacity.partial.length > 0
                    ? t('g2b.deadline.capacityClipped', { n: between.capacity.partial.length, periods: between.capacity.partial.join(', ') })
                    : ''}
                  {between.capacity.periodsAlreadyStarted > 0
                    ? t('g2b.deadline.capacityStarted', { n: between.capacity.periodsAlreadyStarted })
                    : ''}
                </span>
              </dd>

              <dt>{t('g2b.deadline.buffer')}</dt>
              <dd>
                <BufferSays buffer={buffer} outlook={outlook} />
              </dd>
            </>
          )}
        </dl>
      )}

      {outlook.work.length === 0 ? null : (
        <div className="dp-rows">
          {/* No note under the heading. It said the totals above are these rows added up, which is
              what a total under a list of rows already means. */}
          <h4 className="dp-group">{t('g2b.deadline.eachPiece')}</h4>
          {outlook.work.map((row) => (
            <div className="dp-row" key={row.recordId}>
              <div className="dp-row-name">
                {/* The id, when nothing in this reading knows the record's name. It writes its own
                    element rather than calling RecordId, and its look comes from RecordId's
                    stylesheet all the same — see the note on the rp-id rule there. */}
                {nameFor(row.recordId) ?? <code className="rp-id">{row.recordId}</code>}
              </div>
              <div className="dp-row-nums">
                <span className="dp-cell">
                  <span className="dp-cell-key">{t('g2b.deadline.estimate')}</span>
                  <Hours hours={row.effortHours} none={t('g2b.deadline.nobodyEstimatedIt')} />
                </span>
                <span className="dp-cell">
                  <span className="dp-cell-key">{t('g2b.deadline.plannedKey')}</span>
                  <Hours
                    hours={row.plannedHours}
                    none={t('g2b.deadline.noWindowPlaced')}
                  />
                  {row.allocations === null || row.allocations === 0 ? null : (
                    <span className="dp-qual">
                      {t('g2b.deadline.rowOver', { n: row.allocations })}
                      {row.stated !== null && row.stated < row.allocations
                        ? t('g2b.deadline.rowUnstated', { n: row.allocations - row.stated })
                        : ''}
                    </span>
                  )}
                </span>
                <span className="dp-cell">
                  <span className="dp-cell-key">{t('g2b.deadline.unplacedKey')}</span>
                  <Hours
                    hours={row.unplacedHours}
                    none={
                      row.effortHours === null
                        ? t('g2b.deadline.rowNoEstimate')
                        : t('g2b.deadline.rowNoWindow')
                    }
                  />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {unsized.length === 0 ? null : (
        <p className="dp-unsized">
          {t('g2b.deadline.unsized', { n: unsized.length })} <code className="rp-id">{unsized.join(', ')}</code>
        </p>
      )}

      <div className="dp-gaps">
        <h4 className="dp-group">{t('g2b.deadline.couldNotCount')}</h4>
        {outlook.gaps.length === 0 ? (
          <p className="dp-gap-none">{t('g2b.deadline.nothingMissed')}</p>
        ) : (
          <ul className="dp-gap-list">
            {outlook.gaps.map((gap) => (
              <li key={gap}>{t(DEADLINE_GAP_WORDS[gap])}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * Whether the estimated work fits, in the three answers there are.
 *
 * NULL IS NEVER FALSE. "It does not fit" and "nobody has said" are different sentences and only one
 * of them is a reason to move a deadline, so the third answer says WHICH input is missing rather
 * than shrugging: with no capacity stated the buffer is unknown for one reason, and with nothing
 * estimated it is unknown for another, and they are not the same problem to fix.
 */
function BufferSays({ buffer, outlook }: { buffer: DeadlineOutlook['buffer']; outlook: DeadlineOutlook }) {
  const hours = buffer.hours
  if (hours === null || buffer.fits === null) {
    const capacityKnown = outlook.between !== null && outlook.between.capacity.hours !== null
    return (
      <span className="rp-none">
        {t('g2b.deadline.cannotSayFits', {
          because:
            outlook.estimate.estimated === 0 && !capacityKnown
              ? t('g2b.deadline.becauseNeither')
              : outlook.estimate.estimated === 0
                ? t('g2b.deadline.becauseNoEstimate')
                : t('g2b.deadline.becauseNoCapacity'),
        })}
      </span>
    )
  }
  if (buffer.fits) {
    return (
      <>
        {t('g2b.deadline.fitsBefore')} <HoursNum hours={hours} /> {t('g2b.deadline.fitsAfter')}
      </>
    )
  }
  return (
    <>
      <StateChip state="overdue" label={t('g2b.deadline.short', { hours: Math.abs(hours) })} /> {t('g2b.deadline.doesNotFit')}
    </>
  )
}

/**
 * Which work is relevant, offered rather than guessed.
 *
 * Drawn as one list with every source on the row, not as two lists: a record that is both linked to
 * this one and already on the plan is ONE piece of work, and drawing it twice would invite it to be
 * ticked twice — which the arithmetic then de-duplicates silently, leaving a person looking at a
 * total that does not match what they believe they asked for.
 */
export function DeadlineWorkPicker({
  candidates,
  chosen,
  onToggle,
  brokenLinks,
  goneAllocations,
  periodsRead,
  periodsSkipped,
  reading,
  windowless,
  problem,
}: {
  candidates: readonly DeadlineCandidate[]
  chosen: readonly string[]
  onToggle: (id: string) => void
  brokenLinks: number
  goneAllocations: number
  /** The periods whose plan was actually read, so the offer says how far it looked. */
  periodsRead: readonly string[]
  /** Periods inside the window that were NOT read, because there were more than one panel reads. */
  periodsSkipped: readonly string[]
  /** True while the plan is still being read. The list is then incomplete and says so. */
  reading: boolean
  /** True when there is no stretch of time to read a plan over, which is not the same as an empty plan. */
  windowless: boolean
  /** The server's own words when the plan could not be read at all. */
  // The failed read's sentence and what sort of failure it was, so ErrorNote draws it by its one rule.
  problem: { message: string; fault: ReturnType<typeof faultOf> } | null
}) {
  const ticked = new Set(chosen)
  return (
    <div className="dp-pick">
      {/* The note under this heading is now behind the small round question mark. Why Mole Office asks
          instead of working it out is worth knowing once and is not worth a paragraph above the
          list every time. */}
      <h4 className="dp-group">
        {t('g2b.deadline.whichWork')}
        <Hint label={t('g2b.deadline.whySay')}>
          {t('g2b.deadline.whySayBody')}
        </Hint>
      </h4>

      {problem === null ? null : (
        <ErrorNote label={t('g2b.deadline.planUnread')} message={problem.message} fault={problem.fault}>
          <p className="dp-plan-unread-more">{t('g2b.deadline.planUnreadMore')}</p>
        </ErrorNote>
      )}
      {reading ? (
        <p className="dp-reading">
          {t('g2b.deadline.readingPlan', { n: periodsRead.length })}
        </p>
      ) : null}
      {windowless ? (
        <p className="dp-left-out">
          {t('g2b.deadline.windowless')}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        // "Nothing is on the plan" is a FINDING, and it may only be drawn when the plan was
        // actually read. While it is still being read, when there was no window to read it over,
        // and when the read failed, the true answer is that nobody has looked — and the three
        // notes above say which. Saying the finding in any of those cases would be this panel
        // reporting an absence it never established.
        //
        // THE TWO ANSWERS ARE STILL TOLD APART, AND THAT IS WHAT `looked` CARRIES. The weight is
        // gone — a short mark instead of a sentence — and the sentence is on the mark.
        <Absence
          tier="told-apart"
          looked={!reading && !windowless && problem === null}
          word={reading || windowless || problem !== null ? t('g2b.deadline.nothingLinkedUnread') : t('g2b.deadline.nothingToOffer')}
          title={
            reading || windowless || problem !== null
              ? t('g2b.deadline.nothingLinkedUnreadTitle')
              : t('g2b.deadline.nothingToOfferTitle')
          }
        />
      ) : (
        <ul className="dp-cands">
          {candidates.map((candidate) => (
            <li className="dp-cand" key={candidate.id}>
              {/* A PRESS, NOT A TICK BOX. It records nothing and never did — see the panel's own
                  sentence — but a box on the screen is this product's one signal for "you pressed
                  Edit", and a box that changes only what is being counted would spend that signal
                  on something that is not editing. `aria-pressed` says the same thing a checked
                  box said, and the mark beside the name says it in ink. */}
              <button
                type="button"
                className="dp-cand-label"
                aria-pressed={ticked.has(candidate.id)}
                onClick={() => onToggle(candidate.id)}
              >
                <span className="dp-check" aria-hidden="true">
                  {ticked.has(candidate.id) ? '✓' : ''}
                </span>
                <span className="dp-cand-body">
                  <span className="dp-cand-line">
                    <Tag kind={candidate.kind} />
                    <span className="dp-cand-name">{candidate.name}</span>
                  </span>
                  <span className="dp-cand-meta">
                    {candidate.from.map((said) => (
                      <span className="dp-from" key={said}>
                        {said}
                      </span>
                    ))}
                    <span className="dp-proj">{t('g2b.deadline.project', { project: candidate.project })}</span>
                    <span className="dp-est">
                      {candidate.estimate.at === 'stated'
                        ? t('g2b.deadline.estimatedAt', { hours: candidate.estimate.hours })
                        : candidate.estimate.at === 'nobody-said'
                          ? t('g2b.deadline.nobodyEstimated')
                          : t('g2b.deadline.notCarried')}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {brokenLinks === 0 ? null : (
        <p className="dp-left-out">
          {t('g2b.deadline.brokenLinks', { n: brokenLinks })}
        </p>
      )}
      {goneAllocations === 0 ? null : (
        <p className="dp-left-out">
          {t('g2b.deadline.goneAllocations', { n: goneAllocations })}
        </p>
      )}
      {periodsSkipped.length === 0 ? null : (
        <p className="dp-left-out">
          {t('g2b.deadline.skipped', { read: periodsRead.length, n: periodsSkipped.length, periods: periodsSkipped.join(', ') })}
        </p>
      )}
    </div>
  )
}

/**
 * The panel: one deadline, the work a person names for it, and what the arithmetic makes of both.
 *
 * TWO REQUESTS, IN ORDER, AND THE SECOND DEPENDS ON THE FIRST. The report says which periods lie
 * between now and the deadline at the counted horizon; only then can the plan be read for them. The
 * alternative was working the periods out in the browser, which would be a second answer to a
 * question the reply already answers — see `candidatePeriods`.
 */
export function DeadlinePanel({ record, links }: { record: PanelRecord; links: readonly GatedLink[] }) {
  const [horizon, setGrain] = useState<Grain>('week')
  const [chosen, setChosen] = useState<readonly string[]>([])
  /**
   * THE NAME OF EVERY RECORD THAT HAS BEEN TICKED, kept because the offer can stop carrying it.
   *
   * Found by driving this in a browser: tick a block the plan gives time to this week, then count at
   * the day horizon, and the candidate list is rebuilt from the DAYS between now and the deadline —
   * which hold no allocation, so the block is no longer offered and the row that sizes it printed
   * `PiQzVdq42ufa` where its name had been. A nanoid on screen where a name belongs is the exact
   * complaint this whole surface was built to answer.
   *
   * It remembers a name this page was already told; it never invents one. An id nothing has ever
   * named still draws as an id, marked as an id.
   */
  const [namesSeen, setNamesSeen] = useState<ReadonlyMap<string, string>>(new Map())
  // Sorted, so ticking A then B and ticking B then A are one request rather than two.
  const workKey = [...chosen].sort().join(',')

  // `record.updatedAt` IS IN THE KEY, AND THAT IS THE WHOLE OF THE FIX. Writing `due` in the field
  // editor above re-read the record — so "What is owed, and to whom" said 26 Aug — while this panel
  // kept the answer it had fetched under the old date and went on saying "7 DAYS LATE". Two dates,
  // one page, one second after somebody typed one of them, with nothing on screen suggesting a
  // reload. Found by an independent reviewer on the exact journey this panel was built for.
  const [outlookState, reloadOutlook] = useAsync(
    () => api.deadline(record.id, [...chosen].sort(), horizon),
    [record.id, record.updatedAt, workKey, horizon],
  )

  const outlook = outlookState.status === 'ready' ? outlookState.value.outlook : null
  const periods = outlook === null ? [] : candidatePeriods(outlook)
  const read = periods.slice(0, CANDIDATE_PERIODS_READ)
  const skipped = periods.slice(CANDIDATE_PERIODS_READ)

  // THE KEY TRAVELS WITH THE ANSWER. `useAsync` sets `loading` from an effect, which runs AFTER the
  // render in which the periods changed — so for one frame the previous window's rows are `ready`
  // and would be drawn as this window's complete offer. Comparing the key the reply was loaded for
  // against the one wanted now makes that frame say "still reading" instead of quietly lying.
  const planKey = read.join(',')
  const [planState] = useAsync(async () => {
    const replies = await Promise.all(read.map((period) => api.plan(period)))
    const rows: AllocatedCandidate[] = []
    let gone = 0
    for (const reply of replies) {
      for (const entry of reply.entries) {
        // An allocation whose record is gone is a fact about the plan and is counted, not dropped.
        if (entry.work === null || entry.work.deleted) {
          gone++
          continue
        }
        rows.push({
          period: reply.period,
          id: entry.work.id,
          name: entry.work.name,
          kind: entry.work.kind,
          workspaceId: entry.work.workspaceId,
          effortHours: entry.work.effortHours,
        })
      }
    }
    return { rows, gone, key: read.join(',') }
  }, [planKey])

  const planFresh = planState.status === 'ready' && planState.value.key === planKey
  const allocated = planFresh && planState.status === 'ready' ? planState.value.rows : []
  const { candidates, brokenLinks } = mergeCandidates({
    self: { id: record.id, workspaceId: record.workspaceId },
    links,
    allocated,
  })
  const goneRows = planFresh && planState.status === 'ready' ? planState.value.gone : 0
  const nameById = new Map(candidates.map((c) => [c.id, c.name]))

  function toggle(id: string) {
    setNamesSeen(nameMemory(namesSeen, candidates, id))
    setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  return (
    <Panel declares={{ surface: null }}
      title={t('g2b.deadline.title')}
      kind={t('g2b.deadline.kind')}
      actions={<Tag tone="quiet">{chosen.length === 0 ? t('g2b.deadline.noWorkNamed') : t('g2b.deadline.piecesNamed', { n: chosen.length })}</Tag>}
    >
      <div className="dp-horizon">
        {/* THREE PRESSES, NOT A DROPDOWN, for the reason the tick boxes below give: this chooses
            what is counted and writes nothing, and a dropdown on a page being read would teach the
            opposite of the rule the rest of this page keeps. Three choices also fit on one line,
            so nothing is hidden by making them visible. */}
        <span className="dp-hz-label">{t('g2b.deadline.countBy')}</span>
        <span className="dp-hz" role="group" aria-label={t('g2b.deadline.countBy')}>
          {GRAINS.map((h) => (
            <button
              key={h}
              type="button"
              className="dp-hz-one"
              aria-pressed={horizon === h}
              onClick={() => setGrain(h)}
            >
              {grainWord(h)}
            </button>
          ))}
        </span>
        {/* The one thing here that no arrangement of pixels can carry: the same hours can be
            written down twice, at two sizes of period, and only one size is counted. */}
        <Hint label={t('g2b.deadline.whyHorizon')}>
          {t('g2b.deadline.whyHorizonBody')}
        </Hint>
      </div>

      {outlookState.status === 'loading' ? (
        <Loading label={t('g2b.deadline.loading')} rows={3} />
      ) : outlookState.status === 'error' ? (
        <ErrorNote message={outlookState.message} fault={outlookState.fault} retry={reloadOutlook} />
      ) : (
        <>
          <DeadlineOutlookView
            outlook={outlookState.value.outlook}
            asked={chosen}
            nameFor={(id) => nameById.get(id) ?? namesSeen.get(id) ?? null}
          />
          <DeadlineWorkPicker
            candidates={candidates}
            chosen={chosen}
            onToggle={toggle}
            brokenLinks={brokenLinks}
            goneAllocations={goneRows}
            periodsRead={read}
            periodsSkipped={skipped}
            reading={read.length > 0 && !planFresh && planState.status !== 'error'}
            windowless={outlookState.value.outlook.between === null}
            problem={planState.status === 'error' ? { message: planState.message, fault: planState.fault ?? null } : null}
          />
          <Explain declares={{ surface: null }}
            meaning={<span>{t('g2b.deadline.explain')}</span>}
            opens={t('g2b.deadline.explainOpens')}
          >
            <p className="rp-note">{outlookState.value.note}</p>
          </Explain>
        </>
      )}
    </Panel>
  )
}

// ============================================================================ writing a field

/**
 * THE BOXES THAT WRITE A RECORD'S OWN FIELDS, BUILT FROM THE DECLARATION AND NEVER FROM A LIST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 * A reviewer walked the whole product as a person and found this: of everything Mole Office itself says
 * a human has to supply, exactly two had a control. This page would print, in its own words,
 * "data.due is not filled in … send this in a PATCH when you know it" — and the Edit form beside
 * that sentence offered Title and Summary. The deadline panel below it, built to answer "is there
 * enough time", reported "nobody has estimated any of the 1 piece named" and had nowhere to say
 * how big the work was. Every one of those fields was writable over HTTP and none of them was
 * writable in a browser.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FORM IS BUILT FROM `KIND_SPECS` AND NOT FROM A LIST WRITTEN HERE
 * ---------------------------------------------------------------------------------------
 * A hand-written form is the defect this codebase keeps producing: two places that must agree,
 * with nothing making them agree. A field renamed in the schema would leave a box here writing a
 * key nothing reads — and it would be refused, which is the good case; a field ADDED would simply
 * never get a box, silently, which is the case that has already happened to every field on this
 * page.
 *
 * So every label, every hint, every example, every allowed word and every decision about WHICH
 * control to draw comes from `KIND_SPECS` — the same object `validateData` refuses a bad write
 * with, and the same object `GET /api/kinds/<kind>` serves. It is imported rather than fetched
 * because in this app the browser already holds it: `completenessOf` runs here, on these specs,
 * to work out what a record is missing. Fetching a copy of a module that is already in the bundle
 * would add a loading state and a second answer to one question.
 *
 * The type is read with `declaredTypeOf`, which is the parser `validateData` uses, so no string
 * like `'todo' | 'doing'` or `date | PauseUntil` is ever interpreted twice.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT OFFERED
 * ---------------------------------------------------------------------------------------
 * A nested object and a list are not one box. `consequence` is `{bearer, what}` where the bearer
 * is a vocabulary carrying the product's only safety mark; `paused` carries a `PauseUntil` inside
 * it; `parts` is a list of objects each holding a list of objects. Half a nested object is a hard
 * refusal on the write path, so a control that could only write half of one would be a control
 * that cannot succeed. Each of those says so on the row, in the words of its own declaration,
 * rather than being missing from the list — a field with no box and no explanation is how this
 * whole defect looked in the first place.
 */

/** What kind of control one declared field gets, or why it gets none. */
export type WriteControl =
  /** A paragraph. Every declared `string`. */
  | { at: 'text' }
  /** A stamp in the grammar shared/time.ts reads. Every declared `date`. */
  | { at: 'date' }
  | { at: 'number' }
  | { at: 'boolean' }
  /** A declared vocabulary: these words and no others. */
  | { at: 'words'; words: readonly string[] }
  /**
   * One field written in more than one FORM — `obligation.due`, and nothing else in the schema.
   * `forms` are the alternatives, each a declared field of the shape; `bare` is the declared type
   * whose form is written on its own rather than inside an object.
   */
  | { at: 'forms'; forms: readonly FieldSpec[]; bare: string }
  /** There is a control for this field, and it is somewhere else on this page. */
  | { at: 'elsewhere'; because: string }
  /** No single honest control exists for this shape. The sentence says what the shape is. */
  | { at: 'no-control'; because: string }

/**
 * Fields that already have a control of their own, and where it is.
 *
 * NOT A LIST OF WHAT IS UNSUPPORTED — every one of these IS writable in the browser, by a control
 * that knows something this generic one does not. A second box beside it would be a second way to
 * write one fact, and in two of the four cases it would write it WORSE: `state: "fulfilled"` typed
 * into a select discharges an obligation with no note and no date, which is exactly what
 * `POST /api/records/:id/fulfil` exists to make impossible ("a discharge with nothing behind it is
 * indistinguishable from a mis-click a year later").
 *
 * The keys are field names, so they can go stale. tests/record-write.test.ts fails if any key here
 * is not a declared field of that kind, which turns a rename into a red test rather than into a
 * field that quietly becomes editable twice.
 */
// Getters, so each sentence is read in the page's language when it is drawn.
export const WRITTEN_ELSEWHERE: Partial<Record<RecordKind, Readonly<Record<string, string>>>> = {
  module: {
    get parts() { return t('g2b.field.elsewhere.parts') },
    get planning() { return t('g2b.field.elsewhere.planning') },
  },
  pipeline: {
    get blockIds() { return t('g2b.field.elsewhere.blockIds') },
  },
  obligation: {
    get state() { return t('g2b.field.elsewhere.state') },
    get done() { return t('g2b.field.elsewhere.done') },
    get fulfilledAt() { return t('g2b.field.elsewhere.fulfilledAt') },
    get fulfilledNote() { return t('g2b.field.elsewhere.fulfilledNote') },
  },
}

/**
 * The one key of `PauseUntil` that names a RECORD rather than holding a value a person types.
 *
 * Written out because nothing in the declaration says "this string is an id" — the field is a
 * `string` like any other, and its description is what tells a reader. Left generic it would be a
 * box asking for a nanoid, which is the exact complaint this whole change answers. So the control
 * offers the workspace's titles and stores the id behind them, and tests/record-write.test.ts fails
 * if `PauseUntil` stops declaring a field of this name.
 */
export const RECORD_REF_KEY = 'recordId'

/** What control one declared field gets. Everything is read from the declaration. */
export function controlFor(kind: RecordKind, field: FieldSpec): WriteControl {
  const own = WRITTEN_ELSEWHERE[kind]?.[field.key]
  if (own !== undefined) return { at: 'elsewhere', because: own }

  const node = declaredTypeOf(field)
  switch (node.kind) {
    case 'scalar':
      if (node.name === 'string') return { at: 'text' }
      if (node.name === 'date') return { at: 'date' }
      if (node.name === 'number') return { at: 'number' }
      return { at: 'boolean' }

    case 'literals':
      return { at: 'words', words: node.values }

    case 'either': {
      // A choice of written forms. There is exactly one in the schema — `obligation.due`, which is
      // a date, or the object a pause already uses for what ends it — and the three things a person
      // can mean are the three fields of that object. Offering only the date box is the one thing
      // shared/deadlines.ts exists to refuse: it would turn a condition nobody can check into a
      // deadline that can be late.
      const shape = node.options.find((option) => option.node.kind === 'shape')
      const bare = node.options.find((option) => option.node.kind === 'scalar')
      const spec = shape?.node.kind === 'shape' ? SHAPE_SPECS[shape.node.name] : undefined
      if (spec === undefined || bare === undefined) {
        return {
          at: 'no-control',
          because: t('g2b.field.noControlForms'),
        }
      }
      return { at: 'forms', forms: spec.fields, bare: bare.expr }
    }

    // The three sentences below start with the SHAPE and not with the key, because the key is on
    // the row an inch to the left, and they say nothing about how to write it, because the panel
    // says that once at its foot. Both were repetition measured on a real module page: seven of
    // eleven rows carried a paragraph, five of them ending in the same record id.
    //
    // THEY NAME NO DECLARED TYPE, AND THAT IS PROBLEM 2E5-mceErAZI. They used to paste it in, so a
    // person changing a record in Normal mode read "a list (string[])", "an open object of keys you
    // choose (Record<string, unknown>)" or "a ShortForms … It takes label?, title?, …". Those are
    // the schema's words for an agent, and GET /api/kinds is where an agent reads them. The sentence
    // says what KIND of shape it is, which is all a person needs to know why there is no box, and
    // it is worked out from the same declaration, so a new shape needs no new sentence. Developer
    // mode still shows the declared type, beside the key in DeclaredFields.
    case 'array':
    case 'cells':
      return {
        at: 'no-control',
        because: t('g2b.field.noControlList'),
      }

    case 'record':
    case 'open':
      return {
        at: 'no-control',
        because: t('g2b.field.noControlOpen'),
      }

    case 'shape':
      return {
        at: 'no-control',
        because: t('g2b.field.noControlShape'),
      }

    // A BARE NULL IS NEVER A FIELD'S TYPE: kinds.ts reads `null` only as one side of a choice, and
    // declaredTypeOf throws on it alone before this. Reaching here means that rule changed without this page.
    // The sentence names no kind and no key, so no stored word reaches it (tests/the-machine-word-gate.test.ts).
    case 'null':
      throw new Error('A field is declared as null alone, which no control can write.')
  }
}

/**
 * WHAT A SAVE DID, IN THE PAGE'S LANGUAGE (wave 13k round 43). The server's `note` is the same
 * sentence in English, for agents; both are built by `saveAnswer` from the reply's four lists, and
 * here each field is called what its label on this page calls it.
 */
function savedHere(kind: RecordKind, outcome: DataPatchOutcome | undefined): string | null {
  return outcome === undefined ? null : saveAnswer(outcome, (key) => fieldLabel(kind, key), t)
}

/** Lower a title's initial for a sentence, keeping abbreviations and the language names. */
function titleInASentence(title: string): string {
  if (/^(?:[A-Z]{2,}|English|Chinese)\b/u.test(title)) return title
  return title.replace(/^\p{Lu}/u, (first) => first.toLowerCase())
}

/**
 * WHAT A FIELD IS CALLED IN A LABEL, inside a sentence, in the page's language.
 *
 * A field the kind draws as a body section is called by that section's title, which the word lists
 * hold for every kind. A record's shorter forms have their own word. Any other field is called by
 * its kind's own `record.field.<kind>.<key>` word where the key means something else on that kind,
 * then by the word the version history uses for it, then by its own `record.field.<key>` word, and then by a
 * section title of that key where the word lists hold one. A field no list names is `record.field.withoutAWord`: its key written as English
 * words, which Chinese quotes and calls a field (a report found a Chinese page reading "For尚未填写",
 * an English key glued to the Chinese for "not filled in"; report 81bt4r1n6_8W).
 */
export function fieldLabel(kind: RecordKind | null, key: string): string {
  if (key === SHORT_FORMS_FIELD) return t('g2b.field.shortForms')
  if (kind !== null && bodySectionsDeclaredBy(kind).some((section) => section.key === key)) {
    return titleInASentence(titleHere(kind, key))
  }
  // A WORD FOR THIS KIND'S FIELD, WHERE ONE KEY MEANS DIFFERENT THINGS ON DIFFERENT KINDS. A
  // message's `read` is declared as NOT whether it has been read, and a report's `read` is exactly
  // that, so one word for both said the opposite of the message's declaration on its page (problem
  // gyRw1dubpNbK). `record.field.<kind>.<key>` is read before the word kept for the key alone.
  // tests/every-declared-field-has-a-word.test.ts fails on such a word for a field its kind does not
  // declare.
  if (kind !== null) {
    // JOINED AS sectionTitleKey JOINS ITS KEY: the kind chooses a key for `t` and is never drawn itself.
    const ofThisKind = 'record.field.' + kind + '.' + key
    if (Object.hasOwn(WORD_LISTS.en, ofThisKind)) return t(ofThisKind as WordKey)
  }
  const named = historyFieldName(key)
  if (named !== null) return named
  // A FIELD'S OWN WORD WHERE THE HISTORY HAS NONE, by item 5 of a decision.
  // The history's list also decides which fields its normal reading shows, and `depth`, `whose_move`
  // and the rest stay out of that reading, so their words are read here from the same
  // `record.field.<key>` words rather than added to that list.
  // tests/every-declared-field-has-a-word.test.ts fails on a declared field that reaches the fallback
  // below.
  const own = `record.field.${key}`
  if (Object.hasOwn(WORD_LISTS.en, own)) return t(own as WordKey)
  // A SECTION TITLE FOR THIS KEY IS THE FIELD'S WORD TOO: a report's `for` is called what a draft's
  // section of that name is called.
  const section = `record.section.${key}`
  if (Object.hasOwn(WORD_LISTS.en, section)) {
    return titleInASentence(t(section as WordKey, kind === null ? {} : { kind: kindWord(kind).text }))
  }
  // NO WORD FOR THIS FIELD IN ANY LIST. English says the stored key as words; Chinese quotes those
  // words and says they name a field, rather than setting English into a Chinese sentence.
  return t('record.field.withoutAWord', { heading: englishHeading(key).toLowerCase() })
}

/**
 * WHAT A FIELD'S HINT SAYS TO THIS READER (decision fzfCG0b_jb98, wave 13k round 41, problem wJySCRPLJ6i5).
 *
 * A field's `description` in KIND_SPECS is written for an agent: it names requests, stored keys and example
 * values. A person hint is the same guidance written for a person, in the word lists as
 * `record.hint.<kind>.<key>`, in English and Chinese. In Normal mode a field's hint is its person hint where one
 * is written. Where none is written yet, it is the description, as before, so no guidance is taken away. In
 * Developer mode it is always the description. A field with neither has no hint.
 */
export function fieldHint(kind: RecordKind, field: FieldSpec, inspect: boolean): string | undefined {
  // JOINED AS fieldLabel JOINS `record.field.<kind>.<key>`.
  const ofThisKind = 'record.hint.' + kind + '.' + field.key
  // A HINT THAT NAMES THE OPTIONS NAMES THEM AS `{name}` MARKS, filled with the words the select shows.
  if (!inspect && Object.hasOwn(WORD_LISTS.en, ofThisKind)) {
    const control = controlFor(kind, field)
    return t(ofThisKind as WordKey, control.at === 'words' ? optionWords(kind, field.key, control.words) : undefined)
  }
  return field.description === '' ? undefined : field.description
}

/** What one control is ready to send, or the sentence saying why it is not ready. */
export type Draft = { can: true; value: unknown } | { can: false; because: string }

/** A record this browser can name, for the one form that stores an id and shows a title. */
export interface NamedRecord {
  id: string
  title: string
}


/**
 * The options of a control that offers a fixed set of values, plus WHATEVER IS ALREADY STORED
 * when that is not one of them.
 *
 * A `<select>` whose value matches no option draws its FIRST option as though it were selected. On
 * a record holding a word from before this vocabulary existed — the case `unclassifiedNote` is
 * written for — that would put a word on screen that is not in the record, in the one control whose
 * whole job is to show which word is stored. So the stored value is offered too, said to be what it
 * is; pressing Save on it sends it, and the write path refuses it with the list of words it accepts.
 */
export function valueOptions(
  typed: string,
  declared: readonly string[],
  placeholder: string,
  wordFor: (word: string) => string = (word) => word,
): { value: string; label: string }[] {
  const undeclared = typed !== '' && !declared.includes(typed)
  return [
    ...(typed === '' ? [{ value: '', label: placeholder }] : []),
    ...(undeclared
      ? [{ value: typed, label: t('g2b.field.undeclaredWord', { word: typed }) }]
      : []),
    ...declared.map((word) => ({ value: word, label: wordFor(word) })),
  ]
}

/**
 * THE WORD A PERSON READS FOR ONE OPTION OF A FIELD THAT HOLDS ONE OF A FEW WORDS (problem wJySCRPLJ6i5,
 * wave 13k round 42). The select on the record page and the field's hint both read it, so a hint names an
 * option by the word the select shows, in the page's language.
 *
 * A word the page already draws elsewhere is used from there: a state from `stateWord`, whose move from
 * `moveWord`, a direction's depth from `depthWord`, a draft's kind from `kindWord`. Every other option has
 * `record.option.<kind>.<key>.<name>` in the word lists. The names of programs and of languages are
 * names, and are drawn as they are written. A word with no reading is named as unknown, "unknown word:
 * chasing", the way every vocabulary names one, and never drawn as stored.
 *
 * `at` is a lookup key and is never drawn, so it is joined rather than written as a template: the
 * machine-word gate reads a template holding `kind` as a value reaching drawn text.
 */
export function optionWord(kind: RecordKind, key: string, value: string): string {
  const at = [kind, key].join('.')
  if (key === 'state') return stateWord(value, 'normal', kind).text
  if (key === 'whose_move' && (value === 'person' || value === 'agent' || value === 'either')) return moveWord(value)
  if (at === 'direction.depth') return depthWord(value)
  if (at === 'draft.becomes') return kindWord(value).text
  if (at === 'agent.language' && Object.hasOwn(LANGUAGES, value)) return LANGUAGES[value as keyof typeof LANGUAGES]
  if (at === 'session.adaptedTool' || at === 'agent.runtime') return value
  const borrowed = OPTION_WORDS_ELSEWHERE[at]
  const word = borrowed === undefined ? `record.option.${OPTION_WORDS_SHARED[at] ?? at}.${optionName(value)}` : `${borrowed[0]}${value}${borrowed[1]}`
  return Object.hasOwn(WORD_LISTS.en, word) ? t(word as WordKey) : t('word.unknown.word', { stored: value })
}

/** The options whose words another page already draws: the key is the start and end around the stored word. */
const OPTION_WORDS_ELSEWHERE: Readonly<Record<string, readonly [string, string]>> = {
  'context_bundle.preset': ['g7a.bundles.preset.', '.word'],
  'context_bundle.detail': ['settingsPanel.detail.level.', ''],
  'goal.horizon': ['g7a.horizons.', ''],
  'tool.forWhom': ['g6b.toolset.audiences.', ''],
}

/** A field whose words are another kind's same field, read from there so the two cannot differ. */
const OPTION_WORDS_SHARED: Readonly<Record<string, string>> = {
  'ran_instead.severity': 'placeholder.severity',
}

/**
 * The name an option has in a word key and in a hint's `{…}` mark: the stored word with each run of
 * anything but a letter or a digit made one underscore, so `the owner` is `the_owner` and `agent-said`
 * is `agent_said`.
 */
export function optionName(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '_')
}

/** Each option's word, under its `optionName`, for a hint that names the options. */
export function optionWords(kind: RecordKind, key: string, values: readonly string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => [optionName(value), optionWord(kind, key, value)]))
}

/**
 * What the box will send. A pure function, so the one rule that matters can be tested:
 *
 * ABSENT, BLANK AND ZERO ARE THREE DIFFERENT THINGS.
 *   absent  — nobody has written this. Reached only by the Clear button, which sends a null and
 *             removes the key; never by an empty box, which cannot be saved at all.
 *   blank   — refused by the write path, and it is right to: a blank renders as a gap that reads
 *             as missing data. So an empty box disables Save rather than sending "".
 *   zero    — a real number. "0" is typed, non-empty, and sent as the number 0.
 *
 * A NUMBER THAT IS NOT A NUMBER IS SENT AS TYPED, on purpose. The refusal is then the server's own
 * sentence, naming the field and what a right value looks like — the same sentence an agent gets —
 * rather than a second opinion invented in a form.
 */
export function draftValue(
  control: WriteControl,
  typed: string,
  form: string,
  records: readonly NamedRecord[],
  /** What the record holds for this field now. Only the multi-form control has to know — see below. */
  stored?: unknown,
): Draft {
  const text = typed.trim()
  switch (control.at) {
    case 'text':
    case 'date':
      return text === '' ? { can: false, because: t('g2b.field.nothingTyped') } : { can: true, value: text }

    case 'number': {
      if (text === '') return { can: false, because: t('g2b.field.nothingTyped') }
      const n = Number(text)
      return { can: true, value: Number.isFinite(n) ? n : typed }
    }

    case 'boolean':
      return text === '' ? { can: false, because: t('g2b.field.nothingChosen') } : { can: true, value: text === 'true' }

    case 'words':
      return text === '' ? { can: false, because: t('g2b.field.nothingChosen') } : { can: true, value: text }

    case 'forms': {
      const chosen = control.forms.find((f) => f.key === form)
      if (chosen === undefined) {
        return {
          can: false,
          because: t('g2b.field.sayWhichForm', { forms: control.forms.map((f) => f.key).join(', ') }),
        }
      }
      if (text === '') return { can: false, because: t('g2b.field.nothingTyped') }
      // The short form. `readDue` reads a bare string and an object with the same key as one
      // answer, and every obligation in the database — and the field's own example — is the bare
      // one, so the box that writes a date writes what is already there. A bare value replaces
      // whatever was there whole, object or not, so it needs none of the care below.
      if (chosen.type === control.bare) return { can: true, value: text }

      let written: string = text
      if (chosen.key === RECORD_REF_KEY) {
        const named = records.find((r) => r.title === text)
        if (named === undefined) {
          return {
            can: false,
            because: t('g2b.field.noSuchTitle', { title: text }),
          }
        }
        written = named.id
      }

      // THE FORM YOU CHOSE REPLACES THE ONE THAT WAS THERE, AND SAYING SO TAKES EXPLICIT NULLS.
      //
      // `dataPatch` merges an object INTO an object, so `{recordId:…}` on a field already holding
      // `{condition:…}` stores both — and the record then says two different things about when it
      // is owed, one of which nobody chose. Found by driving this in a browser: picking the record
      // form after the condition form left the condition sitting beside it.
      //
      // A null inside a merge REMOVES a key, so the other forms are sent as nulls — but only when
      // there is an object to merge into. Against a string or an absent field the merge has nothing
      // to walk, the nulls would be STORED, and a null is refused by the write path with "leave the
      // key out entirely". So the two cases are told apart rather than one shape being sent hopefully.
      const replacing = typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      if (!replacing) return { can: true, value: { [chosen.key]: written } }
      return {
        can: true,
        value: Object.fromEntries(control.forms.map((f) => [f.key, f.key === chosen.key ? written : null])),
      }
    }

    case 'elsewhere':
    case 'no-control':
      return { can: false, because: control.because }
  }
}

/** The stored value a control starts from, as the string its box holds. Never invents one. */
export function draftFrom(control: WriteControl, stored: unknown, records: readonly NamedRecord[]): { typed: string; form: string } {
  const firstForm = control.at === 'forms' ? (control.forms[0]?.key ?? '') : ''
  if (stored === undefined || stored === null) return { typed: '', form: firstForm }

  if (control.at === 'forms') {
    // A bare value is the short form: the form whose declared type is the bare one.
    if (typeof stored === 'string') {
      const short = control.forms.find((f) => f.type === control.bare)
      return { typed: stored, form: short?.key ?? firstForm }
    }
    if (typeof stored === 'object' && !Array.isArray(stored)) {
      const held = stored as Record<string, unknown>
      // Declaration order, and it decides only which box opens — it states nothing about the
      // record. `readDue` is the one reader that says which form ANSWERS "when is this due".
      const written = control.forms.find((f) => typeof held[f.key] === 'string')
      if (written !== undefined) {
        const raw = String(held[written.key])
        if (written.key === RECORD_REF_KEY) {
          const named = records.find((r) => r.id === raw)
          // The id when nothing here can name it, because that is the truthful answer to "what is
          // this called" — never a guess, and never blank.
          return { typed: named?.title ?? raw, form: written.key }
        }
        return { typed: raw, form: written.key }
      }
    }
    return { typed: '', form: firstForm }
  }

  if (typeof stored === 'string') return { typed: stored, form: '' }
  if (typeof stored === 'number' || typeof stored === 'boolean') return { typed: String(stored), form: '' }
  // An object or a list in a box that writes scalars: the box stays empty rather than showing
  // JSON somebody would then be invited to edit as text.
  return { typed: '', form: '' }
}

/**
 * One field, one box, and the two writes it can make.
 *
 * Save sends `dataPatch` with this one key, which merges: nothing else in the record is resent, so
 * two people writing two different fields cannot overwrite each other. Clear sends a null for the
 * same key, which REMOVES it — a null is never stored — and it asks first, because a required field
 * removed makes the record incomplete again.
 *
 * The server's reply is shown rather than swallowed, both ways round: a refusal prints the server's
 * own sentence, and a write prints the merge report, which is the only thing that can tell "the
 * value changed" from "it was already that".
 */
export function FieldWriter({
  recordId,
  kind,
  field,
  control,
  stored,
  records,
  hint,
  onSaved,
  onClose,
}: {
  recordId: string
  kind: RecordKind
  field: FieldSpec
  control: WriteControl
  stored: unknown
  records: readonly NamedRecord[]
  /**
   * Say the field's hint above the box, as `fieldHint` words it for this reader. Left out where the sentence
   * beside it already says the same thing.
   */
  hint?: boolean
  onSaved: () => void
  /** Given when the box can be put away again. The inline one on a missing field cannot. */
  onClose?: () => void
}) {
  const writeHere = useWriteThisRecord(recordId, 'opened')
  const start = draftFrom(control, stored, records)
  const [typed, setTyped] = useState(start.typed)
  const [form, setForm] = useState(start.form)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const draft = draftValue(control, typed, form, records, stored)
  const written = isWritten(stored)
  const chosenForm = control.at === 'forms' ? control.forms.find((f) => f.key === form) : undefined
  /**
   * WHAT THIS BOX WRITES, IN ENGLISH, for every label and every button below.
   *
   * The stored key was on all of them — the label read `effort_hours` and the button read
   * "Save data.effort_hours". `englishHeading` computes the words from the key, so this is the same
   * name the body's own heading carries and there is no table to keep in step with the schema.
   */
  const fieldName = fieldLabel(chosenForm === undefined ? kind : null, chosenForm?.key ?? field.key)
  const inspect = useInspect()
  const hinted = hint === true ? fieldHint(kind, field, inspect) : undefined

  const promptField = historyFieldName(field.key) ?? fieldName
  const ending = field.key === 'state' && draft.can && draft.value !== stored &&
    (progressOf(draft.value) === 'finished' || (kind === 'session' && (draft.value === 'crashed' || draft.value === 'orphaned')))
  const endingState = draft.can ? stateWord(String(draft.value)).text : ''

  async function write(value: unknown, forwardFailure = false) {
    setBusy(true)
    setError(null)
    setSaid(null)
    try {
      const written = await writeHere({ dataPatch: { [field.key]: value } })
      if ('notNow' in written) return
      if ('keptTheirs' in written) {
        // THE BOX SHOWS THEIR VERSION, which the person chose over what they typed.
        const theirs = draftFrom(control, written.keptTheirs.data[field.key], records)
        setTyped(theirs.typed)
        setForm(theirs.form)
      } else {
        // The merge report, in the page's language. It is what says whether anything moved.
        setSaid(savedHere(kind, written.saved.dataPatch))
      }
      onSaved()
    } catch (err) {
      if (forwardFailure) throw err
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="fw-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.can && !ending) void write(draft.value)
      }}
    >
      {control.at === 'forms' ? (
        <Field
          label={t('g2b.field.whichForm')}
          hint={hinted}
        >
          <Select<string>
            value={form}
            onChange={(next) => {
              setForm(next)
              setTyped('')
            }}
            // The forms are declared keys too, and they were printed raw: a person choosing how an
            // obligation comes due was offered "date", "condition" and "recordId".
            options={control.forms.map((f) => ({ value: f.key, label: fieldLabel(null, f.key) }))}
          />
        </Field>
      ) : null}

      {/* THE LABEL NAMES THE FORM WHEN THE FIELD IS WRITTEN IN MORE THAN ONE, because that is what
          the box is writing: not the due date itself, but the DATE form of it. Its hint is left to
          the chooser above, which carries the field's own description — and that description is the
          only one written in this kind's voice. The three forms are declared on `PauseUntil`,
          whose sentences talk about a pause resuming, and printing "the pause ends on this date"
          on an obligation would be the schema's words about the wrong record. */}
      <Field
        label={fieldName}
        hint={control.at === 'forms' ? undefined : hinted}
        error={error ?? undefined}
      >
        {control.at === 'words' ? (
          <Select<string>
            value={typed}
            onChange={setTyped}
            // The empty option exists only while nothing is chosen, so it cannot be picked as a
            // way of clearing the field — that is the Clear button and it asks first.
            // Developer mode shows the stored words, as its hint, the description, names them.
            options={valueOptions(
              typed,
              control.words,
              t('g2b.field.oneOfWords', { n: control.words.length }),
              inspect ? undefined : (word) => optionWord(kind, field.key, word),
            )}
          />
        ) : control.at === 'boolean' ? (
          <Select<string> value={typed} onChange={setTyped} options={valueOptions(typed, ['true', 'false'], t('g2b.field.trueOrFalse'))} />
        ) : control.at === 'text' ? (
          <TextArea value={typed} onChange={setTyped} placeholder={String(field.example)} />
        ) : chosenForm !== undefined && chosenForm.key === RECORD_REF_KEY ? (
          <RecordTitleBox value={typed} onChange={setTyped} records={records} />
        ) : (
          <TextInput
            value={typed}
            onChange={setTyped}
            mono={control.at === 'date' || control.at === 'number'}
            placeholder={String(chosenForm?.example ?? field.example)}
          />
        )}
      </Field>

      <div className="rp-edit-act">
        {ending ? (
          <TieredPress tier="confirm" press={t(written ? 'record.field.save' : 'record.field.write', { field: promptField })}
            pending={t('record.field.saving')} disabled={busy}
            question={t('record.field.endQuestion', { field: promptField, state: endingState })}
            quote={endingState}
            warning={t(kind === 'session' ? 'record.field.endSession' : kind === 'agent' ? 'record.field.endIdentity' : 'record.field.endWork')}
            cancel={t('record.field.cancel')}
            confirm={t('record.field.endConfirm', { field: promptField, state: endingState })}
            onPress={async () => { if (draft.can) await write(draft.value, true) }} />
        ) : (
          <Btn type="submit" variant="primary" pending={busy} disabled={!draft.can} reason={draft.can ? undefined : draft.because}>
            {written ? t('g2b.field.save', { field: fieldName }) : t('g2b.field.write', { field: fieldName })}
          </Btn>
        )}
        {written ? (
          <TieredPress tier="confirm" press={t('record.field.clear')} pending={t('record.field.clearing')} disabled={busy}
            question={t('record.field.clearQuestion', { field: promptField })} quote={promptField}
            warning={field.required ? t('record.field.clearRequired', { kind: kindWord(kind).text }) : t('record.field.clearOptional')}
            cancel={t('record.field.keep')} confirm={t('record.field.clearConfirm', { field: promptField })}
            onPress={() => write(null, true)} />
        ) : null}
        {/* IT SAID "Done" UNTIL 18 AUGUST 2026, beside a Save press, on a panel that often writes the
            state. This one puts the box away and writes nothing — pressing it after typing loses
            what was typed — so "Done" was the word for finishing the work sitting next to the word
            for finishing the typing. It says what it does now. See the header press for the whole
            measurement. */}
        {onClose === undefined ? null : (
          <Btn variant="ghost" onClick={onClose}>
            {t('g2b.field.close')}
          </Btn>
        )}
      </div>

      {said === null ? null : <p className="rp-said">{said}</p>}
    </form>
  )
}

/**
 * A record named by its title, stored as its id.
 *
 * Written out rather than composed from `Field` + `TextInput` for the same reason `TitleField` in
 * LinkPanel is: `TextInputProps` has no `list`, so a TextInput cannot be attached to a datalist,
 * and a datalist beside an input that does not reference it is a suggestion list that suggests
 * nothing.
 */
function RecordTitleBox({
  value,
  onChange,
  records,
}: {
  value: string
  onChange: (next: string) => void
  records: readonly NamedRecord[]
}) {
  const listId = useId()
  return (
    <>
      <input
        className="px-input"
        type="text"
        list={listId}
        value={value}
        placeholder={t('g2b.field.exactTitle')}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {records.map((r) => (
          <option key={r.id} value={r.title} />
        ))}
      </datalist>
    </>
  )
}

/**
 * EVERY FIELD THIS KIND DECLARES, whether it is written, and the box that writes it.
 *
 * The whole declaration is listed, including the fields no box can serve, because a list that
 * silently held only what this page happens to support would be indistinguishable from a kind that
 * declares nothing else — which is how the missing controls went unnoticed for as long as they did.
 * A field with no box says what its shape is and that a PATCH writes it.
 *
 * Nothing here restates a field name, a label, an example or a vocabulary. All of it is KIND_SPECS.
 */
export function DeclaredFields({
  record,
  editable,
  records,
  onChanged,
}: {
  record: PanelRecord
  editable: boolean
  records: readonly NamedRecord[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const spec = KIND_SPECS[record.kind]
  if (spec === undefined) return null

  const writable = spec.fields.filter((f) => {
    const c = controlFor(record.kind, f)
    return c.at !== 'elsewhere' && c.at !== 'no-control'
  }).length

  // THE COUNT IS WORKED OUT AND WORDED ONCE, here, and said both on the fold's line and on the panel.
  const count = t('g2b.declared.writable', { n: spec.fields.length, writable })

  return (
    // EVERY DECLARED FIELD IS A CLOSED FOLD, as the stored fields are, by item 2 of a
    // decision. Drawn open it was the tallest thing on a developer page: 1,017
    // px at 1440 in round 18. Closed it takes one line, which carries the count, and one press opens
    // it. The key is the record, so moving to another record closes the fold again.
    <details className="rd-fold" data-testid="declared-fields" key={record.id}>
      <summary>{t('g2b.declared.fold', { count })}</summary>
      <Panel declares={{ surface: null }}
        title={t('g2b.declared.title')}
        kind={kindWord(record.kind).text}
        actions={<Tag tone="quiet">{count}</Tag>}
      >
        <ul className="fw-list">
          {spec.fields.map((field) => {
            const control = controlFor(record.kind, field)
            const stored = record.data[field.key]
            const written = isWritten(stored)
            const editing = open === field.key
            const offered = control.at !== 'elsewhere' && control.at !== 'no-control'
            return (
              <li className="fw-row" key={field.key}>
                <div className="fw-head">
                  <code className="fw-key">{field.key}</code>
                  {/* THE DECLARED TYPE, HERE AND NOWHERE ELSE ON THE PAGE. This panel is developer
                      mode's, and the type is what an agent writes against; the sentence under a
                      field with no box no longer names it (problem 2E5-mceErAZI). */}
                  <code className="fw-type">{field.type}</code>
                  {/* THE TONE SAYS WHETHER ANYTHING IS MISSING; THE WORDS SAY WHAT THE FIELD IS.
                      `required` is a fact about the FIELD and is true whether or not this record has
                      it, so the tag is drawn either way — but drawn in the alarm tone on a field that
                      is written it would say a record is short of something it already has. */}
                  {field.required ? (
                    <Tag
                      tone={written ? 'quiet' : 'warn'}
                      title={t('g2b.declared.neededTitle')}
                    >
                      {t('g2b.declared.needed')}
                    </Tag>
                  ) : null}
                  <span className="fw-now">
                    {written ? (
                      <FieldNow control={control} stored={stored} />
                    ) : (
                      <Absence tier="ordinary" title={t('g2b.declared.unwritten')} />
                    )}
                  </span>
                  {offered && editable && !editing ? (
                    <Btn size="sm" onClick={() => setOpen(field.key)}>
                      {written ? t('g2b.declared.change') : t('g2b.declared.write')}
                    </Btn>
                  ) : null}
                </div>

                {offered && editing ? (
                  <FieldWriter
                    recordId={record.id}
                    kind={record.kind}
                    field={field}
                    control={control}
                    stored={stored}
                    records={records}
                    hint
                    onSaved={onChanged}
                    onClose={() => setOpen(null)}
                  />
                ) : null}

                {offered ? null : (
                  <p className="fw-why">{control.because}</p>
                )}

                {/* "Restore this record before writing to it" is gone from here, from the links
                    panel and from the obligation panel. The page already carries one alarm at the
                    top saying the record is deleted, with the button that brings it back; four more
                    copies of that sentence were four lines saying what the reader was told first. */}
              </li>
            )
          })}
        </ul>
        <p className="rp-note">
          {t('g2b.declared.note')}{' '}
          <code className="fw-patch">
            PATCH /api/records/{record.id} {'{"dataPatch":{…}}'}
          </code>{' '}
          {t('g2b.declared.noteShape')} <code className="fw-patch">GET /api/kinds/{record.kind}</code>
        </p>
      </Panel>
    </details>
  )
}

/**
 * What is written, said in one line — for the controls whose declared type guarantees a short
 * value, and never for prose, which belongs in the panel that draws it whole rather than squeezed
 * onto a row.
 */
function FieldNow({ control, stored }: { control: WriteControl; stored: unknown }) {
  if (control.at === 'words' || control.at === 'boolean' || control.at === 'number' || control.at === 'date') {
    return <code className="fw-value">{String(stored)}</code>
  }
  return <span className="fw-written">{t('g2b.declared.written')}</span>
}

/**
 * The box for a field the page has just reported missing, drawn inside that report.
 *
 * `completenessOf` addresses a field as `data.<key>`, and two of the paths it can return — `data`
 * and `kind` — are not fields at all, so the key is taken off the front and looked up rather than
 * assumed. A path that names no declared field gets no box and the sentence stands on its own.
 */
export function fieldForPath(kind: RecordKind, path: string): FieldSpec | null {
  const spec = KIND_SPECS[kind]
  if (spec === undefined) return null
  if (!path.startsWith('data.')) return null
  const key = path.slice('data.'.length)
  return spec.fields.find((f) => f.key === key) ?? null
}

/**
 * THE SAME REPORT OF A MISSING FIELD, WITH THE STORED PATH AT THE FRONT SWAPPED FOR ENGLISH.
 *
 * `completenessOf` writes "data.due is not filled in, so this obligation is incomplete. …", and
 * that first clause was the second thing a person read on every unfinished record. `data.due` is
 * the key of the PATCH that fixes it, which is an agent's question. This makes it read "Due is not
 * filled in, …" and changes nothing else in the sentence.
 *
 * IT CHECKS RATHER THAN ASSUMES. The swap happens only when the message really does begin with the
 * path; any other wording is passed through untouched, so a change in the schema's phrasing leaves
 * the reader with the whole true sentence rather than a mangled one. That the phrasing still starts
 * that way is asserted in tests/record-tiers.test.ts against every required field of every kind, so
 * the two cannot drift apart in silence.
 *
 * THE REST OF THE SENTENCE IS THE FIELD'S OWN DESCRIPTION AND IS NOT TOUCHED. Rewriting it here
 * would be a second statement of what the field means, which is the defect this repository keeps
 * producing. Some of those descriptions still print a stored shape at the reader — `obligation.due`
 * offers {"condition":"…"} — and that is a defect in the description, to be fixed where the
 * description is written.
 */
export function plainIncompleteness(item: Incompleteness): Incompleteness {
  const prefix = `${item.path} `
  if (!item.message.startsWith(prefix)) return item
  if (!item.path.startsWith('data.')) return item
  const name = englishHeading(item.path.slice('data.'.length))
  return { path: item.path, message: `${name} ${item.message.slice(prefix.length)}` }
}

/**
 * THE SAME LINE WITHOUT THE FIELD'S OWN DESCRIPTION, for normal mode.
 *
 * `completenessOf` writes the first sentence and then the field's description from KIND_SPECS, and
 * that description is written for an agent: it names requests, stored keys and example values. The
 * line is cut where the description begins. A line whose message does not hold its field's
 * description (a fault in `data` or `kind`, or the envelope's `summary`) is returned whole.
 */
export function withoutTheFieldsDescription(kind: RecordKind, item: Incompleteness): Incompleteness {
  const field = fieldForPath(kind, item.path)
  if (field === null || field.description === '') return item
  const at = item.message.indexOf(field.description)
  if (at <= 0) return item
  return { path: item.path, message: item.message.slice(0, at).trimEnd() }
}

// ============================================================================ three tiers

/**
 * WHAT A RECORD PAGE IS FOR, IN THREE TIERS, AND WHY THE HEADINGS ARE DERIVED.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM
 * ---------------------------------------------------------------------------------------
 * Every kind but `module` reached this page as a `<dl>` of raw stored keys under a panel called
 * "Stored fields", plus a second panel listing the same key names again with a box beside each. A
 * reviewer's verdict was that the page reads as an internal record inspector: technically complete,
 * and never once answering the question the reader came with. A `claim` holds a measured number and
 * the number was in a JSON blob; a `session` holds what it is doing right now and that sentence was
 * a row in a key-value list; a `task` holds a state word and changing it meant pressing a button
 * labelled "Save data.state".
 *
 * So, per kind:
 *
 *   TIER 1  A HEADLINE. What matters about this record in its own kind's terms, and the one
 *           control that acts on it. It occupies the slot ObligationPanel already had.
 *   TIER 2  THE BODY. The kind's own prose, under headings in English.
 *   TIER 3  A RAIL. At most five links as sentences, and one line of history.
 *
 * Everything about Mole Office's own machinery — ids, the outgoing/incoming split, storage notes, the
 * raw field dump, the whole declaration — is reachable one switch away, in Inspect.
 *
 * ---------------------------------------------------------------------------------------
 * THE HEADINGS ARE DERIVED FROM THE KEY AND NOT WRITTEN DOWN
 * ---------------------------------------------------------------------------------------
 * A table mapping `what_would_prove_it_wrong` to "What would prove it wrong" is two places that
 * must agree with nothing making them agree: rename the field and the heading goes on printing the
 * old question, silently, with no type error and no failing test. The property this page already
 * has — that no field name, label, example or vocabulary is written into it — is worth more than a
 * slightly better-worded heading, so the heading is COMPUTED from the key. Every declared key in
 * KIND_SPECS reads as English when it is de-snaked; tests/record-tiers.test.ts checks that claim
 * against the whole schema rather than trusting it.
 */

/**
 * A stored key as a heading: `what_would_prove_it_wrong` -> `What would prove it wrong`.
 *
 * IT LIVES IN src/shared/sections.ts NOW and is re-exported here under the same name. The server
 * names a declared section for the review pane, so it needs this rule too, and a browser file
 * cannot be the one place a rule the server obeys is written. Nothing about the rule changed and
 * the guards that read it off this page still read the same function.
 */
export { englishHeading, bodyHeading }

/**
 * WHAT A KIND'S PAGE IS MADE OF LIVES IN src/shared/sections.ts, AND THIS PAGE READS IT.
 *
 * `IN_HEADLINE`, `NOT_BODY`, `RECORD_ID_LISTS` and `EFFORT_KEY` were declared here, and a press on
 * a paragraph walks a region tree that is derived in `src/shared`. Two files deciding what a record
 * page is made of is the drift this codebase keeps producing, so there is one: the body drawn below
 * and the sections a press walks read the same declaration. The guards that stop those tables going
 * stale moved with them, to tests/sections.test.ts.
 */

/**
 * A body section's heading.
 *
 * DERIVED, LIKE EVERY OTHER HEADING ON THIS PAGE, with one rule added for the fields above. A list
 * drawn as names is not a list of ids any more, so `Planned state ids` over two record titles is a
 * heading that describes the storage rather than the screen. The rule is: drop the `Ids` the key
 * ends in and say the plural. It applies only to keys in `RECORD_ID_LISTS`, and there are two.
 */


/** One section of the body: a stored field, its heading, and what it holds. */
export interface BodySection {
  key: string
  heading: string
  value: unknown
  /** True when the strings in this section are record ids and the list draws their names. */
  names: boolean
  /** True when the section holds who wrote the record down, and the page draws that writer's name. */
  writer: boolean
  /** True when the section holds a participant, and the page draws the name the registries give it. */
  participant: boolean
  /** True when the section holds door ids, and the page draws what each door does. */
  doors: boolean
  /** True when the section is a list of dated words, and each entry is drawn with when it was written. */
  dated: boolean
  /** True when the section is what a decision governs, and each entry is drawn as a record's name or a path. */
  governs: boolean
}

/**
 * The body: the sections this record fills, drawn as folds.
 *
 * IT DECIDES NOTHING. Which fields are body sections, in what order, and whether this record has
 * written one are all `filledBodySections` in src/shared/sections.ts — the same declaration a press
 * walks — so a fold a reader can open and a section a comment can be filed against cannot be two
 * different lists. What is left here is the heading, which is a drawing question and is computed
 * from the key.
 */
export function bodySections(record: PanelRecord): BodySection[] {
  return filledBodySections(record).map((section) => ({
    key: section.key,
    heading: titleHere(record.kind, section.key),
    value: record.data[section.key],
    names: namesRecords(record.kind, section.key),
    writer: namesAWriter(record.kind, section.key),
    participant: namesAParticipant(record.kind, section.key),
    doors: holdsDoors(record.kind, section.key),
    dated: holdsDatedWords(record.kind, section.key),
    governs: holdsGovernedPlaces(record.kind, section.key),
  }))
}

/**
 * What one body section holds, drawn as reading matter and never as a stored shape.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PARAGRAPH SAYS WHICH STORED STRING IT IS, SO A QUOTE FROM IT CAN BE FOUND AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * Selecting words inside an element marked `data-text-field` makes a comment about those exact
 * words, and Mole Office stores the quote with the name of the field it came out of. `readContext` in
 * src/server/lib/agents.ts then looks the words up in THAT field of the record — under the same
 * name `stringsIn` gives it, which is the stored path: `data.symptom`, `data.would_need[0]`.
 *
 * THE NAME AND THE OFFSET BOTH HAVE TO BE RIGHT, and getting either wrong fails quietly rather
 * than loudly. A field name the record does not hold makes the server report "the text has changed"
 * about text nobody has touched, and so does an element whose words are not exactly the stored
 * string. So the mark goes on the element that holds the value and nothing else — no heading, no
 * label, no punctuation of its own.
 *
 * SOME DRAWN WORDS ARE NOT THE STORED STRING, AND THOSE CARRY NO MARK. A participant's registry name, a door's words and
 * a record's title are drawn from a stored reference or id, so marking them would tell the server to look a name up among
 * ids. Developer mode draws each stored door id, which is the stored string, so each is marked. It draws the stored
 * participant as its JSON with no mark, because a participant is an object and not one stored string. The writer field
 * above and `NamedRecordList` below make the same distinction.
 */
function BodyValue({
  value,
  field,
  names,
  writer,
  participant,
  doors,
  dated,
  governs,
  participants,
  titleById,
  replacedBy,
}: {
  value: unknown
  field: string
  /** True when the strings in this list, or this one string, are record ids. Then names are drawn, not ids. */
  names?: boolean
  /** True when the string is who wrote the record down. Then the writer's name is drawn, not the stored id. */
  writer?: boolean
  /** True when the value is a participant reference. Then the registry's name is drawn, not the stored shape. */
  participant?: boolean
  /** True when the value is a list of door ids. Then what each door does is drawn, not the stored id. */
  doors?: boolean
  /** True when the value is a list of dated words. Then each entry's words are drawn after when they were written. */
  dated?: boolean
  /** True when the value is what a decision governs. Then each record is drawn by its name and each path as the path. */
  governs?: boolean
  participants?: ParticipantsReply
  titleById?: ReadonlyMap<string, string>
  /** The decisions in this record's id lists that a newer one replaced, said beside each. */
  replacedBy?: ReplacedInTheLists
}) {
  const inspect = useInspect()
  const { language } = useLanguage()
  // WHO WROTE IT DOWN, BY NAME, as the change log names a writer. No text mark: the drawn words are not the
  // stored string. Developer mode draws the stored string, marked, because there it is what is drawn.
  const wroteIt = writer === true && !inspect ? writerIn(value) : null
  if (wroteIt !== null) return <p className="rd-prose prose wrap-anywhere">{writerNamed(wroteIt, participants)}</p>
  // A PARTICIPANT, BY THE NAME THE REGISTRY GIVES IT. No text mark, because the stored value is a reference and the
  // drawn words are that participant's name. Developer mode draws the stored reference itself.
  const named = participant === true && !inspect ? participantIn(value) : null
  if (named !== null) return <p className="rd-prose prose wrap-anywhere">{writerNamed(named, participants)}</p>
  if (participant === true && inspect) {
    return (
      <p className="rd-prose prose wrap-anywhere">
        <code className="wrap-anywhere">{JSON.stringify(value)}</code>
      </p>
    )
  }
  // EACH DOOR BY WHAT IT DOES, in the page's language. No text mark: the stored string is the door's id. A door the
  // list does not name has no words to ask for, so it is drawn as its id with the sentence that says so. Developer
  // mode draws the stored id, marked, because there the drawn words are the stored string.
  if (doors === true && Array.isArray(value)) {
    return (
      <ul className="rd-list rd-doors">
        {value.map((entry, i) => {
          const door = String(entry)
          if (inspect) {
            return (
              <li key={i} {...textAttributes(`${field}[${String(i)}]`, 0)}>
                {door}
              </li>
            )
          }
          if (!isADoorTheListNames(door)) {
            return (
              <li key={i}>
                <span className="rd-named-gone">
                  <code>{door}</code> {t('record.body.doorTheListDoesNotName')}
                </span>
              </li>
            )
          }
          const says = whatThisDoorDoes(door)
          return <li key={i}>{language === 'zh' ? says.zh : says.en}</li>
        })}
      </ul>
    )
  }
  // A LIST OF DATED WORDS: when, then the words, marked at the path of the words, which is the stored string.
  if (dated === true) {
    return (
      <ul className="rd-list rd-dated">
        {datedWordsIn(value).map((entry) => (
          <li key={entry.index}>
            <Stamp at={entry.at} />{' '}
            <span {...textAttributes(`${field}[${String(entry.index)}].words`, 0)}>{entry.words}</span>
          </li>
        ))}
      </ul>
    )
  }
  // WHAT A DECISION GOVERNS: a module, flow or pipeline by its name, as a list of stored ids is drawn, and a path as
  // the path. No text mark on a record's row, for the reason `NamedRecordList` gives.
  if (governs === true) {
    return (
      <ul className="rd-list rd-governs">
        {theGovernedPlaces(value).map((place, i) =>
          'record' in place ? (
            <li key={i} data-governs="record">
              {titleById?.get(place.record) === undefined ? (
                <span className="rd-named-gone">
                  <code>{place.record}</code> {t('g2b.body.noSuchId')}
                </span>
              ) : (
                <RouteLink to={recordPath(place.record)}>{titleById.get(place.record)}</RouteLink>
              )}
            </li>
          ) : (
            <li key={i} data-governs="path">
              <code className="wrap-anywhere">{place.path}</code>
            </li>
          ),
        )}
      </ul>
    )
  }
  // ONE STORED ID IS DRAWN AS A LIST OF ONE, by the same reader, so it says the same thing when nothing answers to it.
  if (names === true && typeof value === 'string') {
    return <NamedRecordList ids={[value]} titleById={titleById ?? new Map()} replacedBy={replacedBy} />
  }
  if (Array.isArray(value)) {
    if (names === true) return <NamedRecordList ids={value} titleById={titleById ?? new Map()} replacedBy={replacedBy} />
    return (
      <ul className="rd-list">
        {value.map((line, i) => (
          <li key={i} {...textAttributes(`${field}[${String(i)}]`, 0)}>
            {String(line)}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p className="rd-prose prose wrap-anywhere" {...textAttributes(field, 0)}>
      {String(value)}
    </p>
  )
}

/** Each decision in a record's id lists that a newer decision replaced, with the decision that stands in its place. */
type ReplacedInTheLists = Readonly<Record<string, { id: string; title: string }>>

/**
 * A LIST OF STORED RECORD IDS, DRAWN AS THE RECORDS' OWN NAMES.
 *
 * A trajectory's `plannedStateIds` is its required field and the whole point of the kind, and it
 * was drawn as two nanoids — `qBTosjpbnqra`, `6qzTxKAgVs1m` — at 1440 and at 390. A person cannot
 * read a plan out of that. `RECORD_ID_LISTS` says which fields hold ids; this draws them.
 *
 * AN ID NOTHING ANSWERS TO IS DRAWN AS THE ID IT IS, and said to be that. The browser holds every
 * record in the project, so a missing title means the id names nothing here — a record deleted, or
 * one in another project. Inventing a name for it, or leaving the row out, would be the two ways of
 * hiding it.
 *
 * NO `data-text-field` ON THESE ROWS, and that is the point rather than an omission. That mark says
 * *these exact words are the stored string*, and the server looks a quote up in that field. The
 * stored string here is the id and the drawn words are the title, so marking the row would send
 * Mole Office looking for a title inside a list of ids and report that the text had changed.
 */
function NamedRecordList({
  ids,
  titleById,
  replacedBy,
}: {
  ids: readonly unknown[]
  titleById: ReadonlyMap<string, string>
  replacedBy?: ReplacedInTheLists
}) {
  return (
    <ol className="rd-named">
      {ids.map((entry, i) => {
        const id = String(entry)
        const title = titleById.get(id)
        const standing = replacedBy?.[id]
        return (
          <li key={`${id}-${String(i)}`}>
            {title === undefined ? (
              <span className="rd-named-gone">
                <code>{id}</code> {t('g2b.body.noSuchId')}
              </span>
            ) : (
              <RouteLink to={recordPath(id)}>{title}</RouteLink>
            )}
            {/* A DECISION A NEWER ONE REPLACED, and the one that stands in its place. The record still names the old one:
                nothing changes it by itself. */}
            {standing === undefined ? null : (
              <span className="rd-named-replaced">
                {' '}
                {t('record.body.replacedBy')} <RouteLink to={recordPath(standing.id)}>{standing.title}</RouteLink>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * WHAT A WRITTEN FIELD HOLDS, AND — WHILE THE RECORD IS BEING CHANGED — THE BOX THAT CHANGES IT.
 *
 * A FIELD COULD BE WRITTEN ONCE AND NEVER AGAIN, and that is the defect this exists to close. The
 * "Add:" row at the foot of the body offers only fields this record does NOT have, so the moment
 * one was filled in, its only control in Normal mode disappeared. A tester set an estimate of 6
 * hours and then found the whole edit page held three boxes, none of them the estimate.
 *
 * The box is the same `FieldWriter` the "Add:" row opens, built from the same declaration, so this
 * adds no second way to write anything: it is the one control, now reachable after the first write
 * as well as before it. A field whose declared shape has no honest single box says so in that
 * shape's own sentence, exactly as it does everywhere else on this page.
 *
 * EVERY SECTION OF A BODY IS DRAWN BY THIS ONE COMPONENT, whatever heading it sits under. A control
 * written into one arrangement of the sections and not another would be a field a person could
 * change on one screen and not on another.
 */
function BodyField({
  record,
  section,
  editable,
  records,
  titleById,
  participants,
  replacedBy,
  onChanged,
}: {
  record: PanelRecord
  section: BodySection
  editable: boolean
  records: readonly NamedRecord[]
  /** Every record this project holds, by id, so a stored id can be drawn as its own name. */
  titleById: ReadonlyMap<string, string>
  /** The decisions in this record's id lists that a newer one replaced, from the server's read of the record. */
  replacedBy?: ReplacedInTheLists
  /** Everybody the registries hold, so a stored writer is drawn by name. */
  participants?: ParticipantsReply
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const inspect = useInspect()
  const field = KIND_SPECS[record.kind]?.fields.find((f) => f.key === section.key)
  const control = field === undefined ? undefined : controlFor(record.kind, field)
  const handbook = record.kind === 'role_card_words' && ['howItWorks', 'howItWorksZh', 'inPractice', 'inPracticeZh'].includes(section.key)
  let at = 0
  return (
    <>
      {/* `data.` AND THEN THE KEY, which is how the record's own stored shape names it and
          therefore how the server looks a quote up. `section.key` is the declared field's key. */}
      {handbook && !inspect && typeof section.value === 'string' ? (
        <p className="rd-prose prose wrap-anywhere">
          {inlinePieces(section.value).map((piece, index) => {
            const start = at
            at += piece.raw.length
            // Only bold loses markers. Every run names its own start in the stored string.
            return piece.kind === 'bold' ? (
              <strong key={index} {...textAttributes(`data.${section.key}`, start + 2)}>{piece.text}</strong>
            ) : (
              <span key={index} {...textAttributes(`data.${section.key}`, start)}>{piece.raw}</span>
            )
          })}
        </p>
      ) : <BodyValue
        value={section.value}
        field={`data.${section.key}`}
        names={section.names}
        writer={section.writer}
        participant={section.participant}
        doors={section.doors}
        dated={section.dated}
        governs={section.governs}
        participants={participants}
        titleById={titleById}
        replacedBy={replacedBy}
      />}
      {handbook ? (
        <p className="rd-change"><RouteLink to={pathFor('roles')}>{t('g6b.roles.title')}</RouteLink></p>
      ) : null}
      {!editable || field === undefined || control === undefined ? null : control.at === 'elsewhere' ||
        control.at === 'no-control' ? (
        <p className="fw-why">{control.because}</p>
      ) : open ? (
        <FieldWriter
          recordId={record.id}
          kind={record.kind}
          field={field}
          control={control}
          stored={record.data[field.key]}
          records={records}
          hint
          onSaved={onChanged}
          onClose={() => setOpen(false)}
        />
      ) : (
        <div className="rd-change">
          <Btn size="sm" onClick={() => setOpen(true)}>
            {t('g2b.body.change', { field: titleInASentence(section.heading) })}
          </Btn>
        </div>
      )}
    </>
  )
}

/**
 * ONE CONTROL, WRITING ONE DECLARED VOCABULARY, THE MOMENT A WORD IS CHOSEN.
 *
 * The generic writer below this in the file is right for a paragraph and wrong for a state word: a
 * task's state is a thing you SET, and asking somebody to choose `doing` and then press a button
 * called "Save data.state" puts the storage model between a person and a one-word act. So this
 * writes on change and reports what the server said it did.
 *
 * The words are `controlFor`'s, which are `KIND_SPECS`'s, so nothing about the vocabulary is
 * written here — the same property the field writers have, and the reason a word added to a kind
 * shows up in this control without anybody editing this page.
 */
function WordControl({
  record,
  fieldKey,
  editable,
  onChanged,
  label,
}: {
  record: PanelRecord
  fieldKey: string
  editable: boolean
  onChanged: () => void
  label: string
}) {
  const writeHere = useWriteThisRecord(record.id, 'drawn')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const inspect = useInspect()

  const spec = KIND_SPECS[record.kind]
  const field = spec?.fields.find((f) => f.key === fieldKey)
  if (field === undefined) return null
  const control = controlFor(record.kind, field)
  if (control.at !== 'words') {
    // Not a vocabulary on this kind. Said rather than left blank: a control that silently vanishes
    // is how the missing write controls went unnoticed for as long as they did.
    return <p className="rd-none">{control.at === 'elsewhere' || control.at === 'no-control' ? control.because : ''}</p>
  }
  const stored = typeof record.data[fieldKey] === 'string' ? (record.data[fieldKey] as string) : ''

  async function write(next: string) {
    setBusy(true)
    setError(null)
    setSaid(null)
    try {
      const written = await writeHere({ dataPatch: { [fieldKey]: next } })
      if ('notNow' in written) return
      if ('saved' in written) setSaid(savedHere(record.kind, written.saved.dataPatch))
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!editable) return null

  return (
    <div className="rd-word">
      <Field label={label} error={error ?? undefined}>
        <Select<string>
          value={stored}
          onChange={(next) => void write(next)}
          options={valueOptions(stored, control.words, t('g2b.field.oneOfNWords', { n: control.words.length }),
            inspect ? undefined : (word) => optionWord(record.kind, fieldKey, word))}
        />
      </Field>
      {busy ? <span className="rd-busy">{t('g2b.field.saving')}</span> : null}
      {said === null ? null : <p className="rp-said">{said}</p>}
    </div>
  )
}

/** A number a claim measured, drawn as a figure with the name it was stored under. */
function Figures({ numbers }: { numbers: Record<string, number> }) {
  const entries = Object.entries(numbers)
  if (entries.length === 0) return null
  return (
    <div className="rd-figs">
      {entries.map(([key, n]) => (
        <div className="rd-fig" key={key}>
          <span className="rd-fig-n num">{n}</span>
          <span className="rd-fig-k">{englishHeading(key)}</span>
        </div>
      ))}
    </div>
  )
}

/** A tinted line naming a fact that changes what the reader does, and the act that answers it. */
function Banner({ says, act, tone }: { says: React.ReactNode; act?: React.ReactNode; tone: 'blocked' | 'failed' }) {
  return (
    <div className="rd-banner" data-tone={tone}>
      <p className="rd-banner-said">{says}</p>
      {act === undefined ? null : <div className="rd-banner-act">{act}</div>}
    </div>
  )
}

/**
 * TIER 1: WHAT MATTERS ABOUT THIS RECORD, IN ITS OWN KIND'S TERMS, WITH THE ACT ATTACHED.
 *
 * It returns null for a kind that has no headline yet, and that is deliberate rather than a gap to
 * be filled with something generic: a kind whose "what matters" nobody has worked out gets its
 * prose body and its links, which is an honest page. A generic headline reading "this is a note"
 * would be furniture, and furniture stops being read.
 */
function KindHeadline(props: {
  record: PanelRecord
  links: readonly GatedLink[]
  records: readonly NamedRecord[]
  /** Every record and every link this project holds, for the one containment reader. */
  containment: ContainmentContext
  editable: boolean
  onChanged: () => void
  /** The server's expensive-pick-up warning for a run, or null. Criterion T6. */
  pickUpCost?: PickUpCost | null
}) {
  const kindPart = KindLead(props)
  const stored = readConsequence(props.record.data)
  // A RECORDED "nobody is hurt" IS AN ANSWER AND IT IS NOT NEWS. `bearer: none` is somebody having
  // looked and found no one waiting, which is worth keeping and worth reading in Inspect, where the
  // state panel prints it in full — it is not worth a panel titled "what happens if this is left
  // alone" saying that nothing happens. The distinction this product cares about is between that
  // and NOBODY HAVING LOOKED, and both are still told apart, one switch away.
  const consequence = stored === null || stored.bearer === 'none' ? null : stored
  if (kindPart === null && consequence === null) return null
  return (
    <>
      {kindPart}
      {/* THE RELATIONS COME OFF THE LINKS THIS HEADLINE WAS ALREADY GIVEN, so the consequence panel
          reads the same list of sections the rail below it does. */}
      {consequence === null ? null : (
        <ConsequenceBanner {...props} relations={props.links.map((l) => l.label)} consequence={consequence} />
      )}
    </>
  )
}

/**
 * WHO IS HURT IF THIS IS LEFT ALONE, drawn ONCE, on any kind that can store it.
 *
 * It is not inside the kind headlines because it would then be seven copies of one rule, and a kind
 * that grew a headline later would silently stop showing it. It is not inside "What this record's
 * own state says" either, which is where it used to live: that panel is Mole Office explaining its own
 * classification and it belongs behind Inspect, but a stored consequence is not an explanation — it
 * is a fact about the world, and on a `person` bearer it is the one fact in the product that means
 * somebody could be physically hurt.
 *
 * THE ACT IS READ FROM THE DECLARATION. A kind that declares a `fix` field and has not written one
 * gets the control that writes it; a kind that declares no such field gets no button rather than a
 * button that would have nowhere to write. Nothing about the field is named here except its key,
 * which is the key the writer addresses.
 */
function ConsequenceBanner({
  record,
  records,
  relations,
  editable,
  onChanged,
  consequence,
}: {
  record: PanelRecord
  records: readonly NamedRecord[]
  relations: readonly string[]
  editable: boolean
  onChanged: () => void
  consequence: Consequence
}) {
  const [fixing, setFixing] = useState(false)
  const fixField = KIND_SPECS[record.kind]?.fields.find((f) => f.key === 'fix')
  const unfixed = fixField !== undefined && !isWritten(record.data['fix'])
  // CONSEQUENCE IS ONE OF THE FIVE SECTIONS THE OWNER'S OWN TEST RIGHT-CLICKS ON A MODULE, and it is the
  // one of the five that is not reading matter: `consequence` is in `NOT_BODY`, so the fold stack
  // never prints it and this panel is the only place it is on the screen.
  return (
    <Panel
      declares={sectionsOf({ ...record, relations })('consequence')}
      title={titleHere(record.kind, 'consequence')}
      rank={isSafety(consequence) ? 0 : 1}
      tone="failed"
    >
      <Banner
        tone={isSafety(consequence) ? 'failed' : 'blocked'}
        says={consequence.what}
        act={
          !unfixed || !editable || fixing ? undefined : <Btn onClick={() => setFixing(true)}>{t('g2b.consequence.recordFix')}</Btn>
        }
      />
      {isSafety(consequence) ? (
        // The ranking rule, behind the mark rather than under the alarm. The alarm is the thing to
        // read; how Mole Office sorts it is a second question, asked once.
        // A div and not a p: Hint renders a details element, and a details may not sit inside a
        // paragraph. The browser closes the paragraph early when it meets one, so the server's
        // markup and the browser's differ. The rule sets its own margin, so nothing moves.
        <div className="rp-fact-floor">
          {t('g2b.consequence.hurt')}
          <Hint label={t('g2b.consequence.whereInList')}>
            {t('g2b.consequence.whereInListBody')}
          </Hint>
        </div>
      ) : null}
      {fixing && fixField !== undefined && editable ? (
        <FieldWriter
          recordId={record.id}
          kind={record.kind}
          field={fixField}
          control={controlFor(record.kind, fixField)}
          stored={record.data['fix']}
          records={records}
          hint
          onSaved={onChanged}
          onClose={() => setFixing(false)}
        />
      ) : null}
    </Panel>
  )
}

/**
 * WHAT THIS PIECE OF WORK IS PART OF, AND HOW BIG SOMEBODY SAID IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * THIS PANEL USED TO WORK CONTAINMENT OUT FOR ITSELF, AND IT GOT IT WRONG ON SCREEN
 * ---------------------------------------------------------------------------------------
 * It read `links.filter((l) => l.type === 'part_of' && !l.isBacklink)` — this record's own links,
 * and nothing else. Mole Office keeps containment in three stores, and a `part_of` link is only one of
 * them: a pipeline's steps are ids in `pipeline.data.blockIds`, and a module's checklist items are
 * plain objects with no record id at all. So every step of every pipeline opened here saying
 * "Nothing says what this is part of", while the same step read as part of its pipeline everywhere
 * else in the product. Measured against 79 records.
 *
 * `parentOf` in src/shared/containment.ts is the one reader of all three, and it is what answers
 * now. It is handed every live record in this project and every link in it, which is what the page
 * already loads — see `RecordPageData`.
 *
 * TWO THINGS IT CAN SAY THAT A FILTER COULD NOT. More than one thing claiming to hold this record
 * is a data problem and is printed as the sentence `parentOf` writes, rather than resolved by
 * picking one. A parent that is not among the records this page loaded is named as an id nobody
 * here can put a title to, rather than dropped.
 *
 * ---------------------------------------------------------------------------------------
 * THE ESTIMATE IS HERE BECAUSE THIS IS WHERE A PERSON SIZES THE WORK
 * ---------------------------------------------------------------------------------------
 * `effort_hours` is the only number the scheduling arithmetic can add up, and this page showed it
 * as a folded heading with a bare number under it and no way to change it. It is now on the panel a
 * reader already opens to see where the work sits, with the honest absence when nobody has
 * estimated it, and one box that writes it while the record is being changed. `IN_HEADLINE` names
 * the key for `task` and `block`, so the body does not print it a second time and the "Add:" row
 * does not offer a second way to write it.
 */
function WhereThisSits({
  declares,
  record,
  containment,
  editable,
  onChanged,
  records,
  effort,
}: {
  /**
   * WHICH SECTION OF THE RECORD THIS PANEL DRAWS — `section.whereItSits`.
   *
   * Neither of the two things on it is a body section. What holds this record is worked out from
   * links by `parentOf`, and `effort_hours` is named by `IN_HEADLINE` and drawn here with the box
   * that writes it. So the panel is the place, and the place needed a name: measured on
   * `PiQzVdq42ufa`, 31 August 2026, three presses inside it — the heading, the containment
   * sentence and the *Nobody has estimated* absence — answered the whole block.
   */
  declares: Declares
  record: PanelRecord
  containment: ContainmentContext
  editable: boolean
  onChanged: () => void
  records: readonly NamedRecord[]
  /** The kind's own `effort_hours` declaration, or undefined for a kind that declares none. */
  effort: FieldSpec | undefined
}) {
  const [sizing, setSizing] = useState(false)
  const reading = parentOf(record, containment)
  const stored = effort === undefined ? undefined : record.data[effort.key]
  const hours = typeof stored === 'number' ? stored : null

  return (
    <Panel declares={declares} title={titleHere(record.kind, WHERE_IT_SITS_KEY)} rank={1}>
      <p className="rd-sub">
        {reading.conflict !== null ? (
          reading.conflict
        ) : reading.parent === null ? (
          <Absence tier="ordinary" title={t('g2b.sits.partOfNothing')} />
        ) : (
          <ContainmentSentence held={reading.parent} />
        )}
      </p>
      {effort === undefined ? null : (
        <p className="rd-sub">
          {hours === null ? (
            // ABSENT IS NOT ZERO, which is the field's own rule. A page that printed "0 hours"
            // here would hand the capacity arithmetic a number nobody wrote.
            <Absence tier="told-apart" looked={false} word={t('g2b.sits.notEstimated')} title={t('g2b.sits.notEstimatedTitle')} />
          ) : (
            t('g2b.sits.estimated', { n: hours })
          )}
          {editable && !sizing ? (
            <>
              {' '}
              <Btn size="sm" onClick={() => setSizing(true)}>
                {hours === null ? t('g2b.sits.estimate') : t('g2b.sits.changeEstimate')}
              </Btn>
            </>
          ) : null}
        </p>
      )}
      {effort !== undefined && editable && sizing ? (
        <EffortWriter
          record={record}
          field={effort}
          records={records}
          onChanged={onChanged}
          onClose={() => setSizing(false)}
        />
      ) : null}
      <WordControl record={record} fieldKey="state" editable={editable} onChanged={onChanged} label={t('g2b.sits.whereItStands')} />
    </Panel>
  )
}

/**
 * The box that writes an estimate, or the sentence saying why this kind gets none.
 *
 * Built from the declaration like every other box on this page, so nothing here knows that
 * `effort_hours` is a number — `controlFor` reads the declared type, and a kind that declared it as
 * something with no honest single box would get that kind's own sentence instead.
 */
function EffortWriter({
  record,
  field,
  records,
  onChanged,
  onClose,
}: {
  record: PanelRecord
  field: FieldSpec
  records: readonly NamedRecord[]
  onChanged: () => void
  onClose: () => void
}) {
  const control = controlFor(record.kind, field)
  if (control.at === 'elsewhere' || control.at === 'no-control') {
    return <p className="fw-why">{control.because}</p>
  }
  return (
    <FieldWriter
      recordId={record.id}
      kind={record.kind}
      field={field}
      control={control}
      stored={record.data[field.key]}
      records={records}
      hint
      onSaved={onChanged}
      onClose={onClose}
    />
  )
}

/**
 * One containment, in a sentence: what holds this record, and — for a pipeline — where in it.
 *
 * A parent the page did not load is NOT linked. `containment.title` is already the plain sentence
 * saying it was not loaded, and wrapping that in an anchor would read as a record somebody titled
 * "a record that was not loaded".
 *
 * THE ANCHOR DECLARES THE RECORD IT NAMES, and until 31 August 2026 it declared nothing: measured
 * on block `PiQzVdq42ufa`, a right-click on *Step 6 of “PanelX development campaign”* walked up
 * five elements and answered the block. The record that holds this one is a linked record
 * reference like any other, and the workspace comes from the record itself rather than from the
 * address bar — see `theLinkedRecord`.
 */
function ContainmentSentence({ held }: { held: Containment }) {
  const name =
    held.record === null ? (
      <span className="rd-none">{held.title}</span>
    ) : (
      <RouteLink
        to={recordPath(held.id)}
        {...declaredAttributes(theLinkedRecord(held.id, held.record.workspaceId))}
        {...DRAWS_THE_NAME}
      >
        {held.title}
      </RouteLink>
    )
  // THE WORDS BEFORE THE NAME ARE SPACED FROM IT BY THE ONE RULE (wave 13k round 43, problem oQdFG3cyRWI_ item 14):
  // "属于OCR 与二值化" ran the Chinese into a Latin title. A Chinese title takes no space.
  const before = held.position === null ? t('g2b.sits.partOfBefore') : t('g2b.sits.stepOfBefore', { n: held.position })
  return (
    <>
      {before + gapBetween(before, held.title)}
      {name}
      {held.position === null ? t('g2b.sits.partOfAfter') : t('g2b.sits.stepOfAfter', { n: held.position })}
      {held.deleted === true ? ` ${t('g2b.sits.deletedParent')}` : ''}
    </>
  )
}

/** The part of a headline that is particular to one kind, or null for a kind that has none yet. */
function KindLead({
  record,
  links,
  records,
  containment,
  editable,
  onChanged,
  pickUpCost,
}: {
  record: PanelRecord
  links: readonly GatedLink[]
  records: readonly NamedRecord[]
  containment: ContainmentContext
  editable: boolean
  onChanged: () => void
  /** The server's expensive-pick-up warning for this run, or null. Criterion T6. */
  pickUpCost?: PickUpCost | null
}) {
  const d = record.data

  const str = (key: string): string | null => (typeof d[key] === 'string' && (d[key] as string).trim() !== '' ? (d[key] as string) : null)
  const spec = KIND_SPECS[record.kind]
  const fieldOf = (key: string): FieldSpec | undefined => spec?.fields.find((f) => f.key === key)

  switch (record.kind) {
    case 'claim': {
      const numbers = typeof d['numbers'] === 'object' && d['numbers'] !== null && !Array.isArray(d['numbers'])
        ? (d['numbers'] as Record<string, number>)
        : null
      const measured = str('measured_on')
      const confidence = str('confidence')
      const state = str('state')
      const retracted = str('retracted_because')
      // A `contradicts` link is the one thing on a claim that changes what a reader does next: two
      // numbers, and only a person can say which stands.
      const against = links.filter((l) => l.type === 'contradicts')
      return (
        <Panel declares={{ surface: null }} title={t('g2b.claim.title')} rank={1}>
          {numbers === null ? (
            <p className="rd-none"><Absence tier="ordinary" title={t('g2b.claim.noNumbers')} /></p>
          ) : (
            <Figures numbers={numbers} />
          )}
          <p className="rd-sub">
            {measured === null ? t('g2b.claim.noMeasuredOn') : t('g2b.claim.measuredOn', { on: measured })}{' '}
            {confidence === null ? t('g2b.claim.noConfidence') : t('g2b.claim.confidence', { confidence })}
            {state === null ? '' : ` ${t('g2b.claim.recordedAs', { state: stateWord(state, 'normal', record.kind).text })}`}
            {/* A RETRACTED CLAIM SAYS SO WHERE THE NUMBER IS. `IN_HEADLINE` names this key, which
                means this line is the page's answer to it — and a number still drawn large with the
                reason it was withdrawn folded away somewhere below would be the worst thing this
                page could do. */}
            {retracted === null ? '' : ` ${t('g2b.claim.withdrawn', { why: retracted })}`}
          </p>
          {against.length === 0 ? null : (
            <Banner
              tone="blocked"
              says={
                <>
                  {t('g2b.claim.contradicted', { n: against.length })}{' '}
                  {against.map((l, i) => (
                    <span key={l.linkId}>
                      {i === 0 ? '' : ', '}
                      <RouteLink to={recordPath(l.other.id)}>{l.other.title}</RouteLink>
                    </span>
                  ))}
                  {t('g2b.claim.onlyAPerson')}
                </>
              }
            />
          )}
        </Panel>
      )
    }

    case 'problem': {
      const symptom = str(SYMPTOM_KEY)
      return (
        // WHAT THIS PANEL DRAWS IS `section.symptom`, AND IT SAID NOTHING UNTIL 31 AUGUST 2026. The
        // paragraph under the heading is the primary authored text of a problem — 1,535 characters
        // of it on `a62SOh9fsPe5` — and two presses inside this panel, the heading and that
        // paragraph, answered the whole problem.
        //
        // THE RELATIONS COME OFF THE LINKS THIS LEAD WAS ALREADY GIVEN, which is what the `task`
        // and `block` case below does. Both readings are of the same list, so this panel and the
        // rail cannot come to two answers about which sections this record has.
        //
        // A PROBLEM WITH NO SYMPTOM WRITTEN DECLARES NOTHING AND THE WALK CARRIES ON, which is
        // `sectionsOf` reading `sectionsOnThisRecord`: the "Nobody has written what goes wrong"
        // line below is an absence a reader can see, not a place in the record.
        <Panel
          declares={sectionsOf({ ...record, relations: links.map((l) => l.label) })(SYMPTOM_KEY)}
          title={titleHere(record.kind, SYMPTOM_KEY)}
          rank={1}
        >
          {symptom === null ? (
            <p className="rd-none">{t('g2b.problem.noSymptom')}</p>
          ) : (
            <p className="rd-lead" {...textAttributes(`data.${SYMPTOM_KEY}`, 0)}>
              {symptom}
            </p>
          )}
          <WordControl record={record} fieldKey="state" editable={editable} onChanged={onChanged} label={t('g2b.sits.whereItStands')} />
        </Panel>
      )
    }

    case 'task':
    case 'block': {
      return (
        <WhereThisSits
          // THE RELATIONS COME OFF THE LINKS THIS HEADLINE WAS ALREADY GIVEN, which is what
          // `KindHeadline` does one function up for the consequence banner. Both readings are of
          // the same list, so this panel and the rail cannot come to two answers about what
          // sections this record has.
          declares={sectionsOf({ ...record, relations: links.map((l) => l.label) })(WHERE_IT_SITS_KEY)}
          record={record}
          containment={containment}
          editable={editable}
          onChanged={onChanged}
          records={records}
          effort={fieldOf(EFFORT_KEY)}
        />
      )
    }

    case 'session': {
      const doing = str('doing')
      const state = str('state')
      // `runtime` FIRST AND `agent` AFTER IT. Window B renamed that key on every session, and a
      // corpus restored from a backup taken before it still holds the older spelling — a screen that
      // read only the new one would draw nothing at all for every run in such a corpus.
      const agent = str('runtime') ?? str('agent')
      return (
        <Panel declares={{ surface: null }} title={t('g2b.session.title')} rank={1}>
          {doing === null ? (
            <p className="rd-none"><Absence tier="ordinary" title={t('g2b.session.noDoing')} /></p>
          ) : (
            <p className="rd-lead" {...textAttributes('data.doing', 0)}>
              {doing}
            </p>
          )}
          <p className="rd-sub">
            {state === null ? t('g2b.session.noState') : t('g2b.session.state', { state: stateWord(state, 'normal', record.kind).text })}
            {agent === null ? '' : ` ${t('g2b.session.runBy', { agent })}`} {t('g2b.session.started')} <Stamp at={record.createdAt} />{t('g2b.session.lastWritten')}{' '}
            <Stamp at={record.updatedAt} />{t('g2b.session.end')}
          </p>
          <UsageReceipt receipt={d['usageReceipt'] as RuntimeReceipt | undefined} />
          {/* WHETHER PICKING THIS RUN UP AGAIN IS EXPENSIVE. Criterion T6. The server computed the
              sentence from this run's own receipt and idle stamp, so this page, the Embassy row and
              the composer say one thing. Null means no warning was earned, and nothing is drawn. */}
          {pickUpCost === undefined || pickUpCost === null ? null : (
            <p className="rd-warn">{pickUpCost.warning}</p>
          )}
          <WordControl record={record} fieldKey="state" editable={editable} onChanged={onChanged} label={t('g2b.sits.whereItStands')} />
        </Panel>
      )
    }

    case 'idea': {
      const needs = Array.isArray(d['would_need']) ? (d['would_need'] as unknown[]).map(String) : []
      return (
        <Panel declares={{ surface: null }} title={t('g2b.idea.title')} rank={1}>
          {needs.length === 0 ? (
            <p className="rd-none">{t('g2b.idea.noNeeds')}</p>
          ) : (
            <ul className="rd-list">
              {needs.map((line, i) => (
                <li key={i} {...textAttributes(`data.would_need[${String(i)}]`, 0)}>
                  {line}
                </li>
              ))}
            </ul>
          )}
          <WordControl record={record} fieldKey="state" editable={editable} onChanged={onChanged} label={t('g2b.sits.whereItStands')} />
        </Panel>
      )
    }

    case 'direction': {
      const question = str('question')
      const depth = str('depth')
      const why = str('depth_reason')
      return (
        <Panel declares={{ surface: null }} title={t('g2b.direction.title')} rank={1}>
          {question === null ? (
            <p className="rd-none">{t('g2b.direction.noQuestion')}</p>
          ) : (
            <p className="rd-q" {...textAttributes('data.question', 0)}>
              {question}
            </p>
          )}
          <p className="rd-sub">
            {depth === null ? t('g2b.direction.noDepth') : t('g2b.direction.depth', { depth: depthWord(depth) })}
            {why === null ? '' : ` ${why}`}
          </p>
          <WordControl record={record} fieldKey="depth" editable={editable} onChanged={onChanged} label={t('g2b.direction.depthLabel')} />
        </Panel>
      )
    }

    /**
     * A NOTE IS ITS BODY, SO THE BODY IS WHAT THE PAGE OPENS WITH.
     *
     * This case did not exist, and `IN_HEADLINE` above claims `body` and `date` for a note — which
     * means `bodySections` leaves them out on the understanding that the headline prints them. It
     * did not. The words a person wrote reached no screen at all in Normal mode; they were readable
     * only in the "Stored fields" panel, which is behind the Developer switch and prints them as a
     * key and a value. A note whose content is invisible on its own page is the worst version of
     * this defect in the product, because a note has nothing else in it.
     *
     * THE DAY IS PRINTED ONLY WHEN THERE IS ONE, and its absence is not announced. `date` is the day
     * the writing is ABOUT, which is not always the day it was written — and the day it was written
     * is on the header line of every record in the product. So a note with no `date` has no hole in
     * it: nothing is missing from the screen, there is simply one date rather than two.
     */
    case 'note': {
      const body = str('body')
      const day = str('date')
      return (
        <Panel declares={{ surface: null }} title={t('g2b.note.title')} rank={1}>
          {/* LINES THE PERSON TYPED IN A TERMINAL (wave 13u, round 4): one per line, each with a delete press, and what was left out. */}
          {typeof d[KEPT_FROM_TERMINAL] === 'string' ? (
            <KeptLines record={record} editable={editable} onChanged={onChanged} />
          ) : body === null ? (
            <p className="rd-none"><Absence tier="ordinary" title={t('g2b.note.empty')} /></p>
          ) : (
            <p className="rd-prose rd-writing wrap-anywhere" {...textAttributes('data.body', 0)}>
              {body}
            </p>
          )}
          {day === null ? null : <p className="rd-sub">{t('g2b.note.day', { day })}</p>}
        </Panel>
      )
    }

    /**
     * A MESSAGE IS ITS BODY TOO, and it had the same hole for the same reason.
     *
     * `read` HAS THREE ANSWERS AND NOT TWO. Stored true, stored false, and nothing stored at all are
     * three different facts: the last one is nobody having said either way, and it is what almost
     * every message in the corpus holds. Collapsing it into "not read" would be Mole Office answering a
     * question nobody asked it.
     */
    case 'message': {
      const body = str('body')
      const from = str('from')
      const read = d['read']
      return (
        <Panel declares={{ surface: null }} title={t('g2b.message.title')} rank={1}>
          {body === null ? (
            <p className="rd-none">
              <Absence tier="ordinary" title={t('g2b.message.empty')} />
            </p>
          ) : (
            <p className="rd-prose rd-writing wrap-anywhere" {...textAttributes('data.body', 0)}>
              {body}
            </p>
          )}
          <p className="rd-sub">
            {from === null ? t('g2b.message.noFrom') : t('g2b.message.from', { from })}{' '}
            {read === true
              ? t('g2b.message.read')
              : read === false
                ? t('g2b.message.unread')
                : t('g2b.message.noRead')}
          </p>
        </Panel>
      )
    }

    /**
     * A COMMENT IS WHAT SOMEBODY SAID AND WHAT THEY SAID IT ABOUT, so the page prints both.
     *
     * Its own component because it asks the server a question this page does not already answer:
     * which record or plan the comment sits in, what that is called, and whether the words it
     * quoted are still where they were. A hook cannot live inside this switch.
     */
    case 'annotation':
      return <CommentSource record={record} editable={editable} onChanged={onChanged} />

    /**
     * AN AGENT'S GOAL SAYS WHO FILED IT AND WHETHER IT IS CONFIRMED, WITH THE PRESS. The owner's
     * decision: a lead to a goal opens this page, and the press was drawn only on the Goals
     * page. Its own component because it reads the registry for the names.
     */
    case 'goal':
      return <GoalMark record={record} onChanged={onChanged} />

    default:
      return null
  }
}

// ============================================================================ a goal's confirmation

/**
 * WHO FILED THIS GOAL, AND WHO CONFIRMED IT ON WHOSE WORD, OR THE PRESS THAT CONFIRMS IT.
 *
 * Criterion P1 and a decision. A goal the person filed never waited for
 * anybody, so it draws nothing. A goal a secretary confirmed says who pressed, on whose word, and
 * leads to the evidence, so the page does not read it as the person's own press. The press is drawn
 * for the person, the way the Goals page draws it, and the server holds the rule under it; both
 * pages store what `aGoalConfirmed` builds. Here the press writes on the version the page draws, so it
 * asks first when another writer changed the goal since, as the fork's pin does.
 */
function GoalMark({ record, onChanged }: { record: PanelRecord; onChanged: () => void }) {
  const [participants] = useProjectAsync(() => readParticipantsOnce(), [])
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<{ said: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const write = useWriteThisRecord(record.id, 'drawn')
  const filedBy = typeof record.data['filed_by'] === 'string' ? record.data['filed_by'] : null
  if (filedBy === null) return null

  const held = record.data['confirmed_by']
  const mark = typeof held === 'object' && held !== null && !Array.isArray(held) ? (held as Record<string, unknown>) : null
  const stored = (key: string): string | null => (mark !== null && typeof mark[key] === 'string' ? (mark[key] as string) : null)
  const isThePerson = getActor().type === 'human'

  const press = async (): Promise<void> => {
    setBusy(true)
    setRefusal(null)
    try {
      // IN THE GOAL'S OWN PROJECT: this page read the goal in the switcher's project, and the page's write goes there.
      const written = await write(await aGoalConfirmed())
      if (!('notNow' in written)) onChanged()
    } catch (err) {
      setRefusal({ said: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel declares={{ surface: null }} title={t('goalMark.title')} rank={1}>
      {participants.status === 'loading' ? <Loading what={t('goalMark.title')} rows={1} /> : null}
      {participants.status === 'error' ? <ErrorNote message={participants.message} fault={participants.fault} /> : null}
      {participants.status === 'ready' ? (
        <div className="goal-mark">
          <GoalMarkSaid
            filer={nameOfAStoredId(filedBy, participants.value)}
            mark={mark === null ? null : { by: stored('by'), at: stored('at'), pressedBy: stored('pressed_by') }}
            isThePerson={isThePerson}
            participants={participants.value}
          />
          <GoalMarkEvidence evidence={stored('evidence')} />
          {mark === null && isThePerson && record.deletedAt === null ? (
            <p className="goal-mark-press">
              <Btn variant="secondary" onClick={() => void press()} pending={busy}>
                {t('g7a.horizons.confirm')}
              </Btn>
            </p>
          ) : null}
          {refusal === null ? null : <ErrorNote message={refusal.said} fault={refusal.fault} />}
        </div>
      ) : null}
    </Panel>
  )
}

/**
 * A stored handle by the name the registry gives it, or the handle itself when nobody bears it. It takes only the
 * fields it reads, which the page's short list of people and agents carries (wave 13y round 27).
 */
function nameOfAStoredId(id: string, participants: ParticipantsNamed): string {
  return theParticipantAStoredIdNames([...participants.people, ...participants.agents], id)?.name ?? id
}

/** The one sentence the goal's mark says. */
function GoalMarkSaid({
  filer,
  mark,
  isThePerson,
  participants,
}: {
  filer: string
  mark: { by: string | null; at: string | null; pressedBy: string | null } | null
  isThePerson: boolean
  participants: ParticipantsNamed
}) {
  const absent = t('absence.mark')
  const said =
    mark === null
      ? t(isThePerson ? 'goalMark.waitingYou' : 'goalMark.waitingPerson', { name: filer })
      : mark.pressedBy === null
        ? t('goalMark.confirmed', {
            filer,
            name: mark.by === null ? absent : nameOfAStoredId(mark.by, participants),
            date: mark.at ?? absent,
          })
        : t('goalMark.confirmedFor', {
            filer,
            presser: nameOfAStoredId(mark.pressedBy, participants),
            name: mark.by === null ? absent : nameOfAStoredId(mark.by, participants),
            date: mark.at ?? absent,
          })
  return <p className="goal-mark-said rd-prose">{said}</p>
}

/**
 * THE EVIDENCE A SECRETARY NAMED, AS A LEAD TO THE RECORD THAT SAYS SO. The server stores only
 * `decision:<id>` or `message:<id>`; anything else is shown as stored rather than read.
 */
function GoalMarkEvidence({ evidence }: { evidence: string | null }) {
  if (evidence === null) return null
  const colon = evidence.indexOf(':')
  const word = colon <= 0 ? '' : evidence.slice(0, colon)
  const id = colon <= 0 ? '' : evidence.slice(colon + 1)
  if (id !== '' && (word === 'decision' || word === 'message')) {
    return (
      <p className="goal-mark-lead">
        <RouteLink to={recordPath(id)} className="goal-mark-evidence">
          {t(word === 'decision' ? 'goalMark.evidence.decision' : 'goalMark.evidence.message')}
        </RouteLink>
      </p>
    )
  }
  return <p className="goal-mark-lead">{t('goalMark.evidence.asStored', { evidence })}</p>
}

// ============================================================================ a comment's own page

/**
 * WHAT THIS COMMENT SAYS, AND WHAT IT WAS LEFT ON, WITH THE PRESS THAT GOES THERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ON THIS PAGE BEFORE, MEASURED IN CHROMIUM AT 1440 ON 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A comment opened as a record drew its truncated title, one collapsed fold headed "Body", and
 * nothing whatever about the thing it was left on: no record name, no block, no quoted words, and
 * no way to get to any of them. Zero of the four. A comment that cannot say what it is about is a
 * remark with the subject cut off, and a review of them is a list of half sentences.
 *
 * ---------------------------------------------------------------------------------------
 * THE TITLE IS NOT OFFERED FOR EDITING ANYWHERE ON THIS PAGE, AND THE WORDS ARE
 * ---------------------------------------------------------------------------------------
 *
 * A comment has no title field. `annotationTitle` cuts the first words off the body and adds an
 * ellipsis, and every write of the body writes the title through it. So a title box on a comment
 * offers a person a machine's shortening of their own sentence — they change the name and believe
 * they changed what they said. The box here writes both, through `aCommentsNewWords`, which is
 * the one place that keeps them saying the same thing. `RecordHead` draws no title box on a comment
 * for the same reason, and `IN_HEADLINE` above takes away the fold stack's second one.
 *
 * ONCE IT HAS GONE TO SOMEBODY THERE IS NO BOX AT ALL. The server refuses the write — see the
 * gate in src/server/lib/records.ts — and a box that is refused is the lie
 * design/UX-CONTRACT.md names by hand: a control that does not accept what it appears to accept.
 * What is drawn instead is the state, which is a fact and not an instruction.
 *
 * THE WORDS ARE IN THE SAME PLACE WHILE READING AND WHILE WRITING, so pressing Edit moves nothing.
 */
function CommentSource({
  record,
  editable,
  onChanged,
}: {
  record: PanelRecord
  editable: boolean
  onChanged: () => void
}) {
  const inspect = useInspect()
  // WHAT THE RECORD ITSELF HOLDS is drawn immediately; only the sentence about where the comment
  // sits waits on a request. A page whose main content is behind a second fetch blinks on every
  // reload, and the words are the thing somebody came here to read.
  const stored = typeof record.data['body'] === 'string' ? (record.data['body'] as string) : ''
  // WHAT MOLE OFFICE MADE OF THESE WORDS, or null because nothing has. An empty string is not a reading
  // and is read as null, which is what the server's own reader of this field does.
  const held = record.data['interpretation']
  const reading = typeof held === 'string' && held.trim() !== '' ? held : null
  const [view] = useProjectAsync(async () => api.annotation(record.id), [record.id])
  /*
   * WHETHER THESE WORDS HAVE GONE TO ANYBODY, ASKED OF THE SERVER RATHER THAN OF THE RECORD.
   *
   * It read `record.data['state']` until window B, which took that field off the annotation kind and
   * emptied the key on every comment in the corpus. Reading it after that would have answered
   * "nothing has gone out" about every comment the owner has ever sent — and the button below would
   * have been offered on all of them, for a write the server refuses 409. `GET /api/annotations/:id`
   * works the answer out from the dispatch store, which is the same question the server's gate asks.
   *
   * WHILE THE ANSWER IS STILL COMING, THE BUTTON IS NOT OFFERED. A press that appears and then turns
   * out to be refused is worse than one that appears a moment later, and this is the one page in the
   * product where the refusal costs somebody their own words.
   */
  const state = view.status === 'ready' ? view.value.state : ''
  const gone = state !== '' && state !== 'queued'
  const known = view.status === 'ready'
  const [open, setOpen] = useState(false)

  return (
    <>
      <Panel declares={{ surface: null }} title={t('g2b.comment.title')} rank={1}>
        {open ? (
          <TheCommentsNewWords record={record} stored={stored} onChanged={onChanged} done={() => setOpen(false)} />
        ) : stored === '' ? (
          <p className="rd-none"><Absence tier="ordinary" title={t('g2b.comment.empty')} /></p>
        ) : (
          // WHAT WAS WRITTEN, AND BESIDE IT WHAT MOLE OFFICE MADE OF IT.
          //
          // The reading used to be reachable only through a collapsed fold headed `Interpretation`
          // — the stored field name, which is the mechanism rather than the thing — below the words
          // rather than beside them. Its kind declares it as shown beside the words and never
          // instead of them, and this is that pair. It is drawn only when there is one: nothing has
          // read most comments, nobody has to act on that, and a second empty column on every
          // comment page would be a mark on everything.
          //
          // THE SAME COMPONENT THE REVIEW PANE DRAWS. Two copies of "here is the reading, here are
          // the two presses" would be free to word the consequence of changing one differently on
          // the two screens a person meets it on.
          <div className="rd-two" data-pair={reading === null ? undefined : '1'}>
            <div className="rd-two-side">
              {reading === null ? null : <p className="rd-two-head">{t('g2b.comment.says')}</p>}
              <p className="rd-prose rd-writing wrap-anywhere" {...textAttributes('data.body', 0)}>
                {stored}
              </p>
            </div>
            {reading === null ? null : (
              <div className="rd-two-side">
                <ReadingBesideIt noteId={record.id} reading={reading} without={null} onChanged={onChanged} />
              </div>
            )}
          </div>
        )}
        {/* WHERE IT HAS GOT TO, said only when it has got somewhere. Every comment starts unsent,
            and a line repeating that on every one of them is furniture rather than information. */}
        {gone ? (
          <p className="rd-sub">
            {state === 'answered'
              ? t('g2b.comment.dealtWith')
              : t('g2b.comment.gone')}
          </p>
        ) : null}
        {editable && known && !open && !gone ? (
          <div className="rd-change">
            <Btn size="sm" onClick={() => setOpen(true)}>
              {t('g2b.comment.change')}
            </Btn>
          </div>
        ) : null}
      </Panel>
      <Panel declares={{ surface: null }} title={t('g2b.comment.aboutTitle')} rank={1}>
        {view.status === 'loading' ? (
          <Loading label={t('g2b.comment.aboutLoading')} rows={2} />
        ) : view.status === 'error' ? (
          <ErrorNote message={view.message} fault={view.fault} label={t('g2b.comment.aboutError')} />
        ) : (
          <CommentTarget view={view.value} inspect={inspect} />
        )}
      </Panel>
    </>
  )
}

/**
 * THE BOX FOR A COMMENT'S NEW WORDS, drawn only while it is open, so its write stands on the version the page drew when
 * the person opened it. A change by another writer since, such as a reading put beside the words, is asked about when
 * the person saves, as in the record's edit form (src/web/components/AnotherWriter.tsx). The write is the words and the
 * title made from them, the same write `api.rewriteAnnotation` sends.
 */
function TheCommentsNewWords({
  record,
  stored,
  onChanged,
  done,
}: {
  record: PanelRecord
  stored: string
  onChanged: () => void
  done: () => void
}) {
  const [typed, setTyped] = useState(stored)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const write = useWriteThisRecord(record.id, 'opened')

  async function save() {
    setBusy(true)
    setRefused(null)
    try {
      const written = await write(aCommentsNewWords(typed.trim()))
      if ('notNow' in written) return
      // THE BOX SHOWS WHAT IS STORED NOW when the person kept the other writer's version, and stays open on it.
      if ('keptTheirs' in written) {
        const theirs = written.keptTheirs.data['body']
        setTyped(typeof theirs === 'string' ? theirs : '')
      } else {
        done()
      }
      onChanged()
    } catch (err) {
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rd-comment-write">
      <Field
        label={t('g2b.comment.whatYouWrote')}
        hint={t('g2b.comment.nameHint')}
      >
        <TextArea value={typed} onChange={setTyped} rows={4} growTo={20} autoFocus />
      </Field>
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('g2b.comment.refused')} />}
      <div className="rd-comment-act">
        <Btn
          variant="primary"
          pending={busy}
          disabled={typed.trim() === '' || typed.trim() === stored}
          reason={
            typed.trim() === ''
              ? t('g2b.comment.cannotEmpty')
              : t('g2b.comment.unchanged')
          }
          onClick={() => void save()}
        >
          {t('g2b.comment.save')}
        </Btn>
        <Btn variant="ghost" onClick={done}>
          {t('g2b.comment.keepOld')}
        </Btn>
      </div>
    </div>
  )
}

/**
 * WHICH THING, WHICH WORDS, WHETHER THEY ARE STILL THERE, AND THE PRESS THAT GOES TO THEM.
 *
 * NOTHING HERE WORKS OUT AN ADDRESS OF ITS OWN. `pageHolding` is the one map from a thing somebody
 * pointed at to the page holding it, and `showMeThat` is the one half that lights the exact words
 * once that page has drawn them — both already used by the review pane. A second route table here
 * would be the same fact in two places, free to send this page and the pane to different addresses
 * for one comment. `staleWords` is borrowed for the same reason: a comment whose quote has moved
 * must not read one way in a review and another way on its own page.
 *
 * Exported so a test can put every kind of target through it without a browser.
 */
export function CommentTarget({ view, inspect }: { view: AnnotationView; inspect: boolean }) {
  const [refused, setRefused] = useState<string | null>(null)
  const where = view.where
  // THE WHOLE CONTEXT, NOT THE TARGET ALONE. What a comment on a part of Mole Office's own screen can
  // open is decided by the evidence stored beside the target, and this page and the review pane
  // must not answer that differently — which is the reason this file borrows `pageHolding` at all.
  const holds = pageHolding(view.context)
  const stale = staleWords(view.reading)
  const quote = where.quote

  // WHAT THIS COMMENT WAS LEFT ON, named the way a person would name it, and where that is.
  //
  // IT IS THE SERVER'S ONE PHRASE AND IT IS NOT BUILT HERE, which is the whole of this repair. This
  // file used to work it out from `where.record` alone — the record's stored kind and its title —
  // so a comment on a paragraph, a table, a row and a whole record all printed the SAME sentence,
  // and a reader could not tell one from another. Measured on the live corpus on 31 August 2026:
  // four comments, four different places, one sentence. `AnnotationWhere.leftOn` in
  // src/server/lib/annotations.ts holds the four readings and how the phrase is built.
  //
  // AND ONLY THE SERVER CAN BUILD IT. Naming a part of a record means resolving it in the derived
  // region tree, which needs the record; this page is the COMMENT's page and has neither. Doing it
  // here would have meant a second read of another record for a phrase, and a second answer to
  // "what is this part called" beside the server's own.
  //
  // AND THE SENTENCE BELOW ADDS NOTHING IN FRONT OF IT. It opened "Left on the whole of {inside}",
  // which is this page working out how to say *the entire record* beside a phrase that already says
  // it: `whereAPartIs` in @shared/regions.ts answers *the whole of the report “…”* for a comment on
  // the record root, and the two together read, in a browser on 2 September 2026:
  //
  //   Left on the whole of the whole of the report “Round ten: …”, rather than on particular words.
  //
  // One fact, said in two places, and both of them applying it. WHETHER A COMMENT IS ON THE WHOLE OF
  // SOMETHING RATHER THAN ON PARTICULAR WORDS is what `quote === null` says, and the end of the
  // sentence is where it is said — once.
  const inside = where.leftOn

  function go() {
    if ('cannot' in holds) {
      setRefused(holds.cannot)
      return
    }
    setRefused(null)
    stopShowing()
    // AND THE CARD IT WAS WRITTEN ON, IF IT WAS WRITTEN ON A DRAWING. `pageHolding` above is asked
    // while this page is being drawn, so it may not write anything; this is the press.
    rememberTheCardACommentWasOn(view.context)
    navigate('seenOn' in holds ? holds.seenOn : holds.path)
    // NOTHING IS LIT UP ON THE PAGE IT WAS SEEN ON. That page holds no element carrying this
    // comment's key — the thing it points at is drawn on every page — so `showMeThat` would be
    // looking for something that is not there.
    //
    // AND NOTHING IS SAID AFTER THE PRESS EITHER, BECAUSE THIS PAGE IS GONE BY THEN. A sentence set
    // here would be set on a component the navigation unmounts: measured in Chromium at 1440 and at
    // 390 on 25 August 2026, the press leaves `#/r/<the comment>` for `#/plan` and nothing this
    // function wrote is ever drawn. What says it is the standing line below and the press's own
    // words, both of which are on the screen BEFORE the press — which is the better place for it
    // anyway: a person is told where they will land while they can still decide not to.
    if ('seenOn' in holds) return
    showMeThat({ key: where.key, context: view.context, annotationId: view.id })
  }

  return (
    <>
      {quote === null ? (
        <p className="rd-lead">{t('g2b.comment.leftOnWhole', { inside })}</p>
      ) : (
        <>
          <p className="rd-quote wrap-anywhere">“{quote.words}”</p>
          <p className="rd-lead">{t('g2b.comment.leftOnWords', { inside })}</p>
        </>
      )}
      {/* WHETHER THE THING IS STILL AS IT WAS. `staleWords` answers nothing when nothing has moved,
          and a line saying "still there" on every comment would be the furniture this contract
          bans. "Nobody could tell" is a different answer from "it moved" and is kept apart. */}
      {stale === null ? null : stale.kind === 'cannot say' ? (
        <p className="rd-sub">{t('g2b.comment.cannotTell')}</p>
      ) : (
        <Banner tone="blocked" says={`${stale.words}. ${t('g2b.comment.readAgain')}`} />
      )}
      {refused === null ? null : <ErrorNote message={refused} label={t('g2b.comment.cannotOpen')} />}
      {/* WHERE THIS COMMENT WAS SEEN, when that is all there is. It stands on the page rather than
          appearing after the press, because the press leaves this page. `seenOnWords` is the one
          sentence and the review pane says the same one. */}
      {'seenOn' in holds ? <p className="rd-sub">{seenOnWords(holds.seenOn)}</p> : null}
      <div className="rd-change">
        {/* THE PRESS SAYS WHICH OF THE TWO IT IS BEFORE IT IS PRESSED. "Go to it" on a comment about
            a part of the screen that is on every page promises a page holding it, and there is
            none; what there is, is the page it was seen on. A control that names the wrong act is
            the defect this file's own neighbours are full of notes about. */}
        <Btn onClick={go}>{'seenOn' in holds ? t('g2b.comment.goSeen') : t('g2b.comment.go')}</Btn>
      </div>
      {/* THE MACHINERY, one switch away: the exact stored sentence with its ids, which block, and
          the key an element on screen carries. design/UX-CONTRACT.md puts every one of those in
          Developer detail, and the sentences above read without them. */}
      {inspect ? (
        <>
          <p className="rd-sub">{view.says}</p>
          <p className="rd-sub">
            {where.blockId === null ? t('g2b.comment.noBlock') : t('g2b.comment.block', { block: where.blockId })} {t('g2b.comment.key', { key: where.key })}
            {quote === null || quote.field === null
              ? ''
              : ` ${t('g2b.comment.character', { from: String(quote.from), field: quote.field })}`}
          </p>
        </>
      ) : null}
    </>
  )
}

// ============================================================================ tier 3: the rail

/** How many links read as sentences before the rest go behind one press. */
export const RAIL_LINKS = 5

/**
 * WHAT THIS RECORD SPENT, FOLDED — criterion T2.
 *
 * The criterion names a problem, a module, a pipeline and a step. It is drawn on every kind in the
 * rail, because the answer comes from the change log every record has. IT IS NOT THE RECEIPT ON A
 * SESSION'S OWN PAGE: that is one run's own numbers, drawn by `UsageReceipt` in the body. This is
 * the total over the runs that changed THIS record, taken from its change log.
 *
 * FOLDED IS THE CRITERION'S WORD, so it is a closed `details` that opens on a press, and the number
 * is in the label so it can be read without opening.
 */
/**
 * THE WORDS OF WHAT WAS SPENT, in the page's language. `g2b.spent.*` in the word lists is the one
 * place they are written: this panel reads the keys with `t()`, and `SPENT_WORDS` in
 * src/shared/spent.ts reads the same keys for the server.
 */
function spentTime(ms: number | undefined): string | null {
  if (ms === undefined) return null
  const whole = Math.max(0, Math.round(ms))
  if (whole < 1000) return t('g2b.spent.ms', { n: whole })
  const seconds = whole / 1000
  if (seconds < 60) return t('g2b.spent.seconds', { n: seconds.toFixed(1) })
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return rest === 0 ? t('g2b.spent.minutes', { n: minutes }) : t('g2b.spent.minutesSeconds', { n: minutes, s: rest })
}
function spentSummary(runs: number, tokensIn: number | undefined, tokensOut: number | undefined, durationMs: number | undefined): string {
  if (tokensIn === undefined && tokensOut === undefined) return t('g2b.spent.summaryNoTokens', { n: runs })
  const inPart = tokensIn === undefined ? t('g2b.spent.noTokensIn') : t('g2b.spent.tokensIn', { tokens: tokensIn.toLocaleString('en-GB') })
  const outPart = tokensOut === undefined ? t('g2b.spent.noTokensOut') : t('g2b.spent.tokensOut', { tokens: tokensOut.toLocaleString('en-GB') })
  const time = spentTime(durationMs)
  const timePart = time === null ? t('g2b.spent.noTime') : t('g2b.spent.over', { time })
  return t('g2b.spent.summaryRuns', { n: runs, inPart, outPart, timePart })
}

export function WhatWasSpent({ spent, declares, kind }: { spent: SpentOnThis | undefined; declares: Declares; kind: RecordKind }) {
  const inspect = useInspect()
  if (spent === undefined) return null
  const { runs, totals, runsWithoutReceipt, changesNamingNoRun } = spent
  const overall = totals.overall
  // NOTHING COUNTED, SAID AS ONE PLAIN LINE (wave 13k round 34). The summary read "No cost is counted: no
  // change to this record names the agent run that made it", and the fold under it explained the change
  // log, which a person cannot act on (the review in 3Zgf2lTGanJw). With no run named, what is true
  // for a person is that nobody recorded a cost; developer mode keeps the fold and why.
  //
  // A REPORT DRAWS NOTHING IN NORMAL MODE WHEN NO RUN IS NAMED (wave 13s round 261), because the line tells
  // the reader of a report nothing. Every other kind keeps it.
  if (runs.length === 0 && !inspect && kind === 'report') return null
  if (runs.length === 0 && !inspect) {
    return (
      <p className="rd-spent-none" data-testid="spent-on-this" {...declaredAttributes(declares)}>
        {t('g2b.spent.summaryNoRuns')}
      </p>
    )
  }
  return (
    // IT DECLARES ITSELF, THE FOLD AND NOT ANYTHING INSIDE IT, for the reason the change-log fold
    // above does: the summary line is drawn out here, and a press on it used to walk past the rail
    // and answer the whole record (problem kkxhj88hCHEj).
    <details className="rd-fold" data-testid="spent-on-this" {...declaredAttributes(declares)}>
      <summary {...DRAWS_THE_NAME}>
        {runs.length === 0
          ? t('g2b.spent.summaryNoRuns')
          : spentSummary(
              runs.length,
              overall.values.inputTokens,
              overall.values.outputTokens,
              overall.values.durationMs,
            )}
      </summary>
      <div>
        <p className="rd-sub">{t('g2b.spent.countsWhat')}</p>
        {runs.length === 0 ? (
          <p className="rd-none">{t('g2b.spent.nobodyChangedIt')}</p>
        ) : (
          <>
            <p className="rd-spent-head">{t('g2b.spent.whichRuns')}</p>
            <ul className="rd-list">
              {runs.map((run) => (
                <li key={run.id}>
                  {run.title ?? run.id}
                  {/* A run's id is developer mode's (plan 7FEOshq3mBGG, G2c). */}
                  {inspect ? <span className="rd-link-mach"> {run.id}</span> : null}
                  {run.hasReceipt ? null : <span className="rd-sub"> — {t('g2b.spent.thisOneNoReceipt')}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {runsWithoutReceipt > 0 ? (
          <p className="rd-sub">{t(runsWithoutReceipt === 1 ? 'g2b.spent.withoutReceiptOne' : 'g2b.spent.withoutReceipt', { n: runsWithoutReceipt, counted: t('g2b.spent.runCount', { n: runs.length }) })}</p>
        ) : null}
        {changesNamingNoRun > 0 ? <p className="rd-sub">{t(changesNamingNoRun === 1 ? 'g2b.spent.namesNoRunOne' : 'g2b.spent.namesNoRun', { n: changesNamingNoRun })}</p> : null}
      </div>
    </details>
  )
}


/**
 * WHO MADE A CHANGE, NAMED AS THE REST OF THE PAGE NAMES THEM (wave 13k rounds 30 and 34).
 *
 * The fold's summary said "Last changed just now by person": the kind of writer, where the page
 * holds the writer. `writerNamed` in src/web/lib/participant-lookup.ts is the one naming of a writer:
 * a registered person or agent by name, the office's own writes by the office's word, anybody else as
 * unregistered. Developer mode draws the stored id instead, at the call.
 */
export function whoChanged(change: { actorType: string; actorId: string }, participants?: ParticipantsReply): string {
  // ONE NAMING, AND IT LOOKS BY HANDLE TOO (wave 13k round 34). It looked only for a registry id, and an
  // agent's change rows hold its handle, so "Last changed just now by kiln-ledger" reached a normal page.
  return writerNamed(change, participants)
}

/** Who made a change, and the model their run was started on when its record names one (problem 2tbFWxiFyjtv). */
function whoWithTheModel(who: string, model: string | null): string {
  return model === null ? who : t('g2d.changeLog.whoOnModel', { who, model: content(model) })
}

/**
 * "Last changed just now by Morgan", ONE WORD WITH THE MOMENT AND THE NAME FILLED IN.
 *
 * One word holds the whole sentence, because Chinese puts the moment first ("刚刚由……更改") and
 * English puts it in the middle. The moment is `relativeTime`'s words and the hover title is
 * `drawnDayWithTime`'s, the two readers `Stamp` itself uses, so nothing here formats a time. Both
 * values are spaced from Chinese by `gapBetween`.
 *
 * WHY NOT `Stamp` CUT INTO THE WORD. Cutting the word at the moment leaves each half without the
 * other half of the test language's marks, so the half after the moment reads as words nobody
 * wrote; filled in as a value, the moment stays inside the word that says it.
 */
function LastChanged({ at, who }: { at: string; who: string }) {
  return (
    <span className="rd-changed" title={drawnDayWithTime(at)}>
      {wordWithSpacedValues(t, 'record.changedAt', { when: relativeTime(at), who })}
    </span>
  )
}

/**
 * TIER 3: WHO THIS RECORD IS JOINED TO, AND WHEN IT LAST MOVED.
 *
 * Five sentences and a count. `link.label` is the server's own direction-worded phrase, so
 * "blocks" and "blocked by" come from one place and this rail cannot word a link the other way
 * round from the panel it opens into. In Inspect each sentence grows the direction it is stored in
 * and the id it points at, in place, rather than a second panel appearing underneath it.
 */
export function RecordRail({
  record,
  links,
  log,
  participants,
  titles,
  titleById,
  unfilledByRecord,
  editable,
  onChanged,
}: {
  record: PanelRecord
  links: readonly GatedLink[]
  log: ChangesReply
  /** Everybody the registries hold, so the change log names a proved holder rather than printing an id. */
  participants?: ParticipantsReply
  /** The pickers' titles, or null while the record is being read. See `RecordPageData.titles`. */
  titles: TitleOption[] | null
  titleById: ReadonlyMap<string, string>
  unfilledByRecord: ReadonlyMap<string, number>
  editable: boolean
  onChanged: () => void
}) {
  const inspect = useInspect()
  const grouped = relationGroups(links, RAIL_LINKS)
  // EVERY RELATION THIS RECORD HAS, whether or not the rail drew a row of it. It is what the server
  // derives the relation sections from, and passing the drawn subset here would make the browser
  // and the server hold two different lists of what this record's page is made of.
  const sectionHere = sectionsOf({ ...record, relations: links.map((l) => l.label) })
  const last = log.changes[0]

  return (
    <div className="rd-rail">
      {links.length === 0 ? (
        // IN WORDS, FOR THE REASON THE OPEN-AROUND PANEL SAYS ITS EMPTY ANSWER IN WORDS: a lone dash
        // under the report's last length control said nothing a reader could read (wave 13k round 30).
        <div className="rd-none"><Absence tier="told-apart" looked word={t('record.links.noneWord')} title={t('record.links.none')} /></div>
      ) : (
        <ul className="rd-links">
          {grouped.map((group) => (
            // THE RELATION IS THE REGION AND THE ROW IS THE RECORD. A press on a row names the
            // record the row names; the walk up from it reaches this list, which says which
            // relation those rows were drawn under. That pair is the owner's "linked semantic object" and
            // the context the recipient suggestion is given.
            <li key={group.relation} className="rd-relation" {...declaredAttributes(sectionHere(group.relation))}>
              <span className="rd-link-verb" {...DRAWS_THE_NAME}>
                {group.rows[0] === undefined ? null : linkWord(group.rows[0].type, group.rows[0].isBacklink ? 'reverse' : 'forward').text}
              </span>
              <ul className="rd-relation-rows">
                {group.rows.map((l) => (
                  <li
                    key={l.linkId}
                    className="rd-link"
                    {...declaredAttributes(theLinkedRecord(l.other.id, record.workspaceId))}
                  >
                    <RouteLink to={recordPath(l.other.id)} {...DRAWS_THE_NAME}>
                      {l.other.title}
                    </RouteLink>
                    {inspect ? (
                      <span className="rd-link-mach">
                        {' '}
                        {t(l.isBacklink ? 'record.links.storedElsewhere' : 'record.links.storedHere')} ·{' '}
                        {l.other.id}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {/* WHAT THIS LIST DID NOT DRAW, said on the list rather than left to be inferred from
                  a count at the foot of the page. The fold below opens all of them. */}
              {group.more === 0 ? null : (
                <span className="rd-link-more">{t('record.links.more', { n: group.more })}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* THE FOLD DECLARES THE LINKS SECTION AND THE PANEL INSIDE IT IS SEE-THROUGH, the way the
          change-log fold below does it. The summary line — *See all 12 links* — is drawn out here,
          so while the panel inside carried the section a press on the summary walked past it and
          answered the record (problem kkxhj88hCHEj). A press inside the panel still reaches the
          same section, one element further up. */}
      <details className="rd-fold" {...declaredAttributes(sectionHere(LINKS_KEY))}>
        <summary>
          {links.length === 0
            ? t('record.links.join')
            : t('record.links.seeAll', { n: links.length })}
        </summary>
        <LinkPanel
          declares={{ surface: null }}
          kind={record.kind}
          recordId={record.id}
          links={links}
          // EMPTY ONLY WHERE THE TITLES WERE NOT READ, which is while the record is being read. The
          // link form that offers them is drawn only while the panel is editable, and the page is
          // editable only once the titles are in hand.
          knownTitles={titles ?? []}
          // THE PANEL IS HANDED NO RELATION REGIONS, and the sentence list above keeps them. Both
          // used to declare `section.<relation>`, which put one region id on two elements of one
          // page, and a region id that names two elements names no place at all. A press inside
          // this fold now walks up to `section.links`, which is where it was met.
          unfilledByRecord={unfilledByRecord}
          // THE SAME REGISTRIES the change log above names writers from, so an answer row names its
          // writer by the name a person knows them by and not by a stored id.
          participants={participants}
          editable={editable}
          onChanged={onChanged}
        />
      </details>

      {/* THE WORD "HISTORY" IS NOT SPENT HERE ANY MORE, and that is the whole of this change.
          This fold opens the change log, which says WHO TOUCHED WHICH FIELD. It cannot say what the
          record held, cannot open a version and cannot put one back. It carried the only "history"
          in the product, so a person looking for what a record used to say pressed this, got a list
          of field names, and had no reason to think there was anything else. What a record held is
          `RecordHistory`, under the header at the top of this page.

          AND IT IS ITS OWN SECTION NOW, WHICH IS THE DECISION THAT WAS OPEN. This fold could not
          declare `section.history` because `RecordHistory` above already carries it and one region
          may only be on one live element. The answer is not to take the id off one of them: the two
          panels are two provenance parts of the page, so the page has two sections. `CHANGES_KEY`
          in src/shared/sections.ts is where the choice is written out and why the versions keep the
          word "history" — the same reason it was taken off this fold's summary in the first place.

          THE FOLD AND NOT THE PANEL INSIDE IT. The summary line — *Last changed … by …* — is drawn
          out here, so a press on it would walk past a panel that declared and answer the record. */}
      {/* THE CHANGE LOG FOLD IS DRAWN IN BOTH MODES. People leave comments on it (its region is
          section.changes), and a comment must have somewhere to be seen in normal mode. Its summary
          names the writer by kind in normal mode and by id in developer mode. */}
      <details className="rd-fold" {...declaredAttributes(sectionHere(CHANGES_KEY))}>
        <summary>
          {last === undefined ? (
            <span {...DRAWS_THE_NAME}>
              {t('record.changes')} <Absence />
            </span>
          ) : (
            <span {...DRAWS_THE_NAME}>
              <LastChanged at={last.at} who={whoWithTheModel(inspect ? last.actorId : whoChanged(last, participants), theModelOfAChange(last, log.sessions, inspect))} />{t('record.history.joint')}{t('record.seeChanges')}
            </span>
          )}
        </summary>
        <ChangeLog changes={log.changes} sessions={log.sessions} titles={titleById} participants={participants} />
      </details>

      {/* WHAT THE RUNS THAT CHANGED THIS RECORD SPENT ON IT. Criterion T2. It sits directly under
          the change log because it is read off that log, and the log below names the runs it
          counted. It is not the receipt in the body: that one belongs to a session's own page and
          is one run's own numbers. */}
      <WhatWasSpent spent={log.spent} declares={sectionHere(SPENT_KEY)} kind={record.kind} />
    </div>
  )
}

// ============================================================================ the record's body

/**
 * EVERYTHING THE BODY OF A RECORD IS GIVEN.
 *
 * The tiers above are computed once and handed over. Nothing below fetches, sorts, counts or
 * decides anything, so a threshold or a sentence that is a claim about the data cannot end up down
 * here, out of sight of the page that worked the rest of it out.
 *
 * A second layout was built beside this one for a while — the same record as named sections in a
 * fixed order, all of them open — so the owner could compare the two against the real corpus. The owner
 * chose the one below and the other was deleted.
 */
export interface RecordDetailProps {
  record: PanelRecord
  /**
   * May anything be written right now: the record is not deleted AND the address says edit.
   *
   * Every box, dropdown and destructive press below is behind this one answer.
   */
  editable: boolean
  /**
   * Soft-deleted, which is a different question from the one above.
   *
   * A module's checklist chips are presses rather than boxes, so they stay live while the record is
   * being read — and `ModuleView` says "the states are read-only until this record is restored"
   * when they are not. That sentence is about deletion and only about deletion, so it is this that
   * governs it. Handing it `editable` would have put a true-sounding sentence about restoring a
   * record on every record nobody had deleted.
   */
  deleted: boolean
  records: PanelRecord[]
  /**
   * HOW MANY OF THE THINGS THIS RECORD LINKS TO ARE WAITING ON THE PERSON, out of the one reading.
   *
   * THE COUNT GUARD. It reaches `SummaryBlocks`, which draws the count guard's other half: a mark
   * beside a block whose stated count contradicts the live one. See `waitingHere` in `RecordPage`
   * for how it is counted and `BlocksInRecord.waitingHere` for what is drawn.
   *
   * LEFT OUT MEANS NOBODY COUNTED. It is optional because the one reading is fetched beside this
   * page rather than inside it, so there is a moment before it has landed — and a zero in that
   * moment would contradict every stated count on the page while the fetch was in flight.
   */
  waitingHere?: number
  detailLinks: readonly GatedLink[]
  /**
   * THE RELATION PHRASE OF EVERY LINK ON THIS PAGE, in the order the rows are drawn.
   *
   * One region is derived per distinct phrase — `section.about`, `section.subject of` — and the
   * rows drawn under it name the records they name. It is carried as its own prop rather than read
   * off `detailLinks` at each panel, because the two would then be two readings of one fact and the
   * panels below do not all get the links.
   */
  relations: readonly string[]
  evolutionLinks: readonly EvolutionLink[]
  log: ChangesReply
  /**
   * EVERYBODY THE REGISTRIES HOLD, so an id in the change log can be drawn as a name. Criterion I4.
   *
   * Optional because a caller that has not read them is a real answer, and the change log then says
   * the id rather than inventing a name. Both pages that draw this body read them with the record.
   */
  participants?: ParticipantsReply
  /** The pickers' titles, or null while the record is being read. See `RecordPageData.titles`. */
  titles: TitleOption[] | null
  titleById: ReadonlyMap<string, string>
  unfilledByRecord: ReadonlyMap<string, number>
  /** Everything the body draws, worked out once from the declaration. */
  body: readonly BodySection[]
  onChanged: () => void
  /**
   * WHETHER PICKING THIS RUN UP AGAIN IS EXPENSIVE, from the server's own reply. Criterion T6.
   *
   * THE SERVER COMPUTES THE WARNING AND THE PAGE DRAWS IT, so the run's page, the Embassy row and
   * the composer say the same words about one run. Null on a run that earned no warning, absent on
   * every other kind.
   */
  pickUpCost?: PickUpCost | null
  /**
   * WHO FILED THIS RECORD AND THE RUN THEY FILED IT FROM, from the server's read of its create change (wave 13k
   * round 43, problem 2tbFWxiFyjtv). A report's byline names the filer and, for an agent, that run's model.
   * Absent where the caller did not read it; null when no create change is stored.
   */
  filedFrom?: RecordReply['filedFrom']
  /** ON A SECRETARY'S DUTIES: each decision they rest on that a newer one replaced, from the server's read of them. */
  restsOnReplacedBy?: RecordReply['restsOnReplacedBy']
}

/** Whether this record is a turn draft: a draft Mole Office holds for a run's readers until the turn ends. */
function aTurnDraft(record: PanelRecord): boolean {
  return record.kind === DRAFT_KIND && isATurnDraft(record.data)
}

/**
 * ONE LINE UNDER A TURN DRAFT'S TITLE: whom its words are held for and that they go as one message, or, once they were
 * sent, whom they went to, when, and the message they became. Without it a held turn draft read as any draft.
 *
 * A draft whose send was refused gets no line, since it is neither held to go nor sent. The page holds no group's name,
 * so a draft to a group is held for the group's members. A message may name nobody and point at a place on a page, and
 * then there is nobody to name, so there is no line.
 */
function TurnDraftLine({ record, participants }: { record: PanelRecord; participants: ParticipantsReply | undefined }) {
  const d = record.data
  const turn = d[TURN] as { fields?: Record<string, unknown>; toAPerson?: unknown }
  const readers =
    typeof turn.fields?.['toGroup'] === 'string'
      ? t('record.turnDraft.aGroup')
      : listJoined(draftForOf(d).flatMap((one) => {
          const named = participantIn(one)
          return named === null ? [] : [writerNamed(named, participants)]
        }))
  if (readers === '') return null
  const sentAs = sentAsOf(d)
  const sentAt = sentAtOf(d)
  if (sentAs !== null) {
    return sentAt === null ? null : (
      <p className="rd-sub">
        {t('record.turnDraft.sent', { readers, at: writtenMoment(sentAt) })}{' '}
        <RouteLink to={recordPath(sentAs)}>{t('record.turnDraft.openTheMessage')}</RouteLink>
      </p>
    )
  }
  if (!theOfficeWillSendThisTurnDraft(d)) return null
  return (
    <p className="rd-sub">
      {turn.toAPerson === true
        ? t('record.turnDraft.heldForAPerson', { readers, minutes: A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES })
        : t('record.turnDraft.held', { readers })}
    </p>
  )
}

/** The head of the body: what kind of record this is, an obligation's own panel under it, and a turn draft's line. */
function DetailHead(props: RecordDetailProps) {
  return (
    <>
      <KindHeadline
        record={props.record}
        links={props.detailLinks}
        // WHAT ITS BOXES OFFER WHEN ONE NAMES A RECORD. Every box in it is drawn only while editing.
        records={pickFrom(props.titles)}
        // THE WHOLE PROJECT, not this record's own links. `parentOf` answers from three stores and
        // two of them are facts about OTHER records: a pipeline's stored order lives on the
        // pipeline. Both of these are already loaded by `useAsyncRecord`, so this costs no request.
        containment={{ records: props.records, links: props.evolutionLinks }}
        editable={props.editable}
        onChanged={props.onChanged}
        // AND THE RUN'S OWN EXPENSIVE-PICK-UP WARNING, if the server sent one. Criterion T6.
        pickUpCost={props.pickUpCost}
      />
      {props.record.kind === 'obligation' ? (
        <ObligationPanel
          record={props.record}
          editable={props.editable}
          records={props.records}
          onChanged={props.onChanged}
        />
      ) : null}
      {aTurnDraft(props.record) ? <TurnDraftLine record={props.record} participants={props.participants} /> : null}
    </>
  )
}

/**
 * A RECORD OPENS AS AN ANSWER TO ITS OWN DEFINING QUESTION, and everything else is folded.
 *
 * The unit of the page is one kind-written answer and then a stack of one-line folds, so the whole
 * of a record is one screen and any part of it is one press.
 */
export function RecordDetail(props: RecordDetailProps) {
  // WHICH SECTIONS THIS RECORD HAS, read once for the whole body rather than once per fold.
  const sectionHere = sectionsOf({ ...props.record, relations: props.relations })
  const inspect = useInspect()
  return (
    <div className="rd">
      <DetailHead {...props} />
      {/* WHAT THIS WAS MADE OF, for the two kinds whose membership has a stored answer. A pipeline
          keeps its block order and a module keeps its `implements` links; nothing else does, and
          the route refuses any other kind by name rather than drawing "made of nothing". */}
      {KINDS_WITH_COMPOSITION.includes(props.record.kind as (typeof KINDS_WITH_COMPOSITION)[number]) ? (
        <CompositionEvolution recordId={props.record.id} kind={props.record.kind} declares={sectionHere(MADE_OF_KEY)} />
      ) : null}
      {props.record.kind === 'module' ? (
        <ModuleBody {...props} sectionHere={sectionHere} />
      ) : props.record.kind === 'report' ? (
        // A REPORT IS READ, SO IT IS DRAWN AS A DOCUMENT AND NOT AS THE FOLD STACK BELOW. Its four
        // fields are all in `IN_HEADLINE`, so the stack would have been empty anyway; what this
        // branch adds is the document, the line saying who it is for, and nothing else.
        <ReportBody {...props} />
      ) : (
        <>
          {/* THE CARD ITSELF, ABOVE THE FOLDS THAT SAY WHERE THE COPY CAME FROM. Problem
              `76Yh8qLhHdGY`: the seven parts sit in one field of type `Record<string, unknown>`, and
              the fold stack below has no way to draw one — so the page drew Role name, Copied from
              and Copied at, and nothing of the card. Those three folds stay where they are, under
              the card, because they are about the COPY and not about the role. */}
          {props.record.kind === 'role_card' ? (
            <RoleCard record={props.record} records={props.records} />
          ) : null}
          {/* ONE FOLD, ONE SECTION, ONE TARGET. `props.body` comes from `filledBodySections`, which
              reads the same declaration `sectionsOnThisRecord` reads, so every fold drawn here has
              a region and no fold can carry a target for a section the tree does not hold. This is
              what makes *Cause*, *Fix* and *Alternatives rejected* three different answers to a
              right-click instead of three presses that all said the whole record. */}
          {props.body.map((section) => (
            <details
              className="rd-fold rd-fold-body"
              key={section.key}
              // A TURN DRAFT OPENS ON ITS WORDS, which are what it holds for its readers.
              open={section.key === 'body' && aTurnDraft(props.record) ? true : undefined}
              {...declaredAttributes(sectionHere(section.key))}
            >
              {/* THE FOLD'S OWN HEADING IS WHAT THE COMPOSER CALLS IT. Without this mark the chip
                  read the first stored string inside the fold, so a press on *Alternatives
                  rejected* named the first alternative instead of the section. Same mark and same
                  reason as the one `Panel` puts on its title. */}
              <summary {...DRAWS_THE_NAME}>{section.heading}</summary>
              <BodyField
                record={props.record}
                section={section}
                editable={props.editable}
                records={pickFrom(props.titles)}
                titleById={props.titleById}
                participants={props.participants}
                replacedBy={props.restsOnReplacedBy}
                onChanged={props.onChanged}
              />
            </details>
          ))}
          {/* WHILE READING, THE ROW IS A LIST OF STORED FIELD NAMES AND NOTHING ON IT CAN BE PRESSED,
              so it is developer mode's. While editing each name is a press, and normal mode keeps
              it (plan 7FEOshq3mBGG, G2c). */}
          {props.editable || inspect ? (
            <AddRow record={props.record} editable={props.editable} records={pickFrom(props.titles)} onChanged={props.onChanged} />
          ) : null}
        </>
      )}
      {/* WHERE THIS LIVES, ON THE THREE KINDS THAT CAN HOLD CODE. It sits UNDER the record's own
          body and not above it, on purpose: the body is what somebody wrote about this piece of
          work, and where its files are is the answer to the next question rather than the first
          one. On a module that puts it directly after the module's own Paths and Claimed source
          panels, which is where a reader already looks for code, and the three of them are read
          together.

          `holdsCode` rather than three comparisons written here. A fourth kind gaining an
          implementation is one edit in one file, and a page that listed the kinds itself is the
          second list free to disagree with the first. */}
      {holdsCode(props.record.kind) ? (
        <WhereThisLives
          recordId={props.record.id}
          kind={props.record.kind}
          declares={sectionHere(WHERE_IT_LIVES_KEY)}
        />
      ) : null}
      {/* A RUN'S TOOL USES, under its own body. They are rows of `tool_uses`, not the run's data (wave 13s round 33). */}
      {props.record.kind === 'session' ? (
        <ToolUses run={props.record.id} kind={props.record.kind} declares={sectionHere(TOOL_USES_KEY)} />
      ) : null}
      {/* THE *SHORTER FORMS OF THIS REPORT* PANEL STOOD HERE AND WAS REMOVED ON 2 September 2026.
          It drew all six stored forms, each with who wrote it and what it stands for. The owner
          read it beside the report body, which draws the form written for the reader's length, and
          ruled that it repeats what the body already shows, it is useful for debugging, it is not
          normal UI, and it goes. §C-3Sept of design/problem-02/ACCEPTANCE.md.

          THE FORMS THEMSELVES ARE UNCHANGED. They are stored under `data.shortForms`, written and
          read through `/api/records/:id/short-forms`, checked against the body by the same door,
          and drawn one at a time by the report body. Right-clicking one opens the composer, which
          says what it stands for and who wrote it. */}
      <RecordRail
        record={props.record}
        links={props.detailLinks}
        log={props.log}
        participants={props.participants}
        titles={props.titles}
        titleById={props.titleById}
        unfilledByRecord={props.unfilledByRecord}
        editable={props.editable}
        onChanged={props.onChanged}
      />
    </div>
  )
}

/**
 * WHAT A REPORT SAYS ABOUT ITSELF, WHERE A READER LOOKS, AND THE ONE PRESS IT NEEDS.
 *
 * Who it is for, which day it is about, and where it stands with its reader — with the press that
 * settles the last of those on the line beside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE READ SENTENCE IS A WORD NOW, AND WHY THERE IS A BUTTON
 * ---------------------------------------------------------------------------------------
 *
 * This line drew "Nobody has said whether it has been read." at 14px in the reading colour, on a
 * page with NO WAY TO SAY YOU HAD READ IT. Marking one read was only offered while the address said
 * edit, which nobody reaches from reading a review. So the page stated an absence and then gave the
 * reader no way to close it, which is the one thing design/UX-CONTRACT.md says an absence may never
 * do — and it is the absence with the loudest weight on the page it appears on.
 *
 * BOTH HALVES ARE FIXED HERE. The press is on the page for anybody who may make the claim. The
 * absence beside it became a small mark, then left normal mode because a line that tells the
 * reader nothing is not drawn, and then left
 * developer mode with the rule's whole sentence (decision 8SkQQo1x69IV, revision 3). Where nobody has
 * said, the line draws the press and no words about the gap.
 *
 * `read` HAS FOUR ANSWERS AND ONLY ONE OF THEM IS AN ABSENCE. `read` and `unread` are statements
 * somebody made; no word at all is the gap, and it is what every report holds until somebody looks;
 * and a word this build has never heard of is a fault in the record, which keeps its whole sentence
 * because somebody has to go and mend it. Drawing the gap as "not read" would be Mole Office answering a
 * question nobody asked it.
 *
 * THE OTHER GAPS DRAW NOTHING EITHER (decision 8SkQQo1x69IV, revision 3): no reader written, no day
 * written, and no chapters written. The missing-details panel and the report check name what a report
 * still needs, so a line here would only say it again.
 *
 * NO SEPARATOR CHARACTERS BETWEEN THEM, for the reason the header line above says: a dot between
 * two sentences dangles at the end of a line the moment the row wraps, and at 390 it always wraps.
 */
/** The words a report may carry for `read`, from the declaration that refuses any other. */
const READ_ANSWERS: readonly string[] = REPORT_READ_ANSWERS

/**
 * WHO FILED A REPORT, AND IN DEVELOPER MODE THE MODEL ITS RUN WAS STARTED ON (wave 13k round 43, problem
 * 2tbFWxiFyjtv).
 *
 * The change log names a model per change, but its fold names only the last change. This line is about the
 * report's create change. A gap draws no words of its own (decision 8SkQQo1x69IV, revision 3): an agent write with
 * no run, a run with no record here, and a run that named no model draw the filer alone, and a report nobody is
 * recorded as filing draws no filer. A person, and the office's own writes, have no model, so none is named. Null
 * where the page was not given the read.
 */
function filedHere(filedFrom: RecordReply['filedFrom'], participants: ParticipantsReply | undefined, inspect: boolean): string | null {
  if (filedFrom === undefined || filedFrom === null) return null
  // IN NORMAL MODE THE LINE NAMES THE AGENT AND NOTHING ELSE: a reader may need to ask the agent something, and the
  // model its run was started on tells them nothing they act on. The model is developer mode's, where the office's
  // own mechanics are read on purpose.
  const who = inspect ? filedFrom.actorId : writerNamed(filedFrom, participants)
  if (filedFrom.actorType !== 'agent' || filedFrom.actorId === THE_OFFICE_WRITER_ID) return inspect ? t('g2b.report.filedBy', { who }) : null
  if (!inspect) return t('g2b.report.filedBy', { who })
  const run = filedFrom.run
  const model = run === null || run.unresolved || run.recordId === null ? null : theModelSaid(run.model, true)
  return model === null ? t('g2b.report.filedBy', { who }) : t('g2b.report.filedByOn', { who, model })
}

function ReportByline({
  record,
  editing,
  onChanged,
  filedFrom,
  participants,
}: {
  record: PanelRecord
  editing: boolean
  onChanged: () => void
  filedFrom: RecordReply['filedFrom']
  participants: ParticipantsReply | undefined
}) {
  const inspect = useInspect()
  const d = record.data
  const str = (key: string): string | null =>
    typeof d[key] === 'string' && (d[key] as string).trim() !== '' ? (d[key] as string).trim() : null
  const forWhom = str('for')
  const day = str('date')
  const read = str('read')
  /* THE CHAPTERS THIS RUN SAYS IT READ, or null because the report does not say. A stored value
     that is not a list of whole numbers is not a list of chapters, and it reads as "does not say"
     rather than as a partial list nobody wrote. */
  const held = d[CHAPTERS_READ]
  const chaptersRead =
    Array.isArray(held) && held.every((one) => typeof one === 'number' && Number.isInteger(one))
      ? (held as number[])
      : null
  /* THE ROW THE PRESS COMES FROM, built by the one reader of a report record.
     `about` is empty because this line says nothing about what the report concerns — the links
     panel on this same page does — and `reportReading` asks for it rather than inventing it. */
  const row = reportReading(record, [])
  const filed = filedHere(filedFrom, participants, inspect)
  // THE DAY THE REPORT IS ABOUT IS WORTH A LINE ONLY WHEN IT IS NOT THE DAY IT WAS WRITTEN: the record's own
  // header already says when it arrived, so repeating that day says nothing a reader does not see.
  const itsOwnDay = day !== null && day.slice(0, 10) !== record.createdAt.slice(0, 10)

  return (
    <p className="rd-byline">
      {filed === null ? null : <span data-testid="report-filed-by">{filed}</span>}
      {forWhom === null ? null : <span>{t('g2b.report.for', { who: forWhom })}</span>}
      {day === null || !itsOwnDay ? null : (
        <span>
          {/* `formatDue` is the one reader of a stored day in this app. Both modes say the day in the same words,
              and only when it is not the filing day. */}
          {wordWithSpacedValues(t, 'g2b.report.aboutDay', { day: formatDue(day) })}
        </span>
      )}
      {/* WHICH CHAPTERS OF THE CODE OF LAW THIS RUN READ. Criterion C16: a starter names chapters when it
          registers an agent, the report says which were read, and whoever checks the work sets the two lists
          against each other.

          ABSENT IS NOT "IT READ NONE", and the two are different answers: an empty list says it read none. A
          report that does not say draws nothing here, because the missing-details panel and the check already
          name what they need. */}
      {chaptersRead === null ? null : (
        <span>
          {chaptersRead.length === 0
            ? t('g2b.report.readNoChapter')
            : t('g2b.report.readChapters', { n: chaptersRead.length, chapters: joined(chaptersRead.map((one) => String(one))) })}
        </span>
      )}
      {/* NOBODY HAVING SAID DRAWS NO WORD here. The press at the end of the line is how the gap is closed. */}
      {read === null ? null : (
        <span className={READ_ANSWERS.includes(read) ? undefined : 'rd-byline-odd'}>
          {read === 'read'
            ? t('g2b.report.markedRead')
            : read === 'unread'
              ? t('g2b.report.markedUnread')
              : t('g2b.report.oddRead', { word: read, answers: READ_ANSWERS.join(t('g2b.report.nor')) })}
        </span>
      )}
      {/* THE PRESS ITSELF, and the rule about who may make the claim is the component's, not this
          page's: `MarkRead` refuses an agent and says so, because "I have read this" is a statement
          about somebody's eyes. It is the same component Home draws, so there is one way to record
          this fact and one wording of what was recorded.

          NOT WHILE THE RECORD IS BEING CHANGED. `ReportFields` below puts a box on this same field
          then, and that panel's own note says why two controls for one field on one screen is how
          somebody comes to write into the one that is not saving. Reading is the ordinary state of
          this page and is where the press belongs. */}
      {row.waiting && !editing ? <MarkRead row={row} onMarkedRead={onChanged} /> : null}
    </p>
  )
}

/**
 * A REPORT IS DRAWN AS THE DOCUMENT SOMEBODY WROTE, NOT AS A STACK OF FIELDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS KIND GETS ITS OWN BODY
 * ---------------------------------------------------------------------------------------
 * The owner's rule is that a formal review is read INSIDE Mole Office, in the context it belongs to.
 * That only holds if opening one gives you the writing. Everything a record page normally puts
 * first — the kind, how complete it is, its links, its history — is still on this page, above and
 * below; none of it is what somebody who opened a review came for, so none of it is between them
 * and the first sentence.
 *
 * THE BLOCKS ARE THE MODULE'S BLOCKS AND THE COMPONENT IS THE MODULE'S COMPONENT. A report's
 * `blocks` and a module's `summaryBlocks` are one shape by declaration, so a chart in a report is
 * drawn by whatever draws a chart in a module. `layout="document"` is a word to that component
 * about where it is being read; the sizes and the reading width live in its stylesheet, not here.
 *
 * WHAT IS DRAWN WHEN THERE IS NO WRITING. Three different nothings, kept apart: nobody has written
 * anything yet, somebody stored an empty list, and something is stored that is not a list of blocks
 * at all. The third is a fault in the record and is drawn as one — a page that quietly showed an
 * empty document would be saying the report is empty when what is true is that Mole Office cannot read
 * it.
 */
function ReportBody(props: RecordDetailProps) {
  // A REPORT RUNS TO SEVERAL SCREENS, so its page scrolls in its own box and its scrollbar stands beside
  // its words rather than at the window's edge. src/web/lib/page-scroll.ts.
  useThePageScrollsInItsBox()
  const blocks = props.record.data['blocks']
  return (
    <div className="rd-report">
      {/* WHAT THIS SECTION OF THE PAGE IS CALLED, FROM THE ONE PLACE A SECTION'S NAME IS WRITTEN,
          drawn as the same small uppercase tag the summary line above is drawn with.

          `SectionSpec.title` is that place, and until 2 September 2026 nothing on a record page
          drew this one. Measured in Chromium on `OOOt4Kouc5dT`: `section.summary` was in the region
          tree, carried the title *The report*, and had no heading anywhere on the page — so a
          comment left on it read back in the review pane as *the section “The report”*, a heading
          in quotation marks that a reader could not find. That is the pane naming a place a reader
          cannot go to, which is this cluster's own fault in smaller clothes.

          IT CARRIES NO TARGET, AND THAT IS THIS STEP DECLINING TO MAKE A SECOND CHANGE RATHER THAN
          AN OVERSIGHT. `section.summary` has no element on any of the twenty-six kinds — measured
          on a report, a note, a problem, a module and a decision — so a press cannot land on it and
          a mark cannot be painted on it. Giving it one here was tried and moved four guarded
          landings: on `.rd-report` it became the nearest addressable thing above every block, and a
          selection crossing two paragraphs named *Section “The report”* rather than the block
          holding them; on this tag it turned *View original* over the whole report body from
          *showing a part of it* into *showing what holds it*, which sends a reader to a ten-word
          label instead of to the writing. Which element should carry that section, on every kind,
          is its own repair. This one draws the name. */}
      <span className="rd-report-tag">{titleHere(props.record.kind, READING_MATTER_KEY)}</span>
      <ReportByline record={props.record} editing={props.editable} onChanged={props.onChanged} filedFrom={props.filedFrom} participants={props.participants} />
        {/* THE BOXES SIT WHERE THE SENTENCES SIT, which is this page's rule for editing and it
            matters more here than anywhere else: a report runs to several screens, and a panel
            after it meant scrolling past the whole review to change who it is for. */}
        {props.editable ? <ReportFields {...props} /> : null}
        {blocks === undefined || blocks === null ? (
          <p className="rd-none">
            <Absence tier="ordinary" title={t('g2b.report.nothingWritten')} />
          </p>
        ) : !Array.isArray(blocks) ? (
          <Banner
            tone="failed"
            says={
              <>
                {t('g2b.report.unreadable', { shape: typeof blocks })}
              </>
            }
          />
        ) : blocks.length === 0 ? (
          <p className="rd-none">
            {/* TOLD APART FROM NOTHING WRITTEN BY ITS WORD: somebody stored an empty list. */}
            <Absence word={t('g2b.report.emptyListWord')} title={t('g2b.report.emptyList')} />
          </p>
        ) : (
          // Which record this is, so every block and every run of text in it can say where it is
          // stored. That is what makes a passage of a report something a person can point at.
          <>
            {/* THE RECORD'S OTHER STORED WORDS, so a reader who asked for less than the whole
                report gets fewer of its parts rather than every part. Leaving this out is what
                the whole-product dogfood measured as 8,260 words at all six positions: the
                resolver was right, the settings grid was right, and this page never asked. */}
            {/* A REPORT IS A PAGE, WRITTEN HERE AS A CONSTANT AND NOT READ FROM A SETTING. Which
                of the two profiles these blocks get is a fact about the surface drawing them — a
                record page draws a page, a module panel draws a panel — and it was a reader's
                stored reading style for four profiles that all drew the same tree. What a reader
                chooses is inside the component now: how much it says, whether its pictures are
                drawn, and how large the type is. */}
            {/* THE QUESTIONS THIS REPORT ASKS THE PERSON are answered in place: this holds their
                answers, keeps and sends them, and draws the line counting them above the
                report. The whole report's submit is drawn
                inside the report, after the last question in no box (see ReportQuestions.tsx). */}
            <ReportQuestions
              recordId={props.record.id}
              blocks={blocks as SummaryBlock[]}
              stored={answersOf(props.record.data)}
              onSent={props.onChanged}
            >
            <SummaryBlocks
              blocks={blocks as SummaryBlock[]}
              layout="page"
              inRecord={{
                recordId: props.record.id,
                kind: props.record.kind,
                stored: detailSourceOf(props.record),
                // EVERYTHING THIS RECORD HOLDS, so the tree this drawing announces is the tree the
                // write door validates against. The phrases come off `detailLinks`, which is the
                // same list the rail draws its rows from and the same one `relationsHere` above
                // reads — working them out again from the link types would be the second reading
                // this file keeps finding. See `BlocksInRecord.wholeRecord`.
                wholeRecord: {
                  kind: props.record.kind,
                  data: props.record.data,
                  // THE TITLE, WHICH IS READING LENGTH 2 AND THEREFORE A PART OF THE RECORD
                  // SOMEBODY CAN POINT AT. See `RecordRegionSource.title`.
                  title: props.record.title,
                  summary: props.record.summary,
                  relations: props.detailLinks.map((link) => link.label),
                },
                // THE ONE READING'S NUMBER, so a block that counts what waits can be answered
                // beside itself. Spread rather than passed as `waitingHere={…}` because
                // `exactOptionalPropertyTypes` is on and `undefined` is not the same as absent:
                // only absent means "nobody counted", which is what draws no mark.
                ...(props.waitingHere === undefined ? {} : { waitingHere: props.waitingHere }),
              }}
            />
            </ReportQuestions>
          </>
        )}
    </div>
  )
}

/**
 * THE THREE THINGS A REPORT SAYS ABOUT ITSELF, AS BOXES, AND ONLY WHILE THE RECORD IS BEING CHANGED.
 *
 * Written fields only. A field this report does NOT have already has a box inside the sentence that
 * reports its absence, at the top of the page, and two boxes for one field on one screen is how a
 * person comes to write into the one that is not saving.
 *
 * The writing itself has no box, and the sentence saying why comes from the same declaration that
 * refuses the write: a list is added to, removed from and reordered, and one box could only replace
 * the whole of it over whatever somebody else wrote while you typed.
 */
function ReportFields(props: RecordDetailProps) {
  const spec = KIND_SPECS['report']
  const written = ['for', 'date'].flatMap((key) => {
    const field = spec.fields.find((f) => f.key === key)
    if (field === undefined || !isWritten(props.record.data[key])) return []
    return [field]
  })

  return (
    <Panel declares={{ surface: null }} title={t('g2b.report.fieldsTitle')} rank={2}>
      {written.map((field) => (
        <FieldWriter
          key={field.key}
          recordId={props.record.id}
          kind="report"
          field={field}
          control={controlFor('report', field)}
          stored={props.record.data[field.key]}
          records={pickFrom(props.titles)}
          hint
          onSaved={props.onChanged}
        />
      ))}
      {/* Marking a report read is a statement about a person, which is why it is a word somebody
          chooses and never something Mole Office works out from a page having been opened. */}
      <WordControl
        record={props.record}
        fieldKey="read"
        editable={props.editable}
        onChanged={props.onChanged}
        label={t('g2b.report.readLabel')}
      />
    </Panel>
  )
}

/** A module keeps its own designed page rather than the fold stack above. */
function ModuleBody(props: RecordDetailProps & { sectionHere: (key: string) => Declares }) {
  const write = useWriteThisRecord(props.record.id, 'drawn')
  return (
    <>
      {/* THE WRAPPER DRAWS NOTHING (display: contents). It names the part ModuleView draws, which other
          pages draw too, so the word test of this page can leave it to its own piece. */}
      <div className="rd-module-view" style={{ display: 'contents' }}>
      <ModuleView
        data={props.record.data}
        // The record's own title, which is reading length 2 on a kind with a reading ladder.
        title={props.record.title}
        // The envelope one-liner, which is not `data.summary`. See the prop's own note.
        summary={props.record.summary}
        // The id, so the page can ask which reports were written about this module. Without it
        // ModuleView cannot look, and a module with reports about it would draw none of them —
        // which reads as "nobody has written one" and is a different fact.
        moduleId={props.record.id}
        // WHICH RELATIONS THIS MODULE HAS LINKS OF, so this view's `sectionsOf` and the rail's are
        // the same reading of what the page is made of.
        relations={props.relations}
        // NOT `editable`. See the note on `deleted` in RecordDetailProps: a checklist chip is a
        // press, presses are allowed while reading, and this panel's own sentence about being
        // read-only is a sentence about deletion.
        editable={!props.deleted}
        onSave={async (change, again) => {
          // A MERGE. The view hands back the fields it changed, and a merge writes those and leaves
          // every other field alone — including a field somebody else wrote after this page loaded.
          // This used to send the whole `data` object back as a wholesale replace, which the server
          // now refuses unless the caller says it means to empty what it left out.
          const written = await write({ dataPatch: change }, (theirs) => ({ dataPatch: again(theirs.data) }))
          if (!('notNow' in written)) props.onChanged()
        }}
      />
      </div>
      {/* WHERE THE PLAN STANDS IN THE PLANNING FLOW. Read only: the office writes it. */}
      <ModulePlanningPanel
        record={props.record}
        participants={props.participants}
        declares={props.sectionHere('planning')}
        plannerDeclares={props.sectionHere('planner')}
      />
      <Evolution
        // THE DRAWING IS DERIVED FROM OTHER RECORDS AND IS STILL A PLACE ON THIS MODULE'S PAGE.
        // `section.mayEvolve` is what a press on its heading answers; the rows inside it name the
        // directions they draw.
        declares={props.sectionHere(MAY_EVOLVE_KEY)}
        moduleId={props.record.id}
        moduleTitle={props.record.title}
        records={props.records}
        links={props.evolutionLinks}
      />
      {/* THE ONE WAY INTO THE WHOLE PROJECT'S GRAPH, from the module whose futures this block draws. */}
      <p className="rd-change">
        <RouteLink to={pathFor('projectgraph')}>{t('projectGraph.fromModule')}</RouteLink>
      </p>
    </>
  )
}

/**
 * THE QUIET ROW AT THE FOOT OF THE BODY: what this kind can still be told, and nothing else.
 *
 * Every name on it is a declared field this record does not have, and pressing one opens the SAME
 * writer the completeness block opens — built from the declaration that refuses a bad write, so it
 * cannot offer a key, a word or a shape the write path would turn down. A field whose shape has no
 * honest control is named on the row too, with the sentence saying why, rather than being silently
 * absent: a name missing from this row would be indistinguishable from a kind that does not declare
 * it, which is exactly how the missing write controls stayed unnoticed.
 */
function AddRow({
  record,
  editable,
  records,
  onChanged,
}: {
  record: PanelRecord
  editable: boolean
  records: readonly NamedRecord[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const spec = KIND_SPECS[record.kind]
  if (spec === undefined) return null

  // NOT A THIRD BOX FOR THE SAME FIELD. A required field this record lacks already has a control
  // inside the sentence reporting the absence, and a field the kind's headline offers usually has
  // one there; a `direction` was offering `depth` in all three places at once. What is left is what
  // has no control anywhere else on the page, which is what this row is for.
  //
  // "USUALLY", AND THE EXCEPTIONS ARE WRITTEN DOWN RATHER THAN GUESSED AT. `IN_HEADLINE` says the
  // fold stack does not print a field; it does not say anybody can write it. A panel that draws a
  // field read-only leaves it with no control at all once this row skips it, and a reader would
  // then see a blank nobody can fill. `DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL` names those fields and
  // this row keeps offering them. See its own note in src/shared/sections.ts.
  const asked = new Set(completenessOf(record.kind, record.data).map((i) => i.path.replace(/^data\./, '')))
  const headlined = IN_HEADLINE[record.kind] ?? []
  const noBox = DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL[record.kind] ?? []
  const empty = spec.fields.filter(
    (f) =>
      !NOT_BODY.includes(f.key) &&
      (!headlined.includes(f.key) || noBox.includes(f.key)) &&
      !asked.has(f.key) &&
      !isWritten(record.data[f.key]),
  )
  if (empty.length === 0) return null
  const field = open === null ? undefined : empty.find((f) => f.key === open)
  const control = field === undefined ? undefined : controlFor(record.kind, field)

  return (
    <div className="rd-add">
      <p className="rd-add-row">
        <span className="rd-add-lab">{t('g2b.add.label')}</span>
        {/* NAMES SEPARATED BY SPACE, NOT BY A DOT. The row wraps where the window ends, so a dot between two names
            began or ended a line on its own at 390 (the review of wave 13q's round 35 pictures, the Chinese page).
            The decision's box of fields above lists its names the same way. */}
        {empty.map((f) => ({ f, name: fieldLabel(record.kind, f.key) })).map(({ f, name }) => (
          <span key={f.key} className="rd-add-item">
            {editable ? (
              <button type="button" className="rd-add-btn" onClick={() => setOpen(f.key === open ? null : f.key)}>
                {name}
              </button>
            ) : (
              <span className="rd-add-off">{name}</span>
            )}
          </span>
        ))}
      </p>
      {field === undefined || control === undefined ? null : control.at === 'elsewhere' || control.at === 'no-control' ? (
        <p className="fw-why">{control.because}</p>
      ) : (
        <FieldWriter
          recordId={record.id}
          kind={record.kind}
          field={field}
          control={control}
          stored={record.data[field.key]}
          records={records}
          hint
          onSaved={onChanged}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

// ============================================================================ the page

/**
 * THE ONE READING OF WHAT IS WAITING, HANDED DOWN RATHER THAN FETCHED HERE.
 *
 * `App.tsx` reads `GET /api/waiting` once per navigation and gives the same reply to the rail's
 * badge, to Home's band and to this page. The count guard's drawn half needs a
 * number to hold a report's stated count against, and it must be that number: a fetch of the same
 * route from this page would be a second moment of one reading, which is the defect the one reading
 * was built to end.
 */
export function RecordPage({
  id,
  waiting,
  section,
  tellRecordOnScreen,
}: {
  id: string
  waiting: AsyncState<WaitingReply>
  /**
   * THE NAMED SECTION OF THIS RECORD THE ADDRESS ASKED FOR, or nothing when the address is the
   * plain record address. It is a place ON this page, never a second page: see RECORD_SECTIONS in
   * router.tsx for the rule and for why the shape is decided in one file.
   */
  section?: RecordSection
  /**
   * WHAT KIND OF RECORD THIS IS, told once the record has been read.
   *
   * The rail's "where you are" mark asks which row the record on screen belongs to, and a generic
   * record address cannot say. App.tsx passes this through and keeps the answer; nothing else on
   * this page reads it.
   */
  tellRecordOnScreen?: (kind: RecordKind) => void
}) {
  /**
   * WHETHER THIS RECORD IS BEING READ OR WRITTEN IN, out of the address and nowhere else.
   *
   * It was component state, which meant editing was a thing the page remembered rather than a place
   * you could go back from: Back left the record entirely, and a screenshot could not name which of
   * the two states it caught.
   *
   * Read here rather than handed down as a prop, because the shell hands this page its id and not
   * its editing state, and src/web/App.tsx belongs to another change in flight. `useRoute` is the
   * one parser either way, so this is the same answer the shell would have passed — not a second
   * reading of the address. A later pass should hand it down beside the id.
   */
  const [noProfile] = useState(() => peekPreparedPage<boolean>(recordPath(id)))
  useEffect(() => { if (noProfile !== undefined) consumePreparedPage(noProfile) }, [noProfile])
  const route = useRoute()
  const editing = route.name === 'record' && route.edit === true
  // THE PICKERS' TITLES ARE READ ONLY WHILE EDITING. See `useAsyncRecord`.
  const [state, reload] = useAsyncRecord(id, editing)

  /**
   * THE ANSWER ON SCREEN STAYS THERE WHILE THE NEXT ONE IS BEING FETCHED.
   *
   * `useAsync` goes back to `loading` on every reload, and this page returns a skeleton for that
   * state — so before this, every write anywhere on the page blanked the whole of it and mounted it
   * again. That is not a flicker to be tidied away: it threw away everything the reader had open.
   * A field editor closed itself the instant it succeeded, and the sentence the server sends back
   * saying WHAT THE WRITE ACTUALLY DID — changed, unchanged, or a key removed — was mounted and
   * unmounted in the same frame, so the one report that can tell "it is now 3" from "it was already
   * 3" was never on screen long enough to read.
   *
   * What is drawn in the meantime is the previous moment, whole and consistent, exactly as it was
   * when it was fetched — never a mixture. The skeleton is still what a FIRST load draws, because
   * there is nothing to keep.
   *
   * THE ID IS KEPT WITH IT. Without that, navigating from one record to another would draw the
   * record you just left, under the address of the one you asked for, until the reply landed —
   * trading a blink for a page that is wrong about which record it is.
   */
  const kept = useRef<{ id: string; value: RecordPageData } | null>(null)
  if (state.status === 'ready') kept.current = { id, value: state.value }
  /** The moment this page has in hand for THIS id, or null when it is still on its first load. */
  const held = kept.current !== null && kept.current.id === id ? kept.current.value : null
  // `state.value` when the reply has landed, the previous one while the next is on its way. Read
  // here rather than after the early returns below, because the wiring that makes this page an
  // object an agent can be pointed at is a hook and a hook cannot come after one.
  const shown = state.status === 'ready' ? state.value : held

  /**
   * HOW MANY OF THE THINGS THIS RECORD LINKS TO ARE WAITING ON THE PERSON.
   *
   * NULL MEANS NOBODY COUNTED, AND IT IS NOT ZERO. Until the one reading has landed there is no
   * number, and a zero drawn in the meantime would contradict every stated count on the page for as
   * long as the fetch took. The mark is not drawn until there is something real to draw it from.
   *
   * IT COUNTS BOTH DIRECTIONS OF A LINK. What a report "links to" is what it is joined to, and a
   * backlink is the same join read from the other end — a problem that names this report is one of
   * the things this report is about. The set is by record id, so two links to one record count once.
   */
  const waitingHere: number | null = (() => {
    if (waiting.status !== 'ready' || shown === null) return null
    const waitingIds = new Set(waiting.value.items.map((item) => item.id))
    const linked = new Set((shown.detail.links as readonly GatedLink[]).map((link) => link.other.id))
    let n = 0
    for (const linkedId of linked) if (waitingIds.has(linkedId)) n += 1
    return n
  })()

  const [actionError, setActionError] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [busy, setBusy] = useState(false)
  /** Set once a delete succeeds, so a server that refuses to serve deleted records can still be recovered from. */
  const [deletedHere, setDeletedHere] = useState(false)
  // Read before the early returns below, because a hook after a conditional return is a hook that
  // sometimes does not run.
  const inspect = useInspect()

  /**
   * WHAT IS STILL OPEN AROUND THIS RECORD, fetched ONCE for the two panels that read it.
   *
   * Two panels ask the same question — who filed this, and what is still open around it — and the
   * server answers both in one reply. Fetching it twice would be one question asked twice, and the
   * two answers could differ across a write. `updatedAt` is in the dependencies because a write to
   * this record is exactly what can change the answer.
   *
   * IT IS ASKED ONCE THE RECORD HAS BEEN READ. Asked before, with no `updatedAt` yet, it was asked a second time as soon
   * as the record arrived, and the first answer was thrown away: 490 ms of the server's time on the made-up office
   * shaped like the live project, spent among the edit form's own reads (wave 13y round 143). Until then no panel that
   * reads it is drawn: the page draws its loading rows, or its error note when the record cannot be read, and the
   * panels only once it holds a record.
   */
  const readAt = shown?.detail.record.updatedAt ?? null
  const [openLoops] = useProjectAsync(
    () =>
      id === ''
        ? Promise.reject(new Error('no record id'))
        : readAt === null
          ? new Promise<never>(() => undefined)
          : moleOfficeRequest<OpenLoops & { decisionsAboutThis?: DecisionsAbout }>(
              // EACH DECISION'S BASIS, which the panel folds one press down, since the second level is folded
              // for agents and for people alike.
              `/api/records/${encodeURIComponent(id)}/context?secondLevel=show`,
            ),
    [id, readAt],
  )

  /**
   * THE RECORD'S KIND, TOLD UP TO THE RAIL, once it has been read.
   *
   * A record page opened from a generic address arrives as no more than an id — the address cannot
   * say which kind it opens. The rail asks one question of whatever is on screen, which row this
   * record belongs to, and only the record itself can answer it. App.tsx owns that answer and the
   * state it is kept in; this effect is the one telling, and the rest of this page's drawing is
   * untouched by it. The value is nil while the read is still in flight, so nothing is told before
   * there is truth to tell.
   */
  const kindOnScreen = shown?.detail.record.kind ?? null
  useEffect(() => {
    if (tellRecordOnScreen !== undefined && kindOnScreen !== null) tellRecordOnScreen(kindOnScreen)
  }, [tellRecordOnScreen, kindOnScreen])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
    } catch (err) {
      setActionError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading' && held === null) return <Loading label={t('record.thisRecord')} rows={5} />

  if (state.status === 'error') {
    return (
      <>
        <style href="mole-office-record" precedence="default">
          {RECORD_CSS}
        </style>
        {/* `fault` IS WHAT TELLS THE FOUR WRONG TURNS APART, and this page was the last one not passing
            it. Without it every failure here draws the same red box with a Retry — including a record
            that does not exist and one that lives in another project, where Retry cannot work and
            what the person needs is a way in rather than a way to try again. Every other page was
            wired this way already; this line is the whole of findings 4 and 10 of the language
            audit. */}
        <ErrorNote message={state.message} fault={state.fault} retry={reload}>
          {deletedHere ? (
            <span className="rp-recover">
              <span>
                {t('record.recover')}
              </span>
              <Btn variant="primary" pending={busy} onClick={() => void run(() => api.restoreRecord(id))}>
                {t('record.restoreIt')}
              </Btn>
            </span>
          ) : (
            <RouteLink to="/" className="rp-way-out">
              {t('record.allRecords')}
            </RouteLink>
          )}
        </ErrorNote>
      </>
    )
  }

  // The branch above has already ruled out there being neither; this is what makes that a fact the
  // types agree with rather than one this page asserts.
  if (shown === null) return <Loading label={t('record.thisRecord')} rows={5} />

  const { detail, log, titles, unfilledByRecord, titleById, records, links, projects, participants } = shown
  const record = detail.record
  const standing = stateOf(record)
  const deleted = record.deletedAt !== null
  /**
   * THE RELATION PHRASE OF EVERY LINK ON THIS PAGE, read once, here.
   *
   * `label` is the phrase from THIS record's end — `about` one way, `subject of` the other — and the
   * server puts it on the link. One region is derived per distinct phrase, and it is what a link row
   * is drawn under, so a comment on a row carries the relation as well as the record it names.
   *
   * READ OFF THE SAME LIST THE ROWS ARE DRAWN FROM. Working the phrases out a second time, from the
   * link types and the direction, is how the region a press lands in and the heading it is printed
   * under come to disagree.
   */
  const relationsHere = (detail.links as readonly GatedLink[]).map((link) => link.label)
  /**
   * MAY ANYTHING BE WRITTEN RIGHT NOW — three conditions, and all of them have to hold.
   *
   * The record has to be restorable at all, and the address has to say the reader asked to change
   * it. Every write control on this page is behind this one answer, so there is one rule and not a
   * rule per panel.
   *
   * AND THE PICKERS' TITLES HAVE TO BE IN HAND. They are read only while editing (see
   * `useAsyncRecord`), so for the moment between pressing Edit and the page being read again, the
   * record is drawn as it is read. A box that names a record by its title, mounted before the titles
   * arrived, would start from the id and refuse every title typed into it.
   */
  const writable = !deleted && editing && titles !== null

  /**
   * What this record still needs, worked out here, on every render, from KIND_SPECS.
   *
   * NOTHING IS STORED. There is no column and no flag, on purpose: a stored answer would be
   * wrong the moment a spec changed, and wrong silently. It is also safe on every row in the
   * database including ones written before any of this existed — `recordIncompleteness` never
   * throws, so one bad stored record cannot take this page down. It reads the envelope as well as
   * `data`, so a decision with no summary is incomplete here and in the reply alike.
   */
  const incomplete = recordIncompleteness(record.kind, record.data, record.summary)
  // The missing-field sentence uses the same label as the field's form. The server keeps its
  // detailed English explanation for callers that read it directly.
  // THE FIELD COMES FROM THE WORD ITS FORM ALREADY USES, and the kind is named once, by the panel's
  // heading. The server keeps its English message for callers that read it directly; this page says
  // its first sentence in the page's language. Inspect mode keeps the field's existing English
  // description after it.
  const incompleteHere = incomplete.map((item) => {
    // A DECISION'S SUMMARY IS NOT A FIELD OF `data`, so it has no form word of its own. It is named in words, by where
    // it goes: "the summary under the title". The bare word "summary" read like a stored key (the review of wave
    // 13q's round 35 pictures), and the decision's box of fields lists it by the same name. The server's English
    // sentence ("summary is not filled in, so this decision is incomplete. …") was printed whole on a Chinese page
    // (wave 13q's round 31).
    if (item.path === 'summary') {
      const sentence = wordWithSpacedValues(t, 'record.incomplete.missingDetail', { field: t('record.incomplete.summaryField') })
      if (!inspect) return { ...item, message: sentence }
      const sentenceEnd = item.message.indexOf('. ')
      return { ...item, message: sentenceEnd < 0 ? sentence : `${sentence}${item.message.slice(sentenceEnd + 1)}` }
    }
    const field = fieldForPath(record.kind, item.path)
    if (field === null) {
      const plain = plainIncompleteness(item)
      return inspect ? plain : withoutTheFieldsDescription(record.kind, plain)
    }
    // A DETAIL OF THE RECORD, NAMED BY WHAT IT IS TO THE READER (wave 13k round 30). The line read
    // "For is not filled in, so this report is incomplete." above a report's questions, which read as
    // one question left, with a field's stored key for its name. `fieldLabel` is the one reader of a
    // field's word, so a report's `for` reads "who it is for". The word comes after the colon, so it
    // stays lower case as the label gives it.
    const sentence = wordWithSpacedValues(t, 'record.incomplete.missingDetail', { field: fieldLabel(record.kind, field.key) })
    if (!inspect) return { ...item, message: sentence }
    const sentenceEnd = item.message.indexOf('. ')
    const details = sentenceEnd < 0 ? '' : item.message.slice(sentenceEnd + 1)
    return { ...item, message: `${sentence}${details}` }
  })

  return (
    // EVERY FORM ON THIS PAGE WRITES ON THE VERSION THE PAGE DRAWS, and the edit address hears another writer's change.
    <WritingThisRecord recordId={record.id} kind={record.kind} drawn={{ version: detail.version, seq: detail.revisionSeq }}
      editing={editing} participants={participants} onHeardChange={reload}>
    <article
      className="rp"
      {...targetAttributes({ kind: 'record', recordId: record.id, workspaceId: record.workspaceId })}
    >
      <style href="mole-office-record" precedence="default">
        {RECORD_CSS}
      </style>

      <Crumbs record={record} participants={participants} />

      {deleted ? (
        <Panel declares={{ surface: null }} title={t('record.deletedTitle')} titleIs="label" kind={t('record.softDelete')} rank={0} tone="broken">
          {/* "It is still here" was the page saying what the page is: the whole record is on screen
              under this banner, with a Restore button in it. What is NOT visible from here is what
              the deletion did to every other record that points at this one. */}
          <p className="rp-deleted-note">
            {t('record.deletedAt')} {record.deletedAt ? <Stamp at={record.deletedAt} /> : null}. {t('record.brokenLinks')}
          </p>
          <div className="rp-edit-act">
            <Btn variant="primary" pending={busy} onClick={() => void run(() => api.restoreRecord(record.id))}>
              {t('record.restore')}
            </Btn>
          </div>
        </Panel>
      ) : null}

      <RecordHead
        record={record}
        projects={projects}
        // WHICH RELATIONS THIS RECORD HAS LINKS OF, so the header's `sectionsOf` and the rail's are
        // one reading of what this page is made of. It is the same list the history fold below is
        // given, worked out once at the top of this component.
        relations={relationsHere}
        incomplete={incomplete}
        deleted={deleted}
        editing={editing}
        busy={busy}
        participants={participants}
        onSaved={reload}
        onDelete={async () => {
          await api.deleteRecord(record.id)
          setDeletedHere(true)
          reload()
        }}
      />

      {noProfile !== undefined && peekPreparedPage(recordPath(id), noProfile) !== undefined ? <p className="px-note">{t('records.agent.noProfile')}</p> : null}

      {/* WHERE A PROBLEM STANDS, AND THE PERSON'S CLOSE PRESS BESIDE IT, under the header so both are
          in view at every width without opening /edit. Problem KyoZmFiuv9ma: the owner was sent a
          link to a problem whose move was the owner's at this address, the one most links carry, and found
          no press here, because the press was drawn only at the problem's own page, #/problem/<id>.
          ProblemPage.tsx says the two addresses for one problem stay one page in two places, so this
          is the same row that page draws under its title: the state chip, which is the product's one
          drawing of a stored state, and the same component, CloseThisProblem. Reading, this page
          said a problem's state nowhere outside Inspect: the state control in the symptom panel is
          drawn only behind /edit. The press draws nothing for an agent, for a problem whose move is
          not the person's, and for one that has already ended, and after it writes the page reloads as it
          does after its own state control. #/r/<id> is not sent on to #/problem/<id>: this address
          draws the record page for every kind, and a person who follows a link keeps the address they
          followed. On a problem that has ended, WhoClosedIt says who closed it, the same line the
          problem's own page draws. */}
      {record.kind === 'problem' ? (
        <div className="rp-standing">
          <StoredState
            state={standing.word}
            progress={standing.progress}
            kind={record.kind}
          />
          <CloseThisProblem record={record} onChanged={reload} />
          <WhoClosedIt record={record} log={log} participants={participants} />
        </div>
      ) : null}

      {/* THE RECORD AND THE FACTS AROUND IT FOLLOW THE PRODUCT'S ONE WIDTH RULE, components/SideBySide.tsx.
          The first column is the record itself: its history, its asks and its body. The second is
          who made it and whose move it is, what is still open around it and what was settled here.
          On a wide screen they stand side by side, and on a narrower one the second follows the
          first. When the second draws nothing, the record takes the whole width. The parts inside
          the two columns keep the indent they had before the columns, so the change stays small. */}
      <SideBySide className="rp-sides">
      <div className="rp-main" data-column="start">

      {/* WHAT THIS RECORD HELD BEFORE, DIRECTLY UNDER THE LINE THAT SAYS WHEN IT WAS UPDATED.

          It is one line at rest and it is here rather than at the foot of the page for a measured
          reason: the only history-shaped control this page had was at the bottom of the rail, and
          its position is a function of body length — 17,325 px down a report, 50,644 down a note.
          A person looking for what a record used to say does not scroll a report to find it.

          THE LIST IS READ ON LOAD, so the line can say how many versions there are before anything
          is opened, and so a record page's own network log shows that the browser reaches this at
          all. Until this line existed, no page in the product ever asked for a version.

          `detail.revisionSeq` is the version the record HOLDS NOW, worked out by the server from
          the content rather than by taking the newest row, and null when the ledger holds nothing
          with what is on screen. The panel is handed that answer and never works one out. */}
      <RecordHistory
        recordId={record.id}
        kind={record.kind}
        nowSeq={detail.revisionSeq}
        changedAt={record.updatedAt}
        editable={writable}
        // THE SAME ANSWER THE HEADER'S EDIT PRESS IS DRAWN FROM, so the panel's sentence that names the press is
        // drawn only where the press opens editing.
        editPressOpensEditing={theEditPressOpensEditing(record.kind, deleted, editing)}
        onChanged={reload}
        openAtLoad={section === 'history'}
        versions={detail.history.versions}
        baselineOnly={detail.history.baselineOnly}
        // THE PROVENANCE SECTION. The owner's register asks for "Sources & history" as a meaningful region
        // and the owner's dogfood for "provenance/history"; this fold holds both panels that answer it.
        declares={sectionsOf({ ...record, relations: relationsHere })(HISTORY_KEY)}
        participants={participants}
      />

      {actionError ? <ErrorNote message={actionError.message} fault={actionError.fault} /> : null}

      {/* A FORK, WITH THE ACT ATTACHED. Only the human can complete it — the button posts to the same
          route an agent is refused at. Before this, the product knew a person was required and
          offered them nothing but a nanoid.

          UNDER THE HEADER RATHER THAN ABOVE IT, which is a change. Above it, the record's own title
          was orphaned below a panel that had already asked the question, and a proposal's title and
          its question are near-restatements of each other — so the page opened by asking, then
          introduced itself. It is still the first PANEL, tinted and spined, which is what somebody
          arriving from Home's decision queue is looking for. */}
      {record.kind === 'proposal' && !deleted && detail.resolution !== undefined && detail.resolution !== null ? (
        <ProposalGovernance
          recordId={record.id}
          title={record.title}
          data={record.data as Record<string, unknown>}
          resolved={detail.resolution.resolved}
          // What settled it, so a decided fork can name the decision instead of losing its panel.
          // The rows carry `linkedBy` and `linkedAt` as well — the server sends them and
          // `RecordDetail.resolution` in api.ts does not name them, so `SettlingDecision` mirrors
          // the pair as optional. See the note on that type.
          settledBy={detail.resolution.by}
          // WHAT THE DECIDING RECORD ITSELF STORES, so the settled fork can mark the option that
          // was taken. It comes out of the workspace listing this page already loads, so it costs
          // no request; a decision that is not in the listing is a deleted one, and it is simply
          // absent from the map rather than guessed at.
          decisionData={new Map(records.map((r) => [r.id, r.data]))}
          // WHICH SECTION EACH PART OF THE PANEL DRAWS — the question, the options and the
          // recommendation. The same reader the history fold and the rail are given, so this page
          // has one answer about what it is made of.
          sections={sectionsOf({ ...record, relations: relationsHere })}
          // THE DECISIONS ALREADY MADE THAT NAME THIS FORK, so the person can close it by one without writing a new one
          // (problem lZ8mjvbb4fxl). The server sends them only while the fork is open.
          {...(detail.decisionsThatNameIt === undefined ? {} : { alreadyDecided: detail.decisionsThatNameIt })}
          onSettled={reload}
        />
      ) : null}

      {/* A DECISION THE PERSON CAN CHANGE, criterion M83. On 7 September 2026 the owner found that one
          press chose an option for good, with no way to change it or add a comment. The words the
          person can add at any time,
          the press that chooses again, and — on one that has been superseded — the mark and the way
          to the decision that stands.

          THE OPTIONS COME FROM THE FORK, read off this record's own links: a decision made from a
          proposal links to it with RESOLVES_PROPOSAL, and that proposal's `options` are what get drawn
          again. A decision written on its own has none, and the panel says so. */}
      {/* NOT BASED ON THE PERSON'S OWN WORDS: a decision in the person's name whose reference is not the person's own record
          . The server sends the mark; null and absent draw nothing. */}
      {detail.notOnThePersonsOwnWords === undefined || detail.notOnThePersonsOwnWords === null || deleted ? null : (
        <TheMarkOnADecision mark={detail.notOnThePersonsOwnWords} />
      )}
      {/* WORDS PREPARED FOR THE PERSON TO FILE, and the person's one press that files them as their own. */}
      {detail.filedAsThePersonsWords === undefined || deleted ? null : (
        <FileAsMyWords
          recordId={record.id}
          filed={detail.filedAsThePersonsWords}
          onFiled={reload}
        />
      )}

      {record.kind === 'decision' && !deleted ? (
        <DecisionGovernance
          recordId={record.id}
          data={record.data as Record<string, unknown>}
          supersededBy={detail.replacedBy ?? null}
          {...(detail.replacedDirectlyBy === undefined ? {} : { replacedDirectlyBy: detail.replacedDirectlyBy })}
          fork={theForkThisAnswers(detail.links as readonly GatedLink[], records)}
          onChanged={reload}
        />
      ) : null}

      {/* THE PERSON'S PRESS ON A WAITING ASK: admitting a waiting registration, giving a card, or
          letting an agent be answered a new key. The server sends it only to the person and only
          while nobody has answered, so this draws nothing on every other record. A waiting
          registration has no agent page yet, so this is the one page its press can be on. */}
      {/* WHERE A KEY ASK CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED, above the press that answers
          it, for every reader. A secretary's finding asked for it (finding 83, mend b2). Absent on every
          other record. */}
      {detail.theAsk === undefined || deleted ? null : (
        <TheAskItself shows={detail.theAsk} {...(detail.whereTheAskStands === undefined ? {} : { stands: detail.whereTheAskStands })} />
      )}
      {/* After the press it says what the press did, where the press was. */}
      {deleted ? null : <ThePressOnAnAsk key={record.id} ask={detail.waitingForThePersonsPress} onChanged={reload} />}
      {/* THE PRESS THAT WITHDRAWS A NEW-KEY GRANT NOBODY COLLECTED. Point 9 of a
          decision. The server sends it only to the person and only while
          the ask is granted and uncollected, so this draws nothing on every other record. */}
      {detail.grantToWithdraw === undefined || deleted ? null : (
        <TheGrantToWithdraw grant={detail.grantToWithdraw} onChanged={reload} />
      )}

      {/* THE DECISION AND THE NOTES AROUND IT, NAMED IN PLAIN WORDS. Criterion P76: whoever made the
          decision, and the person, may change the decision itself; any agent may change the notes,
          and the record's own history below says who and when. The panel only names the two parts —
          it does not build a second history, and it does not print a value twice. */}
      {record.kind === 'decision' && !deleted ? (
        <DecisionHalves data={record.data as Record<string, unknown>} summary={record.summary} />
      ) : null}

      {/* THE POINTS THIS DECISION WAS SPLIT INTO, read from the backlog items that name it. It is its own read
          because a point is a record of another kind: it can be filed after the decision, and the decision's own
          record cannot say which points exist. The read is keyed on `updatedAt` too, so filing a point and
          reloading the page draws it. */}
      {record.kind === 'decision' && !deleted ? <DecisionPoints record={record} /> : null}

      {/* WHAT THIS MAY NOT BE USED TO CLAIM. Above everything about the record's own content, and
          at rank 0 when something here stops it being called final, because a reader must not get
          as far as the result before being told what the result cannot prove.

          IT IS THE ONE READER'S ANSWER, carried on the record read since an earlier piece of work and drawn by
          nothing until now. On a record nothing restricts it draws one quiet line at the foot of
          the page instead — see components/Restrictions.tsx. */}
      {detail.restrictions.found.length === 0 ? null : (
        <>
          <RestrictionsStyle />
          <RestrictionsHere recordId={record.id} reading={detail.restrictions} onJudged={reload} />
        </>
      )}

      {/* WHO IS WORKING ON THIS RIGHT NOW, and whether two agents are working on it at once. High on
          the page, because deciding whether to change a record starts with knowing somebody else is
          already changing it. It draws nothing at all when nobody has claimed this record, so it is
          not permanent furniture on every page. Criterion M13, and proposal `pg10HWny6J0j`. */}
      <WhoIsWorkingHere recordId={record.id} />

      {/* WHAT AN AGENT DID HERE ON YOUR OWN WORDS, high on the page and not in the history fold.
          An act made on somebody's quoted words is the one write on this page they may never have
          seen happen, and the press that takes it back is theirs alone — so it sits where a person
          reading the record meets it, not behind a control they would have to know to open. It
          draws nothing at all on a record where nobody has acted on anybody's words. */}
      <ActsOnYourWords
        acts={detail.onThePersonsWords}
        onRevoke={async (act) => {
          await api.revokeAct(act.recordId, act.seq)
          reload()
        }}
      />

      {/* MOVING THIS RECORD TO ANOTHER PROJECT, while the record is being changed and not while it
          is being read. It is directly under the header because it is an act on the whole record,
          like the rename and the delete beside it, rather than a change to one of its fields.

          The panel says what a move does and what it does not do, and it measures the consequence
          before anything is written — see src/web/components/projects.tsx. */}
      {writable ? <MoveToProject record={record} projects={projects} /> : null}

      {/* Full width and directly under the header, not tucked into a column: how much of this
          record exists is a fact about the whole of it, and it is the first thing you need in
          order to decide whether to trust what follows.

          It renders NOTHING when the record is complete. An empty "all fields present" panel on
          every finished record would be a permanent piece of furniture, and permanent furniture
          stops being read — which would cost the marker its meaning on the records that have
          one. Deliberately quiet, and deliberately not where the alarms go: a deleted record and
          an unreadable `data` field both get a rank-0 panel, and this must not be mistaken for
          either. */}
      {/* ABOVE THE COMPLETENESS PANEL AND ABOVE THE STATE PANEL, because it governs how both of
          them should be read: how complete a fixture record is, and what its state word says, are
          facts about a piece of furniture rather than about this project's work.

          IN INSPECT ONLY. The chip on the header line carries the reading that changes what a
          reader does — fixture, unserved, unrecorded — and this panel carries the whole sentence
          for each of them. An authored record draws no panel (decision 8SkQQo1x69IV, revision 3): it
          is what almost every record is, and the sentence told the reader nothing they act on. */}
      {inspect ? <OriginSays record={record} /> : null}

      {/* THE BOX GOES WHERE THE ABSENCE IS REPORTED. This panel has always named the field and
          quoted the PATCH that supplies it; what it could not do was let the person reading it
          answer. The control is built from the same declaration that wrote the sentence, so it
          cannot offer a key, a word or a shape the write path would refuse — and a field whose
          shape needs more than one box gets no box and keeps its sentence. */}
      <Incomplete
        items={incompleteHere}
        what={kindWord(record.kind).text}
        control={(item) => {
          if (!writable) return null
          const field = fieldForPath(record.kind, item.path)
          if (field === null) return null
          const control = controlFor(record.kind, field)
          if (control.at === 'elsewhere' || control.at === 'no-control') {
            return <p className="fw-why">{control.because}</p>
          }
          return (
            <FieldWriter
              recordId={record.id}
              kind={record.kind}
              field={field}
              control={control}
              stored={record.data[field.key]}
              records={pickFrom(titles)}
              onSaved={reload}
            />
          )
        }}
      />

      {/* BEHIND THE SWITCH, WHOLE — AND THE ONE THING ON IT THAT IS NOT MACHINERY HAS MOVED OUT.
          What the stored word means, how Mole Office classifies it, and whether a pause was deliberate
          are all this product explaining its own reading of a record, which is what Inspect is for.
          A stored consequence is not that: it is a fact about the world, and on a `person` bearer it
          is the one value in Mole Office that means somebody could be physically hurt. It is drawn by
          `ConsequenceBanner` in the headline slot, at rank 0 when it is a safety one, on every kind
          that can store it — so nothing that fails the density test has been hidden, and the two
          places that were drawing it have become one. A kind with no state field and no pause or
          consequence to draw gets no panel here (decision 8SkQQo1x69IV, revision 3). */}
      {inspect ? <StateSays record={record} /> : null}

      {/* WHAT WAS ALREADY TRIED. It draws nothing when nothing has been recorded: an empty box on
          every problem would be permanent furniture, and permanent furniture stops being read. */}
      {/* ASKED OF THE KIND BEFORE THE SECTION IS ASKED FOR, exactly as *Whose move* beside is.
          `sectionsOf` throws on a key the kind does not declare — that is what stops a mistyped
          section hiding behind an empty answer — and `attempts` is a problem's field. Calling it on
          a note would have taken the whole page down, which is what it did on 31 August 2026 for
          the ten minutes between writing this line and measuring it. */}
      {kindDeclares(record.kind, ATTEMPTS_KEY) ? (
        <WhatWasTried record={record} declares={sectionsOf({ ...record, relations: relationsHere })(ATTEMPTS_KEY)} />
      ) : null}

      {/* A DATE MAKES A DEADLINE, AND THE KIND DOES NOT. `obligation` is where a due date usually
          sits, but a task with a date on it is owed by that date just as much, and `readDue` is the
          one reader that says whether anything readable was written — including a promise owed on a
          condition, which has no date, gets no window, and is exactly the case a person needs told
          apart from a deadline that is comfortably far off. Nothing here is drawn for a record that
          says nothing about when: the panel would then be four empty answers to an unasked question. */}
      {readDue(record.data).when === 'unstated' ? null : (
        <DeadlinePanel record={record} links={detail.links as GatedLink[]} />
      )}

      {/* THE CHECK ON THIS RUN, and where the run stands after it reported. Criteria C27 and C29.
          On a `session` and nowhere else: no other kind is a run, and the five fields it reads are
          the session kind's own.

          IT DRAWS NOTHING on a run nobody has finished and nobody has checked, on the same argument
          the panels above it are built on — a permanent empty box on every session in the corpus is
          furniture, and furniture stops being read. */}
      {record.kind === 'session' ? (
        <>
          {/* WHY THE RUN STOPPED, AND ITS WAIT ON A USAGE LIMIT, in words. Wave 13s round 50. First, because a stop is
              the person's to act on. Each draws nothing on a run that does not hold its field. */}
          <TheStopOfARun data={record.data} />
          <TheWaitOfARun data={record.data} />
          {/* ON A WORKER'S RUN, THE SUPERVISOR'S RUN THAT ASKED FOR IT, as the run's own page draws it. Wave 13j round loop-5. */}
          <TheRunThatAskedForIt askedForBy={detail.askedForBy} />
          <CheckPanelStyle />
          <TheCheckOnARun record={record} participants={participants} reportConfirmation={detail.reportConfirmation} onChanged={reload} />
          {/* AND THE WORKERS IT ASKED THE OFFICE TO START, in words and in both modes. Wave 13j round loop-4.
              Developer mode keeps the stored JSON in the stored-fields fold below as well. */}
          <TheWorkersOfARun workers={detail.workers} />
        </>
      ) : null}
      <FlowRunSteps record={record} participants={participants} />
      <FlowReasons record={record} titleById={titleById} editing={writable} sections={sectionsOf({ ...record, relations: relationsHere })} />

      {/* THE PACKAGE, ON THE TASK'S OWN PAGE. Criterion F16. `taskHasAPackage` is the one test for
          whether there is anything to draw: a task with no package draws nothing at all here, not
          an empty panel. A package for work inside the office is drawn as well as one for outside work. */}
      {record.kind === 'task' && taskHasAPackage(record.data) ? (
        <>
          <TaskPackagePanelStyle />
          <TaskPackagePanel record={record} />
          <PackageWorkers record={record} />
        </>
      ) : null}

      {/* AN EMERGENCY PUSH, WHOLE (wave 13u round 88). Its object fields are kept out of the body, and its follow-up is
          worked out on read, so the push is read on its own door and drawn row by row. */}
      {record.kind === 'emergency_push' ? <ThePushOnItsPage record={record} sections={sectionsOf({ ...record, relations: relationsHere })} /> : null}
      {/* A HOST JOB, WHOLE (wave 13q round 60): what it was asked with, who asked, its outputs and their digests. The
          first three are objects the body leaves out, and the digests are worked out on read. */}
      {record.kind === HOST_JOB_KIND ? <TheHostJobOnItsPage record={record} sections={sectionsOf({ ...record, relations: relationsHere })} /> : null}
      {/* WHO SUBMITTED A MERGE ENTRY (wave 13u round 97), which the queue page's row says too. The body leaves the object out. */}
      {record.kind === 'merge_entry' ? <TheSubmitterOnItsPage record={record} participants={participants} sections={sectionsOf({ ...record, relations: relationsHere })} /> : null}
      {/* A FEW-RED MERGE ENTRY THAT WAITS FOR A FIX ROUND (wave 13u round 90): until when, whom the office asked and what each answered. */}
      {record.kind === 'merge_entry' ? <TheFixRoundOnItsPage record={record} sections={sectionsOf({ ...record, relations: relationsHere })} /> : null}
      {record.kind === 'session' ? <TheSealInTheQueue record={record} sections={sectionsOf({ ...record, relations: relationsHere })} /> : null}

      {/* THE THREE TIERS. Everything below is worked out here, once, and handed over: `RecordDetail`
          fetches, sorts, counts and decides nothing of its own.

          `detail.links` is typed as the bare ResolvedLink in api.ts and the server sends three more
          fields with each row; GatedLink names them as optional so nothing downstream can mistake
          "the reply did not carry a gate" for "no gate is stored". */}
      <RecordDetail
        record={record}
        editable={writable}
        deleted={deleted}
        records={records}
        {...(waitingHere === null ? {} : { waitingHere })}
        detailLinks={detail.links as GatedLink[]}
        relations={relationsHere}
        evolutionLinks={links}
        log={log}
        participants={participants}
        titles={titles}
        titleById={titleById}
        unfilledByRecord={unfilledByRecord}
        body={bodySections(record)}
        onChanged={reload}
        // AND WHETHER PICKING THIS RUN UP AGAIN IS EXPENSIVE, from the read that is already here.
        // Criterion T6. Absent on every kind but a session, so the page draws nothing there.
        pickUpCost={detail.pickUpCost ?? null}
        filedFrom={detail.filedFrom ?? null}
        restsOnReplacedBy={detail.restsOnReplacedBy}
      />
      </div>

      {/* A REPORT IS READ AS A DOCUMENT, SO ITS FACTS STAND UNDER IT AND NOT BESIDE IT. The report
          body takes the whole of the page's width (problem 1, and the note on --reading-in-container
          in tokens.css), and a column beside it would take three eighths of that away. */}
      <div className="rp-side" data-column={record.kind === 'report' ? 'across' : 'end'}>
      {/* WHO MADE THIS AND WHOSE MOVE IT IS, in the ordinary view and not behind the switch.
          Whether an agent or a person filed a record, and who has to act next, are facts about the
          WORK — not about Mole Office's reading of it — and the second of the two was stored nowhere
          until this pass. Drawn only on the kinds that declare the field, so a note is never asked
          a question it has no place to answer. */}
      {/* ASKED OF THE KIND BEFORE THE SECTION IS ASKED FOR, exactly as *What was tried* is, in the first column.
          `sectionsOf` throws on a key the kind does not declare, and `whoseMove` is declared only
          where `whose_move` is — so the two questions are asked in one place, in this order. */}
      {kindDeclares(record.kind, 'whose_move') ? (
        <WhoseMoveSays
          record={record}
          context={openLoops}
          // WHERE THE QUESTION IS, off the same read the record came from. Criterion P55. Undefined
          // where the reply carried none, which is every record that asks the person nothing.
          question={detail.whereTheQuestionIs}
          declares={sectionsOf({ ...record, relations: relationsHere })(WHOSE_MOVE_KEY)}
          participants={participants}
        />
      ) : null}

      {/* WHAT IS STILL OPEN AROUND THIS RECORD, from the reader an agent asks. It sits under the
          record's own content because it is about the work AROUND this record rather than about
          this record — and it is on every kind, because standing anywhere is how a fresh agent
          arrives. It draws nothing when nothing is open, and a reading that failed is drawn. */}
      <StillOpenHere record={record} relations={relationsHere} reading={openLoops} />

      {/* AND WHAT WAS ALREADY SETTLED HERE, from the same reading. It draws nothing on a kind that
          declares no such section, which today is every kind but the module. */}
      <DecidedHere record={record} relations={relationsHere} reading={openLoops} />
      </div>
      </SideBySide>

      {/* AND WHEN NOTHING RESTRICTS IT, ONE QUIET LINE AT THE FOOT. `found: []` is a real answer and
          it is worth one sentence, beside the fold saying what the walk could not do — because
          *nothing restricts this* and *nobody could look* must never read the same. A panel here on
          every unrestricted record in the corpus would be furniture, and furniture stops being
          read.

          IN DEVELOPER MODE ONLY (wave 13k round 34). "No placeholder or fallback was found that limits
          this record" and the fold of what the walk could not look at are true and say nothing a person
          can act on (the review in 3Zgf2lTGanJw). A restriction that IS found is still drawn in normal
          mode, by the panel higher up the page, so a normal page never claims a record is unrestricted:
          it says nothing, and developer mode says the whole answer. */}
      {detail.restrictions.found.length === 0 && inspect ? (
        <>
          <RestrictionsStyle />
          <RestrictionsHere recordId={record.id} reading={detail.restrictions} onJudged={reload} />
        </>
      ) : null}

      {/* ---------------------------------------------------------------- behind the switch */}
      {/* Two panels that answer questions about Mole Office rather than about this record: what it
          holds as the database holds it, and what its kind declares. In normal mode the same
          content is drawn as the record's own reading matter a few inches above, in its own words
          and under English headings — so leaving these here made every page print its content
          twice, once readable and once as keys. On a proposal it was three times.

          Neither is a copy of the other and neither is a substitute: the first is every stored
          field including the ones no panel reads, the second is every field the kind declares
          including the ones this record does not have. Both are one switch away, and each is a
          closed fold behind it. */}
      {inspect ? (
        <>
          {/* THE STORED FIELDS ARE A CLOSED FOLD, EVEN HERE. Drawn open they
              were the tallest thing on a developer page after the declared fields, and the owner
              found no use in them. Closed they take one line, and one press opens them. The key is
              the record, so moving to another record closes the fold again. */}
          <details className="rd-fold" data-testid="stored-fields" key={record.id}>
            <summary>{t('g2b.stored.fold', { n: Object.keys(record.data).length })}</summary>
            <Panel declares={{ surface: null }}
              title={t('g2b.stored.title')}
              kind={kindWord(record.kind).text}
              actions={<span className="rp-count num">{Object.keys(record.data).length}</span>}
            >
              <FieldList data={record.data} />
            </Panel>
          </details>
          <DeclaredFields record={record} editable={writable} records={pickFrom(titles)} onChanged={reload} />
        </>
      ) : null}
    </article>
    </WritingThisRecord>
  )
}

// ============================================================================ a decision's points

/**
 * THE POINTS THIS DECISION WAS SPLIT INTO: the live backlog items whose `fromDecision` is this decision, in the
 * line's order. The decision's own record cannot say which points exist, because a point is a record of another
 * kind filed with its own write, so this is a read of its own. It is drawn only once that read is ready, and a
 * failed read says so rather than drawing nothing.
 */
function DecisionPoints({ record }: { record: PanelRecord }) {
  const [reading] = useProjectAsync(
    () =>
      moleOfficeRequest<{ decisionId: string; points: PanelRecord[]; noneFiled: string | null }>(
        `/api/backlog/points?decision=${encodeURIComponent(record.id)}`,
      ),
    [record.id, record.updatedAt],
  )
  if (reading.status === 'loading') return null
  return (
    <Panel declares={{ surface: null }} title={t('record.section.points')} rank={1}>
      {reading.status === 'error' ? (
        <ErrorNote message={reading.message} fault={reading.fault} />
      ) : reading.value.points.length === 0 ? (
        <Absence tier="ordinary" title={t('record.points.none')} />
      ) : (
        reading.value.points.map((point) => {
          const stored = typeof point.data['state'] === 'string' ? point.data['state'] : null
          const why = typeof point.data['why'] === 'string' ? point.data['why'] : null
          return (
            <Row
              key={point.id}
              sev={
                <span title={t('record.points.state')}>
                  <StoredState
                    state={stored}
                    progress={stored === null ? null : progressOf(stored)}
                    kind={point.kind}
                  />
                </span>
              }
              title={<RouteLink to={recordPath(point.id)}>{point.title}</RouteLink>}
              meta={why === null ? null : `${t('record.points.why')}: ${why}`}
            />
          )
        })
      )}
    </Panel>
  )
}

// ============================================================================ loading

export interface RecordPageData {
  detail: RecordReply
  /**
   * This record's change rows AND the sessions they name, resolved by the server.
   *
   * The whole reply, not just `.changes`: the `sessions` block is the only thing that can turn
   * `NS6wp_rmduzo` on a row into the name of the run that wrote it, and dropping it here would put
   * the identifier back on screen exactly as it was before this component existed.
   */
  log: ChangesReply
  /**
   * Every title in the workspace, for the pickers, each with the note that tells it apart from the
   * other records of the same name. See `titleOptions` in shared/blocks.ts: titles may repeat, and
   * since 6 September 2026 a block's own name is all its title holds, so the thing that tells two
   * steps called "Calibrate" apart is which pipeline each is in.
   *
   * NULL WHILE THE RECORD IS BEING READ, because nothing on the page can pick a record then. Every
   * picker — the link form and the box that names a record by its title — is drawn only while the
   * record is being changed, and the page counts as being changed only once this list has been read
   * (see `writable` in `RecordPage`). It is read with the rest of the page when the address says
   * edit, so the pickers and the record are one moment.
   */
  titles: TitleOption[] | null
  /**
   * How many fields each record this page draws still needs, by id.
   *
   * Built from `records` below, so a link can carry the incomplete marker without a second request.
   * Every live record at the other end of one of this record's links is in `records`; a deleted one
   * is not, and so is not in this map, and LinksPanel says what that absence means.
   */
  unfilledByRecord: ReadonlyMap<string, number>
  /**
   * Record id -> title, for the change log's link rows and a field that holds record ids.
   *
   * A `link` row stores the TARGET RECORD'S ID in its old value, so without this the history
   * prints an identifier where a name belongs — the same defect ChangeLog fixed for sessions, one
   * line lower on the same panel. Built from `records` below, which holds every live record those
   * rows and fields name, so it costs no request. A record NOT in it is a deleted one, and the row
   * says that rather than a title.
   */
  titleById: ReadonlyMap<string, string>
  /**
   * The live records this page draws, kept whole rather than reduced to titles and counts.
   *
   * NOT EVERY RECORD IN THE PROJECT. `GET /api/records/:id/around` answers the ones this page looks
   * up — linked records, records named in the data or the change log, the pipelines that list it,
   * and on a module the directions its evolution drawing walks — in the order of the whole listing.
   * `recordsAround` in src/server/lib/records.ts names each rule and the part of the page it serves.
   * The page used to read the whole listing for this: 38 MB on the owner's office, to draw one record.
   */
  records: PanelRecord[]
  /**
   * The links this page's drawings follow, from the same reply as `records`.
   *
   * NOT `detail.links`, which is this record's own links and nothing else. The evolution drawing
   * follows direction-to-direction branches — a chain that leaves this record after one hop — so
   * the links it needs are ones this record is not an end of. The containment reader reads the
   * `part_of` links out of this record from here too.
   */
  links: readonly EvolutionLink[]
  /**
   * Every project this installation holds.
   *
   * Loaded with the rest so the project named in the header and the projects offered as a
   * destination are one reading rather than two. Without it the header could only print the
   * project's id, which is the word the header sends rather than the word a person chose.
   */
  projects: readonly WorkspaceReading[]
  /**
   * Everybody the registries hold, loaded with the record.
   *
   * Two drawings need it and neither can fetch on its own without an extra moment of the same fact:
   * the header's citizen link, which is addressed by the registry id rather than the stored handle
   * (criterion I4), and the change log's proved-holder line, which names an agent rather than
   * printing its id (criterion I4). One read serves both, and the pages that draw this record —
   * `RecordPage` and `ProblemPage` — hand it on.
   */
  participants: ParticipantsReply
}

/**
 * WHERE THIS RECORD SITS: All records / Decisions / the record's own title.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH CRUMBS ARE NOW PLACES YOU CAN GO, AND NEITHER WAS BEFORE
 * ---------------------------------------------------------------------------------------
 * It read *all records / decision*. The first crumb went to `#/`, which is Needs you — not a list
 * of records at all — and said a third name for the Everything page. The second crumb printed the
 * record's KIND, which is not a page, not a list, and not where the reader came from: nothing
 * happens when you press it, because it was never a link.
 *
 * Now the first crumb is All records and goes to `#/records`, and the second is the record's family
 * and goes to that family's page, so a decision has a way back to the other decisions. The words
 * are the family's own label out of `KIND_FAMILIES`, so the rail row, the facet button, the family
 * page's heading and this crumb are one string.
 *
 * THE LAST CRUMB IS THE RECORD'S TITLE, NOT A LINK. A breadcrumb ends where you are.
 *
 * WHEN NO FAMILY COVERS THE KIND there is no middle crumb to draw, because there is no page to send
 * anybody to. It says so in the same words `FamilyTag` uses rather than guessing a family or
 * quietly dropping to two crumbs with no explanation.
 *
 * A KIND READ ON A PAGE OF ITS OWN IS NOT THAT CASE. `message` has no family since criterion E1,
 * and it is not a gap: its middle crumb is a link to `#/messages`, named from `SURFACES` so it and
 * the rail row are one string. Without this branch a message's page said "no family covers
 * message", which is the false warning the set exists to stop.
 *
 * A ROLE CARD IS THE SECOND SUCH KIND, since 1 October 2026. By item 3 of a decision, a role card is a kind of its own,
 * not a report. Its middle crumb is a link to `#/roles`, named with the rail row's own word.
 *
 * A ROLE REQUEST IS THE THIRD, since 4 November 2026. An agent asking to come in, or for a card or a new key, is read on
 * the Embassy, where the press on it is, and the rail already marked the Embassy on its page while this crumb said
 * Reports and notes. Its middle crumb is a link to `#/embassy`, named with the rail row's own word.
 *
 * A QUICK NOTE IS THE FOURTH, since 15 November 2026. It is written and drawn in on the note page, and gathered on My
 * notes. Its middle crumb is the words My notes, not a link, until that page has an address.
 */
export function Crumbs({ record, participants }: { record: { kind: string; title: string; data?: unknown }; participants?: ParticipantsReply }) {
  const family = familyOf(record.kind)
  // WHICH PAGE A KIND WITH NO FAMILY IS READ ON, from the one table that says so in src/shared/work.ts.
  const ownPage = thePageAKindIsReadOn(record.kind)
  // A FLOW RUN'S PLACE IS THE RUN IT RECORDS (its required `run` field), not the family list it is filed in:
  // wave 13p's message 37_narX7Zh3s found its crumb said "Reports and notes".
  const run = record.kind === FLOW_RUN_KIND ? (record.data as { run?: unknown } | undefined)?.run : undefined
  // A CARD'S WORDS ARE OPENED FROM THEIR CARD ON ROLE CARDS, so the crumb leads back there (wave 13y round 135). The
  // record stays filed under Reports and notes; only the way back changes.
  const fromRoleCards = record.kind === 'role_card_words'
  return (
    <nav className="rp-crumbs" aria-label={t('record.crumbs')}>
      <RouteLink to={pathFor('records')}>{t('nav.records')}</RouteLink>
      <span aria-hidden="true">/</span>
      {typeof run === 'string' && run !== '' ? (
        <RouteLink to={recordPath(run)}>{t('record.crumbs.itsRun')}</RouteLink>
      ) : fromRoleCards ? (
        <RouteLink to={pathFor('roles')}>{t('nav.roles')}</RouteLink>
      ) : family !== null ? (
        <RouteLink to={familyPath(family)}>{familyWord(family).text}</RouteLink>
      ) : ownPage === 'messages' ? (
        <RouteLink to={pathFor('messages')}>{t('record.messages')}</RouteLink>
      ) : ownPage === 'roles' ? (
        <RouteLink to={pathFor('roles')}>{t('nav.roles')}</RouteLink>
      ) : ownPage === 'embassy' ? (
        <RouteLink to={pathFor('embassy')}>{t('nav.embassy')}</RouteLink>
      ) : ownPage === 'quickNote' ? (
        <span>{t('quickNote.myNotes')}</span>
      ) : (
        <span className="rp-crumb-nofamily">{t('record.noFamily')}</span>
      )}
      <span aria-hidden="true">/</span>
      <span className="rp-crumb-here">{titleToDraw(record, participants)}</span>
    </nav>
  )
}

/**
 * THE TITLE A RECORD IS DRAWN UNDER. A flow run's stored title is the office's one English title for every run
 * (FLOW_RUN_TITLE in src/shared/flow-run.ts), so the page draws it in its own language. A waiting self-registration's
 * title is autogenerated as "<handle> registers itself"; the page draws the office name the session gave it, and the
 * record keeps the title it stored. A new-key ask's title is autogenerated as "<handle> asks for a new key", and a card
 * ask's as "<handle> asks for the <card> card"; the page draws the office name for both, and each record keeps its
 * stored title. Every other title, including an authored or edited title, and a flow run whose
 * title somebody changed, is the record's own words and is drawn as stored.
 */
export function titleToDraw(record: { kind: string; title: string; data?: unknown }, participants?: ParticipantsReply): string {
  if (record.kind === FLOW_RUN_KIND && record.title === FLOW_RUN_TITLE) return t('record.flowRunTitle')
  const selfRegistration = theSelfRegistrationOn(record)
  // ONLY THE EXACT AUTOGENERATED TITLE IS REDRAWN. A title somebody edited, or an authored title on a record that
  // happens to carry the marker, is theirs and is drawn as stored.
  if (selfRegistration !== null && record.title === `${selfRegistration.handle} registers itself`) {
    return `${theNameASelfRegistrationIsReadBy(selfRegistration)} registers itself`
  }
  const newKey = theNewKeyAskOn(record)
  if (newKey !== null) {
    const agent = theAgentOnTheWire(participants, newKey.agent)
    if (agent !== null && record.title === `${agent.handle} asks for a new key`) {
      return `${theNameASelfRegistrationIsReadBy(agent)} asks for a new key`
    }
  }
  const cardAsk = theCardAskOn(record)
  if (cardAsk !== null) {
    const agent = theAgentOnTheWire(participants, cardAsk.asker)
    if (agent !== null && (record.title === `${agent.handle} asks for the ${cardAsk.asking} card` || record.title === `${cardAsk.asker} asks for the ${cardAsk.asking} card`)) {
      return `${theNameASelfRegistrationIsReadBy(agent)} asks for the ${cardAsk.asking} card`
    }
  }
  return record.title
}

/**
 * The agent a role request stores by id, with the name and handle the title is redrawn from.
 * THE EXACT ID WINS, and a handle names an agent only when exactly one row bears it: the one reader every other
 * page uses, so two registrations that collide cannot draw the wrong office name.
 */
function theAgentOnTheWire(participants: ParticipantsReply | undefined, reference: string): { name: string; handle: string } | null {
  const agent = theParticipantAStoredIdNames(participants?.agents ?? [], reference)
  return agent === undefined ? null : { name: agent.name, handle: agent.handle }
}

/** The new-key ask a stored record carries: the agent's registry id. */
function theNewKeyAskOn(record: { data?: unknown }): { agent: string } | null {
  if (typeof record.data !== 'object' || record.data === null) return null
  const extra = (record.data as Record<string, unknown>)['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const said = (extra as Record<string, unknown>)['newKey']
  if (typeof said !== 'object' || said === null) return null
  const agent = (said as Record<string, unknown>)['agent']
  return typeof agent === 'string' ? { agent } : null
}

/** The card ask a stored record carries: the asker's stored id and the card it asks for. */
function theCardAskOn(record: { data?: unknown }): { asker: string; asking: string } | null {
  if (typeof record.data !== 'object' || record.data === null) return null
  const data = record.data as Record<string, unknown>
  const asker = data['asker'] as { id?: unknown } | undefined
  const asking = data['asking']
  return typeof asker?.id === 'string' && typeof asking === 'string' && asking !== ''
    ? { asker: asker.id, asking }
    : null
}

/** The self-registration a stored record carries, or null because it carries none. */
function theSelfRegistrationOn(record: { data?: unknown }): { name: string; handle: string } | null {
  if (typeof record.data !== 'object' || record.data === null) return null
  const extra = (record.data as Record<string, unknown>)['extra']
  if (typeof extra !== 'object' || extra === null) return null
  const said = (extra as Record<string, unknown>)['selfRegistration']
  if (typeof said !== 'object' || said === null) return null
  const { name, handle } = said as Record<string, unknown>
  return typeof name === 'string' && typeof handle === 'string' ? { name, handle } : null
}

/**
 * The page's requests, wrapped so the component above reads as a page rather than as three fetches.
 *
 * They go out together and are awaited together, so the record, the suggestions and the history
 * are never out of step — and so a failure to load any one of them is one visible error rather
 * than a half-populated page. The change log is asked for by record id through the wrapper that
 * carries the `sessions` block; see the note at the top of this file for why not `detail.changes`.
 */
/**
 * The request group a record page is made of, EXPORTED so a page that draws a record of one kind —
 * `#/problem/<id>` — reads it through this one function rather than asking the same doors again.
 * `RecordDetail`, `WhatWasTried` and `WhoseMoveSays` are handed what this returns; a second fetch of
 * one record would be two moments of the same fact, free to disagree while the second was in flight.
 *
 * `editing` IS WHETHER THE ADDRESS SAYS EDIT. Only then are the pickers' titles read, because only
 * then can anything on the page pick a record. Changing it reads the page again, so the pickers and
 * the record they are drawn beside are one moment.
 */
export function useAsyncRecord(id: string, editing: boolean): [AsyncState<RecordPageData>, () => void] {
  const [held] = useState(() => peekPreparedRecord(id, editing))
  const used = useRef(false)
  const ready = used.current || held === undefined ? undefined : peekPreparedRecord(id, editing, held)
  return useProjectAsync(() => {
    if (ready !== undefined && !used.current) {
      used.current = true
      consumePreparedRecord(ready)
      return Promise.resolve(ready.value)
    }
    used.current = true
    return loadRecordPage(id, editing)
  }, [id, editing], { keep: recordPageKeepName(id, editing), follows: editing ? undefined : { records: [id] }, ...(ready === undefined ? {} : { startFrom: { value: ready.value } }) })
}

/**
 * THE PAGE'S REQUESTS, AND WHAT IS WORKED OUT FROM THEM. Exported so a test can see which doors a
 * record page asks.
 *
 * NEVER THE WHOLE RECORD LISTING AND NEVER THE WHOLE LINK TABLE. The other records and links the
 * page draws come from `GET /api/records/:id/around`; the pickers' titles from
 * `GET /api/records/title-options`, and only while editing.
 */
export async function loadRecordPage(id: string, editing: boolean, workspaceId?: string): Promise<RecordPageData> {
  const inProject = workspaceId === undefined ? undefined : { headers: { [WORKSPACE_HEADER]: workspaceId } }
  const [detail, around, log, projects, participants, titles] = await Promise.all([
    api.getRecord(id, workspaceId === undefined ? undefined : { workspaceId }),
    inProject === undefined ? api.recordAround(id) : moleOfficeRequest<Awaited<ReturnType<typeof api.recordAround>>>(`/api/records/${encodeURIComponent(id)}/around`, inProject),
    inProject === undefined ? api.listChanges({ recordId: id }) : moleOfficeRequest<ChangesReply>(`/api/changes?${new URLSearchParams({recordId:id})}`, inProject),
    api.listWorkspaces(),
    // EVERY PARTICIPANT, SO AN ID CAN BE DRAWN AS A NAME. Criterion I4: the change log names a
    // key-proved holder by name, and the header's citizen link carries the registry id for an
    // agent record whose stored handle is not that id. Read every roster page with the rest; a
    // failed read fails the page rather than quietly printing ids.
    api.participants(inProject),
    editing ? api.recordTitleOptions() : Promise.resolve(null),
  ])
  return {
    detail,
    log,
    records: around.records,
    links: around.links,
    projects: projects.workspaces,
    participants,
    titles,
    ...drawnFrom(around.records),
  }
}

/**
 * The two lookups the page draws from its records: how many fields each still needs, and its title.
 *
 * Computed in the browser from the shared specs — the same function, on the same data, that the
 * server would run. Nothing about completeness travels over the wire, so there is no stored answer
 * anywhere that can drift out of step with the specs.
 */
export function drawnFrom(records: readonly PanelRecord[]): {
  unfilledByRecord: ReadonlyMap<string, number>
  titleById: ReadonlyMap<string, string>
} {
  return {
    unfilledByRecord: new Map(records.map((r) => [r.id, recordIncompleteness(r.kind, r.data, r.summary).length])),
    titleById: new Map(records.map((r) => [r.id, r.title])),
  }
}

/**
 * THE RECORDS A PICKER OFFERS, as the one box that names a record by its title reads them: an id and
 * a title each, from the title options, in their order.
 *
 * AN EMPTY LIST WHERE THE TITLES WERE NOT READ, which is only while the record is being read. No
 * picker is drawn then: every box that uses this list is behind `editable`, and the page is
 * editable only once the titles are in hand.
 */
export function pickFrom(titles: readonly TitleOption[] | null): NamedRecord[] {
  return titles === null ? [] : titles.map((one) => ({ id: one.id, title: one.value }))
}

// ============================================================================ styles

/**
 * This page's own rules: the header block, the breadcrumb, and the two small notes.
 *
 * styles.css belongs to another agent this phase, so the page-specific layout lives with the
 * page. React 19 hoists `<style href>` into <head> and de-duplicates by href. Every value is a
 * token — no colour and no type size is written out here, so a preset swap re-skins all of it.
 *
 * EXPORTED because `#/problem/<id>` draws this page's own components — `Crumbs`, `RecordDetail`,
 * `WhatWasTried`, `WhoseMoveSays` — and a page that mounted them without this stylesheet would draw
 * the breadcrumb and the record body with none of their layout. React de-duplicates by href, so two
 * pages naming one stylesheet cost nothing.
 */
export const RECORD_CSS = `
/* THE ARTICLE IS A BLOCK, NOT A FLEX COLUMN. From 1024 px the checklists press keeps a room at the page's top
   right as a float. The browser fits a flex box beside a float for the box's whole height, so a flex article
   stopped short of the column down to its last line. As a block, only its parts beside the room are fitted
   beside it. Each part after the first keeps the gap the column gave as a top margin. */
.rp { min-width: 0; }
.rp > * + * { margin-top: var(--gut); }
/* THE RECORD, AND THE FACTS AROUND IT BESIDE IT ON A WIDE SCREEN: the product's one width rule,
   components/SideBySide.tsx, five to three. Each column is a stack with the page's own gap. */
.rp-sides { gap: var(--gut); }
.rp-main, .rp-side { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
/* A PROBLEM'S STATE AND THE PERSON'S CLOSE PRESS, one row that wraps, as the problem's own page draws it. */
.rp-standing { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); min-width: 0; }

/* IT WRAPS, AND THE LAST CRUMB IS A RECORD TITLE. The third crumb used to be the record's kind —
   one short word — and now it is whatever somebody called the record, which on this corpus runs to
   a whole sentence. Without the wrap and the min-width the row pushed the page sideways at 390,
   which is a measured gate. */
.rp-crumbs {
  display: flex; align-items: center; gap: var(--pad);
  flex-wrap: wrap;
  min-width: 0;
  font-size: var(--fs-1);
  color: var(--text-3);
  min-height: var(--row-h);
}
.rp-crumbs a {
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: .16em;
}
.rp-crumbs a:hover { color: var(--text); }
.rp-crumb-here { font-weight: 600; color: var(--text-2); min-width: 0; overflow-wrap: anywhere; }
/* A kind no family covers. Drawn as the finding it is, in the same words FamilyTag uses, and not
   as a link, because there is no page to send anybody to. */
.rp-crumb-nofamily { font-style: italic; min-width: 0; overflow-wrap: anywhere; }

.rp-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--gut) var(--pad-lg);
  flex-wrap: wrap;
  padding: var(--pad-lg);
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-1);
  min-width: 0;
}
.rp-ident { min-width: 0; flex: 1 1 26rem; display: flex; flex-direction: column; gap: 6px; }
.rp-kindline { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.rp-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.rp-lede { margin: 0; }
.rp-lede-tag {
  display: block;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 2px;
}
html[data-theme="light"] .rp-lede-tag[data-title-is="its-label"] { text-transform: uppercase; letter-spacing: .06em; }
.rp-lede-none { font-size: var(--fs-2); color: var(--text-3); font-style: italic; }
/* THE READING MATTER'S OWN NAME, drawn exactly as .rp-lede-tag above draws the summary's, because
   they are the same thing on one page: a record page saying which of its declared sections this
   is. Its words come from SectionSpec.title and are never typed here. */
.rd-report-tag {
  display: block;
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 2px;
}
.rp-meta {
  display: flex; align-items: center; gap: var(--pad) var(--pad-lg);
  flex-wrap: wrap;
  font-size: var(--fs-1);
  color: var(--text-3);
  margin-top: 2px;
}
/* THE rp-id RULE THAT USED TO BE HERE IS GONE, and the class is not: it is declared once, in
   src/web/components/RecordId.tsx, beside the rule for the ids that component draws. A page with
   two declarations of what an id looks like is a page where one of them can be changed and the
   other left behind with nothing failing, which is the defect this repository keeps producing. The
   three elements on this page still spelling the class by hand are named in the note there. */
/* WHICH PROJECT, first on the meta line and a shade darker than the stamps beside it. No hue: a
   project is what kind of thing this record belongs to, not something that changes what you do
   next, and the colour rule in design/UX-CONTRACT.md spends hue on neither. */
.rp-project { color: var(--text-2); }
.rp-actions { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; flex: 0 1 auto; min-width: 0; }

.rp-edit { display: flex; flex-direction: column; gap: var(--pad); }
.rp-edit-act { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; margin-top: var(--pad); }
/* What is on the screen is not what is stored yet. Quiet, and never a fault: nothing has gone
   wrong, the person simply has not pressed Save. */
.rp-unsaved { font-size: var(--fs-1); color: var(--text-3); }
/* THE ONE BUTTON AT THE TOP RIGHT. An anchor, because reading and editing is an address; drawn as
   a button, because that is what it is to the reader. --border-strong: a control boundary is held
   to 3:1 and the decorative hairline does not meet it. */
.rp-mode { font-size: var(--fs-2); font-weight: 600; color: var(--text); text-decoration: none; padding: 4px var(--pad-lg); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); white-space: nowrap; }
.rp-mode:hover { background: var(--hover); }
.rp-mode-done { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
/* The way into a pipeline's drawing sits beside Edit and is drawn as the quieter of the two: it
   opens another reading of the same record, where Edit changes it. */
.rp-mode-drawing { font-weight: 500; }
.rp-mode-done:hover { background: var(--accent); filter: brightness(1.08); }

/* WHERE THE READING MEASURE APPLIES ON THIS PAGE.
 *
 * To the record's own reading matter and nothing else: the lede is .prose, and the module's
 * context, abstract and stored prose fields are .prose too, so styles.css caps all of them at one
 * column and this file does not set it again anywhere.
 *
 * Every rule below is the page talking about the record -- a note, a fact sentence, the deleted
 * banner, the server's reply -- and each already sits inside a panel that constrains it. Capping
 * those at the measure as well drew a 512px ribbon inside a 1146px panel, which is the look the
 * "hard-wrapped prose" complaint was about; the stored text was never the problem. */
.rp-deleted-note { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); }
.rp-recover { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.rp-way-out { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: .16em; }
.rp-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); }
.rp-note {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.rp-note code { font-family: var(--font-mono); font-size: 0.94em; }

/* ---------------------------------------------------------------- what the state says */
/* One line per fact: the mark, then the sentence that belongs to it. Baseline-aligned and
   wrapping, so a long consequence sentence sits under its own mark rather than pushing it. */
.rp-facts { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
/* WHERE THE QUESTION ON THIS RECORD IS. Under the facts and quieter than one,
   because it is the server saying what happens next rather than a value the record holds. */
.rp-question-is {
  margin: var(--pad) 0 0; max-width: var(--measure-in-box);
  color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui);
}
.rp-fact {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  min-width: 0;
}
/* Where there is room, the marks share one width so the sentences start on one left edge. A
   ragged left edge down three facts reads as three unrelated notes. Below that width the mark and
   its sentence stack, and a reserved column would only push the sentence into a gutter. */
.rp-fact-mark { flex: none; }
@container panel (min-width: 34rem) {
  .rp-fact-mark { min-width: 14rem; }
}
.rp-fact-said {
  flex: 1 1 22rem;
  min-width: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
.rp-fact-until { color: var(--text-2); }
.rp-fact-floor {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}

/* ------------------------------------------------- what was tried, and what is still open */
/* An attempt is read in one order: what must not be repeated, then what was done, then the three
   named facts about it. The dead-end line is first because it is the only line that changes what
   the reader does next, and it is marked as well as worded so it does not need to be read to be
   seen. */
.rp-attempts { margin: 0; padding: 0 0 0 var(--gut); display: flex; flex-direction: column; gap: var(--pad); }
.rp-attempt { min-width: 0; }
.rp-attempt-dead {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  margin: 0 0 calc(var(--gut) / 2);
}
.rp-attempt-dead-said {
  flex: 1 1 20rem; min-width: 0;
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere;
}
.rp-attempt-tried {
  margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere;
}
.rp-attempt-facts {
  display: grid; grid-template-columns: auto 1fr; gap: calc(var(--gut) / 2) var(--gut);
  margin: calc(var(--gut) / 2) 0 0; min-width: 0;
}
.rp-attempt-facts dt { font-size: var(--fs-1); color: var(--text-3); white-space: nowrap; }
.rp-attempt-facts dd {
  margin: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); min-width: 0;
  overflow-wrap: anywhere;
}
/* Below the width where two columns fit, the name sits above what it names rather than in a
   gutter of its own. */
@container panel (max-width: 26rem) {
  .rp-attempt-facts { grid-template-columns: 1fr; }
}

.rp-open-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); }
.rp-open { display: flex; flex-direction: column; gap: calc(var(--gut) / 2); min-width: 0; }
.rp-open-head { display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.rp-open-says { flex: 1 1 18rem; min-width: 0; font-size: var(--fs-2); line-height: var(--lh-body); overflow-wrap: anywhere; }
.rp-open-facts { display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.rp-open-state { font-size: var(--fs-1); color: var(--text-3); }
.rp-open-hops { font-size: var(--fs-1); color: var(--text-3); }
.rp-open-dead { display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.rp-open-dead-said {
  flex: 1 1 18rem; min-width: 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2);
  overflow-wrap: anywhere;
}
.rp-open-none { margin: 0; }
.rp-open-rest { margin: var(--gut) 0 0; }
.rp-open-rest > summary { font-size: var(--fs-1); color: var(--text-2); cursor: pointer; }
.rp-open-rest > .rp-open-list { margin-top: var(--pad); }
.rp-open-attach {
  margin: var(--gut) 0 0; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2);
  overflow-wrap: anywhere;
}
.rp-open-cut { margin: calc(var(--gut) / 2) 0 0; display: flex; flex-direction: column; gap: calc(var(--gut) / 3); }
.rp-open-cut-one { font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3); overflow-wrap: anywhere; }

/* ---------------------------------------------------------------- an obligation */
/* A definition list, because that is what it is: three named facts about one promise. The grid
   collapses to one column on a phone rather than squeezing the value into 90px. */
.rp-owed {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px var(--gut);
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
}
@container panel (min-width: 30rem) {
  .rp-owed { grid-template-columns: 9rem minmax(0, 1fr); }
}
.rp-owed dt {
  font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-3);
}
.rp-owed dd { margin: 0 0 var(--pad); color: var(--text); overflow-wrap: anywhere; }
.rp-owed-raw { color: var(--text-3); font-family: var(--font-mono); font-size: var(--fs-1); }
.rp-none { color: var(--text-3); font-style: italic; }

.rp-discharge { display: flex; flex-direction: column; gap: var(--pad); max-width: 44rem; min-width: 0; }
.rp-said {
  margin: var(--gut) 0 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
}

/* ---------------------------------------------------------------- the three tiers */
/* EVERY VALUE HERE IS A TOKEN THAT EXISTS IN tokens.css. An invented custom property is dropped at
   computed-value time with no warning, and a panel styled with one renders as run-together words. */
.rd { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

/* TIER 1. The one figure, sentence or question that answers what this kind of record is for. */
.rd-lead {
  margin: 0 0 var(--pad);
  font-size: var(--fs-4);
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
}
.rd-q {
  margin: 0 0 var(--pad);
  font-size: var(--fs-5);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
  overflow-wrap: anywhere;
}
.rd-sub {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.rd-none { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-3); font-style: italic; }

/* A REPORT, DRAWN AS A DOCUMENT.

   There is almost nothing here, and that is the point: the writing's own width, sizes and rhythm
   come from SummaryBlocks, which owns them for every surface that draws blocks. This adds the air
   between the line saying who the report is for and the first sentence of it, and nothing else.

   The line itself is three sentences on one wrapping row. Each one is a whole sentence, so the row
   can break anywhere without a fragment being left behind at the end of a line, and there is no
   separator character to dangle there — the same rule the record header line follows. */
.rd-report { display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; }
.rd-byline {
  display: flex; flex-wrap: wrap; gap: 4px var(--pad-lg);
  margin: 0; padding-bottom: var(--pad);
  border-bottom: var(--border-w) solid var(--border);
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2);
  min-width: 0; overflow-wrap: anywhere;
}
/* NOBODY HAVING SAID IS NOT DRAWN ON THIS LINE, in either mode, so it has no class of its own.
   The press at the end of the line closes the gap. */
/* A word stored where a report's two are declared, that is neither of them. It is a fault in the
   record and is drawn as one, with the word itself in the sentence beside the colour. */
.rd-byline-odd { color: var(--st-failed); }

/* A claim's numbers. Every stored number is drawn, at one weight: nothing in the record says which
   of them is "the" measurement, and picking one would be this page inventing an emphasis. */
.rd-figs { display: flex; flex-wrap: wrap; gap: var(--gut) var(--pad-lg); margin: 0 0 var(--pad); min-width: 0; }
.rd-fig { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rd-fig-n { font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.rd-fig-k { font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }

/* A fact that changes what the reader does next, with the act that answers it. One hue, one row. */
.rd-banner {
  display: flex; align-items: center; justify-content: space-between; gap: var(--pad) var(--gut);
  flex-wrap: wrap;
  margin: var(--gut) 0 0;
  padding: var(--pad) var(--pad-lg);
  border-left: 3px solid var(--st-blocked);
  border-radius: var(--radius-sm);
  background: var(--st-blocked-row);
  min-width: 0;
}
.rd-banner[data-tone="failed"] { border-left-color: var(--st-failed); background: var(--st-failed-row); }
.rd-banner-said { margin: 0; flex: 1 1 18rem; min-width: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere; }
.rd-banner-act { flex: none; }
/* THE EXPENSIVE-PICK-UP WARNING on a run. One row in the warning hue, because it
   changes what the reader should do next: a small fix goes to a fresh agent. */
.rd-warn {
  margin: var(--gut) 0 0;
  padding: var(--pad) var(--pad-lg);
  border-left: 3px solid var(--st-blocked);
  border-radius: var(--radius-sm);
  background: var(--st-blocked-row);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  overflow-wrap: anywhere;
}
.rd-act-link {
  display: inline-flex; align-items: center;
  min-height: var(--row-h); padding: 0 14px;
  border: var(--border-w) solid var(--ask); border-radius: var(--radius);
  background: var(--ask-bg); color: var(--ask);
  font-family: var(--font-ui); font-size: var(--fs-2); font-weight: 600;
  text-decoration: none; white-space: nowrap;
}
.rd-act-link:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }

/* The one-word control that IS the action. No Save button: a state word is a thing you set. */
.rd-word { margin: var(--gut) 0 0; max-width: 22rem; min-width: 0; }
.rd-busy { font-size: var(--fs-1); color: var(--text-3); }
/* A GOAL'S CONFIRMATION: one sentence, the lead to the evidence, and the press. Why it is drawn here is in GoalMark's comment. */
.goal-mark { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.goal-mark-said { max-width: var(--measure-in-box); overflow-wrap: anywhere; }
.goal-mark-lead, .goal-mark-press { margin: 0; font-size: var(--fs-2); overflow-wrap: anywhere; }

/* TIER 2. The kind's own prose, under headings computed from the keys. */
.rd-prose { margin: 0; font-size: var(--fs-3); line-height: var(--lh-body); color: var(--text); }
/* A NOTE'S OR A MESSAGE'S OWN WRITING, which is the one thing on a record page that is genuinely a
   page of continuous reading rather than a caption. Three rules on top of .rd-prose:

   The measure, because this is the case tokens.css names when it says a book measure is right for
   long-form reading and wrong for the one- and two-sentence captions the rest of the app is made of.
   It is a cap: in a column narrower than the measure, the column wins.

   The line breaks the person typed, kept. Blank lines between paragraphs are the whole of the
   structure in stored prose here, and collapsing them runs a diary entry into one block.

   Space under it, so the line naming the day or the sender is not read as the last line of the
   writing. It sits AFTER .rd-prose in this sheet on purpose: .rd-prose sets the shorthand margin to
   zero, so the same rule written above it had no effect at all and the two paragraphs touched. */
.rd-writing { max-width: var(--measure-in-box); white-space: pre-wrap; margin-bottom: var(--pad); }
.rd-list {
  /* THE DOTS SIT IN THE SPACE LEFT OF THE WORDS, and a body fold's content box is clipped while
     it opens (details.rd-fold::details-content). An outside disc is drawn about 1.3em before the
     words in the three engines, so a padding of var(--pad-lg) alone left its left edge outside
     the list and the clip cut it. 1.5em keeps the whole dot inside the page content at every
     density; at the default density the words move 7px right (14px to 21px). */
  margin: 0; padding-left: max(var(--pad-lg), 1.5em);
  list-style: disc outside;
  display: flex; flex-direction: column; gap: var(--pad);
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text);
  min-width: 0;
}
.rd-list li { overflow-wrap: anywhere; }

/* A LIST OF RECORDS, IN THE ORDER THE FIELD STORES THEM. Numbered, because the order is the fact —
   a trajectory's states are a sequence and a pipeline's blocks are a sequence, and a bullet would
   throw the one thing the list is for away. Each row is the record's own name and opens it. */
.rd-named {
  margin: 0; padding-left: var(--pad-lg);
  list-style: decimal outside;
  display: flex; flex-direction: column; gap: var(--pad);
  font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text);
  min-width: 0;
}
.rd-named li { overflow-wrap: anywhere; }
/* An id nothing in this project answers to. Drawn quiet and with its sentence beside it, so it
   reads as a row Mole Office could not name rather than as a row with a strange title. */
.rd-named-gone { color: var(--text-2); font-size: var(--fs-1); }
.rd-named-gone code { font-family: var(--font-mono); }

/* One line at rest, its detail one press away. The summary is the heading, so the closed page is a
   contents list of the record rather than a page with things missing from it. */
.rd-fold { min-width: 0; }
/* The cost line when nobody recorded one: the folds' summary size and colour, and no triangle, because
   there is nothing under it to open. */
.rd-spent-none { margin: 0; padding: var(--pad) 0; font-size: var(--fs-2); font-weight: 600; color: var(--text-2); }
/* A CLOSED FOLD HAS TO LOOK LIKE A CONTROL. Without a marker these read as headings with nothing
   under them, which is worse than the panel they replaced: a heading over an empty space says the
   content is missing, and a fold says it is one press away. styles.css strips every list marker in
   the app, so the triangle is drawn rather than inherited.

   NOT display:flex on the summary. A flex container drops whitespace-only text nodes between its
   children, and this line is built out of text either side of a <time> element — it rendered as
   "Last changed7d agoby claude-code" until this was a block. */
.rd-fold > summary {
  cursor: pointer;
  display: block;
  list-style: none;
  padding: var(--pad) 0 var(--pad) 1.1rem;
  text-indent: -1.1rem;
  font-size: var(--fs-2); font-weight: 600; color: var(--text-2);
}
.rd-fold > summary::-webkit-details-marker { display: none; }
.rd-fold > summary::before {
  content: "▸";
  display: inline-block;
  width: 1.1rem;
  text-indent: 0;
  color: var(--text-3);
}
.rd-fold[open] > summary::before { content: "▾"; }
.rd-fold > summary:hover { color: var(--text); }
.rd-fold > summary:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.rd-fold-body { border-bottom: var(--border-w) solid var(--border); }
.rd-fold-body > * { margin-bottom: var(--pad-lg); }

/* The press that opens the box for a field that is already written. Quiet, under the words it
   changes, and only on a record being changed. */
.rd-change { margin-top: var(--pad); }

/* A COMMENT'S OWN PAGE.

   The words somebody quoted, drawn as the quotation they are: the same reading size as the rest of
   the page's prose, held to the measure, and marked off by a rail rather than by a hue. What is
   being said here is "these are somebody else's words", which is identity and not urgency, so it
   spends no colour at all. */
.rd-quote {
  margin: 0 0 var(--pad);
  padding-left: var(--pad-lg);
  border-left: 3px solid var(--border-strong);
  max-width: var(--measure-in-box);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
}
/* The box that changes what somebody wrote, and the two presses under it. */
.rd-comment-write { display: flex; flex-direction: column; gap: var(--pad); max-width: var(--measure-in-box); min-width: 0; }
.rd-comment-act { display: flex; flex-wrap: wrap; gap: var(--pad); }

/* WHAT SOMEBODY WROTE, AND BESIDE IT WHAT MOLE OFFICE MADE OF IT.

   Two columns where there is room for two and one column where there is not, which is a wrap and
   not a breakpoint: the side that cannot have a reading width takes the whole width instead. The
   words come first in the markup, so a narrow screen and a screen reader both reach them first. */
.rd-two { display: flex; flex-wrap: wrap; gap: var(--pad) var(--pad-lg); min-width: 0; }
.rd-two-side { flex: 1 1 22rem; min-width: 0; display: flex; flex-direction: column; gap: var(--gut); }
.rd-two-head {
  margin: 0;
  font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-3);
}

/* The quiet row: what this kind can still be told. Named as words, not as keys. */
.rd-add { margin: var(--gut) 0 0; min-width: 0; }
.rd-add-row {
  margin: 0;
  display: flex; align-items: baseline; gap: 0 .9em; flex-wrap: wrap;
  font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-3);
  min-width: 0;
}
.rd-add-lab { font-weight: 600; }
.rd-add-btn {
  border: 0; padding: 0; background: none;
  font-family: var(--font-ui); font-size: var(--fs-1);
  color: var(--accent); cursor: pointer;
  text-decoration: underline; text-underline-offset: .16em;
}
.rd-add-btn:hover { color: var(--text); }
.rd-add-btn:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.rd-add-off { color: var(--text-3); }

/* TIER 3. Links as sentences, then the history line. Both open into the full panel. */
.rd-rail { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rd-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rd-link { font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text); overflow-wrap: anywhere; }
/* ONE RELATION, ITS PHRASE ONCE, THEN ITS ROWS. The phrase used to be repeated on every row.
   The gap is the small one: these are one thought, not two panels. */
.rd-relation { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; }
.rd-relation-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; }
.rd-link-verb { color: var(--text-3); font-size: var(--fs-1); }
.rd-link-more { color: var(--text-3); font-size: var(--fs-1); }
.rd-link a { color: var(--accent); text-decoration: underline; text-underline-offset: .16em; }
/* What the row is stored as, grown onto the row itself rather than appended as a second panel. */
.rd-link-mach { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3); }

/* ---------------------------------------------------------------- writing a field */
/* EVERY VALUE HERE IS A TOKEN THAT EXISTS IN tokens.css, for the reason spelled out under the
   deadline block below: an invented custom property is dropped at computed-value time with no
   warning, and a panel styled with one renders as a column of run-together words. */
.fw-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; min-width: 0; }
.fw-row {
  display: flex; flex-direction: column; gap: var(--pad);
  padding: var(--pad) 0;
  border-top: var(--border-w) solid var(--border);
  min-width: 0;
}
.fw-row:first-child { border-top: none; }
/* The name, whether it is written, and the way in — one line where there is room, stacked on a
   phone rather than squeezing a value into 60px. */
.fw-head {
  display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap;
  min-width: 0;
}
/* The key exactly as stored, in mono, because it is the string a PATCH addresses. */
.fw-key {
  font-family: var(--font-mono);
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.fw-type { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }
.fw-now { flex: 1 1 12rem; min-width: 0; font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.fw-value { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text); }
.fw-written { color: var(--text-3); }
/* Why there is no box. Quiet, at the reading measure, because it is an explanation and not an
   alarm — a field with a shape too big for one control is not a fault in the record. */
.fw-why {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  overflow-wrap: anywhere;
}
.fw-patch { font-family: var(--font-mono); color: var(--text-2); overflow-wrap: anywhere; }
.fw-form { display: flex; flex-direction: column; gap: var(--pad); max-width: 44rem; min-width: 0; }

/* Every form a due date is written in, one under the other. A stacked column rather than a
   sentence, because an obligation carrying two of them has said two separate things. */
.rp-due-forms { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

/* ---------------------------------------------------------------- a fixed deadline */
/* EVERY VALUE BELOW IS A TOKEN THAT EXISTS IN tokens.css. An invented custom property does not
   fall back and does not warn — the declaration is simply dropped at computed-value time, so a
   panel styled with one renders as a column of run-together words. That has shipped here once
   already, and it is why this block writes no colour, no size and no radius of its own. */
.dp-report { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; margin-top: var(--gut); }
/* Three words in a control as wide as the panel reads as a search box. It is a choice between
   month, week and day, and it takes the width that choice needs. The question mark beside it sits
   on the control's own line rather than under it. */
.dp-horizon { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.dp-horizon > .px-field { flex: 1 1 auto; min-width: 0; }
.dp-sums { margin-top: var(--gut); }
.dp-hours { font-weight: 600; color: var(--text); white-space: nowrap; }
.dp-unit { font-weight: 400; color: var(--text-3); }
.dp-left { font-weight: 600; color: var(--text); }
/* THE QUALIFIER TAKES ITS OWN LINE, and that is a fix for something a screenshot showed. Half of
   these values are a SENTENCE rather than a number — "nobody has said how many hours these periods
   hold" — and inline after one of those the qualifier ran straight on: "…and it is not a full
   working week stated for 0 of the 0 whole week periods counted" reads as a claim that a full
   working week was stated. */
.dp-qual { display: block; color: var(--text-2); }

.dp-group {
  margin: var(--gut) 0 var(--pad);
  display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap;
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
}
.dp-group-note { font-size: var(--fs-1); font-weight: 400; color: var(--text-3); }

/* One piece of work: its name, then its three numbers. The numbers wrap under the name on a
   phone rather than being squeezed into a column too narrow to hold a sentence about a null. */
.dp-rows { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.dp-row {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 0;
  padding: var(--pad);
  background: var(--panel-2);
  border-radius: var(--radius-sm);
}
.dp-row-name { font-size: var(--fs-2); font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.dp-row-nums {
  display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  min-width: 0;
}
.dp-cell { display: inline-flex; align-items: baseline; gap: 4px; flex-wrap: wrap; min-width: 0; }
.dp-cell-key {
  font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-3);
}

.dp-gaps { min-width: 0; }
/* A MARKER PER LINE, set here because styles.css strips every list in the app of one. These are
   several separate statements about several separate missing inputs, and run together with no
   markers they read as one paragraph that happens to have been broken up. */
.dp-gap-list {
  margin: 0; padding-left: var(--pad-lg);
  list-style: disc outside;
  display: flex; flex-direction: column; gap: var(--pad);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  min-width: 0;
}
.dp-gap-list li { overflow-wrap: anywhere; }
.dp-gap-none, .dp-reading, .dp-left-out, .dp-unsized {
  margin: 0 0 var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  overflow-wrap: anywhere;
}
/* The one line on this panel that is about a request that did not do what it was asked, so it
   takes the app's alarm ink rather than the quiet one the notes beside it use. */
.dp-unsized { color: var(--st-failed); }

/* The offer. A checkbox, then the record, then every source that named it. The whole row is a
   <label>, so the name is a hit target too rather than a 16px box being the only one. */
.dp-pick { min-width: 0; }
.dp-cands { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dp-cand { min-width: 0; }
/* THE ROW IS THE PRESS. It was a label wrapping a check box; it is a button now, so the reset here
   takes off the browser's button chrome and everything else about the row is as it was. */
.dp-cand-label {
  display: flex; align-items: flex-start; gap: var(--gut);
  min-height: var(--row-h);
  padding: var(--pad);
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  width: 100%;
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-width: 0;
}
.dp-cand-label:hover { background: var(--hover); }
.dp-cand-label[aria-pressed="true"] { background: var(--sel); }
.dp-cand-label:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
/* The tick, drawn rather than rendered by the browser. Same 16px box either way, so a row does not
   move when it is picked, and the mark carries the state in ink as well as in aria-pressed. */
.dp-check {
  flex: none; margin-top: 3px; width: 16px; height: 16px;
  display: inline-flex; align-items: center; justify-content: center;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: var(--fs-1); line-height: 1; color: var(--accent);
}
.dp-cand-label[aria-pressed="true"] .dp-check { border-color: var(--accent); }

/* COUNT BY: three presses on one line. Same segmented shape as the plan page's horizons, because
   it is the same question, and the chosen one is said by position, by weight and by aria-pressed. */
.dp-hz-label { font-size: var(--fs-1); color: var(--text-3); }
.dp-hz { display: inline-flex; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-pill); overflow: hidden; }
.dp-hz-one { font: inherit; font-size: var(--fs-2); color: var(--text-2); background: var(--panel); border: 0; border-right: var(--border-w) solid var(--border-strong); padding: 3px var(--pad-lg); cursor: pointer; }
.dp-hz-one:last-child { border-right: 0; }
.dp-hz-one:hover { background: var(--hover); }
.dp-hz-one[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.dp-cand-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dp-cand-line { display: flex; align-items: center; gap: var(--pad); flex-wrap: wrap; min-width: 0; }
.dp-cand-name { font-size: var(--fs-2); color: var(--text); overflow-wrap: anywhere; }
.dp-cand-meta {
  display: flex; align-items: baseline; gap: var(--pad) var(--gut); flex-wrap: wrap;
  font-size: var(--fs-1);
  color: var(--text-3);
  min-width: 0;
}
/* WHERE THE OFFER CAME FROM, drawn as a chip so it cannot be read as part of the record's name.
   It is a provenance mark and not a state: no tone, no rail, no alarm. */
.dp-from {
  padding: 1px 6px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  color: var(--text-2);
}
.dp-proj { font-family: var(--font-mono); }
.dp-est { color: var(--text-3); }
`

/**
 * THE FORK THIS DECISION ANSWERS, WITH ITS OPTIONS, or null because it was written on its own.
 *
 * `derived_from` FORWARD, which is the link a promotion makes. The options come from the proposal's
 * own record in the listing this page already loads, so choosing again costs no extra request; a
 * proposal that is not in the listing is one this page cannot draw the options of, and the panel
 * says there are none rather than drawing an empty list.
 */
export function theForkThisAnswers(
  links: readonly GatedLink[],
  records: readonly PanelRecord[],
): { id: string; title: string; options: readonly string[] } | null {
  const one = links.find(
    (link) => link.type === RESOLVES_PROPOSAL && !link.isBacklink && !link.broken && link.other.kind === 'proposal',
  )
  if (one === undefined) return null
  const held = records.find((r) => r.id === one.other.id)
  const options = Array.isArray(held?.data['options']) ? (held.data['options'] as unknown[]).map(String) : []
  return { id: one.other.id, title: one.other.title, options }
}
