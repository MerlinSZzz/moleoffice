// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY SLOTS, DRAWN AFTER THE KEYS SECTION OF THE SETTINGS PAGE. The owner adds or removes a key for any routed
 * provider with a press, and the provider router reads the file for every request it carries. The OpenCode Go slots are
 * the ones it turns between; the others always use their first slot.
 *
 * Each slot is one row: its provider, its label, its id and the start of its key's sha256, and a press to remove it. A
 * key is pasted once into the box below, goes to the key slots file, and is never drawn back: the server never returns
 * one, and the box is cleared after the write. It wears the keys section's rows, because a slot is the same kind of
 * thing.
 *
 * A READING THE SERVER REFUSES WITH 409 is a state the office is in, not a fault of the page: the router is off, or the
 * file is one the router would not read. Its sentence is drawn as it came, and there is nothing to add until it changes.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import type { KeySlotOnScreen, KeySlotsReading, KeySlotsProvider } from '@shared/go-slots.ts'
import { theProviderTheAddRowStartsOn } from '@shared/go-slots.ts'
import { content, t } from '@shared/i18n.ts'
import { ApiError, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { KEYS_CSS } from './KeysPanel.tsx'
import { ErrorNote, Loading, useAsync } from './ui.tsx'

type Read = { slots: KeySlotsReading } | { refused: string }

async function theSlotsOrWhyNot(): Promise<Read> {
  try {
    return { slots: await api.keySlots() }
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { refused: err.message }
    throw err
  }
}

export function KeySlotsPanel() {
  useLanguage()
  const [state, readAgain] = useAsync(theSlotsOrWhyNot, [])
  return (
    <div className="keys-half go-slots" data-section="key-slots">
      <style href="mole-office-keys" precedence="default">
        {KEYS_CSS}
      </style>
      <style href="mole-office-go-slots" precedence="default">
        {GO_SLOTS_CSS}
      </style>
      <h3 className="keys-heading">{t('settingsPanel.keySlots.heading')}</h3>
      <p className="keys-lead">{t('settingsPanel.keySlots.lead')}</p>
      {state.status === 'loading' ? (
        <Loading what={t('settingsPanel.keySlots.loading')} />
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} />
      ) : 'refused' in state.value ? (
        <p className="keys-says" lang="en">{state.value.refused}</p>
      ) : (
        <Slots said={state.value.slots} onChanged={readAgain} />
      )}
    </div>
  )
}

/** The name the Settings page imports, kept from the panel's first life as the OpenCode Go slots. */
export const GoSlotsPanel = KeySlotsPanel

function Slots({ said, onChanged }: { said: KeySlotsReading; onChanged: () => void }) {
  const providers: KeySlotsProvider[] = said.providers ?? []
  return (
    <>
      {said.slots.length === 0 ? null : (
        <div className="keys-rows">
          {said.slots.map((one) => (
            <SlotRow key={`${one.id}:${one.mark}`} one={one} onChanged={onChanged} />
          ))}
        </div>
      )}
      <AddASlot providers={providers} onChanged={onChanged} />
      <p className="keys-says" lang="en">{said.says}</p>
    </>
  )
}

/** One slot: its provider, label, id and key's mark, and a press to remove it. */
function SlotRow({ one, onChanged }: { one: KeySlotOnScreen; onChanged: () => void }) {
  useLanguage()
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = (): void => {
    setBusy(true)
    setFault(null)
    api.removeAKeySlot(one.id)
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
    <div className="keys-row" data-slot={one.id}>
      <div className="keys-words">
        <p className="keys-label">{content(one.label)}</p>
        <dl className="go-slot-facts">
          <dt>{t('settingsPanel.keySlots.provider')}</dt>
          <dd>{content(one.providerName)}</dd>
          <dt>{t('settingsPanel.goSlots.slot')}</dt>
          <dd><code>{content(one.id)}</code></dd>
          <dt>{t('settingsPanel.goSlots.keyMark')}</dt>
          <dd><code>{content(one.mark)}</code></dd>
        </dl>
      </div>
      <div className="keys-control">
        <button
          type="button"
          className="keys-press keys-clear"
          onClick={remove}
          disabled={busy}
          aria-label={t('settingsPanel.goSlots.removeLabel', { label: one.label })}
        >
          {t(settingsControlWord('settings.keys', 'settingsPanel.goSlots.remove'))}
        </button>
      </div>
      {fault === null ? null : <p className="keys-refuse">{fault}</p>}
    </div>
  )
}

