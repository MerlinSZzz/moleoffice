// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Usage notices` — WHO TAKES THE USAGE NOTICES OF THE SANDBOXES' LOGIN, AND WHAT THE ONE AT 80% SAYS TO DO, ON THE
 * SETTINGS PAGE. Wave 13y round 137, item 79b. The two settings are round 136's, read and written in
 * src/server/lib/usage-notices.ts.
 *
 * WHAT IS DRAWN. First, one line saying what the notices are. Then one row for each setting. Each row says what is set
 * now and where that came from, then the reason given with the newest change when one was given, then the presses that
 * change it, and last who changed it most recently.
 *   - The secretary for the notices: a picker with "The first secretary appointed" first, which stores no choice, then
 *     every secretary that can take them, first appointed first, and one press.
 *   - What the notice at 80% says to do: the words, the usage decision they come from, a press that sets both, and a
 *     press that sets nothing. The words are sent as typed: no full stop is added, and none is needed. The decision is
 *     named by its title. It is chosen from the ten newest decisions of every project, with ten more on each press, or
 *     found by a word of its title with the record picker (round 140, item 79d). The decision chosen is named above the
 *     list until Save, and the one set is named in the row's sentence, with its link.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the row reads the door's answer, so it moves only once the office has
 * stored the change. A refused press leaves the row where it was and draws the refusal under it.
 */

