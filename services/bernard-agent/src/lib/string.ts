/**
 * String utility functions
 */

/**
 * Calculate Levenshtein distance between two strings
 * https://en.wikipedia.org/wiki/Levenshtein_distance
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Use 1D array for memory efficiency
  const dp = new Array((m + 1) * (n + 1)).fill(0);

  const idx = (i: number, j: number) => i * (n + 1) + j;

  // Initialize first column
  for (let i = 0; i <= m; i++) {
    dp[idx(i, 0)] = i;
  }

  // Initialize first row
  for (let j = 1; j <= n; j++) {
    dp[idx(0, j)] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[idx(i, j)] = dp[idx(i - 1, j - 1)];
      } else {
        dp[idx(i, j)] = 1 + Math.min(
          dp[idx(i - 1, j)],
          dp[idx(i, j - 1)],
          dp[idx(i - 1, j - 1)]
        );
      }
    }
  }

  return dp[idx(m, n)];
}

/**
 * Calculate similarity score (0-1) between query and title using Levenshtein distance
 * https://en.wikipedia.org/wiki/Levenshtein_distance
 */
export function calculateStringSimilarity(query: string, title: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();

  const distance = levenshteinDistance(normalizedQuery, normalizedTitle);
  const maxLength = Math.max(normalizedQuery.length, normalizedTitle.length);

  if (maxLength === 0) return 1.0;

  // Convert distance to similarity (1 - normalized_distance)
  return Math.max(0, 1 - (distance / maxLength));
}
