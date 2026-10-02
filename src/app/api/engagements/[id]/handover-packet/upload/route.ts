import { NextResponse } from "next/server";
import { getSession, requireTenantContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { buildStorageKey, uploadObject } from "@/lib/storage/s3";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — generous for deliverables (docs, zips, media), not unlimited.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: engagementId } = await params;
  const ctx = requireTenantContext(session);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 50 MB limit." }, { status: 400 });
  }

  try {
    const result = await withTenant(ctx, async (tenantId) => {
      // Confirms the engagement belongs to this tenant before anything is uploaded under its key prefix.
      await prisma.engagement.findFirstOrThrow({ where: { id: engagementId, tenantId } });

      const storageKey = buildStorageKey(tenantId, engagementId, file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      await uploadObject(storageKey, buffer, file.type || "application/octet-stream");
      return { fileName: file.name, storageKey };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
