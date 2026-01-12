/**
 * Serialization utilities for Redis checkpoint storage.
 * 
 * Implements serialization that matches LangGraph's JsonPlusSerializer
 * to ensure checkpoints can be correctly serialized and deserialized.
 */

import { load } from "@langchain/core/load";

/**
 * Serialize a value using LangGraph-compatible serialization.
 * Returns [type, serialized_data] tuple matching dumpsTyped() output.
 * 
 * @param obj - The object to serialize
 * @returns Promise of [type, Uint8Array] where type is "json" or "bytes"
 */
export async function dumpsTyped<T>(obj: T): Promise<[string, Uint8Array]> {
  if (obj instanceof Uint8Array) {
    return ["bytes", obj];
  }
  
  const serialized = _dumps(obj);
  const encoder = new TextEncoder();
  return ["json", encoder.encode(serialized)];
}

/**
 * Deserialize a value using LangGraph-compatible deserialization.
 * 
 * @param type - The type string ("json" or "bytes")
 * @param data - The serialized data (Uint8Array or string)
 * @returns Promise of the deserialized object
 */
export async function loadsTyped<T>(type: string, data: Uint8Array | string): Promise<T> {
  if (type === "bytes") {
    return typeof data === "string" 
      ? new TextEncoder().encode(data) as unknown as T
      : data as unknown as T;
  }
  
  if (type === "json") {
    const decoded = typeof data === "string" ? data : new TextDecoder().decode(data);
    const parsed = JSON.parse(decoded);
    return _loads(parsed) as T;
  }
  
  throw new Error(`Unknown serialization type: ${type}`);
}

/**
 * Stringify with custom serialization for special types.
 */
function _dumps(obj: unknown): string {
  // For top-level Date objects, we need special handling because
  // JSON.stringify calls toJSON() before the replacer
  if (obj instanceof Date) {
    return JSON.stringify(_encodeConstructorArgs("Date", undefined, [obj.toISOString()]));
  }

  // For nested structures, we need to pre-process to handle Date objects
  // because JSON.stringify calls toJSON() before the replacer
  function preprocess(value: unknown): unknown {
    if (value instanceof Date) {
      return _encodeConstructorArgs("Date", undefined, [value.toISOString()]);
    }
    if (value instanceof Set) {
      return _encodeConstructorArgs("Set", undefined, [Array.from(value)]);
    }
    if (value instanceof Map) {
      return _encodeConstructorArgs("Map", undefined, [Array.from(value.entries())]);
    }
    if (value instanceof RegExp) {
      return _encodeConstructorArgs("RegExp", undefined, [value.source, value.flags]);
    }
    if (value instanceof Error) {
      return _encodeConstructorArgs(value.constructor.name, undefined, [value.message]);
    }
    if (Array.isArray(value)) {
      return value.map(preprocess);
    }
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = preprocess(v);
      }
      return result;
    }
    return value;
  }

  const preprocessed = preprocess(obj);

  function stringifyReplacer(_key: string, value: unknown): unknown {
    return _default(value);
  }

  return JSON.stringify(preprocessed, stringifyReplacer);
}

/**
 * Default handler for special types during serialization.
 */
function _default(obj: unknown): unknown {
  if (obj === undefined) {
    return { lc: 2, type: "undefined" };
  }

  // Handle special number values (JSON doesn't support these natively)
  if (typeof obj === "number") {
    if (Number.isNaN(obj)) {
      return { lc: 2, type: "NaN" };
    }
    if (obj === Infinity) {
      return { lc: 2, type: "Infinity" };
    }
    if (obj === -Infinity) {
      return { lc: 2, type: "-Infinity" };
    }
  }

  if (obj instanceof Set) {
    return _encodeConstructorArgs("Set", undefined, [Array.from(obj)]);
  }

  if (obj instanceof Map) {
    return _encodeConstructorArgs("Map", undefined, [Array.from(obj.entries())]);
  }

  if (obj instanceof RegExp) {
    return _encodeConstructorArgs("RegExp", undefined, [obj.source, obj.flags]);
  }

  if (obj instanceof Error) {
    return _encodeConstructorArgs(obj.constructor.name, undefined, [obj.message]);
  }

  if (obj instanceof Date) {
    return _encodeConstructorArgs("Date", undefined, [obj.toISOString()]);
  }

  // Check for LangChain Send objects
  if (obj && typeof obj === "object" && (obj as Record<string, unknown>).lg_name === "Send") {
    const sendObj = obj as { node: string; args: unknown };
    return { node: sendObj.node, args: sendObj.args };
  }

  return obj;
}

