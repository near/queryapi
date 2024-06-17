export class ValidationError extends Error {
  constructor(message, type) {
    super(message);
    this.type = type;
  }
}
