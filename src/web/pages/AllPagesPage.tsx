// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ALL PAGES: every page of the office, in the groups of the sidebar's arrangement and in its order. The sidebar draws
 * the pages the person pinned in front, and one entry that leads here; with nothing kept those are Home, Reports,
 * Checklists and Decisions, with the chat after Home. The pages in front are drawn here grey, in their groups. A press
 * beside each page pins it last in front, or unpins it, and is kept at once (src/web/components/SidebarPins.tsx). The
 * plugin pages have no such press, because only the pages of the arrangement can be pinned (src/shared/sidebar-pins.ts).
 *
 * The project block, with the project's name and the Switch, stands in the sidebar on every page, and This project's
 * group here lists the project's pages. The pages of the switched-on plugins follow the Office group. Developer is
 * listed only in developer mode, as it was in the sidebar. A group's caption opens its category page where it has one.
 *
 * THE SEARCH above the groups narrows the names as the person types. It compares the names as they are drawn, in the
 * reader's language, without case, and it compares the names of pages only, never a group's caption. It finds only the
 * pages not pinned, so a grey name is not drawn while words are typed. A group with no name that holds the words is
 * not drawn, and when no name holds them one line says so. Enter opens the first name
 * drawn, and Escape empties the field. The search takes the focus when the page opens. Opened from the menu at 390,
 * the menu gives the focus to the field marked `data-takes-the-focus` when it closes, instead of back to its own press.
 *
 * The groups are read from `allPagesDrawn`, and the sidebar's entry counts `allPagesGroups`, which is the same groups
 * less the pages in front. So the number beside All pages is the number of names drawn here that are not grey.
 */
import { useState, type KeyboardEvent } from 'react'
import { t } from '@shared/i18n.ts'
import type { AttentionHome } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { useSidebarArrangement } from '../lib/sidebar-arrangement.ts'
import { useSidebarPins } from '../lib/sidebar-pins.ts'
import { useReportsCount } from '../lib/report-count.ts'
import type { WaitingReply } from '../lib/waiting.ts'
import type { WorkspaceSight } from '../lib/workspace.ts'
import { declaredAttributes } from '../components/declares.ts'
import { categoryPath } from '../components/router.tsx'
import { allPagesDrawn, Icon, PluginPages, rowCount, useChecklistsWaiting, usePluginPageRows, type RowReadings } from '../components/Sidebar.tsx'
import { PinPress, PinsFault, usePinWrites } from '../components/SidebarPins.tsx'
import type { AsyncState } from '../components/ui.tsx'

/** The shell's readings a row's count is read from. Without them no row draws a count. */
export interface AllPagesCounts {
  attention: AsyncState<AttentionHome>
  waiting: AsyncState<WaitingReply>
  wordsWaiting: AsyncState<{ total: number }>
}

