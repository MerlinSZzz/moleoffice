// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROPOSAL TO MAKE AN AGENT A PERMANENT RESIDENT, WITH THE PERSON'S PRESS ON THE ROW. The
 * secretary nominates, and the owner confirms with one press. The proposal
 * report GsGFiDygATd5, blocks b-4 and b-8, and its third and fifth pictures.
 *
 * WHERE IT IS DRAWN. Where the asks at the door are drawn today (AsksAtTheDoor.tsx): on Home's waiting
 * band and on the Embassy. And on the agent's own page, through ResidentSection.tsx, for the one agent.
 *
 * WHAT A ROW SAYS. Who proposes; the facts the office measured, so the secretary cannot get them wrong;
 * the secretary's reason in its own words; and, for the person, what the press does and the two
 * presses: "Confirm" and "Not now", with a reason or none. Only the person sees the presses, because
 * the door refuses every other caller, a secretary acting for the person under a raise included.
 *
 * AFTER THE PRESS THE ROW STAYS, AND SAYS WHAT WAS DONE. The confirm door makes the space in the same
 * act as the residency, and records nothing when it cannot: so an answer of 200 is the space made, and
 * only then does the row say the resident has one. A refusal is drawn in the page's words from its code.
 */
import { content, t, wordLanguage } from '@shared/i18n.ts'
import { bytesSaid } from '@shared/what-is-kept.ts'
import { drawnStamp } from '@shared/time.ts'
import { useRef, useState, type ReactNode } from 'react'
import { api, errorMessage, faultOf, getActor, type Fault, type ParticipantOnTheWire } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import {
  theResidentInASentence,
  thePersonIsLooking,
  type AResidencyProposal,
  type MeasuredFacts,
  type TheConfirmReply,
  type TheCriterionReading,
  type TheDeclineReply,
  type TheResidentsList,
} from '../lib/residents.ts'
import { Absence, Btn, ErrorNote, TextArea, useAsync } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** What one press did, as the door answered it. */
export type ProposalAnswered = { did: 'confirm'; reply: TheConfirmReply } | { did: 'decline'; reply: TheDeclineReply }

/** A failed press, kept whole so a coded refusal is drawn in the page's words. */
type PressFault = { message: string; fault: Fault | null }

function pressFault(err: unknown): PressFault {
  return { message: errorMessage(err), fault: faultOf(err) }
}

/**
 * THE ROWS OF THE OPEN PROPOSALS, READ HERE. For Home's band, which has not read GET /api/residents
 * itself. The Embassy and the agent's own section read it once and draw `ResidentProposalList`.
 */
export function ResidentProposals({ onAnswered }: { onAnswered?: () => void }) {
  useLanguage()
  const inspect = useInspect()
  const [state, readAgain] = useAsync(() => api.residents(), [])
  if (state.status === 'loading') return null
  if (state.status === 'error') {
    return <ErrorNote message={inspect ? state.message : t('resident.proposal.readFailed')} fault={inspect ? state.fault : undefined} retry={readAgain} />
  }
  return (
    <ResidentProposalList
      reply={state.value}
      onAnswered={() => {
        readAgain()
        onAnswered?.()
      }}
    />
  )
}

/**
 * EVERY OPEN PROPOSAL IN THE READING, AND EVERY ONE ANSWERED HERE SINCE THE PAGE OPENED. An answered
 * proposal leaves the reading when it is read again, and its row stays, saying what the press did, so
 * nothing jumps away from under the person's hand. The same rule as AsksAtTheDoor.tsx.
 */
