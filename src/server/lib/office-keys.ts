// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYS THIS OFFICE HOLDS, AND THE ONES EACH RUNTIME HOLDS FOR ITSELF. Criterion U2.
 *
 *   `theKeys()`            everything the Settings panel draws, reading the office's own file and
 *                          asking each runtime's store read-only
 *   `setTheOfficeKey()`    the one writer, through `setProviderSecret` and nowhere else
 *   `testTheOfficeKey()`   a metadata call that costs nothing, or a refusal to spend
 *
 * ---------------------------------------------------------------------------------------
 * THE OFFICE'S ANSWER IS SET-OR-NOT-SET, NEVER A VALUE
 * ---------------------------------------------------------------------------------------
 *
 * The office's own half asks `aProviderSecretIsSet`, which is a boolean. The runtime half asks each
 * tool through `whatAnAgentToolSaysAboutItsKey`. Neither returns a value to a caller. The one place a
 * value leaves the file is the test press, which sends it to the provider and keeps it out of the
 * reply: `testTheOfficeKey` reads it, hands it to `fetch`, and returns one of four words.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEST PRESS SPENDS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Where the provider has a metadata call that costs nothing it is used: OpenRouter's own key door and
 * Moonshot's model list. Both report whether the key is accepted and neither generates a
 * completion. The office's own two providers both have one, so the fourth outcome —
 * `cannot-be-tested-without-spending` — is not reachable for either today; it is kept because a
 * provider added later may have none, and the answer then has to be honest rather than a spend.
 *
 * THE PROVIDER IS INJECTABLE SO NO TEST TOUCHES THE NETWORK. `send` defaults to the real `fetch`; a
 * test hands in its own.
 */
import { setProviderSecret } from './keys.ts'
import { aProviderSecretIsSet } from './a-provider-secret-is-set.ts'
import { providerKeyFromTheOfficeFile } from '../../config/provider-keys.mjs'
import { osProbe } from './resources.ts'
import {
  OFFICE_KEY_LABELS,
  OFFICE_KEY_MEANS,
  OFFICE_KEY_PROVIDERS,
  OFFICE_KEY_SETTINGS,
  RUNTIME_KEY_ROWS,
  THE_PROTECTION_IN_FORCE,
  officeKeySays,
  type KeyTestResult,
  type OfficeKeyOnScreen,
  type OfficeKeyProvider,
  type RuntimeKeyOnScreen,
  type TheKeys,
} from '@shared/office-keys.ts'

/** Where each provider's free metadata call lives. A key door for OpenRouter, a model list for Moonshot. */
const THE_FREE_CHECK: Readonly<Record<OfficeKeyProvider, { url: string; what: string }>> = {
  openrouter: { url: 'https://openrouter.ai/api/v1/key', what: 'the OpenRouter key door' },
  moonshot: { url: 'https://api.moonshot.ai/v1/models', what: "Moonshot's model list" },
}

/** The office's own two keys, as the panel reads them. Never a value. */
function theOfficeKeys(): OfficeKeyOnScreen[] {
  return OFFICE_KEY_PROVIDERS.map((provider) => {
    const set = aProviderSecretIsSet(provider)
    return {
      provider,
      label: OFFICE_KEY_LABELS[provider],
      means: OFFICE_KEY_MEANS[provider],
      setting: OFFICE_KEY_SETTINGS[provider],
      set,
      testable: true,
      says: officeKeySays(provider, set),
    }
  })
}

/**
 * EACH RUNTIME'S OWN KEY, ASKED READ-ONLY.
 *
 * A PROBE THAT DOES NOT DESCRIBE THIS ANSWERS `nobody-has-looked` and does NOT fall back to the real
 * machine. That is the same refusal `processTable` and `checkout` make, and it is what keeps a test
 * probe from quietly reading the machine it was built to stand in for.
 */
export function theRuntimesOwnKeys(): RuntimeKeyOnScreen[] {
  const probe = osProbe()
  return RUNTIME_KEY_ROWS.map((row) => {
    const answer = probe.whatAnAgentToolSaysAboutItsKey?.(
      row.runtime as 'claude-code' | 'codex' | 'opencode',
    ) ?? {
      state: 'nobody-has-looked' as const,
      says: `Not looked at: the machine probe this office is reading under does not ask ${row.label} about its key.`,
      asked: 'no command, because this probe has no way to ask',
    }
    return {
      runtime: row.runtime,
      label: row.label,
      provider: row.provider,
      state: answer.state,
      says: answer.says,
      asked: answer.asked,
    }
  })
}

/** Everything the keys section draws. */
export function theKeys(): TheKeys {
  return {
    protection: THE_PROTECTION_IN_FORCE,
    office: theOfficeKeys(),
    runtimes: theRuntimesOwnKeys(),
  }
}

/**
 * SET ONE OF THE OFFICE'S OWN KEYS. The one writer, through `setProviderSecret` and nowhere else.
 *
 * The value goes into the file and nowhere else: nothing here keeps it, and the answer is the whole
 * reading, which carries booleans and sentences and no value. An empty value is refused by the route
 * before this is reached.
 */
export function setTheOfficeKey(provider: OfficeKeyProvider, value: string): TheKeys {
  setProviderSecret(provider, value)
  return theKeys()
}

/**
 * TEST ONE OF THE OFFICE'S OWN KEYS WITH A CALL THAT COSTS NOTHING.
 *
 * IT READS THE FILE AND NOT THE ENVIRONMENT. The office's own key is the one in its own file; the
 * environment line is a reader's fall-back and not a key the office holds, so a press with nothing in
 * the file says so rather than testing somebody else's line.
 *
 * NEVER A COMPLETION. The two calls above report whether the key is accepted; neither asks a model
 * for an answer. A provider with no such call gets `cannot-be-tested-without-spending`.
 *
 * THE REPLY SAYS ONE OF FOUR WORDS AND NEVER THE KEY, ITS PREFIX OR ANY PART OF IT. A refusal from
 * the provider is reported by its status and not by its body, because a body could echo anything.
 */
export async function testTheOfficeKey(
  provider: OfficeKeyProvider,
  send: typeof fetch = fetch,
): Promise<KeyTestResult> {
  const label = OFFICE_KEY_LABELS[provider]
  const reading = providerKeyFromTheOfficeFile(provider)
  if (reading.value === null) {
    return {
      provider,
      outcome: 'refused',
      says: `No ${label} key is set in the office's file, so there is nothing to test. Set one first.`,
    }
  }
  const check = THE_FREE_CHECK[provider]
  let response: Response
  try {
    response = await send(check.url, { headers: { authorization: `Bearer ${reading.value}` } })
  } catch (err) {
    return {
      provider,
      outcome: 'unreachable',
      says: `${label} could not be reached, so this key was not tested. ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (response.ok) {
    return {
      provider,
      outcome: 'answered',
      says: `The ${label} key was accepted by ${check.what}. Nothing was generated and nothing was spent.`,
    }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      provider,
      outcome: 'refused',
      says: `The ${label} key was refused by ${check.what} (HTTP ${String(response.status)}).`,
    }
  }
  return {
    provider,
    outcome: 'unreachable',
    says: `${check.what} answered HTTP ${String(response.status)}, so this key could not be checked.`,
  }
}
