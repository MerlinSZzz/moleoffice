// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { en } from '@shared/words/en.ts'
import { t } from '@shared/i18n.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { ReceiptTotals } from '../components/UsageReceipt.tsx'
import type { ReceiptUsage } from '../../shared/usage-receipts.ts'
/**
 * `#/agent-use` — HOW AGENTS READ THIS PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE AND NOT A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A request is not a project artifact, and the owner's rule is *do not flood ordinary project
 * surfaces with raw request events*. Both halves of that are about RAW EVENTS. So raw events are
 * never records, an ANALYSIS of them is an ordinary report record like anything else, and the
 * aggregate lives here.
 *
 * Five waves of this campaign shipped a server half whose only door was an HTTP client. This page is
 * the door onto the measurement layer: without it, every number below is reachable only by curl and
 * the feature is not built.
 *
 * ---------------------------------------------------------------------------------------
 * NORMAL MODE DRAWS AGGREGATES. DEVELOPER MODE DRAWS ROWS.
 * ---------------------------------------------------------------------------------------
 *
 * Normal mode never draws a raw row, an address, a route pattern or a trace name. It draws what the
 * numbers mean: how long a piece of work took, what agents keep asking for, what they went outside
 * Mole Office for. Developer mode adds the endpoint table, the trace names and a way into one stretch's
 * own calls.
 *
 * ---------------------------------------------------------------------------------------
 * THE SPLIT IS TRACED AGAINST UNTRACED, AND THAT IS A FACT ABOUT THE REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * The obvious discriminator is `actor_type = 'agent'` and it does not work: the browser sends
 * whatever identity a person picked in the sidebar, so a browser claiming to be an agent would land
 * in the agent bucket with nothing saying so. A trace name is something the caller sent about the
 * work, not a claim about who it is.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS INVENTED AND NO EXAMPLE ROW IS EVER DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * Every table says, in one short line, that nobody has recorded one yet and what would make a row
 * appear. And Developer mode says whether the recorder is even running, because "no rows" and "not
 * recording" are different facts and a page that could not tell them apart would draw silence as
 * evidence.
 */
import { useState } from 'react'
import { api } from '../api.ts'
import { useMode } from '../lib/mode.ts'
import { Absence, Empty, ErrorNote, Loading, Panel } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { endedBecauseWord, purposeWord, wantedWord } from '@shared/words.ts'
import { patternFoundBy } from '@shared/ops.ts'
import {
  OVERLAP_CLASSES,
  OVERLAP_NEEDS_THE_LIVE_INDEX,
  OVERLAP_OVER_A_PAST_RANGE,
  type OverlapClass,
} from '@shared/workdomain.ts'
import { Chart, type ChartSpec } from '../components/Chart.tsx'

/** What `GET /api/usage/summary` answers. */
interface Summary {
  workspace: string
  recording: boolean
  calls: number
  /**
   * The calls a counted hourly row stands for, criterion U6. `calls` alone is the request log, and
   * it fell when the fold landed; the page reads the two together so the total keeps its meaning.
   */
  foldedCalls: number
  tracedCalls: number
  untracedCalls: number
  outsideReads: number
  stretchSummaries: number
  oldestCallAt: string | null
  windowDays: { untraced: number; traced: number }
  /** Null when no prune has run in the serving process, which is not the same as one that deleted nothing. */
  lastPrune: { at: string; untracedDeleted: number; tracesPruned: number; stretchesWritten: number } | null
  rowsNotWritten: number
  traceHeadersIgnored: number
}

interface StretchRow {
  traceId: string
  seq: number
  purpose: string | null
  startedAt: string
  minutes: number
  endedBecause: string
  calls: number
  reads: number
  writes: number
  refused: number
  bytes: number
  distinctOperations: number
  outsideReads: number
  gapVerdicts: number
  localCalls: number
  remoteCalls: number
  unknownCalls: number
  actorId: string | null
  sessionId: string | null
  thenWrote?: string
  fromSummary?: boolean
}

interface OperationRow {
  operation: string
  calls: number
  /** How many of those calls were counted by the hour rather than stored one row each. Criterion U6. */
  foldedCalls: number
  refused: number
  bytes: number
  msMedian: number | null
  readBackShare: number | null
  readBackOf: number
}

interface GapRow {
  wanted: string
  question: string
  answeredBy: string | null
  boundary: number
  boundaryDisputed: number
  capabilityGap: number
  notFound: number
  machineNotRecorded: number
  unsure: number
  traces: number
}

/** One thing that happened inside a trace: a request Mole Office answered, or a claim an agent filed. */
interface TraceEvent {
  kind: 'call' | 'outside'
  at: string
  operation?: string | null
  status?: number
  ms?: number
  bytes?: number | null
  targetId?: string | null
  what?: string
  wanted?: string
  verdict?: string
}

interface PatternRow {
  key: string
  crossed: boolean
  saw: number
  needs: number
  traces: number
  needsTraces: number
  survivesPrune: boolean
  says: string
  /** `says` as a code, drawn in the page's language (src/shared/dev-sayings.ts). */
  said?: unknown
}

/** One ordered pair of operations, as `GET /api/usage/sequences` answers it. */
interface SequenceRow {
  from: string
  to: string
  occurrences: number
  stretches: number
  traces: number
}

/** How many operations the first table shows before the rest go behind a press. */
const TOP_OPERATIONS = 8

/**
 * A COUNT AND ITS NOUN, with the noun made plural only when it should be.
 *
 * "1 calls" and "1 kinds of question" were on the first pictures of this page. A number printed
 * beside a noun that does not agree with it reads as a template rather than as a sentence, which is
 * the plain-language rule failing in the smallest possible way.
 */

/** How long a stretch took, in words rather than as a rounded zero. */
function minutesWord(minutes: number): string {
  return minutes < 1 ? t('dev.usage.underMinute') : t('dev.usage.min', { minutes: String(minutes) })
}

/** Bytes, as a person would say them. A megabyte figure beside a 400-byte one reads as nothing. */
function bytesWord(bytes: number): string {
  if (bytes < 1024) return t('dev.usage.bytes', { bytes: String(bytes) })
  if (bytes < 1024 * 1024) return t('dev.usage.kb', { value1: String(Math.round(bytes / 1024)) })
  return t('dev.usage.mb', { value1: (bytes / (1024 * 1024)).toFixed(1) })
}

/** Which machine a stretch ran from, as a proportion and never as one bucketing word. */
function machineWord(row: StretchRow): string | null {
  if (row.remoteCalls === 0 && row.unknownCalls === 0) return null
  if (row.localCalls === 0 && row.unknownCalls === 0) return t('dev.usage.allRemote')
  const parts: string[] = []
  if (row.remoteCalls > 0) parts.push(t('dev.usage.ofFromAnotherMachine', { remoteCalls: String(row.remoteCalls), value1: t('dev.usage.countCall', { n: row.calls }) }))
  if (row.unknownCalls > 0) parts.push(t('dev.usage.recordedBeforeMoleOfficeCouldTell', { unknownCalls: String(row.unknownCalls) }))
  return parts.join(' · ')
}

