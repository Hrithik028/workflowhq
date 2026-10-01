import { Bot, CheckCircle2, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { aiCredentialsApi } from "../api/aiCredentials";
import { getErrorMessage } from "../api/client";
import type { LayoutContext } from "../components/AppLayout";
import type { AiCredentialStatus, AiProvider } from "../types";

const providers: Array<{ id: AiProvider; name: string; copy: string; placeholder: string }> = [
  {
    id: "openai",
    name: "OpenAI",
    copy: "Use your own OpenAI project key for task planning.",
    placeholder: "sk-proj-…"
  },
  {
    id: "anthropic",
    name: "Anthropic",
    copy: "Connect an Anthropic key for Claude models.",
    placeholder: "sk-ant-…"
  },
  {
    id: "google",
    name: "Google Gemini",
    copy: "Connect a Google AI Studio key for Gemini models.",
    placeholder: "AIza…"
  }
];

const emptyStatuses = providers.map(({ id }): AiCredentialStatus => ({
  provider: id,
  configured: false,
  maskedSuffix: null,
  keyVersion: null,
  createdAt: null,
  updatedAt: null
}));

function AiIntegrations() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const [statuses, setStatuses] = useState<AiCredentialStatus[]>(emptyStatuses);
  const [drafts, setDrafts] = useState<Record<AiProvider, string>>({
    openai: "",
    anthropic: "",
    google: ""
  });
  const [validated, setValidated] = useState<AiProvider | null>(null);
  const [busy, setBusy] = useState<AiProvider | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    aiCredentialsApi
      .list()
      .then((result) => active && setStatuses(result))
      .catch(
        (loadError) =>
          active && setError(getErrorMessage(loadError, "Unable to load AI integrations."))
      );
    return () => {
      active = false;
    };
  }, [isDemo]);

  const statusFor = (provider: AiProvider): AiCredentialStatus =>
    statuses.find((status) => status.provider === provider) || {
      provider,
      configured: false,
      maskedSuffix: null,
      keyVersion: null,
      createdAt: null,
      updatedAt: null
    };

  const run = async (provider: AiProvider, work: () => Promise<void>, success: string) => {
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "The provider credential could not be updated."));
    } finally {
      setBusy(null);
    }
  };

  const validate = (provider: AiProvider) => {
    const credential = drafts[provider].trim();
    if (!credential) return;
    void run(
      provider,
      async () => {
        await aiCredentialsApi.validate(provider, credential);
        setValidated(provider);
      },
      "Credential validated. Save it when you are ready."
    );
  };

  const save = (provider: AiProvider) => {
    const credential = drafts[provider].trim();
    const current = statusFor(provider);
    if (!credential) return;
    void run(
      provider,
      async () => {
        const saved = current.configured
          ? await aiCredentialsApi.replace(provider, credential)
          : await aiCredentialsApi.save(provider, credential);
        setStatuses((items) => items.map((item) => (item.provider === provider ? saved : item)));
        setDrafts((items) => ({ ...items, [provider]: "" }));
        setValidated(null);
      },
      current.configured ? "Credential replaced." : "Credential saved."
    );
  };

  const remove = (provider: AiProvider) => {
    if (!window.confirm("Remove this saved provider credential? AI planning will stop using it.")) {
      return;
    }
    void run(
      provider,
      async () => {
        await aiCredentialsApi.remove(provider);
        setStatuses((items) =>
          items.map((item) =>
            item.provider === provider
              ? { ...item, configured: false, maskedSuffix: null, keyVersion: null }
              : item
          )
        );
      },
      "Credential removed."
    );
  };

  return (
    <main className="workspace-page security-settings-page ai-integrations-page">
      <header className="engineering-page-header security-page-header">
        <div>
          <span className="overline">Settings / Personal integrations</span>
          <h1>AI provider credentials</h1>
          <p>
            Connect your own provider accounts without exposing their keys to the browser later.
          </p>
        </div>
        <Link className="button secondary" to="/settings">
          Rules &amp; access
        </Link>
      </header>

      {error ? <p className="admin-notice error">{error}</p> : null}
      {notice ? <p className="admin-notice success">{notice}</p> : null}
      <div className="ai-credential-safety">
        <ShieldCheck size={20} />
        <p>
          Credentials are encrypted server-side. Only the final four characters return to this page.
          Validation never saves the submitted key.
        </p>
      </div>

      <section className="ai-provider-grid">
        {providers.map((provider) => {
          const status = statusFor(provider.id);
          return (
            <article className="security-panel ai-provider-card" key={provider.id}>
              <header>
                <Bot size={24} />
                <div>
                  <span className="overline">Personal provider</span>
                  <h2>{provider.name}</h2>
                </div>
              </header>
              <p>{provider.copy}</p>
              <div className={`security-state ${status.configured ? "enabled" : ""}`}>
                {status.configured ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}
                {status.configured ? `Saved as ${status.maskedSuffix}` : "Not connected"}
              </div>
              <label>
                <span>{status.configured ? "Replacement credential" : "Provider credential"}</span>
                <input
                  aria-label={`${provider.name} credential`}
                  autoComplete="off"
                  disabled={isDemo}
                  placeholder={provider.placeholder}
                  type="password"
                  value={drafts[provider.id]}
                  onChange={(event) => {
                    setDrafts((items) => ({ ...items, [provider.id]: event.target.value }));
                    setValidated(null);
                  }}
                />
              </label>
              <div className="ai-provider-actions">
                <button
                  className="button secondary"
                  disabled={isDemo || busy !== null || drafts[provider.id].trim().length < 10}
                  type="button"
                  onClick={() => validate(provider.id)}
                >
                  <RefreshCw size={15} /> Validate only
                </button>
                <button
                  className="button primary"
                  disabled={isDemo || busy !== null || drafts[provider.id].trim().length < 10}
                  type="button"
                  onClick={() => save(provider.id)}
                >
                  <KeyRound size={15} /> {status.configured ? "Replace" : "Save"}
                </button>
                {status.configured ? (
                  <button
                    aria-label={`Remove ${provider.name} credential`}
                    className="icon-button"
                    disabled={isDemo || busy !== null}
                    type="button"
                    onClick={() => remove(provider.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
              {validated === provider.id ? (
                <small className="credential-validated">
                  Validated in this session; not saved yet.
                </small>
              ) : null}
            </article>
          );
        })}
      </section>
      {isDemo ? (
        <p className="form-alert notice">Credential controls are disabled in preview mode.</p>
      ) : null}
    </main>
  );
}

export default AiIntegrations;
