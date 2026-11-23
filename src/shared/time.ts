// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { localStamp, readATypedTime } from './typed-time.mjs'
export { localStamp, readATypedTime }

/**
 * How Mole Office writes a moment down, and how it reads one back.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTRACT, IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * A stored stamp is LOCAL wall-clock time with no timezone on it — `YYYY-MM-DD HH:MM:SS` — and
 * reading it back must give the same wall clock it was written from, on any machine in any
 * timezone. That preserves wall-clock fields, but cannot identify an occurrence in a repeated
 * hour or an instant read in another zone. New event evidence uses `clockStamp` beside the old
 * stamp; no legacy reader changes. tests/time.test.ts checks both contracts.
 *
 * WHY LOCAL AND NOT UTC. The change log is what the daily and weekly views filter on, so "a day"
 * has to mean the operator's day. Stored in UTC, work done after 01:00 British Summer Time would
 * be filed under tomorrow. This is a single-user application on one machine, so local time is both
 * correct and simpler.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Because the writer was made single-copy and the reader was not, and the two drifted apart in
 * exactly the way this project keeps finding.
 *
 * `localStamp` had already been consolidated once: it used to be hand-copied into four other
 * files, and its own comment said so. But nothing did the same for the other direction. Reading a
 * stamp back was written SEVEN times — `parseLocalTime` in server/lib/resources.ts, an unnamed
 * copy in server/api/resources.ts, another in server/lib/sourceindex.ts, `parseLocalStamp` in
 * web/lib/attention.ts, `stampMs` in web/components/SessionPanel.tsx, the grammar inside
 * `isReadableDate` in shared/kinds/validation.ts, and `parseStamp` in web/components/ui.tsx.
 *
 * Six of those seven parsed local time correctly. The seventh appended a `Z`:
 *
 *     `${stamp.replace(' ', 'T')}Z`     // <- says "this is UTC". It is not.
 *
 * So the browser read every stamp as though the operator lived in Greenwich. On a machine one
 * hour ahead, everything from 0 to 59 minutes old reported "just now" — because the computed age
 * came out negative, and negative is below the "just now" threshold. A session idle for fifty
 * minutes waiting for an answer looked like one that had just spoken, which is the exact silence
 * this product exists to remove.
 *
 * It failed no test and no type check, and it was invisible on any machine running in UTC. It was
 * found by a design review, by accident, two months in.
 *
 * That is this codebase's recurring defect in its purest form: two places that must agree, with
 * nothing making them agree. The fix is not to correct the seventh copy. It is to have one copy,
 * which is this file, and to derive the rest from it — see explore.md, *The defect this codebase
 * keeps producing*.
 *
 * BOTH SIDES IMPORT THIS. It lives in shared/ rather than in server/ because the browser reads
 * the same stamps the server writes, and a rule that both sides must obey cannot live in one of
 * them.
 */

// ---------------------------------------------------------------------------- the grammar

/**
 * The shape of a stored stamp, with no anchors on it, so each caller can anchor it as it needs.
 *
 * Every form Mole Office stores or accepts: a bare date, a date and time to the minute, a date and time
 * to the second, and either a space or a `T` between them.
 *
 *   2026-08-14 · 2026-08-14 17:00 · 2026-08-14 17:00:00 · 2026-08-14T17:00:00
 *
 * EXPORTED AS A STRING, not as a RegExp, and that is deliberate. A shared RegExp object carries
 * `lastIndex` state between callers when it is used with the global flag, and a shared mutable
 * value is a worse problem than the duplication it removes. Callers build their own from this.
 *
 * `shared/kinds.ts` anchors it at both ends to VALIDATE a date a caller wrote. The parsers below
 * anchor it at the start only, to READ a stamp. Before this existed, those two carried the same
 * grammar twice and a comment saying "matches parseLocalStamp in attention.ts" — and a comment is
 * not a mechanism.
 */
export const STAMP_GRAMMAR = String.raw`(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?`

/** Reads a stamp: the grammar anchored at the start, so trailing text is ignored rather than fatal. */
const READ = new RegExp(`^${STAMP_GRAMMAR}`)

