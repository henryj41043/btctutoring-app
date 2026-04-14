import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContactsTable } from './contacts-table';

describe('ContactsTable', () => {
  let component: ContactsTable;
  let fixture: ComponentFixture<ContactsTable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactsTable]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContactsTable);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
