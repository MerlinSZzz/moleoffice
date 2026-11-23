// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/casting` — THE CASTING TABLE (选角表).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * For each role, every way the office casts it: the program, model, effort, when each suits (the
 * task's difficulty, the quota it uses, the cost for what it gives), the labels, the probability, the
 * Out until and one sentence why. A row says what it is for through its labels, which are the person's
 * own: they are made, renamed, given a meaning and removed on this page's Rules tab. The roll for a
 * worker's brief draws only rows that carry the label the brief names. Choosing again when models change
 * is recasting (重新选角), and only this table changes. In each list of castings one carries the mark
 * "The tools take this one" (工具用这一行): the tools that start agents, the builder's model and the
 * check's model take it when no model is named (src/server/lib/casting.ts), so what the page marks is
 * what a run is given. The mark is never called a default.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * Two tabs. The first draws a table of every list at a glance: a row for each role card, in the order
 * the cards are declared, and a column for every project and for each project with a list of its own. A
 * cell names the row the tools take and, for workers, the rows the roll draws. A press on a cell, on a
 * role or on a project's tab opens that one list below, and only that one. The list is a table, because
 * castings are compared column by column (R3), and on a phone it scrolls sideways in its own box (R8).
 * A row's line shows the cells a person picks between; its difficulty, quota, cost, reason, decisions and
 * last change are one press away, under More. Every cell shows its value and, under it, where the value
 * came from. An empty cell is drawn as absence, in words that are true on every path, except an empty
 * Out until, which is blank. Under a worker's list, for each label, what the roll draws now, as the roll
 * itself answers it. The second tab lists the labels with their meanings and rows, then the fixed rules
 * of the roll, one line each, from the code's own list.
 *
 * Each casting has its presses: its history, change, remove, and, on a casting that does not carry
 * the mark, a press that moves the mark to it. Each role has one press to add a casting. Every press is
 * drawn for every reader, the same for the person and for a secretary. The owner writes, and so does
 * an agent whose own key proves the secretary card (the power is in
 * design/permissions/roles.json). There is no browser-side check of the reader:
 * the server refuses anybody else with a code, and the refusal is drawn in the page's language under
 * the row or the form.
 * Each change names who made it, the person or which agent, in the row's last change and its history.
 * A casting also has a press for its native fields: a form under the row changes or clears them.
 *
 * NO NEEDS YOU: nothing on this page waits on a person.
 */
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import {
  CASTING_CELLS,
  WHEN_IT_SUITS_CELLS,
  normaliseACastingLabel,
  readCastingLabelIds,
  readCastingOutUntil,
  type CastingCell,
  type CastingCellSource,
  type CastingHistoryEntry,
  type CastingLabel,
  type CastingLabelDraw,
  type CastingNative,
  type CastingReading,
  type CastingRoleCard,
  type CastingRow,
  type CastingRowInTheTable,
  type CastingScope,
  type CastingStoredCell,
} from '@shared/casting.ts'
import { runtimeShownName } from '@shared/participants.ts'
import { stampInZone } from '@shared/time.ts'
import type { ProviderReading, ProviderRow } from '@shared/the-provider-table.ts'
import { api, errorMessage, faultOf, moleOfficeRequest, type Fault } from '../api.ts'
import { FamilyHead } from '../components/family/parts.tsx'
import { Absence, Btn, ErrorNote, Loading, Stamp, TextArea, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, pathFor, recordPath } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { InReach } from '../components/InReach.tsx'
import { CastingNativeForm, CastingNativeInputs, nativeFromInputs, type CastingNativeInputsValue } from '../components/CastingNativeFields.tsx'
import { useLanguage } from '../lib/language.ts'
import { useRecordNames } from '../lib/titles.ts'
import { FAMILY_SHEET } from './family/FamilyPage.tsx'
import { ParticipantName } from './NotebookPage.tsx'
import { cardWord } from '@shared/card-words.ts'

/** A project the page can name, for the "For" chooser. */
export interface CastingProject {
  id: string
  title: string
}

/** The cells a row shows under More: when each suits, and why. */
const UNDER_MORE: readonly CastingCell[] = [...WHEN_IT_SUITS_CELLS, 'why']
/** The cells a row shows on its line, in the table's order. */
const ON_THE_LINE: readonly CastingCell[] = CASTING_CELLS.filter((name) => !UNDER_MORE.includes(name))
/** The columns of one list's table: the mark and its presses, then the cells on the line. */
const COLUMN_COUNT = 1 + ON_THE_LINE.length
/** The page's two tabs: the lists, and the labels with the rules of the roll. */
const VIEWS = ['rows', 'rules'] as const

