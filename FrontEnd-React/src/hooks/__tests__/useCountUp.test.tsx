import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useCountUp } from "../useMotion";

/**
 * A number on a tile counts up to its value, by the clock of the browser's own frames. It starts at the first frame and never goes below
 * the start (a tile showing 0 must not read "-0"), whatever clock the frames are stamped by.
 */

function Probe({ target }: { target: number }) {
  return <p aria-label="number">{useCountUp(target).toLocaleString("en-IN")}</p>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function frames() {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return queue;
}

const shown = () => screen.getByLabelText("number");

describe("useCountUp", () => {
  it("shows 0, not -0, for a tile whose value is 0", () => {
    const queue = frames();
    render(<Probe target={0} />);
    act(() => queue.shift()!(100));
    expect(shown()).toHaveTextContent(/^0$/);
    act(() => queue.shift()!(300));
    expect(shown()).toHaveTextContent(/^0$/);
  });

  it("starts at 0 whatever the clock of the first frame says", () => {
    const queue = frames();
    render(<Probe target={120} />);
    // A frame stamped long before, or long after, the moment the hook started.
    act(() => queue.shift()!(-5000));
    expect(shown()).toHaveTextContent(/^0$/);
  });

  it("goes up on the way and settles on the value", () => {
    const queue = frames();
    render(<Probe target={120} />);
    act(() => queue.shift()!(1000));
    act(() => queue.shift()!(1450));
    const half = Number(shown().textContent);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(120);
    act(() => queue.shift()!(2000));
    expect(shown()).toHaveTextContent(/^120$/);
  });

  it("does not go on asking for frames once it has settled", () => {
    const queue = frames();
    render(<Probe target={50} />);
    act(() => queue.shift()!(0));
    act(() => queue.shift()!(5000));
    expect(queue).toHaveLength(0);
  });
});
