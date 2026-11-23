// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Plugins` — ONE SWITCH FOR EACH PLUGIN IN THE INSTALL'S plugins/ FOLDER, ON THE SETTINGS PAGE. Wave 13x round 14, step 1
 * of the plugin pipeline udGnc-Bsr15R (block N0TWpg5xe6mo).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * One row per plugin: its name and version, which views of the read
 * interface it reads, and a switch drawn like the inject switch (src/web/components/InjectSwitch.tsx), with the word On
 * or Off beside it so the state is never carried by colour alone. A refused plugin draws no switch: it says "refused"
 * and says the reason in plain words, in the page's language, one sentence to a line, in the reading face. The office's reader's own text
 * belongs in Developer mode, and is drawn there in `.plgs-raw` for the causes whose reader text says more than the
 * plain words can (a plugin.json that is not JSON, and a manifest whose fields the office does not accept); every
 * other cause's reader text is the same English the words table holds, so it is not drawn twice.
 *
 * THE FOLDER NAME IS FOR DEVELOPER MODE. A plugin's id is the name of its folder, a name for machines, so Normal mode
 * draws the plugin's own name only and Developer mode adds the id, by the coordinator's c3Coy1jHZafx, which comes from
 * a decision. A refused plugin has no name the office accepted, so its id is drawn in both
 * modes.
 *
 * NO PLUGINS FOLDER AND AN EMPTY ONE BOTH DRAW "none", as decided: in both there is no plugin to switch.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the row reads the door's answer, so a switch moves only once the
 * office has stored the change. A refused press leaves the switch where it was and draws the refusal under it.
 *
 * THE OFFICE MAP'S ROW FOLDS OPEN TO ITS OWN SETTING, whether the map moves (wave 13y round 119): OfficeMapSettings
 * below. It is the one place on the page for the map's settings.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, listJoined, t, wordLanguage } from '@shared/i18n.ts'
import { OFFICE_MAP_PLUGIN, pluginWordsIn, type PluginReading, type PluginsReading } from '@shared/plugins.ts'
import type { PixelSettingsReading } from '../../server/lib/pixel-office.ts'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { pluginReasonInPlainWords, theRawTextSaysMore } from '../lib/plugin-reason.ts'
import { SettingChangedLine } from './SettingChangedLine.tsx'
import { ErrorNote, Loading, Panel, ServerNote, useAsync } from './ui.tsx'

/** Sent on the window after a switch is stored, so the sidebar lists the switched-on plugins' pages again. */
export const PLUGINS_CHANGED = 'mole-office.plugins.changed'

export function PluginSwitchesPanel() {
  useLanguage()
  const [state] = useAsync(() => api.plugins(), [])
  if (state.status === 'loading') return <Loading what={t('settingsPanel.plugins.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.plugins' }} title={t('settingsPanel.title.plugins')}>
      <style href="mole-office-plugin-switches" precedence="default">
        {PLUGIN_SWITCHES_CSS}
      </style>
      <PluginSwitches first={state.value} />
    </Panel>
  )
}

function PluginSwitches({ first }: { first: PluginsReading }) {
  useLanguage()
  const [changeNumber, setChangeNumber] = useState(0)
  return (
    <div className="plgs">
      {!first.folderFound || first.plugins.length === 0 ? (
        <p className="plgs-empty">{t('absence.none')}</p>
      ) : (
        <ul className="plgs-list">
          {first.plugins.map((plugin) => (
            <PluginRow
              key={plugin.id}
              first={plugin}
              onChanged={() => {
                setChangeNumber((number) => number + 1)
              }}
            />
          ))}
        </ul>
      )}
      <SettingChangedLine setting="plugin-switches" refreshKey={changeNumber} />
    </div>
  )
}

