import {expect} from "@oclif/test";
import {ErrorCodes} from "@ironcorelabs/ironnode";
import * as sinon from "sinon";
import Create from "../../../src/commands/group/create";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";
import * as GroupMaps from "../../../src/lib/GroupMaps";

function getMockedGroupCreateResponse(mock: any) {
    return {
        group: {
            create: typeof mock === "function" ? mock : () => mock,
        },
    };
}

describe("groupCreate", () => {
    describe("fails when group name contains invalid characters", () => {
        hookBypass.it("displays error when group name contains a comma", async () => {
            const createCommand = new Create(["group,Name"], null as any);
            const errorStub = sinon.stub(createCommand, "error");

            await createCommand.run();
            sinon.assert.calledWithExactly(errorStub, sinon.match("cannot contain commas or carets"));
        });

        hookBypass.it("displays error when group name contains a caret", async () => {
            const createCommand = new Create(["group^Name"], null as any);
            const errorStub = sinon.stub(createCommand, "error");

            await createCommand.run();
            sinon.assert.calledWithExactly(errorStub, sinon.match("cannot contain commas or carets"));
        });
    });

    describe("fails for group creates with existing groups", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.reject(new Error("failed request")))
            .stub(SDK, "ironnode", () => getMockedGroupCreateResponse(Promise.resolve({groupID: "id", groupName: "name"})))
            .it("displays error when existing group list cannot be retrieved", async () => {
                const createCommand = new Create(["groupName"], null as any);
                const errorStub = sinon.stub(createCommand, "error");

                await createCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Unable to make group create request"));
            });

        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(true))
            .stub(SDK, "ironnode", () => getMockedGroupCreateResponse(Promise.resolve({groupID: "id", groupName: "name"})))
            .it("displays error when existing group list cannot be retrieved", async () => {
                const createCommand = new Create(["groupName"], null as any);
                const errorStub = sinon.stub(createCommand, "error");

                await createCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("You are already in a group with the name 'groupName'"));
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupCreateResponse(Promise.reject(new Error("failed to make request"))))
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(false))
            .it("displays expected error", async () => {
                const createCommand = new Create(["groupName"], null as any);
                const errorStub = sinon.stub(createCommand, "error");

                await createCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupCreateResponse(Promise.reject({code: ErrorCodes.GROUP_CREATE_REQUEST_FAILURE})))
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(false))
            .it("displays expected error", async () => {
                const createCommand = new Create(["groupName"], null as any);
                const errorStub = sinon.stub(createCommand, "error");

                await createCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match("Unable to make group create request"));
            });
    });

    describe("makes request to API to create group and displays group details", () => {
        let apiMock: any;
        hookBypass
            .stdout()
            .stub(GroupMaps, "doesGroupNameAlreadyExist", () => Promise.resolve(false))
            .stub(SDK, "ironnode", () => {
                apiMock = sinon.fake.resolves({
                    groupName: "groupName",
                    groupID: "id1",
                    isAdmin: true,
                    isMember: true,
                });
                return getMockedGroupCreateResponse(apiMock);
            })
            .it("creates group and displays info", async (output) => {
                await new Create(["groupName"], null as any).run();
                expect(output.stdout).to.contain("groupName");
                expect(output.stdout).to.contain("id1");
                sinon.assert.calledWithExactly(apiMock, {groupName: "groupName"});
            });
    });
});
