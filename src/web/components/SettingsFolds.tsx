// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE'S CATEGORY LIST, THE CHOSEN CATEGORY, AND THE OPEN PANELS IN IT. Layout A of wave 13y round 125
 * (item 62): the categories in a list on the left with the chosen one marked, and beside the list every panel of
 * that category open, with no fold to press. A Developer heading stands before the two developer categories at the
 * end of the list. Where the page is under 40rem wide the list is a row above the panels, which scrolls sideways.
 *
 * This takes back one part of the Settings design of 28 September 2026, that every panel is folded to its title, for
 * Settings only. The rest of that design stands: one page, the categories in their order, and the Tools category
 * holding one entry per tool.
 *
 * Only src/web/pages/SettingsPage.tsx uses these. Which panel goes in which category, which panels are drawn at all,
 * and which category is chosen are decided there; this file only draws what it is given.
 *
 * ---------------------------------------------------------------------------------------
 * A PANEL'S TITLE IS DRAWN HERE, AND THE PANEL INSIDE KEEPS ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Each panel component draws its own ui.tsx Panel, with its own title, and those files are not changed here. The
 * block draws the title as its heading, so the inner Panel's frame and title would draw the same thing twice. The
 * CSS below takes them off inside a block: the inner frame goes, and the inner head goes when it holds only the
 * title. A head that also holds an eyebrow or presses (Repositories has both) keeps them, without the title.
 *
 * ONLY THE CHOSEN CATEGORY IS DRAWN. Choosing another takes the first one's panels away, so something half written in
 * a panel is gone when the person chooses another category, as it is when they leave the page.
 */

import { useLayoutEffect, useState, type ReactNode } from 'react'

import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { washJumpTarget } from '../lib/motion.ts'
import { InReach } from './InReach.tsx'
import { declaredAttributes } from './declares.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { RouteLink } from './router.tsx'

/** One category as the list and the page draw it. */
export interface DrawnCategory {
  key: string
  title: string
  /** The name the list draws. Under the Developer heading it leaves out the word the heading already says. */
  inTheList: string
  /** Whether the category stands under the list's Developer heading. */
  developer: boolean
  /** The id of the category's heading, which the list's press controls. */
  anchor: string
}

/** The one id a panel's block carries, so an address can scroll to it. */
export function panelAnchor(surface: string): string {
  return `set-panel-${surface.replace(/^settings\./, '')}`
}

/**
 * How far below the top of the window the list stays. From 1024px up nothing else sticks there; below it the
 * frame's own bar (App.tsx, .shell-bar) sticks at the top, so the list stays under it. Read from the bar itself,
 * so a taller bar moves the list with it.
 */
function barHeight(): number {
  const bar = document.querySelector('.shell-bar')
  if (!(bar instanceof HTMLElement)) return 0
  const style = getComputedStyle(bar)
  if (style.display === 'none' || style.position !== 'sticky') return 0
  return bar.getBoundingClientRect().height
}

/**
 * How much sticks above an element at the top of the window besides the frame's bar: the list, when it is a row above.
 * The window already keeps the bar's height clear at its top (App.tsx, useTheBarIsRoomAtTheTop).
 */
function stuckAbove(target: HTMLElement): number {
  const row = document.querySelector('.sf-row')
  const rowIsAbove = row instanceof HTMLElement && getComputedStyle(row).position === 'sticky' && row.getBoundingClientRect().right > target.getBoundingClientRect().left
  return rowIsAbove ? row.getBoundingClientRect().height : 0
}

/** The room Settings keeps between what sticks above an element and the element's top, in pixels. */
export const ROOM_UNDER_THE_LIST = 8

/**
 * Scroll so an element's top sits just under what sticks above it: the frame's bar, and the category list when the
 * list is a row above the panels rather than beside them.
 */
function scrollUnderTheList(target: HTMLElement): void {
  target.style.scrollMarginTop = `${Math.ceil(stuckAbove(target)) + ROOM_UNDER_THE_LIST}px`
  target.scrollIntoView({ block: 'start' })
}

const THE_PERSON_ACTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Scroll an element of the page under the list, AND AGAIN WHENEVER THE PAGE CHANGES SIZE, until the person scrolls,
 * presses or types. Gives back what stops the following. A panel that fetches draws a short loading line first. A
 * panel above the element then lengthens and pushes it down, and near the foot the page is at first too short to
 * bring the element to the top. Measured in round 125: in Looks, Detail and Words pushed the sidebar's entry down by
 * more than 1,200px; in Agents and runs the Keys panel grew by 20px ten milliseconds after the last loading line
 * went, which left the last panel 20px short of the page's end; and a press of Looks from the foot of a long
 * category stopped with its heading 46px down, since the page was then 21px taller than the window, and it grew by
 * 1,245px a moment later.
 */
