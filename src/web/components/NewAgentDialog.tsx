// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEW AGENT DIALOG.
 *
 * The New agent press in the chat's contacts opens this in place of the chooser of agents nothing
 * answers as. It asks for an agent's name, its agent tool, model and effort, its role, its project and
 * where it opens. Cancel closes it. Create sends the values it shows to POST /api/agents/new
 * (src/server/api/new-agent.ts), which makes the agent and opens it in the chosen terminal.
 *
 * WHERE EACH LIST COMES FROM.
 *
 *   Agent tool, model, effort  The Casting rows in force for the chosen role and project: the rows of
 *                              the scope whose marked row the tools take (`theRowTheToolsTake`). These
 *                              are the rows the worker-run door accepts a runtime and model from. The
 *                              marked row is chosen first. Effort has no list of its own anywhere, so its
 *                              choices are the efforts those rows cast for the chosen tool and model.
 *   Role                       The role cards, from GET /api/roles. The worker card is chosen first.
 *   Project                    The projects, from GET /api/workspaces. The project being read is chosen.
 *   Where it opens             The office's own terminal, or a terminal outside: the two places the door
 *                              opens an agent in.
 *
 * A list being read, a list that could not be read and an empty list each show a short state word.
 *
 * WHAT CREATE SAYS is a short state word beside the presses: making while the answer is out, then made
 * and opened, made and not opened, refused, name taken, not on this system or not made. A request
 * nothing answered, or a success the page could not read, may have made the agent, so it says not
 * known. Create cannot be pressed while the answer is out, nor once the agent is made, so one press
 * makes one agent.
 */

import { useMemo, useState } from 'react'
import { theRowsOfTheScopeInForce, type CastingReading, type CastingRowInTheTable } from '@shared/casting.ts'
import { cardWord } from '@shared/card-words.ts'
import { t } from '@shared/i18n.ts'
import { runtimeShownName } from '@shared/participants.ts'
import { THE_WORKER } from '@shared/roles.ts'
import { api, ApiError, moleOfficeRequest } from '../api.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { Field, Overlay, Select, TextInput, useAsync, type AsyncState } from './ui.tsx'

type Row = CastingRowInTheTable
type OpensIn = 'office' | 'outside'

/** What Create says: the request is out, or how it ended. */
type Outcome = 'creating' | 'opened' | 'madeNotOpened' | 'refused' | 'nameTaken' | 'notOnThisSystem' | 'notMade' | 'notKnown'

/** What POST /api/agents/new answers when the agent was made: whether its terminal opened. */
interface ANewAgentMade {
  terminal: { opened: boolean }
}

/** The state a failed Create says, by the door's status. A request nothing answered may have made the agent. */
function theFailure(err: unknown): Outcome {
  if (!(err instanceof ApiError) || err.status < 400) return 'notKnown'
  if (err.status === 400 || err.status === 403) return 'refused'
  if (err.status === 409) return 'nameTaken'
  if (err.status === 501) return 'notOnThisSystem'
  return 'notMade'
}

/** The Casting rows in force for one role in one project, and the marked row the tools take; null when the table marks none. */
function theRowsInForce(reading: CastingReading, role: string, project: string): { rows: Row[]; marked: Row } | null {
  const card = reading.roles.find((one) => one.role === role)
  if (card === undefined) return null
  return theRowsOfTheScopeInForce(card.scopes.flatMap((scope) => scope.castings), project)
}

/** The first row that passes, the marked row before any other. */
function firstOf(rows: readonly Row[], passes: (row: Row) => boolean): Row | undefined {
  return rows.find((row) => row.marked && passes(row)) ?? rows.find(passes)
}

/** Each value once, in the order the rows hold them; an empty cell is the empty string. */
function eachOnce(values: readonly (string | null)[]): string[] {
  return [...new Set(values.map((value) => value ?? ''))]
}

function aValueOf(value: string, label: (value: string) => string = (one) => one): { value: string; label: string } {
  return { value, label: value === '' ? t('newAgentDialog.notSet') : label(value) }
}

