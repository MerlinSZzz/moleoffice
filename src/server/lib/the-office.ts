// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `THE_OFFICE` was moved byte for byte out of src/server/lib/inspection.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { Actor } from './records.ts'
import { THE_OFFICE_WRITES_AS } from './the-offices-secretary-run.ts'

/**
 * MOLE OFFICE WRITING AS ITSELF, for the two fields the office keeps about a check.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT THE CALLER, AND IT WAS MEASURED RATHER THAN CHOSEN
 * ---------------------------------------------------------------------------------------
 *
 * Problem `c5t2eEAGjQjy`. `POST /api/checks/<run>/assembled` is called by the INSPECTOR, once per
 * check, before the model runs. Written as the caller, it left an update row by the inspector on a
 * record the worker had created — which is exactly what `whatTheInspectorChanged` looks for, so
 * `POST /api/checks/<run>` then refused the one act with 403 and named the inspector. Every check
 * the office started would have been unpostable, and the first one was.
 *
 * THE GUARD IS RIGHT AND IS NOT WEAKENED. Criterion C22 is that an inspector which fixes what it
 * found is no longer checking it, and a guard with an exception carved into it for one field is a
 * guard somebody will carve a second hole in. What was wrong was the attribution: neither of these
 * two fields is anybody's edit of the run. They are the office's bookkeeping ABOUT the run — what it
 * did when the finish was declared, and what one assembly of the check measured — and the office is
 * what writes them, which is what the session kind already says of both.
 *
 * `mole-office/the-api-server` is the name this server already writes under when it acts on its own,
 * and no registry holds it or ever will.
 */
export const THE_OFFICE: Actor = { type: THE_OFFICE_WRITES_AS.type, id: THE_OFFICE_WRITES_AS.id }
