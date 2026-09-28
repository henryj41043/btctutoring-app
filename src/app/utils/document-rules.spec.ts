import {
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPES,
  documentError,
  documentIcon,
  documentTypeOf,
  extensionOf,
  MAX_DOCUMENT_BYTES,
  opensInBrowser,
} from './document-rules';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('document-rules', () => {
  it('accepts the same files as the service', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(15728640);
    expect(DOCUMENT_TYPES).toEqual({
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      doc: 'application/msword',
      docx: DOCX,
    });
    expect(DOCUMENT_ACCEPT).toBe('.pdf,.jpg,.jpeg,.png,.doc,.docx');
  });

  it('reads the last extension, lowercased', () => {
    expect(extensionOf('Resume.Final.PDF')).toBe('pdf');
    expect(extensionOf('resume')).toBe('');
    expect(extensionOf('.hidden')).toBe('');
    expect(extensionOf('name.')).toBe('');
  });

  it('finds the content type from the name', () => {
    expect(documentTypeOf('cv.DOCX')).toBe(DOCX);
    expect(documentTypeOf('photo.jpeg')).toBe('image/jpeg');
    expect(documentTypeOf('archive.zip')).toBeNull();
    expect(documentTypeOf('resume')).toBeNull();
    expect(documentTypeOf('odd.constructor')).toBeNull();
  });

  describe('documentError', () => {
    it('accepts one byte and exactly 15 MB', () => {
      expect(documentError({name: 'a.pdf', size: 1})).toBeNull();
      expect(documentError({name: 'a.pdf', size: MAX_DOCUMENT_BYTES})).toBeNull();
    });

    it('refuses another kind of file, before looking at the size', () => {
      expect(documentError({name: 'a.zip', size: 0}))
        .toBe('Only PDF, Word (.doc, .docx), JPG and PNG files can be uploaded.');
    });

    it('refuses an empty file and one over 15 MB', () => {
      expect(documentError({name: 'a.pdf', size: 0})).toBe('The file is empty.');
      expect(documentError({name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1})).toBe('The file is larger than 15 MB.');
    });
  });

  it('opens PDFs and images in the browser only', () => {
    expect(opensInBrowser('application/pdf')).toBe(true);
    expect(opensInBrowser('image/jpeg')).toBe(true);
    expect(opensInBrowser('image/png')).toBe(true);
    expect(opensInBrowser('application/msword')).toBe(false);
    expect(opensInBrowser(undefined)).toBe(false);
  });

  it('picks an icon by type', () => {
    expect(documentIcon('application/pdf')).toBe('picture_as_pdf');
    expect(documentIcon('image/png')).toBe('image');
    expect(documentIcon('application/msword')).toBe('description');
    expect(documentIcon('ximage/png')).toBe('description');
    expect(documentIcon(undefined)).toBe('description');
  });
});
