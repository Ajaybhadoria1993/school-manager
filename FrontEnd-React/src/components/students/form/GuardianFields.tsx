import { AtSign, BriefcaseBusiness, Loader2, Phone, Search, Star, Trash2, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { RELATIONS } from "../../../constants/students";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { cn } from "../../../utils/helpers";
import { formatMobile, keepsDetails, placeLabel, takenRelations } from "../../../utils/students";
import { isIndianMobile } from "../../../utils/validators";
import type { Relation } from "../../../types";
import { ChipPicker } from "../../ui/ChipPicker";
import { Field } from "../../ui/Field";
import { InfoTip, TipButton } from "../../ui/Hint";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { FORM_GRID } from "./formGrid";
import { StudentAvatar } from "../StudentAvatar";

/**
 * One parent or guardian. On the admission form it starts with the MOBILE number: when 10 valid digits are typed the school's
 * guardians are searched once (POST /students/guardians/lookup). A parent the school already has is shown with their children
 * ("use as is" keeps their details exactly as saved, "update" lets them be changed); a new number opens the boxes for the name and the
 * rest. A second guardian may have no number ("No mobile number?"). On a student's page every box is open and changes the guardian's
 * own details (for each of their children).
 */
export function GuardianFields({
  form,
  index,
  mode,
  canRemove,
}: {
  form: StudentForm;
  index: number;
  mode: "admit" | "edit";
  canRemove: boolean;
}) {
  const g = form.values.guardians[index];
  const at = (field: string) => `guardians.${index}.${field}`;
  const state = form.lookups[g.key];
  const complete = isIndianMobile(g.mobile);
  // Admission: the boxes open once the number was checked (or the person has no number for this guardian).
  const open = mode === "edit" || g.manual || (!!g.match && g.choice === "update") || (!g.match && complete && g.lookedUp === g.mobile && state !== "checking");
  const title = g.match ? g.match.name : g.name.trim() || (g.relation ? `${g.relation}` : `Guardian ${index + 1}`);

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-colors sm:p-5",
        g.isPrimary ? "border-primary/30 bg-primary-soft/30" : "border-border bg-background/60"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StudentAvatar name={title} seed={g.mobile || g.key} size="sm" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{title}</p>
        {g.isPrimary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
            <Star className="size-3" aria-hidden />
            Primary contact
          </span>
        ) : (
          mode === "admit" && (
            <button
              type="button"
              onClick={() => form.makePrimary(index)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-bold text-foreground-muted transition-colors hover:border-primary/40 hover:text-primary-deep"
            >
              <Star className="size-3" aria-hidden />
              Make primary
            </button>
          )
        )}
        <InfoTip label="What is the primary contact?">
          The parent the school calls first. Their mobile number is required; it will also be how they sign in to the parent app later.
        </InfoTip>
        {canRemove && <TipButton label="Remove this guardian" icon={Trash2} danger onPress={() => form.removeGuardian(index)} />}
      </div>

      <div className={cn("mt-4", FORM_GRID)}>
        <Field
          id={fieldId(at("mobile"))}
          label="Mobile number"
          optional={!g.isPrimary}
          error={form.errorOf(at("mobile"))}
          hint={
            mode === "edit"
              ? "It will be this parent's sign-in later; a new number has to be verified again."
              : "Type it first: we check whether this parent is already in your school."
          }
        >
          <Input
            {...form.bind(at("mobile"))}
            onChange={(e) => form.setMobile(index, e.target.value)}
            icon={Phone}
            prefix="+91"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            placeholder="98765 43210"
          />
        </Field>

        <Field id={fieldId(at("relation"))} label={mode === "edit" ? "Relation to this student" : "Relation"} error={form.errorOf(at("relation"))}>
          {mode === "edit" ? (
            <p id={fieldId(at("relation"))} tabIndex={-1} className="flex h-10 items-center text-sm font-semibold text-foreground outline-none">
              {g.relation}
            </p>
          ) : (
            <Select
              id={fieldId(at("relation"))}
              value={g.relation}
              options={RELATIONS}
              // A child has one father and one mother: the one another guardian already is cannot be chosen again.
              disabledValues={[...takenRelations(form.values.guardians, index)]}
              placeholder="Select relation"
              invalid={!!form.errorOf(at("relation"))}
              onChange={(r) => form.setRelation(index, r as Relation)}
            />
          )}
        </Field>
      </div>

      {mode === "admit" && (
        <div aria-live="polite" className="mt-3 text-xs">
          {state === "checking" ? (
            <p className="inline-flex items-center gap-1.5 font-semibold text-foreground-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Checking whether this parent is already in your school...
            </p>
          ) : state === "failed" ? (
            <p className="font-semibold text-warning">Could not check this number just now. It is checked again when you press Admit.</p>
          ) : g.match ? null : complete && g.lookedUp === g.mobile ? (
            <p className="inline-flex items-center gap-1.5 font-semibold text-success">
              <UserRoundPlus className="size-3.5" aria-hidden />
              New to your school: fill in their details below.
            </p>
          ) : !open ? (
            <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground-muted">
              <Search className="size-3.5" aria-hidden />
              {g.isPrimary ? "The name and the other boxes open once the 10-digit number is typed." : "Their boxes open once the number is typed."}
              {!g.isPrimary && (
                <button type="button" onClick={() => form.setGuardian(index, { manual: true })} className="font-semibold text-primary-deep underline-offset-2 hover:underline">
                  No mobile number? Enter the details
                </button>
              )}
            </p>
          ) : null}
        </div>
      )}

      {g.match && (
        <div className="pop-in mt-3 rounded-xl border border-emerald-300/60 bg-success-soft/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserRoundCheck className="size-4 text-success" aria-hidden />
            {g.match.name} is already in your school
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {formatMobile(g.match.mobile)}
            {g.match.children.length > 0 ? ` · ${g.match.children.length === 1 ? "child" : "children"}:` : " · no children linked yet"}
          </p>
          {g.match.children.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Children of ${g.match.name}`}>
              {g.match.children.map((c) => (
                <li key={c.id} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-semibold text-foreground ring-1 ring-inset ring-border">
                  {c.name} <span className="text-foreground-muted">({placeLabel(c.className ? { className: c.className, sectionName: c.sectionName } : null)})</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <ChipPicker
              label={`What to do with ${g.match.name}`}
              value={g.choice}
              options={[
                { value: "use", label: "Use as is", icon: UserRoundCheck, tone: "success" },
                { value: "update", label: "Update details", icon: BriefcaseBusiness },
              ]}
              onChange={(choice) => form.setGuardian(index, { choice: choice as "use" | "update" })}
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              {keepsDetails(g)
                ? "This child is linked to the same parent; their saved details are not changed."
                : "The changes below are saved for this parent, for every one of their children."}
            </p>
          </div>
        </div>
      )}

      {open && !keepsDetails(g) && (
        <div className={cn("fade-in mt-4", FORM_GRID)}>
          <Field id={fieldId(at("name"))} label="Full name" error={form.errorOf(at("name"))}>
            <Input {...form.bind(at("name"))} maxLength={80} autoComplete="off" placeholder="For example Ravi Verma" />
          </Field>
          <Field id={fieldId(at("alternateMobile"))} label="Another number" optional error={form.errorOf(at("alternateMobile"))}>
            <Input
              {...form.bind(at("alternateMobile"))}
              onChange={(e) => form.setGuardian(index, { alternateMobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              icon={Phone}
              prefix="+91"
              type="tel"
              inputMode="numeric"
              maxLength={10}
            />
          </Field>
          <Field id={fieldId(at("email"))} label="Email" optional error={form.errorOf(at("email"))}>
            <Input {...form.bind(at("email"))} icon={AtSign} type="email" maxLength={254} autoComplete="off" />
          </Field>
          {asks(form.rules, "guardianOccupation") && (
            <Field id={fieldId(at("occupation"))} label="Occupation" optional={mayLeave(form.rules, "guardianOccupation")} error={form.errorOf(at("occupation"))}>
              <Input {...form.bind(at("occupation"))} icon={BriefcaseBusiness} maxLength={60} placeholder="Farmer, teacher, business..." />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
