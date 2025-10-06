import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    // Validate AWS credentials before creating S3Client
    const accessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    const missingCredentials: string[] = [];
    if (!accessKey) {
      missingCredentials.push('AWS_ACCESS_KEY_ID');
    }
    if (!secretKey) {
      missingCredentials.push('AWS_SECRET_ACCESS_KEY');
    }

    if (missingCredentials.length > 0) {
      const errorMessage = `Missing required AWS credentials: ${missingCredentials.join(', ')}. Please ensure these environment variables are properly configured.`;
      throw new Error(errorMessage);
    }

    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1')!,
      credentials: {
        accessKeyId: accessKey!,
        secretAccessKey: secretKey!,
      },
    });
    this.bucketName = this.configService.get(
      'AWS_S3_BUCKET',
      'nexafx-disputes',
    );
  }

  /**
   * Builds a region-aware S3 URL with proper key encoding
   * @param key - The S3 object key
   * @returns Properly formatted S3 URL
   */
  private buildS3Url(key: string): string {
    const region = this.configService.get('AWS_REGION', 'us-east-1');

    // Special case for us-east-1: use s3.amazonaws.com instead of s3.us-east-1.amazonaws.com
    const endpoint =
      region === 'us-east-1'
        ? `https://${this.bucketName}.s3.amazonaws.com`
        : `https://${this.bucketName}.s3.${region}.amazonaws.com`;

    // Properly encode the key, preserving forward slashes for path segments
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');

    return `${endpoint}/${encodedKey}`;
  }

  /**
   * Sanitizes a filename for safe use in S3 object keys
   * @param filename - The original filename to sanitize
   * @returns Sanitized filename safe for S3 keys
   */
  private sanitizeFilename(filename: string): string {
    // Extract basename to strip any path segments
    let sanitized = path.basename(filename);

    // Trim whitespace
    sanitized = sanitized.trim();

    // Replace spaces, path separators, and other problematic characters with hyphens
    sanitized = sanitized.replace(/[\s/\\<>:"|?*]/g, '-');
    // Remove control characters (ASCII 0-31) - using char codes instead of regex
    sanitized = sanitized
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 32; // Keep only printable characters
      })
      .join('');

    // Remove or replace consecutive non-alphanumeric characters with single hyphen
    sanitized = sanitized.replace(/[^a-zA-Z0-9.-]+/g, '-');

    // Remove leading/trailing dots and hyphens
    sanitized = sanitized.replace(/^[.-]+|[.-]+$/g, '');

    // Remove consecutive dots and hyphens
    sanitized = sanitized.replace(/[-.]{2,}/g, '-');

    // Enforce maximum length (keeping room for UUID prefix and extension)
    const maxLength = 200;
    if (sanitized.length > maxLength) {
      const ext = path.extname(sanitized);
      const nameWithoutExt = path.basename(sanitized, ext);
      const availableLength = maxLength - ext.length;
      sanitized = nameWithoutExt.substring(0, availableLength) + ext;
    }

    // If result is empty or only special characters, use a safe default
    if (!sanitized || sanitized.match(/^[.-]+$/)) {
      sanitized = 'file';
    }

    return sanitized;
  }

  async uploadFile(
    file: Express.Multer.File,
    prefix: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; url: string }> {
    // Validate input before constructing PutObjectCommand
    if (!file) {
      throw new Error('Invalid file: no file provided');
    }

    // Ensure buffer exists and is non-empty
    if (
      !file.buffer ||
      !(file.buffer instanceof Buffer) ||
      file.buffer.length === 0
    ) {
      throw new Error('Invalid file: buffer is missing or empty');
    }

    // Ensure size is a positive number
    if (
      typeof file.size !== 'number' ||
      !Number.isFinite(file.size) ||
      file.size <= 0
    ) {
      throw new Error(
        'Invalid file: size must be a positive number, got ' + file.size,
      );
    }

    // Ensure mimetype is present and optionally validate allowed types
    if (!file.mimetype || typeof file.mimetype !== 'string') {
      throw new Error('Invalid file: mimetype is missing');
    }

    const allowedMimePattern =
      /^(image\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/i;
    if (!allowedMimePattern.test(file.mimetype)) {
      throw new Error('Unsupported content type: ' + file.mimetype);
    }

    const sanitizedFilename = this.sanitizeFilename(file.originalname);
    const key = `${prefix}/${uuidv4()}-${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentLength: file.size,
      Metadata: metadata || {},
    });

    await this.s3Client.send(command);

    const url = this.buildS3Url(key);

    return { key, url };
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    // Validate buffer
    if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
      throw new Error('Buffer is missing or empty');
    }

    // Validate content type
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('Content type is required');
    }
    const allowedMimePattern =
      /^(image\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/i;
    if (!allowedMimePattern.test(contentType)) {
      throw new Error('Unsupported content type: ' + contentType);
    }

    // Validate and sanitize key
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: key is required');
    }
    const normalizedKey = key.replace(/\\/g, '/').trim();
    if (normalizedKey.length === 0) {
      throw new Error('Invalid key: key must not be empty');
    }
    if (normalizedKey.includes('..') || normalizedKey.startsWith('/')) {
      throw new Error(
        'Invalid key: key must not be absolute or contain path traversal sequences',
      );
    }
    const safeKey = normalizedKey
      .split('/')
      .map((segment) =>
        segment
          .trim()
          .replace(/[^A-Za-z0-9._-]+/g, '-')
          .replace(/^[.-]+|[.-]+$/g, ''),
      )
      .filter(Boolean)
      .join('/');
    if (!safeKey) {
      throw new Error('Invalid key: resulted in empty key after sanitization');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: safeKey,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      Metadata: metadata || {},
    });

    await this.s3Client.send(command);

    return this.buildS3Url(safeKey);
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async downloadFile(key: string, timeoutMs = 30000): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    // Create AbortController for proper request cancellation
    const abortController = new AbortController();

    // Set up timeout timer
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      // Send S3 request with abort signal
      const response = await this.s3Client.send(command, {
        abortSignal: abortController.signal,
      });

      if (!response.Body) {
        throw new Error('File not found or empty');
      }

      // Clear timeout on success
      clearTimeout(timeoutId);

      // Convert stream to buffer
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (error) {
      // Clear timeout on error
      clearTimeout(timeoutId);

      // Check if error is due to abort (timeout)
      if (error.name === 'AbortError' || error.code === 'RequestAbortedError') {
        throw new Error(`Download operation timed out after ${timeoutMs}ms`);
      }

      // Re-throw other errors
      throw error;
    }
  }

  generateEvidenceKey(disputeId: string, filename: string): string {
    // Validate disputeId presence
    if (!disputeId || disputeId.trim().length === 0) {
      throw new Error('Invalid disputeId: missing or blank');
    }

    const trimmedDisputeId = disputeId.trim();

    // Reject path traversal or slash characters
    if (
      trimmedDisputeId.includes('..') ||
      trimmedDisputeId.includes('/') ||
      trimmedDisputeId.includes('\\')
    ) {
      throw new Error(
        "Invalid disputeId: must not contain path traversal ('..') or slashes",
      );
    }

    // Normalize to allowed charset [A-Za-z0-9_-], replace others with '-'
    const sanitizedDisputeId = trimmedDisputeId.replace(/[^A-Za-z0-9_-]/g, '-');

    const sanitizedFilename = this.sanitizeFilename(filename);
    return `evidence/${sanitizedDisputeId}/${uuidv4()}-${sanitizedFilename}`;
  }

  generateThumbnailKey(evidenceKey: string): string {
    const parts = evidenceKey.split('/');

    // Validate that evidenceKey has at least 3 path segments and starts with 'evidence'
    if (parts.length < 3) {
      throw new Error(
        `Invalid evidenceKey format: expected at least 3 path segments in format 'evidence/{disputeId}/{filename}', got ${parts.length}. Key: ${evidenceKey}`,
      );
    }

    // Validate that the first segment is 'evidence'
    if (parts[0] !== 'evidence') {
      throw new Error(
        `Invalid evidenceKey format: expected first segment to be 'evidence', got "${parts[0]}". Key: ${evidenceKey}`,
      );
    }

    const filename = parts[parts.length - 1];

    // Validate that filename contains an extension
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      throw new Error(
        `Invalid filename format: expected filename with extension, got "${filename}"`,
      );
    }

    const nameWithoutExt = filename.substring(0, lastDotIndex);

    // Validate that nameWithoutExt is non-empty and contains at least one alphanumeric character
    if (!nameWithoutExt || nameWithoutExt.match(/^[.-]+$/)) {
      throw new Error(
        `Invalid filename for thumbnail generation: filename "${filename}" produces invalid name without extension "${nameWithoutExt}". Filename must contain at least one alphanumeric character before the extension.`,
      );
    }

    return `thumbnails/${parts[1]}/${nameWithoutExt}-thumb.jpg`;
  }
}
