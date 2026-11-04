import { requireOptionalNativeModule } from "expo";
import type { NemuJapaneseLearningNativeModule } from "./NemuJapaneseLearning.types";

/** Null in binaries built before this module existed. */
export default requireOptionalNativeModule<NemuJapaneseLearningNativeModule>(
  "NemuJapaneseLearning",
);
