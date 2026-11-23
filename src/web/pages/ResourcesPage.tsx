// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RESOURCES: who holds each shared resource on this machine now, who is booked next, and how much was
 * used this week.
 *
 * Round 30 of wave 13s, the design's round 2 (design
 * peyJSnLoz_Bk). One card per resource the office records:
 * the host GPU from `GET /api/resources/gpu?secondLevel=show`, and the full-suite test seat from
 * `GET /api/slots`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE SERVER DECIDES AND THIS FILE ONLY DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * Whether the reader is the owner (`you.theOwner`) and whether a reader's answer to a request to go
 * first would count (`mayAnswer` on each line) are worked out once, in src/server/lib/bookings.ts.
 * This file holds no second copy of either rule. A raised secretary is not the owner there, so a
 * secretary's raise never draws the owner's two choices here.
 *
 * The week's figures are the server's tally of the watcher's readings. The server says since when it
 * counted, and that sentence is drawn as it came.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOOKING WINDOW
 * ---------------------------------------------------------------------------------------
 *
 * The window opens under the card rather than over the page, so it reads the same at 390 wide and a
 * test can draw it without a browser. The two choices are drawn only when something is running,
 * because only then does the server need one. The server's answer is shown back as it came.
 *
 * ---------------------------------------------------------------------------------------
 * HOW LONG A RUNNING BOOKING LASTS (round 37)
 * ---------------------------------------------------------------------------------------
 *
 * A running booking lasts until its program ends, so it is not drawn as ending at its planned end. The planned
 * end is drawn as planned, and an expected end only where the server worked one out from the program's own
 * report (`end` on each line, from `theEndOf`). A waiting booking has no program and keeps its fixed end.
 */

