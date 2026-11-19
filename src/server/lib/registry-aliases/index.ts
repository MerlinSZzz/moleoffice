// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVED TO src/server/db/registry-aliases/index.ts, so the database layer imports nothing from src/server/lib.
 * This path re-exports it, so a reader of this path reads the same module.
 */
export * from '../../db/registry-aliases/index.ts'
