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

/**
 * Calculate Jaro similarity between two strings
 * https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance
 */
export function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  const matches1: boolean[] = new Array(len1).fill(false);
  const matches2: boolean[] = new Array(len2).fill(false);

  let matches = 0;

  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);

    for (let j = start; j < end; j++) {
      if (matches2[j] || s1[i] !== s2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    matches / len1 + matches / len2 + (matches - transpositions / 2) / matches;

  return jaro / 3;
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 * https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance
 *
 * Jaro-Winkler adds a prefix bonus to Jaro similarity, giving higher scores
 * to strings that share a common prefix (up to 4 characters).
 *
 * @param s1 First string
 * @param s2 Second string
 * @param p Scaling factor for prefix bonus (default: 0.1, max: 0.25)
 * @returns Similarity score between 0 and 1
 */
export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  p: number = 0.1
): number {
  const jaro = jaroSimilarity(s1, s2);

  // Calculate common prefix length (up to 4 characters)
  const prefixLength = getCommonPrefixLength(s1, s2);

  // Winkler modification: add prefix bonus
  // Formula: jaro + prefixLength * p * (1 - jaro)
  const boost = prefixLength * p * (1 - jaro);
  const winkler = jaro + boost;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, winkler));
}

/**
 * Get the length of the common prefix between two strings
 */
function getCommonPrefixLength(s1: string, s2: string): number {
  const maxPrefixLength = Math.min(4, s1.length, s2.length);
  let length = 0;

  for (let i = 0; i < maxPrefixLength; i++) {
    if (s1[i] === s2[i]) {
      length++;
    } else {
      break;
    }
  }

  return length;
}

/**
 * Calculate similarity score (0-1) between query and title using Jaro-Winkler distance
 * https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance
 *
 * Jaro-Winkler is generally better than Levenshtein for name matching because:
 * - It handles transpositions better (common in names)
 * - It gives a boost to strings sharing common prefixes (e.g., "Dr. Smith" vs "Doctor Smith")
 */
export function calculateStringSimilarityJaroWinkler(
  query: string,
  title: string
): number {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();

  if (normalizedQuery === normalizedTitle) return 1.0;
  if (normalizedQuery.length === 0 || normalizedTitle.length === 0) return 0.0;

  return jaroWinklerSimilarity(normalizedQuery, normalizedTitle);
}
