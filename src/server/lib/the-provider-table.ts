// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER TABLE: ITS RULES, ITS ONE READER, ITS WRITERS AND ITS HISTORY.
 *
 * The shapes are in src/shared/the-provider-table.ts, and the doors in src/server/api/the-provider-table.ts. This file
 * reads and writes the `providers` and `provider_changes` tables (migration 0323). A Casting row names a row in its
 * native `providerRow` (src/server/lib/casting.ts), and a dsh check is told of it through the run-models answer
 * (src/server/lib/run-models.ts). No page reads the table yet.
 *
 * A WRITE CHECKS EVERYTHING BEFORE IT WRITES ANYTHING: the id, the name, the programs, the base address and the key
 * name. Then the row, its change row and the person's message are written in one transaction, so a refusal leaves both
 * tables as they were and sends nothing.
 *
 * A ROW A CASTING ROW NAMES IS NOT REMOVED, so a check never starts on a provider that is gone.
 *
 * NO KEY'S VALUE IS READ HERE. A row names an entry of the office's key file. A reply says only whether that entry is
 * set, through `aProviderSecretIsSet` in lib/keys.ts, which answers a boolean and never the value.
 *
 * THE PERSON'S MESSAGE. When an agent adds a row, or changes a row's base address, programs or key name, the person is
 * sent a line from Mole Office right after, in the same transaction. It names the row, the address's host and the key
 * name. The person's own writes send nothing, a change of the name alone sends nothing, and a removal sends nothing.
 */
