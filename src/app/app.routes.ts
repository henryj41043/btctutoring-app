import { Routes } from '@angular/router';
import {EventCalendar} from './event-calendar/event-calendar';
import {Login} from './login/login';
import {AuthGuard} from './guards/auth.guard';
import {ContactAccessGuard} from './guards/contact-access.guard';
import {SessionsTable} from './sessions-table/sessions-table';
import {ContactsTable} from './contacts-table/contacts-table';
import {Contact} from './contact/contact';
import {Payroll} from './payroll/payroll';
import {Billing} from './billing/billing';
import {StudentRoster} from './student-roster/student-roster';

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
    path: 'payroll',
    component: Payroll,
    canActivate: [AuthGuard],
  },
  {
    path: 'billing',
    component: Billing,
    canActivate: [AuthGuard],
  },
  {
    path: '**',
    redirectTo: '/login',
  }
];
