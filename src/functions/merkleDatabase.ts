import {
    MerkleDatabaseOptions,
    DataTypes,
    EntryInput,
    PollardLocation,
    PollardType,
    PollardInterface,
    PollardNode,
    LeafType,
    LeafTypes,
    IdentityInterface,
    HeadDatabaseType,
} from "../interfaces";
import { createLeaf, createPollard, createEntry } from "./";
import { HeliaController } from "./utils";
import { Helia } from "@helia/interface";
import { CID } from "multiformats/cid";
import { OrderedMap } from "js-sdsl";
import Keyv from "keyv";

class TimestampConsensusController {} // TODO: Implement TimestampConsensusController

export async function createMerkleDatabase({
    database,
    ipfs,
    identity,
    storage,
}: {
    database: string;
    storage?: Keyv;
    ipfs: Helia;
    identity: IdentityInterface;
}): Promise<MerkleDatabase> {
    return new MerkleDatabase({ database, ipfs, identity, storage });
}


export class MerkleDatabase {
    private readonly pollardOrder: number = 3;
    private maxPollardLength: number;
    readonly layers: PollardInterface[][];
    private orderedEntriesMap: OrderedMap<number, { cid: CID; key: string }>;
    private identity: IdentityInterface;
    private ipfs: Helia;
    private heliaController: HeliaController<HeadDatabaseType | EntryInput | PollardType>;
    private storage: Keyv;

    constructor({ ipfs, identity, storage }: MerkleDatabaseOptions) {
        this.layers = [];
        this.orderedEntriesMap = new OrderedMap([], (x: number, y: number) => x - y, true);
        this.ipfs = ipfs;
        this.identity = identity;
        this.storage = storage || new Keyv();
        this.maxPollardLength = 2 ** this.pollardOrder;
        this.heliaController = new HeliaController(ipfs, identity);
    }

    async open(cid: CID): Promise<void> {}

    async set(key: string, value: object): Promise<void> {
        const { cid, entry } = await createEntry(key, value, this.heliaController);
        await this.updateLocalStorageAndMap(entry.timestamp, cid, key, value);
        await this.updateLayers(entry.timestamp);
    }

    async get(key: string): Promise<object | undefined> {
        const record = await this.storage.get(key);
        if (!record) return;
        if (record.value) return record.value;
        const cid = CID.parse(record.cid);
        const entry = await this.heliaController.getSigned<EntryInput>(cid);
        if (!entry) return;
        await this.storage.set(key, { cid: cid.toString(), value: entry.value });
        return entry.value;
    }

    async *iterator(): AsyncGenerator<[key: string, value: unknown]> {
        for (const [timestamp, record] of this.orderedEntriesMap) {
            const { cid, key } = record;
            const value = await this.get(key);
            if (value) yield [key, value];
        }
    }

    async getCID(): Promise<CID> {
        const lastLayer = this.layers.at(-1);
        if (!lastLayer) throw new Error("No layers");
        return await lastLayer[0].getCID();
    }

    getLayers(): PollardInterface[][] {
        return this.layers;
    }

    private async compareNodes(
        layersCount: number,
        root: CID | undefined,
        { layerIndex, position }: PollardLocation,
    ): Promise<[LeafType[], LeafType[]]> {
        const result: [LeafType[], LeafType[]] = [[], []];
        let thisPollard = this.getPollardTreeNode({ layerIndex, position }).pollard;
        const otherPollard = layersCount > layerIndex ? root && (await this.getPollard(root)) : undefined;

        if (!thisPollard && !otherPollard) return result;

        thisPollard = thisPollard || (await createPollard({ order: this.pollardOrder }));

        const comp = await thisPollard.compare(otherPollard);
        if (comp.isEqual) return result;

        if (layerIndex === 0) {
            result[0] = result[0].concat(comp.difference[0]);
            result[1] = result[1].concat(comp.difference[1]);
            return result;
        }

        const maxPollardLength = Math.max(thisPollard?.length || 0, otherPollard?.length || 0);

        for (let i = 0; i < maxPollardLength; i++) {
            let cid = root;
            if (otherPollard) {
                const leaf = await otherPollard.getLeaf(i);
                if (leaf[0] !== LeafTypes.Empty) cid = CID.decode(leaf[1]);
            }

            const next = await this.compareNodes(layersCount, cid, {
                layerIndex: layerIndex - 1,
                position: position * maxPollardLength + i,
            });
            result[0] = result[0].concat(next[0]);
            result[1] = result[1].concat(next[1]);
        }

        return result;
    }

    async compare(head: HeadDatabaseType): Promise<{ isEqual: boolean; difference: [LeafType[], LeafType[]] }> {
        const layersCount = Math.max(this.layers.length, head.layersCount);
        const order = layersCount - 1;

        const difference = await this.compareNodes(layersCount, head.root, { layerIndex: order, position: 0 });

        difference[0] = difference[0].filter((x) => x[0] !== LeafTypes.Empty);
        difference[1] = difference[1].filter((x) => x[0] !== LeafTypes.Empty);

        const isEqual = difference[0].length === 0 && difference[1].length === 0;

        return { isEqual, difference };
    }

