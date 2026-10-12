import { DocsView } from "@/components/DocsView";
import { DOCS } from "@/content/docs";

export default function DocsIndex() {
  return <DocsView slug={DOCS[0].slug} />;
}
