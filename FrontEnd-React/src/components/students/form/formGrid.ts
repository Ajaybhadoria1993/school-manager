/**
 * The boxes of a student form card: as many columns as the card's width allows (three on a laptop, one on a phone), never narrower
 * than 13rem, the same tracks in every row. It follows the card, not the screen, so a card beside a sidebar never gets cut-off boxes.
 */
export const FORM_GRID = "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-5 gap-y-4";