    async merge(head: HeadDatabaseType): Promise<void> {
        const { isEqual, difference } = await this.compare(head);
        if (isEqual) return;

        let smallestTimestamp = Number.MAX_SAFE_INTEGER;

        for (const leaf of difference[1]) {
            if (leaf[0] !== LeafTypes.SortedEntry) continue;
            const cid = CID.decode(leaf[1]);
            if (!leaf[2]) throw new Error("Missing sort fields");
            if (!leaf[3]) throw new Error("Missing key");
            const timestamp = leaf[2][0];
            const key = leaf[3];
            await this.updateLocalStorageAndMap(timestamp, cid, key);
            if (timestamp < smallestTimestamp) smallestTimestamp = timestamp;
        }

        await this.updateLayers(smallestTimestamp);
    }

    async updateLayers(sortKey: number): Promise<void> {
        const it = this.orderedEntriesMap.reverseUpperBound(sortKey);
        if (it.index % this.maxPollardLength === 7) it.next();
        const indexStart = it.index - (it.index % this.maxPollardLength);
        const [startKey] = this.orderedEntriesMap.getElementByPos(indexStart);
        const startPosition = this.calculatePositionInLayer(indexStart);

        let pollard = await createPollard({ order: this.pollardOrder });
        let layerIndex = 0;

        let position = startPosition;

        const begin = this.orderedEntriesMap.find(startKey);
        const end = this.orderedEntriesMap.end();

        for (const it = begin; !it.equals(end); it.next()) {
            const { cid, key } = it.pointer[1];
            ({ pollard, position } = await this.handlePollardCreation(pollard, layerIndex, position));
            pollard.append(LeafTypes.SortedEntry, cid, { sortFields: [it.pointer[0]], key: key || "" });
        }

        await this.handlePollardUpdate(pollard, layerIndex, position);

        pollard = await createPollard({ order: this.pollardOrder });
        for (layerIndex++; this.layers[layerIndex - 1].length > 1; layerIndex++) {
            if (this.layers.length === layerIndex) this.layers.push([]);
            position = this.calculatePositionInLayer(startPosition, layerIndex);
            const startIndexInLowerLayer = position * this.maxPollardLength;
            const slicedLayer = this.layers[layerIndex - 1].slice(startIndexInLowerLayer);
            for (const pollardNode of slicedLayer) {
                ({ pollard, position } = await this.handlePollardCreation(pollard, layerIndex, position));
                pollard.append(LeafTypes.Pollard, await pollardNode.getCID());
            }
            await this.handlePollardUpdate(pollard, layerIndex, position);
        }
    }

    async createHead(): Promise<CID> {
        const head: HeadDatabaseType = {
            version: 1,
            manifest: CID.parse("bafyreidlekjmlbekthtxhbpz3ujny2lbqtlin7evmy3ohcjuvxf3yw74wm"), // TODO: Add manifest CID
            root: await this.getCID(),
            timestamp: Date.now(),
            creatorId: this.identity.id,
            layersCount: this.layers.length,
            size: this.orderedEntriesMap.size(),
        };

        return await this.heliaController.addSigned(head);
    }

    async getHead(cid: CID): Promise<HeadDatabaseType | undefined> {
        return await this.heliaController.getSigned<HeadDatabaseType>(cid);
    }

    private calculatePositionInLayer(entryPosition: number, layerIndex: number = 1): number {
        return Math.floor(entryPosition / this.maxPollardLength ** layerIndex);
    }

    private async handlePollardCreation(pollard: PollardInterface, layerIndex: number, position: number) {
        if (!pollard.isFree()) {
            await this.handlePollardUpdate(pollard, layerIndex, position);
            pollard = await createPollard({ order: this.pollardOrder });
            position++;
        }
        return { pollard, position };
    }

    private async handlePollardUpdate(pollard: PollardInterface, layerIndex: number, position: number) {
        await pollard.updateLayers();
        const cid = await this.heliaController.add(pollard.toJSON());
        this.setPollardTreeNode({ layerIndex, position, pollard });
    }

    setPollardTreeNode(node: PollardNode): void {
        const { layerIndex, position, pollard } = node;
        if (this.layers.length <= layerIndex) {
            this.layers.push([]);
        }
        if (pollard) this.layers[layerIndex][position] = pollard;
    }

    getPollardTreeNode({ layerIndex, position }: PollardLocation): PollardNode {
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
        const parentPosition = this.calculatePositionInLayer(node.position);

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
                const pollard = await this.getPollard(cid);
                if (!pollard) throw new Error("Invalid pollard");
                this.layers[0].push(pollard);
                for (const leaf of pollard.iterator()) {
                    switch (leaf[0]) {
                        case LeafTypes.Pollard:
                            leavesNext.push(leaf);
                            break;

                        case LeafTypes.SortedEntry:
                            const cid = CID.decode(leaf[1]);
                            if (!leaf[2]) throw new Error("Missing sort fields");
                            if (!leaf[3]) throw new Error("Missing key");
                            const timestamp = leaf[2][0];
                            const key = leaf[3];
                            await this.updateLocalStorageAndMap(timestamp, cid, key);
                            break;
                    }
                }
            }
            leaves = leavesNext;
        }
    }

    private async updateLocalStorageAndMap(timestamp: number, cid: CID, key: string, value?: unknown) {
        this.orderedEntriesMap.setElement(timestamp, { cid, key });
        await this.storage.set(key, { cid: cid.toString(), value });
    }

    private async getPollard(cid: CID): Promise<PollardInterface | undefined> {
        const pollardInput = await this.heliaController.get<PollardType>(cid);
        if (!pollardInput || pollardInput.dataType !== DataTypes.Pollard) return;
        const pollard = await createPollard(pollardInput, { cid, noUpdate: true });
        return pollard;
    }
}
