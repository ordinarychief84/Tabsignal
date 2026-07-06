import { ldGraph } from "@/lib/seo";

/**
 * Renders schema.org structured data as a single JSON-LD script tag.
 * Server component — the JSON is serialized at render time from the
 * builders in lib/seo (Organization, SoftwareApplication, FAQPage, …).
 */
export function JsonLd({ nodes }: { nodes: object[] }) {
  return (
    <script
      type="application/ld+json"
      // Safe: ldGraph JSON.stringifies builder output; nothing user-supplied.
      dangerouslySetInnerHTML={{ __html: ldGraph(...nodes) }}
    />
  );
}
