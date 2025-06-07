import { ApiProperty } from "@nestjs/swagger"
import { IsString, IsNumber, Min, Max } from "class-validator"
import type { Express } from "express"

export class FileUploadDto {
  @ApiProperty({ type: "string", format: "binary", description: "File to upload" })
  file: Express.Multer.File
}

export class MultipleFileUploadDto {
  @ApiProperty({
    type: "array",
    items: { type: "string", format: "binary" },
    description: "Files to upload",
  })
  files: Express.Multer.File[]
}

export class FileValidationConfigDto {
  @ApiProperty({ description: "Maximum file size in bytes", example: 10485760 })
  @IsNumber()
  @Min(1)
  @Max(100 * 1024 * 1024) // 100MB max
  maxFileSize: number

  @ApiProperty({ description: "Allowed MIME types", example: ["image/jpeg", "image/png"] })
  @IsString({ each: true })
  allowedMimeTypes: string[]

  @ApiProperty({ description: "Maximum number of files", example: 5 })
  @IsNumber()
  @Min(1)
  @Max(20)
  maxFiles: number
}
