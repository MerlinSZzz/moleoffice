// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING TABLES, each declared in a file of its own. The file names the table in kebab case:
 * `allocations` is in `allocations.ts`, `planning_capacity` in `planning-capacity.ts`, and so on.
 *
 * THIS FILE STAYS AS THE COMPATIBILITY BARREL. schema-parts/index.ts exports it and schema.ts
 * imports the nine tables from it, so neither changes while the declarations are divided. Each
 * table keeps its existing archive and restore answers beside its own declaration.
 */
export * from './allocations.ts'
export * from './planning-capacity.ts'
export * from './planning-intents.ts'
export * from './plans.ts'
export * from './plan-lines.ts'
export * from './plan-line-revisions.ts'
export * from './counter-rows.ts'
export * from './planning-recurrences.ts'
export * from './work-windows.ts'
