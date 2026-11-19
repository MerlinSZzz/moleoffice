// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ONE COMMAND THAT MAKES THE SIGNED MAC APP, run on the owner's own Mac from a fresh clone, from wave 13t
 * round 20:
 *
 *   node scripts/build-on-a-mac.mjs
 *   node scripts/build-on-a-mac.mjs --local     signed, for this Mac only; no notarisation
 *   node scripts/build-on-a-mac.mjs --owner-content-verdict <file>     the host screen's verdict for this tree
 *
 * It checks everything it can before it builds anything: that this is an Apple silicon Mac running a Node 22
 * that loads TypeScript (22.18 or later), that Apple's command-line tools are installed, that the keychain
 * holds one Developer ID Application certificate with its private key, and that the keychain profile
 * mole-office-notary can be used. Each that fails stops it at once and says, in English and in Chinese, which
 * one and how to make it (scripts/the-mac-build.mjs). Then it installs the packages (`npm ci`), Electron's
 * runtime and Playwright's Chromium, builds the page (`npm run build`) and makes, signs, notarises and staples
 * the app, the zip and the dmg (scripts/package-mac.mjs). theBuildSteps in scripts/the-mac-build.mjs lists
 * those steps.
 *
 * With --owner-content-verdict, each package-mac run takes the host screen's verdict for the tree it packs,
 * as the three package scripts read it (scripts/the-owner-content-verdict.mjs). Without the flag the build
 * works as before.
 *
 * The dmg and the zip land in dist/mac in this checkout, and it says so at the end.
 *
 * It imports only Node's own modules and scripts/the-mac-build.mjs, which imports nothing from node_modules
 * either, because in a fresh clone there is no node_modules until `npm ci` has run.
 *
 * It never asks for, prints or stores a password or a key (scripts/the-mac-build.mjs says how).
 * docs/build-on-a-mac.zh.md is the owner's guide to it, in Chinese.
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkThisMac, configureMacBuildEnvironment, theBuildSteps, theRefusalSaid, theStepFailureSaid } from './the-mac-build.mjs'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))

/** The folder the dmg and the zip land in. */
const THE_MAC_OUTPUT = join(CHECKOUT, 'dist', 'mac')

configureMacBuildEnvironment()

const localBuild = process.argv.includes('--local')
const checked = checkThisMac({ local: localBuild })
if (checked.refused !== null) {
  process.stderr.write(theRefusalSaid(checked.refused))
  process.exit(1)
}
const verdictAt = process.argv.indexOf('--owner-content-verdict')
const verdictValue = verdictAt === -1 ? null : String(process.argv[verdictAt + 1] ?? '')
if (verdictAt !== -1 && verdictValue === '') {
  process.stderr.write('--owner-content-verdict needs a file.\n')
  process.exit(1)
}
const ownerContentVerdict = verdictValue === null ? null : resolve(verdictValue)
process.stdout.write(localBuild
  ? 'Local build: signing with the Developer ID Application certificate; skipping notarisation, stapling and Gatekeeper assessment.\n'
  : 'Signing with the local Developer ID Application certificate, notarising with the keychain profile mole-office-notary.\n')

/**
 * @param {{ what: string, command: string, args: string[] }} one
 * @param {number} at
 * @param {{ what: string, command: string, args: string[], signsAnApp?: { en: string, zh: string } }[]} steps
 */
function step(one, at, steps) {
  const { what, command, args } = one
  process.stdout.write(`\n== ${what}: ${[command, ...args].join(' ')}\n`)
  const ran = spawnSync(command, args, { cwd: CHECKOUT, stdio: 'inherit', timeout: 3 * 60 * 60_000 })
  if (ran.status !== 0) {
    const why = ran.error?.message ?? `exit ${String(ran.status)}`
    process.stderr.write(`\n${theStepFailureSaid({ what, why, steps, failed: at, out: THE_MAC_OUTPUT })}`)
    process.exit(1)
  }
}

const steps = theBuildSteps({ checkout: CHECKOUT, execPath: process.execPath, local: localBuild, out: THE_MAC_OUTPUT, ownerContentVerdict })
for (const [at, one] of steps.entries()) {
  step(one, at, steps)
}
