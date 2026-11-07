export { parseBehaviors, resolveBehaviors, validateComposition } from "./behavior-contract.ts";
export type { BehaviorDescriptor } from "./behavior-contract.ts";
export { createBehaviorEvaluator, behaviorGroups } from "./behavior-evaluator.ts";
export type { BehaviorRegion, BehaviorGroup, BehaviorOutput, BehaviorGroupOutput } from "./behavior-evaluator.ts";

export { parseMotionConstraints, composeConstraints, DEFAULT_CONSTRAINTS } from "./motion-constraints.ts";
export type { MotionConstraints } from "./motion-constraints.ts";
