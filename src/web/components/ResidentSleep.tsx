// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT'S SLEEP, HEARTBEAT AND NAMING, AS THE PAGES DRAW THEM, by three decisions of
 * 3 October 2026.
 *
 * THREE THINGS ARE DRAWN FROM HERE. The chat's short line is SleepLine.tsx, kept apart so the chat imports nothing else.
 *
 *   · `HeartbeatFact`, the heartbeat as one fact, here and on the resident's section (ResidentSection.tsx).
 *   · `ResidentSleepPlace`, the Sleep place on the agent's profile: its heartbeat, whether it sleeps now, when its last
 *     sleep ended, the compactions its runs reported, and its postponed sleeps. A postponed sleep is shown here and
 *     sent to nobody, as item 1 of a decision says.
 *   · On the same place, whether the new resident's picture and name were chosen, and for the person the press that
 *     says they are, which takes the reminder off the person's list.
 *   · Beside "last slept", the presses that put it to sleep, wake it and postpone its sleep, for those who may press
 *     them (SleepPresses.tsx), and beside its compactions the office flow of its newest run. Item 1 of a decision says:
 *     "together with its compactions and its office flow".
 *   · Beside "last slept" too, a secretary's own sleep time and who set it, and for the person and the secretary itself
 *     the editor that sets it.
 *
 * A SECRETARY SLEEPS AT ITS OWN TIME, which each secretary sets for itself. The
 * office begins and ends that sleep (src/server/lib/sleep-windows.ts), and while it goes on the Sleep place says until
 * when. Every other sleep is an act the resident or the person presses now, through the doors in
 * src/server/api/residents.ts.
 */
import { content, t } from '@shared/i18n.ts'
import { SLEEP_TIME_LONGEST_MINUTES, SLEEP_TIME_SHORTEST_MINUTES } from '@shared/residents.ts'
import { drawnStamp } from '@shared/time.ts'
import { useState, type ReactNode } from 'react'
import { api, errorMessage, faultOf, getActor, type Fault } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { thePersonIsLooking, type OneResidentReading, type TheHeartbeat } from '../lib/residents.ts'
import { FlowRunSteps } from './FlowRunSteps.tsx'
import { ResidentFact, useNameOf } from './ResidentProposals.tsx'
import { SleepPresses, whoMayPress, type WhoMayPress } from './SleepPresses.tsx'
import { Absence, Btn, ErrorNote, Field, Panel, TextInput, useAsync } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** The heartbeat in a few words, for a label on the profile and on the resident's section. */
export function heartbeatWords(heartbeat: TheHeartbeat): string {
  if (heartbeat.state === 'none' || heartbeat.lastBeatAt === null) return t('resident.heartbeat.none')
  const when = drawnStamp(heartbeat.lastBeatAt)
  if (heartbeat.state === 'lapsed') return t('resident.heartbeat.lapsed', { when })
  if (heartbeat.state === 'released') return t('resident.heartbeat.stopped', { when })
  return t('resident.heartbeat.goesOn', { when })
}

/** The heartbeat as one fact: the few words, and in developer mode the server's whole sentence under them. */
export function HeartbeatFact({ heartbeat }: { heartbeat: TheHeartbeat }) {
  const inspect = useInspect()
  return (
    <ResidentFact
      label={t('resident.heartbeat.label')}
      value={
        <span data-heartbeat={heartbeat.state}>
          {heartbeatWords(heartbeat)}
          {inspect ? <span className="resident-sleep-says">{content(heartbeat.says)}</span> : null}
        </span>
      }
    />
  )
}

/**
 * THE SLEEP PLACE ON AN AGENT'S PROFILE, READ HERE. Which agents are residents is read from GET /api/residents first,
 * so the page never reads a refusal to learn that an agent is not one; an agent that is not draws nothing.
 */
