// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMES THE PUSH KEYS ARE KEPT UNDER.
 * `THE_PUSH_ENTRIES` was moved byte for byte out of src/server/lib/push.ts, with no change of behaviour.
 * That file re-exports it.
 */

/** The names the signing key and the devices are kept under in the office's key file. */
export const THE_PUSH_ENTRIES = { signingKey: 'push-signing-key', devices: 'push-devices' } as const
