import { Merriweather } from "next/font/google";

/**
 * The serif for headlines on the public pages (landing, sign-in, registration). The signed-in app stays on
 * Plus Jakarta Sans, so only the pages that apply `serif.variable` download this font.
 */
export const serif = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});
