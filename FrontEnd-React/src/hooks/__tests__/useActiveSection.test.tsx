import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useActiveSection } from "../useActiveSection";

/**
 * The landing top bar lights up the link of the section that is crossing the middle of the screen. The browser tells us through
 * IntersectionObserver; here a stand-in lets the test say which sections are in that band.
 */

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let callback: Callback = () => {};
let disconnected = false;

class FakeObserver {
  constructor(cb: Callback) {
    callback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    disconnected = true;
  }
}

function Probe({ ids }: { ids: readonly string[] }) {
  const active = useActiveSection(ids);
  return <p data-testid="active">{active ?? "none"}</p>;
}

const sections = () => (
  <>
    <section id="a" />
    <section id="b" />
    <Probe ids={["a", "b"]} />
  </>
);

const say = (id: string, isIntersecting: boolean) => act(() => callback([{ target: document.getElementById(id)!, isIntersecting }]));

beforeEach(() => {
  disconnected = false;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useActiveSection", () => {
  it("is none until a section reaches the middle of the screen", () => {
    render(sections());
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("follows the section in the middle band, and goes back to none above the first one", () => {
    render(sections());
    say("a", true);
    expect(screen.getByTestId("active")).toHaveTextContent("a");
    say("a", false);
    say("b", true);
    expect(screen.getByTestId("active")).toHaveTextContent("b");
    say("b", false);
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("takes the higher section when two touch the band at once", () => {
    render(sections());
    say("b", true);
    say("a", true);
    expect(screen.getByTestId("active")).toHaveTextContent("a");
  });

  it("stops watching when the page is left", () => {
    const { unmount } = render(sections());
    unmount();
    expect(disconnected).toBe(true);
  });

  it("shows nothing (and does not crash) in a browser without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(sections());
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });
});
