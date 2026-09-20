import { getConsentRequestView } from "@/server/onboarding/service";
import { CONFIRM_COPY } from "../copy";
import { ConsentPageClient } from "./consent-page-client";

type MessageKey =
  | "missingTitle"
  | "missingBody"
  | "invalidTitle"
  | "invalidBody"
  | "expiredTitle"
  | "expiredBody"
  | "resolvedTitle"
  | "resolvedBody";

// Shown for the terminal/error states (missing/invalid/expired/already
// resolved) - not interactive, so rather than building a language switcher
// for a rarely-seen screen, all three languages are shown stacked. A
// parent should be able to read this page in Hindi and English either way.
function ConsentMessage({ title, body }: { title: MessageKey; body: MessageKey }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      {(["en", "hi", "hx"] as const).map((lang) => (
        <div key={lang} className="mb-6 last:mb-0">
          <h1 className="text-xl font-semibold">{CONFIRM_COPY[lang][title]}</h1>
          <p className="mt-2 text-neutral-700">{CONFIRM_COPY[lang][body]}</p>
        </div>
      ))}
    </main>
  );
}

// Public page - no auth. GET is a pure read (see getConsentRequestView):
// opening this link, including an email security scanner's automatic
// prefetch, never records consent, a refusal or a withdrawal. Only the
// buttons in ConsentPageClient (Server Actions, real POSTs triggered by an
// actual click) do.
export default async function ConsentConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <ConsentMessage title="missingTitle" body="missingBody" />;
  }

  const view = await getConsentRequestView(token);

  if (view.state === "invalid") {
    return <ConsentMessage title="invalidTitle" body="invalidBody" />;
  }
  if (view.state === "expired") {
    return <ConsentMessage title="expiredTitle" body="expiredBody" />;
  }
  if (view.state === "already_resolved") {
    return <ConsentMessage title="resolvedTitle" body="resolvedBody" />;
  }

  return (
    <ConsentPageClient token={token} childFirstName={view.childFirstName} documents={view.documents} />
  );
}
