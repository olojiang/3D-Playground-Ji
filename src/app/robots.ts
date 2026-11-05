import type { MetadataRoute } from "next";
import { robotsConfig } from "@/core/seo";

export default function robots(): MetadataRoute.Robots {
  return robotsConfig();
}
