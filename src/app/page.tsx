import type { Metadata } from "next";
import {
  Ban,
  BookOpen,
  Clock,
  Coins,
  Crown,
  EyeOff,
  Flame,
  GraduationCap,
  LineChart,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AppStoreBadges } from "@/components/marketing/app-store-badges";
import { HomepageAnalyticsBeacon } from "@/components/marketing/homepage-analytics-beacon";
import { Reveal } from "@/components/marketing/reveal";
import { listPublishedWorlds } from "@/server/worlds/repo";

// Worlds are staff-created with no fixed count (D25, docs/ARCHITECTURE.md) -
// this page renders whatever is currently published, in order. Revalidated
// every 5 minutes rather than on every request, since the world list
// changes rarely and this is a public marketing page, not the live app.
export const revalidate = 300;

const TITLE = "Finlamma — Learn Finance. Build Freedom.";
const DESCRIPTION =
  "A gamified financial-literacy app for Indian students. Learn through bite-sized lessons, take quizzes, earn XP and virtual money, and practice paper trading on real market data. No real money, ever.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/brand/app-icon.png", width: 276, height: 276, alt: "Finlamma" }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/brand/app-icon.png"],
  },
};

const WHAT_ICONS = {
  learn: BookOpen,
  earn: Coins,
  practice: ShieldCheck,
};

const HOW_IT_WORKS = [
  { step: "Learn", desc: "Short video and text lessons, one idea at a time.", icon: BookOpen },
  { step: "Quiz", desc: "Timed quizzes check what stuck.", icon: Trophy },
  { step: "Earn", desc: "Earn XP and V Money as you go.", icon: Sparkles },
  { step: "Simulate", desc: "Paper trading on real market data. Zero real money at risk.", icon: LineChart },
];

const FAQS = [
  {
    q: "Is real money involved?",
    a: "No. Finlamma only uses virtual money (V Money). Trading is simulated against real market data for practice. No real money is ever deposited, traded, or withdrawn.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Finlamma is an educational app. Nothing in it, including the AI chat, is personal investment advice.",
  },
  {
    q: "Do parents need to approve their child's account?",
    a: "Yes. A parent has to give consent before a minor can use the app, in line with India's data protection law (DPDP). A parent can withdraw that consent at any time.",
  },
  {
    q: "What languages is Finlamma available in?",
    a: "English, Hindi, and Hinglish.",
  },
  {
    q: "Is my child's data safe?",
    a: "There's no chat between users and no photos. Public profiles show only a first name and last initial.",
  },
];

