import {expect} from "@oclif/test";
import {CliUx} from "@oclif/core";
import * as sinon from "sinon";
import Delete from "../../../src/commands/group/delete";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";
import * as GroupMaps from "../../../src/lib/GroupMaps";

function getMockedGroupDeleteResponse(deleteMock: any, getMock: any) {
    return {
        group: {
            deleteGroup: typeof deleteMock === "function" ? deleteMock : () => deleteMock,
            get: typeof getMock === "function" ? getMock : () => getMock,
        },
    };
}

describe("groupDelete", () => {
    describe("fails when user isnt an admin of the group to delete", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("mockedGroupID"))
            .stub(GroupMaps, "getGroupMaps", () => Promise.resolve([[], {mockedGroupID: {isAdmin: false}}]))
            .it("displays expected error", async () => {
                const deleteCommand = new Delete(["groupName"], null as any);
                const errorStub = sinon.stub(deleteCommand, "error");

                await deleteCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("You aren't currently an admin of 'groupName'"));
            });
    });

    describe("throws error when group get fails", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("mockedGroupID"))
            .stub(GroupMaps, "getGroupMaps", () => Promise.resolve([[], {mockedGroupID: {isAdmin: true}}]))
            .stub(CliUx.ux, "prompt", () => (message: string) => Promise.resolve("groupName"))
            .stub(SDK, "ironnode", () => {
                const getMock = () => Promise.reject(new Error("Failed to get group"));
                return getMockedGroupDeleteResponse(() => Promise.resolve(null), getMock);
            })
            .it("displays expected error", async () => {
                const deleteCommand = new Delete(["groupName"], null as any);
                const errorStub = sinon.stub(deleteCommand, "error");

                await deleteCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Was not able to retrieve information about the provided group"));
            });
    });

    describe("fails when confirmation value did not match original group name", () => {
        hookBypass
            .stdout()
            .stub(CliUx.ux, "prompt", () => (message: string) => Promise.resolve("nonMatchingName"))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("mockedGroupID"))
            .stub(GroupMaps, "getGroupMaps", () => Promise.resolve([[], {mockedGroupID: {isAdmin: true}}]))
            .stub(SDK, "ironnode", () => {
                const getMock = Promise.resolve({
                    groupAdmins: [],
                    groupMembers: [],
                });
                return getMockedGroupDeleteResponse(null, getMock);
            })
            .it("displays expected error", async () => {
                const deleteCommand = new Delete(["groupName"], null as any);
                const errorStub = sinon.stub(deleteCommand, "error");

                await deleteCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Group confirmation failed"));
                sinon.assert.calledWithExactly(errorStub, sinon.match("groupName"));
                sinon.assert.calledWithExactly(errorStub, sinon.match("nonMatchingName"));
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(CliUx.ux, "prompt", () => (message: string) => Promise.resolve("groupName"))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("mockedGroupID"))
            .stub(GroupMaps, "getGroupMaps", () => Promise.resolve([[], {mockedGroupID: {isAdmin: true}}]))
            .stub(SDK, "ironnode", () => {
                const deleteMock = () => Promise.reject(new Error("failed to make request"));
                const getMock = Promise.resolve({
                    groupAdmins: [],
                    groupMembers: [],
                });
                return getMockedGroupDeleteResponse(deleteMock, getMock);
            })
            .it("displays expected error", async (output) => {
                const deleteCommand = new Delete(["groupName"], null as any);
                const errorStub = sinon.stub(deleteCommand, "error");

                await deleteCommand.run();
                expect(output.stdout).to.contain("failed to make request");
                sinon.assert.calledWithExactly(errorStub, sinon.match("Group delete request failed"));
            });
    });

    describe("makes request to API to delete group and displays success message", () => {
        let getMock: any;
        let deleteMock: any;
        hookBypass
            .stdout()
            .stub(CliUx.ux, "prompt", () => (message: string) => Promise.resolve("groupName"))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("mockedGroupID"))
            .stub(GroupMaps, "getGroupMaps", () => Promise.resolve([[], {mockedGroupID: {isAdmin: true}}]))
            .stub(SDK, "ironnode", () => {
                getMock = sinon.fake.resolves({
                    groupAdmins: ["one", "two", "three", "four"],
                    groupMembers: ["five", "six"],
                });
                deleteMock = sinon.fake.resolves({id: "deletedGroupID"});
                return getMockedGroupDeleteResponse(deleteMock, getMock);
            })
            .it("deletes group", async (output) => {
                await new Delete(["groupName"], null as any).run();
                expect(output.stdout).to.contain("The group you are trying to delete has 4 admin(s) and 2 member(s)");
                expect(output.stdout).to.contain("Group successfully deleted");
                sinon.assert.calledWithExactly(deleteMock, "mockedGroupID");
            });
    });
});
