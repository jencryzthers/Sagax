// The label a "Waiting on your approval in @Bot" chip settles to, once the
// card it points at is resolved. request.resolved fires for every outcome
// (a person's allow or deny, auto mode, the ask's own timeout, the harness
// cancelling it), so the label must say which one: a denied, expired or
// cancelled card used to read "@Bot got your approval".

export type ChipKind = "approval" | "answer";
export type ResolvedBehavior = "allow" | "deny" | "answer";
export type ResolvedSource = "user" | "auto" | "timeout" | "system" | "unavailable" | "peer";

export function settledChipLabel(
  name: string,
  kind: ChipKind,
  resolution?: { behavior?: ResolvedBehavior; source?: ResolvedSource },
): string {
  const behavior = resolution?.behavior;
  const source = resolution?.source;
  if (source === "timeout") return `@${name}'s ${kind} request expired`;
  if (source === "system" || source === "unavailable") return `@${name} is no longer waiting on your ${kind}`;
  if (kind === "answer" || behavior === "answer") return `@${name} got your answer`;
  if (behavior === "deny") return source === "auto" ? `@${name}'s request was declined automatically` : `You declined @${name}'s request`;
  if (behavior === "allow") {
    if (source === "auto") return `@${name}'s request was approved automatically`;
    if (source === "peer") return `@${name}'s request was approved by a teammate`;
    return `@${name} got your approval`;
  }
  // a resolution without its outcome: say only that it settled
  return `@${name}'s ${kind} request was answered`;
}
