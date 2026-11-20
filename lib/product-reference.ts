export const PRODUCT_REFERENCE_REVIEWED_AT = "2026-11-20";

export const PRODUCT_REFERENCE_SHORT = `# SyncedIn

> SyncedIn is a digital-twin networking platform. People provide professional context, explore an editable draft conversation, and choose the real next step.

Reviewed: ${PRODUCT_REFERENCE_REVIEWED_AT}. This reference describes the current web workflow, not a guarantee of results.

## What the product does

- A person supplies goals, background, preferences, and examples for a networking twin.
- Twins can draft a conversation around a relevant introduction. People review the names, claims, purpose, and proposed next step.
- An invitation can include a simulated recipient-side conversation based on public information. It is not something that recipient actually said or agreed to.
- Corrections can inform future prompts and context-specific examples. They do not retrain the underlying model or guarantee a permanent improvement.
- A specific conversation goal can differ from the broader profile. The current goal editor allows 500 characters.
- An agent can prepare a private profile draft for the person to review. Agent access is scoped, expiring, and revocable; it is not unrestricted access to the account.

## Public resources

- [About SyncedIn](https://syncedin.org/about)
- [FAQ: accounts, twins, privacy, and messaging](https://syncedin.org/faq)
- [Practical networking guides](https://syncedin.org/guides)
- [Connection-request notes and private length checker](https://syncedin.org/guides/linkedin-connection-request)
- [Networking follow-up examples](https://syncedin.org/guides/networking-follow-up)
- [Networking goals and private brief builder](https://syncedin.org/guides/networking-goals)
- [Warm-introduction steps and examples](https://syncedin.org/guides/warm-introduction)
- [AI networking and human review](https://syncedin.org/guides/ai-networking)
- [LinkedIn and SyncedIn workflows](https://syncedin.org/alternatives/linkedin)
- [Agent-assisted setup](https://syncedin.org/agents)
- [Public agent protocol](https://syncedin.org/join.md)
- [Privacy](https://syncedin.org/privacy)
- [Terms](https://syncedin.org/terms)
- [Support](https://syncedin.org/support)

## Important boundaries

A draft, score, public profile, or simulated reply is not proof of compatibility, an accepted agreement, or consent to contact someone. SyncedIn does not guarantee a reply, meeting, role, partnership, or funding. It does not provide permission to automate a LinkedIn account or bypass another service's rules.

Relevant provided context and the running conversation can be sent to an AI service at drafting time. Processing and retention follow the privacy policy and provider policies, including their exceptions. Do not share credentials, raw private chat histories, or unnecessary information about other people.

Saving a phone number is separate from opting in to messaging. iMessage, RCS, and SMS alerts depend on recorded consent, preferences, and configured delivery support.

The current web signup does not require a paid checkout. Check the actual signup screen for available options and Support for current native-app availability. This is not a promise of future prices, paid creator features, or universal sign-in methods.

## Project identity

SyncedIn is a Persist Ventures project created by Jackson Jesionowski, also known as Jack. Project source: https://github.com/theguysaccount/syncedin . See the About page for product purpose and support links.

Canonical website: https://syncedin.org
Sitemap: https://syncedin.org/sitemap.xml
Expanded reference: https://syncedin.org/llms-full.txt

This optional reference is not a search-engine ranking requirement or a claim of indexing.
`;

export const PRODUCT_REFERENCE_FULL = `${PRODUCT_REFERENCE_SHORT}
## A human-reviewed workflow

1. Create an account using an option currently available on the sign-in screen. Provide only the professional context you choose to share. A sign-in option does not grant access to a person's ChatGPT or Claude conversation history.
2. Review imported names, roles, source material, and goals. Public information may be incomplete, incorrect, or outdated. Correct it before using it in a draft.
3. Choose a specific purpose for the exchange. A useful brief says what you want to explore, what you can contribute, a possible next step, and anything out of scope.
4. Inspect the twin conversation and proposed next step. A simulated participant is not the real person, and generated agreement language does not bind anyone.
5. Confirm any actual introduction, meeting, shared contact details, or commitment with the people involved. Respect declines, opt-outs, and channel preferences.

## Agent-assisted setup and access

An agent can prepare a private profile draft through the public protocol. The person signs in, reviews the draft, and approves what to use. Drafts expire after 24 hours. Approved agent access has a 24-hour lifetime and the scopes read_profile, find_matches, and draft_introductions. The person can revoke it.

The protocol does not grant unrestricted messaging, phone/email access, or access to raw uploaded context. Protocol details and current endpoints: https://syncedin.org/join.md and https://syncedin.org/.well-known/agent.json . Credentials and private review links must not be published in a profile, message, search index, or analytics event.

## Scores and feedback

A sync score is an estimate to help someone inspect potentially relevant context. It is not a verified fact about a person, a personality assessment, or a prediction of a successful relationship. An edit is a contextual example for drafting, not evidence that a separate model has been trained on that person. Review later drafts rather than assuming that one correction works in every setting.

## Different tools for different work

LinkedIn provides professional identity, discovery, content, jobs, and messaging. SyncedIn focuses on context and editable twin conversations. A direct message can be enough; a twin is useful only when its extra context helps. Existing comparisons describe different workflows rather than claiming universal superiority or measured response-rate gains:

- https://syncedin.org/vs/linkedin-dms
- https://syncedin.org/vs/clay
- https://syncedin.org/vs/lemlist

Founder resources explore questions for actual people, not automated fundraising or partnership decisions:

- https://syncedin.org/founders-cofounder
- https://syncedin.org/founders-vc

## Scope of this reference

This is a factual reference for readers and systems that choose to use it. It is not a search-engine requirement, a claim of indexing, or permission to access private routes. It does not establish a partnership with any service mentioned. Consult the current product, privacy policy, and source-linked guides for details; do not infer an unlisted feature, funding round, or performance result.
`;
