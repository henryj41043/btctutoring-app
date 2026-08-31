import { Routes } from '@angular/router';
import {EventCalendar} from './event-calendar/event-calendar';
import {Login} from './login/login';
import {AuthGuard} from './guards/auth.guard';
import {AdminGuard} from './guards/admin.guard';
import {ContactAccessGuard} from './guards/contact-access.guard';
import {SessionsTable} from './sessions-table/sessions-table';
import {ContactsTable} from './contacts-table/contacts-table';
import {Contact} from './contact/contact';
import {Payroll} from './payroll/payroll';
import {Billing} from './billing/billing';
import {StudentRoster} from './student-roster/student-roster';
import {Onboarding} from './onboarding/onboarding';
import {Reminders} from './reminders/reminders';
import {MakeupReport} from './makeup-report/makeup-report';
import {Teams} from './teams/teams';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'calendar',
    component: EventCalendar,
    canActivate: [AuthGuard],
  },
  {
    path: 'sessions',
    component: SessionsTable,
    canActivate: [AuthGuard],
  },
  {
    path: 'contacts',
    component: ContactsTable,
    canActivate: [AuthGuard, ContactAccessGuard],
  },
  {
    path: 'contacts/:id',
    component: Contact,
    canActivate: [AuthGuard, ContactAccessGuard],
  },
  {
    path: 'roster',
    component: StudentRoster,
    canActivate: [AuthGuard],
  },
  {
    path: 'onboarding',
    component: Onboarding,
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'reminders',
    component: Reminders,
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'makeup-report',
    component: MakeupReport,
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'unmatched-emails',
    // Lazy: an occasional admin review surface — keeps it (and its dialog)
    // out of the initial bundle, which sits right at the size budget.
    loadComponent: () =>
      import('./unmatched-emails/unmatched-emails').then(m => m.UnmatchedEmails),
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'teams',
    component: Teams,
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'scholarships',
    // Lazy: an occasional admin surface — keeps it out of the initial
    // bundle, which sits right at the size budget.
    loadComponent: () =>
      import('./scholarships/scholarships').then(m => m.Scholarships),
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'packages',
    // Lazy: an occasional admin surface — keeps it out of the initial
    // bundle, which sits right at the size budget.
    loadComponent: () =>
      import('./packages/packages').then(m => m.Packages),
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: 'payroll',
    component: Payroll,
    canActivate: [AuthGuard],
  },
  {
    path: 'billing',
    component: Billing,
    canActivate: [AuthGuard, AdminGuard],
  },
  {
    path: '**',
    redirectTo: '/login',
  }
];
