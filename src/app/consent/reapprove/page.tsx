import { getReapprovalRequestView } from "@/server/onboarding/service";
import { REAPPROVE_COPY } from "../copy";
import { ReapprovePageClient } from "./reapprove-page-client";

type MessageKey =
  | "missingTitle"
  | "missingBody"
  | "invalidTitle"
  | "invalidBody"
  | "expiredTitle"
  | "expiredBody"
  | "resolvedTitle"
  | "resolvedBody";

// Same "stack all three languages, no switcher" reasoning as the confirm
// page's ConsentMessage - a rarely-seen terminal screen shouldn't need one.
function ReapproveMessage({ title, body }: { title: MessageKey; body: MessageKey }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      {(["en", "hi", "hx"] as const).map((lang) => (
        <div key={lang} className="mb-6 last:mb-0">
          <h1 className="text-xl font-semibold">{REAPPROVE_COPY[lang][title]}</h1>
          <p className="mt-2 text-neutral-700">{REAPPROVE_COPY[lang][body]}</p>
        </div>
      ))}
    </main>
  );
}

// Public page - no auth, same GET-must-be-side-effect-free rule as
// /consent/confirm (see getReapprovalRequestView): opening this link,
// including an email security scanner's automatic prefetch, never records
// an approval or a decline. Only the buttons in ReapprovePageClient (Server
// Actions, real POSTs triggered by an actual click) do.
export default async function ConsentReapprovePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <ReapproveMessage title="missingTitle" body="missingBody" />;
  }

  const view = await getReapprovalRequestView(token);

  if (view.state === "invalid") {
    return <ReapproveMessage title="invalidTitle" body="invalidBody" />;
  }
  if (view.state === "expired") {
    return <ReapproveMessage title="expiredTitle" body="expiredBody" />;
  }
  if (view.state === "already_resolved") {
    return <ReapproveMessage title="resolvedTitle" body="resolvedBody" />;
  }

  return (
    <ReapprovePageClient
      token={token}
      childFirstName={view.childFirstName}
      documentType={view.documentType}
      documentVersion={view.documentVersion}
      documentContent={view.documentContent}
    />
  );
}
