import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource } from "./glossary";

// eslint-disable-next-line max-lines-per-function -- Groups related mutation fixtures.
describe("applyGlossaryChange edit flow", () => {
  test("adds a separator before two adjacent empty block comment markers during edit", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n  #   \n  #\t\n  - term: 'Beta'\n    definition: \"Second\"\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "First", term: "Alpha" },
      term: { definition: "Updated first", term: "Alpha" },
      type: "edit",
    });
    const expected =
      "terms:\n  - term: Alpha\n    definition: Updated first\n\n  #   \n  #\t\n  - term: 'Beta'\n    definition: \"Second\"\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated first", term: "Alpha" },
      { definition: "Second", term: "Beta" },
    ]);
  });

  test("preserves larger entry spacing in a flow sequence", () => {
    const source = "terms: [\n  { term: API, definition: Interface },\n\n\n  { term: HTTP, definition: Protocol }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Interface", term: "API" },
      term: { definition: "Updated", term: "API" },
      type: "edit",
    });

    expect(next).toBe(
      "terms:\n  [\n    { term: API, definition: Updated },\n\n\n    { term: HTTP, definition: Protocol }\n  ]\n",
    );
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated", term: "API" },
      { definition: "Protocol", term: "HTTP" },
    ]);
  });

  test("preserves flow gaps after an inline comment when editing before multiple comment paragraphs", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, # trailing\n\n  # Beta part one\n\n\n  # Beta part two\n\n  { term: 'Beta', definition: \"Second\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "First", term: "Alpha" },
      term: { definition: "Updated first", term: "Alpha" },
      type: "edit",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"Updated first\" }, # trailing\n\n    # Beta part one\n\n\n  # Beta part two\n\n    { term: 'Beta', definition: \"Second\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated first", term: "Alpha" },
      { definition: "Second", term: "Beta" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated second", term: "Beta" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace('definition: "Second"', 'definition: "Updated second"'));
  });

  test("keeps a bare inline flow comment inline while editing its owner", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, #\n\n  { term: 'Beta', definition: \"Second\" }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "First", term: "Alpha" },
      term: { definition: "Updated first", term: "Alpha" },
      type: "edit",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"Updated first\" }, #\n\n    { term: 'Beta', definition: \"Second\" }\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated first", term: "Alpha" },
      { definition: "Second", term: "Beta" },
    ]);
    expect(
      applyGlossaryChange(next, {
        original: parseGlossarySource(next)[0],
        term: parseGlossarySource(next)[0],
        type: "edit",
      }),
    ).toBe(next);
  });

  test.each([
    ["one space", "# ", "#"],
    ["several spaces", "#   ", "#   "],
    ["a tab", "#\t", "#\t"],
  ])(
    "preserves a standalone comment after a whitespace-bearing inline marker with %s during edit",
    (_label, sourceMarker, expectedMarker) => {
      const source = `terms: [\n  { term: 'Alpha', definition: "First" }, ${sourceMarker}\n\n  # Beta entry\n\n  { term: 'Beta', definition: "Second" }\n]\n`;
      const next = applyGlossaryChange(source, {
        original: { definition: "First", term: "Alpha" },
        term: { definition: "Updated first", term: "Alpha" },
        type: "edit",
      });
      const expected = `terms:\n  [\n    { term: 'Alpha', definition: "Updated first" }, ${expectedMarker}\n\n    # Beta entry\n\n    { term: 'Beta', definition: "Second" }\n  ]\n`;

      expect(next).toBe(expected);
      expect(parseGlossarySource(next)).toEqual([
        { definition: "Updated first", term: "Alpha" },
        { definition: "Second", term: "Beta" },
      ]);
    },
  );

  test("keeps a terminal space-bearing inline flow marker with its owner while editing", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last }, # \n\n  # tail empty\n\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First },\n\n    { term: Zulu, definition: Updated last } #\n  ]\n\n  # tail empty\n\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Updated last", term: "Zulu" },
    ]);
    expect(
      applyGlossaryChange(next, {
        original: parseGlossarySource(next)[1],
        term: parseGlossarySource(next)[1],
        type: "edit",
      }),
    ).toBe(next);
  });

  test.each([
    ["bare", "#", "#"],
    ["one space", "# ", "#"],
    ["several spaces", "#   ", "#   "],
    ["a tab", "#\t", "#\t"],
  ])("keeps a no-comma terminal flow marker with %s inline while editing", (_label, sourceMarker, expectedMarker) => {
    const source = `terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last } ${sourceMarker}\n\n  # tail text\n]\n`;
    const next = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    const expected = `terms:\n  [\n    { term: Alpha, definition: First },\n\n    { term: Zulu, definition: Updated last } ${expectedMarker}\n  ]\n\n  # tail text\n`;

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Updated last", term: "Zulu" },
    ]);
  });

  test("preserves a bare item comment and a distinct spaced terminal marker while editing", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last } #\n  , #   \n\n  # tail empty\n\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First },\n\n    { term: Zulu, definition: Updated last } #\n    , #   \n  ]\n\n  # tail empty\n\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Updated last", term: "Zulu" },
    ]);
  });

  test("preserves multiple distinct flow markers during an unrelated edit", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First } # alpha item\n  , #\n\n  { term: Beta, definition: Second } # beta item\n  , #   \n\n  { term: Zulu, definition: Last }\n]\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First } # alpha item\n    , #\n\n    { term: Beta, definition: Second } # beta item\n    , #   \n\n    { term: Zulu, definition: Updated last }\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
      { definition: "Updated last", term: "Zulu" },
    ]);
  });

  test("does not duplicate a CRLF inline marker with several trailing spaces while editing and repeating", () => {
    const source =
      "terms: [\r\n  { term: Alpha, definition: First }, #   \r\n\r\n  { term: Zulu, definition: Last }\r\n]\r\n";
    const edited = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated once", term: "Zulu" },
      type: "edit",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First }, #   \n\n    { term: Zulu, definition: Updated once }\n  ]\n";

    expect(edited).toBe(expected);
    expect(edited.match(/# {3}/g)).toHaveLength(1);
    expect(
      applyGlossaryChange(edited, {
        original: { definition: "Updated once", term: "Zulu" },
        term: { definition: "Updated twice", term: "Zulu" },
        type: "edit",
      }),
    ).toBe(expected.replace("Updated once", "Updated twice"));
  });

  test.each([
    ["comma", ", #"],
    ["no-comma", "#"],
  ])("keeps a %s terminal marker and zero-gap standalone tail through repeated edits", (_label, marker) => {
    const source = `terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last } ${marker}\n]\n# tail text\n`;
    const first = applyGlossaryChange(source, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated once", term: "Zulu" },
      type: "edit",
    });
    const expectedFirst =
      "terms:\n  [\n    { term: Alpha, definition: First },\n\n    { term: Zulu, definition: Updated once } #\n  ]\n# tail text\n";
    expect(first).toBe(expectedFirst);

    const second = applyGlossaryChange(first, {
      original: { definition: "Updated once", term: "Zulu" },
      term: { definition: "Updated twice", term: "Zulu" },
      type: "edit",
    });
    expect(second).toBe(expectedFirst.replace("Updated once", "Updated twice"));
    expect(parseGlossarySource(second)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Updated twice", term: "Zulu" },
    ]);
  });
});
