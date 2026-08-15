import type { DbClient } from "./index";
import { operationLogs } from "./schema";

export function createAuditLog(
  database: DbClient,
  input: {
    operationType: string;
    entityType: string;
    entityId?: string;
    requestId: string;
    detail: unknown;
  },
) {
  database.insert(operationLogs).values({
    id: crypto.randomUUID(),
    operationType: input.operationType,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId,
    detailJson: JSON.stringify(input.detail),
    createdAt: new Date().toISOString(),
  }).run();
}
