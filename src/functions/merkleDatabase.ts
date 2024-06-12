import {
    DataTypes,
    ManifestType,
    EntryInterface,
    MerkleDatabaseInterface,
    PollardType,
    PollardInterface,
    PollardNode,
    DataType,
    LeafType,
    LeafTypes,
    IdentityInterface,
} from "../interfaces";
import { createLeaf, createPollard, createEntry } from "./";
import { Helia } from "@helia/interface";
import { dagCbor, DAGCBOR } from "@helia/dag-cbor";
import { CID } from "multiformats/cid";
import { OrderedMap } from "js-sdsl";
import jose from "jose";
import * as codec from "@ipld/dag-cbor";

class TimestampConsensusController {}

type EntryTimestampTreeRecord = {
    sortFields: number[];
    entryKey: string;
};

type EntryKeyPollardCidHashMapRecord = {
    entryKey: string;
    pollardCid: CID;
};

// function sortFieldsComparator(a: number[], b: number[]): number {
//   for (let i = 0; i < a.length; i++) {
//     const r = a[i] - b[i]
//     if (r !== 0) return r;
//   }
//   return 0;
// }

export class MerkleDatabase {
    private readonly pollardOrder: number = 3;
    private maxPollardLength: number;
    readonly layers: PollardInterface[][];
    private orderedEntriesMap: OrderedMap<number, CID>;
    private identity: IdentityInterface;
    private ipfs: Helia;
    private heliaDagCbor: DAGCBOR;
    private localStorage: Map<string, object>;

    constructor({ ipfs, identity }: { database: string; ipfs: Helia; identity: IdentityInterface }) {
        this.layers = [];
        this.orderedEntriesMap = new OrderedMap([], (x: number, y: number) => x - y, true);
        this.ipfs = ipfs;
        this.heliaDagCbor = dagCbor(ipfs);
        this.identity = identity;
        this.localStorage = new Map();
        this.maxPollardLength = 2 ** this.pollardOrder;
    }

    async open(cid: CID): Promise<void> {}

    async put(key: string, value: object): Promise<void> {
        const { cid, entry } = await createEntry(key, value, this.identity, this.ipfs);
        this.orderedEntriesMap.setElement(entry.timestamp, cid);
        await this.updateLayers(entry.timestamp);
        this.localStorage.set(key, value);
    }

    async getCID(): Promise<CID> {
        const lastLayer = this.layers.at(-1);
        if (!lastLayer) throw new Error("No layers");
        return await lastLayer[0].getCID();
    }

    getLayers(): PollardInterface[][] {
        return this.layers;
    }

    async get(key: string): Promise<object | undefined> {
        return this.localStorage.get(key);
    }

    async updateLayers(sortKey: number): Promise<void> {
        const it = this.orderedEntriesMap.reverseUpperBound(sortKey);
        const positionInPollard = it.index % this.maxPollardLength;
        if (positionInPollard === 7) it.next();
        const indexStart = it.index - (it.index % this.maxPollardLength);
        const [startKey, startCid] = this.orderedEntriesMap.getElementByPos(indexStart);
        const startPosition = Math.floor(indexStart / this.maxPollardLength);

        let pollard = await createPollard({ order: this.pollardOrder });
        let layerIndex = 0;

        let position = startPosition;

        const begin = this.orderedEntriesMap.find(startKey);
        const end = this.orderedEntriesMap.end();

        for (const it = begin; !it.equals(end); it.next()) {
            const cid = it.pointer[1];
            if (!pollard.isFree()) {
                await pollard.updateLayers();
                const cid = await this.heliaDagCbor.add(pollard.toJSON());
                this.setPollardTreeNode({ layerIndex, position, pollard });
                pollard = await createPollard({ order: this.pollardOrder });
                position++;
            }
            pollard.append(LeafTypes.SortedEntry, cid, [it.pointer[0]]);
        }

        await pollard.updateLayers();
        await this.heliaDagCbor.add(pollard.toJSON());
        this.setPollardTreeNode({ layerIndex, position, pollard });

        pollard = await createPollard({ order: this.pollardOrder });
        layerIndex++;
        while (this.layers[layerIndex - 1].length > 1) {
            if (this.layers.length === layerIndex) this.layers.push([]);
            position = Math.floor(startPosition / this.maxPollardLength ** layerIndex);
            const startIndexInLowerLayer = position * this.maxPollardLength;
            const slicedLayer = this.layers[layerIndex - 1].slice(startIndexInLowerLayer);
            for (const pollardNode of slicedLayer) {
                if (!pollard.isFree()) {
                    await pollard.updateLayers();
                    const cid = await this.heliaDagCbor.add(pollard.toJSON());
                    this.setPollardTreeNode({ layerIndex, position, pollard });
                    pollard = await createPollard({ order: this.pollardOrder });
                    position++;
                }
                pollard.append(LeafTypes.Pollard, await pollardNode.getCID());
            }
            await pollard.updateLayers();
            const cid = await this.heliaDagCbor.add(pollard.toJSON());
            this.setPollardTreeNode({ layerIndex, position, pollard });

            layerIndex++;
        }
    }

