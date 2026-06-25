import { NextResponse } from "next/server";

const notFoundPattern = /not found|找不到|不存在/i;
const validationPattern = /validation|invalid|required|unique|duplicate/i;
const conflictPattern = /conflict|already exists|duplicate/i;

export const mapPayloadError = (error: unknown, fallbackMessage: string) => {
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (notFoundPattern.test(message)) {
    return NextResponse.json({ message: "内容不存在" }, { status: 404 });
  }

  if (conflictPattern.test(message)) {
    return NextResponse.json({ message }, { status: 409 });
  }

  if (validationPattern.test(message)) {
    return NextResponse.json({ message: "请求数据无效" }, { status: 400 });
  }

  return NextResponse.json({ message: fallbackMessage }, { status: 500 });
};
