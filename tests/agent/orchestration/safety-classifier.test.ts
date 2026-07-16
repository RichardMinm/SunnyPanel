import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, classifyIntents, isSemanticMatch } from "../../../src/lib/agent/orchestration/safety-classifier";

describe("safety-classifier", () => {
  describe("classifyIntent", () => {
    it("answer_question → read", () => assert.equal(classifyIntent("answer_question"), "read"));
    it("query_progress → read", () => assert.equal(classifyIntent("query_progress"), "read"));
    it("evaluate_plan → read", () => assert.equal(classifyIntent("evaluate_plan"), "read"));
    it("explain_concept → read", () => assert.equal(classifyIntent("explain_concept"), "read"));
    it("clarify → clarify", () => assert.equal(classifyIntent("clarify"), "clarify"));
    it("compose_plan → write_candidate", () => assert.equal(classifyIntent("compose_plan"), "write_candidate"));
    it("create_plan → write_candidate", () => assert.equal(classifyIntent("create_plan"), "write_candidate"));
    it("schedule_plan → write_candidate", () => assert.equal(classifyIntent("schedule_plan"), "write_candidate"));
    it("delete_record → write_candidate", () => assert.equal(classifyIntent("delete_record"), "write_candidate"));
    it("save_memory → write_candidate", () => assert.equal(classifyIntent("save_memory"), "write_candidate"));
    it("weekly_review → write_candidate", () => assert.equal(classifyIntent("weekly_review"), "write_candidate"));
    it("unknown intent → write_candidate (conservative)", () => assert.equal(classifyIntent("unknown_thing"), "write_candidate"));
  });

  describe("classifyIntents", () => {
    it("single read → read", () => assert.equal(classifyIntents(["answer_question"]), "read"));
    it("single clarify → clarify", () => assert.equal(classifyIntents(["clarify"]), "clarify"));
    it("single write → write_candidate", () => assert.equal(classifyIntents(["compose_plan"]), "write_candidate"));
    it("all read → read", () => assert.equal(classifyIntents(["answer_question", "query_progress"]), "read"));
    it("all write → write_candidate", () => assert.equal(classifyIntents(["compose_plan", "create_plan"]), "write_candidate"));
    it("mixed read+write → mixed", () => assert.equal(classifyIntents(["answer_question", "create_plan"]), "mixed"));
    it("mixed clarify+write → write_candidate", () => assert.equal(classifyIntents(["clarify", "compose_plan"]), "write_candidate"));
    it("empty → read", () => assert.equal(classifyIntents([]), "read"));
    it("write_candidate does NOT mean executable", () => {
      const result = classifyIntents(["create_plan"]);
      assert.equal(result, "write_candidate");
      /* write_candidate is a comparison classification, NOT execute permission */
    });
  });

  describe("scope-sensitive semantic comparison", () => {
    it("does not treat aggregate and specific progress as equivalent", () => {
      assert.equal(isSemanticMatch("query_progress", "query_plan_progress"), false);
    });
  });
});
