import { getWeeklyReportUnsubscribeView } from "@/server/onboarding/service";
import { WEEKLY_REPORT_UNSUBSCRIBE_COPY } from "../../copy";
import { UnsubscribePageClient } from "./unsubscribe-page-client";

type MessageKey = "invalidTitle" | "invalidBody";

function UnsubscribeMessage({ title, body }: { title: MessageKey; body: MessageKey }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      {(["en", "hi", "hx"] as const).map((lang) => (
        <div key={lang} className="mb-6 last:mb-0">
          <h1 className="text-xl font-semibold">{WEEKLY_REPORT_UNSUBSCRIBE_COPY[lang][title]}</h1>
          <p className="mt-2 text-neutral-700">{WEEKLY_REPORT_UNSUBSCRIBE_COPY[lang][body]}</p>
        </div>
      ))}
    </main>
  );
}

// Public page - no auth. Stops ONLY the weekly report email, never consent
// itself - see docs/ARCHITECTURE.md D33. GET is a pure read
// (getWeeklyReportUnsubscribeView) - opening this link never unsubscribes
// anything by itself, only the button in UnsubscribePageClient does (email
// security scanners prefetch links).
export default async function WeeklyReportUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <UnsubscribeMessage title="invalidTitle" body="invalidBody" />;
  }

  const view = await getWeeklyReportUnsubscribeView(token);

  if (view.state === "invalid") {
    return <UnsubscribeMessage title="invalidTitle" body="invalidBody" />;
  }

  // "already_unsubscribed" still shows the interactive page (in English by
  // default) - UnsubscribePageClient's own action call surfaces the friendly
  // "already unsubscribed" message via unsubscribeWeeklyReportAction's
  // idempotent success, in whichever language the parent picks there.
  const childFirstName = view.state === "valid" ? view.childFirstName : "your child";

  return <UnsubscribePageClient token={token} childFirstName={childFirstName} />;
}
