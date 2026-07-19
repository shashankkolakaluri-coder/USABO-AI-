// USABO AI — vanilla JS client. No frameworks, no build step.

const LAYERS = [
  { id: "teaching", label: "Teaching" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quizzes", label: "Quizzes" },
  { id: "test", label: "Test" },
];

const PROGRESS_KEY = "usabo_progress";
const FLASHCARD_KEY = "usabo_flashcard_status";
const QUIZ_SCORE_KEY = "usabo_quiz_scores";

const state = {
  chapters: [],
  currentChapterId: null,
  currentLayer: "teaching",
  teachingAnswers: {}, // { [chapterId]: [chosenIndex|null, ...] }
  flashcardIndex: {}, // { [chapterId]: number }
  flashcardFlipped: false,
  quizSession: null, // { chapterId, quizNum, questions, answers, submitted, score }
  testSession: null, // { chapterId, answers, submitted, grading, freeResults, mcqResults }
};

// ---------- persistence helpers ----------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* ignore quota/availability errors */
  }
}

function getProgress() {
  return loadJSON(PROGRESS_KEY, {});
}
function setProgress(chapterId, layer, value) {
  const progress = getProgress();
  if (!progress[chapterId]) progress[chapterId] = {};
  progress[chapterId][layer] = value;
  saveJSON(PROGRESS_KEY, progress);
}
function isLayerComplete(chapterId, layer) {
  const progress = getProgress();
  return !!(progress[chapterId] && progress[chapterId][layer]);
}
function chapterCompletionStatus(chapterId) {
  const progress = getProgress()[chapterId] || {};
  const done = LAYERS.filter((l) => progress[l.id]).length;
  if (done === LAYERS.length) return "full";
  if (done > 0) return "partial";
  return "none";
}

function getFlashcardStatus(chapterId) {
  const all = loadJSON(FLASHCARD_KEY, {});
  return all[chapterId] || {};
}
function setFlashcardStatus(chapterId, term, status) {
  const all = loadJSON(FLASHCARD_KEY, {});
  if (!all[chapterId]) all[chapterId] = {};
  all[chapterId][term] = status;
  saveJSON(FLASHCARD_KEY, all);
}

function getQuizScores(chapterId) {
  const all = loadJSON(QUIZ_SCORE_KEY, {});
  return all[chapterId] || {};
}
function setQuizScore(chapterId, quizNum, score, total) {
  const all = loadJSON(QUIZ_SCORE_KEY, {});
  if (!all[chapterId]) all[chapterId] = {};
  all[chapterId][quizNum] = { score, total };
  saveJSON(QUIZ_SCORE_KEY, all);
}

// ---------- utils ----------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v);
    } else {
      node.setAttribute(k, v === true ? "" : v);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}
function getChapter(id) {
  return state.chapters.find((c) => c.id === id);
}

// ---------- init ----------

async function init() {
  const app = document.getElementById("app");
  app.appendChild(el("p", { class: "empty-note" }, "Loading content..."));
  try {
    const res = await fetch("data/content.json");
    const data = await res.json();
    state.chapters = data.chapters || [];
  } catch (e) {
    app.innerHTML = "";
    app.appendChild(
      el("p", { class: "empty-note" }, "Could not load data/content.json. " + e.message)
    );
    return;
  }
  if (state.chapters.length === 0) {
    app.innerHTML = "";
    app.appendChild(el("p", { class: "empty-note" }, "No chapters found in content.json."));
    return;
  }
  state.currentChapterId = state.chapters[0].id;
  renderChapterNav();
  renderLayerNav();
  render();
}

// ---------- nav ----------

function selectChapter(id) {
  state.currentChapterId = id;
  state.quizSession = null;
  state.testSession = null;
  renderChapterNav();
  renderLayerNav();
  render();
}
function selectLayer(layerId) {
  state.currentLayer = layerId;
  renderLayerNav();
  render();
}

function renderChapterNav() {
  const nav = document.getElementById("chapter-nav");
  nav.innerHTML = "";
  state.chapters.forEach((ch) => {
    const status = chapterCompletionStatus(ch.id);
    const btn = el(
      "button",
      {
        class: "chapter-btn" + (ch.id === state.currentChapterId ? " active" : ""),
        onclick: () => selectChapter(ch.id),
      },
      [
        el("span", { class: "chapter-progress-dot " + status }),
        `Ch ${ch.number}`,
      ]
    );
    nav.appendChild(btn);
  });
}

function renderLayerNav() {
  const nav = document.getElementById("layer-nav");
  nav.innerHTML = "";
  LAYERS.forEach((layer) => {
    const complete = isLayerComplete(state.currentChapterId, layer.id);
    const btn = el(
      "button",
      {
        class: "layer-btn" + (layer.id === state.currentLayer ? " active" : ""),
        onclick: () => selectLayer(layer.id),
      },
      [layer.label, complete ? el("span", { class: "check" }, "✓") : null]
    );
    nav.appendChild(btn);
  });
}