/** The provider, name and key of a new slot, and the press that writes it. The boxes are cleared once it is written. */
export function AddASlot({ providers, onChanged }: { providers: KeySlotsProvider[]; onChanged: () => void }) {
  useLanguage()
  const [provider, setProvider] = useState(theProviderTheAddRowStartsOn(providers))
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const add = (): void => {
    setBusy(true)
    setFault(null)
    api.addAKeySlot(provider, label, key)
      .then(() => {
        // THE KEY BOX IS CLEARED because the key is written and is never read back.
        setLabel('')
        setKey('')
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
    <div className="keys-row go-slot-add">
      <div className="keys-control keys-stack">
        <label className="keys-box" htmlFor="key-slot-provider">
          <span className="keys-box-name">{t('settingsPanel.keySlots.provider')}</span>
          <select
            id="key-slot-provider"
            className="keys-input"
            value={provider}
            disabled={busy}
            onChange={(event) => {
              setProvider(event.target.value)
            }}
          >
            {(providers.length === 0 ? [{ id: 'opencode-go', named: 'OpenCode Go' }] : providers).map((one) => (
              <option key={one.id} value={one.id}>{content(one.named)}</option>
            ))}
          </select>
        </label>
        <label className="keys-box" htmlFor="go-slot-name">
          <span className="keys-box-name">{t(settingsControlWord('settings.keys', 'settingsPanel.goSlots.name'))}</span>
          <input
            id="go-slot-name"
            className="keys-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={label}
            disabled={busy}
            onChange={(event) => {
              setLabel(event.target.value)
            }}
          />
        </label>
        <label className="keys-box" htmlFor="go-slot-key">
          <span className="keys-box-name">{t(settingsControlWord('settings.keys', 'settingsPanel.goSlots.key'))}</span>
          <input
            id="go-slot-key"
            className="keys-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            disabled={busy}
            onChange={(event) => {
              setKey(event.target.value)
            }}
          />
        </label>
        <div className="keys-presses">
          <button type="button" className="keys-press keys-set" onClick={add} disabled={busy || label.trim() === '' || key.trim() === ''}>
            {t(settingsControlWord('settings.keys', 'settingsPanel.goSlots.add'))}
          </button>
        </div>
      </div>
      {fault === null ? null : <p className="keys-refuse">{fault}</p>}
    </div>
  )
}

/**
 * The rows are the keys section's own; this adds the gap after that section, the slot's id-and-mark list, and lets the
 * boxes of the add row narrow, which at 390 were two pixels wider than the window. The add row's column is one line at
 * 1440 and at 990; below 60rem each box takes its own full-width line, because a column that wraps makes each box as
 * wide as the widest box rather than as wide as the column.
 */
const GO_SLOTS_CSS = `
.go-slots { margin-top: var(--gut); }
.go-slot-add .keys-control { min-width: 0; flex-wrap: wrap; }
.go-slot-add .keys-input { min-width: 0; }
.go-slot-facts {
  display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px var(--pad); margin: 0;
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.go-slot-facts dt { color: var(--text-3); }
.go-slot-facts dd { margin: 0; min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
.go-slot-facts code { font-family: var(--font-mono, monospace); }
@media (max-width: 60rem) {
  .go-slot-add .keys-stack .keys-box { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .go-slot-add .keys-stack .keys-input { width: 100%; max-width: 100%; }
}
`
