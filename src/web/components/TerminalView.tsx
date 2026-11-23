// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE OPEN TERMINAL, DRAWN WITH @xterm/xterm 6. Wave 13u, round 2.
 *
 * The owner's review asks for a terminal a person can read and type into from
 * the page. Every door is asked through src/web/lib/terminals.ts; this file never calls fetch.
 *
 * READING. On mount the view reads the terminal's stream. The first event is the screen as it is now,
 * with the terminal's own size: the xterm is made at that size and the screen is written into it, then
 * each piece of output as it comes. When the holder lets the view go, or the stream breaks, the view
 * says so and offers to read again; reading again makes a fresh xterm from a fresh screen.
 *
 * TYPING. Everything xterm hands out through onData goes to the typist, one POST at a time, in order.
 * That includes text composed with an input method, such as Chinese: xterm composes it in its own hidden
 * textarea, and this view never intercepts a key while a composition is going on. Once the terminal has
 * ended, nothing more is sent.
 *
 * SIZE. One size is shared by every viewer, so the view never resizes the terminal by itself. The xterm
 * is drawn at the terminal's own columns and rows inside a box that scrolls both ways, so the page
 * itself never scrolls sideways. The Fit button works out what fits the box and asks the terminal to
 * take that size; the local xterm follows only once the terminal has agreed.
 *
 * WHERE THE TYPING CAME FROM. The stream sends, with the screen and after each input, the sources of the terminal's
 * typing; TypedFromPanel draws them under the view, with the two levels (wave 13u round 14).
 *
 * THEME. The xterm's colours are read from the page's own colour variables, and read again whenever
 * the page's theme changes (the data-theme attribute, or the system's dark setting).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { t } from '@shared/i18n.ts'
import type { TerminalReading, TypedFrom } from '@shared/terminals.ts'
import { Btn, ServerNote } from './ui.tsx'
import { terminalStateWord, theCommandLine } from './TerminalParts.tsx'
import { useLanguage } from '../lib/language.ts'
import { KeepingWhatIType } from './KeepingWhatIType.tsx'
import { RightClickSwitch } from './RightClickSwitch.tsx'
import { TypedFromPanel } from './TypedFromPanel.tsx'
import { aTypist, closeTheTerminal, readTheTerminal, resizeTheTerminal, whatARefusalSays } from '../lib/terminals.ts'

export interface TerminalViewProps {
  /** The terminal, as the list read it. */
  terminal: TerminalReading
  /** The person put the view away; the terminal keeps running. */
  onPutAway: () => void
  /** The terminal was closed, by this view or anybody else. */
  onClosed: () => void
  /**
   * What the header says in place of the command and its folder (wave 13u, round 10): an agent's tmux pane is shown
   * through a view whose command is machinery, so its page names the pane instead.
   */
  heading?: string
  /**
   * Whether Fit is offered. False for a view of an agent's tmux pane, which is drawn at the pane's own size: Fit would
   * resize the view and never the pane. True when not given.
   */
  canFit?: boolean
}

/** The smallest size Fit asks for, so a narrow phone never asks for a terminal nobody can use. */
const THE_SMALLEST = { cols: 20, rows: 5 }
/** How long the close button waits for its second press. */
const CLOSE_WAITS_MS = 5_000
/** Fonts with Chinese glyphs, after the page's own monospace stack. */
const CJK_FALLBACK = "'Noto Sans Mono CJK SC', 'Noto Sans CJK SC', 'WenQuanYi Zen Hei Mono', 'WenQuanYi Zen Hei', 'PingFang SC', 'Microsoft YaHei', monospace"

/** One of the page's colour variables, as the page has it now. */
function theVariable(styles: CSSStyleDeclaration, name: string): string | undefined {
  const value = styles.getPropertyValue(name).trim()
  return value === '' ? undefined : value
}

