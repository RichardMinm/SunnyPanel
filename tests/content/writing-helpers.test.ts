import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  parsePatchContentRich,
  parseRelationshipId,
} from "../../src/lib/dashboard/content/patch-validation";
import { isRichContentDocument } from "../../src/lib/rich-content/validate";
import { createEmptyRichDocument } from "../../src/lib/rich-content/defaults";
import {
  getWorkflowActionDescription,
  runWritingWorkflowAction,
} from "../../src/lib/dashboard/writing-workflow-actions";
import { formatWritingSaveStatusLabel } from "../../src/lib/dashboard/writing-save-status";
import { countWritingWords, extractRichText } from "../../src/lib/dashboard/writing-text-stats";

describe("dashboard content patch validation", () => {
  test("parsePatchContentRich rejects invalid documents", () => {
    assert.equal(parsePatchContentRich(null).ok, false);
    assert.equal(parsePatchContentRich({ type: "paragraph" }).ok, false);
    assert.equal(parsePatchContentRich(undefined).ok, false);
  });

  test("parsePatchContentRich accepts valid rich documents", () => {
    const doc = createEmptyRichDocument();
    const parsed = parsePatchContentRich(doc);
    assert.equal(parsed.ok, true);
    assert.equal(isRichContentDocument(doc), true);
  });

  test("parseRelationshipId accepts numbers and numeric strings", () => {
    assert.equal(parseRelationshipId(12), 12);
    assert.equal(parseRelationshipId("15"), 15);
    assert.equal(parseRelationshipId(null), null);
    assert.equal(parseRelationshipId("abc"), null);
  });
});

describe("writing workflow actions", () => {
  test("runWritingWorkflowAction routes plan_continue to writing assist", () => {
    let assistAction: string | null = null;
    let toast: string | null = null;

    runWritingWorkflowAction("plan_continue", {
      onWritingAssist: (action) => {
        assistAction = action;
      },
      onToast: (message) => {
        toast = message;
      },
    });

    assert.equal(assistAction, "continue");
    assert.match(toast ?? "", /续写/);
  });

  test("runWritingWorkflowAction prefills composer for checklist workflow", () => {
    let prompt: string | null = null;

    runWritingWorkflowAction("checklist_from_doc", {
      onPrefillComposer: (nextPrompt) => {
        prompt = nextPrompt;
      },
    });

    assert.match(prompt ?? "", /清单/);
    assert.match(getWorkflowActionDescription("checklist_from_doc"), /清单/);
  });
});

describe("writing save status helpers", () => {
  test("formatWritingSaveStatusLabel covers dirty and error states", () => {
    assert.equal(formatWritingSaveStatusLabel({ saveState: "idle" }), "已保存");
    assert.equal(
      formatWritingSaveStatusLabel({ isDirty: true, saveState: "dirty" }),
      "有未保存修改",
    );
    assert.equal(
      formatWritingSaveStatusLabel({ error: "网络错误", saveState: "error" }),
      "网络错误",
    );
  });
});

describe("writing text stats helpers", () => {
  test("countWritingWords counts CJK and latin words", () => {
    assert.equal(countWritingWords("hello world 你好"), 4);
  });

  test("extractRichText walks nested content", () => {
    assert.equal(
      extractRichText({ content: [{ text: "A" }, { text: "B" }], type: "paragraph" }),
      "A B",
    );
  });
});
