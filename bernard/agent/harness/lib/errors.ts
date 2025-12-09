export class HarnessTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessTimeoutError";
  }
}

export class HarnessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessConfigError";
  }
}


