import { describe, it, expect } from "vitest";

describe("Infrastructure Test", () => {
  it("should be able to run tests", () => {
    expect(1 + 1).toBe(2);
  });

  it("should have access to node environment", () => {
    expect(typeof process).toBe("object");
    expect(typeof process.env).toBe("object");
  });
});
