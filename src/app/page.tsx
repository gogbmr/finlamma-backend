import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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

const HOW_IT_WORKS = [
  { step: "Learn", desc: "Short video and text lessons, one idea at a time." },
  { step: "Quiz", desc: "Server-timed quizzes check what stuck." },
  { step: "Earn", desc: "Earn XP and virtual money (V Money) for progress." },
  { step: "Simulate", desc: "Practice paper trading on real market data — zero real money at risk." },
];

const FAQS = [
  {
    q: "Is real money involved?",
    a: "No. Finlamma uses virtual money (V Money) only. Trading is simulated against real market data for practice, but no real money is ever deposited, traded, or withdrawn.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Finlamma is an educational app. Nothing in the app, including the Doubt Zone chat, is personal investment advice.",
  },
  {
    q: "Do parents need to approve their child's account?",
    a: "Yes. Finlamma requires parental consent before a minor can use the app, in line with India's data protection law (DPDP). A parent can withdraw consent at any time.",
  },
  {
    q: "What languages is Finlamma available in?",
    a: "English, Hindi, and Hinglish, so lessons feel natural whichever way you think.",
  },
  {
    q: "Is my child's data safe?",
    a: "Finlamma is built kid-safe: no photos, no chat between users, and public profiles show only a first name and last initial.",
  },
];

export default async function HomePage() {
  const publishedWorlds = await listPublishedWorlds();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/brand/fmark.png" alt="" width={28} height={38} priority />
            <span className="text-lg font-bold text-brand-violet-900">FinLamma</span>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Coming soon
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-marketing-deep-950 text-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-8 px-4 py-14 sm:px-6 md:flex-row md:gap-12 md:py-20">
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl leading-tight font-bold sm:text-4xl md:text-5xl">
                Learn Finance.
                <br />
                Build Freedom.
              </h1>
              <p className="mt-4 max-w-md text-base text-white/80 sm:text-lg md:mx-0 mx-auto">
                Finlamma teaches Indian students real financial skills through bite-sized
                lessons, quizzes, and paper trading practice on real market data — with virtual
                money, not real money.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium">
                  Coming soon on Android
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium">
                  Coming soon on iOS
                </span>
              </div>
            </div>
            <div className="shrink-0">
              <Image
                src="/brand/mascot-hero.png"
                alt="Lamma, the Finlamma mascot, holding a stack of books"
                width={450}
                height={1242}
                priority
                className="h-64 w-auto sm:h-80 md:h-[28rem]"
              />
            </div>
          </div>
        </section>

        {/* What is Finlamma */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">What is Finlamma?</h2>
            <p className="mt-3 text-muted-foreground">
              A gamified financial-literacy app that turns money lessons into a game — built for
              students, and safe for parents.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { title: "Learn by doing", desc: "Short lessons and quizzes across a series of worlds, from the basics of money to markets." },
              { title: "Earn as you go", desc: "XP and virtual V Money reward progress — never real currency." },
              { title: "Practice safely", desc: "Paper trading on real market data, with zero real money at risk." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* World journey - staff decide how many worlds exist (D25); this
            renders whatever is currently published, in order. */}
        {publishedWorlds.length > 0 && (
          <section className="bg-secondary/40 py-14 md:py-20">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-bold text-foreground sm:text-3xl">The world journey</h2>
                <p className="mt-3 text-muted-foreground">
                  Every learner moves through the same worlds, in order — each one unlocked by
                  passing the world before it.
                </p>
              </div>
              <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {publishedWorlds.map((w, i) => (
                  <li key={w.id} className="rounded-xl border border-border bg-card p-5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <h3 className="mt-3 font-semibold text-foreground">{w.title.en}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{w.tagline.en}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">How it works</h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.step} className="relative rounded-xl border border-border bg-card p-6">
                <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                  Step {i + 1}
                </span>
                <h3 className="mt-1 font-semibold text-foreground">{s.step}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety & parents */}
        <section className="bg-secondary/40 py-14 md:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Safety &amp; parents</h2>
              <p className="mt-3 text-muted-foreground">
                Finlamma is built for minors, so safety comes first.
              </p>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {[
                { title: "Parental consent required", desc: "A parent must verify and consent before a minor can use Finlamma, and can withdraw that consent at any time." },
                { title: "No real money, ever", desc: "All money in the app is virtual (V Money). Finlamma never touches real bank accounts or real trades." },
                { title: "Educational only", desc: "Finlamma is for learning. Nothing in the app is personal investment advice." },
                { title: "Kid-safe by design", desc: "No photos, no chat between users. Public profiles show only a first name and last initial." },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                  <h3 className="font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Languages */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Learn your way</h2>
            <p className="mt-3 text-muted-foreground">Every lesson is available in three languages.</p>
          </div>
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
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 md:py-20">
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
          </nav>
        </div>
      </footer>
    </div>
  );
}