    setPollardTreeNode(node: PollardNode): void {
        const { layerIndex, position, pollard } = node;
        if (this.layers.length <= layerIndex) {
            this.layers.push([]);
        }
        if (pollard) this.layers[layerIndex][position] = pollard;
    }

    getPollardTreeNode({ layerIndex, position }: PollardNode): PollardNode {
        if (this.layers.length <= layerIndex || this.layers[layerIndex].length <= position) {
            return { layerIndex, position, pollard: undefined };
        }
        return {
            layerIndex,
            position,
            pollard: this.layers[layerIndex][position],
        };
    }

    getPollardTreeNodeLeft(node: PollardNode): PollardNode {
        if (node.position <= 0) throw new Error("No left node");
        if (
            node.position >= Math.ceil(this.orderedEntriesMap.size() / 2 ** (this.pollardOrder * (node.layerIndex + 1)))
        )
            throw new Error("No right node");
        node = node.pollard ? node : this.getPollardTreeNode(node);
        if (!node.pollard || node.layerIndex === 0) {
            return node;
        }
        const order = node.pollard.order;
        return this.getPollardTreeNode({
            layerIndex: node.layerIndex - 1,
            position: node.position * order,
        });
    }

    getPollardTreeNodeChildren(node: PollardNode): PollardNode[] {
        node = node.pollard ? node : this.getPollardTreeNode(node);
        if (!node.pollard || node.layerIndex === 0) {
            return [];
        }
        const order = node.pollard.order;
        return node.pollard.all().map((leaf, index) => {
            const pollardNode = {
                layerIndex: node.layerIndex - 1,
                position: node.position * order + index,
            };
            return this.getPollardTreeNode(pollardNode);
        });
    }

    getPollardTreeNodeParent(node: PollardNode): PollardNode {
        node = node.pollard ? node : this.getPollardTreeNode(node);
        if (!node.pollard) {
            return node;
        }

        const parentLayerIndex = node.layerIndex + 1;
        const parentPosition = Math.floor(node.position / node.pollard.maxLength);

        return this.getPollardTreeNode({
            layerIndex: parentLayerIndex,
            position: parentPosition,
        });
    }

    async load(rootPollardCid: CID): Promise<void> {
        let leaves: LeafType[] = [createLeaf(LeafTypes.Pollard, rootPollardCid.bytes)];

        this.layers.length = 0;

        while (leaves.length > 0) {
            const leavesNext: LeafType[] = [];

            this.layers.unshift([]);

            for (const leaf of leaves) {
                const cid = CID.decode(leaf[1]);
                const value: DataType = await this.heliaDagCbor.get(cid);
                if (value.dataType !== DataTypes.Pollard) continue;
                const pollardInput = value as PollardType;
                const pollard = await createPollard(pollardInput, {
                    cid,
                    noUpdate: true,
                });
                this.layers[0].push(pollard);
                for (const leaf of pollard.iterator()) {
                    if (leaf[0] === LeafTypes.Pollard) {
                        leavesNext.push(leaf);
                    } else if (leaf[0] === LeafTypes.SortedEntry) {
                        if (!leaf[2]) {
                            throw new Error("Missing sort fields");
                        }
                        this.orderedEntriesMap.setElement(leaf[2][0], CID.decode(leaf[1]));
                    }
                }
            }
            leaves = leavesNext;
        }
    }

    async loadData(): Promise<void> {
        for (const [key, cid] of this.orderedEntriesMap) {
            const value = await this.heliaDagCbor.get(cid);
            const verified = await this.identity.verify(value as jose.FlattenedJWS);
            if (verified) {
                const decoded = codec.decode(verified) as EntryInterface;
                console.log({ decoded });
                this.localStorage.set(decoded.key, decoded.value);
            }
        }
    }
}
