import {GroupMetaResponse} from "@ironcorelabs/ironnode";
import {CLIError} from "@oclif/errors";
import {CliUx} from "@oclif/core";
import {ironnode} from "./SDK";
import {createDisplayTable} from "./Utils";
import chalk = require("chalk");

export interface GroupsByName {
    [groupIndex: string]: GroupMetaResponse | GroupMetaResponse[];
}
export interface GroupsByID {
    [groupID: string]: GroupMetaResponse;
}

export const GROUP_ID_PREFIX = "id^";
let hasRequestedGroups = false;
let groupsByIndexCache = {
    groupsByName: {},
    groupsByID: {},
};

/**
 * Check if the provided group ID is actually a fixed ID value.
 */
const isGroupID = (providedGroupValue: string) => providedGroupValue.startsWith(GROUP_ID_PREFIX);

/**
 * Typeguard to check whether the provided group-by-name value is an array of groups or a single group.
 */
const isMultipleGroups = (groupList: GroupMetaResponse | GroupMetaResponse[]): groupList is GroupMetaResponse[] => Array.isArray(groupList);

/**
 * Convert a list of groups from the SDK response into a map from the provided index (name or ID) to the group details.
 */
const createGroupMapByIndex = (groupResult: GroupMetaResponse[]) => {
    const groupsByIndex = {
        groupsByName: {} as GroupsByName,
        groupsByID: {} as GroupsByID,
    };

    return groupResult.reduce((maps, group) => {
        maps.groupsByID[group.groupID] = group;
        //If the group doesn't have a name (will only happen if the group was created outside of the CLI) we just omit it from the by-name map. The user
        //will have to provide the group by ID in that case.
        if (!group.groupName) {
            return maps;
        }
        const groupName = group.groupName;
        const groupAtIndex = maps.groupsByName[groupName];
        if (Array.isArray(groupAtIndex)) {
            groupAtIndex.push(group);
        } else if (groupAtIndex) {
            maps.groupsByName[groupName] = [groupAtIndex, group];
        } else {
            maps.groupsByName[groupName] = group;
        }
        return maps;
    }, groupsByIndex);
};

/**
 * Get a list of the users groups and create maps from the results to groups keyed by ID and groups keyed by name in the local cache
 * so we can store them for later.
 */
const populateUsersGroups = (): Promise<[GroupsByName, GroupsByID]> => {
    if (hasRequestedGroups) {
        return Promise.resolve([groupsByIndexCache.groupsByName, groupsByIndexCache.groupsByID] as [GroupsByName, GroupsByID]);
    }
    return ironnode()
        .group.list()
        .then((groupResult) => {
            groupsByIndexCache = createGroupMapByIndex(groupResult.result);
            hasRequestedGroups = true;
            return [groupsByIndexCache.groupsByName, groupsByIndexCache.groupsByID] as [GroupsByName, GroupsByID];
        });
};

/**
 * Get a value from the user in a prompt and make sure they entered a valid number for a choice of which group
 * to select.
 */
const getGroupChoice = async (size: number): Promise<number> => {
    let choice = "1";
    try {
        const questionRange = chalk.gray(`(1 - ${size})`);
        choice = (await CliUx.ux.prompt(`${chalk.magenta("Enter a choice")} ${questionRange}`)) as string;
    } catch (_) {
        //User exited out, so bail
        process.exit(0);
    }
    const numericalChoice = parseInt(choice);
    if (numericalChoice && numericalChoice > 0 && numericalChoice <= size) {
        return Promise.resolve(numericalChoice - 1);
    }
    console.log(chalk.red("Invalid option, please try again."));
    return getGroupChoice(size);
};

/**
 * Given a list of groups with duplicate names, get the underlying ID of the group the user wants to use for this
 * operation.
 */
