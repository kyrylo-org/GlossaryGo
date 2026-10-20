// @vitest-environment jsdom
/// <reference lib="dom" />

import { mocks, terms, names, search, copy, reload, fieldValue } from "./search-term-test-session";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { confirmAlert, getPreferenceValues } from "@raycast/api";
import { getEntryIdentity } from "./glossary/entry-identity";
import { parseGlossarySource } from "./glossary/glossary";
import { useGlossary } from "./hooks/use-glossary";
import * as SearchModule from "./hooks/search";
import Command from "./search-term";
import { raycastApiMocks } from "./test/raycast-api-stub";
import { prepareMarkdownForDisplay } from "./utils/prepare-markdown-for-display";
import type { Term } from "./utils/types";

const createDeferred = <Value,>(): Readonly<{
  promise: Promise<Value>;
  reject: (error: unknown) => void;
  resolve: (value: Value | PromiseLike<Value>) => void;
}> => Promise.withResolvers<Value>();

const ReloadHarness = ({ path }: Readonly<{ path: string }>): ReactElement => {
  const { reload: reloadGlossary, result, state } = useGlossary({ createParent: false, path });
  const triggerReload = (): void => {
    reloadGlossary().catch(() => null);
  };
  return (
    <>
      <button onClick={triggerReload}>Reload</button>
      <output data-testid="load-status">{state.status}</output>
      <output data-testid="loaded-terms">{result.terms.map(({ term }) => term).join(",")}</output>
    </>
  );
};

describe("Search Term reload cancellation", () => {
  test("cancels an obsolete reload and retains newer terms when it resolves late", async () => {
    const obsoleteLoad = createDeferred<readonly Term[]>();
    let obsoleteSignal: AbortSignal | undefined;
    const view = render(<ReloadHarness path="/tmp/first.yaml" />);
    await waitFor(() => expect(view.getByTestId("load-status").textContent).toBe("ready"));
    mocks.load
      .mockImplementationOnce((_path, signal) => {
        obsoleteSignal = signal;
        return obsoleteLoad.promise;
      })
      .mockResolvedValueOnce([{ definition: "New source", term: "Fresh" }]);

    fireEvent.click(view.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    fireEvent.click(view.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(obsoleteSignal?.aborted).toBe(true));

    await waitFor(() => expect(view.getByTestId("load-status").textContent).toBe("ready"));
    expect(view.getByTestId("loaded-terms").textContent).toBe("Fresh");
    obsoleteLoad.resolve([{ definition: "Stale source", term: "Stale" }]);
    await waitFor(() => expect(view.getByTestId("loaded-terms").textContent).toBe("Fresh"));
  });

  test("cancels outstanding loads when the command unmounts or its Glossary File changes", async () => {
    const signals: AbortSignal[] = [];
    const pendingLoad = Promise.withResolvers<readonly Term[]>();
    mocks.load.mockImplementation((_path, signal) => {
      if (!signal) {
        throw new TypeError("Expected a cancellation signal");
      }
      signals.push(signal);
      return pendingLoad.promise;
    });
    const view = render(<ReloadHarness path="/tmp/first.yaml" />);
    await waitFor(() => expect(signals).toHaveLength(1));

    view.rerender(<ReloadHarness path="/tmp/second.yaml" />);
    await waitFor(() => expect(signals[0].aborted).toBe(true));
    await waitFor(() => expect(signals).toHaveLength(2));

    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });
});

describe("Search Term post-save refresh", () => {
  test("reads the saved source during the post-save refresh", async () => {
    let source = terms;
    mocks.load.mockImplementation(() => Promise.resolve(source));
    mocks.save.mockImplementation((_path, change) => {
      if (change.type === "add") {
        source = [...source, change.term];
      }
      return Promise.resolve();
    });
    render(<Command />);
    const selected = await screen.findByRole("article", { name: "Alpha" });

    fireEvent.click(within(selected).getByRole("button", { name: "Add Term" }));
    fireEvent.change(screen.getByTestId("term"), { target: { value: "Fresh" } });
    fireEvent.change(screen.getByTestId("definition"), { target: { value: "New source" } });
    const form = screen.getByTestId("term").closest("section");
    if (form === null) {
      throw new TypeError("Expected Add Term form");
    }
    fireEvent.click(within(form).getByRole("button", { name: "Add Term" }));

    await screen.findByRole("article", { name: "Fresh" });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load.mock.calls[1][0]).toBe("/tmp/first.yaml");
  });
});

