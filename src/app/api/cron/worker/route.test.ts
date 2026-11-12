import { describe, expect, it, vi } from "vitest";

const { runWorkerTick } = vi.hoisted(() => ({ runWorkerTick: vi.fn() }));

vi.mock("@/server/services/worker-tick", () => ({ runWorkerTick }));

const SECRET = "cron-test-secret";

function call(method: "GET" | "POST", authorization?: string) {
  return new Request("http://localhost/api/cron/worker", {
    method,
    headers: authorization ? { authorization: `Bearer ${authorization}` } : {},
  });
}

async function loadRoute() {
  return import("@/app/api/cron/worker/route");
}

describe("GET /api/cron/worker", () => {
  it("returns 503 when CRON_SECRET is not configured", async () => {
    vi.resetModules();
    delete process.env.CRON_SECRET;
    const route = await loadRoute();

    const response = await route.GET(call("GET"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("CRON_SECRET") });
  });

  it("rejects a missing or wrong secret", async () => {
    vi.resetModules();
    process.env.CRON_SECRET = SECRET;
    const route = await loadRoute();

    expect((await route.GET(call("GET"))).status).toBe(401);
    expect((await route.GET(call("GET", "wrong"))).status).toBe(401);
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("runs the shared tick for Vercel Cron and returns its result", async () => {
    vi.resetModules();
    process.env.CRON_SECRET = SECRET;
    runWorkerTick.mockResolvedValue({
      workerId: "worker-test",
      claimed: 2,
      results: [{ jobId: "job_1", status: "SUCCEEDED" }],
      retention: { ok: true, leadsSoftDeleted: 0, leadsPurged: 0, workspacesPurged: 0 },
    });
    const route = await loadRoute();

    const response = await route.GET(call("GET", SECRET));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(runWorkerTick).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      trigger: "cron",
      claimed: 2,
      retention: { ok: true },
    });
  });

  it("returns 500 when the tick throws", async () => {
    vi.resetModules();
    process.env.CRON_SECRET = SECRET;
    runWorkerTick.mockRejectedValue(new Error("database unavailable"));
    const route = await loadRoute();

    const response = await route.GET(call("GET", SECRET));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Worker run failed." });
  });

  it("rejects POST because Vercel Cron invokes GET", async () => {
    const route = await loadRoute();

    const response = route.POST();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});
