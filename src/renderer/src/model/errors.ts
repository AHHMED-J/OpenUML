/**
 * An edit the modeling rules refuse (an element placed where it cannot live, a link between
 * elements it cannot connect). The message is plain language and is shown to the user as is;
 * any other error thrown while editing is unexpected.
 */
export class ModelRuleError extends Error {
  override readonly name = 'ModelRuleError'
}
