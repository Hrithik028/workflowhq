import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./auth";
import { refreshAccessSession } from "./client";
import { requestActivity } from "./requestActivity";

afterEach(() => vi.restoreAllMocks());
describe("rotating session refresh", () => {
  it("shares a single request across StrictMode restores and token retries", async () => {
    let complete!: (response: unknown) => void;
    const pending = new Promise((resolve) => {
      complete = resolve;
    });
    const post = vi.spyOn(axios, "post").mockReturnValue(pending as ReturnType<typeof axios.post>);
    const first = authApi.restore();
    const second = authApi.restore();
    const retry = refreshAccessSession();
    expect(post).toHaveBeenCalledTimes(1);
    complete({
      data: {
        data: {
          accessToken: "qa-token",
          user: {
            id: 1,
            name: "QA",
            email: "qa@example.com",
            role: "user",
            created_at: "2026-10-06"
          }
        }
      }
    });
    const [a, b, c] = await Promise.all([first, second, retry]);
    expect(a).toEqual(b);
    expect(c.accessToken).toBe(a.accessToken);
    expect(a.user.createdAt).toBe("2026-10-06");
    expect(requestActivity.getSnapshot()).toBe(0);
  });

  it("clears failed refreshes so a later sign-in can restore normally", async () => {
    const post = vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("Expired session"));
    await expect(authApi.restore()).rejects.toThrow("Expired session");
    post.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: "new-qa-token",
          user: {
            id: 1,
            name: "QA",
            email: "qa@example.com",
            role: "user",
            created_at: "2026-10-06"
          }
        }
      }
    });
    expect((await authApi.restore()).accessToken).toBe("new-qa-token");
    expect(post).toHaveBeenCalledTimes(2);
    expect(requestActivity.getSnapshot()).toBe(0);
  });
});
