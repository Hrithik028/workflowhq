export const parseDescriptionAcceptanceCriteria = (description: string): string[] => {
  const marker = /acceptance criteria\s*:/i.exec(description);
  if (!marker) return [];
  const tail = description.slice(marker.index + marker[0].length).trim();
  if (!tail || !/(^|\n)\s*[-*•]\s+|\s+-\s+/.test(tail)) return [];

  return Array.from(
    new Set(
      tail
        .split(/\r?\n\s*[-*•]\s*|\s+-\s+(?=[A-Z0-9])/)
        .map((item) => item.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 1000))
    )
  );
};
