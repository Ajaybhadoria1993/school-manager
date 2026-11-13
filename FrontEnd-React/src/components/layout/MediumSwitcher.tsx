import { useNavigate } from "react-router";
import { Languages } from "lucide-react";
import { useMedium } from "../../hooks/useMedium";
import { HeaderMenu, MenuRow } from "./HeaderMenu";

/**
 * Which medium of the school is open, in the top bar: English Medium, Hindi Medium. Each runs on its own, so moving goes to the dashboard
 * (a class or a student open on one side means nothing on the other). A school with one medium shows nothing here. The dropdown is the top
 * bar's own (`HeaderMenu`: a small heading, a row for each medium, the open one ticked).
 */
export function MediumSwitcher() {
  const { mediums, current, choose } = useMedium();
  const navigate = useNavigate();
  if (mediums.length === 0 || !current) return null;

  return (
    <HeaderMenu icon={Languages} label={current.label} ariaLabel="Medium" menuLabel="Mediums" caption="Switch medium">
      {(close) =>
        mediums.map((m) => (
          <MenuRow
            key={m.id}
            icon={Languages}
            selected={m.id === current.id}
            onClick={() => {
              close();
              if (m.id === current.id) return;
              choose(m.id);
              navigate("/dashboard");
            }}
          >
            {m.label}
          </MenuRow>
        ))
      }
    </HeaderMenu>
  );
}
