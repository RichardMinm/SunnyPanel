const credentialAssignmentPattern =
  /(?:api[\s_-]*key|secret(?:[\s_-]*key)?|password|passwd|pwd|(?:access[\s_-]*|refresh[\s_-]*)?token|database[\s_-]*url|authorization|cookie|密码|密钥|令牌|数据库连接串)\s*(?:是|为|[:：=])\s*[^\s，。；;]{4,}/iu;

const credentialValuePatterns = [
  /\bsk-[a-z0-9_-]{16,}\b/iu,
  /\b(?:gh[opurs]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,})\b/iu,
  /\beyJ[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}\.[a-z0-9_-]{8,}\b/iu,
  /\b(?:Bearer|Basic)\s+[a-z0-9._~+/-]{12,}={0,2}\b/iu,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
] as const;

export const containsSensitiveLearningData = (value: string): boolean =>
  credentialAssignmentPattern.test(value)
  || credentialValuePatterns.some((pattern) => pattern.test(value));
