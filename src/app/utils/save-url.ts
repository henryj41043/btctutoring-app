/**
 * Starts a download from a link that answers with "attachment". A throwaway
 * anchor is clicked, so the page itself stays where it is.
 */
export function saveFromUrl(url: string, doc: Document = document): void {
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
