import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";

import { api } from "./client";
import { requestActivity } from "./requestActivity";

describe("request activity", () => {
  it("counts concurrent requests and ignores repeated completions", () => {
    const finishFirst = requestActivity.begin();
    const finishSecond = requestActivity.begin();
    expect(requestActivity.getSnapshot()).toBe(2);
    finishFirst();
    finishFirst();
    expect(requestActivity.getSnapshot()).toBe(1);
    finishSecond();
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it("clears the activity count after success and failure", async () => {
    await api.get("/loading-success", {
      adapter: async (config) => ({ data: {}, status: 200, statusText: "OK", headers: {}, config })
    });
    expect(requestActivity.getSnapshot()).toBe(0);

    await expect(
      api.get("/loading-failure", {
        adapter: async (config) => {
          throw new AxiosError("offline", "ERR_NETWORK", config);
        }
      })
    ).rejects.toThrow("offline");
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it("counts initial reads, but excludes writes and reads after navigation capture closes", async () => {
    const scope = requestActivity.beginNavigation();
    const counts: number[] = [];
    const adapter = async (config: InternalAxiosRequestConfig) => {
      counts.push(requestActivity.getNavigationSnapshot());
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
      await api.get("/tasks", { adapter });
      await api.put("/tasks/1", {}, { adapter });
      await api.post("/tasks", {}, { adapter });
      await api.delete("/tasks/1", { adapter });
      scope.seal();
      await api.get("/tasks", { adapter });
      expect(counts).toEqual([1, 0, 0, 0, 0]);
      expect(requestActivity.getSnapshot()).toBe(0);
      expect(requestActivity.getNavigationSnapshot()).toBe(0);
    } finally {
      scope.dispose();
    }
  });

  it("does not let a previous navigation clear the new page's requests", () => {
    const old = requestActivity.beginNavigation();
    const finishOld = requestActivity.begin();
    const current = requestActivity.beginNavigation();
    const finishCurrent = requestActivity.begin();
    old.dispose();
    finishOld();
    expect(requestActivity.getNavigationSnapshot()).toBe(1);
    finishCurrent();
    current.dispose();
    expect(requestActivity.getSnapshot()).toBe(0);
  });
});
