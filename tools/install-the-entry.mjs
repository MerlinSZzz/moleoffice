#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUT THE MOLE OFFICE ENTRY IN PLACE FROM A TERMINAL, ON A MACHINE WITH NO BROWSER.
 *
 *     node tools/install-the-entry.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS AN EXCEPTION TO CHAPTER 10 RULE 4
 * ---------------------------------------------------------------------------------------------
 *
 * Chapter 10 rule 4 says nothing a person must do is a command in a terminal: every act that is
 * the person's is a press inside Mole Office, and a command in a terminal is never asked of the person.
 * This file is the one named exception, and the reason is narrow and real: A MACHINE WITH NO
 * BROWSER CANNOT PRESS ANYTHING. A server with no person sitting at it, a remote machine, a first
 * install before the browser app answers — none of those can open the Settings page, and refusing
 * to serve them would leave the entry un-installable exactly where the person cannot reach it.
 *
 * NOBODY IS ASKED TO RUN THIS WHEN THE PRESS IS AVAILABLE, and the code says nothing that would
 * lead anybody to it. `POST /api/office/install-the-entry` is the press, and this calls the same
 * `installTheEntry` in `src/config/install-the-entry.mjs` — the one implementation, not a second
 * copy of the merge. A copy is the defect this whole piece is about.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DOES, AND WHAT IT REFUSES
 * ---------------------------------------------------------------------------------------------
 *
 * It writes the same two things the press writes: the skill link `~/.claude/skills/mole-office`
 * into this checkout, and one entry appended to each of `hooks.SessionStart`, `hooks.Stop` and
 * `hooks.SessionEnd` in `~/.claude/settings.json`. It merges, backs the file up first, writes through a rename, and is
 * idempotent.
 *
 * IT POINTS A HOOK ONLY AT A FOLDER GIT KEEPS AS A CHECKOUT. A linked worktree and a folder with no
 * `.git` at all — an unpacked `git archive`, a tarball, a `cp` — are both refused in words, and
 * nothing is written. Problem `hlNgNPM9hGTh`: this tool, run inside an unpacked copy of HEAD with
 * the real `HOME`, put three pairs of hook lines into the owner's own `~/.claude/settings.json`,
 * each running a session hook in a folder that was about to be deleted.
 *
 * THE HOME DIRECTORY COMES FROM THIS PROCESS'S OWN ENVIRONMENT, through `theOwnersHome()`. There
 * is no flag for it: a value from a command line is a value from a caller, and the one thing this
 * act must not be is a way to write anywhere on the disk. Set `HOME` to run it against a scratch
 * directory in a test; nobody else has a reason to.
 *
 * IT PRINTS WHAT HAPPENED AND EXITS NON-ZERO ON A REFUSAL. Nothing is written on a refusal, and the
 * sentence names the file and the reason.
 */

import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import {
  applyOtherRuntimeEntry,
  installTheEntry,
  OTHER_RUNTIMES,
  planOtherRuntimeEntry,
  theOtherRuntimeTargets,
  theOwnersHome,
} from '../src/config/install-the-entry.mjs'

/**
 * THE CHECKOUT TO LINK, which is the checkout this tool lives in unless `--checkout` names another.
 *
 * The default is the tool's own location, and that is the only checkout a real run should ever
 * link. `--checkout` exists for one thing: a test of this tool runs inside a git worktree, where
 * `installTheEntry` refuses the press (a worktree is deleted when the work is done, so a skill link
 * into it would leave every session on this machine with no skill). The test points this at a
 * scratch ordinary checkout so the same merge can be driven through the same tool, and there is no
 * reason to use it otherwise. It is not the home directory: that still comes from this process and
 * has no flag.
 */
