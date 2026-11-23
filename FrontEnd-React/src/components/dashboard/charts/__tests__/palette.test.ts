/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SERIES } from "../palette";

describe("the chart colours (2026-11-22)", () => {
  it("are the look's variables, so a chart is blue and orange in the reference look and bronze and gold in Classic", () => {
    expect(SERIES).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]);
  });

  it("the style sheet gives them their Classic colours (the bronze, gold and slate the charts always had)", () => {
    const css = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/--chart-1:\s*#9a7152/);
    expect(css).toMatch(/--chart-2:\s*#c28b4c/);
    expect(css).toMatch(/--chart-3:\s*#808892/);
  });
});
