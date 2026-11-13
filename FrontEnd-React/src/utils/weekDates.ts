const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Nov". */
export const shortDate = (date: Date): string => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

/** The same calendar day (the time of day does not matter). */
export const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