export function keepUnderTheList(target: HTMLElement): () => void {
  scrollUnderTheList(target)
  washJumpTarget(target)
  const settings = target.closest('.set')
  if (settings === null) throw new Error(`The Settings element "${target.id}" is drawn outside the page.`)
  const follow = new ResizeObserver(() => scrollUnderTheList(target))
  follow.observe(settings)
  const stop = () => follow.disconnect()
  for (const event of THE_PERSON_ACTS) window.addEventListener(event, stop, { once: true, passive: true })
  return () => {
    stop()
    for (const event of THE_PERSON_ACTS) window.removeEventListener(event, stop)
  }
}

/**
 * The list of categories. Beside the panels it stays in view as the page scrolls; below 40rem it is one row above
 * them that scrolls sideways, with InReach's mark on the edge that carries on past.
 */
export function CategoryList({ categories, chosen, onChoose }: { categories: readonly DrawnCategory[]; chosen: string; onChoose: (key: string) => void }) {
  useLanguage()
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    const measure = () => setTop(barHeight())
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const press = (category: DrawnCategory) => (
    <button
      key={category.key}
      type="button"
      className="sf-jump"
      data-category={category.key}
      aria-controls={category.key === chosen ? category.anchor : undefined}
      aria-current={category.key === chosen ? 'true' : undefined}
      onClick={() => onChoose(category.key)}
    >
      {category.inTheList}
    </button>
  )
  const developer = categories.filter((category) => category.developer)
  return (
    <nav className="sf-row" aria-label={t('settingsCats.row')} style={{ top }}>
      <style href="mole-office-settings-folds" precedence="default">
        {SETTINGS_FOLDS_CSS}
      </style>
      <InReach box="sf-list" name={t('settingsCats.row')} shape={categories.map((category) => category.key).join(' ')}>
        {categories.filter((category) => !category.developer).map(press)}
        {developer.length === 0 ? null : (
          <div className="sf-group" role="group" aria-labelledby="sf-group-developer">
            <span className="sf-group-name" id="sf-group-developer">
              {t('nav.group.developer')}
            </span>
            {developer.map(press)}
          </div>
        )}
      </InReach>
    </nav>
  )
}

/** The page's two columns: the list, and beside it (under it, below 40rem) the chosen category. */
export function SettingsColumns({ children }: { children: ReactNode }) {
  return <div className="sf-columns">{children}</div>
}

/** The chosen category: its heading, and its panels. */
export function SettingsCategory({ category, children }: { category: DrawnCategory; children: ReactNode }) {
  return (
    <section className="sf-cat" data-category={category.key} aria-labelledby={category.anchor}>
      <h2 className="sf-cat-title" id={category.anchor} data-title-is="its-label">
        {category.title}
      </h2>
      <div className="sf-cat-panels">{children}</div>
    </section>
  )
}

/** One panel, open: its title, and under it what the panel holds. */
export function SettingsPanelBlock({ surface, title, children }: { surface: string; title: string; children: ReactNode }) {
  useLanguage()
  return (
    <section className="sf-panel" id={panelAnchor(surface)} data-settings-panel={surface}>
      <h3 className="sf-head" data-title-is="its-label">
        <span className="sf-title">{title}</span>
      </h3>
      <div className="sf-body">{children}</div>
    </section>
  )
}

/**
 * THE MAIL TOOL'S ENTRY, THE FIRST OF THE TOOLS CATEGORY: the tool's name, what it does in one line, and under them
 * InstallTheMailTool, which draws the state, the presses that install it and turn it off, and the tool's own
 * settings (MailToolSettings). The state is read once, there.
 */
export function MailToolEntry({ title, children }: { title: string; children: ReactNode }) {
  useLanguage()
  const surface = 'settings.mailtool'
  // THE ENTRY IS THE REGION CALLED "The summons mail": InstallTheMailTool inside it draws no Panel of its own, so the
  // entry declares the name and its title is what draws it, as a Panel's heading does.
  return (
    <section className="sf-panel sf-tool" id={panelAnchor(surface)} data-settings-panel={surface} {...declaredAttributes({ surface: 'settings.mailtool' })}>
      <h3 className="sf-head" data-title-is="its-label">
        <span className="sf-title" {...DRAWS_THE_NAME}>{title}</span>
        <span className="sf-what">{t('settingsCats.mail.what')}</span>
      </h3>
      <div className="sf-body">{children}</div>
    </section>
  )
}

/**
 * AN ENTRY THAT LEADS TO A PAGE OF ITS OWN: its name is the link, and one line says what is there. Looks holds one,
 * "Arrange the sidebar": the sidebar's arrangement has a page of its own, so that Looks stays short.
 */
export function PageEntry({ surface, title, what, to }: { surface: 'settings.arrangesidebar'; title: string; what: string; to: string }) {
  useLanguage()
  return (
    <section className="sf-panel sf-to-page" id={panelAnchor(surface)} data-settings-panel={surface} {...declaredAttributes({ surface })}>
      <h3 className="sf-head" data-title-is="its-label">
        <RouteLink to={to} className="sf-title sf-title-link" {...DRAWS_THE_NAME}>
          {title}
        </RouteLink>
        <span className="sf-what">{what}</span>
      </h3>
    </section>
  )
}

