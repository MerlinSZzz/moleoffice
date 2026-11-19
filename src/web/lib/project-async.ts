// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READING ANSWERED ABOUT ONE PROJECT, READ AGAIN WHEN THE PROJECT CHANGES.
 *
 * `useAsync` (components/ui.tsx) reads again only when its stated dependencies change. This hook
 * adds the chosen project to them and passes it to `useAsync` as `project`, so a switch of project
 * reads this reading again for the new project. Until the new answer comes, the reading shows the
 * new project's kept answer when the page cache holds one, and otherwise the previous project's
 * answer, with the re-read mark, which `useAsync` sets before the browser paints the first frame
 * under the new project's name. If the new read fails, the previous project's answer goes and the
 * failure is said in its place.
 *
 * WHICH READINGS COME HERE. A reading whose server handler reads the project of the request, or
 * whose load names the project itself. A reading the server answers the same in every project stays
 * on `useAsync`, and a switch leaves it alone: it draws no loading and does not ask again. When
 * nobody can tell which it is, the reading comes here. A project reading left on `useAsync` would
 * show another project's rows with no mark; an office reading placed here only asks once more.
 */

import { useSyncExternalStore, type DependencyList } from 'react'
import { useAsync, type AsyncState, type UseAsyncOptions } from '../components/ui.tsx'
import { currentWorkspace, subscribeWorkspace } from './workspace.ts'

export function useProjectAsync<T>(load: () => Promise<T>, deps: DependencyList, options: Omit<UseAsyncOptions<T>, 'project'> = {}): [AsyncState<T>, () => void] {
  const project = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  return useAsync(load, [...deps, project], { ...options, project })
}
