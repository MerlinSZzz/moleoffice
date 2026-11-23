// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYBOARD SHORTCUTS ON EVERY PAGE: THE KEY HANDLER, THE LIST OF KEYS, AND THE HINTS ON THE
 * PRESSES.
 *
 * Which keys there are, when one may fire and what the person turned off are worked out in
 * `src/web/lib/shortcuts.ts`. This file only acts on its answers and draws them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH KEY DOES
 * ---------------------------------------------------------------------------------------
 *
 * Ctrl+Shift+K  opens the chat as the sidebar's Chat row does (the top bar's chat press below 1024
 *               pixels), and closes it with the close drawn in its own frame: beside the page, over
 *               it, or in its own window. On the chat page a line says the chat is open.
 * Ctrl+/        opens or closes the list of keys.
 * Alt+O/C/G     go to Home, Decisions or Settings.
 * Alt+P         opens the list of projects in the sidebar, opening the drawer first on a narrow
 *               screen, and puts the focus on the project being read.
 * Alt+J         opens the next message waiting for your answer in the chat, with the same function
 *               a press on its row on the Decisions page uses. It is the first waiting message these
 *               keys have not opened yet.
 * Alt+K         opens again the message Alt+J opened before the one on screen.
 * Alt+R         puts the focus in this page's own search box. The corner chat's box and the sidebar
 *               are not this page's. With no search box, a line says so.
 * Alt+X         opens the quick search, as the sidebar's press does (components/QuickSearch.tsx).
 * Alt+L         switches between light and dark. From "follow the browser" it goes to the look that
 *               is not showing.
 *
 * On a Mac, Ctrl is ⌘ and Alt is Option.
 *
 * NO KEY ACTS ON A RECORD. A key only opens, closes, moves or changes the look, so a wrong press
 * costs one Escape.
 *
 * ---------------------------------------------------------------------------------------
 * THE HINTS ON THE PRESSES
 * ---------------------------------------------------------------------------------------
 *
 * Each press that has a key names it in its tooltip. Those presses are drawn by the sidebar, the top
 * bar and the chat, which this file does not change. So the hints are written onto them here: the
 * key is added to the press's own tooltip, and to `aria-keyshortcuts`. A key that is turned off has
 * no hint. When the press redraws its own tooltip, the hint is written again.
 */

import { useEffect, useRef, useState } from 'react'

import { t } from '@shared/i18n.ts'
import { settingsPath } from '@shared/addresses.ts'
import type { ShortcutId, ShortcutSettings } from '@shared/participants.ts'
import { targetAttributes } from '@shared/targets.ts'
import { api, errorMessage } from '../api.ts'
import { openTheChatAsChosen, theSplit } from '../lib/chat-split.ts'
import { useLanguage } from '../lib/language.ts'
import { useSendKey } from '../lib/send-key.ts'
import {
  OPEN_THE_LIST,
  OPEN_THE_QUICK_SEARCH,
  SHORTCUTS,
  SHORTCUT_SETTING_WORDS,
  aShortcutPress,
  chordForScreenReaders,
  chordText,
  chordsOf,
  isAMac,
  isOn,
  keyCap,
  keysOf,
  shortcutsNow,
  theShortcutFor,
  useShortcuts,
  type Chord,
  type ShortcutAction,
} from '../lib/shortcuts.ts'
import type { WaitingItem } from '../lib/waiting.ts'
import { messagesYouHaveNotRead, openAWaitingMessage } from './MessagesYouHaveNotRead.tsx'
import { choosePreset, theLookShowing } from './PresetBar.tsx'
import { navigate, pathFor } from './router.tsx'

// ------------------------------------------------------------------------------ how a key is drawn

/** One chord as keys: <kbd>Ctrl</kbd>+<kbd>/</kbd>, or <kbd>Alt</kbd>+<kbd>O</kbd>. */
export function ChordKeys({ chord, mac }: { chord: Chord; mac: boolean }) {
  const keys = keysOf(chord, mac)
  return (
    <span className="sck-chord">
      {keys.map((key, index) => (
        <span key={index}>
          {index === 0 ? null : '+'}
          <kbd className="sck-kbd">{key}</kbd>
        </span>
      ))}
    </span>
  )
}

