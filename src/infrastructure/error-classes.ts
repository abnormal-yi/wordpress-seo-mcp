export class SEOError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public retryable: boolean = false,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SEOError";
  }
}

export class NetworkError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", 503, true, details);
    this.name = "NetworkError";
  }
}

export class RateLimitError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "RATE_LIMITED", 429, true, details);
    this.name = "RateLimitError";
  }
}

export class AuthError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "AUTH_FAILED", 401, false, details);
    this.name = "AuthError";
  }
}

export class NotFoundError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "NOT_FOUND", 404, false, details);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 422, false, details);
    this.name = "ValidationError";
  }
}

export class TimeoutError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "TIMEOUT", 504, true, details);
    this.name = "TimeoutError";
  }
}

export class CircuitOpenError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CIRCUIT_OPEN", 503, true, details);
    this.name = "CircuitOpenError";
  }
}

export class PluginError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PLUGIN_ERROR", 500, false, details);
    this.name = "PluginError";
  }
}

export class ConfigError extends SEOError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", 500, false, details);
    this.name = "ConfigError";
  }
}
