// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useRef, useState } from 'react'

/**
 * Copy one string to the clipboard and say what happened.
 *
 * navigator.clipboard is undefined on an insecure origin and the write can be refused by
 * permissions; both have to become words on the screen. A copy button that silently does nothing is
 * worse here than anywhere else in the app — the whole point of a resume command or a record id is
 * that it is used verbatim, so a reader who thinks they copied it and pastes the previous clipboard
 * entry into a terminal or into an agent is exactly the outcome to prevent.
 *
 * WHY IT LIVES IN ITS OWN FILE AND NOT IN A COMPONENT FILE. It used to be exported from
 * components/SessionPanel.tsx, and components/RecordId.tsx imported it from there. Once ui.tsx
 * started drawing a record id on every row, that made a loop: ui.tsx imports RecordId, RecordId
 * imported SessionPanel, and SessionPanel imports ui.tsx. A loop between modules is decided by
 * which one the browser happens to load first, and the failure it produces is a value that is
 * undefined for no reason a reader of either file can see. A hook that depends on nothing but React
 * has no business being reachable only through a panel.
 *
 * components/ModuleView.tsx still has its own copy of this, for file paths. That is the recurring
 * defect in CLAUDE.md — one fact worked out in two places — and it is not fixed here because that
 * file has another owner this wave.
 */
export function useCopy(): { state: 'idle' | 'copied' | 'failed'; copy: (text: string) => void } {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const finish = (next: 'copied' | 'failed') => {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }

  return {
    state,
    copy: (text: string) => {
      if (!navigator.clipboard) {
        finish(copyTheOldWay(text) ? 'copied' : 'failed')
        return
      }
      navigator.clipboard.writeText(text).then(
        () => finish('copied'),
        () => finish(copyTheOldWay(text) ? 'copied' : 'failed'),
      )
    },
  }
}

/**
 * THE OLD WAY, FOR AN INSECURE ORIGIN. Copy id was blocked on a second machine, though the text was
 * already in the page and nothing needed to come from the server.
 * Nothing is fetched from the server: the browser itself withholds `navigator.clipboard` on a page
 * served over plain http from another machine (the owner's Tailscale address), and the helper then said
 * "failed" with nothing else tried. The older copy command still works there when it runs inside
 * the press, so it is tried before the press says it failed. The text is put in a textarea that is
 * off the screen and removed at once, and nothing about the page's selection is kept changed.
 * Returns whether the browser reported the copy done; false is still "failed", in words, as before.
 */
export function copyTheOldWay(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.setAttribute('aria-hidden', 'true')
  box.style.position = 'fixed'
  box.style.top = '-1000px'
  box.style.left = '-1000px'
  document.body.appendChild(box)
  const before = document.activeElement
  try {
    box.select()
    box.setSelectionRange(0, text.length)
    return document.execCommand('copy') === true
  } catch {
    return false
  } finally {
    box.remove()
    const focusable = before as { focus?: () => void } | null
    if (focusable && typeof focusable.focus === 'function') focusable.focus()
  }
}
