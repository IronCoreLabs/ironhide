import {expect, fancy} from "fancy-test";
import * as SDK from "../../src/lib/SDK";

describe("SDK", () => {
    fancy.it("sets value of SDK and returns it", () => {
        SDK.set("return value" as any);
        expect(SDK.ironnode()).to.equal("return value");
    });
});
