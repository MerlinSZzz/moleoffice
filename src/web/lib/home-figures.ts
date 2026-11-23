// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. The reads Home's figures and key items ask, each for every project or one.
import { EVERY_PROJECT, projectsQuery, type ProjectChoice } from '@shared/across-projects.ts'
import type { MyDecisions, PackagesByLine, PackagesDonePerDay, TimeToLive, WholeSuiteMinutes } from '@shared/figures.ts'
import type { TheKeyItems } from '@shared/key-items.ts'
import { moleOfficeRequest } from '../api.ts'
import { WORKSPACE_HEADER } from './workspace.ts'

const figure = <A>(door: string) => (project: ProjectChoice): Promise<A> => moleOfficeRequest<A>(`/api/figures/${door}?${projectsQuery(project)}`)

/**
 * HD-2a's four reads and the forks the person settled, over each door's own span of days. His decision count and the
 * chart of his decision time both read my-decisions, and the transport joins the second read to the first while it is
 * out, so a load asks that door once.
 */
export const readPackagesByLine = figure<PackagesByLine>('packages-by-line')
export const readPackagesDone = figure<PackagesDonePerDay>('packages-done')
export const readTimeToLive = figure<TimeToLive>('time-to-live')
export const readSuiteMinutes = figure<WholeSuiteMinutes>('suite-minutes')
export const readMyDecisions = figure<MyDecisions>('my-decisions')

/**
 * THE OPEN KEY ITEMS OF THE PROJECTS SHOWN, in their order: every project's, project by project, or one project's,
 * named by the project header rather than by the project the page was opened in.
 */
export function readTheKeyItems(project: ProjectChoice): Promise<TheKeyItems> {
  return project === EVERY_PROJECT
    ? moleOfficeRequest<TheKeyItems>('/api/key-items?projects=every')
    : moleOfficeRequest<TheKeyItems>('/api/key-items', { headers: { [WORKSPACE_HEADER]: project } })
}
