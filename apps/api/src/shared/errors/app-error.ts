/** Errors the HTTP layer turns into a response. Throw these from use cases. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_FAILED', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sign in to continue') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Your role does not allow this') {
    super(403, 'FORBIDDEN', message);
  }
}

/** Also used when a record belongs to another hotel, so its existence never leaks. */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class RoomNotOccupiedError extends AppError {
  constructor(message = 'Room is not currently occupied with an active stay') {
    super(403, 'ROOM_NOT_OCCUPIED', message);
  }
}

