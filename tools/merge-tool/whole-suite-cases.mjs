// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Paths whose coverage needs the whole suite even when ordinary entries run related tests only. */
import './a-library-is-not-a-program.mjs'
import { DATABASE_FOLDERS } from '../../src/shared/merge-class.ts'
import { isTheQueuesOwnCode } from './the-queues-own-code.mjs'
import { enWave13u } from '../../src/shared/words/en-wave-13u.ts'

export const relatedOnlyWords = (key, values = {}) => enWave13u[`queueRelated.${key}`].replace(/\{(\w+)\}/g, (_, name) => String(values[name]))

// Database changes can break readers across the office, so related imports cannot prove their coverage.
const databasePaths = [...DATABASE_FOLDERS, 'src/server/db/']
// Upgrade and bootstrap changes affect a running office's transition between versions, beyond the import graph.
const stablePaths = ['tools/stable/upgrade-stable.mjs', 'tools/stable/bootstrap-stable.mjs', 'tools/stable/stable-release-policy.mjs', 'tools/stable/stable-service-settings.mjs', 'src/shared/whole-suite-receipt.ts', 'src/shared/stable-upgrade-notices.ts']
const stablePrefixes = ['tools/stable/stable-upgrade-', 'tools/stable/stable-bootstrap-']

/** Every path case that holds, with a bounded sample and the omitted count in its sentence. */
// The caller passes the programs restarted with the server, so this module reads nothing of the office.
export function wholeSuitePathCases(changed, restartedWithTheServer) {
  if (!Array.isArray(restartedWithTheServer)) throw new Error('The caller must pass the programs restarted with the server, as an array, so this module reads nothing of the office.')
  // Server and worker starts and their supervisor govern the whole application, whose tests cross process boundaries.
  const startPaths = [...restartedWithTheServer, 'tools/serve-dev.mjs', 'tools/files-that-restart-the-server.mjs']
  const groups = [
    { case: 1, matches: path => isTheQueuesOwnCode(path) },
    { case: 2, matches: path => databasePaths.some(folder => path.startsWith(folder)) },
    { case: 3, matches: path => stablePaths.includes(path) || stablePrefixes.some(prefix => path.startsWith(prefix)) },
    { case: 4, matches: path => startPaths.includes(path) },
  ]
  return groups.flatMap(group => {
    const paths = changed.filter(group.matches)
    if (paths.length === 0) return []
    const rest = paths.length > 20 ? relatedOnlyWords('morePaths', { count: paths.length - 20 }) : ''
    return [{ case: group.case, paths: paths.slice(0, 20), says: relatedOnlyWords(`case${group.case}`, { rest }) }]
  })
}
