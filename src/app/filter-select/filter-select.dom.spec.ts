import {Component} from '@angular/core';
import {ComponentFixture, TestBed, fakeAsync, tick} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {FilterSelect, FilterSelectOption} from './filter-select';

/**
 * Real-DOM regression suite: drives the ACTUAL input events and overlay
 * option clicks (the API-level spec calls handlers directly, which is exactly
 * how the click-eating and dead-refiltering bugs slipped through).
 */
@Component({
  template: `<app-filter-select label="Contact" [options]="options" [(ngModel)]="value"/>`,
  imports: [FilterSelect, FormsModule],
})
class Host {
  // A getter yielding a FRESH array every read, exactly like the production
  // dialogs' contactOptions getters — each CD cycle fires the child's
  // ngOnChanges (the dead-refiltering bug's trigger).
  get options(): FilterSelectOption[] {
    return [
      {value: 'c-1', label: 'Casey Lee'},
      {value: 'c-2', label: 'Jordan Casey'},
      {value: 'c-3', label: 'Josh Henry'},
    ];
  }
  value: string | null = null;
}

describe('FilterSelect (DOM)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const input = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input');
  const overlayOptions = (): string[] =>
    Array.from(document.querySelectorAll('mat-option:not(.mdc-list-item--disabled)'))
      .map(o => (o.textContent ?? '').trim());

  const type = (text: string): void => {
    const el = input();
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    tick();
    fixture.detectChanges();
  };

  const clickOption = (label: string): void => {
    const option = Array.from(document.querySelectorAll('mat-option'))
      .find(o => (o.textContent ?? '').trim() === label) as HTMLElement;
    expect(option).toBeTruthy();
    option.click();
    tick();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(n => n.remove());
  });

  it('typing filters, clicking a filtered option selects it', fakeAsync(() => {
    type('jos');
    expect(overlayOptions()).toEqual(['Josh Henry']);
    clickOption('Josh Henry');
    expect(host.value).toBe('c-3');
    expect(input().value).toBe('Josh Henry');
  }));

  it('editing the text AFTER a selection filters again (regression)', fakeAsync(() => {
    type('jos');
    clickOption('Josh Henry');

    // Delete down to 'Jo' — the list must narrow to the two Jo* contacts.
    type('Jo');
    expect(overlayOptions()).toEqual(['Jordan Casey', 'Josh Henry']);

    // Clear entirely — full list again, then a fresh filter still works.
    type('');
    expect(overlayOptions()).toEqual(['Casey Lee', 'Jordan Casey', 'Josh Henry']);
    type('casey');
    expect(overlayOptions()).toEqual(['Casey Lee', 'Jordan Casey']);

    // And a second pick still lands.
    clickOption('Casey Lee');
    expect(host.value).toBe('c-1');
    expect(input().value).toBe('Casey Lee');
  }));
});
