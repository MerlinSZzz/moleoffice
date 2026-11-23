// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useWordGeneration } from '../../lib/word-settings.ts'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AttentionRow } from '@shared/attention.ts'
import type { DueForm } from '@shared/deadlines.ts'
import { readDueStamp } from '../../lib/attention.ts'
import type { Rung } from '@shared/detail.ts'
import { RESIDENCY_PROPOSAL } from '@shared/residents.ts'
import { THE_PERSON } from '@shared/person.ts'
import { RAIL_WORD_KEYS } from '@shared/surfaces.ts'
import { content, count, t } from '@shared/i18n.ts'
import type { AttentionHome, RecordDetail } from '../../api.ts'
import { api } from '../../api.ts'
import { wordsAt } from '@shared/detailsource.ts'
import { familyPath, pathFor, recordPath } from '../router.tsx'
import { currentWorkspace, setWorkspace } from '../../lib/workspace.ts'
import { OnePressCard } from '../OnePress.tsx'
import { ACT_WORDS, aWaitingRowIsARecord, oneNumber, theNameASelfRegistrationIsReadBy, theRowsWords, whereAWaitingRowGoes, type WaitingItem, type WaitingReply } from '../../lib/waiting.ts'
import { targetAttributes } from '@shared/targets.ts'
import { DRAWS_THE_NAME } from '../agent/pointing.ts'
import { Absence, type AsyncState, latePhrase, theSameAnswer } from '../ui.tsx'
import type { PipelinesStandingStill } from '@shared/pipelines-standing-still.ts'
import { standingStillLine } from './pipeline-line.ts'
import { useProjectAsync } from '../../lib/project-async.ts'
import type { WorkspacesReply } from '../../../server/api/workspaces.ts'
import type { ClaimOnTheWire } from '@shared/claims.ts'
import { readClaimsOnce } from '../../lib/homereads.ts'
import { useInspect } from '../../lib/mode.ts'
import { useNearTheScreen } from '../../lib/nearthescreen.ts'
import { readGroupsOnce } from '../../lib/oneread.ts'
import { useRecordTitles } from '../../lib/titles.ts'
import { conflictsByClaim, conflictWords, kindWords, useClaimantNames, type Conflict } from '../Claims.tsx'
import type { HomeRoster } from '../../../server/lib/working.ts'
import { READ_COST_FACTOR, ROSTER_ASK_FLOOR_MS, oneAsk } from '../../lib/oneask.ts'
import { useChannel, whenEventsWereLost } from '../../lib/channel.ts'
import type { ChannelEvent, EventName } from '@shared/events.ts'
import { HomeParts } from './HomeLayout.tsx'
import { HomeKeyItems } from './HomeKeyItems.tsx'
import { HomeFigureDrawn } from './HomeFigures.tsx'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { HOME_FIGURES, type HomePart } from '@shared/home-layout.ts'
import { alarmKind, HOME_ALARMS_SHOWN } from '@shared/attention-first-page.ts'
import { cannotTellIn, HomeAgentBars, theBarOf } from './HomeAgentBars.tsx'
import { useTheLineWithItsLinksInWords } from '../ChatLinks.tsx'
import { CUT_MARK, shortenToWords } from '@shared/shortening.ts'

type Workspace = WorkspacesReply['workspaces'][number]

interface ProjectReading {
  attention: AsyncState<AttentionHome>
  roster: AsyncState<HomeRoster>
}

interface ProjectReadingMap {
  [workspaceId: string]: ProjectReading | undefined
}

const READING: ProjectReading = { attention: { status: 'loading' }, roster: { status: 'loading' } }

type HomeRecordReader = (id: string, workspaceId: string) => Promise<RecordDetail>

function useHomeRecord(id: string, workspaceId: string, shouldRead: boolean, readRecord: HomeRecordReader) {
  const [reading] = useProjectAsync<RecordDetail | null>(
    () => shouldRead ? readRecord(id, workspaceId) : Promise.resolve(null),
    [id, workspaceId, shouldRead],
  )
  return reading
}

function titleAtHomeLength(record: RecordDetail['record'], rung: Rung, fallback: string): string {
  const answer = wordsAt(record, rung)
  return answer.kind === 'text' ? answer.text : fallback
}

/**
 * HOW MANY CHARACTERS OF A HOME ROW TITLE ARE DRAWN BEFORE IT IS CUT AT A WORD.
 *
 * Sixty is the length the repository already shows a quoted thing at (`SHOWN_CHARACTERS`), and it is
 * about two lines of this row at 390. A title longer than this is cut at a space and marked with
 * `CUT_MARK`, so a reader can tell a long name from one that ended there. Item 97, after a Home card
 * drew a title cut inside a word with no mark.
 */
export const A_HOME_ROW_TITLE_AT_MOST = 60

/** Count work the attention reading can prove is unfinished, and keep uncertainty visible. */
export function openCountFromAttention(reply: AttentionHome): { count: number | null; reason: string | null } {
  const { open, uncertain } = reply.openWork
  return uncertain === 0
    ? { count: open, reason: null }
    : { count: null, reason: t('home.projectOpenUncertain', { n: uncertain }) }
}

/**
 * HOME'S "N DAYS LATE", the work page chip's own words from the one count (`dueCount` through `latePhrase`), so the two
 * pages cannot say different numbers about one obligation (invariant 9). Round 27 found them a day apart: Home rounded
 * a part of a day up, so a date due by the end of yesterday read "1 day late" here and "under a day late" on the chip.
 */
export function alarmLateWords(dueMs: number, due: DueForm, readAt: number, zone?: string): string {
  return latePhrase(dueMs, readAt, zone, due)?.text ?? t('home.projectLate')
}

function alarmName(row: AttentionRow): string {
  const kind = alarmKind(row)
  if (kind === 'safety') return t('home.alarmSafety')
  if (kind === 'late') {
    // THE SAME COUNT AND THE SAME WORDS AS THE WORK PAGE'S CHIP, at the moment the server read the row (the due moment
    // plus how late it was). A due nobody can read says late with no number, rather than inventing one.
    const owed = row.reason.owed
    const read = owed?.due === null || owed?.due === undefined || owed.lateMs === null ? null : readDueStamp(owed.due)
    if (read === null || owed?.lateMs === null || owed?.lateMs === undefined) return t('home.projectLate')
    return alarmLateWords(read.ms, read.due, read.ms + owed.lateMs)
  }
  return kind === 'stopped' ? t('home.alarmStopped') : t('home.alarmPauseEnded')
}

function WaitingKindMark({ kind }: { kind: string }) {
  const glyph = kind === 'proposal' ? '?' : kind === 'goal' ? '◎' : kind === 'planning intent' ? '◷'
    : kind === 'visiting agent' || kind === 'visiting device' ? '↗' : kind === 'message' ? '✉'
      : kind === 'role request' ? '◇' : kind === 'report' ? '▤' : kind === 'task' ? '✓'
        : Array.from(kind)[0]?.toLocaleUpperCase() ?? '·'
  return <span className="hm-kind" data-kind={kind} aria-hidden="true">{glyph}</span>
}

