import { describe, expect, it } from "vitest";
import { cleanNullBytes } from "./clean";

describe("cleanNullBytes utility", () => {
  it("removes null bytes from a plain string", () => {
    const input = "Hello\u0000 World\u0000!";
    expect(cleanNullBytes(input)).toBe("Hello World!");
  });

  it("leaves clean strings untouched", () => {
    const input = "Clean string without null bytes";
    expect(cleanNullBytes(input)).toBe(input);
  });

  it("removes null bytes from elements in an array", () => {
    const input = ["Hello\u0000", "World", "Test\u0000ing"];
    expect(cleanNullBytes(input)).toEqual(["Hello", "World", "Testing"]);
  });

  it("removes null bytes from keys and values in an object", () => {
    const input = {
      "key\u00001": "val\u0000ue1",
      nested: {
        "key\u00002": "val\u0000ue2",
        cleanKey: "cleanValue"
      }
    };
    const expected = {
      key1: "value1",
      nested: {
        key2: "value2",
        cleanKey: "cleanValue"
      }
    };
    expect(cleanNullBytes(input)).toEqual(expected);
  });

  it("handles non-string types (numbers, booleans, null, undefined)", () => {
    const input = {
      num: 42,
      bool: true,
      nil: null,
      undef: undefined,
      nestedArray: [123, "text\u0000"]
    };
    const expected = {
      num: 42,
      bool: true,
      nil: null,
      undef: undefined,
      nestedArray: [123, "text"]
    };
    expect(cleanNullBytes(input)).toEqual(expected);
  });
});
