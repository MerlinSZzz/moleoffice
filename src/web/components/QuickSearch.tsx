// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK SEARCH: AN ID OPENS ITS RECORD, AND A NAME FINDS A PAGE OR A RECORD, OVER ANY PAGE.
 *
 * The sidebar's press and Alt and X open it, by the event OPEN_THE_QUICK_SEARCH (src/web/lib/shortcuts.ts). It is one
 * field over the page being read.
 *
 * A PASTED ID OPENS ITS RECORD'S PAGE AT ONCE. The search door looks every text of an id's shape up by its key, in every
 * project, and answers it as `exact`. A record in another project opens in that project; a message is read from any
 * project, so it opens in this one. An id no record has is said in one line. The id of a record the reader may not read
 * is answered by the door as an id no record has, so it gets the same line.
 *
 * WORDS FIND THE PAGES whose names hold them, from the same groups and in the same order All pages draws them
 * (`allPagesDrawn`, and the plugin pages after the Office group), compared as All pages compares them: in the reader's
 * language, without case. The pages in front are found too, and Settings from the sidebar's foot after them all,
 * because Settings is in no group and so is not on All pages. WORDS FIND THE RECORDS of this project whose titles hold
 * them, from the search door, which lists only what the reader may read. At most RECORDS_DRAWN are drawn, and one more
 * is asked for, so that a line can say when there are more. The door ranks a hit in a title before every other hit, so
 * the titles in its answer are the first titles that hold the words.
 *
 * THE OFFICE IS ASKED ONCE THE TYPING STOPS, WAIT_MS after the last key, or at once on a paste, and one request at a
 * time. Words typed while a request is out are asked when it comes back, the newest only, and an answer to words no
 * longer in the field is dropped. Fewer than two characters ask nothing.
 *
 * Enter opens the first row. Escape, the close press and a press beside the box close it, and the focus goes back where
 * it was. A page opened from it, or by any link, closes it.
 */
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { content, t } from '@shared/i18n.ts'
import { isARecordId } from '@shared/messages.ts'
import { RECORD_KINDS, type RecordKind } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { OPEN_THE_QUICK_SEARCH } from '../lib/shortcuts.ts'
import { useSidebarArrangement } from '../lib/sidebar-arrangement.ts'
import { useSidebarPins } from '../lib/sidebar-pins.ts'
import { navigate, pluginPagePath, recordPath } from './router.tsx'
import { allPagesDrawn, Icon, theFootRows, usePluginPageRows, type IconName } from './Sidebar.tsx'

/** How long after the last key the words are asked of the office, in milliseconds. */
const WAIT_MS = 250
/** The most records drawn. One more is asked for, to know whether there are more. */
const RECORDS_DRAWN = 8
/** The fewest characters asked of the office. */
const FEWEST = 2

type Answer = { q: string; reply: Awaited<ReturnType<typeof api.search>> } | { q: string; failed: string }