export function ResidentProposalList({
  reply,
  onlyFor,
  onAnswered,
  thePerson = thePersonIsLooking(getActor()),
}: {
  reply: TheResidentsList
  /** One agent's proposals only, on that agent's own page. */
  onlyFor?: string
  onAnswered: () => void
  /** Whether the person is the one looking. Read from who this page writes as; a test may pass it. */
  thePerson?: boolean
}) {
  useLanguage()
  const open = reply.openProposals.filter((one) => onlyFor === undefined || one.agentId === onlyFor)
  const [answered, setAnswered] = useState<ReadonlyMap<string, { proposal: AResidencyProposal; answer: ProposalAnswered }>>(new Map())
  // THE ORDER A ROW WAS FIRST SEEN IN, so an answered row keeps its place when the list is read again.
  const order = useRef<string[]>([])
  for (const one of open) if (!order.current.includes(one.id)) order.current.push(one.id)
  const byId = new Map(open.map((one) => [one.id, one] as const))
  const rows = order.current.flatMap((id): { proposal: AResidencyProposal; answer: ProposalAnswered | null }[] => {
    const done = answered.get(id)
    if (done !== undefined) return [done]
    const proposal = byId.get(id)
    return proposal === undefined ? [] : [{ proposal, answer: null }]
  })
  if (rows.length === 0) return null
  return (
    <ul className="resident-proposals" aria-label={t('resident.proposal.list')}>
      <style href="mole-office-resident-proposals" precedence="default">
        {RESIDENT_PROPOSALS_CSS}
      </style>
      {rows.map((row) => (
        <ResidentProposalRow
          key={row.proposal.id}
          proposal={row.proposal}
          limitBytes={reply.limit}
          answer={row.answer}
          thePerson={thePerson}
          onPressed={(answer) => {
            setAnswered((was) => new Map(was).set(row.proposal.id, { proposal: row.proposal, answer }))
            onAnswered()
          }}
        />
      ))}
    </ul>
  )
}

/** The agent a proposal names, by the name the office has for it. */
export function proposedName(proposal: Pick<AResidencyProposal, 'name' | 'handle' | 'agentId'>): string {
  return content(proposal.name ?? proposal.handle ?? proposal.agentId)
}

/** One proposal: who proposes, the measured facts, the reason, and for the person the presses. */
export function ResidentProposalRow({
  proposal,
  limitBytes,
  answer,
  thePerson,
  onPressed,
}: {
  proposal: AResidencyProposal
  limitBytes: number
  /** What the press did here, or null while the proposal waits. */
  answer: ProposalAnswered | null
  thePerson: boolean
  onPressed: (answer: ProposalAnswered) => void
}) {
  const name = proposedName(proposal)
  const proposer = useNameOf(proposal.proposedBy === null ? null : { kind: 'agent', id: proposal.proposedBy })
  return (
    <li className="resident-proposal" data-resident-proposal={proposal.id} data-answered={answer === null ? 'no' : answer.did}>
      <p className="resident-proposal-who">{t('resident.proposal.proposes', { name: proposer })}</p>
      <h3 className="resident-proposal-title">{t('resident.proposal.title', { name })}</h3>
      <h4 className="resident-proposal-head">{t('resident.facts.heading')}</h4>
      <ResidentFactsList facts={proposal.facts} homeWorldIsThisOffice={proposal.homeWorldIsThisOffice} />
      <h4 className="resident-proposal-head">{t('resident.criterion.heading')}</h4>
      <ResidentCriterionList criterion={proposal.criterion} />
      <p className="resident-proposal-sleep-time" data-proposed-sleep-time={proposal.sleepTime === null ? 'none' : 'set'}>
        {proposal.sleepTime === null
          ? t('resident.proposal.sleepTimeNone')
          : t('resident.proposal.sleepTime', { startsAt: proposal.sleepTime.startsAt, minutes: proposal.sleepTime.minutes })}
      </p>
      <h4 className="resident-proposal-head">{t('resident.proposal.reason', { name: proposer })}</h4>
      <p className="resident-proposal-reason">{proposal.because === null ? <Absence /> : content(proposal.because)}</p>
      {answer !== null ? (
        <p className="resident-proposal-done" role="status">
          {doneWords(answer, name)}
        </p>
      ) : thePerson ? (
        <ThePresses proposal={proposal} limitBytes={limitBytes} onPressed={onPressed} />
      ) : null}
    </li>
  )
}