/** The wall-clock numbers a stamp names, before anything decides which clock they belong to. */
interface StampFields {
  year: number
  /** 0-based, because both `new Date(...)` and `Date.UTC(...)` take it that way. */
  monthIndex: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Pull the wall-clock numbers out of a stamp, or null when it is not one.
 *
 * Separated from `parseLocalStamp` because `stampWrittenIn` needs the same six numbers and must
 * put them on a DIFFERENT clock. Extracting them twice would be two copies of one grammar, which
 * is the defect the whole of this file exists to stop.
 */
function stampFields(stamp: string): StampFields | null {
  const m = READ.exec(stamp.trim())
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m
  return {
    year: Number(y),
    monthIndex: Number(mo) - 1,
    day: Number(d),
    hour: hh === undefined ? 0 : Number(hh),
    minute: mm === undefined ? 0 : Number(mm),
    second: ss === undefined ? 0 : Number(ss),
  }
}

/**
 * A stamp that carries its own timezone is not one of ours: a trailing `Z`, or `+01:00`, or
 * `-0500`. Those must keep the offset they state rather than being read as local, which is the
 * one case where appending nothing would be as wrong as appending `Z`.
 *
 * Mole Office itself never writes these. They arrive from outside — an agent log, a file written by
 * another tool — and the honest answer is to respect what they say.
 */
const CARRIES_A_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i

// ---------------------------------------------------------------------------- writing
//
// WHICH FORM GOES WHERE (message _iMt4wd4EzGo; acceptance finding 63): a stamp a machine compares across zones, or
// one written inside a container, is the local time with its offset stated (clockStamp's `instant`), and a stamp read
// only by people on the host is the bare local stamp (localStamp), so neither can be read an hour off.

/** The common case: right now, in the stored form. */
export function nowStamp(): string {
  return localStamp(new Date())
}

/**
 * THE TIME ZONE THIS PROCESS'S CLOCK READS IN, by its name, such as `Europe/London`.
 *
 * On the server it is the office's zone: the zone every stored stamp is written in (`localStamp` above). In a browser it
 * is that computer's zone, which may be another. A zone that cannot be read throws, as `clockStamp` does: a page that
 * guessed the zone would draw times an hour off with nothing saying so.
 */
export function theClockZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!zone) throw new RangeError('The clock timezone could not be read.')
  return zone
}

/** One formatter per zone, made once: a list of deadlines asks for the same zone many times. */
const WALL_CLOCKS = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock numbers of a moment in a named zone. `h23`, so midnight is 00 and never 24. */
function wallClockIn(ms: number, zone: string): StampFields {
  let format = WALL_CLOCKS.get(zone)
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    WALL_CLOCKS.set(zone, format)
  }
  const parts = format.formatToParts(new Date(ms))
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((one) => one.type === type)?.value)
  return { year: part('year'), monthIndex: part('month') - 1, day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') }
}

/**
 * WHETHER A STORED STAMP IS A BARE DATE, `2026-09-14`, with no time of day. A due written that way is due by the end of
 * its day; a due with a time names that moment (`parseDueStamp` works the due moment out from that). This is
 * the one test of it: `parseDueStamp` and `readDueStamp` in web/lib/attention.ts ask here.
 */
export function isBareDateStamp(stamp: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\s*$/.test(stamp)
}

/**
 * WHOLE CALENDAR DAYS FROM ONE MOMENT'S DATE TO ANOTHER'S, on the wall clock of a zone: the dates between them, not
 * elapsed time divided by 24 hours. Positive when `toMs` falls on a later date, 0 on the same date, negative earlier.
 *
 * WHY NOT ELAPSED TIME. A day that holds a clock change has 23 or 25 hours, so dividing elapsed milliseconds by 24
 * hours puts a deadline past a change a day off: "due in 24 days" for a date 23 days away (problem R74WVeH6LZPU).
 * A deadline names a date, so its count is a count of dates. An age, how long something has waited, is elapsed time
 * and does not read this (message tHpVPIWZTyr2).
 *
 * THE ZONE is this process's own by default: in a browser the person's, on the server the office's. Each date is
 * read in the zone and turned into a UTC day number, and UTC days are all 24 hours long, so their difference is
 * whole. This is the one place a deadline's days are counted; `calendarDaysBetweenDayKeys` below does the same for
 * two `YYYY-MM-DD` keys.
 */
