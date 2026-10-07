# GlossaryGo

Search and update a private local YAML glossary in Raycast. **Search Term** finds prefixes; **Add Term** opens a reusable
form; **Quick Add Term** saves from root search; **Select Glossary File** activates an existing file;
**Reveal Glossary File** locates storage in Finder.

## Setup and file selection

Open **Select Glossary File** and use **Glossary File / Select File** to choose one existing `.yaml` or `.yml` file.
Any basename works, including `team-notes.yaml` and `vocabulary.yml`. The file is loaded and validated locally using the
normal glossary rules. **Use This Glossary** revalidates it and activates its exact path for Search Term, Add Term,
Quick Add Term, Ask Glossary, Reveal, and Open With the next time those commands open. Reopen an already-open command
to use a newly selected file.

Picking a file only previews validation. Canceling the picker, closing the command, invalid YAML, unsupported extensions,
missing files, and access errors keep the active glossary unchanged. Correct the file or choose another existing file;
activation reports success only after the selected path is saved. Selection never creates, copies, renames, formats, or
overwrites the selected file. Only its activated path is kept in Raycast's local extension storage; glossary contents,
validation previews, and drafts are never persisted there. Selection sends nothing over the network.

This replaces **Create Glossary File**. To create a glossary, make a YAML file with `terms: []` in your editor and select
it. The **Glossary File** preference selects an existing `.yaml` or `.yml` file for use until you activate a file with
**Select Glossary File**. Existing installations with a saved folder value remain compatible: the folder resolves to its
`glossary.yaml`, and a retained direct YAML file path stays direct. Without an activated file or preference, commands use
`glossary.yaml` in Raycast's extension support directory. The first valid Add Term or Quick Add Term can create that
missing file. Only default storage may create its support directory; custom parent folders must exist. Once a file is
activated, it takes precedence over the preference. Use **Select Glossary File** to switch files.
A missing or invalid active file produces recovery instead of silently falling back to another glossary.

macOS only. Existing files must be readable, contain one YAML document, and not exceed 5 MiB. Writes require a writable
ordinary file with exactly one filesystem link. Symbolic links and multiply hard-linked files support search and
selection only: replacement could change link semantics. Raycast may remove the default file and selected-path setting
on uninstall; choose a custom file for storage beyond installation.

## Glossary format

Root contains only `terms`: sequence of entries containing only `term` and `definition`.

```yaml
terms:
  - term: API
    definition: Application Programming Interface

  - term: ADR
    definition: |
      A short record of an architectural decision
      and the reasons behind it.
```

Editor validation: [GlossaryGo JSON Schema](glossary.schema.json).

Both fields require non-empty strings. Term cannot have surrounding whitespace. Multiline definitions retain content
when displayed and copied. Empty glossary is valid:

```yaml
terms: []
```

Entries may share identical, case-equivalent, or canonically equivalent names. Even identical name-and-definition
entries are allowed independently; loading and saving never merge them. The format stays limited to `term` and
`definition`, with no stored identifiers. No extra fields, anchors, aliases, merge keys, custom tags, or multiple documents. Ordinary mappings, sequences, comments, quoted strings, literal/folded multiline
strings are supported.

Successful Add, Edit, and Delete mutations separate adjacent top-level entries with at least one empty line. Existing
larger entry gaps and blank lines inside multiline definitions stay intact. Opening, searching, copying, and reloading
never reformat the Glossary File.

## Adding terms

Open **Add Term**. Enter **Term** and multiline **Definition**; choose **Save Term**. Saved names are trimmed.
Definitions require non-whitespace text; remaining content stays exact.

Every successful add sorts the complete stored terms sequence, including previously unsorted entries, by name.
File order uses locale-independent JavaScript ordinal string comparison: NFC-normalized lowercase names first,
then NFC-normalized original names, then original names to break ties. Exact-name ties retain sequence order, with a
new identical name after existing siblings. Accents remain distinct; ordering is identical
across locales. Existing YAML entries move with their attached comments and scalar styles; decoded definition content
stays exact. The same ordering applies to Add inside Search Term, standalone Add Term, and Quick Add Term.
Edit keeps the selected file position; Delete keeps surviving entries in their current order. Opening, searching,
reloading, canceling, and failed saves never sort or rewrite the file.

After save, **Term Added** keeps saved fields visible. **Add Another Term** opens pristine form focused on **Term**;
**Done** closes command. Failed saves retain both inputs and show actionable error. No saved drafts.
Form shows effective Glossary File path, **Reveal Glossary in Finder**, and **Open Glossary With…** when the file exists.

Standalone Add uses same safe save service and effective Glossary File as Search Term. Saved term appears when Search Term
next opens or after **Reload Glossary** in an open search.

## Quick adding terms

Open **Quick Add Term** from root search. Enter required inline **Term** and **Definition**; press Return.
No form opens. Names are trimmed; definitions retain entered content. Add Term field validation applies; same-name additions create independent entries.
**Term Added** appears only after successful save to effective file. Use **Add Term** for multiline definitions or
successive entries.

## Revealing the glossary file

