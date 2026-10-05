import { AxiosError } from "axios";
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
});
