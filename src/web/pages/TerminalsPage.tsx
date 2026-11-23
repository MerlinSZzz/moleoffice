// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TERMINAL MANAGEMENT: EVERY TERMINAL THE OFFICE HOLDS, FOR DEVELOPERS. Wave 13u, round 2.
 *
 * The owner's review of the design (point a of a decision; design report 6NVaDzG7tyUB, block b-6): a
 * page for developers that lists every terminal the office calls, lets a person search and filter
 * them, and opens one when needed. It sits in the Developer group of the rail,
 * at #/terminals.
 *
 * WHAT IT SHOWS. Where the terminal holder stands (src/web/components/TerminalParts.tsx draws a holder
 * that is not running with the office's sentence and the holder's own last line), then one row per
 * terminal: who opened it, the agent working in it, its project, command and folder, when it opened and
 * whether it runs or has ended. Pressing a row opens that terminal below the list: its screen as it is
 * now, then its output as it comes (src/web/components/TerminalView.tsx). Only one terminal is open at a
 * time, because each open terminal holds one of the browser's few connections to the office.
 *
 * A PLAIN TERMINAL (wave 13u, round 7): one press opens the person's shell in their home folder, and a second, behind a fold, in a
 * folder they write. The server names the folder it used, and the new terminal opens where its row is.
 *
 * NOTHING IS DRAWN AS A DASH (round 7): no terminal, and no terminal through the filters, are each said in a sentence a person
 * can read, not a dash with the sentence in its tooltip.
 *
 * THE FILTERS ARE BEHIND A PRESS, as on the Messages page: a page at rest shows no boxes
 * (tests/read-before-edit.test.ts). They narrow by words in the command or folder, by agent, project,
 * state and when the terminal opened.
 */

import { useMemo, useState } from 'react'
import { drawnStamp } from '@shared/time.ts'
import { t } from '@shared/i18n.ts'
import { NO_FILTERS, theTerminalsShown, type TerminalFilters, type ListedTerminal } from '@shared/terminals.ts'
import { Absence, Btn, ErrorNote, Field, Loading, Select, TextInput } from '../components/ui.tsx'
import { AgentPicker, type AnAgentToPick } from '../components/agent/AgentPicker.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { HolderSays, TERMINAL_PARTS_CSS, terminalStateWord, terminalTitle, theCommandLine } from '../components/TerminalParts.tsx'
import { TerminalView } from '../components/TerminalView.tsx'
import { InstallHarnesses } from '../components/InstallHarnesses.tsx'
import { StartAtLogin } from '../components/StartAtLogin.tsx'
import { ParticipantName } from './NotebookPage.tsx'
import { ProjectName, useProjectTitles } from '../components/ProjectChoice.tsx'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { theParticipantAStoredIdNames } from '../lib/participant-lookup.ts'
import { openAShell, theTerminals, whatARefusalSays } from '../lib/terminals.ts'

export function TerminalsPage(): React.ReactElement {
  useLanguage()
  // WHERE THE HOLDER STANDS, read again when the office says a holder ended or a new one answered, at most once in 2
  // seconds (src/web/lib/record-changes.ts), so its end and a new start show without a reload (wave 13y round 147).
  const [reply, readAgain] = useProjectAsync(theTerminals, [], { follows: { lists: ['terminals'], atMostEveryMs: 2_000 } })
  return (
    <div className="page tm">
      <style href="mole-office-terminals-page" precedence="default">
        {TERMINAL_PARTS_CSS + TERMINALS_PAGE_CSS}
      </style>
      <h1 className="tm-title">{t('nav.terminals')}</h1>
      {reply.status === 'loading' ? <Loading what={t('nav.terminals')} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} label={t('terminals.refused')} retry={readAgain} /> : null}
      {reply.status === 'ready' ? (
        <>
          <HolderSays holder={reply.value.holder} onChanged={readAgain} />
          {reply.value.terminals === null ? null : <TheTerminals all={reply.value.terminals} onChanged={readAgain} />}
        </>
      ) : null}
      <InstallHarnesses onOpened={readAgain} />
      <StartAtLogin />
    </div>
  )
}

