// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useId, useRef, useState } from 'react'
import { faultOf, errorMessage } from '../api.ts'
import { Btn, ErrorNote } from './ui.tsx'

interface PressWords {
  press: string
  pending: string
  size?: 'sm' | 'md'
  disabled?: boolean
  /** The press's own tooltip, when the page already explains it. */
  title?: string
  /** Why the press cannot act now, said on the press while it is off; without it the pending words are said. */
  disabledReason?: string
}

interface UndoOffer {
  remainingMs: number
  undo: () => Promise<void>
}

type TieredPressProps = PressWords & (
  | { tier: 'confirm'; question: string; quote: string; warning: string; cancel: string; onPress: () => Promise<void>
      /** The final button's words inside the question, when they differ from the press that opens it. */
      confirm?: string }
  | { tier: 'undo'; available: boolean; windowMs: number; done: string; undo: (seconds: number) => string;
      undoing: string; onPress: () => Promise<UndoOffer> }
)

/** The page supplies the words and the act; the tier supplies the question or the timed undo. */
export function TieredPress(props: TieredPressProps) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [offer, setOffer] = useState<(UndoOffer & { until: number }) | null>(null)
  const [now, setNow] = useState(Date.now)
  const inFlight = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const questionId = useId()
  const warningId = useId()

  useEffect(() => {
    if (!asking) return
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { element?.close(); opener.current?.focus() }
  }, [asking])

  useEffect(() => {
    if (offer === null) return
    const tick = () => {
      const at = Date.now()
      setNow(at)
      if (at >= offer.until && !inFlight.current) setOffer(null)
    }
    tick()
    const timer = window.setInterval(tick, 100)
    return () => window.clearInterval(timer)
  }, [offer])

  const act = async (undo = false): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFault(null)
    const started = Date.now()
    try {
      if (undo && offer !== null) {
        await offer.undo()
        setOffer(null)
      } else if (props.tier === 'undo') {
        const next = await props.onPress()
        // Start before the request so travel time cannot extend the server's window.
        setOffer({ ...next, until: started + Math.min(props.windowMs, next.remainingMs) })
        setNow(Date.now())
      } else {
        await props.onPress()
        setAsking(false)
      }
    } catch (err) {
      setFault({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const seconds = offer === null ? 0 : Math.max(0, Math.ceil((offer.until - now) / 1000))
  const pending = props.tier === 'undo' && offer !== null ? props.undoing : props.pending
  return (
    <div className="tiered-press">
      <style href="mole-office-tiered-press" precedence="default">{TIERED_PRESS_CSS}</style>
      {props.tier === 'undo' && !props.available ? null : (
        <Btn variant="ghost" size={props.size} disabled={busy || props.disabled} pending={busy} title={props.title}
          reason={busy ? pending : (props.disabledReason ?? pending)}
          onClick={() => {
            if (props.tier === 'confirm') { opener.current = document.activeElement as HTMLElement; setAsking(true) }
            else void act()
          }}>
          {props.press}
        </Btn>
      )}
      {props.tier === 'undo' && offer !== null && (seconds > 0 || busy) ? (
        <div className="tiered-undo">
          <span role="status">{props.done}</span>
          <Btn size="sm" onClick={() => void act(true)} disabled={busy} reason={pending} pending={busy}>
            {props.undo(seconds)}
          </Btn>
        </div>
      ) : null}
      {props.tier === 'confirm' && asking ? (
        <dialog ref={dialog} className="tiered-question" aria-labelledby={questionId} aria-describedby={warningId}
          onCancel={(event) => { event.preventDefault(); if (!busy) setAsking(false) }}>
          <h2 id={questionId}>{props.question}</h2>
          <blockquote>{props.quote}</blockquote>
          <p id={warningId}>{props.warning}</p>
          {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
          <div className="tiered-question-acts">
            <Btn onClick={() => setAsking(false)} disabled={busy} reason={pending}>{props.cancel}</Btn>
            <Btn variant="danger" onClick={() => void act()} disabled={busy} reason={pending} pending={busy}>
              {props.confirm ?? props.press}
            </Btn>
          </div>
        </dialog>
      ) : null}
      {fault === null || asking ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </div>
  )
}

const TIERED_PRESS_CSS = `
.tiered-press { min-width: 0; }
.tiered-undo { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin-top: var(--pad);
  padding: var(--pad) var(--pad-lg); background: var(--panel); color: var(--text); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius); box-shadow: var(--elev-1); overflow-wrap: anywhere; }
.tiered-undo .px-btn { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.tiered-question { width: min(32rem, calc(100% - 2 * var(--gut))); max-height: calc(100dvh - 2 * var(--gut));
  overflow-y: auto; padding: var(--pad-lg); background: var(--panel); color: var(--text);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--elev-2); }
.tiered-question::backdrop { background: color-mix(in srgb, var(--bg), transparent 25%); }
.tiered-question h2 { font-size: var(--fs-4); }
.tiered-question blockquote { margin: var(--gut) 0; padding: var(--pad) var(--pad-lg); border-left: var(--rail) solid var(--st-failed);
  background: var(--st-failed-bg); white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--lh-read); }
.tiered-question p { color: var(--text-2); }
.tiered-question-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--pad); margin-top: var(--gut); }
`
