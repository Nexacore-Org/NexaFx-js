import { Injectable, BadRequestException, InternalServerErrorException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import { promises as fs } from "fs"
import { extname } from "path"
import { createHash } from "crypto"
import * as sharp from "sharp"
import type { Express } from "express"

export interface FileValidationResult {
  isValid: boolean
  errors: string[]
  sanitizedFile?: Express.Multer.File
}

export interface UploadResult {
  filename: string
  originalName: string
  size: number
  mimetype: string
  path: string
  hash: string
  uploadedAt: Date
}

@Injectable()
export class FileUploadService {
  private readonly allowedMimeTypes = new Set([
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    // Documents
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Archives
    "application/zip",
    "application/x-rar-compressed",
  ])

  private readonly dangerousExtensions = new Set([
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".pif",
    ".scr",
    ".vbs",
    ".js",
    ".jar",
    ".app",
    ".deb",
    ".pkg",
    ".dmg",
    ".rpm",
    ".msi",
    ".run",
    ".bin",
  ])

  private readonly maxFileSizes = new Map([
    ["image", 5 * 1024 * 1024], // 5MB for images
    ["application", 10 * 1024 * 1024], // 10MB for documents
    ["text", 1 * 1024 * 1024], // 1MB for text files
  ])

  constructor(private readonly configService: ConfigService) {}

  async validateFile(file: Express.Multer.File): Promise<FileValidationResult> {
    const errors: string[] = []

    // Check if file exists
    if (!file) {
      errors.push("No file provided")
      return { isValid: false, errors }
    }

    // Validate file size
    const fileType = file.mimetype.split("/")[0]
    const maxSize = this.maxFileSizes.get(fileType) || 10 * 1024 * 1024

    if (file.size > maxSize) {
      errors.push(`File size exceeds limit of ${maxSize / (1024 * 1024)}MB`)
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      errors.push(`File type ${file.mimetype} is not allowed`)
    }

    // Validate file extension
    const fileExtension = extname(file.originalname).toLowerCase()
    if (this.dangerousExtensions.has(fileExtension)) {
      errors.push(`File extension ${fileExtension} is not allowed`)
    }

    // Validate filename (prevent path traversal)
    if (file.originalname.includes("..") || file.originalname.includes("/") || file.originalname.includes("\\")) {
      errors.push("Invalid filename detected")
    }

    // Additional validation for images
    if (fileType === "image") {
      try {
        await this.validateImageFile(file)
      } catch (error) {
        errors.push("Invalid image file or corrupted image")
      }
    }

    // Scan for malicious content
    const malwareCheckResult = await this.scanForMalware(file)
    if (!malwareCheckResult.isClean) {
      errors.push("File contains potentially malicious content")
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFile: errors.length === 0 ? file : undefined,
    }
  }

  private async validateImageFile(file: Express.Multer.File): Promise<void> {
    try {
      // Use sharp to validate image integrity
      const metadata = await sharp(file.buffer || file.path).metadata()

      // Check for reasonable image dimensions
      if (metadata.width && metadata.height) {
        const maxDimension = 10000 // 10k pixels max
        if (metadata.width > maxDimension || metadata.height > maxDimension) {
          throw new Error("Image dimensions too large")
        }
      }
    } catch (error) {
      throw new BadRequestException("Invalid or corrupted image file")
    }
  }

  private async scanForMalware(file: Express.Multer.File): Promise<{ isClean: boolean; details?: string }> {
    try {
      // Basic content scanning - check for suspicious patterns
      const fileContent = file.buffer || (await fs.readFile(file.path))

      // Check for common malware signatures (basic implementation)
      const suspiciousPatterns = [
        /eval\s*\(/gi,
        /exec\s*\(/gi,
        /system\s*\(/gi,
        /<script[^>]*>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
      ]

      const contentString = fileContent.toString("utf8", 0, Math.min(fileContent.length, 1024 * 10)) // Check first 10KB

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(contentString)) {
          return { isClean: false, details: "Suspicious content pattern detected" }
        }
      }

      // Additional checks for specific file types
      if (file.mimetype === "image/svg+xml") {
        return this.validateSvgContent(contentString)
      }

      return { isClean: true }
    } catch (error) {
      // If scanning fails, err on the side of caution
      return { isClean: false, details: "Unable to scan file content" }
    }
  }

  private validateSvgContent(content: string): { isClean: boolean; details?: string } {
    // SVG-specific validation
    const dangerousSvgPatterns = [
      /<script/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // Event handlers
      /<foreignObject/gi,
      /<use\s+href\s*=\s*["']data:/gi,
    ]

    for (const pattern of dangerousSvgPatterns) {
      if (pattern.test(content)) {
        return { isClean: false, details: "Potentially malicious SVG content" }
      }
    }

    return { isClean: true }
  }

  async processUpload(file: Express.Multer.File): Promise<UploadResult> {
    // Validate file first
    const validation = await this.validateFile(file)
    if (!validation.isValid) {
      throw new BadRequestException(`File validation failed: ${validation.errors.join(", ")}`)
    }

    try {
      // Generate file hash for integrity checking
      const fileContent = file.buffer || (await fs.readFile(file.path))
      const hash = createHash("sha256").update(fileContent).digest("hex")

      // Set restrictive file permissions (readable only by owner)
      if (file.path) {
        await fs.chmod(file.path, 0o600)
      }

      return {
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
        hash,
        uploadedAt: new Date(),
      }
    } catch (error) {
      // Clean up file if processing fails
      if (file.path) {
        try {
          await fs.unlink(file.path)
        } catch (unlinkError) {
          console.error("Failed to clean up file:", unlinkError)
        }
      }
      throw new InternalServerErrorException("Failed to process file upload")
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      throw new InternalServerErrorException("Failed to delete file")
    }
  }

  async getFileInfo(filePath: string): Promise<{ exists: boolean; stats?: any }> {
    try {
      const stats = await fs.stat(filePath)
      return { exists: true, stats }
    } catch (error) {
      return { exists: false }
    }
  }

  // Utility method to sanitize filename
  sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, "_") // Replace special chars with underscore
      .replace(/_{2,}/g, "_") // Replace multiple underscores with single
      .substring(0, 255) // Limit length
  }
}
