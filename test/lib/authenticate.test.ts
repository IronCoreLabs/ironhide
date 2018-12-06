import fancy, {expect} from "fancy-test";
import * as crypto from "crypto";
import * as chai from "chai";
import * as sinon from "sinon";
import * as chaiAsPromised from "chai-as-promised";
import authenticate from "../../src/lib/authenticate";
chai.use(chaiAsPromised);
import * as http from "http";

describe("authenticate", () => {
    const mockDefaultServer = {
        listen: sinon.spy(),
        close: sinon.spy(),
    };

    describe("rejects if local server cant be created", () => {
        const mockServer = {
            listen: sinon.spy(),
            close: sinon.spy(),
        };

        fancy
            .stub(http, "createServer", () => mockServer)
            .it("fails if local server cannot be started", () => {
                const promise = authenticate();
                sinon.assert.calledWithExactly(mockServer.listen, sinon.match.number, sinon.match.func);
                mockServer.listen.firstCall.args[1](new Error("failed to start server"), "foo", "bar", "baz");
                promise.catch(() => {
                    sinon.assert.calledWithExactly(mockServer.close);
                });
            });
    });

    describe("returns correct 404 response when web server is hit with invalid endpoint", () => {
        let serverCallback: any;
        fancy
            .stub(http, "createServer", (onCompleteCallback: any) => {
                serverCallback = onCompleteCallback;
                return mockDefaultServer;
            })
            .it("returns a 404 on invalid endpoint", () => {
                const response: any = {end: sinon.spy()};
                const request = {url: "/foo/bar"};
                authenticate();
                serverCallback(request, response);
                expect(response.statusCode).to.equal(404);
                sinon.assert.calledWithExactly(mockDefaultServer.listen, sinon.match.number, sinon.match.func);
                sinon.assert.notCalled(mockDefaultServer.close);
                sinon.assert.calledWithExactly(response.end, "Not Found");
            });
    });

    describe("returns correct 403 response code when endpoint hit without code", () => {
        let serverCallback: any;
        fancy
            .stub(http, "createServer", (onCompleteCallback: any) => {
                serverCallback = onCompleteCallback;
                return mockDefaultServer;
            })
            .it("returns a 403 on authorize without code", () => {
                const response: any = {end: sinon.spy()};
                const request = {url: "/authorize"};
                authenticate();
                serverCallback(request, response);
                expect(response.statusCode).to.equal(403);
                sinon.assert.calledWithExactly(response.end, sinon.match.string);
            });
    });

    describe("fails if returned JWT doesnt have uid field set", () => {
        let serverCallback: any;
        //Create a JWT without the `uid` field and make sure authentication flow fails
        const jwtPayload = Buffer.from(JSON.stringify({"http://ironcore/sid": 35})).toString("base64");
        const invalidJWT = `header.${jwtPayload}`;

        fancy
            .stub(crypto, "randomBytes", () => Buffer.from([1, 2, 3]))
            .stub(http, "createServer", (onCompleteCallback: any) => {
                serverCallback = onCompleteCallback;
                return mockDefaultServer;
            })
            .nock("https://ironcorelabs.auth0.com", (api) => {
                api.post("/oauth/token").reply(200, JSON.stringify({id_token: invalidJWT}));
            })
            .it("returns a 404 on invalid endpoint", (_, done) => {
                const response: any = {end: sinon.spy(), setHeader: sinon.spy()};
                //State is fixed hex from the above crypto fixed bytes
                const request = {url: "/authorize?code=auth0code&state=010203"};
                const authPromise = authenticate();
                serverCallback(request, response);
                return authPromise.catch((error) => {
                    expect(error.message).to.be.string;
                    expect(response.statusCode).to.be.undefined;
                    sinon.assert.calledWithExactly(mockDefaultServer.close);
                    done();
                });
            });
    });

    describe("grabs code from auth0 redirect, then sends that back to Auth0 for JWT", () => {
        let serverCallback: any;
        const jwtPayload = Buffer.from(JSON.stringify({"http://ironcore/uid": "provUserID"})).toString("base64");
        const fullJWT = `header.${jwtPayload}`;
        fancy
            .stub(crypto, "randomBytes", () => Buffer.from([1, 2, 3]))
            .stub(http, "createServer", (onCompleteCallback: any) => {
                serverCallback = onCompleteCallback;
                return mockDefaultServer;
            })
            .nock("https://ironcorelabs.auth0.com", (api) => {
                api.post("/oauth/token").reply(200, JSON.stringify({id_token: fullJWT}));
            })
            .it("resolves with Auth0 JWT", (_, done) => {
                const response: any = {end: sinon.spy(), setHeader: sinon.spy()};
                //State is fixed hex from the above crypto fixed bytes
                const request = {url: "/authorize?code=auth0code&state=010203"};
                const authPromise = authenticate();
                serverCallback(request, response);
                return authPromise.then((resolvedJWT) => {
                    expect(resolvedJWT).to.equal(fullJWT);
                    expect(response.statusCode).to.equal(302);
                    sinon.assert.calledWithExactly(response.setHeader, "Location", sinon.match.string);
                    sinon.assert.calledWithExactly(response.end);
                    sinon.assert.calledWithExactly(mockDefaultServer.close);
                    done();
                });
            });
    });
});
