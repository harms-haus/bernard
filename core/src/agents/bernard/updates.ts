/**
 * Random update messages for Bernard agent progress reporting.
 * Provides deterministic mode for testing.
 */

// Override state for testing - provides deterministic output
let updateOverrides: string[] = [];
let overrideIndex = 0;

/**
 * Set override values for testing.
 * When set, getUpdate will return values from this array instead of random selection.
 */
export function setUpdateOverrides(overrides: string[]): void {
  updateOverrides = [...overrides];
  overrideIndex = 0;
}

/**
 * Clear override values and return to random behavior.
 */
export function clearUpdateOverrides(): void {
  updateOverrides = [];
  overrideIndex = 0;
}

/**
 * Get a random update from a list, or use override if set.
 * @internal
 */
export function getUpdate(list: string[]): string {
  if (updateOverrides.length > 0) {
    const result = updateOverrides[overrideIndex % updateOverrides.length];
    overrideIndex++;
    return result;
  }
  return list[Math.floor(Math.random() * list.length)] ?? "...";
}

export function getReadingUpdate(): string {
  const updates = [
    "Reading content...",
    "Reading the news...",
    "Looking it up...",
    "Digging in drawers...",
    "Checking under the rug...",
    "Checking trending...",
    "Checking archives...",
    "Checking logs...",
    "Checking database...",
    "Checking filesystem...",
    "Checking registry...",
    "Sifting...",
    "Sorting...",
  ];
  return getUpdate(updates);
} 

export function getSearchingUpdate(): string {
  const searches = [
    "Searching web...",
    "Searching databases...",
    "Searching filesystems...",
    "Searching registries...",
    "Finding information...",
    "Finding answers...",
    "Finding solutions...",
    "Finding insights...",
    "Finding knowledge...",
    "Finding secrets...",
    "Discovering...",
    "Exploring...",
    "Investigating...",
    "Researching...",
    "Browsing...",
    "Scrolling...",
    "Digging...",
    "Searching...",
    "Finding...",
  ];
  return getUpdate(searches);
}

export function getTransformingUpdate(): string {
  const transforms = [
    "Transforming content...",
    "Manipulating spacetime...",
    "Analyzing data...",
    "Processing information...",
    "Decoding the matrix...",
    "Unraveling the mysteries...",
    "Revealing secrets...",
    "Unveiling the truth...",
    "Uncovering the past...",
    "Solving a Rubik's cube...",
    "Breaking code...",
    "Decrypting the message...",
    "Decoding the message...",
    "Sifting...",
    "Sorting...",
  ];
  return getUpdate(transforms);
}

export function getProcessingUpdate(): string {
  const processes = [
    "Processing information...",
    "Analyzing data...",
    "Decoding the matrix...",
    "Unraveling the mysteries...",
    "Identifying wood...",
    "Breaking the code...",
    "Decrypting the message...",
    "Decoding the message...",
  ];
  return getUpdate(processes);
}

export function getCreationUpdate(): string {
  const creations = [
    "Creating content...",
    "Generating...",
    "Writing...",
    "Formulating...",
    "Composing...",
    "Crafting...",
    "Forming...",
    "Assembling...",
    "Rotating...",
    "Spinning...",
    "Twirling...",
    "Whirling...",
    "Twisting...",
    "Writhing...",
    "Wiggling...",
    "Jiggling...",
    "Organizing...",
    "Arranging...",
    "Laying out...",
  ];
  return getUpdate(creations);
}
