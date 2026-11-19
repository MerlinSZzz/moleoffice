// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE INSTALL PRESS'S TESTS SHARE: STAND-IN PROGRAMS AND A STAND-IN REGISTRY, so no real installer runs and
 * nothing reaches the network. Wave 13u, round 3.
 *
 * Two test files use this: tests/the-install-press-installs-the-ticked-tools.test.ts and
 * tests/the-install-press-in-the-browser.test.ts.
 *
 * THE STAND-IN curl prints one line of shell, `echo the installer script fetched from <address>`, in place of the
 * script it was asked to fetch, so the shell the vendor's command pipes it into runs only that echo. The stand-in
 * claude, codex, opencode, kimi and dsh print a version when asked `--version`. With `shells`, stand-in bash and sh
 * are written too, which print what they were given and whether a model key reached them, instead of running it.
 *
 * THE STAND-IN REGISTRY answers on 127.0.0.1 as the npm registry and PyPI answer for the paths
 * src/server/lib/harnesses.ts asks, with the versions in VERSIONS, and 404 for anything else: dsh's path among them.
 * It records every path it was asked for.
 */

import { chmodSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

/** The versions the stand-in programs print. */
export const INSTALLED = {
  claude: '2.1.200 (Claude Code)',
  codex: 'codex-cli 0.160.0',
  opencode: '1.18.30',
  kimi: 'kimi, version 1.50.0',
  dsh: '0.1.5-rc.2',
} as const

/** Write one stand-in program. */
function aStandIn(dir: string, name: string, body: string): void {
  const file = join(dir, name)
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, 0o755)
}

/**
 * WRITE THE STAND-INS INTO `dir`. `programs` names which agent tools get a stand-in, so a test can leave one out
 * to read as not installed.
 */
export function writeTheStandIns(dir: string, options: { programs: readonly (keyof typeof INSTALLED)[]; shells: boolean; systemd?: boolean }): void {
  aStandIn(dir, 'curl', 'for a in "$@"; do url="$a"; done\necho "echo the installer script fetched from $url"')
  if (options.shells) {
    for (const shell of ['bash', 'sh']) {
      aStandIn(dir, shell, `script=$(cat)\necho "stand-in ${shell} was given: $script"\necho "stand-in ${shell} saw the key: \${ANTHROPIC_API_KEY:-none}"`)
    }
  }
  for (const program of options.programs) aStandIn(dir, program, `echo "${INSTALLED[program]}"`)
  // A systemctl and loginctl that answer "off" to every read and refuse every change, for a page that only reads.
  if (options.systemd === true) {
    aStandIn(dir, 'systemctl', 'case "$2" in\n  show-environment) echo "HOME=$HOME" ;;\n  is-active) echo inactive; exit 3 ;;\n  is-enabled) echo disabled; exit 1 ;;\n  *) echo "The stand-in changes nothing." >&2; exit 1 ;;\nesac')
    aStandIn(dir, 'loginctl', 'echo no')
  }
}

/** The stand-in registry's answers, by the path the server asks for. */
const ANSWERS: Record<string, unknown> = {
  '/@anthropic-ai%2Fclaude-code/latest': { name: '@anthropic-ai/claude-code', version: '2.1.289' },
  '/@openai%2Fcodex/latest': { name: '@openai/codex', version: '0.160.0' },
  '/opencode-ai/latest': { name: 'opencode-ai', version: '1.18.34' },
  '/pypi/kimi-cli/json': { info: { name: 'kimi-cli', version: '1.52.0' } },
}

export interface StandInRegistry {
  /** Its address, for MOLE_OFFICE_HARNESS_REGISTRY. */
  at: string
  /** Every path it was asked for, in order. */
  asked: string[]
  close: () => Promise<void>
}

/** Start the stand-in registry on a free port of 127.0.0.1. */
export async function aStandInRegistry(): Promise<StandInRegistry> {
  const asked: string[] = []
  const server: Server = createServer((req, res) => {
    asked.push(req.url ?? '')
    const answer = ANSWERS[req.url ?? '']
    res.writeHead(answer === undefined ? 404 : 200, { 'content-type': 'application/json' })
    res.end(answer === undefined ? '{"error":"Not found"}' : JSON.stringify(answer))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return {
    at: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    asked,
    close: () => new Promise<void>((done) => server.close(() => done())),
  }
}
