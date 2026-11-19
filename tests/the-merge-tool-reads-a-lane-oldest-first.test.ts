// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL READS A LANE OLDEST FIRST, in the order the office lists it, which is the order the entries were written.
 *
 * theLane (tools/merge-tool/office-keeper.mjs) puts the entries moved to the front first, and keeps the office's order for
 * the rest. The bus (aBusFor in tools/merge-tool/pairs.mjs) boards riders in that order and passes entries over for a
 * check in that order. The office lists a lane in the order its entries were written: theEntriesOf in
 * src/server/lib/merge-queue.ts reads the place of each entry's create row in the change log.
 *
 * UNTIL WAVE 13U ROUND 84 the tool sorted the lane again by submittedAt, the time of writing in words with no offset, and
 * this file proved that sort with a shuffled answer. On the night the clocks go back, an entry submitted at 01:10 winter
 * time is written twenty minutes after one submitted at 01:50 summer time, and its words sort first, so that sort put
 * the later entry first. Here a stand-in office answers a lane in the order written, whose words are out of order in
 * that hour, with two entries submitted in the same second.
 *
 * office-keeper.mjs reads the merge tool's arguments when it is loaded, so it is loaded in a child process of its own,
 * with a throwaway workdir and database path. Every entry here is synthetic. MUTATION PROOF: in src/shared/merge-queue.ts,
 * `inTheLanesOrder`, compare submittedAt again for the entries not moved to the front; the tool then puts synthetic-b
 * before synthetic-a, and the case goes red.
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const KEEPER = pathToFileURL(join(REPO, 'tools', 'merge-tool', 'office-keeper.mjs')).href
const ROOT = '/synthetic/lane-root'

/**
 * The lane as the stand-in office answers it, in the order written, on 25 October 2026 in Europe/London: synthetic-a at
 * 01:50 summer time, synthetic-b twenty minutes later at 01:10 winter time, c-first and c-second in the same second, then d.
 */
const AS_WRITTEN = [
  { id: 'synthetic-a', submittedAt: '2026-10-25 01:50:00' },
  { id: 'synthetic-b', submittedAt: '2026-10-25 01:10:00' },
  { id: 'synthetic-c-first', submittedAt: '2026-10-25 01:30:00' },
  { id: 'synthetic-c-second', submittedAt: '2026-10-25 01:30:00' },
  { id: 'synthetic-d', submittedAt: '2026-10-25 01:40:00' },
]

let office: Server
let api: string
let scratch: string
const asked: string[] = []

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'the-merge-tool-reads-a-lane-'))
  office = createServer((req, res) => {
    asked.push(`${req.method ?? ''} ${req.url ?? ''}`)
    res.writeHead(200, { 'content-type': 'application/json' })
    // ANOTHER LANE IN THE SAME ANSWER, which theLane must leave out.
    res.end(JSON.stringify({ lanes: [{ lane: '/synthetic/another-root', entries: [{ id: 'synthetic-other', submittedAt: '2026-10-25 00:30:00' }] }, { lane: ROOT, entries: AS_WRITTEN }] }))
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => office.close(() => resolve()))
  rmSync(scratch, { recursive: true, force: true })
})

/** The ids theLane answers for ROOT, read in a child process loaded with the merge tool's arguments. */
function theLaneAsTheToolReadsIt(): Promise<string[]> {
  // A SCRIPT FILE AND NOT `node -e`, so the arguments start at process.argv[2], where tools/merge-tool/arguments.mjs reads them.
  const script = join(scratch, 'read-the-lane.mjs')
  writeFileSync(script, `const { theLane } = await import(${JSON.stringify(KEEPER)})\nprocess.stdout.write(JSON.stringify((await theLane(${JSON.stringify(ROOT)})).map((one) => one.id)))\n`)
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [script, '--entry', 'synthetic-entry', '--session', 'synthetic-session', '--api', api, '--workspace', 'default', '--workdir', join(scratch, 'work')],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: join(scratch, 'no-office.db') }, timeout: 60_000 },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve(JSON.parse(stdout) as string[])),
    )
  })
}

describe("the merge tool's reading of a lane", () => {
  it('keeps the order the office lists the entries in, whatever their times in words, and leaves other lanes out', async () => {
    expect(await theLaneAsTheToolReadsIt()).toEqual(['synthetic-a', 'synthetic-b', 'synthetic-c-first', 'synthetic-c-second', 'synthetic-d'])
    // THE NARROW ANSWER (wave 13u round 123): the tool asks only for the fields it reads, and the lane's order is the same.
    expect(asked).toEqual([`GET /api/merge-queue?lane=${encodeURIComponent(ROOT)}&shape=narrow`])
  }, 90_000)
})
