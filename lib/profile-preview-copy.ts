export const PROFILE_PREVIEW_CONTEXT_LIMIT = 8000;

export const SHAREABLE_PROFILE_PROMPT = `Write a shareable professional summary of me from the work-related context I have provided. Use only facts I have shared and distinguish current facts from goals or possibilities. If something is unclear, write "unknown" instead of guessing.

Do not include credentials, raw conversation transcripts, sensitive personal details, or private information about other people. Do not infer psychological traits, hidden motives, or commitments I have not made. Keep the summary under 3,000 characters so I can review and edit it before sharing.

Use these headings:
# Professional background
# Current work
# Goals and interests
# What I can offer
# What I would like to explore
# Communication preferences`;
