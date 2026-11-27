import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { StepProfile } from "../../onboarding/steps";
import { MyPhotoField } from "../MyPhotoField";
import { PersonPhotoField } from "../PersonPhotoField";

/** Profile photos (docs/profiles.md): chosen, saved at once, changed and taken away; optional everywhere. */

const PICTURE = "data:image/png;base64,aGVsbG8=";
const file = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "me.png", { type: "image/png" });

function show(ui: React.ReactElement, handlers: Record<string, Handler>) {
  signInAs("school_admin");
  const calls = fakeApi(handlers);
  render(<Provider store={store}>{ui}</Provider>);
  return { calls, user: userEvent.setup() };
}
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("my photo", () => {
  it("shows the initials until one is added; a chosen picture is saved at once and shown", async () => {
    const { calls, user } = show(<MyPhotoField name="Asha Verma" />, { "GET /profile/photo": () => ({ photo: null }), "PUT /profile/photo": () => ({ photo: PICTURE }) });
    expect(await screen.findByRole("button", { name: "Add photo" })).toBeInTheDocument();
    expect(screen.getByText("AV")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove the photo" })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose a photo"), file());
    expect(await screen.findByRole("img", { name: "Photo of Asha Verma" })).toHaveAttribute("src", PICTURE);
    expect(writes(calls)).toEqual([expect.objectContaining({ method: "PUT", path: "/profile/photo" })]);
    // The answer carries the picture: it is not asked for again.
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("is changed or taken away", async () => {
    const { calls, user } = show(<MyPhotoField name="Asha Verma" />, { "GET /profile/photo": () => ({ photo: PICTURE }), "DELETE /profile/photo": () => ({ photo: null }) });
    expect(await screen.findByRole("button", { name: "Change photo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove the photo" }));
    expect(await screen.findByRole("button", { name: "Add photo" })).toBeInTheDocument();
    expect(writes(calls).map((c) => c.method)).toEqual(["DELETE"]);
  });

  it("says what the server refused", async () => {
    const { user } = show(<MyPhotoField name="Asha Verma" />, {
      "GET /profile/photo": () => ({ photo: null }),
      "PUT /profile/photo": () => new Response(JSON.stringify({ success: false, message: "The photo must be a PNG, JPG or WebP picture.", code: "PHOTO_NOT_IMAGE" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    await user.upload(await screen.findByLabelText("Choose a photo"), file());
    expect(await screen.findByRole("alert")).toHaveTextContent("PNG, JPG or WebP");
  });

  it("a picture still too big after shrinking is not sent", async () => {
    const { calls, user } = show(<MyPhotoField name="Asha Verma" />, { "GET /profile/photo": () => ({ photo: null }) });
    await user.upload(await screen.findByLabelText("Choose a photo"), new File([new Uint8Array(400 * 1024)], "big.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("too big");
    expect(writes(calls)).toHaveLength(0);
  });
});

describe("a teacher's or a staff member's photo", () => {
  it("is read and saved for that person", async () => {
    const { calls, user } = show(<PersonPhotoField kind="teacher" id="t9" name="Meena Singh" canChange />, {
      "GET /staff/teachers/t9/photo": () => ({ photo: null }),
      "PUT /staff/teachers/t9/photo": () => ({ photo: PICTURE }),
    });
    await user.upload(await screen.findByLabelText("Choose a photo"), file());
    expect(await screen.findByRole("img", { name: "Photo of Meena Singh" })).toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /staff/teachers/t9/photo", "PUT /staff/teachers/t9/photo"]);
  });

  it("of a staff member, only looked at by someone who may not change it", async () => {
    show(<PersonPhotoField kind="staff" id="s1" name="Rita Das" canChange={false} />, { "GET /staff/members/s1/photo": () => ({ photo: PICTURE }) });
    expect(await screen.findByRole("img", { name: "Photo of Rita Das" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a photo")).not.toBeInTheDocument();
  });
});

describe("onboarding > Your profile", () => {
  it("offers the person registering a photo of themselves, optional", async () => {
    const initial = { adminName: "Asha Verma", designation: "", designationOther: "", mobile: "", alternateMobile: "" } as never;
    const { calls, user } = show(<StepProfile initial={initial} onSubmit={async () => null} onBack={() => {}} saving={false} />, {
      "GET /profile/photo": () => ({ photo: null }),
      "PUT /profile/photo": () => ({ photo: PICTURE }),
    });
    expect(screen.getByText("Your photo")).toBeInTheDocument();
    expect(screen.getByText("(optional)", { selector: "[data-photo-optional]" })).toBeInTheDocument();
    await user.upload(await screen.findByLabelText("Choose a photo"), file());
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].path).toBe("/profile/photo");
  });
});