/** What a field shows in place of its list while the list is not there. */
function StateWord({ state }: { state: AsyncState<unknown> | 'none' }) {
  const word = state === 'none' ? t('newAgentDialog.none') : state.status === 'loading' ? t('newAgentDialog.reading') : t('newAgentDialog.notRead')
  return <span className="px-new-agent-dialog-state">{word}</span>
}

export function NewAgentDialog({ onClose }: { onClose: () => void }) {
  const [casting] = useAsync(() => api.casting(), [])
  const [roles] = useAsync(() => api.roles(), [])
  const [projects] = useAsync(() => api.listWorkspaces(), [])

  const [name, setName] = useState('')
  const [role, setRole] = useState<string>(THE_WORKER)
  const [project, setProject] = useState<string>(() => currentWorkspace())
  /** The Casting row the three cells are read from; null for the marked row in force. */
  const [rowId, setRowId] = useState<number | null>(null)
  const [opensIn, setOpensIn] = useState<OpensIn>('office')
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const inForce = useMemo(
    () => (casting.status === 'ready' ? theRowsInForce(casting.value, role, project) : null),
    [casting, role, project],
  )
  const rows = inForce?.rows ?? []
  const chosen = inForce === null ? null : (rows.find((row) => row.id === rowId) ?? inForce.marked)
  const program = chosen?.cells.program.value ?? ''
  const model = chosen?.cells.model.value ?? ''
  const effort = chosen?.cells.effort.value ?? ''
  const ofTheTool = rows.filter((row) => (row.cells.program.value ?? '') === program)
  const ofTheModel = ofTheTool.filter((row) => (row.cells.model.value ?? '') === model)

  /** The list state a Casting field shows when it has no row to draw. */
  const castingState: AsyncState<unknown> | 'none' = casting.status === 'ready' ? 'none' : casting

  /** Create may not be pressed while its answer is out, nor once the agent is made. */
  const createIsOff = outcome === 'creating' || outcome === 'opened' || outcome === 'madeNotOpened'

  async function create(): Promise<void> {
    setOutcome('creating')
    try {
      const made = await moleOfficeRequest<ANewAgentMade>('/api/agents/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, harness: program, model, effort, role, project, opensIn }),
      })
      setOutcome(made.terminal.opened ? 'opened' : 'madeNotOpened')
    } catch (err) {
      setOutcome(theFailure(err))
    }
  }

  return (
    <Overlay>
      <style href="px-new-agent-dialog" precedence="medium">
        {CSS}
      </style>
      <div className="px-new-agent-dialog-behind" aria-hidden="true" />
      <div className="px-new-agent-dialog" role="dialog" aria-modal="true" aria-labelledby="px-new-agent-dialog-heading">
        <h2 className="px-new-agent-dialog-heading" id="px-new-agent-dialog-heading">
          {t('chat.contact.newAgent')}
        </h2>
        <div className="px-new-agent-dialog-fields">
          <Field label={t('newAgentDialog.name')}>
            <TextInput value={name} onChange={setName} autoFocus />
          </Field>
          <Field label={t('newAgentDialog.harness')}>
            {chosen === null ? (
              <StateWord state={castingState} />
            ) : (
              <Select
                value={program}
                onChange={(next) => {
                  setRowId(firstOf(rows, (row) => (row.cells.program.value ?? '') === next)?.id ?? null)
                }}
                options={eachOnce(rows.map((row) => row.cells.program.value)).map((one) => aValueOf(one, runtimeShownName))}
              />
            )}
          </Field>
          <div className="px-new-agent-dialog-beside">
            <Field label={t('casting.col.model')}>
              {chosen === null ? (
                <StateWord state={castingState} />
              ) : (
                <Select
                  value={model}
                  onChange={(next) => {
                    setRowId(firstOf(ofTheTool, (row) => (row.cells.model.value ?? '') === next)?.id ?? null)
                  }}
                  options={eachOnce(ofTheTool.map((row) => row.cells.model.value)).map((one) => aValueOf(one))}
                />
              )}
            </Field>
            <Field label={t('casting.col.effort')}>
              {chosen === null ? (
                <StateWord state={castingState} />
              ) : (
                <Select
                  value={effort}
                  onChange={(next) => {
                    setRowId(firstOf(ofTheModel, (row) => (row.cells.effort.value ?? '') === next)?.id ?? null)
                  }}
                  options={eachOnce(ofTheModel.map((row) => row.cells.effort.value)).map((one) => aValueOf(one))}
                />
              )}
            </Field>
          </div>
          <Field label={t('newAgentDialog.role')}>
            {roles.status !== 'ready' ? (
              <StateWord state={roles} />
            ) : roles.value.cards.length === 0 ? (
              <StateWord state="none" />
            ) : (
              <Select
                value={role}
                onChange={(next) => {
                  setRole(next)
                  setRowId(null)
                }}
                options={roles.value.cards.map((card) => ({ value: card.name, label: cardWord(card.name) }))}
              />
            )}
          </Field>
          <Field label={t('newAgentDialog.project')}>
            {projects.status !== 'ready' ? (
              <StateWord state={projects} />
            ) : projects.value.workspaces.length === 0 ? (
              <StateWord state="none" />
            ) : (
              <Select
                value={project}
                onChange={(next) => {
                  setProject(next)
                  setRowId(null)
                }}
                options={projects.value.workspaces.map((one) => ({ value: one.id, label: one.title }))}
              />
            )}
          </Field>
          <Field label={t('newAgentDialog.opensIn')}>
            <Select<OpensIn>
              value={opensIn}
              onChange={setOpensIn}
              options={[
                { value: 'office', label: t('newAgentDialog.opensIn.office') },
                { value: 'outside', label: t('newAgentDialog.opensIn.outside') },
              ]}
            />
          </Field>
        </div>
        <div className="px-new-agent-dialog-presses">
          {outcome === null ? null : (
            <span className="px-new-agent-dialog-outcome" role="status">
              {t(`newAgentDialog.${outcome}`)}
            </span>
          )}
          <button type="button" className="px-new-agent-dialog-cancel" onClick={onClose}>
            {t('newAgentDialog.cancel')}
          </button>
          <button type="button" className="px-new-agent-dialog-create" disabled={createIsOff} onClick={() => void create()}>
            {t('newAgentDialog.create')}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/* The shape of the start-a-new-agent dialogue (StartANewAgent.tsx): a blurred page behind, a panel in
   the middle of the window, and the presses at its foot on the right. The panel never grows past the
   window: its fields scroll inside it. Below 480px wide every field takes the whole width. */
const CSS = `
.px-new-agent-dialog-behind {
  position: fixed; inset: 0; z-index: var(--z-blocked);
  backdrop-filter: blur(6px); background: rgba(0, 0, 0, 0.25);
}
.px-new-agent-dialog {
  position: fixed; z-index: var(--z-wrong-world);
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(32rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); overflow-y: auto;
  box-sizing: border-box;
  display: flex; flex-direction: column; gap: 1rem;
  background: var(--panel); color: var(--text);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius);
  padding: 1rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.35);
}
.px-new-agent-dialog-heading { margin: 0; font-size: var(--fs-4); font-weight: 600; }
.px-new-agent-dialog-fields { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.px-new-agent-dialog-beside { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 0.75rem; }
.px-new-agent-dialog-state {
  display: flex; align-items: center; min-height: var(--row-h);
  color: var(--text-3); font-size: var(--fs-3);
}
.px-new-agent-dialog-presses { display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
.px-new-agent-dialog-cancel, .px-new-agent-dialog-create {
  border: 1px solid var(--border); border-radius: 0.35rem;
  padding: 0.3rem 0.8rem; cursor: pointer;
  background: var(--panel-2); color: var(--text); font-size: 0.85rem;
}
.px-new-agent-dialog-create { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.px-new-agent-dialog-create:disabled { opacity: 0.6; cursor: default; }
.px-new-agent-dialog-outcome { align-self: center; margin-right: auto; color: var(--text-3); font-size: var(--fs-3); }
@media (max-width: 480px) {
  .px-new-agent-dialog-beside { grid-template-columns: minmax(0, 1fr); }
  .px-new-agent-dialog-cancel, .px-new-agent-dialog-create { min-height: 44px; }
}
`