function PluginRow({ first, onChanged }: { first: PluginReading; onChanged: () => void }) {
  useLanguage()
  const developer = useInspect()
  const [reading, setReading] = useState(first)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const manifest = reading.manifest
  // THE PLUGIN'S OWN NAME, in the page's language when its manifest gives one. The switch is named by it.
  const name = manifest === null ? reading.id : pluginWordsIn(manifest.name, wordLanguage())
  const on = reading.state === 'on'

  const press = (): void => {
    setBusy(true)
    setFault(null)
    api
      .switchAPlugin(reading.id, !on)
      .then((now) => {
        setReading(now)
        onChanged()
        window.dispatchEvent(new Event(PLUGINS_CHANGED))
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <li className="plgs-row" data-plugin={reading.id}>
      <div className="plgs-head">
        {/* A REFUSED PLUGIN HAS NO NAME THE OFFICE ACCEPTED, so only its id is drawn, once, in both modes. */}
        {manifest === null ? null : (
          <>
            <span className="plgs-name">{content(name)}</span>
            <span className="plgs-version">{t('settingsPanel.plugins.version', { version: content(manifest.version) })}</span>
          </>
        )}
        {manifest === null || developer ? <code className="plgs-id">{content(reading.id)}</code> : null}
      </div>
      {manifest === null ? (
        <>
          <p className="plgs-refused">{t('pluginState.refused')}</p>
          {/* ONE SENTENCE TO A LINE, in the page's language. Normal mode draws nothing else: the reader's own text is
              not for a person, and nothing raw is drawn here, by 2ofDpr3_ED-D and
              a decision. */}
          {pluginReasonInPlainWords(reading).map((sentence, at) => (
            <p className="plgs-reason" key={at}>
              {sentence}
            </p>
          ))}
          {developer && theRawTextSaysMore(reading) ? (
            <p className="plgs-raw" lang="en">
              {content(reading.refusal ?? '')}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="plgs-reads">
            {t('settingsPanel.plugins.reads', { views: listJoined(manifest.reads.map((view) => t(`settingsPanel.plugins.view.${view}`))) })}
          </p>
          <div className="plgs-switch-row">
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={name}
              className="plgs-switch"
              disabled={busy}
              onClick={press}
            >
              <span className="plgs-knob" aria-hidden="true" />
            </button>
            <span className="plgs-word" aria-hidden="true">
              {t(settingsControlWord('settings.plugins', on ? 'settingsPanel.plugins.on' : 'settingsPanel.plugins.off'))}
            </span>
          </div>
        </>
      )}
      {fault === null ? null : <p className="plgs-refuse">{fault}</p>}
      {manifest !== null && reading.id === OFFICE_MAP_PLUGIN ? <OfficeMapSettings /> : null}
    </li>
  )
}

/**
 * THE OFFICE MAP'S OWN SETTINGS, FOLDED INTO ITS ROW (wave 13y round 119). A tool that needs its own settings has one
 * entry on the Settings page, and that entry folds open to them, with no second-level page and no separate window. The
 * office map has one setting: whether it moves. The office stores it (GET and PATCH /api/office/scene-settings), and
 * the map's page is told reduced motion while it is off (src/web/pages/PluginPage.tsx). The fold is drawn whether the
 * plugin is on or off, so the setting can be chosen before the map is switched on.
 *
 * The switch shows the stored state, as the plugin's own switch does: after a press it shows the door's answer.
 */
function OfficeMapSettings() {
  useLanguage()
  const [first] = useAsync(() => api.pixelSettings(), [])
  const [stored, setStored] = useState<PixelSettingsReading | null>(null)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const reading = stored ?? (first.status === 'ready' ? first.value : null)
  const moves = reading?.settings.motion === true

  const press = (): void => {
    setBusy(true)
    setFault(null)
    api
      .changePixelSettings({ motion: !moves })
      .then((now) => {
        setStored(now)
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <details className="plgs-settings">
      <summary>{t('settingsPanel.plugins.officeMap.settings')}</summary>
      <div className="plgs-settings-body">
        {reading === null && first.status === 'loading' ? <Loading what={t('settingsPanel.plugins.officeMap.loading')} rows={1} /> : null}
        {reading === null && first.status === 'error' ? <ErrorNote message={first.message} fault={first.fault} /> : null}
        {reading === null ? null : (
          <>
            <div className="plgs-switch-row">
              <button
                type="button"
                role="switch"
                aria-checked={moves}
                aria-label={t(settingsControlWord('settings.plugins', 'settingsPanel.plugins.officeMap.motion'))}
                className="plgs-switch"
                disabled={busy || !reading.mayChange}
                onClick={press}
              >
                <span className="plgs-knob" aria-hidden="true" />
              </button>
              <span className="plgs-label" aria-hidden="true">
                {t(settingsControlWord('settings.plugins', 'settingsPanel.plugins.officeMap.motion'))}
              </span>
              <span className="plgs-word" aria-hidden="true">
                {t(settingsControlWord('settings.plugins', moves ? 'settingsPanel.plugins.on' : 'settingsPanel.plugins.off'))}
              </span>
            </div>
            {reading.mayChange ? null : <ServerNote text={reading.refusal} />}
          </>
        )}
        {fault === null ? null : <p className="plgs-refuse">{fault}</p>}
      </div>
    </details>
  )
}

/** The panel's own rules, the inject switch's drawn again under this panel's names. Every value is a token. No backtick inside. */
const PLUGIN_SWITCHES_CSS = `
.plgs { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.plgs-empty { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.plgs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.plgs-row {
  display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0;
  padding: var(--pad); border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
}
.plgs-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad); min-width: 0; }
.plgs-name { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.plgs-version { font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-3); }
.plgs-id { font: var(--fs-1)/var(--lh-tight) var(--font-mono); color: var(--text-3); overflow-wrap: anywhere; }
.plgs-reads { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.plgs-switch-row { display: flex; align-items: center; gap: var(--pad); }
.plgs-switch {
  position: relative; flex: none; width: 44px; height: 24px; padding: 0;
  border: var(--border-w) solid var(--border-strong); border-radius: 12px;
  background: var(--panel); cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}
.plgs-switch[aria-checked='true'] { background: var(--accent); border-color: var(--accent); }
.plgs-switch:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.plgs-switch:disabled { cursor: default; opacity: .6; }
.plgs-knob {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--text-2); transition: left .15s ease, background-color .15s ease;
}
.plgs-switch[aria-checked='true'] .plgs-knob { left: 22px; background: var(--panel); }
.plgs-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.plgs-settings { min-width: 0; padding-top: calc(var(--pad) / 2); border-top: var(--border-w) solid var(--border); }
.plgs-settings > summary { cursor: pointer; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.plgs-settings > summary:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.plgs-settings-body { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; padding-top: calc(var(--pad) / 2); }
.plgs-label { font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.plgs-refused { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.plgs-reason { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-3); overflow-wrap: anywhere; }
.plgs-raw { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-mono); color: var(--text-3); overflow-wrap: anywhere; }
.plgs-refuse {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (prefers-reduced-motion: reduce) {
  .plgs-switch, .plgs-knob { transition: none; }
}
`