describe("Search Term recent history", () => {
  test("keeps typed matches cached when a successful copy updates recent history", async () => {
    const searchTerms = vi.spyOn(SearchModule, "searchTerms");
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("a");
    expect(names()).toEqual(["Alpha"]);
    const typedMatchCalls = searchTerms.mock.calls.filter(([, query]) => query === "a").length;

    fireEvent.click(screen.getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.showToast).toHaveBeenCalled());

    expect(searchTerms.mock.calls.filter(([, query]) => query === "a")).toHaveLength(typedMatchCalls);
    search("");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
  });

  test("records both successful copy actions, deduplicates repeats, and leaves typing alphabetical", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]));
    await copy("Bravo", "Copy Term");
    await waitFor(() => expect(names()).toEqual(["Bravo", "Zulu", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"]));
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Bravo", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"]));
    search("a");
    expect(names()).toEqual(["Alpha"]);
    search("");
    expect(names()).toEqual(["Zulu", "Bravo", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"]);
  });

  test("does not record a failed copy or passive search", async () => {
    raycastApiMocks.copy.mockRejectedValue(new Error("Clipboard unavailable"));
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Zulu");
    fireEvent.click(screen.getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Zulu"));
    search("");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
  });
});

describe("Search Term complete result list", () => {
  test("renders every broad-prefix match without an overflow message and copies the last definition", async () => {
    mocks.load.mockResolvedValue(
      ["A07", "A06", "A05", "A04", "A03", "A02", "A01"].map((term) => ({
        definition: `${term} original definition`,
        term,
      })),
    );
    render(<Command />);
    await screen.findByRole("article", { name: "A01" });
    search("a");

    expect(names()).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07"]);
    expect(screen.queryByText(/Showing 5 of/)).toBeNull();

    const last = within(screen.getByRole("article", { name: "A07" }));
    fireEvent.click(last.getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith("A07 original definition"));
  });

  test("formats a large result list once when its parent rerenders", async () => {
    mocks.load.mockResolvedValue(
      Array.from({ length: 200 }, (_, index) => ({
        definition: `Synthetic definition ${index + 1}`,
        term: `Term ${String(index + 1).padStart(3, "0")}`,
      })),
    );
    const view = render(<Command />);
    await screen.findByRole("article", { name: "Term 001" });
    expect(screen.getAllByTestId("result")).toHaveLength(200);
    expect(prepareMarkdownForDisplay).toHaveBeenCalledTimes(200);

    const selected = screen.getByRole("article", { name: "Term 200" });
    fireEvent.click(selected);
    await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(selected.dataset.entryId));
    view.rerender(<Command />);

    expect(prepareMarkdownForDisplay).toHaveBeenCalledTimes(200);
    expect(screen.getAllByTestId("result")).toHaveLength(200);
    expect(screen.getByRole("main").dataset.selectedItemId).toBe(selected.dataset.entryId);
  });
});

describe("Search Term history lifecycle", () => {
  test("prunes removed names on reload and does not resurrect history after re-adding", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    mocks.load.mockResolvedValue(terms.filter(({ term }) => term !== "Zulu"));
    reload();
    await waitFor(() => expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]));
    mocks.load.mockResolvedValue(terms);
    reload();
    await waitFor(() => expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]));
  });

  test("isolates history when the effective glossary changes and when the command reopens", async () => {
    const view = render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]));
    mocks.path = "/tmp/second.yaml";
    vi.mocked(getPreferenceValues).mockReturnValue({ glossaryFile: mocks.path });
    view.rerender(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
    await copy("Zulu");
    view.unmount();
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
  });

  test("hides history after a failed reload and refreshes definitions on recovery", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    mocks.load.mockRejectedValue(new Error("unreadable"));
    reload();
    await screen.findByRole("heading", { name: "Glossary Could Not Be Loaded" });
    expect(names()).toEqual([]);
    mocks.load.mockResolvedValue([{ definition: "Updated definition", term: "Zulu" }]);
    reload();
    expect(await screen.findByText(/Updated definition/)).toBeTruthy();
    expect(names()).toEqual(["Zulu"]);
  });
});

