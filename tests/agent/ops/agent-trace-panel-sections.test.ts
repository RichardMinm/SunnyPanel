import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ── Section structure ── */

test("Trace Panel: has four sections — Activity, Receipt, Rollback, Trace Log", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");

  assert.ok(source.includes("Activity"), "must have Activity section");
  assert.ok(source.includes("Receipt"), "must have Receipt section");
  assert.ok(source.includes("Rollback"), "must have Rollback section");
  assert.ok(source.includes("Trace Log"), "must have Trace Log section");
});

test("Trace Panel: each section has a description explaining what it shows", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");

  // Activity: mentions sanitization
  assert.match(source, /结构化执行状态/);
  assert.match(source, /不展示模型内部推理链/);

  // Receipt: mentions no full documents
  assert.match(source, /不包含完整文档\s*payload/);

  // Rollback: mentions no raw payload
  assert.match(source, /不展示完整\s*rollback\s*payload/);

  // Trace Log: mentions redaction
  assert.match(source, /已脱敏/);
  assert.match(source, /不包含原始\s*prompt/);
});

test("Trace Panel: activity hint mentions redaction", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  assert.match(source, /已做敏感字段脱敏/);
  assert.match(source, /仅显示摘要/);
});

/* ── Banned labels: no raw sensitive data in source ── */

test("Trace Panel source: does not contain banned labels", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");

  assert.doesNotMatch(source, /raw chain-of-thought/i);
  assert.doesNotMatch(source, /raw prompt/i);
  assert.doesNotMatch(source, /raw LLM response/i);
  assert.doesNotMatch(source, /Authorization/);
  assert.doesNotMatch(source, /Cookie/);
  assert.doesNotMatch(source, /\bpassword\b/i);
  assert.doesNotMatch(source, /\bsecret\b/i);
  assert.doesNotMatch(source, /\bapi_key\b/i);
  assert.doesNotMatch(source, /\btoken\b/i);
});

/* ── No misleading copy ── */

test("Trace Panel source: does not claim enterprise audit or full model thinking", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");

  assert.doesNotMatch(source, /企业审计/);
  assert.doesNotMatch(source, /模型思考过程/);
  assert.doesNotMatch(source, /完整提示词/);
  assert.doesNotMatch(source, /原始响应/);
  assert.doesNotMatch(source, /完整 payload/);
  assert.doesNotMatch(source, /全自动/);
});

/* ── Sanitize: redacts sensitive values ── */

test("sanitizeAgentActivityDetails: redacts authorization header", async () => {
  const { sanitizeAgentActivityDetails } = await import(
    "../../../src/lib/agent/activity/sanitize"
  );

  const result = sanitizeAgentActivityDetails({
    headers: { Authorization: "Bearer abc123xyz" },
  });

  const str = JSON.stringify(result);
  assert.doesNotMatch(str, /abc123xyz/);
  assert.match(str, /redacted/i);
});

test("sanitizeAgentActivityDetails: redacts all common secret keys", async () => {
  const { sanitizeAgentActivityDetails } = await import(
    "../../../src/lib/agent/activity/sanitize"
  );

  const result = sanitizeAgentActivityDetails({
    Authorization: "Bearer abc123xyz",
    Cookie: "sid=123",
    token: "tok123",
    access_token: "access456",
    refresh_token: "refresh789",
    password: "pw123",
    secret: "sec456",
    api_key: "key789",
    apikey: "apikey000",
    client_secret: "client-sec-111",
    csrf: "csrf-token-222",
    bearer: "bearer-token-333",
    session: "sess-444",
  });

  const str = JSON.stringify(result);
  // All original values must be absent
  assert.doesNotMatch(str, /abc123xyz/);
  assert.doesNotMatch(str, /sid=123/);
  assert.doesNotMatch(str, /tok123/);
  assert.doesNotMatch(str, /access456/);
  assert.doesNotMatch(str, /refresh789/);
  assert.doesNotMatch(str, /pw123/);
  assert.doesNotMatch(str, /sec456/);
  assert.doesNotMatch(str, /key789/);
  assert.doesNotMatch(str, /apikey000/);
  assert.doesNotMatch(str, /client-sec-111/);
  assert.doesNotMatch(str, /csrf-token-222/);
  assert.doesNotMatch(str, /bearer-token-333/);
  assert.doesNotMatch(str, /sess-444/);
  // All must be replaced with redacted marker
  assert.match(str, /redacted/i);
});