/** Several chords, with "or" between them. */
export function ChordsKeys({ chords, mac, offs }: { chords: readonly Chord[]; mac: boolean; offs?: readonly boolean[] }) {
  return (
    <span className="sck-chords">
      {chords.map((chord, index) => (
        <span key={index} className="sck-one" data-off={offs?.[index] === true ? 'yes' : 'no'}>
          {index === 0 ? null : <span className="sck-then">{t('shortcuts.key.or')}</span>}
          <ChordKeys chord={chord} mac={mac} />
        </span>
      ))}
    </span>
  )
}

/** Plain keys that are not a chord of the table, such as Escape or Shift + right-click. Each goes through `keyCap`. */
function PlainKeys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="sck-chord">
      {keys.map((key, index) => (
        <span key={index}>
          {index === 0 ? null : '+'}
          <kbd className="sck-kbd">{key === RIGHT_CLICK ? t('shortcuts.key.rightClick') : keyCap(key)}</kbd>
        </span>
      ))}
    </span>
  )
}

/** Not a key: the press of the right mouse button, drawn beside Shift. */
const RIGHT_CLICK = 'right-click'

// ------------------------------------------------------------------------------ what each key does

/** A short line at the foot of the page. It goes after a few seconds. */
type Note = { words: string; key: number }

/** Is this element drawn at all, so a press on it can do something? */
function isShown(element: Element): boolean {
  return element.getClientRects().length > 0
}

/**
 * The messages Alt+J and Alt+K opened, in order, and where Alt+K stands among them. Kept for the
 * life of the page, so the keys can walk back to a message that has since been read.
 */
const opened: WaitingItem[] = []
let standingAt = -1

async function openAWaitingMessageByKey(
  direction: 'next' | 'previous',
  say: (words: string) => void,
): Promise<void> {
  // WALKING FORWARD AGAIN after Alt+K goes back through the ones already opened.
  if (direction === 'next' && standingAt < opened.length - 1) {
    standingAt += 1
    await openOne(opened[standingAt]!, say)
    return
  }
  if (direction === 'previous' && standingAt > 0) {
    standingAt -= 1
    await openOne(opened[standingAt]!, say)
    return
  }
  if (direction === 'previous' && standingAt === 0) {
    say(t('shortcuts.note.noPrevious'))
    return
  }
  let rows: WaitingItem[]
  try {
    rows = messagesYouHaveNotRead(await api.waiting())
  } catch (error) {
    say(t('shortcuts.note.waitingFailed', { why: errorMessage(error) }))
    return
  }
  const seen = new Set(opened.map((row) => row.id))
  const fresh = rows.filter((row) => !seen.has(row.id))
  // NOTHING OPENED YET AND ALT+K: the one before the first is the last one waiting.
  const row = direction === 'next' ? fresh[0] : fresh[fresh.length - 1]
  if (row === undefined) {
    say(t(direction === 'next' ? 'shortcuts.note.noNext' : 'shortcuts.note.noPrevious'))
    return
  }
  opened.push(row)
  standingAt = opened.length - 1
  await openOne(row, say)
}

async function openOne(row: WaitingItem, say: (words: string) => void): Promise<void> {
  try {
    await openAWaitingMessage(row)
  } catch (error) {
    say(`${t('decisionsAsks.openFailed')} ${errorMessage(error)}`)
  }
}

/** The chat, opened and closed exactly as the presses drawn on the page do it. */
function pressTheChat(say: (words: string) => void): void {
  // THE CHAT PAGE DRAWS NO CIRCLE AND NO SEAM: the chat is the page, and it is always open. An open
  // split is a `.px-chat` too, so the page is told apart by the frame it draws, not by the class.
  if (document.querySelector('.px-chat[data-where="page"]') !== null) {
    say(t('shortcuts.note.chatOnThisPage'))
    return
  }
  const where = theSplit().where
  if (where === 'closed') {
    openTheChatAsChosen()
    return
  }
  // THE CLOSE THAT IS DRAWN, so the key does what a press on it does: the seam beside the page, the
  // back over the page below 1024 pixels, and the cross in the chat's own window.
  const close =
    where === 'window'
      ? document.querySelector<HTMLButtonElement>('.px-chat-close')
      : (document.querySelector<HTMLButtonElement>('.px-chat-seam-away') ?? document.querySelector<HTMLButtonElement>('.px-chat-seam-back'))
  close?.click()
}

