import {expect} from "@oclif/test";
import * as sinon from "sinon";
import Info from "../../../src/commands/group/info";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";
import * as GroupMaps from "../../../src/lib/GroupMaps";

function getMockedGroupInfoResponse(mock: any) {
    return {
        group: {
            get: typeof mock === "function" ? mock : () => mock,
        },
    };
}

describe("groupInfo", () => {
    describe("successful display of group given a name", () => {
        let apiMock: any;
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .stub(SDK, "ironnode", () => {
                apiMock = sinon.fake.resolves({
                    groupName: "myGroup",
                    groupID: "id1",
                    isAdmin: true,
                    isMember: true,
                    groupAdmins: ["bob@example.com", "john@example.com"],
                    groupMembers: ["mike@example.com"],
                });
                return getMockedGroupInfoResponse(apiMock);
            })
            .it("displays expected group info", async (output) => {
                await new Info(["myGroup"], null as any).run();
                expect(output.stdout).to.contain("myGroup");
                expect(output.stdout).not.to.contain("id1");
                expect(output.stdout).to.contain("bob@example.com");
                expect(output.stdout).to.contain("john@example.com");
                expect(output.stdout).to.contain("mike@example.com");
                sinon.assert.calledWithExactly(apiMock, "groupID");
            });
    });

    describe("displays limited group info if user is not an admin or member", () => {
        hookBypass
            .stdout()
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .stub(SDK, "ironnode", () =>
                getMockedGroupInfoResponse(
                    Promise.resolve({
                        groupName: "myGroup",
                        groupID: "id1",
                        isAdmin: false,
                        isMember: false,
                        //This response is invalid based on the user not being an admin or member, but we're
                        //just making sure that we don't display these in that scenario
                        groupAdmins: ["bob@example.com", "john@example.com"],
                        groupMembers: ["mike@example.com"],
                    })
                )
            )
            .it("displays expected group info", async (output) => {
                await new Info(["myGroup"], null as any).run();
                expect(output.stdout).to.contain("myGroup");
                expect(output.stdout).not.to.contain("id1");
                expect(output.stdout).not.to.contain("bob@example.com");
                expect(output.stdout).not.to.contain("john@example.com");
                expect(output.stdout).not.to.contain("mike@example.com");
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupInfoResponse(Promise.reject(new Error("failed to make request"))))
            .stub(GroupMaps, "getGroupIDFromName", () => Promise.resolve("groupID"))
            .it("displays expected error", async () => {
                const infoCommand = new Info(["groupName"], null as any);
                const errorStub = sinon.stub(infoCommand, "error");

                await infoCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });
    });
});
