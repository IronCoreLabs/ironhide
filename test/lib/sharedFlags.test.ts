import {expect, fancy, FancyTypes} from "fancy-test";
import * as sharedFlags from "../../src/lib/sharedFlags";

describe("sharedFlags", () => {
    describe("userList", () => {
        fancy.it("builds expected flag with arguments", () => {
            const flag = sharedFlags.userList("my desc")();
            expect(flag.description).to.equal("my desc");
            expect(flag.parse("foo,bar,baz", "")).to.deep.equal(["foo", "bar", "baz"]);
        });
    });
});
