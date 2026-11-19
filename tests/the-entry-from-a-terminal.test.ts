// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SAME ENTRY FROM A TERMINAL, FOR A MACHINE WITH NO BROWSER.
 *
 * F15 point 1; `tools/install-the-entry.mjs`. The press is the ordinary way and this is the named
 * exception to chapter 10 rule 4: a machine with no browser cannot press anything.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The tool writes the same two things the press writes, into a scratch HOME.
 *   2. A second run changes nothing and says so.
 *   3. A settings file that does not parse is refused with nothing written, and a non-zero exit.
 *   5. It refuses a linked git worktree the way a world is refused, names the worktree, and writes
 *      nothing. The linked worktree is made here — a directory whose `.git` is a file — so the case
 *      does not depend on the shape of the checkout this suite runs in. The write cases pass
 *      `--checkout` at a scratch ordinary checkout, whose `.git` is a directory, and the same merge
 *      is then driven through the same tool.
 *   6. It refuses a folder with no `.git` at all, names it, and writes nothing. That is problem
 *      `hlNgNPM9hGTh`: this tool was run inside an unpacked `git archive` of HEAD with the real
 *      `HOME`, and put a pair of hook lines into the owner's own `~/.claude/settings.json` running
 *      a session hook in a folder that was about to be deleted.
 *
 * Every run of the tool is given `HOME` pointed at a scratch directory, so the owner's own
 * `~/.claude` is never touched.
 */

import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(CHECKOUT, 'tools', 'install-the-entry.mjs')
const SHARED = join(CHECKOUT, 'src', 'config', 'install-the-entry.mjs')

const PIXEL_AGENTS = {
  matcher: '',
  hooks: [{ type: 'command', command: `node "${THE_TEST_FIXTURE_ROOT}/.pixel-agents/hooks/claude-hook.js"`, timeout: 5 }],
}

const START_SETTINGS = { hooks: { SessionStart: [PIXEL_AGENTS], SessionEnd: [PIXEL_AGENTS] }, model: 'opus' }

const homes: string[] = []
const checkouts: string[] = []

function aScratchHomeWith(settings: unknown): string {
  const home = mkdtempSync(join(tmpdir(), 'mole-office-entry-cli-'))
  homes.push(home)
  const claude = join(home, '.claude')
  mkdirSync(claude, { recursive: true })
  writeFileSync(join(claude, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  return home
}

/**
 * A SCRATCH ORDINARY CHECKOUT, for `--checkout`.
 *
 * This suite runs inside a linked git worktree, and the tool refuses to link a worktree (the
 * checkout is deleted when the work is done, so the link would leave every session with no skill).
 * `--checkout` points the tool at a scratch checkout whose `.git` is a directory, which is the
 * shape an ordinary clone has, so the same merge can be driven through the same tool.
 */
function aScratchCheckout(): string {
  const checkout = mkdtempSync(join(tmpdir(), 'mole-office-entry-cli-checkout-'))
  checkouts.push(checkout)
  mkdirSync(join(checkout, '.git'))
  mkdirSync(join(checkout, '.claude', 'skills', 'mole-office'), { recursive: true })
  writeFileSync(join(checkout, '.claude', 'skills', 'mole-office', 'SKILL.md'), '# a skill\n', 'utf8')
  mkdirSync(join(checkout, 'tools'), { recursive: true })
  writeFileSync(join(checkout, 'tools', 'session-hook.mjs'), '// the hook\n', 'utf8')
  return checkout
}

/**
 * A SCRATCH LINKED GIT WORKTREE, which is a directory whose `.git` is a FILE rather than a
 * directory. That difference is the whole of `installTheEntry`'s worktree refusal, so the case can
 * make the shape it is about instead of hoping the suite's own checkout has it.
 */
function aScratchLinkedWorktree(): string {
  const worktree = mkdtempSync(join(tmpdir(), 'mole-office-entry-cli-worktree-'))
  checkouts.push(worktree)
  writeFileSync(join(worktree, '.git'), 'gitdir: /somewhere/.git/worktrees/a-test\n', 'utf8')
  return worktree
}

/**
 * A SCRATCH COPY THAT GIT KEEPS NOTHING OF: everything an unpacked `git archive` of HEAD carries,
 * which is everything but `.git`. That is the shape of the folders problem `hlNgNPM9hGTh` is about.
 */
function aScratchCopyWithNoGit(): string {
  const copy = mkdtempSync(join(tmpdir(), 'mole-office-entry-cli-copy-'))
  checkouts.push(copy)
  mkdirSync(join(copy, '.claude', 'skills', 'mole-office'), { recursive: true })
  writeFileSync(join(copy, '.claude', 'skills', 'mole-office', 'SKILL.md'), '# a skill\n', 'utf8')
  mkdirSync(join(copy, 'tools'), { recursive: true })
  writeFileSync(join(copy, 'tools', 'session-hook.mjs'), '// the hook\n', 'utf8')
  return copy
}

/** Run the tool with this HOME, and hand back its exit code and what it printed. */
function run(
  home: string,
  args: readonly string[] = [],
  checkout?: string,
): { status: number | null; stdout: string; stderr: string } {
  const withCheckout = checkout === undefined ? [...args] : ['--checkout', checkout, ...args]
  const ran = spawnSync(process.execPath, [CLI, ...withCheckout], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  })
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr }
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
  for (const checkout of checkouts.splice(0)) rmSync(checkout, { recursive: true, force: true })
})