// ---------- render dispatch ----------

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const chapter = getChapter(state.currentChapterId);
  if (!chapter) return;

  const heading = el("div", { class: "card" }, [
    el("h2", {}, `Chapter ${chapter.number}: ${chapter.title}`),
    el(
      "p",
      { class: "empty-note" },
      chapter.topics ? chapter.topics.join(" · ") : ""
    ),
  ]);
  app.appendChild(heading);

  if (state.currentLayer === "teaching") renderTeaching(app, chapter);
  else if (state.currentLayer === "flashcards") renderFlashcards(app, chapter);
  else if (state.currentLayer === "quizzes") renderQuizzes(app, chapter);
  else if (state.currentLayer === "test") renderTest(app, chapter);
}

// ---------- teaching layer ----------

function renderTeaching(app, chapter) {
  const card = el("div", { class: "card summary-block" });
  (chapter.summary || []).forEach((para) => card.appendChild(el("p", {}, para)));
  app.appendChild(card);

  if (!state.teachingAnswers[chapter.id]) {
    state.teachingAnswers[chapter.id] = new Array(
      (chapter.teachingQuestions || []).length
    ).fill(null);
  }
  const answers = state.teachingAnswers[chapter.id];

  const qCard = el("div", { class: "card" });
  qCard.appendChild(el("h3", {}, "Check your understanding"));
  (chapter.teachingQuestions || []).forEach((q, qi) => {
    const block = el("div", { class: "question-block" });
    block.appendChild(el("h4", {}, `${qi + 1}. ${q.question}`));
    const list = el("ul", { class: "choice-list" });
    q.choices.forEach((choice, ci) => {
      const answered = answers[qi] !== null;
      const btn = el(
        "button",
        {
          class:
            "choice-btn" +
            (answered && ci === q.correctIndex ? " correct" : "") +
            (answered && ci === answers[qi] && ci !== q.correctIndex ? " incorrect" : ""),
          disabled: answered ? "true" : null,
          onclick: () => {
            if (answers[qi] !== null) return;
            answers[qi] = ci;
            if (answers.every((a) => a !== null)) {
              setProgress(chapter.id, "teaching", true);
              renderLayerNav();
            }
            render();
          },
        },
        choice
      );
      list.appendChild(el("li", {}, btn));
    });
    block.appendChild(list);
    if (answers[qi] !== null) {
      block.appendChild(el("p", { class: "explanation" }, q.explanation));
    }
    qCard.appendChild(block);
  });
  app.appendChild(qCard);
}

// ---------- flashcards layer ----------

function renderFlashcards(app, chapter) {
  const cards = chapter.flashcards || [];
  if (cards.length === 0) {
    app.appendChild(el("div", { class: "card" }, el("p", { class: "empty-note" }, "No flashcards yet.")));
    return;
  }
  if (state.flashcardIndex[chapter.id] === undefined) {
    state.flashcardIndex[chapter.id] = 0;
  }
  const idx = state.flashcardIndex[chapter.id];
  const cardData = cards[idx];
  const statusMap = getFlashcardStatus(chapter.id);
  const reviewed = Object.keys(statusMap).length;

  const wrap = el("div", { class: "card flashcard-wrap" });
  wrap.appendChild(
    el("p", { class: "flashcard-meta" }, `Card ${idx + 1} of ${cards.length} · ${reviewed}/${cards.length} reviewed`)
  );

  const face = el(
    "div",
    {
      class: "flashcard",
      onclick: () => {
        state.flashcardFlipped = !state.flashcardFlipped;
        render();
      },
    },
    state.flashcardFlipped
      ? el("span", { class: "definition" }, cardData.definition)
      : el("span", { class: "term" }, cardData.term)
  );
  wrap.appendChild(face);

  const advance = () => {
    state.flashcardFlipped = false;
    state.flashcardIndex[chapter.id] = (idx + 1) % cards.length;
    const allReviewed = cards.every((c) => !!getFlashcardStatus(chapter.id)[c.term]);
    if (allReviewed) {
      setProgress(chapter.id, "flashcards", true);
      renderLayerNav();
    }
    render();
  };

  const controls = el("div", { class: "flashcard-controls" }, [
    el(
      "button",
      {
        class: "btn secondary",
        onclick: () => {
          setFlashcardStatus(chapter.id, cardData.term, "review");
          advance();
        },
      },
      "Review again"
    ),
    el(
      "button",
      {
        class: "btn",
        onclick: () => {
          setFlashcardStatus(chapter.id, cardData.term, "got");
          advance();
        },
      },
      "Got it"
    ),
  ]);
  wrap.appendChild(controls);
  app.appendChild(wrap);
}

