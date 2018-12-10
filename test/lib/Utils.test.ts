import {expect, fancy} from "fancy-test";
import * as fs from "fs";
import * as Utils from "../../src/lib/Utils";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

describe("Utils", () => {
    describe("isError", () => {
        fancy.it("should return expected boolean for provided type", () => {
            expect(Utils.isError(new Error("test"))).to.equal(true);
            expect(Utils.isError("error")).to.equal(false);
            expect(Utils.isError({error: true})).to.equal(false);
            expect(Utils.isError(["error"])).to.equal(false);
        });
    });

    describe("isFileReadable", () => {
        fancy
            .stub(fs, "accessSync", () => true)
            .it("should return true if file is accessible", () => {
                expect(Utils.isFileReadable("file path")).to.be.true;
            });

        fancy
            .stub(fs, "accessSync", () => {
                throw new Error("could not read");
            })
            .it("should return true if file is accessible", () => {
                expect(Utils.isFileReadable("file path")).to.be.false;
            });
    });

    describe("validateExistingKeys", () => {
        fancy
            .stub(fs, "readFileSync", () =>
                JSON.stringify({
                    accountID: 3,
                    segmentID: 23,
                    deviceKeys: {},
                    signingKeys: {},
                })
            )
            .it("should return true if config was found and parsable and has all keys", () => {
                expect(Utils.validateExistingKeys("path/to/config")).to.be.ok;
            });

        fancy
            .stub(fs, "readFileSync", () =>
                JSON.stringify({
                    accountID: 3,
                    segmentID: 23,
                    deviceKeys: {},
                })
            )
            .it("should return false when not all keys are present", () => {
                expect(Utils.validateExistingKeys("path/to/config")).not.to.be.ok;
            });

        fancy
            .stub(fs, "readFileSync", () => "invalid json")
            .it("should return false when response is not valid json", () => {
                expect(Utils.validateExistingKeys("path/to/config")).not.to.be.ok;
            });

        fancy
            .stub(fs, "readFileSync", () => {
                throw new Error("cant read file");
            })
            .it("should return false when file cannot be read", () => {
                expect(Utils.validateExistingKeys("path/to/config")).not.to.be.ok;
            });
    });

    describe("normalizePathToFile", () => {
        fancy.it("should return file if it starts with os sep", () => {
            expect(Utils.normalizePathToFile("/etc/stuff")).to.equal("/etc/stuff");
        });

        fancy.it("should return normalized path to current directory", () => {
            const normalizedPath = Utils.normalizePathToFile("foo/bar/package.json");
            expect(normalizedPath.startsWith("/")).to.be.true;
            expect(normalizedPath.endsWith("/foo/bar/package.json")).to.be.true;
        });
    });

    describe("checkSourceFilePermissions", () => {
        fancy
            .stub(fs, "accessSync", () => {
                throw new Error("not readable");
            })
            .it("rejects if file is not readable", () => {
                return expect(Utils.checkSourceFilePermissions("filepath")).to.be.rejected;
            });

        fancy
            .stub(fs, "accessSync", () => null)
            .stub(fs, "lstatSync", () => ({
                isFile: () => false,
            }))
            .it("rejects if file is not a file", () => {
                return expect(Utils.checkSourceFilePermissions("filepath")).to.be.rejected;
            });

        fancy
            .stub(fs, "accessSync", () => null)
            .stub(fs, "lstatSync", () => ({
                isFile: () => true,
            }))
            .it("resolves with nothing when successful", () => {
                return expect(Utils.checkSourceFilePermissions("filepath")).to.eventually.be.undefined;
            });
    });

    describe("checkDestinationFilePermissions", () => {
        fancy
            .stub(fs, "existsSync", () => true)
            .it("rejects if file already exists", () => {
                return expect(Utils.checkDestinationFilePermissions("already exists")).to.be.rejected;
            });

        fancy
            .stub(fs, "existsSync", () => false)
            .stub(fs, "accessSync", () => {
                throw new Error("file not writable");
            })
            .it("rejects if file is not writable", () => {
                return expect(Utils.checkDestinationFilePermissions("not writable")).to.be.rejected;
            });

        fancy
            .stub(fs, "existsSync", () => false)
            .stub(fs, "accessSync", () => true)
            .it("resolves with nothing when successful", () => {
                return expect(Utils.checkDestinationFilePermissions("good to go")).to.eventually.be.undefined;
            });
    });

    describe("convertUserAndGroupToAccessList", () => {
        fancy.it("builds up list of users", () => {
            const userResults = ["foo@bar.com", "bar@baz.com"];
            expect(Utils.convertUserAndGroupToAccessList(userResults, undefined)).to.deep.equal({
                users: [{id: "foo@bar.com"}, {id: "bar@baz.com"}],
                groups: [],
            });
        });

        fancy.it("builds up list of groups", () => {
            const groupResults = ["group1", "group2"];
            expect(Utils.convertUserAndGroupToAccessList(undefined, groupResults)).to.deep.equal({
                users: [],
                groups: [{id: "group1"}, {id: "group2"}],
            });
        });

        fancy.it("builds up lists of both groups", () => {
            const groupResults = ["group1", "group2"];
            const userResults = ["foo@bar.com", "bar@baz.com"];
            expect(Utils.convertUserAndGroupToAccessList(userResults, groupResults)).to.deep.equal({
                users: [{id: "foo@bar.com"}, {id: "bar@baz.com"}],
                groups: [{id: "group1"}, {id: "group2"}],
            });
        });
    });

    describe("createDisplayTable", () => {
        fancy.it("builds up table with columns", () => {
            const table = Utils.createDisplayTable(["col1", "col2", "col3"]);
            const displayedTable = table.toString();
            expect(displayedTable).to.contain("col1");
            expect(displayedTable).to.contain("col2");
            expect(displayedTable).to.contain("col3");
        });
    });

    describe("fileAccessResponseToTableRow", () => {
        fancy.it("builds up expected display with no results", () => {
            const [file, success, failure] = Utils.fileAccessResponseToTableRow("/path/to/file.json", {succeeded: [], failed: []}, {});
            expect(file).to.equal("file.json");
            expect(success).to.equal("");
            expect(failure).to.equal("");
        });

        fancy.it("maps all success rows to user ID or group name", () => {
            const successResults = [
                {type: "user" as "user", id: "userid1"},
                {type: "user" as "user", id: "userid2"},
                {type: "group" as "group", id: "groupid1"},
                {type: "group" as "group", id: "groupid2"},
            ];

            const groupsByID = {
                groupid1: {groupName: "Group Number 1"},
                groupid2: {groupName: "Group #2"},
            };

            const [file, success, failure] = Utils.fileAccessResponseToTableRow("file.json", {succeeded: successResults, failed: []}, groupsByID as any);

            expect(file).to.equal("file.json");
            expect(success).to.contain("userid1");
            expect(success).to.contain("userid2");
            expect(success).to.contain("Group Number 1");
            expect(success).to.contain("Group #2");
            expect(failure).to.equal("");
        });

        fancy.it("maps all failures to expected error display", () => {
            const groupsByID = {
                groupid1: {groupName: "Group Number 1"},
                groupid2: {groupName: "Group #2"},
            };
            const failureResults = [
                {type: "user" as "user", id: "userid1", error: "not real"},
                {type: "user" as "user", id: "userid2", error: "too old"},
                {type: "group" as "group", id: "groupid1", error: "doesnt exist"},
                {type: "group" as "group", id: "groupid2", error: "not admin of group groupid2"},
                {type: "group" as "group", id: "groupid3", error: "no name"},
            ];

            const [file, success, failure] = Utils.fileAccessResponseToTableRow("foo/file.json", {succeeded: [], failed: failureResults}, groupsByID as any);

            expect(file).to.equal("file.json");
            expect(success).to.equal("");
            expect(failure).to.contain("userid1 (not real)");
            expect(failure).to.contain("userid2 (too old)");
            expect(failure).to.contain("Group Number 1 (doesnt exist)");
            expect(failure).to.contain("Group #2 (not admin of group Group #2)");
            expect(failure).to.contain("groupid3 (no name)");
        });
    });

    describe("buildCommandSampleText", () => {
        fancy.it("builds up simple example without description", () => {
            const command = Utils.buildCommandSampleText("stuff");
            expect(command).to.contain("$");
            expect(command).to.contain("ironhide");
            expect(command).to.contain("stuff");
        });

        fancy.it("builds up example with description", () => {
            const command = Utils.buildCommandSampleText("stuff", "description text");
            expect(command).to.contain("$");
            expect(command).to.contain("ironhide");
            expect(command).to.contain("stuff");
            expect(command).to.contain("description text");
        });

        fancy.it("builds up example without prefix", () => {
            const command = Utils.buildCommandSampleText("stuff", "", false);
            expect(command).to.contain("$");
            expect(command).not.to.contain("ironhide");
            expect(command).to.contain("stuff");
        });
    });
});
