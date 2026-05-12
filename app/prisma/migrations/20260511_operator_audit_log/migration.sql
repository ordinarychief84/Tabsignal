-- Cross-venue audit log for platform/operator actions. Sibling to the
-- venue-scoped AuditLog. Append-only.

CREATE TABLE "OperatorAuditLog" (
  "id"          TEXT NOT NULL,
  "actorEmail"  TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "targetType"  TEXT,
  "targetId"    TEXT,
  "metadata"    JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperatorAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorAuditLog_actorEmail_createdAt_idx" ON "OperatorAuditLog"("actorEmail", "createdAt");
CREATE INDEX "OperatorAuditLog_action_createdAt_idx"    ON "OperatorAuditLog"("action", "createdAt");
