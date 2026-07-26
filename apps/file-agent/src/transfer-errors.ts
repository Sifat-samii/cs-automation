export type TransferErrorClass = "TRANSIENT" | "PERMANENT";

export class TransferFailure extends Error {
  readonly errorClass: TransferErrorClass;

  constructor(errorClass: TransferErrorClass, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransferFailure";
    this.errorClass = errorClass;
  }
}

export class TransientTransferFailure extends TransferFailure {
  constructor(message: string, options?: ErrorOptions) {
    super("TRANSIENT", message, options);
    this.name = "TransientTransferFailure";
  }
}

export class PermanentTransferFailure extends TransferFailure {
  constructor(message: string, options?: ErrorOptions) {
    super("PERMANENT", message, options);
    this.name = "PermanentTransferFailure";
  }
}

export function asTransferFailure(error: unknown, context: string): TransferFailure {
  if (error instanceof TransferFailure) return error;
  const detail = error instanceof Error ? error.message : "unknown error";
  return new TransientTransferFailure(`${context}: ${detail}`, {
    cause: error,
  });
}