/**
 * Encode constructor arguments for special types.
 */
function _encodeConstructorArgs(
  constructor: string,
  method: string | undefined,
  args: unknown[]
): Record<string, unknown> {
  return {
    lc: 2,
    type: "constructor",
    id: [constructor],
    method: method ?? null,
    args: args ?? [],
    kwargs: {},
  };
}

/**
 * Check if value is a LangChain serialized object (lc: 1 format).
 */
function isLangChainSerializedObject(value: unknown): boolean {
  const v = value as Record<string, unknown>;
  return (
    v !== null &&
    v.lc === 1 &&
    v.type === "constructor" &&
    Array.isArray(v.id)
  );
}

/**
 * Reviver function for deserialization.
 * Handles special types and LangChain objects.
 */
async function _loads(value: unknown): Promise<unknown> {
  if (value === null || typeof value !== "object") {
    return value;
  }
  
  if (Array.isArray(value)) {
    const revivedArray = await Promise.all(value.map((item) => _loads(item)));
    return revivedArray;
  }
  
  const revivedObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    revivedObj[k] = await _loads(v);
  }
  
  // Handle undefined type
  if (revivedObj.lc === 2 && revivedObj.type === "undefined") {
    return undefined;
  }
  
  // Handle special number types
  if (revivedObj.lc === 2 && revivedObj.type === "NaN") {
    return NaN;
  }
  if (revivedObj.lc === 2 && revivedObj.type === "Infinity") {
    return Infinity;
  }
  if (revivedObj.lc === 2 && revivedObj.type === "-Infinity") {
    return -Infinity;
  }

  // Handle constructor types (Set, Map, RegExp, Error)
  if (
    revivedObj.lc === 2 &&
    revivedObj.type === "constructor" &&
    Array.isArray(revivedObj.id)
  ) {
    try {
      const constructorName = revivedObj.id[revivedObj.id.length - 1] as string;
      const method = revivedObj.method as string | undefined;
      const args = (revivedObj.args as unknown[]) || [];
      
      let constructor: unknown;
      switch (constructorName) {
        case "Set":
          constructor = Set;
          break;
        case "Map":
          constructor = Map;
          break;
        case "RegExp":
          constructor = RegExp;
          break;
        case "Error":
          constructor = Error;
          break;
        case "Date":
          constructor = Date;
          break;
        default:
          return revivedObj;
      }
      
      if (method && constructor && typeof constructor === "object") {
        const constructorObj = constructor as Record<string, unknown>;
        if (method in constructorObj && typeof constructorObj[method] === "function") {
          return constructorObj[method](...args);
        }
      }
      return new (constructor as new (...args: unknown[]) => unknown)(...args);
    } catch {
      return revivedObj;
    }
  }
  
  // Handle LangChain constructor format (lc: 1)
  if (isLangChainSerializedObject(revivedObj)) {
    return load(JSON.stringify(revivedObj));
  }
  
  return revivedObj;
}

/**
 * Check if data appears to be in the old unserialized format.
 * Used for backward compatibility with buggy library's data.
 * 
 * The buggy library stored raw objects instead of using serde.dumpsTyped().
 * These objects have the "constructor" format with lc: 1, type, id, kwargs fields.
 */
export function isUnserialized(data: unknown): boolean {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return "lc" in obj && "type" in obj && "id" in obj && "kwargs" in obj;
}

/**
 * Attempt to deserialize unserialized data from the buggy library format.
 * This provides backward compatibility for reading old checkpoints.
 */
export async function deserializeUnserialized<T>(data: Record<string, unknown>): Promise<T> {
  // The buggy library stored objects with lc: 1 format
  // We need to convert them to the expected lc: 2 format for deserialization
  const converted = {
    lc: 2,
    type: "constructor",
    id: data.id,
    args: Array.isArray(data.args) ? data.args : Object.values(data.kwargs || {}),
    kwargs: {},
  };

  // Serialize back to string then deserialize with correct type
  const serialized = JSON.stringify(converted);
  return loadsTyped("json", serialized) as Promise<T>;
}
