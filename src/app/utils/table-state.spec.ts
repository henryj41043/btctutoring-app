import { EventEmitter } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { TableStateStore } from './table-state';

describe('TableStateStore', () => {
  beforeEach(() => sessionStorage.clear());

  it('load returns empty state when nothing is saved or storage is corrupt', () => {
    const store = new TableStateStore('k');
    expect(store.load()).toEqual({});
    sessionStorage.setItem('k', '{not json');
    expect(store.load()).toEqual({});
    sessionStorage.setItem('k', '"just a string"');
    expect(store.load()).toEqual({});
  });

  it('patch merges into the existing state', () => {
    const store = new TableStateStore('k');
    store.patch({ pageIndex: 2 });
    store.patch({ sortActive: 'name', sortDirection: 'desc' });
    expect(store.load()).toEqual({ pageIndex: 2, sortActive: 'name', sortDirection: 'desc' });
  });

  it('attachSort restores the saved sort and records changes', () => {
    const store = new TableStateStore('k');
    store.patch({ sortActive: 'date', sortDirection: 'desc' });
    const sort = { sortChange: new EventEmitter<Sort>() } as unknown as MatSort;
    store.attachSort(sort);
    expect(sort.active).toBe('date');
    expect(sort.direction).toBe('desc');
    sort.sortChange.emit({ active: 'name', direction: 'asc' });
    expect(store.load().sortActive).toBe('name');
    expect(store.load().sortDirection).toBe('asc');
  });

  it('attachSort defaults direction to asc and leaves fresh sorts untouched', () => {
    const store = new TableStateStore('k');
    store.patch({ sortActive: 'date' });
    const sort = { sortChange: new EventEmitter<Sort>() } as unknown as MatSort;
    store.attachSort(sort);
    expect(sort.direction).toBe('asc');

    const untouched = { sortChange: new EventEmitter<Sort>() } as unknown as MatSort;
    new TableStateStore('other').attachSort(untouched);
    expect(untouched.active).toBeUndefined();
  });

  it('attachPaginator restores page index/size and records changes', () => {
    const store = new TableStateStore('k');
    store.patch({ pageIndex: 3, pageSize: 25 });
    const paginator = { page: new EventEmitter<PageEvent>() } as unknown as MatPaginator;
    store.attachPaginator(paginator);
    expect(paginator.pageIndex).toBe(3);
    expect(paginator.pageSize).toBe(25);
    paginator.page.emit({ pageIndex: 1, pageSize: 50, length: 100 });
    expect(store.load().pageIndex).toBe(1);
    expect(store.load().pageSize).toBe(50);
  });

  it('keys are independent', () => {
    new TableStateStore('a').patch({ pageIndex: 1 });
    new TableStateStore('b').patch({ pageIndex: 9 });
    expect(new TableStateStore('a').load().pageIndex).toBe(1);
    expect(new TableStateStore('b').load().pageIndex).toBe(9);
  });
});
