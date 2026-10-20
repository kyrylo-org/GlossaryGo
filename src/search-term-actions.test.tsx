// @vitest-environment jsdom
/// <reference lib="dom" />

import { mocks, terms, search, fieldValue } from "./search-term-test-session";
import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AI, confirmAlert } from "@raycast/api";
import { createTemporaryPath, writeGlossary } from "./glossary/glossary-test-utils";
import { GlossaryError } from "./glossary/glossary";
import Command from "./search-term";
import { raycastApiMocks } from "./test/raycast-api-stub";

describe("Open With preserves Glossary state", () => {
  test("does not change the Glossary File, query, selection, or invoke save or AI", async () => {
    mocks.path = await writeGlossary("terms:\n  - term: Alpha\n    definition: Synthetic definition\n", "custom.yaml");
    const before = await readFile(mocks.path);
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Alpha" }));
    search("Al");
    const selectedId = screen.getByRole("main").dataset.selectedItemId;

    fireEvent.click(result.getByRole("button", { name: "Open Glossary With…" }));

    const query = screen.getByRole("textbox", { name: "Search terms" });
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Al");
    expect(screen.getByRole("main").dataset.selectedItemId).toBe(selectedId);
    expect(await readFile(mocks.path)).toEqual(before);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(raycastApiMocks.copy).not.toHaveBeenCalled();
    expect(raycastApiMocks.showInFinder).not.toHaveBeenCalled();
    expect(AI.ask).not.toHaveBeenCalled();
  });
});

