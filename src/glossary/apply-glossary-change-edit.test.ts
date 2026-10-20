import { describe, expect, test } from "vitest";

import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource, type GlossaryError } from "./glossary";

const expectGlossaryError = (action: () => unknown, code: GlossaryError["code"]): void => {
  expect(action).toThrowError(expect.objectContaining({ code }));
};

// eslint-disable-next-line max-lines-per-function -- Groups related mutation fixtures.
describe("applyGlossaryChange edit", () => {
  test.each(["", "\uFEFF"])("returns a loaded unchanged edit with source prefix %j byte-for-byte", (prefix) => {
    const source = `${prefix}terms:\n  - term: API\n    definition: Interface\n  - term: HTTP\n    definition: Protocol\n`;
    const original = parseGlossarySource(source)[0];

    expect(applyGlossaryChange(source, { original, term: { ...original }, type: "edit" })).toBe(source);
  });

  test("separates adjacent entries with an empty line after editing", () => {
    const source = "terms:\n  - term: API\n    definition: Old\n  - term: HTTP\n    definition: Protocol\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Old", term: "API" },
      term: { definition: "Updated", term: "API" },
      type: "edit",
    });

    expect(next).toBe("terms:\n  - term: API\n    definition: Updated\n\n  - term: HTTP\n    definition: Protocol\n");
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated", term: "API" },
      { definition: "Protocol", term: "HTTP" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated protocol", term: "HTTP" },
      type: "edit",
    });
    expect(repeated).toBe(next.replace("definition: Protocol", "definition: Updated protocol"));
  });

  test("renames the selected term without treating it as a duplicate of itself", () => {
    const original = { definition: "Old definition", term: "API" };
    const source = "terms:\n  - term: API\n    definition: Old definition\n";
    const term = { definition: "New definition\n", term: "api" };
    expect(parseGlossarySource(applyGlossaryChange(source, { original, term, type: "edit" }))).toEqual([term]);
  });

  test("updates the file-sequence entry rather than a sorted search-result position", () => {
    const source =
      "terms:\n  - term: Zulu\n    definition: First in file\n  - term: Alpha\n    definition: Second in file\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Second in file", term: "Alpha" },
      term: { definition: "Updated second", term: "Alpha" },
      type: "edit",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "First in file", term: "Zulu" },
      { definition: "Updated second", term: "Alpha" },
    ]);
  });

  test("preserves scalar comments and meaningful whitespace while editing scalar values", () => {
    const source =
      "# Root\nterms:\n  - term: API # Term comment\n    definition: Old # Definition comment\n  - term: Keep\n    definition: |\n      trailing newline stays\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Old", term: "API" },
      term: { definition: "  New value\nwith newline\n", term: "HTTP" },
      type: "edit",
    });

    expect(parseGlossarySource(next)).toEqual([
      { definition: "  New value\nwith newline\n", term: "HTTP" },
      { definition: "trailing newline stays\n", term: "Keep" },
    ]);
    expect(next).toContain("# Root");
    expect(next).toContain("# Term comment");
    expect(next).toContain("# Definition comment");
  });

  test("preserves larger entry spacing, comments, and blank lines inside multiline definitions", () => {
    const source =
      "# Root note\nterms:\n  - term: API\n    definition: |-\n      first line\n\n      third line\n\n\n  # HTTP entry\n  - term: HTTP\n    definition: Protocol\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "first line\n\nthird line", term: "API" },
      term: { definition: "first line\n\nthird line", term: "Application API" },
      type: "edit",
    });

    expect(next).toBe(source.replace("term: API", "term: Application API"));
    expect(parseGlossarySource(next)).toEqual([
      { definition: "first line\n\nthird line", term: "Application API" },
      { definition: "Protocol", term: "HTTP" },
    ]);
  });

  test("preserves blank lines after a comment attached before an entry", () => {
    const source =
      "terms:\n  - term: API\n    definition: Interface\n  # HTTP entry\n\n\n  - term: 'HTTP'\n    definition: \"Protocol\"\n";
    const next = applyGlossaryChange(source, {
      original: { definition: "Interface", term: "API" },
      term: { definition: "Updated", term: "API" },
      type: "edit",
    });

    expect(next).toBe(source.replace("definition: Interface", "definition: Updated"));
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated", term: "API" },
      { definition: "Protocol", term: "HTTP" },
    ]);

    const repeated = applyGlossaryChange(next, {
      original: parseGlossarySource(next)[1],
      term: { definition: "Updated protocol", term: "HTTP" },
      type: "edit",
    });
    expect(repeated).toBe(next.replace('definition: "Protocol"', 'definition: "Updated protocol"'));
  });

  test("allows renaming an entry to another entry's equivalent name", () => {
    const source = "terms:\n  - term: API\n    definition: Interface\n  - term: HTTP\n    definition: Protocol\n";
    const next = applyGlossaryChange(source, {
      original: parseGlossarySource(source)[0],
      term: { definition: "Updated", term: "http" },
      type: "edit",
    });
    expect(parseGlossarySource(next)).toEqual([
      { definition: "Updated", term: "http" },
      { definition: "Protocol", term: "HTTP" },
    ]);
  });

  // eslint-disable-next-line vitest/expect-expect
  test.each([
    ["a changed definition", { definition: "Changed elsewhere", term: "API" }],
    ["a changed exact name", { definition: "Interface", term: "api" }],
  ])("rejects an edit from a stale snapshot with %s", (_label, original) => {
    const source = "terms:\n  - term: API\n    definition: Interface\n";
    expectGlossaryError(
      () => applyGlossaryChange(source, { original, term: { definition: "Updated", term: "API" }, type: "edit" }),
      "stale-term",
    );
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects an edit when the selected entry was already removed", () => {
    expectGlossaryError(
      () =>
        applyGlossaryChange("terms: []\n", {
          original: { definition: "Interface", term: "API" },
          term: { definition: "Updated", term: "API" },
          type: "edit",
        }),
      "stale-term",
    );
  });

  // eslint-disable-next-line vitest/expect-expect
  test("validates a stale selection before recognizing an unchanged submitted edit", () => {
    expectGlossaryError(
      () =>
        applyGlossaryChange("terms:\n  - term: API\n    definition: Current\n", {
          original: { definition: "Stale", term: "API" },
          term: { definition: "Stale", term: "API" },
          type: "edit",
        }),
      "stale-term",
    );
  });
});
