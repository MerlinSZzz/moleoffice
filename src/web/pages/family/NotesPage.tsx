// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { RAIL_WORD_KEYS } from '@shared/surfaces.ts'
/**
 * `#/notes` — the Reports page: the reports and the notes of every project.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT HOLDS, AND WHAT IT STOPPED HOLDING ON 28 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 * Only reports and notes, from every project the office holds. The page is under All projects in
 * the sidebar, so it is not about the project chosen in the switcher. Each row names its project.
 *
 * Before, it listed every kind of the `notes` family in the chosen project only: agents, flows,
 * counters, incidents, merge entries and submitted tips were rows here (problem nYadrL5AnC-A). The
 * owner decided that Reports lists only reports and notes (question 9 of report
 * n9Mjk3c_sJRu). Which kinds, and which group a row is in, is
 * src/shared/reports-page.ts, read by the server door this page asks. The family in
 * src/shared/work.ts is unchanged; that file says why.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS DRAWN (the shared rules of report n9Mjk3c_sJRu, block b-3)
 * ---------------------------------------------------------------------------------------
 * The title is the sidebar row's own word. "Write a note" is the one primary press. Under the head
 * is one chooser, for reports, notes or both. Then plain lists: Needs you first, in the ask colour
 * (reports nobody has marked read), then This week, then Earlier. A section is not a box.
 *
 * A row is one link: the whole row opens the record. The title is on the left. On a wide screen the
 * facts sit at the right in columns side by side: the project, the kind (only when both kinds are
 * shown, because otherwise every row carries the same kind and the chooser already says it), the
 * read mark, and when it was filed. On a narrow screen the facts go on a second line under the title.
 *
 * "marked unread" and "not marked read" are two words, as on Home: one is somebody's statement and
 * the other is a gap nobody has filled. They are Home's own words, read from the same keys.
 */

import { useLayoutEffect } from 'react'
import { ReportStar } from '../../components/ReportStar.tsx'
import { targetAttributes } from '@shared/targets.ts'
import {
  REPORTS_PAGE_GROUPS,
  REPORTS_PAGE_SHOWS,
  REPORTS_PAGE_SIZE,
  type ReportsPageGroup,
  type ReportsPageShow,
} from '@shared/reports-page.ts'
import type { WordKey } from '@shared/i18n.ts'
import type { WorkspacesReply } from '../../../server/api/workspaces.ts'
import { api, type ReportsAndNotesReply, type ReportsAndNotesRow } from '../../api.ts'
import { FamilyHead, PageFoot, QuickFile, RowMarks } from '../../components/family/parts.tsx'
import { Pager } from '../../components/Pager.tsx'
import { navigate, pathFor, recordPath, RouteLink } from '../../components/router.tsx'
import { Absence, ErrorNote, Loading, Stamp, useAsync } from '../../components/ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import { projectName } from '../../lib/projects.ts'
import { useReportsCount } from '../../lib/report-count.ts'
import { SideBySide } from '../../components/SideBySide.tsx'
import { putThePageAt, thePlaceOnThePage } from '../../lib/page-scroll.ts'

/** The heading word of each group. */
const GROUP_HEADINGS: Readonly<Record<ReportsPageGroup, WordKey>> = {
  'needs-you': 'reports.needsYou',
  'this-week': 'g7a.notes.week',
  earlier: 'g7a.notes.earlier',
}

/** The word on each choice of the chooser. */
const SHOW_WORDS: Readonly<Record<ReportsPageShow, WordKey>> = {
  both: 'reports.show.both',
  reports: 'reports.show.reports',
  notes: 'reports.show.notes',
}

export function NotesPage({ onFiled }: { onFiled: () => void }) {
  return <NotesAtAddress key={window.location.hash} onFiled={onFiled} />
}

