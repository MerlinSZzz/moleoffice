// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CASTING'S NATIVE FIELDS, AND THE PRESSES THAT CHANGE OR CLEAR THEM.
 *
 * Native fields are the model, provider and variant the program itself is given, kept apart from the
 * office's model label. A row may also name a row of the provider table, whose address and key entry a
 * check takes, and a row can be held after the program refused its native selection. The page shows all
 * of them in the line under the row; this form is the control that changes them, and the add form draws
 * the same boxes through `CastingNativeInputs`.
 *
 * The page does not repeat the rules for which program takes which field. The form stores what it is
 * given, and a run's start checks it, as the form says in its own words. The server refuses a malformed
 * value, and that refusal is drawn by the row's own act under the row, never a second time here.
 *
 * The form sits in a wide table cell. The page's own cast-native-selection class keeps its width to the
 * viewport, as the line under the row already does, so its fields and presses stay in view at 390.
 */
import { useState } from 'react'

import type { CastingNative, CastingRow } from '@shared/casting.ts'
import { content, t } from '@shared/i18n.ts'
import type { ProviderRow } from '@shared/the-provider-table.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { Btn } from './ui.tsx'

/** The three native boxes and the provider row as they are typed, before trimming. */
export interface CastingNativeInputsValue {
  model: string
  provider: string
  variant: string
  providerRow: string
}

/** What nativeFromInputs answers: the selection to send, or that the native model is missing. */
export type CastingNativeFromInputs =
  | { kind: 'native'; native: CastingNative | null }
  | { kind: 'modelNeeded' }

/**
 * THE ONE RULE FOR THE NATIVE BOXES. Trim every value. All four empty means no native fields.
 * A model empty while a provider, a variant or a provider row is not means the model is needed. An
 * empty provider or variant is null, and an empty provider row is left out. The row's form and the
 * add form both call this.
 */
export function nativeFromInputs(value: CastingNativeInputsValue): CastingNativeFromInputs {
  const model = value.model.trim()
  const provider = value.provider.trim()
  const variant = value.variant.trim()
  const providerRow = value.providerRow.trim()
  if (model === '' && provider === '' && variant === '' && providerRow === '') return { kind: 'native', native: null }
  if (model === '') return { kind: 'modelNeeded' }
  return {
    kind: 'native',
    native: { model, provider: provider === '' ? null : provider, variant: variant === '' ? null : variant, ...(providerRow === '' ? {} : { providerRow }) },
  }
}

/**
 * THE NATIVE FIELDS A ROW'S SAVE SENDS: the three boxes, with the row's stored settings carried through unchanged. A
 * native write replaces the row's native whole, and this form shows no settings, so leaving them out would drop them.
 */
export function theRowsNativeToSave(native: CastingNative, row: CastingRow): CastingNative {
  const settings = row.native?.settings
  return settings === undefined ? native : { ...native, settings }
}

