// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState, useSyncExternalStore } from 'react'
import { content, t } from '@shared/i18n.ts'
import { workspaceTitleFault, type Workspace } from '@shared/workspaces.ts'
import { errorMessage, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useMode } from '../lib/mode.ts'
import { readWorkspacesOnce } from '../lib/oneread.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
import { Panel, useAsync } from './ui.tsx'
import { projectName } from './projects.tsx'

/** The sidebar asks App to refresh the shared project list after either write. */
export const PROJECTS_CHANGED = 'mole-office.projects.changed'

export function suggestedProjectId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** Settings › Projects holds the rename press for the project you are in. A project is made at the end of the sidebar's Switch list. */
export function ProjectsPanel() {
  useLanguage()
  const mode = useMode()
  const project = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [projects, reload] = useAsync(() => readWorkspacesOnce(), [])
  const listed = projects.status === 'ready' ? projects.value.workspaces.find(one => one.id === project) : undefined
  const name = listed === undefined ? t('nav.empty') : content(projectName(listed.id, listed.title))
  function changed() {
    window.dispatchEvent(new Event(PROJECTS_CHANGED))
    reload()
  }
  return <Panel titleIs="label" declares={{ surface: 'settings.projects' }} title={t('nav.projects')}>
    <style href="mole-office-project-actions" precedence="default">{CSS}</style>
    <p className="project-actions-current">{name}</p>
    <div className="project-actions">
      {listed === undefined ? (projects.status === 'ready' ? null : <p role="status">{t(projects.status === 'error' ? 'nav.projectsFailed' : 'nav.loadingProjects')}</p>)
        : <RenameProject key={project} project={listed} onChanged={changed} />}
    </div>
    {mode === 'inspect' && projects.status === 'error' ? <p>{projects.message}</p> : null}
  </Panel>
}

function RenameProject({ project, onChanged }: { project: Workspace; onChanged: () => void }) {
  const mode = useMode()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const fault = workspaceTitleFault(name)
  async function rename() {
    setBusy(true)
    setRefused(null)
    try {
      await moleOfficeRequest<Workspace>(`/api/workspaces/${encodeURIComponent(project.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: name.trim() }),
      })
      setOpen(false)
      onChanged()
    } catch (err) { setRefused(errorMessage(err)) }
    finally { setBusy(false) }
  }
  if (!open) return <button type="button" className="project-action" title={t('nav.renameSays', { name: content(projectName(project.id, project.title)) })}
    onClick={() => { setName(projectName(project.id, project.title)); setRefused(null); setOpen(true) }}>{t(settingsControlWord('settings.projects', 'nav.renameProject'))}</button>
  return <form className="project-form" onSubmit={event => { event.preventDefault(); void rename() }}>
    <label htmlFor="settings-project-rename">{t(settingsControlWord('settings.projects', 'nav.whatToCallIt'))}</label>
    <input id="settings-project-rename" value={name} autoFocus onChange={event => setName(event.target.value)} />
    {mode === 'inspect' ? <p>{t('nav.stillStoredAs', { id: project.id })}</p> : null}
    {fault === null ? null : <p role="status">{t('nav.nameRequired')}</p>}
    <div className="project-actions">
      <button type="submit" className="project-action" disabled={busy || fault !== null}>{t(busy ? 'nav.renaming' : settingsControlWord('settings.projects', 'nav.rename'))}</button>
      <button type="button" className="project-action" onClick={() => { setOpen(false); setRefused(null) }}>{t(settingsControlWord('settings.projects', 'nav.cancel'))}</button>
    </div>
    {refused === null ? null : <p role="status">{t('nav.renameFailed')}{mode === 'inspect' ? ` ${refused}` : null}</p>}
  </form>
}

const CSS = `
.project-actions { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--pad); }
.project-actions-current { margin-bottom: var(--pad); font-weight: 600; }
.project-action { min-height: 36px; padding: 4px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); }
.project-action:hover { background: var(--hover); }
.project-action:disabled { color: var(--text-3); cursor: not-allowed; }
.project-form { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; max-width: 100%; }
.project-form input { min-width: 0; min-height: 36px; padding: 4px var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); }
.project-form [role="status"] { color: var(--st-failed); }
@media (max-width: 40rem) { .project-action, .project-form input { min-height: 44px; } }
`