test("sanitizeAgentActivityDetails: redacts nested sensitive keys", async () => {
  const { sanitizeAgentActivityDetails } = await import(
    "../../../src/lib/agent/activity/sanitize"
  );

  const result = sanitizeAgentActivityDetails({
    level1: {
      token: "nested-token",
      level2: {
        api_key: "deep-key",
        items: [{ Authorization: "deep-auth" }],
      },
    },
  });

  const str = JSON.stringify(result);
  assert.doesNotMatch(str, /nested-token/);
  assert.doesNotMatch(str, /deep-key/);
  assert.doesNotMatch(str, /deep-auth/);
  assert.match(str, /redacted/i);
});

test("sanitizeAgentActivityDetails: truncates long strings", async () => {
  const { sanitizeAgentActivityDetails } = await import(
    "../../../src/lib/agent/activity/sanitize"
  );

  const result = sanitizeAgentActivityDetails({
    payload: "x".repeat(500),
  });

  const str = JSON.stringify(result);
  assert.match(str, /truncated/);
});

test("sanitizeAgentActivityDetails: preserves safe scalar values", async () => {
  const { sanitizeAgentActivityDetails } = await import(
    "../../../src/lib/agent/activity/sanitize"
  );

  const result = sanitizeAgentActivityDetails({
    count: 42,
    label: "safe text",
    flag: true,
    items: ["a", "b"],
  });

  assert.deepEqual(result, {
    count: 42,
    label: "safe text",
    flag: true,
    items: ["a", "b"],
  });
});

/* ── AgentTracePanel: section descriptions ── */

test("Trace Panel: Activity section is conditional on activity steps", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  // Activity section only renders when hasActivitySteps is true
  assert.ok(source.includes("hasActivitySteps"), "Activity section must be conditional");
});

test("Trace Panel: Rollback section is conditional on lastRollbackResult", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  assert.ok(source.includes("lastRollbackResult"), "Rollback section must be conditional");
});

test("Trace Panel: Trace Log requires debugMode for detail display", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  // Debug-only elements are gated behind showDebugTrace / debugMode
  assert.ok(source.includes("debugMode"), "Trace log detail must be gated by debugMode");
  assert.ok(source.includes("sunny-agent-debug-only"), "debug-only class used for gated detail");
});

/* ── Text-level redaction ── */

test("redactSensitiveText: redacts inline secrets in string values", async () => {
  const { sanitizeAgentActivityDetails } = await import(
    "../../../src/lib/agent/activity/sanitize"
  );

  const result = sanitizeAgentActivityDetails({
    // Inline secrets embedded in a long string
    raw: "Authorization: Bearer abc123\nCookie: sid=789\nSet-Cookie: x=y\naccess_token: tok\nrefresh_token: ref\nclient_secret: sec\ncsrf: csrf-token\npassword: pw\napi_key: key",
  });

  const str = JSON.stringify(result);
  assert.doesNotMatch(str, /abc123/);
  assert.doesNotMatch(str, /sid=789/);
  assert.doesNotMatch(str, /x=y/);
  assert.doesNotMatch(str, /tok\n/); // token value "tok" should be redacted
  assert.match(str, /redacted/i);
});

/* ── Receipt / Rollback: no raw payload display ── */

test("Receipt section labels: does not render raw payload", () => {
  // The Receipt section description explicitly says it doesn't include full payload
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  assert.match(source, /不包含完整文档\s*payload/);
  assert.doesNotMatch(source, /raw JSON/);
  assert.doesNotMatch(source, /complete payload/i);
});

test("Rollback section labels: does not render raw rollbackPayload", () => {
  const source = read("src/components/dashboard/agent/AgentTracePanel.tsx");
  assert.match(source, /不展示完整\s*rollback\s*payload/);
});

/* ── User-visible timeline: no raw details ── */

