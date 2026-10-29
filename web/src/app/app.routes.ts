import { Routes } from '@angular/router';
import { WebhooksPage } from './admin/webhooks-page';
import { appAdmin, SIGN_IN_PATH, signedIn } from './auth/auth';
import { SignInPage } from './auth/sign-in-page';
import { CreateDraftPage } from './drafts/create-draft-page';
import { DraftPage } from './drafts/draft-page';
import { DraftListPage } from './drafts/draft-list-page';
import { StatusPage } from './status/status-page';

export const routes: Routes = [
  { path: SIGN_IN_PATH, component: SignInPage },
  {
    // Every page but sign-in goes in here, so it is guarded by default.
    path: '',
    canActivateChild: [signedIn],
    children: [
      { path: '', component: DraftListPage },
      { path: 'drafts/new', component: CreateDraftPage },
      { path: 'drafts/:id', component: DraftPage },
      { path: 'admin/webhooks', component: WebhooksPage, canActivate: [appAdmin] },
      { path: 'status', component: StatusPage },
    ],
  },
  { path: '**', redirectTo: '' },
];
