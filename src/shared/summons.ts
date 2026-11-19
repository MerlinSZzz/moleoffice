// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUMMONS, AS THE SERVER, THE SETTINGS PAGE AND THE MAIL TOOL READ IT. The reasons for
 * each rule are in src/server/lib/summons.ts. The office holds no mail setting: the mail
 * is the mail tool's, which reads the summonses (ASummonsRead) and is installed by the person's press (TheMailTool),
 * by a decision.
 */

/** The urgencies a summons may carry. */
export const SUMMONS_URGENCIES = ['now', 'soon'] as const
export type SummonsUrgency = (typeof SUMMONS_URGENCIES)[number]

/** The longest title a summons carries: one line, so the office's words stay in the office. */
export const THE_LONGEST_TITLE = 120

/**
 * ONE SUMMONS, AS THE READING DOOR ANSWERS IT: who called, how urgent, the title and when. A tool
 * that takes a summons to them another way (the mail tool) reads these with a key of its own, and
 * nothing else. No address,
 * no password and no other words of the office are in it.
 */
export interface ASummonsRead {
  /** The message the summons wrote to them, which is also the cursor the next read starts after. */
  id: string
  /** When the summons was made, local wall clock. */
  at: string
  /** Who called, as the name the mail signs with. */
  who: string
  urgency: SummonsUrgency
  /** The one-line title, as the mail carries it. */
  title: string
}

/** What GET /api/office/summonses answers: the summonses after the cursor, oldest first, and one sentence. */
export interface TheSummonsesRead {
  summonses: ASummonsRead[]
  says: string
}

/** What the summons door answers the secretary who called: the message it wrote, and how many devices were told. */
export interface SummonsDone {
  /** The id of the message to the person, written whatever became of the push. */
  message: string
  /** How many of the devices the person allowed were told by push. */
  told: number
  /** One sentence, naming no address. */
  says: string
}

/**
 * THE MAIL TOOL AS THE PERSON'S SETTINGS PAGE SHOWS IT. The summons mail is a tool of their own login, installed by
 * the person's press. Its settings fold open in its entry on the Settings
 * page, which asks the tool itself on this computer. src/server/lib/mailtool.ts reads it.
 */
export interface TheMailTool {
  /** The person's live tool key, made and last used at these times; null after take-back or before install. */
  key: { madeAt: string; lastUsedAt: string | null } | null
  /** Whether the key in its folder proves the person's tool or its old live agent. */
  keyWorks: boolean | null
  /** Whether the unit is there: written by the press, there but not the press's, or not there. */
  unit: 'installed' | 'not the press’s' | 'not installed'
  /** Whether systemd says the service runs; null when systemd did not answer. */
  running: boolean | null
  /**
   * Whether systemd starts the service at the person's login: false once their press turned the tool off,
   * null when systemd did not
   * say.
   */
  enabled: boolean | null
  /**
   * Where the tool answers on this computer, as http://127.0.0.1:<port>/?s=<secret>, or null while it has not said.
   * The person's Settings page takes the port and the secret from it and asks the tool there (src/web/lib/the-mail-tool.ts).
   */
  page: string | null
  says: string
}

/** What the person's press that installs the mail tool did. */
export interface TheMailToolInstalled {
  /** Whether this press made the person's tool key, by H-forI_Vk5H7. */
  keyMade: boolean
  /** Each thing written, in words; empty when nothing was. */
  wrote: string[]
  service: 'started' | 'restarted' | 'already running'
  says: string
}

/**
 * What the person's press that turns the mail tool off did. Nothing is uninstalled: the install
 * press turns it back on.
 */
export interface TheMailToolDisabled {
  /** Whether it ran or started at the person's login before the press, or was off already. */
  service: 'turned off' | 'already off'
  says: string
}

/** The person's Settings press took the tool key back; its next install makes a new one. */
export interface TheMailToolKeyTakenBack {
  takenBack: boolean
  says: string
}
