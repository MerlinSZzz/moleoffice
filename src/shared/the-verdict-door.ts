// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPE THE VERDICT DOOR TAKES, DECLARED ONCE FOR THE DOOR AND FOR THE TOOL THAT POSTS TO IT.
 *
 * POST /api/checks/:run (src/server/api/inspection.ts) parses a verdict with THE_VERDICT_DOOR, and
 * tools/the-inspector.mjs checks the body it is about to post against the same object before it posts.
 * Problem -WZ40nNgHnTR (see ZqRaTMEB_MMu): on 4 October 2026 two releases were lost because the
 * model wrote a field the door does not take: a trace word one word short (check zkcl7Ld_M1I9), then
 * every trace line as {path, ...} where the door wants {paths: [...], to, how, said} (wave 13u's round 5).
 * The door refused the whole verdict each time, and a second whole check had to be asked for. With the
 * shape here, the tool finds the same refusal before it posts, in the door's own words, and can ask the
 * model to correct only those fields. Kept in src/shared and free of the server, so the tool can import it.
 */
import { z } from 'zod'
import { PACKAGE_INSPECTOR_JUDGMENTS } from './delegation.ts'
import { explain } from './zod-words.ts'
import { A_REFUSAL_NAMES, TRACED_HOW } from './releasing.ts'

/** One path a checker tool could not decide, and why. The shape is src/config/needs-judgment.mjs. */
export const aPathThatNeedsJudgment = z.object({ path: z.string().min(1), why: z.string().min(1) }).strict()

/**
 * ONE POINT OF AN INSIDE PACKAGE AS THE INSPECTOR JUDGED IT: what it found the point to be, whether the hand-back's
 * claim holds, and why. The verdict door and the package's check door (src/server/lib/delegation.ts) read this one shape.
 */
export const aJudgedPoint = z.object({
  pointId: z.string().min(1),
  judged: z.enum(PACKAGE_INSPECTOR_JUDGMENTS),
  holds: z.boolean(),
  why: z.string().trim().min(1),
  rulesKept: z.boolean(),
}).strict()

/** Which worktree and which tip the check read. Criterion C30 asks the record to carry both. */
export const whatWasRead = z
  .object({
    unsealed: z.boolean().optional(),
    sealId: z.string().min(1).optional(),
    sealHash: z.string().min(1).optional(),
    // adTmco_wIzln, note 52ZNPB44bOPb; USER.md invariants 2 and 5: carry what the seal says.
    sealKind: z.enum(['git', 'records', 'files']).optional(),
    // Whether the check read the seal's link evidence, or the seal was made before seals pinned links (round BQ).
    linkEvidence: z.enum(['read', 'sealed-before-links']).optional(),
    worktree: z.string().min(1),
    tip: z.string().min(1).optional(),
    ofItsOwn: z.boolean(),
    says: z.string().min(1),
    // A SCOPED CHECK SAYS SO ON ITS VERDICT, so a verdict on some paths never reads as one on all.
    only: z.array(z.string().min(1)).min(1).max(500).optional(),
    needsJudgment: z.array(aPathThatNeedsJudgment).max(500).optional(),
    // A FILES SEAL: the folder the check's copy was made from, and for every
    // sealed path where a file was already landed, the sha256 of that landed file — the BEFORE the
    // model was shown. The queue binds a modify operation's `before` to exactly this hash, so a release
    // covers the text a file replaced as well as the text it lands.
    staged: z.string().min(1).optional(),
    before: z.record(z.string().min(1), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
  })
  .strict()

/**
 * WHAT THE MODEL'S RUN WROTE INTO THE OFFICE, counted by the tool that started it. Acceptance
 * finding 44. Optional, because a tool that could not count it leaves it off rather than claiming
 * zero. The tool sets it; the model never does.
 */
export const wroteIntoTheOffice = z
  .object({
    count: z.number().int().min(0),
    ids: z.array(z.string().min(1)).max(500),
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict()

export const whatSaysSo = z
  .object({ chapter: z.number().int().optional(), precedent: z.string().min(1).optional(), invariant: z.number().int().optional() })
  .strict()

/**
 * THE DOOR'S OWN FIELD NAMES, built here so they can be checked against the one declaration.
 *
 * The keys are unchanged by that check: it only says out loud that this shape and
 * src/config/verdict-keys.mjs name the same set, which is what stops the tool trimming against a
 * list that no longer matches the door. A key added to one side alone fails when the door loads (src/server/api/inspection.ts).
 */
export const eachFieldOfAVerdict = {
  verdict: z.enum(['released', 'refused']),
  check: z.string().min(1),
  missing: z.array(z.string().min(1)).max(50).optional(),
  says: whatSaysSo.optional(),
  chaptersRead: z.array(z.unknown()).optional(),
  // CRITERION C30: the check says which worktree and which tip it read, and the release carries
  // it. Optional, because a check that does not say is a different fact from one that read the
  // right tree, and the record says which.
  read: whatWasRead.optional(),
  // ONE LINE OF THE MODEL'S OWN PER PATH IT WAS HANDED TO JUDGE, for a files seal, at A2 of a
  // decision, "named must mean judged". It sits beside `read`, never
  // inside it, because `read` must
  // say what was assembled and this is what was concluded.
  judged: z.array(z.object({ path: z.string().min(1), concluded: z.string() }).strict()).max(500).optional(),
  decisions: z.array(z.object({
    id: z.string().min(1), holds: z.boolean(), restsOn: z.string().trim().min(1),
    authorityFits: z.boolean(), authorityWhy: z.string().trim().min(1),
  }).strict()).max(500).optional(),
  // The traced words: item 6, step 3, and chapter 7 rule 5; oj9CRzzB2_8m.
  traced: z.array(z.object({
    paths: z.array(z.string().min(1)).min(1).max(500),
    to: z.string().trim().min(1),
    how: z.enum(TRACED_HOW),
    said: z.string().trim().min(1),
  }).strict()).max(500).optional(),
  // ACCEPTANCE FINDING 44: what the model's run wrote into the office while it ran. Optional,
  // because a tool that could not count it leaves it off rather than claiming zero.
  wroteIntoTheOffice: wroteIntoTheOffice.optional(),
  // THE FAULTS THE CHECK LISTED INSTEAD OF REFUSING, in the two places they are fixed (the owner's
  // decisions of 9 November 2026). The tool reads the model's `listed` items through the one declaration
  // (src/config/verdict-kinds.mjs) and posts these normalised lists; the door stores them on the release
  // and files one task for the line from them.
  listed: z
    .object({
      nextRound: z.array(z.string().min(1)).max(50),
      afterLanding: z.array(z.string().min(1)).max(50),
    })
    .strict()
    .optional(),
  // THE INSPECTOR'S JUDGEMENT OF EACH POINT OF EACH INSIDE PACKAGE THE RUN HANDED BACK. The door writes each one as the
  // package's check, through the check door's own rules (src/server/lib/delegation.ts, `checkThePackage`).
  packages: z.array(z.object({ task: z.string().min(1), points: z.array(aJudgedPoint).max(500) }).strict()).max(100).optional(),
}

/** The whole verdict, a strict object: a key the door does not name is refused, as `Unrecognized key`. */
export const THE_VERDICT_DOOR = z.object(eachFieldOfAVerdict).strict()

/** The keys of a verdict the model writes. `read`, `wroteIntoTheOffice` and `listed` are the tool's own (src/config/verdict-keys.mjs). */
const THE_TOOLS_OWN_KEYS = ['read', 'wroteIntoTheOffice', 'listed']

/**
 * WHAT THE VERDICT DOOR WOULD SAY TO THIS BODY, or null when it would take it.
 *
 * `said` is the sentence the door's 400 carries, "The check " and then zod's complaints as the door
 * explains them (src/server/lib/http.ts `parse`), so the words the model is shown are the door's words.
 * `keys` are the top-level keys the complaints are about, the model's own and the tool's own apart:
 * only the model's can be handed back to it. A complaint with no path (an unrecognized key at the top)
 * is put under each key it names.
 */
export function whatTheVerdictDoorWouldSay(body: unknown): { said: string; modelsKeys: string[]; toolsKeys: string[] } | null {
  const result = THE_VERDICT_DOOR.safeParse(body)
  if (result.success) {
    if (result.data.verdict === 'released' && result.data.decisions?.some((one) => !one.holds || !one.authorityFits)) {
      return { said: 'A release cannot include a decision that does not hold or whose authority does not fit. Nothing was written.', modelsKeys: ['verdict', 'decisions'], toolsKeys: [] }
    }
    // THE DOOR'S NEXT RULE, ASKED HERE TOO: a refusal names what is missing and what says so (criterion C21).
    const lacks = whatARefusalLacks(result.data)
    return lacks.length === 0 ? null : { said: `${A_REFUSAL_NAMES} Nothing was written.`, modelsKeys: lacks, toolsKeys: [] }
  }
  const keys = new Set<string>()
  for (const issue of result.error.issues) {
    const first = issue.path[0]
    if (typeof first === 'string') keys.add(first)
    else if (issue.code === 'unrecognized_keys') for (const key of issue.keys) keys.add(key)
  }
  const all = [...keys]
  return {
    said: `The check ${explain(result.error)}`,
    modelsKeys: all.filter((key) => !THE_TOOLS_OWN_KEYS.includes(key)),
    toolsKeys: all.filter((key) => THE_TOOLS_OWN_KEYS.includes(key)),
  }
}

/**
 * THE SHAPE THE DOOR TAKES FOR EACH OF THESE KEYS, as JSON Schema made from the door's own fields, so the
 * words the model is shown cannot drift from what the door parses. A key the door does not take is
 * said to be one it does not take.
 */
export function theShapeTheDoorTakesFor(keys: readonly string[]): string {
  const fields = eachFieldOfAVerdict as Record<string, z.ZodType>
  return keys
    .map((key) => {
      const field = fields[key]
      if (field === undefined) return `- \`${key}\`: the door takes no such key; leave it out.`
      return `- \`${key}\`: ${JSON.stringify(z.toJSONSchema(field, { unrepresentable: 'any' }))}`
    })
    .join('\n')
}

/**
 * WHAT A REFUSAL LACKS OF WHAT THE DOOR REQUIRES OF IT, by key: `missing` when it names nothing missing, and `says` when it
 * names no chapter, precedent or invariant (criterion C21). Empty for a release, and for a refusal that carries both.
 * The door refuses with A_REFUSAL_NAMES on exactly this (src/server/api/inspection.ts), and the inspector tool asks it
 * before posting, so the model can be asked for the one key it left out (problem -WZ40nNgHnTR, its third case: the
 * check 4kparIQsP5jd of 4 October 2026 wrote `missing` as one string, the tool left it out, and the door refused a
 * refusal that named nothing missing).
 */
export function whatARefusalLacks(body: z.infer<typeof THE_VERDICT_DOOR>): ('missing' | 'says')[] {
  if (body.verdict !== 'refused') return []
  const says = body.says
  const namesARule = says !== undefined && (says.chapter !== undefined || says.precedent !== undefined || says.invariant !== undefined)
  return [...((body.missing ?? []).length === 0 ? ['missing' as const] : []), ...(namesARule ? [] : ['says' as const])]
}