export function ResidentSleepPlace({ agentId, newestRun }: { agentId: string; newestRun: string | null }) {
  useLanguage()
  const inspect = useInspect()
  const [list, readListAgain] = useAsync(() => api.residents(), [agentId])
  const isResident = list.status === 'ready' && list.value.residents.some((one) => one.agentId === agentId)
  const [reading, readAgain] = useProjectAsync(() => (isResident ? api.resident(agentId) : Promise.resolve(null)), [agentId, isResident])
  if (list.status === 'loading') return null
  if (list.status === 'error') {
    return <ErrorNote message={inspect ? list.message : t('resident.residency.readFailed')} fault={inspect ? list.fault : undefined} retry={readListAgain} />
  }
  if (!isResident) return null
  if (reading.status === 'loading' || (reading.status === 'ready' && reading.value === null)) return null
  if (reading.status === 'error') {
    return <ErrorNote message={inspect ? reading.message : t('resident.residency.readFailed')} fault={inspect ? reading.fault : undefined} retry={readAgain} />
  }
  const thePerson = thePersonIsLooking(getActor())
  return (
    <TheResidentSleep
      reading={reading.value!}
      thePerson={thePerson}
      may={whoMayPress(getActor(), thePerson, agentId)}
      flow={<OfficeFlowOfARun runId={newestRun} />}
      onChanged={readAgain}
    />
  )
}

/**
 * THE OFFICE FLOW OF THE RESIDENT'S NEWEST RUN, read by the run's id. A run with no flow run, and an agent with no run
 * here, each say so in words; neither is drawn as an empty list.
 */
export function OfficeFlowOfARun({ runId }: { runId: string | null }) {
  const inspect = useInspect()
  const [read, readAgain] = useProjectAsync(() => (runId === null ? Promise.resolve(null) : api.flowRunOf(runId)), [runId])
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  if (runId === null) return <OfficeFlowAbsent words={t('resident.flow.noRun')} />
  if (read.status === 'loading') return null
  if (read.status === 'error') {
    return <ErrorNote message={inspect ? read.message : t('resident.flow.readFailed')} fault={inspect ? read.fault : undefined} retry={readAgain} />
  }
  if (read.value === null || read.value.flowRun === null) return <OfficeFlowAbsent words={t('resident.flow.none')} />
  return (
    <FlowRunSteps
      record={read.value.flowRun}
      participants={participants.status === 'ready' ? participants.value : undefined}
      title={t('resident.flow.title')}
    />
  )
}

/** The office flow's place when there is nothing to list, with the reason in words. */
function OfficeFlowAbsent({ words }: { words: string }) {
  return (
    <Panel declares={{ surface: null }} titleIs="label" title={t('resident.flow.title')}>
      <p className="resident-sleep-quiet" data-office-flow="none">{words}</p>
    </Panel>
  )
}

/**
 * THE SLEEP PLACE, FROM WHAT WAS READ. Everything it draws is passed in, so a test can draw it from a reading without a
 * server.
 */
