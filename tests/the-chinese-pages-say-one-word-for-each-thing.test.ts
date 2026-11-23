// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHINESE PAGES SAY ONE WORD FOR EACH OF FOUR THINGS: 沙箱 for a sandbox, 线 for a line, 流水线 for a pipeline
 * and 工人 for a worker (wave 13y, the translation round's fix before beta.10).
 *
 * Two words for one thing read as two things. The office's flows are 办公流程, so a pipeline called 流程 beside them
 * reads as the same thing twice. 流程 stays for an office flow and for a process. This file reads the joined lists the
 * pages read (WORD_LISTS in src/shared/i18n.ts) and the window's own words (WINDOW_WORDS in
 * src/config/the-self-check-words.mjs), with no browser and no office.
 *
 *   1. No Chinese word holds 沙盒 or 工作单位.
 *   2. The only Chinese word that holds 线路 is g7b.layout.the_route_of_the_line, named below with why it stays.
 *   3. No Chinese word whose English says pipeline, in any case, holds 流程 other than inside 办公流程. A key with no
 *      Chinese is skipped.
 *   4. Each pipeline key named below holds 流水线, and no 流程 outside 办公流程. The two server sentences that also
 *      name an office flow still say 办公流程.
 *   5. g7b.PipelinePage.a_step_in_it_records_that_a holds neither 其他流程 nor 其他流水线. Its English says the
 *      pipeline sorts above everything that is not safety, and not that it sorts above the other pipelines.
 *   6. settingsPanel.title.chatflags is 你的旗子. The three page words of wave 14c have Chinese, and the pipeline
 *      page's one holds 流水线.
 *   7. Each of the four Chinese sentences the window says when it runs without Chromium's sandbox says 沙箱, and none
 *      holds 沙盒.
 *
 * Before the Chinese is changed, every case fails, because the old words are there: ten words hold 沙盒 and three hold
 * 工作单位; the inspector's lines setting holds 线路; 64 words that name a pipeline hold 流程; the sorting sentence says
 * 其他流程; the four keys of case 6 have no Chinese; and the window's four sentences say 沙盒.
 */
import { describe, expect, it } from 'vitest'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { WORD_LISTS } from '../src/shared/i18n.ts'

const EN = WORD_LISTS.en as Readonly<Record<string, unknown>>
const ZH = WORD_LISTS.zh as Readonly<Record<string, unknown>>

/** Every form of a word: a sentence is one form, and a word with plural forms gives each of them. */
function formsOf(word: unknown): string[] {
  if (word === undefined) return []
  if (typeof word === 'string') return [word]
  return Object.values(word as Readonly<Record<string, string>>)
}

/** A word's forms with each 办公流程 taken out, so a 流程 left over names something that is not an office flow. */
function withoutOfficeFlows(word: unknown): string[] {
  return formsOf(word).map((form) => form.split('办公流程').join(''))
}

/** The Chinese keys whose words hold this text. */
function chineseKeysHolding(text: string): string[] {
  return Object.keys(ZH).filter((key) => formsOf(ZH[key]).some((form) => form.includes(text))).sort()
}

/**
 * THE ONE CHINESE WORD THAT KEEPS 线路: 连线路径, "the route of the line", is 连线 and 路径, a drawn link and its route.
 * The 线路 inside it is not a word of its own, so it is not a line of the office.
 */
const KEEPS_XIANLU = 'g7b.layout.the_route_of_the_line'

/**
 * THE WORDS THAT NAME A PIPELINE, each changed from 流程 to 流水线, as the fix's table lists them. The last four name a
 * pipeline by their key though their English does not say pipeline, and the last of all was written again whole.
 */
const PIPELINE_KEYS: readonly string[] = [
  'g6a.sessions.alsoProjects',
  'g6a.sessions.noProject',
  'g6a.sessions.reachesOtherPipelinesOrModulesAndOfThem',
  'g7a.bundles.loadingStructure',
  'g7a.bundles.preset.understand_pipeline.word',
  'g7a.bundles.scope.campaign.says',
  'g7a.bundles.scope.structure.heading',
  'g7a.bundles.scope.structure.label',
  'g7a.bundles.scope.structure.says',
  'g7a.counters.followWork',
  'g7a.modules.seePipelines',
  'g7a.modules.together',
  'g7a.structure.count',
  'g7a.structure.drawingTitle',
  'g7a.structure.inspect',
  'g7a.structure.pipelineCount',
  'g7a.structure.pipelines',
  'g7b.Against.compare_this_pipeline_with_another_one',
  'g7b.Against.no_other_pipeline',
  'g7b.Against.no_step_of_this_name_is_in',
  'g7b.Against.this_project_holds_one_pipeline_so_there',
  'g7b.Edit.not_a_block_on_this_pipeline_any',
  'g7b.Edit.not_a_pipeline_on_file_any_more',
  'g7b.Edit.pick_a_pipeline_first',
  'g7b.Edit.which_pipeline',
  'g7b.PipelineFlow.none_of_the_blocks_this_pipeline_lists',
  'g7b.PipelinePage.a_pipeline_is_an_ordered_set_of',
  'g7b.PipelinePage.because_a_pipeline_s_steps_only_mean',
  'g7b.PipelinePage.pipeline',
  'g7b.PipelinePage.pipelines',
  'g7b.PipelinePage.pipelines_140',
  'g7b.PipelinePage.pipelines_on_file',
  'g7b.PipelinePage.the_index_with_where_each_pipeline_is',
  'g7b.PipelinePage.the_steps_modules_grid_for_this_pipeline',
  'g7b.PipelinePage.there_is_no_pipeline_at_that_address',
  'g7b.PipelinePage.what_a_pipeline_is_and_why_this',
  'g7b.card.the_step_s_name_inside_its_pipeline',
  'graph.wall.aStepNotInThisPipeline',
  'graph.wall.standsAtAStepNotInThisPipeline',
  'home.noPipelines',
  'home.pipelinesShown',
  'kind.pipeline',
  'lists.order.pipelines',
  'lists.pipelines.inspect',
  'nav.pipeline',
  'nav.what.pipeline',
  'record.drawingHint',
  'record.hint.block.state',
  'record.section.modulesAndPipelines',
  'server.decisionNearestIsNotALivePage',
  'server.governsNamesRecordsItCannotGovern',
  'server.planModuleHasNoPipeline',
  'server.planPipelineNotTheModules',
  'sheet.openThePipeline',
  'sheet.pipelineStepsThatStoppedShort',
  'sheet.workedOutFromThePipelineUnreviewed',
  'w13j.planning.pipeline',
  'w13j.planning.step.planStepDone',
  'word.family.structure',
  'word.purpose.pipeline-work',
  'g7a.records.pipelineLead',
  'g7b.PipelinePage.draw_this_one',
  'home.allPipelines',
  'g7b.PipelinePage.a_step_in_it_records_that_a',
]

