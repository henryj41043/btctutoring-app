/**
 * What may be uploaded to a contact. A copy of the service's rules, so a wrong
 * file is refused at once; the service remains the authority.
 */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Extension → content type. The extension decides: browsers leave `type` empty for some files. */
export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES).map(extension => `.${extension}`).join(',');

const INLINE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The content type for a file name, or null when that kind of file is not accepted. */
export function documentTypeOf(name: string): string | null {
  const extension = extensionOf(name);
  return Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, extension) ? DOCUMENT_TYPES[extension] : null;
}

/** Why a file cannot be uploaded, or null when it can. */
export function documentError(file: {name: string; size: number}): string | null {
  if (!documentTypeOf(file.name)) {
    return 'Only PDF, Word (.doc, .docx), JPG and PNG files can be uploaded.';
  }
  if (file.size < 1) {
    return 'The file is empty.';
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return 'The file is larger than 15 MB.';
  }
  return null;
}

/** PDFs and images open in the browser; everything else downloads. */
export function opensInBrowser(contentType: string | undefined): boolean {
  return INLINE_TYPES.includes(contentType ?? '');
}

export function documentIcon(contentType: string | undefined): string {
  if (contentType === 'application/pdf') {
    return 'picture_as_pdf';
  }
  return (contentType ?? '').startsWith('image/') ? 'image' : 'description';
}
