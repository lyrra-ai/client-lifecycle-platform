/**
 * Object storage (System Design §7) — "S3-compatible" by design, not a
 * specific vendor. For MVP this points at Cloudflare R2's free tier
 * (S3-compatible API, no egress fees) via S3_ENDPOINT/S3_REGION="auto";
 * switching to real AWS S3 (or Backblaze, DigitalOcean Spaces, ...) later
 * is an env-var change only — this file and every caller stay the same.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: requireEnv("S3_ENDPOINT"),
      region: process.env.S3_REGION || "auto",
      credentials: {
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      },
      // Cloudflare R2 (and most non-AWS S3-compatible providers) require
      // path-style addressing — virtual-hosted-style (the AWS SDK default)
      // doesn't resolve against them.
      forcePathStyle: true,
    });
  }
  return client;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not set — object storage not yet configured.`);
  return value;
}

function bucket(): string {
  return requireEnv("S3_BUCKET");
}

/** Builds a collision-resistant key scoped to the tenant/engagement, preserving the original file name for readability. */
export function buildStorageKey(tenantId: string, engagementId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `handover/${tenantId}/${engagementId}/${randomBytes(8).toString("hex")}-${safeName}`;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Time-boxed, signed GET url — deliverables stay private until a link is issued, and it expires rather than leaking forever. */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 60 * 60 * 24): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
