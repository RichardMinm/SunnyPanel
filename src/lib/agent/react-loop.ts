/**
 * 多轮 ReAct 工具循环引擎（provider 无关、可注入、可测试）。
 *
 * 设计要点（安全优先）：
 * - 只读工具（query_progress / query_plan_progress / evaluate_plan 等）在循环内直接执行，
 *   观察结果以 `tool` role 回灌 LLM，驱动「思考→调工具→观察→再思考」。
 * - 写入工具**绝不**在循环内自动执行：一旦模型选择写入工具，循环立即停止并把该工具调用
 *   作为「待提案的写入意图」返回，交由既有 DryRun→确认→Execute 安全门处理。
 * - 循环有独立步数上限（maxSteps，默认 5），避免无限回灌；每步可上报 trace。
 */

export type ReactRole = "assistant" | "system" | "tool" | "user";

export type ReactMessage = {
  content: string;
  /** 工具观察消息（role=tool）对应的工具调用 id，用于 OpenAI 兼容回灌。 */
  name?: string;
  role: ReactRole;
  toolCallId?: string;
};

export type ReactToolCall = {
  args: Record<string, unknown>;
  id?: string;
  name: string;
};

export type ReactModelTurn =
  | { content: string; type: "final" }
  | { thought?: string; toolCalls: ReactToolCall[]; type: "tool_calls" };

export type ReactObservation = {
  content: string;
  name: string;
  toolCallId?: string;
};

export type ReactStepTrace = {
  observations: ReactObservation[];
  step: number;
  thought?: string;
  toolCalls: ReactToolCall[];
};

export type ReactLoopResult =
  | { kind: "final_answer"; content: string; steps: ReactStepTrace[] }
  | { kind: "no_response"; steps: ReactStepTrace[] }
  | { kind: "steps_exhausted"; steps: ReactStepTrace[] }
  | { kind: "write_proposal"; steps: ReactStepTrace[]; toolCall: ReactToolCall };

export type RunReactLoopArgs = {
  /** 调用 LLM 取得下一步（工具调用或最终回答）。返回 null 视为无响应并终止。 */
  callModel: (messages: ReactMessage[]) => Promise<null | ReactModelTurn>;
  /** 执行一个只读工具并返回可读观察文本。 */
  executeReadTool: (call: ReactToolCall) => Promise<string>;
  initialMessages: ReactMessage[];
  /** 判断工具名是否为写入类（写入类不在循环内执行）。 */
  isWriteTool: (name: string) => boolean;
  /** 循环步数上限，默认 5。 */
  maxSteps?: number;
  onTrace?: (trace: ReactStepTrace) => void;
};

const DEFAULT_MAX_STEPS = 5;

const stringifyToolCall = (call: ReactToolCall) =>
  JSON.stringify({ args: call.args, name: call.name });

export const runReactToolLoop = async ({
  callModel,
  executeReadTool,
  initialMessages,
  isWriteTool,
  maxSteps = DEFAULT_MAX_STEPS,
  onTrace,
}: RunReactLoopArgs): Promise<ReactLoopResult> => {
  const messages: ReactMessage[] = [...initialMessages];
  const steps: ReactStepTrace[] = [];
  const boundedMaxSteps = Math.max(1, Math.min(maxSteps, 12));

  for (let step = 0; step < boundedMaxSteps; step++) {
    const turn = await callModel(messages);

    if (!turn) {
      return { kind: "no_response", steps };
    }

    if (turn.type === "final") {
      return { content: turn.content, kind: "final_answer", steps };
    }

    if (turn.toolCalls.length === 0) {
      // 模型声称要调工具却没有给出任何调用，按无响应处理避免空转。
      return { kind: "no_response", steps };
    }

    // 写入工具优先：一旦出现，立即停止循环并把写入提案交回安全门，不在循环内执行。
    const writeCall = turn.toolCalls.find((call) => isWriteTool(call.name));

    if (writeCall) {
      const trace: ReactStepTrace = {
        observations: [],
        step,
        thought: turn.thought,
        toolCalls: turn.toolCalls,
      };

      steps.push(trace);
      onTrace?.(trace);

      return { kind: "write_proposal", steps, toolCall: writeCall };
    }

    // 全部是只读工具：逐个执行并把观察以 tool role 回灌。
    const observations: ReactObservation[] = [];

    for (const call of turn.toolCalls) {
      messages.push({
        content: stringifyToolCall(call),
        name: call.name,
        role: "assistant",
        toolCallId: call.id,
      });

      let observationContent: string;

      try {
        observationContent = await executeReadTool(call);
      } catch (error) {
        observationContent = `工具 ${call.name} 执行失败：${error instanceof Error ? error.message : String(error)}`;
      }

      const observation: ReactObservation = {
        content: observationContent,
        name: call.name,
        toolCallId: call.id,
      };

      observations.push(observation);
      messages.push({
        content: observationContent,
        name: call.name,
        role: "tool",
        toolCallId: call.id,
      });
    }

    const trace: ReactStepTrace = {
      observations,
      step,
      thought: turn.thought,
      toolCalls: turn.toolCalls,
    };

    steps.push(trace);
    onTrace?.(trace);
  }

  return { kind: "steps_exhausted", steps };
};
