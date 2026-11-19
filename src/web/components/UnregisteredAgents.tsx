// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENTS THAT HAVE WRITTEN HERE AND ARE IN NO REGISTRY. Named, and nothing else.
 *
 * Criterion M14 of design/messages/ACCEPTANCE.md, as amended by a decision on 30 September 2026: a
 * record write from an unknown agent is refused with HTTP 403, and has been since 16 September
 * 2026. Only the office's own programs and tools, calls inside the server's
 * own process, and a test world's starter and secretaries write without a registration. So this list
 * shows those writers and the unknown agents that wrote before the refusal existed, and the sentence
 * at its top says so (problem 0pQjhpTHp1_f: it said nothing stops them, the opposite of what the
 * office does).
 *
 * The list itself still only names (answer F1).
 * An agent is sometimes started for something unrelated to this project, and a rule that acted
 * on whatever is unregistered would be too wide. The refusal at the door is a different rule, about a
 * new write, and it is not drawn or pressed here.
 *
 * SO THERE IS NO BUTTON HERE, and there must not be one. Nothing on this list can be stopped,
 * retired, refused or registered from it. In developer mode it offers the id exactly as the header
 * sent it, so a person can see who has been writing; normal mode shows how many writes and when. The one thing a reader may press is the fold that shows the
 * rest of the list, which acts on the list and on nobody in it.
 *
 * IT SAYS HOW MANY IT IS DRAWING AND HOW MANY THERE ARE. Twenty rows are drawn and the rest are
 * behind the fold, because this panel is on a page about something else and a hundred and ten rows
 * would push that page's own content most of a screen down. The count line names both numbers, so a
 * short list is never read as the whole one. Problem `yKFPQXucwshV` is what the silent version of
 * this looked like: twenty of a hundred and ten, drawn under a sentence that read as covering all
 * of them. It is a count and not a sentence, because the number is the answer and prose around it
 * would be the interface explaining itself.
 *
 * TWO WAYS IN AND ONE DRAWING. The page about who is working already has the reading and hands its
 * rows straight over; the front page has no such reading and asks for one. Both end up in the same
 * `Rows` below, because two copies of one panel is the defect this repository keeps producing.
 */

import { t } from '@shared/i18n.ts'
import { Panel, Tag } from './ui.tsx'
import { useInspect } from '../lib/mode.ts'
import { stampToTheMinute } from '../lib/minute.ts'

/** One agent actor id nothing has registered, as the server reports it. */
export interface UnregisteredRow {
  id: string
  writes: number
  lastWroteAt: string
}

/**
 * How many rows are drawn before the rest go behind the fold.
 *
 * Twenty because this panel is on a page about who IS working, and the list of who is not registered
 * is a note beside that rather than the page's subject. It is a drawing choice and nothing else: the
 * reply carries every row, and the fold holds the ones this number leaves out.
 */
const DRAWN_BEFORE_THE_FOLD = 20

/**
 * The rows, drawn. Split out so the fold and the panel draw one row exactly the same way.
 *
 * THE ID IS DEVELOPER MODE'S. It is the raw string a request's header
 * sent, so normal mode draws each row as its count of writes and its last write, and developer
 * mode adds the id in front.
 *
 * THE LAST WRITE IS TO THE MINUTE IN NORMAL MODE, as every time on Home is (problem ejarlQfb3Caz),
 * through the one function that says a moment that way. Developer mode shows the stamp as stored,
 * seconds and all.
 */
function Rows({ rows }: { rows: readonly UnregisteredRow[] }) {
  const inspect = useInspect()
  return (
    <ul className="unreg-list">
      {rows.map((row) => (
        <li key={row.id} className="unreg-row">
          {inspect ? <span className="unreg-id num">{row.id}</span> : null}
          <span className="unreg-count">{t('homeWords.unregistered.writes', { n: row.writes, at: inspect ? row.lastWroteAt : stampToTheMinute(row.lastWroteAt) })}</span>
        </li>
      ))}
    </ul>
  )
}

/** The panel, given rows somebody already has. Draws nothing at all when there are none. */
export function UnregisteredAgents({ rows }: { rows: readonly UnregisteredRow[] }) {
  if (rows.length === 0) return null
  const drawn = rows.slice(0, DRAWN_BEFORE_THE_FOLD)
  const rest = rows.slice(DRAWN_BEFORE_THE_FOLD)
  return (
    <Panel titleIs="label"
      declares={{ surface: 'working.unregistered' }}
      title={t('homeWords.unregistered.title')}
      actions={<Tag tone="quiet">{rows.length}</Tag>}
    >
      <style href="mole-office-unregistered-agents" precedence="default">
        {CSS}
      </style>
      <p className="unreg-said">{t('homeWords.unregistered.saidNow')}</p>
      {/* HOW MANY OF HOW MANY, AS A COUNT AND NOT AS A SENTENCE. It says both numbers whether the
          list is folded or whole, so a short list is never read as the whole one. */}
      <p className="unreg-how-many">{t('homeWords.unregistered.howMany', { n: drawn.length, total: rows.length })}</p>
      <Rows rows={drawn} />
      {rest.length === 0 ? null : (
        <details className="unreg-rest">
          <summary>{t('homeWords.unregistered.showRest', { n: rest.length })}</summary>
          <Rows rows={rest} />
        </details>
      )}
    </Panel>
  )
}

const CSS = `
.unreg-how-many {
  margin: 0 0 var(--pad) 0;
  font-size: var(--fs-1);
  color: var(--text-3);
}

.unreg-rest { margin-top: var(--pad); }

.unreg-rest > summary {
  cursor: pointer;
  font-size: var(--fs-1);
  color: var(--text-2);
}

.unreg-said {
  margin: 0 0 var(--pad) 0;
  max-width: var(--measure);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
}

.unreg-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }

.unreg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px var(--pad);
  padding: 4px 0;
  border-top: var(--border-w) solid var(--border);
}
.unreg-row:first-child { border-top: 0; }

.unreg-id { font-size: var(--fs-1); color: var(--text); word-break: break-all; }

.unreg-count { font-size: var(--fs-2); color: var(--text-3); }
`
