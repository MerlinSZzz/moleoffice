// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { readStoredParts, readStoredShortForms } from '@shared/zoom.ts'
import { useDetail } from '../../../lib/detailchoice.ts'
import { useNarrow } from '../../ui.tsx'
import { navigate, recordPath } from '../../router.tsx'
import { NOT_ON_THIS_DRAWING, cardHere, cardToOpenOn, setCardHere, subscribeToCards, theCardWasOpened } from '../cardhere.ts'
import { DRAWING_PLACES, scopeKey } from '../model.ts'
import { NAME_FLOOR, PARTS_ON_A_CARD } from '../card.ts'
import { DrawingControl, DrawingControls, sameZoom } from '../controls.tsx'
import { bodyOf, drawTree } from './engine.ts'
import { LANES_CSS } from './styles.ts'
import type { LanesInput } from './tree.ts'

export function LanesDrawing({ input, onSays }: { input: LanesInput; onSays: (sentences: readonly string[]) => void }) {
  const outer = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const narrow = useNarrow()
  const detail = useDetail('graph', null, DRAWING_PLACES.pipeline.opensAt).rung
  const [width, setWidth] = useState(0)
  const [theme, setTheme] = useState(0)
  const [cardChoices, setCardChoices] = useState(0)
  const [whole, setWhole] = useState(false)
  const [wholeError, setWholeError] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(1)
  const bounds = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const viewport = useRef<{ drawing: string; width: number; x: number; y: number; zoom: number; scrollLeft: number; scrollTop: number } | null>(null)
  const onSaysRef = useRef(onSays)
  const lastSentences = useRef<string | null>(null)
  onSaysRef.current = onSays
  // THE CARD A COMMENT WAS WRITTEN ON, when the reader came here from that comment (round 230). It is read and spent as
  // the canvas spends it, and held here rather than in one drawing: the lanes are drawn afresh as the page's input
  // settles, and a card selected by the first drawing alone would go unselected with nothing pressed. The reader's own
  // press ends the hold. `answered` says a finished drawing has said whether it draws the card.
  const opened = useRef<{ recordId: string; answered: boolean } | null>(null)
  // THE CARD THE READER SELECTED, by a press, Enter or Space, held for the same reason (round 230): a theme, a width or
  // the whole screen draws the lanes afresh, and each fresh drawing is given it as selected. A comment's card, while
  // one is held, is given in its place. Escape, or a press on the selected card, leaves nothing held.
  const pressed = useRef<string | null>(null)
  const [notDrawn, setNotDrawn] = useState<string | null>(null)
  // THE LEVEL BEING DRAWN, while its lines are worked out off the page (round 231). The drawing before it stays on screen
  // and answers presses until the new one is drawn. On the first open there is none, and the words say what is coming.
  const [beingDrawn, setBeingDrawn] = useState<LanesInput['tree']['level'] | null>(null)
  // THE PRESS OR DRAG UNDER WAY, held here rather than by one drawing's frame (round 231): the next drawing is shown in
  // place of the one being dragged, and a drag that has moved carries on in it without a new press. `width` is the width
  // of the drawing it was started on: a drawing laid out for another width waits for the drag to end (round 232).
  const drag = useRef<{ pointer: number; x: number; y: number; worldX: number; worldY: number; zoom: number; width: number; moved: boolean } | null>(null)
  // THE DRAWING DRAWN BUT HELD BACK, while a moved drag is under way on a drawing of another width (round 232). It is
  // kept hidden until the drag ends, and then shown at its own fit. A drawing replaced again before that is dropped.
  const waiting = useRef<(() => void) | null>(null)

  useEffect(() => {
    const element = outer.current
    if (!element) return
    const read = () => setWidth(element.clientWidth)
    const observer = new ResizeObserver(read)
    observer.observe(element)
    read()
    return () => observer.disconnect()
  }, [whole])

  useEffect(() => subscribeToCards(() => setCardChoices(value => value + 1)), [])

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(value => value + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-boot-theme', 'data-size', 'data-font'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const changed = () => setTheme(value => value + 1)
    media.addEventListener('change', changed)
    return () => { observer.disconnect(); media.removeEventListener('change', changed) }
  }, [])

  useEffect(() => {
    const mount = slot.current
    if (!mount || width <= 0) return
    let active = true
    const drawing = document.createElement('div')
    // Laid out where the drawn one is, so it is measured as it will be seen, and not seen until it is drawn.
    Object.assign(drawing.style, { position: 'absolute', top: '0', left: '0', right: '0', visibility: 'hidden' })
    mount.append(drawing)
    setBeingDrawn(input.tree.level)
    const replaced = new AbortController()
    let shown = false
    let fitAfterHeldDrag = false
    const show = () => {
      shown = true
      Object.assign(drawing.style, { position: '', top: '', left: '', right: '', visibility: '' })
      mount.replaceChildren(drawing)
      setBeingDrawn(null)
      // The drawing before has left the page, and a press on it ends with it. A drag that has moved is handed back, for
      // this drawing's frame to take over.
      const carried = drag.current?.moved ? drag.current : null
      drag.current = null
      return carried
    }
    const drawnAs = scopeKey({ at: 'pipeline', recordId: input.pipeline.id })
    const going = cardToOpenOn(drawnAs)
    if (going !== null) {
      theCardWasOpened(drawnAs)
      opened.current = { recordId: going.recordId, answered: false }
    }
    // Asked by drawTree once the lines are worked out, so a card pressed on the drawing before meanwhile is the one held.
    const held = () => opened.current?.recordId ?? pressed.current
    let selected: string | null = null
    // drawTree selects the held card through the function a press goes through, so onSelect hears that as well, before
    // the drawing is finished. That selection is the drawing's own, not the reader's, and changes neither hold.
    let finished = false
    const onSelect = (id: string | null) => {
      if (!finished) return
      if (id !== opened.current?.recordId) opened.current = null
      pressed.current = id
    }
    const details = new Map(input.records.map(record => {
      const choice = cardHere(drawnAs, record.id)
      const name = detail === 'label' && !choice.detail ? readStoredShortForms(record.detail?.shortForms).label?.text : undefined
      const writtenSummary = record.detail?.summary
      const summary = detail !== 'label' && detail !== 'title' && writtenSummary && writtenSummary.trim() && writtenSummary.length >= NAME_FLOOR ? writtenSummary : null
      const written = readStoredParts(record.detail?.shortForms)?.parts
      const parts = choice.detail ? written?.slice(0, PARTS_ON_A_CARD).map(part => ({
        heading: part.heading,
        text: detail === 'sketch' ? part.text30 : detail === 'digest' || detail === 'full' ? part.text120 : undefined,
      })) : undefined
      const toggleDetail = written?.length ? () => setCardHere(drawnAs, record.id, { ...choice, detail: !choice.detail }) : undefined
      const partsWithheld = choice.detail && written ? Math.max(0, written.length - PARTS_ON_A_CARD) : 0
      return [record.id, { name, summary, parts, partsWithheld, detailOn: choice.detail, toggleDetail }] as const
    }))
    // Everything that happens once the drawing is on the page. It is held back whole while a moved drag on a drawing
    // of another width is under way, so that drawing is shown at its own fit when the drag ends (round 232).
    const agree = () => {
      if (!active) return
      const carried = show()
      setFailed(null)
      const asked = opened.current
      if (asked !== null && !asked.answered) {
        const drawn = drawing.dataset.selected === asked.recordId
        setNotDrawn(drawn ? null : asked.recordId)
        opened.current = drawn ? { ...asked, answered: true } : null
      }
      // drawTree passes over an id it has no card for, so a held card not on this drawing is not selected, and its
      // hold is dropped.
      if (selected !== null && drawing.dataset.selected !== selected) {
        opened.current = null
        pressed.current = null
      }
      const details = JSON.parse(drawing.dataset.fit ?? '{}') as { zoom?: number; natural?: { x: number; y: number; w: number; h: number } }
      bounds.current = details.natural ?? null
      const frame = drawing.querySelector<HTMLElement>('.e-frame')
      const world = frame?.querySelector<HTMLElement>('.e-world')
      // The width this drawing is laid out for, read by the zoom controls when they save a view for it.
      if (frame) frame.dataset.laidOutWidth = String(width)
      let nextFit = details.zoom ?? 1
      if (frame && world && details.natural && whole) {
        const availableHeight = Math.max(120, window.innerHeight - frame.getBoundingClientRect().top - 12)
        frame.style.height = `${availableHeight}px`
        frame.style.overflow = 'auto'
        nextFit = Math.max(0.1, Math.min(1, (frame.clientWidth - 24) / details.natural.w, (availableHeight - 54) / details.natural.h))
        const x = Math.max(12, (frame.clientWidth - details.natural.w * nextFit) / 2) - details.natural.x * nextFit
        const y = 12 - details.natural.y * nextFit
        world.style.transform = `translate(${x}px, ${y}px) scale(${nextFit})`
      }
      const fitAll = frame && details.natural && frame.clientWidth < 800
        ? Math.min(nextFit, (frame.clientWidth - 24) / details.natural.w)
        : nextFit
      setFit(fitAll)
      // Keep a settled view across redraws and widths; a drawing held for a moved drag opens at its own fit.
      const saved = viewport.current
      if (fitAfterHeldDrag && saved?.drawing === drawnAs) viewport.current = null
      if (frame && world && saved?.drawing === drawnAs && !fitAfterHeldDrag) {
        world.style.transform = `translate(${saved.x}px, ${saved.y}px) scale(${saved.zoom})`
        frame.scrollTo(saved.scrollLeft, saved.scrollTop)
        nextFit = saved.zoom
      }
      setZoom(nextFit)
      if (frame && world) {
        // A Ctrl-wheel is also how the browser delivers a trackpad pinch. Keep its focal point fixed.
        frame.addEventListener('wheel', event => {
          if (!event.ctrlKey) return
          event.preventDefault()
          const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform)
          const next = Math.max(0.1, Math.min(1.6, matrix.a * Math.pow(2, -event.deltaY * 0.002)))
          const rect = frame.getBoundingClientRect()
          const pointerX = event.clientX - rect.left - frame.clientLeft + frame.scrollLeft
          const pointerY = event.clientY - rect.top - frame.clientTop + frame.scrollTop
          const x = pointerX - (pointerX - matrix.e) * next / matrix.a
          const y = pointerY - (pointerY - matrix.f) * next / matrix.a
          world.style.transform = `translate(${x}px, ${y}px) scale(${next})`
          viewport.current = { drawing: drawnAs, width, x, y, zoom: next, scrollLeft: frame.scrollLeft, scrollTop: frame.scrollTop }
          setZoom(next)
        }, { passive: false })
        // A single threshold separates a press from a view drag, including a drag started on a card.
        let suppressClick = false
        // A press that may become a drag selects no words, and neither does a drag carried here from the drawing before.
        // Such a press still clears what was selected, as any press does. The second press of a double-click still
        // selects its word, and a touch keeps the browser's own selection.
        let selectsWords = false
        frame.style.touchAction = 'none'
        frame.addEventListener('mousedown', event => { if (event.detail > 1) selectsWords = true })
        frame.addEventListener('selectstart', event => {
          if (drag.current === null || selectsWords) return
          event.preventDefault()
          window.getSelection()?.removeAllRanges()
        })
        frame.addEventListener('pointerdown', event => {
          selectsWords = event.pointerType === 'touch'
          if (event.button !== 0 || (event.target as Element).closest('button, input, select, textarea, .e-key')) return
          const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform)
          drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, worldX: matrix.e, worldY: matrix.f, zoom: matrix.a, width, moved: false }
        })
        frame.addEventListener('pointermove', event => {
          const down = drag.current
          if (!down || event.pointerId !== down.pointer) return
          const dx = event.clientX - down.x, dy = event.clientY - down.y
          if (!down.moved && Math.hypot(dx, dy) <= 4) return
          if (!down.moved) { down.moved = true; frame.setPointerCapture(event.pointerId) }
          event.preventDefault()
          const x = down.worldX + dx, y = down.worldY + dy
          world.style.transform = `translate(${x}px, ${y}px) scale(${down.zoom})`
          viewport.current = { drawing: drawnAs, width, x, y, zoom: down.zoom, scrollLeft: frame.scrollLeft, scrollTop: frame.scrollTop }
        })
        const end = (event: PointerEvent) => {
          const down = drag.current
          if (!down || event.pointerId !== down.pointer) return
          if (down.moved) {
            suppressClick = true
            window.setTimeout(() => { suppressClick = false }, 0)
          }
          drag.current = null
          // A drawing of another width that was drawn under this drag is shown now that the drag has ended.
          const waited = waiting.current
          waiting.current = null
          if (waited !== null) {
            delete mount.dataset.waitsForTheDrag
            waited()
          }
        }
        frame.addEventListener('pointerup', end)
        frame.addEventListener('pointercancel', end)
        frame.addEventListener('dragstart', event => event.preventDefault())
        frame.addEventListener('click', event => {
          if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; return }
          if (!(event.target as Element).closest('.e-card, a, button, input, select, textarea, .e-key, .e-path, .e-pill')) {
            drawing.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          }
        }, true)
        // The drag carries on here from where it had put the view, which this world shows when it is the same pipeline's:
        // this frame takes the pointer over, so its moves and its release come here.
        if (carried && saved?.drawing === drawnAs && saved.width === width) {
          drag.current = carried
          frame.setPointerCapture(carried.pointer)
        }
      }
      const unavailable = new Map<string, string>(Object.entries(JSON.parse(drawing.dataset.notDrawn ?? '{}') as Record<string, string>))
      const sentences = bodyOf(input, unavailable)
      const encoded = JSON.stringify(sentences)
      if (encoded !== lastSentences.current) {
        lastSentences.current = encoded
        onSaysRef.current(sentences)
      }
    }
    void drawTree(drawing, input, input.tree, { width, narrow, selected: () => (selected = held()), onSelect, cardDetails: details, signal: replaced.signal }).then(() => {
      finished = true
      if (!active) return
      // A moved drag holds the drawing it started on. A drawing laid out for another width waits, hidden, until that
      // drag is released or cancelled; a drawing of the same width is shown at once and takes the drag over as before.
      const down = drag.current
      if (down?.moved && down.width !== width) {
        fitAfterHeldDrag = true
        waiting.current = agree
        mount.dataset.waitsForTheDrag = '1'
        return
      }
      agree()
    }, (error: unknown) => {
      // A drawing the engine refuses is said here, in the engine's own words.
      if (!active) return
      show()
      setFailed(error instanceof Error ? error.message : String(error))
    })
    // A drawing replaced before it is drawn is stopped, and its lines are never shown.
    return () => {
      active = false
      replaced.abort()
      if (!shown) drawing.remove()
      if (waiting.current === agree) waiting.current = null
      delete mount.dataset.waitsForTheDrag
    }
  }, [input, width, theme, narrow, whole, detail, cardChoices])

  const changeZoom = useCallback((next: number) => {
    const frame = slot.current?.querySelector<HTMLElement>('.e-frame')
    const world = frame?.querySelector<HTMLElement>('.e-world')
    if (!frame || !world) return
    const bounded = Math.max(0.1, Math.min(1.6, next))
    const box = bounds.current
    if (!box) return
    const drawnWidth = Number(frame.dataset.laidOutWidth)
    if (!Number.isFinite(drawnWidth)) return
    const x = Math.max(12, (frame.clientWidth - box.w * bounded) / 2) - box.x * bounded
    const y = 12 - box.y * bounded
    world.style.transform = `translate(${x}px, ${y}px) scale(${bounded})`
    viewport.current = { drawing: scopeKey({ at: 'pipeline', recordId: input.pipeline.id }), width: drawnWidth, x, y, zoom: bounded, scrollLeft: 0, scrollTop: 0 }
    frame.style.overflow = 'auto'
    if (!document.fullscreenElement) frame.style.height = `${Math.ceil(box.h * bounded + 50)}px`
    frame.scrollTo(0, 0)
    setZoom(bounded)
  }, [input.pipeline.id])

  useEffect(() => {
    const read = () => setWhole(document.fullscreenElement === outer.current)
    document.addEventListener('fullscreenchange', read)
    return () => document.removeEventListener('fullscreenchange', read)
  }, [])

  const toggleWhole = useCallback(() => {
    setWholeError(null)
    const leaving = document.fullscreenElement !== null
    const request = leaving ? document.exitFullscreen() : outer.current?.requestFullscreen()
    if (!request) {
      setWholeError(t('g7b.Canvas.the_drawing_is_not_on_the_page'))
      return
    }
    void request.catch((error: unknown) => setWholeError(t(
      leaving ? 'g7b.Canvas.this_browser_would_not_leave_the_whole' : 'g7b.Canvas.this_browser_would_not_put_the_drawing',
      { v1: error instanceof Error ? error.message : String(error) },
    )))
  }, [])

  return <div ref={outer} className={`lanes-drawing${whole ? ' lanes-whole' : ''}`} data-being-drawn={beingDrawn ?? undefined} aria-busy={beingDrawn !== null}>
    <style href="mole-office-lanes" precedence="default">{LANES_CSS}</style>
    {!narrow && <DrawingControls>
      <div className="lanes-controls" role="group" aria-label={t('g7b.Canvas.reading_size')}>
        <DrawingControl look="plain" now={zoom} after={1} same={sameZoom} reason={t('g7b.Canvas.already_at_the_reading_size_this_is')} onPress={() => changeZoom(1)}>{t('g7b.Canvas.reading_size')}</DrawingControl>
        <DrawingControl look="plain" now={zoom} after={fit} same={sameZoom} reason={t('g7b.Canvas.already_showing_the_whole_drawing_this_is')} onPress={() => changeZoom(fit)}>{t('g7b.Canvas.fit_all')}</DrawingControl>
        <DrawingControl look="plain" now={whole} after={!whole} onPress={toggleWhole}>{whole ? t('g7b.Canvas.leave_the_whole_screen') : t('g7b.Canvas.whole_screen')}</DrawingControl>
        <DrawingControl look="plain" now={zoom} after={0.1} same={sameZoom} reason={t('g7b.Canvas.already_at_the_smallest_is_as_far', {v1:'10'})} label={t('g7b.Canvas.smaller')} onPress={() => changeZoom(zoom / 1.2)}>−</DrawingControl>
        <span>{Math.round(zoom * 100)}%</span>
        <DrawingControl look="plain" now={zoom} after={1.6} same={sameZoom} reason={t('g7b.Canvas.already_at_the_largest_is_as_close', {v1:'160'})} label={t('g7b.Canvas.bigger')} onPress={() => changeZoom(zoom * 1.2)}>+</DrawingControl>
        {/* Inside the bar, which keeps its height, so the drawing still on the page does not move when the words come and go. */}
        {beingDrawn !== null && <p className="lanes-being-drawn" role="status">{t(beingDrawn === 'steps' ? 'lanes.drawingTheSteps' : 'lanes.drawingTheBoxes')}</p>}
      </div>
    </DrawingControls>}
    {wholeError && <p role="status">{wholeError}</p>}
    {failed !== null && <p role="alert">{t('lanes.couldNotDraw', { problem: failed })}</p>}
    {notDrawn !== null && <p className="lanes-not-drawn" role="status" data-record={notDrawn}>
      {NOT_ON_THIS_DRAWING()}{' '}
      <button type="button" className="lanes-not-drawn-open" onClick={() => navigate(recordPath(notDrawn))}>{t('g7b.Canvas.open_the_record')}</button>
    </p>}
    <div ref={slot} className="lanes-slot" style={{ position: 'relative' }} />
  </div>
}
