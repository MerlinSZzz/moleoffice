// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { familyWord } from '@shared/words.ts'
import { endOfSentence, listJoined, t } from '@shared/i18n.ts'
/**
 * `#/ideas` — things worth doing that nobody has committed to.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS A READING LIST, NOT A QUEUE, AND THE SORT IS THE DIFFERENCE
 * ---------------------------------------------------------------------------------------
 * Every other family page here is sorted by what is most stuck or most late. This one is newest
 * first, on purpose: nothing on it is owed to anybody, nothing on it can be late, and ranking a
 * list of hunches by urgency would invent a pressure the records do not carry. What a person does
 * with this page is read down it.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PAGE WHERE FILING MUST COST ONE KEYSTROKE
 * ---------------------------------------------------------------------------------------
 * `wanna_try` exists because filing one is meant to be free — kinds.ts says so: "a title on its own
 * is a valid wanna_try". The form this page used to carry opened with a sixteen-option kind select
 * defaulting to `module`, a title, a summary and a three-line textarea. Filing a hunch cost more
 * than having it. `QuickFile` asks for a title and nothing else, and both buttons here are the same
 * control pointed at two different kinds.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PRESS, "ADD AN IDEA", from report n9Mjk3c_sJRu, block b-17, as decided
 * ---------------------------------------------------------------------------------------
 * The page had two presses side by side, "Add an idea" and "Add something worth a try", and a page
 * has one primary press (rule R5). The second is gone from here. A thing worth a try is still filed
 * on All records, and the rows of that kind still have their own list below, "Want to try".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A ROW DRAWS (the family lists' design)
 * ---------------------------------------------------------------------------------------
 * The title; one second line, which is why the idea is parked and what it would need, or else its
 * summary; and at the right its stored state word and when it was filed. A row with no stored
 * word draws the short mark, with the reason on hover, and no longer a "no state" chip on every row.
 * The kind is not drawn on the row: the lists already separate the ideas from the things to try.
 *
 * ---------------------------------------------------------------------------------------
 * A PARKED IDEA KEEPS ITS REASON IN ITS OWN FIELD, AND THIS PAGE READS IT THERE
 * ---------------------------------------------------------------------------------------
 * An idea does not carry the `paused` block every other kind uses, because that block requires the
 * date it was put down and an idea that was never picked up has no such date. Its reason lives in
 * `parked_because`, which is canonical for the kind. `putDownReason` in shared/work.ts is the one
 * reader that knows this, and it is what `readMaybe` calls — so the reason reaches the row instead
 * of the page reporting "no reason was ever written" over a record that has one.
 */

import { useMemo } from 'react'
import type { RecordListItem } from '../../api.ts'
import { FamilyHead, PageFoot, QuickFile, sharedOrigin } from '../../components/family/parts.tsx'
import { FamilyLists, ListGroup, ListRow, OrderFold } from '../../components/family/list.tsx'
import { MAYBE_BANDS, MAYBE_BAND_WORDS, readMaybe, type MaybeBand, type MaybeReading } from '../../components/family/read.ts'
import { familyPath, recordPath, RouteLink } from '../../components/router.tsx'
import { Absence, Stamp, StoredState } from '../../components/ui.tsx'

const FOLD = 12

