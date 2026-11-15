/** A deadline passed before the work raced against it settled. */
export class DeadlinePassedError extends Error {
  constructor(name: string) {
    super(`The ${name} deadline passed.`);
  }
}

/**
 * A point in time, `ms` after it is set, that work on a request path waits
 * for no longer than. Racing work against it stops the wait but doesn't
 * cancel the work, which may still settle, and fill a cache, later. Several
 * pieces of work raced against one deadline share its time.
 */
export class Deadline {
  private readonly endsAt: number;

  /** `name` says what the deadline is for, as its error and logs name it. */
  constructor(
    readonly name: string,
    ms: number,
  ) {
    this.endsAt = Date.now() + ms;
  }

  /** Whether the deadline has passed. */
  get passed(): boolean {
    return Date.now() >= this.endsAt;
  }

  /**
   * What `work` answers, or throws `passedError()` (DeadlinePassedError
   * unless given) if the deadline passes before `work` settles, or had
   * already passed, even if `work` has settled.
   */
  race<T>(
    work: Promise<T>,
    passedError: () => Error = () => new DeadlinePassedError(this.name),
  ): Promise<T> {
    if (this.passed) {
      // Nobody waits on work any more, so its failure is no one's to handle.
      work.catch(() => {});
      return Promise.reject(passedError());
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const passed = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(passedError()),
        Math.max(0, this.endsAt - Date.now()),
      );
      // A deadline nobody waits on any more shouldn't hold the process open.
      timer.unref?.();
    });
    return Promise.race([work, passed]).finally(() => clearTimeout(timer));
  }
}
