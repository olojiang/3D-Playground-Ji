import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/core/seo";
import { allExamples } from "@/server/catalog";
import { DOCS } from "@/content/docs";

/** Generated from the lesson catalog and docs, so new lessons appear automatically. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries({ examples: allExamples(), docs: DOCS });
}