Open **Reveal Glossary File** from Raycast root search to select the effective file in Finder. It uses the activated
path, retained legacy target, or default support file. It needs no search result and works with invalid YAML, an empty
glossary, or a blank file without reading or validating its contents.

If the file is missing, Finder reveals the nearest existing folder. A **Glossary File Is Missing** dialog offers
**Select Glossary File** or **Done**. Path and Finder failures provide the same recovery. Selecting another file requires
successful validation and explicit activation; Reveal itself never creates files or folders or changes the active path.

## Opening the glossary file in another app

**Open Glossary With…** uses Raycast's native installed-app picker for the exact effective Glossary File. It is available from
Search Term results, the full-definition reader, Add/Edit forms, empty and no-match views, and recoverable load-error
views when the file exists. The action also supports a retained direct `.yaml` or `.yml` preference and the default support
directory file. It does not appear while the file is missing; use Add Term to create it, Reveal to locate its folder,
or Select Glossary File to activate another existing file. Choosing an app does not change the search query or selected term.
GlossaryGo does not read, create, rewrite, or transmit the file as part of this action. The chosen app controls what
happens after it opens the file.

## Searching and actions

Search matches term-name prefixes only, never definitions. Query is trimmed; matching ignores case, preserves accents,
and treats canonically equivalent Unicode as equal. `a` matches `API`; `e` does not match `éclair`.

Matches sort case-insensitively, accent-sensitively, in locale-aware ascending order. Every match appears in Raycast's
native scrollable list. Same-name results remain separate. For identical or equivalent names, each row includes its
Glossary File entry position and a short definition preview, without changing the stored name. Equivalent-name sorting
ties retain Glossary File order. Unchanged reloads retain the selected sibling's identity.

Empty/whitespace queries show copied terms first, then every remaining term in alphabetical order; the section subtitle
is **Recent terms first** when current history is present. Successful **Copy Definition** or **Copy Term** records a term.
Typing and selection do not. Reuse moves only that entry first. Same-name siblings can each be recent independently.
History holds 20 entries; evicts least recently
used when full. Without valid history, every term appears alphabetically. Typed prefixes always sort alphabetically,
including never-copied terms.

History stays in memory during Search Term session; resets on command unmount or effective file path change.
An unchanged reload retains entry history. After file changes or add sorting, history follows an unambiguous equivalent
name and exact definition. A singleton name may retain history through a definition change or equivalent rename.
Missing entries, distinct renames, and ambiguous same-name siblings are pruned conservatively. Entries that previously
shared an equivalent name and identical definition lose history after any source change, because their identity cannot
be proved. Remaining entries still appear alphabetically. Missing file clears history; failed reload hides results
until recovery. Never persist history to
Glossary File, Raycast storage, logs, or network.

Split-pane preview and **View Full Definition** use the same display-only CommonMark presentation for definitions,
including headings, emphasis, lists, blockquotes, inline code, and fenced code. Fenced ASCII diagrams retain their
spacing and line breaks. Active CommonMark image syntax and raw HTML tags are shown inert outside code so the renderer
cannot fetch resources; `![[...]]` remains literal inert text because it is not a CommonMark image. Ordinary Markdown
links remain links and require user activation. Term names stay literal. **View Full
Definition** opens a full-width scrollable reader titled with term. Reader offers **Copy Definition**, **Copy Term**,
**Reveal Glossary in Finder**, and **Open Glossary With…** when the file exists. Copy Definition and Edit retain the exact original definition, including whitespace.
Successful copies in either view update Recent Terms. Go back to same query.

Selected-result action order: **Copy Definition**, **Copy Term**, **View Full Definition**, **Add Term**, **Edit Term**,
**Delete Term**, **Reload Glossary**, **Reveal Glossary in Finder**, **Open Glossary With…** when the file exists. Copy does not close command.

With a selected result, keyboard shortcuts appear beside actions: **View Full Definition** uses **⌘⇧V**, **Add Term** uses **⌘N**,
**Edit Term** uses **⌘E**, and **Delete Term** uses **⌃X**. **Return** still copies the definition; **⌘Return**
still copies the term. Shortcuts invoke the same actions, including Delete confirmation. **⌘N** remains available
in empty-glossary, missing-file, and no-match views; selection-only shortcuts require a result.

**Add Term** also appears in empty-glossary, missing-file, and no-match views. Those views have no Edit/Delete.
Add opens form inside Search Term; current query pre-fills name. Shared trimming and definition rules apply.
Successful add searches saved name and reloads.

**Edit Term** pre-fills selected result's actual fields, independent of query. Both fields are editable.
Success updates same file position, preserves field comments, searches normalized saved name, and reloads.
Rename to another entry’s identical, case-equivalent, or canonically equivalent name succeeds independently.
Only the captured entry changes, including among identical name-and-definition siblings.

**Delete Term** requires selected result. Confirmation names captured selection. Cancel writes nothing and does not
reload. Confirm removes only captured entry, shows **Term Deleted** after save, reloads with query unchanged.
Entry-owned comments leave with entry; document, sequence, surviving-entry comments remain.
Deleting last match shows no-match view with **Add Term**. Deleting last entry leaves valid empty glossary in same file.

