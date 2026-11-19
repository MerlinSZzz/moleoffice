// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `The model each run uses` — WHICH MODEL THE OFFICE'S RUNS GET, AND WHERE THAT CAME FROM. Criterion U2.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ON IT
 * ---------------------------------------------------------------------------------------
 *
 * One group: the run the office starts by itself to answer a message. A notice starts no run, so
 * it has no row, and one line says so.
 *
 * A BUILDER'S MODEL FOR EACH ROLE, AND THE CHECK'S, ARE ON THE CASTING PAGE.
 * They were rows here until migration 0189 moved them into the Casting table, so one fact is kept in
 * one place. Where they were, one line says so, with a link to the Casting page.
 *
 * The row shows what is set here, what a run there gets now and why, a press to save and a press
 * to clear. The server writes every sentence about what is in force (`theModelARunGets`), so this
 * file draws and never works out a layer itself. An agent's own model is set on its profile.
 *
 * ---------------------------------------------------------------------------------------
 * A PRESS BY AN AGENT IS REFUSED, AND THE PANEL SAYS SO IN WORDS
 * ---------------------------------------------------------------------------------------
 *
 * Both writes are the owner's own. The server refuses an agent with a 403 whose sentence says who
 * may, and the row draws that sentence where the press was made.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useEffect, useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import {
  type RunModelPair,
  type RunModelSlotReading,
  type RunModelsReading,
  type TheRuntimesTheWorkerGives,
} from '@shared/run-models.ts'
import { Absence, ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { RouteLink, castingPath } from './router.tsx'
import { TieredPress } from './TieredPress.tsx'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'

/** How long the Clear press offers to write the cleared choice back. */
const CLEAR_UNDO_MS = 10_000

/** Where the one slot is, in words. The English is `theSlotInWords` in @shared/run-models.ts, read through a getter. */
function theSlotInThePagesWords(): string {
  return t('settingsPanel.runModels.slot.conversation')
}

export function RunModelsPanel() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.runModels(), [])
  if (state.status === 'loading') return <Loading what={t('settingsPanel.runModels.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.runmodels' }} title={t('settingsPanel.title.runmodels')}>
      <style href="mole-office-run-models" precedence="default">
        {RUN_MODELS_CSS}
      </style>
      <RunModels said={state.value} onChanged={readAgain} />
    </Panel>
  )
}

function RunModels({ said, onChanged }: { said: RunModelsReading; onChanged: () => void }) {
  useLanguage()
  return (
    <div className="rm">
      <p className="rm-lead">{t('settingsPanel.runModels.lead')}</p>
      <div className="rm-half">
        <h3 className="rm-heading">{t('settingsPanel.runModels.placesHeading')}</h3>
        <p className="rm-note">{t('settingsPanel.runModels.notices')}</p>
        <div className="rm-rows">
          {said.places.map((one) => (
            // KEYED BY THE SLOT ALONE, so a Clear's offer to undo outlives the reading that follows it.
            <SlotRow key={one.slot.name} one={one} gives={said.theWorkerGives} onChanged={onChanged} />
          ))}
        </div>
      </div>
      <div className="rm-half">
        {/* WHERE THE BUILDER ROWS AND THE CHECK WERE: one line and a link. */}
        <p className="rm-note">
          {t('settingsPanel.runModels.castingLine')} <RouteLink to={castingPath()}>{t('settingsPanel.runModels.castingLink')}</RouteLink>
        </p>
      </div>
    </div>
  )
}

/** A choice as a person reads it: the model, the runtime it is for, and a reasoning effort. */
function pairInWords(pair: RunModelPair): string {
  return aChoiceInWords(pair.model, pair.runtime ?? null, pair.variant ?? null)
}

/** A model, the runtime it is on, and a reasoning effort, each only where there is one. */
function aChoiceInWords(model: string, runtime: string | null, variant: string | null): string {
  const onRuntime = runtime === null ? content(model) : t('settingsPanel.runModels.onRuntime', { model, runtime })
  return variant === null ? onRuntime : t('settingsPanel.runModels.withEffort', { choice: onRuntime, variant })
}

