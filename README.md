# DenkMitDB

DenkMitDB is a distributed key-value database built heavily on IPFS, using a Merkle Tree as a consistency controller. It includes consensus and access controllers to ensure the database remains safe and consistent across distributed nodes. It has capabilities to delete records.

## Features

- **Distributed Storage**: Utilizes IPFS for decentralized data storage.
- **Consistency Control**: Employs Merkle Tree structures to maintain data consistency.
- **Consensus Mechanism**: Ensures all nodes agree on the current state of the database.
- **Access Control**: Manages permissions and security for database access.

## Installation

To set up DenkMitDB, follow these steps:

1. **Clone the repository**:
    ```bash
    git clone https://github.com/askarzh/denkmitdb.git
    cd denkmitdb
    ```

2. **Install dependencies**:
    ```bash
    npm install
    ```
    
## Usage

After installation, you can start using DenkMitDB by following these steps:

1. **Import modules**:
    ```typescript
    import { gossipsub } from "@chainsafe/libp2p-gossipsub";
    import { noise } from "@chainsafe/libp2p-noise";
    import { yamux } from "@chainsafe/libp2p-yamux";
    import { identify } from "@libp2p/identify";
    import { tcp } from "@libp2p/tcp";
    import { createHelia } from "helia";
    import { createLibp2p } from "libp2p";
    import { createDenkmitDatabase, createIdentity } from "../functions";
    ```

2. **Initialize libp2p & Helia**:
    ```typescript
    const libp2pOptions = {
        addresses: { listen: ["/ip4/0.0.0.0/tcp/0"] },
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
    ```

3. **Create new Database Identity and new Database**:
    ```typescript
    const identity = await createIdentity({ helia, name: "user" });

    const db = await createDenkmitDatabase("test", { helia, identity });
    console.log("Database address: ", db.id);
    ```

4. **Add new data to Database**:
    ```typescript
    await db.set("key1", { value: "value1" });
    await db.set("key2", { value: "value2" });

    for await (const e of db.iterator()) {
        console.log(e);
    }
    ```
5. **Retrieve data from Database**:
    ```typescript
    const value1 = await db.get("key1");
    console.log("Value 1: ", value1);
    ```
6. **Close Database**
    ```typescript
    await db.close();
    await helia.stop();
    ```

## Contributing

We welcome contributions! Please fork the repository and submit pull requests. For major changes, please open an issue to discuss what you would like to change.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Dependencies

- IPFS
- Libp2p
- TypeScript
- Node.js

## Contact

For more information, please contact the project maintainer at [askar@zhakenov.pro](mailto:askar@zhakenov.pro).