/** Listens for the event that opens it, and draws it while it is open. */
export function QuickSearch() {
  const [open, setOpen] = useState(false)
  const cameFrom = useRef<HTMLElement | null>(null)
  const isOpen = useRef(false)
  isOpen.current = open
  useEffect(() => {
    const onOpen = (): void => {
      if (isOpen.current) return
      cameFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    window.addEventListener(OPEN_THE_QUICK_SEARCH, onOpen)
    return () => window.removeEventListener(OPEN_THE_QUICK_SEARCH, onOpen)
  }, [])
  // A PAGE OPENED, from a row, by Enter or by any link, closes it, and the focus stays with the page that opened.
  useEffect(() => {
    if (!open) return
    const onMoved = (): void => {
      cameFrom.current = null
      setOpen(false)
    }
    window.addEventListener('hashchange', onMoved)
    return () => window.removeEventListener('hashchange', onMoved)
  }, [open])
  if (!open) return null
  const close = (): void => {
    setOpen(false)
    cameFrom.current?.focus({ preventScroll: true })
    cameFrom.current = null
  }
  const opened = (): void => {
    cameFrom.current = null
    setOpen(false)
  }
  return <TheQuickSearch onClose={close} onOpened={opened} />
}

function TheQuickSearch({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const { language } = useLanguage()
  useSidebarArrangement()
  const mode = useMode()
  const { pins } = useSidebarPins()
  const plugins = usePluginPageRows()
  const [typed, setTyped] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const inTheField = useRef('')
  const asking = useRef<{ out: boolean; next: string | null; timer: number | null; gone: boolean }>({ out: false, next: null, timer: null, gone: false })
  useEffect(() => {
    const at = asking.current
    at.gone = false
    return () => {
      at.gone = true
      if (at.timer !== null) window.clearTimeout(at.timer)
    }
  }, [])

  const ask = (q: string): void => {
    const at = asking.current
    if (at.out) {
      at.next = q
      return
    }
    at.out = true
    api.search(q, undefined, RECORDS_DRAWN + 1).then(
      (reply): Answer => ({ q, reply }),
      (error: unknown): Answer => ({ q, failed: errorMessage(error) }),
    ).then((got) => {
      at.out = false
      const next = at.next
      at.next = null
      if (at.gone) return
      if (got.q === inTheField.current) {
        const exact = 'reply' in got ? got.reply.exact : null
        if (exact !== null) {
          // AN ID OPENS ITS RECORD, in its own project unless it is a message, which every project reads.
          const kind = (RECORD_KINDS as readonly string[]).includes(exact.kind) ? (exact.kind as RecordKind) : undefined
          onOpened()
          navigate(recordPath(exact.id, kind), exact.elsewhere && exact.workspaceId !== MESSAGE_CENTRE ? exact.workspaceId : undefined)
          return
        }
        setAnswer(got)
      } else if (next !== null && next === inTheField.current) {
        ask(next)
      }
    })
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value
    setTyped(value)
    const q = value.trim()
    inTheField.current = q
    const at = asking.current
    if (at.timer !== null) window.clearTimeout(at.timer)
    at.timer = null
    if (q.length < FEWEST) return
    if ((event.nativeEvent as InputEvent).inputType === 'insertFromPaste') ask(q)
    else at.timer = window.setTimeout(() => {
      at.timer = null
      ask(q)
    }, WAIT_MS)
  }

  const q = typed.trim()
  const words = q.toLocaleLowerCase(language)
  const everyPage: { key: string; to: string; label: string; icon: IconName }[] = allPagesDrawn(mode, pins).flatMap(({ group, rows }) => [
    ...rows.map(({ destination }) => ({ key: destination.key, to: destination.to, label: destination.label, icon: destination.icon })),
    ...(group.key === 'office' && plugins.status === 'ready'
      ? plugins.rows.map((row) => ({ key: `${row.id}/${row.slug}`, to: pluginPagePath(row.id, row.slug), label: row.label, icon: 'package' as const }))
      : []),
  ]).concat(theFootRows().map((destination) => ({ key: destination.key, to: destination.to, label: destination.label, icon: destination.icon })))
  const pages = q === '' ? [] : everyPage.filter((page) => page.label.toLocaleLowerCase(language).includes(words))
  const landed = answer !== null && answer.q === q ? answer : null
  const titled = landed !== null && 'reply' in landed ? landed.reply.results.filter((result) => result.hits.some((hit) => hit.where === 'title')) : []
  const records = titled.slice(0, RECORDS_DRAWN).map((result) => result.record)
  let line: string | null = null
  if (landed !== null && 'failed' in landed) line = t('quickSearch.failed', { error: landed.failed })
  else if (landed !== null && isARecordId(q)) line = t('quickSearch.unknownId', { id: q })
  // NOTHING FOUND is said only once the records are answered and the plugin pages are read, as All pages says it.
  else if (landed !== null && pages.length === 0 && records.length === 0 && plugins.status !== 'loading') line = t('quickSearch.none', { words: q })

  const onKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      document.querySelector<HTMLAnchorElement>('.qs a.qs-page, .qs a.qs-record')?.click()
    }
  }

  return (
    <div className="qs-veil" onClick={onClose}>
      <style href="mole-office-quick-search" precedence="default">
        {QUICK_SEARCH_CSS}
      </style>
      <section className="qs" role="dialog" aria-modal="true" aria-labelledby="qs-title" onClick={(event) => event.stopPropagation()} onKeyDown={onKey}>
        <header className="qs-head">
          <h2 className="qs-title" id="qs-title">{t('nav.quickSearch')}</h2>
          <button type="button" className="qs-close" onClick={onClose} aria-label={t('quickSearch.close')} title={t('quickSearch.close')}>
            {'×'}
          </button>
        </header>
        <label className="qs-find">
          <Icon name="find" />
          <input type="search" className="px-input" value={typed} autoFocus placeholder={t('quickSearch.find')} aria-label={t('quickSearch.find')} onChange={onChange} />
        </label>
        {line === null ? null : <p className="qs-line" role="status">{line}</p>}
        {pages.length === 0 ? null : (
          <section className="qs-group" aria-labelledby="qs-pages">
            <h3 className="qs-cap" id="qs-pages">{t('quickSearch.pages')}</h3>
            <ul className="qs-list">
              {pages.map((page) => (
                <li key={page.key}>
                  <a className="qs-page" href={`#${page.to}`}>
                    <Icon name={page.icon} />
                    <span className="qs-name">{page.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {records.length === 0 ? null : (
          <section className="qs-group" aria-labelledby="qs-records">
            <h3 className="qs-cap" id="qs-records">{t('quickSearch.records')}</h3>
            <ul className="qs-list">
              {records.map((record) => (
                <li key={record.id}>
                  <a className="qs-record" href={`#${recordPath(record.id, record.kind)}`}>
                    <span className="qs-name">{content(record.title)}</span>
                    <span className="qs-kind">{kindWord(record.kind, mode).text}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {titled.length > RECORDS_DRAWN ? <p className="qs-line">{t('quickSearch.more')}</p> : null}
      </section>
    </div>
  )
}

const QUICK_SEARCH_CSS = `
.qs-veil {
  position: fixed; inset: 0; z-index: var(--z-overlay);
  display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; box-sizing: border-box;
  background: color-mix(in srgb, var(--text) 35%, transparent);
}
.qs {
  display: flex; flex-direction: column; gap: 12px;
  width: min(640px, calc(100vw - 24px)); max-height: calc(88vh - 24px); overflow-y: auto;
  box-sizing: border-box; padding: 18px 22px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-lg);
  background: var(--panel); color: var(--text); box-shadow: var(--elev-2);
  font: var(--fs-2)/var(--lh-body) var(--font-ui);
}
.qs-head { display: flex; align-items: center; gap: 12px; }
.qs-title { margin: 0; font: var(--heading-weight) var(--fs-4)/var(--lh-tight) var(--font-ui); }
.qs-close {
  margin-inline-start: auto; min-width: 32px; min-height: 32px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-3)/1 var(--font-ui); cursor: pointer;
}
.qs-close:hover { background: var(--hover); }
.qs-close:focus-visible, .qs-page:focus-visible, .qs-record:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.qs-find { position: relative; display: block; }
.qs-find > .shell-ico { position: absolute; left: 12px; top: 50%; width: 18px; height: 18px; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.qs-find > input { width: 100%; box-sizing: border-box; padding-left: 40px; }
.qs-line { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.qs-cap { margin: 0 0 4px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); letter-spacing: .04em; text-transform: uppercase; }
.qs-list { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; list-style: none; }
.qs-page, .qs-record {
  display: flex; align-items: center; gap: var(--pad);
  min-height: var(--row-h); padding: 4px var(--pad); border-radius: var(--radius-sm);
  color: var(--text); text-decoration: none;
}
.qs-page:hover, .qs-record:hover { background: var(--hover); }
.qs-name { min-width: 0; overflow-wrap: anywhere; }
.qs-kind { flex: none; margin-left: auto; color: var(--text-3); font-size: var(--fs-1); }
@media (max-width: 480px) { .qs { padding: 14px 12px; } }
`