/** The xterm's colours, read from the page's variables. */
function thePagesTheme(): ITheme {
  const styles = getComputedStyle(document.documentElement)
  const background = theVariable(styles, '--panel-2')
  const theme: ITheme = {
    foreground: theVariable(styles, '--text'),
    cursor: theVariable(styles, '--accent'),
    cursorAccent: background,
    selectionBackground: theVariable(styles, '--sel'),
    selectionForeground: theVariable(styles, '--text'),
  }
  if (background !== undefined) theme.background = background
  return theme
}

/** The page's monospace stack, then the Chinese fonts. */
function thePagesFont(): string {
  const mono = theVariable(getComputedStyle(document.documentElement), '--font-mono')
  return mono === undefined ? CJK_FALLBACK : `${mono}, ${CJK_FALLBACK}`
}

/**
 * THE WORDS OF THE ROW UNDER A POINT OF THE PAGE, as the terminal holds them, or nothing off its rows. A right-click
 * never lands on a drawn row, because xterm's rows take no pointer, so the row is found by the point's height on
 * xterm's screen, which is the rows one under another from its top.
 */
function theRowAt(term: Terminal, x: number, y: number): string {
  const screen = term.element?.querySelector('.xterm-screen')?.getBoundingClientRect()
  if (screen === undefined || x < screen.left || x >= screen.right || y < screen.top || y >= screen.bottom) return ''
  const buffer = term.buffer.active
  const row = Math.floor(((y - screen.top) / screen.height) * term.rows)
  return buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? ''
}

/** The parts of xterm 6.0.0's CompositionHelper that `sendEachCommittedWordOnce` reads and replaces. */
interface CompositionInside {
  _isComposing: boolean
  _isSendingComposition: boolean
  _compositionPosition: { start: number; end: number }
  _compositionView: HTMLElement
  _textarea: HTMLTextAreaElement
  _dataAlreadySent: string
  _coreService: { triggerDataEvent: (data: string, wasUserInput?: boolean) => void }
  _finalizeComposition: (waitForPropagation: boolean) => void
  _handleAnyTextareaChanges: () => void
}

/**
 * A WORD COMMITTED BY AN INPUT METHOD REACHES THE SHELL ONCE AND WHOLE, HOWEVER FAST THE NEXT KEY COMES (wave 13u
 * round 6). Measured through fcitx5's pinyin on 5 October 2026, with a digit typed 15 ms after each commit, 12 words in
 * 100 on the English page and 15 on the Chinese page did not reach the shell whole, once and in their place; 5 ms
 * after, about half did not. With words typed one after another, xterm 6.0.0 sent some twice. With these changes,
 * 1,200 of 1,200 words arrived as typed, at 15, 5 and 2 ms.
 * Every fault is a timer in xterm's CompositionHelper that a fast typist overtakes, because Chromium handles waiting
 * keys before waiting timers. This replaces two of its methods on this terminal's helper with xterm 6.0.0's own
 * code, changed in three places:
 *
 *   1. CUT. xterm notes where a composition ends in a timer after each compositionupdate. A key pressed just after the
 *      compositionend makes it send the text up to that end at once, and the end was still the one an earlier update
 *      left: it sent "中" for 中文, or nothing. Here a key sends up to where the text box's text ends at that moment,
 *      which is where xterm's timer would have put the end.
 *   2. LOST OR SENT TWICE, AFTER A COMPOSITION. Each compositionend sets a timer that sends from that composition's
 *      start if the one flag that says a send is waiting is still up. A timer held back until a later compositionend
 *      had put the flag up again sent from its own old start, so words already sent went again; a key that finished
 *      a composition sent only the newest one, and the words still waiting were never sent. Here one position says
 *      where the composed text nobody has sent yet begins. Whatever sends first, a timer or a key, sends everything
 *      from there and clears it, and a later timer finds nothing waiting.
 *   3. SENT TWICE, FROM A KEY BEFORE A COMPOSITION. A key the input method takes before a composition starts makes
 *      xterm send, in a timer, whatever the text box gained meanwhile, unless a composition is going on when the
 *      timer runs. Run after a later composition had ended, it sent every word committed since, again. Here it sends
 *      nothing once a composition has begun since it was set: the composition sends its own words.
 *
 * These are private parts of xterm 6.0.0. If a new xterm no longer has them, this does nothing and words are lost
 * again; tests/an-input-method-word-is-not-lost.test.ts then fails, and each of the three changes taken out alone
 * turns one of its cases red.
 */
