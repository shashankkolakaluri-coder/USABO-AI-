# USABO AI

A study app I built for USABO (USA Biology Olympiad) prep, covering Unit 2 of Campbell Biology (Cell Biology: Chapters 6–10 — cell structure, membranes, metabolism, respiration, and photosynthesis). It's for anyone grinding through the same material and wanting something more interactive than re-reading a textbook.

## Who it's for

Me, mostly — and anyone else studying for USABO or a similar intro bio course who wants a tighter feedback loop than flashcards alone: read something short, get quizzed on it immediately, and get real feedback on free-response answers instead of just checking them against an answer key by eye.

## The 5-layer flow

Each chapter goes through the same five layers, in order:

1. **Teaching** — a short, plain-language article on the chapter's five topics, followed by 5 comprehension questions with instant feedback.
2. **Flashcards** — the chapter's vocab, flip to reveal, mark "Got it" or "Review again" as you go. Tracked in your browser so it remembers where you left off.
3. **Quizzes** — 3 quizzes per chapter, 10 random questions each, pulled from a 30-question pool with no repeats in a single quiz.
4. **Test** — 15 questions per chapter, a mix of multiple choice and free-response. Multiple choice is scored instantly; free-response goes to the AI grader (see below).
5. Progress through all four is tracked per chapter with a little completion indicator, stored in `localStorage`.

## Tech stack

Deliberately boring: plain HTML, CSS, and JavaScript — no React, no build step, no npm frontend dependencies. The only backend code is a single Vercel serverless function (`api/grade.js`). This was a hackathon constraint and it turned out to be a good one — nothing to configure, nothing to break.

## How the AI grading works

This is the one part of the app that's actually "live AI" at runtime, and it's the whole reason `api/grade.js` exists.

When you submit a free-response answer on the Test layer, the frontend POSTs `{ question, answerKey, rubricNotes, studentAnswer }` to `/api/grade`. That function calls an LLM through **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`), asking it to act as a grader: compare the student's answer against the answer key and rubric notes, and return a JSON verdict — full / partial / no credit, what was hit, what was missed, and specific feedback.

The API key never touches the browser. All grading happens server-side in `api/grade.js`, and if anything goes wrong (no key configured, network error, rate limit, garbled model output), the function returns a normal HTTP 200 with `{ error: true, feedback: "..." }` so the UI can show a friendly message instead of breaking mid-test.

**Heads up:** the app currently uses a free-tier model on OpenRouter (`nvidia/nemotron-3-nano-30b-a3b:free`, set as `MODEL_ID` at the top of `api/grade.js`). Free models on OpenRouter have a low daily request cap, so if you're hammering the test layer for a demo or during grading, you may hit "Grading is temporarily unavailable" from rate limiting rather than an actual bug. Swap `MODEL_ID` to a paid model if that becomes a problem.

## Setting up `OPENROUTER_API_KEY`

1. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. **Locally:** create a `.env.local` file in the project root with:
   ```
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```
   (`.env.local` is already in `.gitignore` — it should never get committed.)
3. **On Vercel:** go to your project → **Settings → Environment Variables** → add `OPENROUTER_API_KEY` with your key as the value → redeploy.

## Running it

There's no build step, so "running" locally just means serving static files plus the API route:

```bash
npm install -g vercel   # if you don't have it
vercel dev
```

This serves `index.html` and runs `api/grade.js` as a real serverless function on `localhost:3000`, so `/api/grade` works exactly like it will in production.

## Deploying

Push to GitHub, then import the repo into Vercel. No framework preset, no build command — it deploys as static files plus the one serverless function. Just make sure `OPENROUTER_API_KEY` is set in the project's environment variables first, or grading will silently degrade to the "temporarily unavailable" message.
