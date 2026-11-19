// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * THE SHORT NAME PROPOSED FOR AN AGENT WHOSE NAME IS A DESCRIPTION, on that agent's own page.
 *
 * Criterion M35: an agent's name is short, a name alone, or a name and a role such as
 * "[name] - the coordinator", with no description of what the agent does.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS ON THE SETTINGS PAGE AND IT LEFT
 * ---------------------------------------------------------------------------------------
 *
 * A Proposed short names panel in the settings looked out of place there and was not needed.
 * Criterion M50. Settings is the page a person opens holding
 * four questions about their own browser; a fifth about somebody else's name was noise on it, and
 * it was not where anybody would look for it either.
 *
 * IT LIVES WHERE A NAME IS CHOSEN, which is the agent's own page. `only` names that agent, so the
 * page draws the one row that is about it and nothing about anybody else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A LIST THEY PRESS AND NOT SOMETHING AN AGENT DID
 * ---------------------------------------------------------------------------------------
 *
 * A name is what everybody else calls somebody, and the participants door gives it to a person: an
 * agent may change its own picture and no name at all. So the long names already in the registries
 * are put to them. Each row says what the name is now, what is proposed, and why; one press applies
 * all of them, through the same PATCH any single rename goes through, as their act.
 *
 * ---------------------------------------------------------------------------------------
 * IT EMPTIES ITSELF AND THEN DRAWS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * A row appears only while that participant is registered here AND still carries a name that is not
 * the proposed one. After the press there are no rows, so the panel says there is nothing to
 * propose rather than leaving an empty frame on the page. On an installation where none of these
 * ids exist it has never had anything to say.
 */

