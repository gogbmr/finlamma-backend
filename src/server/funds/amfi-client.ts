import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";

// AMFI's real, public, unauthenticated NAV file - the same one every Indian
// fund platform ingests from (docs/ARCHITECTURE.md D46). Redirects to
// portal.amfiindia.com as of this writing; fetch() follows redirects by
// default, so no special handling is needed for that.
const AMFI_NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

// Deliberately separate from the pure parser (amfi-parser.ts) - this is the
// one function in the domain that touches the network, so it's the one
// thing amfi-nav-ingest.test.ts mocks out; everything else is tested
// against real sample text with no network involved.
export async function fetchAmfiNavAll(): Promise<string> {
  try {
    const res = await fetch(AMFI_NAV_ALL_URL);
    if (!res.ok) {
      throw new Error(`AMFI NAVAll.txt responded ${res.status}`);
    }
    const text = await res.text();
    if (text.trim().length === 0) {
      throw new Error("AMFI NAVAll.txt returned an empty body");
    }
    return text;
  } catch (err) {
    logInternalError("funds.amfi_fetch_failed", err);
    throw new AppError("SERVICE_UNAVAILABLE", "Could not reach AMFI for the daily NAV file");
  }
}