function sendEachCommittedWordOnce(term: Terminal): void {
  const inside = (term as unknown as { _core?: { _compositionHelper?: CompositionInside } })._core?._compositionHelper
  if (inside === undefined) return
  const box = inside._textarea
  /** Where the composed text nobody has sent yet begins in the text box, or null when none waits (change 2). */
  let waitingFrom: number | null = null
  /** How many compositions have begun (change 3). */
  let begun = 0
  box.addEventListener('compositionstart', () => (begun += 1))
  /** Send the waiting composed text, skipping `skip` characters at its start, up to `to`. */
  const sendWhatWaits = (skip: number, to: number): void => {
    if (waitingFrom === null) return
    const input = box.value.substring(waitingFrom + skip, to)
    waitingFrom = null
    inside._isSendingComposition = false
    if (input.length > 0) inside._coreService.triggerDataEvent(input, true)
  }
  inside._finalizeComposition = (waitForPropagation) => {
    inside._compositionView.classList.remove('active')
    inside._isComposing = false
    waitingFrom ??= inside._compositionPosition.start
    // Change 1: a key sends up to where the text ends now.
    if (!waitForPropagation) return sendWhatWaits(0, box.value.length)
    inside._isSendingComposition = true
    setTimeout(() => sendWhatWaits(inside._dataAlreadySent.length, inside._isComposing ? inside._compositionPosition.start : box.value.length), 0)
  }
  inside._handleAnyTextareaChanges = () => {
    const oldValue = box.value
    const begunBefore = begun
    setTimeout(() => {
      // Change 3: nothing, if a composition has begun since this timer was set.
      if (inside._isComposing || begun !== begunBefore) return
      const newValue = box.value
      const diff = newValue.replace(oldValue, '')
      inside._dataAlreadySent = diff
      if (newValue.length > oldValue.length) inside._coreService.triggerDataEvent(diff, true)
      else if (newValue.length < oldValue.length) inside._coreService.triggerDataEvent('\x7f', true)
      else if (newValue !== oldValue) inside._coreService.triggerDataEvent(newValue, true)
    }, 0)
  }
}

/** What the stream last said, when it is not simply running. */
type Reading =
  | { kind: 'reading' }
  | { kind: 'live' }
  | { kind: 'gone'; says: string }
  | { kind: 'failed'; sentence: string }

/** A sentence about something that went wrong, with the reason the office or the browser gave. */
interface Notice {
  word: string
  sentence: string | null
}

