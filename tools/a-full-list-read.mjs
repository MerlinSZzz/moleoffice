// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The rule lives in for-agents/, because the session hook and the registration tool ship and import it, and nothing
// from tools/ may be compiled into a bundle. The tools here read it from there.
export * from '../for-agents/a-full-list-read.mjs'
