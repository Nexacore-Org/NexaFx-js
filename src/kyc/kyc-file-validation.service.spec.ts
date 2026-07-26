import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { KycFileValidationService } from './kyc-file-validation.service';

// Real magic byte headers
const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pdfHeader = Buffer.from('%PDF-1.4');
const exeHeader = Buffer.from([0x4d, 0x5a]); // MZ

const pad = (header: Buffer, size = 64) =>
  Buffer.concat([header, Buffer.alloc(size)]);

describe('KycFileValidationService', () => {
  let service: KycFileValidationService;

  beforeEach(() => {
    service = new KycFileValidationService();
  });

  it('accepts a valid JPEG file', () => {
    expect(() => service.validate(pad(jpegHeader))).not.toThrow();
  });

  it('accepts a valid PNG file', () => {
    expect(() => service.validate(pad(pngHeader))).not.toThrow();
  });

  it('accepts a valid PDF file', () => {
    expect(() => service.validate(pad(pdfHeader))).not.toThrow();
  });

  it('throws 415 for an executable (EXE magic bytes)', () => {
    expect(() => service.validate(pad(exeHeader))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('throws 415 for a buffer with no recognizable magic bytes', () => {
    expect(() => service.validate(Buffer.alloc(200, 0x00))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('throws 413 when file exceeds 10 MB', () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    expect(() => service.validate(oversized)).toThrow(PayloadTooLargeException);
  });

  it('throws 413 before checking MIME type (size check first)', () => {
    // Valid JPEG header but oversized
    const oversized = Buffer.concat([jpegHeader, Buffer.alloc(10 * 1024 * 1024)]);
    expect(() => service.validate(oversized)).toThrow(PayloadTooLargeException);
  });
});