import { SYSTEM_LINES } from '@shared/groups.ts'
import { OFFICE_KEY_PROVIDERS } from '@shared/office-keys.ts'
import { moleOffice } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  A_PROVIDER_ID,
  PROVIDER_PROGRAMS,
  type ProviderChange,
  type ProviderChangeKind,
  type ProviderFields,
  type ProviderProgram,
  type ProviderReading,
  type ProviderRow,
  type ProviderWriter,
  type ProviderWritten,
} from '@shared/the-provider-table.ts'
import { nowStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { giveTheFill } from '../db/part-tables.ts'
import { theCastingRowsThatNameAProvider, whoWrote } from './casting.ts'
import { writeASystemLineToOne } from './groups.ts'
import { THE_PUSH_ENTRIES } from '@shared/push-entries.ts'
import { theProvedPerson, type Actor } from './records.ts'
import { aRowOf, refused, theFieldsOf, theHeld, type Held } from './the-provider-a-check-takes.ts'

/** One row of `provider_changes` as SQLite answers it. */
type HeldChange = {
  id: number
  provider_id: string
  what: string
  at: string
  by_kind: string
  by_id: string
  before: string | null
  after: string | null
}

/** The fields a body may name, in the order a refusal lists them. */
const THE_FIELDS = ['id', 'name', 'programs', 'baseAddress', 'keyName'] as const
const THE_LONGEST_ADDRESS = 2048
const THE_LONGEST_KEY_NAME = 64

export { aProviderRefusal } from './the-provider-a-check-takes.ts'

/** A count of characters as SQLite's length() counts them, by code point. */
function charactersIn(text: string): number {
  return [...text].length
}

/** The id rule: lowercase letters, digits and dashes, 2 to 40 characters. Spaces around it are taken off. */
function theId(given: unknown): string {
  const id = typeof given === 'string' ? given.trim() : ''
  if (!A_PROVIDER_ID.test(id)) throw refused('providerIdNotValid', {})
  return id
}

/** The name rule: the words a person reads, trimmed, 1 to 120 characters. */
function theName(given: unknown): string {
  const name = typeof given === 'string' ? given.trim() : ''
  const length = charactersIn(name)
  if (length < 1 || length > 120) throw refused('providerNameNotValid', { length })
  return name
}

/** The programs rule: a list of at least one of the programs a provider may be for, each once. Kept in the order given. */
function thePrograms(given: unknown): ProviderProgram[] {
  if (!Array.isArray(given) || given.length === 0 || given.some((one) => typeof one !== 'string')) throw refused('providerProgramsNotAList', {})
  const programs: ProviderProgram[] = []
  for (const one of given as string[]) {
    const program = one.trim()
    if (!(PROVIDER_PROGRAMS as readonly string[]).includes(program)) throw refused('providerProgramNotKnown', { program })
    if ((programs as string[]).includes(program)) throw refused('providerProgramRepeated', { program })
    programs.push(program as ProviderProgram)
  }
  return programs
}

/**
 * THE BASE ADDRESS RULE. An https: address with a host, or an http: address whose host is written exactly 127.0.0.1
 * or [::1], with any port. No user:password@, no query and no fragment. The address is stored as given, trimmed,
 * with its path and any trailing slash as they were.
 *
 * LOCALHOST IS NOT TAKEN over http:, because the name is answered by the system's resolver and its hosts file, which
 * may send it to another computer. 127.0.0.1 and [::1] are this computer whatever the resolver says.
 *
 * A REFUSAL NAMES THE HOST AND NEVER THE REST: an address can carry a password or a key in its user part or its
 * query, so neither is echoed. An address that cannot be read names nothing it was given.
 */
function theBaseAddress(given: unknown): string {
  const address = typeof given === 'string' ? given.trim() : ''
  if (address === '' || address.length > THE_LONGEST_ADDRESS || /[\s\\\p{Cc}]/u.test(address)) throw refused('providerAddressNotAnAddress', {})
  const hostless = /^(https?):\/\/(?:[/?#]|$)/iu.exec(address)
  if (hostless !== null) throw refused('providerAddressNoHost', { scheme: hostless[1]!.toLowerCase() })
  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw refused('providerAddressNotAnAddress', {})
  }
  const host = url.hostname
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/iu.exec(address)?.[1] ?? ''
  if (authority.includes('@') || url.username !== '' || url.password !== '') throw refused('providerAddressHasCredentials', { host })
  const scheme = url.protocol.slice(0, -1)
  if (scheme !== 'https' && scheme !== 'http') throw refused('providerAddressScheme', { scheme })
  // THE TWO SLASHES ARE ASKED FOR. The parser reads "https:host" and "https:/host" as https://host/, and the address is
  // stored as given, so a later reader of another parser could read no host in it.
  if (host === '' || !/^https?:\/\//iu.test(address)) throw refused('providerAddressNoHost', { scheme })
  // HTTP: IS JUDGED ON THE HOST AS WRITTEN, without its port. The parser reads 127.1, 2130706433 and 0x7f.0.0.1 as
  // 127.0.0.1, and the address is stored as given, so a host spelt any other way is refused and named as it was spelt.
  const written = authority.replace(/:\d*$/u, '')
  if (scheme === 'http' && written !== '127.0.0.1' && written !== '[::1]') throw refused('providerAddressHttpNotLoopback', { host: written })
  const fragmentAt = address.indexOf('#')
  if ((fragmentAt === -1 ? address : address.slice(0, fragmentAt)).includes('?')) throw refused('providerAddressHasQuery', { host })
  if (fragmentAt !== -1) throw refused('providerAddressHasFragment', { host })
  return address
}

/**
 * THE KEY NAME RULE, AND THE NAMES THE OFFICE KEEPS FOR ITSELF, in this one function. A key name names an entry of the
 * office's key file and is never a value: lowercase letters, digits and dashes, 1 to 64 characters. A refusal of the
 * form does not echo what was given, in case a key was pasted where its name belongs.
 *
 * The office keeps these entries for itself, and a row may name none of them:
 *   - the office's own keys, `OFFICE_KEY_PROVIDERS` in src/shared/office-keys.ts, set on the Settings page by
 *     `setTheOfficeKey` in src/server/lib/office-keys.ts;
 *   - the push signing key and the devices a summons tells, `THE_PUSH_ENTRIES` in src/server/lib/push.ts.
 *
 * A row may name an entry that is not set. The door says only whether it is.
 */
export function theKeyName(given: unknown): string {
  const kept: readonly string[] = [...OFFICE_KEY_PROVIDERS, THE_PUSH_ENTRIES.signingKey, THE_PUSH_ENTRIES.devices]
  const name = typeof given === 'string' ? given.trim() : ''
  if (name.length > THE_LONGEST_KEY_NAME || !/^[a-z0-9-]+$/u.test(name)) throw refused('providerKeyNameNotValid', {})
  if (kept.includes(name)) throw refused('providerKeyNameKeptByTheOffice', { name })
  return name
}

/** A body as an object of the fields this table takes, or a refusal that names the others. */
function theBody(given: unknown): Partial<Record<(typeof THE_FIELDS)[number], unknown>> {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) throw refused('providerBodyNotAnObject', {})
  const others = Object.keys(given).filter((one) => !(THE_FIELDS as readonly string[]).includes(one))
  if (others.length > 0) throw refused('providerBodyHasOtherFields', { fields: others.sort().join(', ') })
  return given as Partial<Record<(typeof THE_FIELDS)[number], unknown>>
}

function aChangeOf(held: HeldChange): ProviderChange {
  return {
    id: held.id,
    provider: held.provider_id,
    what: held.what as ProviderChangeKind,
    at: held.at,
    by: { kind: held.by_kind, id: held.by_id },
    before: held.before === null ? null : (JSON.parse(held.before) as ProviderFields),
    after: held.after === null ? null : (JSON.parse(held.after) as ProviderFields),
  }
}

/** The row with this id, or a refusal: of the id's form, or a 404 that names the id. */
function theHeldOrRefused(id: string): Held {
  const held = theHeld(theId(id))
  if (held === undefined) throw refused('providerNotFound', { id }, 404)
  return held
}

function writeAChange(provider: string, what: ProviderChangeKind, at: string, by: ProviderWriter, before: ProviderFields | null, after: ProviderFields | null): ProviderChange {
  const written = sqlite
    .prepare('INSERT INTO provider_changes (provider_id, what, at, by_kind, by_id, before, after) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(provider, what, at, by.kind, by.id, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after))
  return aChangeOf(sqlite.prepare('SELECT * FROM provider_changes WHERE id = ?').get(Number(written.lastInsertRowid)) as HeldChange)
}

/** Mole Office itself, as the office's other lines to one participant are written. */
function theOffice(): Actor {
  return { type: 'system', id: moleOffice().id }
}

/** The host a stored address sends to. Every stored address passed `theBaseAddress`, so it parses. */
function theHostOf(address: string): string {
  return new URL(address).hostname
}

/** The words a list of programs is said in: "codex, opencode". */
function theProgramsInWords(programs: readonly string[]): string {
  return programs.join(', ')
}

/**
 * THE PERSON WRITES A PROVIDER ONLY WHEN PROVED. Each write door asks the Casting gate first and then this. The gate
 * lets in the person and an agent whose card holds the act, and it takes a request that only says it is the person
 * while the key window is open. This check does not: the person is taken here only through `theProvedPerson` in
 * lib/records.ts, by the person's key or from inside the office's own program. An agent is not asked.
 */
export function onlyAProvedPersonWritesAProvider(actor: Actor): void {
  if (actor.type === 'human' && !theProvedPerson(actor)) throw refused('providerPersonNotProved', {}, 403)
}

/** Every row, by id. */
export function theProviders(): ProviderReading {
  return { providers: (sqlite.prepare('SELECT * FROM providers ORDER BY id').all() as Held[]).map(aRowOf) }
}

/** One row. */
export function aProvider(id: string): ProviderRow {
  return aRowOf(theHeldOrRefused(id))
}

export { aProviderIfThere } from './the-provider-a-check-takes.ts'

export { theVersionOfAProvider } from './the-provider-a-check-takes.ts'

export { theProviderACheckTakes } from './the-provider-a-check-takes.ts'

/** Every change to one row, newest first. A row that was removed still has its changes. */
export function theProviderChanges(id: string): ProviderChange[] {
  return (sqlite.prepare('SELECT * FROM provider_changes WHERE provider_id = ? ORDER BY id DESC').all(id) as HeldChange[]).map(aChangeOf)
}

/** Add a row. Body {id, name, programs, baseAddress, keyName}, each required. */
export function addAProvider(body: unknown, actor: Actor, workspaceId: string): ProviderWritten {
  const given = theBody(body)
  const fields: ProviderFields = {
    id: theId(given.id),
    name: theName(given.name),
    programs: thePrograms(given.programs),
    baseAddress: theBaseAddress(given.baseAddress),
    keyName: theKeyName(given.keyName),
  }
  const at = nowStamp()
  const by = whoWrote(actor)
  return sqlite.transaction((): ProviderWritten => {
    if (theHeld(fields.id) !== undefined) throw refused('providerIdTaken', { id: fields.id }, 409)
    sqlite
      .prepare(
        'INSERT INTO providers (id, name, programs, base_address, key_name, added_at, added_by_kind, added_by_id, changed_at, changed_by_kind, changed_by_id) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(fields.id, fields.name, JSON.stringify(fields.programs), fields.baseAddress, fields.keyName, at, by.kind, by.id, at, by.kind, by.id)
    const change = writeAChange(fields.id, 'add', at, by, null, fields)
    const told =
      actor.type === 'agent'
        ? writeASystemLineToOne(
            { kind: 'person', id: THE_PERSON },
            workspaceId,
            SYSTEM_LINES.aSecretaryAddedAProvider({
              agent: actor.id,
              id: fields.id,
              name: fields.name,
              programs: theProgramsInWords(fields.programs),
              host: theHostOf(fields.baseAddress),
              keyName: fields.keyName,
            }),
            theOffice(),
          ).id
        : null
    return { provider: aRowOf(theHeldOrRefused(fields.id)), change, told }
  })()
}

/** Change a row. Body {name?, programs?, baseAddress?, keyName?}, at least one; `id` may be named only as it is. */
export function changeAProvider(id: string, body: unknown, actor: Actor, workspaceId: string): ProviderWritten {
  const given = theBody(body)
  const held = theHeldOrRefused(id)
  if (given.id !== undefined && given.id !== held.id) throw refused('providerIdChanged', { id: held.id })
  if (THE_FIELDS.every((field) => field === 'id' || given[field] === undefined)) throw refused('providerChangeNamesNothing', { id: held.id })
  const before = theFieldsOf(held)
  const after: ProviderFields = {
    id: held.id,
    name: given.name === undefined ? before.name : theName(given.name),
    programs: given.programs === undefined ? before.programs : thePrograms(given.programs),
    baseAddress: given.baseAddress === undefined ? before.baseAddress : theBaseAddress(given.baseAddress),
    keyName: given.keyName === undefined ? before.keyName : theKeyName(given.keyName),
  }
  const at = nowStamp()
  const by = whoWrote(actor)
  // A CHANGE THE PERSON IS TOLD OF: the address, the programs or the key name. The name alone is not.
  const sayIt =
    actor.type === 'agent' &&
    (after.baseAddress !== before.baseAddress || after.keyName !== before.keyName || JSON.stringify(after.programs) !== JSON.stringify(before.programs))
  return sqlite.transaction((): ProviderWritten => {
    sqlite
      .prepare('UPDATE providers SET name = ?, programs = ?, base_address = ?, key_name = ?, changed_at = ?, changed_by_kind = ?, changed_by_id = ? WHERE id = ?')
      .run(after.name, JSON.stringify(after.programs), after.baseAddress, after.keyName, at, by.kind, by.id, held.id)
    const change = writeAChange(held.id, 'change', at, by, before, after)
    const told = sayIt
      ? writeASystemLineToOne(
          { kind: 'person', id: THE_PERSON },
          workspaceId,
          SYSTEM_LINES.aSecretaryChangedAProvider({
            agent: actor.id,
            id: after.id,
            name: after.name,
            programs: theProgramsInWords(after.programs),
            host: theHostOf(after.baseAddress),
            keyName: after.keyName,
            programsBefore: theProgramsInWords(before.programs),
            hostBefore: theHostOf(before.baseAddress),
            keyNameBefore: before.keyName,
          }),
          theOffice(),
        ).id
      : null
    return { provider: aRowOf(theHeldOrRefused(held.id)), change, told }
  })()
}

/** Remove a row. No body is read. The answer is the row as it was. A row a Casting row names is refused with a 409. */
export function removeAProvider(id: string, actor: Actor): ProviderWritten {
  const held = theHeldOrRefused(id)
  const was = aRowOf(held)
  const at = nowStamp()
  const by = whoWrote(actor)
  return sqlite.transaction((): ProviderWritten => {
    const named = theCastingRowsThatNameAProvider(held.id)
    if (named.length > 0) throw refused('providerNamedByACastingRow', { id: held.id, rows: named.join(', ') }, 409)
    sqlite.prepare('DELETE FROM providers WHERE id = ?').run(held.id)
    const change = writeAChange(held.id, 'remove', at, by, theFieldsOf(held), null)
    return { provider: was, change, told: null }
  })()
}

/**
 * THE RESTORE PROOF'S PROVIDERS, written by the writers above as the person: one row added and changed, and one added
 * and removed, so the proof carries every kind of change row.
 */
export async function fillTheProviderProof(): Promise<string> {
  const said = 'A provider the person added and changed, and one the person added and removed.'
  if (sqlite.prepare('SELECT 1 FROM provider_changes LIMIT 1').get() !== undefined) return said
  const { MESSAGE_CENTRE } = await import('@shared/workspaces.ts')
  const person = sqlite.prepare('SELECT id FROM people LIMIT 1').get() as { id: string } | undefined
  if (person === undefined) throw new Error('The restore proof has the person add a provider, and its corpus holds no person.')
  const actor: Actor = { type: 'human', id: person.id }
  const kept = { id: 'restore-proof', name: 'Restore proof', programs: ['opencode'], baseAddress: 'https://restore-proof.example/v1', keyName: 'restore-proof' }
  addAProvider(kept, actor, MESSAGE_CENTRE)
  changeAProvider(kept.id, { programs: ['opencode', 'codex'] }, actor, MESSAGE_CENTRE)
  addAProvider({ ...kept, id: 'restore-proof-gone' }, actor, MESSAGE_CENTRE)
  removeAProvider('restore-proof-gone', actor)
  return said
}
// The schema part of these two tables names this file for its fill, so the database folder imports nothing above itself.
giveTheFill('src/server/lib/the-provider-table.ts', fillTheProviderProof)
