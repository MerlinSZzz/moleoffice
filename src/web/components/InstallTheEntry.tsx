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
 * AFTER THE PRESS IT DRAWS WHAT THE SERVER SAID, in the server's own sentence: what was written,
 * into which file, and where the previous file was backed up. A second press changes nothing and
 * the sentence says so. A refusal — a settings file that does not parse, or a backup that cannot be
 * made — arrives through the ordinary error path and names the file.
 *
 * AN AGENT IS REFUSED BY THE DOOR. This panel is on the Settings page, which is the person's own
 * surface, and it does not compute a second answer about who may press: the door refuses and this
 * shows the refusal.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import type { TheEntryInstallResult } from '@shared/entry.ts'
import { t } from '@shared/i18n.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { Btn, ErrorNote } from './ui.tsx'

export function InstallTheEntry() {
  useLanguage()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [said, setSaid] = useState<TheEntryInstallResult | null>(null)

  const press = (): void => {
    setFault(null)
    setBusy(true)
    void api
      .installTheEntry()
      .then((answer) => {
        setBusy(false)
        setSaid(answer)
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
      {/* WHAT THIS PRESS WILL DO, BEFORE IT IS PRESSED. Added at review of the piece: the panel was a
          heading and a button, and the only word about what it writes came back after the press. This
          is the one press in Mole Office that writes into the folder every Claude Code session on this
          machine reads, so a person who has not been told what it does should not be finding out by
          pressing it. It says what the reader gets and what it will not disturb; the reply below says
          exactly what was written and where the backup went. */}
      <p className="ite-what">{t('settingsPanel.entry.what')}</p>
      <Btn onClick={press} disabled={busy} reason={busy ? t('settingsPanel.entry.putting') : undefined}>
        {t(settingsControlWord('settings.entry', 'settingsPanel.entry.put'))}
      </Btn>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} label={t('settingsPanel.entry.notPut')} />}
      {said === null ? null : <p className="ite-said" lang="en">{said.says}</p>}
    </div>
  )
}

/** The component's own rules. Every value is a token, and there is no backtick anywhere in here. */
const INSTALL_THE_ENTRY_CSS = `
.ite-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }
.ite-what {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text-2);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
}
.ite-said {
  margin: 0;
  max-width: var(--measure-in-box);
  color: var(--text);
  font: var(--fs-1)/var(--lh-read) var(--font-ui);
  overflow-wrap: anywhere;
}
`