import { useState } from 'react'
import { PROPOSED_NAMES, type ProposedName } from '@shared/participants.ts'
import { api, errorMessage, type ParticipantOnTheWire } from '../api.ts'
import { readTheChatAgain } from './Chat.tsx'
import { Absence, ErrorNote, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** What this panel says, in one place, so a screen and a test read the same words. */
export const PROPOSED_NAME_WORDS = {
  get title() { return t('g6b.names.title') },
  /** The label whose value says how many are waiting. A label with a value, not a sentence. */
  get waitingLabel() { return t('g6b.names.waitingLabel') },
  /** Its value when none are. */
  get none() { return t('g6b.names.none') },
  /**
   * The press that applies the rows.
   *
   * IT COUNTS, because the panel is drawn on one agent's page since criterion M50 and a press
   * reading "Use these names" over a single row is the plural of nothing.
   */
  applyAll: (count: number): string => t('g6b.names.apply', { n: count, count }),
  /** The mark between the name now and the name proposed. */
  get becomes() { return t('g6b.names.becomes') },
  /** How many are waiting, as a value beside the label. */
  waiting: (count: number): string => t('g6b.names.waiting', { n: count, count }),
} as const

/** One row: who it is, what they are called now, and what is proposed. */
export interface NameToChange {
  proposal: ProposedName
  now: string
}

/**
 * WHICH PROPOSALS STILL HAVE SOMETHING TO SAY, given who is registered here.
 *
 * Exported because it is the rule this panel is about and a test reads it directly. A proposal for
 * somebody this installation does not hold is not drawn, and neither is one whose name is already
 * what it proposes — so pressing twice is the same as pressing once.
 */
export function namesStillToChange(agents: readonly ParticipantOnTheWire[]): NameToChange[] {
  const held = new Map(agents.map((one) => [one.id, one]))
  return PROPOSED_NAMES.flatMap((proposal) => {
    const one = held.get(proposal.id)
    if (one === undefined || one.name === proposal.name) return []
    return [{ proposal, now: one.name }]
  })
}

export function ProposedNamesPanel({ only }: { only?: string } = {}) {
  useLanguage()
  const [reply, reload] = useProjectAsync(() => api.participants(), [])
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // NARROWED BY THE SAME RULE AND NOT BY A SECOND ONE. `namesStillToChange` decides which rows are
  // still live; `only` picks one of those rows out. A separate rule here would be the naming rule
  // written twice, and the two would disagree the first time somebody changed one.
  const everyRow = reply.status === 'ready' ? namesStillToChange(reply.value.agents) : []
  const waiting = only === undefined ? everyRow : everyRow.filter((one) => one.proposal.id === only)

  const useThem = (): void => {
    setFault(null)
    setBusy(true)
    // ONE AT A TIME THROUGH THE ONE DOOR. There is no route that renames several participants, and
    // adding one would be a second place the rules about who may name whom are decided.
    void waiting
      .reduce<Promise<unknown>>(
        (before, one) => before.then(() => api.changeParticipant('agent', one.proposal.id, { name: one.proposal.name })),
        Promise.resolve(),
      )
      .then(() => {
        setBusy(false)
        reload()
        // AND THE PANEL READS ITSELF AGAIN, because it draws these names on every row it has.
        readTheChatAgain()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault(errorMessage(err))
        // WHAT DID GO THROUGH STAYS GONE THROUGH. The list is read again so the rows that were
        // renamed disappear and the ones that were not are still there to try.
        reload()
      })
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'profile.shortname' }} title={PROPOSED_NAME_WORDS.title}>
      <style href="mole-office-proposed-names" precedence="default">
        {CSS}
      </style>
      {reply.status === 'loading' ? <p role="status">{t('g6b.loading')}</p> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {reply.status !== 'ready' ? null : (
        <p className="prn-count">
          <span className="prn-label">{PROPOSED_NAME_WORDS.waitingLabel}</span>
          <span className="prn-value">
            {waiting.length === 0 ? <Absence title={PROPOSED_NAME_WORDS.none} /> : PROPOSED_NAME_WORDS.waiting(waiting.length)}
          </span>
        </p>
      )}
      {waiting.length === 0 ? null : (
        <>
          <ul className="prn-list">
            {waiting.map((one) => (
              <li key={one.proposal.id} className="prn-row" data-agent={one.proposal.id}>
                <span className="prn-names">
                  <span className="prn-now">{one.now}</span>
                  <span className="prn-arrow" aria-hidden="true">
                    {PROPOSED_NAME_WORDS.becomes}
                  </span>
                  <span className="prn-next">{one.proposal.name}</span>
                </span>
                <span className="prn-because">{one.proposal.because}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="prn-apply" disabled={busy} onClick={useThem}>
            {PROPOSED_NAME_WORDS.applyAll(waiting.length)}
          </button>
        </>
      )}
      {fault === null ? null : (
        <p className="prn-fault" role="status">
          {fault}
        </p>
      )}
    </Panel>
  )
}

const CSS = `
.prn-count { margin: 0 0 var(--pad) 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.prn-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.prn-value { font-size: var(--fs-2); color: var(--text-2); }

.prn-list { list-style: none; margin: 0 0 var(--pad) 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }

.prn-row { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.prn-names { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; min-width: 0; font-size: var(--fs-2); }
/* WHAT IT IS CALLED NOW, drawn quieter than what it becomes: the proposal is the thing being read. */
.prn-now { color: var(--text-3); overflow-wrap: anywhere; }
.prn-arrow { color: var(--text-3); }
.prn-next { color: var(--text); font-weight: 600; }
.prn-because { font-size: var(--fs-1); color: var(--text-3); overflow-wrap: anywhere; }

.prn-apply {
  min-height: 30px;
  padding: 0 var(--pad);
  align-self: flex-start;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 600;
  cursor: pointer;
}
.prn-apply:hover { background: var(--hover); }
.prn-apply[disabled] { color: var(--text-dis); cursor: default; }

.prn-fault { margin: var(--pad) 0 0 0; font-size: var(--fs-2); color: var(--st-failed); }
`
