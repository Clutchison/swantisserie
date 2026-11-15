import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  Directive,
  inject,
  input,
  type Resource,
  TemplateRef,
} from '@angular/core';
import { LoadingAnimation } from './loading-animation';

/** What a load block's template is given once its resource has a value: that value. */
interface LoadedContext<T> {
  $implicit: Exclude<T, undefined>;
}

/**
 * Marks the template a load block shows once `appLoaded`, the resource it loads,
 * has a value, and types the template's `let-` variable as that value.
 */
@Directive({ selector: 'ng-template[appLoaded]' })
export class Loaded<T> {
  readonly resource = input.required<Resource<T>>({ alias: 'appLoaded' });
  readonly template = inject<TemplateRef<LoadedContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(_dir: Loaded<T>, ctx: unknown): ctx is LoadedContext<T> {
    return true;
  }
}

/**
 * A page's load of one resource: "Couldn't load <noun>." on a failure, the
 * page-sized loading animation while the first load is in flight, then the
 * projected `appLoaded` template given the value. A re-read keeps the value shown.
 */
@Component({
  selector: 'app-load-block',
  imports: [LoadingAnimation, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './load-block.html',
  styleUrl: './load-block.scss',
})
export class LoadBlock {
  /** What the failure says couldn't be loaded, such as "your stats" or "the webhooks". */
  readonly noun = input.required<string>();
  protected readonly loaded = contentChild.required(Loaded);
}