export function HomeNeedsYou({
  waiting,
  homeRung = 'title',
  readRecord = (id, workspaceId) => api.getRecord(id, { workspaceId }),
  presses,
  shown,
  drawnAtTheTop,
}: {
  waiting: AsyncState<WaitingReply>
  homeRung?: Rung
  readRecord?: HomeRecordReader
  /** Rows that carry the person's own press, drawn inside the band under its list (the residency proposals). */
  presses?: ReactNode
  /**
   * HOW MANY ROWS ARE DRAWN, or every row when it is not given. Home gives NEEDS_SHOWN and a press to the
   * page that draws them all; that page gives nothing.
   */
  shown?: number
  /** The ids of the pairing requests Home draws as cards above its parts: no row is drawn for these, and each is counted. */
  drawnAtTheTop?: ReadonlySet<string>
}) {
  const items = waiting.status === 'ready' ? waiting.value.items : []
  // A RESIDENCY PROPOSAL IS COUNTED AND DRAWN ONCE: its row with the person's two presses is in `presses`, so the list leaves it
  // out when that slot is filled. A PAIRING REQUEST IS TOO: its card is drawn at the top of Home, so the list leaves out
  // the rows whose id is a credential drawn there, and only those. The number and "nothing needs you" still read the whole reading.
  const pressed = presses === undefined ? items : items.filter((item) => item.kind !== RESIDENCY_PROPOSAL)
  const every = drawnAtTheTop === undefined || drawnAtTheTop.size === 0 ? pressed : pressed.filter((item) => !drawnAtTheTop.has(item.id))
  const listed = shown === undefined ? every : every.slice(0, shown)
  // THE ONE NUMBER, from the function the governance queue's count reads too (tests/the-one-number.test.ts).
  const countWord = waiting.status === 'ready' ? count(oneNumber(waiting.value)) : '—'
  const reason = waiting.status === 'error' ? t('home.waitingFailed') : t('home.waitingReading')
  const list = useRef<HTMLUListElement>(null)
  const known = useRef<Set<string> | null>(null)
  const timers = useRef(new Set<number>())
  useEffect(() => () => { for (const timer of timers.current) window.clearTimeout(timer) }, [])
  useLayoutEffect(() => {
    if (waiting.status !== 'ready') return
    const current = new Set(items.map((item) => `${item.workspaceId}:${item.id}`))
    const previous = known.current
    known.current = current
    if (previous === null) return
    const root = getComputedStyle(document.documentElement)
    const ms = (name: string) => {
      const value = root.getPropertyValue(name).trim()
      return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    listed.forEach((item, index) => {
      if (previous.has(`${item.workspaceId}:${item.id}`)) return
      // The current reading does not yet name the act that made a row appear. A move's writer is
      // not that fact: a later act may have made the row visible. Leave an unknown arrival still.
      const cause = (item as WaitingItem & { arrivalCause?: { kind: 'person' | 'agent'; id: string } }).arrivalCause
      if (cause === undefined || cause.id === '' || !(cause.kind === 'agent' || (cause.kind === 'person' && cause.id !== THE_PERSON))) return
      const row = list.current?.children.item(index) as HTMLElement | null
      if (!row) return
      row.classList.add('hm-needs-arrival')
      if (!reduced) {
        const height = row.getBoundingClientRect().height
        const priorOverflow = row.style.overflow
        row.style.overflow = 'hidden'
        const growth = row.animate([{ height: '0px' }, { height: `${height}px` }], {
          duration: ms('--motion-open'), easing: root.getPropertyValue('--ease-out').trim(),
        })
        void growth.finished.then(() => { row.style.overflow = priorOverflow }, () => { row.style.overflow = priorOverflow })
      }
      const timer = window.setTimeout(() => { row.classList.remove('hm-needs-arrival'); timers.current.delete(timer) }, ms('--motion-linger-period') + (reduced ? 0 : ms('--motion-open')))
      timers.current.add(timer)
    })
  }, [waiting])

  return (
    <section className="hm-section hm-needs" data-home-section="needs">
      <header className="hm-section-head hm-needs-head">
        <h2 className="hm-section-title">{t('home.needsYou')}</h2>
        <span className="hm-needs-count" title={waiting.status === 'ready' ? undefined : reason} aria-live="polite">{countWord}</span>
      </header>
      {waiting.status === 'ready' && items.length === 0 ? <p className="hm-empty">{t('absence.none')}</p> : null}
      {waiting.status === 'loading' ? <p className="hm-empty">{t('home.waitingReading')}</p> : null}
      {waiting.status === 'error' ? <p className="hm-empty"><Absence tier="told-apart" looked={false} title={t('home.waitingFailed')} /></p> : null}
      {listed.length > 0 ? (
        <ul className="hm-needs-list" ref={list}>
          {listed.map((item) => <WaitingRow key={`${item.workspaceId}:${item.id}`} item={item} homeRung={homeRung} readRecord={readRecord} />)}
        </ul>
      ) : null}
      {every.length > listed.length ? (
        <p className="hm-needs-more" data-home-needs-more>
          <span className="hm-section-count">{t('home.lateShown', { n: listed.length, total: every.length })}</span>
          <a className="hm-section-link" href={`#${pathFor('needsyou')}`}>{t('home.lateAllIn', { page: t('home.needsYou') })}</a>
        </p>
      ) : null}
      {presses}
    </section>
  )
}

/**
 * WHAT A HOME ROW IS, so a person can point at it and talk to an agent about it. Home's rows once said
 * nothing (Row's target prop in ui.tsx: on 18 August 2026 Home had no addressable element). A row
 * names a record only when it opens that record's page; a waiting row that opens another page (the
 * goals, the day plan, a visitor, the messages) names nothing rather than a guess.
 */
function recordTarget(recordId: string, workspaceId: string): Record<string, string> {
  return targetAttributes({ kind: 'record', recordId, workspaceId })
}

function WaitingRow({ item, homeRung, readRecord }: { item: WaitingItem; homeRung: Rung; readRecord: HomeRecordReader }) {
  // A REQUEST FOR ONE PRESS is drawn with its presses, by the same card the popup draws (components/OnePress.tsx). The
  // office announces the answer, and the shell reads the waiting reading again, so the row leaves with the popup's.
  if (item.theOnePress !== undefined) {
    return (
      <li className="hm-needs-item hm-needs-one-press" data-home-waiting-id={item.id}>
        <WaitingKindMark kind={item.kind} />
        <OnePressCard row={{ ...item, theOnePress: item.theOnePress }} />
      </li>
    )
  }
  return <WaitingRowWithItsLink item={item} homeRung={homeRung} readRecord={readRecord} />
}

function WaitingRowWithItsLink({ item, homeRung, readRecord }: { item: WaitingItem; homeRung: Rung; readRecord: HomeRecordReader }) {
  const destination = whereAWaitingRowGoes(item)
  const opensItsRecord = destination === recordPath(item.id)
  // ONLY A ROW WHOSE ID IS A RECORD'S IS READ AS ONE. A visiting agent's row is a credential, and reading
  // it as a record logged a 404 on every load of Home (problem f1Q1eivN_jSa).
  const [place, near] = useNearTheScreen()
  // A CARD ASK IS CALLED BY THE PAGE'S WORDS, as on the Decisions page, and its record is not
  // read for them: the record's title names the asker by a registry id nobody chose.
  const reading = useHomeRecord(item.id, item.workspaceId, near && item.askerAndCard === undefined && item.selfRegistration === undefined && aWaitingRowIsARecord(item) && homeRung !== 'title', readRecord)
  const rowTitle = item.askerAndCard === undefined && item.selfRegistration === undefined && reading.status === 'ready' && reading.value !== null
    ? content(titleAtHomeLength(reading.value.record, homeRung, item.title))
    : theRowsWords(item)
  // A LINK IN A ROW IS DRAWN AS THE CHAT DRAWS IT: the record's name, or the words of its press,
  // never the raw id. `useTheLineWithItsLinksInWords` is the chat's own reader, so the row and the
  // bubble cannot word one link two ways (item 97; the chat's fix was item 92).
  const titled = useTheLineWithItsLinksInWords(rowTitle)
  // A LONG TITLE IS CUT AT A WORD AND MARKED. The stored title may be long, and the card used to
  // draw whatever it held, ending in the middle of a word with nothing saying it had been cut.
  const cut = shortenToWords(titled, A_HOME_ROW_TITLE_AT_MOST)
  const rowWords = cut.shortened ? `${cut.words}${CUT_MARK}` : cut.words
  const reason = reading.status === 'error' ? reading.message : undefined
  return (
    <li className="hm-needs-item" ref={place}>
      <WaitingKindMark kind={item.kind} />
      <a
        className="hm-needs-link"
        data-home-waiting-id={item.id}
        href={`#${destination}`}
        onClick={() => setWorkspace(item.workspaceId)}
        aria-label={`${ACT_WORDS[item.act]}: ${titled}`}
        title={reason}
        {...(opensItsRecord ? recordTarget(item.id, item.workspaceId) : {})}
      >
        <span className="hm-needs-main">
          <span className="hm-row-title" {...(opensItsRecord ? DRAWS_THE_NAME : {})}>{rowWords}</span>
          <span className="hm-row-meta">
            {ACT_WORDS[item.act]} · {content(item.workspaceTitle)}
            {item.selfRegistration === undefined ? null : ` · ${theNameASelfRegistrationIsReadBy(item.selfRegistration)}`}
          </span>
        </span>
      </a>
    </li>
  )
}

/**
 * EVERY OTHER PROJECT'S ATTENTION, IN ONE READ, and the project on screen's from the frame.
 *
 * Home and the Projects page asked each other project's first page in a request of its own, and the
 * Projects page asked the project on screen again beside the frame. On a made-up office of nine projects
 * one load of either page made eight attention requests, which waited for each other on the server's one
 * attention thread and in the browser's six connections (round 23 of wave 13w). Now the frame reads the
 * project on screen and this reads the rest in one request: two in all.
 *
 * Answers each project's state. The object for a project is the same one until the reply changes, so a
 * card drawn with `memo` is not drawn again for nothing. A project the reply does
 * not name was not read, and says so as a failure rather than as a project with nothing in it.
 */
function useAttentionOfEachProject(current: AsyncState<AttentionHome>): (workspaceId: string) => AsyncState<AttentionHome> {
  const [others] = useProjectAsync(() => api.attentionOfOtherProjects(), [], { keep: 'home.attention.others' })
  const onScreen = currentWorkspace()
  const byProject = useMemo(() => {
    const read = new Map<string, AsyncState<AttentionHome>>()
    if (others.status === 'ready') for (const one of others.value.projects) read.set(one.workspaceId, { status: 'ready', value: one.reading })
    return read
  }, [others])
  // The card draws a failure as this sentence, whatever the message.
  const notRead = useMemo<AsyncState<AttentionHome>>(() => ({ status: 'error', message: t('home.metricFailed') }), [useWordGeneration()])
  return useCallback((workspaceId: string) => {
    if (workspaceId === onScreen) return current
    if (others.status !== 'ready') return others.status === 'error' ? others : READING.attention
    return byProject.get(workspaceId) ?? notRead
  }, [onScreen, current, others, byProject, notRead])
}

/** Reads one project's roster, and hands the parent that roster and the project's attention. */
function WorkspaceReader({
  workspace,
  attention,
  again,
  onAttention,
  onRoster,
}: {
  workspace: Workspace
  attention: AsyncState<AttentionHome>
  /** Moves when the event stream says this project's agents changed; the roster is read again then. */
  again: number
  onAttention: (workspaceId: string, state: AsyncState<AttentionHome>) => void
  onRoster: (workspaceId: string, state: AsyncState<HomeRoster>) => void
}) {
  // ONE ASK OF THIS PROJECT'S ROSTER AT A TIME, PACED BY ITS LAST ANSWER (src/web/lib/oneask.ts).
  // The live page's presence events came about every 5 s and one answer took 1.5 s, so the events
  // alone read this door a third of the page's server time; a burst still finds one ask, and the
  // next comes no sooner than the bound the answer sets. Keyed by the project, so a delayed ask
  // reads the project it was asked about.
  const askRoster = useMemo(
    () => oneAsk((project) => api.homeRoster({ workspaceId: project }), { key: () => workspace.id, floorMs: ROSTER_ASK_FLOOR_MS, factor: READ_COST_FACTOR }),
    [workspace.id],
  )
  const [roster] = useProjectAsync(() => askRoster(), [workspace.id, again], { keep: `home.roster:${workspace.id}` })
  // The parent combines each project's two reads for the lists across projects.
  // These callbacks stay stable, so a fresh parent render cannot ask the project again.
  useEffect(() => { onAttention(workspace.id, attention) }, [workspace.id, attention, onAttention])
  useEffect(() => { onRoster(workspace.id, roster) }, [workspace.id, roster, onRoster])
  return null
}

/**
 * HOW LONG A BURST OF EVENTS IS GATHERED BEFORE THE ROSTERS IT NAMES ARE READ AGAIN, in milliseconds.
 * A run that opens moves several agents' dots within a second; they are read in one request per project.
 */
const ROSTER_REREAD_WAIT_MS = 1000

/** The two events that can change what Agents at work draws. */
const ROSTER_HEARS: readonly EventName[] = ['presence.changed', 'list.changed']

/**
 * WHEN EACH PROJECT'S ROSTER IS READ AGAIN: ONLY WHEN THE EVENT STREAM SAYS ITS AGENTS CHANGED.
 *
 * Agents at work reads each project's roster once when Home opens. After that it is read again only
 * when the office's event stream (src/web/lib/channel.ts) says something it draws moved:
 *   - `presence.changed` about an agent on a project's roster reads that project again, because a run
 *     that opened or ended changes the dot, and the run serving the agent (each row's `doingFrom`) may
 *     be another one now;
 *   - `list.changed` naming the participants reads the project it names, or every project when it
 *     names none, because an agent was registered, renamed or retired;
 *   - events lost (the server forgot some, or restarted) reads every project once.
 * Nothing reads it on a timer. A burst is gathered for ROSTER_REREAD_WAIT_MS and each project in it
 * is read once. The answer on screen stays while the new one is read (`useAsync` keeps it).
 *
 * Answers a number per project that moves when that project is to be read again.
 */
function useRosterRereads(readings: ProjectReadingMap, workspaces: readonly Workspace[]): Readonly<Record<string, number>> {
  const [again, setAgain] = useState<Record<string, number>>({})
  const held = useRef({ readings, workspaces })
  held.current = { readings, workspaces }
  const waiting = useRef<{ projects: Set<string>; timer: ReturnType<typeof setTimeout> | null }>({ projects: new Set(), timer: null })
  const readAgain = useCallback((projects: readonly string[]) => {
    const pending = waiting.current
    for (const one of projects) pending.projects.add(one)
    if (pending.timer !== null || pending.projects.size === 0) return
    pending.timer = setTimeout(() => {
      const now = [...pending.projects]
      pending.projects.clear()
      pending.timer = null
      setAgain((was) => {
        const next = { ...was }
        for (const one of now) next[one] = (next[one] ?? 0) + 1
        return next
      })
    }, ROSTER_REREAD_WAIT_MS)
  }, [])
  useEffect(() => () => {
    if (waiting.current.timer !== null) clearTimeout(waiting.current.timer)
  }, [])
  const every = useCallback(() => held.current.workspaces.map((one) => one.id), [])
  useChannel(useCallback((event: ChannelEvent) => {
    if (event.name === 'presence.changed') {
      if (event.who.kind !== 'agent') return
      const on = Object.entries(held.current.readings)
        .filter(([, reading]) => reading?.roster.status === 'ready' && reading.roster.value.rows.some((row) => row.participant?.id === event.who.id))
        .map(([id]) => id)
      readAgain(on)
    } else if (event.name === 'list.changed') {
      if (!event.lists.includes('participants')) return
      readAgain(event.workspaceId === null ? every() : [event.workspaceId])
    }
  }, [readAgain, every]), ROSTER_HEARS)
  useEffect(() => whenEventsWereLost(() => readAgain(every())), [readAgain, every])
  return again
}

function alarmRows(workspaces: readonly Workspace[], readings: ProjectReadingMap) {
  const rows: { workspace: Workspace; row: AttentionRow; tone: string; rank: number }[] = []
  for (const workspace of workspaces) {
    const state = readings[workspace.id]?.attention ?? READING.attention
    if (state.status !== 'ready') continue
    for (const row of state.value.alarms.rows) {
      const kind = alarmKind(row)
      rows.push({ workspace, row, tone: kind, rank: kind === 'safety' ? 0 : kind === 'late' ? 1 : kind === 'stopped' ? 2 : 3 })
    }
  }
  // The server’s scores are comparable only within one project. This sorts by the kind of alarm,
  // then keeps the server order and workspace order inside each kind.
  return rows.map((row, index) => ({ ...row, index })).sort((a, b) => a.rank - b.rank || a.index - b.index)
}

function projectMetricState(reading: AsyncState<AttentionHome>, which: 'open' | 'late') {
  if (reading.status === 'loading') return { value: null as number | null, reason: t('home.metricReading') }
  if (reading.status === 'error') return { value: null, reason: t('home.metricFailed') }
  if (which === 'late') return { value: reading.value.alarms.overdue, reason: null }
  const open = openCountFromAttention(reading.value)
  return { value: open.count, reason: open.reason }
}

/**
 * WHAT EACH AGENT HAS CLAIMED, under the roster in Agents at work. Criterion M13 wants claims drawn on
 * the dashboard, and the approved Home keeps who is working on what in this
 * section. A conflict is drawn in the conflict colour and names the group it is being sorted out in.
 *
 * THIS PROJECT ONLY. The claims door answers for the project in the switcher, as the old band did,
 * and the heading names that project, so nobody reads it as every project's claims.
 *
 * WHICH CLAIMS ARE IN CONFLICT, AND WITH WHOM, IS WORKED OUT IN Claims.tsx, by the same function the
 * record page asks. Two copies of that rule is problem qpjjRnnfo-4i.
 */
export function AgentClaims({ projectName }: { projectName: (id: string) => string }) {
  const [claims] = useProjectAsync(() => readClaimsOnce.again(), [], { keep: 'home.claims' })
  const [groups] = useProjectAsync(() => readGroupsOnce(), [])
  const names = useClaimantNames()
  const inspect = useInspect()
  const live = claims.status === 'ready' ? claims.value.claims.filter((one) => one.state === 'live') : []
  const titles = useRecordTitles(live.flatMap((one) => one.things.filter((thing) => thing.what === 'record').map((thing) => thing.id)))
  const project = content(projectName(currentWorkspace()))
  const groupNamed = (id: string | null): string | null => {
    if (id === null || groups.status !== 'ready') return null
    return groups.value.groups.find((one) => one.id === id)?.name ?? null
  }
  // THE ROWS WAIT FOR THE GROUPS, so a conflict line is never drawn without the group it names and
  // then redrawn with it a moment later.
  const drawn = claims.status === 'ready' && groups.status !== 'loading'
  const conflicts = drawn ? conflictsByClaim(claims.value.overlaps, groupNamed) : new Map<string, Conflict>()
  return (
    <div className="hm-claims">
      <h3 className="hm-claims-title">{t('home.claims.title', { project })}</h3>
      {claims.status === 'error' ? (
        <p className="hm-empty"><Absence tier="told-apart" looked={false} title={t('home.claims.failed')} /></p>
      ) : !drawn ? (
        <p className="hm-empty">{t('home.claims.reading')}</p>
      ) : live.length === 0 ? (
        <p className="hm-empty">{t('absence.none')}</p>
      ) : (
        <ul className="hm-claim-list">
          {live.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} name={names(claim.claimant)} titles={titles} conflict={conflicts.get(claim.id) ?? null} inspect={inspect} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ClaimRow({
  claim,
  name,
  titles,
  conflict,
  inspect,
}: {
  claim: ClaimOnTheWire
  name: string
  titles: Readonly<Record<string, string>>
  conflict: Conflict | null
  inspect: boolean
}) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '·'
  return (
    <li className="hm-claim" data-conflict={conflict === null ? 'no' : 'yes'}>
      <span className="hm-agent-face" aria-hidden="true">{initial}</span>
      <span className="hm-agent-copy">
        <span className="hm-agent-name">{name}</span>
        <span className="hm-claim-things">
          {claim.things.map((thing) => (
            thing.what === 'record' ? (
              // A TITLE NOT YET READ IS SAID AS WHAT IT IS, a record, and not as a record that is gone.
              <a key={`record:${thing.id}`} className="hm-claim-thing" href={`#${recordPath(thing.id)}`}>
                {titles[thing.id] === undefined ? kindWords('record') : content(titles[thing.id]!)}
              </a>
            ) : (
              // A PATH IS MACHINERY: developer mode shows it, and normal mode names only its kind.
              <span key={`path:${thing.id}`} className="hm-claim-thing">{inspect ? <span className="num">{thing.id}</span> : kindWords('path')}</span>
            )
          ))}
        </span>
        {conflict === null ? null : <span className="hm-claim-conflict">{conflictWords(conflict)}</span>}
      </span>
    </li>
  )
}

function AlarmRow({
  workspace,
  row,
  tone,
  homeRung,
  projectName,
  readRecord,
}: {
  workspace: Workspace
  row: AttentionRow
  tone: string
  homeRung: Rung
  projectName: (id: string) => string
  readRecord: HomeRecordReader
}) {
  const [place, near] = useNearTheScreen()
  const reading = useHomeRecord(row.recordId, workspace.id, near && row.shape === 'record' && homeRung !== 'title', readRecord)
  const rowTitle = reading.status === 'ready' && reading.value !== null
    ? titleAtHomeLength(reading.value.record, homeRung, row.title)
    : row.title
  const reason = reading.status === 'error' ? reading.message : undefined
  return (
    <a
      ref={place}
      className="hm-alarm-row"
      data-st={tone}
      href={`#${recordPath(row.recordId)}`}
      onClick={() => setWorkspace(workspace.id)}
      title={reason}
      {...recordTarget(row.recordId, workspace.id)}
    >
      <span className="hm-alarm-state">{alarmName(row)}</span>
      <span className="hm-row-title" {...DRAWS_THE_NAME}>{content(rowTitle)}</span>
      <span className="hm-row-meta">{content(projectName(workspace.id))}</span>
    </a>
  )
}

/**
 * ONE COUNT ON A PROJECT CARD. A count that cannot be given is drawn as a dashed dash; its reason is in the mark's
 * own explanation, and on the card under the counts when the reading answered and could not count (see
 * `ProjectCard`), so the dash is never left without words.
 */
function Metric({ value, reason, kind }: { value: number | null; reason: string | null; kind: string }) {
  return (
    <dd data-home-project-count={kind}>
      {value === null ? <Absence tier="told-apart" looked={false} word="—" title={reason ?? t('home.metricFailed')} /> : count(value)}
    </dd>
  )
}

function ProjectCard({
  workspace,
  waitingCount,
  waiting,
  attention,
  projectName,
}: {
  workspace: Workspace
  waitingCount: number | null
  waiting: AsyncState<WaitingReply>
  attention: AsyncState<AttentionHome>
  projectName: (id: string) => string
}) {
  const open = projectMetricState(attention, 'open')
  const late = projectMetricState(attention, 'late')
  // WHY A COUNT IS A DASH, DRAWN ON THE CARD. Round 31's pictures of a busy office showed Default's and Tide
  // tables' "open" as a dashed dash with no word: their records include tasks that never wrote a state, so
  // `openCountFromAttention` cannot tell whether they are open, and its sentence was only in the mark's
  // explanation, read on hover or focus. It is drawn here once the reading has answered; while it is still
  // being read, or could not be read, the dash keeps the sentence in its explanation as before.
  const unsure = attention.status === 'ready'
    ? [open, late].flatMap((one) => (one.value === null && one.reason !== null ? [one.reason] : []))
    : []
  const waitingReason = waitingCount === null
    ? waiting.status === 'error' ? t('home.waitingFailed') : t('home.waitingReading')
    : null
  return (
    <a
      className="hm-project-card"
      href="#/"
      aria-current={currentWorkspace() === workspace.id ? 'page' : undefined}
      onClick={() => setWorkspace(workspace.id)}
    >
      <span className="hm-project-name">{content(projectName(workspace.id))}</span>
      <dl className="hm-project-metrics">
        <div className="hm-project-waiting">
          <Metric value={waitingCount} reason={waitingReason} kind="waiting" />
          <dt>{t('home.projectWaiting')}</dt>
        </div>
        <div>
          <Metric value={open.value} reason={open.reason} kind="open" />
          <dt>{t('home.projectOpen')}</dt>
        </div>
        <div>
          <Metric value={late.value} reason={late.reason} kind="late" />
          <dt>{t('home.projectLate')}</dt>
        </div>
      </dl>
      {unsure.length === 0 ? null : <span className="hm-project-unsure" data-home-project-unsure>{unsure.join(' ')}</span>}
    </a>
  )
}

/**
 * ONE CARD PER PROJECT, with what waits on the person there, what is open and what is late. The Projects page
 * draws it; Home drew it until a decision moved it one press away.
 *
 * The project on screen is drawn from the frame's reading, `attention`, and every other project from the one
 * read Home's Late or stuck makes too (`useAttentionOfEachProject`), kept under the same name, so a page Home
 * has just read is drawn here at once and read again behind it.
 */
export function ProjectCards({
  waiting,
  attention,
  projects,
  projectName,
}: {
  waiting: AsyncState<WaitingReply>
  /** The frame's reading of the project on screen. */
  attention: AsyncState<AttentionHome>
  projects: AsyncState<WorkspacesReply>
  projectName: (id: string) => string
}) {
  const workspaces = projects.status === 'ready' ? projects.value.workspaces : []
  const attentionOf = useAttentionOfEachProject(attention)
  const waitingByProject = new Map<string, number>()
  if (waiting.status === 'ready') {
    for (const item of waiting.value.items) waitingByProject.set(item.workspaceId, (waitingByProject.get(item.workspaceId) ?? 0) + 1)
  }
  return (
    <section className="hm-section hm-projects" data-home-section="projects">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      {projects.status === 'ready' ? <p className="hm-section-count">{t('home.projectCount', { n: workspaces.length })}</p> : null}
      {projects.status === 'ready' && workspaces.length > 0 ? (
        <div className="hm-project-grid">
          {workspaces.map((workspace) => (
            <ProjectCardWhenChanged
              key={workspace.id}
              workspace={workspace}
              waitingCount={waiting.status === 'ready' ? waitingByProject.get(workspace.id) ?? 0 : null}
              waiting={waiting}
              attention={attentionOf(workspace.id)}
              projectName={projectName}
            />
          ))}
        </div>
      ) : projects.status === 'error' ? (
        <p className="hm-empty"><Absence tier="told-apart" looked={false} title={t('home.projectsFailed')} /></p>
      ) : projects.status === 'loading' ? (
        <p className="hm-empty">{t('home.projectsReading')}</p>
      ) : <p className="hm-empty">{t('absence.none')}</p>}
    </section>
  )
}

export function HomeSections({
  title,
  waiting,
  attention,
  homeRung,
  projects,
  stillPipelines,
  today,
  pause,
  projectName,
  day,
  developer,
  presses,
  pairing,
  pairingCards,
}: {
  title: string
  waiting: AsyncState<WaitingReply>
  attention: AsyncState<AttentionHome>
  homeRung: Rung
  projects: AsyncState<WorkspacesReply>
  /**
   * This project's pipelines whose unfinished steps are all paused, as the server answers them: the first as many as
   * Late or stuck draws, each with how many steps are not done, and how many there are in all.
   */
  stillPipelines: PipelinesStandingStill
  today: ReactNode
  /** The notice that the office is paused, drawn above the three parts, wherever the person put them. */
  pause?: ReactNode
  projectName: (id: string) => string
  /** The day the line under the title says, before the projects Home shows. */
  day?: string
  /** What the old Home drew for a developer: what has been said, the questions, the sessions. Null in normal mode. */
  developer?: ReactNode
  /** Rows with the person's own press, drawn inside Needs you: the residency proposals. */
  presses?: ReactNode
  /** The pairing requests waiting on the person, drawn right after the pause notice and above the parts. */
  pairing?: ReactNode
  /** The ids of the requests `pairing` draws as cards. Needs you draws no row for these, and still counts them. */
  pairingCards?: ReadonlySet<string>
}) {
  const workspaces = projects.status === 'ready' ? projects.value.workspaces : []
  const recordReads = useRef(new Map<string, Promise<RecordDetail>>())
  const readRecord = useCallback((id: string, workspaceId: string) => {
    const key = `${workspaceId}\u0000${id}`
    const already = recordReads.current.get(key)
    if (already !== undefined) return already
    const reading = api.getRecord(id, { workspaceId })
    recordReads.current.set(key, reading)
    return reading
  }, [])
  const [readings, setReadings] = useState<ProjectReadingMap>({})
  const onAttention = useCallback((workspaceId: string, attention: AsyncState<AttentionHome>) => {
    setReadings((previous) => ({ ...previous, [workspaceId]: { ...(previous[workspaceId] ?? READING), attention } }))
  }, [])
  const onRoster = useCallback((workspaceId: string, roster: AsyncState<HomeRoster>) => {
    setReadings((previous) => ({ ...previous, [workspaceId]: { ...(previous[workspaceId] ?? READING), roster } }))
  }, [])
  const again = useRosterRereads(readings, workspaces)
  const attentionOf = useAttentionOfEachProject(attention)
  const alarms = alarmRows(workspaces, readings)
  // WORKED OUT AGAIN ONLY WHEN A READING THE BARS ARE COUNTED FROM CHANGED, so the bars below are handed the
  // same projects when the minute's re-read answers what they hold, and do not draw themselves again. A reading
  // can change where the bars count nothing, so a list the same as the last, field by field, is the last one.
  const bars = useTheLastWhileTheSame(useMemo(() => workspaces.map((workspace) => {
    const reading = readings[workspace.id] ?? READING
    return {
      id: workspace.id,
      name: projectName(workspace.id),
      agents: reading.roster.status === 'ready' ? reading.roster.value.rows.length : undefined,
      bar: theBarOf({ roster: reading.roster, waiting, attention: reading.attention }),
    }
  }), [workspaces, readings, waiting, projectName]))
  // THE PROJECTS HOME SHOWS, as the kept layout chose them: every project, or one. HomeParts hands the choice to the
  // parts as it draws them, and here only the line under the title and which projects are read follow it.
  const [project, setProject] = useState<ProjectChoice>(EVERY_PROJECT)
  const titles = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, projectName(workspace.id)])), [workspaces, projectName])
  const read = project === EVERY_PROJECT ? workspaces : workspaces.filter((workspace) => workspace.id === project)
  const lead = day === undefined ? null : t('home.leadLine', { day, scope: project === EVERY_PROJECT ? t('home.leadAllProjects') : projectName(project) })

  /** What each part draws for the projects chosen. Every count and list below is of those projects only. */
  function contents(chosen: ProjectChoice): Record<HomePart, ReactNode> {
    const inTheChoice = (workspaceId: string) => chosen === EVERY_PROJECT || workspaceId === chosen
    const shown = chosen === EVERY_PROJECT ? workspaces : workspaces.filter((workspace) => workspace.id === chosen)
    const waitingShown: AsyncState<WaitingReply> = waiting.status === 'ready' && chosen !== EVERY_PROJECT
      ? { ...waiting, value: { ...waiting.value, items: waiting.value.items.filter((item) => inTheChoice(item.workspaceId)) } }
      : waiting
    const alarmsShown = alarms.filter(({ workspace }) => inTheChoice(workspace.id))
    const stillShown = stillPipelines.rows.filter((pipeline) => inTheChoice(pipeline.workspaceId))
    // EVERY ROW IS OF THE ONE PROJECT THE ANSWER IS FOR, so its total counts exactly when its rows are in the choice.
    // With no row the total is 0 too.
    const stillTotal = stillShown.length === 0 ? 0 : stillPipelines.total
    const lateTotal = shown.reduce((total, workspace) => {
      const state = readings[workspace.id]?.attention
      return total + (state?.status === 'ready' ? state.value.alarms.total : 0)
    }, 0) + stillTotal
    const anyLateLoading = projects.status !== 'ready' || shown.some((workspace) => (readings[workspace.id]?.attention ?? READING.attention).status === 'loading')
    const anyLateError = projects.status === 'error' || shown.some((workspace) => (readings[workspace.id]?.attention ?? READING.attention).status === 'error')
    const barsShown = chosen === EVERY_PROJECT ? bars : bars.filter((bar) => inTheChoice(bar.id))
    const figures = Object.fromEntries(HOME_FIGURES.map((figure) => [figure, <HomeFigureDrawn figure={figure} project={chosen} />]))
    return {
      keyItems: <HomeKeyItems project={chosen} />,
      needs: (
        <>
        <HomeNeedsYou waiting={waitingShown} homeRung={homeRung} readRecord={readRecord} presses={presses} shown={NEEDS_SHOWN} drawnAtTheTop={pairingCards} />
        {/* NOTHING LATE OR STUCK, ONCE EVERY PROJECT HAS ANSWERED, DRAWS NO PART: a heading over nothing would only
            explain that nothing is there. While a project is read, or when one did not answer, the part says so. */}
        {alarmsShown.length === 0 && stillShown.length === 0 && !anyLateError && !anyLateLoading ? null : (
        <section className="hm-section hm-late" data-home-section="late">
          {/* LATE OR STUCK IS ONE NUMBER, and pressing it opens its list here. */}
          <details className="hm-late-open" data-home-late-open>
            <summary className="hm-late-summary">
              <h2 className="hm-section-title">{t('home.lateOrStuck')}</h2>
              <span className="hm-late-number" data-home-late-number>{anyLateLoading || anyLateError ? '—' : count(lateTotal)}</span>
            </summary>
            {lateTotal > LATE_SHOWN ? (
              <p className="hm-needs-more">
                <span className="hm-section-count">{t('home.lateShown', { n: LATE_SHOWN, total: lateTotal })}</span>
                <a className="hm-section-link" href={`#${familyPath('work')}`}>{t('home.lateAllIn', { page: t(RAIL_WORD_KEYS['rail.work']) })}</a>
              </p>
            ) : null}
            {alarmsShown.length > 0 || stillShown.length > 0 ? (
              <>
              <ul className="hm-alarm-list">
                {alarmsShown.slice(0, LATE_SHOWN).map(({ workspace, row, tone }) => (
                  <li key={`${workspace.id}:${row.key}`}>
                    <AlarmRow workspace={workspace} row={row} tone={tone} homeRung={homeRung} projectName={projectName} readRecord={readRecord} />
                  </li>
                ))}
                {/* A PIPELINE STANDING STILL: every unfinished step paused. Stuck,
                    so it is here, after the attention rows, with its sentence first as the side column
                    draws a state. */}
                {stillShown.slice(0, Math.max(0, LATE_SHOWN - alarmsShown.length)).map((pipeline) => (
                  <li key={`${pipeline.workspaceId}:pipeline:${pipeline.id}`}>
                    <a
                      className="hm-alarm-row"
                      data-st="stopped"
                      href={`#${recordPath(pipeline.id)}`}
                      onClick={() => setWorkspace(pipeline.workspaceId)}
                      {...recordTarget(pipeline.id, pipeline.workspaceId)}
                    >
                      <span className="hm-alarm-state">{standingStillLine(pipeline.unfinished)}</span>
                      <span className="hm-row-title" {...DRAWS_THE_NAME}>{content(pipeline.title)}</span>
                      <span className="hm-row-meta">{content(projectName(pipeline.workspaceId))}</span>
                    </a>
                  </li>
                ))}
              </ul>
              {anyLateError ? <p className="hm-empty">{t('home.lateFailed')}</p> : anyLateLoading ? <p className="hm-empty">{t('home.lateReading')}</p> : null}
              </>
            ) : anyLateError ? (
              <p className="hm-empty"><Absence tier="told-apart" looked={false} title={t('home.lateFailed')} /></p>
            ) : <p className="hm-empty">{t('home.lateReading')}</p>}
          </details>
        </section>
        )}
        </>
      ),
      agents: (
        <section className="hm-section hm-agents" data-home-section="agents">
          <SectionHeading title={t('home.agentsAtWork')} />
          {/* ONE BAR PER PROJECT: working, waiting on you and stuck. HomeAgentBars.tsx says what each counts. */}
          {shown.length > 0 ? (
            <HomeAgentBarsWhenChanged projects={barsShown} waitingCannotTell={cannotTellIn(waitingShown)} />
          ) : projects.status === 'error' ? (
            <p className="hm-empty"><Absence tier="told-apart" looked={false} title={t('home.agentsFailed')} /></p>
          ) : projects.status === 'loading' ? (
            <p className="hm-empty">{t('home.agentsReading')}</p>
          ) : <p className="hm-empty">{t('absence.none')}</p>}
          {/* THE CLAIMS ARE ONE PRESS AWAY, on their own page. */}
          <p className="hm-elsewhere"><a className="hm-section-link" data-home-goes="claims" href={`#${pathFor('claims')}`}>{t('w13w.claimsPage.title')}</a></p>
        </section>
      ),
      schedule: today,
      ...figures,
    } as Record<HomePart, ReactNode>
  }

  return (
    <div className="hp-page hm-page">
      <style href="mole-office-home-sections" precedence="default">{HOME_SECTIONS_CSS}</style>
      <header className="hm-page-head">
        <h1 className="hm-page-title">{title}</h1>
        {lead === null ? null : <p className="hm-page-lead">{lead}</p>}
        {/* THE PROJECT CARDS ARE ONE PRESS AWAY, on their own page. */}
        <p className="hm-elsewhere"><a className="hm-section-link" data-home-goes="projects" href={`#${pathFor('projects')}`}>{t('home.projects')}</a></p>
      </header>
      {pause}
      {/* A PAIRING REQUEST WAITS ABOVE THE PARTS, wherever the person put them: a browser that asks cannot work until it
          is answered. With none waiting, nothing is drawn. */}
      {pairing}
      {/* HOME'S PARTS, in the layout the person kept (HomeLayout.tsx), for the projects it chose. Needs you holds at most
          two decisions and the late or stuck number, and Schedule holds the week, today's progress and today. */}
      <HomeParts titles={titles} onProject={setProject} contents={contents} />
      {developer === undefined || developer === null ? null : <div className="hm-developer">{developer}</div>}
      {projects.status === 'ready' ? read.map((workspace) => (
        <WorkspaceReader key={workspace.id} workspace={workspace} attention={attentionOf(workspace.id)} again={again[workspace.id] ?? 0} onAttention={onAttention} onRoster={onRoster} />
      )) : null}
    </div>
  )
}