export function TerminalView({ terminal, onPutAway, onClosed, heading, canFit = true }: TerminalViewProps): React.ReactElement {
  useLanguage()
  const id = terminal.id
  const box = useRef<HTMLDivElement | null>(null)
  const xterm = useRef<Terminal | null>(null)
  const fitter = useRef<FitAddon | null>(null)
  const ended = useRef(terminal.state === 'ended')
  const closedSaid = useRef(false)
  const [reading, setReading] = useState<Reading>({ kind: 'reading' })
  const [readNumber, setReadNumber] = useState(0)
  const [current, setCurrent] = useState<TerminalReading>(terminal)
  const [size, setSize] = useState<{ cols: number; rows: number } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [armed, setArmed] = useState(false)
  const [typedFrom, setTypedFrom] = useState<TypedFrom | null>(null)

  // THE OWNER IS TOLD ONCE that the terminal was closed, whether this view closed it or the stream said so.
  const sayClosed = useRef(onClosed)
  sayClosed.current = onClosed
  const closedNow = useCallback((): void => {
    if (closedSaid.current) return
    closedSaid.current = true
    sayClosed.current()
  }, [])

  const typist = useMemo(
    () => aTypist(id, (sentence) => setNotice({ word: t('terminals.view.typingRefused'), sentence })),
    [id],
  )

  // READ THE TERMINAL, and again from a fresh screen each time readNumber moves.
  useEffect(() => {
    const stop = new AbortController()
    let term: Terminal | null = null
    setReading({ kind: 'reading' })
    void readTheTerminal(
      id,
      {
        onScreen: (now, screen) => {
          const into = box.current
          if (into === null || stop.signal.aborted) return
          term?.dispose()
          ended.current = now.state === 'ended'
          term = new Terminal({
            cols: now.cols,
            rows: now.rows,
            scrollback: 5000,
            fontFamily: thePagesFont(),
            fontSize: 14,
            theme: thePagesTheme(),
          })
          const fit = new FitAddon()
          term.loadAddon(fit)
          const typing = term
          // COPY AND PASTE WITH CTRL+SHIFT, which xterm would otherwise send to the program. Nothing is
          // intercepted while an input method is composing.
          term.attachCustomKeyEventHandler((event) => {
            if (event.isComposing || event.keyCode === 229) return true
            if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return true
            const key = event.code === 'KeyC' || event.key.toLowerCase() === 'c' ? 'c' : event.code === 'KeyV' || event.key.toLowerCase() === 'v' ? 'v' : null
            if (key === null) return true
            if (event.type === 'keydown') {
              event.preventDefault()
              if (key === 'c') copyFrom(typing)
              else pasteInto(typing)
            }
            return false
          })
          term.onData((data) => {
            if (!ended.current) typist.type(data)
          })
          term.open(into)
          sendEachCommittedWordOnce(term)
          term.write(screen)
          // THE VIEW IS BROUGHT TO WHERE THE PERSON LOOKS, and takes the keys, so a press visibly opens it (the review of
          // round 2's pictures, point 6).
          into.scrollIntoView({ block: 'nearest' })
          term.focus()
          xterm.current = term
          fitter.current = fit
          setCurrent(now)
          setSize({ cols: now.cols, rows: now.rows })
          setReading({ kind: 'live' })
        },
        onOutput: (data) => term?.write(data),
        // ANOTHER READER'S FIT, or this one's: the terminal has one size, and every view draws it.
        onResized: (cols, rows) => {
          term?.resize(cols, rows)
          setSize({ cols, rows })
        },
        onEnded: (exit) => {
          ended.current = true
          setCurrent((was) => ({ ...was, state: 'ended', exit }))
        },
        onClosed: () => closedNow(),
        onGone: (says) => setReading({ kind: 'gone', says }),
        onFailed: (sentence) => setReading({ kind: 'failed', sentence }),
        onTypedFrom: (now) => setTypedFrom(now),
      },
      stop.signal,
    )
    return () => {
      stop.abort()
      term?.dispose()
      term = null
      xterm.current = null
      fitter.current = null
    }
    // copyFrom and pasteInto are left out on purpose: they only read refs and state setters.
  }, [id, readNumber, typist, closedNow])

  // Opening and ending change the space above the screen. Place it after React commits
  // that layout, so an offscreen renderer resumes even when no more output will arrive.
  useLayoutEffect(() => {
    if (reading.kind === 'live') box.current?.scrollIntoView({ block: 'nearest' })
  }, [reading.kind, current.state])

  // THE THEME FOLLOWS THE PAGE: its data-theme attribute, and the system's dark setting.
  useEffect(() => {
    const again = (): void => {
      if (xterm.current !== null) xterm.current.options.theme = thePagesTheme()
    }
    const watcher = new MutationObserver(again)
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    dark.addEventListener('change', again)
    return () => {
      watcher.disconnect()
      dark.removeEventListener('change', again)
    }
  }, [])

  // THE SECOND PRESS IS WAITED FOR ONLY SO LONG.
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), CLOSE_WAITS_MS)
    return () => clearTimeout(timer)
  }, [armed])

  const refused = (word: string) => (err: unknown): void => setNotice({ word, sentence: whatARefusalSays(err) })

  function copyFrom(term: Terminal): void {
    const selected = term.getSelection()
    if (selected === '') {
      setNotice({ word: t('terminals.view.nothingSelected'), sentence: null })
      return
    }
    navigator.clipboard.writeText(selected).then(() => setNotice(null), refused(t('terminals.view.actionRefused')))
  }

  function pasteInto(term: Terminal): void {
    navigator.clipboard.readText().then((text) => {
      term.paste(text)
      term.focus()
    }, refused(t('terminals.view.actionRefused')))
  }

  const fit = (): void => {
    const term = xterm.current
    const proposed = fitter.current?.proposeDimensions()
    if (term === null || proposed === undefined || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)) {
      setNotice({ word: t('terminals.view.noRoom'), sentence: null })
      return
    }
    const cols = Math.max(THE_SMALLEST.cols, proposed.cols)
    const rows = Math.max(THE_SMALLEST.rows, proposed.rows)
    resizeTheTerminal(id, cols, rows).then(({ terminal: now }) => {
      if (xterm.current !== term) return
      term.resize(now.cols, now.rows)
      setSize({ cols: now.cols, rows: now.rows })
      setNotice(null)
    }, refused(t('terminals.view.actionRefused')))
  }

  const close = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    closeTheTerminal(id).then(() => closedNow(), refused(t('terminals.view.actionRefused')))
  }

  return (
    <section className="tm-view" aria-label={t('terminals.view.label')}>
      <style href="mole-office-terminal-view" precedence="default">
        {TERMINAL_VIEW_CSS}
      </style>
      <header className="tm-view-head">
        <div className="tm-view-what">
          {heading === undefined ? (
            <>
              <p className="tm-view-command tm-mono">{theCommandLine(current)}</p>
              <p className="tm-view-folder">
                <span className="tm-view-folder-word">{t('terminals.col.folder')}</span> <span className="tm-mono">{current.folder}</span>
              </p>
            </>
          ) : (
            <p className="tm-view-command">{heading}</p>
          )}
        </div>
        <span className="tm-view-state" data-state={current.state}>
          {terminalStateWord(current)}
        </span>
      </header>
      <div className="tm-view-tools">
        <Btn size="sm" onClick={() => xterm.current !== null && copyFrom(xterm.current)}>
          {t('terminals.view.copy')}
        </Btn>
        <Btn size="sm" onClick={() => xterm.current !== null && pasteInto(xterm.current)}>
          {t('terminals.view.paste')}
        </Btn>
        {/* WHAT A RIGHT-CLICK IN THE TERMINAL DOES: its own copy and paste, or Mole Office's box about the
            words selected in it, or with none selected, about the row under the pointer. xterm keeps both
            itself, so they are read from it. */}
        <RightClickSwitch
          region={box}
          selected={() => xterm.current?.getSelection() ?? ''}
          wordsAt={(x, y) => (xterm.current === null ? '' : theRowAt(xterm.current, x, y))}
          ownWords={t('terminals.view.rightClickOwn')}
        />
        {canFit ? (
          <Btn size="sm" onClick={fit}>
            {t('terminals.view.fit')}
          </Btn>
        ) : null}
        {size === null ? null : <span className="tm-view-size num">{t('terminals.view.size', size)}</span>}
        <span className="tm-view-leave">
          <Btn size="sm" onClick={onPutAway}>
            {t('terminals.view.putAway')}
          </Btn>
          {/* THE FIRST PRESS IS FORGOTTEN when focus leaves the button, or after CLOSE_WAITS_MS. Not when the
              pointer leaves it: the longer words of the second press move the button out from under the pointer. */}
          <span className="tm-view-close" onBlur={() => setArmed(false)}>
            <Btn size="sm" variant="danger" onClick={close}>
              {armed ? t('terminals.view.closeAgain') : t('terminals.view.close')}
            </Btn>
          </span>
        </span>
      </div>
      {reading.kind === 'reading' ? <p className="tm-view-says" role="status">{t('terminals.view.reading')}</p> : null}
      {reading.kind === 'gone' || reading.kind === 'failed' ? (
        <div className="tm-view-says tm-view-broken" role="status">
          <p>
            {reading.kind === 'gone' ? t('terminals.view.gone') : t('terminals.view.failed')}
            {reading.kind === 'failed' ? <> <span className="tm-mono">{reading.sentence}</span></> : null}
          </p>
          {reading.kind === 'gone' ? <ServerNote text={reading.says} /> : null}
          <Btn size="sm" onClick={() => setReadNumber((n) => n + 1)}>
            {t('terminals.view.readAgain')}
          </Btn>
        </div>
      ) : null}
      {notice === null ? null : (
        <p className="tm-view-says tm-view-notice" role="status">
          {notice.word}
          {notice.sentence === null ? null : <> <span className="tm-mono">{notice.sentence}</span></>}
        </p>
      )}
      <div className="tm-view-box" data-reading={reading.kind}>
        <div ref={box} className="tm-view-screen" role="group" aria-label={t('terminals.view.label')} />
      </div>
      {/* WHERE ITS TYPING CAME FROM, as the stream sends it, by point (d) of a decision, in round
          14. */}
      {typedFrom === null ? null : <TypedFromPanel typedFrom={typedFrom} />}
      {/* THEIR TYPING AS THEIR OWN WORDS: kept with no press while the switch is on (round 4), round 3's press while it is off. */}
      <KeepingWhatIType terminal={id} />
    </section>
  )
}

