// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT PUTS THE ENTRY IN PLACE FOR EVERY SESSION. F15 point 1; problem pHFu8nivPZ_O.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * One press, on the Settings page, that writes the skill link and the three hook lines into the
 * owner's home directory at user level, so a session started in any directory finds Mole Office.
 * Before the press it draws the press and nothing else; the panel's own title above it says what
 * the press is for, and a paragraph explaining a button that has not been pressed is the noise the
 * drawing contract keeps asking this product to drop.
 *
 * AFTER THE PRESS IT DRAWS ONE STATE WORD: written, or unchanged after a second press. The server's
 * own sentence, naming the file and the backup, is drawn in developer mode. A refusal — a settings file that does not parse, or a backup that cannot be
 * made — arrives through the ordinary error path and names the file.
 *
 * AND ONE STATE WORD FOR THIS COMPUTER'S AGENT KEY, read when the entry is drawn and again from the press's answer:
 * none yet (the same press gives one), held, or refused. The press is the one that gives the key, so nothing here asks
 * anybody to press. Until the state is read, no word is drawn. A read that fails draws no state word: in its place,
 * one sentence says that the state could not be read, with the reason. A press's answer, which carries the state,
 * replaces that sentence with the state word.
 *
 * AN AGENT IS REFUSED BY THE DOOR. This panel is on the Settings page, which is the person's own
 * surface, and it does not compute a second answer about who may press: the door refuses and this
 * shows the refusal.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useState } from 'react'

import { THE_ENTRYS_KEY_WORDS, type TheEntryInstallResult, type TheEntrysKeyState } from '@shared/entry.ts'
import { content, t } from '@shared/i18n.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { Btn, ErrorNote, ServerNote } from './ui.tsx'

/** This computer's key as the entry draws it: not read yet, read with its state, or not read with the reason. */
type TheKeyAsDrawn = null | { read: TheEntrysKeyState } | { notRead: string }

export function InstallTheEntry() {
  useLanguage()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [said, setSaid] = useState<TheEntryInstallResult | null>(null)
  const [key, setKey] = useState<TheKeyAsDrawn>(null)

  useEffect(() => {
    let live = true
    void api
      .theEntrysKeyState()
      .then((reading) => {
        if (live) setKey({ read: reading.thisComputersKey })
      })
      .catch((err: unknown) => {
        // A FAILED READ IS SAID, WITH ITS REASON, so it never looks like an entry with nothing to say. A press's
        // answer that came first carries the state, and is not replaced by the failure.
        if (live) setKey((drawn) => (drawn !== null && 'read' in drawn ? drawn : { notRead: errorMessage(err) }))
      })
    return () => {
      live = false
    }
  }, [])

  const press = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .installTheEntry()
      .then((answer) => {
        setBusy(false)
        setSaid(answer)
        setKey({ read: answer.thisComputersKey })
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  return (
    <div className="ite-stack">
      <style href="mole-office-install-the-entry" precedence="default">
        {INSTALL_THE_ENTRY_CSS}
      </style>
      <Btn onClick={press} disabled={busy} reason={busy ? t('settingsPanel.entry.putting') : undefined}>
        {t(settingsControlWord('settings.entry', 'settingsPanel.entry.put'))}
      </Btn>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} label={t('settingsPanel.entry.notPut')} />}
      {said === null ? null : (
        <>
          <p className="ite-said">{t(said.changed ? 'settingsState.written' : 'settingsState.unchanged')}</p>
          <ServerNote text={said.says} />
        </>
      )}
      {key === null ? null : 'read' in key ? (
        <p className="ite-said" data-entry-key={key.read}>{t(THE_ENTRYS_KEY_WORDS[key.read])}</p>
      ) : (
        <p className="ite-said" data-entry-key-not-read="">{t('settingsPanel.entry.key.unread', { reason: content(key.notRead) })}</p>
      )}
    </div>
  )
}

/** The component's own rules. Every value is a token, and there is no backtick anywhere in here. */
const INSTALL_THE_ENTRY_CSS = `
.ite-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }
.ite-said {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
  overflow-wrap: anywhere;
}
`
