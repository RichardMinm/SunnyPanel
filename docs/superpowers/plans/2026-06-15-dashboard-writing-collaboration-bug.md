# Dashboard Writing Collaboration Selection Bug

## Goal

Fix the Dashboard writing collaboration AI action so selected-text actions such as rewrite, polish, condense, expand, and summarize replace only the selected range in the rich-text editor instead of replacing the whole document body.

## Current Finding

`EditorBubbleMenu` currently sends only `action` and `selectedText` to `WritingEditorPane`. Because the parent does not have the Tiptap editor selection, `WritingEditorPane` handles selection AI output by rewriting `draft.contentRich.content` to a single paragraph containing the AI result. That can destroy the surrounding article content.

## Steps

1. Add a failing regression test in `tests/agent/writing-assist.test.ts`.
   - Assert the bubble menu exposes a selection replacement callback.
   - Assert it uses Tiptap `insertContentAt({ from, to }, ...)` for the captured range.
   - Assert `WritingEditorPane` applies AI selection output through that callback.
   - Assert selection AI handling no longer rebuilds the whole rich-text document as one paragraph.
   - Run `node --import tsx --test tests/agent/writing-assist.test.ts` and confirm it fails for the missing selection replacement behavior.

2. Update the editor AI selection contract.
   - Introduce a typed payload for selected AI actions containing `action`, `selectedText`, and `replaceSelection(result)`.
   - Make `EditorBubbleMenu` capture `{ from, to }` at click time and expose `replaceSelection`.
   - Thread the new payload type through `ContentEditor`.

3. Update `WritingEditorPane`.
   - Keep document-level actions unchanged.
   - For selected AI actions, call `runAssist` with `payload.selectedText`.
   - When the response arrives, call `payload.replaceSelection(response.result)` instead of replacing `draft.contentRich`.
   - Preserve tags and metadata updates.

4. Verify.
   - Run `node --import tsx --test tests/agent/writing-assist.test.ts`.
   - Run `npm run test:content`.
   - Run the available typecheck/build command if the repository exposes one.