function NotesAtAddress({ onFiled }: { onFiled: () => void }) {
  const address = window.location.hash
  const params = new URLSearchParams(address.split('?')[1] ?? '')
  const choice = params.get('show')
  const show: ReportsPageShow = REPORTS_PAGE_SHOWS.find((value) => value === choice) ?? 'both'
  const rawOffset = Number(params.get('offset') ?? 0)
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
  const scope = params.get('scope') || undefined
  const rawFilter = params.get('filter')
  const filter = rawFilter === 'unread' || rawFilter === 'starred' ? rawFilter : undefined
  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
    for (const [key, value] of Object.entries(changes)) value === null ? next.delete(key) : next.set(key, value)
    const query = next.toString()
    navigate(`/notes${query === '' ? '' : `?${query}`}`)
  }
  const [state, reload] = useProjectAsync(
    () =>
      Promise.all([
        api.reportsAndNotes({ show, limit: REPORTS_PAGE_SIZE, offset, ...(scope === undefined ? {} : { scope }), ...(filter === undefined ? {} : { filter }) }),
        // THE PROJECT NAMES. A row says which project it is in, and only this reply knows what each
        // project is called. Both requests fail together, so no row is drawn with an id for a name.
        api.listWorkspaces(),
      ]),
    [show, offset, scope, filter],
  )
  const [starState, reloadStars] = useAsync(() => api.reportStars(), [])

  const filed = () => {
    onFiled()
    reload()
  }

  if (state.status === 'ready') {
    return (
      <>
      <ReportsPosition key={address} address={address} />
      <ReportsList
        reply={state.value[0]}
        projects={state.value[1]}
        stars={starState.status === 'ready' && starState.reReadError === undefined ? starState.value.stars : null}
        starFailed={starState.status === 'error' || (starState.status === 'ready' && starState.reReadError !== undefined)}
        filter={filter}
        onFilter={(next) => go({ filter: next === filter ? null : next, offset: null })}
        onModule={(id) => go({ scope: id, offset: null })}
        onStarChanged={() => { reload(); reloadStars() }}
        onShow={(next) => {
          go({ show: next, offset: null })
        }}
        onGo={(next) => go({ offset: next === 0 ? null : String(next) })}
        onClearScope={() => go({ scope: null, offset: null })}
        onFiled={filed}
      />
      </>
    )
  }
  return (
    <>
      <ReportsHead onFiled={filed} />
      {state.status === 'loading' ? <Loading label={t(RAIL_WORD_KEYS['rail.notes'])} rows={6} /> : null}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}
    </>
  )
}

/** Keep a return from a report in this tab at the place its list was left. */
function ReportsPosition({ address }: { address: string }) {
  useLayoutEffect(() => {
    let frame = 0
    const restore = () => {
      const top: unknown = window.history.state?.reportsPlace
      if (window.location.hash !== address || typeof top !== 'number' || !Number.isFinite(top) || top < 0) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (window.location.hash === address) putThePageAt(top)
      })
    }
    restore()
    // The router moves to the top on hashchange; restore after its listener has run too.
    window.addEventListener('hashchange', restore)
    const opening = (event: MouseEvent) => {
      const target = event.target
      if (window.location.hash !== address || !(target instanceof Element) || target.closest('.rpts-row') === null) return
      window.history.replaceState({ ...window.history.state, reportsPlace: thePlaceOnThePage() }, '')
    }
    document.addEventListener('click', opening, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', restore)
      document.removeEventListener('click', opening, true)
    }
  }, [address])
  return null
}

/** The page's head: the sidebar row's own word, and "Write a note", the one primary press. */
function ReportsHead({ onFiled }: { onFiled: () => void }) {
  return (
    <FamilyHead
      // THE SIDEBAR ROW'S OWN WORD, from the one key both read, so the two cannot differ again.
      title={t(RAIL_WORD_KEYS['rail.notes'])}
      actions={
        <QuickFile kind="note" label={t('g7a.notes.write')} fieldLabel={t('g7a.notes.field')} variant="primary" onFiled={onFiled} />
      }
    />
  )
}

/**
 * THE PAGE ONCE ITS READ HAS COME BACK: the head, the chooser, the lists, the pages and the foot,
 * drawn from one reply. Exported so a test can draw it without a server.
 *
 * The groups are the server's. A heading's count is the group's count over every page, and a page
 * draws only the groups that have rows on it. Needs you is the one group that says when it is
 * empty ("Nothing needs you"), and only on the first page. When only notes are shown it is not drawn
 * at all, because a note has no read mark and can never be in it. Only the Needs you number counts
 * unread reports, so only that number follows the unread report count switch; This week and Earlier
 * count every row and keep their numbers.
 */
