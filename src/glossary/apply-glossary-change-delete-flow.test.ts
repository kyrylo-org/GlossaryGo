import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource } from "./glossary";

// eslint-disable-next-line max-lines-per-function -- Groups related mutation fixtures.
describe("applyGlossaryChange delete flow", () => {
  test.each([
    ["one", "\n\n"],
    ["several", "\n\n\n\n"],
  ])("transfers %s external gap when deleting a middle flow entry", (_label, gap) => {
    const source = `terms: [\n  { term: Alpha, definition: First },${gap}  { term: Remove, definition: Removed },\n  { term: Zulu, definition: Last }\n]\n`;
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected = `terms:\n  [\n    { term: Alpha, definition: First },${gap}    { term: Zulu, definition: Last }\n  ]\n`;

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

  test("preserves several flow gaps after an inline comment with no leading comment when deleting", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n\n  { term: 'Beta', definition: \"Second\" },\n  { term: Remove, definition: Removed }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n\n    { term: 'Beta', definition: \"Second\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated second", term: "Beta" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace('definition: "Second"', 'definition: "Updated second"'));
  });

  test("transfers every blank-only flow gap when deleting the first entry", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed }, # trailing\n\n\n\n  { term: 'Alpha', definition: \"First\" },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" },\n\n\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("# trailing");
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

  test("preserves two empty flow comments while transferring one external gap after deleting first", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed }, # trailing\n\n  #   \n  #\t\n\n  { term: 'Alpha', definition: \"First\" },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    #   \n  #\t\n\n    { term: 'Alpha', definition: \"First\" },\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("# trailing");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);

    expect(
      applyGlossaryChange(next, {
        original: parseGlossarySource(next)[0],
        term: parseGlossarySource(next)[0],
        type: "edit",
      }),
    ).toBe(next);
  });

  test("removes a bare inline flow comment with its owner while transferring gaps after deleting first", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed }, #\n\n\n  { term: 'Alpha', definition: \"First\" },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" },\n\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("#");
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

  test("transfers every blank-only flow gap when deleting a middle entry", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n\n\n  { term: Remove, definition: Removed },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

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
    expect(repeated).toBe(expected.replace('definition: "Last"', 'definition: "Updated last"'));
  });

  test("drops an empty flow comment and its embedded gaps while transferring three external gaps on middle delete", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n\n  #\n\n\n\n  { term: Remove, definition: Removed },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

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
    expect(repeated).toBe(expected.replace('definition: "Last"', 'definition: "Updated last"'));
  });

  test("preserves a surviving bare inline flow comment while transferring gaps on middle delete", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, #\n\n\n\n  { term: Remove, definition: Removed },\n  { term: 'Zulu', definition: \"Last\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" }, #\n\n\n\n    { term: 'Zulu', definition: \"Last\" }\n  ]\n";

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
    expect(repeated).toBe(expected.replace('definition: "Last"', 'definition: "Updated last"'));
  });

  test("removes a terminal spaces-bearing inline flow marker with its deleted owner", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last }, #   \n\n  # tail empty\n\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      type: "delete",
    });
    const expected = "terms: [ { term: Alpha, definition: First } ]\n\n  # tail empty\n\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("#   ");
    expect(parseGlossarySource(next)).toEqual([{ definition: "First", term: "Alpha" }]);
  });

  test("preserves a terminal tab-bearing inline flow marker during an unrelated delete", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed },\n  { term: Zulu, definition: Last }, #\t\n\n  # tail empty\n\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: Zulu, definition: Last } #\t\n  ]\n\n  # tail empty\n\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([{ definition: "Last", term: "Zulu" }]);
  });

  test("keeps a no-comma terminal tab marker inline during an unrelated delete", () => {
    const source =
      "terms: [\n  { term: Remove, definition: Removed },\n  { term: Zulu, definition: Last } #\t\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected = "terms:\n  [\n    { term: Zulu, definition: Last } #\t\n  ]\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([{ definition: "Last", term: "Zulu" }]);
  });

  test("preserves every surviving distinct flow marker during an unrelated delete", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First } # alpha item\n  , #\n\n  { term: Beta, definition: Second } # beta item\n  , #\t\n\n  { term: Remove, definition: Removed },\n  { term: Zulu, definition: Last }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First } # alpha item\n    , #\n\n    { term: Beta, definition: Second } # beta item\n    , #\t\n\n    { term: Zulu, definition: Last }\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("removes only the deleted owner's distinct flow marker", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First } # alpha item\n  , #\n\n  { term: Beta, definition: Second } # beta item\n  , #   \n\n  { term: Zulu, definition: Last }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Second", term: "Beta" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First } # alpha item\n    , #\n\n    { term: Zulu, definition: Last }\n  ]\n";

    expect(next).toBe(expected);
    expect(next).not.toContain("#   ");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("does not duplicate a CRLF inline tab marker when deleting its following entry and repeating", () => {
    const source =
      "terms: [\r\n  { term: Alpha, definition: First }, #\t\r\n\r\n  { term: Remove, definition: Removed },\r\n  { term: Zulu, definition: Last }\r\n]\r\n";
    const deleted = applyGlossaryChange(source, {
      original: { definition: "Removed", term: "Remove" },
      type: "delete",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First }, #\t\n\n    { term: Zulu, definition: Last }\n  ]\n";

    expect(deleted).toBe(expected);
    expect(deleted.match(/#\t/g)).toHaveLength(1);
    expect(
      applyGlossaryChange(deleted, {
        original: { definition: "Last", term: "Zulu" },
        term: { definition: "Updated last", term: "Zulu" },
        type: "edit",
      }),
    ).toBe(expected.replace("definition: Last", "definition: Updated last"));
  });
});