export const TERMINAL_VIEW_CSS = `
.tm-view {
  border: var(--border-w, 1px) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel);
  padding: var(--pad);
  min-width: 0;
  max-width: 100%;
  display: grid;
  gap: 0.6rem;
}
.tm-view-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.25rem var(--pad); min-width: 0; }
.tm-view-what { min-width: 0; flex: 1 1 16rem; }
.tm-view-command { margin: 0; font-weight: 600; color: var(--text); }
.tm-view-folder { margin: 0; color: var(--text-2); font-size: 0.9em; overflow-wrap: anywhere; }
.tm-view-folder-word { color: var(--text-3); }
.tm-view-state { color: var(--text-2); white-space: nowrap; }
.tm-view-state[data-state='running'] { color: var(--st-doing, var(--text)); font-weight: 600; }
.tm-view-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; min-width: 0; }
.tm-view-leave { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-inline-start: auto; min-width: 0; }
.tm-view .px-btn { white-space: normal; max-width: 100%; text-align: center; overflow-wrap: anywhere; }
.tm-view-size { color: var(--text-2); font-size: 0.9em; }
.tm-view-says { margin: 0; color: var(--text); }
.tm-view-broken { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.tm-view-broken p { margin: 0; }
.tm-view-notice { color: var(--text); }
.tm-view-box {
  width: 100%;
  min-width: 0;
  height: clamp(12rem, 60vh, 40rem);
  overflow: hidden;
  box-sizing: border-box;
  padding: 0.4rem;
  background: var(--panel-2);
  border: var(--border-w, 1px) solid var(--border);
  border-radius: var(--radius-sm);
}
.tm-view-box[data-reading='reading'] { visibility: hidden; height: 2rem; }
.tm-view-screen { width: 100%; height: 100%; overflow: auto; }
.tm-view-screen .xterm { display: inline-block; }
`
