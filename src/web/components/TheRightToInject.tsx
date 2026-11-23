// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { ParticipantName } from '../pages/NotebookPage.tsx'
/**
 * WHETHER AGENTS MAY INJECT, AND HOW MANY INJECTED MESSAGES A PERSON HAS BEEN SENT.
 *
 * Criterion M84, settling proposal `W3FHvHM-apiL`:
 * A press that happens once, and it must not be abused. And criterion
 * M91, settled by a decision: the switch is one for every agent, on the
 * Settings page, and the profile shows the count.
 *
 * TWO HALVES, ON TWO KINDS OF PAGE, and each is drawn only where it means something.
 *
 * ON AN AGENT'S PAGE: whether agents may inject, and that the switch is on the Settings page. There
 * is no press here. The switch is one for every agent, so a press on one agent's page would read
 * as a choice about that agent alone, which it is not.
 *
 * ON A PERSON'S PAGE: how many messages each sender has injected to them, and how many of those are
 * still unread. A person may inject without limit, so there is no right to draw on their page —
 * what a person needs there is the count, which is the thing that says whether this is being abused.
 */

// THE ONE SPELLING OF A PARTICIPANT KEY in this product. A second one written here would be a
// second spelling of one fact, and the machine-word gate caught exactly that.
import { participantKey } from '@shared/messages.ts'

import { type ProfileReply } from '../api.ts'
import { pathFor, RouteLink } from './router.tsx'
import { Absence, Panel } from './ui.tsx'

/**
 * WHETHER AGENTS MAY INJECT, ON AN AGENT'S PAGE.
 *
 * IT DRAWS NOTHING WHEN THE SERVER SENT NOTHING, which is every person's page. Whether this half
 * belongs on a page is the server's answer and not this component's guess. The sentences are the
 * server's too, from the one reader the message door asks.
 */
export function TheRightToInject({ said }: { said: ProfileReply }) {
  useLanguage()
  const may = said.mayInject
  if (may === null) return null
  return (
    <Panel titleIs="label" declares={{ surface: 'profile.inject' }} title={t('g6b.inject.title')}>
      <style href="mole-office-right-to-inject" precedence="default">
        {INJECT_CSS}
      </style>
      <p className="inject-state" data-may={may.may ? 'yes' : 'no'}>
        {may.may ? t('g6b.inject.yes') : t('g6b.inject.no')}
      </p>
      {/* WHERE THE SWITCH IS: one press that goes there. It is the only way to change this. */}
      <p className="inject-where">
        <RouteLink to={pathFor('settings')} className="inject-to-settings">
          {t('g6b.inject.settings')}
        </RouteLink>
      </p>
    </Panel>
  )
}

/** THE COUNT, ON A PERSON'S PAGE. It draws nothing on an agent's, for the reason above. */
export function WhoHasInjectedToThem({ said }: { said: ProfileReply }) {
  useLanguage()
  const rows = said.injectedToThem
  if (rows === null) return null
  return (
    <Panel titleIs="label" declares={{ surface: 'profile.injected' }} title={t('g6b.inject.injectedToYou')}>
      <style href="mole-office-right-to-inject" precedence="default">
        {INJECT_CSS}
      </style>
      {rows.length === 0 ? (
        <p className="inject-none"><Absence title={t('g6b.inject.nobodyHas')} /></p>
      ) : (
        <ul className="inject-rows">
          {rows.map((row) => (
            <li key={participantKey(row.from)}>
              <span className="inject-who"><ParticipantName kind={row.from.kind} id={row.from.id} /></span>
              <span className="inject-kind">{t(row.from.kind === 'person' ? 'g6b.profile.person' : 'g6b.profile.agent')}</span>
              <span className="inject-count">{t('g6b.inject.count', { count: row.count, unread: row.unread })}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** The stylesheet. No backtick anywhere inside it, including in a comment. Chapter 6. */
const INJECT_CSS = `
.inject-state { margin: 0 0 .25rem; font-weight: 600; }
.inject-state[data-may='no'] { color: var(--st-broken); }
.inject-where, .inject-none { margin: 0 0 .5rem; font-size: var(--fs-1); color: var(--text-2); }
.inject-to-settings { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: .16em; }
.inject-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
.inject-rows li { display: flex; gap: .5rem; align-items: baseline; flex-wrap: wrap; }
.inject-who { font-weight: 600; }
.inject-kind { font-size: var(--fs-1); color: var(--text-3); }
.inject-count { font-size: var(--fs-1); color: var(--text-2); }
`
