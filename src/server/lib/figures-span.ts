// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SPAN A FIGURE IS ASKED FOR, read once for the three figures that take one (./figures-done-per-day.ts,
 * ./figures-time-to-live.ts and ./figures-suite-minutes.ts). A span is local days in the office's time zone, both ends
 * included. With neither end asked it is the last `FIGURES_SPAN_DAYS.default` days, today among them; with one end asked,
 * the other is today or that many days before it. A day that is not a day, a span that runs backwards and a span longer
 * than `FIGURES_SPAN_DAYS.most` are refused with 400, and nothing is read.
 */
import { FIGURES_SPAN_DAYS, theDayAfter } from '@shared/figures.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { calendarDaysBetweenDayKeys, stampInZone, theClockZone } from '@shared/time.ts'
import { PanelError } from './panel-error.ts'

/** A span as the reads use it: its ends, the day after it ends, the office's time zone and today there. */
export interface TheSpan {
  from: string
  to: string
  /** The day after `to`, so a stamp of any form on the last day is below it. */
  until: string
  timeZone: string
  today: string
}

export function theSpanAsked(from: string | undefined, to: string | undefined): TheSpan {
  const timeZone = theClockZone()
  const today = stampInZone(Date.now(), timeZone).slice(0, 10)
  for (const value of [from, to]) {
    if (value !== undefined && calendarDaysBetweenDayKeys(value, value) === null) throw new PanelError(sayInEnglish('figures.span.notADay', { value }), 400)
  }
  const end = to ?? today
  const start = from ?? theDayAfter(end, 1 - FIGURES_SPAN_DAYS.default)
  const days = calendarDaysBetweenDayKeys(start, end)!
  if (days < 0) throw new PanelError(sayInEnglish('figures.span.backwards', { from: start, to: end }), 400)
  if (days + 1 > FIGURES_SPAN_DAYS.most) throw new PanelError(sayInEnglish('figures.span.tooLong', { most: FIGURES_SPAN_DAYS.most }), 400)
  return { from: start, to: end, until: theDayAfter(end, 1), timeZone, today }
}
