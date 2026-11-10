/**
 * The boxes of a student form: as many columns as the width allows (four on a wide screen, three on a laptop, one on a phone), the same tracks
 * in every row. It follows the space it is in, not the screen, so the same form fits the page and the preview's window.
 */
/** The boxes of a form that has the whole page to itself: four across on a wide screen, two on a tablet, one on a phone. */
export const PAGE_GRID = "grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4";

export const FORM_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,19.5rem),1fr))] gap-x-6 gap-y-5";
