// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK TOOL USES THE DATABASE PATH IT IS HANDED TO FIND THE KEY, AND PASSES IT TO NOTHING IT STARTS.
 *
 * The message worker hands the check tool `MOLE_OFFICE_DB`, the absolute path of the database it serves
 * (`envFor`, src/worker/runtimes/adapter.ts; tests/the-check-tool-is-handed-the-database-it-serves.test.ts).
 * tools/the-inspector.mjs needs it only to find the office's key beside that database. Everything the
 * tool starts inherits its environment, and the model it starts on the host is an agent. So the tool
 * keeps the value for the key and takes the variable out of its own environment before it starts anything.
 *
 * What each case guards:
 *   - the tool leaves `MOLE_OFFICE_DB` in its environment       → the first case is red.
 *   - the tool reads the key without the database it was handed → the second case is red.
 *
 * THE STAND-INS ARE LABELLED. The office is tests/inspector-tool-fixture.ts, a labelled stand-in; the
 * `claude` on PATH is a stand-in written here that runs no model. The key is a made-up value this test
 * writes into its own folder. Nothing reaches the live office.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

const A_MADE_UP_KEY = 'a-key-this-test-made-up-and-no-office-holds'

async function aCheckHandedADatabase() {
  const office = await inspectorFixture()
  // A WORLD'S DATABASE FOLDER, made by this test inside the fixture's own folder: the key file beside
  // a database path. The database itself is never opened by the tool, so it is not made.
  const world = join(office.home, 'a-world')
  mkdirSync(world, { recursive: true })
  writeFileSync(join(world, 'keys.json'), JSON.stringify({ office: A_MADE_UP_KEY }))
  const bin = join(office.home, 'bin')
  mkdirSync(bin, { recursive: true })
  const seen = join(office.home, 'what-the-model-saw')
  const answer = JSON.stringify({ result: JSON.stringify({ verdict: 'released', check: 'Read the diff and the report. Nothing is missing.', chaptersRead: [] }) })
  writeFileSync(
    join(bin, 'claude'),
    `#!/bin/sh\n# A STAND-IN FOR claude, written by a test. It runs no model. It writes down whether it was given a database path.\n` +
      `printf 'DB<%s>' "\${MOLE_OFFICE_DB-none}" > '${seen}'\ncat >/dev/null\nprintf '%s' '${answer}'\n`,
  )
  chmodSync(join(bin, 'claude'), 0o755)
  const ran = await office.inspect(['--check', aMadeUpCheckSession()], { PATH: `${bin}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_DB: join(world, 'world.db') }, true)
  return { office, ran, seen }
}

describe('the check tool and the database path it is handed', () => {
  it('starts its model with no MOLE_OFFICE_DB', async () => {
    const { office, ran, seen } = await aCheckHandedADatabase()
    try {
      expect(ran.code, ran.err).toBe(0)
      expect(readFileSync(seen, 'utf8')).toBe('DB<none>')
    } finally {
      await office.close()
    }
  }, 60_000)

  it('sends the key it finds beside that database on every request', async () => {
    const { office, ran } = await aCheckHandedADatabase()
    try {
      expect(ran.code, ran.err).toBe(0)
      expect(office.state.keysSent.length).toBeGreaterThan(0)
      // COMPARED AS A BOOLEAN, so a failure prints no key.
      expect(office.state.keysSent.every((sent) => sent === A_MADE_UP_KEY)).toBe(true)
    } finally {
      await office.close()
    }
  }, 60_000)
})
