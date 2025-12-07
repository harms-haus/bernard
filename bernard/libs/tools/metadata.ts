import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { METADATA_CATEGORIES, MetadataExtractor, metadataToYaml } from "@/lib/metadata";

type ExtractorFactory = () => MetadataExtractor;

let extractorFactory: ExtractorFactory = () => new MetadataExtractor();
let cachedExtractor: MetadataExtractor | null = null;

function getExtractor(): MetadataExtractor {
  if (!cachedExtractor) {
    cachedExtractor = extractorFactory();
  }
  return cachedExtractor;
}

export const metadataTool = tool(
  async ({ message, category, current_location }) => {
    try {
      const extractor = getExtractor();
      const result = await extractor.extract({
        text: message,
        category,
        currentLocation: current_location ?? null
      });
      const yaml = metadataToYaml(result.metadata);
      return yaml || "No metadata found.";
    } catch (err) {
      cachedExtractor = null;
      const msg = err instanceof Error ? err.message : String(err);
      return `Metadata extraction failed: ${msg}`;
    }
  },
  {
    name: "gather_metadata",
    description:
      `Extract structured metadata from a user message. Choose a category from ${METADATA_CATEGORIES.join(
        ", "
      )} or "all". ` +
      "Provide a comma-separated list to run multiple categories in parallel. Returns YAML key/value pairs (null when absent).",
    schema: z.object({
      message: z.string().min(1).describe("User message to analyze for metadata."),
      category: z
        .string()
        .min(3)
        .describe(
          `Category name or comma-separated categories (e.g., "time", "topic,person", or "all"). Options: ${METADATA_CATEGORIES.join(", ")}.`
        ),
      current_location: z
        .string()
        .min(2)
        .optional()
        .describe("Known current location to include when relevant.")
    })
  }
);

export const __metadataToolTestHooks = {
  setExtractorFactory(factory?: ExtractorFactory) {
    extractorFactory = factory ?? (() => new MetadataExtractor());
    cachedExtractor = null;
  },
  resetCache() {
    cachedExtractor = null;
  }
};


