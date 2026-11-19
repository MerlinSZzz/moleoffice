// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Rebuild the source index and say what it found.
 *
 *   export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
 *   npx tsx scripts/reindex.ts                              # scan this checkout into `default`
 *   MOLE_OFFICE_WORKSPACE=greenhouse npx tsx scripts/reindex.ts
 *   MOLE_OFFICE_REPO_ROOT=/path/to/repo npx tsx scripts/reindex.ts
 *   MOLE_OFFICE_DB=/tmp/scratch.db npx tsx scripts/reindex.ts
 *
 * WHICH PROJECT'S INDEX IT REBUILDS. `MOLE_OFFICE_WORKSPACE`, or the default workspace when it is not
 * set — the same stated default `GET /api` names for a request that sends no `x-mole-office-workspace`
 * header, and the same registry check, so a misspelt project id is refused here exactly as it is
 * over HTTP rather than building an index nothing will ever read. Each workspace holds its own
 * index because a project describes its own checkout: before this was scoped, a rebuild under a
 * second project's root replaced every row and reported the first project's claims as stale.
 *
 * MOLE_OFFICE_REPO_ROOT IS STILL ONE PER PROCESS, and pairing it with the wrong MOLE_OFFICE_WORKSPACE will
 * store one project's file list under another's name. Nothing here can detect that — the two are
 * independent facts about the machine — which is why both are printed on the first line.
 *
 * This is the whole of the derived layer's maintenance: there is no incremental update and no
 * edit path, because the index is REBUILT and never merged (see src/server/lib/sourceindex.ts).
 * Running it twice in a row changes nothing except the build stamp.
 *
 * IT WRITES THE SAME TABLES AS `POST /api/source/reindex`, on purpose — the two are
 * interchangeable, and the tests prove it. The reason to have both is that the command line does
 * not need a server running, which is what makes a rebuild something you can put in a git hook or
 * run before reading coverage.
 *
 * WHAT IT PRINTS, and why each number is here rather than in a log nobody reads:
 *
 *   files / skipped     a scan that quietly missed a directory would make coverage look clean for
 *                       the wrong reason, so what it did not look at is on screen every time.
 *   claimed / unclaimed the point of the exercise. Unclaimed code is code no module has taken
 *                       responsibility for; the largest ones are named.
 *   stale claims        a module pointing at a path that is not there. Almost always a rename,
 *                       and the only one of these numbers that is somebody's job.
 *   what changed        against the previous scan, so a person holding an older reading knows
 *                       which parts of it survived.
 *
 * WHICH DATABASE IT REBUILDS. The one `.env` names, same as the server and same as every other
 * command that opens a database — `db/client.ts` loads the settings, so there is nothing for this
 * script to remember and nothing for an operator to keep in step. `MOLE_OFFICE_DB` set in the shell
 * still wins over the file.
 *
 * It used to say the opposite: that this script did not read `.env`, and that if `.env` pointed the
 * server somewhere else you had to pass the same value here by hand. That was true, and it meant
 * this command silently rebuilt the source index of a database nobody was serving.
 */

import { rebuildIndex, coverage, unclaimedFiles } from '../src/server/lib/sourceindex.ts'
import { requireWorkspace } from '../src/server/lib/require-workspace.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import { sqlite } from '../src/server/db/client.ts'
import { settingValue, settingWasSet } from '../src/config/settings.mjs'

/** How many unclaimed files to name. Enough to act on, short enough to read. */
const SHOW_UNCLAIMED = 10
/** How many changed files to name before summarising the rest. */
const SHOW_CHANGED = 10

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

// The project this rebuild is about, checked against the registry before anything is written.
// `stated` is false when the variable is unset, which changes the refusal and not the answer: a
// database with no default workspace has never been migrated, and saying "unset MOLE_OFFICE_WORKSPACE"
// to somebody who never set it would be the wrong sentence.
const stated = settingWasSet('MOLE_OFFICE_WORKSPACE')
const workspaceId = requireWorkspace(stated ? String(settingValue('MOLE_OFFICE_WORKSPACE')).trim() : DEFAULT_WORKSPACE, stated).id

// The rebuild is attributed like every other write. A script is not a person typing, and the
// stamp says so: `system:reindex-script` rather than `human:owner`.
const scan = rebuildIndex({ workspaceId, actor: { type: 'system', id: 'reindex-script' } })

console.log(`reindex: ${scan.root} → workspace ${workspaceId}${stated ? '' : ' (the default; MOLE_OFFICE_WORKSPACE is unset)'}`)
console.log(`reindex: ${scan.fileCount} source files in ${scan.scanMs} ms, built by ${scan.builtBy} at ${scan.builtAt}`)
for (const sentence of scan.skipped) {
  console.log(`reindex:   not looked at — ${sentence}`)
}

const report = scan.report
if (report.firstScan) {
  console.log('reindex: first scan, so there is nothing to compare it against')
} else {
  console.log(
    `reindex: since ${report.previousBuiltAt} — ${report.added.length} added, ${report.removed.length} removed, ` +
      `${report.changed.length} changed, ${report.unchanged} unchanged`,
  )
  for (const path of report.added) console.log(`reindex:   + ${path}`)
  for (const path of report.removed) console.log(`reindex:   - ${path}`)
  for (const change of report.changed.slice(0, SHOW_CHANGED)) {
    console.log(`reindex:   ~ ${change.path} — ${change.what}`)
  }
  if (report.changed.length > SHOW_CHANGED) {
    console.log(`reindex:   ~ and ${report.changed.length - SHOW_CHANGED} more changed`)
  }
}

const cover = coverage(workspaceId)
console.log(
  `reindex: ${cover.claimedFiles} claimed, ${cover.unclaimedFiles} unclaimed` +
    `${cover.percentClaimed === null ? '' : ` (${cover.percentClaimed}% claimed)`}, ` +
    `${cover.staleClaims.length} stale claims`,
)

const silent = cover.modules.filter((m) => m.claims.length === 0)
if (silent.length > 0) {
  // This is what the two front-end stubs look like from here: a module that has never said which
  // code is its own. It is a finding, not an error, so it is named rather than counted.
  console.log(`reindex: ${silent.length} modules claim no code — ${silent.map((m) => m.moduleTitle).join(', ')}`)
}
for (const module of cover.modules) {
  if (module.problem !== null) console.log(`reindex:   ${module.moduleTitle}: ${module.problem}`)
}

if (cover.staleClaims.length > 0) {
  console.log('reindex: stale claims')
  for (const stale of cover.staleClaims) {
    const why = stale.problem === null ? 'matches nothing in the index — renamed or deleted' : stale.problem
    console.log(`reindex:   ${stale.moduleTitle} → "${stale.pattern}" ${why}`)
  }
}

const top = unclaimedFiles({ workspaceId, limit: SHOW_UNCLAIMED })
if (top.length > 0) {
  const more = cover.unclaimedFiles - top.length
  console.log(`reindex: largest unclaimed${more > 0 ? ` (${top.length} of ${cover.unclaimedFiles})` : ''}`)
  for (const file of top) {
    console.log(`reindex:   ${kb(file.sizeBytes).padStart(9)}  ${String(file.lines).padStart(5)} lines  ${file.path}`)
  }
}

sqlite.close()
