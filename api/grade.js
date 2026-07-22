// api/grade.js — Vercel serverless function (Node runtime). The only file that talks to OpenRouter.
// Never call this API from frontend JS; the key must stay server-side.

// Swap this if the free model is deprecated or too rate-limited for the demo.
// Browse current free-tier options at https://openrouter.ai/models?max_price=0
const MODEL_ID = "nvidia/nemotron-3-nano-30b-a3b:free";

const SYSTEM_PROMPT = `You are a rigorous but fair biology exam grader for USABO (USA Biology Olympiad) prep.
Grade the student's answer against the provided answer key and rubric notes.
Award "full", "partial", or "none" credit. Be specific about what the student got right and what was missing or wrong.
Respond in strict JSON only — no prose before or after, no markdown code fences. Use exactly this shape:
{"score": "full" | "partial" | "none", "pointsHit": ["..."], "pointsMissed": ["..."], "feedback": "..."}`;

function gracefulError(res, reason) {
  return res.status(200).json({
    error: true,
    feedback: `Grading is temporarily unavailable — ${reason}.`,
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return gracefulError(res, "this endpoint only accepts POST requests");
    }

    const { question, answerKey, rubricNotes, studentAnswer } = req.body || {};
    if (!question || !answerKey || !rubricNotes || studentAnswer === undefined) {
      return gracefulError(res, "the request was missing required fields");
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return gracefulError(res, "the grading service isn't configured (missing API key)");
    }

    const rubricList = Array.isArray(rubricNotes) ? rubricNotes : [rubricNotes];
    const userContent = [
      `Question: ${question}`,
      `Answer key: ${answerKey}`,
      `Rubric notes:\n${rubricList.map((p) => `- ${p}`).join("\n")}`,
      `Student answer:\n${studentAnswer}`,
    ].join("\n\n");

    const refererUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": refererUrl,
          "X-Title": "USABO AI",
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          max_tokens: 1000,
          temperature: 0.2,
        }),
      });
    } catch (networkErr) {
      return gracefulError(res, "could not reach the grading service");
    }

    if (response.status === 429) {
      return gracefulError(res, "the free grading tier hit its rate limit — try again in a few minutes");
    }
    if (!response.ok) {
      return gracefulError(res, `the grading service returned an error (status ${response.status})`);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      return gracefulError(res, "the grading service returned an unreadable response");
    }

    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      return gracefulError(res, "the grading service returned an empty response");
    }

    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (jsonErr) {
      return gracefulError(res, "the grading service returned output that couldn't be parsed");
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return gracefulError(res, "an unexpected error occurred");
  }
};
