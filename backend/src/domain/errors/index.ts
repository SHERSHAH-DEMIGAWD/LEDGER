export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

export class UnauthorizedAccessError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedAccessError';
  }
}

export class DealTermsValidationError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'DealTermsValidationError';
  }
}

export class DealVersionConflictError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'DealVersionConflictError';
  }
}