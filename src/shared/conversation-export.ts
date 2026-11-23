// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RUN'S CONVERSATION AS ONE FILE: the words and shapes the server, the press and the import share.
 *
 * The file is a zip. It always holds the manifest, the run's conversation read whole and scrubbed, and the agent's
 * current handover when there is one. Four more parts travel only when the person ticks them: the notebook, the
 * memory folder, the whole personal space, and the name and address. A part the agent lacks is named not there; that
 * is an answer, not an error.
 *
 * The reading is src/server/lib/conversation-export.ts. The press is src/web/components/ConversationExportPress.tsx.
 * A later slice reads the same file back in, so every entry name and every manifest field below is a contract.
 */

import type { ScreenCheckName, ScreenSeverity } from './screen-closed-set.ts'

/** The word the manifest starts with, so a reader knows which shape it is reading. */
export const CONVERSATION_EXPORT_FORMAT = 'mole-office-conversation/1'

/** The four parts the person may tick, in the order the press draws them. */
export const CONVERSATION_EXPORT_PARTS = ['notebook', 'memory', 'space', 'address'] as const

export type ConversationExportPart = (typeof CONVERSATION_EXPORT_PARTS)[number]

/** What became of one part: it is in the file, the person left it unticked, or the agent has none. */
export type ConversationExportPartState = 'carried' | 'not-asked-for' | 'not-there'

/** Every piece of the file a finding or a size can belong to: the manifest's own fields, the two that always go, and the four parts. */
export type ConversationExportPiece = 'run' | 'conversation' | 'handover' | ConversationExportPart

/**
 * WHY A FILE WAS LEFT OUT. Over the line: the file would take the export past the bytes one export carries. Over the
 * count: past the files one export carries. Name unfit: a zip cannot hold the name. Not a markdown file, a folder: the
 * memory folder carries only the markdown files directly in it. Not an ordinary file: a link, a socket or a device.
 */
export type ConversationExportLeftOutWhy =
  | 'over-the-line'
  | 'over-the-count'
  | 'name-unfit'
  | 'not-a-markdown-file'
  | 'a-folder'
  | 'not-an-ordinary-file'

/** The entry names in the file. A folder name ends in a slash, and the files under it keep their own relative names. */
export const CONVERSATION_EXPORT_ENTRY = {
  manifest: 'manifest.json',
  /** A Claude Code or Codex conversation: the runtime's own lines, scrubbed. */
  conversationLines: 'conversation.jsonl',
  /** An OpenCode conversation: the runtime's own export, scrubbed as JSON. */
  conversationWhole: 'conversation.json',
  handover: 'handover.md',
  notebook: 'notebook.json',
  address: 'address.json',
  memory: 'memory/',
  space: 'space/',
} as const

/**
 * THE MANIFEST'S OWN FIELDS THAT ARE TEXT A PERSON WROTE, each screened on its own and named by this label in a finding
 * or a refusal. The manifest as a whole is not screened: its sha256 has the shape of an issued key.
 */
export const CONVERSATION_EXPORT_RUN_FIELD = {
  title: 'manifest.json run.title',
  agentHandle: 'manifest.json run.agentHandle',
  cardName: 'manifest.json run.cardName',
  office: 'manifest.json office.name',
  handoverWriter: 'manifest.json handover.writtenBy.name',
} as const

/** What a scrub did to one piece: paths replaced by their tokens, and secret-shaped words marked. */
export interface ConversationExportScrub {
  pathsMapped: number
  secretsRemoved: number
  secretShapes: string[]
}

/** One piece as the look first sees it: whether it would go, its entries with their sizes, and what the scrub did. */
export interface ConversationExportPieceLook {
  piece: ConversationExportPiece
  state: 'carried' | 'not-there'
  entries: { name: string; bytes: number }[]
  bytes: number
  scrub: ConversationExportScrub
}

/** One file that stays behind, with why. `bytes` is null when the size was not read, for a folder. */
export interface ConversationExportLeftOut {
  piece: ConversationExportPiece
  file: string
  why: ConversationExportLeftOutWhy
  bytes: number | null
}

/** One file that travels byte for byte, because it is not text, so neither the scrub nor the screen read it. */
export interface ConversationExportNotScreened {
  piece: ConversationExportPiece
  entry: string
  bytes: number
}

/**
 * One thing the screen found. `file` is the entry or the manifest field it is in. A finding about the whole file,
 * such as the names the screen cannot check, has neither a piece nor a file.
 */
export interface ConversationExportFinding {
  piece: ConversationExportPiece | null
  file: string | null
  check: ScreenCheckName
  severity: ScreenSeverity
  says: string
}

/** The look first: what the file would hold with every part ticked. It writes nothing. */
export interface ConversationExportLook {
  run: { id: string; title: string }
  runtime: string
  pieces: ConversationExportPieceLook[]
  leftOut: ConversationExportLeftOut[]
  notScreened: ConversationExportNotScreened[]
  findings: ConversationExportFinding[]
}

/** The manifest, as the import will read it. Nothing in it is an id of this office except the run's own id. */
export interface ConversationExportManifest {
  format: typeof CONVERSATION_EXPORT_FORMAT
  madeAt: string
  office: { name: string }
  run: { id: string; title: string; agentHandle: string | null; cardName: string | null }
  runtime: { word: string; conversationId: string }
  conversation: { entry: string; bytes: number; sha256: string }
  /** Every text part's scrub added up, and the path tokens the carried text holds, by token only. */
  scrub: ConversationExportScrub & { tokens: string[] }
  handover: {
    state: 'carried' | 'not-there'
    entry: string | null
    writtenAt: string | null
    writtenBy: { kind: 'person' | 'agent'; name: string | null } | null
  }
  parts: Record<ConversationExportPart, { state: ConversationExportPartState; entries: string[] }>
  leftOut: ConversationExportLeftOut[]
  /** The entries carried byte for byte because they are not text. */
  notScreened: string[]
}

/** What the press sends: each part ticked or not, and whether the person has looked at the findings. */
export interface ConversationExportAsk {
  parts: Record<ConversationExportPart, boolean>
  looked: boolean
}

/** The file's name when it is saved. The run id is letters, digits, underscore and hyphen, so it is a safe name. */
export function conversationExportFileName(runId: string): string {
  return `conversation-${runId}.zip`
}

/** The refusals of the two export doors and the values each one needs. Nothing is made after any of them. */
export const CONVERSATION_EXPORT_REFUSAL_CODES = {
  conversationExportNoRuntime: {},
  conversationExportRuntimeNotRead: { runtime: 'string' },
  conversationExportNoConversationId: {},
  conversationExportConversationIdUnfit: {},
  conversationExportNoWorkingDirectory: {},
  conversationExportNotThere: {},
  conversationExportUnreadable: {},
  conversationExportOverTheLine: { megabytes: 'number' },
  conversationExportHomePath: { file: 'string' },
  conversationExportKeyInText: { file: 'string' },
  conversationExportKeyHash: { file: 'string' },
  conversationExportLookFirst: { count: 'number' },
} as const

export type ConversationExportRefusalCode = keyof typeof CONVERSATION_EXPORT_REFUSAL_CODES
