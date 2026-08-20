import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BatchNoteDialog } from './batch-note-dialog';

describe('BatchNoteDialog', () => {
  const dialogRef = { close: jest.fn() };

  const build = (count = 3): BatchNoteDialog => {
    TestBed.configureTestingModule({
      imports: [BatchNoteDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { count } },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    return TestBed.createComponent(BatchNoteDialog).componentInstance;
  };

  it('saves the trimmed message', () => {
    const c = build();
    (c as unknown as { message: string }).message = '  Timesheets due Friday.  ';
    c.save();
    expect(dialogRef.close).toHaveBeenCalledWith('Timesheets due Friday.');
  });

  it('refuses to save a blank message', () => {
    const c = build();
    (c as unknown as { message: string }).message = '   ';
    c.save();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('cancel closes with null', () => {
    const c = build();
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(null);
  });
});
