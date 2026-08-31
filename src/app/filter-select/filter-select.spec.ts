import {TestBed} from '@angular/core/testing';
import {MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {FilterSelect, FilterSelectOption} from './filter-select';
import {SimpleChange} from '@angular/core';

const options: FilterSelectOption[] = [
  {value: 'c-1', label: 'Casey Lee'},
  {value: 'c-2', label: 'Jordan Casey'},
  {value: 'c-3', label: 'newsletter@example.com'},
];

describe('FilterSelect', () => {
  let onChange: jest.Mock;
  let onTouched: jest.Mock;

  const build = (): FilterSelect => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({imports: [FilterSelect]});
    const c = TestBed.createComponent(FilterSelect).componentInstance;
    c.options = options;
    onChange = jest.fn();
    onTouched = jest.fn();
    c.registerOnChange(onChange);
    c.registerOnTouched(onTouched);
    return c;
  };

  const priv = (c: FilterSelect) => c as unknown as {
    searchText: string;
    disabled: boolean;
    displayLabel: (value: string | null) => string;
  };
  const selectEvent = (value: string): MatAutocompleteSelectedEvent =>
    ({option: {value}} as MatAutocompleteSelectedEvent);

  it('filters options case-insensitively by substring', () => {
    const c = build();
    c.onSearchChange('casey');
    expect(c.filteredOptions.map(o => o.value)).toEqual(['c-1', 'c-2']);
    c.onSearchChange('NEWSLETTER');
    expect(c.filteredOptions.map(o => o.value)).toEqual(['c-3']);
    c.onSearchChange('zzz');
    expect(c.filteredOptions).toEqual([]);
  });

  it('shows the full list with no filter text', () => {
    const c = build();
    expect(c.filteredOptions).toHaveLength(3);
  });

  it('selecting an option emits the value and shows its label', () => {
    const c = build();
    c.onOptionSelected(selectEvent('c-2'));
    expect(onChange).toHaveBeenCalledWith('c-2');
    expect(priv(c).searchText).toBe('Jordan Casey');
    expect(onTouched).toHaveBeenCalled();
  });

  it('reopening with the selected label showing lists everything again', () => {
    const c = build();
    c.onOptionSelected(selectEvent('c-1'));
    // searchText === selected label -> unfiltered, so switching is easy.
    expect(c.filteredOptions).toHaveLength(3);
  });

  it('panel close with free text reverts to the selection (text never leaks)', () => {
    const c = build();
    c.writeValue('c-1');
    c.onSearchChange('garbage typing');
    c.onPanelClosed();
    expect(priv(c).searchText).toBe('Casey Lee');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('panel close with an exact label match selects that option', () => {
    const c = build();
    c.onSearchChange('jordan casey');
    c.onPanelClosed();
    expect(onChange).toHaveBeenCalledWith('c-2');
    expect(priv(c).searchText).toBe('Jordan Casey');
  });

  it('clearable: emptying the input clears the selection on panel close', () => {
    const c = build();
    c.clearable = true;
    c.writeValue('c-1');
    c.onSearchChange('');
    c.onPanelClosed();
    expect(onChange).toHaveBeenCalledWith(null);
    expect(priv(c).searchText).toBe('');
  });

  it('non-clearable: emptying the input restores the selection', () => {
    const c = build();
    c.writeValue('c-1');
    c.onSearchChange('');
    c.onPanelClosed();
    expect(onChange).not.toHaveBeenCalled();
    expect(priv(c).searchText).toBe('Casey Lee');
  });

  it('clicking a filtered option keeps the pick — the panel close after a selection never re-resolves', () => {
    // Regression: live, a click emits optionSelected THEN closed. The old
    // input-blur revert ran mid-click and ate the selection entirely.
    const c = build();
    c.onSearchChange('jos'); // free text that matches no label exactly
    c.onOptionSelected(selectEvent('c-1'));
    c.onPanelClosed();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('c-1');
    expect(priv(c).searchText).toBe('Casey Lee');

    // Only the close immediately after a pick is skipped: a later close with
    // free text still resolves normally.
    c.onSearchChange('garbage');
    c.onPanelClosed();
    expect(priv(c).searchText).toBe('Casey Lee');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('writeValue renders the label, even when options arrive later', () => {
    const c = build();
    c.options = [];
    c.writeValue('c-3');
    expect(priv(c).searchText).toBe('');
    c.options = options;
    c.ngOnChanges({options: new SimpleChange([], options, false)});
    expect(priv(c).searchText).toBe('newsletter@example.com');
  });

  it('displayLabel maps values and tolerates null/unknown', () => {
    const c = build();
    expect(priv(c).displayLabel('c-1')).toBe('Casey Lee');
    expect(priv(c).displayLabel(null)).toBe('');
    expect(priv(c).displayLabel('ghost')).toBe('ghost');
  });

  it('setDisabledState toggles the disabled flag', () => {
    const c = build();
    c.setDisabledState(true);
    expect(priv(c).disabled).toBe(true);
    c.setDisabledState(false);
    expect(priv(c).disabled).toBe(false);
  });
});