Edit/Delete capture the selected entry and the source snapshot in memory. Any source change since selection, including
comments, sequence shifts, reordering, or byte-order-mark changes, causes safe conflict refusal; reload before retrying. Conflicted edit retains input and offers
user-triggered reload without query change. Conflicted delete reloads once; retry from current result.
Load errors expose only file recovery until valid. Missing-file view shows effective path plus Add Term, reload,
Reveal in Finder, and Select Glossary File for replacement.

After external edits, choose **Reload Glossary** to reread and validate. No automatic file watching.
Failed reload shows error and hides stale results.

Changes save only to effective file. First Add creates missing file exclusively with `0600` permissions;
default support directory uses `0700`. Later saves reread/validate latest source, write restricted sibling temporary
file, recheck selected file, then replace after write completes. Same-path saves in this process run sequentially.
Checks reduce overwrites but do not provide atomic compare-and-swap against external editors/processes or guarantee
crash durability on every filesystem. Avoid external edits during saves.

## Asking the glossary

**Ask Glossary** requires Raycast AI access. Both its **Question** form and **Send to Raycast AI?** confirmation explain:

> If processing proceeds, your question and every term and definition in the Glossary are sent to Raycast AI. Glossaries
> over the 32 KiB context limit are refused and not sent.

Opening the command and typing send nothing. The first non-empty submission in each command session asks for
confirmation. Choose **Send to Raycast AI** to continue or **Cancel** to return without sending. Confirmation applies
only to that open command session.

After confirmation, question validation, and an AI-access check, Ask Glossary resolves and loads the current effective
Glossary File for each submission, including retries. Opening, typing, cancelling disclosure, and unavailable AI access
do not resolve or load the file. Ask Glossary sends the trimmed
question with the complete decoded term-and-definition context, plus static grounding instructions, in one Raycast AI
request. It does not send file paths, YAML source, comments, preferences, or file metadata. The trimmed question is
limited to 2,000 JavaScript characters. The serialized context is limited to 32 KiB measured as UTF-8 bytes; when the complete
context exceeds that limit, Ask Glossary refuses the request rather than truncating, selecting, or summarizing terms.
An empty Glossary is reported locally without an AI request.

Answers are grounded in the supplied Glossary: they should name exact supporting terms or say when the Glossary
lacks sufficient information. After a failure, **Edit Question** restores exactly what you submitted so you can correct
an overlong question or retry after a file, access, or AI failure. Submitting again makes a new attempt without repeating
disclosure in the same open session. **Ask Another Question** explicitly starts a blank question form, including after
a failure. Questions, answers, and disclosure acknowledgement remain in command memory only and are not persisted.

Search Term, Add Term, Quick Add Term, Edit Term, Delete Term, Copy, Reload Glossary, and Reveal Glossary in Finder
retain their existing local-only behavior. Explicit copy actions place the selected value on the clipboard, and Reveal
opens the effective file or its nearest existing folder in Finder; Ask Glossary's AI request is the explicit exception
that transmits the question and bounded decoded Glossary context to Raycast AI.

## Testing

See [Testing GlossaryGo](TESTING.md) for Raycast setup, automated checks, manual acceptance plan.

## Privacy

Commands read only the effective Glossary File, except Select Glossary File reads a user-picked candidate for validation.
File contents and command input stay on device and in memory, except an explicitly confirmed Ask Glossary request as
described above. The activated file path is the only selection state persisted in Raycast local storage.

Search, Add, Edit, Delete, Select Glossary File, Copy, Reload, Reveal, and Open With do not send glossary content over a
network. Explicit valid first Add may create a missing effective file; later mutations use a restricted sibling
temporary copy. Normal failures remove files created by a failed Add, Edit, or Delete operation. A crash or cleanup
failure may leave an incomplete first file or temporary copy for manual recovery. Explicit copy actions put selected
content on the clipboard; Reveal opens the effective target in Finder.

## Troubleshooting

- **No file selected:** Use Select Glossary File for an existing YAML file, or Add Term for default storage.
- **Custom glossary cannot be created:** Ensure the selected folder still exists and is writable. Missing custom folders
  are not created.
- **Load fails:** Require the effective Glossary File to be readable, valid UTF-8, and at most 5 MiB. Use Select Glossary File to activate another existing file if needed.
- **Validation fails:** Require one document, only `terms` root, only non-empty `term`/`definition` per entry.
  Remove anchors, aliases, merge keys, custom tags. Same-name entries are valid.
- **No terms:** `terms: []` is valid. Otherwise fix validation error and **Reload Glossary**.
- **No matches:** Use term-name prefix; shorten/correct query. Definitions and middle-of-name text are not searched.
- **External edits missing:** Choose **Reload Glossary**. No automatic reload.
- **Add/Edit fails:** Correct form errors. Failure toast offers **Reload Glossary** for conflicts;
  otherwise **Select Glossary File** to choose an existing writable YAML file. Writes require an ordinary `.yaml` or
  `.yml` file with exactly one filesystem link.
- **Delete fails:** Resolve external edits; retry refreshed result. No writes to symbolic links, multiply hard-linked
  files, or stale selections.