// ---------- quizzes layer ----------

function renderQuizzes(app, chapter) {
  if (state.quizSession && state.quizSession.chapterId === chapter.id) {
    renderQuizSession(app, chapter);
    return;
  }
  const pool = chapter.practicePool || [];
  const scores = getQuizScores(chapter.id);
  const grid = el("div", { class: "quiz-picker" });
  [1, 2, 3].forEach((num) => {
    const prior = scores[num];
    const btn = el(
      "button",
      {
        class: "card quiz-pick-card",
        onclick: () => startQuiz(chapter, num),
      },
      [
        el("h3", {}, `Quiz ${num}`),
        el("p", { class: "empty-note" }, "10 questions, randomized from the practice pool."),
        prior
          ? el("span", { class: "score-tag" }, `Last score: ${prior.score}/${prior.total}`)
          : el("span", { class: "score-tag" }, "Not attempted yet"),
      ]
    );
    grid.appendChild(btn);
  });
  if (pool.length === 0) {
    app.appendChild(el("div", { class: "card" }, el("p", { class: "empty-note" }, "No practice pool questions yet.")));
    return;
  }
  app.appendChild(grid);
}

function startQuiz(chapter, quizNum) {
  const pool = chapter.practicePool || [];
  const questions = sample(pool, 10);
  state.quizSession = {
    chapterId: chapter.id,
    quizNum,
    questions,
    answers: new Array(questions.length).fill(null),
    submitted: false,
  };
  render();
}

function renderQuizSession(app, chapter) {
  const session = state.quizSession;
  const card = el("div", { class: "card" });
  card.appendChild(el("h3", {}, `Quiz ${session.quizNum}`));

  if (session.submitted) {
    const correctCount = session.questions.filter(
      (q, i) => session.answers[i] === q.correctIndex
    ).length;
    card.appendChild(
      el("p", { class: "result-summary" }, `Score: ${correctCount} / ${session.questions.length}`)
    );
  } else {
    card.appendChild(
      el("p", { class: "quiz-progress" }, `${session.answers.filter((a) => a !== null).length} / ${session.questions.length} answered`)
    );
  }
  app.appendChild(card);

  session.questions.forEach((q, qi) => {
    const block = el("div", { class: "card question-block" });
    block.appendChild(el("h4", {}, `${qi + 1}. ${q.question}`));
    const list = el("ul", { class: "choice-list" });
    q.choices.forEach((choice, ci) => {
      const chosen = session.answers[qi] === ci;
      const showResult = session.submitted;
      const btn = el(
        "button",
        {
          class:
            "choice-btn" +
            (!showResult && chosen ? " selected" : "") +
            (showResult && ci === q.correctIndex ? " correct" : "") +
            (showResult && chosen && ci !== q.correctIndex ? " incorrect" : ""),
          disabled: session.submitted ? "true" : null,
          onclick: () => {
            if (session.submitted) return;
            session.answers[qi] = ci;
            render();
          },
        },
        choice
      );
      list.appendChild(el("li", {}, btn));
    });
    block.appendChild(list);
    if (session.submitted) {
      block.appendChild(el("p", { class: "explanation" }, q.explanation));
    }
    app.appendChild(block);
  });

  const footer = el("div", { class: "card" });
  if (!session.submitted) {
    const allAnswered = session.answers.every((a) => a !== null);
    footer.appendChild(
      el(
        "button",
        {
          class: "btn",
          disabled: allAnswered ? null : "true",
          onclick: () => {
            session.submitted = true;
            const correctCount = session.questions.filter(
              (q, i) => session.answers[i] === q.correctIndex
            ).length;
            setQuizScore(chapter.id, session.quizNum, correctCount, session.questions.length);
            const scores = getQuizScores(chapter.id);
            if (scores[1] && scores[2] && scores[3]) {
              setProgress(chapter.id, "quizzes", true);
              renderLayerNav();
            }
            render();
          },
        },
        "Submit quiz"
      )
    );
  } else {
    footer.appendChild(
      el(
        "button",
        { class: "btn secondary", onclick: () => { state.quizSession = null; render(); } },
        "Back to quizzes"
      )
    );
  }
  app.appendChild(footer);
}

// ---------- test layer ----------

