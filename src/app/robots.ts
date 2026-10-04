import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /consent pages are single-use, token-gated links (parental consent /
      // re-approval) - no value indexed, and a crawled/cached link could be
      // confusing once its token has already been used.
      disallow: ["/admin", "/api", "/consent"],
    },
    sitemap: new URL("/sitemap.xml", env.APP_URL).toString(),
  };
}
