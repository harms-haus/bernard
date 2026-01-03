/**
 * Status message pools for different tool types and general use.
 * All messages are designed to be fun, funny, and engaging.
 */

/**
 * General status messages that rotate when no tool-specific status is set
 */
export const GENERAL_STATUS_MESSAGES = [
  "thinking...",
  "working on it...",
  "churning...",
  "boiling...",
  "fantasizing...",
  "diving in...",
  "processing...",
  "computing...",
  "analyzing...",
  "pondering...",
  "ruminating...",
  "contemplating...",
  "mulling over...",
  "chewing on it...",
  "digesting...",
  "synthesizing...",
  "connecting dots...",
  "weaving threads...",
  "spinning wheels...",
  "turning gears...",
  "cranking...",
  "grinding...",
  "percolating...",
  "brewing...",
  "simmering...",
  "marinating...",
  "fermenting...",
  "crystallizing...",
  "solidifying...",
  "materializing...",
  "manifesting...",
  "conjuring...",
  "summoning...",
  "channeling...",
  "tapping into...",
  "reaching out...",
  "extending feelers...",
  "casting nets...",
  "trawling...",
  "dredging...",
  "mining...",
  "excavating...",
  "unearthing...",
  "discovering...",
  "uncovering...",
  "revealing...",
  "unveiling...",
  "peeling back layers...",
  "drilling down...",
  "plotting...",
  "scheming...",
  "machinating...",
  "conspiring...",
  "calculating...",
  "figuring...",
  "puzzling...",
  "wrangling...",
  "juggling...",
  "orchestrating...",
  "conducting...",
  "harmonizing...",
  "synchronizing..."
];

/**
 * Status messages for web search related tools
 */
export const WEB_SEARCH_STATUS_MESSAGES = [
  "researching...",
  "searching...",
  "reading...",
  "doom scrolling...",
  "digging deep...",
  "fact-checking...",
  "cross-referencing...",
  "verifying sources...",
  "scanning articles...",
  "parsing results...",
  "sifting through...",
  "filtering noise...",
  "extracting insights...",
  "compiling findings...",
  "synthesizing research...",
  "browsing archives...",
  "surfing the web...",
  "googling furiously...",
  "wikipedia diving...",
  "clicking links...",
  "following breadcrumbs...",
  "exploring rabbit holes...",
  "uncovering secrets...",
  "mining the internet...",
  "harvesting knowledge..."
];

/**
 * Status messages for Home Assistant related tools
 */
export const HOME_ASSISTANT_STATUS_MESSAGES = [
  "flipping switches...",
  "pressing buttons...",
  "toggling things...",
  "controlling devices...",
  "adjusting settings...",
  "manipulating controls...",
  "orchestrating devices...",
  "coordinating actions...",
  "executing commands...",
  "sending signals...",
  "powering up...",
  "monitoring sensors...",
  "checking cameras..."
];

/**
 * Status messages for weather related tools
 */
export const WEATHER_STATUS_MESSAGES = [
  "checking outside...",
  "running models...",
  "messaging ISS...",
  "plugging in radar...",
  "consulting clouds...",
  "reading tea leaves...",
  "interpreting patterns...",
  "analyzing atmospheric data...",
  "processing satellite imagery...",
  "correlating sensors...",
  "predicting precipitation...",
  "forecasting futures...",
  "measuring barometric pressure...",
  "tracking wind patterns...",
  "monitoring temperature trends...",
  "studying storm systems...",
  "calculating humidity...",
  "observing weather balloons...",
  "analyzing Doppler data...",
  "consulting meteorologists...",
  "crystal ballin'..."
];

/**
 * Get status messages for a specific tool type
 */
export function getStatusMessagesForTool(toolName: string): string[] {
  // Web search related tools
  if (['web_search', 'wikipedia_search', 'web_content', 'wikipedia_entry'].includes(toolName)) {
    return WEB_SEARCH_STATUS_MESSAGES;
  }

  // Home Assistant related tools
  if (toolName.includes('home_assistant') || toolName.includes('ha_')) {
    return HOME_ASSISTANT_STATUS_MESSAGES;
  }

  // Weather related tools
  if (toolName.includes('weather') || toolName === 'get_weather') {
    return WEATHER_STATUS_MESSAGES;
  }

  // Default to general messages
  return GENERAL_STATUS_MESSAGES;
}
