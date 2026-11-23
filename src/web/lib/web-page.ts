// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WEB PAGE THE WINDOW DRAWS, AS THE OFFICE PAGE SEES IT (wave 13t, package OT-B).
 *
 * The window draws the web page over a box this page lays out (components/WebPage.tsx), and this page reaches the
 * window through the bridge src/desktop/preload.cjs gives the office's own origin. The window checks every call again
 * (src/desktop/the-web-page.mjs), and keeps the address and place for its next start. This page keeps neither.
 *
 * In a browser there is no window to draw the page, so the form opens the address in a new tab. The page tells the two
 * apart with isTheWindow, as the quick note does. A page that reads as the window and was given no bridge says so,
 * and opens nothing.
 */
import { useSyncExternalStore } from 'react'
import { isTheWindow } from '../../config/the-window-mark.mjs'
import type { AskedDownload, Place, Said } from '../../desktop/the-web-page.mjs'

/** What the window says of its web page. `said` is what the bar was last told, and `asked` a download waiting for an answer. */
export type WebPageState =
  | { open: false; said: Said | null; asked: AskedDownload | null }
  | {
      open: true
      address: string
      place: Place
      title: string
      canGoBack: boolean
      canGoForward: boolean
      loading: boolean
      said: Said | null
      asked: AskedDownload | null
    }

/** The rectangle of the box on the screen, in the page's own pixels. */
export interface TheBox { x: number; y: number; width: number; height: number }

/** The bridge, as src/desktop/preload.cjs gives it. Each call answers whether the window did it. */
export interface TheWindowsWebPage {
  read(): Promise<unknown>
  open(asked: { address: string; place: Place }): Promise<boolean>
  place(box: TheBox): Promise<boolean>
  hide(): Promise<boolean>
  show(): Promise<boolean>
  back(): Promise<boolean>
  forward(): Promise<boolean>
  reload(): Promise<boolean>
  close(): Promise<boolean>
  openOutside(): Promise<boolean>
  /** Round 242: an https address, for an account sign-in, in the system's browser. Anything else is not opened. */
  openHttpsOutside(address: string): Promise<boolean>
  answerDownload(answer: { id: number; save: boolean }): Promise<boolean>
  onChange(then: (state: unknown) => void): void
}

/** The bridge, or null where the window gave none: in a browser, and on a window page on any other origin. */
export function theBridge(): TheWindowsWebPage | null {
  if (typeof window === 'undefined') return null
  return (window as { theWindowsWebPage?: TheWindowsWebPage }).theWindowsWebPage ?? null
}

/** Where a web page opens from this page: in the window, in a new tab of a browser, or nowhere. */
export function whereAWebPageOpens(): 'the window' | 'a new tab' | 'no bridge' {
  if (!isTheWindow(navigator.userAgent)) return 'a new tab'
  return theBridge() === null ? 'no bridge' : 'the window'
}

/** The state the window last said, or null before it has said any. */
let state: WebPageState | null = null
/** The form, with a new key each time it is opened, or null while it is closed. */
let form: number | null = null
let opened = 0
const watchers = new Set<() => void>()
const tellTheWatchers = () => { for (const watcher of watchers) watcher() }
const subscribe = (watcher: () => void) => {
  watchers.add(watcher)
  return () => { watchers.delete(watcher) }
}

/** The window's own answer, taken only in the shape it is sent in. Anything else is not a state, and is not drawn. */
function aState(said: unknown): WebPageState | null {
  if (typeof said !== 'object' || said === null || !('open' in said) || typeof said.open !== 'boolean') return null
  return said as WebPageState
}

let listening = false
/**
 * Read the window's web page once, and follow it from then on. The window opens the page it kept from its last start
 * when it is first asked. Nothing is read where there is no bridge.
 */
export function followTheWebPage(): void {
  const bridge = theBridge()
  if (listening || bridge === null) return
  listening = true
  bridge.onChange((said) => {
    state = aState(said)
    tellTheWatchers()
  })
  void bridge.read().then((said) => {
    state = aState(said)
    tellTheWatchers()
  })
}

export function useTheWebPage(): WebPageState | null {
  return useSyncExternalStore(subscribe, () => state, () => null)
}

/** Open the form that asks for an address and a place. */
export function openTheWebPageForm(): void {
  form = ++opened
  tellTheWatchers()
}

export function closeTheWebPageForm(): void {
  form = null
  tellTheWatchers()
}

export function useTheWebPageForm(): number | null {
  return useSyncExternalStore(subscribe, () => form, () => null)
}