describe('the terminal tool refuses a linked git worktree', () => {
  it('names the worktree, writes nothing, and exits non-zero', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const linked = aScratchLinkedWorktree()
    const before = readFileSync(join(home, '.claude', 'settings.json'), 'utf8')
    const ran = run(home, [], linked)
    expect(ran.status).not.toBe(0)
    expect(ran.stderr).toContain('linked git worktree')
    expect(ran.stderr).toContain(linked)
    expect(ran.stderr).toContain('Nothing was written')
    expect(ran.stderr).toContain("office's own checkout")
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe(before)
    expect(existsSync(join(home, '.claude', 'skills', 'mole-office'))).toBe(false)
  })
})

describe('the terminal tool refuses a folder git keeps nothing of', () => {
  it('names the copy, writes nothing, and exits non-zero', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const copy = aScratchCopyWithNoGit()
    const before = readFileSync(join(home, '.claude', 'settings.json'), 'utf8')
    const ran = run(home, [], copy)
    expect(ran.status).not.toBe(0)
    expect(ran.stderr).toContain('not a checkout git keeps')
    expect(ran.stderr).toContain(copy)
    expect(ran.stderr).toContain('Nothing was written')
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe(before)
    expect(existsSync(join(home, '.claude', 'skills', 'mole-office'))).toBe(false)
  })
})

describe('the terminal tool writes the entry the press writes', () => {
  it('merges the three hook lines and makes the skill link, with HOME in a scratch directory', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const checkout = aScratchCheckout()
    const ran = run(home, [], checkout)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(join(home, '.claude', 'settings.json'))

    const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { SessionStart: unknown[]; Stop?: unknown[]; SessionEnd: unknown[] }
      model: string
    }
    expect(settings.hooks.SessionStart.length).toBe(2)
    expect(settings.hooks.Stop?.length, 'the terminal tool left Stop unwired').toBe(1)
    expect(settings.hooks.SessionEnd.length).toBe(2)
    expect(settings.hooks.SessionStart[0]).toEqual(PIXEL_AGENTS)
    expect(settings.hooks.SessionEnd[0]).toEqual(PIXEL_AGENTS)
    expect(settings.model, 'the tool rebuilt the file instead of merging').toBe('opus')

    expect(lstatSync(join(home, '.claude', 'skills', 'mole-office')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(home, '.claude', 'skills', 'mole-office'))).toBe(join(checkout, '.claude', 'skills', 'mole-office'))
    expect(existsSync(join(home, '.claude', 'settings.json.mole-office-backup'))).toBe(true)
  })

  it('changes nothing on the second run, and says so', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const checkout = aScratchCheckout()
    expect(run(home, [], checkout).status).toBe(0)
    const afterFirst = readFileSync(join(home, '.claude', 'settings.json'), 'utf8')
    const again = run(home, [], checkout)
    expect(again.status, again.stderr).toBe(0)
    expect(again.stdout.toLowerCase()).toContain('nothing was written')
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe(afterFirst)
  })

  it('refuses a settings file that does not parse, writes nothing, and exits non-zero', () => {
    const home = mkdtempSync(join(tmpdir(), 'mole-office-entry-cli-'))
    homes.push(home)
    mkdirSync(join(home, '.claude'), { recursive: true })
    const settingsPath = join(home, '.claude', 'settings.json')
    writeFileSync(settingsPath, '{ "hooks": ', 'utf8')
    const checkout = aScratchCheckout()
    const ran = run(home, [], checkout)
    expect(ran.status).not.toBe(0)
    expect(ran.stderr).toContain(settingsPath)
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ "hooks": ')
  })
})

describe('--other-runtimes, from the same terminal tool', () => {
  it('writes Codex\'s global AGENTS.md when its directory is there, and calls the shared function', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const checkout = aScratchCheckout()
    mkdirSync(join(home, '.codex'), { recursive: true })
    const ran = run(home, ['--other-runtimes', 'codex'], checkout)
    expect(ran.status, ran.stderr).toBe(0)
    const written = readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf8')
    expect(written).toContain('<!-- mole-office:start -->')
    expect(written).toContain('Mole Office')

    const source = readFileSync(CLI, 'utf8')
    expect(source).toContain('applyOtherRuntimeEntry')
    expect(readFileSync(SHARED, 'utf8')).toContain('export async function applyOtherRuntimeEntry')
  })

  it('refuses and writes nothing when the named runtime has never run here', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const checkout = aScratchCheckout()
    const ran = run(home, ['--other-runtimes', 'codex'], checkout)
    expect(ran.status).not.toBe(0)
    expect(ran.stderr).toContain(join(home, '.codex'))
    expect(existsSync(join(home, '.codex'))).toBe(false)
  })

  it('refuses a word that is not codex or opencode, and writes nothing', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const checkout = aScratchCheckout()
    const ran = run(home, ['--other-runtimes', 'claude-code'], checkout)
    expect(ran.status).not.toBe(0)
    expect(ran.stderr).toContain('claude-code')
  })

  it('is not reached at all when the flag is absent, so the ordinary run is unchanged', () => {
    const home = aScratchHomeWith(START_SETTINGS)
    const checkout = aScratchCheckout()
    const ran = run(home, [], checkout)
    expect(ran.status, ran.stderr).toBe(0)
    expect(existsSync(join(home, '.codex'))).toBe(false)
  })
})
