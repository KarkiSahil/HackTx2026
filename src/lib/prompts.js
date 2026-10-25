export const STORY_PROMPTS = [
  "What were you feeling the last time you sat here?",
  "What's a moment here you don't want to forget?",
  "What would you tell yourself the first time you sat here?",
  "Who would you bring here, and why?",
];

export const CHAIN_PROMPTS = [
  "What do you wish someone had told you in this spot?",
  "If the next person is having a hard day, what should they know?",
  "Answer the letter before yours.",
];

export function randomPrompt(prompts, current) {
  const others = prompts.filter((p) => p !== current);
  return others[Math.floor(Math.random() * others.length)] ?? prompts[0];
}
