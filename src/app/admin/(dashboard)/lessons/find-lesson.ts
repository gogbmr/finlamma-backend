import { DB_CONCURRENCY_LIMIT, runWithConcurrencyLimit } from "@/lib/concurrency-limit";
import { getWorldEditorData } from "@/server/worlds/service";
import { getLessonEditorData } from "@/server/lessons/service";

// A lesson's own row doesn't say which world it's in until you already
// know the world to ask getLessonEditorData(worldId) for - there's no
// "get one lesson across every world" admin query (deliberately not
// adding one to src/server/lessons/service.ts just for this; composing
// the existing per-world function here, same cost as the list page's own
// "All worlds" filter, keeps this page-layer-only). Used by the view/edit
// pages (worlds/page.tsx, this file's siblings), which only have the
// lesson id from the URL, not its world.
export async function findLessonById(id: string) {
  const worlds = await getWorldEditorData();
  const perWorld = await runWithConcurrencyLimit(
    worlds.map((w) => () => getLessonEditorData(w.id)),
    DB_CONCURRENCY_LIMIT,
  );
  for (let i = 0; i < worlds.length; i++) {
    const lesson = perWorld[i]!.find((l) => l.id === id);
    if (lesson) return { lesson, world: worlds[i]! };
  }
  return null;
}
