// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api.ts'
import { C_FOREST_LOOK_IDS, C_WHOLE_LOOK_WEIGHTS, C_APRON_FUR_OPTIONS, C_APRON_CLOTH_OPTIONS, C_APRON_ACCESSORY_OPTIONS, C_APRON_X_FACTORS, C_APRON_Y_FACTORS, generateCWholeAppearance, resolvePixelAppearance, storedPixelAppearance, type CApronAppearance, type PixelAppearance } from '@shared/pixel-office.ts'
import { cApronSaveGate } from '@shared/pixel-appearance.ts'
import type { WordKey } from '@shared/i18n.ts'
import { cForestActionAvailable, loadCForestAssets, sceneLookName, sceneWord, useCForestAssets, type SceneLanguage } from './CForestAssets.ts'
import { PixelAppearancePreview, pixelAppearanceWords } from './PixelAppearancePreview.tsx'
import { useReducedMotion } from './useReducedMotion.ts'
import { freshPixelSeed } from './freshPixelSeed.ts'
import './pixel-office.css'

const ACTIONS: Record<string, WordKey> = {
  idle: 'g6c.pixel.editor.action.idle', walk_se: 'g6c.pixel.editor.action.walkSe', walk_sw: 'g6c.pixel.editor.action.walkSw',
  walk_ne: 'g6c.pixel.editor.action.walkNe', walk_nw: 'g6c.pixel.editor.action.walkNw',
  pick_book: 'g6c.pixel.editor.action.pickBook', sit: 'g6c.pixel.editor.action.sit', work: 'g6c.pixel.editor.action.work',
  stand: 'g6c.pixel.editor.action.stand', put_book: 'g6c.pixel.editor.action.putBook', talk: 'g6c.pixel.editor.action.talk',
  type: 'g6c.pixel.editor.action.type', tea: 'g6c.pixel.editor.action.tea', look: 'g6c.pixel.editor.action.look', report: 'g6c.pixel.editor.action.report',
}
const FUR_WORDS: Record<typeof C_APRON_FUR_OPTIONS[number], WordKey> = {
  original: 'g6c.pixel.editor.fur.original', 'grey-brown': 'g6c.pixel.editor.fur.greyBrown',
}
const CLOTH_WORDS: Record<typeof C_APRON_CLOTH_OPTIONS[number], WordKey> = {
  original: 'g6c.pixel.editor.cloth.original', 'blue-grey': 'g6c.pixel.editor.cloth.blueGrey',
}
const ACCESSORY_WORDS: Record<typeof C_APRON_ACCESSORY_OPTIONS[number], WordKey> = {
  none: 'g6c.pixel.editor.accessory.none', 'gold-halo': 'g6c.pixel.editor.accessory.goldHalo',
}
const X_WORDS: Record<number, WordKey> = { 0.94: 'g6c.pixel.editor.width.narrower', 1: 'g6c.pixel.editor.width.normal', 1.06: 'g6c.pixel.editor.width.wider' }
const Y_WORDS: Record<number, WordKey> = { 0.97: 'g6c.pixel.editor.height.shorter', 1: 'g6c.pixel.editor.height.normal', 1.03: 'g6c.pixel.editor.height.taller' }
const APRON: CApronAppearance = { version: 3, style: 'c-forest', lookId: 'sand-apron', fur: 'original', cloth: 'original', body: { x: 1, y: 1 }, accessory: 'none' }

