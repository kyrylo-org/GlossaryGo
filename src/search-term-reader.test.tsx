// @vitest-environment jsdom
/// <reference lib="dom" />

import { mocks, names, search, reload, fieldValue } from "./search-term-test-session";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import Command from "./search-term";
import { raycastApiMocks } from "./test/raycast-api-stub";

// eslint-disable-next-line max-lines-per-function -- Shares an intentionally long Definition fixture across reader tests.
describe("definition reading from Search Term", () => {
  const definition = `# Markdown heading

**bold** and _italic_, with [an ordinary link](https://example.test/docs) and \`inline code\`.

- First item
- Second item

> A blockquote

\`\`\`
+---------+
| diagram |
+---------+
\`\`\`

![remote image](https://tracker.test/pixel)
![[obsidian-embed]]
<img src="https://tracker.test/pixel">
<iframe src="https://tracker.test/embed"></iframe>

\`![code image](https://example.test/unchanged) <img src="unchanged">\`

${Array.from({ length: 150 }, (_, index) => `Long prose line ${index + 1} with enough words to wrap in a reading view.`).join("\n")}
Last line`;

  beforeEach(() => {
    mocks.load.mockResolvedValue([
      { definition: "Wrong definition", term: "Zulu" },
      { definition, term: "Literal [Term]" },
    ]);
  });

  test("uses identical safe native Markdown in both reading views while preserving literal action values", async () => {
    render(<Command />);
    const selected = await screen.findByRole("article", { name: "Literal [Term]" });
    expect(screen.getByRole("main").dataset.showingDetail).toBe("true");
    expect(screen.queryAllByText("Glossary File")).toHaveLength(0);
    const preview = screen.getAllByTestId("preview")[0].textContent;
    expect(preview).toContain("# Markdown heading\n\n**bold** and _italic_");
    expect(preview).toContain("[an ordinary link](https://example.test/docs)");
    expect(preview).toContain("```\n+---------+\n| diagram |\n+---------+\n```");
    expect(preview).toContain("&#33;[remote image](https://tracker.test/pixel)");
    expect(preview).toContain("![[obsidian-embed]]");
    expect(preview).toContain("&#60;img src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#34;&#62;");
    expect(preview).toContain(
      "&#60;iframe src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;embed&#34;&#62;&#60;&#47;iframe&#62;",
    );
    expect(preview).toContain('`![code image](https://example.test/unchanged) <img src="unchanged">`');
    expect(preview).toContain("Long prose line 150 with enough words to wrap in a reading view.\nLast line");

    search("Literal");
    expect(screen.getByRole("main").dataset.selectedItemId).toBe(selected.dataset.entryId);
    fireEvent.click(within(selected).getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Literal [Term]" }).closest("section");
    if (!reader) {
      throw new Error("Missing full definition reader.");
    }
    expect(within(reader).getByText(/Markdown heading/).textContent).toBe(preview);
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith(definition));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const query = screen.getByRole("textbox", { name: "Search terms" });
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Literal");
    fireEvent.click(within(selected).getByRole("button", { name: "Edit Term" }));
    expect(fieldValue("term")).toBe("Literal [Term]");
    expect(fieldValue("definition")).toBe(definition);
  });

  test("opens the selected full definition with exact copy values and Reveal, retaining the query", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Literal [Term]" });
    search("Literal");
    const selected = screen.getByRole("article", { name: "Literal [Term]" });
    fireEvent.click(within(selected).getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Literal [Term]" }).closest("section");
    if (!reader) {
      throw new Error("Missing full definition reader.");
    }
    const content = within(reader).getByText(/Last line/).textContent;
    expect(content).toContain("Long prose line 150");
    expect(content).not.toContain("Wrong definition");
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith(definition));
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith("Literal [Term]"));
    fireEvent.click(within(reader).getByRole("button", { name: "Reveal Glossary in Finder" }));
    await waitFor(() => expect(raycastApiMocks.showInFinder).toHaveBeenCalledWith("/tmp"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("heading", { level: 1, name: "Literal [Term]" })).toBeNull();
    const query = screen.getByRole("textbox", { name: "Search terms" });
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Literal");
    expect(within(selected).getByRole("button", { name: "Reload Glossary" })).toBeTruthy();
  });
});

describe("full definition reader recency", () => {
  test.each(["Copy Definition", "Copy Term"])("records successful %s from the full reader", async (title) => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Zulu");
    fireEvent.click(screen.getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Zulu" }).closest("section");
    if (!reader) {
      throw new Error("Missing full definition reader.");
    }
    fireEvent.click(within(reader).getByRole("button", { name: title }));
    await waitFor(() => expect(raycastApiMocks.showToast).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    search("");
    expect(names()).toEqual(["Zulu", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]);
  });
});

describe("Search Term result details", () => {
  test("keeps literal term content and native Markdown definitions without exposing the glossary path", async () => {
    const definition = "Literal # heading\nA *definition* with `code`.\nRésumé.";
    mocks.load.mockResolvedValue([{ definition, term: "Résumé" }]);
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Résumé" }));

    expect(result.getByTestId("preview").textContent).toBe(definition);
    expect(result.queryByText("Glossary File")).toBeNull();
    expect(result.queryByText("/tmp/first.yaml")).toBeNull();
    expect(result.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Copy Definition",
      "Copy Term",
      "View Full Definition",
      "Add Term",
      "Edit Term",
      "Delete Term",
      "Reload Glossary",
      "Reveal Glossary in Finder",
    ]);

    fireEvent.click(result.getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith(definition));
    fireEvent.click(result.getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Résumé"));
    fireEvent.click(result.getByRole("button", { name: "Reveal Glossary in Finder" }));
    expect(raycastApiMocks.showInFinder).toHaveBeenCalledWith("/tmp");

    mocks.load.mockResolvedValue([{ definition: "Updated definition", term: "Résumé" }]);
    reload();
    expect(await screen.findByText(/Updated definition/)).toBeTruthy();
    expect(screen.queryByText("Glossary File")).toBeNull();
    expect(screen.queryByText("/tmp/first.yaml")).toBeNull();
  });
});