import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import type { RecordKind } from '@shared/types.ts'
import type { TheUsageDecision, TheUsageNoticeSecretary, TheUsageNoticeSecretaryInForce } from '../../server/lib/usage-notices.ts'
import { api, errorMessage, faultOf, type Fault, type RecordListItem } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { RouteLink, recordPath } from './router.tsx'
import { ErrorNote, Loading, Panel, Select, TextArea, drawnDayWithTime, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'
import { ProjectName, useProjectTitles } from './ProjectChoice.tsx'
import { RecordPicker } from './RecordPicker.tsx'

export function UsageNoticesPanel() {
  useLanguage()
  const [state] = useAsync(() => Promise.all([api.secretaryForTheUsageNotices(), api.whatTheUsageNoticeSaysToDo()]), [])
  if (state.status === 'loading') return <Loading what={t('usageNotices.panel.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  const [who, what] = state.value
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.usagenotices' }} title={t('settingsPanel.title.usagenotices')}>
      <style href="mole-office-usage-notices" precedence="default">
        {USAGE_NOTICES_CSS}
      </style>
      <div className="usn">
        <p className="usn-what">{t('usageNotices.panel.what')}</p>
        <ul className="usn-rows">
          <WhoTakesThem first={who} />
          <WhatItSays first={what} />
        </ul>
      </div>
    </Panel>
  )
}

const nameOf = (agent: { name: string; handle: string }): string => agent.name || agent.handle

/** Who takes the notices, in the page's language, built from the same fields and word keys the server's English sentence is. */
function whoTakesThemNow(inForce: TheUsageNoticeSecretaryInForce): string {
  if (inForce.from === 'set here') return t('usageNotices.secretary.setHere', { who: content(nameOf(inForce.agent)) })
  if (inForce.from === 'no secretary') {
    return inForce.chosen === null
      ? t('usageNotices.secretary.noSecretary')
      : t('usageNotices.secretary.chosenAndNoSecretary', { chosen: content(inForce.chosen.storedName) })
  }
  const who = content(nameOf(inForce.agent))
  if (inForce.chosen === null) return t('usageNotices.secretary.firstAppointed', { who })
  const chosen = content(inForce.chosen.storedName)
  switch (inForce.chosen.cannotBecause) {
    case 'retired':
      return t('usageNotices.secretary.chosenRetired', { chosen, who })
    case 'not a secretary':
      return t('usageNotices.secretary.chosenNotASecretary', { chosen, who })
    case 'not registered':
      return t('usageNotices.secretary.chosenNotRegistered', { chosen, who })
  }
}

function WhoTakesThem({ first }: { first: TheUsageNoticeSecretary }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [chosen, setChosen] = useState(first.stored ?? '')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .setSecretaryForTheUsageNotices(chosen === '' ? null : chosen)
      .then((now) => {
        setReading(now)
        setChosen(now.stored ?? '')
        setChangeNumber((number) => number + 1)
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const cannot = reading.inForce.from === 'set here' ? null : reading.inForce.chosen
  const options = [
    { value: '', label: t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.pickNobody')) },
    // EACH BY ITS NAME ALONE, or by its handle where its row holds no name. The handle is added beside a name only
    // where two of them carry the same name, so the two can still be told apart.
    ...reading.mayBeChosen.map((one) => {
      const name = nameOf(one)
      const shared = reading.mayBeChosen.filter((other) => other.name === one.name).length > 1
      return { value: one.id, label: shared && name !== one.handle ? `${name} (${one.handle})` : name }
    }),
    // THE AGENT CHOSEN HERE, WHEN IT CANNOT TAKE THEM NOW, stays in the list so the picker shows what is stored.
    ...(cannot === null ? [] : [{ value: cannot.stored, label: cannot.storedName }]),
  ]

  return (
    <li className="usn-row" data-setting="usage-notice-secretary">
      <p className="usn-name">{t('usageNotices.panel.who')}</p>
      <p className="usn-state" data-from={reading.inForce.from}>
        {whoTakesThemNow(reading.inForce)}
      </p>
      {reading.because === null ? null : <p className="usn-because">{t('usageNotices.panel.because', { because: content(reading.because) })}</p>}
      <div className="usn-presses">
        <label className="usn-field">
          <span>{t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.pick'))}</span>
          <Select value={chosen} onChange={setChosen} options={options} aria-label={t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.pick'))} />
        </label>
        <button className="usn-button" data-press="choose" type="button" disabled={busy || chosen === (reading.stored ?? '')} onClick={save}>
          {t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.save'))}
        </button>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <SettingChangedLine setting="usage-notice-secretary" refreshKey={changeNumber} />
    </li>
  )
}

/** The decision the words come from, as the row holds it until Save: its id, and its title to draw. */
interface AChosenDecision {
  id: string
  title: string
}

const theStoredChoice = (reading: TheUsageDecision): AChosenDecision | null =>
  reading.inForce.from === 'set here' ? { id: reading.inForce.decision, title: reading.inForce.title } : null

/** How many decisions the list draws at first, and how many more each press adds. Its test reads it here. */
export const DECISIONS_AT_A_TIME = 10

const DECISIONS_ONLY: readonly RecordKind[] = ['decision']

function WhatItSays({ first }: { first: TheUsageDecision }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [words, setWords] = useState(first.inForce.from === 'set here' ? first.inForce.whatToDo : '')
  const [chosen, setChosen] = useState(theStoredChoice(first))
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)
  const titles = useProjectTitles()

  // THE WORDS GO AS TYPED. The door takes off spaces at either end, and the row then draws what it stored.
  const send = (whatToDo: string | null, from: string | null): void => {
    setBusy(true)
    setFault(null)
    api
      .setWhatTheUsageNoticeSaysToDo(whatToDo, from)
      .then((now) => {
        setReading(now)
        setWords(now.inForce.from === 'set here' ? now.inForce.whatToDo : '')
        setChosen(theStoredChoice(now))
        setChangeNumber((number) => number + 1)
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const stored = reading.inForce.from === 'set here' ? reading.inForce : null
  const unchanged = stored !== null && words === stored.whatToDo && chosen?.id === stored.decision
  const empty = words.trim() === '' || chosen === null

  return (
    <li className="usn-row" data-setting="usage-decision">
      <p className="usn-name">{t('usageNotices.panel.whatToDo')}</p>
      <p className="usn-state usn-says" data-from={reading.inForce.from}>
        {stored === null
          ? t('usageNotices.decision.notSet')
          : t('usageNotices.decision.setHere', { title: content(stored.title), whatToDo: content(stored.whatToDo) })}
      </p>
      {stored === null ? null : (
        <p className="usn-link">
          <RouteLink to={recordPath(stored.decision)}>{t('usageNotices.panel.openDecision')}</RouteLink>
        </p>
      )}
      {reading.because === null ? null : <p className="usn-because">{t('usageNotices.panel.because', { because: content(reading.because) })}</p>}
      <label className="usn-field usn-words">
        <span>{t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.words'))}</span>
        <TextArea value={words} onChange={setWords} rows={2} growTo={8} aria-label={t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.words'))} />
      </label>
      <p className="usn-hint">{t('usageNotices.panel.wordsHint')}</p>
      <div className="usn-choice">
        <p className="usn-label">{t('usageNotices.panel.decision')}</p>
        <p className="usn-chosen" data-chosen={chosen?.id ?? ''}>
          {chosen === null ? t('usageNotices.panel.noneChosen') : t('usageNotices.panel.chosen', { title: content(chosen.title) })}
        </p>
        <TheNewestDecisions chosen={chosen?.id ?? null} titles={titles} onChoose={setChosen} />
        <div className="usn-find">
          <p className="usn-label">{t('usageNotices.panel.find')}</p>
          <RecordPicker
            label={t('usageNotices.panel.find')}
            kinds={DECISIONS_ONLY}
            chosen={chosen === null ? [] : [chosen.id]}
            titles={titles}
            onPick={(record) => setChosen({ id: record.id, title: record.title })}
          />
        </div>
      </div>
      <div className="usn-presses">
        <button className="usn-button" data-press="save" type="button" disabled={busy || empty || unchanged} onClick={() => send(words, chosen?.id ?? null)}>
          {t(settingsControlWord('settings.usagenotices', 'usageNotices.decision.save'))}
        </button>
        <button className="usn-button" data-press="clear" type="button" disabled={busy || stored === null} onClick={() => send(null, null)}>
          {t(settingsControlWord('settings.usagenotices', 'usageNotices.panel.clear'))}
        </button>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <SettingChangedLine setting="usage-decision" refreshKey={changeNumber} />
    </li>
  )
}

/**
 * THE NEWEST DECISIONS OF EVERY PROJECT, ten at first and ten more on each press, each by its title, its date and its
 * project, with a press that chooses it. The one already chosen says so and cannot be pressed.
 */
function TheNewestDecisions({ chosen, titles, onChoose }: { chosen: string | null; titles: ReadonlyMap<string, string>; onChoose: (decision: AChosenDecision) => void }) {
  useLanguage()
  const [first] = useAsync(() => api.newestDecisions(DECISIONS_AT_A_TIME, 0), [])
  const [more, setMore] = useState<{ rows: RecordListItem[]; left: number } | null>(null)
  const [reading, setReading] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  if (first.status === 'loading') return <Loading what={t('usageNotices.panel.loadingDecisions')} rows={2} />
  if (first.status === 'error') return <ErrorNote message={first.message} fault={first.fault} />
  const rows = more?.rows ?? first.value.records
  const left = more?.left ?? first.value.left

  const readMore = (): void => {
    setReading(true)
    setFault(null)
    api
      .newestDecisions(DECISIONS_AT_A_TIME, rows.length)
      .then((next) => {
        // A decision filed since the first page moves every row down by one, so a row already drawn can come again.
        // It is drawn once.
        const drawn = new Set(rows.map((row) => row.id))
        setMore({ rows: [...rows, ...next.records.filter((row) => !drawn.has(row.id))], left: next.left })
      })
      .catch((error: unknown) => {
        setFault({ message: errorMessage(error), fault: faultOf(error) })
      })
      .finally(() => {
        setReading(false)
      })
  }

  return (
    <div className="usn-newest">
      <p className="usn-label">{t('usageNotices.panel.newest')}</p>
      {rows.length === 0 ? (
        <p className="usn-hint">{t('usageNotices.panel.noDecisions')}</p>
      ) : (
        <ul className="usn-decisions">
          {rows.map((row) => (
            <li key={row.id} className="usn-decision" data-record={row.id} data-chosen={row.id === chosen ? '' : undefined}>
              <span className="usn-decision-text">
                <span className="usn-decision-title">{content(row.title)}</span>
                <span className="usn-decision-meta">
                  <time className="usn-decision-date" dateTime={row.createdAt}>
                    {drawnDayWithTime(row.createdAt)}
                  </time>
                  <span aria-hidden="true"> · </span>
                  <ProjectName id={row.workspaceId} titles={titles} />
                </span>
              </span>
              <button className="usn-button" data-press="choose-decision" type="button" disabled={row.id === chosen} onClick={() => onChoose({ id: row.id, title: row.title })}>
                {row.id === chosen ? t('usageNotices.panel.chosenPress') : t('usageNotices.panel.choose')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {left === 0 ? null : (
        <button className="usn-button" data-press="more-decisions" type="button" disabled={reading} onClick={readMore}>
          {t('usageNotices.panel.more', { n: Math.min(DECISIONS_AT_A_TIME, left) })}
        </button>
      )}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const USAGE_NOTICES_CSS = `
.usn { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.usn-what { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); text-wrap: pretty; }
.usn-rows { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.usn-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-top: var(--pad); border-top: var(--border-w) solid var(--border); }
.usn-row:first-child { padding-top: 0; border-top: 0; }
.usn-name { margin: 0; overflow-wrap: anywhere; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.usn-state { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.usn-says { white-space: pre-wrap; }
.usn-because, .usn-link, .usn-hint { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.usn-presses { display: flex; flex-wrap: wrap; align-items: end; gap: var(--pad); min-width: 0; }
.usn-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.usn-words { max-width: var(--measure-in-box); }
.usn-field .px-select, .usn-field .px-input { max-width: 100%; }
.usn-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.usn-button:hover:not(:disabled) { background: var(--hover); }
.usn-button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.usn-button:disabled { cursor: default; opacity: .6; }
.usn-choice, .usn-newest, .usn-find { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: var(--measure-in-box); }
.usn-newest { align-items: flex-start; }
.usn-label { margin: 0; overflow-wrap: anywhere; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.usn-chosen { margin: 0; overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.usn-decisions { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; align-self: stretch; min-width: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); }
.usn-decision { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px var(--pad); min-width: 0; padding: 4px var(--pad); border-top: var(--border-w) solid var(--border); }
.usn-decision:first-child { border-top: 0; }
.usn-decision[data-chosen] { background: var(--accent-soft); }
.usn-decision-text { display: flex; flex-direction: column; flex: 1 1 14rem; min-width: 0; }
.usn-decision-title { overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.usn-decision-meta { overflow-wrap: anywhere; font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
`
