import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";

import { identify } from "@libp2p/identify";
import { keychain } from "@libp2p/keychain";
import { defaultLogger } from "@libp2p/logger";
import { mdns } from "@libp2p/mdns";
import { tcp } from "@libp2p/tcp";
import { createLibp2p } from "libp2p";

import { FsBlockstore } from "blockstore-fs";
import { FsDatastore } from "datastore-fs";
import { createHelia } from "helia";
import { Key } from "interface-datastore/key";

import { CID } from "multiformats/cid";
import { createDenkmitDatabase, openDenkmitDatabase } from "./functions/denkmitdb";
import { createIdentity } from "./functions/identity";
import { DenkmitHeliaInterface } from "./types";
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';

const libp2pOptions = {
    addresses: {
        listen: ["/ip4/0.0.0.0/tcp/0"],
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [mdns()],
    services: {
        identify: identify(),
        pubsub: gossipsub({ emitSelf: true }),
    },
};

async function createIpfsNode(nodeNumber: number = 1): Promise<DenkmitHeliaInterface> {
    const directory = `node${nodeNumber}`;
    const blockstore = new FsBlockstore(`${directory}/block-store`);
    const datastore = new FsDatastore(`${directory}/data-store`);

    const keychainInit = {
        pass: "Test password dont use it 123",
    };

    let peerId;

    const chain = keychain(keychainInit)({
        datastore,
        logger: defaultLogger(),
    });

    const selfKey = new Key("/pkcs8/self");

    if (await datastore.has(selfKey)) {
        peerId = await chain.exportPeerId("self");
    }

    const libp2p = await createLibp2p({
        peerId,
        datastore,
        ...libp2pOptions,
    });

    if (peerId == null && !(await datastore.has(selfKey))) {
        await chain.importPeer("self", libp2p.peerId);
    }

    const ipfs = await createHelia({
        datastore,
        blockstore,
        libp2p,
    });

    return ipfs;
}

let ipfs = await createIpfsNode(2);
let identity = await createIdentity({ helia: ipfs, name: "user2" });

const address = await input({ message: 'Enter db address' });

const mdb = await openDenkmitDatabase(address, { ipfs, identity });

await confirm({ message: "Wait for update?" });

for await (const e of mdb.iterator()) {
    console.log(e);
}

await confirm({ message: "Add new?" });

await mdb.set("key10-1", { value: "value10-1" });
await mdb.set("key12-1", { value: "value12-1" });

for await (const e of mdb.iterator()) {
    console.log(e);
}

await confirm({ message: "Close?" });

await mdb.close();