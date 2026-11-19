// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `What the office keeps` — HOW MANY BACKUPS, AND HOW LONG THE TWO KINDS OF REQUEST ROW SURVIVE.
 * Criterion U6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR AND WHERE THE NUMBERS LIVE
 * ---------------------------------------------------------------------------------------
 *
 * This belongs in the settings, and the person may adjust it themselves.
 * Three copies of the database are enough by default.
 *
 * The three numbers are the office's own, so they are columns on the installation row, and the door
 * that reads and writes them is `GET/POST /api/office/what-is-kept`. Nothing here decides a number:
 * the server answers which value is in force, whether nobody has chosen, and whether a stored value
 * could not be read.
 *
 * ---------------------------------------------------------------------------------------
 * NULL IS A THIRD ANSWER AND IT IS DRAWN AS ONE
 * ---------------------------------------------------------------------------------------
 *
 * A number nobody has chosen is drawn with the default in force AND the sentence saying nobody
 * chose. A stored value that cannot be read is drawn as the refusal that names it, never as the
 * default. That is invariant 5 of USER.md, and it is the pattern `Loading pictures and video` sets.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOLDER IS READ AT THE MOMENT SOMEBODY ASKS
 * ---------------------------------------------------------------------------------------
 *
 * Every read of this door lists the backups folder again and answers the count, the total size and
 * the newest moment as they are now. Nothing is cached, because a remembered reading would go stale
 * while the section said it was current.
 *
 * THE SENTENCES COME FROM THE SERVER, in `@shared/what-is-kept.ts`, so the panel cannot call a number
 * something a report calls something else. What is drawn here is structure: a label and a value. The
 * sentence under each label was taken out in wave 13y's round 121, because the label says it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t, type WordKey } from '@shared/i18n.ts'
import {
  KEPT_NUMBER_HIGHEST,
  KEPT_NUMBER_LOWEST,
  backupsFolderIsEmpty,
  backupsFolderParts,
  bytesSaid,
  isKeptNumber,
  type BackupsFolderKind,
  type KeptNumberOnScreen,
  type KeptSettingKey,
  type TheBackupsFolder,
  type WhatTheOfficeKeeps,
} from '@shared/what-is-kept.ts'
import { Absence, ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { SettingChangedLine } from './SettingChangedLine.tsx'

/** Each number's name. The English is the shared tables', read through getters. */
const KEPT_WORDS: Record<KeptSettingKey, { label: WordKey }> = {
  keepBackups: { label: 'settingsPanel.kept.label.keepBackups' },
  untracedRequestDays: { label: 'settingsPanel.kept.label.untracedRequestDays' },
  tracedRequestDays: { label: 'settingsPanel.kept.label.tracedRequestDays' },
}

/** The words for each kind of thing the backups folder is counted in. */
const FOLDER_PART_WORDS: Record<BackupsFolderKind, WordKey> = {
  files: 'settingsPanel.kept.files',
  filesFolders: 'settingsPanel.kept.filesFolders',
  leftOutLists: 'settingsPanel.kept.leftOutLists',
}

/**
 * WHAT THE BACKUPS FOLDER HOLDS, in the page's language. Which counts are said, and in what order,
 * comes from `backupsFolderParts` in @shared/what-is-kept.ts, the same list the server's English
 * sentence is built from. Only the words are chosen here.
 */
function folderHoldsInWords(files: number, filesFolders: number, leftOutLists: number): string {
  const parts = backupsFolderParts(files, filesFolders, leftOutLists).map(({ what, n }) => t(FOLDER_PART_WORDS[what], { n }))
  const last = parts.pop() as string
  return parts.length === 0 ? last : t('settingsPanel.kept.listAnd', { list: parts.join(t('settingsPanel.kept.listComma')), last })
}

export function WhatIsKeptPanel() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.whatIsKept(), [])
  const [changeNumber, setChangeNumber] = useState(0)
  if (state.status === 'loading') return <Loading what={t('settingsPanel.kept.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  const onChanged = (): void => {
    readAgain()
    setChangeNumber((number) => number + 1)
  }
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.whatiskept' }} title={t('settingsPanel.title.whatiskept')}>
      <style href="mole-office-what-is-kept" precedence="default">
        {WHAT_IS_KEPT_CSS}
      </style>
      <WhatIsKept said={state.value} onChanged={onChanged} changeNumber={changeNumber} />
    </Panel>
  )
}

