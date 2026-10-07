// Content-prerequisite layer for the ~50-user dev/test seed dataset
// (docs/STATUS.md 2026-10-07 entry has the full plan). The 50-user/activity
// layer (lesson_progress, xp_events, vmoney_ledger, orders, holdings, ...)
// is built in a SEPARATE script on top of this one - this script only
// creates the catalog/content a learner's activity can be recorded against:
// lessons (all 6 kinds, per world), their backing questions, badges,
// rewards, about-me chips, a minimal news/Pulse-Check backlog, and two
// competitions.
//
// Deliberate deviation from the mentors/worlds seed convention: those seed
// as DRAFT and are never auto-published (a Phase 5 security-audit finding -
// a seed script isn't a real staff publish action). This script seeds as
// PUBLISHED instead, for the same reason scripts/seed-legal-documents.ts
// already does: the mobile app's read-side API only ever returns published
// content, so a draft lesson/badge/etc. would be invisible to the very app
// this dataset exists to let someone develop against. Every title/name/
// headline/prompt below is prefixed "[PLACEHOLDER]" in every language field
// (not a real translation - see below) specifically so it can never be
// mistaken for real content, and so it's traceable: see the single query in
// docs/STATUS.md's traceability section, which finds every row this script
// wrote via that literal prefix.
//
// hi/hx fields are NOT real translations here (unlike seed-legal-
// documents.ts's legal text) - this is disposable dev-seed content, never
// shown to a real learner, so translation quality doesn't matter the way it
// does for shipped copy. Each language field just carries the same English
// placeholder text with a language-tagged prefix, enough to prove the
// three-language UI renders correctly without implying any real translation
// work was done.
//
// Idempotency: checks once, up front, whether any placeholder-prefixed
// lesson already exists and, if so, does nothing and exits - this script is
// all-or-nothing per run, not per-row idempotent like seed-topics.ts,
// because questions/badges/rewards/chips/news/competitions have no natural
// unique key to conflict on. Re-running after a partial failure should be
// preceded by manually deleting the partial rows (all traceable by the same
// "[PLACEHOLDER]" prefix query) rather than re-running blind.
//
// Run via `pnpm seed:dev-content`.
import "../envConfig";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  aboutMeChips,
  badges,
  competitions,
  instruments,
  lessons,
  newsEditions,
  newsStories,
  questions,
  rewards,
  topics,
  worlds,
} from "../src/db/schema";
import { logActivity } from "../src/lib/activity-log";
import type { LocalizedText } from "../src/db/schema/_helpers";

const SOURCE = "seed-dev-content";
const MARK = "[PLACEHOLDER]";

// Every visible text leaf goes through this - see file header for why hi/hx
// aren't real translations here.
function L(enText: string): LocalizedText {
  return {
    en: `${MARK} ${enText}`,
    hi: `${MARK} ${enText}`,
    hx: `${MARK} ${enText}`,
  };
}

