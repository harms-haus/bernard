// Main recollection harness
export { runRecollectionHarness, type RecollectionHarnessContext } from "./recollectHarness";

// Utility functions (for testing or advanced usage)
export { computeEmbeddingsForResults, getEmbeddingsForResults } from "./embeddings";
export { rerankByUniqueness, rerankBySimilarityDiversity, cosineSimilarity } from "./rerank";
export { getChunkMessagePositions } from "./positions";
