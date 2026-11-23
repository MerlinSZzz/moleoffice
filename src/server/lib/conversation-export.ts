// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RUN'S CONVERSATION AS ONE FILE, WITH THE PARTS THE PERSON TICKS. Wave 13s, point C1A-2, the export slice.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES IN
 * ---------------------------------------------------------------------------------------
 *
 * Always: the manifest, the run's conversation read whole, and the current handover of the agent the run serves.
 * When ticked and the agent has it: the notebook, the memory folder, the whole personal space, and the name and
 * address. The words, the entry names and the manifest's shape are in src/shared/conversation-export.ts.
 *
 * The conversation is found and read where the sync finds and reads it (`theWholeConversationOf` in
 * conversation-sync.ts), with no bound of the sync's own: the bound is the bytes one export carries.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DONE TO IT, IN ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. Every text part is scrubbed with the run's path map, as the sync scrubs. Text is valid UTF-8 with no NUL
 *      byte. Anything else travels byte for byte and is named as not screened.
 *   2. Every scrubbed text part, each of the manifest's own text fields, and the names of the files carried go
 *      through the screen. A refusing finding stops the export. A finding to look at stops it until the person says
 *      he has looked.
 *   3. Every entry's bytes, the manifest's too, are searched for a key hash this office issued. One found stops the
 *      export, and the answer names the entry and never the hash.
 *
 * A file over the bytes or the files one export carries, or whose name a zip cannot hold, is left out and named
 * with why. It does not stop the export.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * It writes nothing: not in the office, not in the space, not in the memory folder. It follows no link inside the
 * space or the memory folder. It carries no id of this office except the run's own: who wrote the handover is a kind
 * and a name, and who set the address stays behind.
 */

import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { hashesFoundInTheseBytes } from '../../config/what-a-copy-must-not-carry.mjs'
import { ADDRESS_AS_PARTS, type AddressAs } from '@shared/address-as.ts'
import {
  CONVERSATION_EXPORT_ENTRY,
  CONVERSATION_EXPORT_FORMAT,
  CONVERSATION_EXPORT_PARTS,
  CONVERSATION_EXPORT_RUN_FIELD,
  conversationExportFileName,
  type ConversationExportAsk,
  type ConversationExportFinding,
  type ConversationExportLeftOut,
  type ConversationExportLook,
  type ConversationExportManifest,
  type ConversationExportPart,
  type ConversationExportPiece,
  type ConversationExportRefusalCode,
  type ConversationExportScrub,
} from '@shared/conversation-export.ts'
import { scrubConversation, type ConversationPath } from '@shared/conversation-sync.ts'
import { sayInEnglish, type WordValues } from '@shared/i18n.ts'
import type { CodedRefusal, RefusalValues } from '@shared/refusal-codes.ts'
import { nowStamp } from '@shared/time.ts'
import { ZIP_EXPORT_FILE_BYTES_LINE, ZIP_EXPORT_FILES_LINE } from '@shared/zip-export/manifest.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { readParticipant } from '../db/read-participant.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import { theConversationARunNames, thePathMapForOneRun, theWholeConversationOf } from './conversation-sync.ts'
import { theCurrentHandover } from './handovers.ts'
import { theNotebookFor } from './notebook.ts'
import { PanelError } from './panel-error.ts'
import { getRecord, recordInWorkspace } from './records.ts'
import { theSpaceOf } from './residents.ts'
import { screenWhatWouldLeave, type ScreeningFinding } from './screening.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { keyHashesThisOfficeHolds } from './zip-export/related-files.ts'
import { whyAZipEntryNameIsUnfit, writeZip, type ZipEntry } from './zip-export/zip.ts'

