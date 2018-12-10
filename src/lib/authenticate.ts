import opn = require("opn");
import * as http from "http";
import {CLIError} from "@oclif/errors";
import * as url from "url";
import * as crypto from "crypto";
import fetch from "node-fetch";

interface Auth0TokenResponse {
    access_token: string;
    id_token: string;
    expires_in: number;
    token_type: string;
}

const LOCAL_PORT = 4681;
const AUTH0_CLIENT_ID = "hGELxuBKD64ltS4VNaIy2mzVwtqgJa5f";
const REDIRECT_URL = `http://localhost:${LOCAL_PORT}/authorize`;
const AUTH0_DOMAIN = "https://ironcorelabs.auth0.com";
const AUTH0_AUTHORIZE_ENDPOINT = `${AUTH0_DOMAIN}/authorize?scope=openid&20email&response_type=code&client_id=${AUTH0_CLIENT_ID}&redirect_uri=${REDIRECT_URL}&code_challenge_method=S256`;
const AUTH0_TOKEN_ENDPOINT = `${AUTH0_DOMAIN}/oauth/token`;

/**
 * Verify that the token value we got from Auth0 contains our namespaced uid assertion.
 */
function verifyJwtSubject(jwt: string) {
    const [, payload] = jwt.split(".");
    const assertions = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    if (!assertions["http://ironcore/uid"]) {
        throw new Error("Auth0 token did not include email. Are you sure you approved the right permissions on login?");
    }
}

/**
 * Build up the URL that we'll open the users browser to and append the provided challenge and state tokens.
 */
function buildAuth0AuthorizeEndpoint(challenge: string, state: string) {
    return `${AUTH0_AUTHORIZE_ENDPOINT}&code_challenge=${challenge}&state=${state}`;
}

/**
 * Convert the provided bytes into a url safe base64 string.
 */
function base64URLEncode(bytes: Buffer) {
    return bytes
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

/**
 * Build up request details to be able to convert an Auth0 auth code into a JWT token. Takes the code recieved from the initial
 * login workflow as well as the original random bytes we generated to validate this request.
 */
function buildAuth0TokenEndpoint(authorizationCode: string, verifier: string) {
    return {
        url: AUTH0_TOKEN_ENDPOINT,
        options: {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: AUTH0_CLIENT_ID,
                code_verifier: verifier,
                code: authorizationCode,
                redirect_uri: REDIRECT_URL,
            }),
        },
    };
}

/**
 * Generate the three tokens we need to complete the Auth0 login flow.
 * + Verifier: A random 32 byte base64 string
 * + Challenge: The verifier run through SHA256
 * + State: More random bytes that are used to prevent CSRF
 * Read more here: https://auth0.com/docs/api-auth/tutorials/authorization-code-grant-pkce
 */
function getAuthTokens() {
    const verifier = base64URLEncode(crypto.randomBytes(32));
    const challenge = base64URLEncode(
        crypto
            .createHash("sha256")
            .update(verifier)
            .digest()
    );

    return {
        verifier,
        challenge,
        state: crypto.randomBytes(32).toString("hex"),
    };
}

/**
 * Take the authorization code and verifier and send it back to Auth0 to exchange it for
 * a ID token which is the JWT we need to initialize the IronNode SDK.
 */
function getJwtFromAuthorizationCode(authCode: string, verifierToken: string): Promise<Auth0TokenResponse> {
    const requestDetails = buildAuth0TokenEndpoint(authCode, verifierToken);
    return fetch(requestDetails.url, requestDetails.options).then((resp) => resp.json());
}

/**
 * Kick off the authorization flow. Starts up a local Node server that can be used as a redirect point to get an Auth0 authorization code
 * and also opens up the users browser to point to Auth0 for them to pick a service to authenticate with. Resolves with
 */
export default async function authenticate() {
    const authFlowTokens = getAuthTokens();
    return new Promise<string>((resolve, reject) => {
        const server = http.createServer(async (request, response) => {
            const {pathname, query} = url.parse(request.url as string, true);
            //We only need to support a single endpoint, otherwise show a 404
            if (pathname !== "/authorize") {
                response.statusCode = 404;
                return response.end("Not Found");
            }
            //Check that we got a code and that the state variable is the same to prevent CSRF
            if (typeof query.code !== "string" || query.state !== authFlowTokens.state) {
                response.statusCode = 403;
                return response.end("Error with authorization token. Please try again.");
            }
            try {
                //Now that we have a token, exchange it for a JWT
                const auth0Tokens = await getJwtFromAuthorizationCode(query.code, authFlowTokens.verifier);
                verifyJwtSubject(auth0Tokens.id_token);
                response.statusCode = 302;
                response.setHeader("Location", "https://github.com/IronCoreLabs/ironhide/wiki/Authentication-Successful!");
                response.end();
                //We've got our JWT, close down our local server
                server.close();
                resolve(auth0Tokens.id_token);
            } catch (e) {
                server.close(); //Don't leave server open on error
                return reject(e);
            }
        });
        //Startup the local server and once it's up and running, open up the users browser to Auth0 to start the login process
        server.listen(LOCAL_PORT, (err: Error) => {
            if (err) {
                server.close(); //Don't leave server open on error
                return reject(new Error(`Failed to startup local server to handle authentication workflow on port ${LOCAL_PORT}`));
            }
            opn(buildAuth0AuthorizeEndpoint(authFlowTokens.challenge, authFlowTokens.state)).catch(() => {
                server.close(); //Don't leave server open on error
                throw new CLIError("Failed to kick of authentication workflow. Please try again");
            });
        });
    });
}
