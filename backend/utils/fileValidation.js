// Magic-byte (file signature) validation.
//
// multer's `fileFilter` only sees the client-supplied `mimetype`/filename before the
// bytes are read — both are trivially spoofable (rename `shell.php` to `photo.jpg`,
// or send `Content-Type: image/jpeg` with any payload). This module inspects the
// actual first bytes of an uploaded buffer against known file-format signatures so
// uploads are validated by what they *are*, not what they *claim* to be.

/**
 * @typedef {'jpeg'|'png'|'webp'|'gif'|'mp4'|'webm'|'zip'|'ole2'|'pdf'|'csv'} FileKind
 */

function matchesBytes(buffer, offset, bytes) {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

// Each detector inspects `buffer` and returns true if the signature matches.
const SIGNATURES = {
  jpeg: (buf) => matchesBytes(buf, 0, [0xff, 0xd8, 0xff]),

  png: (buf) => matchesBytes(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),

  gif: (buf) =>
    matchesBytes(buf, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || // GIF87a
    matchesBytes(buf, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),   // GIF89a

  webp: (buf) =>
    matchesBytes(buf, 0, [0x52, 0x49, 0x46, 0x46]) &&             // "RIFF"
    matchesBytes(buf, 8, [0x57, 0x45, 0x42, 0x50]),               // "WEBP"

  // ISO Base Media File Format (MP4/MOV/M4V/...): box size (4 bytes) + "ftyp"
  mp4: (buf) => matchesBytes(buf, 4, [0x66, 0x74, 0x79, 0x70]),

  // Matroska/WebM: EBML header
  webm: (buf) => matchesBytes(buf, 0, [0x1a, 0x45, 0xdf, 0xa3]),

  // ZIP-based Office Open XML (.xlsx, .docx) — can't distinguish further from bytes
  // alone without unzipping, so this only confirms "is actually a zip archive".
  zip: (buf) =>
    matchesBytes(buf, 0, [0x50, 0x4b, 0x03, 0x04]) ||
    matchesBytes(buf, 0, [0x50, 0x4b, 0x05, 0x06]) || // empty archive
    matchesBytes(buf, 0, [0x50, 0x4b, 0x07, 0x08]),   // spanned archive

  // Legacy OLE2 compound file (.xls, .doc, .ppt)
  ole2: (buf) =>
    matchesBytes(buf, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),

  pdf: (buf) => matchesBytes(buf, 0, [0x25, 0x50, 0x44, 0x46]), // "%PDF"

  // CSV has no magic bytes — accept as long as it looks like text (no NUL bytes
  // and no control chars outside common whitespace) rather than binary data
  // wearing a .csv extension.
  csv: (buf) => {
    const sample = buf.subarray(0, Math.min(buf.length, 4096));
    for (const byte of sample) {
      if (byte === 0) return false; // NUL byte => binary, not text
      const isPrintable = byte >= 0x20 && byte <= 0x7e;
      const isWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
      const isUtf8Continuation = byte >= 0x80; // allow UTF-8 multi-byte sequences
      if (!isPrintable && !isWhitespace && !isUtf8Continuation) return false;
    }
    return true;
  }
};

/**
 * Detect which of the given kinds the buffer's signature matches.
 * @param {Buffer} buffer
 * @param {FileKind[]} kinds
 * @returns {FileKind|null}
 */
export function detectFileKind(buffer, kinds) {
  if (!buffer || !buffer.length) return null;
  for (const kind of kinds) {
    const test = SIGNATURES[kind];
    if (test && test(buffer)) return kind;
  }
  return null;
}

/**
 * Validate that `buffer` matches one of the allowed signatures.
 * @param {Buffer} buffer
 * @param {FileKind[]} allowedKinds
 * @returns {boolean}
 */
export function isAllowedFileSignature(buffer, allowedKinds) {
  return detectFileKind(buffer, allowedKinds) !== null;
}

const IMAGE_KINDS = ['jpeg', 'png', 'webp', 'gif'];
const VIDEO_KINDS = ['mp4', 'webm'];

/**
 * Express middleware factory: verifies req.file (single upload, memoryStorage)
 * has a real signature matching one of `allowedKinds`. Responds 400 and stops
 * the request if the file's actual bytes don't match any allowed signature.
 * Must run AFTER multer (so req.file.buffer is populated).
 *
 * @param {FileKind[]} allowedKinds
 * @param {object} [opts]
 * @param {string} [opts.field] - field name for the error message
 */
export function verifyFileSignature(allowedKinds, opts = {}) {
  return (req, res, next) => {
    const file = req.file;
    if (!file) return next(); // let downstream "no file provided" checks handle this

    if (!isAllowedFileSignature(file.buffer, allowedKinds)) {
      return res.status(400).json({
        success: false,
        message: `Invalid or unsupported ${opts.field || 'file'} content. The file's actual format doesn't match an allowed type.`
      });
    }
    next();
  };
}

/** Convenience middleware: image uploads only (JPEG/PNG/WebP/GIF). */
export function verifyImageSignature(opts = {}) {
  return verifyFileSignature(IMAGE_KINDS, opts);
}

/** Convenience middleware: image or video uploads (JPEG/PNG/WebP/GIF/MP4/WebM). */
export function verifyImageOrVideoSignature(opts = {}) {
  return verifyFileSignature([...IMAGE_KINDS, ...VIDEO_KINDS], opts);
}

// Which signature kind(s) are legitimate for each accepted bulk-upload document
// extension. xlsx/docx are OOXML (zip); xls is legacy OLE2; csv is plain text;
// pdf has its own header.
const DOCUMENT_KINDS_BY_EXT = {
  xlsx: ['zip'],
  xls: ['ole2'],
  csv: ['csv'],
  docx: ['zip'],
  pdf: ['pdf']
};

/**
 * Express middleware: verifies req.file's actual bytes match the signature
 * expected for its claimed extension (before it's handed to
 * exceljs/mammoth/pdf-parse). Rejects mismatches — e.g. a renamed binary
 * masquerading as .xlsx/.docx/.pdf. Must run AFTER multer.
 */
export function verifyDocumentSignature() {
  return (req, res, next) => {
    const file = req.file;
    if (!file) return next();

    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    const allowedKinds = DOCUMENT_KINDS_BY_EXT[ext];
    if (!allowedKinds || !isAllowedFileSignature(file.buffer, allowedKinds)) {
      return res.status(400).json({
        success: false,
        message: `The uploaded file's content doesn't match a valid .${ext || '?'} file.`
      });
    }
    next();
  };
}

export { IMAGE_KINDS, VIDEO_KINDS };
