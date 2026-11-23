// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S AGENTS AT WORK, ONE BAR PER PROJECT.
 *
 * Each project's bar is split into three parts, with their sum at the end and a key below the bars:
 *
 *   waiting on you  an active agent of the project's roster that the waiting list names;
 *   stuck           any other agent of the roster whose serving run is one of the project's late or stuck alarms;
 *   working         any other agent of the roster that is online or stale.
 *
 * An agent that is none of the three (offline, or inactive) is not in the bar. A project whose roster
 * counts nobody draws its name alone: no bar, no number and no words.
 *
 * EACH COUNT COMES FROM A READING HOME ALREADY MAKES: the roster of each project, the waiting list that
 * Needs you draws, and the attention reading that Late or stuck draws (src/shared/attention-first-page.ts is the one rule for which
 * of its rows are alarms). The waiting list names the agent each row came from (`WaitingItem.fromAgent`),
 * and is read whole, so an agent it names is waiting on you in each project whose roster holds it.
 *
 * WHICH RUN SERVES EACH AGENT comes with the roster: each row names it as `doingFrom`, so Home asks no read
 * of its own for it. An agent is stuck when an alarm names that run, so in a project with no alarm on a run
 * nobody is stuck.
 *
 * A COUNT WHOSE READING DID NOT ANSWER IS SAID IN WORDS AND NEVER DRAWN AS ZERO. The bar names each reading
 * that failed, and a bar still being read says so. The heading counts only the bars that were counted, and
 * says under it how many were not.
 *
 * THE HEADING COUNTS EACH AGENT ONCE. One agent may stand on the rosters of two projects: each project holds an
 * agent record of its own, and the registry maps both to one participant (one live registry row per handle,
 * src/server/lib/participants.ts). Each bar counts its own roster, and the heading counts the participants.
 */
import { content, count, t, type WordKey } from '@shared/i18n.ts'
import type { AsyncState } from '../ui.tsx'

/** The three parts of a bar, in the order they are drawn. */
const BAR_PARTS = ['working', 'waiting', 'stuck'] as const
type BarPart = (typeof BAR_PARTS)[number]
const PART_WORDS: Readonly<Record<BarPart, WordKey>> = { working: 'home.bars.working', waiting: 'home.bars.waiting', stuck: 'home.bars.stuck' }

/** The three readings a bar is counted from. */
export type BarReading = 'roster' | 'waiting' | 'attention'
const UNREAD_WORDS: Readonly<Record<BarReading, WordKey>> = {
  roster: 'home.bars.unread.roster',
  waiting: 'home.bars.unread.waiting',
  attention: 'home.bars.unread.attention',
}

/** What the bars read of each reading: only the fields the counts use. */
interface BarRosterRow { agentId: string; participant: { id: string } | null; presence: { presence: string }; doingFrom: string | null }

export interface BarReadings {
  roster: AsyncState<{ rows: readonly BarRosterRow[] }>
  waiting: AsyncState<{ items: readonly { fromAgent: { answer: string; agentId?: string } }[] }>
  attention: AsyncState<{ alarms: { sessionIds: readonly string[] } }>
}

/**
 * A counted bar, or the readings that did not answer. An empty `failed` is a bar still being read. `atWork` is
 * who the bar counts, in roster order: each by its participant, or by its record when the registry maps it to
 * none (a record is in one project only).
 */
export type HomeBar =
  | { read: true; working: number; waiting: number; stuck: number; total: number; atWork: string[] }
  | { read: false; failed: BarReading[] }

const STILL_READING: HomeBar = { read: false, failed: [] }

/** The runs the project's late or stuck alarms are on. */
function alarmRunsOf(attention: { alarms: { sessionIds: readonly string[] } }): ReadonlySet<string> {
  return new Set(attention.alarms.sessionIds)
}

