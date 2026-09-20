import { getWithdrawRequestView } from "@/server/onboarding/service";
import { WITHDRAW_COPY } from "../copy";
import { WithdrawPageClient } from "./withdraw-page-client";

type MessageKey = "invalidTitle" | "invalidBody" | "notApplicableTitle" | "notApplicableBody";

function WithdrawMessage({ title, body }: { title: MessageKey; body: MessageKey }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      {(["en", "hi", "hx"] as const).map((lang) => (
        <div key={lang} className="mb-6 last:mb-0">
          <h1 className="text-xl font-semibold">{WITHDRAW_COPY[lang][title]}</h1>
          <p className="mt-2 text-neutral-700">{WITHDRAW_COPY[lang][body]}</p>
        </div>
      ))}
    </main>
  );
}

// Public page - no auth. GET is a pure read (getWithdrawRequestView) -
// opening this link never withdraws anything by itself, only the button in
// WithdrawPageClient does.
export default async function ConsentWithdrawPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <WithdrawMessage title="invalidTitle" body="invalidBody" />;
  }

  const view = await getWithdrawRequestView(token);

  if (view.state === "invalid") {
    return <WithdrawMessage title="invalidTitle" body="invalidBody" />;
  }
  if (view.state === "not_applicable") {
    return <WithdrawMessage title="notApplicableTitle" body="notApplicableBody" />;
  }

  // "already_withdrawn" still shows the interactive page (in English by
  // default) - WithdrawPageClient's own action call surfaces the friendly
  // "already withdrawn" message via withdrawParentConsentAction's
  // idempotent success, in whichever language the parent picks there.
  const childFirstName = view.state === "valid" ? view.childFirstName : "your child";

  return <WithdrawPageClient token={token} childFirstName={childFirstName} />;
}