export function ReportsList({
  reply,
  projects,
  onShow,
  stars = [],
  starFailed = false,
  filter,
  onFilter,
  onModule,
  onStarChanged,
  onGo,
  onClearScope,
  onFiled,
}: {
  reply: ReportsAndNotesReply
  projects: WorkspacesReply
  onShow: (show: ReportsPageShow) => void
  stars?: string[] | null
  starFailed?: boolean
  filter?: 'unread' | 'starred'
  onFilter?: (filter: 'unread' | 'starred') => void
  onModule?: (id: string) => void
  onStarChanged?: () => void
  onGo: (offset: number) => void
  onClearScope?: () => void
  onFiled: () => void
}) {
  const names = new Map(projects.workspaces.map((workspace) => [workspace.id, workspace.title]))
  const sayKind = reply.show === 'both'
  const reportsCountShown = useReportsCount()
  const needsYou = reply.show === 'notes' ? [] : reply.rows.filter((row) => row.group === 'needs-you')
  const groupOf = (group: ReportsPageGroup, rows: readonly ReportsAndNotesRow[]) => (
    <section key={group} className="rpts-group" data-group={group}>
      <h2 className="rpts-head">
        <span>{t(GROUP_HEADINGS[group])}</span>
        {group === 'needs-you' && !reportsCountShown ? null : <span className="rpts-count num">{reply.groups[group]}</span>}
      </h2>
      <ul className="rpts-list">
        {rows.map((row) => (
          <ReportRow key={row.id} row={row} project={projectName(row.workspaceId, names.get(row.workspaceId))} sayKind={sayKind} starred={stars === null ? null : stars.includes(row.id)} onStarChanged={onStarChanged} />
        ))}
      </ul>
    </section>
  )

  return (
    <>
      <ReportsHead onFiled={onFiled} />
      <div className="rpts" data-kinds={sayKind ? 'both' : 'one'}>
        <style href="mole-office-reports" precedence="default">
          {REPORTS_CSS}
        </style>

        {reply.scope === undefined ? null : (
          <div className="rpts-scope">
            <h2>{t('reports.scope.heading', { title: reply.scope.title })}</h2>
            <a href="#/notes" onClick={(event) => { if (onClearScope !== undefined) { event.preventDefault(); onClearScope() } }}>{t('reports.scope.clear')}</a>
          </div>
        )}
        <div className="rpts-choose" role="group" aria-label={t('reports.show.label')}>
          {REPORTS_PAGE_SHOWS.map((option) => (
            <button key={option} type="button" aria-pressed={option === reply.show} onClick={() => onShow(option)}>
              {t(SHOW_WORDS[option])}
            </button>
          ))}
        </div>

        <div className="rpts-filters" role="group" aria-label={t('reports.filter.label')}>
          <button type="button" aria-pressed={filter === 'unread'} onClick={() => onFilter?.('unread')}>{t('reports.filter.unread')}</button>
          <button type="button" aria-pressed={filter === 'starred'} onClick={() => onFilter?.('starred')}>{t('reports.filter.starred')}</button>
          <details className="rpts-modules">
            <summary aria-label={reply.scope?.kind === 'module' ? t('reports.filter.moduleChosen', { title: reply.scope.title }) : t('reports.filter.module')}>{reply.scope?.kind === 'module' ? t('reports.filter.moduleChosen', { title: reply.scope.title }) : t('reports.filter.module')}</summary>
            <div>{(reply.modules ?? []).map(module => <button type="button" key={module.id} onClick={() => onModule?.(module.id)}>{module.title}</button>)}</div>
          </details>
        </div>

        {/* WHERE MESSAGES ARE. They are not on this page, and the sidebar has no Messages row any more
            they are read in the chat, and the chat opens the Messages page.
            The two links are the sidebar's own words for those places. */}
        {/* WHERE MESSAGES ARE READ AND THE TWO PRESSES STAY IN SIGHT, and the rest is one press down. */}
        <div className="rpts-where">
          <p className="rpts-where-go">
            <RouteLink to={pathFor('chat')}>{t('nav.chat')}</RouteLink>
            {' · '}
            <RouteLink to={pathFor('messages')}>{t('nav.messages')}</RouteLink>
          </p>
        </div>

        {starFailed ? <p role="alert">{t('reports.star.failed')}</p> : null}
        {reply.matched === 0 ? (
          <p className="rpts-empty">
            <Absence word={t('absence.none')} />
          </p>
        ) : null}

        {/* NEEDS YOU AND THE LISTS FOLLOW THE PRODUCT'S ONE WIDTH RULE, components/SideBySide.tsx.
            When a report is waiting for you, Needs you is the column beside the lists on a wide
            screen and above them on a narrower one, which is why it is written first. When none is,
            there is no second column, because a column holding one quiet line is a stranded band. The
            count line is under both columns, at the whole width (wave 13y round 129, item 68). So when
            the lists have no row, their column is empty and is not drawn, and Needs you takes the width. */}
        <SideBySide className="rpts-sides">
          <div className="rpts-side" data-column="end">
            {needsYou.length === 0 ? null : groupOf('needs-you', needsYou)}
          </div>
          <div className="rpts-main" data-column="start">
            {REPORTS_PAGE_GROUPS.map((group) => {
              if (group === 'needs-you' && reply.show === 'notes') return null
              const rows = reply.rows.filter((row) => row.group === group)
              if (rows.length === 0) {
                if (group === 'needs-you' && reply.offset === 0 && reply.matched > 0 && reply.groups['needs-you'] === 0) {
                  return (
                    <p key={group} className="rpts-quiet" data-group={group}>
                      {t('reports.nothingNeedsYou')}
                    </p>
                  )
                }
                return null
              }
              if (group === 'needs-you') return null
              return groupOf(group, rows)
            })}
          </div>
          <div className="rpts-foot" data-column="across">
            <Pager offset={reply.offset} pageSize={reply.limit} total={reply.matched} onGo={onGo} />
          </div>
        </SideBySide>
      </div>
      <PageFoot what={t('sheet.record')} exclusions={t('reports.inspect')} />
    </>
  )
}

