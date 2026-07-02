/**
 * Maps API / scoring-engine error codes (dot-separated, e.g. "round.locked")
 * to keys inside the "squad.errors" message namespace. Dots are illegal in
 * next-intl keys, so codes are stored with underscores. Unknown codes fall
 * back to a generic Spanish message.
 */

const KNOWN_ERROR_KEYS = new Set([
  "generic",
  "api_unexpected",
  "request_invalid",
  "auth_missingToken",
  "auth_invalidToken",
  "auth_noEmail",
  "round_locked",
  "round_notFound",
  "round_noCurrent",
  "squad_alreadyExists",
  "squad_notFound",
  "squad_unknownPlayers",
  "squad_invalid",
  "squad_invalidSize",
  "squad_duplicatePlayer",
  "squad_invalidSlots",
  "squad_invalidPositionCount",
  "squad_tooManyFromClub",
  "squad_missingClub",
  "squad_missingPrice",
  "squad_overBudget",
  "squad_invalidFormation",
  "squad_invalidCaptainCount",
  "squad_invalidViceCaptainCount",
  "squad_captainNotStarter",
  "squad_viceCaptainNotStarter",
  "squad_captainIsViceCaptain",
  "transfer_samePlayer",
  "transfer_noSquad",
  "transfer_playerNotInSquad",
  "transfer_playerAlreadyInSquad",
  "transfer_playerNotFound",
  "transfer_invalidSquad",
  "transfer_unknownPlayers",
]);

/** i18n key (relative to the "squad" namespace) for an API error code. */
export function errorFeedbackKey(code: string): string {
  const key = code.replace(/\./g, "_");
  return KNOWN_ERROR_KEYS.has(key) ? `errors.${key}` : "errors.generic";
}
