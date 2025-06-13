import { Test, TestingModule } from '@nestjs/testing';
import { FileUploadService } from '../file-upload.service';
import { FileValidationService } from '../file-validation.service';
import { AntivirusService } from '../antivirus.service';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileUploadService', () => {
  let service: FileUploadService;
  let validationService: FileValidationService;
  let antivirusService: AntivirusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: FileValidationService,
          useValue: {
            validateFile: jest.fn(),
          },
        },
        {
          provide: AntivirusService,
          useValue: {
            scanFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);
    validationService = module.get<FileValidationService>(FileValidationService);
    antivirusService = module.get<AntivirusService>(AntivirusService);
  });

  describe('processFile', () => {
    it('should process a valid file successfully', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        destination: './uploads',
        filename: 'test.jpg',
        path: './uploads/test.jpg',
        buffer: Buffer.from(''),
        stream: null,
      };

      jest.spyOn(validationService, 'validateFile').mockResolvedValue({
        isValid: true,
        errors: [],
        mimeTypeValid: true,
        sizeValid: true,
        extensionValid: true,
      });

      // Mock file system operations
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'rename').mockResolvedValue(undefined);

      const result = await service.processFile(mockFile);

      expect(result).toMatchObject({
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        secure: true,
      });
    });

    it('should reject invalid files', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'malware.exe',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: 1024,
        destination: './uploads',
        filename: 'malware.exe',
        path: './uploads/malware.exe',
        buffer: Buffer.from(''),
        stream: null,
      };

      jest.spyOn(validationService, 'validateFile').mockResolvedValue({
        isValid: false,
        errors: ['Dangerous file extension: .exe'],
        mimeTypeValid: false,
        sizeValid: true,
        extensionValid: false,
      });

      jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await expect(service.processFile(mockFile)).rejects.toThrow(
        'File validation failed: Dangerous file extension: .exe',
      );
    });

    it('should handle antivirus scanning when enabled', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        destination: './uploads',
        filename: 'test.pdf',
        path: './uploads/test.pdf',
        buffer: Buffer.from(''),
        stream: null,
      };

      jest.spyOn(validationService, 'validateFile').mockResolvedValue({
        isValid: true,
        errors: [],
        mimeTypeValid: true,
        sizeValid: true,
        extensionValid: true,
      });

      jest.spyOn(antivirusService, 'scanFile').mockResolvedValue({
        clean: true,
        engine: 'ClamAV',
      });

      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'rename').mockResolvedValue(undefined);

      const result = await service.processFile(mockFile, { enableAntivirus: true });

      expect(antivirusService.scanFile).toHaveBeenCalledWith('./uploads/test.pdf');
      expect(result.validations.antivirus).toBe(true);
    });
  });
});
