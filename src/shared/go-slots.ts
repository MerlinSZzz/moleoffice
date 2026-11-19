// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY SLOTS, AS THE SERVER AND THE SETTINGS PAGE BOTH READ THEM. The reasons are in
 * src/server/lib/keyrouter/key-slots.ts.
 *
 * No field holds a key: a slot is said by its provider, its id, its label and the start of its key's sha256.
 */

/** One provider's slot, in the order the file holds it. */
export interface GoSlotOnScreen {
  /** The slot's id in the key slots file, e.g. `go-1`. */
  id: string
  /** The name the owner gave it. */
  label: string
  /** `sha256:` and the first 12 hex digits of its key. */
  mark: string
}

/** Everything the Go section draws. The launcher's long-wait notice reads this list. */
export interface GoSlotsReading {
  /** The key slots file, as the page names it (`~` for the home folder). */
  file: string
  slots: GoSlotOnScreen[]
  /** One plain sentence saying what the file holds, or that it does not exist yet. */
  says: string
}

/** One slot of any routed provider, as the Settings page draws it. */
export interface KeySlotOnScreen extends GoSlotOnScreen {
  /** The provider's name in `THE_ROUTED_PROVIDERS`, e.g. `openrouter`. */
  provider: string
  /** The provider's name for a person, e.g. `OpenRouter`. */
  providerName: string
}

/** One provider a key slot may name. */
export interface KeySlotsProvider {
  /** The provider's name in `THE_ROUTED_PROVIDERS`, and in a slot. */
  id: string
  /** The provider's name for a person. */
  named: string
}

/** The selected Go slot and who selected it, without its key. */
export interface GoPin {
  slot: string
  who: string
  at: string
}

/** Everything the key slots section draws. */
export interface KeySlotsReading {
  /** The key slots file, as the page names it (`~` for the home folder). */
  file: string
  /** Every routed provider a new slot may name. */
  providers: KeySlotsProvider[]
  slots: KeySlotOnScreen[]
  pin: GoPin | null
  /** One plain sentence saying what the file holds, or that it does not exist yet. */
  says: string
}

/**
 * THE PROVIDER THE ADD ROW STARTS ON: OpenCode Go when the reading holds it, which is the old behaviour, so an
 * owner who pastes a Go key without choosing does not file it as the first provider in the list. A reading without
 * OpenCode Go starts on its first provider, and an empty reading still names OpenCode Go.
 */
export function theProviderTheAddRowStartsOn(providers: readonly KeySlotsProvider[]): string {
  if (providers.some((one) => one.id === 'opencode-go')) return 'opencode-go'
  return providers[0]?.id ?? 'opencode-go'
}
