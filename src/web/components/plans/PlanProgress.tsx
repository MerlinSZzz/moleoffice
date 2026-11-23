// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * PLANNED AGAINST DONE, ON THE PLAN'S OWN PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS, AND WHAT IT REFUSES TO DERIVE
 * ---------------------------------------------------------------------------------------
 *
 * The plan's table draws each line's state word. This draws the whole plan as one answer: how many
 * lines are filed as work and what happened to that work, and the hours those allocations hold,
 * planned against actually spent.
 *
 * EVERY NUMBER HERE IS READ FROM SOMETHING THE MACHINE WAS TOLD. A line's state is the state of
 * the record it was filed as, classified by `progressOf` — the same function every other surface
 * classifies a state word with. The hours are the allocations that name that record, summed by
 * `hoursOn` in src/server/lib/plans.ts and handed over on this reply. Nothing is computed from a
 * line's prose and nothing is inferred from its position.
 *
 * AN ABSENT NUMBER IS DRAWN AS NOT STATED, NEVER AS ZERO. An allocation may commit time without
 * saying how long for, and an allocation nobody has completed states no actual. `0h` for either is
 * a claim nobody made, so the tally names the allocations that said nothing beside the sum.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS IT DOES NOT KNOW
 * ---------------------------------------------------------------------------------------
 *
 * A plan's lines carry no creation stamp: a line stores when it was last written and by whom, and
 * nothing stores when it first appeared. So a line written after the plan was made is marked as
 * that and no further — whether it was added or edited is not recorded. A line removed from the
 * plan leaves no row, so a line that is gone cannot be drawn at all. The drawing gives the line
 * history one label and the state not recorded, rather than an absence a reader would take for a
 * zero.
 */

import { progressOf, type Progress } from '@shared/work.ts'
import { linkWord } from '@shared/words.ts'
import type { PlanAnswer, PlanLineWithWork } from '../../api.ts'
import { writerNamed, type ParticipantsNamed } from '../../lib/participant-lookup.ts'
import { recordPath, RouteLink } from '../router.tsx'
import { Absence, Stamp, StoredState, Tag } from '../ui.tsx'
import { lineWithMaths } from './PlanMaths.tsx'

/** An absence is not a zero, so it is drawn as one. */
function hoursSaid(value: number | null): string {
  return value === null ? '—' : t('g8.progress.h', { value1: value })
}

/**
 * THE HOURS A LINE CARRIES, OR NONE.
 *
 * A line read from the server always carries them. A line the browser has just written may not,
 * because a body save hands back rows and not allocations; that is no hours yet said, not zero.
 */
function hoursOf(entry: PlanLineWithWork): NonNullable<PlanLineWithWork['hours']> {
  return entry.hours ?? { planned: null, actual: null, allocations: 0, plannedUnstated: 0, actualUnstated: 0 }
}

export interface PlanProgressProps {
  lines: readonly PlanLineWithWork[]
  /** The plan's own creation stamp, which is all that exists to compare a line's last write with. */
  planCreatedAt: string
  /** Every answer on the work these lines name, when the read carried them. */
  answers?: readonly PlanAnswer[]
  /** The registry the writers' names are read from, when the page could read it. */
  participants?: ParticipantsNamed
}

