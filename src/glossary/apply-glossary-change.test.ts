import { describe, expect, test } from "vitest";

import { MAXIMUM_GLOSSARY_BYTES } from "../constants";
import { applyGlossaryChange } from "./apply-glossary-change";
import { parseGlossarySource, type GlossaryError } from "./glossary";

const expectGlossaryError = (action: () => unknown, code: GlossaryError["code"]): void => {
  expect(action).toThrowError(expect.objectContaining({ code }));
};

describe("applyGlossaryChange serialized size", () => {
  test("accepts a serialized add exactly at the UTF-8 byte limit", () => {
    const serializedWithoutComment = "# \nterms:\n  - term: x\n    definition: y\n\n";
    const comment = "x".repeat(MAXIMUM_GLOSSARY_BYTES - Buffer.byteLength(serializedWithoutComment, "utf8"));
    const next = applyGlossaryChange(`# ${comment}\nterms: []\n`, {
      term: { definition: "y", term: "x" },
      type: "add",
    });

    expect(Buffer.byteLength(next, "utf8")).toBe(MAXIMUM_GLOSSARY_BYTES);
    expect(parseGlossarySource(next)).toEqual([{ definition: "y", term: "x" }]);
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects a multibyte serialized add beyond the UTF-8 byte limit", () => {
    const serializedWithoutComment = "# \nterms:\n  - term: x\n    definition: y\n\n";
    const neededBytes = MAXIMUM_GLOSSARY_BYTES - Buffer.byteLength(serializedWithoutComment, "utf8") + 1;
    const comment = "é".repeat(Math.ceil(neededBytes / Buffer.byteLength("é", "utf8")));

    expectGlossaryError(
      () => applyGlossaryChange(`# ${comment}\nterms: []\n`, { term: { definition: "y", term: "x" }, type: "add" }),
      "too-large",
    );
  });

  // eslint-disable-next-line vitest/expect-expect
  test("rejects an edit when inserted entry separators alone exceed the UTF-8 byte limit", () => {
    const fixedSource = "# \nterms:\n  - term: Alpha\n    definition: First\n  - term: Zulu\n    definition: Last\n";
    const comment = "x".repeat(MAXIMUM_GLOSSARY_BYTES - Buffer.byteLength(fixedSource, "utf8"));
    const source = `# ${comment}\nterms:\n  - term: Alpha\n    definition: First\n  - term: Zulu\n    definition: Last\n`;

    expectGlossaryError(
      () =>
        applyGlossaryChange(source, {
          original: { definition: "First", term: "Alpha" },
          term: { definition: "Other", term: "Alpha" },
          type: "edit",
        }),
      "too-large",
    );
  });
});

test("preserves every larger gap in a many-entry glossary", () => {
  const source = `terms:\n${Array.from(
    { length: 400 },
    (_, index) => `  - term: Term ${String(index).padStart(3, "0")}\n    definition: Definition ${index}\n\n\n`,
  ).join("")}`;
  const next = applyGlossaryChange(source, {
    original: { definition: "Definition 0", term: "Term 000" },
    term: { definition: "Updated definition", term: "Term 000" },
    type: "edit",
  });

  expect(next.match(/\n\n\n {2}- term:/g)).toHaveLength(399);
  expect(parseGlossarySource(next)).toHaveLength(400);
});

const duplicateSource =
  "terms:\n  - term: API # first\n    definition: Same\n  - term: API # second\n    definition: Same\n";

describe("captured duplicate entry identity", () => {
  test("edits and deletes only the selected identical sibling", () => {
    const selected = parseGlossarySource(duplicateSource)[1];
    const edited = applyGlossaryChange(duplicateSource, {
      original: selected,
      term: { definition: "Second updated", term: "API" },
      type: "edit",
    });
    expect(parseGlossarySource(edited)).toEqual([
      { definition: "Same", term: "API" },
      { definition: "Second updated", term: "API" },
    ]);
    expect(edited).toContain("# first");
    expect(edited).toContain("# second");
    const deleted = applyGlossaryChange(duplicateSource, { original: selected, type: "delete" });
    expect(parseGlossarySource(deleted)).toEqual([{ definition: "Same", term: "API" }]);
    expect(deleted).toContain("# first");
    expect(deleted).not.toContain("# second");
  });

  test.each(["# external comment\n", "terms: []\n"])(
    "refuses a captured duplicate after a source change: %s",
    (replacement) => {
      const selected = parseGlossarySource(duplicateSource)[1];
      const changed = replacement.startsWith("#") ? replacement + duplicateSource : replacement;
      expect(() => applyGlossaryChange(changed, { original: selected, type: "delete" })).toThrowError(
        expect.objectContaining({ code: "stale-term" }),
      );
    },
  );

  test("refuses ambiguous selection without captured source identity", () => {
    expect(() =>
      applyGlossaryChange(duplicateSource, { original: { definition: "Same", term: "API" }, type: "delete" }),
    ).toThrowError(expect.objectContaining({ code: "stale-term" }));
  });
});

test("refuses captured selection after insertion, reordering, or add sorting changes positions", () => {
  const source =
    "terms:\n  - term: Zulu\n    definition: Last\n  - term: API # first\n    definition: Same\n  - term: API # second\n    definition: Same\n";
  const selected = parseGlossarySource(source)[2];
  const shifted = source.replace("terms:\n", "terms:\n  - term: AAA\n    definition: Inserted\n");
  const reordered = source
    .replace("# first", "# placeholder")
    .replace("# second", "# first")
    .replace("# placeholder", "# second");
  const sorted = applyGlossaryChange(source, { term: { definition: "New", term: "BBB" }, type: "add" });
  for (const changed of [shifted, reordered, sorted]) {
    expect(() => applyGlossaryChange(changed, { original: selected, type: "delete" })).toThrowError(
      expect.objectContaining({ code: "stale-term" }),
    );
    expect(() =>
      applyGlossaryChange(changed, { original: selected, term: { definition: "Updated", term: "API" }, type: "edit" }),
    ).toThrowError(expect.objectContaining({ code: "stale-term" }));
  }
});

test("keeps same-name ties in their original order during deterministic add sorting", () => {
  const source =
    "terms:\n  - term: Zulu\n    definition: Last\n  - term: API # first\n    definition: First\n  - term: API # second\n    definition: Second\n";
  const next = applyGlossaryChange(source, { term: { definition: "Third", term: "API" }, type: "add" });
  expect(parseGlossarySource(next).map(({ definition }) => definition)).toEqual(["First", "Second", "Third", "Last"]);
  expect(next.indexOf("# first")).toBeLessThan(next.indexOf("# second"));
});
