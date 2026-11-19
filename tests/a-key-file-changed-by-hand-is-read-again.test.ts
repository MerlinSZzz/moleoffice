// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY FILE CHANGED BY HAND IS READ AGAIN, SO WHETHER A KEY IS THERE AND WHAT IT IS COME FROM ONE FILE. Problem
 * 7MYfhEqomIRO, the way proposed and agreed in message CEykh1fBwn1l: the office asked whether a provider key
 * was there of the copy it read at the start, and read its value from the disk, so a hand edit made the two disagree
 * until the office started again. The push read then said the signing key "is there and cannot be read" when it was
 * gone, and a write merged into the old copy put back an entry taken out by hand.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The push signing key taken out of the key file by hand reads as not there, and not as there and unreadable.
 *   2. When the office then writes another entry, the one taken out by hand stays out, and the two secrets are kept.
 *   3. A key file broken by hand keeps the keys read before it, and prints nothing: keys.ts never writes to a log.
 *   4. A key file that is gone keeps the keys read before it, and nothing is made in its place (problem iQPGCoY7Wpgu).
 *   5. A provider key the office would write over a file broken by hand is refused, and the file is left as it was
 *      (problem AHyi2ht3-Zqb): writing it would put the old file back and lose the edit without a word.
 *   6. Once the file is put right by hand, a write goes through again.
 *
 * The keys are made up and written before the office is built, as the other key tests write them.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the key file read once for the life of the process again (lib/keys.ts): cases 1 and 2 go red;
 *   - a changed file that cannot be read thrown on rather than set aside (lib/keys.ts): case 3 goes red;
 *   - a file that is gone read again, and so made again (lib/keys.ts): case 4 goes red;
 *   - and, added with cases 5 and 6 by the run for problem AHyi2ht3-Zqb, the refusal of a write over a file the office
 *     could not read taken out (lib/keys.ts): case 5 goes red.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const SIGNING = 'push-signing-key'

let t: TestDb
let app: FastifyInstance
let file = ''
let keys: typeof import('../src/server/lib/keys.ts')
/** Each hand edit moves the file's modification time a second on, so the change is seen whatever the clock's grain. */
let tick = Math.floor(Date.now() / 1000) + 10

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function theFileOnDisk(): { person: string; office: string; providers: Record<string, string> } {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function editByHand(text: string): void {
  writeFileSync(file, text, { mode: 0o600 })
  tick += 1
  utimesSync(file, tick, tick)
}

async function thePushRead(): Promise<{ status: number; text: string }> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/push', headers: AS_THE_PERSON })
  return { status: reply.statusCode, text: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  file = join(dirname(t.file), 'keys.json')
  writeFileSync(file, `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  keys = await import('../src/server/lib/keys.ts')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a key file changed by hand while the office runs', () => {
  it('1: the push signing key taken out reads as not there, and not as there and unreadable', async () => {
    const before = await thePushRead()
    expect(before.status, before.text.slice(0, 300)).toBe(200)
    expect(Object.keys(theFileOnDisk().providers)).toContain(SIGNING)
    const held = theFileOnDisk()
    delete held.providers[SIGNING]
    editByHand(`${JSON.stringify(held, null, 2)}\n`)
    const after = await thePushRead()
    expect(after.status, after.text.slice(0, 300)).toBe(500)
    expect(after.text).toContain('is not there')
    expect(after.text).not.toContain('is there and cannot be read')
    expect(keys.aProviderSecretIsSet(SIGNING)).toBe(false)
  })

  it('2: when the office writes another entry, the one taken out by hand stays out and the two secrets are kept', () => {
    keys.setProviderSecret('a-made-up-provider', 'a-made-up-value')
    const now = theFileOnDisk()
    expect(Object.keys(now.providers)).not.toContain(SIGNING)
    expect(now.providers['a-made-up-provider']).toBe('a-made-up-value')
    expect(now.person).toBe(A_MADE_UP_PERSON_KEY)
    expect(now.office).toBe(A_MADE_UP_OFFICE_KEY)
    expect(keys.aProviderSecretIsSet('a-made-up-provider')).toBe(true)
  })

  it('3: broken by hand, it keeps the keys read before it, and prints nothing', () => {
    // EVERY CONSOLE OUTPUT IS WATCHED, not only lines naming the key file (the secretary's note, message HAL4Pbc45CY8): keys.ts
    // never writes to a log, so no key can reach one.
    const outputs = (['log', 'error', 'warn', 'info', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined))
    try {
      editByHand('{ this is not the file the office writes')
      expect(keys.aProviderSecretIsSet('a-made-up-provider')).toBe(true)
      expect(keys.aProviderSecretIsSet('a-made-up-provider')).toBe(true)
      expect(outputs.flatMap((one) => one.mock.calls)).toEqual([])
    } finally {
      for (const one of outputs) one.mockRestore()
    }
  })

  it('4: gone, it keeps the keys read before it, and nothing is made in its place', () => {
    const aside = `${file}.aside`
    renameSync(file, aside)
    try {
      expect(keys.aProviderSecretIsSet('a-made-up-provider')).toBe(true)
      expect(existsSync(file), 'a key file was made where the old one had gone').toBe(false)
    } finally {
      renameSync(aside, file)
    }
  })

  it('5: a provider key written over a file broken by hand is refused, and the file is left as it was', () => {
    const broken = readFileSync(file, 'utf8')
    expect(broken).toBe('{ this is not the file the office writes')
    expect(() => keys.setProviderSecret('another-made-up-provider', 'another-made-up-value')).toThrow(/was changed and is not a file this office writes/)
    expect(readFileSync(file, 'utf8')).toBe(broken)
  })

  it('6: once the file is put right by hand, a write goes through again', () => {
    editByHand(`${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: { 'a-made-up-provider': 'a-made-up-value' } }, null, 2)}\n`)
    keys.setProviderSecret('another-made-up-provider', 'another-made-up-value')
    const now = theFileOnDisk()
    expect(now.providers['another-made-up-provider']).toBe('another-made-up-value')
    expect(now.providers['a-made-up-provider']).toBe('a-made-up-value')
    expect(now.person).toBe(A_MADE_UP_PERSON_KEY)
  })
})