import { useState } from 'react'
import type { BookingEnd, BookingExtension, BookingGoFirst } from '../../server/lib/bookings.ts'
import type { GpuReadingProcess, GpuView } from '../../server/lib/bookings.ts'
import type { PoolView } from '../../server/lib/slots.ts'
import { errorMessage, moleOfficeRequest } from '../api.ts'
import { declaredAttributes } from '../components/declares.ts'
import { Absence, Btn, ErrorNote, Field, Loading, Panel, ServerNote, TextInput, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'
import { openTheChatAtGroup } from '../lib/open-chat.ts'
import { stateWord } from '../lib/words.ts'
import { gibOfMiB, type CutInChoice, type GoFirstState } from '@shared/bookings.ts'
import { content, t } from '@shared/i18n.ts'
import { participantKey } from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { surfaceWord } from '@shared/surfaces.ts'

interface SlotsReply {
  checkedAt: string
  platform: string
  pools: PoolView[]
}

export function ResourcesPage() {
  useLanguage()
  const [gpu, reload] = useProjectAsync(() => moleOfficeRequest<GpuView>('/api/resources/gpu?secondLevel=show'), [])
  const [slots] = useAsync(() => moleOfficeRequest<SlotsReply>('/api/slots'), [])
  return (
    <div className="page rs">
      <style href="mole-office-resources-page" precedence="default">
        {RESOURCES_CSS}
      </style>
      <h1 className="rs-title">{t('nav.resources')}</h1>
      {gpu.status === 'loading' ? <Loading what={t('pageWords.ResourcesPage.001')} /> : null}
      {gpu.status === 'error' ? <ErrorNote message={gpu.message} fault={gpu.fault} /> : null}
      {gpu.status === 'ready' ? <GpuCard gpu={gpu.value} now={Date.now()} onChanged={reload} /> : null}
      {slots.status === 'loading' ? <Loading what={t('pageWords.ResourcesPage.002')} /> : null}
      {/* THE SEAT'S FAULT STAYS IN THE SEAT'S PLACE, so a refused GET /api/slots never hides the GPU. */}
      {slots.status === 'error' ? <ErrorNote message={slots.message} fault={slots.fault} /> : null}
      {slots.status === 'ready' ? <SeatCard pool={slots.value.pools.find((p) => p.name === 'full-suite') ?? null} /> : null}
    </div>
  )
}

/** A stamp as a person reads it: the time alone when it is today, the date and the time otherwise. */
export function whenWord(stamp: string, now: number): string {
  const day = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
  return stamp.slice(0, 10) === today ? stamp.slice(11, 16) : stamp.slice(0, 16)
}

function durationWord(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return h === 0 ? t('resources.durationMinutes', { m: minutes }) : t('resources.duration', { h, m: minutes % 60 })
}

function nameOf(gpu: GpuView, who: ParticipantRef): string {
  return gpu.names[participantKey(who)] ?? who.id
}

const BOOKINGS_ONLY_WORD = {
  'no reading': 'resources.free.noReading',
  'an old reading': 'resources.free.oldReading',
  'an unread card': 'resources.free.unreadCard',
} as const

/** A job on the card that no booking accounts for: its size, and its scope, sandbox or process. */
function unbookedWord(p: GpuReadingProcess): string {
  const gib = gibOfMiB(p.mib)
  if (p.who.kind === 'host') return t('resources.unbooked.host', { gib, unit: content(p.who.unit), pid: p.pid })
  if (p.who.kind === 'sandbox') return t('resources.unbooked.sandbox', { gib, name: content(p.who.name), pid: p.pid })
  return t('resources.unbooked.unknown', { gib, pid: p.pid })
}

/** A running booking's planned end, and the end its program's report lets the server expect, or why none is. */
function TheEnd({ end, now }: { end: BookingEnd; now: number }) {
  const p = end.progress
  const when = p === null ? '' : whenWord(p.at, now)
  return (
    <>
      <p className="rs-line rs-quiet" data-planned-end={end.plannedEnd}>
        {t('resources.plannedEnd', { at: whenWord(end.plannedEnd, now) })}
      </p>
      <p className="rs-line rs-quiet" data-expected-end={end.expectedEnd ?? 'none'}>
        {end.expectedEnd !== null && p !== null
          ? t('resources.expectedEnd', { at: whenWord(end.expectedEnd, now), done: p.done, of: p.of, when })
          : p === null
            ? t('resourcesPage.noProgress')
            : p.done === p.of
              ? t('resources.allDone', { of: p.of, when })
              : p.done === 0
                ? t('resourcesPage.noneDoneYet', { of: p.of, when })
                : t('resources.doneSoFar', { done: p.done, of: p.of, when })}
      </p>
    </>
  )
}

/** That a booking's end was moved later, and the newest reason, in its holder's words. */
function Extended({ extensions }: { extensions: readonly BookingExtension[] }) {
  const last = extensions[extensions.length - 1]
  if (last === undefined) return null
  return (
    <p className="rs-line rs-quiet" data-extended={extensions.length}>
      {t('resources.extended', { n: extensions.length, because: content(last.because) })}
    </p>
  )
}

const PROGRAM_WORD = {
  running: 'resources.program.running',
  'its program has ended': 'resources.program.ended',
  'cannot be read': 'resources.program.unreadable',
  'not named': 'resources.program.notNamed',
} as const

/**
 * The GPU's card, drawn.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER. `windowOpen` opens the booking window from the
 * start, for a test and for the pictures; a reader opens it with the button.
 */
export function GpuCard({ gpu, now, onChanged, windowOpen = false }: { gpu: GpuView; now: number; onChanged?: () => void; windowOpen?: boolean }) {
  useLanguage()
  const [open, setOpen] = useState(windowOpen)
  const second = gpu.secondLevel
  const lines = second?.line ?? []
  const purposeOf = (booking: string) => lines.find((l) => l.booking === booking)?.purpose ?? null
  const overByOf = (booking: string) => lines.find((l) => l.booking === booking)?.overByMinutes ?? null
  const extensionsOf = (booking: string) => lines.find((l) => l.booking === booking)?.extensions ?? []
  // A REQUEST TO GO FIRST IS DRAWN AT THE TOP OF THE QUEUE, as the design draws it. The rest keep the
  // server's order, which is the order they start in.
  const waiting = lines
    .filter((l) => l.state === 'waiting')
    .map((l, i) => ({ l, i }))
    .sort((a, b) => Number(b.l.goFirst?.state === 'asked') - Number(a.l.goFirst?.state === 'asked') || a.i - b.i)
    .map(({ l }) => l)
  return (
    <Panel
      titleIs="label"
      declares={{ surface: 'resources.gpu' }}
      title={surfaceWord('resources.gpu')}
      kind={gpu.cardGiB === null ? t('resources.card.sizeUnknown') : t('resources.card.size', { gib: gpu.cardGiB })}
      actions={
        gpu.you.theOwner ? (
          <Btn variant="primary" size="sm" onClick={() => setOpen(!open)}>
            {t('resources.book.open')}
          </Btn>
        ) : null
      }
    >
      <ServerNote text={gpu.says} />
      {open && gpu.you.theOwner ? <BookingWindow gpu={gpu} now={now} onClose={() => setOpen(false)} onBooked={onChanged} /> : null}
      <div className="rs-cols">
        <section className="rs-col" data-column="now">
          <h3 className="rs-head">{t('resources.column.now')}</h3>
          {gpu.running.length === 0 ? <p className="rs-line"><Absence tier="told-apart" looked word={t('resources.noRunningBooking')} /></p> : null}
          {gpu.running.map((r) => (
            <div className="rs-item" key={r.booking}>
              <p className="rs-line rs-who" data-lasts={r.end.lasts === 'until its program ends' ? 'program' : 'fixed'}>
                {r.end.lasts === 'until its program ends'
                  ? t('resources.holderUntilItsProgramEnds', { who: nameOf(gpu, r.holder), gib: r.gib })
                  : t('resources.holder', { who: nameOf(gpu, r.holder), gib: r.gib, until: whenWord(r.until, now) })}
              </p>
              <p className="rs-line rs-quiet">{t(PROGRAM_WORD[r.program])}</p>
              {r.end.lasts === 'until its program ends' ? <TheEnd end={r.end} now={now} /> : null}
              {overByOf(r.booking) === null ? null : (
                <p className="rs-line rs-ask" data-over={overByOf(r.booking)}>
                  {t('resources.overThePlan', { m: overByOf(r.booking) ?? 0 })}
                </p>
              )}
              <Extended extensions={extensionsOf(r.booking)} />
              {purposeOf(r.booking) === null ? null : <p className="rs-line rs-quiet">{t('resources.purpose', { purpose: content(purposeOf(r.booking) ?? '') })}</p>}
            </div>
          ))}
          {gpu.freeGiBNow === null || gpu.cardGiB === null ? null : (
            <p className="rs-line rs-quiet">{t('resources.free', { free: gpu.freeGiBNow, card: gpu.cardGiB })}</p>
          )}
          {gpu.freeCounts?.from === 'bookings only' ? <p className="rs-line rs-ask" data-free="bookings-only">{t(BOOKINGS_ONLY_WORD[gpu.freeCounts.because], { since: gpu.freeCounts.since ?? '' })}</p> : null}
          {second === undefined || second.withoutABooking.length === 0 ? null : (
            <div className="rs-item" data-unbooked={second.withoutABooking.length}>
              {/* AN OLD READING'S JOBS ARE SAID IN THE PAST, at the time it was read, so they are not taken for now. */}
              <p className="rs-line rs-ask">
                {gpu.freeCounts?.from === 'bookings only' && gpu.freeCounts.since !== null
                  ? t('resources.onTheCardThen', { n: second.withoutABooking.length, since: gpu.freeCounts.since })
                  : t('resources.onTheCard', { n: second.withoutABooking.length })}
              </p>
              {second.withoutABooking.map((p) => (
                <p className="rs-line rs-quiet" key={p.pid}>
                  {unbookedWord(p)}
                </p>
              ))}
            </div>
          )}
        </section>
        <section className="rs-col" data-column="next">
          <h3 className="rs-head">{t('resources.column.next')}</h3>
          {waiting.length === 0 ? <p className="rs-line"><Absence tier="told-apart" looked word={t('absence.none')} /></p> : null}
          {waiting.map((l) => (
            <div className="rs-item" key={l.booking} data-asks={l.goFirst?.state === 'asked' ? 'yes' : 'no'}>
              {l.goFirst?.state === 'asked' ? <GoFirstAsked gpu={gpu} holder={l.holder} asked={l.goFirst} booking={l.booking} mayAnswer={l.mayAnswer} onChanged={onChanged} /> : null}
              <p className="rs-line rs-who">
                {t('resources.waiting', { who: nameOf(gpu, l.holder), gib: l.gib, from: whenWord(l.startsAt, now), until: whenWord(l.endsAt, now) })}
              </p>
              {l.repeat === 'daily' ? <p className="rs-line rs-quiet" data-repeat="daily">{t('resources.daily')}</p> : null}
              <Extended extensions={l.extensions} />
              <p className="rs-line rs-quiet">{t('resources.purpose', { purpose: content(l.purpose) })}</p>
            </div>
          ))}
        </section>
        <section className="rs-col" data-column="week">
          <h3 className="rs-head">{t('resources.column.week')}</h3>
          {second === undefined ? null : <TheWeek gpu={gpu} week={second.week} />}
        </section>
      </div>
    </Panel>
  )
}

function GoFirstAsked({
  gpu,
  holder,
  asked,
  booking,
  mayAnswer,
  onChanged,
}: {
  gpu: GpuView
  holder: ParticipantRef
  asked: BookingGoFirst
  booking: string
  mayAnswer: boolean
  onChanged?: (() => void) | undefined
}) {
  const ahead = (asked.ahead === booking ? null : (gpu.secondLevel?.line.find((l) => l.booking === asked.ahead) ?? null))
  const [pending, setPending] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const [said, setSaid] = useState<{ state: GoFirstState; says: string } | null>(null)
  const answer = (grant: boolean) => {
    setPending(true)
    setFault(null)
    moleOfficeRequest<{ state: GoFirstState; says: string }>(`/api/bookings/${encodeURIComponent(booking)}/go-first/answer`, {
      method: 'POST',
      body: JSON.stringify({ grant }),
    })
      .then((reply) => {
        setSaid({ state: reply.state, says: reply.says })
        onChanged?.()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
      .finally(() => setPending(false))
  }
  return (
    <div className="rs-asks">
      <p className="rs-line">{t('resources.asks', { who: nameOf(gpu, holder), ahead: ahead === null ? asked.ahead : nameOf(gpu, ahead.holder) })}</p>
      <div className="rs-buttons">
        {mayAnswer ? (
          <>
            <Btn variant="ask" size="sm" pending={pending} onClick={() => answer(true)}>
              {t('resources.grant')}
            </Btn>
            <Btn variant="secondary" size="sm" pending={pending} onClick={() => answer(false)}>
              {t('resources.refuse')}
            </Btn>
          </>
        ) : null}
        {asked.group === undefined ? null : (
          <Btn variant="ghost" size="sm" onClick={() => openTheChatAtGroup(asked.group ?? '')}>
            {t('resources.group')}
          </Btn>
        )}
      </div>
      {said === null ? null : <p className="rs-line rs-quiet">{stateWord(said.state).text}</p>}
      <ServerNote text={said?.says} />
      {fault === null ? null : <p className="rs-line rs-fault">{fault}</p>}
    </div>
  )
}

function TheWeek({ gpu, week }: { gpu: GpuView; week: NonNullable<GpuView['secondLevel']>['week'] }) {
  return (
    <>
      {week.withoutABookingMinutes === null ? null : (
        <>
          {week.byHolder.length === 0 && week.withoutABookingMinutes === 0 ? <p className="rs-line">{t('resources.week.nobody')}</p> : null}
          {week.byHolder.map((one) => (
            <p className="rs-line rs-hours" key={participantKey(one.holder)}>
              <span>{nameOf(gpu, one.holder)}</span>
              <span>{durationWord(one.minutes)}</span>
            </p>
          ))}
        </>
      )}
      <p className="rs-line rs-hours" data-without="yes">
        <span>{t('resources.week.without')}</span>
        {week.withoutABookingMinutes === null ? (
          <Absence tier="ordinary" word={t('absence.notLooked')} />
        ) : (
          <span>{durationWord(week.withoutABookingMinutes)}</span>
        )}
      </p>
      <ServerNote text={week.says} />
    </>
  )
}

type StartChoice = 'now' | 'when-free' | 'at'

/** THE OWNER'S BOOKING WINDOW. Drawn only when the server says the reader is the owner. */
export function BookingWindow({ gpu, now, onClose, onBooked }: { gpu: GpuView; now: number; onClose: () => void; onBooked?: (() => void) | undefined }) {
  useLanguage()
  const [start, setStart] = useState<StartChoice>('now')
  const [at, setAt] = useState('')
  const [minutes, setMinutes] = useState('')
  const [gib, setGib] = useState('')
  const [purpose, setPurpose] = useState('')
  const [daily, setDaily] = useState(false)
  const [choice, setChoice] = useState<CutInChoice>('after')
  const [pending, setPending] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const someoneRuns = gpu.running.length > 0
  const runningNames = gpu.running.map((r) => nameOf(gpu, r.holder)).join(', ')
  const waitingNames = (gpu.secondLevel?.line ?? []).filter((l) => l.state === 'waiting').map((l) => nameOf(gpu, l.holder))
  const missing =
    purpose.trim() === ''
      ? t('resources.book.needsPurpose')
      : !/^\d+$/.test(minutes.trim()) || !/^\d+$/.test(gib.trim())
        ? t('resources.book.needsNumbers')
        : start === 'at' && at.trim() === ''
          ? t('resources.book.needsTime')
          : null
  const book = () => {
    setPending(true)
    setFault(null)
    setSaid(null)
    const body = {
      resource: 'gpu',
      gib: Number(gib.trim()),
      minutes: Number(minutes.trim()),
      purpose: purpose.trim(),
      start: start === 'at' ? { at: at.trim() } : start,
      ...(someoneRuns ? { cutIn: choice } : {}),
      ...(start === 'at' && daily ? { repeat: 'daily' } : {}),
    }
    moleOfficeRequest<{ says: string }>('/api/bookings', { method: 'POST', body: JSON.stringify(body) })
      .then((reply) => {
        setSaid(reply.says)
        onBooked?.()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
      .finally(() => setPending(false))
  }
  return (
    <section className="rs-window" aria-label={t('resources.book.title')} {...declaredAttributes({ surface: 'resources.book' })}>
      <h3 className="rs-window-title">{t('resources.book.title')}</h3>
      <div className="rs-box">
        <p className="rs-line">
          <span className="rs-key">{t('resources.column.now')}</span>
          {someoneRuns ? runningNames : <Absence tier="told-apart" looked word={t('resources.noRunningBooking')} />}
        </p>
        <p className="rs-line">
          <span className="rs-key">{t('resources.column.next')}</span>
          {waitingNames.length === 0 ? <Absence tier="told-apart" looked word={t('absence.none')} /> : waitingNames.join(', ')}
        </p>
      </div>
      <fieldset className="rs-starts">
        <legend className="rs-key">{t('resources.book.start')}</legend>
        {(['now', 'when-free', 'at'] as const).map((one) => (
          <label className="rs-pick" key={one}>
            <input type="radio" name="mole-office-booking-start" value={one} checked={start === one} onChange={() => setStart(one)} />
            {t(one === 'now' ? 'resources.book.start.now' : one === 'when-free' ? 'resources.book.start.whenFree' : 'resources.book.start.at')}
          </label>
        ))}
      </fieldset>
      {start === 'at' ? (
        <Field label={t('resources.book.at')}>
          <TextInput value={at} onChange={setAt} placeholder={localNowWord(now)} mono />
        </Field>
      ) : null}
      {start === 'at' ? (
        <label className="rs-pick" data-repeat-choice={daily ? 'daily' : 'once'}>
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          {t('resources.book.daily')}
        </label>
      ) : null}
      <div className="rs-fields">
        <Field label={t('resources.book.minutes')}>
          <TextInput value={minutes} onChange={setMinutes} mono />
        </Field>
        <Field label={t('resources.book.gib')}>
          <TextInput value={gib} onChange={setGib} mono />
        </Field>
      </div>
      <Field label={t('resources.book.purpose')}>
        <TextInput value={purpose} onChange={setPurpose} />
      </Field>
      {someoneRuns ? (
        <fieldset className="rs-choices" data-choices="owner">
          {(['now', 'after'] as const).map((one) => (
            <label className="rs-choice" key={one} data-chosen={choice === one ? 'yes' : 'no'}>
              <input type="radio" name="mole-office-booking-cut-in" value={one} checked={choice === one} onChange={() => setChoice(one)} />
              <span className="rs-choice-word">{one === 'now' ? t('resources.book.goFirst') : t('resources.book.letFinish', { who: runningNames })}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="rs-buttons">
        <Btn variant="secondary" size="sm" onClick={onClose}>
          {t('resources.book.close')}
        </Btn>
        <Btn variant="primary" size="sm" pending={pending} disabled={missing !== null} {...(missing === null ? {} : { reason: missing })} onClick={book}>
          {t('resources.book.submit')}
        </Btn>
      </div>
      {said === null ? null : <p className="rs-line">{t('resources.book.done')}</p>}
      <ServerNote text={said} />
      {fault === null ? null : <p className="rs-line rs-fault">{fault}</p>}
    </section>
  )
}

function localNowWord(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The full-suite test seat, from GET /api/slots. Exported so a test can draw it. */
export function SeatCard({ pool }: { pool: PoolView | null }) {
  useLanguage()
  return (
    <Panel titleIs="label" declares={{ surface: 'resources.seat' }} title={surfaceWord('resources.seat')}>
      {pool === null ? null : <ServerNote text={pool.says} />}
      {pool === null ? null : (
        <div className="rs-cols">
          <section className="rs-col" data-column="now">
            <h3 className="rs-head">{t('resources.column.now')}</h3>
            {pool.held.length === 0 ? <p className="rs-line">{t('resources.seat.freeNow')}</p> : null}
            {pool.held.map((s) => (
              <p className="rs-line rs-who" key={s.id}>
                {t('resources.seat.holder', { seat: s.seat ?? '?', who: s.session.title === null ? t('resources.seat.unnamed') : content(s.session.title) })}
              </p>
            ))}
          </section>
          <section className="rs-col" data-column="next">
            <h3 className="rs-head">{t('resources.column.next')}</h3>
            <p className="rs-line">{pool.waiting.length === 0 ? <Absence tier="told-apart" looked word={t('absence.none')} /> : t('resources.seat.waiting', { n: pool.waiting.length })}</p>
          </section>
          <section className="rs-col" data-column="week">
            <h3 className="rs-head">{t('resources.column.week')}</h3>
            <p className="rs-line rs-quiet"><Absence tier="told-apart" looked={false} word={t('word.notRecorded')} /></p>
          </section>
        </div>
      )}
    </Panel>
  )
}

const RESOURCES_CSS = `
.rs { display: flex; flex-direction: column; gap: var(--gut); }
.rs-title { margin: 0; }
.rs-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gut); }
.rs-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rs-head { margin: 0; font-size: var(--fs-1); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.rs-item { display: flex; flex-direction: column; gap: 2px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.rs-item[data-asks='yes'] { border: 1px solid var(--ask-line); background: var(--ask-bg); padding: 6px; border-radius: 6px; }
.rs-line { margin: 0; font-size: var(--fs-2); line-height: var(--lh-tight); overflow-wrap: anywhere; }
.rs-quiet { color: var(--text-2); font-size: var(--fs-1); }
.rs-ask { color: var(--ask); }
.rs-fault { color: var(--st-failed); }
.rs-who { font-weight: 600; }
.rs-hours { display: flex; justify-content: space-between; gap: var(--pad); }
.rs-hours[data-without='yes'] { border-top: 1px solid var(--border); padding-top: 4px; }
.rs-asks { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
.rs-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.rs-window { display: flex; flex-direction: column; gap: var(--pad); margin-bottom: var(--pad-lg); padding: var(--pad); border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); }
.rs-window-title { margin: 0; font-size: var(--fs-3); }
.rs-box { display: flex; flex-direction: column; gap: 4px; padding: 6px var(--pad); border-left: 3px solid var(--accent); }
.rs-key { color: var(--text-3); font-size: var(--fs-1); margin-right: 8px; }
.rs-starts, .rs-choices { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--pad); }
.rs-choices { flex-direction: column; gap: 6px; }
.rs-pick { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-2); }
.rs-choice { display: flex; gap: 8px; align-items: flex-start; padding: 6px; border: 1px solid var(--border); border-radius: 6px; }
.rs-choice[data-chosen='yes'] { border-color: var(--accent); }
.rs-choice-word { font-weight: 600; font-size: var(--fs-2); }
.rs-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pad); }
@media (max-width: 720px) {
  .rs-cols { grid-template-columns: minmax(0, 1fr); }
  .rs-fields { grid-template-columns: minmax(0, 1fr); }
}
`
