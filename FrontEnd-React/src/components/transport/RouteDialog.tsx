import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import { useCreateRouteMutation, useGetCrewQuery, useGetVehiclesQuery, useUpdateRouteMutation } from "../../redux/api/transportApi";
import type { RouteBody, TransportRoute } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";
import { fieldErrorsOf } from "../../utils/transport";

const NONE = "";
const emptyStop = () => ({ name: "", pickupTime: "", dropTime: "", fee: "" });

const bodyOf = (r?: TransportRoute): RouteBody =>
  r
    ? {
        name: r.name,
        vehicleId: r.vehicleId,
        driverId: r.driverId,
        attendantId: r.attendantId,
        morningStart: r.morningStart ?? "",
        afternoonStart: r.afternoonStart ?? "",
        stops: r.stops.map((s) => ({ name: s.name, pickupTime: s.pickupTime ?? "", dropTime: s.dropTime ?? "", fee: s.fee === null ? "" : String(s.fee) })),
        notes: r.notes ?? "",
        isActive: r.isActive,
      }
    : { name: "", vehicleId: null, driverId: null, attendantId: null, morningStart: "", afternoonStart: "", stops: [emptyStop()], notes: "" };

/**
 * Add a route, or change one: its name, the vehicle, the driver and the attendant (each from the school's lists, or none yet), when it starts
 * in the morning and in the afternoon, and its stops in the order the vehicle reaches them, each with the time it comes and goes and the
 * monthly fee for a child who boards there.
 */
