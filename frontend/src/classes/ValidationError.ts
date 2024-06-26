export class ValidationError extends Error {
  type: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };

  constructor(
    message: string,
    type: string,
    location?: { start: { line: number; column: number }; end: { line: number; column: number } },
  ) {
    super(message);
    this.type = type;
    this.location = location;
  }
}
