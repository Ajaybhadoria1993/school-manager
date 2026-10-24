import { useMemo, useState } from "react";
import { Armchair, FolderPlus, FolderTree, HelpCircle, Layers, Plus, Rows3, Wand2 } from "lucide-react";
import { useSchoolProfile } from "../../hooks/useSchoolProfile";
import { useDeleteDepartmentMutation, useGetStructureQuery } from "../../redux/api/academicsApi";
import { getApiError } from "../../utils/apiErrors";
import { groupClasses, plural } from "../../utils/academics";
import type { DepartmentItem } from "../../types";
import { ClassCard } from "../../components/classes/ClassCard";
import { ClassesHero, heroGlass, heroSolid } from "../../components/classes/ClassesHero";
import { ClassModal } from "../../components/classes/ClassModal";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { RenameDepartmentModal } from "../../components/classes/department/RenameDepartmentModal";
import { DepartmentGroup } from "../../components/classes/DepartmentGroup";
import { AddDepartmentModal } from "../../components/classes/AddDepartmentModal";
import { GuideCard } from "../../components/classes/GuideCard";
import { QuickSetupForm } from "../../components/classes/QuickSetupForm";
import { QuickSetupPanel } from "../../components/classes/QuickSetupPanel";
import { AppModal } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { WithTip } from "../../components/ui/Hint";
import { Skeleton } from "../../components/ui/Skeleton";
import { KpiCard } from "../../components/dashboard/school/KpiCard";
import { useToast } from "../../components/ui/toast-context";

/** What is open on top of the page. One at a time. */
type Dialog =
  | { kind: "class" }
  | { kind: "add-department" }
  | { kind: "rename-department"; department: DepartmentItem }
  | { kind: "delete-department"; department: DepartmentItem }
  | { kind: "quick-setup" };

const GUIDE_KEY = "edushiksha.classes.guide-closed";

