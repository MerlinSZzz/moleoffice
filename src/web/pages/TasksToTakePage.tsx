// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TASKS TO TAKE: every task somebody in this project has packaged for somebody else to pick up.
 *
 * Criterion F16 point 2. The rail row
 * is called "Tasks to take", and this page's English heading uses that name.
 * The word list supplies the translated heading.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE DRAWS AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/delegation` answers newest package first, which is the order the server already
 * decided — nothing here re-sorts it. The packages made inside the office come from
 * `GET /api/delegation/inside` in the same order, after the outside ones (`readEveryPackage`).
 * `docs/UX-CONTRACT.md`, *Lists locate. Detail pages explain.*: a row carries the title, the
 * state, which of the three kinds of outside work the package suits, who is responsible, and who
 * holds it, and nothing that belongs on the task's own page. `says` is the row's own line, written by the server; this file never writes a second one.
 *
 * `heldBy` and `outsideName` are two different facts and a row that carries both draws both,
 * because a package can be claimed by an agent and promised outside at the same time.
 *
 * Who is responsible and who holds it are named as the registries name them, through
 * `packageParticipantNamed`, the one the task's own package panel names them with. The stored id is
 * never drawn.
 *
 * ---------------------------------------------------------------------------------------
 * THE EMPTY COLUMN
 * ---------------------------------------------------------------------------------------
 *
 * A project with no packaged tasks has not failed at anything, so the first line's emptiness is
 * `Absence` at the `ordinary` tier: one quiet word, never a sentence. A package nobody has taken for
 * a long time is not this page's judgement to make, because nothing on the row says how long is
 * long — that reading is left to whoever looks, not invented here.
 */

import type { DelegationReply } from '../api.ts'
import { Absence, ErrorNote, Loading, Panel, Row, ServerNote, Tag, type AsyncState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { packageParticipantNamed, readEveryPackage, TaskPackageActions, TaskPackagePanelStyle } from '../components/TaskPackagePanel.tsx'
import { recordPath } from '../components/router.tsx'
import { surfaceWord } from '@shared/surfaces.ts'
import type { DelegationRow } from '@shared/delegation.ts'
import { packageStateWord, packageSuitWord } from '@shared/words.ts'
import { content, t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import type { ParticipantsNamed } from '../lib/participant-lookup.ts'

export function TasksToTakePage() {
  useLanguage()
  const [state, reload] = useProjectAsync(readEveryPackage, [])
  const [names] = useProjectAsync(readParticipantsOnce, [])
  return (
    <div className="page ttt">
      <style href="mole-office-tasks-to-take-page" precedence="default">
        {TTT_CSS}
      </style>
      <TaskPackagePanelStyle />
      <h1 className="ttt-title">{t('tasksToTake.title')}</h1>
      {state.status === 'loading' ? <Loading what={t('pageWords.TasksToTakePage.001')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheTasksToTake reply={state.value} names={names} onChanged={reload} /> : null}
    </div>
  )
}

/**
 * The column, drawn.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER. The page above fetches; this takes what it
 * fetched and draws it in the current page language.
 */
export function TheTasksToTake({
  reply,
  names = { status: 'loading' },
  onChanged,
}: {
  reply: DelegationReply
  /** Both registries, to name who is responsible and who holds each package. Being read, in a bare render. */
  names?: AsyncState<ParticipantsNamed>
  onChanged?: () => void
}) {
  useLanguage()
  return (
    <>
      <p className="ttt-lead">
        {reply.tasks.length === 0 ? (
          <Absence
            tier="ordinary"
            word={t(reply.couldNotRead.length === 0 ? 'tasksToTake.none' : 'tasksToTake.noneReadable')}
            title={t(reply.couldNotRead.length === 0 ? 'tasksToTake.noneTitle' : 'tasksToTake.noneReadableTitle')}
          />
        ) : (
          t('tasksToTake.count', { n: reply.tasks.length })
        )}
      </p>
      {reply.tasks.length === 0 ? null : (
        <Panel titleIs="label" declares={{ surface: 'tasks.list' }} title={surfaceWord('tasks.list')}>
          <div className="ttt-rows">
            {reply.tasks.map((row) => (
              <TaskToTakeRow key={row.recordId} row={row} workspaceId={reply.workspaceId} names={names} onChanged={onChanged} />
            ))}
          </div>
        </Panel>
      )}
      {reply.couldNotRead.length === 0 ? null : (
        <Panel titleIs="label" declares={{ surface: 'tasks.unreadable' }} title={surfaceWord('tasks.unreadable')}>
          <div className="ttt-rows">
            {reply.couldNotRead.map((one) => (
              <div className="ttt-unreadable-row" key={one.recordId}>
                <span className="ttt-unreadable-title">{content(one.title)}</span>
                <span className="ttt-unreadable-why">{t('planning.notReadable')}</span>
                <ServerNote text={one.because} />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  )
}

function TaskToTakeRow({
  row,
  workspaceId,
  names,
  onChanged,
}: {
  row: DelegationRow
  workspaceId: string
  names: AsyncState<ParticipantsNamed>
  onChanged?: () => void
}) {
  return (
    <Row
      cols="auto minmax(0, 1fr) auto"
      sev={<Tag tone="neutral">{packageStateWord(row.state).text}</Tag>}
      title={content(row.title)}
      href={`#${recordPath(row.recordId)}`}
      target={{ kind: 'record', recordId: row.recordId, workspaceId }}
      meta={
        <>
          {row.namedModuleCount === 0 ? <span className="ttt-says">{t('tasksToTake.noModule')}</span> : null}
          <span className="ttt-facts">
            <span className="ttt-fact">
              <span className="ttt-key">{t('tasksToTake.suits')}</span>
              {packageSuitWord(row.suits).text}
            </span>
            <span className="ttt-fact">
              <span className="ttt-key">{t('tasksToTake.responsible')}</span>
              {row.responsible === null ? (
                <Absence
                  tier="ordinary"
                  word={t('tasksToTake.unrecorded')}
                  title={t('tasksToTake.unrecordedTitle')}
                />
              ) : (
                packageParticipantNamed(row.responsible, names)
              )}
            </span>
            {row.heldBy === null ? null : (
              <span className="ttt-fact">
                <span className="ttt-key">{t('tasksToTake.heldBy')}</span>
                {packageParticipantNamed(row.heldBy, names)}
              </span>
            )}
            {row.outsideName === null ? null : (
              <span className="ttt-fact">
                <span className="ttt-key">{t('tasksToTake.takenOutsideBy')}</span>
                {row.outsideName}
              </span>
            )}
          </span>
          {/* THE SAME TWO PRESSES THE TASK'S OWN PANEL DRAWS, so a person reading the column can
              put something back or confirm without opening the record first. Both are shut, so the
              page stays a reading until one is pressed. A package made inside the office has a parent,
              and gets none of them: each one writes an act of outside work. */}
          {row.parent === null ? (
            <TaskPackageActions recordId={row.recordId} workspaceId={workspaceId} state={row.state} onChanged={onChanged} />
          ) : null}
        </>
      }
      right={<span className="ttt-at">{row.packagedAt}</span>}
    />
  )
}

const TTT_CSS = `
.ttt-title { font-size: var(--fs-5); line-height: var(--lh-tight); margin: 0 0 var(--gut); }
.ttt-lead { margin: 0 0 var(--gut); color: var(--text-2); font-size: var(--fs-1); }
.ttt-rows { display: grid; gap: var(--gut); }
.ttt-says { display: block; color: var(--text-2); overflow-wrap: anywhere; }
.ttt-facts { display: flex; flex-wrap: wrap; column-gap: var(--pad-lg); row-gap: 2px; margin-top: 2px; }
.ttt-fact { display: inline-flex; align-items: baseline; gap: 4px; font-size: var(--fs-1); color: var(--text-2); }
.ttt-key { color: var(--text-3); }
.ttt-at { font-size: var(--fs-1); color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ttt-unreadable-row { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; }
.ttt-unreadable-row + .ttt-unreadable-row { box-shadow: inset 0 1px 0 var(--border); }
.ttt-unreadable-title { font-weight: 600; }
.ttt-unreadable-why { color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  .ttt-facts { flex-direction: column; gap: 2px; }
}
`
