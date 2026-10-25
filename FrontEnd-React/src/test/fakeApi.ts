import { vi } from "vitest";

export type Call = { method: string; path: string; body: unknown };
/** Answers one request: the `data` of the API's answer, or a whole `Response` (a file, an error). */
export type Handler = (body: unknown) => unknown | Promise<unknown>;

/**
 * A pretend API for a page test: `fetch` is replaced, every request is answered by its handler ("GET /students/settings") and
 * remembered in the returned list, and an address with no handler is a 404. Call `vi.unstubAllGlobals()` after the test.
 */
export function fakeApi(handlers: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname.replace("/api/v1", "");
    const json = request.headers.get("content-type")?.includes("application/json");
    const body = request.method === "GET" ? undefined : json ? await request.json() : "(a file)";
    calls.push({ method: request.method, path, body });
    const handler = handlers[`${request.method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ success: false, message: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    const data = await handler(body);
    if (data instanceof Response) return data;
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

/** A spreadsheet as the server sends one (the sample file, the export), named by its Content-Disposition. */
export const spreadsheet = (fileName: string) =>
  new Response(new Blob(["(a spreadsheet)"]), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