export function IdeasPage({ records, onFiled }: { records: readonly RecordListItem[]; onFiled: () => void }) {
  const bands = useMemo(() => {
    const out = new Map<MaybeBand, MaybeReading[]>()
    for (const band of MAYBE_BANDS) out.set(band, [])
    for (const record of records) {
      const reading = readMaybe(record)
      out.get(reading.band)?.push(reading)
    }
    // NEWEST FIRST, and the id when two were filed in the same second — without the second key two
    // draws of one project can put the same two rows in either order.
    for (const list of out.values()) {
      list.sort((a, b) =>
        a.record.createdAt === b.record.createdAt
          ? a.record.id < b.record.id
            ? -1
            : 1
          : a.record.createdAt < b.record.createdAt
            ? 1
            : -1,
      )
    }
    return out
  }, [records])

  return (
    <>
      {/* A DIRECTION IS NOT HERE, AND A COLD REVIEWER GAVE UP ON THIS PAGE LOOKING FOR ONE.
          It is filed under Findings. The one line under the title names that place, which is
          navigation and not an explanation. */}
      <FamilyHead
        // THE TITLE IS THE FAMILY'S OWN LABEL, READ FROM THE DECLARATION, so the rail row and this
        // heading are one string. src/shared/work.ts holds it, once.
        title={familyWord('ideas').text}
        lede={
          <>
            {t('g7a.ideas.started')}{' '}
            <RouteLink to={familyPath('findings')} className="px-nav">
              {t('g7a.ideas.seeFindings')}
            </RouteLink>
            {endOfSentence()}
          </>
        }
        actions={
          <QuickFile kind="idea" label={t('g7a.ideas.add')} fieldLabel={t('g7a.ideas.ideaField')} variant="primary" onFiled={onFiled} />
        }
      />

      <FamilyLists>
        {MAYBE_BANDS.map((band) => {
          const list = bands.get(band) ?? []
          // ONE EMPTY LINE, on the list that is the page. "Nothing is live" is what somebody scanning
          // this page wants to know; the other lists are dropped when they hold nothing.
          if (list.length === 0 && band !== 'live') return null
          const origin = sharedOrigin(list.map((reading) => reading.record))
          return (
            <ListGroup
              key={band}
              group={band}
              heading={MAYBE_BAND_WORDS[band].heading}
              count={list.length}
              records={list.map((reading) => reading.record)}
              foldPast={FOLD}
              empty={<Absence />}
            >
              {list.map((reading) => (
                <MaybeRow key={reading.record.id} reading={reading} sayOrigin={origin === null} />
              ))}
            </ListGroup>
          )
        })}
        <OrderFold>
          <p>{t('lists.order.ideas', { n: FOLD })}</p>
        </OrderFold>
      </FamilyLists>

      <PageFoot what={t('sheet.record')} exclusions={t('g7a.ideas.inspect')} />
    </>
  )
}

/**
 * ONE IDEA OR THING TO TRY. The second line is why it is parked and what it would need, each
 * labelled because the reader has to know which question the words answer, or else its summary.
 */
function MaybeRow({ reading, sayOrigin }: { reading: MaybeReading; sayOrigin: boolean }) {
  const wouldNeed = reading.wouldNeed === null || reading.wouldNeed.length === 0 ? null : listJoined(reading.wouldNeed)
  const facts: React.ReactNode[] = []
  if (reading.parkedBecause !== null) {
    facts.push(
      <span key="parked">
        <span className="flst-label">{t('g7a.ideas.parkedBecause')}: </span>
        {reading.parkedBecause}
      </span>,
    )
  }
  if (wouldNeed !== null) {
    facts.push(
      <span key="need">
        <span className="flst-label">{t('g7a.ideas.wouldNeed')}: </span>
        {wouldNeed}
      </span>,
    )
  }
  const line = facts.length === 0 ? reading.record.summary : facts.flatMap((one, i) => (i === 0 ? [one] : [' · ', one]))
  return (
    <ListRow
      record={reading.record}
      href={`#${recordPath(reading.record.id, reading.record.kind)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      line={line}
      // THE STORED WORD THROUGH THE ONE COMPONENT THAT DRAWS A STORED WORD. A row with none draws the
      // short mark, with the reason on hover, and no chip.
      standing={
        reading.state.word === null ? (
          <Absence title={t('sheet.state.noneStored')} />
        ) : (
          <StoredState state={reading.state.word} progress={reading.state.progress} />
        )
      }
      when={<Stamp at={reading.record.createdAt} />}
      sayOrigin={sayOrigin}
    />
  )
}
