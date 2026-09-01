const { generateKeyPairSync } = require("node:crypto");

const { createGithubServices } = require("../src/lib/githubClient");

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

const config = {
  githubIntegrationEnabled: true,
  githubAppId: "12345",
  githubAppClientId: "client-id",
  githubAppClientSecret: "client-secret",
  githubAppPrivateKeyBase64: Buffer.from(privateKey).toString("base64"),
  githubApiVersion: "2026-03-10"
};

const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: globalThis.vi.fn().mockResolvedValue(payload)
});

describe("GitHub App API client", () => {
  it("stays disabled without constructing credentials", () => {
    expect(createGithubServices({ githubIntegrationEnabled: false })).toBeNull();
  });

  it("verifies an installation through fixed GitHub origins and discards the user token", async () => {
    const fetchImpl = globalThis.vi
      .fn()
      .mockResolvedValueOnce(
        response({
          id: 7001,
          account: { id: 8001, login: "workflowhq", type: "Organization" }
        })
      )
      .mockResolvedValueOnce(response({ access_token: "temporary-user-token" }))
      .mockResolvedValueOnce(response({ installations: [{ id: 7001 }] }));
    const github = createGithubServices(config, {
      fetchImpl,
      now: () => Date.parse("2026-09-01T00:00:00Z")
    });

    const installation = await github.verifyInstallationForUser({
      installationId: 7001,
      code: "one-time-code"
    });

    expect(installation.id).toBe(7001);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.github.com/app/installations/7001");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://github.com/login/oauth/access_token");
    expect(fetchImpl.mock.calls[2][0]).toBe(
      "https://api.github.com/user/installations?per_page=100&page=1"
    );
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.redirect).toBe("manual");
    }
    expect(fetchImpl.mock.calls[0][1].headers["X-GitHub-Api-Version"]).toBe("2026-03-10");
    expect(fetchImpl.mock.calls[1][1].body).toContain('"code":"one-time-code"');
  });

  it("rejects an installation that is not associated with the authorizing user", async () => {
    const fetchImpl = globalThis.vi
      .fn()
      .mockResolvedValueOnce(response({ id: 7001 }))
      .mockResolvedValueOnce(response({ access_token: "temporary-user-token" }))
      .mockResolvedValueOnce(response({ installations: [{ id: 7002 }] }));
    const github = createGithubServices(config, { fetchImpl });

    await expect(
      github.verifyInstallationForUser({ installationId: 7001, code: "one-time-code" })
    ).rejects.toMatchObject({ status: 403, code: "GITHUB_INSTALLATION_NOT_AUTHORIZED" });
  });

  it("caches short-lived installation tokens while paginating repositories", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fetchImpl = globalThis.vi
      .fn()
      .mockResolvedValueOnce(response({ token: "installation-token", expires_at: expiresAt }))
      .mockResolvedValueOnce(response({ repositories: [{ id: 1 }] }))
      .mockResolvedValueOnce(response({ repositories: [{ id: 2 }] }));
    const github = createGithubServices(config, { fetchImpl });

    expect(await github.listInstallationRepositories(7001)).toEqual([{ id: 1 }]);
    expect(await github.listInstallationRepositories(7001)).toEqual([{ id: 2 }]);
    expect(
      fetchImpl.mock.calls.filter(([url]) => url.endsWith("/app/installations/7001/access_tokens"))
    ).toHaveLength(1);
  });
});
