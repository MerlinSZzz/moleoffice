// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `The secretary who takes the dead letters` — ONE AGENT THE PERSON NAMES, ON THE SETTINGS PAGE.
 * Problem 0WUuvB0IhRfb, with the secretary's answers I24sT059xQlk and UEmOvQ6-ptyJ.
 *
 * WHAT IS DRAWN. The panel explains where messages to unreachable agents go, who receives the
 * office's notice, and who is named. The picker changes the named secretary and the last line says
 * who changed the setting.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the panel reads the door's answer, so the state
 * moves only once the office has stored the change. A refused press leaves the state where it was and
 * draws the refusal under it.
 */

import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import type { OfficeDeadLetterSecretaryReply } from '../api.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, Loading, Panel, Select, useAsync } from './ui.tsx'
import { DeadLetterThresholdsControl } from './DeadLetterThresholds.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'

export function DeadLetterSecretaryPanel() {
  useLanguage()
  const [state] = useAsync(() => api.deadLetterSecretary(), [])
  if (state.status === 'loading') return <Loading what={t('deadLetterSecretary.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.deadletters' }} title={t('settingsPanel.title.deadletters')}>
      <style href="mole-office-dead-letter-secretary" precedence="default">
        {DEAD_LETTER_SECRETARY_CSS}
      </style>
      <DeadLetterSecretary first={state.value} />
      <DeadLetterThresholdsControl />
    </Panel>
  )
}

/** The state in the page's language, built from the same fields the server's English sentence is. */
function theState(reading: OfficeDeadLetterSecretaryReply): string {
  const who = content(reading.storedName ?? '')
  switch (reading.nobodyBecause) {
    case null:
      return t('deadLetterSecretary.noticeNamed', { who: content(reading.named?.name ?? '') })
    case 'nobody chose':
      return t('deadLetterSecretary.nobody.nobodyChose')
    case 'not registered':
      return t('deadLetterSecretary.nobody.notRegistered', { who })
    case 'retired':
      return t('deadLetterSecretary.nobody.retired', { who })
    case 'no act':
      return t('deadLetterSecretary.nobody.noAct', { who, act: content(reading.act) })
  }
}

function DeadLetterSecretary({ first }: { first: OfficeDeadLetterSecretaryReply }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [chosen, setChosen] = useState(first.named?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .deadLetterSecretary(chosen === '' ? null : chosen)
      .then((now) => {
        setReading(now)
        setChosen(now.named?.id ?? '')
        setChangeNumber((number) => number + 1)
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const options = [
    { value: '', label: t(settingsControlWord('settings.deadletters', 'deadLetterSecretary.pickNobody')) },
    // EACH BY ITS NAME ALONE (wave 13n round 33), or by its handle where its row holds no name. The handle is added
    // beside a name only where two of them carry the same name, so the two can still be told apart.
    ...reading.mayBeNamed.map((one) => {
      const name = one.name.trim() === '' ? one.handle : one.name
      const shared = reading.mayBeNamed.filter((other) => other.name === one.name).length > 1
      return { value: one.id, label: shared && name !== one.handle ? `${name} (${one.handle})` : name }
    }),
  ]

  return (
    <div className="dls">
      {/* WHAT A DEAD LETTER IS, said first, then where the ones that end with them go. Then who is named,
          and the picker. The list of what happens to each kind of letter was taken out in wave 13y's
          round 121. */}
      <p className="dls-what-is">{t('deadLetterSecretary.whatADeadLetterIs')}</p>
      <p className="dls-what-is">{t('deadLetterSecretary.ownerRoute')}</p>
      {reading.named === null ? null : <p className="dls-who-acts">{t('deadLetterSecretary.noticeRole')}</p>}
      <p className="dls-state" data-named={reading.named === null ? 'nobody' : reading.named.id}>
        {theState(reading)}
      </p>
      {reading.mayBeNamed.length === 0 ? (
        <p className="dls-none">{t('deadLetterSecretary.nobodyQualifies', { act: content(reading.act) })}</p>
      ) : null}
      <div className="dls-pick">
        <label className="dls-field">
          <span>{t(settingsControlWord('settings.deadletters', 'deadLetterSecretary.pick'))}</span>
          <Select value={chosen} onChange={setChosen} options={options} aria-label={t(settingsControlWord('settings.deadletters', 'deadLetterSecretary.pick'))} />
        </label>
        <button className="dls-button" type="button" disabled={busy || chosen === (reading.named?.id ?? '')} onClick={save}>
          {t(settingsControlWord('settings.deadletters', 'deadLetterSecretary.save'))}
        </button>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <SettingChangedLine setting="dead-letter-secretary" refreshKey={changeNumber} />
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const DEAD_LETTER_SECRETARY_CSS = `
.dls { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.dls-state { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: 600 var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.dls-none { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.dls-pick { display: flex; flex-wrap: wrap; align-items: end; gap: var(--pad); min-width: 0; }
.dls-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.dls-field .px-select { max-width: 100%; }
.dls-button, .dlt-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.dls-button:hover:not(:disabled), .dlt-button:hover:not(:disabled) { background: var(--hover); }
.dls-button:focus-visible, .dlt-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.dls-button:disabled, .dlt-button:disabled { cursor: default; opacity: .6; }
.dls-what-is { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); text-wrap: pretty; }
.dls-who-acts { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); text-wrap: pretty; }
`