export function CastingPage() {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.casting(), [])
  const [projects] = useProjectAsync(() => api.listWorkspaces(), [])
  const [providerReading, readProvidersAgain] = useAsync(() => moleOfficeRequest<ProviderReading>('/api/casting/providers'), [])
  const known: CastingProject[] = projects.status === 'ready' ? projects.value.workspaces.map((one) => ({ id: one.id, title: one.title })) : []
  const providers: readonly ProviderRow[] = providerReading.status === 'ready' ? providerReading.value.providers : []
  const providersUnread = providerReading.status === 'error'
  return (
    <div className="fam cast">
      <style href="mole-office-family" precedence="default">
        {FAMILY_SHEET}
      </style>
      <style href="mole-office-casting" precedence="default">
        {CASTING_CSS}
      </style>
      <FamilyHead title={t('casting.title')} actions={null} />
      {providerReading.status === 'error' ? (
        <ErrorNote
          label={t('casting.providersUnreadRefusal')}
          message={providerReading.message}
          fault={providerReading.fault}
          retry={readProvidersAgain}
        />
      ) : null}
      {state.status === 'loading' ? <Loading what={t('casting.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} retry={readAgain} /> : null}
      {state.status === 'ready' ? <TheCasting reading={state.value} projects={known} providers={providers} providersUnread={providersUnread} onChanged={readAgain} /> : null}
    </div>
  )
}

/** Which list is open: a role, and a project or '' for every project. */
interface Picked {
  role: string | null
  project: string
}

/**
 * The whole table, drawn from what was fetched. Exported so a test can render it with no server, the
 * way `TheShelf` is.
 */
export function TheCasting({
  reading,
  projects,
  providers = [],
  providersUnread = false,
  onChanged,
}: {
  reading: CastingReading
  projects: readonly CastingProject[]
  providers?: readonly ProviderRow[]
  /** True when the provider table door could not be read, so the page cannot name a provider row. */
  providersUnread?: boolean
  onChanged?: () => void
}) {
  useLanguage()
  const [view, setView] = useState<(typeof VIEWS)[number]>('rows')
  // THE FIRST ROLE'S LIST FOR EVERY PROJECT IS OPEN AT FIRST. A role's press opens its list for every project.
  const [picked, setPicked] = useState<Picked>(() => ({ role: reading.roles[0]?.role ?? null, project: '' }))
  const card = reading.roles.find((one) => one.role === picked.role) ?? null
  const changed = onChanged === undefined ? {} : { onChanged }
  return (
    <section className="cast-body" {...declaredAttributes({ surface: 'casting.table' })}>
      <div className="cast-views" role="tablist" aria-label={t('casting.views')}>
        {VIEWS.map((one) => (
          <button key={one} type="button" role="tab" className="cast-tab" data-view={one} aria-selected={view === one} onClick={() => setView(one)}>
            {t(`casting.view.${one}`)}
          </button>
        ))}
      </div>
      {view === 'rules' ? (
        <RulesView reading={reading} {...changed} />
      ) : (
        <>
          <Glance reading={reading} picked={picked} onPick={setPicked} />
          {/* AN AGENT OF A HARNESS WITH NO ADAPTER has no row here, because no row can start it; it is named, not hidden. */}
          {reading.harnesses.length === 0 ? null : (
            <ul aria-label={t('casting.harnesses')}>
              {reading.harnesses.map((one) => (
                <li key={one.handle}>{`${content(one.handle)}: ${t('g6b.model.chosenInTheHarness', { runtime: content(one.harness) })}`}</li>
              ))}
            </ul>
          )}
          <div className="cast-pick" role="group" aria-label={t('casting.roles')}>
            {reading.roles.map((one) => (
              <button key={one.role} type="button" className="cast-tab" data-role={one.role} aria-pressed={one.role === picked.role} onClick={() => setPicked({ role: one.role, project: '' })}>
                {cardWord(one.role)}
              </button>
            ))}
          </div>
          {card === null ? null : (
            <RoleSection
              card={card}
              project={picked.project}
              onProject={(project) => setPicked({ role: card.role, project })}
              reading={reading}
              projects={projects}
              providers={providers}
              providersUnread={providersUnread}
              {...changed}
            />
          )}
        </>
      )}
    </section>
  )
}

/** The projects with a list of any role, in the order the roles first name them, after every project. */
function theProjectColumns(roles: readonly CastingRoleCard[]): { project: string; title: string | null }[] {
  const out: { project: string; title: string | null }[] = [{ project: '', title: null }]
  for (const card of roles) {
    for (const scope of card.scopes) {
      if (scope.project !== null && !out.some((one) => one.project === scope.project)) out.push({ project: scope.project, title: scope.projectTitle })
    }
  }
  return out
}

/**
 * EVERY LIST AT A GLANCE: a row for each role and a column for every project and each project with a list of its own.
 * A cell with a list names the row the tools take and, for workers, the rows the roll draws; a press on it opens it.
 */
function Glance({ reading, picked, onPick }: { reading: CastingReading; picked: Picked; onPick: (picked: Picked) => void }) {
  useLanguage()
  const columns = theProjectColumns(reading.roles)
  return (
    <InReach box="cast-glance-scroll" name={t('casting.title')} shape={`${String(reading.roles.length)}x${String(columns.length)}`}>
      <table className="cast-glance-table">
        <thead>
          <tr>
            <th scope="col">{t('casting.glance.role')}</th>
            {columns.map((column) => (
              <th key={column.project} scope="col">
                {column.project === '' ? t('casting.everyProject') : content(column.title ?? column.project)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reading.roles.map((card) => (
            <tr key={card.role} data-role={card.role}>
              <th scope="row">{cardWord(card.role)}</th>
              {columns.map((column) => {
                const scope = card.scopes.find((one) => (one.project ?? '') === column.project)
                // A PROJECT WITH NO LIST OF ITS OWN FOR THIS ROLE TAKES THE ONE FOR EVERY PROJECT, and has nothing to open.
                if (scope === undefined && column.project !== '') {
                  return (
                    <td key={column.project} className="cast-glance-cell" data-project={column.project}>
                      {t('casting.glance.takesEvery')}
                    </td>
                  )
                }
                return (
                  <td key={column.project} className="cast-glance-cell" data-project={column.project}>
                    <button
                      type="button"
                      className="cast-glance-open"
                      aria-pressed={picked.role === card.role && picked.project === column.project}
                      onClick={() => onPick({ role: card.role, project: column.project })}
                    >
                      {scope === undefined ? t('casting.glance.nobody') : <GlanceOfAList scope={scope} />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </InReach>
  )
}

/** One list in a glance cell: the row the tools take, then the rows the roll draws for any label. */
function GlanceOfAList({ scope }: { scope: CastingScope }) {
  useLanguage()
  const marked = scope.castings.find((row) => row.marked)
  const drawn: number[] = []
  for (const draw of scope.draws ?? []) {
    if (draw.choice !== 'drawn') continue
    for (const one of draw.rows) if (!drawn.includes(one.rowId)) drawn.push(one.rowId)
  }
  return (
    <>
      <span className="cast-glance-line">{marked === undefined ? t('casting.glance.noMark') : t('casting.glance.marked', { row: rowName(marked) })}</span>
      {drawn.length === 0 ? null : (
        <span className="cast-glance-line">{t('casting.glance.drawn', { rows: drawn.map((id) => rowName(theRowIn(scope.castings, id))).join(', ') })}</span>
      )}
    </>
  )
}

/** One role card: the tabs of its lists, the list picked, and the press that adds a casting. */
function RoleSection({
  card,
  project,
  onProject,
  reading,
  projects,
  providers,
  providersUnread,
  onChanged,
}: {
  card: CastingRoleCard
  project: string
  onProject: (project: string) => void
  reading: CastingReading
  projects: readonly CastingProject[]
  providers: readonly ProviderRow[]
  providersUnread: boolean
  onChanged?: () => void
}) {
  useLanguage()
  const [adding, setAdding] = useState(false)
  const scope = card.scopes.find((one) => (one.project ?? '') === project) ?? null
  const changed = onChanged === undefined ? {} : { onChanged }
  return (
    <section className="cast-role" data-role={card.role}>
      <h2 className="cast-role-name">
        <RouteLink to={pathFor('roles')}>{cardWord(card.role)}</RouteLink>
      </h2>
      <div className="cast-projects" role="tablist" aria-label={t('casting.projects')}>
        <button type="button" role="tab" className="cast-tab" data-project="" aria-selected={project === ''} onClick={() => onProject('')}>
          {t('casting.everyProject')}
        </button>
        {card.scopes.map((one) =>
          one.project === null ? null : (
            <button key={one.project} type="button" role="tab" className="cast-tab" data-project={one.project} aria-selected={project === one.project} onClick={() => onProject(one.project ?? '')}>
              {content(one.projectTitle ?? one.project)}
            </button>
          ),
        )}
      </div>
      {card.scopes.length === 0 ? <Absence word={t('casting.glance.nobody')} /> : null}
      {scope === null ? (
        card.scopes.length === 0 ? null : (
          <div className="cast-scope" data-project={project}>
            <Absence word={t('casting.glance.nobody')} />
          </div>
        )
      ) : (
        <ScopeGroup role={card.role} scope={scope} reading={reading} providers={providers} providersUnread={providersUnread} {...changed} />
      )}
      <div className="cast-add">
        <Btn size="sm" variant="secondary" onClick={() => setAdding((now) => !now)}>
          {t(adding ? 'casting.cancel' : 'casting.add')}
        </Btn>
        {adding ? (
          <CellsForm
            id={`cast-add-${card.role}`}
            start={null}
            reading={reading}
            projects={projects}
            providers={providers}
            providersUnread={providersUnread}
            send={(chosen, cells, native) => api.addCasting(card.role, { project: chosen, ...cells, ...(native === undefined ? {} : { native }) })}
            onDone={() => {
              setAdding(false)
              onChanged?.()
            }}
          />
        ) : null}
      </div>
    </section>
  )
}

/** One list of castings, every project or one project, with its table and, for workers, what the roll draws. */
function ScopeGroup({
  role,
  scope,
  reading,
  providers,
  providersUnread,
  onChanged,
}: {
  role: string
  scope: CastingScope
  reading: CastingReading
  providers: readonly ProviderRow[]
  providersUnread: boolean
  onChanged?: () => void
}) {
  useLanguage()
  return (
    <div className="cast-scope" data-project={scope.project ?? ''}>
      {/* ON A PHONE THE TABLE SCROLLS SIDEWAYS IN ITS OWN BOX (R8), and InReach marks the edge it carries on past. */}
      <InReach box="cast-scroll" name={t('casting.title')} shape={scope.castings.map((row) => `${String(row.id)}:${row.marked ? 'm' : ''}`).join(',')}>
        <table className="cast-table">
          <thead>
            <tr>
              <th scope="col">{t('casting.col.tools')}</th>
              {ON_THE_LINE.map((name) => (
                <th key={name} scope="col">{t(`casting.col.${name}`)}</th>
              ))}
            </tr>
          </thead>
          {scope.castings.map((row) => (
            <CastingRowView key={row.id} role={role} row={row} reading={reading} providers={providers} providersUnread={providersUnread} {...(onChanged === undefined ? {} : { onChanged })} />
          ))}
        </table>
      </InReach>
      {scope.draws === null ? null : <TheDraws draws={scope.draws} rows={scope.castings} labels={reading.labels} />}
    </div>
  )
}

/** For each label, what the roll would draw now among this list's rows, as the server worked it out with the roll. */
function TheDraws({ draws, rows, labels }: { draws: readonly CastingLabelDraw[]; rows: readonly CastingRowInTheTable[]; labels: readonly CastingLabel[] }) {
  useLanguage()
  const nameOf = theLabelNamer(labels)
  return (
    <div className="cast-draws">
      <h3 className="cast-scope-name">{t('casting.draw.heading')}</h3>
      {draws.length === 0 ? (
        <Absence word={t('casting.label.none')} />
      ) : (
        <ul className="cast-summary">
          {draws.map((draw) => (
            <li key={draw.label} data-label={draw.label}>
              <span className="cast-summary-label">{nameOf(draw.label)}</span>
              {': '}
              {draw.choice === 'drawn'
                ? t('casting.draw.drawn', { rows: draw.rows.map((one) => `${rowName(theRowIn(rows, one.rowId))} ${shareAsPercentage(one.share)}`).join(', ') })
                : draw.choice === 'marked'
                  ? t('casting.draw.marked', { row: draw.rows.map((one) => rowName(theRowIn(rows, one.rowId))).join(', ') })
                  : t('casting.notDrawn')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A row of a list by its id. The server names only rows of the list it answers for, so any other id is a broken answer. */
function theRowIn<T extends CastingRow>(rows: readonly T[], id: number): T {
  const row = rows.find((one) => one.id === id)
  if (row === undefined) throw new Error(`The Casting reading names row ${String(id)} where its list holds no such row.`)
  return row
}

/** A row as a person tells it apart in a sentence: its model, or its number when no model is written. */
function rowName(row: CastingRow): string {
  return row.cells.model.value === null ? t('casting.castingId', { id: String(row.id) }) : content(row.cells.model.value)
}

/** A share of the roll, from 0 to 1, as a percentage with at most one decimal. */
function shareAsPercentage(share: number): string {
  return `${String(Math.round(share * 1000) / 10)}%`
}

/** The name of each label by its id. A row names only labels the table holds, so any other id is a broken answer. */
function theLabelNamer(labels: readonly { id: number; name: string }[]): (id: number) => string {
  const names = new Map(labels.map((label) => [label.id, label.name]))
  return (id) => {
    const name = names.get(id)
    if (name === undefined) throw new Error(`The Casting reading names label ${String(id)}, and holds no such label.`)
    return content(name)
  }
}

/** The program as a person reads it: the tool's own name where the office knows the word. */
function programInWords(value: string): string {
  return content(runtimeShownName(value))
}

/** Who made a change: a person or an agent by name, or the migration that wrote it. */
function Who({ by }: { by: { kind: string; id: string } }) {
  useLanguage()
  if (by.kind === 'migration') return <>{t('casting.by.migration', { id: content(by.id) })}</>
  return <ParticipantName kind={by.kind === 'human' ? 'person' : by.kind} id={by.id} />
}

/**
 * A DECISION, NAMED BY ITS SHORT NAME AND NOT BY ITS ID. An id is a machine word (see src/web/lib/titles.ts). The name
 * is the label somebody wrote for it, or its title standing in, read through `useRecordNames`. Until that answers,
 * or when this project holds no such decision (one filed in another project, for example), the id is drawn on its
 * own, which claims nothing.
 */
function DecisionName({ id }: { id: string }) {
  const named = useRecordNames([id], 'label').get(id) ?? null
  return <RouteLink to={recordPath(id, 'decision')}>{content(named === null ? id : named.text)}</RouteLink>
}

/**
 * Where one cell's value came from: the decision, a copy by migration 0190, the move from Settings, or who set it here.
 * A value migration 0318 set carries the words the roll's old list carried for the decision, and they follow, labelled.
 */
function CellSource({ from }: { from: CastingCellSource }) {
  useLanguage()
  if (from.decision !== null) {
    return (
      <span className="cast-from">
        {t('casting.from.decision')} <DecisionName id={from.decision.id} />
        {from.copied ? <> · {t('casting.from.copied')} <Who by={from.by} /></> : null}
      </span>
    )
  }
  return (
    <span className="cast-from">
      {t(from.copied ? 'casting.from.copied' : from.moved ? 'casting.from.moved' : 'casting.from.setHere')} <Who by={from.by} />
      {', '}
      <Stamp at={from.at} />
      {from.decisionWords === undefined ? null : <> · {t('casting.from.theOldListSaid', { words: content(from.decisionWords) })}</>}
    </span>
  )
}

/** The stored decimal as the percentage a person gave or can change. */
function probabilityAsPercentage(value: string): string {
  if (value === '0') return '0%'
  if (value === '1') return '100%'
  const digits = value.slice(2)
  if (digits.length <= 2) return `${Number(digits.padEnd(2, '0'))}%`
  const whole = digits.slice(0, 2).replace(/^0+/, '') || '0'
  const decimal = digits.slice(2).replace(/0+$/, '')
  return `${whole}${decimal === '' ? '' : `.${decimal}`}%`
}

/** A stored Out until on the office's clock, to the minute, as a person gives it. */
function outUntilInWords(value: string, zone: string, where: string): string {
  const ms = readCastingOutUntil(value, where)
  return ms === null ? '' : stampInZone(ms, zone).slice(0, 16)
}

/**
 * One stored cell's value as a person reads it. A probability of 0 is only "not drawn". Labels are named by `nameOf`,
 * in the order they were made, and an Out until is on the office's clock. `where` names the row for a broken store.
 */
function cellInWords(name: CastingCell, value: string, nameOf: (id: number) => string, zone: string, where: string): string {
  if (name === 'program') return programInWords(value)
  if (name === 'probability') return value === '0' ? t('casting.notDrawn') : probabilityAsPercentage(value)
  if (name === 'labels') return readCastingLabelIds(value, where).map(nameOf).join(', ')
  if (name === 'out_until') return outUntilInWords(value, zone, where)
  return content(value)
}

/** One cell: its value and where it came from, or absence in words. */
function CellView({ cell, name, nameOf, zone, where }: { cell: CastingStoredCell; name: CastingCell; nameOf: (id: number) => string; zone: string; where: string }) {
  useLanguage()
  if (cell.value === null || cell.from === null) return <Absence word={t('casting.noDecision')} />
  return (
    <>
      <span className={`cast-value cast-value-${name}`}>{cellInWords(name, cell.value, nameOf, zone, where)}</span>
      <CellSource from={cell.from} />
    </>
  )
}

/** The decisions a row's cells name, each once, in the order of the cells. */
function decisionsOf(row: CastingRow): string[] {
  const out: string[] = []
  for (const name of CASTING_CELLS) {
    const id = row.cells[name].from?.decision?.id
    if (id !== undefined && !out.includes(id)) out.push(id)
  }
  return out
}

/** A refusal the server gave, kept with its fault so a coded refusal is drawn in the page's language. */
interface Refused {
  message: string
  fault: Fault | null
}

/**
 * A REFUSAL AS THIS PAGE DRAWS IT. castingNotOwnerOrSecretary carries the stored name of the card that holds the act,
 * as the server read it from the role cards, and cardWord turns that name into the page language's word for the card
 * (problem XCvn6ypadyMT). Every other fault is drawn as it came.
 */
function refusedInThePagesWords(err: unknown): Refused {
  const fault = faultOf(err)
  const card = fault?.code === 'castingNotOwnerOrSecretary' ? fault.values?.['card'] : undefined
  return { message: errorMessage(err), fault: fault === null || typeof card !== 'string' ? fault : { ...fault, values: { ...fault.values, card: cardWord(card) } } }
}

/** One casting, its presses, and what they open under it. */
function CastingRowView({
  role,
  row,
  reading,
  providers,
  providersUnread,
  onChanged,
}: {
  role: string
  row: CastingRowInTheTable
  reading: CastingReading
  providers: readonly ProviderRow[]
  providersUnread: boolean
  onChanged?: () => void
}) {
  useLanguage()
  const namedProvider = row.native?.providerRow === undefined ? null : (providers.find((one) => one.id === row.native?.providerRow) ?? null)
  const [open, setOpen] = useState<'history' | 'change' | 'native' | 'remove' | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<Refused | null>(null)
  const toggle = (which: 'history' | 'change' | 'native' | 'remove') => {
    setRefused(null)
    setOpen((now) => (now === which ? null : which))
  }
  const act = (doIt: () => Promise<unknown>): void => {
    setBusy(true)
    setRefused(null)
    doIt()
      .then(() => {
        setOpen(null)
        onChanged?.()
      })
      .catch((err: unknown) => setRefused(refusedInThePagesWords(err)))
      .finally(() => setBusy(false))
  }
  const nameOf = theLabelNamer(reading.labels)
  const where = `row ${String(row.id)}`
  const decisions = decisionsOf(row)
  return (
    <tbody className="cast-group" data-casting={row.id} data-role={role} data-project={row.project ?? ''} data-marked={row.marked ? 'yes' : 'no'}>
      <tr className={row.marked ? 'cast-row cast-row-marked' : 'cast-row'}>
        <td className="cast-tools">
          {row.marked ? (
            <span className="cast-mark">{t('casting.mark')}</span>
          ) : (
            <Btn size="sm" variant="secondary" pending={busy} onClick={() => act(() => api.markCasting(row.id))}>
              {t('casting.markThis')}
            </Btn>
          )}
          <span className="cast-id">{t('casting.castingId', { id: String(row.id) })}</span>
          {/* THE ROW'S PRESSES STAY IN ITS FIRST CELL, so they are in sight at every width, before the table scrolls. */}
          <span className="cast-presses">
            <Btn size="sm" variant="secondary" expanded={more} onClick={() => setMore((now) => !now)}>
              {t('casting.more')}
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => toggle('history')}>
              {t(open === 'history' ? 'casting.historyHide' : 'casting.history')}
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => toggle('change')}>
              {t(open === 'change' ? 'casting.cancel' : 'casting.change')}
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => toggle('native')}>
              {t(open === 'native' ? 'casting.cancel' : 'casting.native')}
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => toggle('remove')}>
              {t(open === 'remove' ? 'casting.cancel' : 'casting.remove')}
            </Btn>
          </span>
        </td>
        {ON_THE_LINE.map((name) =>
          name === 'out_until' ? (
            // AN EMPTY OUT UNTIL IS BLANK, and what the office's limits say of the row's program stands beside it.
            <td key={name} className="cast-cell cast-cell-out_until">
              {row.cells.out_until.value === null ? null : <CellView cell={row.cells.out_until} name={name} nameOf={nameOf} zone={reading.officeTimeZone} where={where} />}
              {row.officeOut.map((said, index) => (
                <span key={index} className="cast-office-out">
                  {content(said)}
                </span>
              ))}
            </td>
          ) : (
            <td key={name} className={`cast-cell cast-cell-${name}`}>
              <CellView cell={row.cells[name]} name={name} nameOf={nameOf} zone={reading.officeTimeZone} where={where} />
            </td>
          ),
        )}
      </tr>
      {more ? (
        <tr className="cast-under cast-more">
          <td colSpan={COLUMN_COUNT}>
            <div className="cast-more-parts">
              {UNDER_MORE.map((name) => (
                <div key={name} className="cast-more-part">
                  <span className="cast-box-name">{t(`casting.col.${name}`)}</span>
                  <div className={`cast-cell cast-cell-${name}`}>
                    <CellView cell={row.cells[name]} name={name} nameOf={nameOf} zone={reading.officeTimeZone} where={where} />
                  </div>
                </div>
              ))}
              <div className="cast-more-part">
                <span className="cast-box-name">{t('casting.col.decision')}</span>
                <div className="cast-decisions">
                  {decisions.length === 0 ? (
                    <Absence word={t('casting.noDecisionNamed')} />
                  ) : (
                    decisions.map((id) => (
                      <span key={id} className="cast-decision">
                        <DecisionName id={id} />
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="cast-more-part">
                <span className="cast-box-name">{t('casting.col.changed')}</span>
                <div className="cast-changed">
                  <span className="cast-from">
                    <Who by={row.lastChange.by} />
                    {', '}
                    <Stamp at={row.lastChange.at} />
                  </span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
      {row.native != null || row.hold != null ? (
        <tr className="cast-under">
          <td colSpan={COLUMN_COUNT}>
            <div className="cast-native-selection">
              {row.native == null ? null : (
                <span className="cast-from">
                  {t('casting.nativeModel')}: {content(row.native.model)}
                  {row.native.provider === null ? null : <> · {t('casting.nativeProvider')}: {content(row.native.provider)}</>}
                  {row.native.variant === null ? null : <> · {t('casting.nativeVariant')}: {content(row.native.variant)}</>}
                </span>
              )}
              {row.native == null || row.native.settings === undefined ? null : (
                <span className="cast-from">
                  {t('casting.nativeSettings')}:{' '}
                  {row.native.settings.map((setting, index) => (
                    <span key={`${setting.name}-${String(index)}`} className="cast-setting">
                      {index === 0 ? null : ', '}
                      {content(setting.name)} = {content(JSON.stringify(setting.value))}
                    </span>
                  ))}
                </span>
              )}
              {row.native == null || row.native.providerRow === undefined ? null : (
                <span className="cast-from">
                  {t('casting.nativeProviderRow')}: {content(row.native.providerRow)}
                  {namedProvider === null ? <> · {t('casting.providerRowMissing')}</> : <> · {content(namedProvider.name)} · {t('casting.providerKey')}: {t(namedProvider.key === 'set' ? 'casting.providerKeySet' : 'casting.providerKeyNotSet')}</>}
                </span>
              )}
              {row.hold == null ? null : (
                <span className="cast-from" role="status"><strong>{t('casting.nativeHeld')}</strong> {content(row.hold.refusal.said)} {t('casting.nativeHeldNext')}</span>
              )}
            </div>
          </td>
        </tr>
      ) : null}
      {open === 'history' ? (
        <tr className="cast-under">
          <td colSpan={COLUMN_COUNT}>
            <RowHistory role={role} casting={row.id} zone={reading.officeTimeZone} />
          </td>
        </tr>
      ) : null}
      {open === 'change' ? (
        <tr className="cast-under">
          <td colSpan={COLUMN_COUNT}>
            <CellsForm
              id={`cast-${String(row.id)}`}
              start={row}
              reading={reading}
              projects={[]}
              send={(_project, cells) => api.changeCasting(row.id, cells)}
              onDone={() => {
                setOpen(null)
                onChanged?.()
              }}
            />
          </td>
        </tr>
      ) : null}
      {open === 'native' ? (
        <tr className="cast-under">
          <td colSpan={COLUMN_COUNT}>
            <CastingNativeForm row={row} busy={busy} providers={providers} providersUnread={providersUnread} act={act} />
          </td>
        </tr>
      ) : null}
      {open === 'remove' ? (
        <tr className="cast-under">
          <td colSpan={COLUMN_COUNT}>
            <div className="cast-form">
              <p className="cast-said">{t('casting.removeAsk', { id: String(row.id) })}</p>
              <Btn size="sm" variant="danger" pending={busy} onClick={() => act(() => api.removeCasting(row.id))}>
                {t('casting.removeYes')}
              </Btn>
            </div>
          </td>
        </tr>
      ) : null}
      {refused === null ? null : (
        <tr className="cast-under">
          <td colSpan={COLUMN_COUNT}>
            <div className="cast-refuse">
              <ErrorNote message={refused.message} fault={refused.fault} />
            </div>
          </td>
        </tr>
      )}
    </tbody>
  )
}

/** One casting's history, newest first, read from the server's append-only list. */
function RowHistory({ role, casting, zone }: { role: string; casting: number; zone: string }) {
  useLanguage()
  const [state, readAgain] = useAsync(() => api.castingHistory(role, casting), [role, casting])
  if (state.status === 'loading') return <Loading what={t('casting.history')} rows={1} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} retry={readAgain} />
  if (state.value.changes.length === 0) return <Absence word={t('casting.historyEmpty')} />
  const nameOf = theLabelNamer(Object.entries(state.value.labelNames).map(([id, name]) => ({ id: Number(id), name })))
  return (
    <ol className="cast-history">
      {state.value.changes.map((entry, index) => (
        <HistoryEntry key={index} entry={entry} nameOf={nameOf} zone={zone} />
      ))}
    </ol>
  )
}

/**
 * One change: what it was, who and when, the decisions it named, and each cell that changed, before and after. A side
 * written before migration 0349 holds the row's work group, and it is shown as it was stored, with no label guessed.
 */
function HistoryEntry({ entry, nameOf, zone }: { entry: CastingHistoryEntry; nameOf: (id: number) => string; zone: string }) {
  useLanguage()
  const cellOf = (side: 'before' | 'after', name: CastingCell): CastingStoredCell | null => entry[side]?.cells[name] ?? null
  const changed = CASTING_CELLS.filter((name) => JSON.stringify(cellOf('before', name)?.value ?? null) !== JSON.stringify(cellOf('after', name)?.value ?? null))
  const where = `a change to row ${String(entry.castingId)}`
  const word = (name: CastingCell, cell: CastingStoredCell | null) =>
    cell === null || cell.value === null ? t('casting.emptyCell') : cellInWords(name, cell.value, nameOf, zone, where)
  const groupOf = (side: 'before' | 'after'): string | null => entry[side]?.workGroup?.value ?? null
  const group = entry.before?.workGroup !== undefined || entry.after?.workGroup !== undefined ? { before: groupOf('before'), after: groupOf('after') } : null
  const groupWord = (value: string | null) => (value === null ? t('casting.emptyCell') : content(value))
  // "Kept by migration 0190" is that migration's own row. A row another migration wrote names that migration.
  const what = entry.what === 'migrate' && entry.by.kind === 'migration' && entry.by.id !== '0190'
    ? t('casting.what.migratedBy', { id: content(entry.by.id) })
    : t(`casting.what.${entry.what}`)
  return (
    <li className="cast-entry" data-what={entry.what}>
      <span className="cast-entry-what">{what}</span>
      <span className="cast-from">
        <Who by={entry.by} />
        {', '}
        <Stamp at={entry.at} />
        {entry.note === null ? null : <> · {content(entry.note)}</>}
      </span>
      {changed.length === 0 && (group === null || group.before === group.after) ? null : (
        <ul className="cast-entry-cells">
          {changed.map((name) => (
            <li key={name}>
              <span className="cast-entry-name">{t(`casting.col.${name}`)}</span> {word(name, cellOf('before', name))} → {word(name, cellOf('after', name))}
            </li>
          ))}
          {group === null || group.before === group.after ? null : (
            <li>
              <span className="cast-entry-name">{t('casting.col.work_group')}</span> {groupWord(group.before)} → {groupWord(group.after)}
            </li>
          )}
        </ul>
      )}
      {entry.decisions.length === 0 ? null : (
        <span className="cast-from">
          {t('casting.from.decision')}{' '}
          {entry.decisions.map((id, index) => (
            <span key={id}>
              {index === 0 ? null : ', '}
              <DecisionName id={id} />
            </span>
          ))}
        </span>
      )}
    </li>
  )
}

type CellsSent = Partial<Record<CastingCell, { value: string | null; decision: string | null }>>

/**
 * THE FORM THAT ADDS A CASTING OR CHANGES ONE. For a change (`start` is the row) only the cells whose
 * value or decision the person changed are sent, so a cell left alone keeps its source (its decision,
 * the move from Settings, or the copy by migration 0190). For an add (`start` is null) every filled
 * cell is sent, with the project chosen. Labels are a tick box each, in the order they were made, and
 * are sent as their names; an Out until is given on the office's clock. The server checks everything
 * before it writes anything, and its refusal is drawn here in its own words.
 */
function CellsForm({
  id,
  start,
  reading,
  projects,
  providers = [],
  providersUnread = false,
  send,
  onDone,
}: {
  id: string
  start: CastingRow | null
  reading: CastingReading
  projects: readonly CastingProject[]
  providers?: readonly ProviderRow[]
  providersUnread?: boolean
  send: (project: string | null, cells: CellsSent, native?: CastingNative) => Promise<unknown>
  onDone: () => void
}) {
  useLanguage()
  const nameOf = theLabelNamer(reading.labels)
  const startValue = (name: CastingCell): string => {
    const value = start?.cells[name].value ?? null
    if (value === null || start === null) return ''
    if (name === 'labels' || name === 'out_until') return cellInWords(name, value, nameOf, reading.officeTimeZone, `row ${String(start.id)}`)
    return value
  }
  const was = (name: CastingCell) => ({ value: startValue(name), decision: start?.cells[name].from?.decision?.id ?? '' })
  const [project, setProject] = useState('')
  const [native, setNative] = useState<CastingNativeInputsValue>({ model: '', provider: '', variant: '', providerRow: '' })
  const [cells, setCells] = useState<Record<CastingCell, { value: string; decision: string }>>(
    () => Object.fromEntries(CASTING_CELLS.map((name) => [name, was(name)])) as Record<CastingCell, { value: string; decision: string }>,
  )
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState<Refused | null>(null)
  const set = (name: CastingCell, part: 'value' | 'decision', value: string) =>
    setCells((now) => ({ ...now, [name]: { ...now[name], [part]: value } }))
  // THE TICKED LABELS ARE HELD AS THE NAMES THE FORM SENDS, in the order the labels were made, so a row whose ticks
  // end where they began sends nothing for its labels. A name holds no comma, so the list splits back apart.
  const ticked = cells.labels.value === '' ? [] : cells.labels.value.split(', ')
  const tick = (name: string, on: boolean) =>
    set('labels', 'value', reading.labels.filter((label) => (label.name === name ? on : ticked.includes(label.name))).map((label) => label.name).join(', '))

  const save = (): void => {
    const change: CellsSent = {}
    for (const name of CASTING_CELLS) {
      const before = was(name)
      const now = cells[name]
      if (start !== null && now.value.trim() === before.value.trim() && now.decision.trim() === before.decision.trim()) continue
      if (start === null && now.value.trim() === '') continue
      change[name] = { value: now.value.trim() === '' ? null : now.value, decision: now.decision.trim() === '' ? null : now.decision }
    }
    let nativeToSend: CastingNative | undefined
    if (start === null) {
      const answer = nativeFromInputs(native)
      if (answer.kind === 'modelNeeded') {
        setSaid(t('casting.nativeModelNeeded'))
        return
      }
      nativeToSend = answer.native ?? undefined
    }
    if (CASTING_CELLS.every((name) => change[name] === undefined)) {
      setSaid(t('casting.nothingChanged'))
      return
    }
    setBusy(true)
    setSaid(null)
    setRefused(null)
    send(project === '' ? null : project, change, nativeToSend)
      .then(() => onDone())
      .catch((err: unknown) => setRefused(refusedInThePagesWords(err)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="cast-form">
      {start === null ? (
        <label className="cast-box" htmlFor={`${id}-project`}>
          <span className="cast-box-name">{t('casting.for')}</span>
          <select id={`${id}-project`} className="cast-input" value={project} disabled={busy} onChange={(event) => setProject(event.target.value)}>
            <option value="">{t('casting.everyProject')}</option>
            {projects.map((one) => (
              <option key={one.id} value={one.id}>
                {content(one.title)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {CASTING_CELLS.map((name) => (
        <div key={name} className="cast-form-cell">
          {name === 'labels' ? (
            <fieldset className="cast-box cast-ticks">
              <legend className="cast-box-name">{t('casting.col.labels')}</legend>
              {reading.labels.length === 0 ? (
                <Absence word={t('casting.label.none')} />
              ) : (
                reading.labels.map((label) => (
                  <label key={label.id} className="cast-tick" htmlFor={`${id}-labels-${String(label.id)}`}>
                    <input
                      id={`${id}-labels-${String(label.id)}`}
                      type="checkbox"
                      value={label.name}
                      checked={ticked.includes(label.name)}
                      disabled={busy}
                      onChange={(event) => tick(label.name, event.target.checked)}
                    />
                    {content(label.name)}
                  </label>
                ))
              )}
            </fieldset>
          ) : (
            <label className="cast-box" htmlFor={`${id}-${name}`}>
              <span className="cast-box-name">{t(`casting.col.${name}`)}</span>
              {name === 'program' ? (
                <select id={`${id}-${name}`} className="cast-input" value={cells.program.value} disabled={busy} onChange={(event) => set('program', 'value', event.target.value)}>
                  <option value="">{t('casting.emptyCell')}</option>
                  {reading.programs.map((word) => (
                    <option key={word} value={word}>
                      {programInWords(word)}
                    </option>
                  ))}
                </select>
              ) : name === 'why' ? (
                // THE WHY IS A SENTENCE, so it is a box of several lines, where Enter makes a new
                // line. The other cells hold one value each and stay one line.
                <span className="cast-input-wide cast-why">
                  <TextArea id={`${id}-${name}`} rows={2} value={cells[name].value} disabled={busy} onChange={(value) => set(name, 'value', value)} />
                </span>
              ) : (
                <input
                  id={`${id}-${name}`}
                  className="cast-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={name === 'probability' ? t('casting.probability.placeholder') : name === 'out_until' ? t('casting.outUntil.placeholder') : undefined}
                  value={cells[name].value}
                  disabled={busy}
                  onChange={(event) => set(name, 'value', event.target.value)}
                />
              )}
            </label>
          )}
          <label className="cast-box" htmlFor={`${id}-${name}-decision`}>
            <span className="cast-box-name">{t('casting.decisionId')}</span>
            <input
              id={`${id}-${name}-decision`}
              className="cast-input cast-input-short"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={cells[name].decision}
              disabled={busy}
              onChange={(event) => set(name, 'decision', event.target.value)}
            />
          </label>
        </div>
      ))}
      {start === null ? (
        <div className="cast-native-selection">
          <p className="cast-said"><strong>{t('casting.native')}</strong></p>
          <CastingNativeInputs id={id} value={native} busy={busy} providers={providers} providersUnread={providersUnread} onChange={setNative} />
        </div>
      ) : null}
      <div className="cast-form-presses">
        <Btn variant="primary" size="sm" onClick={save} pending={busy}>
          {t('casting.save')}
        </Btn>
      </div>
      {said === null ? null : <p className="cast-said">{said}</p>}
      {refused === null ? null : (
        <div className="cast-refuse">
          <ErrorNote message={refused.message} fault={refused.fault} />
        </div>
      )}
    </div>
  )
}

/**
 * THE RULES TAB: every label with its meaning and the rows that carry it, the press that makes one, and under them the
 * fixed rules of the roll, one line each, from the code's own list. A label's name and meaning are changed in its own
 * row, and a removal asks first.
 */
function RulesView({ reading, onChanged }: { reading: CastingReading; onChanged?: () => void }) {
  useLanguage()
  const [adding, setAdding] = useState(false)
  const [stored, setStored] = useState<string | null>(null)
  const rows = new Map<number, CastingRowInTheTable>()
  for (const card of reading.roles) for (const scope of card.scopes) for (const row of scope.castings) rows.set(row.id, row)
  return (
    <section className="cast-rules">
      <h2 className="cast-role-name">{t('casting.labels.heading')}</h2>
      {reading.labels.length === 0 ? (
        <Absence word={t('casting.label.none')} />
      ) : (
        <table className="cast-labels">
          <thead>
            <tr>
              <th scope="col">{t('casting.label.col.name')}</th>
              <th scope="col">{t('casting.label.col.meaning')}</th>
              <th scope="col">{t('casting.label.col.rows')}</th>
            </tr>
          </thead>
          <tbody>
            {reading.labels.map((label) => (
              <LabelRow key={label.id} label={label} rows={rows} {...(onChanged === undefined ? {} : { onChanged })} />
            ))}
          </tbody>
        </table>
      )}
      <div className="cast-add">
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => {
            setStored(null)
            setAdding((now) => !now)
          }}
        >
          {t(adding ? 'casting.cancel' : 'casting.label.add')}
        </Btn>
        {adding ? (
          <LabelAdd
            onDone={(name) => {
              setAdding(false)
              setStored(name)
              onChanged?.()
            }}
          />
        ) : null}
        {/* THE NAME THE LABEL WAS STORED AS, which may differ from the words given: spaces become hyphens, letters lower case. */}
        {stored === null ? null : <p className="cast-said cast-label-stored">{t('casting.label.storedAs', { name: content(stored) })}</p>}
      </div>
      <h2 className="cast-role-name">{t('casting.rules.heading')}</h2>
      <ul className="cast-rule-lines">
        {reading.rules.map((rule) => (
          <li key={rule.id} data-rule={rule.id}>
            {t(`casting.rule.${rule.id}`)}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The form that makes a label: its name, as the person gives it, which the server stores as a label name or refuses. */
function LabelAdd({ onDone }: { onDone: (name: string) => void }) {
  useLanguage()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<Refused | null>(null)
  const save = (): void => {
    setBusy(true)
    setRefused(null)
    api
      .addCastingLabel(name)
      .then((written) => onDone(written.label.name))
      .catch((err: unknown) => setRefused(refusedInThePagesWords(err)))
      .finally(() => setBusy(false))
  }
  return (
    <div className="cast-form cast-label-add">
      <label className="cast-box" htmlFor="cast-label-add-name">
        <span className="cast-box-name">{t('casting.label.col.name')}</span>
        <input id="cast-label-add-name" className="cast-input" type="text" autoComplete="off" spellCheck={false} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="cast-form-presses">
        <Btn variant="primary" size="sm" onClick={save} pending={busy}>
          {t('casting.save')}
        </Btn>
      </div>
      {refused === null ? null : (
        <div className="cast-refuse">
          <ErrorNote message={refused.message} fault={refused.fault} />
        </div>
      )}
    </div>
  )
}

/**
 * ONE LABEL: its name with its presses, its meaning, and the rows that carry it. The change press turns the name and the
 * meaning into boxes in place; a save sends one change for each of the two the person changed. A removal asks first,
 * and the server refuses one while a row carries the label, in words drawn here.
 */
function LabelRow({ label, rows, onChanged }: { label: CastingLabel; rows: ReadonlyMap<number, CastingRowInTheTable>; onChanged?: () => void }) {
  useLanguage()
  const [open, setOpen] = useState<'change' | 'remove' | null>(null)
  const [name, setName] = useState(label.name)
  const [meaning, setMeaning] = useState(label.meaning.value ?? '')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState<Refused | null>(null)
  const id = `cast-label-${String(label.id)}`
  const toggle = (which: 'change' | 'remove') => {
    setRefused(null)
    setSaid(null)
    setName(label.name)
    setMeaning(label.meaning.value ?? '')
    setOpen((now) => (now === which ? null : which))
  }
  const act = (doIt: () => Promise<unknown>): void => {
    setBusy(true)
    setSaid(null)
    setRefused(null)
    doIt()
      .then(() => setOpen(null))
      .catch((err: unknown) => setRefused(refusedInThePagesWords(err)))
      // THE TABLE IS READ AGAIN EITHER WAY: a save whose name was written before its meaning was refused changed the label.
      .finally(() => {
        setBusy(false)
        onChanged?.()
      })
  }
  const save = (): void => {
    // A NAME THAT NORMALISES TO THE ONE STORED IS NO CHANGE; words that are no label name go, and the server refuses them in words.
    const newName = normaliseACastingLabel(name) === label.name ? null : name
    const newMeaning = meaning.trim() === '' ? null : meaning
    const meaningChanged = newMeaning !== label.meaning.value
    if (newName === null && !meaningChanged) {
      setSaid(t('casting.nothingChanged'))
      return
    }
    act(async () => {
      if (newName !== null) await api.changeCastingLabel(label.id, { name: newName })
      if (meaningChanged) await api.changeCastingLabel(label.id, { meaning: { value: newMeaning } })
    })
  }
  return (
    <tr className="cast-label" data-label={label.id}>
      <td className="cast-label-name" data-head={t('casting.label.col.name')}>
        {open === 'change' ? (
          <label className="cast-box" htmlFor={`${id}-name`}>
            <span className="cast-box-name">{t('casting.label.col.name')}</span>
            <input id={`${id}-name`} className="cast-input" type="text" autoComplete="off" spellCheck={false} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
          </label>
        ) : (
          <span className="cast-value">{content(label.name)}</span>
        )}
        <span className="cast-presses">
          {open === 'change' ? (
            <Btn variant="primary" size="sm" onClick={save} pending={busy}>
              {t('casting.save')}
            </Btn>
          ) : null}
          <Btn size="sm" variant="secondary" onClick={() => toggle('change')}>
            {t(open === 'change' ? 'casting.cancel' : 'casting.change')}
          </Btn>
          <Btn size="sm" variant="secondary" onClick={() => toggle('remove')}>
            {t(open === 'remove' ? 'casting.cancel' : 'casting.remove')}
          </Btn>
        </span>
        {open === 'remove' ? (
          <span className="cast-ask">
            <span className="cast-said">{t('casting.label.removeAsk', { name: content(label.name) })}</span>
            <Btn size="sm" variant="danger" pending={busy} onClick={() => act(() => api.removeCastingLabel(label.id))}>
              {t('casting.removeYes')}
            </Btn>
          </span>
        ) : null}
        {said === null ? null : <span className="cast-said">{said}</span>}
        {refused === null ? null : (
          <span className="cast-refuse">
            <ErrorNote message={refused.message} fault={refused.fault} />
          </span>
        )}
      </td>
      <td className="cast-label-meaning" data-head={t('casting.label.col.meaning')}>
        {open === 'change' ? (
          <label className="cast-box" htmlFor={`${id}-meaning`}>
            <span className="cast-box-name">{t('casting.label.col.meaning')}</span>
            <span className="cast-why">
              <TextArea id={`${id}-meaning`} rows={2} value={meaning} disabled={busy} onChange={setMeaning} />
            </span>
          </label>
        ) : label.meaning.value === null || label.meaning.from === null ? (
          <Absence word={t('casting.label.noMeaning')} />
        ) : (
          <>
            <span className="cast-value">{content(label.meaning.value)}</span>
            <CellSource from={label.meaning.from} />
          </>
        )}
      </td>
      <td className="cast-label-rows" data-head={t('casting.label.col.rows')}>
        {label.rows.length === 0 ? (
          <Absence word={t('casting.label.noRows')} />
        ) : (
          label.rows.map((rowId) => {
            const row = theRowIn([...rows.values()], rowId)
            return (
              <span key={rowId} className="cast-label-row">
                {cardWord(row.role)} · {row.project === null ? t('casting.everyProject') : content(row.projectTitle ?? row.project)} · {rowName(row)}
              </span>
            )
          })
        )}
      </td>
    </tr>
  )
}

/** The page's own rules. Every value is a token, so a preset swap re-skins it with everything else. */
const CASTING_CSS = `
.cast-body { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
.cast-views, .cast-pick, .cast-projects { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.cast-views { border-bottom: var(--border-w) solid var(--border); }
.cast-tab {
  padding: 6px 12px; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: none; color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.cast-views .cast-tab { border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
.cast-tab[aria-selected='true'], .cast-tab[aria-pressed='true'] { color: var(--text); background: var(--panel); border-color: var(--border-strong); }
.cast-tab:focus-visible, .cast-glance-open:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.cast-glance-scroll { overflow-x: auto; min-width: 0; }
.cast-glance-table { border-collapse: collapse; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.cast-glance-table th, .cast-glance-table td { text-align: left; vertical-align: top; padding: 4px var(--pad); border: var(--border-w) solid var(--border); }
.cast-glance-table thead th { font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-2); white-space: nowrap; }
.cast-glance-table tbody th { font-weight: 600; white-space: nowrap; }
.cast-glance-cell { min-width: 9rem; max-width: 18rem; color: var(--text-3); }
.cast-glance-open {
  display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 2px 4px; border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer;
}
.cast-glance-open[aria-pressed='true'] { border-color: var(--border-strong); background: var(--panel); }
.cast-glance-line { display: block; overflow-wrap: anywhere; }
.cast-role, .cast-rules { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.cast-role-name { margin: 0; font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); }
.cast-role-name a { color: inherit; }
.cast-scope { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cast-scope-name { margin: 0; font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.cast-scroll { overflow-x: auto; min-width: 0; border-top: var(--border-w) solid var(--border); }
.cast-table { width: 100%; border-collapse: collapse; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.cast-table th, .cast-table td { text-align: left; vertical-align: top; padding: var(--pad) var(--pad) var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
/* THE HEAD IS ONE ROW, AS TALL AS ITS WORDS: no head word wraps, and the table scrolls sideways inside its own box,
   so a wider column costs nothing outside it. */
.cast-table thead th { font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-2); white-space: nowrap; }
.cast-tools { width: 10rem; min-width: 9rem; }
.cast-tools .px-btn { white-space: normal; text-align: left; }
.cast-mark { display: inline-block; font-weight: 600; color: var(--text); }
.cast-row-marked > td { background: var(--panel); }
.cast-id { display: block; margin-top: 4px; font-size: var(--fs-2); color: var(--text-3); }
.cast-cell { min-width: 5.5rem; }
.cast-value { display: block; overflow-wrap: anywhere; white-space: pre-wrap; }
.cast-from, .cast-office-out { display: block; font-size: var(--fs-2); color: var(--text-3); overflow-wrap: anywhere; }
.cast-decision { display: block; }
/* AN ABSENCE IN A TABLE OR UNDER A ROLE IS A SENTENCE, so it wraps like the words beside it. */
.cast-table .px-absent, .cast-role .px-absent, .cast-rules .px-absent { white-space: normal; }
.cast-presses { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.cast-under > td { padding-left: 16px; background: var(--panel); }
.cast-more-parts { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); width: min(80ch, calc(100vw - 4rem)); }
.cast-more-part { display: flex; flex-direction: column; gap: 2px; flex: 1 1 12rem; min-width: 0; max-width: 24rem; }
.cast-draws { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cast-summary { margin: 0; padding-left: 1.2em; font: var(--fs-1)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }
.cast-summary-label { font-weight: 600; }
.cast-native-selection { display: grid; gap: 4px; width: min(64ch, calc(100vw - 4rem)); }
.cast-form > .cast-native-selection { flex: 1 1 100%; }
.cast-add { display: flex; flex-direction: column; align-items: flex-start; gap: var(--pad); min-width: 0; }
.cast-history { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--pad); }
.cast-entry-what { font-weight: 600; }
.cast-entry-cells { margin: 2px 0; padding-left: 1.2em; overflow-wrap: anywhere; white-space: pre-wrap; }
.cast-entry-name { font-weight: 600; }
.cast-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--pad) var(--gut); min-width: 0; }
.cast-form-cell { display: flex; flex-wrap: wrap; gap: 4px var(--pad); min-width: 0; }
.cast-box { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cast-box-name { font-size: var(--fs-2); color: var(--text-2); }
.cast-ticks { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px var(--pad); max-width: 24rem; margin: 0; padding: 0; border: 0; }
.cast-ticks > legend { float: left; width: 100%; padding: 0; }
.cast-tick { display: inline-flex; align-items: center; gap: 4px; font: var(--fs-1)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.cast-input {
  width: 12rem; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.cast-input-wide { width: 22rem; }
.cast-input-short { width: 9rem; }
/* THE WHY'S BOX OF SEVERAL LINES takes the shared paragraph box and the small type of the boxes beside it. */
.cast-why { display: block; max-width: 100%; }
.cast-why .px-input { font: var(--fs-1)/var(--lh-body) var(--font-ui); border-radius: var(--radius-sm); padding: 4px var(--pad); }
.cast-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.cast-form-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
.cast-said { flex: 1 1 100%; margin: 0; max-width: 60ch; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.cast-refuse { flex: 1 1 100%; max-width: 60ch; min-width: 0; }
.cast-labels { width: 100%; border-collapse: collapse; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text); }
.cast-labels th, .cast-labels td { text-align: left; vertical-align: top; padding: var(--pad) var(--pad) var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
.cast-labels thead th { font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.cast-label-name { width: 16rem; }
.cast-label-name > .cast-value { font-weight: 600; }
.cast-label-name > .cast-said, .cast-label-name > .cast-refuse, .cast-ask { display: block; margin-top: 4px; }
.cast-ask { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--pad); }
.cast-label-meaning .cast-why { width: 100%; }
.cast-label-row { display: block; overflow-wrap: anywhere; }
.cast-rule-lines { margin: 0; padding-left: 1.2em; max-width: var(--measure-in-box); display: flex; flex-direction: column; gap: 4px; font: var(--fs-1)/var(--lh-body) var(--font-ui); }
@media (max-width: 40rem) {
  .cast-input, .cast-input-wide { width: 100%; }
  .cast-box { flex: 1 1 100%; }
  .cast-form-cell { flex: 1 1 100%; }
  /* ON A PHONE EACH LABEL IS A BLOCK, each part under the name of its column. */
  .cast-labels, .cast-labels tbody, .cast-labels tr, .cast-labels td { display: block; width: auto; }
  .cast-labels thead { display: none; }
  .cast-labels td { padding: 4px 0; border-bottom: none; }
  .cast-labels tr { padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
  .cast-labels td::before { content: attr(data-head); display: block; font-size: var(--fs-2); color: var(--text-3); }
}
`