function istTodayDateString(): string {
  // Same "IST calendar date as a bare string" convention as
  // streaks.lastActiveDateIst and news_editions.date.
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

async function seedLessonsAndQuestionsForWorld(
  world: { id: string; mentorId: string },
  mentorKeyById: Map<string, string>,
  topicIds: string[],
  topicCursor: { i: number },
) {
  const nextTopicId = () => {
    const id = topicIds[topicCursor.i % topicIds.length]!;
    topicCursor.i++;
    return id;
  };

  // 3 single_select questions, shared by quiz/boss_quiz/role_play for this
  // world - real content would want distinct question sets per lesson, but
  // for dev-seed purposes a shared pool is enough to exercise the lesson
  // flow engine end to end without tripling the row count.
  const questionIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const [q] = await db
      .insert(questions)
      .values({
        format: "single_select",
        topicId: nextTopicId(),
        prompt: L(`Dev-seed question ${i} for this world's quiz steps`),
        explanation: L(`Dev-seed explanation for question ${i}`),
        payload: {
          options: [
            L("Option A").en,
            L("Option B").en,
            L("Option C").en,
          ].map((_, idx) => ({ en: `${MARK} Option ${String.fromCharCode(65 + idx)}`, hi: `${MARK} Option ${String.fromCharCode(65 + idx)}`, hx: `${MARK} Option ${String.fromCharCode(65 + idx)}` })),
        },
        answer: { correctIndex: 0 },
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: questions.id });
    questionIds.push(q!.id);
  }

  const mentorKey = mentorKeyById.get(world.mentorId) ?? "baby";

  const lessonRows = [
    {
      chapter: 1,
      step: 1,
      kind: "video" as const,
      title: L("Video lesson"),
      blurb: L("Dev-seed video lesson blurb"),
      content: {
        lengthSeconds: 48,
        scenes: [
          {
            at: 5,
            kind: "trade",
            title: L("Scene title"),
            caption: L("Scene caption"),
            mascotLine: L("Mascot line"),
          },
        ],
        cues: [],
      },
    },
    {
      chapter: 1,
      step: 2,
      kind: "story" as const,
      title: L("Story lesson"),
      blurb: L("Dev-seed story lesson blurb"),
      content: {
        lengthSeconds: 180,
        pages: [{ text: L("Story page one text") }, { text: L("Story page two text") }],
      },
    },
    {
      chapter: 1,
      step: 3,
      kind: "quiz" as const,
      title: L("Quiz lesson"),
      blurb: L("Dev-seed quiz lesson blurb"),
      content: { questionIds },
    },
    {
      chapter: 1,
      step: 4,
      kind: "boss_quiz" as const,
      title: L("Boss quiz lesson"),
      blurb: L("Dev-seed boss quiz lesson blurb"),
      content: { questionIds },
    },
    {
      chapter: 1,
      step: 5,
      kind: "role_play" as const,
      title: L("Role play lesson"),
      blurb: L("Dev-seed role play lesson blurb"),
      content: { questionIds, framing: L("Role play framing text") },
    },
    {
      chapter: 2,
      step: 1,
      kind: "doubt_zone" as const,
      title: L("Doubt zone lesson"),
      blurb: L("Dev-seed doubt zone lesson blurb"),
      content: {
        mentorKey,
        educationalOnlyNote: L(
          "This is educational content, not personal investment advice",
        ),
        chips: [
          { chipLabel: L("Why does this matter?"), reply: L("Canned dev-seed reply") },
          { chipLabel: L("What should I do next?"), reply: L("Canned dev-seed reply") },
        ],
      },
    },
  ];

  let count = 0;
  for (const row of lessonRows) {
    const inserted = await db
      .insert(lessons)
      .values({
        worldId: world.id,
        chapter: row.chapter,
        step: row.step,
        kind: row.kind,
        title: row.title,
        blurb: row.blurb,
        content: row.content,
        status: "published",
        publishedAt: new Date(),
      })
      .onConflictDoNothing({ target: [lessons.worldId, lessons.chapter, lessons.step] })
      .returning({ id: lessons.id });
    if (inserted.length > 0) count++;
  }
  return { lessonsCreated: count, questionsCreated: questionIds.length };
}

async function seedBadges() {
  const defs = [
    { category: "learning" as const, name: "First Steps", criteria: { type: "lessons_completed" as const, threshold: 5 }, vmReward: 50 },
    { category: "learning" as const, name: "Halfway There", criteria: { type: "lessons_completed" as const, threshold: 20 }, vmReward: 150 },
    { category: "learning" as const, name: "Course Clearer", criteria: { type: "lessons_completed" as const, threshold: 50 }, vmReward: 400 },
    { category: "streak" as const, name: "Three Day Streak", criteria: { type: "streak_days" as const, threshold: 3 }, vmReward: 30 },
    { category: "streak" as const, name: "Week Streak", criteria: { type: "streak_days" as const, threshold: 7 }, vmReward: 100 },
    { category: "streak" as const, name: "Month Streak", criteria: { type: "streak_days" as const, threshold: 30 }, vmReward: 500 },
    { category: "trading" as const, name: "Sharp Shooter", criteria: { type: "quiz_accuracy_pct" as const, threshold: 80 }, vmReward: 200 },
    { category: "news" as const, name: "News Hound", criteria: { type: "quiz_accuracy_pct" as const, threshold: 100 }, vmReward: 300 },
  ];
  let count = 0;
  for (const d of defs) {
    await db.insert(badges).values({
      name: L(d.name),
      description: L(`Dev-seed badge: ${d.name}`),
      category: d.category,
      criteria: d.criteria,
      vmReward: d.vmReward,
      status: "published",
      publishedAt: new Date(),
    });
    count++;
  }
  return count;
}

