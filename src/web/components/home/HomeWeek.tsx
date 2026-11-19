// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SCHEDULE ON HOME, AS A WEEK: seven days from today, today first and lit, each day with what is planned on it.
 *
 * TODAY IS THE SERVER'S. The browser must not work the day out from its own clock, so today is the day
 * `GET /api/planning/today` answers, the read Today's band makes, and the six days after it are counted from
 * that day key alone (`sevenDaysFrom`).
 *
 * EACH DAY IS READ FROM THE DOOR THE SCHEDULE PAGE READS, `GET /api/planning/day/<day>`. A day whose read did
 * not answer says so, and is never drawn as a day with nothing on it. A day that answered with nothing on it draws
 * its heading alone. An entry carries no time of day, so none is drawn. The week is read again on the minute Home
 * reads itself again.
 *
 * ITS CLASSES ARE NAMED FOR THIS PART, `hm-schedule-week`. The week's hours bar Home drew before, read from
 * `/api/planning/week`, left Home, and tests/the-streamlined-home.test.ts proves it gone by finding no `.hm-week`.
 */
import { memo, useMemo } from 'react'
import { content, t, writtenDay } from '@shared/i18n.ts'
import { dayKey, readDayKey } from '@shared/planning.ts'
import { api, errorMessage, faultOf } from '../../api.ts'
import { useLanguage } from '../../lib/language.ts'
import { setWorkspace } from '../../lib/workspace.ts'
import { pathFor, recordPath } from '../router.tsx'
import { Absence, type AsyncState, ErrorNote, Loading, useAsync } from '../ui.tsx'

/** Today and the six days after it, as day keys. Counted on the calendar, so a change of the clocks moves nothing. */
export function sevenDaysFrom(day: string): string[] {
  const at = readDayKey(day)
  if (at === null) throw new Error(`"${day}" is not a day, so the week cannot be counted from it.`)
  return Array.from({ length: 7 }, (_, n) => dayKey(new Date(at.getFullYear(), at.getMonth(), at.getDate() + n)))
}

/** What the week reads of an entry: only what it draws. */
interface WeekEntry {
  allocation: { id: string }
  work: { id: string; name: string; within: string | null; workspaceId: string } | null
}

/** One day of the week and its reading. */
export interface WeekDay {
  day: string
  plan: AsyncState<{ entries: readonly WeekEntry[] }>
}

/** The seven days, and the today they were counted from. */
export interface TheWeek {
  from: string
  days: WeekDay[]
}

/** Each of the seven days read from its own door. A day that did not answer stays a day that did not answer. */
async function readTheWeek(today: string): Promise<TheWeek> {
  const days = await Promise.all(sevenDaysFrom(today).map((day) => api.plan(day).then(
    (value): WeekDay => ({ day, plan: { status: 'ready', value } }),
    (err: unknown): WeekDay => ({ day, plan: { status: 'error', message: errorMessage(err), fault: faultOf(err) } }),
  )))
  return { from: today, days }
}

/**
 * THE WEEK FROM THE TODAY HOME HOLDS. A Schedule moved to another place is drawn from the start, and draws at once
 * the week the page cache kept while it reads it again. While today is being read, or did not answer, the week
 * says the same.
 */
export function useTheWeek(today: AsyncState<{ day: string }>, again: number): AsyncState<TheWeek> {
  const day = today.status === 'ready' ? today.value.day : null
  // KEPT IN THE PAGE CACHE, so Home opened again draws the week it showed while it reads it again.
  const [week] = useAsync(() => (day === null ? Promise.resolve(null) : readTheWeek(day)), [day, again], { keep: 'home.week' })
  const language = useLanguage()
  // THE SAME WEEK IS HANDED BACK AS THE SAME OBJECT until today's day, the week's reading or the page's language
  // changes. Today is read again every minute, and an answer naming the same day does not draw the week again.
  return useMemo((): AsyncState<TheWeek> => {
    // EACH FAILURE IN WORDS OF ITS OWN, so the note says which read stopped the week.
    if (today.status === 'error') return { status: 'error', message: t('home.week.noToday') }
    if (day === null) return { status: 'loading' }
    if (week.status === 'error') return { status: 'error', message: t('home.week.notCounted') }
    if (week.status !== 'ready') return week
    // A WEEK COUNTED FROM ANOTHER DAY is the one read before today moved on, and is not drawn as this week.
    if (week.value === null || week.value.from !== day) return { status: 'loading' }
    return { status: 'ready', value: week.value }
  }, [today.status, day, week, language])
}

/** A day's short heading: "Fri 13 Nov". A key that is not a day is drawn as it came. */
function dayTitle(day: string): string {
  const at = readDayKey(day)
  return at === null ? content(day) : writtenDay(at, { weekday: 'short', day: 'numeric', month: 'short' })
}

