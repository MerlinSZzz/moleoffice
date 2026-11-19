// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// 3glux5orTv2k; PFXqjfLKEsqi: consumers use the same private-file check as setup, on every read.
import { readPrivateKey, Refusal, accessRefusal } from './keycheck.mjs'

export function readKey(file, { prefix = '', min = 1, lang } = {}) {
  try { return readPrivateKey(file, prefix, min, lang) } catch (error) {
    // System diagnostics must never disclose a key or a stack to the person.
    throw error instanceof Refusal ? error : accessRefusal(lang)
  }
}
