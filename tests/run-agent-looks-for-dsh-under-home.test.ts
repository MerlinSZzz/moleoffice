// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * run-agent.sh LOOKS FOR dsh UNDER HOME WHEN IT IS NOT TOLD WHERE dsh IS, AND A SANDBOX MUST TELL IT.
 *
 * Its fallback used to be one person's home folder, written out. It is now `$HOME/.cache/mole-office/dsh`, which is
 * the same folder wherever HOME is that person's home. A process that runs it with any other HOME, a service among
 * them, must set MOLE_OFFICE_DSH_DIR. In a sandbox the launcher sets it to the instance's dsh, and without it the
 * script refuses before it chooses anything. The tool maintainer, whose launcher file this is, asked for a case for each of the
 * three ways.
 *
 * ONLY THOSE LINES ARE RUN, NEVER THE SCRIPT. With a wrong fallback, a whole run would read the dsh install and
 * settings of the machine the test runs on, and start its dsh. So this runs the script's sandbox refusal and its one
 * `D=` line in bash, with HOME set to a folder that is never made, and reads back the folder the lines chose.
 *
 * MUTATION PROOF: the fallback written out as a fixed home folder again, and the first case goes red; the refusal's
 * `exit 2` taken out, and the third case goes red.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const RUN_AGENT = join(REPO, 'tools', 'dsh-hooks', 'run-agent.sh')
const A_HOME = join(REPO, '.cache', 'a-home-that-is-never-made')
const A_SANDBOX = join(REPO, '.cache', 'a-sandbox-that-is-never-made')

/** The script's lines that choose the dsh folder, as written there: the sandbox refusal and the one `D=` line. */
function theLinesThatChoose(): string {
  const lines = readFileSync(RUN_AGENT, 'utf8').split('\n')
  const start = lines.findIndex((line) => line.startsWith('if [ -z "${MOLE_OFFICE_DSH_DIR:-}" ]'))
  expect(start, 'run-agent.sh refuses a sandbox with no MOLE_OFFICE_DSH_DIR in an if of its own').toBeGreaterThanOrEqual(0)
  const chosen = lines.filter((line) => line.startsWith('D='))
  expect(chosen, 'run-agent.sh chooses its dsh folder in one line').toHaveLength(1)
  return [...lines.slice(start, lines.indexOf('fi', start) + 1), chosen[0]!].join('\n')
}

/** What those lines do in `env`, run alone in bash: their exit, the folder they chose, and what they said. */
function whatTheLinesDo(env: NodeJS.ProcessEnv): { status: number | null; folder: string; said: string } {
  const ran = spawnSync('bash', ['-c', `${theLinesThatChoose()}\nprintf '%s' "$D"`], { env: { PATH: process.env['PATH'] ?? '', ...env }, encoding: 'utf8' })
  return { status: ran.status, folder: ran.stdout, said: ran.stderr }
}

describe("run-agent.sh's dsh folder", () => {
  it('is .cache/mole-office/dsh under HOME when MOLE_OFFICE_DSH_DIR is not set', () => {
    const done = whatTheLinesDo({ HOME: A_HOME })
    expect(done.status, done.said).toBe(0)
    expect(done.folder).toBe(`${A_HOME}/.cache/mole-office/dsh`)
  })

  it('is the folder MOLE_OFFICE_DSH_DIR names when it is set, in a sandbox as well', () => {
    const named = join(REPO, '.cache', 'a-dsh-folder-that-is-never-made')
    const done = whatTheLinesDo({ HOME: A_HOME, SANDBOX_DIR: A_SANDBOX, MOLE_OFFICE_DSH_DIR: named })
    expect(done.status, done.said).toBe(0)
    expect(done.folder).toBe(named)
  })

  it('is refused in a sandbox when MOLE_OFFICE_DSH_DIR is not set, before any folder is chosen', () => {
    const done = whatTheLinesDo({ HOME: A_HOME, SANDBOX_DIR: A_SANDBOX })
    expect(done.status).toBe(2)
    expect(done.folder).toBe('')
    expect(done.said).toContain('MOLE_OFFICE_DSH_DIR is not set')
    expect(done.said).toContain('Nothing was started.')
  })
})
