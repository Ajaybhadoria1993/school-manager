import { useState } from "react";
import { Copy, Smartphone } from "lucide-react";
import { useIssueTrackingKeyMutation, useRevokeTrackingKeyMutation } from "../../redux/api/transportApi";
import type { Vehicle } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { driverPageUrl } from "../../utils/tracking";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useToast } from "../ui/toast-context";

/**
 * The private link a vehicle's driver opens on a phone to share the vehicle's position. The link is shown ONCE, when it is made (the school keeps
 * only a hash of it); making a new one switches the old one off, and "Switch off" ends tracking for the vehicle (a lost phone, a driver who left).
 */
export function DriverLinkDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [issue, issuing] = useIssueTrackingKeyMutation();
  const [revoke, revoking] = useRevokeTrackingKeyMutation();
  const { push } = useToast();
  const busy = issuing.isLoading || revoking.isLoading;
  const on = link !== null || vehicle.trackingOn;

  async function make() {
    setProblem(null);
    try {
      const made = await issue(vehicle.id).unwrap();
      setLink(driverPageUrl(made.data.key));
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not make the link. Please try again.");
    }
  }

  async function switchOff() {
    setProblem(null);
    try {
      await revoke(vehicle.id).unwrap();
      push("success", "Driver link switched off");
      onClose();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not switch it off. Please try again.");
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      push("success", "Link copied");
    } catch {
      push("error", "Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <AppModal
      title={`Driver link for ${vehicle.number}`}
      icon={Smartphone}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          {vehicle.trackingOn && (
            <Button variant="outline" onClick={() => void switchOff()} disabled={busy} loading={revoking.isLoading}>
              Switch off
            </Button>
          )}
          <Button variant={link ? "outline" : "primary"} onClick={() => void make()} loading={issuing.isLoading} disabled={revoking.isLoading}>
            {on ? "Make a new link" : "Make the link"}
          </Button>
          <Button variant={link ? "primary" : "outline"} onClick={onClose} disabled={busy}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-foreground-secondary">
        <p>
          The driver opens this link on their phone and taps <b>Start trip</b>. The vehicle then shows on <b>Live tracking</b>, moving as the phone moves. The driver does not
          need to sign in, so send the link only to the driver.
        </p>
        {link ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={link} aria-label="Driver link" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={() => void copy()} aria-label="Copy the link">
                <Copy className="size-4" aria-hidden />
              </Button>
            </div>
            <p className="text-xs text-foreground-muted">This link is shown only now. If it is lost, make a new one: the old one stops working.</p>
          </div>
        ) : vehicle.trackingOn ? (
          <p>
            This vehicle already has a link. It cannot be shown again. Make a new one to replace it (the old link stops working), or switch tracking off.
          </p>
        ) : (
          <p>This vehicle has no link yet.</p>
        )}
      </div>
      <ModalError message={problem} />
    </AppModal>
  );
}
