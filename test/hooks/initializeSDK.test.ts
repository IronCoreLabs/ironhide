import fancy, {expect} from "fancy-test";
import {CLIError} from "@oclif/errors";
import * as IronNode from "@ironcorelabs/ironnode";
import * as chai from "chai";
import * as fs from "fs";
import * as sinon from "sinon";
import * as chaiAsPromised from "chai-as-promised";
import * as SDK from "../../src/lib/SDK";
import initializeSDK from "../../src/hooks/initializeSDK";
import * as Utils from "../../src/lib/Utils";
chai.use(chaiAsPromised);

describe("initializeSDK", () => {
    const sdkMock = fancy.stub(SDK, "set", sinon.stub()).stub(IronNode, "initialize", sinon.stub().returns("SDK Object"));

    describe("bails on init under certain conditions", () => {
        sdkMock.it("bails when running login", () => {
            const command: any = {
                Command: {id: "login"},
            };

            initializeSDK.call(null as any, command);
            expect((IronNode.initialize as sinon.SinonStub).callCount).to.equal(0);
        });

        sdkMock.it("bails when running -h help flag", () => {
            const command: any = {
                Command: {id: "login"},
                argv: ["-stuff", "-h"],
            };

            initializeSDK.call(null as any, command);
            expect((IronNode.initialize as sinon.SinonStub).callCount).to.equal(0);
        });

        sdkMock.it("bails when running --help flag", () => {
            const command: any = {
                Command: {id: "login"},
                argv: ["-stuff", "-help", "--help"],
            };

            initializeSDK.call(null as any, command);
            expect((IronNode.initialize as sinon.SinonStub).callCount).to.equal(0);
        });
    });

    describe("key file problems", () => {
        const fileEncryptCommand: any = {
            Command: {id: "file:encrypt"},
            argv: [],
            config: {home: "/path/to/home"},
        };

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(false))
            .do(async () => {
                await (initializeSDK as any)(fileEncryptCommand);
            })
            .catch((error) => {
                expect(error.message).to.contain("No device keys found");
            })
            .it("displays error when no device keys");

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(Utils, "validateExistingKeys", sinon.stub().returns(false))
            .do(async () => {
                await (initializeSDK as any)(fileEncryptCommand);
            })
            .catch((e) => {
                expect(e.message).to.contain("could not be successfully parsed");
            })
            .it("fails if key file cannot be read");

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(Utils, "validateExistingKeys", sinon.stub().returns(true))
            .stub(fs, "accessSync", sinon.stub().throws(new Error("File is not readable")))
            .do(async () => {
                await (initializeSDK as any)(fileEncryptCommand);
            })
            .catch((e) => {
                expect(e.message).to.contain("Failed to properly parse device keys");
            })
            .it("fails if key file doesnt have read permissions");

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(Utils, "validateExistingKeys", sinon.stub().returns(true))
            .stub(fs, "accessSync", sinon.stub())
            .stub(fs, "readFileSync", sinon.stub().throws(new Error("File could not be read")))
            .do(async () => {
                await (initializeSDK as any)(fileEncryptCommand);
            })
            .catch((e) => {
                expect(e.message).to.contain("Failed to properly parse device keys");
            })
            .it("fails if readFileSync on device key file fails");

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(Utils, "validateExistingKeys", sinon.stub().returns(true))
            .stub(fs, "accessSync", sinon.stub())
            .stub(fs, "readFileSync", sinon.stub().returns("not JSON!"))
            .do(async () => {
                await (initializeSDK as any)(fileEncryptCommand);
            })
            .catch((e) => {
                expect(e.message).to.contain("Failed to properly parse device keys");
            })
            .it("fails if key file has invalid JSON");
    });

    describe("attempts to read key file from default location", () => {
        const fileEncryptCommand: any = {
            Command: {id: "file:encrypt"},
            argv: [],
            config: {home: "/path/to/home"},
        };

        const keyReadMock = sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(Utils, "validateExistingKeys", sinon.stub().returns(true))
            .stub(fs, "accessSync", sinon.stub().returns(true))
            .stub(
                fs,
                "readFileSync",
                sinon.stub().returns(
                    JSON.stringify({
                        accountID: "actID",
                        segmentID: "seg",
                        deviceKeys: {privateKey: "devPrivKey"},
                        signingKeys: {privateKey: "sigPrivKey"},
                    })
                )
            );

        keyReadMock.it("reads file content and passes data to init SDK", async () => {
            await initializeSDK.call(null as any, fileEncryptCommand);
            sinon.assert.calledWithExactly(fs.readFileSync as any, "/path/to/home/.iron/keys", "utf8");
            sinon.assert.calledWithExactly(IronNode.initialize as any, "actID", "seg", "devPrivKey", "sigPrivKey");
            sinon.assert.calledWithExactly(SDK.set as any, "SDK Object");
        });

        keyReadMock
            .stderr()
            .stub(IronNode, "initialize", sinon.stub().rejects(new Error("Init failed")))
            .do(async () => {
                await (initializeSDK as any)(fileEncryptCommand);
            })
            .catch((e) => {
                expect(e).to.be.instanceOf(CLIError);
            })
            .it("displays error messages from init", (output) => {
                expect(output.stderr).to.contain("Init failed");
            });

        keyReadMock
            .stderr()
            .stub(IronNode, "initialize", sinon.stub().rejects(new Error("Init failed")))
            .it("does not display error when performing logout", async (output) => {
                const logoutCommand: any = {
                    Command: {id: "logout"},
                    argv: [],
                    config: {home: "/path/to/home"},
                };
                await (initializeSDK as any)(logoutCommand);
                expect(output.stderr).to.equal("");
            });
    });

    describe("keyfile flag parsing", () => {
        sdkMock
            .do(async () => {
                const customKeyFileCommand: any = {
                    Command: {id: "file:encrypt"},
                    argv: ["-k"],
                    config: {home: "/path/to/home"},
                };
                await (initializeSDK as any)(customKeyFileCommand);
            })
            .catch((e) => {
                expect(e).to.be.instanceOf(CLIError);
                expect(e.message).to.contain("Flag --keyfile expects a value.");
            })
            .it("fails when -k with no value");

        sdkMock
            .do(async () => {
                const customKeyFileCommand: any = {
                    Command: {id: "file:encrypt"},
                    argv: ["--keyfile"],
                    config: {home: "/path/to/home"},
                };
                await (initializeSDK as any)(customKeyFileCommand);
            })
            .catch((e) => {
                expect(e).to.be.instanceOf(CLIError);
                expect(e.message).to.contain("Flag --keyfile expects a value.");
            })
            .it("fails when --keyfile with no value");

        sdkMock
            .do(async () => {
                const customKeyFileCommand: any = {
                    Command: {id: "file:encrypt"},
                    argv: ["--keyfile="],
                    config: {home: "/path/to/home"},
                };
                await (initializeSDK as any)(customKeyFileCommand);
            })
            .catch((e) => {
                expect(e).to.be.instanceOf(CLIError);
                expect(e.message).to.contain("Flag --keyfile expects a value.");
            })
            .it("fails when --keyfile= with no value");
    });

    describe("custom key file location", () => {
        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(false))
            .do(async () => {
                const customKeyFileCommand: any = {
                    Command: {id: "file:encrypt"},
                    argv: ["-k", "/path/to/custom/keyfile"],
                    config: {home: "/path/to/home"},
                };
                await (initializeSDK as any)(customKeyFileCommand);
            })
            .catch((e) => {
                expect(e).to.be.instanceOf(CLIError);
                expect(e.message).to.contain("either doesn't exist or cannot be read");
            })
            .it("throws error if custom key file cannot be read");

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(fs, "lstatSync", sinon.stub().returns({isFile: () => false}))
            .do(async () => {
                const customKeyFileCommand: any = {
                    Command: {id: "file:encrypt"},
                    argv: ["-flag1", "--flag2", "flag2Val", "--keyfile", "/path/to/custom/keyfile"],
                    config: {home: "/path/to/home"},
                };
                await (initializeSDK as any)(customKeyFileCommand);
            })
            .catch((e) => {
                expect(e).to.be.instanceOf(CLIError);
                expect(e.message).to.contain("does not appear to be a file");
            })
            .it("throws error if custom key file cannot be read");

        sdkMock
            .stub(Utils, "isFileReadable", sinon.stub().returns(true))
            .stub(Utils, "validateExistingKeys", sinon.stub().returns(true))
            .stub(fs, "accessSync", sinon.stub().returns(true))
            .stub(fs, "lstatSync", sinon.stub().returns({isFile: () => true}))
            .stub(
                fs,
                "readFileSync",
                sinon.stub().returns(
                    JSON.stringify({
                        accountID: "actID",
                        segmentID: "seg",
                        deviceKeys: {privateKey: "devPrivKey"},
                        signingKeys: {privateKey: "sigPrivKey"},
                    })
                )
            )
            .it("reads from custom key file location when provided", async () => {
                const customKeyFileCommand: any = {
                    Command: {id: "file:encrypt"},
                    argv: ["-o", "--keyfile=/path/to/custom/keyfile"],
                    config: {home: "/path/to/home"},
                };

                await (initializeSDK as any)(customKeyFileCommand);
                sinon.assert.calledWithExactly(fs.readFileSync as any, "/path/to/custom/keyfile", "utf8");
                sinon.assert.calledWithExactly(fs.accessSync as any, "/path/to/custom/keyfile", fs.constants.R_OK);
                sinon.assert.calledWithExactly(fs.lstatSync as any, "/path/to/custom/keyfile");
                sinon.assert.calledWithExactly(IronNode.initialize as any, "actID", "seg", "devPrivKey", "sigPrivKey");
                sinon.assert.calledWithExactly(SDK.set as any, "SDK Object");
            });
    });
});
