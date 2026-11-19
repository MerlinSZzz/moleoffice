// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The upgrade tool's first office read, of the pinned evidence, names a cut answer as a cut.
 *
 * The request helper hands back 60,000 characters of an office answer unless a read asks for more, and says when it
 * cut one. The tool used to report a cut answer as "refused (200)", which names a refusal the office never made. The
 * answer here is cut by the request helper itself, from a made-up office answer longer than the cut.
 *
 * A RECEIPT LONGER THAN THE DEFAULT REPLY: a receipt's original revision has been longer than 60,000 characters, and
 * that read was cut and refused before the evidence check began. The read asks for the evidence module's own reply
 * length, and so does every evidence read through the bootstrap's transport, which hands the length on. An answer cut
 * even at that length is still refused.
 *
 * The configuration check and the upgrade are replaced, because this file is about the one read in main and the
 * transport the bootstrap reads evidence through. The configuration and the office are made up; nothing here reaches
 * a real office.
 */
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { bootstrapOfficeRequest } from '../tools/stable/stable-bootstrap-transport.mjs'
import { readReceiptEvidenceObject } from '../tools/stable/stable-upgrade-evidence.mjs'

vi.mock('../tools/stable/stable-upgrade-transaction.mjs', () => ({
  validateUpgradeConfig: () => {},
  upgradeStable: async () => { throw new Error('The made-up upgrade was reached') },
  retryStableUpgradeNotice: async () => { throw new Error('The made-up notice retry was reached') },
}))

const ENV = { MOLE_OFFICE_API: 'http://fixture.invalid', MOLE_OFFICE_AGENT: 'fixture-agent', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'default' }
const PATH = '/api/records/fixture-receipt/revisions/1'
const folders: string[] = []

// Read by name, so this criterion compiles before the evidence module exports its reply length.
const evidenceModule = '../tools/stable/stable-upgrade-evidence.mjs'
let theLongestReceiptReply: number

beforeAll(async () => {
  theLongestReceiptReply = (await import(evidenceModule)).THE_LONGEST_RECEIPT_REPLY as number
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A made-up office that answers every read with `status` and `body`, and the paths it was asked. */
function aMadeUpOffice(status: number, body: string) {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (url: string | URL | Request) => {
    asked.push(new URL(String(url)).pathname)
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  })
  return asked
}

/** Run main with --dry against a made-up office that answers every read with `status` and `body`. */
async function dryRun(status: number, body: string) {
  const asked = aMadeUpOffice(status, body)
  const folder = mkdtempSync(join(tmpdir(), 'upgrade-cut-'))
  folders.push(folder)
  const config = join(folder, 'config.json')
  writeFileSync(config, JSON.stringify({ health: { timeoutMs: 1000 }, evidence: { recordId: 'fixture-receipt' } }))
  const { main } = await import('../tools/stable/upgrade-stable.mjs')
  const outcome = await main(['--config', config, '--dry'], ENV).then(() => 'finished', (error: Error) => error.message)
  return { asked, outcome }
}

/** Mutation: drop the upgrade tool's own refusal for a cut, and the cut answer is reported as "refused (200)" again. */
it('names a cut evidence answer as a cut, and still refuses the office refusing', async () => {
  const short = await dryRun(200, JSON.stringify({ made: 'up' }))
  expect(short.outcome, 'a whole answer passes the read').toContain('The made-up upgrade was reached')
  expect(short.asked).toEqual([PATH])

  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
  const long = await dryRun(200, JSON.stringify({ padding: 'x'.repeat(theLongestReceiptReply) }))
  expect(long.outcome).toContain(`The office's answer to ${PATH} was cut, so the upgrade cannot read the evidence whole. No local evidence fallback exists.`)
  expect(long.outcome).not.toContain('refused (200)')
  expect(long.outcome).not.toContain('The made-up upgrade was reached')

  const refused = await dryRun(403, JSON.stringify({ error: 'made-up refusal' }))
  expect(refused.outcome).toContain('The canonical officeRequest evidence read was refused (403). No local evidence fallback exists.')
})

it('reads an evidence answer longer than the default reply whole', async () => {
  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
  const long = await dryRun(200, JSON.stringify({ padding: 'x'.repeat(THE_LONGEST_REPLY) }))
  expect(long.outcome, 'an answer longer than the default reply passes the read').toContain('The made-up upgrade was reached')
  expect(long.asked).toEqual([PATH])
})

it('reads a receipt answer longer than the default reply whole through the bootstrap transport, and still refuses one cut at the longer reply', async () => {
  expect(theLongestReceiptReply, 'the evidence module asks for more than the default reply').toBeGreaterThan(THE_LONGEST_REPLY)
  const padding = 'x'.repeat(THE_LONGEST_REPLY)
  const asked = aMadeUpOffice(200, JSON.stringify({ padding }))
  await expect(readReceiptEvidenceObject(bootstrapOfficeRequest(ENV, 1000), PATH), 'the bootstrap transport hands the length on').resolves.toEqual({ padding })
  expect(asked).toEqual([PATH])

  aMadeUpOffice(200, JSON.stringify({ padding: 'x'.repeat(theLongestReceiptReply) }))
  await expect(readReceiptEvidenceObject(bootstrapOfficeRequest(ENV, 1000), PATH)).rejects.toThrow(`GET ${PATH} has an unsuccessful, cut or malformed transport envelope.`)
})
