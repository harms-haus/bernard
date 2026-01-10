import { BraveSearch } from "@langchain/community/tools/brave_search";

const searchWeb = process.env.BRAVE_SEARCH_API_KEY ? new BraveSearch({
  apiKey: process.env.BRAVE_SEARCH_API_KEY,
}) : undefined;

export const TOOLS = searchWeb ? [searchWeb] : [];
