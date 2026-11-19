import { History } from "lucide-react";
import { useYearView } from "../../hooks/useYearView";
import { HeaderMenu, MenuRow } from "./HeaderMenu";

/**
 * The academic year in the top bar, for the people who run the school: it names the year the screens are about and opens the years that
 * are over, to look at what the school was then (read only). A school that has no year that is over has nothing to pick, so it shows nothing.
 * The dropdown is the top bar's own (`HeaderMenu`); while a past year is open the box is amber.
 */
export function YearSwitcher() {
  const { canLook, running, viewing, offered, hasPast, choose } = useYearView();
  if (!canLook || !hasPast) return null;

  const shown = viewing ?? running;

  return (
    <HeaderMenu icon={History} label={shown?.name} ariaLabel="Academic year" menuLabel="Academic years" caption="Switch year" tone={viewing ? "warning" : "default"} width="w-60">
      {(close) =>
        offered.map((y) => {
          const current = y.status === "active";
          return (
            <MenuRow
              key={y.id}
              icon={History}
              selected={current ? !viewing : viewing?.id === y.id}
              onClick={() => {
                choose(current ? null : y.id);
                close();
              }}
              trailing={current && <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">Current</span>}
            >
              {y.name}
            </MenuRow>
          );
        })
      }
    </HeaderMenu>
  );
}