/** The guide is open until the person closes it once; that is remembered on this device. */
function readGuideClosed(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberGuideClosed(closed: boolean) {
  try {
    if (closed) localStorage.setItem(GUIDE_KEY, "1");
    else localStorage.removeItem(GUIDE_KEY);
  } catch {
    // No storage (a private window): the guide simply shows again next time.
  }
}

/** Manage school > Classes & Sections: the layout of the school, built before students and teachers are added. */
export default function ClassesPage() {
  const { push } = useToast();
  const { data: res, error, isFetching, refetch } = useGetStructureQuery();
  // The school's answers from sign-up only fill in the first-time setup panel (a school with no classes): not asked for otherwise.
  const profile = useSchoolProfile(!res || res.data.classes.length > 0);
  const [deleteDepartment] = useDeleteDepartmentMutation();

  const [dialog, setDialog] = useState<Dialog | null>(null);
  // null = the page decides: the guide is open for someone with no classes yet and out of the way once there are classes.
  const [guideChoice, setGuideChoice] = useState<boolean | null>(null);

  const structure = res?.data;
  const loading = !res && (isFetching || !error);
  const loadError = error ? (getApiError(error)?.message ?? "Could not load your classes.") : null;
  const groups = useMemo(() => (structure ? groupClasses(structure) : []), [structure]);

  const close = () => setDialog(null);
  const toggleGuide = () => {
    rememberGuideClosed(guideOpen);
    setGuideChoice(!guideOpen);
  };

  const hasClasses = (structure?.classes.length ?? 0) > 0;
  const hasAnything = hasClasses || (structure?.departments.length ?? 0) > 0;
  const guideOpen = guideChoice ?? (!readGuideClosed() && !hasClasses);

  return (
    <div className="space-y-6">
      <ClassesHero
        title="Classes & Sections"
        description="Your school's classes, in teaching order, by department. To change a department, or any class or section in it, press the Manage button of its heading."
      >
        <WithTip tip="Add one class, such as Class 5, together with its sections.">
          <Button className={heroSolid} onClick={() => setDialog({ kind: "class" })}>
            <Plus className="size-4" aria-hidden />
            Add class
          </Button>
        </WithTip>
        <WithTip tip="Add a department such as Primary or Middle and choose which classes go in it.">
          <Button variant="ghost" className={heroGlass} onClick={() => setDialog({ kind: "add-department" })}>
            <FolderPlus className="size-4" aria-hidden />
            Create department
          </Button>
        </WithTip>
        <Button variant="ghost" className={heroGlass} onClick={toggleGuide} aria-pressed={guideOpen}>
          <HelpCircle className="size-4" aria-hidden />
          Guide
        </Button>
      </ClassesHero>

      {guideOpen && <GuideCard onClose={toggleGuide} />}

      {loading ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : loadError || !structure ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{loadError}</p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          {hasAnything && (
            <section aria-label="Your school at a glance" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard index={0} label="Departments" value={structure.totals.departments} hint="Groups of classes" icon={Layers} tone="info" />
              <KpiCard
                index={1}
                label="Classes"
                value={structure.totals.classes}
                hint={
                  hasClasses
                    ? `${structure.classes[0].name} to ${structure.classes[structure.classes.length - 1].name}`
                    : "None yet"
                }
                icon={FolderTree}
                tone="primary"
              />
              <KpiCard
                index={2}
                label="Sections"
                value={structure.totals.sections}
                hint={structure.academicYear ? `For academic year ${structure.academicYear.name}` : "Where students will sit"}
                icon={Rows3}
                tone="success"
              />
              <KpiCard
                index={3}
                label="Seats"
                value={structure.totals.seats}
                hint={structure.totals.seats === 0 ? "Set when you add a section" : "Where a limit is set"}
                icon={Armchair}
                tone="warning"
              />
            </section>
          )}

          {!hasClasses && (
            <QuickSetupPanel
              defaultFrom={profile?.steps[1].lowestClass ?? "Nursery"}
              defaultTo={profile?.steps[1].highestClass ?? "12"}
              fromSignup={!!(profile?.steps[1].lowestClass && profile.steps[1].highestClass)}
              onAddSingle={() => setDialog({ kind: "class" })}
            />
          )}

          {hasAnything && (
            <div className="space-y-8">
              {groups.map((group) => (
                <DepartmentGroup
                  key={group.department?.id ?? "other"}
                  group={group}
                  titled={structure.departments.length > 0}
                  onAddDepartment={() => setDialog({ kind: "add-department" })}
                  onRename={() => group.department && setDialog({ kind: "rename-department", department: group.department })}
                  onDelete={() => group.department && setDialog({ kind: "delete-department", department: group.department })}
                >
                  {group.classes.map((classItem, index) => (
                    <ClassCard key={classItem.id} classItem={classItem} tone={group.tone} index={index} />
                  ))}
                </DepartmentGroup>
              ))}
            </div>
          )}

          {hasClasses && (
            <p className="text-center text-sm text-foreground-muted">
              Missing a few classes?{" "}
              <button
                type="button"
                onClick={() => setDialog({ kind: "quick-setup" })}
                className="inline-flex items-center gap-1 font-semibold text-primary-deep underline-offset-2 hover:underline"
              >
                <Wand2 className="size-3.5" aria-hidden />
                Use quick setup
              </button>{" "}
              to add a range of classes at once. Classes you already have are left as they are.
            </p>
          )}
        </>
      )}

      {structure && dialog?.kind === "class" && <ClassModal structure={structure} onClose={close} />}
      {structure && dialog?.kind === "add-department" && (
        <AddDepartmentModal
          classes={structure.classes.filter((c) => !c.departmentId)}
          departments={structure.departments}
          onClose={close}
        />
      )}

      {structure && dialog?.kind === "rename-department" && (
        <RenameDepartmentModal department={dialog.department} structure={structure} onClose={close} />
      )}

      {dialog?.kind === "delete-department" && (
        <ConfirmModal
          title={`Delete ${dialog.department.name}?`}
          confirmLabel="Delete department"
          onClose={close}
          onConfirm={async () => {
            await deleteDepartment(dialog.department.id).unwrap();
            push("success", `${dialog.department.name} deleted`);
          }}
        >
          <p>
            Only the heading is deleted.{" "}
            {dialog.department.classCount > 0
              ? `Its ${plural(dialog.department.classCount, "class")} stay${dialog.department.classCount === 1 ? "s" : ""} in your school, under "Other classes".`
              : "It has no classes."}
          </p>
        </ConfirmModal>
      )}

      {dialog?.kind === "quick-setup" && (
        <AppModal title="Quick setup" icon={Wand2} size="lg" onClose={close}>
          <p className="text-sm text-foreground-muted">
            Pick a range of classes and we add the ones you do not have yet. Nothing you already made is changed.
          </p>
          <QuickSetupForm defaultFrom="Nursery" defaultTo="12" onDone={close} />
        </AppModal>
      )}
    </div>
  );
}
