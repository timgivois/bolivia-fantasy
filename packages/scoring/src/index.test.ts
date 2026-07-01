import { describe, expect, it } from "vitest";

import { SCORING_PACKAGE, calculatePoints } from "./index.js";

describe("@bolivia-fantasy/scoring placeholder", () => {
  it("exports the package name", () => {
    expect(SCORING_PACKAGE).toBe("@bolivia-fantasy/scoring");
  });

  it("returns 0 points from the placeholder engine", () => {
    expect(calculatePoints()).toBe(0);
  });
});
