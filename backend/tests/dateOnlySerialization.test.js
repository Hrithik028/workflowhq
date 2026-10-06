const { types } = require("pg");
require("../src/config/db");

describe("PostgreSQL calendar date serialization", () => {
  it.each(["2026-10-10", "2028-02-29", "2026-01-01", "2026-12-31"])(
    "preserves the date-only value %s without timezone conversion",
    (value) => {
      const parsed = types.getTypeParser(1082)(value);
      expect(parsed).toBe(value);
      expect(JSON.parse(JSON.stringify({ due_date: parsed })).due_date).toBe(value);
    }
  );

  it("retains timestamp parsing for actual instants", () => {
    const parsed = types.getTypeParser(1184)("2026-10-10 00:00:00+00");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });
});