/** The person's two presses, with what the first one does said above them. */
function ThePresses({
  proposal,
  limitBytes,
  onPressed,
}: {
  proposal: AResidencyProposal
  limitBytes: number
  onPressed: (answer: ProposalAnswered) => void
}) {
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<PressFault | null>(null)
  const [declining, setDeclining] = useState(false)
  const [because, setBecause] = useState('')
  const name = proposedName(proposal)
  // HOW IT WISHES TO BE ADDRESSED, from its own row. Until the row is read, its name stands in.
  const row = participants.status === 'ready' ? participants.value.agents.find((one) => one.id === proposal.agentId) : undefined
  const who = theResidentInASentence({ name, addressAs: row?.addressAs ?? {} }, wordLanguage())

  const send = (run: () => Promise<ProposalAnswered>): void => {
    setFault(null)
    setBusy(true)
    run()
      .then((answer) => {
        setBusy(false)
        onPressed(answer)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault(pressFault(err))
      })
  }

  return (
    <div className="resident-proposal-press">
      <h4 className="resident-proposal-head">{t('resident.proposal.whatItDoes')}</h4>
      <p className="resident-proposal-does">
        {t('resident.proposal.whatItDoesSays', { name, who: content(who), limit: bytesSaid(limitBytes) })}
      </p>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      {declining ? (
        <div className="resident-proposal-decline">
          <label className="resident-proposal-field">
            <span className="resident-proposal-label">{t('resident.proposal.notNowBecause')}</span>
            <TextArea value={because} onChange={setBecause} rows={2} />
          </label>
          <div className="resident-proposal-acts">
            <Btn
              onClick={() =>
                send(async () => {
                  const said = because.trim()
                  const reply = await api.declineResidentProposal(proposal.id, proposal.workspaceId, said === '' ? null : said)
                  return { did: 'decline', reply }
                })
              }
              disabled={busy}
              reason={busy ? t('resident.working') : undefined}
            >
              {t('resident.proposal.notNowSend')}
            </Btn>
            <Btn variant="ghost" onClick={() => setDeclining(false)} disabled={busy} reason={busy ? t('resident.working') : undefined}>
              {t('resident.proposal.back')}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="resident-proposal-acts">
          <Btn
            variant="primary"
            onClick={() =>
              send(async () => {
                const reply = await api.confirmResidentProposal(proposal.id, proposal.workspaceId)
                return { did: 'confirm', reply }
              })
            }
            disabled={busy}
            reason={busy ? t('resident.working') : undefined}
          >
            {t('resident.proposal.confirm', { name })}
          </Btn>
          <Btn onClick={() => setDeclining(true)} disabled={busy} reason={busy ? t('resident.working') : undefined}>
            {t('resident.proposal.notNow')}
          </Btn>
        </div>
      )}
      <p className="resident-proposal-only">{t('resident.proposal.onlyYou')}</p>
    </div>
  )
}

/**
 * WHAT THE PRESS DID, SAID ON THE ROW AFTERWARDS, from the door's answer. A confirm the door answered is
 * a space made: the door makes it in the same act, and when it cannot, it records nothing and refuses.
 * The moment is the residency's own `since`, which is when it was confirmed.
 */
export function doneWords(answer: ProposalAnswered, name: string): string {
  if (answer.did === 'decline') return t('resident.proposal.doneDeclined', { name })
  const done = t('resident.proposal.doneConfirmed', { at: drawnStamp(answer.reply.resident.since), name })
  // THE MESSAGE TO THE NEW RESIDENT WRITTEN AFTER THE CONFIRM: when it could not be, the row says so (no silent half).
  return answer.reply.reminder.agent.sent ? done : `${done} ${t('resident.proposal.reminderNotSent', { name })}`
}

