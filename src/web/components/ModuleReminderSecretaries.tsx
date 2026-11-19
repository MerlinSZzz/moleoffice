// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Who gets module reminders` — ONE SECRETARY PER PROJECT, SET HERE OR BY THE .ENV LINE, ON THE SETTINGS PAGE.
 * Decision aZGg6gerakM1 (wave 13p round 29).
 *
 * WHAT IS DRAWN. First, one sentence saying what the reminder is and which of the two places counts. Then, when the
 * .env line cannot be read, a warning that says so, with the reader's sentence in developer mode only, because it
 * names the setting; the page is still drawn. Then, when the .env line
 * names projects that do not exist, a line naming them. Then one row per project: its name, the line saying who is
 * reminded and where that came from, the reason given with the last change made here, and a picker with one press.
 * Last, who changed the setting most recently, across all projects.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the panel reads the door's answer, so a row moves only once the
 * office has stored the change. A refused press leaves the row where it was and draws the refusal under it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import type { AModuleReminderSecretaryInForce, OfficeModuleReminderSecretariesReply } from '../api.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { ErrorNote, Loading, Panel, Select, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'

export function ModuleReminderSecretariesPanel() {
  useLanguage()
  const [state] = useAsync(() => api.moduleReminderSecretaries(), [])
  if (state.status === 'loading') return <Loading what={t('moduleReminders.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.modulereminders' }} title={t('settingsPanel.title.modulereminders')}>
      <style href="mole-office-module-reminder-secretaries" precedence="default">
        {MODULE_REMINDER_SECRETARIES_CSS}
      </style>
      <ModuleReminderSecretaries first={state.value} />
    </Panel>
  )
}

/** One project's line in the page's language, built from the same fields the server's English sentence is. */
function theLine(inForce: AModuleReminderSecretaryInForce): string {
  switch (inForce.from) {
    case 'set here':
      return t('moduleReminders.inForce.setHere', { who: content(inForce.agent.name || inForce.agent.handle) })
    case 'set here, cannot remind':
      if (inForce.cannotBecause === 'not registered') return t('moduleReminders.inForce.setHereNotRegistered', { who: content(inForce.storedName) })
      if (inForce.cannotBecause === 'retired') return t('moduleReminders.inForce.setHereRetired', { who: content(inForce.storedName) })
      return t('moduleReminders.inForce.setHereNotASecretary', { who: content(inForce.storedName) })
    case 'from the .env line':
      return t('moduleReminders.inForce.fromEnv', { who: content(inForce.handle) })
    case '.env line unreadable':
      return t('moduleReminders.inForce.envUnreadable')
    case 'nobody named':
      return t('moduleReminders.inForce.nobody')
  }
}

function ModuleReminderSecretaries({ first }: { first: OfficeModuleReminderSecretariesReply }) {
  useLanguage()
  const mode = useMode()
  const [reading, setReading] = useState(first)
  const [changeNumber, setChangeNumber] = useState(0)

  return (
    <div className="mrs">
      <p className="mrs-what">{t('moduleReminders.what')}</p>
      {reading.envLine.readable ? null : (
        <p className="mrs-env-unreadable" role="status">
          {t('moduleReminders.envCannotBeRead')}
          {/* THE READER'S OWN SENTENCE NAMES THE SETTING, so it is drawn in developer mode only. */}
          {mode === 'inspect' ? (
            <>
              {' '}
              {t('moduleReminders.envCannotBeReadWhy', { why: content(reading.envLine.why) })}
            </>
          ) : null}
        </p>
      )}
      {reading.envNamesUnknownProjects.length === 0 ? null : (
        <p className="mrs-env-unknown">{t('moduleReminders.envNamesUnknown', { projects: content(reading.envNamesUnknownProjects.join(', ')) })}</p>
      )}
      {reading.mayBeChosen.length === 0 ? <p className="mrs-none">{t('moduleReminders.noSecretaries')}</p> : null}
      <ul className="mrs-rows">
        {reading.projects.map((row) => (
          <ProjectRow
            key={row.project}
            row={row}
            reading={reading}
            onSaved={(now) => {
              setReading(now)
              setChangeNumber((number) => number + 1)
            }}
          />
        ))}
      </ul>
      <SettingChangedLine setting="module-reminder-secretaries" refreshKey={changeNumber} />
    </div>
  )
}

function ProjectRow({
  row,
  reading,
  onSaved,
}: {
  row: OfficeModuleReminderSecretariesReply['projects'][number]
  reading: OfficeModuleReminderSecretariesReply
  onSaved: (now: OfficeModuleReminderSecretariesReply) => void
}) {
  useLanguage()
  const [chosen, setChosen] = useState(row.storedHere ?? '')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .setModuleReminderSecretary(row.project, chosen === '' ? null : chosen)
      .then((now) => {
        onSaved(now)
        setChosen(now.projects.find((one) => one.project === row.project)?.storedHere ?? '')
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const options = [
    { value: '', label: t(settingsControlWord('settings.modulereminders', 'moduleReminders.pickNothingHere')) },
    // EACH BY ITS NAME ALONE, or by its handle where its row holds no name. The handle is added beside a name only
    // where two of them carry the same name, so the two can still be told apart.
    ...reading.mayBeChosen.map((one) => {
      const name = one.name.trim() === '' ? one.handle : one.name
      const shared = reading.mayBeChosen.filter((other) => other.name === one.name).length > 1
      return { value: one.id, label: shared && name !== one.handle ? `${name} (${one.handle})` : name }
    }),
    // THE AGENT SET HERE, WHEN IT CAN NO LONGER BE CHOSEN, stays in the list so the picker shows what is stored.
    ...(row.inForce.from === 'set here, cannot remind' ? [{ value: row.inForce.stored, label: row.inForce.storedName }] : []),
  ]

  return (
    <li className="mrs-row" data-project={row.project} data-from={row.inForce.from}>
      <p className="mrs-project">{content(row.title || row.project)}</p>
      <p className="mrs-state">{theLine(row.inForce)}</p>
      {row.because === null ? null : <p className="mrs-because">{t(settingsControlWord('settings.modulereminders', 'moduleReminders.because'), { because: content(row.because) })}</p>}
      <div className="mrs-pick">
        <label className="mrs-field">
          <span>{t(settingsControlWord('settings.modulereminders', 'moduleReminders.pick'))}</span>
          <Select value={chosen} onChange={setChosen} options={options} aria-label={t(settingsControlWord('settings.modulereminders', 'moduleReminders.pick'))} />
        </label>
        <button className="mrs-button" type="button" disabled={busy || chosen === (row.storedHere ?? '')} onClick={save}>
          {t(settingsControlWord('settings.modulereminders', 'moduleReminders.save'))}
        </button>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </li>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const MODULE_REMINDER_SECRETARIES_CSS = `
.mrs { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mrs-what { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); text-wrap: pretty; }
.mrs-env-unreadable {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad); overflow-wrap: anywhere;
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.mrs-env-unknown, .mrs-none { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.mrs-rows { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mrs-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-top: var(--pad); border-top: var(--border-w) solid var(--border); }
.mrs-row:first-child { padding-top: 0; border-top: 0; }
.mrs-project { margin: 0; overflow-wrap: anywhere; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.mrs-state { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.mrs-because { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.mrs-pick { display: flex; flex-wrap: wrap; align-items: end; gap: var(--pad); min-width: 0; }
.mrs-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.mrs-field .px-select { max-width: 100%; }
.mrs-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.mrs-button:hover:not(:disabled) { background: var(--hover); }
.mrs-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.mrs-button:disabled { cursor: default; opacity: .6; }
`