describe("Open With missing-file recovery", () => {
  test("keeps creation and recovery actions without offering Open With for a missing file", async () => {
    mocks.path = await createTemporaryPath("glossary.yaml");
    mocks.load.mockRejectedValue(new GlossaryError("missing", "Missing synthetic glossary."));
    render(<Command />);

    const missingView = (await screen.findByRole("heading", { name: "Create Your Glossary" })).closest("section");
    if (!missingView) {
      throw new Error("Missing Glossary recovery view.");
    }
    const actions = within(missingView);
    expect(actions.queryByRole("button", { name: "Open Glossary With…" })).toBeNull();
    expect(actions.getByRole("button", { name: "Add Term" })).toBeTruthy();
    expect(actions.getByRole("button", { name: "Reveal Glossary in Finder" })).toBeTruthy();
    expect(actions.getByRole("button", { name: "Select Glossary File" })).toBeTruthy();

    fireEvent.click(actions.getByRole("button", { name: "Reveal Glossary in Finder" }));
    await waitFor(() => expect(raycastApiMocks.showInFinder).toHaveBeenCalledWith(dirname(mocks.path)));
    fireEvent.click(actions.getByRole("button", { name: "Add Term" }));
    const addForm = screen.getByTestId("term").closest("section");
    expect(addForm && within(addForm).queryByRole("button", { name: "Open Glossary With…" })).toBeNull();
    await expect(stat(mocks.path)).rejects.toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("Open With across Search Term views", () => {
  test("offers the effective file from a result, full definition, and Add and Edit forms", async () => {
    mocks.path = await writeGlossary("terms: []\n", "custom.yaml");
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Alpha" }));
    expect(result.getByRole("button", { name: "Open Glossary With…" }).dataset.path).toBe(mocks.path);

    fireEvent.click(result.getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Alpha" }).closest("section");
    expect(reader && within(reader).getByRole("button", { name: "Open Glossary With…" }).dataset.path).toBe(mocks.path);

    fireEvent.click(result.getByRole("button", { name: "Add Term" }));
    const addForm = screen.getByTestId("term").closest("section");
    expect(addForm && within(addForm).getByRole("button", { name: "Open Glossary With…" }).dataset.path).toBe(
      mocks.path,
    );
    if (!addForm?.parentElement) {
      throw new Error("Missing Add Term action container.");
    }
    fireEvent.click(within(addForm.parentElement).getByRole("button", { name: "Back" }));

    fireEvent.click(result.getByRole("button", { name: "Edit Term" }));
    const editForm = screen.getByTestId("term").closest("section");
    expect(editForm && within(editForm).getByRole("button", { name: "Open Glossary With…" }).dataset.path).toBe(
      mocks.path,
    );
  });

  test.each([
    { load: "empty", query: "", title: "No Terms in Glossary" },
    { load: "ready", query: "none", title: "No Matching Terms" },
    { load: "error", query: "", title: "Glossary Could Not Be Loaded" },
  ])("offers Open With from $title when the file exists", async ({ load, query, title }) => {
    mocks.path = await writeGlossary("terms: []\n", "custom.yaml");
    if (load === "empty") {
      mocks.load.mockResolvedValue([]);
    } else if (load === "error") {
      mocks.load.mockRejectedValue(new GlossaryError("invalid-schema", "Synthetic error."));
    }
    render(<Command />);
    if (query) {
      await screen.findByRole("article", { name: "Alpha" });
      search(query);
    }
    const view = (await screen.findByRole("heading", { name: title })).closest("section");
    expect(view && within(view).getByRole("button", { name: "Open Glossary With…" }).dataset.path).toBe(mocks.path);
  });
});

describe("Search Term action shortcuts", () => {
  test("registers distinct shortcuts on selected actions and preserves default copy shortcuts", async () => {
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Alpha" }));
    expect(
      result
        .getAllByRole("button")
        .slice(0, 2)
        .map((button) => button.textContent),
    ).toEqual(["Copy Definition", "Copy Term"]);
    expect(result.getByRole("button", { name: "Copy Definition" }).dataset.shortcut).toBeUndefined();
    expect(result.getByRole("button", { name: "Copy Term" }).dataset.shortcut).toBeUndefined();
    const shortcuts = [
      ["View Full Definition", { key: "v", modifiers: ["cmd", "shift"] }],
      ["Add Term", { key: "n", modifiers: ["cmd"] }],
      ["Edit Term", { key: "e", modifiers: ["cmd"] }],
      ["Delete Term", { key: "x", modifiers: ["ctrl"] }],
    ] as const;
    for (const [title, shortcut] of shortcuts) {
      expect(JSON.parse(result.getByRole("button", { name: title }).dataset.shortcut ?? "null")).toEqual(shortcut);
    }
  });
});

describe("Add shortcut availability", () => {
  test.each([
    { hasSelection: true, query: "Al", view: "selected" },
    { hasSelection: false, query: "", view: "empty" },
    { hasSelection: false, query: "", view: "missing" },
    { hasSelection: false, query: "New term", view: "no-match" },
  ])("keeps Add's shortcut and form available in the $view view", async ({ hasSelection, query, view }) => {
    if (view === "empty") {
      mocks.load.mockResolvedValue([]);
    } else if (view === "missing") {
      mocks.load.mockRejectedValue(new GlossaryError("missing", "Missing synthetic glossary."));
    }
    render(<Command />);
    if (view === "no-match" || view === "selected") {
      await screen.findByRole("article", { name: "Alpha" });
      search(query);
    }
    const add = await screen.findByRole("button", { name: "Add Term" });
    expect(JSON.parse(add.dataset.shortcut ?? "null")).toEqual({ key: "n", modifiers: ["cmd"] });
    for (const name of ["Edit Term", "Delete Term", "View Full Definition"]) {
      expect(screen.queryAllByRole("button", { name })).toHaveLength(hasSelection ? 1 : 0);
    }
    fireEvent.click(add);
    expect(fieldValue("term")).toBe(query);
    expect(fieldValue("definition")).toBe("");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("Search Term mutation action wiring", () => {
  test("opens Edit with selected values rather than the partial query", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Al");
    fireEvent.click(screen.getByRole("button", { name: "Edit Term" }));
    expect(fieldValue("term")).toBe("Alpha");
    expect(fieldValue("definition")).toBe("Alpha definition");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  test("keeps Delete confirmation, cancels without a write, and confirms only the captured term", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Al");
    fireEvent.click(screen.getByRole("button", { name: "Delete Term" }));
    await waitFor(() => expect(confirmAlert).toHaveBeenCalledOnce());
    expect(confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        dismissAction: { style: "cancel", title: "Cancel" },
        message: expect.stringContaining("Alpha"),
        primaryAction: { style: "destructive", title: "Delete" },
      }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledOnce();
    const query = screen.getByRole("textbox", { name: "Search terms" });
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Al");
    vi.mocked(confirmAlert).mockResolvedValue(true);
    mocks.load.mockResolvedValue(terms.filter(({ term }) => term !== "Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Term" }));
    await screen.findByRole("heading", { name: "No Matching Terms" });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("/tmp/first.yaml", {
      original: { definition: "Alpha definition", term: "Alpha" },
      type: "delete",
    });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Al");
  });
});

describe("Search Term recovery actions", () => {
  test("offers only recovery actions after a load failure", async () => {
    mocks.load.mockRejectedValue(new Error("unreadable"));
    render(<Command />);
    await screen.findByRole("heading", { name: "Glossary Could Not Be Loaded" });
    expect(screen.queryByRole("button", { name: "Add Term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View Full Definition" })).toBeNull();
  });
});