/**
 * THE BARS AND A PROJECT'S CARD DRAW AGAIN ONLY WHEN WHAT THEY ARE HANDED CHANGED. Home's
 * minute changes the time under the page, which draws this whole component again; with the same
 * readings and waiting list they would draw the same thing, so drawing them again would spend the browser's time
 * for nothing (round 18 of wave 13w).
 */
const HomeAgentBarsWhenChanged = memo(HomeAgentBars)
const ProjectCardWhenChanged = memo(ProjectCard)

/** The value handed back last time, while the new one is the same field by field (`theSameAnswer`). */
function useTheLastWhileTheSame<T>(value: T): T {
  const last = useRef(value)
  if (last.current !== value && !theSameAnswer(last.current, value)) last.current = value
  return last.current
}

function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  if (children === undefined) return <h2 className="hm-section-title">{title}</h2>
  return (
    <div className="hm-section-head">
      <h2 className="hm-section-title">{title}</h2>
      {children}
    </div>
  )
}

/** HOW MANY DECISIONS NEEDS YOU DRAWS ON HOME, by the person's decision: one or two. The rest are one press away. */
export const NEEDS_SHOWN = 2

/** HOW MANY ROWS LATE OR STUCK DRAWS, as the approved drawing does ("4 of 11", then a link to the rest). */
const LATE_SHOWN = HOME_ALARMS_SHOWN

