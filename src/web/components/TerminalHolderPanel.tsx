// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Terminal holder` — WHERE THE TERMINAL HOLDER STANDS, AND A PRESS THAT RESTARTS IT. Wave 13u, round 23
 * (src/server/lib/the-holders-restart.ts says how the office stops and starts it).
 *
 * The holder keeps running when the office restarts, so after an update it runs the old program until somebody restarts
 * it. Until round 23 only a command in a terminal could, and the person is never asked to type one (chapter 10, rule 4).
 *
 * ---------------------------------------------------------------------------------------
 * TWO PRESSES
 * ---------------------------------------------------------------------------------------
 *
 * The first press reads GET /api/terminals afresh and lists every terminal the holder holds, each by whose it is, its
 * command line and when it opened, and says which the restart ends. It stops nothing. The second, confirming press sends
 * back the holder and the terminals the list showed, so the door stops only the holder the person saw, and refuses when a
 * terminal the list did not show has opened since.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT WAS LEFT
 * ---------------------------------------------------------------------------------------
 *
 * The door answers only when a new holder answers. Every other outcome is a coded refusal whose words say what was done
 * and where the holder was left. The panel draws those words, then reads the holder again and draws where it stands now,
 * so the person sees the state as well as the account of it.
 */

import { useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import type { ListedTerminal, TheHolderRestarted } from '@shared/terminals.ts'
import { drawnStamp } from '@shared/time.ts'
import { Btn, ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { HolderSays, TERMINAL_PARTS_CSS, terminalTitle, theCommandLine } from './TerminalParts.tsx'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { theParticipantAStoredIdNames } from '../lib/participant-lookup.ts'
import { restartTheHolder, theTerminals, whatARefusalSays } from '../lib/terminals.ts'

/** The holder and its terminals as the confirming step listed them. */
interface WhatWasShown {
  pid: number
  startedAt: string | null
  terminals: ListedTerminal[]
}

type Step =
  | { kind: 'at rest' }
  | { kind: 'reading' }
  | { kind: 'confirming'; shown: WhatWasShown }
  | { kind: 'restarting'; shown: WhatWasShown }
  | { kind: 'restarted'; answer: TheHolderRestarted }
  | { kind: 'refused'; sentence: string }

export function TerminalHolderPanel() {
  useLanguage()
  const [now, readAgain] = useAsync(theTerminals, [])
  const [people] = useAsync(readParticipantsOnce, [])
  const [step, setStep] = useState<Step>({ kind: 'at rest' })
  const listHeading = useRef<HTMLParagraphElement>(null)
  const agentRows = people.status === 'ready' ? people.value.agents : []
  const agentLabel = (id: string): string => theParticipantAStoredIdNames(agentRows, id)?.name ?? id

  // THE LIST IS WHERE A KEYBOARD GOES after the first press, because it is what the confirming press is about.
  useEffect(() => {
    if (step.kind === 'confirming') listHeading.current?.focus()
  }, [step.kind])

  /** The first press: read the holder and its terminals afresh, and list them. Nothing is stopped. */
  const look = (): void => {
    setStep({ kind: 'reading' })
    theTerminals().then(
      (fresh) => {
        const holder = fresh.holder.state === 'running' ? fresh.holder : fresh.holder.state === 'unusable' ? fresh.holder.anotherCopy : undefined
        if (holder === undefined || fresh.terminals === null) {
          // THE HOLDER WENT since the panel was drawn: there is nothing to restart, and the panel says where it stands.
          setStep({ kind: 'at rest' })
          readAgain()
          return
        }
        setStep({ kind: 'confirming', shown: { pid: holder.pid, startedAt: holder.startedAt, terminals: fresh.terminals } })
      },
      (err: unknown) => {
        setStep({ kind: 'refused', sentence: whatARefusalSays(err) })
      },
    )
  }

  /** The confirming press: restart the holder that was listed, sending back what the list showed. */
  const confirm = (shown: WhatWasShown): void => {
    setStep({ kind: 'restarting', shown })
    restartTheHolder({ pid: shown.pid, startedAt: shown.startedAt, terminals: shown.terminals.map((one) => one.id) }).then(
      (answer) => {
        setStep({ kind: 'restarted', answer })
        readAgain()
      },
      (err: unknown) => {
        setStep({ kind: 'refused', sentence: whatARefusalSays(err) })
        readAgain()
      },
    )
  }

  const listing = step.kind === 'confirming' || step.kind === 'restarting' ? step.shown : null
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.terminalholder' }} title={t('settingsPanel.title.terminalholder')}>
      <style href="mole-office-terminal-holder" precedence="default">
        {TERMINAL_PARTS_CSS + TERMINAL_HOLDER_CSS}
      </style>
      <div className="th">
        {step.kind === 'restarted' ? <TheRestart answer={step.answer} /> : null}
        {step.kind === 'refused' ? (
          <p className="th-refuse" role="alert" data-testid="terminal-holder-refused">
            {step.sentence}
          </p>
        ) : null}

        {now.status === 'loading' ? <Loading what={t('terminalHolder.loading')} /> : null}
        {now.status === 'error' ? <ErrorNote message={now.message} fault={now.fault} retry={readAgain} /> : null}
        {now.status === 'ready' ? (
          <section className="th-now" aria-label={t('terminalHolder.now')} data-testid="terminal-holder-now">
            {step.kind === 'refused' ? <p className="th-key">{t('terminalHolder.now')}</p> : null}
            {now.value.holder.state === 'running' ? (
              <div className="tm-holder tm-holder-running">
                <p className="tm-holder-line">
                  {t('terminals.holder.running')}
                  {now.value.holder.startedAt === null ? null : ` ${t('terminalHolder.startedAt', { at: drawnStamp(now.value.holder.startedAt) })}`}
                </p>
                <details className="tm-dev">
                  <summary>{t('terminals.developers')}</summary>
                  <dl className="tm-holder-why">
                    <div>
                      <dt>{t('terminals.dev.process')}</dt>
                      <dd className="tm-mono num">{now.value.holder.pid}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            ) : now.value.holder.state === 'unusable' && now.value.holder.anotherCopy !== undefined ? (
              <p className="th-state" data-testid="terminal-holder-another-copy">{t('terminalHolder.heldByCopy', { copy: now.value.holder.anotherCopy.copy })}</p>
            ) : (
              <HolderSays holder={now.value.holder} onChanged={readAgain} />
            )}
          </section>
        ) : null}

        {listing === null ? (
          now.status === 'ready' && (now.value.holder.state === 'running' || (now.value.holder.state === 'unusable' && now.value.holder.anotherCopy !== undefined)) ? (
            <div className="th-presses">
              <Btn size="sm" onClick={look} pending={step.kind === 'reading'}>
                {step.kind === 'reading' ? t('terminalHolder.reading') : t(settingsControlWord('settings.terminalholder', 'terminalHolder.restart'))}
              </Btn>
            </div>
          ) : null
        ) : (
          <section className="th-ask" aria-label={t('terminalHolder.willEnd', { n: listing.terminals.length })} data-testid="terminal-holder-confirm">
            {listing.terminals.length === 0 ? (
              <p className="th-key" ref={listHeading} tabIndex={-1}>
                {t('terminalHolder.endsNone')}
              </p>
            ) : (
              <>
                <p className="th-key" ref={listHeading} tabIndex={-1}>
                  {t('terminalHolder.willEnd', { n: listing.terminals.length })}
                </p>
                <ul className="th-list">
                  {listing.terminals.map((one) => (
                    <li key={one.id} className="th-row">
                      <p className="th-row-title">{terminalTitle(one, agentLabel)}</p>
                      <p className="th-row-state" data-state={one.state}>
                        {one.state === 'running' ? t('terminalHolder.rowState.running') : t('terminalHolder.rowState.ended')}
                      </p>
                      <dl className="th-row-facts">
                        <div>
                          <dt>{t('terminals.col.command')}</dt>
                          <dd className="tm-mono">{theCommandLine(one)}</dd>
                        </div>
                        <div>
                          <dt>{t('terminals.col.opened')}</dt>
                          <dd>{drawnStamp(one.openedAt)}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="th-presses">
              <TheConfirmingPress shown={listing} restarting={step.kind === 'restarting'} onPress={() => confirm(listing)} />
              {step.kind === 'restarting' ? null : (
                <Btn size="sm" variant="ghost" onClick={() => setStep({ kind: 'at rest' })}>
                  {t(settingsControlWord('settings.terminalholder', 'terminalHolder.cancel'))}
                </Btn>
              )}
            </div>
            {step.kind === 'restarting' ? (
              <p className="th-state" role="status">
                {t('settingsState.restarting')}
              </p>
            ) : null}
          </section>
        )}
      </div>
    </Panel>
  )
}

/** The press that restarts, worded by how many running terminals it ends. */
function TheConfirmingPress({ shown, restarting, onPress }: { shown: WhatWasShown; restarting: boolean; onPress: () => void }) {
  const running = shown.terminals.filter((one) => one.state === 'running').length
  return (
    <Btn size="sm" variant="danger" onClick={onPress} pending={restarting}>
      {running === 0 ? t(settingsControlWord('settings.terminalholder', 'terminalHolder.confirmNone')) : t(settingsControlWord('settings.terminalholder', 'terminalHolder.confirm'), { n: running })}
    </Btn>
  )
}

/** What a restart that came back did: how many terminals it ended, and the old holder's own last line. */
function TheRestart({ answer }: { answer: TheHolderRestarted }) {
  return (
    <section className="th-done" role="status" data-testid="terminal-holder-restarted">
      <p className="th-key">{answer.ended === 0 ? t('terminalHolder.restartedNone') : t('terminalHolder.restartedEnded', { n: answer.ended })}</p>
      <dl className="tm-holder-why">
        <div>
          <dt>{t('terminalHolder.oldLastWord')}</dt>
          <dd className="tm-mono">{answer.itsLastWord ?? t('absence.none')}</dd>
        </div>
      </dl>
      {/* THE PROCESS NUMBERS ARE FOR DEVELOPERS, behind their fold, as on the terminal pages. */}
      <details className="tm-dev">
        <summary>{t('terminals.developers')}</summary>
        <dl className="tm-holder-why">
          <div>
            <dt>{t('terminalHolder.dev.oldProcess')}</dt>
            <dd className="tm-mono num">{answer.stopped.pid}</dd>
          </div>
          {answer.holder.state === 'running' ? (
            <div>
              <dt>{t('terminalHolder.dev.newProcess')}</dt>
              <dd className="tm-mono num">{answer.holder.pid}</dd>
            </div>
          ) : null}
        </dl>
      </details>
    </section>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else. */
const TERMINAL_HOLDER_CSS = `
.th { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text); }
.th-state { margin: 0; max-width: var(--measure-in-box); color: var(--text-2); overflow-wrap: anywhere; }
.th-key { margin: 0; max-width: var(--measure-in-box); font-weight: 600; line-height: var(--lh-tight); color: var(--text); overflow-wrap: anywhere; }
.th-key:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.th-now, .th-done { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; }
.th-now .tm-holder { margin: 0; }
.th-done {
  max-width: var(--measure-in-box); padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel-2);
}
.th-ask {
  display: flex; flex-direction: column; gap: var(--pad); min-width: 0; max-width: var(--measure-in-box); padding: var(--pad);
  border: var(--border-w) solid var(--st-failed-line); border-left-width: var(--rail); border-radius: var(--radius-sm);
}
.th-list { list-style: none; margin: 0; padding: 0; display: grid; gap: calc(var(--pad) / 2); min-width: 0; }
.th-row { display: grid; gap: 2px; min-width: 0; padding: calc(var(--pad) / 2) var(--pad); background: var(--panel-2); border-radius: var(--radius-sm); }
.th-row-title { margin: 0; font-weight: 600; line-height: var(--lh-tight); color: var(--text); overflow-wrap: anywhere; }
.th-row-state { margin: 0; color: var(--text-2); }
.th-row-state[data-state="running"] { color: var(--st-failed); }
.th-row-facts { margin: 0; display: grid; gap: 2px; min-width: 0; }
.th-row-facts > div { display: flex; flex-wrap: wrap; gap: 0 0.5em; min-width: 0; }
.th-row-facts dt { color: var(--text-2); font-size: 0.9em; }
.th-row-facts dd { margin: 0; min-width: 0; color: var(--text); overflow-wrap: anywhere; }
.th-presses { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.th-refuse {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  line-height: var(--lh-tight); overflow-wrap: anywhere;
}
`
