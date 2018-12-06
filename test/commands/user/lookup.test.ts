import {expect} from "@oclif/test";
import * as sinon from "sinon";
import Lookup from "../../../src/commands/user/lookup";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

function getMockedUserListResponse(mock: any) {
    return {
        user: {
            getPublicKey: () => mock,
        },
    };
}

describe("userLookup", () => {
    describe("successful display", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () =>
                getMockedUserListResponse(
                    Promise.resolve({
                        "bob@example.com": {x: "bobx", y: "boby"},
                        "john@example.com": {x: "johnx", y: "johny"},
                        "mike@example.com": null,
                    })
                )
            )
            .it("displays expected keys and errors", async (output) => {
                await new Lookup(["bob@example.com john@example.com mike@example.com"], null as any).run();
                expect(output.stdout).to.contain("bobx");
                expect(output.stdout).to.contain("boby");
                expect(output.stdout).to.contain("johnx");
                expect(output.stdout).to.contain("johny");
                expect(output.stdout).to.contain("mike@example.com");
                expect(output.stdout).to.contain("User hasn't created an account yet.");
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stub(SDK, "ironnode", () => getMockedUserListResponse(Promise.reject(new Error("failed to make request"))))
            .it("displays expected keys and errors", async () => {
                const lookupCommand = new Lookup(["user:lookup", "bob@example.com"], null as any);
                const errorStub = sinon.stub(lookupCommand, "error");

                await lookupCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });
    });
});
