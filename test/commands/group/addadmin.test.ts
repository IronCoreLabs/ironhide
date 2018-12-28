import {expect} from "@oclif/test";
import {ErrorCodes} from "@ironcorelabs/ironnode";
import * as sinon from "sinon";
import AddAdmin from "../../../src/commands/group/addadmin";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";
import * as GroupMaps from "../../../src/lib/GroupMaps";

function getMockedGroupAddAdminResponse(mock: any) {
    return {
        group: {
            addAdmins: typeof mock === "function" ? mock : () => mock,
        },
    };
}

describe("groupAddAdmin", () => {
    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupAddAdminResponse(Promise.reject(new Error("failed to make request"))))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const addAdminCommand = new AddAdmin(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(addAdminCommand, "error");

                await addAdminCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("failed to make request"));
            });

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupAddAdminResponse(Promise.reject({code: ErrorCodes.GROUP_ADD_ADMINS_NOT_ADMIN_FAILURE})))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const addAdminCommand = new AddAdmin(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(addAdminCommand, "error");

                await addAdminCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("You aren't an admin of the 'providedGroupName' group"));
            });

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupAddAdminResponse(Promise.reject({code: ErrorCodes.GROUP_ADD_ADMINS_REQUEST_FAILURE})))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const addAdminCommand = new AddAdmin(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(addAdminCommand, "error");

                await addAdminCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Unable to complete request to add admins"));
            });
    });

    describe("makes request to API to remove admins and displays removal results", () => {
        let apiMock: any;
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupGroupID"))
            .stub(SDK, "ironnode", () => {
                apiMock = sinon.fake.resolves({
                    succeeded: ["bob@example.com", "mike@example.com"],
                    failed: [{id: "john@example.com", error: "mocked error"}],
                });
                return getMockedGroupAddAdminResponse(apiMock);
            })
            .it("adds admins and displays results", async (output) => {
                await new AddAdmin(["-u", "bob@example.com,mike@example.com,john@example.com", "providedGroupName"], null as any).run();
                expect(output.stdout.match(/Added as admin/g)).to.have.length(2);
                expect(output.stdout).to.contain("bob@example.com");
                expect(output.stdout).to.contain("mike@example.com");
                expect(output.stdout).to.contain("john@example.com");
                expect(output.stdout).to.contain("mocked error");
                sinon.assert.calledWithExactly(apiMock, "lookupGroupID", ["bob@example.com", "mike@example.com", "john@example.com"]);
            });
    });
});
