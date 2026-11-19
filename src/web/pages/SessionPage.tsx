// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/session/<id>` — ONE AGENT RUN'S OWN PAGE. Criterion E2.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A RUN HAS A PAGE, AND THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * A run gets a separate entry and interface. A report had named the
 * record kinds still without a page of their own. A decision names session, and the message page
 * had already built the pattern for a page that is a page of its own (merged as
 * `df4a2bdd`). This is the second such page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE DRAWS THAT THE RECORD PAGE DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The record page at `#/r/<id>` still opens a run, plainly, and that is the fallback the design keeps
 * for a caller that holds only an id. This page is what a list that KNOWS the kind links to, and it
 * draws one run as the thing it is:
 *
 *   · who it served, who started it, the state it ended in and how it closed;
 *   · when it started, and when it last spoke or was closed;
 *   · where it ran — the runtime, the model, the working directory and the branch it was cut from;
 *   · what it is filed under, from the server's own placement answer;
 *   · the check on it, through `TheCheckOnARun`, which is the same reader of the same stored fields
 *     that GET /api/checks/<run> answers from;
 *   · the report it named when it was released, as one press onto that record;
 *   · the office's own timeline of the run — every call it made, in order, with its polls folded —
 *     which until now had a door and no page.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE CHECK IS DRAWN FROM THE RECORD AND NOT FROM GET /api/checks/<run>
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/checks/<run> re-reads the run's git tip to verify the seal, and it refuses with a 409
 * when the recorded worktree is gone — which is true of every run whose checkout has since been
 * removed, and those are exactly the runs a reader most wants to read. A page that failed on them
 * would be worse than no page. The record holds `released`, `refused`, `confirmed` and `theCheck`,
 * and `howARunStands` in src/shared/releasing.ts is the reader the door itself uses, so this page
 * draws the same five standings the door would answer, from the door that always works.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOORS ARE THE ONES THAT EXIST
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/records/:id for what was written down; GET /api/sessions/:id for what is observable now
 * and for the placement the server works out; GET /api/sessions/:id/timeline for the office's own
 * call log; and GET /api/participants for the registries that turn an id into a name. No server door
 * was added, and the page writes nothing.
 */

