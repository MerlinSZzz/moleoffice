// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN AGENT DID ON YOUR OWN WORDS, ON THE RECORD IT DID IT TO.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN FILE AND TAKES THE PRESS AS A PROP
 * ---------------------------------------------------------------------------------------
 *
 * It draws no data of its own and makes no request of its own: the acts come from the record read
 * the page has already made, and the press is handed in. So the file imports the interface, the
 * shared reading and the pure error readers used by ErrorNote — which is what lets a test render
 * it and read what a person would see, without a browser or an active API connection behind it.
 * The error readers inspect a caught refusal; the request itself still belongs to the page.
 */
import { useState } from 'react'
import { errorMessage, faultOf } from '../api.ts'
import { Btn, ErrorNote, Panel } from './ui.tsx'
import { t } from '@shared/i18n.ts'
import { actorTypeWord } from '@shared/words.ts'
// THE TYPE ONLY, which is erased at build time. The reader itself opens the database.
import type { ActOnTheirWords } from '../../server/lib/warrants.ts'

/**
 * WHAT AN AGENT DID HERE ON YOUR OWN WORDS, with your sentence beside it and one press to take it
 * back.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORDS ARE ON THE PAGE AND NOT A LINK TO THEM
 * ---------------------------------------------------------------------------------------
 *
 * An agent may make a governance write it is otherwise refused when it can quote what the person
 * said. The whole value of that is the person reading their own sentence back and being able to say
 * it is not what they said. A summary, a paraphrase or a link somewhere else all break that check
 * while looking exactly like it working. So the words are drawn whole, as a quotation, marked as
 * stored words and not as this interface talking.
 *
 * IT DRAWS NOTHING WHEN NOTHING WAS DONE ON ANYBODY'S WORDS, which is almost every record. An empty
 * box on every page would be furniture, and furniture stops being read.
 *
 * A REVOKED ACT STAYS ON THE PAGE. It is not removed and its words are not removed: a person who
 * took something back is entitled to see that it happened and that it was undone, rather than to
 * find both gone. The row says who took it back and when, and the press is not offered twice.
 *
 * `what` COMES FROM THE SERVER AS A FINISHED SENTENCE, built in lib/warrants.ts. The line under
 * each act and the revocation line are built here from the facts the act carries (who, where, when),
 * so they can be read in the page's language. The English is the same sentence @shared/warrant.ts
 * writes for the forks desk and the waiting list, and a change to one has to be made to the other.
 */
export function ActsOnYourWords({
  acts,
  onRevoke,
}: {
  acts: readonly ActOnTheirWords[]
  /**
   * TAKE THIS ACT BACK. Handed in by the page, which makes the request and reads the record again.
   *
   * THE WHOLE PAGE IS REDRAWN AND NOT JUST THIS PANEL. A revocation changes the record itself — a
   * state goes back, a classification goes back, a fork opens again — so a panel that redrew only
   * its own list would leave the rest of the page showing what the act did after it was undone.
   */
  onRevoke: (act: ActOnTheirWords) => Promise<void>
}) {
  const [pressing, setPressing] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  if (acts.length === 0) return null

  const revoke = (act: ActOnTheirWords): void => {
    const key = `${act.recordId}-${String(act.seq)}`
    setPressing(key)
    setFailed(null)
    onRevoke(act)
      .catch((err: unknown) => {
        // SAID OUT LOUD AND NOT SWALLOWED. A press that did nothing and looked like it worked is
        // the exact failure this product is written against, and this press is the person's only
        // way to take an act back.
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      })
      .finally(() => {
        setPressing(null)
      })
  }

  return (
    <Panel declares={{ surface: null }} title={t('g2b.onYourWords.title')} rank={1}>
      <ul className="ohw-list">
        {acts.map((act) => {
          const key = `${act.recordId}-${String(act.seq)}`
          return (
            <li key={key} className="ohw-act" data-state={act.revoked === null ? 'standing' : 'revoked'}>
              <p className="ohw-what">{act.what}</p>
              <blockquote className="ohw-words px-owner-words">{act.warrant.words}</blockquote>
              <p className="ohw-said">
                {t('g2b.onYourWords.said', {
                  actor: actorTypeWord(act.actorType).text,
                  id: act.actorId,
                  where: wherePlainly(act.warrant.where),
                  when: act.warrant.when,
                })}
              </p>
              {act.revoked === null ? (
                <Btn variant="secondary" size="sm" onClick={() => { revoke(act) }} pending={pressing === key}>
                  {t('g2b.onYourWords.revoke')}
                </Btn>
              ) : (
                <p className="ohw-said" data-undone="1">
                  {t('g2b.onYourWords.revoked', {
                    actor: actorTypeWord(act.revoked.actorType).text,
                    id: act.revoked.actorId,
                    at: act.revoked.at,
                  })}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} />}
      <style href="mole-office-on-your-words" precedence="default">
        {ACTS_ON_YOUR_WORDS_CSS}
      </style>
    </Panel>
  )
}

/**
 * Where the words were said, in the page's language.
 *
 * The same reading as `wherePlainly` in @shared/warrant.ts: a place with an id is `<word>:<id>`, and a
 * place this file has no word for is drawn as it was stored rather than guessed at.
 */
function wherePlainly(where: string): string {
  if (where === 'terminal') return t('g2b.onYourWords.place.terminal')
  if (where === 'ui') return t('g2b.onYourWords.place.ui')
  const colon = where.indexOf(':')
  if (colon <= 0) return where
  const word = where.slice(0, colon)
  const id = where.slice(colon + 1)
  if (word === 'message') return t('g2b.onYourWords.place.message', { id })
  if (word === 'comment') return t('g2b.onYourWords.place.comment', { id })
  return where
}

/** The panel above. Quote with plain words in here: a backtick would close the string. */
const ACTS_ON_YOUR_WORDS_CSS = `
.ohw-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pad-lg); }
.ohw-act { display: grid; gap: var(--pad-sm); }
.ohw-act[data-state='revoked'] { opacity: 0.72; }
.ohw-what { margin: 0; font-size: var(--fs-2); color: var(--text-2); }
.ohw-words {
  margin: 0;
  padding: var(--pad);
  border-left: 3px solid var(--border-strong);
  background: var(--panel-2);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 84ch;
}
.ohw-said { margin: 0; font-size: var(--fs-1); color: var(--text-3); }
.ohw-said[data-undone='1'] { color: var(--text-2); }
.ohw-act[data-state='standing'] .px-btn { justify-self: start; }
`
