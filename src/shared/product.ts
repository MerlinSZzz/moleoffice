// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS PRODUCT IS CALLED, IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The product was renamed from PanelX to Mole Office on 28 August 2026. Before that rename the
 * name was written out as a literal in 11,860 places and there was no constant at all, so the
 * rename had to be 11,860 independent edits and any one of them could have been missed without
 * anything failing.
 *
 * This file is the answer to that. Anything that draws the product's name for a person to read
 * imports it from here. A future rename is then one edit plus a check of the places that cannot
 * import — the plain-JavaScript tools, the HTML shell, and the documents.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * It is not a place to build the rest of the product's identity out of. The HTTP header prefix,
 * the environment-variable prefix and the database filename are deliberately written out as
 * literals where they are used, because a check reads them there: tests/config.test.ts scans the
 * source for the literal environment names, and it can only do that if they are literal.
 *
 * Sentences are not composed from this constant either. A sentence with the name spliced into it
 * is harder to read in the source than the sentence written out, and it hides the length of the
 * name from whoever is laying the sentence out. Use this constant where the name stands alone as
 * a label; write the name out inside prose.
 *
 * The name that stayed behind is the workspace id `panelx`. That is a stored key on 23,441 rows
 * and it is a historical identifier on purpose. See src/server/db/workspace-migration.ts.
 */

/** What to call this product to a person. Two words, and it is eight characters longer than the
 *  name it replaced, which is why several labels were re-laid-out rather than re-typed. */
export const PRODUCT_NAME = 'Mole Office'
