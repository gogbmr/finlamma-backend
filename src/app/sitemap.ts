import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

const STATIC_PATHS = ["/", "/contact", "/legal/terms", "/legal/privacy", "/legal/risk_disclosure"];

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_PATHS.map((path) => ({
    url: new URL(path, env.APP_URL).toString(),
    lastModified: new Date(),
  }));
}
