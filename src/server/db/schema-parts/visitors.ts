// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VISITORS TABLES, each declared in a file of its own. The file names the table in kebab case:
 * `installation` is in `installation.ts`, `worlds` in `worlds.ts`, `visits` in `visits.ts`,
 * `visitor_credentials` in `visitor-credentials.ts`, `trusted_machines` in
 * `trusted-machines.ts` and `visitor_requests` in `visitor-requests.ts`.
 *
 * THIS FILE STAYS AS THE COMPATIBILITY BARREL. schema-parts/index.ts exports it and schema.ts
 * imports the six tables from it, so neither changes while the declarations are divided. Each
 * table keeps its existing archive and restore answers beside its own declaration.
 */
export * from './installation.ts'
export * from './worlds.ts'
export * from './visits.ts'
export * from './visitor-credentials.ts'
export * from './trusted-machines.ts'
export * from './visitor-requests.ts'