export function TheResidentSleep({
  reading,
  thePerson,
  may = { sleepAndWake: false, postpone: false },
  flow = null,
  onChanged,
}: {
  reading: OneResidentReading
  thePerson: boolean
  /** Which sleep presses this reader may have. Left out, none: a test drawing the facts alone gets no press. */
  may?: WhoMayPress
  /** The office flow drawn beside the compactions, or nothing. */
  flow?: ReactNode
  onChanged: () => void
}) {
  useLanguage()
  const resident = reading.resident
  const sleep = resident.sleep
  const now = !sleep.recorded
    ? t('resident.sleep.line.none')
    : sleep.asleep === null
      ? t('resident.sleep.awake')
      : sleep.asleep.wakesAt === null
        ? t('resident.sleep.asleepSince', { when: drawnStamp(sleep.asleep.since) })
        : t('resident.sleep.asleepUntil', { when: drawnStamp(sleep.asleep.since), until: drawnStamp(sleep.asleep.wakesAt) })
  const mayEditTheSleepTime = may.sleepAndWake && !resident.retired && resident.holdsTheSecretaryCard
  return (
    <>
      <style href="mole-office-resident-sleep" precedence="default">
        {RESIDENT_SLEEP_CSS}
      </style>
      <Panel declares={{ surface: 'profile.sleep' }} titleIs="label" title={t('resident.sleep.title')}>
        <dl className="resident-sleep-facts" data-resident-sleep={resident.agentId}>
          <HeartbeatFact heartbeat={resident.heartbeat} />
          <ResidentFact label={t('resident.sleep.now')} value={now} />
          {sleep.recorded ? (
            <ResidentFact
              label={t('resident.sleep.lastEnded')}
              value={sleep.lastSleepEndedAt === null ? t('resident.sleep.noneEnded') : drawnStamp(sleep.lastSleepEndedAt)}
            />
          ) : null}
          <ResidentFact label={t('resident.sleep.time.label')} value={<SleepTimeWords reading={reading} thePerson={thePerson} />} />
          <ResidentFact
            label={t('resident.sleep.compactions')}
            value={resident.compactionsReported === 0 ? t('resident.sleep.noCompactions') : String(resident.compactionsReported)}
          />
        </dl>
        {resident.retired ? null : (
          <SleepPresses agentId={resident.agentId} asleep={sleep.asleep !== null} byTheOffice={sleep.asleep?.wakesAt != null} may={may} onDone={onChanged} />
        )}
        {mayEditTheSleepTime ? <SleepTimeEditor agentId={resident.agentId} sleepTime={sleep.sleepTime} onDone={onChanged} /> : null}
        <h3 className="resident-sleep-head">{t('resident.sleep.postponed', { n: sleep.postponedInAll })}</h3>
        {sleep.postponements.length === 0 ? (
          <p className="resident-sleep-quiet">{t('resident.sleep.nonePostponed')}</p>
        ) : (
          <ul className="resident-sleep-postponed">
            {sleep.postponements.map((one) => (
              <li key={`${one.at}-${one.by.id}`}>
                <span className="resident-sleep-at">{drawnStamp(one.at)}</span>
                <span className="resident-sleep-because">{one.because === null ? <Absence /> : content(one.because)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="resident-sleep-quiet">{t('resident.sleep.postponedSentToNobody')}</p>
      </Panel>
      {flow}
      <TheNaming reading={reading} thePerson={thePerson} onChanged={onChanged} />
    </>
  )
}

/**
 * A SECRETARY'S SLEEP TIME IN WORDS: when it begins, how long it lasts, the clock it is on and when the next begins, then
 * who set it and when. A resident without the secretary card has none, and the words say so rather than "none set".
 */
function SleepTimeWords({ reading, thePerson }: { reading: OneResidentReading; thePerson: boolean }) {
  const resident = reading.resident
  const time = resident.sleep.sleepTime
  if (!resident.holdsTheSecretaryCard) return <span data-sleep-time="not-a-secretary">{t('resident.sleep.time.notASecretary')}</span>
  if (time === null) return <span data-sleep-time="none">{t('resident.sleep.time.none')}</span>
  const when = drawnStamp(time.setAt)
  return (
    <span data-sleep-time="set">
      {t('resident.sleep.time.set', { startsAt: time.startsAt, minutes: time.minutes, zone: time.zone, next: drawnStamp(time.nextBeginsAt) })}{' '}
      {time.setBy.kind === 'person'
        ? thePerson
          ? t('resident.sleep.time.setByYou', { when })
          : t('resident.sleep.time.setByThePerson', { when })
        : t('resident.sleep.time.setByItself', { name: content(resident.name), when })}
    </span>
  )
}

/**
 * THE EDITOR OF A SECRETARY'S SLEEP TIME, for the person and the secretary itself, as the door allows. The time of day
 * is sent as it was written: the door reads "3.00" as 03:00, refuses what it cannot read, and its words are drawn here.
 * The minutes are sent only as a whole number, and until then the press says what is missing.
 */
function SleepTimeEditor({
  agentId,
  sleepTime,
  onDone,
}: {
  agentId: string
  sleepTime: OneResidentReading['resident']['sleep']['sleepTime']
  onDone: () => void
}) {
  const [startsAt, setStartsAt] = useState(sleepTime?.startsAt ?? '')
  const [minutes, setMinutes] = useState(sleepTime === null ? '' : String(sleepTime.minutes))
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const whole = /^\d+$/.test(minutes.trim()) ? Number(minutes.trim()) : null
  const ready = startsAt.trim() !== '' && whole !== null
  const press = (): void => {
    if (whole === null) return
    setFault(null)
    setBusy(true)
    api
      .residentSleepTime(agentId, { startsAt: startsAt.trim(), minutes: whole })
      .then(() => {
        setBusy(false)
        onDone()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  return (
    <div className="resident-sleep-time" data-sleep-time-editor={agentId}>
      <div className="resident-sleep-time-fields">
        <Field label={t('resident.sleep.time.startsAt')}>
          <TextInput value={startsAt} onChange={setStartsAt} mono />
        </Field>
        <Field label={t('resident.sleep.time.minutes', { shortest: SLEEP_TIME_SHORTEST_MINUTES, longest: SLEEP_TIME_LONGEST_MINUTES })}>
          <TextInput value={minutes} onChange={setMinutes} mono />
        </Field>
      </div>
      <div className="resident-sleep-acts">
        <Btn size="sm" onClick={press} disabled={busy || !ready} reason={busy ? t('resident.working') : ready ? undefined : t('resident.sleep.time.fillBoth')}>
          {t('resident.sleep.time.press')}
        </Btn>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </div>
  )
}

/**
 * WHETHER THE NEW RESIDENT'S PICTURE AND NAME WERE CHOSEN, and for the person the press that says they are. Drawn only
 * for a resident the confirm asked about; one confirmed before the office asked has nothing to say here.
 */
function TheNaming({ reading, thePerson, onChanged }: { reading: OneResidentReading; thePerson: boolean; onChanged: () => void }) {
  const naming = reading.resident.naming
  const namer = useNameOf(naming.namedBy)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  if (naming.askedAt === null) return null
  const press = (): void => {
    setFault(null)
    setBusy(true)
    api
      .residentNamed(reading.resident.agentId)
      .then(() => {
        setBusy(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  return (
    <Panel declares={{ surface: 'profile.naming' }} titleIs="label" title={t('resident.naming.title')}>
      {naming.namedAt !== null ? (
        <p className="resident-sleep-said" data-naming="chosen">
          {t('resident.naming.chosen', { when: drawnStamp(naming.namedAt), who: namer })}
        </p>
      ) : (
        <>
          <p className="resident-sleep-said" data-naming="waiting">
            {t('resident.naming.waiting', { when: drawnStamp(naming.askedAt), name: content(reading.resident.name) })}
          </p>
          {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
          {thePerson ? (
            <div className="resident-sleep-acts">
              <Btn onClick={press} disabled={busy} reason={busy ? t('resident.working') : undefined}>
                {t('resident.naming.press')}
              </Btn>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  )
}

const RESIDENT_SLEEP_CSS = `
.resident-sleep-facts { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.resident-sleep-says { display: block; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.resident-sleep-head {
  margin: var(--pad) 0 4px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase;
}
.resident-sleep-postponed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.resident-sleep-postponed li { display: flex; flex-wrap: wrap; column-gap: var(--gut); min-width: 0; }
.resident-sleep-at { flex: 0 0 auto; color: var(--text-3); font-size: var(--fs-1); }
.resident-sleep-because { flex: 1 1 14rem; min-width: 0; color: var(--text); font-size: var(--fs-2); overflow-wrap: anywhere; }
.resident-sleep-quiet { margin: 4px 0 0; color: var(--text-3); font-size: var(--fs-1); }
.resident-sleep-said { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.resident-sleep-acts { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: 6px; }
.resident-sleep-time { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin-top: var(--pad); max-width: var(--measure-in-box); }
.resident-sleep-time-fields { display: flex; flex-wrap: wrap; gap: var(--pad); min-width: 0; }
.resident-sleep-time-fields > * { flex: 1 1 12rem; min-width: 0; }
`
