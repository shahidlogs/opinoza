/**
 * Google Drive off-site backup uploader.
 *
 * Uses the Replit Google Drive connector (via @replit/connectors-sdk) to upload
 * a completed local backup file into a dedicated Drive folder named "opinoza-backups".
 *
 * The connector handles OAuth token refresh automatically — no credentials are
 * ever logged or stored in environment variables.
 *
 * Drive folder "opinoza-backups" is created automatically on first run.
 * On Drive, files are named identically to the local filename.
 */

import { createReadStream, statSync } from "fs";
import { basename } from "path";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger.js";

const DRIVE_FOLDER_NAME = "opinoza-backups";

async function findOrCreateFolder(connectors: ReplitConnectors): Promise<string> {
  // Search for an existing folder with this name (not trashed)
  const searchParams = new URLSearchParams({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });

  const searchRes = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?${searchParams.toString()}`,
    { method: "GET" },
  );

  if (!searchRes.ok) {
    const body = await searchRes.text();
    throw new Error(`Drive folder search failed (${searchRes.status}): ${body}`);
  }

  const data = await searchRes.json() as { files: Array<{ id: string; name: string }> };

  if (data.files && data.files.length > 0) {
    return data.files[0]!.id;
  }

  // Create the folder
  const createRes = await connectors.proxy(
    "google-drive",
    "/drive/v3/files",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    },
  );

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Drive folder creation failed (${createRes.status}): ${body}`);
  }

  const folder = await createRes.json() as { id: string };
  logger.info(`[drive-upload] Created Drive folder "${DRIVE_FOLDER_NAME}" (id: ${folder.id})`);
  return folder.id;
}

const ID_VERIFICATION_FOLDER = "opinoza-id-verifications";

export async function uploadIdDocumentToDrive(
  userId: string,
  fileBuffer: Buffer,
  mimeType: string,
  originalFilename: string,
): Promise<{ fileId: string; viewUrl: string }> {
  const connectors = new ReplitConnectors();

  // Find or create the id-verifications folder
  const searchParams = new URLSearchParams({
    q: `name='${ID_VERIFICATION_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  const searchRes = await connectors.proxy("google-drive", `/drive/v3/files?${searchParams.toString()}`, { method: "GET" });
  if (!searchRes.ok) throw new Error(`Drive folder search failed (${searchRes.status})`);
  const searchData = await searchRes.json() as { files: Array<{ id: string }> };

  let folderId: string;
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0]!.id;
  } else {
    const createRes = await connectors.proxy("google-drive", "/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ID_VERIFICATION_FOLDER, mimeType: "application/vnd.google-apps.folder" }),
    });
    if (!createRes.ok) throw new Error(`Drive folder creation failed (${createRes.status})`);
    const folder = await createRes.json() as { id: string };
    folderId = folder.id;
  }

  // Upload the document
  const timestamp = Date.now();
  const ext = originalFilename.split(".").pop() || "jpg";
  const filename = `${userId}_${timestamp}.${ext}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId], mimeType });
  const boundary = "opinoza_id_boundary_x9m3";
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const filePart = `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Length: ${fileBuffer.length}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(metaPart, "utf8"),
    Buffer.from(filePart, "utf8"),
    fileBuffer,
    Buffer.from(closing, "utf8"),
  ]);

  const uploadRes = await connectors.proxy("google-drive", "/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(bodyBuffer.length),
    },
    body: bodyBuffer,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`Drive ID document upload failed (${uploadRes.status}): ${body}`);
  }

  const result = await uploadRes.json() as { id: string; name: string };
  logger.info(`[drive-upload] ID document uploaded: ${result.name} (fileId: ${result.id}) for user ${userId}`);

  return {
    fileId: result.id,
    viewUrl: `https://drive.google.com/file/d/${result.id}/view`,
  };
}

export async function uploadBackupToDrive(localFilePath: string): Promise<void> {
  const filename = basename(localFilePath);
  logger.info(`[drive-upload] Starting Google Drive upload: ${filename}`);

  // Always create a fresh connectors instance — tokens expire
  const connectors = new ReplitConnectors();

  const folderId = await findOrCreateFolder(connectors);

  const fileSize = statSync(localFilePath).size;
  const fileStream = createReadStream(localFilePath);

  // Use multipart upload for files under 5 MB; resumable for larger.
  // Our backups are small SQL dumps, so multipart works fine.
  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
    mimeType: "application/gzip",
  });

  // Build multipart/related body manually so we don't need form-data package
  const boundary = "opinoza_backup_boundary_x7k2";
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n`;
  const filePart =
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/gzip\r\n` +
    `Content-Length: ${fileSize}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  // Collect the file into a buffer (backups are small, <50 MB is fine in RAM)
  const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    fileStream.on("data", (c: Buffer) => chunks.push(c));
    fileStream.on("end", () => resolve(Buffer.concat(chunks)));
    fileStream.on("error", reject);
  });

  const bodyBuffer = Buffer.concat([
    Buffer.from(metaPart, "utf8"),
    Buffer.from(filePart, "utf8"),
    fileBuffer,
    Buffer.from(closing, "utf8"),
  ]);

  const uploadRes = await connectors.proxy(
    "google-drive",
    "/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(bodyBuffer.length),
      },
      body: bodyBuffer,
    },
  );

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`Drive upload failed (${uploadRes.status}): ${body}`);
  }

  const result = await uploadRes.json() as { id: string; name: string };
  const sizeKB = Math.round(fileSize / 1024);
  logger.info(
    `[drive-upload] Upload complete: ${result.name} → Drive folder "${DRIVE_FOLDER_NAME}" (fileId: ${result.id}, ${sizeKB} KB)`,
  );
}
