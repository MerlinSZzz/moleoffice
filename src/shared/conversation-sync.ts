// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATION SYNC: the words and rules a per-workspace opt-in copy of an agent's conversation is read and
 * written by. Wave 13s round 242, on a requirement row.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * A run's conversation lives in its runtime's own store, not in Mole Office. The office already records, on every run,
 * the runtime, the provider's conversation id and the working directory. This module turns those facts into a place
 * for the runtimes this release can find (their stores are declared below, from the runtime declaration), and it turns
 * what is found there into a copy the project's own durable export can carry.
 *
 * It is NOT a second conversation store: the copy is written on the run's own session record, which is already the
 * office's record of that conversation and already travels with the project's data. It is NOT the chat: the chat and
 * the conversation pages are another line's, and this module draws nothing.
 *
 * ---------------------------------------------------------------------------------------
 * SCRUBBING AND THE PATH MAP
 * ---------------------------------------------------------------------------------------
 *
 * Transcripts carry keys and absolute home paths. Every copy is scrubbed before it is stored: a secret is REPLACED by
 * the office's own marker (src/config/secret-shapes.mjs), and every absolute home or checkout path that the copy names
 * becomes a token (`<home>`, `<checkout:1>`, ...). A redaction that leaves the words intact is not a scrub, so the
 * marker replaces the value rather than asterisking part of it.
 *
 * The tokens are the path map. The map is stored beside the workspace's opt-in, not in the report: each entry is the
 * token, the path it stood for on this machine, and the path it stands for where the conversation is resumed. Restoring
 * a copy puts the mapped paths back and refuses, naming the token, when an entry is missing. That refusal is the point:
 * a missing map entry is a known gap, not a conversation that starts from zero.
 */

import { THE_PROGRAM_A_RUNTIME_RUNS } from '../config/runtime-native-providers.mjs'
import { withSecretsMarked } from '../config/secret-shapes.mjs'

// ===================================================================================== the bounds

/** The most conversations one sync copies. The ones after it are counted and named, never silently dropped. */
export const CONVERSATION_SYNC_MAX_FILES = 25

/** The largest conversation one sync copies. A bigger one is left out with its size and a sentence. */
export const CONVERSATION_SYNC_MAX_BYTES = 256 * 1024

/** How many of a workspace's latest runs one sync reads, in ONE bounded query. */
export const CONVERSATION_SYNC_READS_RUNS = 200

/** The page a read returns when the caller names none, and the most it may ask for. */
export const CONVERSATION_SYNC_PAGE = 50
export const CONVERSATION_SYNC_PAGE_MAX = 200

/** The prefix of the one settings row a workspace's opt-in and path map live in. */
export const CONVERSATION_SYNC_SETTING_PREFIX = 'conversation-sync:'

/** The row a workspace's opt-in is stored in, from the workspace id. */
export function theConversationSyncSetting(workspaceId: string): string {
  return `${CONVERSATION_SYNC_SETTING_PREFIX}${workspaceId}`
}

// ===================================================================================== the runtimes

/**
 * THE RUNTIMES WHOSE CONVERSATION THIS RELEASE CAN FIND, as a subset of the runtime declaration.
 *
 * The keys are runtime words from `THE_PROGRAM_A_RUNTIME_RUNS` (src/config/runtime-native-providers.json). A test
 * holds every key here to that declaration, so this is not a second list of runtimes: it is which of the declared ones
 * have a store this release reads. A runtime absent here is not a missing tool; its conversation is one this release
 * cannot find, and a run of it is said so rather than guessed at.
 *
 * Claude Code and Codex keep one file for a conversation. OpenCode keeps its sessions in a SQLite database and writes
 * or reads one session as the JSON its own `export` and `import` commands use. That is still one conversation this
 * release can find, so it is named here rather than left out as a tool it does not know.
 */
export const CONVERSATION_FILE_STORES = {
  'claude-code': 'its folder of one transcript for each working directory',
  codex: 'its sessions folder',
  opencode: 'its SQLite database, one export for each session',
} as const satisfies Partial<Record<keyof typeof THE_PROGRAM_A_RUNTIME_RUNS, string>>

export type AConversationRuntime = keyof typeof CONVERSATION_FILE_STORES

/** Whether this runtime's conversation is one this release reads. */
export function theRuntimeHasAConversationFile(runtime: string): runtime is AConversationRuntime {
  return Object.hasOwn(CONVERSATION_FILE_STORES, runtime) && Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, runtime)
}

/**
 * THE RUNTIME MARK ON A CONVERSATION LINE: the run's stored runtime word, and whether it is a runtime this office
 * declares. It is read from the stored word and from nothing else — not from the store's path, not from the text, not
 * from a guess. No runtime recorded says so; an unrecognised word is still the stored word, marked unknown rather than
 * replaced by a runtime this office does know.
 */
export function theRuntimeMark(stored: string | null): { word: string; known: boolean } {
  if (stored === null || stored.trim() === '') return { word: 'runtime not recorded', known: false }
  return { word: stored, known: Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, stored) }
}

// ===================================================================================== the states

/** What a run's conversation copy is: the store was read, or the reason it was not. */
export const CONVERSATION_SYNC_STATES = [
  'synced',
  'missing',
  'unreadable',
  'too-large',
  'deleted',
  'not-synced',
] as const

export type ConversationSyncState = (typeof CONVERSATION_SYNC_STATES)[number]

/** One path the copy was scrubbed with: its token, this machine's path, and the path it maps to elsewhere. */
export interface ConversationPath {
  token: string
  original: string
  mapped: string | null
}

