import { ArrowLeft, FileUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { jiraImportApi, type JiraImportPreview } from "../api/jiraImport";
import type { LayoutContext } from "../components/AppLayout";

function JiraImport() {
  const projectId = Number(useParams().id);
  const { isDemo } = useOutletContext<LayoutContext>();
  const [siteUrl, setSiteUrl] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<JiraImportPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [imported, setImported] = useState<
    Array<{ sourceKey: string; issueKey: string; taskId: number }>
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePreview = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setImported([]);
    try {
      if (file.size > 100_000) throw new Error("Choose an export smaller than 100 KB.");
      const next = await jiraImportApi.preview(projectId, {
        siteUrl,
        jiraProjectKey: jiraProjectKey.trim().toUpperCase(),
        csv: await file.text()
      });
      setPreview(next);
      setSelected(
        next.issues.filter((issue) => !issue.alreadyImported).map((issue) => issue.sourceKey)
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to preview Jira issues."));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!preview || selected.length === 0 || !file) return;
    setBusy(true);
    setError("");
    try {
      const result = await jiraImportApi.apply(
        projectId,
        preview.previewId,
        selected,
        await file.text()
      );
      setImported(result.imported);
      setPreview(null);
      setSelected([]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to import Jira issues."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="workspace-page editorial-page jira-import-page">
      <header className="workspace-header editorial-page-header">
        <div>
          <span className="overline">Project / Jira import</span>
          <h1>Bring in Jira work.</h1>
          <p>Review a Jira Cloud CSV export before creating tickets. Nothing is changed in Jira.</p>
        </div>
        <Link className="button secondary" to="/projects">
          <ArrowLeft size={16} /> Projects
        </Link>
      </header>
      {isDemo ? (
        <p className="form-alert">Sign in to import into a real project.</p>
      ) : (
        <form className="jira-import-form" onSubmit={(event) => void handlePreview(event)}>
          <p>
            In Jira, open your project’s issue list and choose Export CSV (all fields). Export up to
            100 issues at a time.
          </p>
          <label>
            Jira site URL
            <input
              type="url"
              placeholder="https://team.atlassian.net"
              required
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
            />
          </label>
          <label>
            Jira project key
            <input
              placeholder="TEAM"
              required
              maxLength={20}
              value={jiraProjectKey}
              onChange={(event) => setJiraProjectKey(event.target.value)}
            />
          </label>
          <label>
            CSV export
            <input
              accept=".csv,text/csv"
              type="file"
              required
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setPreview(null);
              }}
            />
          </label>
          <button className="button primary" disabled={busy} type="submit">
            <FileUp size={16} /> Preview import
          </button>
        </form>
      )}
      {error && (
        <p className="form-alert error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <section className="jira-import-preview" aria-label="Jira import preview">
          <h2>Review {preview.issues.length} issues</h2>
          <p>
            Only selected, unmapped issues will be created. Existing Jira keys are skipped. Preview
            expires in 30 minutes.
          </p>
          <div className="jira-import-issues">
            {preview.issues.map((issue) => (
              <label key={issue.sourceKey}>
                <input
                  type="checkbox"
                  disabled={issue.alreadyImported || busy}
                  checked={selected.includes(issue.sourceKey)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, issue.sourceKey]
                        : current.filter((key) => key !== issue.sourceKey)
                    )
                  }
                />
                <span>
                  <strong>
                    {issue.sourceKey} · {issue.title}
                  </strong>
                  <small>
                    {issue.taskType} · {issue.status} · {issue.priority}
                    {issue.alreadyImported ? " · Already imported" : ""}
                  </small>
                  {issue.warnings.map((warning) => (
                    <small key={warning}>{warning}</small>
                  ))}
                </span>
              </label>
            ))}
          </div>
          <button
            className="button primary"
            type="button"
            disabled={busy || selected.length === 0}
            onClick={() => void handleImport()}
          >
            Import {selected.length} selected issues
          </button>
        </section>
      )}
      {imported.length > 0 && (
        <section className="jira-import-preview" aria-label="Import results">
          <h2>Imported {imported.length} issues</h2>
          <ul>
            {imported.map((item) => (
              <li key={item.sourceKey}>
                {item.sourceKey} → <Link to={`/tasks/${item.taskId}`}>{item.issueKey}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default JiraImport;