/** One row: the whole row opens the record, and its facts sit at its right. */
function ReportRow({ row, project, sayKind, starred, onStarChanged }: { row: ReportsAndNotesRow; project: string; sayKind: boolean; starred: boolean | null; onStarChanged?: () => void }) {
  return (
    <li>
      <a
        className="rpts-row"
        href={`#${recordPath(row.id, row.kind)}`}
        {...targetAttributes({ kind: 'record', recordId: row.id, workspaceId: row.workspaceId })}
      >
        <span className="rpts-title">{row.title}</span>
        <span className="rpts-facts">
          <span className="rpts-project">{project}</span>
          {sayKind ? <span className="rpts-kind">{t(row.kind === 'report' ? 'kind.report' : 'kind.note')}</span> : null}
          <span className="rpts-mark">
            <ReadMark row={row} />
          </span>
          <span className="rpts-when">
            <Stamp at={row.createdAt} />
          </span>
          <RowMarks record={row} />
        </span>
      </a>
      {row.kind === 'report' && starred !== null ? <ReportStar id={row.id} initial={starred} onChanged={onStarChanged} /> : null}
    </li>
  )
}

/**
 * WHERE A REPORT STANDS WITH ITS READER, in Home's words. A read report and a note draw nothing: a
 * read report is not waiting, and a note has no read mark to show.
 */
function ReadMark({ row }: { row: ReportsAndNotesRow }) {
  if (row.kind !== 'report' || row.read === 'read') return null
  if (row.read === 'unread') return <span className="rpts-unread">{t('home.reportUnread')}</span>
  return <Absence tier="told-apart" looked={false} word={t('home.notMarkedRead')} />
}

/**
 * The page's own sheet. One column of rows; each row is a grid whose fact columns have fixed widths,
 * so the facts of every row line up down the page. The facts' own box takes no part in the grid. Under 56rem of list width the facts go to a
 * second line. NO BACKTICK ANYWHERE IN THIS STRING, including in a comment.
 */