import { useRef, useState, type ReactNode } from 'react'
import { consumePreparedPage, peekPreparedPage } from '../lib/prepared-page.ts'
import { saysStillGoing, type PanelRecord } from '@shared/types.ts'
import { t } from '@shared/i18n.ts'
import { isClosedHow } from '@shared/lifecycle.ts'
import { howARunStands } from '@shared/releasing.ts'
import type { TheRunThatAskedForAWorker, TheWorkersARunStarted } from '@shared/worker-runs.ts'
import type { ReportConfirmation } from '@shared/releasing.ts'
import { theModelThatAnsweredSentence } from '@shared/session-page.ts'
import { changeOpWord, stateWord } from '@shared/words.ts'
import { api, type ParticipantOnTheWire, type ParticipantsReply } from '../api.ts'
import type { SessionDetailReply } from '../../server/api/sessions.ts'
import type { SessionTimeline, TimelineCallEntry, TimelineFoldEntry } from '../../server/lib/sessions.ts'
import { drawnDayWithTime, ErrorNote, Loading, Panel, Stamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { CheckPanelStyle, TheCheckOnARun } from '../components/TheCheckOnARun.tsx'
import { TheRunThatAskedForIt, TheWorkersOfARun } from '../components/TheWorkersOfARun.tsx'
import { RouteLink, recordPath, sessionPath, whoPath } from '../components/router.tsx'
import { ItsProcessMark, placementSentence } from '../components/SessionPanel.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
import { Crumbs } from './RecordPage.tsx'
import { titleOrSentence, useRecordTitles } from '../lib/titles.ts'
import { useInspect } from '../lib/mode.ts'

/** Everything the page reads, in one request group so the page cannot draw half of it. */
interface TheRun {
  record: PanelRecord
  session: SessionDetailReply['session']
  timeline: SessionTimeline
  everybody: ParticipantsReply
  /** The workers the run asked the office to start, as the record's answer reads them, or null when it asked for none. */
  workers: TheWorkersARunStarted | null
  /** On a worker's run, the supervisor's run that asked for it, as the record's answer reads it, or null when none did. */
  askedForBy: TheRunThatAskedForAWorker | null
  reportConfirmation?: ReportConfirmation
  /** When this office read the run's own process as starting, as the session's answer reads it, or null. */
  startThisOfficeRead: string | null
}

/** The page. One run by id, with the registries that turn an id into a name. */
export async function loadSessionPage(id: string): Promise<TheRun> {
    const [detail, sessionDetail, timeline, everybody] = await Promise.all([
      api.getRecord(id),
      api.getSession(id),
      api.getSessionTimeline(id),
      api.participants(),
    ])
    return {
      record: detail.record,
      session: sessionDetail.session,
      timeline,
      everybody,
      workers: detail.workers ?? null,
      askedForBy: detail.askedForBy ?? null,
      ...(detail.reportConfirmation === undefined ? {} : { reportConfirmation: detail.reportConfirmation }),
      startThisOfficeRead: sessionDetail.startThisOfficeRead,
    }
}

export function SessionPage({ id }: { id: string }) {
  const [held] = useState(() => peekPreparedPage<TheRun>(sessionPath(id)))
  const used = useRef(false)
  const ready = used.current || held === undefined ? undefined : peekPreparedPage(sessionPath(id), held)
  const [state, reload] = useProjectAsync<TheRun>(() => {
    if (ready !== undefined && !used.current) { used.current = true; consumePreparedPage(ready); return Promise.resolve(ready.value) }
    used.current = true
    return loadSessionPage(id)
  }, [id], ready === undefined ? {} : { startFrom: { value: ready.value } })
  return (
    <div className="page sp">
      <style href="mole-office-session" precedence="default">
        {SESSION_CSS}
      </style>
      {state.status === 'loading' ? <Loading what={t('runPage.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheRunView key={id} run={state.value} onChanged={reload} /> : null}
    </div>
  )
}

/** One value's label in the facts list. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sp-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A string field off a stored record's data, or null when it is not a non-empty string. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Draw the unassigned reason in this page's language; keep a server sentence for an unknown reason. */
function filedUnderInPageLanguage(placement: SessionDetailReply['session']['placement']): string | null {
  if (placement.kind !== 'unassigned') return placementSentence(placement)

  const reason = placement.reason as { why?: unknown; linked?: unknown; touched?: unknown } | null
  switch (reason?.why) {
    case 'not-filed':
      return t('runPage.placement.not-filed')
    case 'wrote-nothing':
      return t('runPage.placement.wrote-nothing')
    case 'reaches-nothing': {
      if (typeof reason.linked !== 'number' || typeof reason.touched !== 'number') return placement.sentence
      return t('runPage.placement.reaches-nothing', {
        n: reason.linked,
        touched: t('runPage.placement.touched', { n: reason.touched }),
      })
    }
    case 'nothing-read':
      return t('runPage.placement.nothing-read')
    case 'not-asked-for':
      return t('runPage.placement.not-asked-for')
    default:
      // An unknown reason keeps the server's own sentence. It is an honest answer this page has no word for yet.
      return placement.sentence
  }
}

/** The normal page says what the totals mean; inspect mode keeps the server's full note. */
function timelineSummary(timeline: SessionTimeline): string {
  const folded = t('runPage.timeline.folded', { n: timeline.totals.folded })
  const summary = t('runPage.timeline.summary', { n: timeline.totals.calls, folded })
  return timeline.totals.capped ? `${summary} ${t('runPage.timeline.capped')}` : summary
}

/** The registry id of the first agent in `ranAs`, or null. The older spelling of `servingAgent`. */
function ranAsAgent(data: Record<string, unknown>): string | null {
  const held = data['ranAs']
  if (!Array.isArray(held)) return null
  for (const one of held) {
    if (typeof one !== 'object' || one === null || Array.isArray(one)) continue
    const id = (one as Record<string, unknown>)['agentId']
    if (typeof id === 'string' && id !== '') return id
  }
  return null
}

/** The name a registry gives an agent, or null when the registry does not hold it. */
function agentName(everybody: ParticipantsReply, id: string | null): string | null {
  if (id === null) return null
  const found = everybody.agents.find((one: ParticipantOnTheWire) => one.id === id)
  return found?.name ?? null
}

/**
 * THE REGISTRY ID A RUN'S OWN `servingAgent` NAMES, or the string itself where nothing answers.
 *
 * `servingAgent` is stored as the agent's HANDLE (criterion I7 keeps it that way and writes the id
 * beside it as `servingAgentId`). A page that addressed the citizen by that handle would send the
 * reader to a page addressed by an id, which is the wrong page or no page at all. So the id is read
 * where the record carries one, and otherwise the handle is resolved here: an exact id first, then
 * the one live agent bearing that string as a handle, then the string itself — the same reading a
 * stored reference gets (criterion I2), and the fallback is drawn as a name rather than a link.
 */
function theRegistryIdOf(everybody: ParticipantsReply, reference: string | null): string | null {
  if (reference === null) return null
  const byId = everybody.agents.find((one: ParticipantOnTheWire) => one.id === reference)
  if (byId !== undefined) return byId.id
  const byHandle = everybody.agents.find((one: ParticipantOnTheWire) => one.handle === reference && one.retired !== true)
  return byHandle?.id ?? reference
}

/** The words and address for a participant the run reported to, from the registry or the id. */
function personWords(everybody: ParticipantsReply, ref: { kind: 'agent' | 'person'; id: string }) {
  const found: ParticipantOnTheWire | undefined =
    ref.kind === 'agent' ? everybody.agents.find((one) => one.id === ref.id) : everybody.people.find((one) => one.id === ref.id)
  // A REGISTRY WITH NO NAME FOR THEM STILL NAMES THEM. Drawing "agent" alone would be a word
  // standing where a person belongs, so the kind and the id are said together, the way WorldsPage
  // and the Embassy already say a participant nothing has named.
  const unnamed = ref.kind === 'agent' ? t('devWords.worlds.who.agent', { id: ref.id }) : t('devWords.worlds.who.person', { id: ref.id })
  return { name: found?.name ?? unnamed, id: ref.id, to: whoPath(ref.kind, ref.id) }
}

/**
 * THE RUN, GIVEN WHAT WAS READ.
 *
 * Exported so a test can hold the drawing still without a server, the way `TheMessageView` is.
 */
export function TheRunView({
  run,
  onChanged,
}: {
  run: TheRun
  onChanged?: () => void
}) {
  const { record, session, timeline, everybody, workers, askedForBy, startThisOfficeRead } = run
  const data = record.data
  const stands = howARunStands(data, undefined, run.reportConfirmation)
  const inspecting = useInspect()

  // WHO IT SERVED. The durable agent the run is. The record's own `servingAgentId` is the registry
  // id where it was written; where only the stored `servingAgent` handle (or the older `ranAs`) is
  // there, it is resolved to the registry id so the name and the link both name the right agent.
  // `session.recordedAgent` is what the record calls its agent when no registry id was written, and
  // is never invented.
  const servingRef = str(data['servingAgentId']) ?? str(data['servingAgent']) ?? ranAsAgent(data)
  const servingId = theRegistryIdOf(everybody, servingRef)
  const served = agentName(everybody, servingId) ?? session.recordedAgent ?? servingId

  // WHO STARTED IT. A worker's run names the agent who asked for it. Every other run names the person
  // or agent its release reported to, or says nobody recorded it.
  const started = askedForBy !== null
    ? { kind: 'agent' as const, id: askedForBy.askerId }
    : stands.released?.reportedTo ?? null
  const startedWords = started === null ? null : personWords(everybody, started)

  // ITS STATE, AND HOW IT CLOSED. The state is the run's own word, read through the table so an
  // unclassified value is named rather than printed. The close is the sentence the closer wrote, or
  // the meaning of the stored close word when nobody wrote one.
  const stateNow = str(data['state']) ?? session.state
  const stateSaid = stateWord(stateNow, 'normal', 'session').text
  const closedBecause = str(data['closedBecause']) ?? str(data['detail'])
  const closedHow = isClosedHow(data['closedHow']) ? t(`runPage.closedHow.${data['closedHow']}` as const) : null
  const closedSaid = stands.closedUnchecked?.because ?? closedBecause ?? closedHow

  // WHEN. The run's own start, and the last moment it spoke or was closed. Absent is an absence: a record that holds no
  // start says so, and the moment the office first recorded it is named as that, never as the start (wave 13y round 34).
  const startedAt = str(data['startedAt'])
  const lastOutputAt = str(data['lastOutputAt'])
  const closedAt = str(data['closedAt']) ?? stands.closedUnchecked?.at ?? null
  // ONLY A RUN STILL GOING IS SAID NOT TO HAVE ENDED. With neither time recorded, the page said so of every run, a crashed
  // one too (wave 13s round 54).
  const stillGoing = saysStillGoing(stateNow) && closedSaid === null

  // WHERE IT RAN.
  // `unrecorded` is the server's machine word for a run that named no runtime it knows
  // (src/server/lib/sessions.ts), so it is drawn as the absence it is.
  const runtime = str(data['runtime']) ?? (session.tool === 'unrecorded' ? null : session.tool)
  const model = str(data['model'])
  // AND THE MODEL THAT ANSWERED, when it is not the one the run was registered for (problem VBtbw0hSO1E2).
  const answered = theModelThatAnsweredSentence(data['model'], data['served'], inspecting)
  const directory = str(data['workingDirectory']) ?? session.cwd
  const cutFrom = str(data['cutFrom'])
  const filedUnder = filedUnderInPageLanguage(session.placement)

  // THE REPORT IT NAMED, and one press onto it.
  const reportId = stands.released?.report ?? null
  const titles = useRecordTitles(reportId === null ? [] : [reportId])

  return (
    <>
      <header className="sp-head">
        <h1 className="sp-title wrap-anywhere">{record.title}</h1>
        <Crumbs record={{ kind: 'session', title: record.title }} />
      </header>

      {/* THE RUN'S FACTS BESIDE WHAT IT DID, by the product's one width rule in components/SideBySide.tsx.
          The facts are written first, so a narrow screen reads them above the timeline as it always
          has. On a wide screen the timeline takes the wider first column and the facts stand beside
          it, where a record's page puts the facts around a record. */}
      <SideBySide className="sp-sides">
      <div className="sp-side" data-column="end">
      {/* WHAT THE RUN IS: who it served, who started it, where it stands and how it closed. */}
      <Panel titleIs="label" declares={{ surface: 'session.what' }} title={t('runPage.whatTitle')}>
        <dl className="sp-facts">
          <Fact label={t('runPage.served')}>
            {served === null ? (
              <span className="sp-none">{t('runPage.servedUnknown')}</span>
            ) : servingId === null ? (
              <span className="sp-value">{served}</span>
            ) : (
              <RouteLink to={whoPath('agent', servingId)}>{served}</RouteLink>
            )}
          </Fact>
          <Fact label={t('record.section.startedBy')}>
            {startedWords === null ? (
              <span className="sp-none">{t('runPage.startedByUnknown')}</span>
            ) : (
              <RouteLink to={startedWords.to}>
                <span className="sp-value">{startedWords.name}</span>
              </RouteLink>
            )}
          </Fact>
          <Fact label={t('runPage.state')}>
            <span className="sp-value">{stateSaid}</span>
            {/* WHAT THE OFFICE SAW OF ITS PROCESS, when it was filed by hand and says it is running. */}
            {session.itsProcess === null ? null : <> <ItsProcessMark its={session.itsProcess} /></>}
          </Fact>
          <Fact label={t('runPage.closed')}>
            {closedSaid === null ? (
              <span className="sp-none">{t('runPage.noClosing')}</span>
            ) : (
              <span className="sp-value">{closedSaid}</span>
            )}
          </Fact>
          <Fact label={t('runPage.started')}>
            {startedAt !== null ? (
              <Stamp at={startedAt} />
            ) : startThisOfficeRead !== null ? (
              <span className="sp-value">{t('runPage.startTheOfficeRead', { time: drawnDayWithTime(startThisOfficeRead) })}</span>
            ) : (
              <>
                <span className="sp-none">{t('runPage.startUnknown')}</span>
                <span className="sp-none">{t('runPage.firstRecorded', { time: drawnDayWithTime(record.createdAt) })}</span>
              </>
            )}
          </Fact>
          <Fact label={closedAt === null ? t('runPage.lastOutput') : t('runPage.ended')}>
            {closedAt !== null ? (
              <Stamp at={closedAt} />
            ) : lastOutputAt !== null ? (
              <Stamp at={lastOutputAt} />
            ) : stillGoing ? (
              <span className="sp-none">{t('runPage.stillOpen')}</span>
            ) : (
              <span className="sp-none">{t('runPage.neitherTimeRecorded')}</span>
            )}
          </Fact>
        </dl>
      </Panel>

      {/* WHERE IT RAN, and what it is filed under. */}
      <Panel titleIs="label" declares={{ surface: 'session.where' }} title={t('g6a.sessions.whereItRan2')}>
        <dl className="sp-facts">
          <Fact label={t('record.section.runtime')}>
            {runtime === null ? <span className="sp-none">{t('runPage.notRecorded')}</span> : <span className="sp-value">{runtime}</span>}
          </Fact>
          <Fact label={t('record.section.model')}>
            {model === null ? <span className="sp-none">{t('runPage.notRecorded')}</span> : <span className="sp-value">{model}</span>}
            {answered === null ? null : (
              <span className={answered.differs ? 'sp-answered sp-differs' : 'sp-answered sp-none'}>{answered.text}</span>
            )}
          </Fact>
          <Fact label={t('record.section.workingDirectory')}>
            {directory === null ? (
              <span className="sp-none">{t('runPage.notRecorded')}</span>
            ) : (
              <span className="sp-value wrap-anywhere">{directory}</span>
            )}
          </Fact>
          <Fact label={t('record.section.cutFrom')}>
            {cutFrom === null ? <span className="sp-none">{t('runPage.notRecorded')}</span> : <span className="sp-value">{cutFrom}</span>}
          </Fact>
          <Fact label={t('runPage.filedUnder')}>
            {filedUnder === null ? <span className="sp-none">{t('runPage.notRecorded')}</span> : <span className="sp-value">{filedUnder}</span>}
          </Fact>
        </dl>
      </Panel>

      {/* ON A WORKER'S RUN, THE SUPERVISOR'S RUN THAT ASKED FOR IT, leading to that run. Wave 13j round loop-5. The panel
          draws nothing on a run no run asked for. */}
      <TheRunThatAskedForIt askedForBy={askedForBy} titleIs="label" />

      {/* THE CHECK ON THIS RUN, and where it stands after it reported. Criteria C27 and C29. The
          panel draws nothing on a run nobody has finished and nobody has checked. */}
      <CheckPanelStyle />
      <TheCheckOnARun record={record} participants={everybody} reportConfirmation={run.reportConfirmation} titleIs="label" {...(onChanged === undefined ? {} : { onChanged })} />

      {/* THE WORKERS THIS RUN ASKED THE OFFICE TO START, each opening its own run. Wave 13j round loop-4. The
          panel draws nothing on a run that asked for none. */}
      <TheWorkersOfARun workers={workers} titleIs="label" />

      {/* THE REPORT THIS RUN NAMED, with one press onto it. */}
      <Panel titleIs="label" declares={{ surface: 'session.report' }} title={t('runPage.reportTitle')}>
        {reportId === null ? (
          <p className="sp-none">{t('runPage.noReport')}</p>
        ) : (
          <p className="sp-report">
            <RouteLink to={recordPath(reportId, 'report')}>{titleOrSentence(titles, reportId)}</RouteLink>
          </p>
        )}
      </Panel>

      </div>

      <div className="sp-main" data-column="start">
      {/* THE OFFICE'S OWN TIMELINE OF THE RUN: every call it made, in order, with its polls folded,
          and the records it changed beside them. Decision 6eb61657's door, drawn here. */}
      <Panel titleIs="label" declares={{ surface: 'session.did' }} title={t('runPage.didTitle')}>
        <p className="sp-said sp-summary">{inspecting ? timeline.note : timelineSummary(timeline)}</p>
        {timeline.entries.length === 0 ? (
          <p className="sp-none">{t('runPage.noCalls')}</p>
        ) : (
          <ol className="sp-calls">
            {timeline.entries.map((entry, i) => (
              <OneCall key={i} entry={entry} />
            ))}
          </ol>
        )}
        <h3 className="sp-sub">{t('runPage.changesTitle')}</h3>
        {timeline.changes.length === 0 ? (
          <p className="sp-none">{t('runPage.noChanges')}</p>
        ) : (
          <ul className="sp-changes">
            {timeline.changes.map((change, i) => (
              <li key={i} className="sp-change">
                <Stamp at={change.at} />
                <span className="sp-op">{changeOpWord(change.op).text}</span>
                {change.recordTitle === null ? (
                  <RouteLink to={recordPath(change.recordId)}>{change.recordId}</RouteLink>
                ) : (
                  <RouteLink to={recordPath(change.recordId)}>{change.recordTitle}</RouteLink>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      </div>
      </SideBySide>
    </>
  )
}

/** One line of the run's own timeline: a single call, or a run of polls folded into one line. */
function OneCall({ entry }: { entry: TimelineCallEntry | TimelineFoldEntry }) {
  const at = entry.type === 'folded' ? entry.first : entry.at
  const operation = entry.operation
  return (
    <li className="sp-call">
      <Stamp at={at} />
      <span className="sp-op">
        {operation === null ? t('runPage.operationUnknown') : operation}
      </span>
      {entry.type === 'folded' ? <span className="sp-said">{t('runPage.foldedAsks', { n: entry.count })}</span> : null}
      {entry.target === null ? null : (
        <RouteLink to={recordPath(entry.target.id)}>
          {entry.target.title === null ? entry.target.id : entry.target.title}
        </RouteLink>
      )}
    </li>
  )
}

/**
 * THIS PAGE'S OWN RULES. Stylesheets for one page live with the page, the way the message page's do;
 * every value is a token and no colour or type size is written out here.
 */
const SESSION_CSS = `
.sp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.sp-head { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.sp-title { margin: 0; font-size: var(--fs-5); overflow-wrap: anywhere; }
/* THE FACTS AND THE TIMELINE: the one width rule's columns, each a stack with the page's own gap. */
.sp-sides { gap: var(--gut); }
.sp-main, .sp-side { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.sp-facts { display: flex; flex-direction: column; gap: 0.3rem; margin: 0; }
.sp-fact { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.sp-fact dt { color: var(--text-3); font-size: var(--fs-1); min-width: 8rem; }
.sp-fact dd { margin: 0; display: flex; gap: 0.4rem; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.sp-value { overflow-wrap: anywhere; }
.sp-none { color: var(--text-2); }
.sp-answered { flex-basis: 100%; overflow-wrap: anywhere; line-height: var(--lh-body); }
.sp-differs { font-weight: var(--alarm-raised-weight); }

.sp-report { margin: 0; line-height: var(--lh-body); }
.sp-said { margin: 0 0 var(--pad); color: var(--text-2); line-height: var(--lh-body); }
.sp-sub { margin: var(--pad) 0 0; font-size: var(--fs-1); font-weight: 600; color: var(--text-2); }

.sp-calls, .sp-changes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.sp-call, .sp-change { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.sp-op { font-weight: 600; overflow-wrap: anywhere; }
`
