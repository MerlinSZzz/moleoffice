// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { api } from '../api.ts'

/** A report star belongs to the current person and is written as one idempotent change. */
export function ReportStar({ id, initial, onChanged }: { id: string; initial?: boolean; onChanged?: () => void }) {
  const [starred, setStarred] = useState<boolean | null>(initial ?? null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const read = () => { void api.reportStars().then(answer => { if (active) { setStarred(answer.stars.includes(id)); setFailed(false) } }).catch(() => { if (active) setFailed(true) }) }
    if (initial === undefined) read()
    return () => { active = false }
  }, [id, initial])
  const change = async () => {
    if (starred === null || busy) return
    setBusy(true)
    try {
      const answer = await api.setReportStar(id, !starred)
      setStarred(answer.stars.includes(id))
      setFailed(false)
      onChanged?.()
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  return <span className="report-star">
    <style href="mole-office-report-star" precedence="default">{`.report-star { display: inline-flex; align-items: center; gap: var(--pad); } .report-star button { cursor: pointer; font: inherit; font-size: 1.25rem; color: var(--text); background: var(--panel); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 6px 10px; }`}</style>
    <button type="button" disabled={busy || starred === null} aria-pressed={starred === true} aria-label={t(starred ? 'reports.star.remove' : 'reports.star.add')} onClick={() => { void change() }}>{starred ? '★' : '☆'}</button>
    {failed ? <span role="alert">{t('reports.star.failed')}</span> : null}
  </span>
}
