// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER TEST'S SERVERS ARE WRITTEN INTO ITS OWN LEDGER, OR THE TEST FAILS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT, AND WHAT IT COST NOT TO HAVE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G5 of design/ground/ACCEPTANCE.md asks that a browser test's servers are registered in
 * the test's own ledger. Until this file existed, `liveApp` filed its session record as the agent
 * `vitest/liveApp`, no registry row held that id, and the id was not declared in
 * `AGENT_IDS_THAT_NEED_NO_REGISTRATION` in src/server/lib/records.ts — so the test's own office
 * refused every write with a 403. `registerThisTestsServers` caught the refusal and warned. Every
 * one of the browser test files that ran printed the warning and passed, so no browser test's
 * servers were on any list and nothing failed over it. Problem `sbGiR3RgDK3A`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * One browser test is started through `liveApp`. Then:
 *
 *   - the session record that `registerThisTestsServers` filed is in the test's own database and
 *     its change log says the agent `vitest/liveApp` filed it;
 *   - the API server and the browser app this stack started are both rows in the test's own
 *     resources ledger, read back through `GET /api/resources`.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL green. MUTATION: `vitest/liveApp` is taken out of `AGENT_IDS_THAT_NEED_NO_REGISTRATION`.
 * The session write is then refused with a 403, `registerThisTestsServers` throws with the office's
 * answer, `liveApp` never returns, and this file goes red before its first assertion. RESTORE green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'

/** The name this test gives its stack, which is also the name in the session record's title. */
const THE_TEST_NAME = 'a browser test files its own servers'

/** The agent id a browser test's session record is filed under. */
const THE_BROWSER_TEST_HARNESS = 'vitest/liveApp'

const AS_THIS_WORKSPACE = { 'x-mole-office-workspace': 'default' }

interface SessionRow {
  id: string
  title: string
}

interface StoredSession {
  record: { data?: { runtime?: string } }
  changes: { actorId: string }[]
}

interface LedgerRow {
  type: string
  key: string
  sessionRecordId: string
  world: { port: number | null } | null
}

describe('a browser test files its servers in its own ledger', () => {
  let stack: LiveApp

  beforeAll(async () => {
    stack = await liveApp({ name: THE_TEST_NAME, viewport: { width: 990, height: 700 } })
  }, 180_000)

  afterAll(async () => {
    await stack?.stop()
  })

  it('files the session as vitest/liveApp, and the API and the browser app under it', async () => {
    // THE SESSION RECORD. Every browser test's stack has its own database, so the only session
    // titled after this test is the one this run filed.
    const listed = await fetch(`${stack.api}/api/records?kind=session`, { headers: AS_THIS_WORKSPACE })
    const listedBody = await listed.text()
    expect(listed.status, listedBody).toBe(200)
    const { records } = JSON.parse(listedBody) as { records: SessionRow[] }
    const filed = records.find((one) => one.title === `liveApp — ${THE_TEST_NAME}`)
    expect(filed, 'no session record was filed for this browser test').toBeDefined()
    const sessionRecordId = filed?.id ?? ''

    // WHO FILED IT. The create change names the agent, and the record says this was a vitest run.
    const readBack = await fetch(`${stack.api}/api/records/${sessionRecordId}`, { headers: AS_THIS_WORKSPACE })
    const readBackBody = await readBack.text()
    expect(readBack.status, readBackBody).toBe(200)
    const stored = JSON.parse(readBackBody) as StoredSession
    expect(stored.record.data?.runtime, 'the session record does not say it is a vitest run').toBe('vitest')
    expect(
      stored.changes.map((one) => one.actorId),
      'the session record was not filed as vitest/liveApp',
    ).toContain(THE_BROWSER_TEST_HARNESS)

    // THE SERVERS, THROUGH THE RESOURCES DOOR.
    const ledger = await fetch(`${stack.api}/api/resources`, { headers: AS_THIS_WORKSPACE })
    const ledgerBody = await ledger.text()
    expect(ledger.status, ledgerBody).toBe(200)
    const { resources } = JSON.parse(ledgerBody) as { resources: LedgerRow[] }

    const apiServer = resources.find((one) => one.type === 'process' && one.world?.port === stack.apiPort)
    expect(apiServer, 'the API server this test started is not in its own ledger').toBeDefined()

    const browserApp = resources.find((one) => one.type === 'process' && one.key === String(process.pid))
    expect(browserApp, 'the browser app serving this test is not in its own ledger').toBeDefined()
    expect(
      browserApp?.sessionRecordId,
      'the browser app is not owned by the session filed for this test',
    ).toBe(sessionRecordId)
  })
})
