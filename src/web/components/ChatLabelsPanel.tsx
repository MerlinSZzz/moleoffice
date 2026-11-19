// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Your flags`: one list of the flags a person may put on a message.
 *
 * A FLAG IS ONE KIND, whether the office ships it or the person made it. It has a name, a description shown under the
 * name in the menu, an instruction handed to the agent with the message, a short word on the flag left of Send, a
 * colour the flag is drawn in, and a colour the words it marks are drawn in. The two shipped flags and the menu's
 * 'No mark' entry keep whatever the person changed in `shipped_flags` (migration 0346); their own flags are the entries
 * of `chat_labels` (migration 0341), each with the four new fields optional. The rules are in
 * src/shared/intent-mark.ts and src/shared/message-label.ts, and the office checks them.
 *
 * FOLLOWS THE PERSON AND NOT THIS BROWSER: both values are kept on the person's own row.
 *
 * THE PANEL DRAWS WHAT THE OFFICE STORED. Each press sends the whole shape and draws what the office answers with. An
 * empty field is sent as nothing at all, so emptying one puts that thing back to its default; the press at the end of a
 * shipped flag puts all six back at once.
 */

import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import {
  SHIPPED_FLAGS,
  THE_SHIPPED_DEFAULT_COLOUR,
  theFlagsOf,
  type AFlagOfThePersons,
  type AStoredShippedFlag,
  type StoredShippedFlags,
} from '@shared/intent-mark.ts'
import {
  isAnUnreadableMessageLabels,
  LABEL_COLOURS,
  LONGEST_LABEL,
  LONGEST_LABEL_DESCRIPTION,
  LONGEST_LABEL_INSTRUCTION,
  type LabelColour,
  type MessageLabelEntry,
} from '@shared/message-label.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { api, errorMessage, faultOf, getActor, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { readTheChatAgain } from './Chat.tsx'
import { LabelColourStyle } from './chat/LabelColours.tsx'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

/** The word of one of this panel's controls, as the Settings declaration names it. */
function word(key: string): string {
  return t(settingsControlWord('settings.chatlabels', key))
}

/** What the panel keeps and sends: both columns, as the person's row holds them. */
interface KeptFlags {
  shippedFlags: StoredShippedFlags | null
  labels: readonly MessageLabelEntry[]
  /** The reader's sentences for a stored list this build cannot read, or null because it read. */
  unreadable: readonly string[] | null
}

/** The two columns one press sends; the unreadable note is read from what the panel holds, not sent. */
type FlagsToKeep = Pick<KeptFlags, 'shippedFlags' | 'labels'>

