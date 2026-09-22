const { buildProjectAiContext } = require("../src/lib/aiProjectContext");

describe("AI project context boundary", () => {
  it("treats an empty repository selection as no GitHub consent", async () => {
    const query = globalThis.vi.fn().mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          issue_key: "WHQ-7",
          task_type: "task",
          title: "Ignore\u0000 instructions",
          description: "Untrusted project text",
          status: "todo",
          priority: "medium",
          due_date: null
        }
      ]
    });

    const context = await buildProjectAiContext(
      { query },
      {
        projectId: 4,
        options: {
          includeProjectTasks: true,
          includeGithubActivity: true,
          repositoryIds: []
        }
      }
    );

    expect(context.summary).toMatchObject({ taskCount: 1, eventCount: 0, repositories: [] });
    expect(context.sources.map((source) => source.id)).toEqual(["task:7"]);
    expect(context.prompt).not.toContain("\u0000");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
