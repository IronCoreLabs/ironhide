import {expect} from "@oclif/test";
import * as sinon from "sinon";
import DeviceDelete from "../../../src/commands/user/devicedelete";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

function getMockedDeviceResponse(mockList?: any, mockDelete?: any) {
    return {
        user: {
            listDevices: () => (mockList instanceof Error ? Promise.reject(mockList) : Promise.resolve(mockList)),
            deleteDevice: () => (mockDelete instanceof Error ? Promise.reject(mockDelete) : Promise.resolve(mockDelete)),
        },
    };
}

describe("deviceDelete", () => {
    describe("fails if the user provides a non numerical device ID", () => {
        hookBypass
            .stub(SDK, "ironnode", () => getMockedDeviceResponse({result: []}))
            .it("displays expected error", async () => {
                const deviceDeleteCommand = new DeviceDelete(["myDevice"], null as any);
                const logStub = sinon.stub(deviceDeleteCommand, "log");

                await deviceDeleteCommand.run();
                sinon.assert.calledWithExactly(logStub, sinon.match.string);
                expect(logStub.firstCall.args[0]).to.contain("Expected a numerical device ID");
            });
    });

    describe("fails if user is trying to delete their current device", () => {
        const deviceListResponse = {result: [{id: 881, isCurrentDevice: true}]};

        hookBypass
            .stub(SDK, "ironnode", () => getMockedDeviceResponse(deviceListResponse))
            .it("displays expected devices", async () => {
                const deviceDeleteCommand = new DeviceDelete(["881"], null as any);
                const errorStub = sinon.stub(deviceDeleteCommand, "error");

                await deviceDeleteCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(errorStub.firstCall.args[0]).to.contain("delete keys for the current device");
            });
    });

    describe("makes request do delete all of the devices provided", () => {
        const deviceListResp = {result: []};
        const deviceDeleteResp = {id: 532};

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedDeviceResponse(deviceListResp, deviceDeleteResp))
            .it("displays expected number of successes", async (output) => {
                await new DeviceDelete(["881", "382", "949", "133"], null as any).run();
                expect(output.stdout).to.contain("4 device key(s) success");
            });
    });

    describe("displays errors when device deletes fail", () => {
        const deviceListResp = {result: []};
        const deviceDeleteResp = new Error("mock failure");

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedDeviceResponse(deviceListResp, deviceDeleteResp))
            .it("displays expected number of failures", async (output) => {
                await new DeviceDelete(["881", "382", "949", "133"], null as any).run();
                expect(output.stdout).to.contain("4 device key(s) failed");
                expect(output.stdout.match(/mock\sfailure/g) || []).to.have.length(4);
            });
    });

    describe("displays error when device list fails", () => {
        const deviceListResp = new Error("mock failure");

        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () => getMockedDeviceResponse(deviceListResp))
            .it("displays failure text", async (output) => {
                const deleteCommand = new DeviceDelete(["881", "382", "949", "133"], null as any);

                const errorStub = sinon.stub(deleteCommand, "error");

                await deleteCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
                expect(errorStub.firstCall.args[0]).to.contain("Failed to make request");
            });
    });
});
