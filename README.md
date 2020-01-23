IronHide
=========================

Tool to easily encrypt and decrypt files to users and groups. Similar to GPG, but usable at scale.

Read our blog post in [Hacker Noon](https://medium.com/hackernoon/ironhide-better-team-encryption-8950117dc6f0)

[![NPM Version](https://badge.fury.io/js/%40ironcorelabs%2Fironhide.svg)](https://www.npmjs.com/package/@ironcorelabs/ironhide)
[![Build Status](https://travis-ci.org/IronCoreLabs/ironhide.svg?branch=master)](https://travis-ci.org/IronCoreLabs/ironhide)

![](https://media.giphy.com/media/uZDTYzxdYzmbS/giphy.gif)

## Installation

`npm install -g --unsafe-perm @ironcorelabs/ironhide`

This installs IronHide as a global package on your system and adds `ironhide` as an executable to your path.

## Example Usage

The following example shows how to create a new IronHide group, encrypt files to the group, and then add other users as members of the group, so they have access to decrypt the files.

```bash
$ ironhide group:create engineering
$ ironhide file:encrypt -g engineering secrets.json
$ ironhide group:addmembers -u john@example.com,karen@example.com,julio@example.com engineering
```

At this point, you will have a `secrets.json.iron` file that can be sent to the users you added to the group. To decrypt the file and displaying its decrypted contents, they will run:

```bash
$ ironhide file:decrypt secrets.json.iron -o -
```

Let's say at some later point you no longer want `john@example.com` to be able to decrypt the file. You can revoke his decryption access by removing him from the group.

```bash
$ ironhide group:removemember -u john@example.com engineering
```

At that point, he will no longer be able to decrypt the `secrets.json.iron` file. You don't need to make any modifications to the file to revoke John's access. Amazing!

## Supported Platforms

|           | Node 8 | Node 10 | Node 12 |
| --------- | ------ | ------- | ------- |
| Linux x64 |    ✓   |    ✓    |    ✓    |
| OSX x64   |    ✓   |    ✓    |    ✓    |

## Overview

IronHide is a NodeJS command line interface (CLI) tool that allows for scalable and controlled management of sensitive files. What do we mean by "scalable and controlled"? Let's break down each benefit.

### Scalable

If you've ever used GPG to manage access to sensitive files within a team, you'll understand the scalability issues that you encounter almost immediately. Encrypting files to a team via GPG requires getting the public keys of each user in the team. When you later want to add a new user to that list (for example, when you hire a new person to your team), you have to take the encrypted file, decrypt it, re-encrypt it to everyone in the original list plus the new user, and then distribute the newly encrypted file to everyone. The workflow for revocation is even worse. If someone leaves your team and you want to make sure they no longer have access, you have to take the encrypted file, decrypt it, and re-encrypt it to everyone in the team minus the user to remove. However, if that user still has access to the original encrypted file, nothing prevents them from still being able to decrypt — what a mess.

IronHide uses a different form of cryptography called proxy re-encryption or transform encryption. With transform encryption, you're able to make cryptographic groups. Groups have their own public-private key pairs, and files are encrypted to the group instead of to individual users. Better yet, management of group membership can be done independently of encrypting any files to the group. New members that are added to a group can immediately decrypt any files that have already been encrypted to the group. It is no longer necessary to download and decrypt files to add new members. In addition, revoking access from users is as simple as removing their membership from the group. And again, the original encrypted files don't need to be touched. Once a member is removed from the group, they won't be able to decrypt any files encrypted to the group, even if they can actually retrieve the encrypted files.

### Controlled

Another downside of conventional tools like GPG is supporting the proliferation of devices that users have that need access to sensitive files. Users today have desktops, laptops, mobile phones, tablets and other devices that they want to use to access sensitive data. With tools like GPG, you're required to copy your private key from device to device in order for it to work. This becomes a real issue if one of those devices is lost or stolen. Once someone else has your GPG private key, it's game over as they can decrypt all of your encrypted files. Your only recourse is to have someone decrypt all the sensitive files and re-encrypt them without your public key, which can be unfeasible.

IronHide solves this by creating a separate public-private key pair for each device on which you need decryption access. All files are only ever decrypted by these device keys. Your master private key is only needed on each device for long enough to generate these device keys. After they're generated, your master private key is erased from the device. Devices keys can then be managed via IronHide. If you lose a device, you can simply delete the device keys for that device from any other authorized device. An attacker who gains access to that device will still have the device key pair, but the keys will no longer be able to decrypt any of your data.

## Setup and Authentication

The first step in setting up IronHide is to authenticate yourself to access the tool. This authentication flow causes a new set of asymmetric keys to be generated and tied to the email for the Internet account that you use to authenticate. This allows other users to grant you access to files or invite you to groups using your email address as a unique identifier.

When you run `ironhide login`, we'll open a browser window on your machine where you can authenticate via Auth0. Upon successful authentication, we'll generate a master public-private key pair that is tied to your email address. The public key will be uploaded to the IronCore key server and will be discoverable by anybody else who has your email. We'll then ask you for a passphrase which is used to encrypt and protect your private key. Once your private key is secured, we'll upload the encrypted key to the IronCore key server for escrow storage. Nobody else will be able to access your encrypted private key on the IronCore key server except for you. Your private master key is only ever used to approve devices on which you want to use IronHide. Anytime you want to re-authenticate into IronHide, or you want to setup IronHide on another machine, you'll need to enter this passphrase to decrypt your private master key.

**The passphrase you provide upon account creation is required to authorize devices for your account. Don't forget your passphrase! If you forget your passphrase there is no recovery option!**

Once your master public and private keys are setup and escrowed, we'll then generate a separate public-private key pair (your device keys) for your computer. This device key pair will never leave your machine and will be stored in a `.iron` directory in your home directory. You'll also be asked to give a name to these device keys. After your device keys are successfully generated and stored, you'll be able to run any of the various commands provided by IronHide.

## File Operations

Files can be managed with IronHide using the various file commands. Use `ironhide file -h` to see the list of file commands available,  with descriptions and examples. When you encrypt a file, it will automatically be encrypted to your account's public key so that you're able to decrypt it. When using the `file:encrypt` command, you can also grant decryption to any number of users and groups. You can also use the `file:grant` command to grant access to other users and groups after the file is encrypted.

IronHide is only responsible for managing cryptographic access control; that is, encrypting, decrypting, and managing groups and members. You are responsible for actually distributing the encrypted files to places that others can access after they've been encrypted. This can be done via existing Cloud file hosting solutions such as Google Drive, Box, or Dropbox or however you're already managing your sensitive files.

## Groups

Groups are what sets IronHide apart. A group is a collection of users that should all have the same access to encrypted files. Managing membership of the group is done independently of encrypting any files to the group. This means that when you add a new member to a group, they can immediately decrypt all files that have been encrypted to the group. This is what allows IronHide to be infinitely more scalable than `gpg`. If you have several files that should be accessible by the same set of people, we recommend creating a group of those users, so you can easily manage access changes over time.

Groups have two different types of users: admins and members. Admins are the users in control of the group. They are able to manage membership in the group, change the group name, and delete the group. Admins do **not** have permission to decrypt files that are encrypted to the group unless they are also a member. Members are users that have access to decrypt files that are encrypted to the group. Removing a user as a member of a group removes that user's ability to decrypt any of the files encrypted to the group.

When you create a new group, it generates a public-private key pair for the group and automatically adds the creator as an admin and a member of the group. If you are a group admin, when you add a member to the group, IronHide retrieves and decrypts the group private key and uses it to generate a "transform key" that allows ciphertext encrypted to party A to be transformed into ciphertext encrypted to party B. This works using a type of proxy re-encryption called transform cryptography and is facilitated by the free IronCore service. The IronCore service cannot grant access and is never in a position to decrypt data (or see the ciphertext of a file). All access grants are provably secure and in your control. Details can be found at [https://docs.ironcorelabs.com](https://docs.ironcorelabs.com).

Use `ironhide group -h` to see the list of group commands available, including descriptions and examples.

## Users and Devices

IronHide manages your collection of devices (like laptops or desktops) as if they were members of a group representing your user, allowing them to encrypt and decrypt using their own locally generated private keys on your behalf. If a device is lost or stolen, the keys on that device can be revoked, rendering them useless for decrypting a user's data. No network or other access to the device itself is required. Also of note: if a file is encrypted to a group, then that file can only be decrypted by the authorized devices of members of that group. The intermediate private keys, such as the private key of the group, cannot directly decrypt data. Those keys can only be used to delegate access. For more information, see IronCore’s documentation: [https://docs.ironcorelabs.com](https://docs.ironcorelabs.com).

The user commands have two purposes: 1) manage your own authorized devices and 2) look up other users in the system by email address. Use `ironhide user -h` to see the list of user and device commands available, including descriptions and examples.

# Technology

IronHide is built using the [IronCore Labs IronNode SDK](https://github.com/IronCoreLabs/ironnode). If you're interested in learning about the underlying technology that powers IronHide, visit our [documentation site](https://docs.ironcorelabs.com) or [contact us](https://ironcorelabs.com) to learn more.

# License

IronHide is licensed under the [GNU Affero General Public License](LICENSE). We also offer commercial licenses - [email](mailto:info@ironcorelabs.com) for more information.

Copyright (c)  2018-present  IronCore Labs, Inc. All rights reserved.
