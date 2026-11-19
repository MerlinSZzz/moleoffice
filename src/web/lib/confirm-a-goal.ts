// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { api, getActor } from '../api.ts'

/**
 * THE PERSON'S CONFIRM PRESS ON AN AGENT-FILED GOAL, written once for both places it is drawn.
 * Criterion P1, and a decision: the press is on the Goals page and on the goal's own page, and
 * the two must store the same thing (invariant 9).
 *
 * It writes in the goal's own project, which may not be the one in the switcher.
 */
export async function confirmAGoal(goalId: string, project: string | undefined): Promise<void> {
  await api.updateRecord(goalId, await aGoalConfirmed(), project)
}

/**
 * WHAT THE PRESS STORES: who pressed, and the day. The day is the server's day, asked at the press, so a page left open
 * overnight does not stamp yesterday. The goal's own page sends it through the page's write, which carries the version
 * the page draws (src/web/components/AnotherWriter.tsx).
 */
export async function aGoalConfirmed(): Promise<{ dataPatch: { confirmed_by: { by: string; at: string } } }> {
  const at = (await api.today()).day
  return { dataPatch: { confirmed_by: { by: getActor().id, at } } }
}
