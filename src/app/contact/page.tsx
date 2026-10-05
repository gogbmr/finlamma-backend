import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Finlamma",
  description: "Get in touch with the Finlamma team.",
};

// TODO: replace every [TO BE CONFIRMED] value below with the real detail
// before launch - needed for the App Store / Play Store listing's required
// support URL (and, for the grievance officer / registered address, for
// DPDP Act compliance - see docs/ROADMAP.md's pre-launch legal-review
// checklist). Flagged rather than guessed at, since these are the
// founder's own facts to decide (or counsel's to confirm), not something
// to invent.
const SUPPORT_EMAIL = "support@finlamma.app";
const GRIEVANCE_OFFICER_NAME = "[TO BE CONFIRMED]";
const GRIEVANCE_OFFICER_EMAIL = "[TO BE CONFIRMED]";
const BUSINESS_ADDRESS = "[TO BE CONFIRMED]";

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Back to Finlamma
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Contact us</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Support</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          Questions, feedback, or a concern about your child&apos;s account? Email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Privacy &amp; grievance officer</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          For questions, concerns, or complaints about how we handle personal data under India&apos;s
          Digital Personal Data Protection Act, 2023, contact our grievance officer:
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          {GRIEVANCE_OFFICER_NAME}
          <br />
          {GRIEVANCE_OFFICER_EMAIL}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Business address</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{BUSINESS_ADDRESS}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Parental consent</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          A parent or guardian who wants to withdraw consent for their child&apos;s account should
          use the withdraw-consent link in any email we&apos;ve sent, which works without needing to
          contact us at all.
        </p>
      </section>
    </div>
  );
}
