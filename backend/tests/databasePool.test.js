const { spawnSync } = require("node:child_process");
const path = require("node:path");

describe("database pool resilience", () => {
  it("survives an idle connection error without exposing connection details", () => {
    // A child process proves the error cannot terminate the API process. No
    // connection or real database is needed to exercise pg's error event.
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `
          const pool = require("./src/config/db");
          pool.emit("error", new Error("secret database connection details"));
          pool.end().then(() => process.stdout.write("process_survived"));
        `
      ],
      { cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 10000 }
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("process_survived");
    expect(JSON.parse(result.stderr)).toEqual({
      level: "error",
      message: "database_idle_connection_error"
    });
    expect(result.stderr).not.toContain("secret database connection details");
  });
});