/** One project's bar, counted from its three readings. */
export function theBarOf({ roster, waiting, attention }: BarReadings): HomeBar {
  const alarmRuns = attention.status === 'ready' ? alarmRunsOf(attention.value) : null
  const failed: BarReading[] = []
  if (roster.status === 'error') failed.push('roster')
  if (waiting.status === 'error') failed.push('waiting')
  if (attention.status === 'error') failed.push('attention')
  if (failed.length > 0) return { read: false, failed }
  if (roster.status !== 'ready' || waiting.status !== 'ready' || alarmRuns === null) return STILL_READING

  const named = new Set<string>()
  for (const item of waiting.value.items) if (item.fromAgent.answer === 'an-agent' && item.fromAgent.agentId !== undefined) named.add(item.fromAgent.agentId)
  let working = 0
  let waitingOnYou = 0
  let stuck = 0
  const atWork: string[] = []
  for (const row of roster.value.rows) {
    const who = row.participant?.id ?? row.agentId
    if (row.participant !== null && named.has(row.participant.id)) {
      waitingOnYou += 1
      atWork.push(who)
      continue
    }
    // THE RUN SERVING THE AGENT IS THE ROSTER ROW'S OWN, so it is read with the agent and cannot lag behind it.
    if (row.doingFrom !== null && alarmRuns.has(row.doingFrom)) {
      stuck += 1
      atWork.push(who)
      continue
    }
    if (row.presence.presence === 'online' || row.presence.presence === 'stale') {
      working += 1
      atWork.push(who)
    }
  }
  return { read: true, working, waiting: waitingOnYou, stuck, total: working + waitingOnYou + stuck, atWork }
}

/** How many rows of the waiting list cannot say which agent they came from. They may be from an agent counted here. */
export function cannotTellIn(waiting: BarReadings['waiting']): number {
  return waiting.status === 'ready' ? waiting.value.items.filter((item) => item.fromAgent.answer === 'cannot-tell').length : 0
}

/** One project's line in the bars. `agents` is how many active agents its roster holds, when it was read. */
export interface BarProject {
  id: string
  name: string
  bar: HomeBar
  agents?: number
}

function BarRow({ project, longest }: { project: BarProject; longest: number }) {
  const { bar } = project
  return (
    <li
      className="hm-bar-row"
      data-bar-read={bar.read ? 'yes' : 'no'}
      data-agent-count={project.agents}
      data-home-bar={project.id}
    >
      <span className="hm-bar-name">{content(project.name)}</span>
      {!bar.read ? (
        <span className="hm-bar-words">
          {bar.failed.length === 0 ? t('home.bars.reading') : bar.failed.map((reading) => t(UNREAD_WORDS[reading])).join(' ')}
        </span>
      ) : bar.total === 0 ? null : (
        <>
          <span className="hm-bar-cell">
            <span
              className="hm-bar-track"
              role="img"
              aria-label={t('home.bars.said', { working: count(bar.working), waiting: count(bar.waiting), stuck: count(bar.stuck) })}
              style={{ inlineSize: `${String((bar.total / Math.max(longest, 1)) * 100)}%` }}
            >
              {BAR_PARTS.map((part) => bar[part] > 0 ? (
                <span
                  key={part}
                  className="hm-bar-part"
                  data-bar-part={part}
                  data-count={bar[part]}
                  style={{ flexGrow: bar[part] }}
                  title={t('home.bars.partTitle', { part: t(PART_WORDS[part]), n: count(bar[part]) })}
                />
              ) : null)}
            </span>
          </span>
          <span className="hm-bar-total" data-bar-total={bar.total}>{count(bar.total)}</span>
        </>
      )}
    </li>
  )
}

