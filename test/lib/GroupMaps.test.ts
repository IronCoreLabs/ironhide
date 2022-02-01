import {expect, fancy} from "fancy-test";
import {CliUx} from "@oclif/core";
import * as chai from "chai";
import * as GroupMaps from "../../src/lib/GroupMaps";
import * as SDK from "../../src/lib/SDK";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

const validGroupResult = {
    result: [
        {groupID: "gid1", groupName: "gname"},
        {groupID: "gid2", groupName: "group2name"},
        {groupID: "grid3", groupName: "group2name"},
        {groupID: "groupID4"},
    ],
};

const groupMapTest = fancy.do(() => GroupMaps.clearCache());
const validGroupMapTest = groupMapTest.stub(SDK, "ironnode", () => getMockedGroupListResponse(Promise.resolve(validGroupResult)));

function getMockedGroupListResponse(mock: any) {
    return {
        group: {
            list: () => mock,
        },
    };
}

describe("GroupMaps", () => {
    describe("getGroupMaps", () => {
        groupMapTest
            .stdout()
            .stub(SDK, "ironnode", () => getMockedGroupListResponse(Promise.reject("failed to get user list")))
            .it("fails if groups cannot be retrieved", () => {
                return expect(GroupMaps.getGroupMaps()).to.be.rejected;
            });

        validGroupMapTest.it("fails if groups cannot be retrieved", () => {
            const expectedGroupsByID = {
                gid1: validGroupResult.result[0],
                gid2: validGroupResult.result[1],
                grid3: validGroupResult.result[2],
                groupID4: validGroupResult.result[3],
            };
            const expectedGroupsByName = {
                gname: validGroupResult.result[0],
                group2name: [validGroupResult.result[1], validGroupResult.result[2]],
            };

            return expect(GroupMaps.getGroupMaps()).to.eventually.deep.equal([expectedGroupsByName, expectedGroupsByID]);
        });

        validGroupMapTest
            .add("firstcall", () => GroupMaps.getGroupMaps())
            //Change stub to return different value to prove that we pulled from cache
            .stub(SDK, "ironnode", () => getMockedGroupListResponse([]))
            .add("secondcall", () => GroupMaps.getGroupMaps())
            .it("caches result", (ctx) => {
                expect(ctx.firstcall).to.deep.equal(ctx.secondcall);
            });
    });

    describe("convertGroupNamesToIDs", () => {
        fancy.it("returns empty array when no names provided", () => {
            return expect(GroupMaps.convertGroupNamesToIDs([], {})).to.eventually.deep.equal([]);
        });

        fancy.it("returns expected names and groups with unique names", () => {
            const groupsByName = {
                group1: {groupID: "1"},
                group2: {groupID: "2"},
            };
            return expect(
                GroupMaps.convertGroupNamesToIDs(["id^38383", "group1", "group2", "unknownGroup", "id^1234"], groupsByName as any)
            ).to.eventually.deep.equal(["38383", "1", "2", "unknownGroup", "1234"]);
        });

        fancy
            .stdout()
            .stub(CliUx.ux, "prompt", () => (message: string) => Promise.resolve("1"))
            .it("resolves duplicate groups with prompts", () => {
                const groupsByName = {
                    group1: {groupID: "1"},
                    group2: {groupID: "2"},
                    group3: [{groupID: "18"}, {groupID: "20"}],
                };
                return expect(GroupMaps.convertGroupNamesToIDs(["group1", "group3", "group2"], groupsByName as any)).to.eventually.deep.equal(["1", "18", "2"]);
            });
    });

    describe("getGroupIDFromName", () => {
        groupMapTest.it("returns value when ID is provided", () => {
            return Promise.all([
                expect(GroupMaps.getGroupIDFromName("id^33343")).to.eventually.equal("33343"),
                expect(GroupMaps.getGroupIDFromName("id^^abcd")).to.eventually.equal("^abcd"),
                expect(GroupMaps.getGroupIDFromName("id^id^ab")).to.eventually.equal("id^ab"),
            ]);
        });

        groupMapTest
            .stub(SDK, "ironnode", () => getMockedGroupListResponse(Promise.reject("failed to get user list")))
            .it("rejects if group list call fails", () => {
                return expect(GroupMaps.getGroupIDFromName("name")).to.be.rejected;
            });

        validGroupMapTest.it("rejects if no group name exists with the provided name", () => {
            return expect(GroupMaps.getGroupIDFromName("nameThatDoesNotExist")).to.be.rejected;
        });

        validGroupMapTest.it("returns expected ID when it exists and only one value", () => {
            return expect(GroupMaps.getGroupIDFromName("gname")).to.eventually.equal("gid1");
        });

        describe("multiple group resolution", () => {
            validGroupMapTest
                .stdout()
                .stub(CliUx.ux, "prompt", () => (message: string) => {
                    //Log the message we invoked with so we can assert about it's value below in the stdout output
                    console.log(message);
                    return Promise.resolve("1");
                })
                .it("asks user for group choice and gets the ID for the value picked", (output, done) => {
                    GroupMaps.getGroupIDFromName("group2name").then((groupID) => {
                        expect(groupID).to.equal("gid2");
                        expect(output.stdout).to.contain("Multiple groups found");
                        expect(output.stdout).to.contain("Enter a choice (1 - 2)");
                        expect(output.stdout).to.contain("gid2");
                        expect(output.stdout).to.contain("grid3");
                        done();
                    });
                });
        });
    });

    describe("doesGroupNameAlreadyExist", () => {
        groupMapTest
            .stub(SDK, "ironnode", () => getMockedGroupListResponse(Promise.reject("failed to get user list")))
            .it("rejects if group list call fails", () => {
                return expect(GroupMaps.doesGroupNameAlreadyExist("name")).to.be.rejected;
            });

        validGroupMapTest.it("resolves with expected value depending on provided value", () => {
            return Promise.all([
                expect(GroupMaps.doesGroupNameAlreadyExist("myGroup")).to.eventually.be.false,
                expect(GroupMaps.doesGroupNameAlreadyExist("gName")).to.eventually.be.false,
                expect(GroupMaps.doesGroupNameAlreadyExist("gname")).to.eventually.be.true,
                expect(GroupMaps.doesGroupNameAlreadyExist("group2name")).to.eventually.be.true,
            ]);
        });
    });
});
