const MAX_SANDBOX_INPUT_JSON_CHARACTERS = 2 * 1024 * 1024;
const MAX_SANDBOX_RESPONSE_JSON_CHARACTERS = 4 * 1024 * 1024;

type SandboxCompleteResponse = {
  status: "complete";
  value: unknown;
};

type SandboxErrorResponse = {
  status: "error";
  code?: string;
  detail?: string;
};

export function stringifyMobileAidokuSandboxValue(
  value: unknown,
  label: string,
): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error(`${label} is not serializable.`);
  }
  if (json === undefined) throw new Error(`${label} is not serializable.`);
  if (json.length > MAX_SANDBOX_INPUT_JSON_CHARACTERS) {
    throw new Error(`${label} exceeds the isolated runtime safety limit.`);
  }
  return json;
}

export function parseMobileAidokuSandboxResponse<T>(json: string): T {
  if (
    typeof json !== "string" ||
    json.length === 0 ||
    json.length > MAX_SANDBOX_RESPONSE_JSON_CHARACTERS
  ) {
    throw new Error("The isolated Aidoku runtime returned an invalid response.");
  }

  let parsed: SandboxCompleteResponse | SandboxErrorResponse;
  try {
    parsed = JSON.parse(json) as SandboxCompleteResponse | SandboxErrorResponse;
  } catch {
    throw new Error("The isolated Aidoku runtime returned malformed JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The isolated Aidoku runtime returned an invalid response.");
  }
  if (parsed.status === "error") {
    throw new Error(
      typeof parsed.detail === "string" && parsed.detail.length > 0
        ? parsed.detail
        : "The isolated Aidoku runtime failed.",
    );
  }
  if (parsed.status !== "complete" || !("value" in parsed)) {
    throw new Error("The isolated Aidoku runtime returned an invalid response.");
  }
  return parsed.value as T;
}
