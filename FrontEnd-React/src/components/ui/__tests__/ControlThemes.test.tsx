import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Search } from "lucide-react";
import { BoxedControls, FilledControls, Input, SoftControls, Textarea } from "../Input";
import { Select } from "../Select";
import { DateBox } from "../DateBox";
import { ThemeScope } from "../../../theme/themeScope";

afterEach(cleanup);

const input = () => screen.getByLabelText("Name");
const classes = () => input().className.split(/\s+/);

describe("the boxes of a form wear the look of the app", () => {
  it("Classic: a plain box is the white box with a hairline it always was, and a form's tall box is the boxed one", () => {
    render(<Input aria-label="Name" />);
    expect(classes()).toContain("rounded-lg");
    expect(classes()).toContain("h-10");
    cleanup();
    render(
      <BoxedControls>
        <Input aria-label="Name" />
      </BoxedControls>
    );
    expect(classes()).toContain("h-12");
    expect(classes().join(" ")).toContain("rounded-[10px]");
    expect(classes().join(" ")).toContain("border-foreground/60!");
  });

  it("a look of the sign-up form: a plain box is soft and rounded and keeps its size, so a toolbar does not grow", () => {
    render(
      <ThemeScope theme="onboarding">
        <Input aria-label="Name" />
      </ThemeScope>
    );
    expect(classes()).toContain("rounded-xl");
    expect(classes()).toContain("h-10");
    expect(classes().join(" ")).toContain("shadow-card");
    expect(classes().join(" ")).not.toContain("border-foreground/60!");
  });

  it("a look of the sign-up form: the form's tall boxed box is the soft box of the sign-up form, tall and rounded", () => {
    render(
      <ThemeScope theme="evergreen">
        <BoxedControls>
          <Input aria-label="Name" />
        </BoxedControls>
      </ThemeScope>
    );
    expect(classes()).toContain("rounded-xl");
    expect(classes()).toContain("h-12");
    expect(classes().join(" ")).not.toContain("rounded-[10px]");
    expect(classes().join(" ")).not.toContain("border-foreground/60!");
  });

  it("the sign-in screens' filled boxes and the sign-up form's own soft boxes are never changed by a look", () => {
    render(
      <ThemeScope theme="onboarding">
        <FilledControls>
          <Input aria-label="Name" />
        </FilledControls>
      </ThemeScope>
    );
    expect(classes()).toContain("bg-primary-soft");
    cleanup();
    render(
      <ThemeScope theme="onboarding">
        <SoftControls>
          <Input aria-label="Name" />
        </SoftControls>
      </ThemeScope>
    );
    expect(classes()).toContain("h-12");
  });

  it("a box with an icon keeps its icon padding, and a text area is rounded too", () => {
    render(
      <ThemeScope theme="onboarding">
        <Input aria-label="Name" icon={Search} />
        <Textarea aria-label="Notes" />
      </ThemeScope>
    );
    expect(classes()).toContain("pl-11");
    expect(screen.getByLabelText("Notes").className).toContain("rounded-xl");
  });

  it("the dropdown and the date box follow: rounded in a look, as before in Classic", () => {
    const { container, rerender } = render(<Select aria-label="Gender" value="" onChange={() => {}} options={["Male", "Female"]} />);
    const trigger = () => container.querySelector("button")!;
    expect(trigger().className).toContain("rounded-lg");
    expect(trigger().className).not.toContain("rounded-xl");
    rerender(
      <ThemeScope theme="onboarding">
        <Select aria-label="Gender" value="" onChange={() => {}} options={["Male", "Female"]} />
      </ThemeScope>
    );
    expect(trigger().className).toContain("rounded-xl");

    cleanup();
    const date = render(<DateBox id="born" label="Born" value="" onChange={() => {}} />);
    expect(date.container.innerHTML).not.toContain("rounded-xl");
    date.rerender(
      <ThemeScope theme="onboarding">
        <DateBox id="born" label="Born" value="" onChange={() => {}} />
      </ThemeScope>
    );
    expect(date.container.innerHTML).toContain("rounded-xl");
  });
});
