import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Building2, Globe, MapPin, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { Alert, Avatar, Button, Chip } from "@heroui/react";
import { useNow } from "../../hooks/useNow";
import { useDecideTenantMutation, useGetSchoolReviewQuery } from "../../redux/api/tenantApi";
import { getApiError } from "../../utils/apiErrors";
import { buildSignals, buildTimeline } from "../../utils/review";
import { designationLabel, formatClassRange, formatPhone } from "../../constants/schoolOptions";
import { formatDateTime } from "../../utils/status";
import { initials } from "../../utils/helpers";
import { BoardsCard } from "../../components/review/BoardsCard";
import { DecisionModal, type DecisionKind } from "../../components/review/DecisionModal";
import { DecisionPanel } from "../../components/review/DecisionPanel";
import { DetailCard, DetailRow } from "../../components/review/DetailCard";
import { ReviewChecklist } from "../../components/review/ReviewChecklist";
import { ReviewHero } from "../../components/review/ReviewHero";
import { ReviewStats } from "../../components/review/ReviewStats";
import { ReviewTimeline } from "../../components/review/ReviewTimeline";
import { ActionLink } from "../../components/review/RowActions";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import type { TenantDecision } from "../../types";
import { formatDayRange } from "../../utils/academicYear";

/** What the toast says once each decision has gone through. */
const DECISION_DONE: Record<TenantDecision, string> = {
  approve: "School approved. Its administrator has been emailed.",
  reject: "Sent back to the school with your reason.",
  suspend: "School suspended. Nobody from it can sign in now, and its administrator has been emailed.",
  reactivate: "School reactivated. Its administrator has been emailed.",
};

/** "tel:" wants the number with its country code; an older entry that is not 10 digits is dialled as it was typed. */
const dial = (national: string) => `tel:${/^\d{10}$/.test(national) ? `+91${national}` : national}`;
const withCode = (national: string) => (/^\d{10}$/.test(national) ? `+91${national}` : national);

function ReviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading school">
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * The super admin's page about one school: who it is, everything it told us, what is worth a second look,
 * and (while it waits) the decision. All the answers are on the page, none hidden behind a tab.
 */