/** One place or role: what is set, what is in force, and the presses. */
function SlotRow({ one, gives, onChanged }: { one: RunModelSlotReading; gives: TheRuntimesTheWorkerGives; onChanged: () => void }) {
  useLanguage()
  // THE RUNTIMES OFFERED AND THE EFFORT BOX COME FROM THE READING: the table the adapters read, which the door refuses by too.
  const choices: readonly string[] = gives.aModelTo
  const [runtime, setRuntime] = useState<string>(one.set?.runtime ?? choices[0] ?? '')
  const [model, setModel] = useState(one.set?.model ?? '')
  const [variant, setVariant] = useState(one.set?.variant ?? '')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  // THE BOXES SHOW WHAT IS STORED after every reading, now that the row outlives a change to it.
  const storedChoice = JSON.stringify(one.set)
  useEffect(() => {
    setRuntime(one.set?.runtime ?? choices[0] ?? '')
    setModel(one.set?.model ?? '')
    setVariant(one.set?.variant ?? '')
    // Only a new stored choice resets the boxes; `choices` is worked out from the same reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedChoice])
  const takesAVariant = (gives.aVariantTo as readonly string[]).includes(runtime)
  const where = theSlotInThePagesWords()
  const id = `rm-${one.slot.in}-${one.slot.name}`

  const theChange = (pair: RunModelPair | null) => ({ places: { [one.slot.name]: pair } })

  const write = (pair: RunModelPair | null): void => {
    setBusy(true)
    setFault(null)
    api
      .setRunModels(theChange(pair))
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

  const save = (): void => {
    if (model.trim() === '') {
      setFault(t('settingsPanel.runModels.typeFirst'))
      return
    }
    write({
      runtime: runtime as NonNullable<RunModelPair['runtime']>,
      model,
      ...(takesAVariant && variant.trim() !== '' ? { variant } : {}),
    })
  }

  return (
    <div className="rm-row" data-slot={`${one.slot.in}.${one.slot.name}`}>
      <div className="rm-words">
        <p className="rm-label">{where.charAt(0).toUpperCase() + where.slice(1)}</p>
        <p className="rm-set">
          {t('settingsPanel.runModels.setHere')}{' '}
          {one.set === null ? (
            <Absence word={t('settingsPanel.runModels.nothingSet')} title={t('settingsPanel.runModels.nothingSetTitle')} />
          ) : (
            pairInWords(one.set)
          )}
        </p>
        <p className="rm-inforce">
          {t('settingsPanel.runModels.getsNow')}{' '}
          {one.inForce.model === null ? (
            <Absence word={t('settingsPanel.runModels.noModel')} title={one.inForce.says} />
          ) : (
            aChoiceInWords(one.inForce.model, one.inForce.runtime, one.inForce.variant)
          )}
        </p>
        <p className="rm-says" lang="en">{content(one.inForce.says)}</p>
      </div>
      <div className="rm-control">
        <label className="rm-box" htmlFor={`${id}-runtime`}>
            <span className="rm-box-name">{t(settingsControlWord('settings.runmodels', 'settingsPanel.runModels.runtime'))}</span>
            <select
              id={`${id}-runtime`}
              className="rm-input rm-select"
              value={runtime}
              disabled={busy}
              onChange={(event) => {
                setRuntime(event.target.value)
              }}
            >
              {choices.map((word) => (
                <option key={word} value={word}>
                  {content(word)}
                </option>
              ))}
            </select>
          </label>
        <label className="rm-box" htmlFor={`${id}-model`}>
          <span className="rm-box-name">{t(settingsControlWord('settings.runmodels', 'settingsPanel.runModels.model'))}</span>
          <input
            id={`${id}-model`}
            className="rm-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={model}
            disabled={busy}
            onChange={(event) => {
              setModel(event.target.value)
            }}
          />
        </label>
        {takesAVariant ? (
          <label className="rm-box" htmlFor={`${id}-variant`}>
            <span className="rm-box-name">{t(settingsControlWord('settings.runmodels', 'settingsPanel.runModels.effort'))}</span>
            <input
              id={`${id}-variant`}
              className="rm-input rm-short"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={variant}
              disabled={busy}
              onChange={(event) => {
                setVariant(event.target.value)
              }}
            />
          </label>
        ) : null}
        <button type="button" className="rm-press" onClick={save} disabled={busy}>
          {t(settingsControlWord('settings.runmodels', 'settingsPanel.runModels.save'))}
        </button>
        {/* UNDO FOR A TIME: the press keeps the saved choice it clears, and the undo writes
            that exact choice back. */}
        <TieredPress
          tier="undo"
          available={one.set !== null}
          disabled={busy}
          windowMs={CLEAR_UNDO_MS}
          press={t(settingsControlWord('settings.runmodels', 'settingsPanel.runModels.clear'))}
          pending={t('settingsPanel.runModels.clearing')}
          done={t('settingsPanel.runModels.cleared')}
          undo={(seconds) => t(settingsControlWord('settings.runmodels', 'settingsPanel.runModels.undo'), { n: seconds })}
          undoing={t('settingsPanel.runModels.undoing')}
          onPress={async () => {
            const saved = one.set
            if (saved === null) throw new Error(t('settingsPanel.runModels.nothingToClear'))
            setFault(null)
            await api.setRunModels(theChange(null))
            onChanged()
            return {
              remainingMs: CLEAR_UNDO_MS,
              undo: async () => {
                await api.setRunModels(theChange(saved))
                onChanged()
              },
            }
          }}
        />
      </div>
      {fault === null ? null : <p className="rm-refuse">{fault}</p>}
    </div>
  )
}

/** The section's own rules. Every value is a token, so a preset swap re-skins it with everything else. */
const RUN_MODELS_CSS = `
.rm { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.rm-lead { margin: 0; max-width: var(--measure-in-box); font: var(--fs-2)/var(--lh-read) var(--font-ui); color: var(--text-2); }
.rm-half { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; padding-top: var(--gut); border-top: var(--border-w) solid var(--border); }
.rm-heading { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.rm-note { margin: 0; max-width: var(--measure-in-box); font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text-3); }
.rm-rows { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rm-row {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px var(--gut);
  padding: var(--pad); min-width: 0;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel);
}
.rm-words { flex: 1 1 22rem; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rm-label { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.rm-set, .rm-inforce { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); overflow-wrap: anywhere; }
.rm-says { margin: 0; max-width: var(--measure-in-box); font: var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-3); overflow-wrap: anywhere; }
.rm-control { flex: 0 1 auto; max-width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.rm-box { display: flex; align-items: center; gap: var(--pad); min-width: 0; max-width: 100%; }
.rm-box-name { font-size: var(--fs-2); color: var(--text-2); }
.rm-input {
  width: 14rem; max-width: 100%; min-width: 0; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.rm-select { width: auto; }
.rm-short { width: 7rem; }
.rm-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.rm-press {
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.rm-press:hover:not(:disabled) { background: var(--hover); }
.rm-press:disabled { color: var(--text-3); cursor: default; }
.rm-refuse {
  flex: 1 1 100%; margin: 0; max-width: 60ch; padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .rm-words { flex: 1 1 100%; }
  .rm-control { flex: 1 1 100%; }
  .rm-box { flex: 1 1 100%; }
  .rm-input { flex: 1 1 auto; width: auto; min-width: 0; }
}
`