/** A scrubbed copy of one run's conversation, as it is stored on that run's session record. */
export interface ConversationCopy {
  state: ConversationSyncState
  /** The run's stored runtime word, or `runtime not recorded`. */
  runtime: string
  /** The provider's own id for the conversation, as the run stored it. */
  providerSession: string
  /** The file it was read from, with the path tokens in it. */
  source: string
  /** The scrub's hash of the bytes that were stored. */
  sha256: string
  bytes: number
  capturedAt: string
  /** When this copy last changed. An unchanged file makes no new copy and does not move it. */
  lastChangedAt: string
  /** How many secret-shaped pieces were replaced, and which shapes they were. */
  secretsRemoved: number
  secretShapes: string[]
  /** How many absolute home or checkout paths were replaced by a token. */
  pathsMapped: number
  /** One sentence: what this state is, in a reader's words. */
  says: string
  /** THE SCRUBBED TRANSCRIPT. Absent when nothing was read, or when the file was too large to copy. */
  text?: string
}

/** The per-workspace opt-in and path map, as the one settings row holds it. */
export interface ConversationSyncSetting {
  enabled: boolean
  paths: ConversationPath[]
  lastRunAt: string | null
  lastOutcome: ConversationSyncOutcome | null
}

/** What one sync did, in counts and a sentence. */
export interface ConversationSyncOutcome {
  at: string
  synced: number
  missing: number
  unreadable: number
  tooLarge: number
  deleted: number
  overCount: number
  notSynced: number
  says: string
}

/** One line of the sync read: a conversation, its runtime and the run it came from. No transcript. */
export interface ConversationLine {
  runId: string
  title: string
  runtime: { word: string; known: boolean }
  providerSession: string | null
  state: ConversationSyncState
  bytes: number
  sha256: string | null
  capturedAt: string | null
  lastChangedAt: string | null
  says: string
}

/** The sync's own read. */
export interface ConversationSyncReply {
  workspaceId: string
  enabled: boolean
  paths: ConversationPath[]
  conversations: ConversationLine[]
  total: number
  left: number
  reading: number
  lastRunAt: string | null
  lastOutcome: ConversationSyncOutcome | null
  says: string
}

// ===================================================================================== the paths

/**
 * THE PATH MAP THIS MACHINE STARTS FROM: the home folder, then each distinct working directory a run named.
 *
 * The checkout tokens are numbered in the order the directories were first named, which is the order the sync reads
 * them in. The list is sorted longest path first when it is used, so a checkout inside the home is replaced whole
 * rather than becoming `<home>/project`.
 */
export function conversationPathsFor(env: Record<string, string | undefined>, workingDirectories: readonly string[]): ConversationPath[] {
  const paths: ConversationPath[] = []
  const home = (env['HOME'] ?? '').trim()
  if (home !== '') paths.push({ token: '<home>', original: home, mapped: null })
  let index = 0
  const seen = new Set<string>()
  for (const directory of workingDirectories) {
    const one = directory.trim()
    if (one === '' || seen.has(one)) continue
    seen.add(one)
    index += 1
    paths.push({ token: `<checkout:${String(index)}>`, original: one, mapped: null })
  }
  return paths
}

/** The paths to replace, longest first, so a nested checkout is replaced before the home that holds it. */
function longestFirst(paths: readonly ConversationPath[]): ConversationPath[] {
  return [...paths].filter((one) => one.original !== '').sort((a, b) => b.original.length - a.original.length)
}

/** One file path with its home and checkout paths replaced by their tokens, for a metadata line that is stored. */
export function scrubConversationPath(path: string, paths: readonly ConversationPath[]): string {
  let screened = path
  for (const one of longestFirst(paths)) screened = screened.split(one.original).join(one.token)
  return withSecretsMarked(screened).text
}

/**
 * ONE TRANSCRIPT, SCRUBBED: every home or checkout path replaced by its token, then every secret-shaped piece
 * replaced by the office's marker. The returned counts are what the copy says it did, so a reader is never told only
 * that it was "sanitised".
 */
export function scrubConversation(
  text: string,
  paths: readonly ConversationPath[],
): { text: string; pathsMapped: number; secretsRemoved: number; secretShapes: string[] } {
  let screened = text
  let pathsMapped = 0
  for (const one of longestFirst(paths)) {
    const pieces = screened.split(one.original)
    if (pieces.length > 1) {
      pathsMapped += pieces.length - 1
      screened = pieces.join(one.token)
    }
  }
  const secrets = withSecretsMarked(screened)
  return { text: secrets.text, pathsMapped, secretsRemoved: secrets.marked.length, secretShapes: secrets.marked }
}

/**
 * A COPY PUT BACK FOR ANOTHER MACHINE: every token replaced by the path mapped for it, or by an override for this one
 * restore. When the text names a token with no mapping, nothing is written and the token is returned by name.
 */
export function restoreConversation(
  text: string,
  paths: readonly ConversationPath[],
  overrides: Readonly<Record<string, string>> = {},
): { text: string; missing: string | null } {
  let restored = text
  for (const one of paths) {
    if (!restored.includes(one.token)) continue
    const target = overrides[one.token] ?? one.mapped
    if (target === null || target.trim() === '') return { text, missing: one.token }
    restored = restored.split(one.token).join(target)
  }
  // A TOKEN NO ENTRY NAMES is a map this copy was not written with, and it is refused by its own name rather than left
  // in a file Claude Code or Codex would read with a placeholder where a path belongs.
  const unknown = /<home>|<checkout:\d+>/u.exec(restored)
  return unknown === null ? { text: restored, missing: null } : { text, missing: unknown[0] }
}

