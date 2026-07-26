import {
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Detect MIME type from magic bytes for the three allowed document types. */
function detectMimeType(buf: Buffer): string | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // PDF: 25 50 44 46 (%PDF)
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  return null;
}

@Injectable()
export class KycFileValidationService {
  /**
   * Validates file size and MIME type from magic bytes.
   * Throws 413 if file exceeds 10 MB, 415 if type is not JPEG/PNG/PDF.
   */
  validate(buffer: Buffer): void {
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException('File must not exceed 10 MB');
    }

    const mime = detectMimeType(buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG, and PDF files are accepted',
      );
    }
  }
}
