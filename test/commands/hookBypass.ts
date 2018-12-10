import fancy from "@oclif/test";
import * as initHook from "../../src/hooks/initializeSDK";

export default fancy.stub(initHook, "default", () => null);
