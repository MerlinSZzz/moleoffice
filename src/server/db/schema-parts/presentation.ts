// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESENTATION AND SUBMISSION TABLES, one declaration to a file. `presentation_intent` is in
 * `presentation-intent.ts`, `panel_layouts` in `panel-layouts.ts`, `submission_baselines` in
 * `submission-baselines.ts` and `legacy_unsealed_runs` in `legacy-unsealed-runs.ts`.
 *
 * THIS FILE STAYS AS THE COMPATIBILITY BARREL. schema-parts/index.ts exports it, and schema.ts
 * imports the four tables from it, so neither has to change while the declarations are divided.
 * Each table keeps its existing archive and restore answers beside its own declaration.
 */
export * from './presentation-intent.ts'
export * from './panel-layouts.ts'
export * from './submission-baselines.ts'
export * from './legacy-unsealed-runs.ts'
