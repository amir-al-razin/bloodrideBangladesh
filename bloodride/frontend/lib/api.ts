// Small fetch helpers. All calls go to /api/* on this server, which Next.js forwards to FastAPI.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    if (d && typeof d === "object" && !Array.isArray(d) && d.message) {
      throw new ApiError(res.status, d.error ?? "error", d.message);
    }
    if (Array.isArray(d) && d[0]?.msg) {
      const field = d[0].loc?.slice(-1)[0];
      throw new ApiError(res.status, "invalid_input", `${field ? field.replace(/_/g, " ") + ": " : ""}${d[0].msg}`);
    }
    throw new ApiError(res.status, "error", "Something went wrong, please try again");
  }
  return body as T;
}

export async function get<T>(path: string, headers?: HeadersInit): Promise<T> {
  return handle<T>(await fetch(path, { headers, cache: "no-store" }));
}

export async function post<T>(path: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  return handle<T>(await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body ?? {}),
  }));
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  return handle<T>(await fetch(path, { method: "POST", body: form }));
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export type Hospital = { hospital_id: number; name: string; address: string };
