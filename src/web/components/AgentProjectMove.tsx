// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVE AN AGENT TO ANOTHER PROJECT, ON ITS PAGE. Wave 13u, round 184. The person moves an agent
 * without changing any code.
 *
 * The person chooses a project. GET /api/agents/:id/project-move?to= says what would move and what would stay, each
 * with why, and writes nothing; the press sends POST with the same `to` and the preview's `needsAlso`, so the press
 * moves what the person read. Both answers are worked out in src/server/lib/agent-move.ts.
 *
 *   what moves   its record here, its ended runs, and under each the records that come with it, naming it; a record
 *                titled only by its kind, as a run's own flow run is, is called "its flow run";
 *   what stays   each run still going, paused, left without its process or in no known state, and a secretary's
 *                duties here, each with the page's own words for why;
 *   a crossing   a link that would join a record that moves to one that stays refuses the move, so the press is
 *                held back and the links are named.
 *
 * When nothing here can move now, as just after a press, the panel says which project the agent's record is in and
 * what stays, and offers no press. A refusal of the read is the office's sentence where the lists would be. A refusal
 * of the press is shown under the press. Its one prop is the agent's registry id.
 */

import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { kindWord } from '@shared/words.ts'
import type { AnAgentsProjectMove } from '../../server/lib/agent-move.ts'
import { ApiError, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { useProjects } from '../lib/projectlist.ts'
import { projectName } from '../lib/projects.ts'
import { currentWorkspace, WORKSPACE_HEADER } from '../lib/workspace.ts'
import { AGENT_LIVE_CSS } from './AgentLiveParts.tsx'
import { Btn, ErrorNote, Loading, Panel, theRefusalInWords } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** The office's answer about this agent, or its sentence where it refused to answer. A failure to ask is thrown. */
type AReading = { move: AnAgentsProjectMove; refused: null } | { move: null; refused: string }

function theDoor(agent: string): string {
  return `/api/agents/${encodeURIComponent(agent)}/project-move`
}

/** A 4xx is the office's answer about this agent and is drawn as one; anything else is a failure. */
function asARefusal(err: unknown): string {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return theRefusalInWords(err.message, err.fault)
  throw err
}

async function whatWouldMove(agent: string, to: string, from: string): Promise<AReading> {
  try {
    return { move: await moleOfficeRequest<AnAgentsProjectMove>(`${theDoor(agent)}?to=${encodeURIComponent(to)}`, { headers: { [WORKSPACE_HEADER]: from } }), refused: null }
  } catch (err) {
    return { move: null, refused: asARefusal(err) }
  }
}

/** A record whose title is only its kind ("Flow run" for a flow_run), which reads as "its flow run" under its run. */
function isOnlyItsKind(one: { kind: string; title: string }): boolean {
  return one.title.trim().toLowerCase().replace(/[\s_]+/g, ' ') === one.kind.replace(/_/g, ' ')
}

export function AgentProjectMove({ agentId, fromProject, toProject, onMoved }: { agentId: string; fromProject?: string; toProject?: string; onMoved?: () => void }): React.ReactElement {
  useLanguage()
  const mode = useMode()
  const projects = useProjects()
  const here = currentWorkspace()
  const [to, setTo] = useState(toProject ?? '')
  const from = fromProject ?? here
  const [reading, readAgain] = useProjectAsync(
    () => (to === '' ? Promise.resolve(null) : whatWouldMove(agentId, to, from)),
    [agentId, to, from],
  )
  const [pressing, setPressing] = useState(false)
  const [moved, setMoved] = useState<AnAgentsProjectMove | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  const others = (projects ?? []).filter((project) => project.id !== here)
  const nameOf = (id: string): string => projectName(id, projects?.find((project) => project.id === id)?.title ?? null)

  const staying = (move: AnAgentsProjectMove): React.ReactElement | null =>
    move.staying.length === 0 ? null : (
      <>
        <h4 className="am-heading">{t('agentMove.staying', { n: move.staying.length })}</h4>
        <ul className="am-list">
          {move.staying.map((one) => (
            <li key={one.id}>
              <span className="am-kind">{kindWord(one.kind, mode).text}</span> {content(one.title)}
              <span className="am-why"> · {t(`agentMove.stays.${one.why}`)}</span>
            </li>
          ))}
        </ul>
      </>
    )

  const press = async (move: AnAgentsProjectMove): Promise<void> => {
    setPressing(true)
    setRefused(null)
    setMoved(null)
    try {
      setMoved(
        await moleOfficeRequest<AnAgentsProjectMove>(theDoor(agentId), {
          method: 'POST',
          headers: { 'content-type': 'application/json', [WORKSPACE_HEADER]: from },
          body: JSON.stringify({ to: move.to, also: move.needsAlso }),
        }),
      )
      onMoved?.()
    } catch (err) {
      setRefused(asARefusal(err))
    } finally {
      setPressing(false)
      readAgain()
    }
  }

  const choice =
    projects === null ? (
      <Loading what={t('agentMove.to')} rows={1} />
    ) : others.length === 0 ? (
      <p className="al-line">{t('agentMove.noOther')}</p>
    ) : (
      <label className="am-choice">
        <span>{t('agentMove.to')}</span>
        <select value={to} onChange={(event) => setTo(event.target.value)} disabled={pressing}>
          <option value="">{t('agentMove.choose')}</option>
          {others.map((project) => (
            <option key={project.id} value={project.id}>
              {content(nameOf(project.id))}
            </option>
          ))}
        </select>
      </label>
    )

  const body = (() => {
    if (to === '' || reading.status === 'loading') return to === '' ? null : <Loading what={t('agentMove.title')} rows={2} />
    if (reading.status === 'error') return <ErrorNote message={reading.message} fault={reading.fault} label={t('agentMove.title')} retry={readAgain} />
    const said = reading.value
    if (said === null) return null
    if (said.move === null) return <p className="al-line am-said">{said.refused}</p>
    const move = said.move
    if (move.moving.length === 0) {
      return (
        <>
          {move.recordIsIn.length === 0 ? null : (
            <p className="al-line am-said">
              {t('agentMove.isNowIn', { name: content(move.agent.name), projects: move.recordIsIn.map((id) => content(nameOf(id))).join(', ') })}
            </p>
          )}
          <p className="al-line am-said">{t(move.staying.length === 0 ? 'agentMove.nothingLeft' : 'agentMove.nothingNow')}</p>
          {staying(move)}
        </>
      )
    }
    const cameWith = (id: string): string | null => move.moving.find((one) => one.id === id)?.forcedBy?.withTitle ?? null
    // Each record that comes with another is drawn under it, so the reader sees which run brings which.
    const named = move.moving.filter((one) => one.forcedBy === null)
    const inOrder = [
      ...named.flatMap((one) => [one, ...move.moving.filter((other) => other.forcedBy?.withId === one.id)]),
      ...move.moving.filter((one) => one.forcedBy !== null && !named.some((other) => other.id === one.forcedBy?.withId)),
    ]
    return (
      <>
        <h4 className="am-heading">{t('agentMove.moving', { n: move.moving.length })}</h4>
        <ul className="am-list">
          {inOrder.map((one) => (
            <li key={one.id}>
              {one.forcedBy !== null && isOnlyItsKind(one) ? (
                <span className="am-kind">{t('agentMove.its', { kind: kindWord(one.kind, mode).text })}</span>
              ) : (
                <>
                  <span className="am-kind">{kindWord(one.kind, mode).text}</span> {content(one.title)}
                </>
              )}
              {one.forcedBy === null ? null : (
                <span className="am-why"> · {t('agentMove.comesWith', { title: content(cameWith(one.id) ?? one.forcedBy.withId) })}</span>
              )}
            </li>
          ))}
        </ul>
        {staying(move)}
        <p className="al-line">{t('agentMove.messages')}</p>
        {move.crossing.length === 0 ? null : (
          <>
            <p className="al-line" role="alert">
              {t('agentMove.crossing', { n: move.crossing.length })}
            </p>
            <ul className="am-list">
              {move.crossing.map((link) => (
                <li key={link.linkId}>
                  {content(link.fromTitle)} → {content(link.toTitle)}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="al-row am-press">
          <Btn
            size="sm"
            onClick={() => void press(move)}
            pending={pressing}
            disabled={move.crossing.length > 0}
            reason={move.crossing.length > 0 ? t('agentMove.crossingReason') : undefined}
          >
            {t('agentMove.press', { project: content(nameOf(move.to)) })}
          </Btn>
        </div>
      </>
    )
  })()

  return (
    <Panel declares={{ surface: 'profile.projectmove' }} titleIs="label" title={t('agentMove.title')}>
      <style href="mole-office-agent-live" precedence="default">
        {AGENT_LIVE_CSS}
      </style>
      <style href="mole-office-agent-project-move" precedence="default">
        {AGENT_PROJECT_MOVE_CSS}
      </style>
      <p className="al-line am-says">{t('agentMove.says')}</p>
      {toProject === undefined ? choice : null}
      {moved === null ? null : (
        <p className="al-line" role="status">
          {t('agentMove.moved', { n: moved.moving.length, project: content(nameOf(moved.to)) })}
        </p>
      )}
      {refused === null ? null : (
        <p className="al-line" role="alert">
          {t('agentMove.refused')} {refused}
        </p>
      )}
      {body}
    </Panel>
  )
}

const AGENT_PROJECT_MOVE_CSS = `
.am-says { margin-bottom: 0.5rem; }
.am-choice { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; min-width: 0; }
.am-choice select { min-width: 0; max-width: 100%; }
.am-heading { margin: 0.6rem 0 0.25rem 0; font-size: 0.95em; }
.am-list { margin: 0 0 0.4rem 0; padding-left: 1.2rem; }
.am-list li { overflow-wrap: anywhere; margin-bottom: 0.15rem; }
.am-kind { color: var(--text-3); }
.am-why { color: var(--text-2); }
.am-said { margin-top: 0.4rem; }
.am-press { margin-top: 0.5rem; }
`
