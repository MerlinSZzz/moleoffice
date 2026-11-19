// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FULLEST PROJECT IS NOT JUDGED BY ITS FLOW RUNS. Wave 13p round 26.
 *
 * readWorkspaces (src/server/lib/workspaces.ts) counts each project's records, and the app opens the fullest project
 * when nobody chose one. The office files a flow run beside every run, so counting flow runs counts each run twice. A
 * project of three runs would hold six records and outweigh a project of four notes. Every record here is synthetic.
 *
 * MUTATION (wave 13p round 26), run once and put back: readWorkspaces counts every kind again (the kind filter taken
 * out of its where clause). The case goes red: the runs' project counts 6 and is the fullest.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { FLOW_RUN_KIND } from '../src/shared/flow-run.ts'

let t: TestDb
const THE_OFFICE = { type: 'agent' as const, id: 'synthetic-filer' }

beforeAll(async () => {
  t = await freshDb()
})
afterAll(() => t?.close())

describe('readWorkspaces leaves flow runs out of the count', () => {
  it('counts three runs as three records, not six, so four notes elsewhere make the fuller project', async () => {
    const { createWorkspace, readWorkspaces } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'synthetic-runs', title: 'Synthetic runs' })
    createWorkspace({ id: 'synthetic-notes', title: 'Synthetic notes' })
    for (let n = 1; n <= 3; n += 1) {
      t.api.createRecord({ kind: 'session', title: `Synthetic run ${String(n)}`, workspaceId: 'synthetic-runs', actor: THE_OFFICE, data: { state: 'running' } })
    }
    for (let n = 1; n <= 4; n += 1) {
      t.api.createRecord({ kind: 'note', title: `Synthetic note ${String(n)}`, workspaceId: 'synthetic-notes', actor: THE_OFFICE, data: {} })
    }
    const flowRuns = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = ? AND workspace_id = 'synthetic-runs'").get(FLOW_RUN_KIND) as { n: number }
    expect(flowRuns.n, 'the office filed no flow run beside the runs, so this case proves nothing').toBe(3)

    const read = readWorkspaces()
    expect(read.find((one) => one.id === 'synthetic-runs')?.records, 'flow runs were counted').toBe(3)
    expect(read.find((one) => one.id === 'synthetic-notes')?.records).toBe(4)
  })
})
