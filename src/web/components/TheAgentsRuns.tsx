// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { sentenceOnThePage } from '../lib/server-sentences.ts'
/**
 * THE CITIZEN'S PAGE RECORDS ITS RUNS. Criterion P91, amended 12 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DRAWS, AND WHAT IT REFUSES TO DRAW
 * ---------------------------------------------------------------------------------------
 *
 * Per run: the model and the effort the run declared, the state it ended in, its runtime, and the
 * tokens from the runtime's own receipt. The totals over the runs are drawn by `ReceiptTotals`, the
 * one summation `GET /api/usage/agents` already draws, so this page never works the tokens out a
 * second time.
 *
 * A run with no receipt says so in words and is not drawn as zero tokens. A run with no compaction
 * draws the server's sentence for its runtime and never a zero; a run the session hook recorded
 * compactions for draws them and says who reported them. Under the totals, the compactions summed on
 * the agent say which runs the count can see, and the models and efforts its runs declared are
 * counted (wave 13k round 52). WHERE THE TIMELINE WOULD BE, the page says the timeline is not built
 * and names 11 September 2026, the day the step log was withdrawn: nothing smaller is drawn there
 * under the timeline's name.
 *
 * THE SERVER DECIDES EVERYTHING AND THIS DRAWS IT. The runs, the totals and the binding are worked
 * out in `theAgentsRuns`; this file has no arithmetic and no second reading of `ranAs`.
 */

import { stateWord } from '@shared/words.ts'
import { waitingOnALimitUntil } from '../lib/a-long-wait.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { type OneOfItsRuns, type TheAgentsDeclarations, type TheAgentsRuns as Reading } from '@shared/profile.ts'
import { Absence, Panel } from './ui.tsx'
import { ReceiptTotals, UsageReceipt } from './UsageReceipt.tsx'

/** What is drawn where a value the run did not declare would be. Never a default. */
function declared(value: string | null) {
  return value ?? <Absence title={t('g6b.runs.didNotSay')} />
}

function OneRun({ run }: { run: OneOfItsRuns }) {
  return (
    <li className="prof-run" data-testid="profile-run" data-run={run.id}>
      <p className="prof-run-head">
        <span className="prof-run-title">{run.title}</span>
        <span className="prof-when">{run.when}</span>
        <span className="prof-key">{t('g6b.profile.status')}</span>
        {/*
          THE WORD A PERSON READS AND NOT THE STORED ONE. `run.state` holds the word the database
          keeps — `running`, `finished` — and drawing it straight into a sentence is what the
          machine-word gate refuses: a state nobody has a reading for would then appear on their page
          as whatever the column happened to say. `stateWord` gives the reading, and for a state no
          table names it says so rather than passing the raw word through. Criterion P91. A running
          run waiting more than an hour on a usage limit is drawn as waiting until its next try.
        */}
        <span className="prof-when">{run.waitsLongUntil === undefined ? stateWord(run.state, 'normal', 'session').text : waitingOnALimitUntil(run.waitsLongUntil)}</span>
      </p>
      <dl className="prof-run-facts">
        <div className="prof-fact">
          <dt className="prof-label">{t('g6b.runs.model')}</dt>
          <dd className="prof-value" data-empty={run.model === null ? 'yes' : 'no'}>{declared(run.model)}</dd>
        </div>
        <div className="prof-fact">
          <dt className="prof-label">{t('g6b.runs.effort')}</dt>
          <dd className="prof-value" data-empty={run.effort === null ? 'yes' : 'no'}>{declared(run.effort)}</dd>
        </div>
        <div className="prof-fact">
          <dt className="prof-label">{t('g6b.runs.runtime')}</dt>
          <dd className="prof-value" data-empty={run.runtime === null ? 'yes' : 'no'}>{declared(run.runtime)}</dd>
        </div>
      </dl>
      {run.usageReceipt === null ? (
        <p className="prof-run-says" data-testid="run-receipt-missing">{sentenceOnThePage(run.receiptSays)}</p>
      ) : (
        <UsageReceipt receipt={run.usageReceipt} />
      )}
      {/* THE COMPACTIONS PLACE. The session hook records each compaction Claude Code reports (wave 13k
          round 46), and a run with none draws the server's sentence for its runtime. A zero here would
          be a measurement nobody made. With some, the server's sentence says who reported them. Both
          are drawn in the page's language (wave 13k round 52). */}
      <p className="prof-run-says" data-testid="run-compactions">
        {t('g6b.runs.compactions')}: {run.compactions.length === 0
          ? sentenceOnThePage(run.compactionsSay)
          : `${run.compactions.map((one) => one.what === null ? one.at : t('g6b.runs.at', { what: content(one.what), at: content(one.at) })).join(', ')} (${sentenceOnThePage(run.compactionsSay)})`}
      </p>
    </li>
  )
}

/** A value the runs declared, or the word for one they did not. Never a default. */
function declaredOrNot(value: string | null): string {
  return value === null ? t('g6b.runs.notSaid') : content(value)
}

/** THE MODELS AND EFFORTS THE RUNS DECLARED, each with how many runs declared it, as the server counted them. */
function TheDeclared({ declared }: { declared: TheAgentsDeclarations }) {
  return (
    <div className="prof-summed" data-testid="agent-declared">
      <p className="prof-label">{t('g6b.runs.declaredTitle')}</p>
      {declared.pairs.length === 0 ? null : (
        <ul className="prof-declared">
          {declared.pairs.map((pair) => (
            <li key={JSON.stringify([pair.model, pair.effort])}>
              {t('g6b.runs.declaredRow', { model: declaredOrNot(pair.model), effort: declaredOrNot(pair.effort), n: pair.runs })}
            </li>
          ))}
        </ul>
      )}
      {declared.neither === 0 ? null : <p className="prof-run-says">{t('g6b.runs.declaredNeither', { n: declared.neither })}</p>}
    </div>
  )
}

export function TheAgentsRuns({ reading }: { reading: Reading }) {
  useLanguage()
  return (
    <Panel titleIs="label" declares={{ surface: 'profile.runs' }} title={t('g6b.runs.title')}>
      {/* IN THE PAGE'S LANGUAGE (wave 13k round 35): the server's sentence, by its word. */}
      <p className="prof-says">{sentenceOnThePage(reading.runsSay)}</p>
      {reading.runs.length === 0 ? null : (
        <ul className="prof-runs">
          {reading.runs.map((run) => <OneRun key={run.id} run={run} />)}
        </ul>
      )}
      {/* WHERE THE TIMELINE WOULD BE. Criterion P91: it is out until F8 comes back, and the page
          says why and names the day rather than drawing a shorter thing under the same name. */}
      <p className="prof-run-says prof-timeline" data-testid="run-timeline">{sentenceOnThePage(reading.timelineSays)}</p>
      <div data-testid="agent-receipt-totals">
        <ReceiptTotals reading={reading.totals} />
      </div>
      {/* WHAT IS SUMMED BESIDE THE TOKENS, once there is a run to sum (wave 13k round 52). The compaction count says
          which runs it can see, in the page's language; the server decides every number. */}
      {reading.runs.length === 0 ? null : (
        <>
          <div className="prof-summed" data-testid="agent-compactions-counted">
            <p className="prof-label">{t('g6b.runs.compactionsSummed')}</p>
            <p className="prof-run-says">{saidOnThePage(reading.compactionsCounted.said, reading.compactionsCounted.says)}</p>
          </div>
          <TheDeclared declared={reading.declared} />
        </>
      )}
    </Panel>
  )
}
