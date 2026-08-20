import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';

export interface BatchNoteDialogData {
  /** How many contacts the note will be attached to (the filtered set). */
  count: number;
}

/**
 * Collects ONE note message to attach to every currently-filtered contact.
 * The dialog itself only gathers the text — the contacts table performs the
 * per-contact creates so it can report a success/failure summary. The count
 * in the copy IS the confirmation step.
 */
@Component({
  selector: 'app-batch-note-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './batch-note-dialog.html',
  styleUrl: './batch-note-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class BatchNoteDialog {
  protected data: BatchNoteDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef: MatDialogRef<BatchNoteDialog, string | null> = inject(MatDialogRef);

  protected message: string = '';

  protected get trimmed(): string {
    return this.message.trim();
  }

  save(): void {
    if (!this.trimmed) {
      return;
    }
    this.dialogRef.close(this.trimmed);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