export function RouteDialog({ route, onClose }: { route?: TransportRoute; onClose: () => void }) {
  const [form, setForm] = useState<RouteBody>(() => bodyOf(route));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const vehicles = useGetVehiclesQuery({ status: "active" }).data?.data.items ?? [];
  const crew = useGetCrewQuery({ status: "active", role: "all" }).data?.data.items ?? [];
  const [create, creating] = useCreateRouteMutation();
  const [update, updating] = useUpdateRouteMutation();
  const { push } = useToast();
  const busy = creating.isLoading || updating.isLoading;
  const set = <K extends keyof RouteBody>(key: K, value: RouteBody[K]) => setForm((f) => ({ ...f, [key]: value }));

  // The people of a route that were made inactive stay in the list as they are, so saving the route does not drop them silently.
  const pickList = <T extends { id: string }>(items: T[], label: (t: T) => string, extra?: { id: string; label: string }) => [
    { value: NONE, label: "None yet" },
    ...items.map((t) => ({ value: t.id, label: label(t) })),
    ...(extra && !items.some((t) => t.id === extra.id) ? [{ value: extra.id, label: extra.label }] : []),
  ];
  const vehicleOptions = pickList(vehicles, (v) => `${v.number} (${v.registrationNumber})`, route?.vehicle ? { id: route.vehicle.id, label: `${route.vehicle.number} (${route.vehicle.registrationNumber})` } : undefined);
  const driverOptions = pickList(crew.filter((p) => p.role === "driver"), (p) => `${p.name} · ${p.mobile}`, route?.driver ? { id: route.driver.id, label: `${route.driver.name} · ${route.driver.mobile}` } : undefined);
  const attendantOptions = pickList(crew.filter((p) => p.role === "attendant"), (p) => `${p.name} · ${p.mobile}`, route?.attendant ? { id: route.attendant.id, label: `${route.attendant.name} · ${route.attendant.mobile}` } : undefined);

  const setStop = (i: number, patch: Partial<RouteBody["stops"][number]>) => set("stops", form.stops.map((s, at) => (at === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...form.stops];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set("stops", next);
  };

  async function save() {
    setProblem(null);
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = "Enter the route name";
    if (form.stops.some((s) => !s.name.trim() && (s.pickupTime || s.dropTime || s.fee))) local.stops = "Give each stop a name, or take it away";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      const body = { ...form, stops: form.stops.filter((s) => s.name.trim()) };
      if (route) await update({ id: route.id, body }).unwrap();
      else await create(body).unwrap();
      push("success", route ? "Route saved" : "Route added");
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  return (
    <AppModal
      title={route ? `Change ${route.name}` : "Add route"}
      icon={RouteIcon}
      size="cover"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {route ? "Save" : "Add route"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="route-name" label="Route name" error={errors.name} className="lg:col-span-3" hint="For example: Route 1 - Arera Colony">
          <Input id="route-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Route 1 - Arera Colony" maxLength={60} />
        </Field>
        <Field id="route-vehicle" label="Vehicle" optional error={errors.vehicleId}>
          <Select id="route-vehicle" value={form.vehicleId ?? NONE} onChange={(v) => set("vehicleId", v || null)} options={vehicleOptions} />
        </Field>
        <Field id="route-driver" label="Driver" optional error={errors.driverId}>
          <Select id="route-driver" value={form.driverId ?? NONE} onChange={(v) => set("driverId", v || null)} options={driverOptions} />
        </Field>
        <Field id="route-attendant" label="Attendant" optional error={errors.attendantId}>
          <Select id="route-attendant" value={form.attendantId ?? NONE} onChange={(v) => set("attendantId", v || null)} options={attendantOptions} />
        </Field>
        <Field id="route-morningStart" label="Leaves the first stop at" optional error={errors.morningStart} hint="Morning, to school">
          <Input id="route-morningStart" type="time" value={form.morningStart} onChange={(e) => set("morningStart", e.target.value)} />
        </Field>
        <Field id="route-afternoonStart" label="Leaves the school at" optional error={errors.afternoonStart} hint="After the day, back home">
          <Input id="route-afternoonStart" type="time" value={form.afternoonStart} onChange={(e) => set("afternoonStart", e.target.value)} />
        </Field>
      </div>

      <section aria-label="Stops" className="space-y-2">
        <h3 className="text-body-label font-semibold text-foreground">Stops, in the order the vehicle reaches them</h3>
        {errors.stops && <p className="text-sm text-danger">{errors.stops}</p>}
        <ul className="space-y-2">
          {form.stops.map((s, i) => (
            <li key={i} aria-label={`Stop ${i + 1}`} className="grid items-center gap-2 rounded-xl border border-border bg-background/60 p-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_8rem_7rem_auto]">
              <span className="text-center text-sm font-bold text-foreground-muted">{i + 1}</span>
              <Input aria-label={`Stop ${i + 1} name`} value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} placeholder="Stop name" maxLength={60} />
              <Input aria-label={`Stop ${i + 1} pick-up time`} type="time" value={s.pickupTime} onChange={(e) => setStop(i, { pickupTime: e.target.value })} title="Pick-up time (morning)" />
              <Input aria-label={`Stop ${i + 1} drop time`} type="time" value={s.dropTime} onChange={(e) => setStop(i, { dropTime: e.target.value })} title="Drop time (afternoon)" />
              <Input aria-label={`Stop ${i + 1} monthly fee`} type="number" min={0} inputMode="numeric" value={s.fee} onChange={(e) => setStop(i, { fee: e.target.value })} placeholder="Fee" />
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" aria-label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Move stop ${i + 1} down`} disabled={i === form.stops.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Remove stop ${i + 1}`} onClick={() => set("stops", form.stops.filter((_, at) => at !== i))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <Button variant="outline" onClick={() => set("stops", [...form.stops, emptyStop()])}>
          <Plus className="size-4" aria-hidden />
          Add stop
        </Button>
      </section>

      <Field id="route-notes" label="Note" optional error={errors.notes}>
        <Textarea id="route-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={300} />
      </Field>
      {route && (
        <Switch checked={form.isActive ?? true} onChange={(on) => set("isActive", on)}>
          Running (switch off when the route is closed)
        </Switch>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}
