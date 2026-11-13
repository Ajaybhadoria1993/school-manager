import { useEffect, useState } from "react";

// India's time, whatever the computer's own zone is: the school day, the attendance and every date of the app are India's.
const ZONE = "Asia/Kolkata";
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONE });
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: ZONE });

/** The newer ICU puts a narrow no-break space before AM / PM: an ordinary space is read and wrapped like the rest of the text. */
const plain = (text: string) => text.replace(/\s/g, " ");
/** How long until the next whole minute (a little after it, so the minute has changed). */
const untilNextMinute = () => 60_000 - (Date.now() % 60_000) + 20;

/**
 * The time and today's date at the right of the top bar, one under the other ("11:03 AM" over "Fri, Nov 13, 2026"), like Infinity Medisetu's.
 * It moves on by itself at each whole minute (one timer at a time, stopped when it leaves the screen). Not drawn on a phone, where the bar
 * needs the room.
 */
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        arm();
      }, untilNextMinute());
    };
    arm();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <time dateTime={now.toISOString()} className="hidden shrink-0 flex-col items-end leading-tight md:flex">
      <span className="text-lg font-bold tracking-tight text-foreground">{plain(TIME.format(now))}</span>
      <span className="mt-0.5 text-xs font-medium text-foreground-muted">{DAY.format(now)}</span>
    </time>
  );
}