async function seedRewards() {
  const defs = [
    { name: "Bronze Avatar Frame", priceVm: 100 },
    { name: "Silver Avatar Frame", priceVm: 500 },
    { name: "Gold Avatar Frame", priceVm: 1500 },
    { name: "Dark Theme Unlock", priceVm: 250 },
    { name: "Confetti Effect", priceVm: 150 },
    { name: "Rare Title: Market Maven", priceVm: 3000 },
  ];
  let count = 0;
  for (const d of defs) {
    await db.insert(rewards).values({
      name: L(d.name),
      description: L(`Dev-seed reward: ${d.name}`),
      category: "finlamma",
      priceVm: d.priceVm,
      status: "published",
      publishedAt: new Date(),
    });
    count++;
  }
  return count;
}

async function seedAboutMeChips() {
  const names = [
    "Future Investor",
    "Budget Boss",
    "Curious Learner",
    "Risk Taker",
    "Saver at Heart",
    "News Nerd",
    "Quiz Champion",
    "Streak Keeper",
    "Trading Trainee",
    "Money Mindful",
  ];
  let count = 0;
  for (const name of names) {
    await db.insert(aboutMeChips).values({ name: L(name), active: true });
    count++;
  }
  return count;
}

async function seedNewsAndPulseCheck(topicIds: string[]) {
  const storyDefs = [
    { category: "rbi_rates" as const, impact: "neutral" as const, headline: "RBI holds rates steady" },
    { category: "inflation" as const, impact: "bad" as const, headline: "Inflation ticks up this quarter" },
    { category: "stock_market_basics" as const, impact: "good" as const, headline: "What a stock split actually does" },
  ];
  const storyIds: string[] = [];
  for (const [i, d] of storyDefs.entries()) {
    const [story] = await db
      .insert(newsStories)
      .values({
        topicId: topicIds[i % topicIds.length]!,
        category: d.category,
        impact: d.impact,
        content: {
          headline: L(d.headline),
          summary: L(`Dev-seed summary for: ${d.headline}`),
          body: [L(`Dev-seed body paragraph for: ${d.headline}`)],
        },
        outlet: `${MARK} Dev Seed Wire`,
        sourceUrl: "https://example.invalid/dev-seed",
        qualityGrade: "B",
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: newsStories.id });
    storyIds.push(story!.id);
  }

  const pulseQuestionIds: string[] = [];
  for (const [i, storyId] of storyIds.entries()) {
    const [q] = await db
      .insert(questions)
      .values({
        format: "single_select",
        topicId: topicIds[i % topicIds.length]!,
        sourceStoryId: storyId,
        prompt: L(`Pulse Check question for story ${i + 1}`),
        explanation: L(`Dev-seed Pulse Check explanation ${i + 1}`),
        payload: {
          options: [
            { en: `${MARK} Option A`, hi: `${MARK} Option A`, hx: `${MARK} Option A` },
            { en: `${MARK} Option B`, hi: `${MARK} Option B`, hx: `${MARK} Option B` },
          ],
        },
        answer: { correctIndex: 0 },
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ id: questions.id });
    pulseQuestionIds.push(q!.id);
  }

  await db
    .insert(newsEditions)
    .values({
      date: istTodayDateString(),
      questionIds: pulseQuestionIds,
      published: true,
    })
    .onConflictDoNothing({ target: newsEditions.date });

  return { storiesCreated: storyIds.length, pulseQuestionsCreated: pulseQuestionIds.length };
}

