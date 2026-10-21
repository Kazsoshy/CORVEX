export class SyncConflict extends Error {
  constructor(message) {
    super(message);
    this.name = 'SyncConflict';
    this.conflict = true;
    this.status = 409;
  }
}

export class ApplyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApplyError';
    this.status = status;
  }
}
