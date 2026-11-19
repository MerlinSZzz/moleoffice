// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ZOD'S COMPLAINTS AS ONE SENTENCE, the wording every door's 400 carries (src/server/lib/http.ts `parse`).
 *
 * Here rather than in the server library so that tools/the-inspector.mjs, which imports src/shared/the-verdict-door.ts,
 * says what the verdict door would say in the door's own words before it posts (problem -WZ40nNgHnTR).
 */
import type { z } from 'zod'

/**
 * Turn zod's structured complaints into one plain sentence naming the field at fault.
 *
 * Exported because one route needs the sentence WITHOUT the throw that `parse` does: POST
 * /api/resources has a second thing that can be wrong with a request (nothing owns the row) and
 * has to say both in one refusal. Writing the sentence again there would be a second copy of the
 * wording, and the wording is what a caller acts on.
 */
export function explain(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.join('.')
      // Most schemas already name their field in the message; do not say it twice.
      return where && !issue.message.startsWith(where) ? `${where}: ${issue.message}` : issue.message
    })
    .join('; ')
}
