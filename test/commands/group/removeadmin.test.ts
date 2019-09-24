import {ErrorCodes} from "@ironcorelabs/ironnode";
import {expect} from "@oclif/test";
import * as sinon from "sinon";
import RemoveAdmin from "../../../src/commands/group/removeadmin";
import * as GroupMaps from "../../../src/lib/GroupMaps";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

function getMockedGroupRemoveAdminResponse(mock: any) {
    return {
        group: {
            removeAdmins: typeof mock === "function" ? mock : () => mock,
        },
    };
}

describe("groupRemoveAdmin", () => {
    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupRemoveAdminResponse(Promise.reject(new Error("failed to make request"))))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const removeAdminCommand = new RemoveAdmin(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(removeAdminCommand, "error");

                await removeAdminCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("failed to make request"));
            });

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupRemoveAdminResponse(Promise.reject({code: ErrorCodes.GROUP_REMOVE_ADMINS_REQUEST_FAILURE})))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const removeAdminCommand = new RemoveAdmin(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(removeAdminCommand, "error");

                await removeAdminCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Unable to complete request to remove admins"));
            });
    });

    describe("makes request to API to remove admins and displays results", () => {
        let apiMock: any;
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupGroupID"))
            .stub(SDK, "ironnode", () => {
                apiMock = sinon.fake.resolves({
                    succeeded: ["bob@example.com", "mike@example.com"],
                    failed: [{id: "john@example.com", error: "mocked error"}],
                });
                return getMockedGroupRemoveAdminResponse(apiMock);
            })
            .it("removes admins and displays results", async (output) => {
                const removeAdminCommand = new RemoveAdmin(["-u", "bob@example.com,mike@example.com,john@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(removeAdminCommand, "error");

                await removeAdminCommand.run();

                expect(output.stdout.match(/Removed as admin/g)).to.have.length(2);
                expect(output.stdout).to.contain("bob@example.com");
                expect(output.stdout).to.contain("mike@example.com");
                expect(output.stdout).to.contain("john@example.com");
                expect(output.stdout).to.contain("mocked error");
                sinon.assert.calledWithExactly(apiMock, "lookupGroupID", ["bob@example.com", "mike@example.com", "john@example.com"]);
                sinon.assert.calledWithExactly(errorStub, sinon.match("Failed to remove 1 admin(s)"));
            });
    });
});
