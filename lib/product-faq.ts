export const PRODUCT_FAQ_REVIEWED_AT = "2026-11-20";

export const PRODUCT_FAQS = [
  {
    id: "what-is-syncedin", q: "What is SyncedIn?",
    a: "SyncedIn is a digital-twin networking platform. You provide goals, background, preferences, and examples. A twin can help explore a relevant introduction through an editable draft conversation. The people review the context and choose the real next step.",
    links: [{ href: "/about", label: "About SyncedIn" }],
  },
  {
    id: "linkedin", q: "How is SyncedIn different from LinkedIn?",
    a: "LinkedIn provides a professional network, profiles, content, jobs, and messaging. SyncedIn focuses on the context behind an introduction and draft conversations between twins. You can use both. A SyncedIn draft does not give permission to automate a LinkedIn account or bypass its rules.",
    links: [{ href: "/alternatives/linkedin", label: "Compare the workflows" }],
  },
  {
    id: "build-a-twin", q: "How do I build my twin?",
    a: "Create a SyncedIn account and provide the professional context you want your twin to use. Review imported information and correct it. You can also have an agent prepare a private profile draft for your approval, then refine your context as your goals change.",
    links: [{ href: "/login", label: "Create your twin" }, { href: "/agents", label: "Agent-assisted setup" }],
  },
  {
    id: "chatgpt-claude", q: "Can I use ChatGPT or Claude to set up my profile?",
    a: "Your agent can prepare a professional summary and submit a private draft for you to review in SyncedIn. Choose what to share; do not send raw chat histories, secrets, or other people's private information. Sign-in methods are shown on the sign-in screen. If a ChatGPT sign-in option is available, it verifies identity, not permission to read your conversation history.",
    links: [{ href: "/agents", label: "Set up with an agent" }],
  },
  {
    id: "context-and-privacy", q: "What happens to the context I share?",
    a: "SyncedIn stores the context you provide. Relevant context and the running conversation can be sent to the AI service at drafting time. That processing can include retention under the provider's policies and exceptions. Read the privacy policy before sharing information, and leave out credentials and unnecessary private details.",
    links: [{ href: "/privacy", label: "Data handling and service providers" }],
  },
  {
    id: "feedback-loop", q: "Do edits train a new model of me?",
    a: "Edits can inform later prompts and provide examples for a similar context. They do not retrain the underlying model. Keep corrections tied to the audience, purpose, and situation, then review later drafts rather than assuming every correction produces a permanent improvement.",
    links: [{ href: "/guides/ai-networking", label: "Contextual feedback and human review" }],
  },
  {
    id: "conversation-goal", q: "Can a conversation have a different goal from my profile?",
    a: "Yes. A specific conversation goal can guide that exchange while your broader profile remains background. Name the purpose, a possible next step, and anything out of scope. The current conversation goal editor allows 500 characters. A goal guides drafting; it does not establish another person's consent or commitment.",
    links: [{ href: "/guides/networking-goals", label: "Draft a private conversation brief" }],
  },
  {
    id: "who-can-a-twin-talk-to", q: "Who can my twin talk to?",
    a: "SyncedIn has conversations between users' twins and sample-twin experiences. Invitation pages can also sketch a conversation from public information for a recipient to inspect. That recipient-side sketch is simulated. It is not something the person actually said, and an invitation does not guarantee they will join or respond.",
    links: [{ href: "/guides/ai-networking", label: "How a networking twin works" }],
  },
  {
    id: "sync-score", q: "What does a sync score mean?",
    a: "A sync score is an AI-generated estimate of a potentially relevant connection. Treat it as a starting point for reading the actual context. It is not proof of compatibility, a verified fact about a person, a prediction of a successful relationship, or consent to contact them.",
    links: [{ href: "/guides/networking-goals", label: "Start with a specific purpose" }],
  },
  {
    id: "pricing", q: "How much does SyncedIn cost?",
    a: "The current web sign-up does not require a paid checkout. Check the actual signup screen for the available account options and any future pricing or plan details.",
    links: [{ href: "/login", label: "Current sign-up options" }],
  },
  {
    id: "edit-a-message", q: "Can I correct what my twin says?",
    a: "Use the conversation's editing controls where available and refine the underlying profile context. Check the names, claims, tone, and proposed next step. Text already shared may have been seen by another person; an edit is not a way to undo their knowledge or turn a draft commitment into consent.",
    links: [{ href: "/guides/ai-networking", label: "What to review in a draft" }],
  },
  {
    id: "phone-messaging", q: "Does saving my phone number authorize texts?",
    a: "No. Saving a number is separate from opting in to messaging. Phone alerts over iMessage, RCS, or SMS depend on your recorded consent, preferences, and configured delivery support. Use messaging preferences and the opt-out instructions included with a text. Reading these resources does not enable alerts.",
    links: [{ href: "/privacy", label: "Phone messaging and consent" }],
  },
  {
    id: "audience", q: "Can founders, freelancers, and creators use SyncedIn?",
    a: "You can use a twin to explore a professional introduction when you have a clear purpose and appropriate context. A possible cofounder, collaborator, client, or investor conversation still needs the actual people's judgment. Start with the specific exchange you want to explore.",
    links: [{ href: "/founders-cofounder", label: "Cofounder conversations" }, { href: "/guides/networking-goals", label: "Choose your conversation goal" }],
  },
  {
    id: "creator-links", q: "Can I use SyncedIn with a creator link page?",
    a: "You can share a relevant SyncedIn profile or invitation link through a channel appropriate to the relationship. Review any imported public profile information before using it. A link or import flow does not establish a partnership with another link-page service or guarantee compatibility with every service.",
    links: [{ href: "/for/linkme", label: "Creator-profile workflow" }],
  },
  {
    id: "mobile", q: "Can I use SyncedIn on my phone?",
    a: "You can use the mobile website in a browser. For current native-app or beta availability, Support can point you to the official release links.",
    links: [{ href: "/support", label: "Current release and account help" }],
  },
  {
    id: "team", q: "Who builds SyncedIn?",
    a: "SyncedIn is a Persist Ventures project created by Jackson Jesionowski, also known as Jack. The About page links the project source and support resources.",
    links: [{ href: "/about", label: "The purpose and people behind SyncedIn" }],
  },
] as const;
