import { Routes } from '@angular/router';
import {EventCalendar} from './event-calendar/event-calendar';
import {Login} from './login/login';
import {AuthGuard} from './guards/auth.guard';
import {SessionsTable} from './sessions-table/sessions-table';
import {ContactsTable} from './contacts-table/contacts-table';
import {EmployeesTable} from './employees-table/employees-table';
import {Contact} from './contact/contact';
import {Payroll} from './payroll/payroll';

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
    canActivate: [AuthGuard],
  },
  {
    path: 'contacts/:id',
    component: Contact,
    canActivate: [AuthGuard],
  },
  {
    path: 'employees',
    component: EmployeesTable,
    canActivate: [AuthGuard],
  },
  {
    path: 'payroll',
    component: Payroll,
    canActivate: [AuthGuard],
  },
  {
    path: '**',
    redirectTo: '/login',
  }
];
