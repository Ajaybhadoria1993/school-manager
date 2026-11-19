import { useCallback, useEffect, useRef, useState } from "react";
import { Bus, CircleAlert, MapPin, Play, Square } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useDriverPingMutation, useDriverSessionMutation, useDriverStopMutation } from "../../redux/api/transportApi";
import type { DriverSession } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { agoLabel, forgetDriverLink, headingOf, kmhOf, readDriverLink } from "../../utils/tracking";

/** The phone sends the newest position this often while the trip runs. */
const SEND_EVERY_MS = 5_000;
/** A GPS reading older than this is not sent (the phone lost its signal): the office then sees the vehicle go quiet instead of a stale dot. */
const FRESH_FOR_MS = 30_000;

interface Fix {
  lat: number;
  lng: number;
  speedKmph: number | null;
  heading: number | null;
  accuracy: number | null;
  at: number;
}

type Phase = "checking" | "nolink" | "invalid" | "unreachable" | "ready" | "running";

/**
 * The driver's page (`/driver-track#<link>`), opened on the driver's phone. No sign-in: the private link the school made for the vehicle is the
 * proof, kept on the phone after the first visit. "Start trip" shares the phone's GPS position every few seconds with the school's live map;
 * "End trip" stops it. A browser can only read the GPS while this page is open and the screen is on, so the page asks the phone to keep the screen awake.
 */
export default function DriverTrackPage() {
  const [link] = useState(() => readDriverLink(window.location.hash));
  const [phase, setPhase] = useState<Phase>(link ? "checking" : "nolink");
  const [session, setSession] = useState<DriverSession | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [fix, setFix] = useState<Fix | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [openSession] = useDriverSessionMutation();
  const [sendPing] = useDriverPingMutation();
  const [endTrip, ending] = useDriverStopMutation();

  // The link is in the address only to get it onto this phone; take it out of the address bar and the history once it is kept.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const check = useCallback(async () => {
    if (!link) return;
    setPhase("checking");
    setProblem(null);
    try {
      setSession((await openSession(link).unwrap()).data);
      setPhase("ready");
    } catch (err) {
      const error = getApiError(err);
      if (error?.status === 401) {
        forgetDriverLink();
        setPhase("invalid");
      } else {
        setPhase("unreachable");
      }
    }
  }, [link, openSession]);

  useEffect(() => {
    void check();
  }, [check]);

  // ---- the trip ------------------------------------------------------------------------------------------------------------------------
  const latest = useRef<Fix | null>(null);
  const sendingRef = useRef(false);
  const running = phase === "running";

  useEffect(() => {
    if (!running || !link) return;
    let cancelled = false;
    let wakeLock: WakeLockSentinel | null = null;

    const send = async () => {
      const f = latest.current;
      if (!f || Date.now() - f.at > FRESH_FOR_MS || sendingRef.current) return;
      sendingRef.current = true;
      try {
        await sendPing({ link, position: { lat: f.lat, lng: f.lng, speedKmph: f.speedKmph, heading: f.heading, accuracy: f.accuracy } }).unwrap();
        if (cancelled) return;
        setSentAt(Date.now());
        setSentCount((n) => n + 1);
        setProblem(null);
      } catch (err) {
        if (cancelled) return;
        if (getApiError(err)?.status === 401) {
          forgetDriverLink();
          setPhase("invalid");
        } else {
          setProblem("No internet, or the school's server is not answering. Still trying.");
        }
      } finally {
        sendingRef.current = false;
      }
    };

    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const speedKmph = kmhOf(p.coords.speed);
        const next: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, speedKmph, heading: headingOf(p.coords.heading, speedKmph), accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null, at: Date.now() };
        const first = latest.current === null;
        latest.current = next;
        setFix(next);
        if (first) void send(); // the office sees the vehicle as soon as the first position is known
      },
      (err) => {
        setProblem(err.code === err.PERMISSION_DENIED ? "Location is blocked. Allow location for this page in the browser settings, then start again." : "Waiting for a GPS signal. Move to an open place if this stays.");
        if (err.code === err.PERMISSION_DENIED) setPhase("ready");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    const timer = setInterval(() => void send(), SEND_EVERY_MS);

    const keepAwake = async () => {
      try {
        wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        wakeLock = null; // a low battery, or a browser without it: the trip still runs while the screen stays on
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void keepAwake();
    void keepAwake();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock?.release().catch(() => undefined);
      latest.current = null;
    };
  }, [running, link, sendPing]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  function start() {
    if (!("geolocation" in navigator)) {
      setProblem("This phone's browser cannot read the location. Open the link in Chrome or Safari.");
      return;
    }
    setProblem(null);
    setSentAt(null);
    setSentCount(0);
    setFix(null);
    setPhase("running");
  }

  async function stop() {
    setPhase("ready");
    if (link) await endTrip(link).unwrap().catch(() => undefined);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <header className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary-deep">
            <Bus className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">{session ? session.vehicle.number : "Driver page"}</h1>
            <p className="truncate text-sm text-foreground-muted">{session ? `${session.vehicle.registrationNumber}${session.routes.length > 0 ? ` · ${session.routes.join(", ")}` : ""}` : "Share this vehicle's position with the school"}</p>
          </div>
        </header>

        {phase === "nolink" || phase === "invalid" ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p>{phase === "invalid" ? "This link does not work any more. Ask the school for a new one." : "Open the link the school sent you for this vehicle."}</p>
          </div>
        ) : phase === "checking" ? (
          <p className="text-sm text-foreground-muted">Checking the link…</p>
        ) : phase === "unreachable" ? (
          <div className="space-y-3">
            <p className="text-sm text-danger">Could not reach the school's server. Check the internet and try again.</p>
            <Button variant="outline" onClick={() => void check()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={running ? "success" : "neutral"}>{running ? "Trip running" : "Trip not started"}</Badge>
              {running && sentAt !== null && <span className="text-sm text-foreground-muted">Sent {agoLabel(Math.round((now - sentAt) / 1000))}</span>}
            </div>

            {running ? (
              <Button variant="danger" className="h-14 w-full text-base" onClick={() => void stop()} loading={ending.isLoading}>
                <Square className="size-5" aria-hidden />
                End trip
              </Button>
            ) : (
              <Button className="h-14 w-full text-base" onClick={start}>
                <Play className="size-5" aria-hidden />
                Start trip
              </Button>
            )}

            {running && (
              <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-surface-muted p-2">
                  <dt className="text-xs text-foreground-muted">Updates sent</dt>
                  <dd className="font-bold text-foreground">{sentCount}</dd>
                </div>
                <div className="rounded-xl bg-surface-muted p-2">
                  <dt className="text-xs text-foreground-muted">Speed</dt>
                  <dd className="font-bold text-foreground">{fix?.speedKmph != null ? `${Math.round(fix.speedKmph)} km/h` : "—"}</dd>
                </div>
                <div className="rounded-xl bg-surface-muted p-2">
                  <dt className="text-xs text-foreground-muted">GPS accuracy</dt>
                  <dd className="font-bold text-foreground">{fix?.accuracy != null ? `${fix.accuracy} m` : "—"}</dd>
                </div>
              </dl>
            )}

            {running && !fix && (
              <p className="flex items-center gap-2 text-sm text-foreground-muted">
                <MapPin className="size-4" aria-hidden /> Getting the GPS position…
              </p>
            )}
            {problem && (
              <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning">
                {problem}
              </p>
            )}
            <p className="text-xs text-foreground-muted">
              Keep this page open with the screen on while you drive: the phone shares its position only while it is open. Press End trip when you are done.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
