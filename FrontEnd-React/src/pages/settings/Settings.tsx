import { Check, Moon, Palette, Sun } from "lucide-react";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ACCENT_PRESETS, useAppTheme } from "../../theme/AppThemeProvider";
import { cn } from "../../utils/helpers";

const choice =
  "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

export default function SettingsPage() {
  const { mode, accent, setMode, setAccent } = useAppTheme();
  const pickedPreset = ACCENT_PRESETS.some((preset) => preset.color.toLowerCase() === accent.toLowerCase());

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <StudentFormHeader
        title="Settings"
        subtitle="Personalize how EduShiksha looks on this device."
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="p-4">
          <p className="px-2 pb-3 text-xs font-bold uppercase tracking-wide text-foreground-muted">Preferences</p>
          <div className="rounded-xl bg-primary-soft px-3 py-2.5 text-sm font-semibold text-primary-deep" aria-current="page">
            <span className="inline-flex items-center gap-2">
              <Palette className="size-4" aria-hidden />
              Appearance
            </span>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Palette className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-section-heading">Appearance</h2>
              <p className="text-sm text-foreground-muted">Choose a color and display mode that feel right to you.</p>
            </div>
          </div>

          <div className="space-y-7 p-5 sm:p-6">
            <fieldset>
              <legend className="text-sm font-semibold text-foreground">Accent color</legend>
              <p className="mt-1 text-sm text-foreground-muted">Used for selected menu items, buttons, links, and chart highlights.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ACCENT_PRESETS.map((preset) => {
                  const selected = accent.toLowerCase() === preset.color.toLowerCase();
                  return (
                    <button
                      key={preset.color}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setAccent(preset.color)}
                      className={cn(choice, selected ? "border-primary bg-primary-soft/60 text-foreground" : "border-border bg-surface text-foreground hover:bg-surface-muted")}
                    >
                      <span className="size-6 shrink-0 rounded-full ring-2 ring-surface ring-offset-2 ring-offset-surface-muted" style={{ backgroundColor: preset.color }} aria-hidden />
                      <span className="min-w-0 flex-1 text-sm font-medium">{preset.name}</span>
                      {selected && <Check className="size-4 text-primary" aria-label="Selected" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted/60 px-3 py-2.5">
                <label htmlFor="custom-accent" className="flex-1 text-sm font-medium text-foreground">Custom color</label>
                <span className="text-xs font-medium uppercase text-foreground-muted">{accent}</span>
                <input
                  id="custom-accent"
                  type="color"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                  aria-label="Choose a custom accent color"
                  className="size-9 cursor-pointer rounded-lg border border-border bg-surface p-1"
                />
                {!pickedPreset && <span className="sr-only">Custom color selected</span>}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-foreground">Display mode</legend>
              <p className="mt-1 text-sm text-foreground-muted">Switch between a bright workspace and a darker one.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([
                  { value: "light", label: "Light", description: "Bright surfaces", Icon: Sun },
                  { value: "dark", label: "Dark", description: "Easy on the eyes in low light", Icon: Moon },
                ] as const).map(({ value, label, description, Icon }) => {
                  const selected = mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setMode(value)}
                      className={cn(choice, "min-h-20", selected ? "border-primary bg-primary-soft/60" : "border-border bg-surface hover:bg-surface-muted")}
                    >
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground-muted")}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{label}</span>
                        <span className="mt-0.5 block text-xs text-foreground-muted">{description}</span>
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted/50 p-4 sm:p-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Live preview</h3>
                <p className="mt-1 text-sm text-foreground-muted">Your choice applies immediately and is saved on this device.</p>
              </div>
              <Button type="button">Primary action</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
