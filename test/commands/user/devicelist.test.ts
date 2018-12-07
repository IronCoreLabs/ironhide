import {expect} from "@oclif/test";
import * as sinon from "sinon";
import DeviceList from "../../../src/commands/user/devicelist";
import * as SDK from "../../../src/lib/SDK";
import hookBypass from "../hookBypass";

function getMockedDeviceListResponse(mock: any) {
    return {
        user: {
            listDevices: () => mock,
        },
    };
}

describe("deviceList", () => {
    describe("successful display of users devices", () => {
        hookBypass
            .stdout()
            .stub(SDK, "ironnode", () =>
                getMockedDeviceListResponse(
                    Promise.resolve({
                        result: [
                            {id: "device1", name: "Work Laptop", isCurrentDevice: false, created: 5000, updated: 222},
                            {id: "device2", name: "Work PDA", isCurrentDevice: true, created: 10000, updated: 222},
                            {id: "device3", name: "Home Desktop", isCurrentDevice: false, created: 4000, updated: 222},
                        ],
                    })
                )
            )
            .it("displays expected devices", async (output) => {
                await new DeviceList([], null as any).run();
                expect(output.stdout).to.contain("device1");
                expect(output.stdout).to.contain("Work Laptop");
                expect(output.stdout).to.contain("device2");
                expect(output.stdout).to.contain("Work PDA");
                expect(output.stdout).to.contain("device3");
                expect(output.stdout).to.contain("Home Desktop");
                expect(output.stdout).to.contain("✔");
                //Verify ordering of devices
                expect(output.stdout.indexOf("device2")).to.be.greaterThan(output.stdout.indexOf("device1"));
                expect(output.stdout.indexOf("device1")).to.be.greaterThan(output.stdout.indexOf("device3"));
            });
    });

    describe("request failure handling when SDK throws", () => {
        hookBypass
            .stub(SDK, "ironnode", () => getMockedDeviceListResponse(Promise.reject(new Error("failed to make request"))))
            .it("displays expected keys and errors", async () => {
                const deviceListCommand = new DeviceList([], null as any);
                const errorStub = sinon.stub(deviceListCommand, "error");

                await deviceListCommand.run();
                sinon.assert.calledWithExactly(errorStub, sinon.match.string);
            });
    });
});