export function calendarDaysBetween(fromMs: number, toMs: number, zone: string = theClockZone()): number {
  const from = wallClockIn(fromMs, zone)
  const to = wallClockIn(toMs, zone)
  return utcDayNumber(to.year, to.monthIndex, to.day) - utcDayNumber(from.year, from.monthIndex, from.day)
}

/**
 * WHOLE CALENDAR DAYS FROM ONE `YYYY-MM-DD` KEY TO ANOTHER, or null when either key is not a date (2026-02-30 is
 * refused, not read as 2 March). A key names a date and no moment, so no zone is asked.
 */
export function calendarDaysBetweenDayKeys(from: string, to: string): number | null {
  const a = dayNumberOfKey(from)
  const b = dayNumberOfKey(to)
  return a === null || b === null ? null : b - a
}

/** A UTC day's length. It really is 24 hours: UTC has no clock change. Used only to number UTC days. */
const A_UTC_DAY_MS = 24 * 60 * 60 * 1000

/** The number of the UTC day a calendar date names, counted from 1 January 1970. */
function utcDayNumber(year: number, monthIndex: number, day: number): number {
  return Math.round(Date.UTC(year, monthIndex, day) / A_UTC_DAY_MS)
}

/** A `YYYY-MM-DD` key's UTC day number, or null when the key names no real date. */
function dayNumberOfKey(key: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (parts === null) return null
  const [year, month, day] = [Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])]
  const date = new Date(Date.UTC(year, month, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null
  return utcDayNumber(year, month, day)
}

/**
 * A MOMENT IN THE STORED FORM, ON THE WALL CLOCK OF A NAMED ZONE. `localStamp` writes this process's own zone; this
 * writes another's. The agent page uses it to write a raise's end on the office's clock when the browser is elsewhere,
 * as answer 5 of a decision asks.
 */
export function stampInZone(ms: number, zone: string): string {
  const f = wallClockIn(ms, zone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(f.year)}-${pad(f.monthIndex + 1)}-${pad(f.day)} ${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)}`
}

/**
 * THE MOMENT A STORED STAMP NAMES ON THE WALL CLOCK OF A NAMED ZONE, or null when it is not a stamp. The reverse of
 * `stampInZone`. A wall time the zone skips (the spring gap) comes back as the moment an hour on; a wall time the zone
 * has twice (the autumn hour) comes back as the first of the two.
 */
export function momentOfStampInZone(stamp: string, zone: string, disambiguation: 'compatible' | 'reject' = 'compatible'): number | null {
  if (disambiguation === 'reject') {
    const full = READ.exec(stamp)
    if (full === null || full[0] !== stamp || full[6] === undefined) return null
  }
  const f = stampFields(stamp)
  if (f === null) return null
  const asIfUtc = Date.UTC(f.year, f.monthIndex, f.day, f.hour, f.minute, f.second)
  if (Number.isNaN(asIfUtc)) return null
  if (disambiguation === 'reject' && stampInZone(asIfUtc, 'UTC') !== stamp.replace('T', ' ')) return null
  const offsetAt = (ms: number): number => {
    const w = wallClockIn(ms, zone)
    return Date.UTC(w.year, w.monthIndex, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000
  }
  // THE ZONE'S OFFSET A DAY AND A HALF EITHER SIDE. Offsets reach fourteen hours ahead of UTC, so a sample
  // half a day away can sit on the wrong side of a clock change. A day and a half brackets the moment even at
  // the date line. No zone changes its offset twice in that span, so the moment is one of these two.
  const reach = 36 * 60 * 60_000
  const candidates = [asIfUtc - offsetAt(asIfUtc - reach), asIfUtc - offsetAt(asIfUtc + reach)]
  const wall = stampInZone(asIfUtc, 'UTC')
  const real = candidates.filter((ms) => stampInZone(ms, zone) === wall)
  if (disambiguation === 'reject') return new Set(real).size === 1 ? real[0]! : null
  return real.length > 0 ? Math.min(...real) : Math.max(...candidates)
}

/** The last real moment a complete wall stamp names; gaps and unreadable zones are unknown. */
export function latestMomentOfStampInZone(stamp: string, zone: string): number | null {
  try {
    const full = READ.exec(stamp)
    if (full === null || full[0] !== stamp || full[6] === undefined) return null
    const f = stampFields(stamp)
    if (f === null) return null
    const utc = Date.UTC(f.year, f.monthIndex, f.day, f.hour, f.minute, f.second)
    const normalized = stamp.replace('T', ' ')
    if (stampInZone(utc, 'UTC') !== normalized) return null
    const candidates = [-36, 0, 36].map(hours => {
      const sample = utc + hours * 3_600_000, w = wallClockIn(sample, zone)
      const offset = Date.UTC(w.year, w.monthIndex, w.day, w.hour, w.minute, w.second) - sample
      return utc - offset
    }).filter(ms => stampInZone(ms, zone) === normalized)
    return candidates.length === 0 ? null : Math.max(...candidates)
  } catch { return null }
}


/** A complete filing stamp must identify one moment in an explicit named zone. Gaps and folds refuse. */
export function uniqueMomentOfStoredStampInZone(stamp: string, zone: string): number | null {
  if (typeof stamp !== 'string' || typeof zone !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zone)) return null
  try { return momentOfStampInZone(stamp, zone, 'reject') } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/**
 * HOW A ZONE READ A TYPED STAMP THAT FELL IN A CLOCK CHANGE, or null when the stamp named one moment or no
 * calendar time at all.
 *
 * A `from` somebody types on an `every` trigger is a wall clock with no offset: `2027-03-28 01:30`. On the two
 * nights the clocks change that wall clock can name no moment (the spring gap) or two (the autumn fold). The
 * office keeps accepting the stamp and reads it as `momentOfStampInZone` reads every stamp — an hour on in a gap,
 * the first of a fold — and this says which of those happened, so a reply can say it in plain words.
 *
 * The two fields are written for a person, not as a stored stamp: `2027/03/28 01:30` and `02:30`.
 */
export interface AStampInAClockChange {
  kind: 'skipped' | 'repeated'
  /** The wall clock the typed stamp names, for a person: 2027/03/28 01:30. */
  wall: string
  /** The wall time it was read as: 02:30 for a skipped hour, the first 01:30 for a repeated one. */
  readAt: string
}

/** The stored form of a wall stamp, with the seconds a minute stamp left off put back. */
function withSeconds(stamp: string, full: RegExpExecArray): string {
  const normal = stamp.replace('T', ' ')
  return full[6] === undefined ? `${normal}:00` : normal
}

/** A stored stamp's fields as a person reads them: `2027/03/28 01:30`. */
function stampForAPerson(stamp: string): string {
  return `${stamp.slice(0, 4)}/${stamp.slice(5, 7)}/${stamp.slice(8, 10)} ${stamp.slice(11, 16)}`
}

/**
 * THE CLOCK CHANGE A TYPED WALL STAMP FALLS IN, in the named zone, or null when it names one moment.
 *
 * Only a wall stamp with a time of day and no offset is read: `YYYY-MM-DD HH:MM` or `YYYY-MM-DD HH:MM:SS`, with a
 * space or a `T`. A stamp carrying `Z` or `+01:00` is not a typed wall stamp and returns null, as a stamp naming no
 * real calendar time does (30 February is refused, not read as 2 March).
 *
 * The moment is the one `momentOfStampInZone` reads — an hour on in a skipped hour, the first of a repeated one.
 * `latestMomentOfStampInZone` tells the two apart: null means no later moment exists, so the hour is skipped; a
 * real moment means the same wall time has a later pass, so the hour is repeated. The two readers must agree about
 * that before anything is returned. A zone `Intl` cannot read is a `RangeError`, which is caught and answers null.
 */
export function theClockChangeATypedStampFallsIn(stamp: string, zone: string): AStampInAClockChange | null {
  try {
    // THE FILE'S OWN GRAMMAR, ANCHORED AT BOTH ENDS, so an offset or trailing words cannot ride along. A time of
    // day is required: a bare date names no moment, let alone a clock change.
    const full = READ.exec(stamp)
    if (full === null || full[0] !== stamp || full[4] === undefined) return null
    const f = stampFields(stamp)
    if (f === null) return null
    const normal = withSeconds(stamp, full)
    const asIfUtc = Date.UTC(f.year, f.monthIndex, f.day, f.hour, f.minute, f.second)
    // THE FIELDS MUST NAME A REAL CALENDAR TIME, which is the same check every stored stamp gets.
    if (Number.isNaN(asIfUtc) || stampInZone(asIfUtc, 'UTC') !== normal) return null
    // ONE MOMENT MEANS THIS IS NO CLOCK CHANGE, and so does a stamp no reader can place.
    if (uniqueMomentOfStoredStampInZone(normal, zone) !== null) return null
    const first = momentOfStampInZone(normal, zone)
    if (first === null) return null
    const latest = latestMomentOfStampInZone(normal, zone)
    const readWall = stampInZone(first, zone)
    if (latest === null) {
      // A SKIPPED HOUR: the zone put the stamp an hour on, so its wall clock is not the typed one.
      if (readWall === normal) return null
      return { kind: 'skipped', wall: stampForAPerson(normal), readAt: readWall.slice(0, 10) === normal.slice(0, 10) ? readWall.slice(11, 16) : stampForAPerson(readWall) }
    }
    // A REPEATED HOUR: both passes read back as the same wall clock, and this is the first of them.
    if (readWall !== normal || stampInZone(latest, zone) !== normal) return null
    return { kind: 'repeated', wall: stampForAPerson(normal), readAt: readWall.slice(0, 10) === normal.slice(0, 10) ? readWall.slice(11, 16) : stampForAPerson(readWall) }
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/**
 * THE END AFTER A MOMENT, on the clock of a named zone: from the moment, until the given minutes have passed, and
 * that end as a stamp on the zone's clock. A stamp with an offset must agree with the zone, and one without must name
 * exactly one moment there, so a fold or a gap stays unknown, and so does no stamp at all. The main-suite fix round
 * passes its own 60 minutes; a merge entry's conflict passes the minutes it was given when resolving started.
 */
export function theHourAfter(stamp: string | null, timeZone: string, minutes: number): { fromMs: number | null; untilMs: number | null; until: string | null } {
  let fromMs: number | null = null
  if (stamp !== null) {
    if (/[+-]\d\d:\d\d$/.test(stamp)) {
      try {
        const ms = momentOfAnInstant(stamp)
        if (ms !== null && stampInZone(ms, timeZone) === stamp.slice(0, 19).replace('T', ' ')) fromMs = ms
      } catch (error) { if (!(error instanceof RangeError)) throw error }
    } else fromMs = uniqueMomentOfStoredStampInZone(stamp, timeZone)
  }
  const untilMs = fromMs === null ? null : fromMs + minutes * 60_000
  return { fromMs, untilMs, until: untilMs === null ? null : stampInZone(untilMs, timeZone) }
}

/**
 * THE SAME WALL-CLOCK TIME ON THE NEXT CALENDAR DAY, on the clock of `zone`, or null when that stamp cannot be read. Across
 * a clock change that is 23 or 25 hours on, not 24: "a day" in a raise's end is a calendar day.
 * The next day is counted on the zone's calendar, and a time that day skips or has twice is read as
 * `momentOfStampInZone` reads every stamp.
 */
export function theSameTimeTheNextDay(ms: number, zone: string): number | null {
  const stamp = stampInZone(ms, zone)
  const today = dayNumberOfKey(stamp.slice(0, 10))
  if (today === null) return null
  const tomorrow = new Date((today + 1) * A_UTC_DAY_MS).toISOString().slice(0, 10)
  return momentOfStampInZone(`${tomorrow} ${stamp.slice(11)}`, zone)
}

/**
 * A MOMENT FOR A FILE'S NAME: the stored form's local wall clock with its milliseconds, in characters every file system
 * takes and in an order that sorts as time does, `2026-09-24T06-15-30-123`. The tools named their logs and reports from
 * UTC until 24 September 2026, an hour off the office in summer (acceptance finding 63; message 051oy9ReTwyb).
 * It is the one place a file's moment is worked out: the launcher's brief copies and a run's log folder use it too
 * (the inspector's note on finding 63's release; message ARd9toeRLDBh).
 *
 * IT NAMES A MILLISECOND, AND IT DOES NOT MAKE A NAME UNIQUE. Two calls in the same millisecond give the same stamp,
 * and two runs started in one millisecond showed it. What the milliseconds add is order
 * within a second: two names written in different milliseconds of one second differ and sort as time does. A caller
 * that needs a unique name adds a part of its own after the stamp: q.mjs's log and run-named-tests.mjs's report add
 * eight random hex characters, settle-owed-runs.mjs adds a random UUID, and sandbox.mjs and
 * sandbox-start.mjs add a process id or random hex characters to their log and handshake names.
 */
export function fileNameStamp(when: Date): string {
  return `${localStamp(when).replace(' ', 'T').replace(/:/g, '-')}-${String(when.getMilliseconds()).padStart(3, '0')}`
}

/** One clock observation. The instant keeps milliseconds and a numeric offset, even at UTC. */
export interface ClockStamp {
  stamp: string
  instant: string
  offset: string
  timeZone: string
}

/**
 * THE SHAPES OF AN INSTANT: the date and time to the second with T between them, then milliseconds or none, then Z or
 * an offset in hours and minutes. `clockStamp` writes one of them, and `instantMs` reads only these.
 */
const THE_SHAPE_OF_AN_INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?(Z|([+-])(\d{2}):(\d{2}))$/

/** An instant must state its offset. Local strings cannot identify a repeated hour or a gap. */
function instantMs(instant: string): number {
  const match = THE_SHAPE_OF_AN_INSTANT.exec(instant)
  if (match === null) throw new RangeError('An instant must include seconds and an explicit timezone offset.')
  const hours = Number(match[5] ?? 0)
  const minutes = Number(match[6] ?? 0)
  const offset = (match[4] === '-' ? -1 : 1) * (hours * 60 + minutes)
  const ms = Date.parse(instant)
  // Date.parse normalises some invalid calendar dates. Check the stated fields before accepting.
  if (
    hours > 23 || minutes > 59 || !Number.isFinite(ms) ||
    new Date(ms + offset * 60_000).toISOString().slice(0, 19) !== match[1]
  ) throw new RangeError('The instant is not a valid calendar time.')
  return ms
}

/** The moment an instant with its offset names, or null when the words are not one. The same rule as `clockStamp`. */
export function momentOfAnInstant(words: string): number | null {
  try {
    return instantMs(words)
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/**
 * WHETHER AN INSTANT KEPT BESIDE A STAMP NAMES THAT STAMP: it is text in one of the shapes above, and its first 19
 * characters are the stamp with T for the space. `clockStamp` writes the instant from the same reading as the stamp, so
 * an instant a door kept names its stamp until somebody changes the stamp alone. The idle reminder's grouped SQL repeats
 * this test (`theMomentInSQLiteOf` in src/server/lib/reminders.ts).
 */
export function anInstantNamesItsStamp(stamp: unknown, instant: unknown): instant is string {
  return typeof stamp === 'string' && typeof instant === 'string' && THE_SHAPE_OF_AN_INSTANT.test(instant) && instant.slice(0, 19) === stamp.replace(' ', 'T')
}

/**
 * THE MOMENT A LOCAL STAMP NAMES, READ WITH THE INSTANT KEPT BESIDE IT, as milliseconds, or null when it cannot be read.
 *
 * A local stamp has no offset, so on the night the clocks go back its words cannot say which pass of the hour from
 * 01:00 they mean. The instant kept beside it says only that.
 *
 *   - When the instant names its stamp (`anInstantNamesItsStamp`), the moment is that second in the instant's offset,
 *     with the milliseconds left out. So outside the repeated hour the moment is what the stamp alone gives.
 *   - When it names its stamp and cannot be read, for example with the offset +25:00, the answer is null, as for a stamp
 *     that cannot be read.
 *   - When it is missing, is not text, or names another stamp, it is passed over, and the stamp is read with the reader
 *     the caller used before the instant was kept. That is the case of a stamp changed alone, by hand or by a writer
 *     that does not keep the instant.
 */
export function momentOfAStampAndItsInstant<Stamp>(stamp: Stamp, instant: unknown, readTheStampAlone: (stamp: Stamp) => number | null): number | null {
  if (!anInstantNamesItsStamp(stamp, instant)) return readTheStampAlone(stamp)
  const ms = momentOfAnInstant(instant)
  // An offset is whole minutes, so the instant's milliseconds are the moment's milliseconds past its second.
  return ms === null ? null : Math.floor(ms / 1000) * 1000
}

/**
 * THE MOMENT A STORED STAMP NAMES, read with the clock observation stored beside it, or null when nobody can tell.
 *
 * A stored stamp is the office's local time in words, with no offset. When the clocks go back an hour comes twice, and
 * when they go forward an hour is skipped, so the words alone may name two moments, or none. The moment is the instant
 * of the observation (`clockStamp`) stored beside the stamp. A stamp written before an observation was kept beside it
 * is read as its one moment in the zone of this process's clock, which is the office's, and it has none in the hour
 * the clocks go back or the hour they skip. An observation whose instant cannot be read is null too: the words beside
 * it are not read in its place.
 */
export function momentOfAStoredStamp(at: unknown, time: unknown): number | null {
  if (time !== undefined && time !== null) {
    const instant = typeof time === 'object' ? (time as { instant?: unknown }).instant : undefined
    return typeof instant === 'string' ? momentOfAnInstant(instant) : null
  }
  return typeof at === 'string' ? uniqueMomentOfStoredStampInZone(at, theClockZone()) : null
}

/**
 * Record one instant beside its canonical local wall time. The clock is read exactly once.
 * Strings must name an instant with an offset: a bare spring-gap time is refused before Date can
 * normalise it. A Date must already represent a known instant; it cannot retain how it was built.
 * The host zone is recorded, never guessed from a legacy stamp or from the browser reading it.
 */
export function clockStamp(clock: () => Date | string = () => new Date()): ClockStamp {
  const observed = clock()
  const when = typeof observed === 'string' ? new Date(instantMs(observed)) : observed
  if (!(when instanceof Date) || !Number.isFinite(when.getTime()) || when.getFullYear() < 0 || when.getFullYear() > 9999) {
    throw new RangeError('The clock must supply a valid instant.')
  }
  const timeZone = theClockZone()
  const minutesEast = -when.getTimezoneOffset()
  const pad = (n: number) => String(n).padStart(2, '0')
  const offset = `${minutesEast < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutesEast) / 60))}:${pad(Math.abs(minutesEast) % 60)}`
  const stamp = localStamp(when)
  const instant = `${stamp.replace(' ', 'T')}.${String(when.getMilliseconds()).padStart(3, '0')}${offset}`
  return { stamp, instant, offset, timeZone }
}

/** Seconds between explicit instants. A reversed clock is unavailable, never zero or active time. */
export function elapsedSeconds(start: string, end: string): number {
  const seconds = (instantMs(end) - instantMs(start)) / 1000
  if (seconds < 0) throw new RangeError('The clock moved backward; elapsed time is unavailable.')
  return seconds
}

// ---------------------------------------------------------------------------- reading

/**
 * Read a stored stamp back as local wall-clock milliseconds. Null when it is not a stamp.
 *
 * Null matters and callers must handle it. A date that cannot be read is never quietly treated as
 * "now" — that would be a silent fallback, and this product does not have those. An obligation
 * whose due date cannot be parsed should report that it cannot be parsed, not come due today.
 *
 * A bare date is the START of that day. `parseDueStamp` in web/lib/attention.ts is the one that
 * treats a bare date as the END, because "due on the 3rd" means the end of the 3rd.
 *
 * Built field by field and handed to the `new Date(y, m, d, ...)` constructor, which is local by
 * definition. It is never handed to `new Date(string)`, because engines disagree about whether a
 * string with a space in it is local or UTC, and that disagreement is what caused the defect this
 * file was written to end.
 */
export function parseLocalStamp(stamp: string): number | null {
  const f = stampFields(stamp)
  if (f === null) return null
  const ms = new Date(f.year, f.monthIndex, f.day, f.hour, f.minute, f.second).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * The same, but strict: only the full `YYYY-MM-DD HH:MM:SS` form Mole Office writes itself.
 *
 * Used where the input is always something Mole Office wrote — the resource ledger, the source index —
 * so a value that is merely date-shaped is a sign something is wrong rather than a shorthand to be
 * accommodated. Returning null there gets the problem reported instead of guessed at.
 */
export function parseStoredStamp(stamp: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(stamp.trim())) return null
  return parseLocalStamp(stamp)
}

/**
 * Read anything date-shaped into a `Date`: our own stored form as local time, and a string that
 * states its own offset as the moment it states.
 *
 * This is the lenient front door for the interface, where a stamp may have come from a log written
 * by something other than Mole Office. Prefer `parseLocalStamp` when the value is known to be ours.
 */
export function parseAnyStamp(stamp: string): Date | null {
  if (!CARRIES_A_ZONE.test(stamp.trim())) {
    const ms = parseLocalStamp(stamp)
    if (ms !== null) return new Date(ms)
  }
  const date = new Date(stamp)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Draw a stored stamp for a reader: `2026/01/25 22:09`, local wall clock, with the seconds left off.
 *
 * A value that is not a stamp is handed back unchanged, so an unreadable moment is shown as itself
 * rather than blanked or guessed at.
 */
export function drawnStamp(stamp: string): string {
  const ms = parseLocalStamp(stamp)
  if (ms === null) return stamp
  const at = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}/${pad(at.getMonth() + 1)}/${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

// ---------------------------------------------------------------------------- checking a stored stamp

/**
 * Which clock a stored stamp was written from, judged against the moment it was written.
 *
 *   local              it names the wall clock the operator was standing in. The only right answer.
 *   utc                it names the same moment in UTC. This is what SQLite's `datetime('now')`
 *                      writes, so it is what a column default puts in a column that means local.
 *   indistinguishable  the machine is at offset zero, so the two are the same string and no
 *                      evidence exists either way.
 *   neither            it is a stamp, but not of that moment. An old row, or a clock elsewhere.
 *   unreadable         it is not a stamp at all.
 *
 * WHY `indistinguishable` IS A RESULT AND NOT A PASS. The bug this file was written to end
 * survived 1,129 tests for two months because every one of them ran at the machine's own offset,
 * and at offset zero a local reading and a UTC reading agree perfectly. A checker that answered
 * "local" there would reproduce exactly that blindness. It says it cannot tell, and the caller
 * decides what to do about it — the tests in tests/stamp-columns.test.ts treat it as a failure and
 * set a timezone of their own so it can never arise.
 */
export type StampOrigin = 'local' | 'utc' | 'indistinguishable' | 'neither' | 'unreadable'

/**
 * Judge a stored stamp against the moment it was stored.
 *
 * THIS IS A CHECKER, NOT A WRITER. There is deliberately no `utcStamp` beside it: nothing in
 * Mole Office may ever produce a UTC string for storage, so this file does not offer one. A caller that
 * needs the UTC form to compare against — a test, checking that a SQL default is what it fears —
 * should ask SQLite for `datetime('now')` and compare against the real thing.
 *
 * `toleranceMs` is how far apart the write and this reading may be. Five seconds, because a stamp
 * is truncated to the second and a test may do a little work between writing and looking. It is
 * far smaller than any real timezone offset — the smallest in use is fifteen minutes — so no
 * tolerance this side of absurd can make a UTC stamp look local.
 */
export function stampWrittenIn(stamp: string, when: Date, toleranceMs = 5_000): StampOrigin {
  const f = stampFields(stamp)
  if (f === null) return 'unreadable'

  const target = when.getTime()
  const asLocal = new Date(f.year, f.monthIndex, f.day, f.hour, f.minute, f.second).getTime()
  const asUtc = Date.UTC(f.year, f.monthIndex, f.day, f.hour, f.minute, f.second)
  if (Number.isNaN(asLocal) || Number.isNaN(asUtc)) return 'unreadable'

  const localFits = Math.abs(asLocal - target) <= toleranceMs
  const utcFits = Math.abs(asUtc - target) <= toleranceMs
  if (localFits && utcFits) return 'indistinguishable'
  if (localFits) return 'local'
  if (utcFits) return 'utc'
  return 'neither'
}
