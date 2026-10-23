// Passwords must never pass through the generic text trimmer: spaces are part of the secret.
export function validateNewPassword(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 200 ||
    !/\S/.test(value)
  ) {
    const error = Error(
      "Use a password of 12–200 characters containing a non-space character.",
    );
    error.status = 400;
    throw error;
  }
  return value;
}