/**
 * The whole section: what a backup is, the three numbers, and the folder as it stands now. What a backup is takes one
 * line; developer mode draws the full sentences in its place, so it is said once (wave 13y round 122).
 */
function WhatIsKept({ said, onChanged, changeNumber }: { said: WhatTheOfficeKeeps; onChanged: () => void; changeNumber: number }) {
  useLanguage()
  const developer = useInspect()
  return (
    <div className="wik">
      <p className="wik-lead">{t(developer ? 'settingsPanel.kept.whatABackupIs' : 'settingsPanel.kept.backupInShort')}</p>
      <div className="wik-numbers">
        {said.numbers.map((one) => (
          <KeptNumberRow
            // THE VALUE FORCES A FRESH ROW when it changes, so the box shows what is stored rather
            // than what somebody typed before the write landed.
            key={`${one.key}:${String(one.inForce)}`}
            one={one}
            onChanged={onChanged}
          />
        ))}
      </div>
      <SettingChangedLine setting="what-is-kept" refreshKey={changeNumber} />
      <BackupsFolder said={said.backups} />
    </div>
  )
}

/**
 * ONE NUMBER: what it is called, the value in force, and a press that writes it.
 *
 * The box and the press are one row so a reader can see which number a fault belongs to. The fault
 * is drawn where it happened rather than at the foot of the panel, for the reason `MediaLoad` gives.
 */