/** The bars, their heading and their key. */
export function HomeAgentBars({ projects, waitingCannotTell }: { projects: readonly BarProject[]; waitingCannotTell: number }) {
  const counted = projects.flatMap((project) => (project.bar.read ? [project.bar] : []))
  const failed = projects.filter((project) => !project.bar.read && project.bar.failed.length > 0).length
  const reading = projects.length - counted.length - failed
  const agents = new Set(counted.flatMap((bar) => bar.atWork)).size
  const busy = counted.filter((bar) => bar.total > 0).length
  const longest = counted.reduce((most, bar) => Math.max(most, bar.total), 0)
  return (
    <div className="hm-bars" data-home-bars>
      <style href="mole-office-agent-bars" precedence="default">{HOME_AGENT_BARS_CSS}</style>
      {counted.length > 0 ? (
        <p className="hm-bars-heading">{t('home.bars.heading', { agents: t('home.bars.agents', { n: agents }), busy: count(busy), projects: t('home.bars.projects', { n: projects.length }) })}</p>
      ) : reading > 0 ? <p className="hm-bars-heading">{t('home.bars.headingReading')}</p> : null}
      {failed > 0 ? <p className="hm-empty">{t('home.bars.notCounted', { n: failed })}</p> : null}
      {counted.length > 0 && reading > 0 ? <p className="hm-empty">{t('home.bars.stillReading', { n: reading })}</p> : null}
      <ul className="hm-bar-list">
        {projects.map((project) => <BarRow key={project.id} project={project} longest={longest} />)}
      </ul>
      <p className="hm-bars-key" data-home-bars-key>
        {BAR_PARTS.map((part) => (
          <span key={part} className="hm-bars-key-item">
            <span className="hm-bars-swatch" data-bar-key-part={part} aria-hidden="true" />
            <span>{t(PART_WORDS[part])}</span>
          </span>
        ))}
      </p>
      {waitingCannotTell > 0 ? <p className="hm-empty" data-home-bars-cannot-tell>{t('home.bars.cannotTell', { n: waitingCannotTell })}</p> : null}
    </div>
  )
}

export const HOME_AGENT_BARS_CSS = `
.hm-bars { container-type: inline-size; display: grid; gap: var(--gut); min-width: 0; }
.hm-bars-heading { margin: 0; color: var(--text); font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); }
.hm-bar-list { list-style: none; margin: 0; padding: 0; display: grid; gap: calc(var(--gut) * 0.75); min-width: 0; }
.hm-bar-row { display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr) auto; align-items: center; column-gap: var(--gut); min-width: 0; }
.hm-bar-name { min-width: 0; overflow-wrap: anywhere; color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
.hm-bar-words { grid-column: 2 / -1; color: var(--text-3); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-bar-cell { display: block; min-width: 0; }
.hm-bar-track { display: flex; min-inline-size: 0.75rem; max-inline-size: 100%; block-size: 0.875rem; border-radius: var(--radius); overflow: hidden; }
.hm-bar-part { display: block; min-inline-size: 0.25rem; flex-basis: 0; }
.hm-bar-part[data-bar-part="working"], .hm-bars-swatch[data-bar-key-part="working"] { background: var(--st-doing); }
.hm-bar-part[data-bar-part="waiting"], .hm-bars-swatch[data-bar-key-part="waiting"] { background: var(--ask); }
.hm-bar-part[data-bar-part="stuck"], .hm-bars-swatch[data-bar-key-part="stuck"] { background: var(--st-blocked); }
.hm-bar-total { color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); font-variant-numeric: tabular-nums; text-align: end; min-inline-size: 2ch; }
.hm-bars-key { display: flex; flex-wrap: wrap; gap: calc(var(--gut) * 0.5) calc(var(--gut) * 1.5); margin: 0; padding-top: var(--gut); border-top: var(--border-w) solid var(--border); color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.hm-bars-key-item { display: inline-flex; align-items: center; gap: calc(var(--gut) * 0.5); }
.hm-bars-swatch { display: inline-block; inline-size: 0.75rem; block-size: 0.75rem; border-radius: 2px; }
@container (max-width: 26rem) {
  .hm-bar-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: calc(var(--gut) * 0.25); }
  .hm-bar-name { grid-column: 1 / -1; }
  .hm-bar-words { grid-column: 1 / -1; }
}
`
