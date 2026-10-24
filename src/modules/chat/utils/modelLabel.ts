/**
 * Model families, in the spelling they are shown in. The provider reports a
 * full id (`claude-opus-5-5`, `claude-haiku-4-5-20251001`); the footer has
 * room for the official name, and the exact id stays in the tooltip.
 */
const MODEL_FAMILY_LABELS: ReadonlyArray<readonly [token: string, label: string]> = [
  ['opus', 'Opus'],
  ['sonnet', 'Sonnet'],
  ['haiku', 'Haiku'],
  ['fable', 'Fable'],
];

/**
 * Reads the family and version out of an official Claude model id, in both
 * the current `claude-opus-5-5` shape and the legacy `claude-3-5-sonnet` one.
 * Each version part must be followed by `-` or the end of the id, so a date
 * suffix (`claude-sonnet-4-20250514`) is never mistaken for a minor version.
 * Unanchored so provider-prefixed ids (`us.anthropic.claude-opus-5-5-v1:0`)
 * still match.
 */
const CLAUDE_MODEL_ID_PATTERN =
  /claude-(?:(\d{1,2})-(?:(\d{1,2})-)?)?(opus|sonnet|haiku|fable)(?:-(\d{1,2})(?=-|$)(?:-(\d{1,2})(?=-|$))?)?/;

const formatClaudeModelVersion = (major: string | undefined, minor: string | undefined): string => {
  if (!major) {
    return '';
  }

  return minor ? ` ${major}.${minor}` : ` ${major}`;
};

/**
 * Shortens a reported model id to its official name (`Opus 5.5`), or `null`
 * when there is nothing to show. Used by chat's MessageModelLabel for the
 * footer under a reply, and by chat's ComposerModelMenu for a session model
 * the catalog does not list.
 *
 * An id from no known family is shown verbatim rather than dropped, so an
 * unrecognized model still reports itself honestly. A bare alias (`opus`)
 * names only the family, since it carries no version. A `[1m]` suffix is kept
 * as "1M" instead of being folded into the base model: Claude Code writes the
 * base id on assistant rows today, but if a provider ever reports the 1M
 * variant it must not read as the 200K one.
 */
export const formatAnsweringModelLabel = (model: string | undefined): string | null => {
  const reportedModel = model?.trim();
  if (!reportedModel) {
    return null;
  }

  const normalized = reportedModel.toLowerCase();
  const isOneMillionContext = normalized.endsWith('[1m]');
  const baseModel = isOneMillionContext ? normalized.slice(0, -'[1m]'.length) : normalized;
  const contextLabel = isOneMillionContext ? ' 1M' : '';

  const idMatch = CLAUDE_MODEL_ID_PATTERN.exec(baseModel);
  if (idMatch) {
    const [, legacyMajor, legacyMinor, familyToken, major, minor] = idMatch;
    const familyLabel = MODEL_FAMILY_LABELS.find(([token]) => token === familyToken)?.[1] ?? familyToken;
    const version = major
      ? formatClaudeModelVersion(major, minor)
      : formatClaudeModelVersion(legacyMajor, legacyMinor);
    return `${familyLabel}${version}${contextLabel}`;
  }

  const family = MODEL_FAMILY_LABELS.find(([token]) => baseModel.includes(token));
  if (!family) {
    return reportedModel;
  }

  return `${family[1]}${contextLabel}`;
};
