// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE END OF A RAISE, CHOSEN AND NOT TYPED. Typing the end as text is easy to get wrong, so they choose
 * it. Drawn by the raise form in TheirCard.tsx, for the end "at a time", and by nothing else.
 *
 * WHAT IT OFFERS, after wave 13k's drawing (report bBeOH2QwTAcJ, block b-6): five lengths from now, each showing the time
 * it would end, and Another time, which opens a day, an hour and a minute. One line under the choice says when it ends,
 * how long that is from now, and by which clock. A time that has passed is said in the failed colour, and the form's
 * press stays unpressable (`onChange` hands up null).
 *
 * WHAT IT SENDS is always a whole stamp, `YYYY-MM-DD HH:MM:SS`, on the OFFICE's clock: the zone the profile reply names
 * under answer 5 of a decision. The office compares a raise's end with its own wall clock, so a
 * stamp written on a browser in another zone would end the raise hours early or late. Every time this choice draws is
 * on that clock too, and the line under the choice names the zone; where this computer's zone is another, a second line
 * names that one. A length is counted from now again every few seconds, so "1 hour" is an hour from the moment they
 * press, give or take the tick. The door still reads and refuses what it is sent (problem OpT-wLSCwlZ-), because other
 * callers send text.
 *
 * THE HOUR AND THE MINUTE ARE LISTS, NOT THE BROWSER'S TIME FIELD. The browser's own time field follows the browser's
 * language and drew 09:00 AM in a test browser (13k's report, block b-6); the office stores a 24-hour clock.
 */

import { useEffect, useMemo, useState } from 'react'

import { t } from '@shared/i18n.ts'
import { calendarDaysBetween, momentOfStampInZone, stampInZone, theClockZone, theSameTimeTheNextDay } from '@shared/time.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The choices, in the order they are drawn. A length is milliseconds from now; the other three are worked out below. */
const CHOICES = [
  { id: '15m', word: 'raiseChoose.in15m', length: 15 * MINUTE },
  { id: '1h', word: 'raiseChoose.in1h', length: HOUR },
  { id: '4h', word: 'raiseChoose.in4h', length: 4 * HOUR },
  { id: 'today', word: 'raiseChoose.endOfToday', length: null },
  { id: 'day', word: 'raiseChoose.aDay', length: null },
  { id: 'another', word: 'raiseChoose.another', length: null },
] as const
type Choice = (typeof CHOICES)[number]['id']

/** A moment, to the nearest whole minute, so the end a person reads is the end that is sent. */
function toTheMinute(ms: number): number {
  return Math.round(ms / MINUTE) * MINUTE
}

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * The end a choice gives, from `now`, on the clock of `zone`. NaN where 23:59 or the next day's time cannot be read.
 * "A DAY" IS A CALENDAR DAY: the same clock time on the next day, so 23 or 25 hours across a clock
 * change. Exported for its test.
 */
export function endOf(choice: Choice, now: number, another: number, zone: string): number {
  if (choice === 'another') return another
  if (choice === 'today') return momentOfStampInZone(`${dayOf(now, zone)} 23:59:00`, zone) ?? Number.NaN
  if (choice === 'day') return toTheMinute(theSameTimeTheNextDay(now, zone) ?? Number.NaN)
  const length = CHOICES.find((one) => one.id === choice)?.length ?? 0
  return toTheMinute(now + length)
}

/** `HH:MM` of a moment on the clock of `zone`. */
function clockOf(ms: number, zone: string): string {
  return stampInZone(ms, zone).slice(11, 16)
}

/**
 * `today at 13:00`, `tomorrow at 13:00` or `on 2026/10/03 at 13:00`, by the calendar of `zone`. Exported for the raise
 * that holds (TheirCard.tsx), so the form and the raise say an end the same way.
 */
export function whenInWords(end: number, now: number, zone: string): string {
  const time = clockOf(end, zone)
  const endDay = dayOf(end, zone)
  // DATES AHEAD, counted by the one counter of calendar days (`calendarDaysBetween` in shared/time.ts).
  const days = calendarDaysBetween(now, end, zone)
  if (days === 0) return t('raiseChoose.today', { time })
  if (days === 1) return t('raiseChoose.tomorrow', { time })
  return t('raiseChoose.onDay', { date: endDay.replaceAll('-', '/'), time })
}

/**
 * How long from now, to the minute: minutes under an hour, hours and minutes under two days, then days and hours.
 * Exported for the raise that holds (TheirCard.tsx), for the same reason as `whenInWords`.
 */
export function howLongInWords(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return t('raiseChoose.inMinutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  const left = minutes % 60
  if (hours < 48) return left === 0 ? t('raiseChoose.inHours', { n: hours }) : t('raiseChoose.inHoursMinutes', { h: hours, m: left })
  const days = Math.floor(hours / 24)
  const hoursLeft = hours % 24
  return hoursLeft === 0 ? t('raiseChoose.inDays', { n: days }) : t('raiseChoose.inDaysHours', { d: days, h: hoursLeft })
}

/** The day field's value for a moment on the clock of `zone`: `YYYY-MM-DD`, which is what a date field holds whatever it draws. */
function dayOf(ms: number, zone: string): string {
  return stampInZone(ms, zone).slice(0, 10)
}

export function RaiseEndChoice({ onChange, officeZone }: { onChange: (stamp: string | null) => void; officeZone: string }) {
  useLanguage()
  const inspect = useInspect()
  const [now, setNow] = useState(() => Date.now())
  // A DAY IS CHOSEN FIRST, because a raise with no end named is a day.
  const [choice, setChoice] = useState<Choice>('day')
  // ANOTHER TIME STARTS at the whole hour one to two hours on, on the office's clock, so the first thing it shows is a time
  // that has not passed.
  const [day, setDay] = useState(() => dayOf(Date.now() + 2 * HOUR, officeZone))
  const [hour, setHour] = useState(() => Number(stampInZone(Date.now() + 2 * HOUR, officeZone).slice(11, 13)))
  const [minute, setMinute] = useState(0)

  // THE CLOCK MOVES ON, so a length stays counted from now and a time that passes while they read is said to have passed.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(tick)
  }, [])

  const another = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Number.NaN
    return momentOfStampInZone(`${day} ${pad(hour)}:${pad(minute)}:00`, officeZone) ?? Number.NaN
  }, [day, hour, minute, officeZone])
  const end = endOf(choice, now, another, officeZone)
  const readable = Number.isFinite(end)
  const passed = !readable || end <= now
  const stamp = readable ? stampInZone(end, officeZone) : null

  useEffect(() => {
    onChange(passed ? null : stamp)
  }, [passed, stamp, onChange])

  // THIS COMPUTER'S ZONE, said only where it is not the office's, because then the times here are not its clock's.
  const here = theClockZone()
  return (
    <div className="rec">
      <style href="mole-office-raise-end-choice" precedence="default">
        {RAISE_END_CHOICE_CSS}
      </style>
      <div className="rec-choices" role="radiogroup" aria-label={t('raiseChoose.group')}>
        {CHOICES.map((one) => {
          const itsEnd = one.id === 'another' ? null : endOf(one.id, now, another, officeZone)
          return (
            <label key={one.id} className="rec-choice" data-choice={one.id} data-chosen={choice === one.id ? 'yes' : undefined}>
              <input type="radio" name="mole-office-raise-end" value={one.id} checked={choice === one.id} onChange={() => setChoice(one.id)} />
              <span className="rec-word">{t(one.word)}</span>
              {itsEnd === null || !Number.isFinite(itsEnd) ? null : <span className="rec-at">{clockOf(itsEnd, officeZone)}</span>}
            </label>
          )
        })}
      </div>
      {choice !== 'another' ? null : (
        <div className="rec-another">
          <label className="rec-field">
            <span className="rec-key">{t('raiseChoose.day')}</span>
            <input className="px-input rec-day" type="date" value={day} min={dayOf(now, officeZone)} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="rec-field">
            <span className="rec-key">{t('raiseChoose.hour')}</span>
            <select className="px-select rec-hour" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, n) => (
                <option key={n} value={n}>
                  {pad(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="rec-field">
            <span className="rec-key">{t('raiseChoose.minute')}</span>
            <select className="px-select rec-minute" value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, n) => n * 5).map((n) => (
                <option key={n} value={n}>
                  {pad(n)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {/* A DAY FIELD LEFT EMPTY IS NOT A TIME THAT HAS PASSED, so it is said apart. */}
      {!readable ? (
        <p className="rec-line rec-passed" data-passed="no-day">
          {t('raiseChoose.noDay')}
        </p>
      ) : passed ? (
        <p className="rec-line rec-passed" data-passed="yes">
          {t('raiseChoose.passed')}
        </p>
      ) : (
        <p className="rec-line">
          {t('raiseChoose.endsLine', { when: whenInWords(end, now, officeZone), howLong: howLongInWords(end - now) })}
        </p>
      )}
      {/* WHICH CLOCK, ALWAYS: the office's zone by name, and this computer's where it is another. */}
      <p className="rec-clock" data-zone={officeZone}>
        {t('agentPage.officeClock', { zone: officeZone })}
        {here === officeZone ? null : <> <span className="rec-clock-here" data-zone={here}>{t('agentPage.yourClockDiffers', { zone: here })}</span></>}
      </p>
      {/* WHAT THE PRESS WILL SEND, in developer mode only, so what is stored can be seen. */}
      {inspect && stamp !== null ? (
        <p className="rec-sends">
          <span className="rec-key">{t('raiseChoose.sends')}</span> <code>{stamp}</code>
        </p>
      ) : null}
    </div>
  )
}

/**
 * The choice's own rules. Every value is a token. A chosen length takes the --chosen-* values a chosen card takes. Each
 * length is a label round a radio, so the keyboard moves through them as through any radio group. No backtick in here.
 */
const RAISE_END_CHOICE_CSS = `
.rec { flex: 1 1 100%; min-width: 0; display: flex; flex-direction: column; gap: var(--pad); }
.rec-choices { display: flex; flex-wrap: wrap; gap: var(--pad); min-width: 0; }
.rec-choice {
  display: inline-flex; align-items: baseline; gap: 6px; min-height: var(--row-h); padding: 0 var(--pad);
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel);
  color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); cursor: pointer;
  align-items: center;
}
.rec-choice input { margin: 0; accent-color: var(--chosen-edge); }
.rec-choice[data-chosen="yes"] {
  background: var(--chosen-bg); color: var(--chosen-ink); border-color: var(--chosen-edge); box-shadow: var(--chosen-shadow);
}
.rec-choice:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.rec-at { color: inherit; opacity: .75; font-size: var(--fs-1); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rec-another { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); min-width: 0; }
.rec-field { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.rec-key { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
.rec-day { min-width: 0; max-width: 12rem; }
.rec-line { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.rec-clock { margin: 0; max-width: var(--measure-in-box); color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.rec-passed { color: var(--st-failed); font-weight: 600; }
.rec-sends { margin: 0; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  /* TWO COLUMNS WHERE A CELL HOLDS ITS LONGEST WORD AND ITS TIME, ONE WHERE IT CANNOT. 8.75rem is the
     radio, the word minutes, the time and the cell's own padding on one line. Two fixed halves broke
     the words in the middle (15 minu tes) when the card was 254 pixels wide inside, so a narrower
     card gets one column rather than broken words. */
  .rec-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.75rem), 1fr)); }
  .rec-choice { min-height: 44px; }
}
`