export function PlanProgress({ lines, planCreatedAt, answers = [], participants }: PlanProgressProps) {
  const filed = lines.filter((entry) => entry.line.recordId !== null)
  const writing = lines.filter((entry) => entry.line.recordId === null)
  const unfiled = writing.length

  const tally = new Map<Progress | 'no-state', number>()
  for (const entry of filed) {
    const word = progressOf(entry.work?.state) ?? 'no-state'
    tally.set(word, (tally.get(word) ?? 0) + 1)
  }
  const countOf = (word: Progress | 'no-state'): number => tally.get(word) ?? 0

  const anyPlanned = filed.some((entry) => hoursOf(entry).planned !== null)
  const anyActual = filed.some((entry) => hoursOf(entry).actual !== null)
  const planned = filed.reduce((sum, entry) => sum + (hoursOf(entry).planned ?? 0), 0)
  const actual = filed.reduce((sum, entry) => sum + (hoursOf(entry).actual ?? 0), 0)
  const plannedUnstated = filed.reduce((n, entry) => n + hoursOf(entry).plannedUnstated, 0)
  const actualUnstated = filed.reduce((n, entry) => n + hoursOf(entry).actualUnstated, 0)

  return (
    <section className="pp" aria-label={t('g8.progress.plannedAgainstDone')}>
      <style href="mole-office-plan-progress" precedence="default">
        {PLAN_PROGRESS_CSS}
      </style>
      <h3 className="pp-head" data-title-is="its-label">{t('g8.progress.plannedAgainstDone')}</h3>

      <dl className="pp-tally">
        <div>
          <dt>{t('g8.progress.lines')}</dt>
          <dd>{lines.length}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.filedAsWork')}</dt>
          <dd>{filed.length}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.stillOnlyWriting')}</dt>
          <dd>{unfiled}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.finished')}</dt>
          <dd>{countOf('finished')}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.stoppedShort')}</dt>
          <dd>{countOf('stopped_short')}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.notStartedOrUnderWay')}</dt>
          <dd>{countOf('not_started') + countOf('in_flight')}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.noStateWord')}</dt>
          <dd>{countOf('no-state') + countOf('unknown') + countOf('unclassified') + countOf('paused')}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.plannedHours')}</dt>
          <dd>{anyPlanned ? t('g8.progress.h', { value1: planned }) : <Absence tier="told-apart" looked={false} word={t('g8.progress.hoursNotStated')} />}</dd>
        </div>
        <div>
          <dt>{t('g8.progress.spentHours')}</dt>
          <dd>{anyActual ? t('g8.progress.h', { value1: actual }) : <Absence tier="told-apart" looked={false} word={t('g8.progress.hoursNotStated')} />}</dd>
        </div>
      </dl>

      {/* AN ABSENT NUMBER, NAMED. The sums above cover only the allocations that stated a number;
          this says how many did not, so a reader never reads the total as the whole truth. */}
      {plannedUnstated === 0 && actualUnstated === 0 ? null : (
        <p className="pp-unstated">{t('g8.progress.allocationStateNoPlannedHoursAndStateNoHours', { n: plannedUnstated, actual: actualUnstated })}</p>
      )}

      <table className="pp-table">
        <thead>
          <tr>
            <th>{t('g8.progress.line')}</th>
            <th>{t('g8.progress.work')}</th>
            <th>{t('g8.progress.state')}</th>
            <th>{t('g8.progress.planned')}</th>
            <th>{t('g8.progress.spent')}</th>
          </tr>
        </thead>
        <tbody>
          {filed.length === 0 ? (
            <tr>
              <td colSpan={5}><Absence /></td>
            </tr>
          ) : (
            filed.map((entry) => (
              <tr key={entry.line.id}>
                <td className="pp-words">{lineWithMaths(entry.line.text)}</td>
                <td>{entry.work === null ? t('g8.progress.gone') : entry.work.title}</td>
                <td>
                  {/* THE STATE WORD THROUGH THE ONE READER. `StoredState` names it the way every other
                      surface does, so a stored word never reaches this drawing raw. */}
                  {entry.work === null ? (
                    t('g8.progress.theRecordItNamedIsGone')
                  ) : (
                    <StoredState
                      state={entry.work.state}
                      source={entry.work.stateSource}
                      progress={progressOf(entry.work.state)}
                      kind={entry.work.kind}
                    />
                  )}
                  {entry.line.updatedAt > planCreatedAt ? (
                    <span className="pp-since">{t('g8.progress.writtenSinceThisPlanWasMade')}</span>
                  ) : null}
                </td>
                <td className="pp-num">{hoursSaid(hoursOf(entry).planned)}</td>
                <td className="pp-num">{hoursSaid(hoursOf(entry).actual)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* WHO SAID A PLAN CAME TRUE, AND WHEN. Each answer is a `realises` or `instead_of` link on
          work one of these lines names. The count is the plan's, not the page's: every row the
          server read is drawn, and a writer the registry does not name is said to be unregistered
          rather than left blank. Zero is drawn too: a plan with no answer says so instead of
          leaving the reader to wonder whether the section is missing. */}
      <div className="pp-answers">
        <h4 className="pp-answers-head">{t('g7a.horizons.answers', { n: answers.length })}</h4>
        {answers.length === 0 ? null : (
          <ul className="pp-answers-list">
            {answers.map((answer) => (
              <li key={answer.id} className="pp-answer">
                <Tag tone="quiet">{linkWord(answer.type, 'forward').text}</Tag>
                <RouteLink to={recordPath(answer.workId)}>{answer.workTitle ?? t('g8.progress.gone')}</RouteLink>
                <span className="pp-answer-arrow" aria-hidden="true">→</span>
                <RouteLink to={recordPath(answer.toId)}>{answer.toTitle ?? t('g8.progress.gone')}</RouteLink>
                <span className="pp-answer-said">
                  {answer.by === null
                    ? t('g7a.horizons.answerAuthorUnknown')
                    : t('g7a.horizons.answerBy', { who: writerNamed(answer.by, participants) })}
                </span>
                <span className="pp-answer-when"><Stamp at={answer.at} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* THE LINES STILL ONLY WRITING, so a line written after the plan was made is drawn whether or
          not anybody has filed it as work yet. It is not a table because there is no work, no state
          and no hours to report about it — only the words and when they were last written. */}
      {writing.length === 0 ? null : (
        <ul className="pp-writing">
          {writing.map((entry) => (
            <li key={entry.line.id}>
              {lineWithMaths(entry.line.text)}
              {entry.line.updatedAt > planCreatedAt ? (
                <span className="pp-since">{t('g8.progress.writtenSinceThisPlanWasMade')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* WHAT NOTHING STORES, AS A LABEL AND A STATE. When a line first appeared and why it was
          added or changed are not recorded, so this is one row like the tally's, saying so. */}
      <dl className="pp-tally pp-unknown">
        <div>
          <dt>{t('g8.progress.lineHistory')}</dt>
          <dd>{t('word.notRecorded')}</dd>
        </div>
      </dl>
    </section>
  )
}

const PLAN_PROGRESS_CSS = `
.pp { margin-top: 1rem; border-top: 1px solid var(--border); padding-top: .6rem; }
.pp-head { margin: 0 0 .4rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; opacity: .8; }
.pp-tally { display: flex; flex-wrap: wrap; gap: .2rem 1rem; margin: 0 0 .5rem; }
.pp-tally div { display: flex; gap: .3rem; align-items: baseline; }
.pp-tally dt { opacity: .75; font-size: .8rem; }
.pp-tally dd { margin: 0; font-variant-numeric: tabular-nums; }
.pp-unstated, .pp-unknown { opacity: .8; font-size: .8rem; margin: .4rem 0; }
.pp-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.pp-table th, .pp-table td { text-align: left; padding: .2rem .4rem; border-bottom: 1px solid var(--border); vertical-align: top; }
.pp-writing { list-style: none; margin: .4rem 0 0; padding: 0; font-size: .85rem; }
.pp-writing li { padding: .15rem 0; }
.pp-answers { margin-top: .7rem; }
.pp-answers-head { margin: 0 0 .3rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; opacity: .8; }
.pp-answers-list { list-style: none; margin: 0; padding: 0; font-size: .85rem; }
.pp-answer { display: flex; flex-wrap: wrap; align-items: baseline; gap: .15rem .45rem; padding: .25rem 0; border-bottom: 1px solid var(--border); }
.pp-answer-arrow { opacity: .7; }
.pp-answer-said, .pp-answer-when { opacity: .85; }
.pp-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pp-since { opacity: .7; font-size: .8rem; }
`