/** Open the list of projects in the sidebar and put the focus on the project being read. */
function openTheProjects(say: (words: string) => void): void {
  const switchPress = document.querySelector<HTMLButtonElement>('.sbp-switch')
  if (switchPress === null || switchPress.disabled) {
    say(t('shortcuts.note.noProjects'))
    return
  }
  // ON A NARROW SCREEN THE SIDEBAR IS A DRAWER, opened by the menu press in the top bar. When the
  // sidebar is narrowed to its icons, its small project square widens it again.
  const menu = document.querySelector<HTMLButtonElement>('.shell-menu')
  if (menu !== null && isShown(menu) && menu.getAttribute('aria-expanded') !== 'true') menu.click()
  const mini = document.querySelector<HTMLButtonElement>('.sbp-mini')
  if (mini !== null && isShown(mini)) mini.click()
  requestAnimationFrame(() => {
    const again = document.querySelector<HTMLButtonElement>('.sbp-switch')
    if (again === null) return
    if (again.getAttribute('aria-expanded') !== 'true') again.click()
    requestAnimationFrame(() => {
      const here =
        document.querySelector<HTMLButtonElement>('.sbp-choice[aria-current="true"]') ??
        document.querySelector<HTMLButtonElement>('.sbp-choice')
      here?.focus()
    })
  })
}

/** Put the focus in this page's own search box. */
function focusTheSearch(say: (words: string) => void): void {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('input[type="search"]')].filter(
    (box) => !box.disabled && isShown(box) && box.closest('aside.px-chat, .shell-side') === null,
  )
  const box = boxes[0]
  if (box === undefined) {
    say(t('shortcuts.note.noSearch'))
    return
  }
  box.focus()
  box.select()
}

/** Switch between light and dark. */
function switchTheLook(): void {
  choosePreset('theme', theLookShowing() === 'dark' ? 'light' : 'dark')
}

// ------------------------------------------------------------------------------ the hints

/** The presses that carry a hint, found by what they declare or by their class. */
function aTargetSelector(surface: string): string {
  const [name, value] = Object.entries(targetAttributes({ kind: 'uiSurface', surfaceId: surface as never }))[0]!
  return `[${name}="${value}"]`
}

const HINTED: readonly { id: ShortcutId; selector: () => string }[] = [
  { id: 'chat', selector: () => ['.px-chat-circle', aTargetSelector('rail.chat'), '.shell-chat-phone'].join(', ') },
  { id: 'home', selector: () => aTargetSelector('rail.home') },
  { id: 'decisions', selector: () => aTargetSelector('rail.decisions') },
  { id: 'settings', selector: () => aTargetSelector('rail.settings') },
  { id: 'project', selector: () => '.sbp-switch' },
  { id: 'quickSearch', selector: () => aTargetSelector('rail.quicksearch') },
]

/**
 * WRITE EACH HINT ONTO ITS PRESS, or take it off when the key is off. The press's own tooltip is
 * kept in `data-sck-base`, so the hint is added to it once and a tooltip the press redraws is read
 * afresh.
 */
function writeTheHints(settings: ShortcutSettings, mac: boolean): void {
  for (const { id, selector } of HINTED) {
    const chords = chordsOf(id).filter((chord) => isOn(id, chord, settings))
    for (const element of document.querySelectorAll<HTMLElement>(selector())) {
      const current = element.getAttribute('title')
      const ours = element.dataset['sckTitle']
      const base = ours !== undefined && current === ours ? (element.dataset['sckBase'] ?? '') : (current ?? '')
      if (chords.length === 0) {
        if (ours !== undefined && current === ours) {
          if (base === '') element.removeAttribute('title')
          else element.setAttribute('title', base)
        }
        element.removeAttribute('aria-keyshortcuts')
        delete element.dataset['sckTitle']
        delete element.dataset['sckBase']
        continue
      }
      const keys = chords.map((chord) => chordText(chord, mac)).join(` ${t('shortcuts.key.or')} `)
      const title = t('shortcuts.hint', { what: base === '' ? t(SHORTCUT_SETTING_WORDS[id]) : base, keys })
      if (current !== title) element.setAttribute('title', title)
      element.dataset['sckBase'] = base
      element.dataset['sckTitle'] = title
      element.setAttribute('aria-keyshortcuts', chords.map((chord) => chordForScreenReaders(chord, mac)).join(' '))
    }
  }
}

