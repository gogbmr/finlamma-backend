// One-off backfill for users.handle_id (added in
// drizzle/0051_spotty_iron_fist.sql, nullable) - gives every pre-existing
// user a randomly-assigned handle (D73, docs/ARCHITECTURE.md) the same way
// assignRandomHandleIfMissing does for a brand-new signup. Safe to run
// again: only ever touches a user whose handle_id is currently NULL, and
// is a no-op once nobody is missing one. Run `pnpm seed:peer-handles`
// first - this does nothing useful against an empty catalog.
import "../envConfig";
import { backfillMissingHandles } from "../src/server/peer-handles/service";

async function main() {
  const { assigned, total } = await backfillMissingHandles();
  console.log(`Assigned a handle to ${assigned}/${total} user(s) that were missing one.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
