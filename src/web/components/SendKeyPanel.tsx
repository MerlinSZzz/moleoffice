// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Keyboard shortcuts` — WHICH KEY SENDS A MESSAGE. Enter makes a new line by default, and Shift+Enter or
 * Alt+Enter sends. It is the first keyboard shortcut in the settings.
 *
 * THE FIRST SHORTCUT SETTING. It is the only panel in the `keys` category, and the screen is laid out
 * so the next shortcut has a home beside it.
 *
 * THE PANEL HOLDS THE CONTROL AND NOT THE RULE. Which two answers exist, what they are stored as and
 * which key each one sends are declared once in `@shared/participants.ts` and worked out once in
 * `src/web/lib/send-key.ts`; this file only draws the choice and writes it. That is why the chat's
 * composer and this control cannot come to different answers about what Enter does.
 *
 * FOLLOWS THE PERSON AND NOT THIS BROWSER, the same as the panels beside it: the choice is written on
 * the person's own registry row, so every device they open Mole Office from reads the same answer.
 *
 * RADIO BUTTONS AND NOT A MENU: two answers, both short, both visible at once.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import {
  SEND_KEY_SETTINGS,
  type SendKeySetting,
} from '@shared/participants.ts'
import { useLanguage } from '../lib/language.ts'
import { readSendKey, useSendKey } from '../lib/send-key.ts'
import { api, errorMessage, getActor } from '../api.ts'

/** The name of each answer, as a word the word lists hold. */
const SEND_KEY_WORD = {
  'shift-or-alt-enter': 'sendKey.word.shiftOrAlt',
  enter: 'sendKey.word.enter',
} as const satisfies Readonly<Record<SendKeySetting, string>>

export function SendKeyPanel() {
  useLanguage()
  const chosen = useSendKey()
  const [reply, reload] = useAsync(() => api.participants(), [])
  const [fault, setFault] = useState<string | null>(null)
  const actor = getActor()
  const mine = reply.status === 'ready' ? (reply.value.people.find((one: { id: string }) => one.id === actor.id) ?? null) : null

  const chooseIt = (which: SendKeySetting): void => {
    if (mine === null) return
    setFault(null)
    void api
      .changeParticipant('person', mine.id, { sendKey: which })
      .then(async () => {
        reload()
        // AND EVERY BOX READS ITSELF AGAIN, so a press here reaches the chat's composer on this page
        // now rather than on the next navigation. `useSendKey` subscribes the boxes to that reading.
        await readSendKey(true)
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.sendkey' }} title={t('settingsPanel.title.sendkey')}>
      <style href="mole-office-send-key" precedence="default">
        {SEND_KEY_CSS}
      </style>
      <fieldset className="sendk">
        <legend className="sendk-ask">{t(settingsControlWord('settings.sendkey', 'sendKey.ask'))}</legend>
        {SEND_KEY_SETTINGS.map((which) => (
          <label className="sendk-one" key={which} data-chosen={chosen === which ? 'yes' : 'no'} data-key={which}>
            <input
              type="radio"
              name="mole-office-send-key"
              className="sendk-pick"
              value={which}
              checked={chosen === which}
              disabled={mine === null}
              onChange={() => {
                chooseIt(which)
              }}
            />
            <span className="sendk-words">
              <span className="sendk-word">{t(settingsControlWord('settings.sendkey', SEND_KEY_WORD[which]))}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {reply.status === 'loading' ? <Loading what={t('pageWords.SendKeyPanel.001')} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {fault === null ? null : <p className="sendk-fault">{fault}</p>}
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const SEND_KEY_CSS = `
.sendk { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--gut); min-width: 0; }
.sendk-ask {
  padding: 0; margin-inline-end: var(--gut);
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.sendk-one {
  display: inline-flex; align-items: flex-start; gap: 6px;
  flex: 1 1 16rem; max-width: 26rem;
  min-height: 30px; padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  cursor: pointer;
}
.sendk-one:hover { background: var(--hover); }
.sendk-one[data-chosen="yes"] { border-color: var(--text); background: var(--hover); }
.sendk-one:has(> .sendk-pick:focus-visible) { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.sendk-pick { margin-top: 2px; }
.sendk-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sendk-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.sendk-fault {
  margin: var(--pad) 0 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .sendk-ask { flex: 1 1 100%; margin-inline-end: 0; }
  .sendk-one { flex: 1 1 100%; max-width: none; }
}
`
