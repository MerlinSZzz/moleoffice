// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { useProjectAsync } from '../lib/project-async.ts'
import { recordPath } from './router.tsx'
import { ErrorNote, Loading } from './ui.tsx'

/** A short list and a count using the same scope as the reports page. */
export function ReportsScope({ id, title }: { id: string; title: string }) {
  const [state, reload] = useProjectAsync(() => api.reportsAndNotes({ show: 'reports', limit: 5, offset: 0, scope: id }), [id])
  const query = new URLSearchParams({ show: 'reports', scope: id })
  return (
    <section className="reports-scope">
      <h2>{t('reports.scope.heading', { title })}</h2>
      <p>{t('reports.scope.counts')}</p>
      {state.status === 'loading' ? <Loading label={t('reports.show.reports')} rows={1} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} retry={reload} /> : null}
      {state.status === 'ready' ? <>
        <p>{t('reports.scope.total', { n: state.value.matched })}</p>
        <ul>{state.value.rows.map(row => <li key={row.id}><a href={`#${recordPath(row.id, row.kind)}`}>{row.title}</a></li>)}</ul>
        <a href={`#/notes?${query.toString()}`}>{t('reports.scope.view')}</a>
      </> : null}
    </section>
  )
}
