// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW'S STAGES, AND WHY EACH IS THERE ONE PRESS DOWN. Wave 13q round 43, placed on a
 * flow's record page by agreement with wave 13k (vdBCKMOYwGJV, point B, answered yes in S4Zvrp1ll2CO). The record
 * page is wave 13k's and mounts this with one line.
 *
 * THE MAIN CONTENT IS THE STAGES: what each does, and what proves it ran. The generic body does not draw a list of
 * objects, so before this a flow's page drew none of its stages at all.
 *
 * THE SECOND LEVEL IS ONE CLOSED FOLD under the stages: each step's why and sources, and the flow's record of changes.
 * A step with no why says "The reason is not written yet" in the fold and nowhere on the main view.
 *
 * WHILE THE PAGE IS BEING CHANGED THE FOLD IS OPEN, with a sentence above it: whoever changes or removes a step is
 * shown its why and sources first. The server refuses a change without them, and its refusal quotes them too.
 */

import { content, t } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import { RouteLink, recordPath } from './router.tsx'
import { Absence, Panel } from './ui.tsx'
import type { Declares } from './declares.ts'

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)
const words = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((one): one is string => words(one) !== null) : [])

/** A record id as a link: its title when this project holds it, the id itself when it does not. */
function RecordNamed({ id, titleById }: { id: string; titleById: ReadonlyMap<string, string> }) {
  const title = titleById.get(id)
  return <RouteLink to={recordPath(id)}>{title === undefined ? <code>{id}</code> : content(title)}</RouteLink>
}

function Named({ list, titleById }: { list: readonly string[]; titleById: ReadonlyMap<string, string> }) {
  return (
    <ul className="rd-list">
      {list.map((id, i) => (
        <li key={`${id}-${String(i)}`}>
          <RecordNamed id={id} titleById={titleById} />
        </li>
      ))}
    </ul>
  )
}

/** Draws nothing on a record that is not a flow, so the record page mounts it with one line. */
export function FlowReasons({
  record,
  titleById,
  editing,
  sections,
}: {
  record: PanelRecord
  titleById: ReadonlyMap<string, string>
  /** True while the page is being changed: the fold opens, so the reasons are read before a step is changed. */
  editing: boolean
  /** The record's sections. The panel is the flow's `stages` section, so a press inside it names that section. */
  sections: (key: string) => Declares
}) {
  if (record.kind !== 'flow') return null
  const stages = Array.isArray(record.data['stages']) ? record.data['stages'].filter(isObject) : []
  const changes = Array.isArray(record.data['step_changes']) ? record.data['step_changes'].filter(isObject) : []
  return (
    <Panel declares={sections('stages')} title={t('w13q.flow.title')} rank={1}>
      <div data-testid="flow-stages" style={{ overflowWrap: 'anywhere' }}>
        {stages.length === 0 ? (
          <p className="rd-none"><Absence tier="ordinary" title={t('w13q.flow.none')} /></p>
        ) : (
          <ol style={{ margin: 0, paddingInlineStart: 0, listStyle: 'none', display: 'grid', gap: '.5rem' }}>
            {stages.map((step, at) => {
              const evidence = words(step['evidence'])
              return (
                <li key={at} data-testid="flow-stage">
                  <div><span className="rd-sub">{t('w13q.flow.step', { n: at + 1 })}</span> {content(words(step['does']) ?? '')}</div>
                  <div className="rd-sub">{evidence === null ? t('w13q.flow.noEvidence') : t('w13q.flow.provedBy', { evidence: content(evidence) })}</div>
                </li>
              )
            })}
          </ol>
        )}
        <details className="rd-fold" data-testid="flow-reasons" open={editing}>
          <summary>{t('w13q.flow.fold')}</summary>
          {editing ? <p className="rd-sub" data-testid="flow-reasons-editing">{t('w13q.flow.foldEditing')}</p> : null}
          <ol style={{ margin: 0, paddingInlineStart: 0, listStyle: 'none', display: 'grid', gap: '.5rem' }}>
            {stages.map((step, at) => {
              const why = words(step['why'])
              const sources = ids(step['sources'])
              return (
                <li key={at} data-testid="flow-reason">
                  <div><span className="rd-sub">{t('w13q.flow.step', { n: at + 1 })}</span> {content(words(step['does']) ?? '')}</div>
                  <div className="rd-sub">{why === null ? t('w13q.flow.noWhy') : t('w13q.flow.why', { why: content(why) })}</div>
                  {sources.length === 0 ? (
                    <div className="rd-sub">{t('w13q.flow.noSources')}</div>
                  ) : (
                    <div className="rd-sub">
                      {t('w13q.flow.sources')}
                      <Named list={sources} titleById={titleById} />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          <h4 className="rd-sub" style={{ marginBlock: '.75rem .25rem' }}>{t('w13q.flow.changes')}</h4>
          {changes.length === 0 ? (
            <p className="rd-sub">{t('w13q.flow.noChanges')}</p>
          ) : (
            <ol style={{ margin: 0, paddingInlineStart: 0, listStyle: 'none', display: 'grid', gap: '.5rem' }}>
              {changes.map((change, at) => {
                const cause = words(change['cause'])
                return (
                  <li key={at} data-testid="flow-change">
                    <div className="rd-sub">{content(words(change['at']) ?? '')}</div>
                    <div>{t('w13q.flow.change', { what: content(words(change['what']) ?? ''), why: content(words(change['why']) ?? '') })}</div>
                    {cause === null ? null : (
                      <div className="rd-sub">
                        {t('w13q.flow.cause')} <RecordNamed id={cause} titleById={titleById} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </details>
      </div>
    </Panel>
  )
}
