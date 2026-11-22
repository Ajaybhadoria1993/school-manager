import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { WelcomeHeader } from "../school/WelcomeHeader";

afterEach(cleanup);

describe("the top of the dashboard (2026-11-22, the reference pictures)", () => {
  it("has the greeting, and Add a student as the one orange main button beside the plain Send a notice", () => {
    render(
      <MemoryRouter>
        <WelcomeHeader firstName="Asha" schoolName="Sunrise Public School" addStudentHref="/school/students/new" />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Asha/);
    const add = screen.getByRole("link", { name: "Add a student" });
    expect(add).toHaveAttribute("href", "/school/students/new");
    expect(add.className).toContain("bg-orange");
    expect(screen.getByRole("link", { name: "Send a notice" }).className).not.toContain("bg-orange");
  });
});