function theCheckoutNamedOnTheCommandLine(defaultCheckout) {
  const withEquals = process.argv.find((arg) => arg.startsWith('--checkout='))
  let named = null
  if (withEquals !== undefined) {
    named = withEquals.slice('--checkout='.length)
  } else {
    const at = process.argv.indexOf('--checkout')
    if (at !== -1) named = process.argv[at + 1] ?? ''
  }
  if (named === null) return defaultCheckout
  if (named.trim() === '' || !existsSync(named) || !statSync(named).isDirectory()) {
    process.stderr.write(
      `--checkout takes the top of a checkout, and ${JSON.stringify(named)} is not a directory. ` +
        'Nothing was written.\n',
    )
    process.exit(1)
  }
  return named
}

const checkout = theCheckoutNamedOnTheCommandLine(fileURLToPath(new URL('..', import.meta.url)))

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(
    [
      'node tools/install-the-entry.mjs [--other-runtimes codex,opencode] [--checkout <path>]',
      '',
      'Puts the Mole Office entry in place for every directory: the skill link',
      '~/.claude/skills/mole-office, and one SessionStart, one Stop and one SessionEnd',
      'line in ~/.claude/settings.json. It merges, backs the file up, and changes nothing',
      'on a second run.',
      '',
      'It points a hook only at a folder git keeps as a checkout. A linked worktree and a',
      'folder with no .git at all are both refused, in words, and nothing is written.',
      '',
      '--other-runtimes also writes the named runtimes\' global instructions file (Codex\'s',
      '$CODEX_HOME/AGENTS.md, default ~/.codex; OpenCode\'s ~/.config/opencode/AGENTS.md) with a',
      'short pointer at Mole Office, the same way, refusing rather than guessing when the tool\'s',
      'own directory is not on this machine or when Codex\'s AGENTS.override.md would make the',
      'write sit unread. All named runtimes are checked before any of them is written: naming two',
      'where one would be refused writes neither.',
      '',
      'The home directory comes from this process\'s environment. There is no flag for it.',
      '',
      '--checkout names the checkout to link. The default is the checkout this tool lives in,',
      'which is the only one a real run should link; a test points it at a scratch checkout.',
      '',
      'This is for a machine with no browser. When a browser can reach Mole Office, press',
      'the button on the Settings page instead.',
      '',
    ].join('\n'),
  )
  process.exit(0)
}

const result = await installTheEntry({ home: theOwnersHome(), checkout })

if (!result.ok) {
  process.stderr.write(`${result.says}\n`)
  process.exit(1)
}

process.stdout.write(`${result.says}\n`)

const otherRuntimesFlag = process.argv.find((arg) => arg.startsWith('--other-runtimes'))
if (otherRuntimesFlag !== undefined) {
  const named = (otherRuntimesFlag.includes('=') ? otherRuntimesFlag.split('=')[1] : process.argv[process.argv.indexOf(otherRuntimesFlag) + 1]) ?? ''
  const runtimes = named.split(',').map((one) => one.trim()).filter((one) => one !== '')
  const unknown = runtimes.filter((one) => !OTHER_RUNTIMES.includes(one))
  if (runtimes.length === 0 || unknown.length > 0) {
    process.stderr.write(
      `--other-runtimes takes a comma-separated list of ${OTHER_RUNTIMES.join(' or ')}; got ${JSON.stringify(named)}. Nothing was written for the other runtimes.\n`,
    )
    process.exit(1)
  }
  const targets = theOtherRuntimeTargets(theOwnersHome())
  // ALL OR NOTHING, the same rule the API route holds itself to: plan every named runtime first.
  const plans = await Promise.all(runtimes.map(async (runtime) => ({ runtime, plan: await planOtherRuntimeEntry(targets[runtime]) })))
  const refused = plans.find(({ plan }) => !plan.ok)
  if (refused !== undefined) {
    process.stderr.write(`${refused.plan.says}\nNothing was written for any named runtime.\n`)
    process.exit(1)
  }
  for (const runtime of runtimes) {
    const written = await applyOtherRuntimeEntry(targets[runtime])
    if (!written.ok) {
      process.stderr.write(`${written.says}\n`)
      process.exit(1)
    }
    process.stdout.write(`${written.says}\n`)
  }
}
