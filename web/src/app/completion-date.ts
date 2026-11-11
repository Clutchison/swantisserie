import { formatDate } from '@angular/common';
import { inject, LOCALE_ID, Pipe, type PipeTransform } from '@angular/core';

/**
 * A complete tournament's date, from its completion time, such as
 * Nov 10, 2026; a dash for one completed before completion times were kept.
 */
@Pipe({ name: 'completionDate' })
export class CompletionDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(completedAt: string | null): string {
    return completedAt ? formatDate(completedAt, 'mediumDate', this.locale) : '–';
  }
}
