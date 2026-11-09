import {HttpErrorResponse} from '@angular/common/http';

/**
 * The service's own explanation of a refusal (a 400/403/404, or the 409 that
 * names a double-booking), else the fallback for a plain failure.
 */
export function messageOf(error: HttpErrorResponse | unknown, fallback: string): string {
  const message: unknown = (error as {error?: {message?: unknown}} | null | undefined)?.error?.message;
  return typeof message === 'string' && message ? message : fallback;
}
