const jwt = require("jsonwebtoken");

const { AppError } = require("./errors");

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_WEB_ORIGIN = "https://github.com";
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

const githubUnavailable = () =>
  new AppError(502, "GITHUB_API_UNAVAILABLE", "GitHub could not complete this request.");

const requirePositiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError(400, "GITHUB_IDENTIFIER_INVALID", `${label} is invalid.`);
  }
  return parsed;
};

const decodePrivateKey = (encoded) => {
  try {
    const key = Buffer.from(encoded, "base64").toString("utf8");
    if (!key.includes("-----BEGIN") || !key.includes("PRIVATE KEY-----")) {
      throw new Error("PEM boundary missing.");
    }
    return key;
  } catch {
    throw new Error("The configured GitHub App private key is invalid.");
  }
};

const createGithubServices = (
  config,
  { fetchImpl = global.fetch, now = () => Date.now() } = {}
) => {
  if (!config.githubIntegrationEnabled) return null;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for the GitHub integration.");
  }

  const privateKey = decodePrivateKey(config.githubAppPrivateKeyBase64);
  const tokenCache = new Map();
  const pendingTokens = new Map();
  let rateLimitState = { remaining: null, resetAt: null };

  const appJwt = () => {
    const nowSeconds = Math.floor(now() / 1000);
    return jwt.sign(
      { iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: config.githubAppId },
      privateKey,
      { algorithm: "RS256" }
    );
  };

  const request = async (
    origin,
    path,
    { method = "GET", token, body, headers: extraHeaders = {} } = {}
  ) => {
    if (!path.startsWith("/") || path.includes("://")) {
      throw new AppError(500, "GITHUB_ENDPOINT_INVALID", "GitHub endpoint is invalid.");
    }

    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "WorkflowHQ-GitHub-App",
      ...extraHeaders
    };
    if (origin === GITHUB_API_ORIGIN) {
      headers["X-GitHub-Api-Version"] = config.githubApiVersion;
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual"
      });
    } catch {
      throw githubUnavailable();
    }

    if (origin === GITHUB_API_ORIGIN && response.headers?.get) {
      const remaining = Number(response.headers.get("x-ratelimit-remaining"));
      const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
      rateLimitState = {
        remaining: Number.isSafeInteger(remaining) && remaining >= 0 ? remaining : null,
        resetAt:
          Number.isFinite(resetSeconds) && resetSeconds > 0
            ? new Date(resetSeconds * 1000).toISOString()
            : null
      };
    }

    if (response.status >= 300 && response.status < 400) throw githubUnavailable();

    let payload = null;
    try {
      payload = response.status === 204 ? null : await response.json();
    } catch {
      if (response.ok) throw githubUnavailable();
    }

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 502 : response.status;
      throw new AppError(
        status >= 500 ? 502 : status,
        "GITHUB_API_REQUEST_FAILED",
        "GitHub rejected this request."
      );
    }
    return payload;
  };

  const getInstallation = (installationId) => {
    const id = requirePositiveInteger(installationId, "Installation ID");
    return request(GITHUB_API_ORIGIN, `/app/installations/${id}`, { token: appJwt() });
  };

  const exchangeUserCode = async (code) => {
    const payload = await request(GITHUB_WEB_ORIGIN, "/login/oauth/access_token", {
      method: "POST",
      body: {
        client_id: config.githubAppClientId,
        client_secret: config.githubAppClientSecret,
        code
      }
    });
    if (!payload?.access_token) throw githubUnavailable();
    return payload.access_token;
  };

  const listUserInstallations = async (userToken) => {
    const installations = [];
    for (let page = 1; page <= 100; page += 1) {
      const payload = await request(
        GITHUB_API_ORIGIN,
        `/user/installations?per_page=100&page=${page}`,
        { token: userToken }
      );
      const batch = Array.isArray(payload?.installations) ? payload.installations : [];
      installations.push(...batch);
      if (batch.length < 100) break;
    }
    return installations;
  };

  const verifyInstallationForUser = async ({ installationId, code }) => {
    const id = requirePositiveInteger(installationId, "Installation ID");
    const [installation, userToken] = await Promise.all([
      getInstallation(id),
      exchangeUserCode(code)
    ]);
    const userInstallations = await listUserInstallations(userToken);
    if (!userInstallations.some((candidate) => Number(candidate.id) === id)) {
      throw new AppError(
        403,
        "GITHUB_INSTALLATION_NOT_AUTHORIZED",
        "This GitHub installation is not available to the connecting user."
      );
    }
    return installation;
  };

  const mintInstallationToken = async (installationId) => {
    const id = requirePositiveInteger(installationId, "Installation ID");
    const payload = await request(GITHUB_API_ORIGIN, `/app/installations/${id}/access_tokens`, {
      method: "POST",
      token: appJwt()
    });
    const expiresAt = Date.parse(payload?.expires_at);
    if (!payload?.token || !Number.isFinite(expiresAt)) throw githubUnavailable();
    return { token: payload.token, expiresAt };
  };

  const getInstallationToken = async (installationId) => {
    const id = requirePositiveInteger(installationId, "Installation ID");
    const cached = tokenCache.get(id);
    if (cached && cached.expiresAt - TOKEN_REFRESH_SKEW_MS > now()) return cached.token;
    if (pendingTokens.has(id)) return pendingTokens.get(id);

    const pending = mintInstallationToken(id)
      .then(({ token, expiresAt }) => {
        tokenCache.set(id, { token, expiresAt });
        return token;
      })
      .finally(() => pendingTokens.delete(id));
    pendingTokens.set(id, pending);
    return pending;
  };

  const listInstallationRepositories = async (installationId) => {
    const token = await getInstallationToken(installationId);
    const repositories = [];
    for (let page = 1; page <= 100; page += 1) {
      const payload = await request(
        GITHUB_API_ORIGIN,
        `/installation/repositories?per_page=100&page=${page}`,
        { token }
      );
      const batch = Array.isArray(payload?.repositories) ? payload.repositories : [];
      repositories.push(...batch);
      if (batch.length < 100) break;
    }
    return repositories;
  };

  const listRepositoryPages = async (installationId, owner, repository, pathForPage) => {
    const token = await getInstallationToken(installationId);
    const safeOwner = encodeURIComponent(String(owner));
    const safeRepository = encodeURIComponent(String(repository));
    const items = [];
    for (let page = 1; page <= 5; page += 1) {
      const payload = await request(
        GITHUB_API_ORIGIN,
        `/repos/${safeOwner}/${safeRepository}${pathForPage(page)}`,
        { token }
      );
      const batch = Array.isArray(payload) ? payload : [];
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  };

  const listRepositoryCollectionPages = async (
    installationId,
    owner,
    repository,
    pathForPage,
    collectionKey
  ) => {
    const token = await getInstallationToken(installationId);
    const safeOwner = encodeURIComponent(String(owner));
    const safeRepository = encodeURIComponent(String(repository));
    const items = [];
    for (let page = 1; page <= 5; page += 1) {
      const payload = await request(
        GITHUB_API_ORIGIN,
        `/repos/${safeOwner}/${safeRepository}${pathForPage(page)}`,
        { token }
      );
      const batch = Array.isArray(payload?.[collectionKey]) ? payload[collectionKey] : [];
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  };

  const listRepositoryHistory = async (installationId, repository, since) => {
    const owner = repository.owner_login;
    const name = repository.name;
    const encodedSince = encodeURIComponent(since);
    const safeDefaultBranch = encodeURIComponent(String(repository.default_branch || "main"));
    const [commits, pullRequests, checkRuns, deployments, releases] = await Promise.all([
      listRepositoryPages(
        installationId,
        owner,
        name,
        (page) => `/commits?per_page=100&page=${page}&since=${encodedSince}`
      ),
      listRepositoryPages(
        installationId,
        owner,
        name,
        (page) => `/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`
      ),
      listRepositoryCollectionPages(
        installationId,
        owner,
        name,
        (page) => `/commits/${safeDefaultBranch}/check-runs?filter=all&per_page=100&page=${page}`,
        "check_runs"
      ),
      listRepositoryPages(
        installationId,
        owner,
        name,
        (page) => `/deployments?per_page=100&page=${page}`
      ),
      listRepositoryPages(
        installationId,
        owner,
        name,
        (page) => `/releases?per_page=100&page=${page}`
      )
    ]);
    return { commits, pullRequests, checkRuns, deployments, releases };
  };

  return {
    getInstallation,
    getRateLimitState: () => ({ ...rateLimitState }),
    listInstallationRepositories,
    listRepositoryHistory,
    verifyInstallationForUser
  };
};

module.exports = {
  GITHUB_API_ORIGIN,
  GITHUB_WEB_ORIGIN,
  createGithubServices
};
