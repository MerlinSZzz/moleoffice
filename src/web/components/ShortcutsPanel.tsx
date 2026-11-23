// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Keyboard shortcuts` — WHICH SHORTCUTS ARE ON, in their Settings group.
 *
 * THREE THINGS, in this order:
 *   1. a press that opens the list of every key, which is the way to it on a phone;
 *   2. ONE SWITCH FOR EVERY ALT KEY, the keys that work only outside a text box, on by default. On
 *      a Mac the Alt keys are Option keys. The switch is the stored `singleKeys`, kept by its old
 *      name, and the two Ctrl keys do not answer to it;
 *   3. one row per shortcut: what it does, its keys, a switch, and "Later" where changing the key
 *      would go. A person turns a key on and off now; changing a key comes later.
 *
 * THE PANEL HOLDS THE CONTROLS AND NOT THE RULE. The keys and their words are the table in
 * `src/web/lib/shortcuts.ts`; the stored shape is `ShortcutSettings` in `@shared/participants.ts`.
 * This file draws them and writes the person's choice on their own row, like the send key beside it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import { SHORTCUT_IDS, type ShortcutId, type ShortcutSettings } from '@shared/participants.ts'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import {
  OPEN_THE_LIST,
  SHORTCUT_SETTING_WORDS,
  chordsOf,
  isAMac,
  isOn,
  readShortcuts,
  useShortcutsReading,
} from '../lib/shortcuts.ts'
import { ChordsKeys, SHORTCUT_KEYS_CSS } from './ShortcutKeys.tsx'
import { Panel } from './ui.tsx'

