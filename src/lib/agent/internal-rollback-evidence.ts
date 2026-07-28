const serverInternalFailedAuditCompensationMarker = Symbol(
  "server-internal-failed-audit-compensation",
);

type ServerInternalFailedAuditCompensationEvidence = {
  readonly [serverInternalFailedAuditCompensationMarker]: true;
};

export const markServerInternalFailedAuditCompensation = <T extends object>(
  value: T,
): T & ServerInternalFailedAuditCompensationEvidence => {
  Object.defineProperty(value, serverInternalFailedAuditCompensationMarker, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  return value as T & ServerInternalFailedAuditCompensationEvidence;
};

export const hasServerInternalFailedAuditCompensation = (
  value: unknown,
): value is ServerInternalFailedAuditCompensationEvidence =>
  Boolean(
    value
    && typeof value === "object"
    && (value as Partial<ServerInternalFailedAuditCompensationEvidence>)[
      serverInternalFailedAuditCompensationMarker
    ] === true,
  );
