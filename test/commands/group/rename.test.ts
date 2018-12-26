import {expect} from "@oclif/test";
import * as sinon from "sinon";
import Rename from "../../../src/commands/group/rename";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";
import * as GroupMaps from "../../../src/lib/GroupMaps";

function getMockedGroupRenameResponse(mock: any) {
    return {
        group: {
            update: typeof mock === "function" ? mock : () => mock,
        },
    };
}

describe("groupRename", () => {
    describe("fails if new group name contains invalid characters ", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .it("fails when name contains commas", async () => {
                const renameCommand = new Rename(["currentGroup", "my,newgroup"], null as any);
                const errorStub = sinon.stub(renameCommand, "error");

                await renameCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });

        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .it("fails when name contains caret", async () => {
                const renameCommand = new Rename(["currentGroup", "my^newgroup"], null as any);
                const errorStub = sinon.stub(renameCommand, "error");

                await renameCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });
    });

    describe("fails if group list cant be retrieved or if new group name already exists", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.reject(new Error("request failed")))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .stub(SDK, "ironnode", () => getMockedGroupRenameResponse(Promise.resolve({})))
            .it("fails if group list couldnt be retrieved", async (output) => {
                const renameCommand = new Rename(["currentGroup", "myNewgroup"], null as any);
                const errorStub = sinon.stub(renameCommand, "error");

                await renameCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(output.stdout).to.contain("request failed");
            });

        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(true))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .stub(SDK, "ironnode", () => getMockedGroupRenameResponse(Promise.resolve({})))
            .it("fails if user is already part of group with new name", async (output) => {
                const renameCommand = new Rename(["currentGroup", "mynewgroup"], null as any);
                const errorStub = sinon.stub(renameCommand, "error");

                await renameCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match("already in a group with the name 'mynewgroup'"));
            });
    });

    describe("displays success message when rename succeeds", () => {
        let mockApi: any;
        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(false))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("mockedGroupID"))
            .stub(SDK, "ironnode", () => {
                mockApi = sinon.fake.resolves({
                    groupName: "newName",
                    groupID: "id1",
                });
                return getMockedGroupRenameResponse(mockApi);
            })
            .it("displays success message", async (output) => {
                await new Rename(["currentGroupName", "newGroupName"], null as any).run();
                expect(output.stdout).to.contain("Group name successfully updated");
                sinon.assert.calledWithExactly(mockApi, "mockedGroupID", {groupName: "newGroupName"});
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(false))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .stub(SDK, "ironnode", () => getMockedGroupRenameResponse(Promise.reject(new Error("failed to make request"))))
            .it("displays expected error", async () => {
                const renameCommand = new Rename(["currentName", "newName"], null as any);
                const errorStub = sinon.stub(renameCommand, "error");

                await renameCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });
    });
});
