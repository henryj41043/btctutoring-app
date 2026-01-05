import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientDialog } from './client-dialog';

describe('ClientDialog', () => {
  let component: ClientDialog;
  let fixture: ComponentFixture<ClientDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClientDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