/** One part of the criterion in the page's words. */
function partWords(part: TheCriterionReading['days']['part']): string {
  if (part === 'met') return t('resident.criterion.met')
  if (part === 'not-met') return t('resident.criterion.notMet')
  if (part === 'not-reported') return t('resident.criterion.notReported')
  return t('resident.criterion.notMeasured')
}

/**
 * THE FACTS AGAINST THE DECIDED CRITERION, each part with whether it is met. Worked out on the
 * server by `measuredAgainstTheCriterion`, the one place; the row only says it. Nothing is refused for falling short.
 */
export function ResidentCriterionList({ criterion }: { criterion: TheCriterionReading }) {
  useLanguage()
  const compactions =
    criterion.compactions.have === null
      ? partWords(criterion.compactions.part)
      : t('resident.criterion.count', { have: criterion.compactions.have, needed: criterion.compactions.needed, part: partWords(criterion.compactions.part) })
  return (
    <>
      <p className="resident-proposal-criterion">{t('resident.criterion.note')}</p>
      <dl className="resident-facts" data-criterion="">
        <ResidentFact
          label={t('resident.criterion.days')}
          value={
            <span data-part={criterion.days.part}>
              {t('resident.criterion.count', { have: criterion.days.have, needed: criterion.days.needed, part: partWords(criterion.days.part) })}
            </span>
          }
        />
        <ResidentFact label={t('resident.criterion.compactions')} value={<span data-part={criterion.compactions.part}>{compactions}</span>} />
        <ResidentFact
          label={t('resident.criterion.area')}
          value={<span data-part={criterion.area.part}>{criterion.area.named === null ? t('resident.criterion.areaNotNamed') : content(criterion.area.named)}</span>}
        />
      </dl>
    </>
  )
}

/**
 * THE FACTS THE OFFICE MEASURED, one label and one value each. A value nobody recorded says "unknown",
 * never zero. Drawn on a proposal and, as they were when it was proposed, on a resident's own section.
 *
 * `homeWorldIsThisOffice` is the reply's answer to whether the stored home world is this office's home, which
 * the server works out once, a dead home of this installation included. The list draws that answer and does not
 * compare the home world with the world this page reads.
 */
export function ResidentFactsList({ facts, homeWorldIsThisOffice }: { facts: MeasuredFacts; homeWorldIsThisOffice: boolean | null }) {
  useLanguage()
  const inspect = useInspect()
  const unknown = t('resident.unknown')
  const since =
    facts.citizenSince === null
      ? unknown
      : facts.daysSinceCitizen === null
        ? drawnStamp(facts.citizenSince)
        : t('resident.facts.citizenSinceValue', { date: drawnStamp(facts.citizenSince), n: facts.daysSinceCitizen })
  // A COUNT OF DAYS, NOT A SHARE: an agent registered today has 0 whole days as a citizen and may have a run on 1.
  const runs = String(facts.daysWithARun)
  // THE HOME WORLD IS A DATABASE IDENTITY. It is called this office when the reply says it is this office's home, and
  // another world when the reply says it is not. When the reply cannot say, the identity itself is drawn.
  const world =
    facts.homeWorld === null
      ? unknown
      : homeWorldIsThisOffice === true
        ? t('resident.facts.thisOffice')
        : homeWorldIsThisOffice === false && !inspect
          ? t('resident.facts.anotherWorld')
          : content(facts.homeWorld)
  return (
    <dl className="resident-facts">
      <ResidentFact label={t('resident.facts.citizenSince')} value={since} />
      <ResidentFact label={t('resident.facts.daysWithARun')} value={runs} />
      <ResidentFact label={t('resident.facts.runs')} value={String(facts.runs)} />
      <ResidentFact label={t('resident.facts.recordsWritten')} value={String(facts.recordsWritten)} />
      <ResidentFact
        label={t('resident.facts.compactions')}
        value={
          facts.compactionsReported === undefined
            ? t('resident.facts.compactionsNotCounted')
            : facts.compactionsReported === 0
              ? t('resident.facts.compactionsNone')
              : String(facts.compactionsReported)
        }
      />
      <ResidentFact label={t('resident.facts.retired')} value={t(facts.retired ? 'resident.yes' : 'resident.no')} />
      <ResidentFact label={t('resident.facts.homeWorld')} value={world} />
      <ResidentFact label={t('resident.facts.measuredAt')} value={drawnStamp(facts.measuredAt)} />
    </dl>
  )
}

