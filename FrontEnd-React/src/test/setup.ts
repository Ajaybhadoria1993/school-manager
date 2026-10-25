import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Each test starts from an empty page.
afterEach(() => cleanup());

// jsdom has no layout: scrolling is a no-op here (components scroll a box into view when they move the focus, a page to its top).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
// ...and no media queries: a page asks whether the person wants less motion, and here the answer is no.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
// ...and does not watch sizes: a sticky sidebar asks to be told when its box changes, and here nothing is measured.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// ...and has no object URLs: a file the page hands to the browser to save is only counted.
URL.createObjectURL ??= () => "blob:test";
URL.revokeObjectURL ??= () => {};
