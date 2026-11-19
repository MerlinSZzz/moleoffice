// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY TOKENS AN OPENCODE PROCESS ASKS ITS MODEL TO WRITE AT MOST IN ONE STEP, for a check and for a worker alike.
 *
 * OpenCode 1.18.31 asks for the smaller of the model's output limit and 32,000 (its OUTPUT_TOKEN_MAX), unless
 * OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX says otherwise (read in that version, XfxmiZBXj_r8). On 19 October 2026
 * two checks on DeepSeek flash at effort max stopped with reason "length" at 32,000 reasoning tokens (6uCMaZezhW1f,
 * kon5r54yyrI3), and in the three days before, 2 of 104 OpenCode worker runs did (au18wjw4n4Rz: 32,000 reasoning tokens
 * and no output; MVravcJNWF85: an answer cut at 31,698). 64,000 is double that default, not the model's own limit of
 * 384,000.
 *
 * ONE PLACE FOR BOTH: tools/inspector-sandbox.mjs gives it to every check, and tools/sandbox-start.mjs to every OpenCode
 * command it starts. The variable is marked experimental, so a later OpenCode may rename it: the tests that read what the
 * real OpenCode sends (tests/a-checks-opencode-sends-the-raised-output-cap.test.ts and
 * tests/a-workers-opencode-sends-the-raised-output-cap.test.ts) go red then.
 */

/** The variable and its value, as an OpenCode process's environment carries them. */
export const OPENCODE_OUTPUT_CAP = Object.freeze({ OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: String(64000) })

/** What a start says of it: its value, and that the launcher set it. A Casting row may not set it. */
export const THE_OUTPUT_CAP_WORDS =
  `output cap ${OPENCODE_OUTPUT_CAP.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX} tokens a step, set by the launcher ` +
  "(OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX); OpenCode asks for the smaller of it and the model's own output limit"
