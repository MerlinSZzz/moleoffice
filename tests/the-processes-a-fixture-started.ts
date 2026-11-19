// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST'S FOLDER GOES ONLY AFTER EVERY PROCESS THAT LOADED ITS FIXTURE HAS ENDED (wave 13s round 113, problem
 * R5kTJe89yPw7; round 116, problem gI0Ria0qJL-y).
 *
 * A test that starts the sandbox launcher loads a fixture module into every Node process through NODE_OPTIONS. The
 * launcher's background helper is one of them, and it still writes finish.log in the run's log folder after the write the
 * test waits for. A clean-up that removes the folder as soon as the cases end then races that line, and rmSync fails with
 * ENOTEMPTY after every case has passed. So the fixture runs `NAME_THE_PROCESS_THAT_LOADS_THIS`, and the clean-up waits
 * for each process it named.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The lines a fixture runs to write the pid of the process that loads it into `processes` in its folder. The fixture
 * names its folder `root` and imports `appendFileSync` and `join`.
 */
export const NAME_THE_PROCESS_THAT_LOADS_THIS = `// Every process that loads this file is named here, so the test can wait for each one to end before it removes the folder.
appendFileSync(join(root, 'processes'), process.pid + '\\n')`

/** Whether a process the fixture named still runs: its /proc entry is there, and it is not a zombie waiting to be reaped. */
function stillRuns(pid: number) {
  let stat: string
  try {
    stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
  } catch (error) {
    if (['ENOENT', 'ESRCH'].includes(String((error as NodeJS.ErrnoException).code))) return false
    throw error
  }
  return stat[stat.lastIndexOf(')') + 2] !== 'Z'
}

function theCommandOf(pid: number) {
  try {
    return readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').join(' ').trim()
  } catch {
    return '(its command line could not be read)'
  }
}

/**
 * Wait up to ten seconds until no process the fixture named in `root` runs, then remove `root`. A process still running
 * then is named in the error, and the folder is kept.
 */
export async function removeTheFolderOnceItsProcessesHaveEnded(root: string) {
  const named = join(root, 'processes')
  const started = existsSync(named) ? readFileSync(named, 'utf8').trim().split('\n').map(Number) : []
  const end = Date.now() + 10_000
  while (started.some(stillRuns) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20))
  const left = started.filter(stillRuns)
  if (left.length > 0) {
    throw new Error(`Ten seconds after the cases, processes this test started still run, so ${root} is kept: ${left.map(pid => `${String(pid)} ${theCommandOf(pid)}`).join('; ')}`)
  }
  rmSync(root, { recursive: true, force: true })
}
