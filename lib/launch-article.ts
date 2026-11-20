export const LAUNCH_ARTICLE = {
  title: "SyncedIn: a conversation before the introduction",
  description: "Why we are building context-led introductions, what an editable networking twin can help explore, and which decisions still belong to the people.",
  reviewedAt: "2026-11-20",
  disclosure: "Product perspective from the SyncedIn team, not independent reporting or a performance study.",
  introduction: [
    "A promising introduction often starts with too little context. One person sees a possible overlap; the other sees another request in an already busy inbox. More messages do not necessarily make that gap smaller.",
    "SyncedIn explores a different starting point: a conversation draft that makes the possible overlap easier to inspect. A digital twin represents the professional context, goals, preferences, and examples its owner chooses to provide. The point is not to replace a relationship. It is to help the people decide whether there is a useful conversation to have.",
  ],
  sections: [
    {
      id: "the-idea",
      heading: "An introduction is a two-sided decision",
      paragraphs: [
        "A well-written opener matters, but it cannot answer every question about fit. Why this person? What could each side contribute? Is the next step a short exchange, an introduction, or something that needs more preparation? A networking tool should help clarify those questions without treating the recipient's attention as an unlimited resource.",
        "Our product direction is to put context from both sides into that exploration. A twin-to-twin draft can reveal a useful question, a mismatch, or a proposed next step. None of those is an agreement by the actual people. The recipient can decline, correct the context, or choose a different direction.",
      ],
      steps: [],
    },
    {
      id: "the-workflow",
      heading: "What the current workflow looks like",
      paragraphs: ["The browser product has several entry points. A reviewed professional summary, a public profile import, or an agent-prepared private draft can help someone begin. These are ways to supply selected context, not access to an entire ChatGPT or Claude account."],
      steps: [
        "Choose the context. Add relevant work, goals, communication preferences, and boundaries. Review imported or generated details instead of assuming they are accurate.",
        "Give the exchange a purpose. A conversation about comparing research methods needs different context from a cofounder or investor introduction.",
        "Inspect the invitation or conversation draft. On a personalized invitation, an AI-simulated reply is not something the recipient actually said. Public-source names and background can be wrong or incomplete.",
        "Correct what does not fit. Review facts, tone, relevance, and proposed commitments. Keep an example tied to the situation where it applies.",
        "Choose the real next step. Confirm interest, availability, introductions, and any commitments with the actual people through an appropriate channel.",
      ],
    },
    {
      id: "a-useful-result",
      heading: "A useful result can be a smaller question",
      paragraphs: [
        "Consider a fictional example: Maya builds accessible onboarding tools, and Theo studies multilingual forms. A generic collaboration pitch asks both people to do the work of finding the overlap. A more useful first proposal might be to compare how each tests comprehension in a short form.",
        "That proposal is narrow enough to accept, change, or decline. It does not claim that Maya and Theo are partners, that they want a call, or that a match score proves compatibility. The draft earns its place only if it makes their decision clearer.",
        "The same principle applies to a founder introduction. A specific question about a relevant market can be more useful than an automatically polished fundraising pitch. A mutual contact's permission to share a summary is not permission to add everyone to a conversation.",
      ],
      steps: [],
    },
    {
      id: "learning-from-edits",
      heading: "Learning from corrections, without claiming model retraining",
      paragraphs: [
        "SyncedIn records edits in supported message and outreach flows so relevant examples can inform later prompts. The recipient's background and the reason for connecting matter: a formal investor note should not silently become the template for every peer conversation.",
        "This is contextual feedback, not evidence that the underlying model has been retrained or that every future draft will improve. An edit can correct a factual mistake, shorten a message, or change its purpose. Its size alone does not tell us whether it made the conversation better.",
        "The practical test is the next comparable draft. Does it preserve the correction? Is the context still current? How much human revision does it need? A real, useful exchange matters more than the number of messages a system can generate.",
      ],
      steps: [],
    },
    {
      id: "limits",
      heading: "Where the product should stop",
      paragraphs: [
        "A twin is not a complete copy of a person. An AI-generated profile is not verified identity, a simulated reply is not consent, and a drafted proposal is not a completed outcome. Important personal or professional commitments still need direct human confirmation.",
        "Preparing a note in SyncedIn is also different from controlling a LinkedIn account. It does not grant permission to bypass another platform's limits or automate its interface. For an established relationship or a simple request, a direct human message may be the better tool.",
        "Share only context appropriate to the task. AI services process supplied information to generate drafts; avoid credentials, raw private transcripts, and unnecessary details about other people. Read the current privacy policy and review the output before sharing it.",
      ],
      steps: [],
    },
    {
      id: "what-we-measure",
      heading: "What would make this worth using?",
      paragraphs: [
        "The product thesis is testable: does clearer context lead to a conversation both people actually find useful? Draft accuracy, revision effort, a recipient's choice to engage, and a completed next step are different outcomes and should be measured separately.",
        "A profile view is not a relationship. An accepted draft is not proof that a meeting happened. We do not present a network-size promise, a universal response-rate improvement, or an automatic agreement as evidence that the approach works.",
        "SyncedIn is built by Persist Ventures, with Jackson Jesionowski leading the project. This article describes our direction and current review boundaries. The About page, FAQ, and product itself provide the current team, account, and product details.",
      ],
      steps: [],
    },
  ],
  links: [
    { label: "About the project and team", href: "https://syncedin.org/about" },
    { label: "Accounts, privacy, and messaging FAQ", href: "https://syncedin.org/faq" },
    { label: "AI networking and human review", href: "https://syncedin.org/guides/ai-networking" },
    { label: "A specific networking conversation goal", href: "https://syncedin.org/guides/networking-goals" },
    { label: "Permission-based warm introductions", href: "https://syncedin.org/guides/warm-introduction" },
    { label: "Agent-assisted private-draft setup", href: "https://syncedin.org/agents" },
    { label: "Privacy policy", href: "https://syncedin.org/privacy" },
    { label: "LinkedIn's policy on unauthorized automation", href: "https://www.linkedin.com/help/linkedin/answer/a1341543" },
  ],
} as const;

export function launchArticleMarkdown(): string {
  const article = LAUNCH_ARTICLE;
  return [
    `# ${article.title}`, article.description,
    `By SyncedIn. Reviewed ${article.reviewedAt}.`, article.disclosure,
    ...article.introduction,
    ...article.sections.flatMap(section => [
      `## ${section.heading}`, ...section.paragraphs,
      ...(section.steps.length ? [section.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")] : []),
    ]),
    "## Sources and next steps",
    article.links.map(link => `- [${link.label}](${link.href})`).join("\n"),
    "[Create your twin](https://syncedin.org/login)",
    "For press, partnership, or platform inquiries: [contact the founder](https://calendly.com/JackJay).",
    "Canonical article: https://syncedin.org/article",
  ].join("\n\n") + "\n";
}
