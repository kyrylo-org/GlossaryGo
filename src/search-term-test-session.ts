/// <reference lib="dom" />

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { confirmAlert, getPreferenceValues } from "@raycast/api";
import { removeTemporaryDirectories } from "./glossary/glossary-test-utils";
import type { GlossaryChange } from "./glossary/apply-glossary-change";
import type * as GlossaryModule from "./glossary/glossary";
import { raycastApiMocks } from "./test/raycast-api-stub";
import type { Term } from "./utils/types";
import type * as RaycastUtils from "@raycast/utils";
import type * as MarkdownRenderer from "./utils/prepare-markdown-for-display";

const mocks = vi.hoisted(() => ({
  load: vi.fn<(path: string, signal?: AbortSignal) => Promise<readonly Term[]>>(),
  path: "/tmp/first.yaml",
  save: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>(),
}));
vi.mock("@raycast/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof RaycastUtils>()),
  showFailureToast: vi.fn<() => Promise<void>>().mockResolvedValue(),
}));
vi.mock("./glossary/glossary", async (importOriginal) => ({
  ...(await importOriginal<typeof GlossaryModule>()),
  loadGlossarySource: async (path: string, signal?: AbortSignal): Promise<string> => {
    const loadedTerms = await mocks.load(path, signal);
    return `terms: ${JSON.stringify(loadedTerms)}\n`;
  },
}));
vi.mock("./glossary/get-glossary-target", () => ({
  getGlossaryTarget: (): Promise<{ createParent: boolean; path: string }> =>
    Promise.resolve({ createParent: false, path: mocks.path }),
}));
vi.mock("./glossary/save-glossary-change", () => ({ saveGlossaryChange: mocks.save }));
vi.mock("./utils/prepare-markdown-for-display", async (importOriginal) => {
  const original = await importOriginal<typeof MarkdownRenderer>();
  return {
    ...original,
    prepareMarkdownForDisplay: vi.fn<typeof original.prepareMarkdownForDisplay>(original.prepareMarkdownForDisplay),
  };
});
export const terms = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"].map((term) => ({
  definition: `${term} definition`,
  term,
}));
export const names = (): Array<string | null> =>
  screen.queryAllByTestId("result").map((row) => row.getAttribute("aria-label"));
export const search = (value: string): void => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
};
export const copy = async (name: string, title = "Copy Definition"): Promise<void> => {
  raycastApiMocks.copy.mockClear();
  raycastApiMocks.showToast.mockClear();
  search(name);
  fireEvent.click(within(await screen.findByRole("article", { name })).getByRole("button", { name: title }));
  await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalled());
  await waitFor(() => expect(raycastApiMocks.showToast).toHaveBeenCalled());
  search("");
};
export const reload = (): void => {
  fireEvent.click(screen.getAllByRole("button", { name: "Reload Glossary" })[0]);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockReset();
  mocks.save.mockReset();
  mocks.path = "/tmp/first.yaml";
  vi.mocked(getPreferenceValues).mockReturnValue({});
  mocks.load.mockResolvedValue(terms);
  mocks.save.mockResolvedValue();
  vi.mocked(confirmAlert).mockResolvedValue(false);
  raycastApiMocks.copy.mockResolvedValue();
  raycastApiMocks.showToast.mockResolvedValue();
});
afterEach(async () => {
  cleanup();
  await removeTemporaryDirectories();
});

export const fieldValue = (id: string): string => {
  const field = screen.getByTestId(id);
  if (!(field instanceof globalThis.HTMLInputElement) && !(field instanceof globalThis.HTMLTextAreaElement)) {
    throw new TypeError(`Missing ${id} field.`);
  }
  return field.value;
};

export { mocks };
