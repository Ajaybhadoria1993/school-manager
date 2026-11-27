import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { fileSizeText, resumeProblem } from "../../../utils/resume";
import { ResumeField } from "../ResumeField";

/** A teacher's resume (docs/profiles.md): optional, a PDF or Word file; uploaded, downloaded, replaced and taken away. */

const INFO = { name: "meena-resume.pdf", size: 245_760, uploadedAt: "2026-11-27T09:00:00.000Z" };
const pdf = (name = "cv.pdf", bytes = 20) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

function show(ui: React.ReactElement, handlers: Record<string, Handler>) {
  signInAs("school_admin");
  const calls = fakeApi(handlers);
  render(
    <Provider store={store}>
      <ToastProvider>{ui}</ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup({ applyAccept: false }) };
}
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("the rules of a resume file", () => {
  it("a PDF or Word file up to 2 MB", () => {
    for (const name of ["cv.pdf", "CV.PDF", "cv.doc", "cv.docx"]) expect(resumeProblem({ name, size: 100 }), name).toBeNull();
    expect(resumeProblem({ name: "cv.png", size: 100 })).toBe("The resume must be a PDF or Word file.");
    expect(resumeProblem({ name: "cv", size: 100 })).toBe("The resume must be a PDF or Word file.");
    expect(resumeProblem({ name: "cv.pdf", size: 2 * 1024 * 1024 + 1 })).toBe("The resume is bigger than 2 MB. Choose a smaller file.");
  });

  it("says a size as people read it", () => {
    expect(fileSizeText(500)).toBe("1 KB");
    expect(fileSizeText(245_760)).toBe("240 KB");
    expect(fileSizeText(1_572_864)).toBe("1.5 MB");
  });
});

describe("a teacher's resume on the school's pages", () => {
  const field = (canChange = true) => <ResumeField teacherId="t9" canChange={canChange} />;

  it("uploads one where there is none, and shows its name and size", async () => {
    const { calls, user } = show(field(), { "GET /staff/teachers/t9/resume": () => ({ resume: null }), "PUT /staff/teachers/t9/resume": () => ({ resume: INFO }) });
    expect(await screen.findByRole("button", { name: "Upload resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose a resume"), pdf());
    expect(await screen.findByText("meena-resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("240 KB")).toBeInTheDocument();
    expect(writes(calls).map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /staff/teachers/t9/resume"]);
    // The answer says what was saved: it is not asked for again.
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("downloads it, replaces it and takes it away", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:cv", revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { calls, user } = show(field(), {
      "GET /staff/teachers/t9/resume": () => ({ resume: INFO }),
      "GET /staff/teachers/t9/resume/file": () => new Response(new Blob(["(a resume)"]), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="meena-resume.pdf"' } }),
      "DELETE /staff/teachers/t9/resume": () => ({ resume: null }),
    });
    await user.click(await screen.findByRole("button", { name: "Download" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove the resume" }));
    expect(await screen.findByRole("button", { name: "Upload resume" })).toBeInTheDocument();
    expect(writes(calls).map((c) => c.method)).toEqual(["DELETE"]);
    click.mockRestore();
  });

  it("a wrong file is not sent; the server's refusal is shown", async () => {
    const { calls, user } = show(field(), {
      "GET /staff/teachers/t9/resume": () => ({ resume: null }),
      "PUT /staff/teachers/t9/resume": () => new Response(JSON.stringify({ success: false, message: "The resume must be a PDF or Word file.", code: "RESUME_NOT_DOCUMENT" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    await screen.findByRole("button", { name: "Upload resume" });
    await user.upload(screen.getByLabelText("Choose a resume"), pdf("photo.png"));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF or Word");
    expect(writes(calls)).toHaveLength(0);
    await user.upload(screen.getByLabelText("Choose a resume"), pdf());
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF or Word");
  });

  it("is only downloaded by someone who may not change it", async () => {
    show(field(false), { "GET /staff/teachers/t9/resume": () => ({ resume: INFO }) });
    expect(await screen.findByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove the resume" })).not.toBeInTheDocument();
  });

  it("says so when there is none to someone who may not upload", async () => {
    show(field(false), { "GET /staff/teachers/t9/resume": () => ({ resume: null }) });
    expect(await screen.findByText("No resume uploaded")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("without a teacher it is the signed-in teacher's own", async () => {
    const { calls } = show(<ResumeField canChange />, { "GET /profile/resume": () => ({ resume: INFO }) });
    expect(await screen.findByText("meena-resume.pdf")).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(["/profile/resume"]);
  });
});