// `.hm-away` is a decision's: the pages one press from Home, each headed by its own name.
export const HOME_SECTIONS_CSS = `
/* THE PAGES ONE PRESS FROM HOME: Needs you, Claims, Projects, What has been said and the questions about the
   records. Each is headed by its own name and draws the section Home used to draw. */
.hm-away { display: grid; gap: var(--gut); min-width: 0; }
.hm-away-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.hm-page {
  --move: var(--motion-quick);
  display: flex;
  flex-direction: column;
  gap: var(--pad-lg);
  min-width: 0;
}
@media (prefers-reduced-motion: reduce) { .hm-page { --move: 0ms; } }
.hm-page-head { margin: 0; }
.hm-page-title { margin: 0; color: var(--text); font: 700 var(--fs-6)/var(--lh-tight) var(--font-ui); }
.hm-page-lead { margin: 4px 0 0; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-developer { display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; }
.hm-section { min-width: 0; }
:where(:root[data-theme-from='data']) .hm-section:not(.hm-needs) { background: var(--module-bg); border: var(--module-border); border-radius: var(--module-radius); box-shadow: var(--module-shadow); padding: var(--module-pad); }
.hm-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gut); margin: 0 0 var(--gut); padding-bottom: var(--gut); border-bottom: var(--module-head-rule, var(--border-w) solid var(--border-strong)); min-width: 0; }
:where(:root[data-theme-from='data']) .hm-section-head { padding: var(--module-head-pad); background: var(--module-head-bg); border-radius: var(--module-head-radius); }
:where(:root[data-theme-from='data']) .hm-section-head a { color: var(--module-head-link); }
.hm-section-title { margin: 0; color: var(--module-head-ink, var(--text)); font: var(--section-weight) var(--section-size)/var(--lh-tight) var(--section-font); letter-spacing: var(--section-space); text-transform: var(--section-case); }
.hm-section-head .hm-section-title { flex: 1 1 auto; }
:where(:root[data-theme-from='data']) .hm-section > .hm-section-title { background: var(--module-head-bg); padding: var(--bare-head-pad); border-radius: var(--module-head-radius); }
.hm-section-link { font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.hm-section-count { color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); white-space: nowrap; }
/* UNDER A THEME FROM THE DATA, A COUNT TAKES THE HEADING'S COUNT COLOUR ONLY IN A HEADING, where it stands on the
   heading's ground. Needs you's foot and the Projects page draw it on other grounds, so there it keeps --text-3. */
:where(:root[data-theme-from='data']) .hm-section-head .hm-section-count { color: var(--module-head-meta, var(--text-3)); }
.hm-needs-more { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gut); margin: var(--gut) 0 0; padding-top: var(--gut); border-top: var(--border-w) var(--divider-style, solid) var(--ask-line); }
.hm-elsewhere { margin: var(--gut) 0 0; }
.hm-late-summary { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gut); min-width: 0; cursor: pointer; list-style: none; }
.hm-late-summary::-webkit-details-marker { display: none; }
.hm-late-number { color: var(--text); font: 700 var(--fs-5)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; }
.hm-late-open[open] > .hm-late-summary { margin: 0 0 var(--gut); }
.hm-empty { margin: 0; color: var(--text-3); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-needs { padding: var(--pad-lg); border: var(--border-w) solid var(--ask-line); border-radius: var(--radius); background: var(--ask-row); box-shadow: var(--elev-1); transition: background-color var(--move), border-color var(--move), box-shadow var(--move); }
:where(:root[data-theme-from='data']) .hm-needs { border-left-width: calc(var(--border-w) + var(--needs-rail)); }
.hm-needs .hm-section-head { border-bottom: var(--needs-head-rule, var(--border-w) solid var(--ask-line)); }
:where(:root[data-theme-from='data']) .hm-needs .hm-section-head { background: var(--needs-head-bg); }
.hm-needs-head .hm-section-title { color: var(--needs-head-ink, var(--ask)); }
.hm-needs-count { color: var(--count-ink, var(--ask)); }
.hm-needs-count { font: var(--num-weight, 700) var(--fs-6)/var(--lh-tight) var(--font-num, var(--font-ui)); font-variant-numeric: tabular-nums; }
:where(:root[data-theme-from='data']) .hm-needs-count { background: var(--count-bg); border: var(--count-border); border-radius: var(--count-radius); padding: var(--count-pad); transform: var(--count-turn); }
.hm-needs-list, .hm-alarm-list { list-style: none; margin: 0; padding: 0; min-width: 0; }
.hm-needs-list { display: flex; flex-direction: column; }
.hm-needs-item { display: flex; align-items: center; gap: var(--gut); min-width: 0; border-bottom: var(--border-w) var(--divider-style, solid) var(--ask-line); }
.hm-needs-item.hm-needs-arrival { animation: hm-arrival-wash var(--motion-linger) var(--ease-out) var(--motion-open) both; }
@keyframes hm-arrival-wash { from { background: var(--accent-soft); box-shadow: inset 0 0 0 var(--focus-w) var(--accent); } to { background: transparent; box-shadow: inset 0 0 0 var(--focus-w) transparent; } }
@media (prefers-reduced-motion: reduce) { .hm-needs-item.hm-needs-arrival { animation: none; background: var(--accent-soft); box-shadow: inset 0 0 0 var(--focus-w) var(--accent); } }
.hm-needs-item:last-child { border-bottom: 0; }
.hm-kind { display: grid; flex: none; place-items: center; width: 2.25rem; height: 2.25rem; border: var(--border-w) solid var(--ask-line); border-radius: var(--face-radius, var(--radius-pill)); background: var(--panel); color: var(--ask); font: 600 var(--fs-3)/1 var(--font-ui); }
.hm-needs-link { display: flex; align-items: center; flex: 1; min-width: 0; min-height: var(--row-h); padding: var(--pad) 0; color: var(--text); text-decoration: none; }
.hm-needs-link:hover { color: var(--ask); }
.hm-needs-main, .hm-agent-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.hm-row-title { color: var(--text); font: 500 var(--fs-3)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.hm-row-meta { color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }
.hm-today { container: hm-today / inline-size; }
.hm-day-capacity { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--gut); min-width: 0; }
.hm-period-note { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-day-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gut); margin-bottom: var(--gut); }
/* WITH NOTHING ON TODAY AND NOTHING OFFERED, nothing follows the date, so no gap is left under it. */
.hm-day-top:last-child { margin-bottom: 0; }
.hm-day-date h3 { margin: 0; color: var(--text); font: 500 var(--fs-3)/var(--lh-tight) var(--font-ui); }
.hm-day-date .hm-period-note { margin-top: 2px; }
.hm-day-capacity { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-link { color: var(--accent); text-underline-offset: .16em; }
.hm-say-how { color: var(--accent); font: 600 var(--fs-2)/var(--lh-body) var(--font-ui); text-underline-offset: .16em; }
.hm-agenda { list-style: none; margin: 0; padding: 0; min-width: 0; }
.hm-agenda-item { border-bottom: var(--border-w) var(--divider-style, solid) var(--border); }
.hm-agenda-item:last-child { border-bottom: 0; }
.hm-agenda-link { display: flex; align-items: stretch; gap: var(--gut); min-width: 0; min-height: var(--row-h); padding: var(--pad) 0; color: var(--text); text-decoration: none; transition: background-color var(--move); }
.hm-agenda-link:hover { background: var(--hover); }
.hm-hours { display: flex; flex: none; align-items: center; width: 4rem; gap: 3px; border-right: var(--border-w) solid var(--border); color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; }
.hm-hours small { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.hm-agenda-copy { display: flex; flex: 1; flex-direction: column; justify-content: center; min-width: 0; gap: 2px; }
.hm-agenda-state { display: flex; align-items: center; flex: none; align-self: center; }
.hm-agenda-link:has(.px-state-with-source) { display: grid; grid-template-columns: 4rem minmax(0, 1fr); }
.hm-agenda-link:has(.px-state-with-source) > .hm-hours { grid-column: 1; grid-row: 1 / span 2; }
.hm-agenda-link:has(.px-state-with-source) > .hm-agenda-copy { grid-column: 2; grid-row: 1; }
.hm-agenda-link:has(.px-state-with-source) > .hm-agenda-state { grid-column: 2; grid-row: 2; justify-self: start; align-self: start; min-width: 0; max-width: 100%; }
.hm-recurring { margin: var(--gut) 0 0; color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.hm-pairing { display: grid; gap: var(--gut); }
.hm-pairing-kept { margin: 0; color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.hm-alarm-list { display: flex; flex-direction: column; }
.hm-alarm-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; min-height: var(--row-h); padding: var(--pad) 0 var(--pad) var(--pad-lg); border-left: var(--rail) solid var(--st-overdue-line); border-bottom: var(--border-w) var(--divider-style, solid) var(--border); color: var(--text); text-decoration: none; transition: background-color var(--move), border-color var(--move); }
.hm-alarm-list li:last-child .hm-alarm-row { border-bottom: 0; }
.hm-alarm-row:hover { background: var(--hover); }
.hm-alarm-row[data-st='safety'] { border-left-color: var(--st-failed-line); }
.hm-alarm-row[data-st='late'] { border-left-color: var(--st-overdue-line); }
.hm-alarm-row[data-st='stopped'] { border-left-color: var(--st-blocked-line); }
.hm-alarm-row[data-st='pause'] { border-left-color: var(--st-inferred-line); }
.hm-alarm-state { color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.hm-alarm-row[data-st='safety'] .hm-alarm-state, .hm-alarm-row[data-st='late'] .hm-alarm-state { color: var(--st-overdue); }
.hm-agent-face { position: relative; display: grid; place-items: center; flex: none; width: 2.25rem; height: 2.25rem; border: var(--border-w) solid var(--border-strong); border-radius: var(--face-radius, var(--radius-pill)); background: var(--panel-2); color: var(--text); font: 600 var(--fs-3)/1 var(--font-ui); }
.hm-agent-dot { position: absolute; right: -2px; bottom: -2px; width: .65rem; height: .65rem; border: 2px solid var(--bg); border-radius: var(--radius-pill); background: var(--presence-offline); }
.hm-agent-dot[data-presence='online'] { background: var(--presence-online); }
.hm-agent-dot[data-presence='stale'] { background: var(--st-inferred); }
.hm-agent-dot[data-presence='inactive'] { background: var(--st-failed); }
.hm-agent-copy { flex: 1; }
.hm-agent-name { color: var(--text); font: 500 var(--fs-3)/var(--lh-tight) var(--font-ui); }
.hm-claims { display: grid; gap: var(--gut); margin-top: var(--pad-lg); min-width: 0; }
.hm-claims-title { margin: 0; color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.hm-claim-list { display: flex; flex-direction: column; gap: var(--gut); list-style: none; margin: 0; padding: 0; min-width: 0; }
.hm-claim { display: flex; align-items: flex-start; gap: var(--gut); min-width: 0; min-height: var(--row-h); }
.hm-claim[data-conflict='yes'] .hm-agent-face { border-color: var(--st-broken); }
.hm-claim-things { display: flex; flex-wrap: wrap; gap: .4rem; min-width: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }
.hm-claim-conflict { color: var(--st-broken); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.hm-sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.hm-project-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: var(--gut); min-width: 0; }
.hm-project-card { display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; padding: var(--pad-lg); border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); color: var(--text); text-decoration: none; transition: background-color var(--move), border-color var(--move), box-shadow var(--move); }
.hm-project-card:hover { background: var(--panel-2); border-color: var(--border-strong); box-shadow: var(--elev-1); }
.hm-project-name { color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.hm-project-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gut); margin: 0; }
.hm-project-metrics > div { display: flex; flex-direction: column; min-width: 0; }
.hm-project-metrics dt { order: 2; color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }
.hm-project-metrics dd { order: 1; margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; }
.hm-project-waiting dd, .hm-project-waiting dt { color: var(--ask); }
.hm-project-unsure { margin-top: calc(var(--gut) - var(--pad-lg)); color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }
`
