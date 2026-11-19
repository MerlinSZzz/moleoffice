// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useRef, useState } from 'react'
import { resolvePixelAppearance, storedPixelAppearance, type CForestLookId, type PixelAppearance, type PixelAppearanceSource } from '@shared/pixel-office.ts'
import { cApronOptions, cApronFrameLayers, cApronFrameRefusal, C_APRON_PREVIEW_CANVAS, type CApronFrameLayers, type CApronRenderOptions } from '@shared/pixel-appearance.ts'
import type { WordKey } from '@shared/i18n.ts'
import { MoleSprite, type MoleAction } from './MoleSprite.tsx'
import { cApronHaloCanvas, cApronSpriteCanvas, readCForestFrame, sceneLookName, sceneWord, useCForestAssets, type SceneLanguage } from './CForestAssets.ts'

/** Which two list keys say this source's label and its detail, for every value the resolver returns. */
const SOURCE_KEYS: Record<PixelAppearanceSource, { label: WordKey; detail: WordKey }> = {
  'saved-legacy': { label: 'g6c.pixel.preview.source.savedLegacy.label', detail: 'g6c.pixel.preview.source.savedLegacy.detail' },
  'saved-c': { label: 'g6c.pixel.preview.source.savedC.label', detail: 'g6c.pixel.preview.source.savedC.detail' },
  'identity-default-c': { label: 'g6c.pixel.preview.source.identityDefaultC.label', detail: 'g6c.pixel.preview.source.identityDefaultC.detail' },
  'registered-c': { label: 'g6c.pixel.preview.source.registeredC.label', detail: 'g6c.pixel.preview.source.registeredC.detail' },
  'saved-random-c': { label: 'g6c.pixel.preview.source.savedRandomC.label', detail: 'g6c.pixel.preview.source.savedRandomC.detail' },
  'updated-default-c': { label: 'g6c.pixel.preview.source.updatedDefaultC.label', detail: 'g6c.pixel.preview.source.updatedDefaultC.detail' },
}
export function pixelAppearanceWords(source: PixelAppearanceSource, language: SceneLanguage): { label: string; detail: string } {
  const keys = SOURCE_KEYS[source]
  return { label: sceneWord(language, keys.label), detail: sceneWord(language, keys.detail) }
}

/**
 * ONE PURE DRAW PLAN FOR THE PREVIEW.
 *
 * The body first, then the foreground hands and book, then the accessory container. Each step
 * carries that layer's own foot, flip, anchor, width and height exactly as cApronFrameLayers
 * described them, so the halo keeps the per-frame attachment point under the shared transform. The
 * render effect below consumes this plan and reads nothing else. The test calls it on a real frame
 * whose accessory foot differs from the body's, so replacing a layer's foot with the body's foot
 * turns that assertion red.
 */
export interface CApronPreviewDrawStep {
  role: 'body' | 'foreground' | 'accessory'
  spriteId: string
  options: CApronRenderOptions | null
  accessory: boolean
  foot: { x: number; y: number }
  flipX: boolean
  anchor: { x: number; y: number }
  width: number
  height: number
}
export function cApronPreviewDrawPlan(layers: Pick<CApronFrameLayers, 'body' | 'foreground' | 'accessory'>): CApronPreviewDrawStep[] {
  const plan: CApronPreviewDrawStep[] = []
  for (const layer of [layers.body, layers.foreground, layers.accessory]) {
    if (!layer) continue
    plan.push({
      role: layer.accessory ? 'accessory' : layer.foreground ? 'foreground' : 'body',
      spriteId: layer.spriteId,
      options: layer.options,
      accessory: layer.accessory,
      foot: { ...layer.foot },
      flipX: layer.flipX,
      anchor: { ...layer.anchor },
      width: layer.width,
      height: layer.height,
    })
  }
  return plan
}

