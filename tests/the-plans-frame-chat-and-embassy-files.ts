// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES OF THE PLANS PAGES, THE FRAME, THE CHAT AND THE EMBASSY, written once. Worked out from the import graph:
 * the files those pages draw that no other page draws. One test reads this list:
 * tests/the-owners-project-is-not-in-the-source.test.ts (their comments are neutral).
 */
export const PLANS_FRAME_CHAT_AND_EMBASSY_FILES = [
  'src/web/pages/PlanPage.tsx',
  'src/web/pages/plans/PlansPage.tsx',
  'src/web/pages/plans/OnePlanPage.tsx',
  'src/web/pages/plans/PlanWriting.tsx',
  'src/web/components/Planning.tsx',
  'src/web/components/plans/PlanProgress.tsx',
  'src/web/components/plans/PlanReview.tsx',
  'src/web/components/plans/PlanTable.tsx',
  'src/web/components/plans/PlanUndo.tsx',
  'src/web/components/plans/PlanWords.ts',
  'src/web/components/plans/planitems.tsx',
  'src/web/App.tsx',
  'src/web/components/Sidebar.tsx',
  'src/web/components/BehindTheCheckout.tsx',
  'src/web/components/Forced.tsx',
  'src/web/components/HomeMoved.tsx',
  'src/web/components/ReReadStrip.tsx',
  'src/web/components/ShortcutKeysMount.tsx',
  'src/web/components/VisitingStrip.tsx',
  'src/web/components/WrongWorld.tsx',
  'src/web/components/agent/AgentSaidHere.tsx',
  'src/web/components/Chat.tsx',
  'src/web/pages/ChatPage.tsx',
  'src/web/components/ChatCircle.tsx',
  'src/web/components/chat/Quotes.tsx',
  'src/web/lib/chatdeltas.ts',
  'src/web/pages/EmbassyPage.tsx',
  'src/web/pages/CredentialPage.tsx',
  'src/web/components/ResidentMark.tsx',
] as const
