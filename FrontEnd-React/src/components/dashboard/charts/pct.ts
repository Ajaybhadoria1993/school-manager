/** A whole percent of the largest value, to four decimals, for a bar's length or a column's height ("33.3333"). */
export const pctOf = (value: number, max: number) => (max <= 0 ? 0 : Math.round((value / max) * 1e6) / 1e4);
