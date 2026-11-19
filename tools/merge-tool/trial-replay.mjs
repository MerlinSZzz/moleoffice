#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE QUEUE'S REPLAY WOULD DO WITH A TIP, TRIED IN A THROWAWAY PLACE (wave 13u round 77, item 19).
 *
 *     node tools/merge-tool/trial-replay.mjs --repository <a git repository> --tip <commit> --main <commit>
 *
 * WHY. The coordinator's release loop asked `git merge-tree origin/main <tip>` before it replaced a waiting entry. At
 * 14:46 on 24 October 2026 that said "conflict" for 13s round 101. Main held 136 of the branch's 142 commits under other
 * ids, and merge-tree, which compares two trees, met their files as added on both sides. The queue's replay leaves out
 * each commit whose patch main holds, and would have put the 6 new ones on main cleanly. This answers as that replay does.
 *
 * WHAT IT DOES. It reads --tip and --main as commits of the repository. It makes a copy of the repository at the tip in a
 * new folder under the temporary directory (aScratchCopy) and runs the queue's own replay there (rebaseWithTheJoins,
 * rebase-with-joins.mjs): the same joins, and the same `git rebase <main>`, which leaves out each commit whose patch main
 * holds. It carries no second copy of either. It moves no ref the repository has, writes nothing in its worktrees, and
 * removes the folder.
 *
 * A LANDING'S RETAINED TIPS (wave 13u, item 55). The queue's replay reads, for each landing on main, the branch tip and
 * the replayed tip it retained (replayMain, src/shared/merge/landed-history.mjs). The checkout the queue lands in holds
 * them under refs/keep/landed/* and refs/keep/landed-replay/* (land.mjs), and a clone fetches neither. When a tip is
 * missing, the trial fetches those refs from the repository's origin first. It adds only the refs the repository lacks,
 * moves none it has, names on stderr the ones it added, and reads the tips again. With no origin, when the fetch fails,
 * or when origin does not hold the tip either, it gives no answer, and the sentence names the refs to fetch.
 *
 * WHAT IT PRINTS is one JSON line on stdout and nothing else there. The merge tool's own log lines go to stderr.
 *   clean       true when the replay ends, false when it stops on a conflict its joins do not resolve, and null when it
 *               gives no answer: no replay was made, or a failure came that is not a conflict. Then `why` says in one
 *               sentence what it could not read, main and tip are null if it did not read them, and the rest are null.
 *   main, tip   the full commit ids that --main and --tip named.
 *   skipped     the tip's commits, full ids and oldest first, that the replay left out because main already holds their
 *               change. Git leaves out a commit whose patch main holds, and drops one that changes nothing once it is
 *               replayed. This is read from the replay's result: git copies a note from each commit to the commit it
 *               replays it as, and a commit whose note no replayed commit carries was left out. A merge commit is never
 *               named, because git's rebase replays none. [] when none was left out. null when the replay stopped or
 *               renumbered migrations, because then the result does not say.
 *   stoppedAt   the tip's commit the replay stopped at. null when it did not stop, and when the stop came in the queue's
 *               migration renumbering, which replays rebuilt copies of the commits and not the tip's own.
 *   files       the paths the replay left in conflict, as the queue reports them. [] when it did not stop.
 *   renumbered  the migrations the queue renumbered to end clean, as "<old tag> -> <new tag>, ...", or null when none.
 *
 * Exit 0: clean. Exit 1: it stops on a conflict, and never for anything else. Exit 2: no answer, and the JSON line says
 * why; or a usage error, which prints no JSON line. These are the exit codes of `git merge-tree --write-tree`, which this
 * replaces in the coordinator's loop.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_TOOL = fileURLToPath(import.meta.url)
/** The notes ref the trial marks the tip's commits with, in its own copy only. */
const NOTES = 'refs/notes/trial-replay'

/** What an error says, on one line. */
const said = (err) => (err instanceof Error ? err.message : String(err)).replace(/\s*\n\s*/g, ' ')

/**
 * THE RETAINED TIPS OF EACH LANDING ON `main`, made readable in `repository` before the replay reads them, or a throw
 * that names the refs to fetch. The header says when it fetches and what it adds.
 */
