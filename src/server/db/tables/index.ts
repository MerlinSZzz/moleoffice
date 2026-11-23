// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS AND GRANT TABLES, one file for each table and re-exported by schema.ts.
 *
 * These declarations moved out of schema.ts and keep the registry entries, archive pages, order and
 * restore proof they already had. They are not schema parts: a part is given its archive and restore
 * answers beside its declaration, and these keep the answers the original registry holds. schema.ts
 * re-exports them so every caller and drizzle-kit still see them through schema.ts, and authored-table-of.ts
 * reads them there for `AUTHORED_TABLE_OF` and `WORKSPACE_COLUMN`.
 */

// This line keeps the file a module, whatever it names.
export {}
export * from './office-scene-settings.ts'
export * from './office-map-layouts.ts'
export * from './preview-root-additions.ts'
export * from './price-table.ts'
export * from './quick-input-list.ts'
export * from './quick-input-asks.ts'
export * from './presses-for-the-person.ts'
export * from './what-the-grant-carries.ts'
