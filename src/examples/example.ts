import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { tcp } from "@libp2p/tcp";
import { createHelia } from "helia";
import { createLibp2p } from "libp2p";
import { createDenkmitDatabase, createIdentity } from "../functions";

const libp2pOptions = {
    addresses: {
        listen: ["/ip4/0.0.0.0/tcp/0"],
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
        identify: identify(),
        pubsub: gossipsub({ emitSelf: true }),
    },
};

const libp2p = await createLibp2p(libp2pOptions);
const helia = await createHelia({ libp2p });

//  Create a new identity for Database
const identity = await createIdentity({ helia, name: "user" });

const db = await createDenkmitDatabase("test", { helia, identity });
console.log("Database address: ", db.id);

await db.set("key1", { value: "value1" });
await db.set("key2", { value: "value2" });

for await (const e of db.iterator()) {
    console.log(e);
}

const value1 = await db.get("key1");
console.log("Value 1: ", value1);

await db.close();
await helia.stop();