export function UsagePage() {
  const mode = useMode()
  // `inspect` IS THE STORED WORD FOR THE DEVELOPER SWITCH, and `Developer` is what the switch says.
  // The reading lives in the mode module; the comparison has to be against the stored word.
  const developer = mode === 'inspect'
  const [summary] = useProjectAsync(() => api.usageSummary(), [])
  const [traces] = useProjectAsync(() => api.usageTraces(), [])
  const [operations] = useProjectAsync(() => api.usageOperations(), [])
  const [gaps] = useProjectAsync(() => api.usageOutsideReads(), [])
  const [patterns] = useProjectAsync(() => api.usagePatterns(), [])
  const [sequences] = useProjectAsync(() => api.usageSequences(), [])
  const [agents] = useProjectAsync(() => api.usageAgents(), [])
  const [allOperations, setAllOperations] = useState(false)
  const [openTrace, setOpenTrace] = useState<string | null>(null)

  return (
    <div className="page">
      <style>{USAGE_CSS}</style>
      {/* THE HEADING IS THE RAIL ROW'S OWN WORDS AND NOT A SECOND NAME FOR THE SAME PLACE.
          This repository's rule is that one place has one name. The design for this
          thread asked for the rail to say "Agent use" and the page to be headed "How agents read
          this project"; that is two names, so the sentence became the line under the heading. */}
      <h1>{t('nav.usage')}</h1>
      <p className="usage-lede">{t('dev.usage.everyRequestMoleOfficeAnswersIsMeasured')}</p>

      {summary.status === 'loading' ? <Loading label={t('dev.usage.readingWhatHasBeenMeasured')} what={t('dev.usage.usage')} /> : null}
      {summary.status === 'error' ? <ErrorNote message={summary.message} fault={summary.fault} /> : null}
      {summary.status === 'ready' ? <TheWindow summary={summary.value as Summary} developer={developer} /> : null}

      <Panel titleIs="label" declares={{ surface: 'usage.stretches' }} title={t('dev.usage.piecesOfWorkNewestFirst')}>
        {traces.status === 'loading' ? <Loading label={t('dev.usage.readingTheStretches')} what={t('dev.usage.stretches')} /> : null}
        {traces.status === 'error' ? <ErrorNote message={traces.message} fault={traces.fault} /> : null}
        {traces.status === 'ready' ? (
          <Stretches
            rows={[...((traces.value as { stretches: StretchRow[] }).stretches ?? []), ...((traces.value as { pruned: StretchRow[] }).pruned ?? [])]}
            developer={developer}
            open={openTrace}
            onOpen={setOpenTrace}
          />
        ) : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.operations' }} title={t('dev.usage.whatAgentsKeepAskingFor')}>
        {operations.status === 'loading' ? <Loading label={t('dev.usage.readingTheOperations')} what={t('dev.usage.operations')} /> : null}
        {operations.status === 'error' ? <ErrorNote message={operations.message} fault={operations.fault} /> : null}
        {operations.status === 'ready' ? (
          <Operations
            rows={(operations.value as { operations: OperationRow[] }).operations}
            threshold={(operations.value as { hintThreshold: { share: number; occurrences: number; traces: number } }).hintThreshold}
            showAll={allOperations}
            onShowAll={() => setAllOperations((was) => !was)}
            developer={developer}
          />
        ) : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.gaps' }} title={t('dev.usage.whatAgentsWentOutsideMoleOfficeFor')}>
        <p className="usage-note">{t('dev.usage.everyRowHereIsSomethingAnAgent')}</p>
        {gaps.status === 'loading' ? <Loading label={t('dev.usage.readingTheClaims')} what={t('dev.usage.claims')} /> : null}
        {gaps.status === 'error' ? <ErrorNote message={gaps.message} fault={gaps.fault} /> : null}
        {gaps.status === 'ready' ? (
          <Gaps
            rows={(gaps.value as { questions: GapRow[] }).questions}
            withNoWordYet={(gaps.value as { withNoWordYet: { what: string; wantedOther: string | null; at: string }[] }).withNoWordYet}
          />
        ) : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.patterns' }} title={t('dev.usage.whatHasCrossedAThreshold')}>
        <p className="usage-note">{t('dev.usage.nothingHereIsFiledForYouA')}</p>
        {patterns.status === 'loading' ? <Loading label={t('dev.usage.readingThePatterns')} what={t('dev.usage.patterns')} /> : null}
        {patterns.status === 'error' ? <ErrorNote message={patterns.message} fault={patterns.fault} /> : null}
        {patterns.status === 'ready' ? <Patterns rows={(patterns.value as { patterns: PatternRow[] }).patterns} /> : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.sequences' }} title={t('dev.usage.whatAgentsDoNext')}>
        {sequences.status === 'loading' ? <Loading label={t('dev.usage.readingThePairs')} what={t('dev.usage.sequences')} /> : null}
        {sequences.status === 'error' ? <ErrorNote message={sequences.message} fault={sequences.fault} /> : null}
        {sequences.status === 'ready' ? (
          <Sequences rows={(sequences.value as { sequences: SequenceRow[] }).sequences} developer={developer} />
        ) : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.receipts' }} title={t('dev.usage.runtimeTokenUsage')}>
        {agents.status === 'loading' ? <Loading label={t('dev.usage.readingRuntimeReceipts')} what={t('dev.usage.receipts')} /> : null}
        {agents.status === 'error' ? <ErrorNote message={agents.message} fault={agents.fault} /> : null}
        {agents.status === 'ready' ? <ReceiptTotals reading={(agents.value as AgentUsageReply).receipts} /> : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.frameworks' }} title={t('dev.usage.whichToolTheAgentsRanInAnd')}>
        {agents.status === 'loading' ? <Loading label={t('dev.usage.readingWhichToolMadeWhichCall')} what={t('dev.usage.tools')} /> : null}
        {agents.status === 'error' ? <ErrorNote message={agents.message} fault={agents.fault} /> : null}
        {agents.status === 'ready' ? <Frameworks reading={agents.value as AgentUsageReply} /> : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.refusals' }} title={t('dev.usage.whereAgentsAreTurnedAwayAndWhy')}>
        {agents.status === 'loading' ? <Loading label={t('dev.usage.readingTheRefusals')} what={t('dev.usage.refusals')} /> : null}
        {agents.status === 'error' ? <ErrorNote message={agents.message} fault={agents.fault} /> : null}
        {agents.status === 'ready' ? <Refusals reading={agents.value as AgentUsageReply} /> : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.arrivals' }} title={t('dev.usage.fromAnAgentArrivingToItsFirst')}>
        {agents.status === 'loading' ? <Loading label={t('dev.usage.readingTheArrivals')} what={t('dev.usage.arrivals')} /> : null}
        {agents.status === 'error' ? <ErrorNote message={agents.message} fault={agents.fault} /> : null}
        {agents.status === 'ready' ? <Arrivals reading={agents.value as AgentUsageReply} /> : null}
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.hotspots' }} title={t('dev.usage.whereTwoAgentsWorkKeepsMeeting')}>
        <Hotspots />
      </Panel>

      <Panel titleIs="label" declares={{ surface: 'usage.lifecycle' }} title={t('dev.usage.howLongAgentsSpentWorking')}>
        <Lifecycle />
      </Panel>
    </div>
  )
}

/**
 * WHAT THE LAST PRUNE DID, OR NULL BECAUSE NONE HAS RUN — WHICH IS NOT A ROW OF ZEROES.
 *
 * IT RETURNS NULL RATHER THAN A SENTENCE FOR THE SECOND CASE, and the caller draws that case as an
 * absence. `null` and `{deleted: 0}` are two facts: one says nobody has enforced the windows this
 * page publishes, the other says somebody did and there was nothing past them. Drawing them as two
 * paragraphs of the same weight is the fifth invariant broken on the page built to keep a
 * measurement apart from somebody's word, so the two get different SHAPES and not only different
 * words — which is what `Absence` at the told-apart tier is for.
 *
 * `tests/usage-page.test.ts` holds the difference in both directions.
 */
export function lastPruneSentence(summary: Pick<Summary, 'lastPrune' | 'windowDays'>): string | null {
  const prune = summary.lastPrune
  if (prune === null) return null
  const kept = prune.stretchesWritten === 0 ? '' : t('dev.usage.andKeptOfWhatWent', { value1: t('dev.usage.countSummary', { n: prune.stretchesWritten }) })
  return t('dev.usage.lastTidiedAtThatNamedNo', { at: prune.at, value1: t('dev.usage.countRequest', { n: prune.untracedDeleted }), value2: t('dev.usage.countWholePiece', { n: prune.tracesPruned }), traced: String(summary.windowDays.traced), kept: kept })
}

/** What this page is drawing over, and — in Developer mode — whether anything is drawing at all. */
/**
 * Exported so a test can draw it. `useAsync` starts in `loading` under react-dom/server, so nothing
 * asking for this band through `UsagePage` ever reaches it, and the two facts it has to draw apart
 * — nobody has tidied, and a tidy that found nothing — could only be checked by reading this file's
 * source text. See tests/usage-page.test.ts.
 */
export function TheWindow({ summary, developer }: { summary: Summary; developer: boolean }) {
  return (
    <div className="usage-window">
      <p>
        {summary.calls === 0 && summary.foldedCalls === 0
          ? t('dev.usage.noRequest')
          : t('dev.usage.ofStoredRequestsNamedAPiece', { tracedCalls: String(summary.tracedCalls), calls: String(summary.calls) }) +
            t('dev.usage.didNotThatIsThisBrowser', { untracedCalls: String(summary.untracedCalls) }) +
            (summary.foldedCalls === 0
              ? ''
              : t('dev.usage.wereCountedByTheHourRather', { value1: t('dev.usage.countMoreCall', { n: summary.foldedCalls }) }))}
      </p>
      <p>
        {summary.oldestCallAt === null
          ? t('dev.usage.requestsThatNamedNoPieceOf', { untraced: String(summary.windowDays.untraced), traced: String(summary.windowDays.traced) })
          : t('dev.usage.theOldestMeasurementIsFrom', { oldestCallAt: summary.oldestCallAt })}
      </p>
      {/* WHETHER ANYTHING HAS ENFORCED THE TWO WINDOWS, which is not the same fact as what they are.
          The windows were published here for a fortnight while nothing called the prune, so a reader
          was told how long rows are kept by a page that had no way of knowing whether any had gone.

          NOBODY HAS TIDIED IS DRAWN AS AN ABSENCE AND NOT AS A PARAGRAPH. It is the told-apart tier
          with looked false, because the fact is that nothing has looked at the windows yet — the one
          case this page must not let read as "somebody looked and there was nothing past them". */}
      {lastPruneSentence(summary) === null ? (
        <Absence
          tier="told-apart"
          looked={false}
          word={t('dev.usage.nothingTidiedAwayYet')}
          title={t('dev.usage.nothingHasBeenTidiedAwaySinceThis')}
        />
      ) : (
        <p>{lastPruneSentence(summary)}</p>
      )}
      {developer ? (
        <p className="usage-developer">
          {/* "NO ROWS" AND "NOT RECORDING" ARE DIFFERENT FACTS. A page that could not say which
              would draw an empty table as evidence that nothing happened. */}
          {summary.recording ? t('dev.usage.recorderOn') : t('dev.usage.recorderOff')}
          {summary.rowsNotWritten > 0 ? t('dev.usage.rowsCouldNotBeWritten', { rowsNotWritten: String(summary.rowsNotWritten) }) : ''}
          {summary.traceHeadersIgnored > 0 ? t('dev.usage.traceHeadersCouldNotBeRead', { traceHeadersIgnored: String(summary.traceHeadersIgnored) }) : ''}
          {summary.stretchSummaries === 0 ? '' : t('dev.usage.beenSummarisedAndItsRowsDeleted', { value1: t('dev.usage.countStretchHas', { n: summary.stretchSummaries }) })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Exported for the same reason `TheWindow` is: a row has to be OPEN before the raw-request list is
 * drawn, and `useState` under react-dom/server never leaves its initial value, so no test reaching
 * this through `UsagePage` can open one. See tests/usage-page.test.ts.
 */
export function Stretches({
  rows,
  developer,
  open,
  onOpen,
}: {
  rows: StretchRow[]
  developer: boolean
  open: string | null
  onOpen: (id: string | null) => void
}) {
  if (rows.length === 0) {
    return (
      <Empty message={t('dev.usage.noAgentHasNamedAPieceOf')} />
    )
  }
  return (
    <ul className="usage-rows">
      {rows.map((row) => {
        const id = `${row.traceId}-${String(row.seq)}`
        const isOpen = open === id
        const machine = machineWord(row)
        return (
          <li key={id} className="usage-row">
            {/* A ROW THAT OPENS IS A BUTTON, in the page's tab order, opened by Enter or Space, and
                Escape closes it. A div with an onClick would be reachable by pointer only. */}
            <button
              type="button"
              className="usage-row-open"
              aria-expanded={isOpen}
              onClick={() => onOpen(isOpen ? null : id)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && isOpen) onOpen(null)
              }}
            >
              <span className="usage-row-what">{purposeWord(row.purpose).text}</span>
              <span className="usage-row-when">{row.startedAt}</span>
              <span className="usage-row-cost">
                {`${minutesWord(row.minutes)} · ${t('dev.usage.countCall', { n: row.calls })} · ${bytesWord(row.bytes)}`}
              </span>
            </button>
            {isOpen ? (
              <div className="usage-row-more">
                {/* THE LINE SAYS IT IS WHY THE PIECE OF WORK ENDED, and one still going is not named so (wave 13y round 142). */}
                <p>
                  {row.endedBecause === 'still-open'
                    ? endedBecauseWord(row.endedBecause).text
                    : t('dev.usage.whyItEnded', { why: endedBecauseWord(row.endedBecause).text })}
                </p>
                <p>
                  {t('dev.usage.turnedAwayOverOfQuestion', { value1: t('dev.usage.countRead', { n: row.reads }), value2: t('dev.usage.countWrite', { n: row.writes }), refused: String(row.refused), value3: t('dev.usage.countKind', { n: row.distinctOperations }) })}
                </p>
                <p>
                  {row.outsideReads === 0
                    ? t('dev.usage.noOutside')
                    : t('dev.usage.outsideMoleOfficeOfThemJudged', { value1: t('dev.usage.countTrip', { n: row.outsideReads }), gapVerdicts: String(row.gapVerdicts) })}
                </p>
                {machine === null ? null : <p>{machine}</p>}
                {row.fromSummary === true ? (
                  <p>{t('dev.usage.itsOwnRequestsHaveBeenDeletedThis')}</p>
                ) : null}
                {developer ? (
                  <>
                    <p className="usage-developer">{t('dev.usage.pieceOfWorkRun', { traceId: row.traceId, value1: row.sessionId ?? t('dev.usage.unrecorded') })}</p>
                    {/* THE RAW ROWS, IN DEVELOPER MODE AND NOWHERE ELSE. Without this the trace read
                        is a route whose only door is an HTTP client, which is the fault five waves
                        of this campaign were caught for. */}
                    <TraceEvents traceId={row.traceId} />
                  </>
                ) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * ONE PIECE OF WORK'S OWN REQUESTS, IN TIME ORDER, WITH THE CLAIMS MERGED IN.
 *
 * DEVELOPER MODE ONLY. Normal mode never draws a raw request — that is the rule about which
 * projection draws what, not about which data exists — so this component is only mounted there.
 *
 * IT IS ASKED FOR WHEN A ROW OPENS AND NOT BEFORE. A page that fetched every trace's rows at first
 * paint would cost more than the whole rest of the page put together, on a table built to measure
 * exactly that kind of waste.
 */
function TraceEvents({ traceId }: { traceId: string }) {
  const [trace] = useProjectAsync(() => api.usageTrace(traceId), [traceId])
  if (trace.status === 'loading') return <p className="usage-developer">{t('dev.usage.readingItsRequests')}</p>
  if (trace.status === 'error') return <ErrorNote message={trace.message} fault={trace.fault} />
  const events = (trace.value as { events?: TraceEvent[] }).events ?? []
  if (events.length === 0) {
    return (
      <p className="usage-developer">{t('dev.usage.itsOwnRequestsHaveBeenDeletedWhat')}</p>
    )
  }
  return (
    <ol className="usage-events">
      {events.map((event, i) => (
        <li key={`${event.at}-${String(i)}`}>
          {event.kind === 'call'
            ? t('dev.usage.msBytes', { at: event.at, value1: event.operation ?? t('dev.usage.noRoute'), status: String(event.status), value2: String(Math.round(event.ms ?? 0)), value3: String(event.bytes ?? 0), value4: event.targetId === null || event.targetId === undefined ? '' : ` · ${event.targetId}` })
            : t('dev.usage.wentOutsideMoleOfficeWantedCalled', { at: event.at, what: String(event.what), wanted: String(event.wanted), verdict: String(event.verdict) })}
        </li>
      ))}
    </ol>
  )
}

export function Operations({
  rows,
  threshold,
  showAll,
  onShowAll,
  developer,
}: {
  rows: OperationRow[]
  threshold: { share: number; occurrences: number; traces: number }
  showAll: boolean
  onShowAll: () => void
  developer: boolean
}) {
  if (rows.length === 0) {
    return <Empty message={t('dev.usage.nothingHasBeenAskedForYetA')} />
  }
  // A FOLDED OPERATION IS ALWAYS SHOWN, even when it has no bytes to sort on. It is one of the
  // commonest things the office is asked, and the count is exactly what this table is for.
  const shown = showAll ? rows : rows.filter((row, index) => index < TOP_OPERATIONS || row.foldedCalls > 0)
  const readBack = rows.filter((row) => row.readBackShare !== null && row.readBackOf > 0)
  const anyFolded = rows.some((row) => row.foldedCalls > 0)
  return (
    <>
      {anyFolded ? (
        <p className="usage-note">{t('dev.usage.someOperationsAreCountedOnceAnHour')}</p>
      ) : null}
      <ul className="usage-rows">
        {shown.map((row) => (
          <li key={row.operation} className="usage-row usage-row-flat">
            <span className="usage-row-what">{row.operation}</span>
            <span className="usage-row-cost">
              {/* THE COUNT SAYS WHICH PART OF IT WAS FOLDED. Criterion U6, and the third invariant:
                  a number whose meaning changed must say so where it is drawn. */}
              {row.foldedCalls === 0
                ? `${t('dev.usage.countCall', { n: row.calls })} · ${bytesWord(row.bytes)}`
                : row.foldedCalls === row.calls
                  ? t('dev.usage.countedByTheHour', { value1: t('dev.usage.countCall', { n: row.calls }) })
                  : t('dev.usage.countedByTheHour2', { value1: t('dev.usage.countCall', { n: row.calls }), value2: t('dev.usage.countCall', { n: row.foldedCalls }), value3: bytesWord(row.bytes) })}
              {row.refused > 0 ? t('dev.usage.turnedAway', { refused: String(row.refused) }) : ''}
              {developer && row.msMedian !== null ? t('dev.usage.ms', { value1: String(Math.round(row.msMedian)) }) : ''}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > TOP_OPERATIONS ? (
        <button type="button" className="usage-more" onClick={onShowAll}>
          {showAll ? t('dev.usage.topEight') : t('dev.usage.showAllOfThem', { length: String(rows.length) })}
        </button>
      ) : null}
      {readBack.length === 0 ? null : (
        <div className="usage-readback">
          <h3>{t('dev.usage.afterAWriteHowOftenARead')}</h3>
          <p className="usage-note">
            {t('dev.usage.thisIsTheMeasurementAndNot', { value1: String(Math.round(threshold.share * 100)), occurrences: String(threshold.occurrences), traces: String(threshold.traces) })}
          </p>
          <ul className="usage-rows">
            {readBack.map((row) => (
              <li key={row.operation} className="usage-row usage-row-flat">
                <span className="usage-row-what">{row.operation}</span>
                <span className="usage-row-cost">
                  {t('dev.usage.of', { value1: String(Math.round((row.readBackShare ?? 0) * 100)), readBackOf: String(row.readBackOf) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/**
 * WHAT `GET /api/usage/agents` ANSWERS, in the shape the three panels below draw.
 *
 * Written here rather than imported from the server module because a page may not import a server
 * file. Every field is one the route publishes; a field it stops publishing shows up as a missing
 * number on the screen rather than as a wrong one, because nothing here fills a gap in.
 */
export interface AgentUsageReply {
  receipts: ReceiptUsage
  window: { days: number; from: string; note: string }
  byFramework: {
    adaptedTool: string | null
    why?: string
    calls: number
    refused: number
    writes: number
    bytes: number
    sessions: number
    msToFirstWriteMedian: number | null
    runsThatWroteNothing: number
  }[]
  byProject: { workspaceId: string | null; calls: number; refused: number; writes: number; bytes: number; sessions: number }[]
  refusals: { status: number; reason: string; reasonSaid?: unknown; count: number; operations: { operation: string | null; count: number }[] }[]
  arrivals: {
    sessionId: string
    adaptedTool: string | null
    declaredBy: string | null
    runtimeWord: string | null
    workspaceId: string | null
    arrivedAt: number
    calls: number
    firstWriteAt: number | null
    msToFirstWrite: number | null
    why?: string
  }[]
  notAttributed: { calls: number; sessions: number; why: string; whySaid?: unknown }
}

/** A tool's name for a person: the declared tool, or "not declared" for runs that declared none. */
function toolWord(adaptedTool: string | null): string {
  return adaptedTool ?? t('dev.usage.notDeclared')
}

/** Seconds, minutes or hours, whichever a person would say out loud. */
function longWord(ms: number): string {
  if (ms < 1000) return t('dev.usage.ms2', { value1: String(Math.round(ms)) })
  if (ms < 90_000) return t('dev.usage.seconds', { value1: String(Math.round(ms / 1000)) })
  if (ms < 90 * 60_000) return t('dev.usage.minutes', { value1: String(Math.round(ms / 60_000)) })
  return t('dev.usage.hours', { value1: String((ms / 3_600_000).toFixed(1)) })
}

/**
 * WHICH TOOL MADE THE CALLS, AND WHICH PROJECT THEY WERE IN.
 *
 * The chart is drawn from the same rows as the list under it, so a reader can check one against the
 * other. Colour is not the only thing separating the bars — the chart component gives each series
 * its own dash and marker as well — and the columns are named, so the picture says the same thing
 * in a theme that has no colour at all.
 */
export function Frameworks({ reading }: { reading: AgentUsageReply }) {
  const rows = reading.byFramework
  // THE EMPTY LINE IS DRAWN AS ITS SENTENCE, since a phone has no hover to read a dash's reason from (wave 13y round 142).
  if (rows.length === 0) {
    return <Absence tier="ordinary" say title={t('dev.usage.nothingHasCalledMoleOfficeInThis')} />
  }
  const spec: ChartSpec = {
    kind: 'bar',
    title: t('dev.usage.chartTools'),
    x: { label: t('dev.usage.tool'), categories: rows.map((row) => toolWord(row.adaptedTool)) },
    y: { label: t('dev.usage.calls') },
    series: [{ name: t('dev.usage.calls'), points: rows.map((row, index) => ({ x: index, y: row.calls })) }],
  }
  const projects: ChartSpec = {
    kind: 'bar',
    title: t('dev.usage.chartProjects'),
    x: { label: t('dev.usage.project'), categories: reading.byProject.map((row) => row.workspaceId ?? t('dev.usage.noProject')) },
    y: { label: t('dev.usage.calls') },
    series: [{ name: t('dev.usage.calls'), points: reading.byProject.map((row, index) => ({ x: index, y: row.calls })) }],
  }
  return (
    <>
      <p className="usage-note">{t('dev.usage.callsAreCountedByTheToolTheRunDeclared')}</p>
      <Chart spec={spec} />
      <ul className="usage-rows">
        {rows.map((row) => (
          <li key={toolWord(row.adaptedTool)} className="usage-row usage-row-flat">
            <span className="usage-row-what">{toolWord(row.adaptedTool)}</span>
            <span className="usage-row-cost">
              {t('dev.usage.wroteTurnedAway', { value1: t('dev.usage.countCall', { n: row.calls }), value2: t('dev.usage.countRun', { n: row.sessions }), writes: String(row.writes), refused: String(row.refused) })}
            </span>
          </li>
        ))}
      </ul>
      {reading.notAttributed.calls === 0 ? null : (
        <p className="usage-note">
          {t('dev.usage.callsInRunsAreUnderNotDeclared', { value1: t('dev.usage.countCall', { n: reading.notAttributed.calls }), value2: t('dev.usage.countRun', { n: reading.notAttributed.sessions }), why: saidOnThePage(reading.notAttributed.whySaid, reading.notAttributed.why) })}
        </p>
      )}
      <Chart spec={projects} />
    </>
  )
}

/** WHERE AGENTS ARE TURNED AWAY, grouped by what the refusal meant rather than by its number. */
function Refusals({ reading }: { reading: AgentUsageReply }) {
  const rows = reading.refusals
  if (rows.length === 0) {
    return <Empty message={t('dev.usage.nothingHasBeenRefusedInThisWindow')} />
  }
  const spec: ChartSpec = {
    kind: 'bar',
    title: t('dev.usage.chartRefusals'),
    x: { label: t('dev.usage.reason'), categories: rows.map((row) => String(row.status)) },
    y: { label: t('dev.usage.refusalCount') },
    series: [{ name: t('dev.usage.refusalCount'), state: 'failed', points: rows.map((row, index) => ({ x: index, y: row.count })) }],
  }
  return (
    <>
      <Chart spec={spec} />
      <ul className="usage-rows">
        {/* THE ROW LAYS OUT ITS PARTS as every other row on the page does: the count apart from the reason, and the
            operations on a line of their own. Without it the three ran together (wave 13y round 146). */}
        {rows.map((row) => (
          <li key={row.status} className="usage-row usage-row-flat">
            <span className="usage-row-what">{`${String(row.status)} — ${saidOnThePage(row.reasonSaid, row.reason)}`}</span>
            <span className="usage-row-cost">{t('dev.usage.countTime', { n: row.count })}</span>
            <span className="usage-row-note">
              {row.operations
                .slice(0, 4)
                .map((one) => `${one.operation ?? t('dev.usage.noRoute')} (${String(one.count)})`)
                .join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** How many runs are shown one by one before the list says how many more there are. */
const ARRIVALS_SHOWN = 12

/**
 * FROM AN AGENT ARRIVING TO ITS FIRST USEFUL WRITE.
 *
 * A run that has written nothing has no time to show, and it is counted rather than drawn as a
 * zero. A zero would say the run wrote immediately, which is the opposite of what happened.
 */
function Arrivals({ reading }: { reading: AgentUsageReply }) {
  const timed = reading.arrivals.filter((row) => row.msToFirstWrite !== null && row.msToFirstWrite >= 0)
  const silent = reading.arrivals.length - timed.length
  if (reading.arrivals.length === 0) {
    return <Empty message={t('dev.usage.noRunHasArrivedInThisWindow')} />
  }
  const withMedian = reading.byFramework.filter((row) => row.msToFirstWriteMedian !== null)
  const spec: ChartSpec = {
    kind: 'bar',
    title: t('dev.usage.chartArrivals'),
    x: { label: t('dev.usage.tool'), categories: withMedian.map((row) => toolWord(row.adaptedTool)) },
    y: { label: t('dev.usage.secondsLabel') },
    series: [
      {
        name: t('dev.usage.firstWriteSeconds'),
        points: withMedian.map((row, index) => ({ x: index, y: Math.round((row.msToFirstWriteMedian ?? 0) / 1000) })),
      },
    ],
  }
  return (
    <>
      <p className="usage-note">{t('dev.usage.aRunArrivesWhenItMakesIts')}</p>
      {withMedian.length === 0 ? (
        <Absence
          tier="told-apart"
          looked
          title={t('dev.usage.noRunInThisWindowBothArrived')}
        />
      ) : (
        <Chart spec={spec} />
      )}
      <ul className="usage-rows">
        {timed.slice(0, ARRIVALS_SHOWN).map((row) => (
          <li key={row.sessionId} className="usage-row usage-row-flat">
            <span className="usage-row-what">{`${toolWord(row.adaptedTool)} · ${row.sessionId}`}</span>
            <span className="usage-row-cost">{`${longWord(row.msToFirstWrite ?? 0)} · ${t('dev.usage.countCall', { n: row.calls })}`}</span>
          </li>
        ))}
      </ul>
      {timed.length > ARRIVALS_SHOWN ? (
        <p className="usage-note">{t('dev.usage.andMoreRunsThatArrivedAnd', { value1: String(timed.length - ARRIVALS_SHOWN) })}</p>
      ) : null}
      {silent === 0 ? null : (
        <p className="usage-note">
          {t('dev.usage.arrivedAndWroteNothingAnybodyCan', { value1: t('dev.usage.countRun', { n: silent }) })}
        </p>
      )}
    </>
  )
}

function Gaps({
  rows,
  withNoWordYet,
}: {
  rows: GapRow[]
  withNoWordYet: { what: string; wantedOther: string | null; at: string }[]
}) {
  if (rows.length === 0) {
    return (
      <Empty message={t('dev.usage.noAgentHasReportedGoingOutsideMole')} />
    )
  }
  return (
    <>
      <ul className="usage-rows">
        {rows.map((row) => (
          <li key={row.wanted} className="usage-row usage-row-flat">
            <span className="usage-row-what">{wantedWord(row.wanted).text}</span>
            <span className="usage-row-cost">
              {[
                row.capabilityGap > 0 ? t('dev.usage.moleOfficeShouldHaveHad', { capabilityGap: String(row.capabilityGap) }) : null,
                row.notFound > 0 ? t('dev.usage.moleOfficeHadItAndNobody', { notFound: String(row.notFound) }) : null,
                row.boundaryDisputed > 0 ? t('dev.usage.calledItOutsideAndMoleOffice', { boundaryDisputed: String(row.boundaryDisputed) }) : null,
                row.boundary > 0 ? t('dev.usage.belongsOutside', { boundary: String(row.boundary) }) : null,
                row.unsure > 0 ? t('dev.usage.theAgentDidNotKnow', { unsure: String(row.unsure) }) : null,
                row.machineNotRecorded > 0
                  ? t('dev.usage.whichMachineWasMeantIsNot', { machineNotRecorded: String(row.machineNotRecorded) })
                  : null,
              ]
                .filter((part) => part !== null)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      {withNoWordYet.length === 0 ? null : (
        <div className="usage-nowords">
          <h3>{t('dev.usage.questionsWithNoWordYet')}</h3>
          <p className="usage-note">{t('dev.usage.thisIsHowTheListOfQuestions')}</p>
          <ul className="usage-rows">
            {withNoWordYet.map((row) => (
              <li key={`${row.at}-${row.what}`} className="usage-row usage-row-flat">
                <span className="usage-row-what">{row.wantedOther ?? row.what}</span>
                <span className="usage-row-when">{row.at}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/**
 * WHAT A PATTERN IS ABOUT, out of its own key.
 *
 * A key is `<kind>:<subject>` — `chain:record.list`, `gap:which-campaign` — and the subject is the
 * operation or the question the count is about. THE FIRST VERSION OF THIS PAGE DREW ONLY THE
 * SENTENCE, so five rows read "a read whose default projection is too big" one under another and a
 * reader could not tell which read any of them meant. The sentence says what the pattern MEANS; the
 * subject says what it is ABOUT, and both are needed.
 */
function subjectOf(key: string): string {
  const at = key.indexOf(':')
  return at === -1 ? key : key.slice(at + 1)
}

function Patterns({ rows }: { rows: PatternRow[] }) {
  if (rows.length === 0) {
    return <Empty message={t('dev.usage.noPatternHasEnoughBehindItTo')} />
  }
  const crossed = rows.filter((row) => row.crossed)
  const approaching = rows.filter((row) => !row.crossed).slice(0, 8)
  return (
    <>
      {crossed.length === 0 ? (
        <p className="usage-note">{t('dev.usage.nothingHasCrossedAThreshold')}</p>
      ) : (
        <ul className="usage-rows">
          {crossed.map((row) => (
            <li key={row.key} className="usage-row usage-row-flat">
              <span className="usage-row-what">
                <strong>{subjectOf(row.key)}</strong> — {saidOnThePage(row.said, row.says)}
              </span>
              <span className="usage-row-cost">
                {t('dev.usage.of2', { saw: String(row.saw), needs: String(row.needs) })}
                {row.needsTraces > 0 ? t('dev.usage.inPiecesOfWork', { traces: String(row.traces) }) : ''}
                {row.survivesPrune ? '' : t('dev.usage.notKept')}
              </span>
              {/* THE STRING A PROBLEM FILED FROM THIS WOULD CARRY, drawn so a person can copy it
                  rather than invent one. It is built by the same function the server uses. */}
              <span className="usage-row-when">{patternFoundBy(row.key)}</span>
            </li>
          ))}
        </ul>
      )}
      {approaching.length === 0 ? null : (
        <div className="usage-approaching">
          {/* THE SECOND LIST GETS ITS OWN HEADING, ALWAYS.
              It used to be told apart from the first only by `opacity: 0.75` and by dropping one
              column, and the one sentence that named it was drawn ONLY when nothing had crossed — so
              the moment a single crossing existed, eight rows that had NOT crossed stood under a
              heading reading "What has crossed a threshold". Photographed at 1440: `record.write — 5
              of 5` and `usage.report-outside — 9 of 5` read as crossings on the page whose whole
              subject is keeping a measurement apart from somebody's word. A heading is a structure;
              an opacity is a hint. */}
          <h3>{t('dev.usage.notCrossedYet')}</h3>
          <ul className="usage-rows usage-quiet">
            {approaching.map((row) => (
              <li key={row.key} className="usage-row usage-row-flat">
                <span className="usage-row-what">
                  <strong>{subjectOf(row.key)}</strong> — {saidOnThePage(row.said, row.says)}
                </span>
                {/* WHY IT HAS NOT CROSSED, AND NOT ONLY HOW FAR ALONG IT IS. A row reading `9 of 5`
                    with the traces column dropped says it is past its threshold when it is not: the
                    count is one half of the rule and the pieces of work are the other. */}
                <span className="usage-row-cost">
                  {t('dev.usage.of3', { saw: String(row.saw), needs: String(row.needs) })}
                  {row.needsTraces > 0 ? t('dev.usage.inOfPiecesOfWork', { traces: String(row.traces), needsTraces: String(row.needsTraces) }) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/**
 * WHICH OPERATION FOLLOWS WHICH — THE BAND THIS READ SHIPPED WITHOUT.
 *
 * `GET /api/usage/sequences` answered real rows from the day it landed and nothing in the browser
 * called it, so the only way to see what agents do next was curl. That is the sixth wave of this
 * campaign to ship a server half a person cannot reach, and by the owner's standard a feature whose
 * only door is curl is not built.
 *
 * PAIRS AND NOT LONGER RUNS, which is the server's rule and is said here because a reader of a table
 * of pairs will ask why it stops at two: nothing has measured a need for three, and this table is
 * exactly the evidence that would show one.
 *
 * IT DOES NOT SURVIVE THE PRUNE and the row says so, because a pair is read off the rows themselves
 * and the stretch summary the prune keeps carries no ordering at all.
 */
function Sequences({ rows, developer }: { rows: SequenceRow[]; developer: boolean }) {
  if (rows.length === 0) {
    return (
      <Empty message={t('dev.usage.noAgentHasMadeTwoRequestsIn')} />
    )
  }
  return (
    <ul className="usage-rows">
      {rows.map((row) => (
        <li key={`${row.from}-${row.to}`} className="usage-row usage-row-flat">
          <span className="usage-row-what">
            {row.from} <span aria-hidden="true">→</span> {row.to}
          </span>
          <span className="usage-row-cost">
            {t('dev.usage.in', { value1: t('dev.usage.countTime', { n: row.occurrences }), value2: t('dev.usage.countPieceOfWork', { n: row.traces }) })}
            {developer ? t('dev.usage.across', { value1: t('dev.usage.countStretch', { n: row.stretches }) }) : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * WHERE TWO AGENTS' WORK KEEPS MEETING, AND WHY THERE IS NOTHING TO DRAW.
 *
 * The overlap read exists. It takes no window parameter and it answers about what overlaps RIGHT
 * NOW, which is a different question from what overlapped over the range this page is showing.
 * Drawing today's overlaps under a heading that says *keeps meeting* would put current state on a
 * page about the past, with nothing red anywhere.
 *
 * So the rule is: rows are drawn only when the read says which window it honoured. Until it does,
 * this section draws none and says why.
 */
export interface OverlapReply {
  window?: { from: string; to: string } | null
  overlaps?: { key: string; overlapClass: string; subject?: string }[]
}

/** One hotspot as this page draws it: the thing two people are both in, and the class in its own word. */
export interface HotspotRow {
  key: string
  /** The shared path or record the overlap is about. */
  subject: string | null
  /**
   * The class's word from the Work Domain thread's own list, or null when that list has no row for
   * it. Null is drawn as "a kind of overlap with no word yet" and NEVER as the stored key: a
   * reader of `#/agent-use` in Normal mode may not be shown `write_write`.
   */
  word: string | null
}

/** What the reader is told when the read cannot answer about a range. */
export const HOTSPOTS_ANSWER_ABOUT_NOW =
  en['dev.usage.hotspotsNow']

/**
 * WHICH KINDS OF MEETING A PAST RANGE WOULD SHOW, AND THE ONE IT WOULD LOSE.
 *
 * §9.4a asks this band for five of the six classes over a past range and for the SIXTH TO BE NAMED
 * with the reason. It drew none of the six and its one sentence named no class at all, so a reader
 * was told the band was empty and never told what was missing from it.
 *
 * The words and the split both come from `@shared/workdomain.ts`. Nothing here decides which class
 * is lost and nothing here writes a class key. A test deleted on 13 November 2026 walked `src/web` for a quoted
 * key, comments included, because a second list in a component is the defect that walk was for.
 */
export function hotspotClassesOverAPastRange(): { five: string[]; lost: string[]; why: string } {
  return {
    five: OVERLAP_OVER_A_PAST_RANGE.map(overlapWord),
    lost: OVERLAP_NEEDS_THE_LIVE_INDEX.map(overlapWord),
    // The English is `WHY_A_PAST_RANGE_LOSES_IT`, which the word list's English entry reads.
    why: t('devWords.overlap.whyAPastRangeLosesIt'),
  }
}

/**
 * A CLASS'S WORD IN THE PAGE'S LANGUAGE. The English entry of each is `OVERLAP_CLASSES[key].word`
 * itself (src/shared/words/en.ts), so the Work Domain thread's list stays the one place the English is.
 */
function overlapWord(key: OverlapClass): string {
  return t(`devWords.overlap.${key}`)
}

/**
 * WHICH HOTSPOT ROWS MAY BE DRAWN, WHICH IS NONE UNLESS THE READ SAID WHICH WINDOW IT HONOURED.
 *
 * IT IS A FUNCTION SO THAT A TEST CAN HOLD THE RULE. The failure this stops is not an absent route:
 * the overlap read exists and answers 200. It is a PRESENT route that answers about right now, drawn
 * under a heading that says *keeps meeting*, on a page that says it covers a range. Current state as
 * history, with nothing red anywhere.
 */
export function hotspotRows(reply: OverlapReply): HotspotRow[] | null {
  if ((reply.window ?? null) === null) return null
  return (reply.overlaps ?? []).map((row) => ({
    key: row.key,
    // NEVER `row.key`, WHICH IS A COMPOSITE OF TWO RECORD IDS AND A PATH. It was drawn raw here,
    // latent only because the band draws nothing today; the day the read gains a window it would
    // have put `a|b|src/shared/time.ts` on a Normal-mode screen at 1440 and at 390.
    subject: row.subject ?? null,
    // THE WORD COMES FROM THE WORK DOMAIN THREAD'S OWN LIST, read here rather than restated. A
    // component that compares against a class key of its own is the defect this repository is named
    // after. A test deleted on 13 November 2026 walked `src/web` for exactly that shape, comments included, so
    // this comment names none either.
    word: Object.hasOwn(OVERLAP_CLASSES, row.overlapClass) ? overlapWord(row.overlapClass as OverlapClass) : null,
  }))
}

function Hotspots() {
  const [overlaps] = useProjectAsync(() => api.workDomainOverlaps(), [])
  if (overlaps.status === 'loading') return <Loading label={t('dev.usage.readingTheOverlaps')} what={t('dev.usage.overlaps')} />
  if (overlaps.status === 'error') return <ErrorNote message={overlaps.message} fault={overlaps.fault} />
  const rows = hotspotRows(overlaps.value as OverlapReply)
  if (rows === null) {
    const { five, lost, why } = hotspotClassesOverAPastRange()
    return (
      <Empty
        message={
          <>
            <p className="usage-note">{t('dev.usage.hotspotsNow')}</p>
            {/* THE STEP'S OTHER HALF: which kinds a past range would show, and which one it loses.
                Drawn whether or not the band has rows, because "what is missing from this" is not a
                fact about today's answer. */}
            <p className="usage-note">{t('dev.usage.pastClasses', { n: five.length, kinds: five.join('; ') })}</p>
            <p className="usage-note">{t('dev.usage.pastLost', { kinds: lost.join('; '), why })}</p>
          </>
        }
      />
    )
  }
  return (
    <ul className="usage-rows">
      {rows.map((row) => (
        <li key={row.key} className="usage-row usage-row-flat">
          <span className="usage-row-what">
            {row.subject ?? (
              <Absence
                tier="told-apart"
                looked={false}
                word={t('dev.usage.notRecorded')}
                title={t('dev.usage.thisOverlapArrivedWithoutThePathOr')}
              />
            )}
          </span>
          <span className="usage-row-cost">
            {row.word ?? (
              <Absence
                tier="told-apart"
                looked
                word={t('dev.usage.noWordYet')}
                title={t('dev.usage.theWorkDomainThreadDeclaresNoWord')}
              />
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * HOW LONG AGENTS SPENT WORKING, REPORTING, STANDING BY AND BLOCKED — AND WHY IT IS EMPTY.
 *
 * This page is meant to show fourteen lifecycle measurements. Eight of them need a durable record of every
 * state transition, and nothing in this product has ever recorded what an agent was supposed to be
 * doing. The other six need attachment records, and there is no attachment kind either.
 *
 * THE NUMBERS READ "NINE" AND "FIVE" HERE AND IN telemetry.md T2.1 until wave 13's verification
 * counted the column: the table has six rows needing nothing new and eight needing the store. The
 * measured answer does not move — there is no attachment kind, so the six are zero too.
 *
 * SO THE NUMBER CANNOT BE ANSWERED ABOUT THIS CAMPAIGN, and the page says so rather than drawing a
 * zero. *Do not fabricate historical transition timestamps that Mole Office never observed. Absence is
 * better than invented precision.* A zero here would be invented precision with a tidy face.
 *
 * WHAT THE REQUEST LOG COULD SAY TODAY is the last row: the last time anything arrived claiming to be
 * a given agent. That is a heartbeat, not a work state, and the limit travels with it — an actor id
 * is what the caller said it was. No read sends that time to this page yet, so the row says it is not
 * shown here (wave 13y round 142). A count of requests drawn there did not say when, and "never
 * recorded" would be false, since the request log holds each call's time and whom it claimed to be.
 */
function Lifecycle() {
  return (
    <>
      <p className="usage-note">{t('dev.usage.workingTimeIsCountedFromTheMoment')}</p>
      <ul className="usage-rows">
        <li className="usage-row usage-row-flat">
          <span className="usage-row-what">{t('dev.usage.workingReportingStandingByAndBlockedTime')}</span>
          <span className="usage-row-cost">
            {/* AN ABSENCE IS A WORD AND NOT A PARAGRAPH, and `looked` is false because nobody ever
                did: there is no store to have looked in. The sentence survives on the tooltip and is
                read out, so a reader who wants the reason gets it without the page paying for it. */}
            <Absence
              tier="told-apart"
              looked={false}
              word={t('dev.usage.neverRecorded')}
              title={t('dev.usage.moleOfficeHasNeverRecordedWhenAn')}
            />
          </span>
        </li>
        <li className="usage-row usage-row-flat">
          <span className="usage-row-what">{t('dev.usage.attachmentsProviderFailuresAndChildRuntime')}</span>
          <span className="usage-row-cost">
            <Absence
              tier="told-apart"
              looked={false}
              word={t('dev.usage.neverFiled')}
              title={t('dev.usage.theseAreReadFromAnAttachmentS')}
            />
          </span>
        </li>
        <li className="usage-row usage-row-flat">
          <span className="usage-row-what">{t('dev.usage.automaticResumesOwnerWakesAndWatchdogWakes')}</span>
          <span className="usage-row-cost">
            <Absence
              tier="told-apart"
              looked={false}
              word={t('dev.usage.neverRecorded')}
              title={t('dev.usage.aWakeIsCountedFromTheTransition')}
            />
          </span>
        </li>
        <li className="usage-row usage-row-flat">
          <span className="usage-row-what">{t('dev.usage.whenSomethingLastArrivedClaimingToBe')}</span>
          <span className="usage-row-cost">
            <Absence
              tier="told-apart"
              looked={false}
              word={t('dev.usage.notShownOnThisPageYet')}
              title={t('dev.usage.theRequestLogHoldsThisTimeBut')}
            />
          </span>
        </li>
      </ul>
    </>
  )
}

const USAGE_CSS = `
.usage-lede { color: var(--text-2); max-width: 62ch; }
.usage-note { color: var(--text-2); max-width: 68ch; font-size: 0.9375rem; }
.usage-window { margin-bottom: 1.25rem; }
.usage-window p { margin: 0.25rem 0; color: var(--text-2); }
.usage-developer { color: var(--text-3); font-size: 0.875rem; }
.usage-rows { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; }
.usage-row { border-top: 1px solid var(--border); }
.usage-row:first-child { border-top: 0; }
.usage-row-open,
.usage-row-flat {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  align-items: baseline;
  width: 100%;
  min-height: var(--row-h);
  padding: 0.5rem 0;
  background: none;
  border: 0;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.usage-row-flat { cursor: default; }
.usage-row-open:hover { background: var(--surface-2); }
.usage-row-what { flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; }
.usage-row-when { color: var(--text-3); font-variant-numeric: tabular-nums; }
.usage-row-cost { color: var(--text-2); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.usage-row-note { flex: 1 1 100%; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.usage-row-more { padding: 0 0 0.75rem; color: var(--text-2); }
.usage-row-more p { margin: 0.25rem 0; }
.usage-more { margin-top: 0.5rem; min-height: var(--row-h); background: none; border: 1px solid var(--border); border-radius: var(--radius-1); color: inherit; font: inherit; padding: 0 0.75rem; cursor: pointer; }
.usage-readback, .usage-nowords, .usage-approaching { margin-top: 1.25rem; }
.usage-readback h3, .usage-nowords h3, .usage-approaching h3 { margin: 0; font-size: 1rem; }
.usage-quiet { opacity: 0.75; margin-top: 0.75rem; }
.usage-events { margin: 0.5rem 0 0; padding-left: 1.25rem; color: var(--text-3); font-size: 0.875rem; font-variant-numeric: tabular-nums; }
.usage-events li { overflow-wrap: anywhere; }
`
