export const GUIDE_REVIEW_DATE = "2026-11-19";

export const NETWORKING_GUIDES = [
  {
    slug: "linkedin-connection-request",
    publishedAt: GUIDE_REVIEW_DATE,
    reviewedAt: GUIDE_REVIEW_DATE,
    title: "LinkedIn connection request notes",
    description: "Write a specific connection request with practical examples, a clear reason to connect, and a private 200 or 300-character note checker.",
    topic: "Start a conversation",
    readTime: "6 min read",
    imageAlt: "SyncedIn connection-note guide: a specific shared context, an honest reason to connect, and a short invitation.",
  },
  {
    slug: "networking-follow-up",
    publishedAt: GUIDE_REVIEW_DATE,
    reviewedAt: GUIDE_REVIEW_DATE,
    title: "Networking follow-up messages",
    description: "Follow up after a conference, an introduction, or an unanswered message with useful context, one small next step, and a respectful stopping point.",
    topic: "Continue a conversation",
    readTime: "5 min read",
    imageAlt: "SyncedIn follow-up guide: remember the conversation, add something useful, and leave one clear next step.",
  },
  {
    slug: "ai-networking",
    publishedAt: GUIDE_REVIEW_DATE,
    reviewedAt: GUIDE_REVIEW_DATE,
    title: "AI networking, with you in control",
    description: "Understand digital-twin networking, how it differs from automated outreach, what to review, and where human judgment still matters.",
    topic: "Understand the approach",
    readTime: "6 min read",
    imageAlt: "SyncedIn AI-networking guide: your context, a twin-to-twin draft, and a proposal for human review.",
  },
  {
    slug: "networking-goals",
    publishedAt: "2026-11-20",
    reviewedAt: "2026-11-20",
    title: "Networking goals",
    description: "Turn a broad networking goal into a specific conversation brief: your purpose, what you can offer, one possible next step, and clear boundaries.",
    topic: "Choose the purpose",
    readTime: "6 min read",
    imageAlt: "SyncedIn networking-goal guide: a specific purpose, something useful to offer, and a next step both people choose.",
  },
  {
    slug: "warm-introduction",
    publishedAt: "2026-11-20",
    reviewedAt: "2026-11-20",
    title: "Warm introduction emails",
    description: "Ask for an introduction without putting either person on the spot. Use separate permission checks, a forwardable summary, and a clear introduction after both people agree.",
    topic: "Make an introduction",
    readTime: "6 min read",
    imageAlt: "SyncedIn warm-introduction guide: a relevant reason, permission from both people, and a clear introduction.",
  },
] as const;

export type NetworkingGuide = (typeof NETWORKING_GUIDES)[number];

export const CONNECTION_NOTE_EXAMPLES = [
  {
    id: "research",
    label: "Shared research",
    text: "Hi Maya, your post on evaluating reasoning models caught my attention. I'm comparing calibration methods and would value staying connected around that work.",
    reason: "The specific topic is the connection, not a generic request to pick someone's brain.",
  },
  {
    id: "event",
    label: "After an event",
    text: "Hi Alex, I enjoyed our conversation about community-led products at the meetup. I'd like to stay in touch as we both test those ideas.",
    reason: "Name the shared conversation, then say why continuing it matters.",
  },
  {
    id: "peer",
    label: "A potential collaborator",
    text: "Hi Priya, I work on accessible onboarding and noticed your work on multilingual forms. I'd like to connect around where those two problems meet.",
    reason: "Explain a real overlap without claiming a partnership or asking for one immediately.",
  },
  {
    id: "career",
    label: "Career curiosity",
    text: "Hi Jordan, your move from research into product is relevant to a transition I'm considering. I'd appreciate connecting and following what you share about that work.",
    reason: "Acknowledge your reason directly without implying that the person owes you a referral.",
  },
] as const;

export function connectionNoteBudget(text: string, limit: 200 | 300) {
  const count = text.length;
  return { count, remaining: limit - count, fits: count <= limit };
}
