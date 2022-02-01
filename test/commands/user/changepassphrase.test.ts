import {ErrorCodes} from "@ironcorelabs/ironnode";
import {expect} from "@oclif/test";
import {CliUx} from "@oclif/core";
import * as sinon from "sinon";
import ChangePassphrase from "../../../src/commands/user/changepassphrase";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

describe("changepassphrase", () => {
    describe("fails if the users confirm passphrase doesnt match the original", () => {
        hookBypass
            .stub(CliUx.ux, "prompt", () => {
                return sinon.stub().callsFake(() => Promise.resolve(Math.random().toString(36).substring(2, 15)));
            })
            .it("displays expected error", async () => {
                const changePassphraseCommand = new ChangePassphrase([], null as any);
                const errorStub = sinon.stub(changePassphraseCommand, "error");

                await changePassphraseCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(errorStub.firstCall.args[0]).to.contain("do not match");
            });
    });

    describe("calls into IronNode when values provided", () => {
        hookBypass
            .stub(SDK, "ironnode", () => ({
                user: {changePassword: () => Promise.resolve()},
            }))
            .stub(CliUx.ux, "prompt", () => {
                return sinon.stub().callsFake(() => Promise.resolve("passphrase"));
            })
            .it("displays expected error", async () => {
                const changePassphraseCommand = new ChangePassphrase([], null as any);
                const logStub = sinon.stub(changePassphraseCommand, "log");

                await changePassphraseCommand.run();

                sinon.assert.calledWithExactly(logStub, sinon.match.string);
                expect(logStub.firstCall.args[0]).to.contain("successfully changed");
            });
    });

    describe("logs specific error for passcode failure", () => {
        hookBypass
            .stub(SDK, "ironnode", () => ({
                user: {changePassword: () => Promise.reject({code: ErrorCodes.USER_PASSCODE_CHANGE_FAILURE})},
            }))
            .stub(CliUx.ux, "prompt", () => {
                return sinon.stub().callsFake(() => Promise.resolve("passphrase"));
            })
            .it("displays expected error", async () => {
                const changePassphraseCommand = new ChangePassphrase([], null as any);
                const errorStub = sinon.stub(changePassphraseCommand, "error");

                await changePassphraseCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(errorStub.firstCall.args[0]).to.contain("Current passphrase was incorrect");
            });
    });

    describe("logs generic error for other failures", () => {
        hookBypass
            .stub(SDK, "ironnode", () => ({
                user: {changePassword: () => Promise.reject(new Error("forced error"))},
            }))
            .stub(CliUx.ux, "prompt", () => {
                return sinon.stub().callsFake(() => Promise.resolve("passphrase"));
            })
            .it("displays expected error", async () => {
                const changePassphraseCommand = new ChangePassphrase([], null as any);
                const errorStub = sinon.stub(changePassphraseCommand, "error");

                await changePassphraseCommand.run();

                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(errorStub.firstCall.args[0]).to.contain("forced error");
            });
    });
});
