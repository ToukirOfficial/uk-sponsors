/** An error the user can fix themselves. Exit code 1. */
export class UserError extends Error {
  readonly exitCode = 1;
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

/** A network problem or a change on GOV.UK's side. Exit code 2. */
export class SourceError extends Error {
  readonly exitCode = 2;
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export const ISSUES_URL = "https://github.com/ToukirOfficial/uk-sponsors/issues";

export const SOURCE_CHANGED_HINT = `This tool may need an update. Try "npm install -g uk-sponsors@latest", or report it at ${ISSUES_URL}`;
