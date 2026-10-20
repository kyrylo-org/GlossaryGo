import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource } from "./glossary";

// eslint-disable-next-line max-lines-per-function -- Groups related mutation fixtures.
describe("applyGlossaryChange add flow", () => {
  test("adds a separator before a block entry with an adjacent empty comment marker", () => {
    const source =
      "terms:\n  - term: Alpha\n    definition: First\n  # \n  - term: 'Beta'\n    definition: \"Second\"\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Last", term: "Zulu" },
      type: "add",
    });
    const expected =
      "terms:\n  - term: Alpha\n    definition: First\n\n  #\n  - term: 'Beta'\n    definition: \"Second\"\n\n  - definition: Last\n    term: Zulu\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves flow gaps after an inline comment when adding before one leading comment paragraph", () => {
    const source =
      "terms: [\n  { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n  # Beta\n  { term: 'Beta', definition: \"Second\" }\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Third", term: "Delta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" }, # trailing\n\n\n    # Beta\n    { term: 'Beta', definition: \"Second\" },\n\n    { definition: Third, term: Delta }\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
      { definition: "Third", term: "Delta" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[2],
      term: { definition: "Updated third", term: "Delta" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace("definition: Third", "definition: Updated third"));
  });

  test("transfers every blank-only flow gap when addition sorting promotes the following entry", () => {
    const source =
      "terms: [\n  { term: Zulu, definition: Last }, # trailing\n\n\n  { term: 'Alpha', definition: \"First\" }\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" },\n\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } # trailing\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated middle", term: "Beta" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace("definition: Middle", "definition: Updated middle"));
  });

  test("preserves an empty flow comment when addition sorting promotes its entry with no surrounding gaps", () => {
    const source =
      "terms: [\n  { term: Zulu, definition: Last }, # trailing\n  #\n  { term: 'Alpha', definition: \"First\" }\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    #\n    { term: 'Alpha', definition: \"First\" },\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } # trailing\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
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

  test("keeps a bare inline flow comment with its owner when addition sorting promotes the following entry", () => {
    const source =
      "terms: [\n  { term: Zulu, definition: Last }, #\n\n\n  { term: 'Alpha', definition: \"First\" }\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: 'Alpha', definition: \"First\" },\n\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } #\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated middle", term: "Beta" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace("definition: Middle", "definition: Updated middle"));
  });

  test("keeps a terminal bare inline flow marker with its owner while adding", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last }, #\n\n  # tail empty\n\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First },\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } #\n  ]\n\n  # tail empty\n\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("keeps a no-comma terminal bare flow marker inline while adding", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last } #\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First },\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } #\n  ]\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves an existing item comment and a distinct terminal marker while adding", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First },\n  { term: Zulu, definition: Last } # item text\n  , #\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First },\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } # item text\n    , #\n  ]\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves multiple source-owned flow markers while adding and repeating a mutation", () => {
    const source =
      "terms: [\n  { term: Alpha, definition: First } # alpha item\n  , #\n\n  { term: Beta, definition: Second } # beta item\n  , #\t\n\n  { term: Zulu, definition: Last }\n]\n";
    const added = applyGlossaryChange(source, {
      term: { definition: "Fourth", term: "Delta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First } # alpha item\n    , #\n\n    { term: Beta, definition: Second } # beta item\n    , #\t\n\n    { definition: Fourth, term: Delta },\n\n    { term: Zulu, definition: Last }\n  ]\n";

    expect(added).toBe(expected);
    const repeated = applyGlossaryChange(added, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace("definition: Last", "definition: Updated last"));
    expect(parseGlossarySource(repeated)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
      { definition: "Fourth", term: "Delta" },
      { definition: "Updated last", term: "Zulu" },
    ]);
  });

  test("does not duplicate a CRLF inline marker with one trailing space while adding and repeating", () => {
    const source =
      "terms: [\r\n  { term: Alpha, definition: First }, # \r\n\r\n  { term: Zulu, definition: Last }\r\n]\r\n";
    const added = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First }, #\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last }\n  ]\n";

    expect(added).toBe(expected);
    expect(added.match(/#(?:\n|$)/g)).toHaveLength(1);
    expect(
      applyGlossaryChange(added, {
        original: { definition: "Last", term: "Zulu" },
        term: { definition: "Updated last", term: "Zulu" },
        type: "edit",
      }),
    ).toBe(expected.replace("definition: Last", "definition: Updated last"));
  });
});
