// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW MANY TOKENS A PIECE OF TEXT IS, WHEN NO TOKENIZER IS INSTALLED. Criterion T3.
 *
 * -----------------------------------------------------------------------------------------
 * WHY THIS IS ONE FILE
 * -----------------------------------------------------------------------------------------
 *
 * The rule that turns characters into a token estimate existed twice: once in
 * `src/server/api/brief.ts` and once in `tools/how-long-to-the-first-write.mjs`. The sentence
 * that says no tokenizer is installed existed three times, and a fourth was about to be written
 * for a context bundle. That is the ninth invariant's defect exactly: one fact worked out in two
 * places, free to drift, with nothing failing when it does.
 *
 * So the divisor, the arithmetic built from it and the sentence saying it is an estimate are
 * declared once, here, and the brief, a context bundle and the measuring tool all read them.
 *
 * -----------------------------------------------------------------------------------------
 * WHY IT LIVES IN `src/config` AND WHY IT IS A `.mjs` FILE
 * -----------------------------------------------------------------------------------------
 *
 * `tools/how-long-to-the-first-write.mjs` is plain JavaScript run by bare `node`, and it cannot
 * import TypeScript. `src/server` and `src/web` are TypeScript. `src/config` is the one folder
 * both sides already load from, and it already ships `.mjs` modules that TypeScript imports
 * (`src/config/inspection.mjs`, `src/config/agent-model.mjs`). Putting the declaration anywhere
 * else would either leave the tool with a second copy or make the server load a file out of a
 * program's private folders.
 *
 * -----------------------------------------------------------------------------------------
 * THE ESTIMATE IS NEVER DRESSED UP AS A MEASUREMENT
 * -----------------------------------------------------------------------------------------
 *
 * Four characters per token is the ratio usually quoted for English prose in byte-pair
 * vocabularies. It is not a measurement. Every field built from it carries `Estimated` in its
 * name, and the sentence below says in words that no tokenizer ran and why.
 */

/**
 * Characters per token, for the estimate.
 *
 * @type {number}
 */
export const CHARS_PER_TOKEN = 4

/**
 * THE ESTIMATE FOR A RUN OF CHARACTERS: characters divided by `CHARS_PER_TOKEN`, rounded to the
 * nearest whole token. The rounding is the one the brief has always used, so the same text gets
 * the same number wherever it is measured.
 *
 * @param {number} characters
 * @returns {number}
 */
export function tokensEstimatedFor(characters) {
  return Math.round(characters / CHARS_PER_TOKEN)
}

/**
 * THE SENTENCE SAYING THE TOKEN FIGURE IS AN ESTIMATE AND WHY. Written once, so the brief, a copy
 * and the measuring tool cannot disagree about the wording or about the divisor.
 *
 * It names no budget and no label of its own: a caller that wants to say what the estimate was
 * checked against says that fact in its own field, beside this sentence.
 *
 * @returns {string}
 */
export function theTokenEstimateSentence() {
  return (
    'Tokens are an estimate: no tokenizer is installed on this machine, so the count is characters ' +
    `divided by ${String(CHARS_PER_TOKEN)}. Characters and bytes are counted exactly; a real count ` +
    "would come from the model's own tokenizer."
  )
}