export const REPORTS_CSS = `
.rpts { display: flex; flex-direction: column; gap: calc(var(--gut) * 2); min-width: 0; container-type: inline-size; container-name: rpts; }
/* THE TWO COLUMNS, from the product's one width rule (components/SideBySide.tsx): the lists, and
   Needs you beside them when a report is waiting. The lists keep the width their six fact columns
   need, so Needs you is the narrower column. Each column measures its own width, so a row in the
   narrower one takes the form it takes on a phone rather than being squeezed. */
.rpts-sides { --sbs-columns: minmax(0, 1fr) minmax(16rem, 22rem); gap: calc(var(--gut) * 2); }
.rpts-main, .rpts-side { display: flex; flex-direction: column; gap: calc(var(--gut) * 2); min-width: 0; container-type: inline-size; container-name: rpts; }

.rpts-choose { display: inline-flex; align-self: flex-start; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
.rpts-choose button {
  appearance: none; border: 0; cursor: pointer;
  min-height: 32px; padding: 4px 12px;
  background: var(--panel); color: var(--text-2);
  font: 500 var(--fs-2)/var(--lh-tight) var(--font-ui);
}
.rpts-choose button + button { border-left: var(--border-w) solid var(--border-strong); }
.rpts-choose button:hover { background: var(--hover); color: var(--text); }
.rpts-choose button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); font-weight: 600; }
.rpts-choose button:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: -2px; }

.rpts-empty, .rpts-quiet { margin: 0; color: var(--text-3); font-size: var(--fs-2); }
.rpts-where { margin: 0; color: var(--text-2); font-size: var(--fs-2); display: grid; gap: var(--pad); }
.rpts-where-go { margin: 0; }

.rpts-group { display: flex; flex-direction: column; min-width: 0; }
.rpts-head {
  margin: 0 0 var(--pad); display: flex; align-items: baseline; gap: var(--pad);
  font-family: var(--section-font); font-size: var(--panel-title-size); font-weight: var(--section-weight);
  text-transform: var(--section-case); letter-spacing: var(--section-space); line-height: var(--lh-tight);
  color: var(--text);
}
.rpts-group[data-group="needs-you"] .rpts-head { color: var(--ask); }
.rpts-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }

.rpts-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
.rpts-list > li { border-bottom: 1px solid var(--border); display: flex; align-items: center; min-width: 0; }
.rpts-list > li > .rpts-row { flex: 1; min-width: 0; }
.rpts-filters { display: flex; flex-wrap: wrap; gap: var(--pad); align-items: flex-start; }
.rpts-filters button, .rpts-modules summary { cursor: pointer; font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 6px 10px; }
.rpts-filters button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); }
.rpts-modules { max-width: 100%; position: relative; }
.rpts-modules summary { overflow-wrap: anywhere; }
.rpts-modules > div { position: absolute; z-index: 2; background: var(--panel); border: 1px solid var(--border-strong); max-height: 16rem; overflow: auto; width: min(18rem, 75vw); display: grid; }
.rpts-modules > div button { text-align: left; overflow-wrap: anywhere; }
.rpts-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 11rem 4.5rem 9.5rem 6.5rem 8.5rem; align-items: center; gap: var(--pad) var(--gut);
  min-height: 44px; padding: var(--pad) var(--pad);
  color: var(--text); text-decoration: none;
}
.rpts[data-kinds="one"] .rpts-row { grid-template-columns: minmax(0, 1fr) 11rem 9.5rem 6.5rem 8.5rem; }
.rpts-group[data-group="needs-you"] .rpts-row { background: var(--ask-row); }
.rpts-row:hover { background: var(--hover); }
.rpts-row:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: -2px; }
.rpts-title { font-size: var(--fs-2); font-weight: 600; line-height: var(--lh-tight); overflow-wrap: anywhere; }
.rpts-facts { display: contents; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-tight); }
.rpts-facts > span { min-width: 0; color: var(--text-2); font-size: var(--fs-1); line-height: var(--lh-tight); }
.rpts-project { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rpts-when { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpts-unread { color: var(--ask); font-weight: 600; white-space: nowrap; }
.rpts .fam-marks { justify-self: end; }

/* THE FACTS GO UNDER THE TITLE WHEN THE TITLE WOULD HAVE LESS THAN ABOUT 16rem BESIDE THEM. The fact
   columns take 40rem, so that is under 56rem of list. It was 46rem, which left a title 90 pixels in
   the column beside Needs you at 1440; a whole page at 1440 or 990 is wider than 56rem either way. */
@container rpts (width < 56rem) {
  .rpts-row, .rpts[data-kinds="one"] .rpts-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .rpts-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); }
  .rpts-facts > span:empty { display: none; }
  .rpts .fam-marks { justify-self: auto; }
}
`
