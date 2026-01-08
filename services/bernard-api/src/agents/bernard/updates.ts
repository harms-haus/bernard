
/**
 * Get a random update from the reading updates list
 * @returns A random update from the reading updates list
 */
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
/**
 * Get a random transforming update from the transforming updates list
 * @returns A random transforming update from the transforming updates list
 */
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

/**
 * Get a random processing update from the processing updates list
 * @returns A random processing update from the processing updates list
 */
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

/**
 * Get a random creation update from the creation updates list
 * @returns A random creation update from the creation updates list
 */
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

export function getUpdate(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? "...";
}