/** The two server sentences whose list names a pipeline and an office flow side by side. */
const ALSO_NAME_AN_OFFICE_FLOW = ['server.decisionNearestIsNotALivePage', 'server.governsNamesRecordsItCannotGovern']

/** The three page words of wave 14c, the pipeline page's first. */
const PAGE_WORDS_OF_WAVE_14C = ['pipelinePage.aBlockCameWithoutItsReason', 'embassyPage.showMore', 'embassyPage.readingMore']

describe('the Chinese pages say one word for each of four things', () => {
  it('1. has no Chinese word that holds 沙盒 or 工作单位', () => {
    expect(chineseKeysHolding('沙盒'), 'these Chinese words still say 沙盒 for a sandbox').toEqual([])
    expect(chineseKeysHolding('工作单位'), 'these Chinese words still say 工作单位 for a worker').toEqual([])
  })

  it(`2. has 线路 only in ${KEEPS_XIANLU}, whose 连线路径 is 连线 and 路径`, () => {
    expect(chineseKeysHolding('线路'), 'only the route of the line may hold 线路').toEqual([KEEPS_XIANLU])
    expect(ZH[KEEPS_XIANLU]).toBe('连线路径')
  })

  it('3. has no 流程 outside 办公流程 in a Chinese word whose English says pipeline', () => {
    const sayPipeline = Object.keys(EN).filter((key) => formsOf(EN[key]).some((form) => /pipeline/i.test(form)))
    const withChinese = sayPipeline.filter((key) => Object.hasOwn(ZH, key))
    expect(withChinese.length, 'the case reads no word at all').toBeGreaterThan(0)
    const stillSayLiucheng = withChinese
      .filter((key) => withoutOfficeFlows(ZH[key]).some((form) => form.includes('流程')))
    expect(stillSayLiucheng, 'these Chinese words still call a pipeline 流程').toEqual([])
  })

  it('4. says 流水线, and no 流程 outside 办公流程, in each word that names a pipeline', () => {
    expect(PIPELINE_KEYS.filter((key) => !Object.hasOwn(ZH, key)), 'these pipeline keys have no Chinese').toEqual([])
    expect(PIPELINE_KEYS.filter((key) => !formsOf(ZH[key]).every((form) => form.includes('流水线'))), 'these do not say 流水线').toEqual([])
    expect(PIPELINE_KEYS.filter((key) => withoutOfficeFlows(ZH[key]).some((form) => form.includes('流程'))), 'these still say 流程').toEqual([])
    for (const key of ALSO_NAME_AN_OFFICE_FLOW) expect(ZH[key], `${key} lost its office flow`).toContain('办公流程')
  })

  it('5. does not say the pipeline with a step that could hurt a person sorts above the other pipelines', () => {
    const sorting = formsOf(ZH['g7b.PipelinePage.a_step_in_it_records_that_a']).join(' ')
    expect(sorting).not.toBe('')
    expect(sorting).not.toContain('其他流程')
    expect(sorting).not.toContain('其他流水线')
  })

  it('6. has Chinese for the flags title and the three page words of wave 14c', () => {
    expect(ZH['settingsPanel.title.chatflags']).toBe('你的旗子')
    expect(PAGE_WORDS_OF_WAVE_14C.filter((key) => formsOf(ZH[key]).length === 0), 'these have no Chinese').toEqual([])
    expect(ZH['pipelinePage.aBlockCameWithoutItsReason']).toContain('流水线')
  })

  it("7. says 沙箱 and not 沙盒 in each Chinese sentence the window says without Chromium's sandbox", () => {
    const sentences = WINDOW_WORDS.zh.sandboxOff as Readonly<Record<string, string>>
    expect(Object.keys(sentences).sort()).toEqual(['heading', 'risk', 'todo', 'why'])
    for (const [name, sentence] of Object.entries(sentences)) {
      expect(sentence, name).not.toContain('沙盒')
      expect(sentence, name).toContain('沙箱')
    }
  })
})