function renderTest(app, chapter) {
  const questions = chapter.test || [];
  if (questions.length === 0) {
    app.appendChild(el("div", { class: "card" }, el("p", { class: "empty-note" }, "No test questions yet.")));
    return;
  }
  if (!state.testSession || state.testSession.chapterId !== chapter.id) {
    const startCard = el("div", { class: "card" }, [
      el("p", {}, `${questions.length} questions: multiple choice plus free-response, graded live.`),
      el(
        "button",
        {
          class: "btn",
          onclick: () => {
            state.testSession = {
              chapterId: chapter.id,
              answers: new Array(questions.length).fill(null),
              submitted: false,
              grading: false,
              freeResults: {},
            };
            render();
          },
        },
        "Start test"
      ),
    ]);
    app.appendChild(startCard);
    return;
  }

  const session = state.testSession;

  if (session.submitted) {
    const mcqTotal = questions.filter((q) => q.type !== "free").length;
    const mcqCorrect = questions.filter(
      (q, i) => q.type !== "free" && session.answers[i] === q.correctIndex
    ).length;
    app.appendChild(
      el("div", { class: "card" }, [
        el("p", { class: "result-summary" }, `Multiple choice: ${mcqCorrect} / ${mcqTotal}`),
        el("p", { class: "empty-note" }, "Free-response scores shown per question below."),
      ])
    );
  }

  questions.forEach((q, qi) => {
    const block = el("div", { class: "card question-block" });
    block.appendChild(el("h4", {}, `${qi + 1}. ${q.question}`));

    if (q.type === "free") {
      if (!session.submitted) {
        const textarea = el("textarea", {
          placeholder: "Write your answer here...",
          oninput: (e) => {
            session.answers[qi] = e.target.value;
          },
        });
        textarea.value = session.answers[qi] || "";
        block.appendChild(el("div", { class: "free-response" }, textarea));
      } else {
        const result = session.freeResults[qi];
        block.appendChild(el("p", {}, [el("strong", {}, "Your answer: "), session.answers[qi] || "(no answer)"]));
        if (!result) {
          block.appendChild(el("p", { class: "loading-line" }, "Grading..."));
        } else if (result.error) {
          block.appendChild(el("p", { class: "loading-line" }, result.feedback));
        } else {
          block.appendChild(el("span", { class: "grade-tag " + result.score }, result.score));
          if (result.pointsHit && result.pointsHit.length) {
            const hit = el("ul", { class: "points-list hit" });
            result.pointsHit.forEach((p) => hit.appendChild(el("li", {}, p)));
            block.appendChild(hit);
          }
          if (result.pointsMissed && result.pointsMissed.length) {
            const missed = el("ul", { class: "points-list missed" });
            result.pointsMissed.forEach((p) => missed.appendChild(el("li", {}, p)));
            block.appendChild(missed);
          }
          block.appendChild(el("p", { class: "explanation" }, result.feedback));
        }
      }
    } else {
      const list = el("ul", { class: "choice-list" });
      q.choices.forEach((choice, ci) => {
        const chosen = session.answers[qi] === ci;
        const showResult = session.submitted;
        const btn = el(
          "button",
          {
            class:
              "choice-btn" +
              (!showResult && chosen ? " selected" : "") +
              (showResult && ci === q.correctIndex ? " correct" : "") +
              (showResult && chosen && ci !== q.correctIndex ? " incorrect" : ""),
            disabled: session.submitted ? "true" : null,
            onclick: () => {
              if (session.submitted) return;
              session.answers[qi] = ci;
              render();
            },
          },
          choice
        );
        list.appendChild(el("li", {}, btn));
      });
      block.appendChild(list);
      if (session.submitted) {
        block.appendChild(el("p", { class: "explanation" }, q.explanation));
      }
    }
    app.appendChild(block);
  });

  const footer = el("div", { class: "card" });
  if (!session.submitted) {
    footer.appendChild(
      el(
        "button",
        {
          class: "btn",
          disabled: session.grading ? "true" : null,
          onclick: () => submitTest(chapter, questions),
        },
        session.grading ? "Grading..." : "Submit test"
      )
    );
  } else {
    footer.appendChild(
      el(
        "button",
        {
          class: "btn secondary",
          onclick: () => {
            state.testSession = null;
            render();
          },
        },
        "Retake test"
      )
    );
  }
  app.appendChild(footer);
}

async function submitTest(chapter, questions) {
  const session = state.testSession;
  session.grading = true;
  session.submitted = true;
  render();

  const freeIndices = questions
    .map((q, i) => (q.type === "free" ? i : null))
    .filter((i) => i !== null);

  await Promise.all(
    freeIndices.map(async (qi) => {
      const q = questions[qi];
      try {
        const res = await fetch("/api/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q.question,
            answerKey: q.answerKey,
            rubricNotes: q.rubricNotes,
            studentAnswer: session.answers[qi] || "",
          }),
        });
        const data = await res.json();
        session.freeResults[qi] = data;
      } catch (e) {
        session.freeResults[qi] = {
          error: true,
          feedback: "Grading is temporarily unavailable — could not reach the grading service.",
        };
      }
      render();
    })
  );

  session.grading = false;
  setProgress(chapter.id, "test", true);
  renderLayerNav();
  render();
}

document.addEventListener("DOMContentLoaded", init);
