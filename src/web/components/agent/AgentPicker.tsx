// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE AGENT PICKER. Every place a person chooses an agent draws this, so an office of thousands of agents, most of
 * them retired workers, is searched the same way everywhere.
 *
 * - A labelled search box. What is typed finds a row by the name it draws or, for an agent, by its handle
 *   (`theTypedWordsFindAContact`, the rule the chat's contact filter reads too).
 * - The rows in groups, in this order: people, secretaries, supervisors, the agents working now, the other agents. Each
 *   group is in the order of its names. The card is the registry's `role`.
 * - WORKING NOW is the chat's own presence read (`theDotsOf`), read as the chat's dot is (`aDotSaysOnline`). It is read
 *   when the list first opens. Until it answers, no agent is in that group and the line above the rows says so; the
 *   others are headed "Other agents", which says nothing about whether they are idle.
 * - Every retired agent is hidden. One press shows them, and it says how many match what is typed.
 * - At most `PICKER_ROWS_DRAWN` rows, and a line saying how many more match.
 * - Every row is a button, so Tab reaches it, and the arrow keys move between rows.
 *
 * WHO MAY BE CHOSEN IS THE CALLER'S. The picker draws the candidates it is handed and no others, so each picker keeps
 * its own rules. Choices that are not an agent, such as "Anybody", are handed in as fixed choices and drawn first.
 *
 * Never put it inside a label or a Field: it draws its own label around its own box.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { content, count, t } from '@shared/i18n.ts'
import { aDotSaysOnline, DEFAULT_CONTACT_GROUPS, groupHeading, theTypedWordsFind, theTypedWordsFindAContact } from '@shared/contacts.ts'
import { participantKey } from '@shared/messages.ts'
import { THE_SECRETARY, THE_SUPERVISOR } from '@shared/roles.ts'
import { errorMessage, faultOf, type Fault, type ParticipantForThePage } from '../../api.ts'
import { useSharedRead } from '../../lib/homereads.ts'
import { useLanguage } from '../../lib/language.ts'
import { readParticipantsOnce } from '../../lib/oneread.ts'
import { currentWorkspace, subscribeWorkspace } from '../../lib/workspace.ts'
import { ErrorNote, Loading, useCloseOnOutsidePress } from '../ui.tsx'
import { theDotsOf } from './the-dots-of.ts'

/** The most rows the list draws at once. Typing narrows it. */
export const PICKER_ROWS_DRAWN = 50

/** One person or agent this picker may offer. */
export interface AnAgentToPick {
  kind: 'person' | 'agent'
  id: string
  /** What a press on this row hands back. The id when it is not given. */
  value?: string
  /** The name the row draws instead of the registry's, such as "I will answer for it". The registry's name still finds it. */
  name?: string
}

/** A choice that is not a person or an agent, such as "Anybody". Drawn first, whatever is typed. */
export interface AFixedPick {
  value: string
  name: string
}

interface AgentPickerProps {
  /** The words on the search box. */
  label: string
  /** Who may be chosen here. */
  candidates: readonly AnAgentToPick[]
  /** The value chosen now, or '' for none. */
  chosen: string
  onChoose: (value: string) => void
  fixed?: readonly AFixedPick[]
  className?: string
  disabled?: boolean
}

type AGroup = 'people' | 'secretary' | 'supervisor' | 'working' | 'rest' | 'retired'

const THE_ORDER: readonly AGroup[] = ['people', 'secretary', 'supervisor', 'working', 'rest', 'retired']

interface ARow {
  key: string
  /** What a press hands back. It tells the rows apart, since two values may name one agent, as a stored id and a handle. */
  value: string
  kind: 'person' | 'agent'
  id: string
  name: string
  /** The registry's name, when the row draws another. */
  registryName: string | null
  /** An agent's handle, or null for a person and for an agent no registry holds. */
  handle: string | null
  role: string | null
  retired: boolean
}

type TheDots =
  | { project: string; state: 'reading' }
  | { project: string; state: 'read'; working: ReadonlySet<string> }
  | { project: string; state: 'failed'; message: string; fault: Fault | null }

function headingOf(group: AGroup): string {
  if (group === 'working') return t('agentPicker.group.working')
  if (group === 'rest') return t('agentPicker.group.rest')
  const declared = group === 'people' ? DEFAULT_CONTACT_GROUPS.find((one) => one.side === 'human') : DEFAULT_CONTACT_GROUPS.find((one) => one.key === group)
  return declared === undefined ? group : groupHeading(declared)
}

/** Whether presence is read for this row: an agent that is not retired and holds neither card drawn above the working group. */
function mayBeWorking(row: ARow): boolean {
  return row.kind === 'agent' && !row.retired && row.role !== THE_SECRETARY && row.role !== THE_SUPERVISOR
}

function groupOf(row: ARow, working: ReadonlySet<string> | null): AGroup {
  if (row.kind === 'person') return 'people'
  if (row.retired) return 'retired'
  if (row.role === THE_SECRETARY) return 'secretary'
  if (row.role === THE_SUPERVISOR) return 'supervisor'
  return working !== null && working.has(row.key) ? 'working' : 'rest'
}

function theTypedWordsFindARow(row: ARow, typed: string): boolean {
  return theTypedWordsFindAContact(row, typed) || (row.registryName !== null && row.registryName !== row.name && theTypedWordsFind(row.registryName, typed))
}

export function AgentPicker({ label, candidates, chosen, onChoose, fixed = [], className = '', disabled = false }: AgentPickerProps): React.ReactElement {
  useLanguage()
  const [registries, readAgain] = useSharedRead(readParticipantsOnce, [], { startFromHeld: true })
  const project = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState(false)
  const [showRetired, setShowRetired] = useState(false)
  const [dots, setDots] = useState<TheDots | null>(null)
  const dotsAskedFor = useRef<string | null>(null)
  /** Counts the presses on the failed read's retry, so the read below runs again. */
  const [dotsAsked, setDotsAsked] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()
  const close = useCallback(() => setOpen(false), [])
  useCloseOnOutsidePress(root, close)

  const rows = useMemo((): ARow[] => {
    if (registries.status !== 'ready') return []
    const known = new Map<string, ParticipantForThePage>()
    for (const one of registries.value.people) known.set(participantKey({ kind: 'person', id: one.id }), one)
    for (const one of registries.value.agents) known.set(participantKey({ kind: 'agent', id: one.id }), one)
    return candidates.map((one) => {
      const key = participantKey({ kind: one.kind, id: one.id })
      const found = known.get(key)
      const registryName = found === undefined ? null : content(found.name)
      return {
        key,
        value: one.value ?? one.id,
        kind: one.kind,
        id: one.id,
        name: one.name ?? registryName ?? one.id,
        registryName,
        handle: one.kind === 'agent' && found !== undefined && found.handle !== '' ? found.handle : null,
        role: found?.role ?? null,
        retired: found?.retired === true,
      }
    })
  }, [registries, candidates])

  // WHO IS WORKING NOW, read once the list first opens in this project, for the agents that may be in that group.
  useEffect(() => {
    if (!open || registries.status !== 'ready' || dotsAskedFor.current === project) return
    dotsAskedFor.current = project
    const asked = rows.filter(mayBeWorking).map((one) => ({ kind: 'agent' as const, id: one.id }))
    setDots({ project, state: 'reading' })
    theDotsOf(asked).then(
      (answer) => {
        if (dotsAskedFor.current !== project) return
        // NO DOT FOR AGENTS ASKED FOR means the page moved to another project while they were read: nothing was read
        // for this one, so the next open reads again.
        if (asked.length > 0 && answer.length === 0) {
          dotsAskedFor.current = null
          setDots(null)
          return
        }
        setDots({ project, state: 'read', working: new Set(answer.filter(aDotSaysOnline).map((one) => participantKey(one.who))) })
      },
      (err: unknown) => {
        if (dotsAskedFor.current === project) setDots({ project, state: 'failed', message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }, [open, registries.status, project, rows, dotsAsked])

  const readTheDotsAgain = (): void => {
    dotsAskedFor.current = null
    setDots(null)
    setDotsAsked((n) => n + 1)
  }

  const working = dots !== null && dots.project === project && dots.state === 'read' ? dots.working : null
  const found = useMemo(() => rows.filter((one) => theTypedWordsFindARow(one, typed)), [rows, typed])
  const ordered = useMemo(() => {
    const placed = found
      .filter((one) => showRetired || !one.retired)
      .map((one) => ({ row: one, group: groupOf(one, working) }))
    return placed.sort((a, b) => THE_ORDER.indexOf(a.group) - THE_ORDER.indexOf(b.group) || a.row.name.localeCompare(b.row.name))
  }, [found, showRetired, working])
  const drawn = ordered.slice(0, PICKER_ROWS_DRAWN)
  const more = ordered.length - drawn.length
  const retiredFound = found.filter((one) => one.retired).length

  // WHAT IS CHOSEN, by name: null when nothing is, and undefined while the registries that name it are still read. A
  // value no registry holds is drawn as it is stored.
  const chosenName = fixed.find((one) => one.value === chosen)?.name ?? (chosen === '' ? null : (rows.find((one) => one.value === chosen)?.name ?? (registries.status === 'ready' ? chosen : undefined)))

  const choose = (value: string): void => {
    onChoose(value)
    setTyped('')
    setOpen(false)
    box.current?.focus()
  }

  /** The buttons of the open list, in order: the rows and the press for the retired agents. */
  const buttonsInTheList = (): HTMLButtonElement[] => (list.current === null ? [] : [...list.current.querySelectorAll<HTMLButtonElement>('button')])

  const onBoxKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else buttonsInTheList()[0]?.focus()
    }
  }

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      box.current?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = buttonsInTheList()
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? at + 1 : at - 1
    if (next < 0) box.current?.focus()
    else buttons[Math.min(next, buttons.length - 1)]?.focus()
  }

  const onLeave = (e: React.FocusEvent<HTMLDivElement>): void => {
    // FOCUS MOVED TO SOMETHING OUTSIDE, by Tab. A press outside closes the list through `useCloseOnOutsidePress`.
    if (e.relatedTarget !== null && root.current !== null && !root.current.contains(e.relatedTarget as Node)) setOpen(false)
  }

  const groupsDrawn: React.ReactNode[] = []
  let at = 0
  while (at < drawn.length) {
    const group = drawn[at]!.group
    const inIt: ARow[] = []
    while (at < drawn.length && drawn[at]!.group === group) {
      inIt.push(drawn[at]!.row)
      at += 1
    }
    groupsDrawn.push(
      <div key={group} className="agp-group" data-group={group}>
        <p className="agp-heading">{headingOf(group)}</p>
        {inIt.map((one) => (
          <button key={one.value} type="button" className="agp-row" data-value={one.value} data-group={group} aria-pressed={one.value === chosen} onClick={() => choose(one.value)}>
            <span className="agp-name">{one.name}</span>
            {one.handle === null ? null : <span className="agp-handle">{one.handle}</span>}
          </button>
        ))}
      </div>,
    )
  }

  return (
    <div ref={root} className={`agp ${className}`.trim()} data-chosen={chosen} data-typed={typed} data-open={open ? 'yes' : 'no'} onBlur={onLeave}>
      <style href="mole-office-agent-picker" precedence="default">{AGENT_PICKER_CSS}</style>
      <label className="agp-box">
        <span className="agp-label">{label}</span>
        <input
          ref={box}
          type="search"
          className="agp-input"
          value={typed}
          placeholder={t('agentPicker.typeHere')}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-controls={open ? listId : undefined}
          onChange={(e) => {
            setTyped(e.target.value)
            setOpen(true)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onBoxKey}
        />
      </label>
      {chosenName === undefined ? null : <p className="agp-chosen">{chosenName === null ? t('agentPicker.nothingChosen') : t('agentPicker.chosen', { name: chosenName })}</p>}
      {open && !disabled ? (
        <div ref={list} id={listId} className="agp-list" onKeyDown={onListKey}>
          {fixed.map((one) => (
            <button key={`fixed:${one.value}`} type="button" className="agp-row agp-fixed" data-value={one.value} data-group="fixed" aria-pressed={one.value === chosen} onClick={() => choose(one.value)}>
              <span className="agp-name">{one.name}</span>
            </button>
          ))}
          {registries.status === 'loading' ? (
            <Loading what={label} rows={1} />
          ) : registries.status === 'error' ? (
            <ErrorNote message={registries.message} fault={registries.fault} label={label} retry={readAgain} />
          ) : (
            <>
              {dots !== null && dots.project === project && dots.state === 'reading' ? <p className="agp-line">{t('agentPicker.presenceReading')}</p> : null}
              {dots !== null && dots.project === project && dots.state === 'failed' ? (
                <ErrorNote message={dots.message} fault={dots.fault} label={t('agentPicker.presenceFailed')} retry={readTheDotsAgain} />
              ) : null}
              {groupsDrawn}
              {drawn.length === 0 ? <p className="agp-line">{typed.trim() === '' ? t('agentPicker.nobodyToChoose') : t('agentPicker.nothingFound', { typed: typed.trim() })}</p> : null}
              {more > 0 ? <p className="agp-line agp-more">{t('agentPicker.more', { n: more, count: count(more) })}</p> : null}
              {showRetired || retiredFound > 0 ? (
                <button type="button" className="agp-retired" aria-pressed={showRetired} onClick={() => setShowRetired(!showRetired)}>
                  {showRetired ? t('agentPicker.hideRetired') : t('agentPicker.showRetired', { n: retiredFound, count: count(retiredFound) })}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** Tokens only, and no backtick anywhere inside, because the sheet is a template literal. */
const AGENT_PICKER_CSS = `
.agp { display: flex; flex-direction: column; gap: 4px; max-width: 32rem; width: 100%; box-sizing: border-box; }
.agp-box { display: flex; flex-direction: column; gap: 4px; }
.agp-input {
  width: 100%; box-sizing: border-box; min-height: var(--row-h);
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  background: var(--panel); color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-2);
}
.agp-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.agp-chosen { margin: 0; color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.agp-list {
  display: flex; flex-direction: column;
  max-height: 22rem; overflow-y: auto;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  background: var(--panel);
}
.agp-heading {
  margin: 0; padding: var(--pad) var(--pad) 2px;
  color: var(--text-2); font-size: var(--fs-1); font-weight: var(--heading-weight);
}
.agp-row {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--pad);
  width: 100%; min-height: var(--row-h); box-sizing: border-box;
  padding: 2px var(--pad);
  border: 0; background: transparent; color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-2); text-align: start;
  cursor: pointer;
}
.agp-row:hover { background: var(--hover); }
.agp-row:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: calc(0px - var(--focus-w)); }
.agp-row[aria-pressed='true'] { background: var(--chosen-bg); color: var(--chosen-ink); box-shadow: inset var(--focus-w) 0 0 var(--chosen-edge); }
.agp-name { overflow-wrap: anywhere; }
.agp-handle { color: var(--text-2); font-family: var(--font-mono); font-size: var(--fs-1); overflow-wrap: anywhere; }
.agp-line { margin: 0; padding: var(--pad); color: var(--text-2); font-size: var(--fs-1); }
.agp-retired {
  align-self: flex-start; margin: var(--pad);
  min-height: var(--row-h); padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  background: var(--panel-2); color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-1);
  cursor: pointer;
}
.agp-retired:hover { background: var(--hover); }
.agp-retired:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
`
