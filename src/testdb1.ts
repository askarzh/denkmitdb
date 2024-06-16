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

import type { Helia } from "@helia/interface";
import { CID } from "multiformats/cid";
import { createDenkmitDatabase, openDenkmitDatabase } from "./functions/denkmitdb";
import { createIdentity } from "./functions/identity";
import { DenkmitHelia } from "./types";
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

async function createIpfsNode(nodeNumber: number = 1): Promise<DenkmitHelia> {
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

let ipfs = await createIpfsNode(1);
let identity = await createIdentity({ ipfs, name: "user" });

const mdb = await createDenkmitDatabase("test", { ipfs, identity });

await mdb.set("key1", { value: "value1" });
await mdb.set("key2", { value: "value2" });
await mdb.set("key3", { value: "value3" });
await mdb.set("key4", { value: "value4" });
await mdb.set("key5", { value: "value5" });
await mdb.set("key6", { value: "value6" });
await mdb.set("key7", { value: "value7" });
await mdb.set("key8", { value: "value8" });
await mdb.set("key9", { value: "value9" });

const address = mdb.id;
console.log("Database address: ", address);
for await (const e of mdb.iterator()) {
    console.log(e);
}

await confirm({ message: "Continue to add more records?" });


await mdb.set("key10", { value: "value10" });
await mdb.set("key11", { value: "value11" });
await mdb.set("key12", { value: "value12" });
await mdb.set("key13", { value: "value13" });

for await (const e of mdb.iterator()) {
    console.log(e);
}

await confirm({ message: "Wait to update?" });

for await (const e of mdb.iterator()) {
    console.log(e);
}

await confirm({ message: "Close?" });

await mdb.close();
