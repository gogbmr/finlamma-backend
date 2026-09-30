import type { LocalizedText } from "@/db/schema/_helpers";
import type { NotificationKind } from "@/db/schema";

// Fixed, kid-safe copy for every notification kind EXCEPT market_news
// (whose title/body come from the actual published news story's own
// simplified headline/summary - see src/inngest/functions/news-draft.ts's
// existing per-language content, already vetted educational-only by the
// news AI pipeline - there is nothing to hardcode here for that kind).
//
// Kept as plain code, not settings_kv, unlike the Doubt Zone safety copy:
// this isn't a crisis-response string a founder needs to correct within
// minutes of a wrong-number report - an ordinary copy change here goes
// through a normal deploy, the same way any other UI string in this app
// does. Every string below was written to satisfy three constraints
// (Phase 7 kickoff decisions): never reveal a balance, VM amount or any
// other figure that could embarrass a learner in front of someone glancing
// at their lock screen; never frame anything as a comparison against other
// learners ("you're behind", "you dropped to..."); and never reference
// health, consent, or any other sensitive account state. league_rank_change
// in particular is only ever sent for a MOVE UP (see
// src/server/arena/service.ts's weekly settlement hook) - a demotion never
// generates a notification at all, so there is no "you dropped" copy to
// write in the first place.
export const NOTIFICATION_COPY: Record<Exclude<NotificationKind, "market_news">, { title: LocalizedText; body: LocalizedText }> = {
  streak_risk: {
    title: {
      en: "Your streak is about to end!",
      hi: "Aapki streak khatam hone wali hai!",
      hx: "Tumhari streak khatam hone wali hai!",
    },
    body: {
      en: "Do a quick lesson today to keep it going.",
      hi: "Ise jaari rakhne ke liye aaj ek chhota sa lesson karein.",
      hx: "Ise jaari rakhne ke liye aaj ek chhota sa lesson karo.",
    },
  },
  boss_battle: {
    title: {
      en: "New Boss Quiz unlocked!",
      hi: "Naya Boss Quiz unlock ho gaya!",
      hx: "Naya Boss Quiz unlock ho gaya!",
    },
    body: {
      en: "A new world is ready. Take on the Boss Quiz whenever you're ready.",
      hi: "Ek naya world taiyar hai. Jab chaho Boss Quiz try karein.",
      hx: "Ek naya world ready hai. Jab bhi mann kare, Boss Quiz try karo.",
    },
  },
  session_goal: {
    title: {
      en: "Goal reached!",
      hi: "Goal poora ho gaya!",
      hx: "Goal poora ho gaya!",
    },
    body: {
      en: "You hit today's learning goal. Nice work!",
      hi: "Aapne aaj ka learning goal poora kar liya. Bahut badhiya!",
      hx: "Tumne aaj ka learning goal poora kar liya. Bahut badhiya!",
    },
  },
  cheer_received: {
    title: {
      en: "You got a cheer!",
      hi: "Aapko cheer mila!",
      hx: "Tumhe cheer mila!",
    },
    body: {
      // Deliberately never names the sender - docs/ARCHITECTURE.md D53:
      // sender identity is never shown to the receiver, anywhere.
      en: "Someone cheered for you this week. Keep it up!",
      hi: "Is hafte kisi ne aapko cheer kiya. Aise hi karte rahein!",
      hx: "Is week kisi ne tumhe cheer kiya. Aise hi karte raho!",
    },
  },
  league_rank_change: {
    title: {
      en: "You moved up!",
      hi: "Aap upar badh gaye!",
      hx: "Tum upar badh gaye!",
    },
    body: {
      // No percentile/rank number, no zone name comparison to other
      // learners - purely celebratory, nothing measurable to feel bad
      // about on the flip side.
      en: "You climbed to a new zone in this week's Arena leaderboard.",
      hi: "Is hafte ke Arena leaderboard mein aap ek naye zone mein pahunch gaye.",
      hx: "Is week ke Arena leaderboard mein tum ek naye zone mein pahunch gaye.",
    },
  },
};