function KeptNumberRow({ one, onChanged }: { one: KeptNumberOnScreen; onChanged: () => void }) {
  useLanguage()
  const developer = useInspect()
  const words = KEPT_WORDS[one.key]
  const label = t(settingsControlWord('settings.whatiskept', words.label))
  // THE SERVER'S SENTENCE, SAID IN THE PAGE'S LANGUAGE. The first two are picked by where the value came from.
  // An unreadable value's sentence quotes the raw stored value, which only developer mode shows.
  const says =
    one.from === 'the default'
      ? t('settingsPanel.kept.defaultInForce', { n: String(one.inForce) })
      : one.from === "the person's setting"
        ? t('settingsPanel.kept.youChose', { n: String(one.inForce) })
        : developer
          ? one.says
          : t('settingsPanel.kept.unreadable', { label })
  const [text, setText] = useState(one.inForce === null ? '' : String(one.inForce))
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const unreadable = one.from === 'unreadable'

  const keep = (): void => {
    // Whether the number may be stored is the shared rule. An empty box reads as 0, which it refuses.
    const value = Number(text.trim())
    if (!isKeptNumber(value)) {
      setFault(t('settingsPanel.kept.range', { low: KEPT_NUMBER_LOWEST, high: KEPT_NUMBER_HIGHEST }))
      return
    }
    setBusy(true)
    setFault(null)
    api
      .whatIsKept({ [one.key]: value })
      .then(() => {
        onChanged()
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="wik-row" data-kept={one.key}>
      <div className="wik-words">
        <label className="wik-label" htmlFor={`wik-${one.key}`}>
          {label}
        </label>
      </div>
      <div className="wik-control">
        <input
          id={`wik-${one.key}`}
          className="wik-input"
          type="number"
          inputMode="numeric"
          min={KEPT_NUMBER_LOWEST}
          max={KEPT_NUMBER_HIGHEST}
          step={1}
          value={text}
          disabled={unreadable || busy}
          aria-label={label}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
        <button type="button" className="wik-keep" onClick={keep} disabled={unreadable || busy}>
          {t(settingsControlWord('settings.whatiskept', 'settingsPanel.kept.keep'))}
        </button>
      </div>
      {/* The server's own sentence, drawn only in developer mode, is its English and is marked so. */}
      <p className={unreadable ? 'wik-refuse' : 'wik-state'} lang={unreadable && developer ? 'en' : undefined}>
        {says}
      </p>
      {fault === null ? null : <p className="wik-refuse">{fault}</p>}
    </div>
  )
}

/**
 * WHERE THE BACKUPS LIVE, HOW MANY THERE ARE, THEIR TOTAL SIZE, AND THE NEWEST ONE'S TIME.
 * Exported so tests/the-settings-panels-say-the-shared-facts.test.ts can draw it from a made-up folder.
 */
export function BackupsFolder({ said }: { said: TheBackupsFolder }) {
  useLanguage()
  const developer = useInspect()
  // THE FOLDER'S PATH IS SHOWN ONLY IN DEVELOPER MODE, and the server's two sentences name it, so normal mode
  // draws the page's own sentence instead of the server's.
  if (!said.readable) {
    return (
      <div className="wik-folder">
        <p className="wik-folder-name">{t('settingsPanel.kept.backups')}</p>
        <p className="wik-refuse" lang={developer ? 'en' : undefined}>
          {developer ? said.says : t('settingsPanel.kept.folderUnreadable')}
        </p>
      </div>
    )
  }
  const empty = backupsFolderIsEmpty(said.count, said.filesFolders, said.leftOutLists)
  return (
    <div className="wik-folder">
      <p className="wik-folder-name">{t('settingsPanel.kept.backups')}</p>
      {developer ? (
        <p className="wik-folder-say" lang="en">
          {said.says}
        </p>
      ) : null}
      <dl className="wik-facts">
        {developer ? (
          <div className="wik-fact">
            <dt className="wik-key">{t('settingsPanel.kept.folder')}</dt>
            <dd className="wik-val wik-path">{content(said.directory)}</dd>
          </div>
        ) : null}
        <div className="wik-fact">
          <dt className="wik-key">{t('settingsPanel.kept.inIt')}</dt>
          <dd className="wik-val">
            {empty ? (
              <Absence tier="told-apart" looked word={t('settingsPanel.kept.none')} title={t('settingsPanel.kept.folderEmpty')} />
            ) : (
              t('settingsPanel.kept.holdsAndSize', {
                holds: folderHoldsInWords(said.count, said.filesFolders, said.leftOutLists),
                size: bytesSaid(said.totalBytes),
              })
            )}
          </dd>
        </div>
        {said.newestAt === null ? null : (
          <div className="wik-fact">
            <dt className="wik-key">{t('settingsPanel.kept.newest')}</dt>
            <dd className="wik-val">{content(said.newestAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/** The section's own rules. Every value is a token, so a preset swap re-skins it with everything else. */
const WHAT_IS_KEPT_CSS = `
.wik { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.wik-lead { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.wik-numbers { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.wik-row {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px var(--gut);
  padding: var(--pad); min-width: 0;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
}
.wik-words { flex: 1 1 20rem; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wik-label { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.wik-control { flex: none; display: flex; align-items: center; gap: var(--pad); }
.wik-input {
  width: 7rem; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.wik-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.wik-keep {
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.wik-keep:hover:not(:disabled) { background: var(--hover); }
.wik-keep:disabled { color: var(--text-3); cursor: default; }
.wik-state { flex: 1 1 100%; margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.wik-refuse {
  flex: 1 1 100%; margin: 0; max-width: 40ch; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.wik-folder {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  padding-top: var(--pad); border-top: var(--border-w) solid var(--border);
}
.wik-folder-name { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.wik-folder-say { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.wik-facts { margin: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wik-fact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--gut); min-width: 0; }
.wik-key { flex: none; min-width: 7rem; margin: 0; font-size: var(--fs-2); color: var(--text-2); }
.wik-val { margin: 0; font-size: var(--fs-2); color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.wik-path { font-family: var(--font-mono, monospace); }
@media (max-width: 40rem) {
  .wik-words { flex: 1 1 100%; }
  .wik-control { flex: 1 1 100%; }
  .wik-input { flex: 1 1 auto; }
  .wik-key { min-width: 0; flex: 1 1 100%; }
}
`
