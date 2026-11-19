// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE THE CHECKER TOOLS ARE, as absolute paths, for a tool that runs one.
 *
 * Its own module so that the tool importing it never says `import.meta` itself: tests/check-eligibility.test.ts
 * evaluates tools/the-inspector.mjs as a function body with its imports bound to stand-ins, and
 * `import.meta` is a syntax error there. This was found on 23 September 2026, when A2 of a decision first ran
 * the files checker from the inspector tool and all 32 cases of that file went red.
 */
import { fileURLToPath } from 'node:url'

/** tools/checks/files-changeset.mjs. */
export const THE_FILES_CHECKER = fileURLToPath(new URL('./files-changeset.mjs', import.meta.url))