/** One label and one value. */
export function ResidentFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="resident-fact">
      <style href="mole-office-resident-facts" precedence="default">
        {RESIDENT_FACTS_CSS}
      </style>
      <dt className="resident-fact-label">{label}</dt>
      <dd className="resident-fact-value">{value}</dd>
    </div>
  )
}

/**
 * THE NAME OF SOMEBODY THE OFFICE RECORDED BY REFERENCE, as a string for a sentence. A stored reference
 * is read by exact id first, then by the one agent bearing it as a handle. Their id in developer mode
 * when nobody answers to it; otherwise the word for a missing value.
 */
export function useNameOf(who: { kind: string; id: string } | null): string {
  const inspect = useInspect()
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  if (who === null) return t('absence.mark')
  if (participants.status === 'ready') {
    const found = nameIn(participants.value, who)
    if (found !== null) return content(found)
  }
  return inspect ? content(who.id) : t('absence.mark')
}

function nameIn(everybody: { people: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name'>[]; agents: readonly Pick<ParticipantOnTheWire, 'id' | 'handle' | 'name'>[] }, who: { kind: string; id: string }): string | null {
  const list = who.kind === 'person' ? everybody.people : everybody.agents
  const byId = list.find((one) => one.id === who.id)
  if (byId !== undefined) return byId.name
  const byHandle = list.filter((one) => one.handle === who.id)
  return byHandle.length === 1 ? byHandle[0]!.name : null
}

/** No backtick in these strings. A label above a value wraps as one piece at 390. */
const RESIDENT_FACTS_CSS = `
/* EACH FACT IS ONE ROW THAT WRAPS: the value goes under its label when the box is too narrow for both,
   so no container query is needed and a phone at 390 never scrolls sideways. */
.resident-facts { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.resident-fact { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--gut); row-gap: 0; min-width: 0; }
.resident-fact-label { flex: 0 0 12rem; max-width: 100%; color: var(--text-3); font-size: var(--fs-1); }
.resident-fact-value { flex: 1 1 14rem; margin: 0; color: var(--text); font-size: var(--fs-2); overflow-wrap: anywhere; min-width: 0; }
`

const RESIDENT_PROPOSALS_CSS = `
.resident-proposals { list-style: none; margin: 0 0 var(--pad); padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.resident-proposal {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
  padding: var(--pad);
  border-left: var(--rail) solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--hover);
}
.resident-proposal:not([data-answered='no']) { border-left-color: var(--border-strong); }
.resident-proposal-who { margin: 0; color: var(--text-2); font-size: var(--fs-2); }
.resident-proposal-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.resident-proposal-head {
  margin: 6px 0 0; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase;
}
.resident-proposal-reason, .resident-proposal-sleep-time, .resident-proposal-does, .resident-proposal-done {
  margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere;
}
.resident-proposal-press, .resident-proposal-decline { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.resident-proposal-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.resident-proposal-label { color: var(--text-3); font-size: var(--fs-1); }
.resident-proposal-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; margin-top: 4px; }
/* The confirm press names the agent, so at 390 its words wrap inside the box instead of running past its edge. */
.resident-proposal-acts button { max-width: 100%; white-space: normal; text-align: start; }
.resident-proposal-only { margin: 0; color: var(--text-3); font-size: var(--fs-1); }
.resident-proposal-criterion { margin: 0; max-width: var(--measure-in-box); color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
`
