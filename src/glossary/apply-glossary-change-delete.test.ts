import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource, type GlossaryError } from "./glossary";

const expectGlossaryError = (action: () => unknown, code: GlossaryError["code"]): void => {
  expect(action).toThrowError(expect.objectContaining({ code }));
};

// eslint-disable-next-line max-lines-per-function -- Groups related mutation fixtures.
describe("applyGlossaryChange delete", () => {
  test("deleting from an unsorted sequence preserves the surviving order", () => {
    const source =
      "terms:\n  - term: Zulu\n    definition: Last\n  - term: Remove\n    definition: Removed\n  - term: Alpha\n    definition: First\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "Last", term: "Zulu" },
      { definition: "First", term: "Alpha" },
    ]);
  });

  test("separates adjacent surviving entries with an empty line after deleting", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n  - term: Remove\n    definition: Removed\n  - term: Zulu\n    definition: Last\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });

    expect(next).toBe("terms:\n  - term: Alpha\n    definition: First\n\n  - term: Zulu\n    definition: Last\n");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves external and embedded block gaps around empty comments during an unrelated delete", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n\n  #\n\n  # \n  - term: 'Beta'\n    definition: \"Second\"\n  - term: Remove\n    definition: Removed\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  - term: Alpha\n    definition: First\n\n  #\n\n  #\n  - term: 'Beta'\n    definition: \"Second\"\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
    ]);
  });

  test("preserves a larger entry gap when deleting the entry after it", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n\n\n  - term: Remove\n    definition: Removed\n  - term: Zulu\n    definition: Last\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });

    expect(next).toBe("terms:\n  - term: Alpha\n    definition: First\n\n\n  - term: Zulu\n    definition: Last\n");
  });

  test("transfers one external gap when deleting a middle block entry", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n\n  - term: Remove\n    definition: Removed\n  - term: 'Zulu'\n    definition: \"Last\"\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected = "terms:\n  - term: Alpha\n    definition: First\n\n  - term: 'Zulu'\n    definition: \"Last\"\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves a standalone comment after deleting its whitespace-bearing inline owner first", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed }, #\t\n\n  # Alpha entry\n\n  { term: 'Alpha', definition: \"First\" },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    # Alpha entry\n\n    { term: 'Alpha', definition: \"First\" },\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("#\t");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves a standalone comment after deleting its whitespace-bearing inline owner in the middle", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" },\n  { term: Remove, definition: Removed }, #   \n\n  # Zulu entry\n\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" },\n\n    # Zulu entry\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("#   ");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves named item and terminal comments during an unrelated delete", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed },\n  { term: Zulu, definition: Last } # item text\n  , # \n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected = "terms:\n  [\n    { term: Zulu, definition: Last } # item text\n    , #\n  ]\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([{ definition: "Last", term: "Zulu" }]);
  });

  test.each([
    ["one", "\n\n"],
    ["three", "\n\n\n\n"],
  ])("preserves three external gaps and %s embedded gap after deleting a bare-comment owner", (_label, embeddedGap) => {
    const source = `terms: [\n  { term: 'Alpha', definition: "First" },\n  { term: Remove, definition: Removed }, #\n\n\n\n  #${embeddedGap}  { term: 'Zulu', definition: "Last" }\n]\n`;
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected = `terms:\n  [\n    { term: 'Alpha', definition: "First" },\n\n\n\n    #${embeddedGap}    { term: 'Zulu', definition: "Last" }\n  ]\n`;

    expect(next).toBe(expected);
    expect(next).not.toContain("}, #");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    const repeatedExpected = expected.replace('definition: "Last"', 'definition: "Updated last"');
    expect(repeated).toBe(repeatedExpected);
    expect(
      applyGlossaryChange(repeated, {
        original: parseGlossarySource(repeated)[1],
        term: parseGlossarySource(repeated)[1],
        type: "edit",
      }),
    ).toBe(repeatedExpected);
  });

  test("transfers only external gaps when deleting a commented middle entry", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n\n\n  # remove part one\n\n\n  # remove part two\n\n\n  - term: 'Remove'\n    definition: \"Removed\"\n\n  # Zulu entry\n\n\n  - term: 'Zulu'\n    definition: \"Last\"\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  - term: Alpha\n    definition: First\n\n\n  # Zulu entry\n\n\n  - term: 'Zulu'\n    definition: \"Last\"\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("remove part");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace('definition: "Last"', 'definition: "Updated last"'));
  });

  test("preserves external and multi-paragraph comment gaps when deleting the first entry", () => {
    const source =
      "terms:\n  - term: Remove\n    definition: Removed\n\n\n  # alpha part one\n\n\n  # alpha part two\n\n\n  - term: 'Alpha'\n    definition: \"First\"\n  - term: Zulu\n    definition: Last\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  # alpha part one\n\n\n  # alpha part two\n\n\n  - term: 'Alpha'\n    definition: \"First\"\n\n\n  - term: Zulu\n    definition: Last\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace("definition: Last", "definition: Updated last"));
  });

  test("deleting the last term retains an empty glossary and glossary comments", () => {
    const original = { definition: "Example", term: "API" };
    const source = "# Glossary notes\nterms:\n  - term: API\n    definition: Example\n";
    const next = applyGlossaryChange(source, { original, type: "delete" });
    expect(parseGlossarySource(next)).toEqual([]);
    expect(next).toContain("terms: []");
    expect(next).toContain("# Glossary notes");
  });

  test("deleting the last term retains its sequence-owned leading comment", () => {
    const original = { definition: "Example", term: "API" };
    const source = "terms:\n  # Sequence-owned note above only entry\n  - term: API\n    definition: Example\n";
    const next = applyGlossaryChange(source, { original, type: "delete" });

    expect(parseGlossarySource(next)).toEqual([]);
    expect(next).toContain("# Sequence-owned note above only entry");
  });

  test("removes deleted entry comments while retaining root, sequence, and surviving comments", () => {
    const source =
      "# Root\nterms: # Sequence\n  # Sequence-owned note above first entry\n  - term: API # Remove term\n    definition: Interface # Remove definition\n  # Keep this entry\n  - term: HTTP # Keep term\n    definition: Protocol # Keep definition\n";
    const next = applyGlossaryChange(source, { original: { definition: "Interface", term: "API" }, type: "delete" });

    expect(parseGlossarySource(next)).toEqual([{ definition: "Protocol", term: "HTTP" }]);
    expect(next).toContain("# Root");
    expect(next).toContain("# Sequence");
    expect(next).toContain("# Sequence-owned note above first entry");
    expect(next).toContain("# Keep this entry");
    expect(next).toContain("# Keep term");
    expect(next).toContain("# Keep definition");
    expect(next).not.toContain("# Remove term");
    expect(next).not.toContain("# Remove definition");
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["a changed definition", { definition: "Changed elsewhere", term: "API" }],
    ["a changed exact name", { definition: "Interface", term: "api" }],
  ])("rejects a delete from a stale snapshot with %s", (_label, original) => {
    const source = "terms:\n  - term: API\n    definition: Interface\n";
    expectGlossaryError(() => applyGlossaryChange(source, { original, type: "delete" }), "stale-term");
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects a delete when the selected entry was already removed", () => {
    expectGlossaryError(
      () => applyGlossaryChange("terms: []\n", { original: { definition: "Interface", term: "API" }, type: "delete" }),
      "stale-term",
    );
  });
});
