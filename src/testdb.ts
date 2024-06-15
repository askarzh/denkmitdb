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

async function createIpfsNode(nodeNumber: number = 1): Promise<Helia> {
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

    const ipfs: Helia = await createHelia({
        datastore,
        blockstore,
        libp2p,
    });

    return ipfs;
}

let ipfs = await createIpfsNode(1);
let identity = await createIdentity({ ipfs });
let identity1 = await createIdentity({ ipfs, name: "test1" });

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

let head = await mdb.createHead();

const mdb1 = await openDenkmitDatabase(address, { ipfs, identity: identity1 });
await mdb1.load(head);
const address1 = mdb1.id;
console.log("Database1 address: ", address1);

await mdb.set("key10", { value: "value10" });
await mdb1.set("key10-1", { value: "value10-1" });
await mdb.set("key11", { value: "value11" });
await mdb.set("key12", { value: "value12" });
await mdb1.set("key12-1", { value: "value12-1" });
await mdb.set("key13", { value: "value13" });
const cidUpdated = await mdb.createHead();
console.log("Database with new records: ", cidUpdated);
for await (const e of mdb.iterator()) {
    console.log(e);
}
console.log("Database1 before merge: -------------------");
for await (const e of mdb1.iterator()) {
    console.log(e);
}
head = await mdb.createHead();
console.log("Head: ", head);
const head1 = await mdb1.getHead(CID.parse(head.id));
console.log("Head1: ", head1);
if (!head1) process.exit(1);
const diff = await mdb1.compare(head1);
console.log("Diff: ", diff.difference[1]);

for await (const e of mdb1.iterator()) {
    console.log(e);
}

await mdb1.merge(head1);
const cidMerged = await mdb1.createHead();
console.log("Database after merge: ", cidMerged);

for await (const e of mdb1.iterator()) {
    console.log(e);
}

await ipfs.stop();
