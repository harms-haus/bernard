import { describe, it, expect } from "vitest";
import { dumpsTyped, loadsTyped, isUnserialized, deserializeUnserialized } from "../serde.js";

describe("serde", () => {
  describe("dumpsTyped/loadsTyped round-trip", () => {
    it("should serialize and deserialize primitive types", async () => {
      const strings = ["hello", "", "special chars: test"];
      for (const str of strings) {
        const [type, serialized] = await dumpsTyped(str);
        const deserialized = await loadsTyped<string>(type, serialized);
        expect(deserialized).toBe(str);
      }

      const numbers = [0, 1, -1, 3.14, Infinity, -Infinity, NaN];
      for (const num of numbers) {
        const [type, serialized] = await dumpsTyped(num);
        const deserialized = await loadsTyped<number>(type, serialized);
        // NaN check
        if (Number.isNaN(num)) {
          expect(Number.isNaN(deserialized as number)).toBe(true);
        } else {
          expect(deserialized).toBe(num);
        }
      }

      const booleans = [true, false];
      for (const bool of booleans) {
        const [type, serialized] = await dumpsTyped(bool);
        const deserialized = await loadsTyped<boolean>(type, serialized);
        expect(deserialized).toBe(bool);
      }

      const nullVal = null;
      const [nullType, nullSerialized] = await dumpsTyped(nullVal);
      const nullDeserialized = await loadsTyped<null>(nullType, nullSerialized);
      expect(nullDeserialized).toBeNull();
    });

    it("should serialize and deserialize arrays", async () => {
      const arr = [1, "two", true, null, { nested: "object" }];
      const [type, serialized] = await dumpsTyped(arr);
      const deserialized = await loadsTyped<typeof arr>(type, serialized);
      expect(deserialized).toEqual(arr);
    });

    it("should serialize and deserialize objects", async () => {
      const obj = {
        string: "value",
        number: 42,
        nested: { deep: "value" },
        array: [1, 2, 3],
      };
      const [type, serialized] = await dumpsTyped(obj);
      const deserialized = await loadsTyped<typeof obj>(type, serialized);
      expect(deserialized).toEqual(obj);
    });

    it("should serialize and deserialize Set", async () => {
      const set = new Set([1, 2, 3, "a", "b"]);
      const [type, serialized] = await dumpsTyped(set);
      const deserialized = await loadsTyped<Set<unknown>>(type, serialized);
      expect(deserialized).toBeInstanceOf(Set);
      expect(deserialized.size).toBe(set.size);
      expect(deserialized.has(1)).toBe(true);
      expect(deserialized.has("a")).toBe(true);
    });

    it("should serialize and deserialize Map", async () => {
      const map = new Map<string, unknown>([
        ["key1", "value1"],
        ["key2", "value2"],
        ["numberKey", "numberKeyValue"],
      ]);
      const [type, serialized] = await dumpsTyped(map);
      const deserialized = await loadsTyped<Map<string, unknown>>(type, serialized);
      expect(deserialized).toBeInstanceOf(Map);
      expect(deserialized.size).toBe(map.size);
      expect(deserialized.get("key1")).toBe("value1");
      expect(deserialized.get("numberKey")).toBe("numberKeyValue");
    });

    it("should serialize and deserialize RegExp", async () => {
      const regex = /test/gi;
      const [type, serialized] = await dumpsTyped(regex);
      const deserialized = await loadsTyped<RegExp>(type, serialized);
      expect(deserialized).toBeInstanceOf(RegExp);
      expect(deserialized.source).toBe(regex.source);
      expect(deserialized.flags).toBe(regex.flags);
    });

    it("should serialize and deserialize Error", async () => {
      const error = new Error("test error message");
      const [type, serialized] = await dumpsTyped(error);
      const deserialized = await loadsTyped<Error>(type, serialized);
      expect(deserialized).toBeInstanceOf(Error);
      expect(deserialized.message).toBe(error.message);
    });

    it("should serialize and deserialize Date", async () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const [type, serialized] = await dumpsTyped(date);
      const deserialized = await loadsTyped<Date>(type, serialized);
      expect(deserialized).toBeInstanceOf(Date);
      expect(deserialized.toISOString()).toBe(date.toISOString());
    });

    it("should serialize and deserialize Uint8Array", async () => {
      const buffer = new Uint8Array([1, 2, 3, 255, 128]);
      const [type, serialized] = await dumpsTyped(buffer);
      expect(type).toBe("bytes");
      const deserialized = await loadsTyped<Uint8Array>(type, serialized);
      expect(deserialized).toBeInstanceOf(Uint8Array);
      expect(deserialized).toEqual(buffer);
    });

    it("should serialize and deserialize nested complex objects", async () => {
      const mapValue = new Set([1, 2, 3]);
      const nestedValue = { nested: true };
      
      const obj = {
        messages: ["hello", "world"],
        data: new Map<string, unknown>([
          ["key1", mapValue],
          ["key2", nestedValue],
        ]),
        regex: /test/gi,
        timestamp: new Date("2024-01-15T10:30:00.000Z"),
      };
      const [type, serialized] = await dumpsTyped(obj);
      const deserialized = await loadsTyped<typeof obj>(type, serialized);
      
      expect(deserialized.messages).toEqual(obj.messages);
      
      expect(deserialized.data).toBeInstanceOf(Map);
      expect(deserialized.data.get("key1")).toBeInstanceOf(Set);
      expect(deserialized.data.get("key1")).toEqual(new Set([1, 2, 3]));
      expect(deserialized.data.get("key2")).toEqual({ nested: true });
      
      expect(deserialized.regex).toBeInstanceOf(RegExp);
      expect(deserialized.regex.source).toBe(obj.regex.source);
      
      expect(deserialized.timestamp).toBeInstanceOf(Date);
      expect(deserialized.timestamp.toISOString()).toBe(obj.timestamp.toISOString());
    });
  });

  describe("isUnserialized", () => {
    it("should return true for LangChain constructor format (lc: 1)", () => {
      const unserialized = {
        lc: 1,
        type: "constructor",
        id: ["HumanMessage"],
        kwargs: { content: "Hello" },
      };
      expect(isUnserialized(unserialized)).toBe(true);
    });

    it("should return false for regular objects", () => {
      expect(isUnserialized({ foo: "bar" })).toBe(false);
      expect(isUnserialized({ lc: 2, type: "constructor" })).toBe(false);
      expect(isUnserialized(null)).toBe(false);
      expect(isUnserialized("string")).toBe(false);
      expect(isUnserialized(42)).toBe(false);
    });

    it("should return false for objects missing required fields", () => {
      expect(isUnserialized({ lc: 1, type: "constructor", id: [] })).toBe(false);
      expect(isUnserialized({ lc: 1, id: [], kwargs: {} })).toBe(false);
      expect(isUnserialized({ type: "constructor", id: [], kwargs: {} })).toBe(false);
    });
  });

  describe("deserializeUnserialized", () => {
    it("should convert lc: 1 format to proper deserialized object", async () => {
      const unserialized = {
        lc: 1,
        type: "constructor",
        id: ["Set"],
        kwargs: {},
      };
      const result = await deserializeUnserialized<Set<unknown>>(unserialized);
      expect(result).toBeInstanceOf(Set);
    });

    it("should handle nested unserialized objects", async () => {
      const unserialized = {
        lc: 1,
        type: "constructor",
        id: ["Map"],
        kwargs: {},
      };
      const result = await deserializeUnserialized<Map<unknown, unknown>>(unserialized);
      expect(result).toBeInstanceOf(Map);
    });

    it("should convert kwargs to args for constructor parameters", async () => {
      const unserialized = {
        lc: 1,
        type: "constructor",
        id: ["Error"],
        kwargs: { message: "test error" },
      };
      const result = await deserializeUnserialized<Error>(unserialized);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("test error");
    });
  });
});
