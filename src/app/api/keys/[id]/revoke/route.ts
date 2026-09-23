import { NextResponse } from "next/server";
import { getApiKeyByIdOrSafePrefix, revokeApiKey } from "@/lib/db/apiKeys";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import * as log from "@/sse/utils/logger";

/** Revoke one key row without deleting its audit record or touching siblings. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id: identifier } = await params;
    const existing = await getApiKeyByIdOrSafePrefix(identifier);
    if (!existing) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    const id = typeof existing.id === "string" ? existing.id : "";
    if (!id) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    await revokeApiKey(id);
    return NextResponse.json({
      revoked: true,
      id,
      keyPrefix: typeof existing.keyPrefix === "string" ? existing.keyPrefix : null,
    });
  } catch (error) {
    log.error("keys", "Error revoking key", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