function DayEntries({ plan, projectName }: { plan: WeekDay['plan']; projectName: (id: string) => string }) {
  if (plan.status === 'loading') return <p className="hm-schedule-week-words">{t('home.week.reading')}</p>
  if (plan.status === 'error') return <p className="hm-schedule-week-words"><Absence tier="told-apart" looked={false} word={t('home.week.notRead')} title={t('home.week.unread')} /></p>
  if (plan.value.entries.length === 0) return null
  return (
    <ul className="hm-schedule-week-entries">
      {plan.value.entries.map(({ allocation, work }) => (
        <li key={allocation.id} data-home-entry>
          {work === null ? (
            <span className="hm-schedule-week-entry hm-schedule-week-gone">{t('schedule.gone')}</span>
          ) : (
            <a className="hm-schedule-week-entry" href={`#${recordPath(work.id)}`} onClick={() => setWorkspace(work.workspaceId)}>
              <span className="hm-row-title">{content(work.name)}</span>
              <span className="hm-row-meta">{content(projectName(work.workspaceId))}{work.within === null ? null : ` · ${content(work.within)}`}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The seven days, today first and lit, and the way to the schedule page. */
export function HomeWeekDays({ today, days, projectName }: { today: string; days: readonly WeekDay[]; projectName: (id: string) => string }) {
  return (
    <>
      <ol className="hm-schedule-week-days">
        {days.map(({ day, plan }) => (
          <li
            key={day}
            className="hm-schedule-week-day"
            data-home-day={day}
            data-today={day === today ? 'true' : undefined}
            aria-current={day === today ? 'date' : undefined}
          >
            <h3 className="hm-schedule-week-date">
              {day === today ? <span className="hm-schedule-week-today">{t('home.today')}</span> : null}
              <span>{dayTitle(day)}</span>
            </h3>
            <DayEntries plan={plan} projectName={projectName} />
          </li>
        ))}
      </ol>
      <OpenTheSchedule />
    </>
  )
}

function OpenTheSchedule() {
  return <p className="hm-elsewhere"><a href={`#${pathFor('plan')}`} className="hm-section-link" data-home-goes="plan">{t('home.openTheSchedule')}</a></p>
}

/**
 * Schedule's week on Home: the seven days, or what stopped them being read. It is drawn again only when what it is
 * handed changed, so the minute's re-read that answers the same week draws none of its days again.
 */
export const HomeWeek = memo(function HomeWeek({ week, projectName, onRetry }: { week: AsyncState<TheWeek>; projectName: (id: string) => string; onRetry?: () => void }) {
  return (
    <section className="hm-section hm-schedule-week" data-home-section="week">
      <style href="mole-office-home-week" precedence="default">{HOME_WEEK_CSS}</style>
      <header className="hm-section-head"><h2 className="hm-section-title">{t('home.week.title')}</h2></header>
      {week.status === 'loading' ? (
        <Loading label={t('home.week.readingWeek')} rows={3} />
      ) : week.status === 'error' ? (
        <>
          <ErrorNote message={week.message} retry={onRetry} />
          <OpenTheSchedule />
        </>
      ) : (
        <HomeWeekDays today={week.value.from} days={week.value.days} projectName={projectName} />
      )}
    </section>
  )
})

export const HOME_WEEK_CSS = `
.hm-schedule-week { container: hm-schedule-week / inline-size; }
.hm-schedule-week-days { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; }
.hm-schedule-week-day { display: grid; grid-template-columns: 7rem minmax(0, 1fr); align-items: start; gap: var(--gut); min-width: 0; padding: var(--pad) var(--pad); border-bottom: var(--border-w) solid var(--border); }
.hm-schedule-week-day:last-child { border-bottom: 0; }
.hm-schedule-week-day[data-today="true"] { border-radius: var(--radius); background: var(--accent-soft); box-shadow: inset var(--rail) 0 0 var(--accent); }
.hm-schedule-week-date { display: flex; flex-direction: column; gap: 2px; margin: 0; color: var(--text-2); font: 500 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.hm-schedule-week-day[data-today="true"] .hm-schedule-week-date { color: var(--text); }
.hm-schedule-week-today { color: var(--accent); font: 700 var(--fs-1)/var(--lh-tight) var(--font-ui); text-transform: uppercase; letter-spacing: .04em; }
.hm-schedule-week-words { margin: 0; color: var(--text-3); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
.hm-schedule-week-entries { list-style: none; margin: 0; padding: 0; display: grid; gap: calc(var(--gut) * 0.5); min-width: 0; }
.hm-schedule-week-entry { display: flex; flex-direction: column; gap: 2px; min-width: 0; color: var(--text); text-decoration: none; }
a.hm-schedule-week-entry:hover .hm-row-title { color: var(--accent); }
.hm-schedule-week-gone { color: var(--text-3); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
@container hm-schedule-week (min-width: 56rem) {
  .hm-schedule-week-days { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: calc(var(--gut) * 0.5); }
  .hm-schedule-week-day { grid-template-columns: minmax(0, 1fr); align-content: start; border-bottom: 0; border-radius: var(--radius); }
  .hm-schedule-week-day:not([data-today="true"]) { box-shadow: inset 0 0 0 var(--border-w) var(--border); }
}
`