export function PixelAppearanceEditor({ agentId, language = 'en', rareItems = true, onSaved = () => {} }: { agentId: string; language?: SceneLanguage; rareItems?: boolean; onSaved?: () => void }) {
  const assets = useCForestAssets()
  const reduced = useReducedMotion()
  const [saved, setSaved] = useState<PixelAppearance | null>(null)
  const [draft, setDraft] = useState<PixelAppearance | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mayChange, setMayChange] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState('idle')
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    let current = true; setLoaded(false); setError(null); setAction('idle'); setPlaying(false)
    api.pixelAppearance(agentId).then(value => {
      if (!current) return
      const stored = storedPixelAppearance(value.appearance, value.chosen)
      setSaved(stored); setDraft(stored); setMayChange(value.mayChange); setLoaded(true)
      setNote(value.refusal ?? pixelAppearanceWords(resolvePixelAppearance(agentId, stored).source, language).detail)
    }, reason => { if (current) setError(errorMessage(reason)) })
    return () => { current = false }
  }, [agentId, language])
  const resolved = resolvePixelAppearance(agentId, draft)
  const look = resolved.cLook
  const apron: CApronAppearance | null = draft !== null && draft.version === 3 ? draft : null
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const changeDraft = (next: PixelAppearance | null) => { setDraft(next); setAction('idle'); setPlaying(false); setNote(sceneWord(language, 'g6c.pixel.editor.changed')) }
  const changeApron = (patch: { fur?: CApronAppearance['fur']; cloth?: CApronAppearance['cloth']; accessory?: CApronAppearance['accessory']; x?: number; y?: number }) => {
    const base = apron ?? APRON
    changeDraft({
      ...base,
      ...(patch.fur === undefined ? {} : { fur: patch.fur }),
      ...(patch.cloth === undefined ? {} : { cloth: patch.cloth }),
      ...(patch.accessory === undefined ? {} : { accessory: patch.accessory }),
      body: { x: (patch.x ?? base.body.x) as CApronAppearance['body']['x'], y: (patch.y ?? base.body.y) as CApronAppearance['body']['y'] },
    })
  }
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const value = await api.changePixelAppearance(agentId, draft)
      const stored = storedPixelAppearance(value.appearance, value.chosen)
      setSaved(stored); setDraft(stored); setNote(sceneWord(language, 'g6c.pixel.editor.saved')); onSaved()
    } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }
  const randomPreview = () => {
    changeDraft(generateCWholeAppearance(freshPixelSeed(), 'random-preview', rareItems))
  }
  const randomChoices = (Object.keys(C_WHOLE_LOOK_WEIGHTS) as (keyof typeof C_WHOLE_LOOK_WEIGHTS)[]).filter(id => rareItems || !C_WHOLE_LOOK_WEIGHTS[id].rare)
  const totalWeight = randomChoices.reduce((sum, id) => sum + C_WHOLE_LOOK_WEIGHTS[id].weight, 0)
  const saveGate = cApronSaveGate(draft, assets.customisation !== null)
  const apronUnavailable = saveGate.unavailable
  return <section className="px-editor" aria-label={sceneWord(language, 'g6c.pixel.editor.sectionLabel')}>
    <h3>{sceneWord(language, 'g6c.pixel.editor.heading')}</h3>
    {error ? <p role="alert" className="px-error">{error}</p> : null}
    {!loaded && !error ? <p>{sceneWord(language, 'g6c.pixel.editor.reading')}</p> : null}
    {loaded ? <>
      <div className="px-portrait"><PixelAppearancePreview agentId={agentId} appearance={resolved.appearance} chosen={resolved.chosen} language={language} action={action} playing={playing && !reduced} label={sceneWord(language, 'g6c.pixel.editor.previewLabel')}/></div>
      <p className="px-muted">{dirty ? sceneWord(language, 'g6c.pixel.editor.previewNotSaved') : pixelAppearanceWords(resolved.source, language).detail}</p>
      {resolved.source === 'saved-legacy' ? <p>{sceneWord(language, 'g6c.pixel.editor.legacyRetained')}</p> : null}
      {saved?.version === 1 && (draft?.version === 2 || draft?.version === 3) ? <p>{sceneWord(language, 'g6c.pixel.editor.willReplaceLegacy')}</p> : null}
      <fieldset className="px-fields" disabled={!mayChange || busy}>
        <legend>{sceneWord(language, 'g6c.pixel.editor.cosmeticLegend')}</legend>
        <label>{sceneWord(language, 'g6c.pixel.editor.versionLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.versionLabel')} value={draft === null ? 'default' : draft.version === 1 ? 'legacy' : draft.lookId} onChange={event => {
          const value = event.target.value
          if (value === 'default') changeDraft(null)
          else if (value === 'legacy' && saved?.version === 1) changeDraft(saved)
          else if (C_FOREST_LOOK_IDS.includes(value as typeof C_FOREST_LOOK_IDS[number])) changeDraft({ version: 2, style: 'c-forest', lookId: value as typeof C_FOREST_LOOK_IDS[number] })
        }}>
          <option value="default">{sceneWord(language, 'g6c.pixel.editor.stableDefault')}</option>
          {saved?.version === 1 ? <option value="legacy">{sceneWord(language, 'g6c.pixel.editor.keepLegacy')}</option> : null}
          {C_FOREST_LOOK_IDS.map(id => <option key={id} value={id} disabled={!assets.catalog?.looks[id]}>{sceneLookName(language, id)}</option>)}
        </select></label>
        <button type="button" disabled={!assets.catalog} onClick={randomPreview}>{sceneWord(language, 'g6c.pixel.editor.randomPreview')}</button>
      </fieldset>
      {look === 'sand-apron' ? <fieldset className="px-apron" disabled={!mayChange || busy || saveGate.fieldsDisabled}>
        <legend>{sceneWord(language, 'g6c.pixel.editor.apronLegend')}</legend>
        <p className="px-muted">{sceneWord(language, 'g6c.pixel.editor.apronReviewNote')}</p>
        <label>{sceneWord(language, 'g6c.pixel.editor.furLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.furLabel')} value={apron?.fur ?? 'original'} onChange={event => changeApron({ fur: event.target.value as CApronAppearance['fur'] })}>
          {C_APRON_FUR_OPTIONS.map(option => <option key={option} value={option}>{sceneWord(language, FUR_WORDS[option])}</option>)}
        </select></label>
        <label>{sceneWord(language, 'g6c.pixel.editor.clothLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.clothLabel')} value={apron?.cloth ?? 'original'} onChange={event => changeApron({ cloth: event.target.value as CApronAppearance['cloth'] })}>
          {C_APRON_CLOTH_OPTIONS.map(option => <option key={option} value={option}>{sceneWord(language, CLOTH_WORDS[option])}</option>)}
        </select></label>
        <label>{sceneWord(language, 'g6c.pixel.editor.widthLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.widthLabel')} value={apron?.body.x ?? 1} onChange={event => changeApron({ x: Number(event.target.value) })}>
          {C_APRON_X_FACTORS.map(factor => <option key={factor} value={factor}>{sceneWord(language, X_WORDS[factor]!)} · ×{factor}</option>)}
        </select></label>
        <label>{sceneWord(language, 'g6c.pixel.editor.heightLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.heightLabel')} value={apron?.body.y ?? 1} onChange={event => changeApron({ y: Number(event.target.value) })}>
          {C_APRON_Y_FACTORS.map(factor => <option key={factor} value={factor}>{sceneWord(language, Y_WORDS[factor]!)} · ×{factor}</option>)}
        </select></label>
        <label>{sceneWord(language, 'g6c.pixel.editor.accessoryLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.accessoryLabel')} value={apron?.accessory ?? 'none'} onChange={event => changeApron({ accessory: event.target.value as CApronAppearance['accessory'] })}>
          {C_APRON_ACCESSORY_OPTIONS.map(option => <option key={option} value={option}>{sceneWord(language, ACCESSORY_WORDS[option])}</option>)}
        </select></label>
        {apron ? null : <p className="px-muted">{sceneWord(language, 'g6c.pixel.editor.chooseThenSave')}</p>}
      </fieldset> : null}
      {look === 'sand-apron' && apronUnavailable ? <p className="px-error" role="status">{sceneWord(language, 'g6c.pixel.editor.artworkNotLoaded')} <button type="button" onClick={() => void loadCForestAssets(true)}>{sceneWord(language, 'g6c.pixel.editor.retryAssets')}</button></p> : null}
      {look ? <div className="px-controls"><label>{sceneWord(language, 'g6c.pixel.editor.previewActionLabel')}<select aria-label={sceneWord(language, 'g6c.pixel.editor.previewActionLabel')} value={action} onChange={event => setAction(event.target.value)}>
        {Object.entries(ACTIONS).map(([id, key]) => { const available = cForestActionAvailable(assets, look, id); return <option key={id} value={id} disabled={!available}>{sceneWord(language, key)}{available ? '' : sceneWord(language, 'g6c.pixel.editor.actionNotMade')}</option> })}
      </select></label><button type="button" disabled={reduced} onClick={() => setPlaying(!playing)}>{playing ? sceneWord(language, 'g6c.pixel.editor.pausePreview') : sceneWord(language, 'g6c.pixel.editor.playPreview')}</button></div> : null}
      {reduced ? <p className="px-muted">{sceneWord(language, 'g6c.pixel.editor.reducedMotion')}</p> : null}
      <p className="px-muted">{sceneWord(language, 'g6c.pixel.editor.randomChancesLead')}{randomChoices.map(id => `${sceneLookName(language, id)} ${Math.round(C_WHOLE_LOOK_WEIGHTS[id].weight / totalWeight * 100)}%`).join(sceneWord(language, 'g6c.pixel.editor.randomChancesSeparator'))}{sceneWord(language, 'g6c.pixel.editor.randomChancesTail')}</p>
      {assets.error || assets.errors.size ? <p className="px-error" role="status">{sceneWord(language, 'g6c.pixel.editor.assetsUnavailable')} <button type="button" onClick={() => void loadCForestAssets(true)}>{sceneWord(language, 'g6c.pixel.editor.retryAssets')}</button></p> : null}
      <p className="px-muted" role="status">{note}</p>
      {mayChange ? <div className="px-controls"><button disabled={busy || !dirty || saveGate.saveDisabled} onClick={() => void save()}>{busy ? sceneWord(language, 'g6c.pixel.editor.saving') : sceneWord(language, 'g6c.pixel.editor.saveAppearance')}</button>
        <button type="button" disabled={busy || !dirty} onClick={() => { setDraft(saved); setAction('idle'); setPlaying(false); setNote(sceneWord(language, 'g6c.pixel.editor.discardedNote')) }}>{sceneWord(language, 'g6c.pixel.editor.discardPreview')}</button></div> : null}
    </> : null}
  </section>
}
