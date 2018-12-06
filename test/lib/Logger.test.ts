import fancy, {expect} from "@oclif/test";
import * as Logger from "../../src/lib/Logger";

describe("Logger", () => {
    describe("info", () => {
        fancy.stdout().it("converts objects to strings and logs message to stdout", (output) => {
            Logger.info({foo: "bar"});
            expect(output.stdout).to.contain("{ foo: 'bar' }\n");
        });

        fancy.stdout().it("adds newlines for long strings", (output) => {
            Logger.info(
                "Mauris sollicitudin commodo felis, nec dapibus dolor tempus ac. Suspendisse potenti. Maecenas neque magna, scelerisque nec molestie id, pulvinar pulvinar metus. Duis semper eu lacus at suscipit. Aenean convallis quam eget convallis malesuada. Nam a sagittis massa. Proin ac leo odio. Nunc vitae magna eu nulla pulvinar interdum. Donec ultrices fringilla neque vitae efficitur. Mauris augue leo, porttitor consectetur tellus et, egestas tincidunt risus. Duis ultrices facilisis efficitur."
            );
            const newlineCount = (output.stdout.match(/\n/g) || []).length;
            expect(newlineCount).to.equal(4);
        });
    });
});