function TheTerminals({ all, onChanged }: { all: ListedTerminal[]; onChanged: () => void }): React.ReactElement {
  const [filters, setFilters] = useState<TerminalFilters>(NO_FILTERS)
  const [open, setOpen] = useState<string | null>(null)
  const set = <K extends keyof TerminalFilters>(key: K) => (value: TerminalFilters[K]) => setFilters((was) => ({ ...was, [key]: value }))
  const shown = useMemo(() => theTerminalsShown(all, filters, new Date()), [all, filters])
  const agents = [...new Set(all.flatMap((one) => (one.agent === null ? [] : [one.agent.id])))]
  const [people] = useProjectAsync(readParticipantsOnce, [])
  const agentRows = people.status === 'ready' ? people.value.agents : []
  // A DEVELOPER PAGE: an agent this office cannot name is shown by its id rather than hidden.
  const agentLabel = (id: string): string => theParticipantAStoredIdNames(agentRows, id)?.name ?? id
  // THE AGENT FILTER OFFERS THE AGENTS ON THESE TERMINALS, each handed back as the id its terminal stores. A stored id
  // the registry names is joined to that agent, so the picker draws its name and handle; one it does not name is drawn
  // by its id.
  const agentChoices: AnAgentToPick[] = agents.map((stored) => ({ kind: 'agent', id: theParticipantAStoredIdNames(agentRows, stored)?.id ?? stored, value: stored }))
  const projects = [...new Set(all.map((one) => one.project))].sort()
  const hiding = all.length - shown.length
  const projectTitles = useProjectTitles()
  const titleOf = (one: ListedTerminal): string => terminalTitle(one, agentLabel)

  const opened = (id: string): void => {
    setFilters(NO_FILTERS)
    setOpen(id)
    onChanged()
  }
  if (all.length === 0) {
    return (
      <>
        <OpenAShell onOpened={opened} />
        <p className="tm-none">{t('terminals.noneOpen')}</p>
      </>
    )
  }
  return (
    <section className="tm-list">
      <OpenAShell onOpened={opened} />
      <details className="tm-narrow">
        <summary className="tm-narrow-open">{t('terminals.filters')}</summary>
        <div className="tm-filters">
          <Field label={t('terminals.filter.words')}>
            <TextInput value={filters.words} onChange={set('words')} />
          </Field>
          <AgentPicker
            label={t('terminals.filter.agent')}
            candidates={agentChoices}
            chosen={filters.agent}
            onChoose={set('agent')}
            fixed={[
              { value: '', name: t('terminals.filter.any') },
              { value: 'none', name: t('terminals.agent.none') },
            ]}
          />
          <Field label={t('terminals.filter.project')}>
            <Select value={filters.project} onChange={set('project')} options={[{ value: '', label: t('terminals.filter.any') }, ...projects.map((p) => ({ value: p, label: p }))]} />
          </Field>
          <Field label={t('terminals.filter.state')}>
            <Select<TerminalFilters['state']>
              value={filters.state}
              onChange={set('state')}
              options={[
                { value: '', label: t('terminals.filter.any') },
                { value: 'running', label: t('terminals.state.running') },
                { value: 'ended', label: t('terminals.state.endedNoCode') },
              ]}
            />
          </Field>
          <Field label={t('terminals.filter.time')}>
            <Select<TerminalFilters['time']>
              value={filters.time}
              onChange={set('time')}
              options={[
                { value: '', label: t('terminals.filter.any') },
                { value: 'hour', label: t('terminals.filter.lastHour') },
                { value: 'today', label: t('terminals.filter.today') },
                { value: 'week', label: t('terminals.filter.week') },
              ]}
            />
          </Field>
        </div>
      </details>
      {hiding > 0 ? (
        <p className="tm-hiding">
          {t('terminals.hiding', { n: hiding })}{' '}
          <button type="button" className="tm-clear" onClick={() => setFilters(NO_FILTERS)}>
            {t('terminals.clear')}
          </button>
        </p>
      ) : null}
      {shown.length === 0 ? <p className="tm-none">{t('terminals.noneMatch')}</p> : null}
      <ul className="tm-rows">
        {shown.map((one) => (
          <li key={one.id} className="tm-row" data-open={one.id === open ? '1' : undefined}>
            {/* A PLAIN TITLE (the review of round 2, point 3): whose terminal it is, not its command line. */}
            <button type="button" className="tm-row-press" aria-label={t('terminals.open')} aria-expanded={one.id === open} onClick={() => setOpen(one.id === open ? null : one.id)}>
              <span className="tm-row-title">{titleOf(one)}</span>
              <span className="tm-row-state" data-state={one.state}>{terminalStateWord(one)}</span>
            </button>
            <dl className="tm-row-facts">
              <div><dt>{t('terminals.col.who')}</dt><dd>{one.who === null ? <Absence /> : one.who.kind === 'person' ? t('terminals.who.you') : <ParticipantName kind={one.who.kind} id={one.who.id} />}</dd></div>
              <div><dt>{t('terminals.col.agent')}</dt><dd>{one.agent === null ? t('terminals.agent.none') : <ParticipantName kind="agent" id={one.agent.id} />}</dd></div>
              {/* THE PROJECT BY ITS NAME, as the sidebar names it (point 4). */}
              <div><dt>{t('terminals.col.project')}</dt><dd><ProjectName id={one.project} titles={projectTitles} /></dd></div>
              <div className="tm-row-folder"><dt>{t('terminals.col.command')}</dt><dd className="tm-mono">{theCommandLine(one)}</dd></div>
              <div className="tm-row-folder"><dt>{t('terminals.col.folder')}</dt><dd className="tm-mono">{one.folder}</dd></div>
              <div><dt>{t('terminals.col.opened')}</dt><dd>{drawnStamp(one.openedAt)}</dd></div>
            </dl>
            {/* THE NUMBERS ARE FOR DEVELOPERS, behind their fold (point 7). */}
            <details className="tm-dev tm-row-dev">
              <summary>{t('terminals.developers')}</summary>
              <dl className="tm-row-facts">
                <div><dt>{t('terminals.dev.process')}</dt><dd className="tm-mono num">{one.pid}</dd></div>
                {one.exit === null ? null : <div><dt>{t('terminals.dev.exit')}</dt><dd className="tm-mono num">{one.exit.signal ? t('pageWords.TerminalsPage.expression01', { value1: String(String(one.exit.code)), value2: String(String(one.exit.signal)) }) : one.exit.code}</dd></div>}
                <div><dt>{t('terminals.dev.size')}</dt><dd className="num">{t('terminals.view.size', { cols: one.cols, rows: one.rows })}</dd></div>
                <div className="tm-row-folder"><dt>{t('terminals.dev.id')}</dt><dd className="tm-mono">{one.id}</dd></div>
              </dl>
            </details>
            {/* OPENED WHERE IT WAS PRESSED (point 6), not under the whole list, where at 390 it began far below. */}
            {one.id === open ? (
              <TerminalView
                key={one.id}
                terminal={one}
                onPutAway={() => setOpen(null)}
                onClosed={() => {
                  setOpen(null)
                  onChanged()
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The person's shell in a terminal: in their home folder, or in a folder they write. A refusal is said with the server's sentence. */
function OpenAShell({ onOpened }: { onOpened: (id: string) => void }): React.ReactElement {
  const [folder, setFolder] = useState('')
  const [opening, setOpening] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const openIt = (where: 'home' | 'there'): void => {
    setOpening(true)
    setRefused(null)
    openAShell(where === 'home' ? undefined : folder.trim()).then(
      (answer) => {
        setOpening(false)
        onOpened(answer.terminal.id)
      },
      (err: unknown) => {
        setOpening(false)
        setRefused(whatARefusalSays(err))
      },
    )
  }
  return (
    <div className="tm-open">
      <Btn size="sm" variant="primary" onClick={() => openIt('home')} pending={opening}>
        {t('terminals.shell.openHome')}
      </Btn>
      <details className="tm-open-elsewhere">
        <summary className="tm-open-fold">{t('terminals.shell.elsewhere')}</summary>
        <div className="tm-open-there">
          <Field label={t('terminals.shell.folder')}>
            <TextInput value={folder} onChange={setFolder} mono />
          </Field>
          <Btn size="sm" onClick={() => openIt('there')} pending={opening} disabled={folder.trim() === ''} reason={t('terminals.shell.writeAFolder')}>
            {t('terminals.shell.openThere')}
          </Btn>
        </div>
      </details>
      {refused === null ? null : (
        <p className="tm-open-refused" role="alert">
          {t('terminals.shell.refused')} {refused}
        </p>
      )}
    </div>
  )
}

const TERMINALS_PAGE_CSS = `
.tm-open { display: grid; gap: 0.5rem; justify-items: start; margin: 0 0 var(--pad) 0; }
.tm-open-there { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem var(--pad); margin-top: 0.5rem; }
.tm-open-elsewhere { justify-self: stretch; min-width: 0; }
.tm-open-there > :first-child { flex: 1 1 18rem; min-width: 0; max-width: 40rem; }
.tm-open-refused { margin: 0; color: var(--text); overflow-wrap: anywhere; }
.tm-none { margin: 0 0 var(--pad) 0; color: var(--text-2); }
.tm > .px-error { margin: 0 0 var(--pad) 0; }
.tm { max-width: 72rem; }
.tm-title { margin: 0 0 0.25em 0; }
.tm-narrow { margin: 0 0 var(--pad) 0; }
.tm-narrow-open, .tm-open-fold { cursor: pointer; color: var(--text-2); }
.tm-narrow-open:focus-visible, .tm-open-fold:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }
.tm-filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--pad); margin-top: var(--pad); }
.tm-filters .agp { grid-column: 1 / -1; }
.tm-hiding { color: var(--text-2); margin: 0 0 var(--pad) 0; }
.tm-clear { border: 1px solid var(--border-strong); border-radius: 0.25rem; background: none; color: var(--text); padding: 0.1rem 0.4rem; cursor: pointer; font: inherit; }
.tm-rows { list-style: none; margin: 0 0 var(--pad) 0; padding: 0; display: grid; gap: 0.5rem; }
.tm-row { border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); min-width: 0; }
.tm-row[data-open='1'] { border-color: var(--accent); }
.tm-row-press {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.5rem;
  width: 100%; padding: 0.6rem var(--pad); background: none; border: none; text-align: start;
  color: var(--text); font: inherit; cursor: pointer; min-width: 0;
}
.tm-row-title { font-weight: 600; min-width: 0; }
.tm-row-dev { padding: 0 var(--pad) 0.6rem var(--pad); }
.tm-row .tm-view { margin: 0 var(--pad) var(--pad) var(--pad); }
.tm-row-state { color: var(--text-2); white-space: nowrap; }
.tm-row-state[data-state='running'] { color: var(--text); font-weight: 600; }
.tm-row-facts {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.25rem var(--pad);
  margin: 0; padding: 0 var(--pad) 0.6rem var(--pad);
}
.tm-row-facts dt { color: var(--text-3); font-size: 0.85em; }
.tm-row-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.tm-row-facts .tm-row-folder { grid-column: span 2; }
@media (max-width: 40rem) { .tm-row-facts .tm-row-folder { grid-column: auto; } }
`
