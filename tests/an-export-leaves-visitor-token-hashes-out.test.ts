// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Exports follow the backup rule for visitor token hashes.
 * These credentials are made by visitors.ts in a temporary database. Every archive file is
 * searched, and the archive is imported into another fresh database before the visitor pairs again.
 *
 * Mutations: export the stored hash again; refuse the removal mark in the importer's text check.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

const FACTS = { conversationPath: '/made-up/conversation', startDirectory: '/made-up/work', runtime: 'codex', sessionRecord: null }
const ASK = {
  handle: 'exported-visitor', name: 'Made-up export visitor', role: 'worker', world: null,
  machine: 'made-up-machine.example', machineHow: 'an address', facts: FACTS,
}
type CredentialRow = Record<string, unknown> & { id: string; token_hash: string }

let source: TestDb
let restored: TestDb | undefined
let archive: string
let sourceRows: CredentialRow[]
const issued: { id: string; token: string }[] = []

beforeAll(async () => {
  source = await freshDb()
  archive = mkdtempSync(join(tmpdir(), 'mole-office-export-without-visitor-hashes-'))
  const visitors = await import('../src/server/lib/visitors.ts')
  const confirmed = visitors.issueACredential(ASK)
  visitors.confirmACredential(confirmed.credential.id, { kind: 'person', id: THE_PERSON })
  issued.push({ id: confirmed.credential.id, token: confirmed.token })
  const waiting = visitors.issueACredential({ ...ASK, handle: 'exported-waiting-visitor' })
  issued.push({ id: waiting.credential.id, token: waiting.token })
  sourceRows = source.client.sqlite.prepare('SELECT * FROM visitor_credentials ORDER BY id').all() as CredentialRow[]
  expect(sourceRows).toHaveLength(2)
  for (const row of sourceRows) expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
  const { writeExport } = await import('../src/server/lib/export.ts')
  writeExport(archive)
})

afterAll(() => {
  restored?.close()
  source?.close()
  if (archive !== undefined) rmSync(archive, { recursive: true, force: true })
})

it('leaves every source visitor token hash out of every archive file', () => {
  let files = 0
  function search(folder: string): void {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) search(path)
      else {
        const bytes = readFileSync(path)
        files += 1
        for (const row of sourceRows) {
          expect(bytes.includes(row.token_hash), `${path} contains the source token hash of ${row.id}`).toBe(false)
        }
      }
    }
  }
  search(archive)
  expect(files).toBeGreaterThan(0)
  expect(source.client.sqlite.prepare('SELECT * FROM visitor_credentials ORDER BY id').all()).toEqual(sourceRows)
})

it('imports the archive into a fresh database and lets a visitor pair again', async () => {
  restored = await freshDb()
  const { applyImport } = await import('../src/server/lib/import.ts')
  const report = applyImport(archive)
  expect(report.applied).toBe(true)
  expect(report.refusals).toEqual([])
  const rows = restored.client.sqlite.prepare('SELECT * FROM visitor_credentials ORDER BY id').all()
  expect(rows).toEqual(sourceRows.map((row) => ({ ...row, token_hash: REMOVED_MARK + row.id })))

  const visitors = await import('../src/server/lib/visitors.ts')
  expect(visitors.giveAlreadyConfirmedCredentialsTheirKeysOnce()).toEqual([])
  expect(restored.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get()).toEqual({ n: 0 })
  for (const credential of issued) {
    expect(visitors.credentialForToken(credential.token)).toBeNull()
    expect(visitors.credentialById(credential.id)?.tokenRemoved).toBe(true)
    expect(() => visitors.confirmACredential(credential.id, { kind: 'person', id: THE_PERSON })).toThrow('Ask the visitor for a new credential')
  }
  const again = visitors.issueACredential(ASK)
  expect(again.credential.tokenRemoved).toBe(false)
  expect(visitors.confirmACredential(again.credential.id, { kind: 'person', id: THE_PERSON }).standing).toBe('trusted')
  expect(visitors.credentialForToken(again.token)?.id).toBe(again.credential.id)
})
