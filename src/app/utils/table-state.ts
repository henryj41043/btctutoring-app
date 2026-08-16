import {MatPaginator} from '@angular/material/paginator';
import {MatSort, SortDirection} from '@angular/material/sort';

/**
 * Per-table view state persisted for the browser session so navigating to a
 * detail page and back never loses the admin's place (client request: the
 * filter→open contact→back workflow reset to page 1 every time).
 */
export interface TableViewState {
  pageIndex?: number;
  pageSize?: number;
  sortActive?: string;
  sortDirection?: SortDirection;
  /** Plain-text search box value, for tables that have one. */
  filter?: string;
  /** Table-specific extras (selected month, toggles, …). */
  extra?: Record<string, unknown>;
}

/**
 * sessionStorage-backed store for one table's view state. Storage failures
 * (private mode, quota) silently degrade to no persistence; corrupt payloads
 * read as empty. Fresh tabs start clean by design (session scope).
 */
export class TableStateStore {
  constructor(private readonly key: string) {}

  load(): TableViewState {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as TableViewState;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  patch(partial: Partial<TableViewState>): void {
    try {
      sessionStorage.setItem(this.key, JSON.stringify({...this.load(), ...partial}));
    } catch { /* storage unavailable — state just doesn't persist */ }
  }

  /**
   * Restores the saved sort onto a (fresh) MatSort and records changes.
   * Call BEFORE assigning dataSource.sort so the first render sees it.
   */
  attachSort(sort: MatSort): void {
    const saved = this.load();
    if (saved.sortActive) {
      sort.active = saved.sortActive;
      sort.direction = saved.sortDirection ?? 'asc';
    }
    // Optional-chained: unit specs stub bare objects without the emitter.
    sort.sortChange?.subscribe(e =>
      this.patch({sortActive: e.active, sortDirection: e.direction}));
  }

  /**
   * Restores page index/size onto a (fresh) MatPaginator and records changes.
   * Call BEFORE assigning dataSource.paginator so the first render sees it.
   */
  attachPaginator(paginator: MatPaginator): void {
    const saved = this.load();
    if (saved.pageSize != null) {
      paginator.pageSize = saved.pageSize;
    }
    if (saved.pageIndex != null) {
      paginator.pageIndex = saved.pageIndex;
    }
    // Optional-chained: unit specs stub bare objects without the emitter.
    paginator.page?.subscribe(e =>
      this.patch({pageIndex: e.pageIndex, pageSize: e.pageSize}));
  }
}