/**
 * WHERE SETTINGS DRAWS ITS NARROW FACE: where the page itself, the box App.tsx names shell, is under 40rem wide. The
 * list of categories here and the panels that draw a narrow face of their own all read this one query, so they turn
 * at the same width. It is the page's width and not the window's, because with the chat beside the page the page is
 * far narrower than the window.
 */
export const SETTINGS_NARROW = '@container shell (max-width: 40rem)'

/** Every value is a token or a pixel count, and there is no backtick anywhere in here. */
const SETTINGS_FOLDS_CSS = `
.sf-columns {
  display: grid;
  grid-template-columns: minmax(11rem, 14rem) minmax(0, 1fr);
  align-items: start;
  gap: var(--gut);
  min-width: 0;
}
.sf-row {
  position: sticky;
  z-index: 2;
  min-width: 0;
  background: var(--bg);
}
.sf-list { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sf-group { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-top: var(--pad-lg); }
.sf-group-name {
  padding: 0 var(--pad);
  color: var(--text-2);
  font-family: var(--section-font);
  font-size: var(--fs-1);
  font-weight: var(--section-weight);
  line-height: var(--lh-tight);
  text-transform: var(--section-case);
  letter-spacing: var(--section-space);
}
.sf-jump {
  min-height: 32px;
  padding: 0 var(--pad);
  border: var(--border-w) solid transparent;
  border-radius: var(--look-radius);
  background: transparent;
  color: var(--text);
  font: var(--button-weight) var(--fs-2)/var(--lh-tight) var(--font-ui);
  text-align: left;
  cursor: pointer;
}
.sf-jump:hover { background: var(--hover); }
.sf-jump[aria-current="true"] {
  border-color: var(--border-strong);
  background: var(--panel);
  box-shadow: var(--button-shadow);
  font-weight: 600;
}

.sf-cat { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.sf-cat-title {
  margin: 0;
  color: var(--text-2);
  font-family: var(--section-font);
  font-size: var(--section-size);
  font-weight: var(--section-weight);
  text-transform: var(--section-case);
  letter-spacing: var(--section-space);
}
/* THE PAGE DOES NOT FOLLOW A PANEL AS THE PANELS LENGTHEN. Each panel draws a short loading line and then what it
   read, so a chosen category grows below its heading for a second or so. The browser's scroll anchoring would hold
   something below the heading in place and move the heading off the screen: 295px, measured in round 125 when Looks
   was chosen from the foot of Chat. Turned off on the page or on any part of it, the anchoring still moved the page
   by those 295px, so it is turned off for the whole document while Settings is drawn. */
html:has(.set) { overflow-anchor: none; }
.sf-cat-panels { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }

.sf-panel {
  min-width: 0;
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-1);
}
.sf-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px var(--gut);
  margin: 0;
  padding: var(--pad) var(--pad-lg) 0;
  color: var(--text);
  font: inherit;
}
.sf-to-page .sf-head { padding-bottom: var(--pad); }
.sf-title {
  font-family: var(--section-font);
  font-size: var(--panel-title-size);
  font-weight: var(--section-weight);
  line-height: var(--lh-tight);
  text-transform: var(--section-case);
  letter-spacing: var(--section-space);
  overflow-wrap: anywhere;
}
/* A link, coloured as every link is (styles.css), though its letters are a panel title's. */
.sf-title-link { color: var(--accent); }
.sf-what { min-width: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-tight); }

.sf-body { padding: 0 var(--pad-lg) var(--pad-lg); min-width: 0; }

/* THE PANEL INSIDE A BLOCK: its frame and its title are the block's now. */
.sf-body > .px-panel {
  border: 0; border-radius: 0; box-shadow: none; background: transparent; padding: var(--pad) 0 0;
}
.sf-body > .px-panel > .px-panel-head .px-panel-title { display: none; }
.sf-body > .px-panel > .px-panel-head:not(:has(.px-panel-kind, .px-panel-actions)) { display: none; }
.sf-body > .px-panel > .px-panel-head:not(:has(.px-panel-kind, .px-panel-actions)) + .px-panel-body { padding-top: 0; }
.sf-body > .imt-stack { padding-top: var(--pad); }

/* BELOW 40rem THE LIST IS A ROW ABOVE THE PANELS. The 40rem is the page's own width, as SETTINGS_NARROW says:
   beside a narrow page the list left the panels too little room. */
${SETTINGS_NARROW} {
  .sf-columns { grid-template-columns: minmax(0, 1fr); }
  .sf-row { padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
  .sf-list { flex-direction: row; align-items: center; gap: var(--pad); overflow-x: auto; }
  .sf-group { flex-direction: row; align-items: center; gap: var(--pad); margin: 0; }
  .sf-group-name { flex: none; white-space: nowrap; }
  .sf-jump { flex: none; white-space: nowrap; border-color: var(--border-strong); background: var(--panel); }
  .sf-what { display: none; }
}
/* A narrow page lets the row scroll away and wraps its categories, leaving the panels visible while scrolling. */
${SETTINGS_NARROW} {
  .sf-row { position: static; }
  .sf-list { flex-wrap: wrap; overflow-x: visible; }
  .sf-group { flex-wrap: wrap; }
}
`
