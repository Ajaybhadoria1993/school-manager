import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, Hammer } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { MODULES, findModule } from "../../constants/modules";
import { TONES } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import NotFound from "../NotFound";

/**
 * A page for a module that is planned but not built. It says so plainly, explains what the module will do,
 * and points to the neighbours in the same group, so the menu never leads to a dead end.
 */
export default function ModulePreview() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const mod = findModule(slug ?? "");
  if (!user) return null;
  if (!mod || user.role === "super_admin") return <NotFound />;

  const tone = TONES[mod.tone];
  const related = MODULES.filter(
    (m) => m.group === mod.group && m.slug !== mod.slug,
  );

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="group inline-flex items-center gap-1.5 text-sm font-semibold text-foreground-muted transition-colors hover:text-primary"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        Dashboard
      </Link>

      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <div
          aria-hidden
          className={cn(
            "float-slow absolute -right-12 -top-16 size-72 rounded-full bg-gradient-to-br to-transparent blur-2xl",
            tone.glow,
          )}
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <span
            className={cn(
              "float-slow flex size-20 shrink-0 items-center justify-center rounded-3xl shadow-raised",
              tone.tile,
            )}
          >
            <mod.icon className="size-10" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
              <Hammer className="size-3" aria-hidden />
              Planned, not built yet
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.02em] text-foreground">
              {mod.label}
            </h1>
            <p className="mt-1 text-base font-semibold text-foreground-muted">
              {mod.tagline}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              {mod.about}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="covers">
          <h2
            id="covers"
            className="mb-3 text-lg font-bold tracking-tight text-foreground"
          >
            What it will cover
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {mod.covers.map((item, i) => (
              <li
                key={item}
                className="stagger-item flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-raised"
                style={{ "--i": i } as React.CSSProperties}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    tone.tile,
                  )}
                >
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span className="text-sm font-semibold leading-snug text-foreground">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-4" aria-label="Related">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h2 className="text-sm font-bold text-foreground">
              More in {mod.group}
            </h2>
            <ul className="mt-3 space-y-1">
              {related.map((m) => (
                <li key={m.slug}>
                  <Link
                    to={`/modules/${m.slug}`}
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
                        TONES[m.tone].tile,
                      )}
                    >
                      <m.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {m.label}
                    </span>
                    <ArrowRight
                      className="size-4 text-foreground-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
              {related.length === 0 && (
                <li className="px-2 py-1 text-sm text-foreground-muted">
                  Nothing else in this group yet.
                </li>
              )}
            </ul>
          </div>
          <p className="rounded-2xl bg-primary-soft px-5 py-4 text-sm leading-relaxed text-primary-deep">
            Your school is already set up for this. When{" "}
            {mod.label.toLowerCase()} is ready, it will appear here without
            anything for you to do.
          </p>
        </aside>
      </div>
    </div>
  );
}