export function PixelAppearancePreview({ agentId, appearance, chosen, language = 'en', action = 'idle', playing = false, showSource = false, label = '' }: {
  agentId: string; appearance: PixelAppearance; chosen: boolean; language?: SceneLanguage; action?: string; playing?: boolean; showSource?: boolean; label?: string
}) {
  const resolved = resolvePixelAppearance(agentId, storedPixelAppearance(appearance, chosen))
  return <span className="c-appearance-preview" data-appearance-version={resolved.appearance.version} data-appearance-source={resolved.source}>
    {resolved.appearance.version === 1 ? <MoleSprite appearance={resolved.appearance} action={(['rest','type','read','wave','tea','look','walk','report','talk','wait'].includes(action) ? action : 'rest') as MoleAction} label={label}/> : <CLookPreview appearance={resolved.appearance} look={resolved.appearance.lookId} language={language} action={action} playing={playing} label={label}/>}
    {showSource ? <small>{pixelAppearanceWords(resolved.source, language).label}</small> : null}
  </span>
}
function CLookPreview({ appearance, look, language, action, playing, label }: { appearance: PixelAppearance; look: CForestLookId; language: SceneLanguage; action: string; playing: boolean; label: string }) {
  const assets = useCForestAssets()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState(0)
  useEffect(() => { setTime(0) }, [look, action, appearance])
  useEffect(() => {
    if (!playing || action === 'idle') return
    let id = 0, previous: number | null = null
    const tick = (now: number) => { const delta = previous === null ? 0 : Math.min(100, now - previous); previous = now; if (delta) setTime(time => time + delta); id = requestAnimationFrame(tick) }
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id)
  }, [playing, action])
  const apron = appearance.version === 3 && appearance.lookId === look ? appearance : null
  const options = apron ? cApronOptions(apron) : null
  const reading = readCForestFrame(assets, look, action, time)
  const sprites = assets.catalog?.sprites ?? null
  const layers = reading.frame && sprites ? cApronFrameLayers({
    frame: reading.frame, sprites, customisation: assets.customisation, options, x: apron?.body.x ?? 1, y: apron?.body.y ?? 1, scale: 1,
    foot: { ...C_APRON_PREVIEW_CANVAS.foot }, flipX: Boolean(reading.frame.flipX), depth: 0, foregroundDepth: 1, accessoryDepth: 2,
  }) : null
  const plan = layers ? cApronPreviewDrawPlan(layers) : null
  const apronUnavailable = apron !== null && cApronFrameRefusal(assets.customisation, reading.frame, sprites ?? {}, id => assets.images.has(id)) !== null
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !plan || apronUnavailable) return
    context.clearRect(0, 0, C_APRON_PREVIEW_CANVAS.width, C_APRON_PREVIEW_CANVAS.height)
    context.imageSmoothingEnabled = false
    // Each step is drawn at its own foot, flip, anchor, width and height, so the accessory keeps the
    // per-frame attachment cApronFrameLayers gave it. The canvas keeps transparent room above the
    // head so the complete ring is visible. A layer whose image is missing fails visibly.
    for (const step of plan) {
      const image = step.accessory ? cApronHaloCanvas() : step.options ? cApronSpriteCanvas(assets, step.spriteId, step.options) : assets.images.get(step.spriteId)
      if (!image) return
      context.save()
      context.translate(step.foot.x, step.foot.y)
      if (step.flipX) context.scale(-1, 1)
      context.drawImage(image, -step.anchor.x, -step.anchor.y, step.width, step.height)
      context.restore()
    }
  }, [sprites, reading.frame, plan, assets, apronUnavailable])
  const unavailable = apronUnavailable || !layers
  return <span className="c-look-preview" data-c-look={look} data-c-action={reading.action ?? 'unavailable'} data-c-frame={reading.frameIndex ?? ''} data-c-flip-x={reading.frame?.flipX ?? false} data-c-apron-v3={apron ? `${apron.fur}/${apron.cloth}/${apron.body.x}/${apron.body.y}/${apron.accessory}` : ''} data-c-apron-renderable={apron ? String(!apronUnavailable) : ''}>
    {unavailable ? <span className="c-look-unavailable">{apronUnavailable ? sceneWord(language, 'g6c.pixel.preview.apronNotSubstituted') : sceneWord(language, 'g6c.pixel.preview.cUnavailable')}</span> : <canvas ref={canvas} width={C_APRON_PREVIEW_CANVAS.width} height={C_APRON_PREVIEW_CANVAS.height} role="img" aria-label={label || sceneLookName(language, look)}/>}
    {reading.unavailable && action !== 'idle' ? <small role="status">{sceneWord(language, 'g6c.pixel.preview.animationUnavailable')}</small> : null}
  </span>
}
