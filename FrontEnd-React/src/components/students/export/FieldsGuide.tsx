import { useState } from "react";
import { Info } from "lucide-react";
import { AppModal } from "../../ui/AppModal";
import { Button } from "../../ui/Button";

/**
 * The (i) beside the title of Manage fields: pressed, it opens the explanation of the page (the form and the Excel are two lists, what
 * Asked, Mandatory, In Excel and Always mean, what every school keeps, how a bulk upload differs, where each detail goes).
 */
export function FieldsGuide() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="How the fields work"
        title="How the fields work"
        onClick={() => setOpen(true)}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center self-center rounded-full text-foreground-muted transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
      >
        <Info className="size-5" aria-hidden />
      </button>
      {open && (
        <AppModal
          title="How the fields work"
          icon={Info}
          size="lg"
          onClose={() => setOpen(false)}
          footer={<Button onClick={() => setOpen(false)}>Got it</Button>}
        >
          <div className="space-y-2 text-sm text-foreground-muted">
            <p>
              <strong className="text-foreground">Two lists, each yours to arrange.</strong> <strong className="text-foreground">Add student form</strong> is what the form asks, step by step.{" "}
              <strong className="text-foreground">Excel columns</strong> is the file you download and upload. Changing one does not change the other, except for what is mandatory.
            </p>
            <p>
              <strong className="text-foreground">Every school keeps these</strong>, always on, in Add student and in the Excel: Student Name, Gender, Date of Birth, Age, Category,
              Class and Section, both parents' names and mobile numbers, the Address (always needed) and the Previous School (needed from Class 1; Nursery, LKG and UKG
              may leave it empty). Section is asked when the class has sections, and can be changed later on the student's page.
            </p>
            <p>
              <strong className="text-foreground">Bulk upload is flexible</strong>: an old register seldom holds all of this, so a file is accepted without the rest. Only the name,
              gender, date of birth, class and a parent's mobile number are needed there. Add student is the strict one.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-foreground">Asked</strong> (form): Add student asks it. <strong className="text-foreground">In Excel</strong> (columns): it is a column of the file.
              </li>
              <li>
                <strong className="text-foreground">Mandatory</strong>: a student is not saved without it. <strong className="text-foreground">Optional</strong>: it may be left empty. It
                is one setting: change it on the form or in the Excel list and both follow, and a mandatory detail is always asked and always a column of the Excel (make it optional
                first to take it out).
              </li>
              <li>
                <strong className="text-foreground">Always</strong>: Add student always asks it, whatever you choose here (the first name, the last name, the date of birth...). In the
                Excel the same details are always columns.
              </li>
              <li>
                <strong className="text-foreground">Student Name</strong> is only the full name in one column of the Excel, made from the first and the last name.
              </li>
            </ul>
            <p>
              <strong className="text-foreground">Where each detail goes</strong>: Add student asks in steps (Personal info, Academic, Parents, More details, and the steps you add yourself with
              Add a step). The Add student form card shows them as the form does. There you can put the details a school may move (blood group, religion, the IDs, health, fees, the bus)
              and your own fields in the step you want (drag them by the grip, or use their Move list), and press Preview to see Add student as it will look. The name, gender, date of
              birth, category, class, parents, address and previous school stay in their own step. A step is shown on Add student only when something is asked in it.
            </p>
            <p>Your own fields belong to your school alone: no other school sees them.</p>
          </div>
        </AppModal>
      )}
    </>
  );
}
