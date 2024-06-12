import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";

import { createLibp2p } from "libp2p";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";
import { tcp } from "@libp2p/tcp";
import { keychain } from "@libp2p/keychain";
import { defaultLogger } from "@libp2p/logger";

import { FsBlockstore } from "blockstore-fs";
import { FsDatastore } from "datastore-fs";
import { createHelia } from "helia";
import { Key } from "interface-datastore/key";
import { unixfs } from "@helia/unixfs";

import type { Helia } from "@helia/interface";
import type { UnixFS } from "@helia/unixfs";
import { MerkleDatabase } from "./functions/merkleDatabase";
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
let identity = await createIdentity(ipfs);

const mdb = new MerkleDatabase({ database: "test", ipfs, identity });

await mdb.put("key1", { value: "value1" });
await mdb.put("key2", { value: "value2" });
await mdb.put("key3", { value: "value3" });
await mdb.put("key4", { value: "value4" });
await mdb.put("key5", { value: "value4" });
await mdb.put("key6", { value: "value4" });
await mdb.put("key7", { value: "value4" });
await mdb.put("key8", { value: "value4" });
await mdb.put("key9", { value: "value4" });
await mdb.put("key10", { value: "value4" });

const cid = await mdb.getCID();
console.log("Database: ", cid);
const layers = mdb.getLayers();
console.log("Layers: ", layers);

const mdb1 = new MerkleDatabase({ database: "test", ipfs, identity });
await mdb1.load(cid);
const cid1 = await mdb1.getCID();
console.log("Database1: ", cid1);
const layers1 = mdb.getLayers();
console.log("Layers1: ", layers1);
await mdb1.loadData();

await ipfs.stop();