export default async function HomePage() {
  const publishedWorlds = await listPublishedWorlds();

  return (
    <div className="flex flex-1 flex-col">
      <HomepageAnalyticsBeacon />

      <main className="flex-1">
        {/* Hero - the energetic, teen-facing zone (D71 brief: marketing-deep
            navy + gold are reserved for this zone only, never /admin). A
            radial gold glow + two blurred colour blobs give it depth without
            a background image to download; the mascot's float animation is
            the only non-essential motion above the fold, deliberately - see
            .mascot-float / prefers-reduced-motion in globals.css. The header
            lives inside the hero (transparent, light logo) instead of a
            separate white bar above it, so the page opens as one confident
            scene instead of a strip of chrome then a banner. */}
        <section className="relative overflow-hidden bg-marketing-deep-950 text-white">
          <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
            <div className="flex items-center gap-2">
              <Image src="/brand/fmark-light.png" alt="" width={28} height={38} priority />
              <span className="text-lg font-bold text-white">FinLamma</span>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              Coming soon
            </span>
          </header>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 50% 45% at 82% 15%, color-mix(in srgb, var(--marketing-gold) 30%, transparent), transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute top-1/3 -left-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--brand-violet-600)" }}
          />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-10 px-4 pt-8 pb-16 sm:px-6 md:flex-row md:gap-12 md:pt-12 md:pb-24">
            <div className="flex-1 text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-marketing-gold">
                A learning app for Indian school students
              </span>
              <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl md:text-6xl">
                Learn Finance.
                <br />
                Build Freedom.
              </h1>
              <p className="mx-auto mt-5 max-w-md text-base text-white/75 sm:text-lg md:mx-0">
                Finlamma teaches financial skills through short lessons, quizzes, and paper
                trading on real market data. The money in the app is virtual — never real.
              </p>
              <AppStoreBadges />
            </div>
            <div className="relative shrink-0">
              <div
                className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-40 blur-3xl"
                style={{ background: "var(--marketing-gold)" }}
              />
              <Image
                src="/brand/mascot-hero.png"
                alt="Lamma, the Finlamma mascot, holding a stack of books"
                width={450}
                height={1242}
                priority
                className="mascot-float h-72 w-auto drop-shadow-2xl sm:h-96 md:h-128"
              />
            </div>
          </div>
        </section>

        {/* Dashboard preview - an illustrative example of the in-app stat
            strip (time/streak/V Money/XP), styled after the hologram-tile
            look in the brand sheet. Explicitly labelled "illustrative" -
            this is a product-UI preview, not a claim about any real
            learner's numbers, a user count, or a rating. */}
        <section className="bg-marketing-deep-900 py-14 text-white md:py-16">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-xl font-bold sm:text-2xl">Inside the app</h2>
              <p className="mt-2 text-sm text-white/60">
                Example numbers, not a real learner&apos;s data.
              </p>
            </Reveal>
            <Reveal delayMs={100}>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Clock, value: "1h 25m", label: "Time today", ring: "#38bdf8" },
                  { icon: Flame, value: "12", label: "Day streak", ring: "#fb7185" },
                  { icon: Coins, value: "6.1k", label: "V Money", ring: "var(--marketing-gold)" },
                  { icon: Star, value: "12.6k", label: "XP", ring: "var(--brand-violet-400)" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm"
                  >
                    <div
                      className="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
                      style={{ boxShadow: `inset 0 0 0 2px ${stat.ring}`, color: stat.ring }}
                    >
                      <stat.icon className="h-5 w-5" aria-hidden />
                    </div>
                    <p className="mt-3 font-mono text-xl font-bold">{stat.value}</p>
                    <p className="text-xs tracking-wide text-white/50 uppercase">{stat.label}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* What is Finlamma */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">What is Finlamma?</h2>
            <p className="mt-3 text-muted-foreground">
              A financial-literacy app built as a game: lessons, quizzes, and practice trading,
              all with virtual money.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { icon: WHAT_ICONS.learn, title: "Learn by doing", desc: "Short lessons and quizzes across a series of worlds, from the basics of money to markets." },
              { icon: WHAT_ICONS.earn, title: "Earn as you go", desc: "XP and V Money reward progress. Neither is real currency." },
              { icon: WHAT_ICONS.practice, title: "Practice safely", desc: "Paper trading on real market data. Zero real money at risk." },
            ].map((f, i) => (
              <Reveal key={f.title} delayMs={i * 100}>
                <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <f.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* World journey - staff decide how many worlds exist (D25); this
            renders whatever is currently published, in order. A connected
            vertical path (node + line on the left, card to the right, same
            on every breakpoint - a zigzag looked more "game map" in theory
            but broke the one thing that actually sells the metaphor: the
            line has to visibly touch every node) rather than a plain grid.
            The last node gets the gold "boss" ring, matching the
            prototype's own Boss Quiz framing. */}
        {publishedWorlds.length > 0 && (
          <section className="relative overflow-hidden bg-marketing-deep-950 py-16 text-white md:py-24">
            <div
              className="pointer-events-none absolute top-0 right-0 h-96 w-96 rounded-full opacity-20 blur-3xl"
              style={{ background: "var(--marketing-gold)" }}
            />
            <div className="relative mx-auto w-full max-w-xl px-4 sm:px-6">
              <Reveal className="text-center">
                <h2 className="text-2xl font-bold sm:text-3xl">The world journey</h2>
                <p className="mt-3 text-white/70">
                  Every learner moves through the same worlds, in order. Clearing a world&apos;s Boss
                  Quiz unlocks the next one.
                </p>
              </Reveal>
              <ol className="relative mt-14">
                <div
                  aria-hidden
                  className="absolute top-2 bottom-2 left-5 w-px bg-linear-to-b from-white/30 via-white/10 to-transparent"
                />
                {publishedWorlds.map((w, i) => {
                  const isLast = i === publishedWorlds.length - 1;
                  return (
                    <Reveal key={w.id} delayMs={Math.min(i, 6) * 80}>
                      <li className="relative mb-6 flex items-start gap-5 last:mb-0">
                        <span
                          className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            isLast
                              ? "bg-marketing-gold text-marketing-deep-950 ring-4 ring-marketing-gold/25"
                              : "bg-brand-violet-600 text-white ring-4 ring-brand-violet-600/25"
                          }`}
                        >
                          {isLast ? <Crown className="h-4 w-4" aria-hidden /> : i + 1}
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                          <h3 className="font-semibold text-white">{w.title.en}</h3>
                          <p className="mt-1 text-sm text-white/65">{w.tagline.en}</p>
                        </div>
                      </li>
                    </Reveal>
                  );
                })}
              </ol>
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">How it works</h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s, i) => (
              <Reveal key={s.step} delayMs={i * 80}>
                <div className="relative h-full rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <s.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <span className="mt-4 block text-xs font-semibold tracking-wider text-primary uppercase">
                    Step {i + 1}
                  </span>
                  <h3 className="mt-1 font-semibold text-foreground">{s.step}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Safety & parents - the deliberately calm, credible zone. A hard
            visual seam (top border + a plain background, no lavender tint,
            no gold/navy) marks the tonal shift away from the energetic
            sections above - parents reading this should feel like they've
            turned a page, not scrolled further down the same poster. */}
        <section className="border-t border-border bg-background py-20 md:py-28">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Reveal className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                For parents
              </span>
              <h2 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                A few things worth knowing
              </h2>
              <p className="mt-3 text-muted-foreground">
                Finlamma is built for people under 18. That changes how a few things work.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
              {[
                { icon: UserCheck, title: "Parental consent required", desc: "Before a minor can use Finlamma, a parent has to verify and give consent. A parent can withdraw that consent at any time, and the account stops working right away." },
                { icon: Ban, title: "No real money, ever", desc: "XP, V Money, trades — all of it is virtual. Finlamma never connects to a bank account, and no real trade is ever placed." },
                { icon: GraduationCap, title: "Educational only", desc: "The app teaches financial concepts. It doesn't tell anyone what to buy or sell — not students, not parents." },
                { icon: EyeOff, title: "Kid-safe by design", desc: "No chat between users, no photos. If another student can see a name, it's a first name and last initial, nothing more." },
              ].map((f) => (
                <div key={f.title} className="bg-card p-7">
                  <f.icon className="h-5 w-5 text-primary" aria-hidden />
                  <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Languages */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Languages</h2>
            <p className="mt-3 text-muted-foreground">Every lesson works in English, Hindi, and Hinglish.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {["English", "Hindi", "Hinglish"].map((lang) => (
                <span
                  key={lang}
                  className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground"
                >
                  {lang}
                </span>
              ))}
            </div>
          </Reveal>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 md:py-20">
          <Reveal>
            <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 space-y-3">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-lg border border-border bg-card px-5 py-4 open:pb-4"
                >
                  <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none">
                    <span className="flex items-center justify-between gap-4">
                      {f.q}
                      <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-8 text-center sm:px-6 md:flex-row md:justify-between md:text-left">
          <div>
            <div className="flex items-center justify-center gap-2 md:justify-start">
              <Image src="/brand/fmark.png" alt="" width={20} height={27} />
              <span className="font-semibold text-brand-violet-900">FinLamma</span>
            </div>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Finlamma is an educational app for learning financial concepts using virtual money.
              It is not investment advice and does not involve real money.
            </p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <Link href="/legal/terms" className="text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/legal/risk_disclosure" className="text-muted-foreground hover:text-foreground">
              Risk Disclosure
            </Link>
            <Link href="/contact" className="text-muted-foreground hover:text-foreground">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