// ------------------------------------------------------------------------------ the component

export function ShortcutKeys() {
  useLanguage()
  const settings = useShortcuts()
  const sendKey = useSendKey()
  const mac = isAMac()
  const [listOpen, setListOpen] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const listOpenRef = useRef(false)
  const returnTo = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  listOpenRef.current = listOpen

  const say = (words: string): void => setNote({ words, key: Date.now() })

  const openTheList = (): void => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setListOpen(true)
  }
  const closeTheList = (): void => {
    setListOpen(false)
    returnTo.current?.focus()
    returnTo.current = null
  }

  const act = (action: ShortcutAction): void => {
    setNote(null)
    switch (action) {
      case 'chat':
        pressTheChat(say)
        return
      case 'keys':
        openTheList()
        return
      case 'home':
        navigate('/')
        return
      case 'decisions':
        navigate(pathFor('governance'))
        return
      case 'settings':
        navigate(settingsPath())
        return
      case 'project':
        openTheProjects(say)
        return
      case 'waiting-next':
        void openAWaitingMessageByKey('next', say)
        return
      case 'waiting-previous':
        void openAWaitingMessageByKey('previous', say)
        return
      case 'search':
        focusTheSearch(say)
        return
      case 'quick-search':
        window.dispatchEvent(new Event(OPEN_THE_QUICK_SEARCH))
        return
      case 'theme':
        switchTheLook()
        return
    }
  }
  const actRef = useRef(act)
  actRef.current = act
  const closeRefFn = useRef(closeTheList)
  closeRefFn.current = closeTheList

  // THE ONE KEY HANDLER, on the window, after the page's own handlers have run.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const press = aShortcutPress(event)
      const answer = theShortcutFor(press, { mac, settings: shortcutsNow() })
      // WHILE THE LIST IS OPEN, only its own keys act, and they close it. Escape is taken earlier.
      if (listOpenRef.current) {
        if (answer.what === 'fire' && answer.action === 'keys') {
          event.preventDefault()
          closeRefFn.current()
        }
        return
      }
      if (answer.what === 'fire') {
        event.preventDefault()
        actRef.current(answer.action)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mac])

  // ESCAPE CLOSES THE LIST, and only the list: taken before the page's own Escape handlers, so the
  // chat or the talk box under the list stay as they are.
  useEffect(() => {
    if (!listOpen) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      closeRefFn.current()
    }
    window.addEventListener('keydown', onEscape, true)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [listOpen])

  // THE SETTINGS GROUP'S PRESS OPENS THE LIST, which is the way to it on a phone.
  useEffect(() => {
    const onOpen = (): void => openTheList()
    window.addEventListener(OPEN_THE_LIST, onOpen)
    return () => window.removeEventListener(OPEN_THE_LIST, onOpen)
  }, [])

  // A NEW PAGE CLOSES THE LIST, so it never stays over a page it was not opened on.
  useEffect(() => {
    const onPage = (): void => {
      setListOpen(false)
      returnTo.current = null
    }
    window.addEventListener('hashchange', onPage)
    return () => window.removeEventListener('hashchange', onPage)
  }, [])

  // A LINE AT THE FOOT GOES AFTER A FEW SECONDS.
  useEffect(() => {
    if (note === null) return
    const timer = window.setTimeout(() => setNote(null), 4000)
    return () => window.clearTimeout(timer)
  }, [note])

  // THE HINTS, written now and again whenever the page changes a press or its tooltip.
  useEffect(() => {
    let queued = 0
    const write = (): void => {
      queued = 0
      writeTheHints(settings, mac)
    }
    write()
    const watcher = new MutationObserver(() => {
      if (queued === 0) queued = requestAnimationFrame(write)
    })
    watcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
    return () => {
      watcher.disconnect()
      if (queued !== 0) cancelAnimationFrame(queued)
    }
  }, [settings, mac])

  return (
    <>
      <style href="mole-office-shortcut-keys" precedence="default">
        {SHORTCUT_KEYS_CSS}
      </style>
      {note !== null ? (
        <p className="sck-line" role="status" data-shortcut-line="note" key={note.key}>
          {note.words}
        </p>
      ) : null}
      {listOpen ? <TheList settings={settings} sendKey={sendKey} mac={mac} onClose={closeTheList} closeRef={closeRef} /> : null}
    </>
  )
}

