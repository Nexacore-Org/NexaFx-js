import { Test, type TestingModule } from "@nestjs/testing"
import { FileUploadService } from "./file-upload.service"
import { ConfigService } from "@nestjs/config"
import type { Express } from "express"

describe("FileUploadService", () => {
  let service: FileUploadService
  let configService: ConfigService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                UPLOAD_PATH: "./test-uploads",
                MAX_FILE_SIZE: 10 * 1024 * 1024,
                MAX_FILES: 5,
              }
              return config[key] || defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<FileUploadService>(FileUploadService)
    configService = module.get<ConfigService>(ConfigService)
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("validateFile", () => {
    it("should reject files with dangerous extensions", async () => {
      const mockFile = {
        originalname: "malicious.exe",
        mimetype: "application/octet-stream",
        size: 1024,
        buffer: Buffer.from("test"),
      } as Express.Multer.File

      const result = await service.validateFile(mockFile)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain("File extension .exe is not allowed")
    })

    it("should reject files with invalid MIME types", async () => {
      const mockFile = {
        originalname: "test.txt",
        mimetype: "application/x-executable",
        size: 1024,
        buffer: Buffer.from("test"),
      } as Express.Multer.File

      const result = await service.validateFile(mockFile)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain("File type application/x-executable is not allowed")
    })

    it("should accept valid image files", async () => {
      const mockFile = {
        originalname: "test.jpg",
        mimetype: "image/jpeg",
        size: 1024,
        buffer: Buffer.from("test"),
      } as Express.Multer.File

      // Mock sharp validation
      jest.spyOn(service as any, "validateImageFile").mockResolvedValue(undefined)
      jest.spyOn(service as any, "scanForMalware").mockResolvedValue({ isClean: true })

      const result = await service.validateFile(mockFile)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should reject files with path traversal attempts", async () => {
      const mockFile = {
        originalname: "../../../etc/passwd",
        mimetype: "text/plain",
        size: 1024,
        buffer: Buffer.from("test"),
      } as Express.Multer.File

      const result = await service.validateFile(mockFile)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain("Invalid filename detected")
    })
  })

  describe("sanitizeFilename", () => {
    it("should remove special characters", () => {
      const result = service.sanitizeFilename("test@#$%file.txt")
      expect(result).toBe("test____file.txt")
    })

    it("should limit filename length", () => {
      const longName = "a".repeat(300) + ".txt"
      const result = service.sanitizeFilename(longName)
      expect(result.length).toBeLessThanOrEqual(255)
    })
  })
})
