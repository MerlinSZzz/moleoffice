// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useSidebarArrangement } from '../lib/sidebar-arrangement.ts'
/**
 * THE CATEGORY PAGES, AND THE PATH AND TABS ABOVE A PAGE ONE LEVEL DOWN. Wave 13q's S2, drawn again
 * in round 11 (R11a).
 *
 * Plan 7FEOshq3mBGG, row S2, on the second design draft. A press on the
 * name of a sidebar group opens a page of cards, one card for each page in the group. A page that
 * belongs to such a group shows, above itself, its path (group › page) and the group's other pages
 * as tabs. Both read the sidebar's own groups (railGroups() in components/Sidebar.tsx), so a page
 * moved between groups moves in the sidebar, on the cards and in the tabs at once.
 *
 * ROUND 12 (R12a) takes Settings out of the Office group: it stands at the sidebar's foot, so it
 * has no card on the Office page and no tabs above it.
 *
 * ROUND 14 (R14a) moves Goals, Counters, Context bundles and All records under All projects, by a
 * decision. All projects has no category page, so the four have no card on any category page
 * and no path or tabs above them.
 *
 * ROUND 11 draws the Agents, Office and This project pages as report n9Mjk3c_sJRu block b-17 says,
 * with two decisions: the title and one line, then what needs the person gathered from the pages
 * below, then the cards side by side. The Developer page
 * is not in this round and draws what it drew before: no line, no mark on a card without a count,
 * and "not read" in words.
 *
 * WHAT NEEDS THE PERSON IS READ FROM THE PAGE BELOW THAT ALREADY COUNTS IT, never worked out here. Today
 * only the Embassy has such a count: its asks at the door and its visitors asking to come in, both
 * rows of the one waiting reading App.tsx fetches for the rail. A page below with no such count adds
 * nothing, and a category page none of whose pages can hold such a thing draws no Needs you at all
 * (rule R6 of report n9Mjk3c_sJRu block b-3).
 *
 * A CARD SHOWS A NUMBER ONLY WHEN ITS PAGE HAS A COUNT OF ITS OWN, AND THEN IT SHOWS THAT COUNT, by
 * item 4 of a decision. A page's own count is the one number the page draws
 * for its whole subject: in its lead line, beside its one list, or as the count its list draws. The
 * card reads it with the request that page makes and the function that page counts with. A card
 * whose page has no such count draws no number and no mark standing for one. A count that could not
 * be read is the short mark with the reason on hover, never a 0.
 *
 * THIS PROJECT'S PAGE ALSO SHOWS WHICH OF ITS MODULES ARE IN PROGRESS (wave 13k round 22, item 3 of
 * a decision, from round 19's recommendation in report bdR-Vb2wif9d). The
 * modules panel (components/ModulesPanel.tsx) stands in the right-hand column beside the cards, by
 * the one width rule (components/SideBySide.tsx), because a list of modules is a different kind of
 * section from a set of links. It reads the modules of the project in the switcher, which is the
 * project this page is about, and the newest writes in the change log, and works nothing out
 * itself: which modules it draws is ModulesPanel's own rule. A project with no modules leaves the
 * column empty, and then the cards take the whole width, as the rule says an empty column does.
 */

