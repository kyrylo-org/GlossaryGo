import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource, type GlossaryError } from "./glossary";

const expectGlossaryError = (action: () => unknown, code: GlossaryError["code"]): void => {
  expect(action).toThrowError(expect.objectContaining({ code }));
};

// eslint-disable-next-line max-lines-per-function -- Groups related mutation fixtures.
describe("applyGlossaryChange add", () => {
  test("adds to an empty glossary without changing definition text", () => {
    const term = { definition: "  first line\nsecond line\n", term: "API" };
    const next = applyGlossaryChange("# My glossary\nterms: []\n", { term, type: "add" });
    expect(parseGlossarySource(next)).toEqual([term]);
    expect(next).toContain("# My glossary");
  });

  test.each([
    [
      "a block sequence",
      "terms:\n  - term: API\n    definition: Interface\n",
      [{ definition: "Interface", term: "API" }],
    ],
    [
      "a flow sequence",
      'terms: [{ definition: "Interface", term: "API" }]\n',
      [{ definition: "Interface", term: "API" }],
    ],
    [
      "quoted punctuation resembling YAML",
      'terms:\n  - term: "A: # []"\n    definition: "value: # []"\n',
      [{ definition: "value: # []", term: "A: # []" }],
    ],
    [
      "literal and folded definitions",
      "terms:\n  - term: Literal\n    definition: |\n      first line\n      second line\n  - term: Folded\n    definition: >\n      folded line\n      continues\n",
      [
        { definition: "folded line continues\n", term: "Folded" },
        { definition: "first line\nsecond line\n", term: "Literal" },
      ],
    ],
    ["a document end marker", "terms: []\n...\n", []],
    ["CRLF source", "terms: []\r\n", []],
    ["a source without a final newline", "terms: []", []],
  ])("adds while preserving decoded entries from %s", (_label, source, existingTerms) => {
    const next = applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" });
    expect(parseGlossarySource(next)).toEqual([...existingTerms, { definition: "New definition", term: "New" }]);
  });

  test("sorts the complete previously unsorted sequence with case-insensitive normalized ordinal names", () => {
    const names = ["Ωmega", "Zulu", "cafe\u0301", "Éclair", "beta", "Ångström", "cafe"];
    const source = `terms:\n${names.map((name) => `  - term: ${name}\n    definition: ${name} definition\n`).join("")}`;
    const next = applyGlossaryChange(source, {
      term: { definition: "Alpha definition", term: " Alpha " },
      type: "add",
    });

    expect(parseGlossarySource(next).map(({ term }) => term)).toEqual([
      "Alpha",
      "beta",
      "cafe",
      "cafe\u0301",
      "Zulu",
      "Ångström",
      "Éclair",
      "Ωmega",
    ]);
  });

  test("separates adjacent entries with an empty line after adding", () => {
    const source = "terms:\n  - term: Zulu\n    definition: Last\n  - term: Alpha\n    definition: First\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });

    expect(next).toBe(
      "terms:\n  - term: Alpha\n    definition: First\n\n  - definition: Middle\n    term: Beta\n\n  - term: Zulu\n    definition: Last\n",
    );
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves a larger entry gap when addition sorting moves it to the first entry", () => {
    const source = "terms:\n  - term: Zulu\n    definition: Last\n\n\n  - term: Alpha\n    definition: First\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });

    expect(next).toBe(
      "terms:\n  - term: Alpha\n    definition: First\n\n\n  - definition: Middle\n    term: Beta\n\n  - term: Zulu\n    definition: Last\n",
    );
  });

  test("preserves external and multi-paragraph comment gaps when addition sorting moves an entry first", () => {
    const source =
      "terms:\n  - term: Zulu\n    definition: Last\n\n\n  # alpha part one\n\n\n  # alpha part two\n\n\n  - term: 'Alpha'\n    definition: \"First\"\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  # alpha part one\n\n\n  # alpha part two\n\n\n  - term: 'Alpha'\n    definition: \"First\"\n\n\n  - definition: Middle\n    term: Beta\n\n  - term: Zulu\n    definition: Last\n";

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

  test("transfers a promoted entry's external gap across the next entry's attached comment", () => {
    const source =
      "terms:\n  - term: Zulu\n    definition: Last\n\n\n  - term: 'Alpha'\n    definition: \"First\"\n\n  # Beta entry\n\n\n  - term: 'Beta'\n    definition: \"Second\"\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Fourth", term: "Delta" },
      type: "add",
    });
    const expected =
      "terms:\n  - term: 'Alpha'\n    definition: \"First\"\n\n\n  # Beta entry\n\n\n  - term: 'Beta'\n    definition: \"Second\"\n\n  - definition: Fourth\n    term: Delta\n\n  - term: Zulu\n    definition: Last\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Second", term: "Beta" },
      { definition: "Fourth", term: "Delta" },
      { definition: "Last", term: "Zulu" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[2],
      term: { definition: "Updated fourth", term: "Delta" },
      type: "edit",
    });
    expect(repeated).toBe(expected.replace("definition: Fourth", "definition: Updated fourth"));
  });

  test("preserves a standalone comment after a whitespace-bearing inline owner during addition sorting", () => {
    const source =
      "terms: [\n  { term: Zulu, definition: Last }, # \n\n  # Alpha entry\n\n  { term: 'Alpha', definition: \"First\" }\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Middle", term: "Beta" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    # Alpha entry\n\n    { term: 'Alpha', definition: \"First\" },\n\n    { definition: Middle, term: Beta },\n\n    { term: Zulu, definition: Last } #\n  ]\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Middle", term: "Beta" },
      { definition: "Last", term: "Zulu" },
    ]);
  });

  test("preserves distinct item and terminal comments when addition moves the owner from the end", () => {
    const source = "terms: [\n  { term: Alpha, definition: First } # item text\n  , #\t\n\n  # tail text\n]\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "Last", term: "Zulu" },
      type: "add",
    });
    const expected =
      "terms:\n  [\n    { term: Alpha, definition: First } # item text\n    , #\t\n\n    { definition: Last, term: Zulu }\n  ]\n\n  # tail text\n";

    expect(next).toBe(expected);
    expect(parseGlossarySource(next)).toEqual([
      { definition: "First", term: "Alpha" },
      { definition: "Last", term: "Zulu" },
    ]);
    expect(
      applyGlossaryChange(next, {
        original: { definition: "Last", term: "Zulu" },
        term: { definition: "Updated last", term: "Zulu" },
        type: "edit",
      }),
    ).toBe(expected.replace("definition: Last", "definition: Updated last"));
    expect(
      applyGlossaryChange(next, {
        original: { definition: "Last", term: "Zulu" },
        term: { definition: "Last", term: "Zulu" },
        type: "edit",
      }),
    ).toBe(next);
  });

  test("does not accumulate entry gaps across successive mutations", () => {
    const added = applyGlossaryChange("terms:\n  - term: Alpha\n    definition: First\n", {
      term: { definition: "Last", term: "Zulu" },
      type: "add",
    });
    const edited = applyGlossaryChange(added, {
      original: { definition: "Last", term: "Zulu" },
      term: { definition: "Updated last", term: "Zulu" },
      type: "edit",
    });

    expect(edited).toBe(
      "terms:\n  - term: Alpha\n    definition: First\n\n  - definition: Updated last\n    term: Zulu\n",
    );
  });

  test("produces identical saved bytes from different entry orders", () => {
    const firstSource = "terms:\n  - term: Zulu\n    definition: Last\n  - term: Alpha\n    definition: First\n";
    const secondSource = "terms:\n  - term: Alpha\n    definition: First\n  - term: Zulu\n    definition: Last\n";
    const change = { term: { definition: "Middle", term: "beta" }, type: "add" } as const;

    expect(applyGlossaryChange(firstSource, change)).toBe(applyGlossaryChange(secondSource, change));
  });

  test("moves commented and styled YAML entries while preserving exact decoded definitions", () => {
    const source =
      "# Root note\nterms: # Sequence note\n  # Sequence leading note\n  - term: \"Zulu\" # Zulu term\n    definition: |+ # Zulu definition\n      last line\n\n  # Alpha entry\n  - term: 'Alpha' # Alpha term\n    definition: '  first: # []  ' # Alpha definition\n  # Folded entry\n  - term: Folded\n    definition: >-\n      folded line\n      continues\n";
    const next = applyGlossaryChange(source, {
      term: { definition: "  middle\nline\n", term: "beta" },
      type: "add",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "  first: # []  ", term: "Alpha" },
      { definition: "  middle\nline\n", term: "beta" },
      { definition: "folded line continues", term: "Folded" },
      { definition: "last line\n\n", term: "Zulu" },
    ]);
    expect(next).toContain("# Root note");
    expect(next).toContain("# Sequence note");
    expect(next).toContain("# Sequence leading note");
    expect(next).toContain("# Alpha entry\n  - term: 'Alpha' # Alpha term");
    expect(next).toContain("definition: '  first: # []  ' # Alpha definition");
    expect(next).toContain("# Folded entry\n  - term: Folded\n    definition: >-");
    expect(next).toContain('term: "Zulu" # Zulu term\n    definition: |+ # Zulu definition');
  });

  test("retains root and sequence comments when adding", () => {
    const source =
      "# Root note\nterms: # Sequence note\n  # Existing entry note\n  - term: API # Term note\n    definition: Interface # Definition note\n";
    const next = applyGlossaryChange(source, { term: { definition: "Hypertext", term: "HTML" }, type: "add" });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "Interface", term: "API" },
      { definition: "Hypertext", term: "HTML" },
    ]);
    expect(next).toContain("# Root note");
    expect(next).toContain("# Sequence note");
    expect(next).toContain("# Existing entry note");
    expect(next).toContain("# Term note");
    expect(next).toContain("# Definition note");
  });

  test("normalizes surrounding submitted term whitespace before adding", () => {
    const next = applyGlossaryChange("terms: []\n", {
      term: { definition: "Interface", term: "  API  " },
      type: "add",
    });

    expect(parseGlossarySource(next)).toEqual([{ definition: "Interface", term: "API" }]);
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["an empty submitted term", { definition: "Interface", term: "   " }],
    ["an empty submitted definition", { definition: " \n\t ", term: "API" }],
  ])("rejects %s before adding", (_label, term) => {
    expectGlossaryError(() => applyGlossaryChange("terms: []\n", { term, type: "add" }), "invalid-schema");
  });

  test("does not tighten existing whitespace-only definition validation while adding", () => {
    const source = 'terms:\n  - term: Existing\n    definition: "   "\n';
    const next = applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "   ", term: "Existing" },
      { definition: "New definition", term: "New" },
    ]);
  });

  test.each([
    ["API", "api"],
    ["café", "cafe\u0301"],
    ["API", "API"],
  ])("allows independent additions named %s and %s", (existing, submitted) => {
    const source = `terms:\n  - term: ${existing}\n    definition: Existing\n`;
    const next = applyGlossaryChange(source, { term: { definition: "Existing", term: submitted }, type: "add" });
    expect(parseGlossarySource(next)).toHaveLength(2);
  });

  test("allows accent-distinct terms when adding", () => {
    const source = "terms:\n  - term: cafe\n    definition: Plain\n";
    const next = applyGlossaryChange(source, { term: { definition: "Accented", term: "café" }, type: "add" });
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Plain", term: "cafe" },
      { definition: "Accented", term: "café" },
    ]);
  });

  test("rejects an empty source term before the add mutation", () => {
    const source = 'terms:\n  - term: ""\n    definition: Present definition\n';

    expect(() =>
      applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" }),
    ).toThrowError(expect.objectContaining({ code: "invalid-schema" }));
  });

  test("rejects an empty source definition before the add mutation", () => {
    const source = 'terms:\n  - term: Present\n    definition: ""\n';

    expect(() =>
      applyGlossaryChange(source, { term: { definition: "New definition", term: "New" }, type: "add" }),
    ).toThrowError(expect.objectContaining({ code: "invalid-schema" }));
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["malformed YAML", "terms: [}\n", "invalid-yaml"],
    ["an unsupported anchor", "terms: &terms []\n", "unsupported-yaml"],
  ])("validates %s before attempting an add", (_label, source, code) => {
    expectGlossaryError(
      () => applyGlossaryChange(source, { term: { definition: "Interface", term: "API" }, type: "add" }),
      code as GlossaryError["code"],
    );
  });
});
