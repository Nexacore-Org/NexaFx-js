import { Module } from "@nestjs/common"
import { MulterModule } from "@nestjs/platform-express"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { FileUploadController } from "./file-upload.controller"
import { FileUploadService } from "./file-upload.service"
import { diskStorage } from "multer"
import { extname, join } from "path"
import { existsSync, mkdirSync } from "fs"
import { v4 as uuidv4 } from "uuid"

@Module({
  imports: [
    ConfigModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uploadPath = configService.get<string>("UPLOAD_PATH", "./uploads")

        // Ensure upload directory exists
        if (!existsSync(uploadPath)) {
          mkdirSync(uploadPath, { recursive: true })
        }

        return {
          storage: diskStorage({
            destination: (req, file, cb) => {
              // Create subdirectories based on file type for better organization
              const fileType = file.mimetype.split("/")[0]
              const subDir = join(uploadPath, fileType)

              if (!existsSync(subDir)) {
                mkdirSync(subDir, { recursive: true })
              }

              cb(null, subDir)
            },
            filename: (req, file, cb) => {
              // Generate unique filename to prevent conflicts
              const uniqueName = `${uuidv4()}${extname(file.originalname)}`
              cb(null, uniqueName)
            },
          }),
          limits: {
            fileSize: configService.get<number>("MAX_FILE_SIZE", 10 * 1024 * 1024), // 10MB default
            files: configService.get<number>("MAX_FILES", 5), // 5 files max
          },
        }
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [FileUploadController],
  providers: [FileUploadService],
  exports: [FileUploadService],
})
export class FileUploadModule {}
