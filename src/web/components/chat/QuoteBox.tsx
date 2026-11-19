// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { wordsNamedBy, type Context } from '@shared/targets.ts'
import { aSendKeyPress, useSendKey } from '../../lib/send-key.ts'

export interface DraftQuote { id: string; context: Context; about: string; at: number }
export interface QuoteCaret { at: number; quotesBefore: number }

/** Read only the writing and the positions of the non-editable quotes from the browser's box. */
function readBox(root: HTMLElement): { words: string; positions: { id: string; at: number }[] } {
  let words = ''
  const positions: { id: string; at: number }[] = []
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) { words += node.textContent ?? ''; return }
    if (!(node instanceof HTMLElement)) return
    const id = node.dataset.quoteId
    if (id !== undefined) { positions.push({ id, at: words.length }); return }
    if (node.tagName === 'BR') { words += '\n'; return }
    const block = node !== root && (node.tagName === 'DIV' || node.tagName === 'P')
    if (block && words !== '' && !words.endsWith('\n')) words += '\n'
    for (const child of node.childNodes) visit(child)
  }
  visit(root)
  return { words, positions }
}

/** Read a caret without treating the words inside a quote as part of the draft. */
function readCaret(root: HTMLElement): QuoteCaret | null {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) return null
  const range = selection.getRangeAt(0).cloneRange()
  range.collapse(true)
  const before = document.createRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const copy = document.createElement('div')
  copy.append(before.cloneContents())
  const read = readBox(copy)
  return { at: read.words.length, quotesBefore: read.positions.length }
}

/** Restore a bookmark after React has rebuilt the box to insert or remove a quote. */
function putCaret(root: HTMLElement, caret: QuoteCaret): void {
  let words = 0
  let quotes = 0
  let placed = false
  const range = document.createRange()
  const visit = (node: Node): void => {
    if (placed) return
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0
      if (caret.at <= words + length && quotes >= caret.quotesBefore) {
        range.setStart(node, Math.max(0, caret.at - words)); placed = true
      }
      words += length
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.dataset.quoteId !== undefined) {
      if (words >= caret.at && quotes >= caret.quotesBefore) { range.setStartBefore(node); placed = true; return }
      quotes += 1
      if (words >= caret.at && quotes >= caret.quotesBefore) { range.setStartAfter(node); placed = true }
      return
    }
    for (const child of node.childNodes) visit(child)
  }
  visit(root)
  if (!placed) { range.selectNodeContents(root); range.collapse(false) }
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** A browser text area cannot draw a quote: this box keeps each quote as an indivisible inline part. */
export function QuoteBox({ value, quotes, caret, placeholder, heightLabel, onCaret, onChange, onRemove, onSend }: {
  value: string
  placeholder: string
  heightLabel: string
  quotes: readonly DraftQuote[]
  caret: QuoteCaret
  onCaret: (caret: QuoteCaret) => void
  onChange: (words: string, positions: { id: string; at: number }[]) => void
  onRemove: (id: string) => void
  onSend: () => void
}) {
  const sendKey = useSendKey()
  const callbacks = useRef({ onRemove })
  callbacks.current = { onRemove }
  const box = useRef<HTMLDivElement | null>(null)
  const [floor, setFloor] = useState<number | null>(null)
  const dragging = useRef<{ y: number; height: number } | null>(null)
  const ids = quotes.map((quote) => quote.id).join(':')
  const limits = (element: HTMLElement) => {
    const line = parseFloat(getComputedStyle(element).lineHeight) || 20
    return { least: line + 10, most: line * 8 + 10 }
  }
  const fit = () => {
    const el = box.current
    if (el === null) return
    const row = el.closest<HTMLElement>('.px-chat-write')
    if (row !== null) row.style.minHeight = `${row.offsetHeight}px`
    el.style.height = 'auto'
    const height = Math.min(Math.max(el.scrollHeight, floor ?? 0), limits(el).most)
    el.style.height = `${height}px`
    el.style.overflowY = el.scrollHeight > height ? 'auto' : 'hidden'
    if (row !== null) row.style.minHeight = ''
  }
  // Children are rebuilt for a quote insertion or removal, never on an ordinary key press.
  const children = useMemo(() => {
    const parts: ReactNode[] = []
    let from = 0
    quotes.forEach((quote) => {
      parts.push(<Fragment key={`words-${quote.id}`}>{value.slice(from, quote.at)}</Fragment>)
      const words = wordsNamedBy(quote.context)
      parts.push(<span key={quote.id} data-quote-id={quote.id} contentEditable={false} className="px-chat-quote-chip">
        <span className="px-chat-quote-chip-words">{words ?? t('chat.quote.whole', { about: quote.about })}</span>
        <span className="px-chat-quote-chip-from">{t('chat.quote.from', { about: quote.about })}</span>
        <button type="button" className="px-chat-quote-chip-out" aria-label={t('chat.quote.remove')} title={t('chat.quote.remove')} onClick={() => callbacks.current.onRemove(quote.id)}>{'×'}</button>
      </span>)
      from = quote.at
    })
    parts.push(<Fragment key="end">{value.slice(from)}</Fragment>)
    return parts
    // The browser owns the text between quote changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  useLayoutEffect(() => {
    if (box.current === null) return
    box.current.focus()
    putCaret(box.current, caret)
    // The bookmark is the one captured before the quote change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  useLayoutEffect(() => { fit() }, [value, ids, floor])
  useLayoutEffect(() => {
    const el = box.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    let width = el.getBoundingClientRect().width
    let frame = 0
    const observer = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().width
      if (next === width) return
      width = next
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(el)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
    // A new element is made when the quotes change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, floor])
  const beginDrag = (event: PointerEvent<HTMLElement>) => {
    const el = box.current
    if (el === null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = { y: event.clientY, height: el.getBoundingClientRect().height }
  }
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragging.current === null || box.current === null) return
    const { least, most } = limits(box.current)
    setFloor(Math.min(Math.max(dragging.current.height + dragging.current.y - event.clientY, least), most))
  }
  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragging.current === null) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragging.current = null
  }
  const remember = () => { const found = box.current === null ? null : readCaret(box.current); if (found !== null) onCaret(found) }
  return <div className="px-chat-box-holder"><div className="px-chat-box-grip" role="separator" aria-label={heightLabel} title={heightLabel} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onDoubleClick={() => setFloor(null)} /><div key={ids} ref={box} className="px-chat-box px-chat-rich-box" role="textbox" aria-multiline="true" aria-label={placeholder} contentEditable suppressContentEditableWarning onKeyDown={aSendKeyPress<HTMLDivElement>(sendKey, onSend)} onKeyUp={remember} onMouseUp={remember} onInput={() => { if (box.current !== null) { const read = readBox(box.current); onChange(read.words, read.positions); remember() } }} onPaste={(event) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')) }}>{children}</div></div>
}
