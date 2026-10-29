import { Routes } from '@angular/router';
import { SIGN_IN_PATH, signedIn } from './auth/auth';
import { SignInPage } from './auth/sign-in-page';
import { StatusPage } from './status/status-page';

export const routes: Routes = [
  { path: SIGN_IN_PATH, component: SignInPage },
  {
    // Every page but sign-in goes in here, so it is guarded by default.
    path: '',
    canActivateChild: [signedIn],
    children: [{ path: '', component: StatusPage }],
  },
  { path: '**', redirectTo: '' },
];
