import {expect} from "@oclif/test";
import * as sinon from "sinon";
import List from "../../../src/commands/group/list";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

function getMockedGroupListResponse(mock: any) {
    return {
        group: {
            list: () => mock,
        },
    };
}

describe("groupList", () => {
    describe("successful display of groups", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () =>
                getMockedGroupListResponse(
                    Promise.resolve({
                        result: [
                            {
                                groupID: "id1",
                                groupName: "name1",
                                isAdmin: true,
                                isMember: false,
                                created: "2015-04-12T10:20:50.52Z",
                                updated: "2018-12-19T16:39:57-08:00",
                            },
                            {
                                groupID: "id2",
                                groupName: "name2",
                                isAdmin: false,
                                isMember: true,
                                created: "2002-04-12T10:20:50.52Z",
                                updated: "2003-12-19T16:39:57-08:00",
                            },
                        ],
                    })
                )
            )
            .it("displays expected group info", async (output) => {
                await new List([], null as any).run();
                expect(output.stdout).not.to.contain("id1");
                expect(output.stdout).not.to.contain("id2");
                expect(output.stdout).to.contain("name1");
                expect(output.stdout).to.contain("name2");
                expect(output.stdout).to.contain("4/12/2015");
                expect(output.stdout).to.contain("12/19/2018");
                expect(output.stdout).to.contain("4/12/2002");
                expect(output.stdout).to.contain("12/19/2003");
            });
    });

    describe("displays message when user is not part of any groups", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () =>
                getMockedGroupListResponse(
                    Promise.resolve({
                        result: [],
                    })
                )
            )
            .it("displays no group message", async (output) => {
                await new List([], null as any).run();
                expect(output.stdout).to.contain("admin or member of any groups");
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupListResponse(Promise.reject(new Error("failed to make request"))))
            .it("displays expected keys and errors", async (output) => {
                const listCommand = new List([], null as any);
                const errorStub = sinon.stub(listCommand, "error");

                await listCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(output.stdout).to.contain("failed to make request");
            });
    });
});