/** The three labelled native boxes, drawn by the row's native form and by the add form. */
export function CastingNativeInputs({
  id,
  value,
  busy,
  providers = [],
  providersUnread = false,
  onChange,
}: {
  id: string
  value: CastingNativeInputsValue
  busy: boolean
  /** The provider rows the provider table door answers, offered by their id and name. */
  providers?: readonly ProviderRow[]
  /** True when the provider table door could not be read, so the form says so rather than offering only none. */
  providersUnread?: boolean
  onChange: (value: CastingNativeInputsValue) => void
}) {
  useLanguage()
  const set = (part: keyof CastingNativeInputsValue, word: string) => onChange({ ...value, [part]: word })
  const storedMissing = value.providerRow !== '' && !providers.some((one) => one.id === value.providerRow)
  return (
    <>
      <label className="cast-box" htmlFor={`${id}-nativeModelName`}>
        <span className="cast-box-name">{t('casting.nativeModel')}</span>
        <input
          id={`${id}-nativeModelName`}
          className="cast-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value.model}
          disabled={busy}
          onChange={(event) => set('model', event.target.value)}
        />
      </label>
      <label className="cast-box" htmlFor={`${id}-nativeProvider`}>
        <span className="cast-box-name">{t('casting.nativeProvider')}</span>
        <input
          id={`${id}-nativeProvider`}
          className="cast-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value.provider}
          disabled={busy}
          onChange={(event) => set('provider', event.target.value)}
        />
      </label>
      {providersUnread && value.providerRow === '' ? (
        <p className="cast-said">{t('casting.providersUnread')}</p>
      ) : (
        <label className="cast-box" htmlFor={`${id}-nativeProviderRow`}>
          <span className="cast-box-name">{t('casting.providerRowChoice')}</span>
          <select
            id={`${id}-nativeProviderRow`}
            className="cast-input"
            value={value.providerRow}
            disabled={busy}
            onChange={(event) => set('providerRow', event.target.value)}
          >
            <option value="">{t('casting.providerRowNone')}</option>
            {storedMissing ? (
              <option value={value.providerRow}>
                {content(value.providerRow)} · {t('casting.providerRowMissing')}
              </option>
            ) : null}
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {content(provider.name)} ({content(provider.id)})
              </option>
            ))}
          </select>
        </label>
      )}
      {providersUnread && value.providerRow !== '' ? <p className="cast-said">{t('casting.providersUnread')}</p> : null}
      <label className="cast-box" htmlFor={`${id}-nativeVariant`}>
        <span className="cast-box-name">{t('casting.nativeVariant')}</span>
        <input
          id={`${id}-nativeVariant`}
          className="cast-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value.variant}
          disabled={busy}
          onChange={(event) => set('variant', event.target.value)}
        />
      </label>
    </>
  )
}

export function CastingNativeForm({
  row,
  busy,
  providers = [],
  providersUnread = false,
  act,
}: {
  row: CastingRow
  busy: boolean
  /** The provider rows the provider table door answers, for the row's own choice. */
  providers?: readonly ProviderRow[]
  /** True when the provider table door could not be read, so the form says so. */
  providersUnread?: boolean
  act: (doIt: () => Promise<unknown>) => void
}) {
  useLanguage()
  const [inputs, setInputs] = useState<CastingNativeInputsValue>(() => ({
    model: row.native?.model ?? '',
    provider: row.native?.provider ?? '',
    variant: row.native?.variant ?? '',
    providerRow: row.native?.providerRow ?? '',
  }))
  const [said, setSaid] = useState<string | null>(null)

  const save = (): void => {
    const answer = nativeFromInputs(inputs)
    if (answer.kind === 'native' && answer.native !== null) {
      setSaid(null)
      const native = theRowsNativeToSave(answer.native, row)
      act(() => api.changeCastingNative(row.id, native))
      return
    }
    // THE ROW'S FORM CLEARS ONLY WITH ITS OWN PRESS, so an all-empty Save still asks for the model.
    setSaid(t('casting.nativeModelNeeded'))
  }

  const id = `cast-native-${String(row.id)}`
  return (
    <div className="cast-native-selection">
      <div className="cast-form">
        <p className="cast-said">{t('casting.nativeWhat')}</p>
        <CastingNativeInputs id={id} value={inputs} busy={busy} providers={providers} providersUnread={providersUnread} onChange={setInputs} />
        <p className="cast-said">{t('casting.nativeEmpties')}</p>
        <div className="cast-form-presses">
          <Btn variant="primary" size="sm" onClick={save} pending={busy}>
            {t('casting.save')}
          </Btn>
          {row.native == null ? null : (
            <Btn size="sm" variant="danger" pending={busy} onClick={() => act(() => api.changeCastingNative(row.id, null))}>
              {t('casting.nativeClear')}
            </Btn>
          )}
          {row.hold == null ? null : (
            <Btn size="sm" variant="secondary" pending={busy} onClick={() => act(() => api.clearCastingHold(row.id))}>
              {t('casting.nativeClearHold')}
            </Btn>
          )}
        </div>
        {said === null ? null : <p className="cast-said">{said}</p>}
      </div>
    </div>
  )
}
