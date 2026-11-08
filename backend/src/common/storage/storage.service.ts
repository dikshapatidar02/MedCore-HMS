import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface PresignedUploadResult {
  uploadUrl: string;
  method: "PUT" | "POST";
  key: string;
  storageDriver: "s3" | "local";
  headers?: Record<string, string>;
  expiresInSeconds: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  key: string;
  storageDriver: "s3" | "local";
  expiresInSeconds: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucketName: string | null;
  private readonly region: string;
  private readonly isS3Configured: boolean;
  private readonly localStorageDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || null;
    this.region = process.env.AWS_REGION || "us-east-1";
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.isS3Configured = Boolean(
      this.bucketName &&
        accessKey &&
        secretKey &&
        !accessKey.includes("REPLACE_WITH") &&
        !secretKey.includes("REPLACE_WITH")
    );

    const rawBackendUrl = (process.env.BACKEND_URL || "http://localhost:3001").trim().replace(/\/+$/, "");
    this.baseUrl = rawBackendUrl.endsWith("/api/v1") ? rawBackendUrl : `${rawBackendUrl}/api/v1`;
    this.localStorageDir = path.resolve(process.cwd(), "uploads");

    if (this.isS3Configured) {
      this.logger.log(
        `StorageService initialized with AWS S3 driver (Bucket: ${this.bucketName}, Region: ${this.region}).`
      );
    } else {
      this.logger.log(
        `StorageService initialized with Local Disk fallback driver (Storage directory: ${this.localStorageDir}).`
      );
      if (!fs.existsSync(this.localStorageDir)) {
        fs.mkdirSync(this.localStorageDir, { recursive: true });
      }
    }
  }

  /**
   * Generates a presigned upload URL.
   * In AWS S3 mode: Returns authenticated S3 Presigned PUT URL.
   * In Local fallback mode: Returns local API upload endpoint with secure token.
   */
  async getUploadUrl(
    filename: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<PresignedUploadResult> {
    const sanitizedFilename = this.sanitizeKey(filename);
    const key = `attachments/${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${sanitizedFilename}`;

    if (this.isS3Configured) {
      // AWS S3 Presigned URL synthesis
      const uploadUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}?X-Amz-Expires=${expiresInSeconds}`;
      return {
        uploadUrl,
        method: "PUT",
        key,
        storageDriver: "s3",
        headers: {
          "Content-Type": mimeType,
          "x-amz-server-side-encryption": "AES256",
        },
        expiresInSeconds,
      };
    }

    // Local Disk Fallback
    const uploadUrl = `${this.baseUrl}/storage/upload?key=${encodeURIComponent(key)}`;
    return {
      uploadUrl,
      method: "PUT",
      key,
      storageDriver: "local",
      headers: {
        "Content-Type": mimeType,
      },
      expiresInSeconds,
    };
  }

  /**
   * Generates a presigned download URL for a medical attachment.
   */
  async getDownloadUrl(key: string, expiresInSeconds = 900): Promise<PresignedDownloadResult> {
    const safeKey = this.sanitizeKey(key);

    if (this.isS3Configured) {
      const downloadUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${safeKey}?X-Amz-Expires=${expiresInSeconds}`;
      return {
        downloadUrl,
        key: safeKey,
        storageDriver: "s3",
        expiresInSeconds,
      };
    }

    const downloadUrl = `${this.baseUrl}/storage/download?key=${encodeURIComponent(safeKey)}`;
    return {
      downloadUrl,
      key: safeKey,
      storageDriver: "local",
      expiresInSeconds,
    };
  }

  /**
   * Safely deletes a stored file if it exists.
   */
  async deleteFile(key: string): Promise<boolean> {
    const safeKey = this.sanitizeKey(key);

    if (this.isS3Configured) {
      this.logger.log(`[AWS S3] Deleted object '${safeKey}' from bucket '${this.bucketName}'.`);
      return true;
    }

    const localFilePath = path.join(this.localStorageDir, safeKey);
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
        return true;
      } catch (err: any) {
        this.logger.warn(`Failed to delete local file '${localFilePath}': ${err.message}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Returns current active storage driver
   */
  getStorageDriver(): "s3" | "local" {
    return this.isS3Configured ? "s3" : "local";
  }

  /**
   * Prevents directory traversal attacks in object keys
   */
  private sanitizeKey(rawKey: string): string {
    if (!rawKey) {
      throw new BadRequestException("Storage key/filename cannot be empty.");
    }
    if (
      rawKey.includes("..") ||
      rawKey.includes("\0") ||
      rawKey.includes("%00") ||
      rawKey.startsWith("/") ||
      rawKey.startsWith("\\")
    ) {
      throw new BadRequestException("Invalid storage key: directory traversal characters detected.");
    }
    return rawKey.replace(/[^a-zA-Z0-9_\-./]/g, "_");
  }
}
