// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { gapBetween } from '@shared/spacing.ts'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { DEFAULT_WORKSPACE, MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { useState, useSyncExternalStore } from 'react'
import { api } from '../api.ts'
import { currentWorkspace, subscribeWorkspace } from '../lib/workspace.ts'
import { useProjectAsync } from '../lib/project-async.ts'

/**
 * ONE PLAIN CHOICE OF PROJECT, for the pages that read across projects:
 * Goals, Counters, Context bundles and All records. Each draws this one control, so the four ask the
 * same question in the same words and a reader learns it once.
 *
 * THE PROJECT THE PAGE WAS OPENED FROM IS ONLY WHERE THE CHOICE STARTS. It is shown chosen in the
 * control, where the reader can see it and change it to every project; it is never a narrowing the
 * reader cannot see. Until the reader chooses, the choice is the project on screen.
 */
export function useProjectChoice(): [ProjectChoice, (choice: ProjectChoice) => void] {
  // THE CHOICE FOLLOWS THE PROJECT ON SCREEN UNTIL THE READER CHOOSES. The window settles on its
  // project after the first render (a fresh visit starts at the default and then opens the project
  // the office offers), so a choice taken once at the first render started every page at Default
  // while the frame said Mole Office, and Counters read an empty project. Once the reader chooses,
  // the choice is theirs and stays.
  const opened = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const [chosen, setChosen] = useState<ProjectChoice | null>(null)
  return [chosen ?? opened, setChosen]
}

/** Every project's title by its id, read once from GET /api/workspaces, for a row that names its project. */
export function useProjectTitles(): ReadonlyMap<string, string> {
  const [state] = useProjectAsync(() => api.listWorkspaces(), [])
  if (state.status !== 'ready') return new Map()
  return new Map(state.value.workspaces.map((workspace) => [workspace.id, workspace.title]))
}

/** A row’s project by its title, with a readable fallback until titles arrive. */
export function ProjectName({ id, titles }: { id: string; titles: ReadonlyMap<string, string> }) {
  return (
    <span className="pch-name" data-project={id}>
      <style href="mole-office-project-choice" precedence="default">{PROJECT_CHOICE_CSS}</style>
      {titles.get(id === MESSAGE_CENTRE ? DEFAULT_WORKSPACE : id) ?? t('g7a.records.unnamedProject')}
    </span>
  )
}

/** The control: every project, or one project. */
export function ProjectChoiceControl({
  choice,
  onChoose,
  titles,
}: {
  choice: ProjectChoice
  onChoose: (choice: ProjectChoice) => void
  titles: ReadonlyMap<string, string>
}) {
  // A CHOSEN PROJECT THE LIST HAS NOT READ YET is still offered, by its id, so the control never
  // shows a choice other than the one the page is reading.
  const ids = [...titles.keys()]
  if (choice !== EVERY_PROJECT && !titles.has(choice)) ids.unshift(choice)
  return (
    <label className="pch-choice">
      <style href="mole-office-project-choice" precedence="default">{PROJECT_CHOICE_CSS}</style>
      <span className="pch-label">{t('acrossProjects.label')}</span>
      <select className="px-input pch-select" value={choice} onChange={(event) => onChoose(event.target.value)}>
        <option value={EVERY_PROJECT}>{t('acrossProjects.every')}</option>
        {ids.map((id) => (
          <option key={id} value={id}>{titles.get(id) ?? id}</option>
        ))}
      </select>
    </label>
  )
}

/** The sentence a page's counts carry, so a count says what it is counted over. */
export function countedOver(choice: ProjectChoice, titles: ReadonlyMap<string, string>): string {
  return choice === EVERY_PROJECT
    ? t('acrossProjects.countedEvery')
    : t('acrossProjects.countedOne', { project: titles.get(choice) ?? choice })
}

/**
 * A COUNT AND WHAT IT IS COUNTED OVER, joined by the office's spacing rule (`gapBetween`): no space after a
 * full-width full stop in Chinese ("0 个暂停。只计 Default 这个项目。"), one space between English sentences. Every page
 * that says what its count is counted over joins the two here (wave 13q's round 28).
 */
export function withCountedOver(line: string, choice: ProjectChoice, titles: ReadonlyMap<string, string>): string {
  const over = countedOver(choice, titles)
  return line + gapBetween(line, over) + over
}

/** The stylesheet the control and the row's project name bring with them (React hoists it once). */
export const PROJECT_CHOICE_CSS = `
.pch-choice { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.pch-label { color: var(--ink-2); }
.pch-select { min-width: 12rem; max-width: 100%; }
.pch-name { color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 40rem) {
  .pch-choice { display: flex; width: 100%; }
  .pch-select { flex: 1 1 auto; min-height: 44px; }
}
`
