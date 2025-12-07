export enum MetadataKey {
  MentionedTime = "mentioned_time",
  MentionedRelativeTime = "mentioned_rel_time",
  MentionedDate = "mentioned_date",
  MentionedRelativeDate = "mentioned_rel_date",
  MentionedLocation = "mentioned_location",
  MentionedRelativeLocation = "mentioned_rel_location",
  MentionedRoom = "mentioned_room",
  MentionedPerson = "mentioned_person",
  MentionedTopic = "mentioned_topic",
  CurrentTime = "cur_time",
  CurrentDate = "cur_date",
  CurrentLocation = "cur_location",
  MessageIntent = "message_intent",
  MessageTopic = "message_topic"
}

export type MetadataCategory =
  | "time"
  | "date"
  | "location"
  | "room"
  | "person"
  | "topic"
  | "intent"
  | "context";

export type MetadataExtractorDescriptor = {
  key: MetadataKey;
  category: MetadataCategory;
  description: string;
  systemPrompt: string;
};

export type MetadataValue = string | null;
export type MetadataMap = Partial<Record<MetadataKey, MetadataValue>>;

export const METADATA_EXTRACTORS: MetadataExtractorDescriptor[] = [
  {
    key: MetadataKey.MentionedTime,
    category: "time",
    description: "Clock times explicitly mentioned (e.g., 3:30 PM).",
    systemPrompt: "Extract exact clock times stated. No relative phrases. Return the time text or null."
  },
  {
    key: MetadataKey.MentionedRelativeTime,
    category: "time",
    description: "Relative time hints (e.g., in 10 minutes, later tonight).",
    systemPrompt: "Extract relative time phrases (soon, later, in X minutes). Return concise phrase or null."
  },
  {
    key: MetadataKey.MentionedDate,
    category: "date",
    description: "Specific calendar dates mentioned (e.g., March 3rd, 2025-01-04).",
    systemPrompt: "Extract explicit dates. Keep the date text as written. Return null if none."
  },
  {
    key: MetadataKey.MentionedRelativeDate,
    category: "date",
    description: "Relative dates (yesterday, tomorrow, next week, last month).",
    systemPrompt: "Extract relative date phrases (yesterday, tomorrow, next week). Return concise phrase or null."
  },
  {
    key: MetadataKey.MentionedLocation,
    category: "location",
    description: "Named places (cities, venues, workplaces) mentioned.",
    systemPrompt: "Extract concrete place names (city, venue, workplace). Do not include rooms. Return name or null."
  },
  {
    key: MetadataKey.MentionedRelativeLocation,
    category: "location",
    description: "Relative location hints (here, there, nearby store, down the street).",
    systemPrompt: "Extract relative place references (nearby, down the street, there). Return short phrase or null."
  },
  {
    key: MetadataKey.MentionedRoom,
    category: "room",
    description: "Rooms/areas in a home (kitchen, bedroom, garage).",
    systemPrompt: "Extract room names (kitchen, living room, garage). Return the room or null."
  },
  {
    key: MetadataKey.MentionedPerson,
    category: "person",
    description: "People referenced by name or relation.",
    systemPrompt: "Extract person names or roles (John, my boss). Return concise name/role or null."
  },
  {
    key: MetadataKey.MentionedTopic,
    category: "topic",
    description: "Specific subjects referenced in the message.",
    systemPrompt: "Extract the main subject(s) mentioned (e.g., groceries, project launch). Keep it short or null."
  },
  {
    key: MetadataKey.CurrentTime,
    category: "context",
    description: "Current time when the message is processed.",
    systemPrompt: "Echo the provided current time value only."
  },
  {
    key: MetadataKey.CurrentDate,
    category: "context",
    description: "Current date when the message is processed.",
    systemPrompt: "Echo the provided current date value only."
  },
  {
    key: MetadataKey.CurrentLocation,
    category: "location",
    description: "Current known location for the conversation/device.",
    systemPrompt: "Echo the provided current location value only (or null if unknown)."
  },
  {
    key: MetadataKey.MessageIntent,
    category: "intent",
    description: "Primary intent of the message (request, inform, ask, command).",
    systemPrompt: "Classify the intent in a few words (e.g., ask for info, set reminder, control device)."
  },
  {
    key: MetadataKey.MessageTopic,
    category: "topic",
    description: "High-level topic/theme of the message.",
    systemPrompt: "Summarize the main topic in a few words. Avoid sentences."
  }
];

export const METADATA_KEYS: MetadataKey[] = METADATA_EXTRACTORS.map((e) => e.key);

