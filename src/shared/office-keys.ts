// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYS THIS OFFICE HAS: ITS OWN TWO, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION AND THE MEASUREMENT BEHIND THE SHORTER LIST
 * ---------------------------------------------------------------------------------------
 *
 * Each runtime keeps its own key where it already keeps it and the office never copies it; the office keeps only its
 * OWN keys, in one file beside the database, written only from the Settings page, never in `.env` and never in the
 * database; the database holds names and "set or not set" only.
 *
 * MEASURED, the office calls exactly two providers directly: OpenRouter, for the two picture tools
 * and, since wave 13s round 41, for video review (tools/openrouter.mjs), and Moonshot, for the Kimi
 * CLI runtime. Anthropic, OpenAI and Zhipu are NOT office keys. The
 * office hands claude-code, codex and opencode no key at all, because those tools find their own
 * through HOME and PATH. So the office's own half lists two providers, and the other three are
 * asked read-only through each tool's own store.
 *
 * ---------------------------------------------------------------------------------------
 * NO VALUE IS EVER IN THIS FILE OR IN A REPLY BUILT FROM IT
 * ---------------------------------------------------------------------------------------
 *
 * Every field is a name, a boolean or a sentence. The value a person types goes to
 * `setProviderSecret` and never comes back: the office answers only whether one is set. The one
 * place a value leaves the office's file is the test press, which sends it to the provider and
 * keeps it out of every reply.
 */

/** The two providers the office itself calls, in the order the panel draws them. */
export const OFFICE_KEY_PROVIDERS = ['openrouter', 'moonshot'] as const

/** One of the office's own providers. */
export type OfficeKeyProvider = (typeof OFFICE_KEY_PROVIDERS)[number]

/** What each provider is called on the screen. A name, not a field. */
export const OFFICE_KEY_LABELS: Readonly<Record<OfficeKeyProvider, string>> = {
  openrouter: 'OpenRouter',
  moonshot: 'Moonshot',
}

/**
 * WHICH ENVIRONMENT LINE EACH PROVIDER FALLS BACK TO, named so a reader can find it.
 *
 * The file is read first and this line only when nothing is set there; it is what keeps an
 * installation that already had a key in `.env` working. The Kimi adapter reads MOONSHOT_API_KEY
 * under a second name, KIMI_API_KEY, and that is why the Moonshot row names both.
 */
export const OFFICE_KEY_SETTINGS: Readonly<Record<OfficeKeyProvider, string>> = {
  openrouter: 'OPENROUTER_API_KEY',
  moonshot: 'KIMI_API_KEY or MOONSHOT_API_KEY',
}

/** What each office key is used for, in one plain sentence a reader can act on. */
export const OFFICE_KEY_MEANS: Readonly<Record<OfficeKeyProvider, string>> = {
  openrouter: 'The office uses this for its OpenRouter tools: the two picture tools for avatars and portraits, and video review.',
  moonshot: 'The office uses this for a Kimi CLI run. Kimi CLI reads KIMI_API_KEY, and the owner keeps the same key under MOONSHOT_API_KEY.',
}

/**
 * WHAT PROTECTS THE FILE, SAID EXACTLY AND NOT MORE.
 *
 * Mode 600 is what the file is made with on Linux and the Mac. Windows has no such mode, so there
 * the file is given an access list with one entry, this user's, and the list is read back
 * (src/server/lib/keys.ts). That has not been run on Windows, so the words "unverified on Windows"
 * are part of the sentence rather than a footnote.
 */
export const THE_PROTECTION_IN_FORCE =
  'The office keeps its own keys in one file beside its database. On Linux and Mac the file can be read and written only by your user account. On Windows the file\'s access list lets only your user account read and write it, and that is unverified on Windows.'

/** One office key as the panel reads it. Never the value. */
export interface OfficeKeyOnScreen {
  provider: OfficeKeyProvider
  /** What it is called on the screen. */
  label: string
  /** What the office uses it for. */
  means: string
  /** The environment line it falls back to when the file holds nothing. A name, never a value. */
  setting: string
  /** Whether the office holds a key for it. The only thing a reply may say. */
  set: boolean
  /** Whether the test press can check it without spending. */
  testable: boolean
  /** One plain sentence saying what is set. */
  says: string
}

/** How each runtime's own key stands, as the office could honestly read it. */
export type RuntimeKeyState = 'set' | 'not-set' | 'nobody-has-looked'

/** One runtime's own key, asked read-only. */
export interface RuntimeKeyOnScreen {
  /** The runtime word, e.g. `codex`. */
  runtime: string
  /** What the runtime is called on the screen. */
  label: string
  /** Which provider's key it is, e.g. `OpenAI`. */
  provider: string
  /** What this key is for, in one plain sentence. */
  means: string
  state: RuntimeKeyState
  /** One plain sentence saying what was found, or that nobody has looked. */
  says: string
  /** The command or file the answer came from, so a reader can check it. */
  asked: string
}

/** Everything the keys section draws. */
export interface TheKeys {
  /** What protects the office's own key file. */
  protection: string
  /** The office's own two keys, in declaration order. */
  office: OfficeKeyOnScreen[]
  /** Each runtime's own key, read-only. */
  runtimes: RuntimeKeyOnScreen[]
}

/** What a test press found. It says answered, refused or unreachable, and never the key. */
export type KeyTestOutcome = 'answered' | 'refused' | 'unreachable' | 'cannot-be-tested-without-spending'

/** The result of one test press. */
export interface KeyTestResult {
  provider: OfficeKeyProvider
  outcome: KeyTestOutcome
  /** One plain sentence a reader can act on. Never the key. */
  says: string
}

/**
 * THE THREE RUNTIMES WHOSE OWN KEY THE OFFICE ASKS ABOUT READ-ONLY, in the order drawn.
 *
 * The provider column names whose key it is: Anthropic's for claude-code, OpenAI's for codex, and
 * Zhipu's for opencode's GLM model. None of them is an office key and the office copies none.
 */
export const RUNTIME_KEY_ROWS: ReadonlyArray<{
  runtime: string
  label: string
  provider: string
  means: string
}> = [
  {
    runtime: 'claude-code',
    label: 'Claude Code',
    provider: 'Anthropic',
    means: 'Claude Code finds this through its own login, and the office passes it no key.',
  },
  {
    runtime: 'codex',
    label: 'Codex',
    provider: 'OpenAI',
    means: 'Codex finds this through its own login, and the office passes it no key.',
  },
  {
    runtime: 'opencode',
    label: 'OpenCode',
    provider: 'Zhipu for GLM',
    means: 'OpenCode finds this in its own store, and the office passes it no key.',
  },
]

/** Whether a value is one of the office's own provider names. */
export function isOfficeKeyProvider(value: unknown): value is OfficeKeyProvider {
  return typeof value === 'string' && (OFFICE_KEY_PROVIDERS as readonly string[]).includes(value)
}

/**
 * WHAT THE PANEL SAYS BESIDE ONE OFFICE KEY.
 *
 * The words are built here rather than in the panel so the setting name and the sentence naming it
 * are one fact. They carry no value.
 */
export function officeKeySays(provider: OfficeKeyProvider, set: boolean): string {
  const label = OFFICE_KEY_LABELS[provider]
  if (!set) {
    return `No ${label} key is set in the office's file. A run that needs it falls back to ${OFFICE_KEY_SETTINGS[provider]} in the environment.`
  }
  return `A ${label} key is set in the office's file.`
}
