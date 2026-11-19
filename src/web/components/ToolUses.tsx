// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S TOOL USES, ON THE RUN'S PAGE. Wave 13s round 33, problem mR8vNPOVNQ_p.
 *
 * Each use of a tool is one row in `tool_uses`, written by POST /api/toolset/uses against the calling run. Until
 * migration 0231 the uses were a list in the run's `data.toolUses` and the page drew that field. Now the page reads
 * GET /api/toolset/runs/<run>/uses, newest first, one page at a time, and "Show older uses" reads the next page.
 * The count says how many there are in all, so a reader can tell a short list from a page of a long one.
 */
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import type { StoredToolUse } from '@shared/toolset.ts'
import type { RecordKind } from '@shared/types.ts'
import { TOOL_USES_KEY } from '@shared/sections.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import type { Declares } from './declares.ts'
import { titleHere } from './sections.ts'
import { Absence, Btn, ErrorNote, Loading, Panel, Stamp } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

const TOOL_USES_CSS = `
.tu-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pad); }
.tu-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 4px var(--pad); align-items: baseline; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text); }
.tu-tool { font-family: var(--font-mono); color: var(--text-2); }
.tu-said { overflow-wrap: anywhere; }
.tu-moved { grid-column: 3; color: var(--text-3); }
.tu-more { margin-top: var(--pad); }
@media (max-width: 660px) {
  .tu-row { grid-template-columns: auto minmax(0, 1fr); }
  .tu-said, .tu-moved { grid-column: 1 / -1; }
}
`

export function ToolUses({ run, kind, declares }: { run: string; kind: string; declares: Declares }) {
  const [first, reload] = useProjectAsync(() => api.readToolUses(run, null), [run])
  const [older, setOlder] = useState<StoredToolUse[]>([])
  const [next, setNext] = useState<number | null | undefined>(undefined)
  const [reading, setReading] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const total = first.status === 'ready' ? first.value.total : null
  const before = next === undefined ? (first.status === 'ready' ? first.value.older : null) : next

  async function readOlder(): Promise<void> {
    if (before === null) return
    setReading(true)
    setRefused(null)
    try {
      const page = await api.readToolUses(run, before)
      setOlder((had) => [...had, ...page.uses])
      setNext(page.older)
    } catch (err) {
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setReading(false)
    }
  }

  const uses = first.status === 'ready' ? [...first.value.uses, ...older] : []

  return (
    <Panel
      declares={declares}
      title={titleHere(kind as RecordKind, TOOL_USES_KEY)}
      actions={total === null || total === 0 ? null : <span className="tu-count">{t('toolUses.shown', { shown: uses.length, total })}</span>}
    >
      <style href="mole-office-tool-uses" precedence="default">
        {TOOL_USES_CSS}
      </style>
      {first.status === 'loading' ? (
        <Loading label={t('toolUses.loading')} rows={2} />
      ) : first.status === 'error' ? (
        <ErrorNote message={first.message} fault={first.fault} retry={reload} />
      ) : uses.length === 0 ? (
        <Absence tier="told-apart" looked word={t('toolUses.none')} title={t('toolUses.noneTitle')} />
      ) : (
        <>
          <ol className="tu-list">
            {uses.map((use) => (
              <li className="tu-row" key={use.seq}>
                <Stamp at={use.at} />
                <span className="tu-tool">{use.tool}</span>
                <span className="tu-said">{use.said}</span>
                {use.movedAt === null ? null : <span className="tu-moved">{t('toolUses.moved')}</span>}
              </li>
            ))}
          </ol>
          {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} />}
          {before === null ? null : (
            <div className="tu-more">
              <Btn size="sm" variant="ghost" onClick={() => void readOlder()} pending={reading}>
                {t('toolUses.older')}
              </Btn>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