// Exercises the action graph on one captured sibling.
// eslint-disable-next-line max-lines-per-function
describe("same-name result identity and actions", () => {
  const source =
    "terms:\n  - term: API\n    definition: First definition\n  - term: API\n    definition: Second definition\n  - term: API\n    definition: Second definition\n";

  test("shows distinct stable IDs and definition context, and copies only the selected sibling", async () => {
    const entries = parseGlossarySource(source);
    mocks.load.mockResolvedValue(entries);
    render(<Command />);
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })).toHaveLength(3));
    const rows = screen.getAllByRole("article", { name: "API" });
    const ids = rows.map((row) => row.dataset.entryId);
    expect(new Set(ids).size).toBe(3);
    expect(within(rows[1]).getByTestId("subtitle").textContent).toContain("Entry 2 · Second definition");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Second definition"));
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })[0].dataset.entryId).toBe(ids[1]));
    expect(screen.getAllByRole("article", { name: "API" })).toHaveLength(3);
    mocks.load.mockResolvedValue(parseGlossarySource(source));
    reload();
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })[0].dataset.entryId).toBe(ids[1]));
    expect(new Set(screen.getAllByRole("article", { name: "API" }).map((row) => row.dataset.entryId))).toEqual(
      new Set(ids),
    );
  });

  test("wires full reader, Edit, and confirmed Delete to the captured sibling", async () => {
    const entries = parseGlossarySource(source);
    mocks.load.mockResolvedValue(entries);
    vi.mocked(confirmAlert).mockResolvedValue(true);
    render(<Command />);
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })).toHaveLength(3));
    const selected = within(screen.getAllByRole("article", { name: "API" })[2]);
    fireEvent.click(selected.getByRole("button", { name: "View Full Definition" }));
    expect(selected.getAllByText("Second definition", { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(selected.getAllByRole("button", { name: "Copy Term" })[1]);
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("API"));
    fireEvent.click(selected.getByRole("button", { name: "Edit Term" }));
    expect(fieldValue("definition")).toBe("Second definition");
    fireEvent.click(selected.getByRole("button", { name: "Update Term" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const edit = mocks.save.mock.calls[0][1];
    expect(edit.type).toBe("edit");
    if (edit.type !== "edit") {
      throw new TypeError("Expected edit change");
    }
    expect(getEntryIdentity(edit.original)?.index).toBe(2);
    mocks.save.mockClear();
    fireEvent.click(selected.getByRole("button", { name: "Delete Term" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const deletion = mocks.save.mock.calls[0][1];
    expect(deletion.type).toBe("delete");
    if (deletion.type !== "delete") {
      throw new TypeError("Expected delete change");
    }
    expect(getEntryIdentity(deletion.original)?.index).toBe(2);
  });
});

test("preserves a never-copied selected sibling through rows disappearing during unchanged reload", async () => {
  const source =
    "terms: [{ term: API, definition: First }, { term: API, definition: Second }, { term: api, definition: Lowercase }]\n";
  const entries = parseGlossarySource(source);
  mocks.load.mockResolvedValue(entries);
  render(<Command />);
  await screen.findByRole("article", { name: "api" });
  search("API");
  const selected = screen.getByRole("article", { name: "api" });
  fireEvent.click(selected);
  const id = selected.dataset.entryId;
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(id));
  let finishLoad: (loaded: readonly Term[]) => void = (): never => {
    throw new Error("Reload has not started");
  };
  // Hold the loader pending so native rows and selection disappear before recovery.
  // eslint-disable-next-line promise/avoid-new
  const pending = new Promise<readonly Term[]>((resolve) => {
    finishLoad = resolve;
  });
  mocks.load.mockReturnValueOnce(pending);
  fireEvent.click(within(selected).getByRole("button", { name: "Reload Glossary" }));
  await waitFor(() => expect(screen.queryAllByTestId("result")).toHaveLength(0));
  finishLoad(parseGlossarySource(source));
  await screen.findByRole("article", { name: "api" });
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(id));
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("API");
  expect(raycastApiMocks.copy).not.toHaveBeenCalled();
});

test("chooses a current entry after changed-source reload instead of reusing a stale sibling ID", async () => {
  const source = "terms: [{ term: API, definition: First }, { term: api, definition: Second }]\n";
  mocks.load.mockResolvedValue(parseGlossarySource(source));
  render(<Command />);
  const selected = await screen.findByRole("article", { name: "api" });
  fireEvent.click(selected);
  const oldId = selected.dataset.entryId;
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(oldId));
  mocks.load.mockResolvedValue(parseGlossarySource("terms: [{ term: API, definition: Current }]\n"));
  fireEvent.click(within(selected).getByRole("button", { name: "Reload Glossary" }));
  await waitFor(() => expect(screen.queryAllByTestId("result")).toHaveLength(1));
  const current = screen.getByRole("article", { name: "API" });
  expect(current.dataset.entryId).not.toBe(oldId);
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(current.dataset.entryId));
  expect(within(current).getByTestId("preview").textContent).toBe("Current");
});
