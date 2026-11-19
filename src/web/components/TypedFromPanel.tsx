// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE TYPING INTO A TERMINAL CAME FROM. Point (d) of a decision, wave 13u round 14.
 *
 * Under a terminal's view: one row per run of typing from one source, newest first, as the stream sends them
 * (lib/terminal-typed-from.ts on the server). Each row says its level first, in the owner's two levels: this computer
 * with the account is the safest, another computer with the key is the next. Then the machine, read the way the chat
 * reads where a message was written (`whereItWasWrittenReads`), how the account was proved, and how many inputs came
 * and when. The office keeps these in memory, so the panel says since when, and that typing before then was not
 * recorded; it never draws an empty list as if nobody had typed.
 *
 * THE THIRD LEVEL, `an agent's ask` (wave 13u round 21), is not the person typing: the office typed an input from the
 * owner's quick-input list because the agent asked for it with its own run's key. Such a run has no machine, so its row
 * says which agent asked (its handle, or the account id when the registry held no handle) and how that was proved.
 * It never takes the words of a computer, and never says nobody could tell which machine.
 *
 * THE FOURTH LEVEL, `a secretary` (wave 13s round 83), is not the person typing either: a secretary typed one whole line
 * for the person, under the person's grant or with the owner's written words for that line. Its row says which
 * secretary typed and whether its own key proved it, and, like an agent's ask, it has no machine.
 */

import { t, type WordKey } from '@shared/i18n.ts'
import { whereItWasWrittenReads } from '@shared/messages.ts'
import type { TypedFrom, TypedFromLevel, TypedFromRun } from '@shared/terminals.ts'
import { stampToTheMinute } from '../lib/minute.ts'

/** The machine of one run, as a message's origin reads, or a sentence saying nobody could tell. */
function theMachine(run: TypedFromRun): string {
  if (run.machine === null && run.program === null) return t('terminals.typedFrom.machineUnknown')
  return whereItWasWrittenReads({ machine: run.machine, how: run.how, program: run.program })
}

/** The words of a run's level. */
const LEVEL_WORD: Record<TypedFromLevel, WordKey> = {
  'this computer': 'terminals.typedFrom.level.thisComputer',
  'another computer': 'terminals.typedFrom.level.anotherComputer',
  "an agent's ask": 'terminals.typedFrom.level.agentAsk',
  'a secretary': 'terminals.typedFrom.level.secretary',
}

/** Where a run was typed from and how that was proved: the agent for an agent's ask or a secretary, otherwise the machine. */
function theSource(run: TypedFromRun): string {
  if (run.level === "an agent's ask") {
    return `${t('terminals.typedFrom.agentAsk.who', { agent: run.agentHandle ?? run.account.id })} · ${t('terminals.typedFrom.proof.runKey')}`
  }
  if (run.level === 'a secretary') {
    return `${t('terminals.typedFrom.secretary.who', { agent: run.agentHandle ?? run.account.id })} · ${theProof(run)}`
  }
  return `${theMachine(run)} · ${theProof(run)}`
}

/** How the account of one run was proved. */
function theProof(run: TypedFromRun): string {
  if (run.account.proof === "a device's key") return t('terminals.typedFrom.proof.device', { device: run.account.device ?? '' })
  if (run.account.proof === "the person's key") return t('terminals.typedFrom.proof.key')
  if (run.account.proof === "the secretary's own key") return t('terminals.typedFrom.proof.secretaryKey')
  if (run.account.proof === "the secretary's name, with no key") return t('terminals.typedFrom.proof.secretaryNoKey')
  return t('terminals.typedFrom.proof.noKey')
}

export function TypedFromPanel({ typedFrom }: { typedFrom: TypedFrom }): React.ReactElement {
  const newestFirst = [...typedFrom.runs].reverse()
  return (
    <section className="tm-typed-from" aria-label={t('terminals.typedFrom.heading')}>
      <style href="mole-office-typed-from" precedence="default">
        {TYPED_FROM_CSS}
      </style>
      {/* THE HEADING AND THE SENTENCE ARE TWO PIECES, the sentence in a paragraph below the heading. One paragraph
          holding both read as one line (wave 13u round 31); the words are unchanged. */}
      <p className="tm-typed-from-head">
        <strong>{t('terminals.typedFrom.heading')}</strong>
      </p>
      <p className="tm-typed-from-only-you">{t('terminals.typedFrom.onlyYou')}</p>
      <p className="tm-typed-from-since">{t('terminals.typedFrom.since', { at: stampToTheMinute(typedFrom.since) })}</p>
      {newestFirst.length === 0 ? (
        <p className="tm-typed-from-none">{t('terminals.typedFrom.none')}</p>
      ) : (
        <ol className="tm-typed-from-runs">
          {newestFirst.map((run) => (
            <li key={`${run.firstAt}-${run.level}-${run.machine ?? ''}-${run.account.device ?? ''}`} className="tm-typed-from-run" data-level={run.level}>
              <span className="tm-typed-from-level">{t(LEVEL_WORD[run.level])}</span>
              <span className="tm-typed-from-where">{theSource(run)}</span>
              <span className="tm-typed-from-count num">
                {t('terminals.typedFrom.inputs', { count: run.inputs, first: stampToTheMinute(run.firstAt), last: stampToTheMinute(run.lastAt) })}
              </span>
            </li>
          ))}
        </ol>
      )}
      {typedFrom.forgotten === 0 ? null : <p className="tm-typed-from-since">{t('terminals.typedFrom.forgotten', { count: typedFrom.forgotten })}</p>}
    </section>
  )
}

export const TYPED_FROM_CSS = `
.tm-typed-from { display: grid; gap: 0.35rem; min-width: 0; }
.tm-typed-from p { margin: 0; }
.tm-typed-from-head { color: var(--text); overflow-wrap: anywhere; }
.tm-typed-from-only-you { color: var(--text-2); overflow-wrap: anywhere; }
.tm-typed-from-since, .tm-typed-from-none { color: var(--text-2); font-size: 0.9em; overflow-wrap: anywhere; }
.tm-typed-from-runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
.tm-typed-from-run {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
  padding: 0.3rem 0.5rem;
  border-inline-start: 0.25rem solid var(--st-done, var(--accent));
  background: var(--panel-2);
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
}
.tm-typed-from-run[data-level='another computer'] { border-inline-start-color: var(--st-overdue, var(--text-2)); }
.tm-typed-from-run[data-level="an agent's ask"] { border-inline-start-color: var(--st-doing, var(--text-2)); }
.tm-typed-from-run[data-level='a secretary'] { border-inline-start-color: var(--st-running, var(--text-2)); }
.tm-typed-from-level { font-weight: 600; color: var(--text); }
.tm-typed-from-where { color: var(--text); }
.tm-typed-from-count { color: var(--text-2); font-size: 0.9em; }
`
