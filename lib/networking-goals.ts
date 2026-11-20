export type ConversationBrief = {
  purpose: string;
  contribution: string;
  nextStep: string;
  boundary: string;
};

export const CONVERSATION_BRIEF_LIMIT = 500;

export const CONVERSATION_BRIEF_EXAMPLES: ReadonlyArray<{ id: string; label: string; brief: ConversationBrief }> = [
  {
    id: "research",
    label: "Research exchange",
    brief: {
      purpose: "Compare how we evaluate reasoning-model calibration.",
      contribution: "Share one evaluation approach and what it missed.",
      nextStep: "Ask whether exchanging a short method summary here would be useful.",
      boundary: "No sales pitch, assumed meeting, or private datasets.",
    },
  },
  {
    id: "collaboration",
    label: "Potential collaboration",
    brief: {
      purpose: "Explore whether our accessible-onboarding work overlaps.",
      contribution: "Share one difficult multilingual-form design decision.",
      nextStep: "Compare one problem before discussing any project together.",
      boundary: "No commitment, hiring promise, or assumed availability.",
    },
  },
  {
    id: "event",
    label: "After an event",
    brief: {
      purpose: "Continue our meetup discussion about active small communities.",
      contribution: "Share the first-week prompt I have been testing.",
      nextStep: "Ask if comparing one onboarding lesson in this thread would help.",
      boundary: "No recurring outreach or added mailing list.",
    },
  },
];

export function formatConversationBrief(brief: ConversationBrief): string {
  const fields: ReadonlyArray<[string, string]> = [
    ["Purpose", brief.purpose],
    ["I can offer", brief.contribution],
    ["Possible next step", brief.nextStep],
    ["Boundaries", brief.boundary],
  ];
  return fields.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`).join("\n");
}

export function conversationBriefBudget(brief: ConversationBrief) {
  const text = formatConversationBrief(brief);
  return { text, count: text.length, remaining: CONVERSATION_BRIEF_LIMIT - text.length, fits: text.length <= CONVERSATION_BRIEF_LIMIT, ready: Boolean(brief.purpose.trim()) };
}
