/** What a failed change to the plan says when the api gives no reason, naming the plan as `planName`. */
export const planChangeFailed = (planName: string) =>
  `Couldn't change your ${planName}. Try again in a moment.`;
