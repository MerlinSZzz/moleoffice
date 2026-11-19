// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTORE KEEPS WHICH KIND OF MACHINE A VISITOR'S REQUEST CAME FROM, INCLUDING WHEN NOBODY COULD TELL.
 *
 * `visitor_requests.fromATrustedMachine` has three answers: 1, a machine this office trusts; 0, one it does not;
 * and null, nobody being able to tell, which is every request on the loopback door. A backup that lost the null
 * would turn "nobody could tell" into "a machine the office does not trust". A backup that lost the 1 or the 0
 * would lose the very fact the Embassy's supervision is counted from.
 *
 * The export writes a boolean-mode column as a JSON boolean, true or false, and keeps null as null. The column was
 * left off BOOLEAN_COLUMNS in src/server/lib/export.ts because the boolean reader once refused a null; that reader
 * keeps one now, so the column is on the list. This file proves the three answers by running them: a made-up office
 * holds three requests under one credential, exports them, imports the archive into a fresh made-up office, and
 * reads each answer back from the table.
 *
 * CONTROL AND MUTATION. On the code as this run was cut, the column is off the list, so the export writes the
 * stored 1 and 0 and the import refuses the archive: the control is red at that refusal. Once the column is on the
 * list the file is green. The mutation is the reverse: take `fromATrustedMachine` off the visitor_requests entry of
 * BOOLEAN_COLUMNS again, and the archive writes 1 and 0 and the import refuses it, so the file is red again.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

/** The made-up requests, told apart by their route. */
const ROUTES = {
  trusted: '/api/made-up/from-a-trusted-machine',
  untrusted: '/api/made-up/from-an-unknown-machine',
  unknown: '/api/made-up/from-no-machine-known',
} as const

let source: TestDb
let target: TestDb
let archive: string
let importLib: ImportLib
let requestIds: Record<keyof typeof ROUTES, string>

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else out.push(full)
  }
  return out
}

/** Every line of the archive that names the request column, across its files. */
function fromATrustedMachineLines(dir: string): string[] {
  const out: string[] = []
  for (const file of filesUnder(dir)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.startsWith('fromATrustedMachine: ')) out.push(line)
    }
  }
  return out
}

function requestAnswer(t: TestDb, id: string): number | null {
  const row = t.client.sqlite.prepare('SELECT from_a_trusted_machine FROM visitor_requests WHERE id = ?').get(id) as
    | { from_a_trusted_machine: number | null }
    | undefined
  if (row === undefined) throw new Error(`the request ${id} is not stored`)
  return row.from_a_trusted_machine
}

beforeAll(async () => {
  archive = mkdtempSync(join(tmpdir(), 'mole-office-archive-which-machine-'))

  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  const visitors = await import('../src/server/lib/visitors.ts')
  const issued = visitors.issueACredential({
    handle: 'made-up-visitor',
    name: 'A made-up visitor',
    role: 'worker',
    world: null,
    machine: 'a-made-up-machine.example',
    machineHow: 'an address',
    facts: {
      conversationPath: '/transcripts/made-up/4f10',
      startDirectory: '/work/made-up',
      runtime: 'opencode',
      sessionRecord: null,
    },
  })
  const ask = (fromATrustedMachine: boolean | null, route: string): void => {
    visitors.recordARequestUnder(issued.credential.id, {
      method: 'GET',
      route,
      operation: 'agent.runs',
      wrote: false,
      refusedBecause: null,
      mismatch: [],
      fromATrustedMachine,
    })
  }
  ask(true, ROUTES.trusted)
  ask(false, ROUTES.untrusted)
  ask(null, ROUTES.unknown)

  const idOf = (route: string): string => {
    const row = source.client.sqlite.prepare('SELECT id FROM visitor_requests WHERE route = ?').get(route) as { id: string } | undefined
    if (row === undefined) throw new Error(`the request ${route} was not written`)
    return row.id
  }
  requestIds = { trusted: idOf(ROUTES.trusted), untrusted: idOf(ROUTES.untrusted), unknown: idOf(ROUTES.unknown) }

  exportLib.writeExport(archive)

  target = await freshDb()
  importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  const plan = importLib.planImport(archive)
  if (!plan.ok) {
    throw new Error(`the archive did not import: ${plan.refusals.map((r) => `${r.path}:${String(r.line)} ${r.problem}`).join(' | ')}`)
  }
  importLib.applyImport(archive)
}, 60_000)

afterAll(() => {
  rmSync(archive, { recursive: true, force: true })
  target?.close()
  source?.close()
})

describe('a visitor request, whose machine answer has three values', () => {
  it('is written as true, false and null, and the office holds 1, 0 and null', () => {
    expect(fromATrustedMachineLines(archive).sort()).toEqual(['fromATrustedMachine: false', 'fromATrustedMachine: null', 'fromATrustedMachine: true'])
    expect([requestAnswer(source, requestIds.trusted), requestAnswer(source, requestIds.untrusted), requestAnswer(source, requestIds.unknown)]).toEqual([1, 0, null])
  })

  it('reads the three answers back unchanged after the restore: 1, 0 and null', () => {
    expect(requestAnswer(target, requestIds.trusted)).toBe(1)
    expect(requestAnswer(target, requestIds.untrusted)).toBe(0)
    expect(requestAnswer(target, requestIds.unknown)).toBeNull()
  })
})