/** One export refusal, coded, with its English sentence. Every one of them is a 409 and comes before anything is made. */
function refused<C extends ConversationExportRefusalCode>(code: C, values: RefusalValues<C>): PanelError {
  return new PanelError(sayInEnglish(`server.${code}`, values as WordValues), 409, undefined, undefined, undefined, { code, values } as CodedRefusal)
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

const byName = <T extends { name: string }>(a: T, b: T): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

const TEXT = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** The bytes as text, or null because they are not text: not valid UTF-8, or holding a NUL byte. */
function asText(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null
  try {
    return TEXT.decode(bytes)
  } catch {
    return null
  }
}

/** A scrub's counts as they are added up across the texts of one piece. */
interface ATally {
  pathsMapped: number
  secretsRemoved: number
  secretShapes: Set<string>
}

const aTally = (): ATally => ({ pathsMapped: 0, secretsRemoved: 0, secretShapes: new Set() })

const theScrubOf = (tally: ATally): ConversationExportScrub => ({
  pathsMapped: tally.pathsMapped,
  secretsRemoved: tally.secretsRemoved,
  secretShapes: [...tally.secretShapes].sort(),
})

/** One text scrubbed with the run's path map, its counts added to the piece's tally. */
function scrubbed(text: string, paths: readonly ConversationPath[], tally: ATally): string {
  const done = scrubConversation(text, paths)
  tally.pathsMapped += done.pathsMapped
  tally.secretsRemoved += done.secretsRemoved
  for (const shape of done.secretShapes) tally.secretShapes.add(shape)
  return done.text
}

/** One entry of the file. `text` is the scrubbed text the screen reads, or null for bytes carried as they are. */
interface AnEntry {
  piece: ConversationExportPiece
  name: string
  bytes: Buffer
  text: string | null
}

const aTextEntry = (piece: ConversationExportPiece, name: string, text: string): AnEntry => ({ piece, name, bytes: Buffer.from(text, 'utf8'), text })

/** One piece as it was gathered. `entries` is empty unless it is carried. */
interface APiece {
  state: 'carried' | 'not-there' | 'not-asked-for'
  entries: AnEntry[]
  tally: ATally
}

/** A file found in the memory folder or the space, before it is read. */
interface AFileFound {
  piece: 'memory' | 'space'
  name: string
  path: string
  size: number
}

/** Whether a path is a folder on this machine. A path that is not there, or cannot be read, is not one. */
function aFolderAt(path: string | null): path is string {
  if (path === null) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** The folder the agent record's `notes` field names, as src/server/lib/agentmemory.ts reads it, or null because none is named. */
function theMemoryFolderOf(agentId: string, workspaceId: string): string | null {
  const recordId = recordForAgentIn(agentId, workspaceId)
  if (recordId === null) return null
  const data = getRecord(recordId)?.data
  const said = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['notes'] : undefined
  return typeof said === 'string' && said !== '' ? said : null
}

/** The markdown files directly in the memory folder. A folder, another file and anything not an ordinary file are named and left out. */
function theMemoryFiles(folder: string, found: AFileFound[], leftOut: ConversationExportLeftOut[]): void {
  for (const one of readdirSync(folder, { withFileTypes: true }).sort(byName)) {
    const file = `${CONVERSATION_EXPORT_ENTRY.memory}${one.name}`
    const path = join(folder, one.name)
    if (one.isDirectory()) leftOut.push({ piece: 'memory', file, why: 'a-folder', bytes: null })
    else if (!one.isFile()) leftOut.push({ piece: 'memory', file, why: 'not-an-ordinary-file', bytes: null })
    else if (!one.name.endsWith('.md')) leftOut.push({ piece: 'memory', file, why: 'not-a-markdown-file', bytes: lstatSync(path).size })
    else found.push({ piece: 'memory', name: file, path, size: lstatSync(path).size })
  }
}

/** Every file under the space, as on disk. A link is not followed: it is named and left out, as anything not an ordinary file is. */
function theSpaceFiles(folder: string, prefix: string, found: AFileFound[], leftOut: ConversationExportLeftOut[]): void {
  for (const one of readdirSync(folder, { withFileTypes: true }).sort(byName)) {
    const file = `${prefix}${one.name}`
    const path = join(folder, one.name)
    if (one.isDirectory()) theSpaceFiles(path, `${file}/`, found, leftOut)
    else if (!one.isFile()) leftOut.push({ piece: 'space', file, why: 'not-an-ordinary-file', bytes: null })
    else found.push({ piece: 'space', name: file, path, size: lstatSync(path).size })
  }
}

/** Why one file found cannot go, or null because it fits beside what is already carried. */
function whyItCannotGo(one: AFileFound, files: number, bytes: number): ConversationExportLeftOut['why'] | null {
  if (whyAZipEntryNameIsUnfit(one.name) !== null) return 'name-unfit'
  if (files >= ZIP_EXPORT_FILES_LINE) return 'over-the-count'
  if (bytes + one.size > ZIP_EXPORT_FILE_BYTES_LINE) return 'over-the-line'
  return null
}

/**
 * THE FILES THAT GO, in the order found, while each fits. A name a zip cannot hold, a file past the files one export
 * carries, and a file that would take the export past its bytes are named and left out, and the files after them are
 * still asked. The count and the bytes start from what always goes, with the manifest counted as one file. The size
 * is read before the bytes, so a file over the line is never read.
 */
function theFilesThatGo(
  found: readonly AFileFound[],
  carried: readonly AnEntry[],
  paths: readonly ConversationPath[],
  pieces: Record<ConversationExportPart, APiece>,
  leftOut: ConversationExportLeftOut[],
): void {
  let bytes = carried.reduce((sum, one) => sum + one.bytes.length, 0)
  let files = carried.length + 1
  for (const one of found) {
    const why = whyItCannotGo(one, files, bytes)
    if (why !== null) {
      leftOut.push({ piece: one.piece, file: one.name, why, bytes: one.size })
      continue
    }
    const raw = readFileSync(one.path)
    files += 1
    bytes += raw.length
    const text = asText(raw)
    const piece = pieces[one.piece]
    piece.entries.push(
      text === null
        ? { piece: one.piece, name: one.name, bytes: raw, text: null }
        : aTextEntry(one.piece, one.name, scrubbed(text, paths, piece.tally)),
    )
  }
}

/** What the gathering gave: the run, every piece in the file's order, and what the manifest says of them. */
interface TheGathering {
  runId: string
  runtime: string
  conversationId: string
  conversation: AnEntry
  conversationTally: ATally
  /** The manifest's own text fields, scrubbed, each with its label. */
  fields: { title: string; agentHandle: string | null; cardName: string | null; office: string; handoverWriter: string | null }
  fieldTally: ATally
  handover: APiece & { writtenAt: string | null; writtenBy: { kind: 'person' | 'agent'; name: string | null } | null }
  parts: Record<ConversationExportPart, APiece>
  leftOut: ConversationExportLeftOut[]
  paths: readonly ConversationPath[]
}

/** The run, read in this project only: a run in another project is refused by `recordInWorkspace`, which names its project. */
function theRun(workspaceId: string, runId: string): { id: string; title: string; data: Record<string, unknown> } {
  const record = recordInWorkspace(runId, workspaceId)
  if (record.deletedAt !== null) throw new PanelError(`No run ${runId} is in this project. Nothing was made.`, 404)
  const data = typeof record.data === 'object' && record.data !== null ? (record.data as Record<string, unknown>) : {}
  return { id: record.id, title: record.title, data }
}

/**
 * GATHER WHAT THE FILE WOULD HOLD with these parts ticked. It reads and writes nothing in the office. Every refusal
 * here comes before any part is read: the run's own fields, then the conversation.
 */
function gather(workspaceId: string, runId: string, ticked: Readonly<Record<ConversationExportPart, boolean>>): TheGathering {
  const run = theRun(workspaceId, runId)
  const named = theConversationARunNames(textOf(run.data['runtime']), textOf(run.data['providerSession']), textOf(run.data['workingDirectory']))
  if (!named.named) {
    if (named.why === 'no-runtime') throw refused('conversationExportNoRuntime', {})
    if (named.why === 'runtime-not-read') throw refused('conversationExportRuntimeNotRead', { runtime: named.runtime ?? '' })
    if (named.why === 'no-conversation-id') throw refused('conversationExportNoConversationId', {})
    if (named.why === 'conversation-id-unfit') throw refused('conversationExportConversationIdUnfit', {})
    throw refused('conversationExportNoWorkingDirectory', {})
  }
  const office = getWorkspace(workspaceId)
  if (office === null) throw new PanelError(`No project ${workspaceId} is in this office. Nothing was made.`, 404)
  const paths = thePathMapForOneRun(workspaceId, run)
  const read = theWholeConversationOf(named, textOf(run.data['servingAgent']), paths, ZIP_EXPORT_FILE_BYTES_LINE)
  if (!read.read) {
    if (read.why === 'not-there') throw refused('conversationExportNotThere', {})
    if (read.why === 'unreadable') throw refused('conversationExportUnreadable', {})
    throw refused('conversationExportOverTheLine', { megabytes: ZIP_EXPORT_FILE_BYTES_LINE / (1024 * 1024) })
  }
  const conversationTally: ATally = { pathsMapped: read.pathsMapped, secretsRemoved: read.secretsRemoved, secretShapes: new Set(read.secretShapes) }
  const conversationEntry = read.shape === 'lines' ? CONVERSATION_EXPORT_ENTRY.conversationLines : CONVERSATION_EXPORT_ENTRY.conversationWhole
  const conversation = aTextEntry('conversation', conversationEntry, read.text)

  const agent = theAgentARunServes(run.data)
  const registered = agent === null ? null : readParticipant({ kind: 'agent', id: agent.id })
  const fieldTally = aTally()
  const field = (text: string | null): string | null => (text === null ? null : scrubbed(text, paths, fieldTally))

  const handoverTally = aTally()
  const current = agent === null ? null : theCurrentHandover(agent.id, workspaceId).current
  const writer = current === null ? null : readParticipant({ kind: current.writtenByKind, id: current.writtenById })
  const handover: TheGathering['handover'] =
    current === null
      ? { state: 'not-there', entries: [], tally: handoverTally, writtenAt: null, writtenBy: null }
      : {
          state: 'carried',
          entries: [aTextEntry('handover', CONVERSATION_EXPORT_ENTRY.handover, scrubbed(current.text, paths, handoverTally))],
          tally: handoverTally,
          writtenAt: current.writtenAt,
          writtenBy: { kind: current.writtenByKind, name: field(writer?.name ?? null) },
        }

  const parts = Object.fromEntries(
    CONVERSATION_EXPORT_PARTS.map((part): [ConversationExportPart, APiece] => [
      part,
      { state: ticked[part] ? 'not-there' : 'not-asked-for', entries: [], tally: aTally() },
    ]),
  ) as Record<ConversationExportPart, APiece>

  if (ticked.notebook && agent !== null) {
    const notebook = theNotebookFor(workspaceId, agent.handle)
    if (notebook !== null) {
      const tally = parts.notebook.tally
      const json = {
        title: scrubbed(notebook.title, paths, tally),
        entries: notebook.entries.map((one) => ({
          at: one.at,
          entryKind: one.entryKind,
          writtenByKind: one.writtenByKind,
          text: scrubbed(one.text, paths, tally),
        })),
      }
      parts.notebook.state = 'carried'
      parts.notebook.entries.push(aTextEntry('notebook', CONVERSATION_EXPORT_ENTRY.notebook, `${JSON.stringify(json, null, 2)}\n`))
    }
  }

  if (ticked.address && registered !== null) {
    const tally = parts.address.tally
    const addressAs: AddressAs = {}
    for (const part of ADDRESS_AS_PARTS) {
      const said = registered.addressAs[part]
      if (typeof said === 'string') addressAs[part] = scrubbed(said, paths, tally)
    }
    const json = { name: scrubbed(registered.name, paths, tally), addressAs }
    parts.address.state = 'carried'
    parts.address.entries.push(aTextEntry('address', CONVERSATION_EXPORT_ENTRY.address, `${JSON.stringify(json, null, 2)}\n`))
  }

  const leftOut: ConversationExportLeftOut[] = []
  const found: AFileFound[] = []
  const memory = ticked.memory && agent !== null ? theMemoryFolderOf(agent.id, workspaceId) : null
  if (aFolderAt(memory)) {
    parts.memory.state = 'carried'
    theMemoryFiles(memory, found, leftOut)
  }
  const space = ticked.space && agent !== null ? theSpaceOf(agent.id) : null
  if (aFolderAt(space)) {
    parts.space.state = 'carried'
    theSpaceFiles(space, CONVERSATION_EXPORT_ENTRY.space, found, leftOut)
  }
  theFilesThatGo(found, [conversation, ...handover.entries, ...parts.notebook.entries, ...parts.address.entries], paths, parts, leftOut)
  for (const part of CONVERSATION_EXPORT_PARTS) parts[part].entries.sort(byName)

  return {
    runId: run.id,
    runtime: named.runtime,
    conversationId: named.providerSession,
    conversation,
    conversationTally,
    fields: {
      title: field(run.title) ?? '',
      agentHandle: field(agent?.handle ?? null),
      cardName: field(registered?.role ?? null),
      office: field(office.title) ?? '',
      handoverWriter: handover.writtenBy?.name ?? null,
    },
    fieldTally,
    handover,
    parts,
    leftOut,
    paths,
  }
}

/** Every entry after the manifest, in the file's order: the conversation, the handover, then the four parts. */
function theEntriesOf(gathered: TheGathering): AnEntry[] {
  return [gathered.conversation, ...gathered.handover.entries, ...CONVERSATION_EXPORT_PARTS.flatMap((part) => gathered.parts[part].entries)]
}

/** The texts the manifest carries from the office and the run, each with the label a finding names it by. */
function theFieldsOf(gathered: TheGathering): { label: string; text: string }[] {
  const { fields } = gathered
  return [
    { label: CONVERSATION_EXPORT_RUN_FIELD.title, text: fields.title },
    { label: CONVERSATION_EXPORT_RUN_FIELD.agentHandle, text: fields.agentHandle ?? '' },
    { label: CONVERSATION_EXPORT_RUN_FIELD.cardName, text: fields.cardName ?? '' },
    { label: CONVERSATION_EXPORT_RUN_FIELD.office, text: fields.office },
    { label: CONVERSATION_EXPORT_RUN_FIELD.handoverWriter, text: fields.handoverWriter ?? '' },
  ].filter((one) => one.text !== '')
}

/**
 * EVERYTHING THE SCREEN FOUND, piece by piece. A finding the screen makes about a whole text, such as the names it
 * cannot check, is the same for every text, so it is kept once for the whole file with no piece. The same finding
 * twice in one file is kept once.
 */
function theFindingsOf(gathered: TheGathering): ConversationExportFinding[] {
  const out: ConversationExportFinding[] = []
  const seen = new Set<string>()
  const add = (piece: ConversationExportPiece, file: string | null, one: ScreeningFinding): void => {
    const whole = one.where === null
    const finding: ConversationExportFinding = {
      piece: whole ? null : piece,
      file: whole ? null : file,
      check: one.check,
      severity: one.severity,
      says: one.says,
    }
    const key = JSON.stringify([finding.piece, finding.file, finding.check, finding.severity, finding.says])
    if (seen.has(key)) return
    seen.add(key)
    out.push(finding)
  }
  for (const one of theFieldsOf(gathered)) for (const finding of screenWhatWouldLeave(one.text).findings) add('run', one.label, finding)
  const entries = theEntriesOf(gathered)
  for (const entry of entries) {
    if (entry.text !== null) for (const finding of screenWhatWouldLeave(entry.text).findings) add(entry.piece, entry.name, finding)
  }
  // THE NAMES OF THE FILES CARRIED leave too, one to a line, so a finding's line is the file it is in.
  for (const part of ['memory', 'space'] as const) {
    const names = gathered.parts[part].entries.map((one) => one.name)
    if (names.length === 0) continue
    for (const finding of screenWhatWouldLeave(names.join('\n')).findings) {
      add(part, finding.where === null ? null : (names[finding.where.line - 1] ?? null), finding)
    }
  }
  return out
}

/** The path tokens the carried text holds, by token only, in the path map's order. */
function theTokensUsed(gathered: TheGathering): string[] {
  const texts = [...theEntriesOf(gathered).flatMap((one) => (one.text === null ? [] : [one.text])), ...theFieldsOf(gathered).map((one) => one.text)]
  return [...new Set(gathered.paths.map((one) => one.token))].filter((token) => texts.some((text) => text.includes(token)))
}

/** Every text piece's scrub, added up. */
function theWholeScrub(gathered: TheGathering): ConversationExportScrub {
  const tallies = [
    gathered.conversationTally,
    gathered.fieldTally,
    gathered.handover.tally,
    ...CONVERSATION_EXPORT_PARTS.map((part) => gathered.parts[part].tally),
  ]
  const whole = aTally()
  for (const one of tallies) {
    whole.pathsMapped += one.pathsMapped
    whole.secretsRemoved += one.secretsRemoved
    for (const shape of one.secretShapes) whole.secretShapes.add(shape)
  }
  return theScrubOf(whole)
}

/** The manifest, as the import will read it. */
function theManifestOf(gathered: TheGathering): ConversationExportManifest {
  const notScreened = theEntriesOf(gathered).flatMap((one) => (one.text === null ? [one.name] : []))
  return {
    format: CONVERSATION_EXPORT_FORMAT,
    madeAt: nowStamp(),
    office: { name: gathered.fields.office },
    run: { id: gathered.runId, title: gathered.fields.title, agentHandle: gathered.fields.agentHandle, cardName: gathered.fields.cardName },
    runtime: { word: gathered.runtime, conversationId: gathered.conversationId },
    conversation: {
      entry: gathered.conversation.name,
      bytes: gathered.conversation.bytes.length,
      sha256: createHash('sha256').update(gathered.conversation.bytes).digest('hex'),
    },
    scrub: { ...theWholeScrub(gathered), tokens: theTokensUsed(gathered) },
    handover: {
      state: gathered.handover.state === 'carried' ? 'carried' : 'not-there',
      entry: gathered.handover.entries[0]?.name ?? null,
      writtenAt: gathered.handover.writtenAt,
      writtenBy: gathered.handover.writtenBy,
    },
    parts: Object.fromEntries(
      CONVERSATION_EXPORT_PARTS.map((part) => [part, { state: gathered.parts[part].state, entries: gathered.parts[part].entries.map((one) => one.name) }]),
    ) as ConversationExportManifest['parts'],
    leftOut: gathered.leftOut,
    notScreened,
  }
}

const theManifestBytes = (manifest: ConversationExportManifest): Buffer => Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

/** Every part ticked: the look first answers what the file would hold with nothing left unticked. */
const EVERY_PART = Object.fromEntries(CONVERSATION_EXPORT_PARTS.map((part) => [part, true])) as Record<ConversationExportPart, boolean>

/**
 * THE LOOK FIRST: what the file would hold with every part ticked, part by part, with the files left out, the files
 * not screened, the scrub's counts and every finding. It writes nothing, and it does not search for key hashes: that
 * is asked at the export, which names the entry if it finds one.
 */
export function lookAtAConversationExport(workspaceId: string, runId: string): ConversationExportLook {
  const gathered = gather(workspaceId, runId, EVERY_PART)
  const manifest = theManifestBytes(theManifestOf(gathered))
  const pieceOf = (piece: ConversationExportPiece, state: 'carried' | 'not-there', entries: { name: string; bytes: number }[], tally: ATally) => ({
    piece,
    state,
    entries,
    bytes: entries.reduce((sum, one) => sum + one.bytes, 0),
    scrub: theScrubOf(tally),
  })
  const sized = (entries: readonly AnEntry[]) => entries.map((one) => ({ name: one.name, bytes: one.bytes.length }))
  const stateOf = (piece: APiece): 'carried' | 'not-there' => (piece.state === 'carried' ? 'carried' : 'not-there')
  return {
    run: { id: gathered.runId, title: gathered.fields.title },
    runtime: gathered.runtime,
    pieces: [
      pieceOf('run', 'carried', [{ name: CONVERSATION_EXPORT_ENTRY.manifest, bytes: manifest.length }], gathered.fieldTally),
      pieceOf('conversation', 'carried', sized([gathered.conversation]), gathered.conversationTally),
      pieceOf('handover', stateOf(gathered.handover), sized(gathered.handover.entries), gathered.handover.tally),
      ...CONVERSATION_EXPORT_PARTS.map((part) => pieceOf(part, stateOf(gathered.parts[part]), sized(gathered.parts[part].entries), gathered.parts[part].tally)),
    ],
    leftOut: gathered.leftOut,
    notScreened: theEntriesOf(gathered).flatMap((one) => (one.text === null ? [{ piece: one.piece, entry: one.name, bytes: one.bytes.length }] : [])),
    findings: theFindingsOf(gathered),
  }
}

/**
 * THE EXPORT: the zip, with the parts the ask ticks. Nothing is made, and the answer is a coded refusal, when the
 * screen refuses a part, when an entry holds a key hash this office issued, or when there is something to look at
 * and the ask does not say the person has looked. It writes nothing.
 */
export function exportOneConversation(workspaceId: string, runId: string, ask: ConversationExportAsk): { fileName: string; zip: Buffer } {
  const gathered = gather(workspaceId, runId, ask.parts)
  const findings = theFindingsOf(gathered)
  const stops = findings.find((one) => one.severity === 'refused')
  if (stops !== undefined) {
    // A REFUSING FINDING IS IN A TEXT, so it names where. One that names nowhere, or a check that refuses for another
    // reason, is a screen this file was not written for, and it is said rather than turned into one of these two.
    if (stops.file === null) throw new Error(`The screen refused this conversation for ${stops.check} and named no file. Nothing was made.`)
    if (stops.check === 'home_directory_path') throw refused('conversationExportHomePath', { file: stops.file })
    if (stops.check === 'key_in_text') throw refused('conversationExportKeyInText', { file: stops.file })
    throw new Error(`The screen refused ${stops.file} for ${stops.check}, which this export has no refusal for. Nothing was made.`)
  }
  const manifest = theManifestOf(gathered)
  const entries: ZipEntry[] = [
    { name: CONVERSATION_EXPORT_ENTRY.manifest, bytes: theManifestBytes(manifest) },
    ...theEntriesOf(gathered).map((one) => ({ name: one.name, bytes: one.bytes })),
  ]
  const held = keyHashesThisOfficeHolds()
  if (held.size > 0) {
    for (const entry of entries) {
      // WHAT IS FOUND IS NEVER PRINTED: only the entry it is in is named.
      const found = new Set<string>()
      hashesFoundInTheseBytes(entry.bytes, held, found)
      if (found.size > 0) throw refused('conversationExportKeyHash', { file: entry.name })
    }
  }
  const toLookAt = findings.filter((one) => one.severity === 'look_before_you_paste').length
  if (!ask.looked && toLookAt > 0) throw refused('conversationExportLookFirst', { count: toLookAt })
  return { fileName: conversationExportFileName(gathered.runId), zip: writeZip(entries) }
}
