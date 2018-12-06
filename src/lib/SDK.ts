import {SDK} from "@ironcorelabs/ironnode";

/**
 * Since we initialize the IronNode SDK within a hook, we need some place to store the resulting SDK reference so the command that runs after
 * the hook can access it. That's the responsibility of this file.
 */

let sdkReference: SDK;

export function set(sdk: SDK) {
    sdkReference = sdk;
}

export function ironnode() {
    return sdkReference;
}
