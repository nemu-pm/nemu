/** Which settings string says why a directory could not be added. */
export const SOURCE_DIRECTORY_ERROR_KEYS = {
  empty: "sourceDirectoryErrorInvalid",
  invalid: "sourceDirectoryErrorInvalid",
  "too-long": "sourceDirectoryErrorInvalid",
  "not-https": "sourceDirectoryErrorNotHttps",
  credentials: "sourceDirectoryErrorInvalid",
  "local-host": "sourceDirectoryErrorLocal",
  duplicate: "sourceDirectoryErrorDuplicate",
  limit: "sourceDirectoryErrorLimit",
  unreachable: "sourceDirectoryErrorUnreachable",
  "no-sources": "sourceDirectoryErrorNoSources",
  "built-in": "sourceDirectoryErrorInvalid",
} as const;