async function seedCompetitions() {
  const [instrument] = await db.select({ id: instruments.id }).from(instruments).limit(1);
  if (!instrument) {
    console.warn("No instruments found - skipping competitions (run pnpm seed:instruments first).");
    return 0;
  }

  const prizes = [
    { rankFrom: 1, rankTo: 1, vmAmount: 5000, badgeId: null },
    { rankFrom: 2, rankTo: 3, vmAmount: 2000, badgeId: null },
    { rankFrom: 4, rankTo: 10, vmAmount: 500, badgeId: null },
  ];
  const now = Date.now();
  const defs = [
    {
      name: "Dev Seed Weekly Challenge (open)",
      windowStart: new Date(now - 2 * 24 * 60 * 60 * 1000),
      windowEnd: new Date(now + 5 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Dev Seed Weekly Challenge (ended, unsettled)",
      windowStart: new Date(now - 14 * 24 * 60 * 60 * 1000),
      windowEnd: new Date(now - 7 * 24 * 60 * 60 * 1000),
    },
  ];
  let count = 0;
  for (const d of defs) {
    await db.insert(competitions).values({
      name: L(d.name),
      instrumentId: instrument.id,
      virtualCapitalPaise: 10_000_00,
      windowStart: d.windowStart,
      windowEnd: d.windowEnd,
      prizes,
      rules: L("Dev-seed competition rules text"),
      status: "published",
      publishedAt: new Date(),
    });
    count++;
  }
  return count;
}

async function seed() {
  const [alreadySeeded] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(sql`${lessons.title}::text LIKE ${"%" + MARK + "%"}`)
    .limit(1);
  // Casts the jsonb column to text for this existence check - good enough
  // for "does any placeholder row already exist", not used for the real
  // traceability query (see docs/STATUS.md, which queries ->>'en' directly).
  if (alreadySeeded) {
    console.log(
      "Dev-seed content already exists (found a [PLACEHOLDER] lesson) - doing nothing. " +
        "Delete the existing rows first if you want to re-run.",
    );
    process.exit(0);
  }

  const allWorlds = await db.select({ id: worlds.id, mentorId: worlds.mentorId }).from(worlds);
  if (allWorlds.length === 0) {
    console.error("No worlds found - run pnpm seed:worlds first.");
    process.exit(1);
  }
  const allMentors = await db.query.mentors.findMany({ columns: { id: true, key: true } });
  const mentorKeyById = new Map(allMentors.map((m) => [m.id, m.key]));
  const allTopics = await db.select({ id: topics.id }).from(topics);
  const topicIds = allTopics.map((t) => t.id);
  if (topicIds.length === 0) {
    console.error("No topics found - run pnpm seed:topics first.");
    process.exit(1);
  }

  let totalLessons = 0;
  let totalQuestions = 0;
  const topicCursor = { i: 0 };
  for (const world of allWorlds) {
    const { lessonsCreated, questionsCreated } = await seedLessonsAndQuestionsForWorld(
      world,
      mentorKeyById,
      topicIds,
      topicCursor,
    );
    totalLessons += lessonsCreated;
    totalQuestions += questionsCreated;
  }

  const badgesCreated = await seedBadges();
  const rewardsCreated = await seedRewards();
  const chipsCreated = await seedAboutMeChips();
  const { storiesCreated, pulseQuestionsCreated } = await seedNewsAndPulseCheck(topicIds);
  const competitionsCreated = await seedCompetitions();

  await logActivity({
    actorType: "system",
    action: "dev_content.seeded",
    metadata: {
      source: SOURCE,
      lessons: totalLessons,
      questions: totalQuestions + pulseQuestionsCreated,
      badges: badgesCreated,
      rewards: rewardsCreated,
      aboutMeChips: chipsCreated,
      newsStories: storiesCreated,
      competitions: competitionsCreated,
    },
  });

  console.log("Dev-seed content created:");
  console.log(`  worlds covered: ${allWorlds.length}`);
  console.log(`  lessons: ${totalLessons} (6 per world: video/story/quiz/boss_quiz/role_play/doubt_zone)`);
  console.log(`  questions: ${totalQuestions + pulseQuestionsCreated} (${totalQuestions} lesson quizzes + ${pulseQuestionsCreated} Pulse Check)`);
  console.log(`  badges: ${badgesCreated}`);
  console.log(`  rewards: ${rewardsCreated}`);
  console.log(`  about_me_chips: ${chipsCreated}`);
  console.log(`  news_stories: ${storiesCreated} + 1 news_edition (today, IST)`);
  console.log(`  competitions: ${competitionsCreated}`);
  console.log('All rows are PUBLISHED and prefixed "[PLACEHOLDER]" in every text field.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
