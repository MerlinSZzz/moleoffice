// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'

/**
 * THE SENTENCE UNDER A PIPELINE THAT STANDS STILL, in Home's Late or stuck: how many of its steps are not done, every
 * one of them paused. A decision settles problem RK4zJb6hJyV6 this way.
 *
 * THE COUNT COMES FROM THE SERVER. Which pipelines stand still, and how many steps each has that are not done, is
 * worked out in one statement, src/server/lib/pipelines-standing-still.ts, and Home is told the answer by
 * GET /api/pipelines/standing-still. The browser holds no copy of the rule (wave 13s round 281).
 */
export function standingStillLine(unfinished: number): string {
  return t('homeWords.pipelineStill', { n: unfinished })
}