test("AgentActivityTimeline source: does not expose raw details to user", () => {
  const source = read("src/components/dashboard/agent/AgentActivityTimeline.tsx");
  assert.match(source, /step\.visibility !== "developer"/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.doesNotMatch(source, /raw prompt/i);
  assert.doesNotMatch(source, /raw response/i);
  assert.doesNotMatch(source, /Authorization/);
});

test("AgentActivityStepItem source: details are collapsed behind toggle", () => {
  const source = read("src/components/dashboard/agent/AgentActivityStep.tsx");
  assert.ok(source.includes("查看脱敏 details"), "details must be behind a toggle labeled 查看脱敏 details");
});

/* ── Safe snapshot: afterSnapshot not displayed as raw JSON ── */

test("AgentRunDetailView: afterSnapshot is typed as unknown, not exposed as raw JSON", () => {
  const source = read("src/lib/agent/run-summary.ts");
  assert.ok(source.includes("afterSnapshot?: unknown"), "afterSnapshot must be unknown type");
  // The PlanOperatingCard and AgentRunDetailCard only render summary fields, not raw snapshot
});

test("AgentArtifactsPanel source: does not render raw payload JSON in UI", () => {
  const source = read("src/components/dashboard/agent/AgentArtifactsPanel.tsx");
  // Must not render full JSON dump of rollbackPayload or snapshots
  assert.doesNotMatch(source, /JSON\.stringify\(.*rollbackPayload/);
  assert.doesNotMatch(source, /JSON\.stringify\(.*beforeSnapshot/);
  assert.doesNotMatch(source, /JSON\.stringify\(.*afterSnapshot/);
});

/* ── M6-A4: Activity UI Motion & Polish ── */

test("Activity CSS: running step has pulse animation", () => {
  const css = read("src/app/styles/sunny-agent.css");
  assert.ok(css.includes("sunny-agent-activity-pulse"), "must define pulse keyframe");
  assert.ok(css.includes("sunny-agent-activity-step-running"), "must have running step selector");
});

test("Activity CSS: step entry uses reveal animation", () => {
  const css = read("src/app/styles/sunny-agent.css");
  assert.ok(css.includes("sunny-agent-activity-reveal"), "must define reveal keyframe");
});

test("Activity CSS: details expand has open animation", () => {
  const css = read("src/app/styles/sunny-agent.css");
  assert.ok(css.includes("sunny-agent-activity-details-open"), "must define details-open keyframe");
});

test("Activity CSS: reduced-motion disables step and details animations", () => {
  const css = read("src/app/styles/sunny-agent.css");
  assert.ok(css.includes("prefers-reduced-motion"), "must have reduced-motion media query");
  // Step reveal animation disabled inside the media query
  assert.ok(css.includes("animation: none"), "must set animation: none for reduced motion");
});

test("Activity CSS: active step has visual emphasis", () => {
  const css = read("src/app/styles/sunny-agent.css");
  assert.ok(css.includes('data-active="true"'), "must have active state selector");
});

test("Activity UI source: no raw CoT, prompt, LLM response, or payload labels", () => {
  const timeline = read("src/components/dashboard/agent/AgentActivityTimeline.tsx");
  const stepItem = read("src/components/dashboard/agent/AgentActivityStep.tsx");

  for (const source of [timeline, stepItem]) {
    assert.doesNotMatch(source, /raw chain-of-thought/i);
    assert.doesNotMatch(source, /raw prompt/i);
    assert.doesNotMatch(source, /raw LLM response/i);
    assert.doesNotMatch(source, /full payload/i);
    assert.doesNotMatch(source, /raw payload/i);
    assert.doesNotMatch(source, /Authorization/);
    assert.doesNotMatch(source, /Cookie/);
  }
});

test("Activity CSS: status badge distinguishes running/success/failed/skipped/waiting", () => {
  const css = read("src/app/styles/sunny-agent.css");
  assert.ok(css.includes("step-running"), "must have running state style");
  assert.ok(css.includes("step-success"), "must have success state style");
  assert.ok(css.includes("step-failed"), "must have failed state style");
  assert.ok(css.includes("step-waiting"), "must have waiting state style");
  assert.ok(css.includes("step-skipped"), "must have skipped state style");
});
