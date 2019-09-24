import {ErrorCodes} from "@ironcorelabs/ironnode";
import {expect} from "@oclif/test";
import * as sinon from "sinon";
import RemoveMember from "../../../src/commands/group/removemember";
import * as GroupMaps from "../../../src/lib/GroupMaps";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

function getMockedGroupRemoveMemberResponse(mock: any) {
    return {
        group: {
            removeMembers: typeof mock === "function" ? mock : () => mock,
        },
    };
}

describe("groupRemoveMember", () => {
    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupRemoveMemberResponse(Promise.reject(new Error("failed to make request"))))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const removeMemberCommand = new RemoveMember(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(removeMemberCommand, "error");

                await removeMemberCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("failed to make request"));
            });

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupRemoveMemberResponse(Promise.reject({code: ErrorCodes.GROUP_REMOVE_MEMBERS_REQUEST_FAILURE})))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupID"))
            .it("displays expected error", async () => {
                const removeMemberCommand = new RemoveMember(["-u", "bob@example.com,mike@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(removeMemberCommand, "error");

                await removeMemberCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Unable to complete request to remove members"));
            });
    });

    describe("makes request to API to remove members and displays results", () => {
        let apiMock: any;
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("lookupGroupID"))
            .stub(SDK, "ironnode", () => {
                apiMock = sinon.fake.resolves({
                    succeeded: ["bob@example.com", "mike@example.com"],
                    failed: [{id: "john@example.com", error: "mocked error"}],
                });
                return getMockedGroupRemoveMemberResponse(apiMock);
            })
            .it("removes members and displays results", async (output) => {
                const removeMemberCommand = new RemoveMember(["-u", "bob@example.com,mike@example.com,john@example.com", "providedGroupName"], null as any);
                const errorStub = sinon.stub(removeMemberCommand, "error");

                await removeMemberCommand.run();

                expect(output.stdout.match(/Removed as member/g)).to.have.length(2);
                expect(output.stdout).to.contain("bob@example.com");
                expect(output.stdout).to.contain("mike@example.com");
                expect(output.stdout).to.contain("john@example.com");
                expect(output.stdout).to.contain("mocked error");
                sinon.assert.calledWithExactly(apiMock, "lookupGroupID", ["bob@example.com", "mike@example.com", "john@example.com"]);
                sinon.assert.calledWithExactly(errorStub, sinon.match("Failed to remove 1 member(s)"));
            });
    });
});
