/** The top bar's Admin button, whatever unreviewed count its label shows. */
export function adminButton(page: HTMLElement) {
  return [...page.querySelectorAll<HTMLButtonElement>('header button')].find((button) =>
    button.textContent?.trim().startsWith('Admin'),
  )!;
}