// ------------------------------------------------------------------------------ the list

/** The list of keys. It is drawn over the page while it is open. */
export function TheList({
  settings,
  sendKey,
  mac,
  onClose,
  closeRef,
}: {
  settings: ShortcutSettings
  sendKey: 'shift-or-alt-enter' | 'enter'
  mac: boolean
  onClose: () => void
  closeRef: React.RefObject<HTMLButtonElement | null>
}) {
  const anywhere = SHORTCUTS.flatMap((row) =>
    row.chords.filter((chord) => chord.kind === 'anywhere').map((chord) => ({ row, chord })),
  )
  const outside = SHORTCUTS.flatMap((row) =>
    row.chords.filter((chord) => chord.kind !== 'anywhere').map((chord) => ({ row, chord })),
  )
  const mod = mac ? '⌘' : 'Ctrl'
  // WHAT ENTER DOES IN A MESSAGE BOX, read from the one send-key setting, so the list says what the
  // boxes do now.
  const newLine: string[][] = sendKey === 'enter' ? [['Shift', 'Enter']] : [['Enter']]
  const send: string[][] = sendKey === 'enter' ? [['Enter'], ['Alt', 'Enter']] : [['Shift', 'Enter'], ['Alt', 'Enter']]

  return (
    <div className="sck-veil" onClick={onClose} data-shortcut-list="veil">
      <section
        className="sck-list"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sck-list-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sck-head">
          <h2 className="sck-title" id="sck-list-title">
            {t('settingsCats.cat.keys')}
          </h2>
          <button type="button" className="sck-close" ref={closeRef} onClick={onClose} aria-label={t('shortcuts.list.close')} title={t('shortcuts.list.close')}>
            {'×'}
          </button>
        </header>
        <div className="sck-cols">
          <div className="sck-col">
            <section className="sck-group" data-group="anywhere">
              <h3 className="sck-group-title">{t('shortcuts.group.anywhere')}</h3>
              {anywhere.map(({ row, chord }) => (
                <Row key={`${row.action}-${chordText(chord, mac)}`} what={t(row.what)} off={!isOn(row.id, chord, settings)} action={row.action}>
                  <ChordKeys chord={chord} mac={mac} />
                </Row>
              ))}
              <Row what={t('shortcuts.what.closeOpen')} off={false}>
                <PlainKeys keys={['Esc']} />
              </Row>
            </section>
            <section className="sck-group" data-group="outside">
              <h3 className="sck-group-title">{t('shortcuts.group.outside')}</h3>
              {outside.map(({ row, chord }) => (
                <Row key={`${row.action}-${chordText(chord, mac)}`} what={t(row.what)} off={!isOn(row.id, chord, settings)} action={row.action}>
                  <ChordKeys chord={chord} mac={mac} />
                </Row>
              ))}
            </section>
          </div>
          <div className="sck-col">
            <section className="sck-group" data-group="message">
              <h3 className="sck-group-title">{t('sendKey.ask')}</h3>
              <Row what={t('shortcuts.what.newLine')} off={false}>
                <Alternatives keys={newLine} />
              </Row>
              <Row what={t('shortcuts.what.send')} off={false}>
                <Alternatives keys={send} />
              </Row>
            </section>
            <section className="sck-group" data-group="already">
              <h3 className="sck-group-title">{t('shortcuts.group.already')}</h3>
              <Row what={t('shortcuts.what.savePlan')} off={false}>
                <PlainKeys keys={[mod, 'S']} />
              </Row>
              <Row what={t('shortcuts.what.moveLine')} off={false}>
                <Alternatives keys={[['Alt', '↑'], ['Alt', '↓']]} />
              </Row>
              <Row what={t('shortcuts.what.browserMenu')} off={false}>
                <PlainKeys keys={['Shift', RIGHT_CLICK]} />
              </Row>
            </section>
          </div>
        </div>
        <footer className="sck-foot">
          <a className="sck-foot-link" href={`#${settingsPath('settings.shortcuts')}`} onClick={onClose}>
            {t('shortcuts.list.toSettings')}
          </a>
        </footer>
      </section>
    </div>
  )
}