export function ShortcutsPanel() {
  useLanguage()
  const reading = useShortcutsReading()
  const settings = reading.settings
  const mac = isAMac()
  const [writing, setWriting] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const mine = reading.personId

  const write = (next: ShortcutSettings): void => {
    if (mine === null) return
    setFault(null)
    setWriting(true)
    void api
      .changeParticipant('person', mine, { shortcuts: next })
      .then(() => readShortcuts(true))
      .catch((err: unknown) => setFault(errorMessage(err)))
      .finally(() => setWriting(false))
  }

  const turn = (id: ShortcutId, on: boolean): void => {
    const off = on ? settings.off.filter((one) => one !== id) : [...settings.off, id]
    write({ singleKeys: settings.singleKeys, off: SHORTCUT_IDS.filter((one) => off.includes(one)) })
  }

  const cannotWrite = mine === null || writing

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.shortcuts' }} title={t('settingsPanel.title.shortcuts')}>
      <style href="mole-office-shortcut-keys" precedence="default">
        {SHORTCUT_KEYS_CSS}
      </style>
      <style href="mole-office-shortcuts-panel" precedence="default">
        {SHORTCUTS_PANEL_CSS}
      </style>
      <p className="scp-top">
        <button type="button" className="scp-see" onClick={() => window.dispatchEvent(new Event(OPEN_THE_LIST))}>
          {t(settingsControlWord('settings.shortcuts', 'shortcuts.settings.seeAll'))}
        </button>
      </p>

      <h3 className="scp-sec">{t('shortcuts.settings.outsideTitle')}</h3>
      <label className="scp-single" data-on={settings.singleKeys ? 'yes' : 'no'}>
        <input
          type="checkbox"
          role="switch"
          className="scp-switch"
          data-shortcut-switch="single-keys"
          checked={settings.singleKeys}
          disabled={cannotWrite}
          onChange={(event) => write({ singleKeys: event.target.checked, off: settings.off })}
        />
        <span className="scp-words">
          <span className="scp-word">{t(settingsControlWord('settings.shortcuts', 'shortcuts.settings.outsideSwitch'))}</span>
        </span>
      </label>

      <h3 className="scp-sec">{t('shortcuts.settings.eachTitle')}</h3>
      <div className="scp-table" role="table" aria-label={t('shortcuts.settings.eachTitle')}>
        <div className="scp-row scp-head" role="row">
          <span role="columnheader">{t('shortcuts.settings.col.what')}</span>
          <span role="columnheader">{t('shortcuts.settings.col.keys')}</span>
          <span role="columnheader">{t('shortcuts.settings.col.on')}</span>
          <span role="columnheader">{t('shortcuts.settings.col.change')}</span>
        </div>
        {SHORTCUT_IDS.map((id) => {
          const chords = chordsOf(id)
          const rowOn = !settings.off.includes(id)
          // A ROW WHOSE EVERY KEY IS AN ALT KEY is stopped by the switch above even while its own
          // switch is on, and a short state word says so.
          const stopped = rowOn && chords.every((chord) => !isOn(id, chord, settings))
          return (
            <div className="scp-row" role="row" key={id} data-shortcut={id} data-on={rowOn ? 'yes' : 'no'}>
              <span role="cell" className="scp-what">
                {t(settingsControlWord('settings.shortcuts', SHORTCUT_SETTING_WORDS[id]))}
                {stopped ? <span className="scp-stopped">{t(mac ? 'shortcuts.state.optionKeysOff' : 'shortcuts.state.altKeysOff')}</span> : null}
              </span>
              <span role="cell" className="scp-keys">
                <ChordsKeys chords={chords} mac={mac} offs={chords.map((chord) => !isOn(id, chord, settings))} />
              </span>
              <span role="cell">
                <input
                  type="checkbox"
                  role="switch"
                  className="scp-switch"
                  data-shortcut-switch={id}
                  aria-label={t(settingsControlWord('settings.shortcuts', SHORTCUT_SETTING_WORDS[id]))}
                  checked={rowOn}
                  disabled={cannotWrite}
                  onChange={(event) => turn(id, event.target.checked)}
                />
              </span>
              <span role="cell">
                <span className="scp-later" title={t('shortcuts.settings.laterTitle')}>
                  {t('shortcuts.settings.later')}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      {fault === null ? null : <p className="scp-fault">{fault}</p>}
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const SHORTCUTS_PANEL_CSS = `
.scp-top { margin: 0 0 var(--pad); }
.scp-see {
  min-height: 30px; padding: 2px 10px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.scp-see:hover { background: var(--hover); }
.scp-see:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.scp-sec { margin: var(--pad-lg) 0 4px; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.scp-single { display: flex; align-items: flex-start; gap: 10px; max-width: var(--measure-in-box); cursor: pointer; }
.scp-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.scp-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.scp-switch {
  appearance: none; flex: none; position: relative; width: 34px; height: 20px; margin: 0;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-pill);
  background: var(--panel-3); cursor: pointer;
}
.scp-switch::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--text-3);
}
.scp-switch:checked { background: var(--accent); border-color: var(--accent); }
.scp-switch:checked::after { left: auto; right: 2px; background: var(--panel); }
.scp-switch:disabled { opacity: .5; cursor: default; }
.scp-switch:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.scp-table { display: flex; flex-direction: column; min-width: 0; }
.scp-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 15rem) 3.5rem 6rem; gap: 12px; align-items: center;
  padding: 8px 0; border-top: var(--border-w) solid var(--border);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.scp-head { border-top: 0; padding-bottom: 2px; color: var(--text-3); }
.scp-row[data-on="no"] .scp-what { color: var(--text-3); }
.scp-what { min-width: 0; overflow-wrap: anywhere; }
.scp-stopped { display: block; color: var(--text-3); }
.scp-later {
  display: inline-block; padding: 0 6px;
  border: var(--border-w) dashed var(--border-strong); border-radius: var(--radius-sm);
  color: var(--text-3); font: var(--fs-1)/1.6 var(--font-ui);
}
.scp-fault {
  margin: var(--pad) 0 0; max-width: 40ch; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@container panel (max-width: 40rem) {
  .scp-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "what on" "keys later"; row-gap: 4px; }
  .scp-row > :nth-child(1) { grid-area: what; }
  .scp-row > :nth-child(2) { grid-area: keys; }
  .scp-row > :nth-child(3) { grid-area: on; justify-self: end; }
  .scp-row > :nth-child(4) { grid-area: later; justify-self: end; }
  .scp-head { display: none; }
}
`