function theRetainedTipsRead(repository, main, { git, tryGit, history }) {
  const read = () => history.retainedLandings((args) => git(repository, args), main)
  let missing
  try { read(); return } catch (err) { missing = err }
  const prefixes = [history.LANDED_KEEP_PREFIX, history.REPLAY_KEEP_PREFIX]
  const toFetch = `fetch ${prefixes.map((prefix) => `${prefix}*`).join(' and ')} into it from the checkout the queue lands in`
  if (!tryGit(repository, ['remote', 'get-url', 'origin']).ok) throw Error(`${said(missing)}; the repository has no origin to fetch the keep refs from, so ${toFetch}.`)
  const held = () => git(repository, ['for-each-ref', '--format=%(refname)', ...prefixes]).split('\n').filter((ref) => ref !== '')
  const before = new Set(held())
  // NO + IN THE REFSPECS: git adds the refs the repository lacks, and refuses to move one it has.
  const fetched = tryGit(repository, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--no-auto-maintenance', 'origin', ...prefixes.map((prefix) => `${prefix}*:${prefix}*`)])
  if (!fetched.ok) throw Error(`${said(missing)}; fetching the keep refs from origin failed (${said(fetched.stderr)}), so ${toFetch}.`)
  const added = held().filter((ref) => !before.has(ref))
  process.stderr.write(`trial-replay: ${said(missing)}. It fetched from origin the keep refs the repository lacked: ${added.length > 0 ? added.join(', ') : 'none'}.\n`)
  try { read() } catch (err) { throw Error(`${said(err)}, even after the keep refs were fetched from origin; ${toFetch}.`) }
}

/** The trial in `place`, with the merge tool's modules loaded: the JSON line's fields. */
async function theTrial({ repository, tip, main }, place) {
  const at = { main: null, tip: null }
  try {
    const { git, tryGit } = await import('./git.mjs')
    const { aScratchCopy, rebaseWithTheJoins } = await import('./rebase-with-joins.mjs')
    const history = await import('../../src/shared/merge/landed-history.mjs')
    at.main = git(repository, ['rev-parse', '--verify', '--end-of-options', `${main}^{commit}`])
    at.tip = git(repository, ['rev-parse', '--verify', '--end-of-options', `${tip}^{commit}`])
    theRetainedTipsRead(repository, at.main, { git, tryGit, history })
    const clone = join(place, 'clone')
    const upstream = aScratchCopy(repository, at.main, at.tip, clone)
    const own = git(clone, ['rev-list', '--reverse', '--no-merges', `${at.main}..${at.tip}`]).split('\n').filter((one) => one !== '')
    for (const commit of own) git(clone, ['notes', '--ref', NOTES, 'add', '-m', commit, commit])
    git(clone, ['config', 'notes.rewriteRef', NOTES])
    // A COMMIT GIT DROPS AS EMPTY passes its note to the commit before it, which keeps its own note.
    git(clone, ['config', 'notes.rewriteMode', 'ignore'])
    const rebased = rebaseWithTheJoins(clone, { main: at.main, upstream, commit: at.tip })
    if (!rebased.ok) return { clean: false, ...at, skipped: null, stoppedAt: rebased.stoppedAt, files: rebased.files, renumbered: null }
    if (rebased.renumbered !== null) return { clean: true, ...at, skipped: null, stoppedAt: null, files: [], renumbered: rebased.renumbered.says }
    const replayed = new Set(git(clone, ['log', `--notes=${NOTES}`, '--format=%N', `${at.main}..HEAD`]).split(/\s+/))
    return { clean: true, ...at, skipped: own.filter((commit) => !replayed.has(commit)), stoppedAt: null, files: [], renumbered: null }
  } catch (err) {
    // NO ANSWER IS NOT A CONFLICT (wave 13u, item 55). Until 30 October 2026 a failure that was not the merge tool's own
    // was thrown again, and node exited 1, the code of a conflict. Every failure now gives no answer, with its sentence.
    return { clean: null, ...at, skipped: null, stoppedAt: null, files: null, renumbered: null, why: said(err) }
  }
}

if (process.argv[1] === THIS_TOOL) {
  const args = process.argv.slice(2)
  const at = (word) => (args.includes(word) ? args[args.indexOf(word) + 1] : undefined)
  const words = { repository: at('--repository'), tip: at('--tip'), main: at('--main') }
  const missing = Object.entries(words).filter(([, value]) => value === undefined || value === '').map(([name]) => `--${name}`)
  if (missing.length > 0 || args.length !== 6) {
    process.stderr.write(`trial-replay: ${missing.length > 0 ? `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing` : 'it takes --repository, --tip and --main, each once, and nothing else'}. The header of ${THIS_TOOL} says how to run it.\n`)
    process.exit(2)
  }
  const place = mkdtempSync(join(tmpdir(), 'trial-replay-'))
  // THE MERGE TOOL'S MODULES READ ITS ARGUMENTS WHEN THEY LOAD (arguments.mjs), so the trial gives them these: its own
  // name for the entry and the session, which nothing in the replay sends anywhere, a workdir inside the throwaway place,
  // and no office, because the replay asks none.
  process.argv = [process.argv[0], THIS_TOOL, '--entry', 'trial-replay', '--session', 'trial-replay', '--workdir', join(place, 'merge-tool'), '--api', '']
  // log() writes to stdout as well as to its file, so its lines go to stderr while the trial runs and stdout holds the answer.
  const answer = process.stdout.write.bind(process.stdout)
  process.stdout.write = process.stderr.write.bind(process.stderr)
  try {
    const found = await theTrial({ ...words, repository: resolve(words.repository) }, place)
    answer(`${JSON.stringify(found)}\n`)
    process.exitCode = found.clean === true ? 0 : found.clean === false ? 1 : 2
  } finally {
    rmSync(place, { recursive: true, force: true })
  }
}
