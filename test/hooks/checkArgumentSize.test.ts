import fancy, {expect} from "fancy-test";
import {CLIError} from "@oclif/errors";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import checkArgumentSize from "../../src/hooks/checkArgumentSize";
chai.use(chaiAsPromised);

describe("checkArgumentSize", () => {
    describe("throws errors", () => {
        fancy.it("throws CLI error when file command has a lot of arguments", () => {
            const hookArgs = {
                Command: {id: "file:encrypt"},
                argv: new Array(80),
            };

            expect(() => checkArgumentSize.call(null as any, hookArgs as any)).to.throw(CLIError);
        });
    });

    describe("doesnt throw under various conditions", () => {
        fancy.it("does not throw when lots of args but not a file command", () => {
            const hookArgs = {
                Command: {id: "group:info"},
                argv: new Array(80),
            };

            expect(() => checkArgumentSize.call(null as any, hookArgs as any)).not.to.throw(CLIError);
        });

        fancy.it("does not throw when file command but below arg threshold", () => {
            const hookArgs = {
                Command: {id: "file:info"},
                argv: new Array(70),
            };

            expect(() => checkArgumentSize.call(null as any, hookArgs as any)).not.to.throw(CLIError);
        });
    });
});
