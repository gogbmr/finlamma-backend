import { getConsentRequestView } from "@/server/onboarding/service";
import { ConsentActions } from "./consent-actions";

function ConsentMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-700">{body}</p>
    </main>
  );
}

// Public page - no auth. GET is a pure read (see getConsentRequestView):
// opening this link, including an email security scanner's automatic
// prefetch, never records consent, a refusal or a withdrawal. Only the "I
// consent" button below (a Server Action, a real POST triggered by an
// actual click) does.
export default async function ConsentConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <ConsentMessage
        title="Missing link"
        body="This page needs a valid consent link from your email."
      />
    );
  }

  const view = await getConsentRequestView(token);

  if (view.state === "invalid") {
    return (
      <ConsentMessage
        title="Invalid link"
        body="This consent link doesn't match any request. Ask your child to send a new one from the app."
      />
    );
  }
  if (view.state === "expired") {
    return (
      <ConsentMessage
        title="Link expired"
        body="This consent link has expired (links are valid for 7 days). Ask your child to request a new one from the app."
      />
    );
  }
  if (view.state === "already_resolved") {
    return (
      <ConsentMessage
        title="Already handled"
        body="This request has already been responded to. No further action is needed."
      />
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Parental consent for Finlamma</h1>
      <p className="mt-2 text-neutral-700">
        <strong>{view.childFirstName}</strong> wants to use Finlamma, a financial-literacy app for
        students. Because they&apos;re under 18, we need your consent before they get full
        access.
      </p>

      <section className="mt-6 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <h2 className="font-medium">What we collect</h2>
        <p>
          Date of birth, your name and email (as their parent/guardian), and normal app-usage
          data (lessons completed, virtual &quot;V Money&quot; earned - never real money). See
          the full policies below.
        </p>
      </section>

      <div className="mt-6 space-y-3">
        {view.documents.map((doc) => (
          <details key={doc.type} className="rounded-lg border border-neutral-200 p-4">
            <summary className="cursor-pointer text-sm font-medium capitalize">
              {doc.type.replace("_", " ")} (v{doc.version})
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{doc.content.en}</p>
          </details>
        ))}
      </div>

      <ConsentActions token={token} />
    </main>
  );
}