const getUsersGroupChoice = async (groupName: string, groups: GroupMetaResponse[]): Promise<string> =>
    new Promise((resolve: (groupID: string) => void) => {
        const check = chalk.green("✔");
        const nope = chalk.red("✖");
        console.log(chalk.yellow(`\nMultiple groups found with the provided name '${groupName}', which one do you want to use?\n`));
        const groupDetailsTable = createDisplayTable(["Option", "ID", "Admin", "Member", "Created", "Updated"]);
        groups.forEach((group, index) => {
            groupDetailsTable.push([
                index + 1,
                group.groupID,
                group.isAdmin ? check : nope,
                group.isMember ? check : nope,
                new Date(group.created).toLocaleDateString(),
                new Date(group.updated).toLocaleDateString(),
            ]);
        });
        console.log(groupDetailsTable.toString());
        getGroupChoice(groups.length)
            .then((groupIndexChoice) => resolve(groups[groupIndexChoice].groupID))
            .catch(() => process.exit(-1));
    });

/**
 * Clear group list cache. Used only within unit tests.
 */
export const clearCache = () => {
    hasRequestedGroups = false;
    groupsByIndexCache = {
        groupsByName: {},
        groupsByID: {},
    };
};

/**
 * Get a map from group ID to group information for all the groups the user is a part of.
 */
export const getGroupMaps = async (): Promise<[GroupsByName, GroupsByID]> => {
    let groupsByID: GroupsByID;
    let groupsByName: GroupsByName;
    try {
        [groupsByName, groupsByID] = await populateUsersGroups();
    } catch (e) {
        console.log(e);
        throw new CLIError("Unable to make request to lookup group information.");
    }
    return [groupsByName, groupsByID];
};

/**
 * Take a list of group names and map them to a list of group IDs. If any name provided can't be mapped to a name
 * it will come back unmodified.
 */
export const convertGroupNamesToIDs = async (groupNames: string[] | undefined, groupsByName: GroupsByName) => {
    if (!groupNames || !groupNames.length) {
        return Promise.resolve([]);
    }

    //Iterate through each group and build up a Promise chain of all the group names to IDs. The promises will all be auto resolved unless
    //we find a group name which has a duplicate. In that case we'll ask the user for their choice before proceeding.
    const resolvedNames = groupNames.reduce(async (promiseChain, providedName) => {
        let resolvedNameToID: () => Promise<string>;
        if (isGroupID(providedName)) {
            resolvedNameToID = () => Promise.resolve(providedName.substring(GROUP_ID_PREFIX.length));
        } else {
            const groupAtIndex = groupsByName[providedName];
            resolvedNameToID = () => {
                if (groupAtIndex) {
                    if (isMultipleGroups(groupAtIndex)) {
                        return getUsersGroupChoice(providedName, groupAtIndex);
                    }
                    return Promise.resolve(groupAtIndex.groupID);
                }
                return Promise.resolve(providedName);
            };
        }
        return promiseChain.then((chainResults) => {
            return resolvedNameToID().then((currentResult) => [...chainResults, currentResult]);
        });
    }, Promise.resolve([] as string[]));

    return resolvedNames;
};

/**
 * Given a group name, lookup the groups that the user is a part of and attempt to get the ID of
 * the group. Will return null if user isn't a member or admin of any group with the provided name.
 */
export const getGroupIDFromName = async (groupName: string) => {
    if (isGroupID(groupName)) {
        return Promise.resolve(groupName.substring(GROUP_ID_PREFIX.length));
    }
    let groupsByName: GroupsByName;
    try {
        [groupsByName] = await populateUsersGroups();
    } catch (_) {
        throw new CLIError("Unable to make request for provided group.");
    }
    if (!groupsByName[groupName]) {
        throw new CLIError(`Group '${groupName}' doesn't exist or couldn't be retrieved.`);
    }
    const groupAtIndex = groupsByName[groupName];
    if (isMultipleGroups(groupAtIndex)) {
        return getUsersGroupChoice(groupName, groupAtIndex);
    }
    return Promise.resolve(groupAtIndex.groupID);
};

/**
 * Given a group name, see if the user is already part of a group with the same name.
 */
export const doesGroupNameAlreadyExist = (groupName: string) => populateUsersGroups().then(([groupsByName]) => groupsByName[groupName] !== undefined);
