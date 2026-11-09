import { Outlet } from "react-router";
import { History } from "lucide-react";
import { Card } from "../components/ui/Card";
import { useYearView } from "../hooks/useYearView";
import { useAppSelector } from "../redux/hooks";

/**
 * Pages that only make sense in the running year (admitting a student, a bulk upload). While a year that is over is open they say so and
 * offer the way back, instead of letting the school fill in a form the server would refuse at the end (a year that is over is only read).
 */
export default function RunningYearRoute() {
  const looking = useAppSelector((state) => state.yearView.yearId !== null);
  const { viewing, running, choose } = useYearView();

  if (!looking) return <Outlet />;
  // The school's years are still being read; a year that turns out not to be one of its own is dropped, and the page opens.
  if (!viewing) return null;

  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <History className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-bold text-foreground">{viewing.name} is over</h1>
      <button
        type="button"
        onClick={() => choose(null)}
        className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-deep"
      >
        {running ? `Back to ${running.name}` : "Back to the running year"}
      </button>
    </Card>
  );
}