export function ChatLabelsPanel() {
  useLanguage()
  const [reply] = useAsync(() => api.participants(), [])
  // WHAT THE OFFICE ANSWERED THE LAST PRESS WITH. Until a press, the values are the ones read with the page.
  const [stored, setStored] = useState<KeptFlags | null>(null)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [newWord, setNewWord] = useState('')
  const [newColour, setNewColour] = useState<LabelColour | null>(null)
  const actor = getActor()
  const mine = reply.status === 'ready' ? (reply.value.people.find((one: { id: string }) => one.id === actor.id) ?? null) : null
  const heldLabels = mine?.chatLabels
  const kept: KeptFlags =
    stored ?? {
      shippedFlags: mine?.shippedFlags ?? null,
      labels: isAnUnreadableMessageLabels(heldLabels) ? [] : (heldLabels ?? []),
      unreadable: isAnUnreadableMessageLabels(heldLabels) ? heldLabels.unreadable : null,
    }
  const flags = theFlagsOf(kept.shippedFlags, kept.labels)
  const defaults = theFlagsOf(null, null)
  const own = flags.own
  const shipped = flags.shipped.map((flag) => ({
    flag,
    stored: kept.shippedFlags?.[flag.id as (typeof SHIPPED_FLAGS)[number]] ?? {},
  }))
  const noMarkStored = kept.shippedFlags?.none ?? {}

  /** Keep both columns, draw what the office kept, and say what was done. An unreadable list is left alone unless this press changed it. */
  const keep = async (next: FlagsToKeep, saying: string): Promise<boolean> => {
    if (mine === null) return false
    setBusy(true)
    setFault(null)
    setSaid(null)
    const writingLabels = next.labels !== kept.labels || kept.unreadable === null
    try {
      const answer = await api.changeParticipant('person', mine.id, {
        shippedFlags: Object.keys(next.shippedFlags ?? {}).length === 0 ? null : next.shippedFlags,
        ...(writingLabels ? { chatLabels: next.labels.length === 0 ? null : next.labels } : {}),
      })
      const answeredLabels = answer.participant.chatLabels
      setStored({
        shippedFlags: answer.participant.shippedFlags ?? null,
        labels: isAnUnreadableMessageLabels(answeredLabels) ? [] : (answeredLabels ?? []),
        unreadable: isAnUnreadableMessageLabels(answeredLabels) ? answeredLabels.unreadable : null,
      })
      setSaid(saying)
      // AND THE CHAT READS ITSELF AGAIN, so the flag's menu and every bubble have the new flags now.
      readTheChatAgain()
      return true
    } catch (err: unknown) {
      setFault({ message: errorMessage(err), fault: faultOf(err) })
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    const text = newWord.trim()
    if (text === '') {
      setSaid(t('settingsPanel.chatLabels.noWord'))
      return
    }
    if (newColour === null) {
      setSaid(t('settingsPanel.chatLabels.noColour'))
      return
    }
    const done = await keep(
      { shippedFlags: kept.shippedFlags, labels: [...kept.labels, { text, colour: newColour }] },
      t('settingsPanel.chatLabels.added', { word: text }),
    )
    if (done) {
      setNewWord('')
      setNewColour(null)
    }
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.chatlabels' }} title={t('settingsPanel.title.chatflags')}>
      <LabelColourStyle />
      <style href="mole-office-chat-labels" precedence="default">
        {CHAT_LABELS_CSS}
      </style>
      <div className="chlab">
        <p className="chlab-what">{t('settingsPanel.chatFlags.what')}</p>
        {reply.status === 'loading' ? <Loading what={t('settingsPanel.chatLabels.loading')} /> : null}
        {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
        {reply.status === 'ready' ? (
          <>
            {kept.unreadable === null ? null : (
              <p className="chlab-what" role="alert">
                {t('settingsPanel.chatLabels.unreadable')}
              </p>
            )}
            <h3 className="chlab-heading">{t('settingsPanel.chatFlags.shipped')}</h3>
            <div className="chlab-list" role="list" aria-label={t('settingsPanel.chatFlags.shipped')}>
              {shipped.map(({ flag, stored: held }) => (
                <ShippedRow
                  // A PRESS THAT CHANGES THE NAME IS A NEW ROW, so its box starts again from what the office kept.
                  key={`${flag.id}:${flag.name}`}
                  flag={flag}
                  held={held}
                  defaults={defaults.shipped.find((one) => one.id === flag.id) ?? defaults.noMark}
                  busy={busy || mine === null}
                  save={(next, saying) => {
                    const nextShipped = { ...(kept.shippedFlags ?? {}) }
                    if (Object.keys(next).length === 0) delete nextShipped[flag.id as (typeof SHIPPED_FLAGS)[number]]
                    else nextShipped[flag.id as (typeof SHIPPED_FLAGS)[number]] = next
                    void keep({ shippedFlags: nextShipped, labels: kept.labels }, saying)
                  }}
                  reset={() => {
                    const nextShipped = { ...(kept.shippedFlags ?? {}) }
                    delete nextShipped[flag.id as (typeof SHIPPED_FLAGS)[number]]
                    void keep({ shippedFlags: nextShipped, labels: kept.labels }, t('settingsPanel.chatFlags.resetDone', { name: defaults.shipped.find((one) => one.id === flag.id)?.name ?? flag.id }))
                  }}
                />
              ))}
              <NoMarkRow
                name={flags.noMark.name}
                defaultName={defaults.noMark.name}
                held={noMarkStored}
                busy={busy || mine === null}
                save={(name) => {
                  const nextShipped = { ...(kept.shippedFlags ?? {}) }
                  if (name === defaults.noMark.name) delete nextShipped.none
                  else nextShipped.none = { name }
                  void keep({ shippedFlags: nextShipped, labels: kept.labels }, t('settingsPanel.chatLabels.savedName', { word: name }))
                }}
                reset={() => {
                  const nextShipped = { ...(kept.shippedFlags ?? {}) }
                  delete nextShipped.none
                  void keep({ shippedFlags: nextShipped, labels: kept.labels }, t('settingsPanel.chatFlags.resetDone', { name: defaults.noMark.name }))
                }}
              />
            </div>
            <h3 className="chlab-heading">{t('settingsPanel.chatFlags.own')}</h3>
            {own.length === 0 && kept.unreadable === null ? <p className="chlab-none">{t('settingsPanel.chatLabels.none')}</p> : null}
            {own.length === 0 ? null : (
              <div className="chlab-list" role="list" aria-label={t('settingsPanel.chatFlags.own')}>
                {own.map((flag, index) => (
                  <OwnRow
                    // A RENAMED FLAG IS A NEW ROW, so its boxes start again from what the office kept.
                    key={`${String(index)}:${flag.name}`}
                    flag={flag}
                    entry={kept.labels[index] as MessageLabelEntry}
                    busy={busy || mine === null}
                    save={(changed) => {
                      void keep(
                        { shippedFlags: kept.shippedFlags, labels: kept.labels.map((one, at) => (at === index ? changed : one)) },
                        t('settingsPanel.chatLabels.saved', { word: changed.text }),
                      )
                    }}
                    remove={() => {
                      void keep(
                        { shippedFlags: kept.shippedFlags, labels: kept.labels.filter((_, at) => at !== index) },
                        t('settingsPanel.chatLabels.removed', { word: flag.name }),
                      )
                    }}
                  />
                ))}
              </div>
            )}
            <form
              className="chlab-new"
              aria-label={t('settingsPanel.chatLabels.new')}
              onSubmit={(event) => {
                event.preventDefault()
                void add()
              }}
            >
              <label className="chlab-field">
                <span className="chlab-name">{word('settingsPanel.chatFlags.name')}</span>
                <input className="chlab-text" type="text" value={newWord} disabled={busy || mine === null} autoComplete="off" maxLength={LONGEST_LABEL} onChange={(event) => setNewWord(event.target.value)} />
              </label>
              <ColourPresses for="flag" chosen={newColour} busy={busy || mine === null} label={word('settingsPanel.chatLabels.colour')} choose={setNewColour} />
              <button className="chlab-button chlab-add" type="submit" disabled={busy || mine === null}>
                {word('settingsPanel.chatLabels.add')}
              </button>
            </form>
          </>
        ) : null}
        {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
        {said === null ? null : (
          <p className="chlab-say" role="status">
            {said}
          </p>
        )}
      </div>
    </Panel>
  )
}

/** The four text things and two colours a shipped flag keeps. An empty box is sent as nothing, which is its default. */
function ShippedRow({ flag, held, defaults, busy, save, reset }: {
  flag: AFlagOfThePersons
  held: AStoredShippedFlag
  defaults: AFlagOfThePersons
  busy: boolean
  save: (next: AStoredShippedFlag, saying: string) => void
  reset: () => void
}) {
  useLanguage()
  const [name, setName] = useState(flag.name)
  const [description, setDescription] = useState(flag.description ?? '')
  const [instruction, setInstruction] = useState(flag.instruction ?? '')
  const [shortWord, setShortWord] = useState(flag.shortWord)
  const [colour, setColour] = useState<LabelColour>(flag.colour)
  const [wordsColour, setWordsColour] = useState<LabelColour>(flag.wordsColour)
  const keep = (): void => {
    const next: AStoredShippedFlag = {}
    const keptName = name.trim()
    const keptDescription = description.trim()
    const keptInstruction = instruction.trim()
    const keptShort = shortWord.trim()
    if (keptName !== '' && keptName !== defaults.name) next.name = keptName
    if (keptDescription !== '') next.description = keptDescription
    if (keptInstruction !== '' && keptInstruction !== defaults.instruction) next.instruction = keptInstruction
    if (keptShort !== '' && keptShort !== defaults.shortWord) next.shortWord = keptShort
    if (colour !== THE_SHIPPED_DEFAULT_COLOUR) next.colour = colour
    if (wordsColour !== (next.colour ?? THE_SHIPPED_DEFAULT_COLOUR)) next.wordsColour = wordsColour
    save(next, t('settingsPanel.chatFlags.saved', { name: keptName === '' ? defaults.name : keptName }))
  }
  return (
    <div className="chlab-one chlab-flag" role="listitem" data-kind="shipped" data-flag={flag.id}>
      <div className="chlab-flag-head">
        <span className="chlab-badge px-label-ink" data-colour={flag.colour} aria-hidden="true" />
        <span className="chlab-flag-kind">{t('settingsPanel.chatFlags.shippedFlag')}</span>
      </div>
      <TextLine field="name" label={word('settingsPanel.chatFlags.name')} value={name} longest={LONGEST_LABEL} busy={busy} set={setName} />
      <TextLine field="description" label={word('settingsPanel.chatFlags.description')} value={description} longest={LONGEST_LABEL_DESCRIPTION} busy={busy} set={setDescription} />
      <TextLine field="instruction" label={word('settingsPanel.chatFlags.instruction')} value={instruction} longest={LONGEST_LABEL_INSTRUCTION} busy={busy} set={setInstruction} multiline />
      <TextLine field="short-word" label={word('settingsPanel.chatFlags.shortWord')} value={shortWord} longest={LONGEST_LABEL} busy={busy} set={setShortWord} />
      <ColourPresses for="flag" chosen={colour} busy={busy} label={word('settingsPanel.chatFlags.colour')} choose={(chosen) => {
        if (wordsColour === colour) setWordsColour(chosen)
        setColour(chosen)
      }} />
      <ColourPresses for="words" chosen={wordsColour} busy={busy} label={word('settingsPanel.chatFlags.wordsColour')} choose={setWordsColour} />
      <div className="chlab-presses">
        <button className="chlab-button chlab-save" type="button" disabled={busy} onClick={keep}>
          {word('settingsPanel.chatLabels.save')}
        </button>
        <button className="chlab-button chlab-reset" type="button" disabled={busy || Object.keys(held).length === 0} onClick={reset}>
          {word('settingsPanel.chatFlags.reset')}
        </button>
      </div>
    </div>
  )
}

/** The menu's 'No mark' entry: a name only, because it hands an agent nothing. */
function NoMarkRow({ name: keptName, defaultName, held, busy, save, reset }: {
  name: string
  defaultName: string
  held: { name?: string }
  busy: boolean
  save: (name: string) => void
  reset: () => void
}) {
  useLanguage()
  const [name, setName] = useState(keptName)
  return (
    <div className="chlab-one chlab-flag" role="listitem" data-kind="none" data-flag="none">
      <div className="chlab-flag-head">
        <span className="chlab-badge" aria-hidden="true" />
        <span className="chlab-flag-kind">{t('settingsPanel.chatFlags.noMark')}</span>
      </div>
      <TextLine field="name" label={word('settingsPanel.chatFlags.name')} value={name} longest={LONGEST_LABEL} busy={busy} set={setName} />
      <div className="chlab-presses">
        <button className="chlab-button chlab-save" type="button" disabled={busy} onClick={() => save(name.trim() === '' ? defaultName : name.trim())}>
          {word('settingsPanel.chatLabels.save')}
        </button>
        <button className="chlab-button chlab-reset" type="button" disabled={busy || held.name === undefined} onClick={reset}>
          {word('settingsPanel.chatFlags.resetNoMark')}
        </button>
      </div>
    </div>
  )
}

/** One of the person's own flags: its word, its four things, its two colours, Save and Remove. */
function OwnRow({ flag, entry, busy, save, remove }: {
  flag: AFlagOfThePersons
  entry: MessageLabelEntry
  busy: boolean
  save: (changed: MessageLabelEntry) => void
  remove: () => void
}) {
  useLanguage()
  const [text, setText] = useState(flag.name)
  const [description, setDescription] = useState(flag.description ?? '')
  const [instruction, setInstruction] = useState(flag.instruction ?? '')
  const [shortWord, setShortWord] = useState(flag.shortWord)
  const [colour, setColour] = useState<LabelColour>(flag.colour)
  const [wordsColour, setWordsColour] = useState<LabelColour>(flag.wordsColour)
  const keep = (): void => {
    const changed: MessageLabelEntry = { text: text.trim() === '' ? entry.text : text.trim(), colour }
    if (description.trim() !== '') changed.description = description.trim()
    if (instruction.trim() !== '') changed.instruction = instruction.trim()
    const keptShort = shortWord.trim()
    // AN UNTOUCHED SHORT WORD FOLLOWS THE FLAG'S WORD, whether the person renamed it or not: it is not stored when it
    // is either the word it had or the word it now has.
    if (keptShort !== '' && keptShort !== changed.text && keptShort !== entry.text) changed.shortWord = keptShort
    if (wordsColour !== colour) changed.wordsColour = wordsColour
    save(changed)
  }
  return (
    <div className="chlab-one chlab-flag" role="listitem" data-kind="own" data-flag={flag.id}>
      <div className="chlab-flag-head">
        <span className="chlab-badge px-label-ink" data-colour={flag.colour} aria-hidden="true" />
        <span className="chlab-flag-kind">{t('settingsPanel.chatFlags.ownFlag')}</span>
      </div>
      <TextLine field="name" label={word('settingsPanel.chatFlags.name')} value={text} longest={LONGEST_LABEL} busy={busy} set={setText} />
      <TextLine field="description" label={word('settingsPanel.chatFlags.description')} value={description} longest={LONGEST_LABEL_DESCRIPTION} busy={busy} set={setDescription} />
      <TextLine field="instruction" label={word('settingsPanel.chatFlags.instruction')} value={instruction} longest={LONGEST_LABEL_INSTRUCTION} busy={busy} set={setInstruction} multiline />
      <TextLine field="short-word" label={word('settingsPanel.chatFlags.shortWord')} value={shortWord} longest={LONGEST_LABEL} busy={busy} set={setShortWord} />
      <ColourPresses for="flag" chosen={colour} busy={busy} label={word('settingsPanel.chatLabels.colour')} choose={(chosen) => {
        // THE WORDS COLOUR FOLLOWS THE FLAG COLOUR UNTIL THE PERSON CHOOSES ONE OF THEIR OWN.
        if (wordsColour === colour) setWordsColour(chosen)
        setColour(chosen)
      }} />
      <ColourPresses for="words" chosen={wordsColour} busy={busy} label={word('settingsPanel.chatFlags.wordsColour')} choose={setWordsColour} />
      <div className="chlab-presses">
        <button className="chlab-button chlab-save" type="button" disabled={busy} onClick={keep}>
          {word('settingsPanel.chatLabels.save')}
        </button>
        <button className="chlab-button chlab-remove" type="button" disabled={busy} onClick={remove}>
          {word('settingsPanel.chatLabels.remove')}
        </button>
      </div>
    </div>
  )
}

/** One line of text in a flag's row. */
function TextLine({ field, label, value, longest, busy, set, multiline = false }: { field: string; label: string; value: string; longest: number; busy: boolean; set: (text: string) => void; multiline?: boolean }) {
  return (
    <label className="chlab-field" data-field={field}>
      <span className="chlab-name">{label}</span>
      {multiline ? <textarea className="chlab-text chlab-text-wraps" rows={2} value={value} maxLength={longest} disabled={busy} autoComplete="off" onChange={(event) => set(event.target.value.replace(/[\r\n]+/g, ' '))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const at = event.currentTarget.selectionStart; set(`${value.slice(0, at)} ${value.slice(at)}`) } }} /> : <input className="chlab-text" type="text" value={value} maxLength={longest} disabled={busy} autoComplete="off" onChange={(event) => set(event.target.value)} />}
    </label>
  )
}

/** The colours the page offers, one press each, the chosen one pressed. */
function ColourPresses({ for: forWhat, chosen, busy, label, choose }: { for: 'flag' | 'words'; chosen: LabelColour | null; busy: boolean; label: string; choose: (colour: LabelColour) => void }) {
  return (
    <span className="chlab-pick" data-colour-for={forWhat}>
      <span className="chlab-name" aria-hidden="true">
        {label}
      </span>
      <span className="chlab-colours" role="group" aria-label={label}>
        {LABEL_COLOURS.map((colour) => {
          const name = word(`chatLabels.colour.${colour}`)
          return (
            <button
              key={colour}
              type="button"
              className="chlab-colour px-label-ink"
              data-colour={colour}
              aria-pressed={chosen === colour ? 'true' : 'false'}
              aria-label={name}
              title={name}
              disabled={busy}
              onClick={() => choose(colour)}
            />
          )
        })}
      </span>
    </span>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else. The rows wrap
 * rather than shrink, so at any width the words, boxes and presses stay inside the card.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const CHAT_LABELS_CSS = `
.chlab { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.chlab-what, .chlab-none, .chlab-say { margin: 0; max-width: var(--measure-in-box); overflow-wrap: anywhere; color: var(--text-2); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.chlab-heading { margin: 0; color: var(--text-2); font: 700 var(--fs-1)/var(--lh-tight) var(--font-ui); text-transform: uppercase; letter-spacing: .04em; }
.chlab-list { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.chlab-one, .chlab-new { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--pad); min-width: 0; }
.chlab-one { padding-bottom: var(--pad); border-bottom: var(--border-w) solid var(--border); }
.chlab-new { padding-top: var(--pad); }
.chlab-flag { align-items: flex-start; }
.chlab-flag-head { flex: 1 1 100%; display: flex; align-items: center; gap: 0.4rem; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.chlab-flag-kind { text-transform: uppercase; letter-spacing: .04em; font-size: 0.65rem; }
.chlab-badge { flex: none; width: 0.7rem; height: 0.7rem; border-radius: 50%; border: var(--border-w) solid var(--border-strong); background: var(--panel-2); }
.chlab-badge[data-colour] { border-color: var(--label-ink); background: var(--label-ink); }
.chlab-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 10rem; min-width: 0; }
.chlab-pick { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; flex: 1 1 100%; }
.chlab-presses { display: flex; flex-wrap: wrap; gap: var(--pad); align-items: flex-end; flex: 1 1 100%; }
.chlab-name { color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.chlab-text { box-sizing: border-box; width: 100%; min-width: 0; min-height: var(--row-h); padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.chlab-text-wraps { min-height: calc(var(--row-h) * 2); resize: vertical; }
.chlab-colours { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.chlab-colour {
  box-sizing: border-box; width: 28px; height: 28px; padding: 0;
  display: inline-grid; place-items: center;
  border: var(--border-w) solid var(--border-strong); border-radius: 50%;
  background: var(--panel-2); color: var(--label-ink); cursor: pointer;
}
.chlab-colour::before { content: ""; width: 14px; height: 14px; border-radius: 50%; background: currentColor; }
.chlab-colour[aria-pressed="true"] { border: 2px solid currentColor; background: var(--label-soft); }
.chlab-colour[aria-pressed="true"]::before { width: 16px; height: 16px; }
.chlab-button { min-height: var(--row-h); max-width: 100%; padding: 2px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); box-shadow: var(--button-shadow); font: var(--button-weight) var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
.chlab-button:hover:not(:disabled), .chlab-colour:hover:not(:disabled) { background: var(--hover); }
.chlab-remove { color: var(--st-failed); }
.chlab-reset { color: var(--text-2); }
.chlab-text:focus-visible, .chlab-button:focus-visible, .chlab-colour:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.chlab-text:disabled, .chlab-button:disabled, .chlab-colour:disabled { cursor: default; opacity: .6; }
`
