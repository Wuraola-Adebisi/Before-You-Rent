import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const bucket = process.env.BACKUP_BUCKET;
const backupKey = (sub) => `users/${sub}/backup.json`;
const response = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!sub || !bucket) return response(401, { message: "Authentication is required." });

  const key = backupKey(sub);
  try {
    if (event.requestContext.http.method === "PUT") {
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: "application/json",
        }),
        { expiresIn: 300 },
      );
      return response(200, { uploadUrl, expiresIn: 300 });
    }

    if (event.requestContext.http.method === "GET") {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        const downloadUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: 300 },
        );
        return response(200, { exists: true, downloadUrl, updatedAt: head.LastModified?.toISOString() ?? null, size: head.ContentLength ?? null });
      } catch (error) {
        if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
          return response(200, { exists: false });
        }
        throw error;
      }
    }

    if (event.requestContext.http.method === "DELETE") {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return response(200, { deleted: true });
    }

    return response(405, { message: "Method not allowed." });
  } catch (error) {
    console.error("Cloud backup operation failed", { method: event.requestContext?.http?.method, name: error?.name });
    return response(500, { message: "The cloud backup operation failed. Try again later." });
  }
};