import { content, t, type WordKey } from '@shared/i18n.ts'
import type { KindFamily } from '@shared/work.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { ACT_WORDS, whereAWaitingRowGoes, type WaitingItem, type WaitingReply } from '../lib/waiting.ts'
import { asksAtTheDoor } from '../components/AsksAtTheDoor.tsx'
import { ModulesPanel } from '../components/ModulesPanel.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
import { categoryPath, RouteLink, visitorPath, type CategoryKey, type Route } from '../components/router.tsx'
import { groupRows, railGroups, whereThePageIs, type Destination } from '../components/Sidebar.tsx'
import { Absence, type AsyncState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { shelvedNewestFirst } from './ShelvedPage.tsx'

/** How one card's number is read, and the words that carry it. */
interface GlanceReader {
  read: () => Promise<number>
  word: WordKey
}

/**
 * THE CARDS WHOSE PAGE HAS A COUNT OF ITS OWN, by the sidebar row's key. Each reads the request its
 * page reads and takes the number that page draws:
 * - working: WorkingPage's roster, the number beside Who is working (the rows of GET /api/working).
 * - tasksToTake: TasksToTakePage's lead line, the packaged tasks of GET /api/delegation.
 * - regulations: RegulationsPage's count beside Chapters.
 * - shelved: ShelvedPage's one list, counted by its own shelvedNewestFirst.
 *
 * Every other page on a category page has no count of its own, so its card has no number: Modules,
 * Pipelines, Findings and Ideas count each of their groups and not the whole; Agents,
 * Roles, Tools, the Embassy and the developer pages draw no one number for their subject.
 */
const GLANCES: Readonly<Record<string, GlanceReader>> = {
  working: { read: async () => (await api.whoIsWorking()).rows.length, word: 'category.glance.active' },
  tasksToTake: { read: async () => (await api.delegation()).tasks.length, word: 'category.glance.packaged' },
  regulations: { read: async () => (await api.officeRegulations()).chapters.length, word: 'category.glance.chapters' },
  shelved: {
    // The shelf is in each direction's data, so the whole direction is read, as ShelvedPage reads it.
    read: async () => shelvedNewestFirst((await api.listRecords('direction')).records).length,
    word: 'frameTriage.glance.shelved',
  },
}

/**
 * THE PAGES BELOW THAT COUNT WHAT NEEDS THE PERSON, by the sidebar row's key, and the rows each counts.
 *
 * The Embassy draws first the asks at the door (asksAtTheDoor over the waiting reading) and the
 * visitors asking to come in, which are the waiting reading's rows that whereAWaitingRowGoes sends
 * to a visitor's page. Both functions are the ones the Embassy and the waiting list already use, so
 * this page, the Embassy and the rail cannot count the same thing two ways.
 */
const NEEDS_YOU: Readonly<Record<string, (reply: WaitingReply) => WaitingItem[]>> = {
  embassy: (reply) => {
    const asks = new Set<WaitingItem>(asksAtTheDoor(reply))
    return reply.items.filter((item) => asks.has(item) || whereAWaitingRowGoes(item) === visitorPath(item.id))
  },
}

/** The page's one line under its title. The Developer page has none: it is not in this round. */
const LINES: Readonly<Partial<Record<CategoryKey, WordKey>>> = {
  agents: 'categoryPages.line.agents',
  office: 'categoryPages.line.office',
  project: 'categoryPages.line.project',
}

/**
 * The cards of one group. `caption` is the group's name as the sidebar draws it. `waiting` is the
 * one waiting reading App.tsx fetched for the rail; absent, no count of what needs the person is drawn.
 */
export function CategoryPage({
  category,
  caption,
  waiting,
}: {
  category: CategoryKey
  caption: string
  waiting?: AsyncState<WaitingReply>
}) {
  useLanguage()
  const sidebar = useSidebarArrangement()
  const group = railGroups().find((one) => one.key === category)
  if (group === undefined) throw new Error(`No sidebar group called "${category}".`)
  const rows = groupRows(group)
  const redrawn = category !== 'developer'
  const line = sidebar.changed ? 'sidebarSetting.categoryLine' : LINES[category]
  // Only the rows whose page counts what needs the person take part; a group with none draws no Needs you.
  const counting = rows.filter((row) => NEEDS_YOU[row.key] !== undefined)
  const cards = (
    <ul className="px-category-cards" aria-label={t('category.cards', { group: caption })}>
      {rows.map((row) => (
        <li key={row.key}>
          <CategoryCard row={row} redrawn={redrawn} {...(waiting === undefined ? {} : { waiting })} />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="px-category" data-category={category}>
      <style href="mole-office-category-page" precedence="default">
        {CATEGORY_CSS}
      </style>
      <h1 className="px-category-title">{caption}</h1>
      {line === undefined ? null : <p className="px-category-line">{t(line, { group: caption })}</p>}
      {counting.length === 0 || waiting === undefined ? null : <NeedsYou group={caption} rows={counting} waiting={waiting} />}
      {category === 'project' && rows.length > 0 ? (
        <SideBySide className="px-category-sides">
          <div data-column="start">{cards}</div>
          <ProjectModules />
        </SideBySide>
      ) : (
        cards
      )}
    </div>
  )
}

/**
 * How many of the newest writes in the change log are read for "written to recently". Forty, the
 * number Home read for the same panel when it drew it; the panel prints the number it was given.
 */
const MODULE_WRITES_READ = 40

/** This project's modules and the newest writes, read together for the modules panel. */
async function readProjectModules() {
  const [modules, log] = await Promise.all([api.listRecords('module', 'home'), api.listChanges({ limit: MODULE_WRITES_READ })])
  return { records: modules.records, changes: log.changes }
}

/**
 * THE MODULES PANEL IN THIS PAGE'S SECOND COLUMN, with a heading of its own.
 *
 * The column is empty while there is nothing to say about modules: a project with no modules at all
 * draws nothing here rather than a quiet line, so the cards take the whole width (SideBySide.tsx).
 * While the reading is under way the heading stands with the reading mark under it. A reading that
 * failed is the short mark with the reason on hover, never "No modules yet".
 */
function ProjectModules() {
  const mode = useMode()
  const [state] = useProjectAsync(readProjectModules, [])
  const empty = state.status === 'ready' && state.value.records.length === 0
  return (
    <section data-column="end" className="px-category-modules" aria-labelledby={empty ? undefined : 'px-category-modules-heading'}>
      {empty ? null : (
        <>
          <h2 id="px-category-modules-heading" className="px-category-modules-title">
            {t('categoryPages.modules.heading')}
          </h2>
          {state.status === 'loading' ? <p className="px-category-needs-quiet">{t('category.glance.reading')}</p> : null}
          {state.status === 'error' ? (
            <p className="px-category-needs-quiet">
              <Absence tier="ordinary" title={mode === 'inspect' ? `${t('categoryPages.modules.notRead')} ${state.message}` : t('categoryPages.modules.notRead')} />
            </p>
          ) : null}
          {state.status === 'ready' ? <ModulesPanel records={state.value.records} changes={state.value.changes} inspect={mode === 'inspect'} /> : null}
        </>
      )}
    </section>
  )
}

/** The waiting rows one page below counts as needing the person, or null when the reading is not ready. */
function needsOf(row: Destination, waiting: AsyncState<WaitingReply>): WaitingItem[] | null {
  const reader = NEEDS_YOU[row.key]
  if (reader === undefined || waiting.status !== 'ready') return null
  return reader(waiting.value)
}

/**
 * WHAT NEEDS THE PERSON, FIRST ON THE PAGE (rule R6): every row the pages below count, each opening where
 * the waiting list opens it, or one quiet line when there are none. A reading that failed is the
 * short mark with the reason on hover, never "Nothing needs you".
 */
function NeedsYou({ group, rows, waiting }: { group: string; rows: Destination[]; waiting: AsyncState<WaitingReply> }) {
  const mode = useMode()
  const heading = <h2 className="px-category-needs-title">{t('categoryPages.needs.heading')}</h2>
  if (waiting.status === 'loading') {
    return (
      <section className="px-category-needs" data-state="reading">
        {heading}
        <p className="px-category-needs-quiet">{t('category.glance.reading')}</p>
      </section>
    )
  }
  if (waiting.status === 'error') {
    const why = t('categoryPages.needs.notRead')
    return (
      <section className="px-category-needs" data-state="failed">
        {heading}
        <p className="px-category-needs-quiet">
          <Absence tier="ordinary" title={mode === 'inspect' ? `${why} ${waiting.message}` : why} />
        </p>
      </section>
    )
  }
  const items = rows.flatMap((row) => needsOf(row, waiting) ?? [])
  if (items.length === 0) {
    return (
      <section className="px-category-needs" data-state="nothing">
        <p className="px-category-needs-quiet">{t('categoryPages.needs.nothing')}</p>
      </section>
    )
  }
  return (
    <section className="px-category-needs" data-state="some">
      {heading}
      <ul className="px-category-needs-list" aria-label={t('categoryPages.needs.list', { group })}>
        {items.map((item) => (
          <li key={item.id}>
            <a className="px-category-needs-row" href={`#${whereAWaitingRowGoes(item)}`}>
              <span className="px-category-needs-name">{content(item.title)}</span>
              <span className="px-category-needs-act">{ACT_WORDS[item.act]}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CategoryCard({ row, redrawn, waiting }: { row: Destination; redrawn: boolean; waiting?: AsyncState<WaitingReply> }) {
  const reader = GLANCES[row.key]
  const counts = NEEDS_YOU[row.key] !== undefined && waiting !== undefined
  return (
    <a className="px-category-card" href={`#${row.to}`} data-card={row.key}>
      <span className="px-category-card-title">{row.label}</span>
      <span className="px-category-card-what">{row.what}</span>
      <span className="px-category-card-foot">
        {reader === undefined ? null : <Glance reader={reader} redrawn={redrawn} />}
        {counts ? <NeedsCount row={row} waiting={waiting} /> : null}
      </span>
    </a>
  )
}

/** How many things on this card's page need the person, drawn only when there are some. */
function NeedsCount({ row, waiting }: { row: Destination; waiting: AsyncState<WaitingReply> }) {
  const mode = useMode()
  if (waiting.status === 'error') {
    const why = t('categoryPages.needs.notRead')
    return (
      <span className="px-category-card-needs" data-failed="1">
        <Absence tier="ordinary" title={mode === 'inspect' ? `${why} ${waiting.message}` : why} />
      </span>
    )
  }
  const items = needsOf(row, waiting)
  if (items === null || items.length === 0) return null
  return <span className="px-category-card-needs num">{t('categoryPages.card.needs', { n: items.length })}</span>
}

function Glance({ reader, redrawn }: { reader: GlanceReader; redrawn: boolean }) {
  const mode = useMode()
  const [state] = useProjectAsync(reader.read, [reader])
  if (state.status === 'loading') return <span className="px-category-glance">{t('category.glance.reading')}</span>
  if (state.status === 'error') {
    if (redrawn) {
      // A count that could not be read is the short mark, never 0. The request's own words are
      // machinery, so only developer mode adds them to the reason.
      const why = t('categoryPages.card.notRead')
      return (
        <span className="px-category-glance" data-failed="1">
          <Absence tier="ordinary" title={mode === 'inspect' ? `${why} ${state.message}` : why} />
        </span>
      )
    }
    // The Developer page, as it was: the words "not read", the reason in developer mode only.
    return (
      <span className="px-category-glance" data-failed="1" {...(mode === 'inspect' ? { title: state.message } : {})}>
        {t('category.glance.failed')}
      </span>
    )
  }
  const said = t(reader.word, { n: state.value })
  // None of them is ordinary emptiness, so it is the short mark with the count behind it.
  if (state.value === 0) {
    return (
      <span className="px-category-glance">
        <Absence tier="ordinary" title={said} />
      </span>
    )
  }
  return <span className="px-category-glance num">{said}</span>
}

/**
 * THE PATH AND THE TABS, drawn once by the frame above every page that belongs to a group with a
 * category page. Nothing is drawn for a page in no such group, and the Developer group's pages get
 * none in normal mode, where the sidebar does not show that group either.
 */
export function WhereThisPageIs({
  page,
  family,
  project,
}: {
  page: Route['name']
  family?: KindFamily
  /** The project box's name as the sidebar draws it. */
  project: string
}) {
  useLanguage()
  useSidebarArrangement()
  const mode = useMode()
  const where = whereThePageIs(page, family)
  if (where === null) return null
  if (where.group.developer === true && mode !== 'inspect') return null
  const caption = where.group.key === 'project' ? project : where.group.caption
  return (
    <div className="px-where">
      <style href="mole-office-category-page" precedence="default">
        {CATEGORY_CSS}
      </style>
      <nav className="px-crumbs" aria-label={t('category.path')}>
        <ol>
          <li>
            <RouteLink to={categoryPath(where.group.key)}>{caption}</RouteLink>
          </li>
          <li aria-current="page">{where.row.label}</li>
        </ol>
      </nav>
      <nav className="px-tabs" aria-label={t('category.neighbours', { group: caption })}>
        <ul>
          {groupRows(where.group).map((row) => (
            <li key={row.key}>
              <a href={`#${row.to}`} {...(row.key === where.row.key ? { 'aria-current': 'page' as const } : {})}>
                {row.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

const CATEGORY_CSS = `
.px-category-title { margin: 0; font-size: var(--fs-5); line-height: 1.2; }
.px-category-line { margin: 4px 0 0; max-width: 72ch; font-size: var(--fs-2); color: var(--text-2); line-height: var(--lh-body); }
.px-category-title + .px-category-cards,
.px-category-line + .px-category-cards,
.px-category-line + .px-category-sides,
.px-category-line + .px-category-needs,
.px-category-needs + .px-category-cards { margin-top: var(--pad-lg); }

/* The modules panel beside the cards (round 22). The cards keep the wider first column; the panel's
   own heading is set like Needs you's, without its colour, because nothing here needs the person. */
.px-category-modules { min-width: 0; }
.px-category-modules-title { margin: 0 0 var(--pad); font-size: var(--fs-2); font-weight: 700; color: var(--text-2); }

/* What needs the person: a group in the ask colour, first on the page (rule R6). Its rows stand side by
   side at a wide window, so no row is one long line across the page. */
.px-category-needs { min-width: 0; margin: var(--pad-lg) 0 0; }
.px-category-needs-title { margin: 0 0 var(--pad); font-size: var(--fs-2); font-weight: 700; color: var(--ask); }
.px-category-needs-quiet { margin: 0; font-size: var(--fs-1); color: var(--text-3); }
.px-category-needs-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  gap: var(--pad);
  margin: 0;
  padding: 0;
  list-style: none;
}
.px-category-needs-list > li { display: flex; min-width: 0; }
.px-category-needs-row {
  flex: 1 1 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--pad);
  min-width: 0;
  min-height: 44px;
  padding: var(--pad) var(--pad-lg);
  border-left: 3px solid var(--ask-line);
  background: var(--ask-row);
  color: var(--text);
  text-decoration: none;
}
.px-category-needs-row:hover { background: var(--ask-bg); }
.px-category-needs-row:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-category-needs-name { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.px-category-needs-act { flex: 0 0 auto; font-size: var(--fs-1); font-weight: 700; color: var(--ask); }

.px-category-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
  gap: var(--gut);
  margin: 0;
  padding: 0;
  list-style: none;
}
.px-category-cards > li { display: flex; min-width: 0; }
.px-category-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 7rem;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--elev-1);
  color: var(--text);
  text-decoration: none;
}
.px-category-card:hover { background: var(--hover); }
.px-category-card:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-category-card-title { font-size: var(--fs-3); font-weight: 700; overflow-wrap: anywhere; }
.px-category-card-what { flex: 1 1 auto; font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); }
.px-category-card-foot { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px var(--pad); }
.px-category-card-foot:empty { display: none; }
.px-category-glance { font-size: var(--fs-1); font-weight: 700; color: var(--text-2); }
.px-category-glance[data-failed] { color: var(--st-failed); font-weight: var(--st-failed-weight); }
.px-category-card-needs { font-size: var(--fs-1); font-weight: 700; color: var(--ask); }

/* Above the page and outside it, so it takes the page's own width and side padding. */
.px-where {
  display: flex;
  flex-direction: column;
  gap: var(--pad);
  width: 100%;
  max-width: var(--shell-max);
  margin: 0 auto;
  padding: var(--pad-lg) var(--pad-lg) 0;
  min-width: 0;
}
.px-crumbs ol { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: var(--fs-1); color: var(--text-3); }
.px-crumbs li + li::before { content: "\\203A"; margin-right: 6px; color: var(--text-3); }
.px-crumbs a { color: var(--text-2); font-weight: 600; }
.px-crumbs [aria-current] { color: var(--text); font-weight: 600; }
.px-tabs ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0 0 var(--pad);
  list-style: none;
  border-bottom: var(--border-w) solid var(--border);
}
.px-tabs a {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 2px var(--pad);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
  text-decoration: none;
}
.px-tabs a:hover { background: var(--hover); color: var(--text); }
.px-tabs a[aria-current] { border-color: var(--chosen-edge); background: var(--chosen-bg); color: var(--chosen-ink); box-shadow: var(--chosen-shadow); }
@media (max-width: 480px) {
  .px-tabs a { min-height: 44px; }
}
`
