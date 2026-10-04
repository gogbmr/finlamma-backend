import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Finlamma",
  description: "Get in touch with the Finlamma team.",
};

// TODO: replace with the real support inbox before launch - needed for the
// App Store / Play Store listing's required support URL, not just nice to
// have. Flagged rather than guessed at, since this is the founder's own
// domain/inbox to decide, not something to invent.
const SUPPORT_EMAIL = "support@finlamma.app";

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Back to Finlamma
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Contact us</h1>
      <p className="mt-4 text-sm leading-relaxed text-foreground/90">
        Questions, feedback, or a concern about your child&apos;s account? Email us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <p className="mt-4 text-sm leading-relaxed text-foreground/90">
        A parent or guardian who wants to withdraw consent for their child&apos;s account should
        use the withdraw-consent link in any email we&apos;ve sent, which works without needing to
        contact us at all.
      </p>
    </div>
  );
}