export function AllPagesPage({ sight, counts }: { sight: WorkspaceSight; counts?: AllPagesCounts }) {
  const { language } = useLanguage()
  useSidebarArrangement()
  const mode = useMode()
  const { pins } = useSidebarPins()
  const reportsCountShown = useReportsCount()
  const pinWrites = usePinWrites()
  const plugins = usePluginPageRows()
  const [typed, setTyped] = useState('')
  const words = typed.trim().toLocaleLowerCase(language)
  const finds = (name: string): boolean => words === '' || name.toLocaleLowerCase(language).includes(words)
  // A GROUP WITH NO NAME THAT HOLDS THE WORDS is not drawn, and the plugin pages still follow Office's place.
  const groups = allPagesDrawn(mode, pins).map(({ group, rows }) => {
    const found = rows.filter((row) => words === '' || (!row.inFront && finds(row.destination.label)))
    return { group, rows: found, drawn: words === '' || found.length > 0 }
  })
  const pluginsFound = plugins.status === 'ready' ? { status: 'ready' as const, rows: plugins.rows.filter((row) => finds(row.label)) } : plugins
  // NOTHING FOUND is said only once the plugin pages are read, because until then one of them could hold the words.
  const nothingFound = words !== '' && !groups.some(({ drawn }) => drawn) && pluginsFound.status !== 'loading' && (pluginsFound.status === 'error' || pluginsFound.rows.length === 0)
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && words !== '') {
      event.preventDefault()
      document.querySelector<HTMLAnchorElement>('.ap-groups a.ap-page, .ap-groups a.ap-front')?.click()
    } else if (event.key === 'Escape' && typed !== '') {
      event.preventDefault()
      event.stopPropagation()
      setTyped('')
    }
  }
  // A ROW THAT HAD A COUNT IN THE SIDEBAR DRAWS IT HERE, after its words, worked out as the sidebar works it out.
  // Checklists' reading is asked for here only while it is not pinned; pinned, it is drawn grey with no count.
  const checklistsWaiting = useChecklistsWaiting(sight.id, counts !== undefined && !pins.includes('checklists'))
  const readings: RowReadings | null = counts === undefined ? null : {
    reply: counts.attention.status === 'ready' ? counts.attention.value : null,
    waiting: counts.waiting.status === 'ready' ? counts.waiting.value : null,
    wordsWaiting: counts.wordsWaiting.status === 'ready' ? counts.wordsWaiting.value.total : null,
    checklistsWaiting,
    reportsCountShown,
  }
  return (
    <div className="ap">
      <style href="mole-office-all-pages" precedence="default">
        {ALL_PAGES_CSS}
      </style>
      <h1 className="ap-title">{t('nav.allPages')}</h1>
      <label className="ap-find">
        <Icon name="find" />
        <input type="search" className="px-input" value={typed} autoFocus data-takes-the-focus placeholder={t('allPages.find')} aria-label={t('allPages.find')}
          onChange={(event) => setTyped(event.target.value)} onKeyDown={onKey} />
      </label>
      <PinsFault writes={pinWrites} />
      {nothingFound ? <p className="ap-none" role="status">{t('allPages.none', { words: typed.trim() })}</p> : null}
      <div className="ap-groups">
        {groups.map(({ group, rows, drawn }) => {
          const pluginGroup = group.key === 'office' ? <PluginPages key="plugins" plugins={pluginsFound} /> : null
          if (!drawn) return [pluginGroup]
          const links = (
            <ul className="ap-list">
              {rows.map(({ destination, inFront }) => {
                // A PAGE IN FRONT is drawn grey and opens its page as any name does. Its count is drawn in the sidebar.
                const count = readings === null || inFront ? null : rowCount(destination, readings)
                return (
                  <li key={destination.key}>
                    <a className={inFront ? 'ap-front' : 'ap-page'} href={`#${destination.to}`} title={destination.what} {...declaredAttributes({ surface: destination.surface })}>
                      <Icon name={destination.icon} />
                      <span>{destination.label}</span>
                      {count === null || count === 0 ? null : <span className="shell-badge num" title={t('nav.count', { n: count })}>{t('nav.badge', { n: count })}</span>}
                    </a>
                    <PinPress page={destination.key} writes={pinWrites} icon />
                  </li>
                )
              })}
            </ul>
          )
          return [
            <section key={group.key} className="ap-group" data-group={group.key} aria-labelledby={`ap-cap-${group.key}`}>
              <h2 className="ap-cap" id={`ap-cap-${group.key}`}>
                {group.key === 'all' ? group.caption : (
                  <a href={`#${categoryPath(group.key)}`} title={t('category.open', { group: group.caption })}>{group.caption}</a>
                )}
              </h2>
              {links}
            </section>,
            pluginGroup,
          ]
        })}
      </div>
    </div>
  )
}

const ALL_PAGES_CSS = `
/* THE TITLE IS DRAWN AS EVERY PAGE'S TITLE IS, by the stylesheet's own h1 rule; only its margin is this page's. */
.ap-title { margin: 0; }
.ap-find { position: relative; display: block; margin-top: var(--pad-lg); }
.ap-find > .shell-ico { position: absolute; left: 12px; top: 50%; width: 18px; height: 18px; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.ap-find > input { padding-left: 40px; }
.ap-none { margin: var(--pad-lg) 0 0; font-size: var(--fs-2); color: var(--text-2); }
.ap-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
  align-items: start;
  gap: var(--pad-lg);
  margin-top: var(--pad-lg);
}
.ap-group { min-width: 0; }
.ap-cap {
  margin: 0 0 var(--pad);
  font-size: var(--fs-1);
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-2);
}
/* A HEADING THAT OPENS ITS CATEGORY PAGE LOOKS AS THE OTHER HEADINGS DO, and is underlined only under the pointer. */
.ap-cap a { color: inherit; text-decoration: none; }
.ap-cap a:hover { text-decoration: underline; }
.ap-list { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; list-style: none; }
/* A PAGE AND ITS PIN PRESS share a line: the name takes the room, and the press stands at its end. */
.ap-list > li { display: flex; align-items: center; gap: 2px; min-width: 0; }
.ap-list > li > a { flex: 1 1 auto; min-width: 0; }
.ap-list > li > .px-btn { flex: none; border-color: transparent; background: transparent; box-shadow: none; padding: 0 6px; }
.ap-list > li > .px-btn:hover { background: var(--hover); box-shadow: none; transform: none; }
.ap-page, .ap-front {
  display: flex;
  align-items: center;
  gap: var(--pad);
  min-height: var(--row-h);
  padding: 4px var(--pad);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: var(--fs-2);
  text-decoration: none;
}
.ap-page:hover, .ap-front:hover { background: var(--hover); }
.ap-page > span, .ap-front > span { min-width: 0; overflow-wrap: anywhere; }
/* A PAGE IN FRONT is grey, its words and its icon. */
.ap-front { color: var(--text-3); }
.ap-page > .shell-badge { position: static; flex: none; margin-left: auto; box-shadow: none; }
.ap-failed { margin: 0; font-size: var(--fs-1); color: var(--st-failed); }
`
