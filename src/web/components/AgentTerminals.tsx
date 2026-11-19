// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S TERMINALS, ON ITS PROFILE PAGE. Wave 13u, round 2.
 *
 * As point a of the owner's review of the design says, an agent's ordinary terminal entry, and the terminals it
 * summoned, sit on its own profile page, beside who it is, its project and whether it works or
 * idles. So this panel shows two things from GET /api/terminals: its own terminal, the
 * one it works in, and the terminals it opened. Pressing one opens it here, with the same view as Terminal
 * management. Each terminal is listed once: a terminal the agent works in is its own, and "Terminals it opened"
 * holds only those it opened and does not work in (the review of round 2, point 5). Each row names its project
 * by the project's name, as the sidebar does.
 *
 * OPEN IN A TERMINAL (wave 13u, round 3): the person's press opens this agent in a terminal the office holds, in
 * its recorded start folder (POST /api/terminals/agents), and the view opens here at once. A refused press is said
 * in the page's language. An agent opened without a key of its own is said too, because its waiter cannot hold its
 * handle until it has one.
 *
 * A VIEW OF ITS TMUX PANE (round 11) names the agent too, but the agent does not work in it, so views are listed under
 * their own heading and never as its own terminal.
 *
 * Where the holder does not run, the panel says so with the holder's own words, as Terminal management
 * does: an agent with no terminal and an office with no holder are different answers.
 *
 * The list door is the person's only, so another reader gets the door's own refusal here.
 */

import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { theAgentsTerminals, type ListedTerminal } from '@shared/terminals.ts'
import { Absence, Btn, ErrorNote, Loading, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { HolderSays, TERMINAL_PARTS_CSS, terminalStateWord, theCommandLine } from './TerminalParts.tsx'
import { TerminalView } from './TerminalView.tsx'
import { pathFor, RouteLink } from './router.tsx'
import { useLanguage } from '../lib/language.ts'
import { nameOfProject, useProjects } from '../lib/projectlist.ts'
import { openTheAgentInATerminal, theTerminals, whatARefusalSays } from '../lib/terminals.ts'

export function AgentTerminals({ agentId }: { agentId: string }): React.ReactElement {
  useLanguage()
  const [reply, readAgain] = useProjectAsync(theTerminals, [agentId])
  const [open, setOpen] = useState<string | null>(null)
  const projects = useProjects()
  // THE OPEN PRESS: whether it is out, the sentence of a refusal, and whether the agent it opened was given no key.
  const [opening, setOpening] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [openedWithoutAKey, setOpenedWithoutAKey] = useState(false)
  const openIt = async (): Promise<void> => {
    setOpening(true)
    setRefused(null)
    setOpenedWithoutAKey(false)
    try {
      const opened = await openTheAgentInATerminal(agentId)
      setOpenedWithoutAKey(!opened.key.given)
      setOpen(opened.terminal.id)
      readAgain()
    } catch (err) {
      setRefused(whatARefusalSays(err))
    } finally {
      setOpening(false)
    }
  }

  const body = (() => {
    if (reply.status === 'loading') return <Loading what={t('terminals.profile.heading')} rows={1} />
    if (reply.status === 'error') return <ErrorNote message={reply.message} fault={reply.fault} label={t('terminals.refused')} retry={readAgain} />
    const { holder, terminals } = reply.value
    // A START OR A LOOK AGAIN READS THE LIST AGAIN (round 109), so a press shows what it did.
    if (terminals === null) return <HolderSays holder={holder} onChanged={readAgain} />
    const { own, views, opened } = theAgentsTerminals(terminals, agentId)
    const theOpenOne = [...own, ...views, ...opened].find((one) => one.id === open) ?? null
    const rows = (list: ListedTerminal[], none: string, said = false) =>
      list.length === 0 ? (
        <p className="tm-prof-none"><Absence tier="ordinary" title={none} say={said} /></p>
      ) : (
        <ul className="tm-prof-rows">
          {list.map((one) => (
            <li key={one.id}>
              <button type="button" className="tm-prof-press" aria-label={t('terminals.open')} aria-expanded={one.id === open} onClick={() => setOpen(one.id === open ? null : one.id)}>
                <span className="tm-mono">{theCommandLine(one)}</span>
                <span className="tm-prof-project" title={t('terminals.col.project')}>{content(nameOfProject(projects, one.project))}</span>
                <span className="tm-prof-state">{terminalStateWord(one)}</span>
              </button>
            </li>
          ))}
        </ul>
      )
    return (
      <>
        <div className="tm-prof-open">
          <Btn size="sm" onClick={() => void openIt()} pending={opening}>
            {t('terminals.agent.openPress')}
          </Btn>
          {opening ? <span className="tm-prof-note">{t('terminals.agent.opening')}</span> : null}
        </div>
        {refused === null ? null : (
          <p className="tm-prof-note" role="alert">
            {t('terminals.agent.openRefused')} {refused}
          </p>
        )}
        {openedWithoutAKey ? <p className="tm-prof-note" role="status">{t('terminals.agent.noKey')}</p> : null}
        <h3 className="tm-prof-sub">{t('terminals.profile.own')}</h3>
        {/* SAID, NOT A DASH (round 109): an agent in a terminal the person opened is not listed, and the page says so. */}
        {rows(own, t('terminals.profile.noOwn'), true)}
        {/* A VIEW OF ITS PANE IS NOT ITS OWN TERMINAL (round 11), and is listed only when one is held. */}
        {views.length === 0 ? null : (
          <>
            <h3 className="tm-prof-sub">{t('terminals.profile.views')}</h3>
            {rows(views, '')}
          </>
        )}
        <h3 className="tm-prof-sub">{t('terminals.profile.summoned')}</h3>
        {rows(opened, t('terminals.profile.noSummoned'))}
        {theOpenOne === null ? null : (
          <TerminalView
            key={theOpenOne.id}
            terminal={theOpenOne}
            onPutAway={() => setOpen(null)}
            onClosed={() => {
              setOpen(null)
              readAgain()
            }}
          />
        )}
      </>
    )
  })()

  return (
    <Panel declares={{ surface: 'profile.terminals' }} titleIs="label" title={t('terminals.profile.heading')}>
      <style href="mole-office-agent-terminals" precedence="default">
        {TERMINAL_PARTS_CSS + AGENT_TERMINALS_CSS}
      </style>
      {body}
      <p className="tm-prof-all">
        <RouteLink to={pathFor('terminals')}>{t('terminals.profile.allTerminals')}</RouteLink>
      </p>
    </Panel>
  )
}

const AGENT_TERMINALS_CSS = `
.tm-prof-sub { font-size: 0.95em; margin: 0.75em 0 0.25em 0; color: var(--text-2); font-weight: 600; }
.tm-prof-none { margin: 0; }
.tm-prof-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
.tm-prof-press {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; width: 100%;
  padding: 0.4rem 0.6rem; background: var(--panel-2); border: var(--border-w, 1px) solid var(--border);
  border-radius: var(--radius-sm); color: var(--text); font: inherit; text-align: start; cursor: pointer; min-width: 0;
}
.tm-prof-state { color: var(--text-2); white-space: nowrap; }
.tm-prof-project { color: var(--text-2); }
.tm-prof-open { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.25em 0 0.5em 0; }
.tm-prof-note { margin: 0.25em 0; color: var(--text-2); }
.tm-prof-all { margin: 0.75em 0 0 0; }
`