function Alternatives({ keys }: { keys: readonly (readonly string[])[] }) {
  return (
    <span className="sck-chords">
      {keys.map((one, index) => (
        <span key={index} className="sck-one">
          {index === 0 ? null : <span className="sck-then">{t('shortcuts.key.or')}</span>}
          <PlainKeys keys={one} />
        </span>
      ))}
    </span>
  )
}

function Row({ what, off, action, children }: { what: string; off: boolean; action?: ShortcutAction; children: React.ReactNode }) {
  return (
    <div className="sck-row" data-off={off ? 'yes' : 'no'} data-action={action}>
      <span className="sck-what">
        {what}
        {off ? <span className="sck-off">{t('shortcuts.off')}</span> : null}
      </span>
      <span className="sck-keys">{children}</span>
    </div>
  )
}

/**
 * The keys' own rules. Every value is a token, so a preset swap re-skins them with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
export const SHORTCUT_KEYS_CSS = `
.sck-kbd {
  display: inline-block; min-width: 1.6em; padding: 0 5px;
  border: var(--border-w) solid var(--border-strong); border-bottom-width: 2px; border-radius: var(--radius-sm);
  background: var(--panel-2); color: var(--text);
  font: var(--fs-1)/1.5 var(--font-mono); text-align: center; white-space: nowrap;
}
.sck-chord, .sck-chords { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px; }
.sck-chords { gap: 4px; }
.sck-one[data-off="yes"] .sck-kbd { color: var(--text-3); border-style: dashed; }
.sck-then { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); margin: 0 3px; }
.sck-line {
  position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: var(--z-overlay);
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px;
  max-width: calc(100vw - 24px); margin: 0; padding: 6px 12px;
  border: var(--border-w) solid var(--accent); border-radius: var(--radius);
  background: var(--panel); color: var(--text); box-shadow: var(--elev-2);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
}
.sck-veil {
  position: fixed; inset: 0; z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--text) 35%, transparent);
}
.sck-list {
  position: fixed; left: 50%; top: 48px; transform: translateX(-50%);
  width: min(760px, calc(100vw - 24px)); max-height: calc(100vh - 72px); overflow-y: auto;
  padding: 18px 22px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-lg);
  background: var(--panel); color: var(--text); box-shadow: var(--elev-2);
  font: var(--fs-2)/var(--lh-body) var(--font-ui);
}
.sck-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.sck-title { margin: 0; font: var(--heading-weight) var(--fs-4)/var(--lh-tight) var(--font-ui); }
.sck-close {
  margin-inline-start: auto; min-width: 32px; min-height: 32px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-3)/1 var(--font-ui); cursor: pointer;
}
.sck-close:hover { background: var(--hover); }
.sck-close:focus-visible, .sck-foot-link:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.sck-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.sck-group { margin-top: 14px; }
.sck-group-title { margin: 0 0 4px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); letter-spacing: .04em; }
.sck-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 6px 0; border-bottom: var(--border-w) solid var(--border);
}
.sck-row:last-child { border-bottom: 0; }
.sck-row[data-off="yes"] { color: var(--text-3); }
.sck-row[data-off="yes"] .sck-kbd { color: var(--text-3); border-style: dashed; }
.sck-what { min-width: 0; overflow-wrap: anywhere; }
.sck-off { margin-inline-start: 6px; font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.sck-keys { flex: none; max-width: 60%; text-align: end; }
.sck-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin-top: 14px; font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.sck-foot-link { color: var(--accent); }
@media (max-width: 60rem) {
  .sck-list {
    left: 0; top: 0; transform: none; width: 100vw; height: 100vh; max-height: none;
    border: 0; border-radius: 0; padding: 14px;
  }
  .sck-cols { grid-template-columns: 1fr; }
}
`
