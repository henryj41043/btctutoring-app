import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToolBar } from './tool-bar';
import { AuthService } from '../services/auth.service';
import { ChangePasswordDialog } from '../change-password-dialog/change-password-dialog';

describe('ToolBar', () => {
  let component: ToolBar;
  const authService = { logout: jest.fn() };
  const router = { navigate: jest.fn() };
  const dialog = { open: jest.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ToolBar],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    component = TestBed.createComponent(ToolBar).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('logout delegates to the auth service', () => {
    component.logout();
    expect(authService.logout).toHaveBeenCalled();
  });

  it('openChangePassword opens the change-password dialog', () => {
    component.openChangePassword();
    expect(dialog.open).toHaveBeenCalledWith(ChangePasswordDialog);
  });

  it.each([
    ['calendarNav', '/calendar'],
    ['sessionsNav', '/sessions'],
    ['contactsNav', '/contacts'],
    ['rosterNav', '/roster'],
    ['onboardingNav', '/onboarding'],
    ['payrollNav', '/payroll'],
  ])('%s navigates to %s', (method, route) => {
    (component as unknown as Record<string, () => void>)[method]();
    expect(router.navigate).toHaveBeenCalledWith([route]);
  });
});