export default function SchoolReviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { push } = useToast();

  // Asked again on every visit, and after any decision on this school (see redux/api/tenantApi.ts).
  const { currentData: res, error: loadError, refetch } = useGetSchoolReviewQuery(id);
  const [decideTenant] = useDecideTenantMutation();
  const data = res?.data ?? null;
  const apiError = loadError ? getApiError(loadError) : null;
  const error = loadError ? { status: apiError?.status ?? 0, message: apiError?.message ?? "Could not load this school." } : null;
  const now = useNow(res);

  // The dialog keeps its kind while it closes (so its text does not change mid-animation), and a new key each time it opens.
  const [dialog, setDialog] = useState<{ kind: DecisionKind; open: boolean; key: number }>({ kind: "approve", open: false, key: 0 });
  const [working, setWorking] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const signals = useMemo(() => (data ? buildSignals(data) : []), [data]);
  const timeline = useMemo(() => (data ? buildTimeline(data) : []), [data]);

  function openDialog(kind: DecisionKind) {
    setDialogError(null);
    setDialog((d) => ({ kind, open: true, key: d.key + 1 }));
  }
  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  async function decide(text: string) {
    setWorking(true);
    setDialogError(null);
    try {
      await decideTenant({ id, decision: dialog.kind, text }).unwrap();
      push("success", DECISION_DONE[dialog.kind]);
      closeDialog(); // the decision marked this school's data as stale, so it is read again by itself
    } catch (err) {
      const e = getApiError(err);
      if (e?.code === "INVALID_STATE") {
        // Someone else already decided (or switched it): show the new state instead of an error.
        closeDialog();
        push("error", "This school was already changed by someone else. Showing the latest.");
        refetch();
      } else {
        setDialogError(e?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setWorking(false);
    }
  }

  const back = (
    <Link to="/super-admin/schools" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden />
      All schools
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error.status === 404 ? "This school does not exist." : "Could not load this school"}</Alert.Title>
            {error.status !== 404 && <Alert.Description>{error.message}</Alert.Description>}
          </Alert.Content>
          {error.status !== 404 && (
            <Button size="sm" variant="secondary" onPress={() => refetch()}>
              Try again
            </Button>
          )}
        </Alert>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {back}
        <ReviewSkeleton />
      </div>
    );
  }

  const { tenant, steps, admin } = data;
  const s1 = steps[1];
  const s2 = steps[2];
  const s3 = steps[3];
  const street = [s2.addressLine1, s2.addressLine2].filter(Boolean).join(", ");
  const fullAddress = [street, s2.city, s2.district, s2.state, s2.pincode].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {back}

      <ReviewHero data={data} signals={signals} now={now} />
      <ReviewStats s1={s1} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* On a phone the decision comes first; on a wide screen it stays in view while you read. */}
        <div className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-6">
          <DecisionPanel
            data={data}
            index={2}
            onApprove={() => openDialog("approve")}
            onReject={() => openDialog("reject")}
            onSuspend={() => openDialog("suspend")}
            onReactivate={() => openDialog("reactivate")}
          />
          <ReviewChecklist signals={signals} submitted={["pending", "approved", "rejected"].includes(tenant.approvalStatus)} index={3} />
        </div>

        <div className="order-2 space-y-6 lg:order-1 lg:col-span-2">
          <BoardsCard boards={s1.boards} index={5} />

          <DetailCard icon={Building2} title="School" subtitle="What it is and how it is registered" index={6}>
            <DetailRow label="Name" copyText={s1.schoolName}>
              {s1.schoolName}
            </DetailRow>
            <DetailRow label="Type of school">{s1.schoolType}</DetailRow>
            <DetailRow label="Classes">{formatClassRange(s1.lowestClass, s1.highestClass)}</DetailRow>
            <DetailRow label="Academic year" important>
              {s1.academicYear?.name
                ? `${s1.academicYear.name}: ${formatDayRange(s1.academicYear.startDate, s1.academicYear.endDate)}${s1.academicYear.status === "pending" ? " (becomes active when you approve)" : ""}`
                : ""}
            </DetailRow>
            <DetailRow label="UDISE+ code" mono copyText={s1.udiseCode} important>
              {s1.udiseCode}
            </DetailRow>
            <DetailRow label="Established">{s1.establishedYear}</DetailRow>
          </DetailCard>

          <DetailCard icon={MapPin} title="Address and contact" subtitle="Where it is and how to reach it" tone="info" index={7}>
            <DetailRow
              label="Address"
              copyText={fullAddress}
              actions={<ActionLink href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`} label="Open in Maps" icon={MapPin} external />}
            >
              {street}
            </DetailRow>
            <DetailRow label="City or town">{s2.city}</DetailRow>
            <DetailRow label="District">{s2.district}</DetailRow>
            <DetailRow label="Division">{s2.division}</DetailRow>
            <DetailRow label="State">{s2.state}</DetailRow>
            <DetailRow label="PIN code" mono copyText={s2.pincode}>
              {s2.pincode}
            </DetailRow>
            <DetailRow
              label="School phone"
              copyText={withCode(s2.schoolPhone)}
              actions={<ActionLink href={dial(s2.schoolPhone)} label="Call the school" icon={Phone} />}
            >
              {formatPhone(s2.schoolPhone)}
            </DetailRow>
            <DetailRow
              label="School email"
              copyText={s2.schoolEmail}
              actions={<ActionLink href={`mailto:${s2.schoolEmail}`} label="Write to the school" icon={Mail} />}
            >
              {s2.schoolEmail}
            </DetailRow>
            <DetailRow
              label="Website"
              copyText={s2.website}
              actions={<ActionLink href={s2.website} label="Open the website" icon={Globe} external />}
            >
              {s2.website}
            </DetailRow>
          </DetailCard>

          <DetailCard
            icon={UserRound}
            title="Administrator"
            subtitle="Will run the school on the platform"
            tone="warning"
            index={8}
            aside={
              admin && (
                <Avatar size="md" color="accent" variant="soft">
                  <Avatar.Fallback>{initials(admin.name) || "A"}</Avatar.Fallback>
                </Avatar>
              )
            }
          >
            {admin ? (
              <>
                <DetailRow label="Name">{admin.name}</DetailRow>
                <DetailRow label="Role in the school">{designationLabel(s3.designation, s3.designationOther)}</DetailRow>
                <DetailRow
                  label="Login email"
                  copyText={admin.email}
                  actions={<ActionLink href={`mailto:${admin.email}`} label="Write to the administrator" icon={Mail} />}
                >
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {admin.email}
                    {admin.emailVerifiedAt ? (
                      <Chip color="success" variant="soft" size="sm">
                        <ShieldCheck className="size-3" aria-hidden />
                        <Chip.Label>Verified</Chip.Label>
                      </Chip>
                    ) : (
                      <Chip color="warning" variant="soft" size="sm">
                        <Chip.Label>Not confirmed</Chip.Label>
                      </Chip>
                    )}
                  </span>
                </DetailRow>
                <DetailRow
                  label="Mobile"
                  copyText={withCode(s3.mobile)}
                  actions={<ActionLink href={dial(s3.mobile)} label="Call the administrator" icon={Phone} />}
                >
                  {s3.mobile && formatPhone(s3.mobile)}
                </DetailRow>
                <DetailRow
                  label="Alternate mobile"
                  copyText={withCode(s3.alternateMobile)}
                  actions={<ActionLink href={dial(s3.alternateMobile)} label="Call the alternate number" icon={Phone} />}
                >
                  {s3.alternateMobile && formatPhone(s3.alternateMobile)}
                </DetailRow>
              </>
            ) : (
              <>
                <DetailRow
                  label="Invited email"
                  copyText={tenant.contactEmail}
                  actions={<ActionLink href={`mailto:${tenant.contactEmail}`} label="Write to this address" icon={Mail} />}
                >
                  {tenant.contactEmail}
                </DetailRow>
                <DetailRow label="Account">
                  <Chip color="default" variant="secondary" size="sm">
                    <Chip.Label>Not created yet{tenant.inviteExpiresAt ? `, link works until ${formatDateTime(tenant.inviteExpiresAt)}` : ""}</Chip.Label>
                  </Chip>
                </DetailRow>
              </>
            )}
          </DetailCard>

          <ReviewTimeline events={timeline} now={now} index={9} />
        </div>
      </div>

      <DecisionModal
        key={dialog.key}
        kind={dialog.kind}
        open={dialog.open}
        schoolName={tenant.name}
        working={working}
        error={dialogError}
        onClose={closeDialog}
        onConfirm={decide}
      />
    </div>
  );
}
