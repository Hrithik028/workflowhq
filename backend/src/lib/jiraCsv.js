const { AppError } = require("./errors");

const MAX_ISSUES = 100;
const MAX_BYTES = 100_000;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseRows = (csv) => {
  if (Buffer.byteLength(csv, "utf8") > MAX_BYTES) {
    throw new AppError(413, "JIRA_IMPORT_TOO_LARGE", "Choose a Jira export smaller than 100 KB.");
  }
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (quoted || field === "") {
        quoted = !quoted;
      } else {
        throw new AppError(400, "JIRA_CSV_INVALID", "The Jira CSV has an invalid quote.");
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      if (rows.length > MAX_ISSUES + 1) {
        throw new AppError(
          413,
          "JIRA_IMPORT_TOO_LARGE",
          "Import at most 100 Jira issues at a time."
        );
      }
    } else {
      field += char;
    }
  }
  if (quoted) throw new AppError(400, "JIRA_CSV_INVALID", "The Jira CSV has an unclosed quote.");
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
};

const normalizeHeader = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseJiraCsv = (csv, jiraProjectKey) => {
  if (!/^[A-Z][A-Z0-9]{1,19}$/.test(jiraProjectKey)) {
    throw new AppError(400, "JIRA_CSV_KEY", "Provide a valid Jira project key.");
  }
  const issueKeyPattern = new RegExp(`^${escapeRegExp(jiraProjectKey)}-[1-9][0-9]*$`);
  const rows = parseRows(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new AppError(
      400,
      "JIRA_CSV_EMPTY",
      "The Jira export needs a header and at least one issue."
    );
  }
  const headers = rows[0].map(normalizeHeader);
  const column = (...names) =>
    names.map((name) => headers.indexOf(name)).find((index) => index >= 0);
  const keyIndex = column("issuekey", "key");
  const titleIndex = column("summary", "title");
  if (keyIndex == null || titleIndex == null) {
    throw new AppError(400, "JIRA_CSV_COLUMNS", "The export needs Issue key and Summary columns.");
  }
  const descriptionIndex = column("description");
  const statusIndex = column("status");
  const priorityIndex = column("priority");
  const typeIndex = column("issuetype", "worktype", "type");
  const dueIndex = column("duedate", "due");
  const seen = new Set();
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new AppError(
        400,
        "JIRA_CSV_INVALID",
        `CSV row ${index + 2} has the wrong number of columns.`
      );
    }
    const sourceKey = cells[keyIndex].trim().toUpperCase();
    const title = cells[titleIndex].trim();
    if (!issueKeyPattern.test(sourceKey) || seen.has(sourceKey)) {
      throw new AppError(
        400,
        "JIRA_CSV_KEY",
        `CSV row ${index + 2} has a duplicate or unexpected Jira key.`
      );
    }
    if (!title || title.length > 200) {
      throw new AppError(
        400,
        "JIRA_CSV_TITLE",
        `CSV row ${index + 2} needs a summary under 200 characters.`
      );
    }
    seen.add(sourceKey);
    const rawStatus = (statusIndex == null ? "" : cells[statusIndex]).trim().toLowerCase();
    const rawPriority = (priorityIndex == null ? "" : cells[priorityIndex]).trim().toLowerCase();
    const rawType = (typeIndex == null ? "" : cells[typeIndex]).trim().toLowerCase();
    const rawDue = (dueIndex == null ? "" : cells[dueIndex]).trim();
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;
    return {
      sourceKey,
      title,
      description: (descriptionIndex == null ? "" : cells[descriptionIndex]).trim().slice(0, 5000),
      status: /\b(done|closed|resolved|released|completed)\b/.test(rawStatus)
        ? "completed"
        : /progress|review|develop|testing/.test(rawStatus)
          ? "in_progress"
          : "todo",
      priority: /highest|high|critical|blocker/.test(rawPriority)
        ? "high"
        : /lowest|low|minor/.test(rawPriority)
          ? "low"
          : "medium",
      taskType: ["initiative", "epic", "story", "task", "bug", "subtask"].includes(rawType)
        ? rawType
        : "task",
      dueDate,
      warnings: rawDue && !dueDate ? ["Due date was not in YYYY-MM-DD format and was omitted."] : []
    };
  });
};

module.exports = { MAX_ISSUES, parseJiraCsv };
