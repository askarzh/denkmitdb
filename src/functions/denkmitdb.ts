import { OrderedMap } from "js-sdsl";
import Keyv from "keyv";
import { CID } from "multiformats/cid";
import { createEmptyPollard, createEntry, createLeaf, createPollard } from ".";
import {
    DENKMITDB_PREFIX,
    DenkmitDatabaseInput,
    DenkmitDatabaseInterface,
    DenkmitDatabaseOptions,
    EntryInput,
    HEAD_VERSION,
    HeadInput,
    HeadInterface, LeafType,
    LeafTypes,
    MANIFEST_VERSION,
    ManifestInput,
    ManifestInterface,
    PollardInterface,
    PollardLocation,
    PollardNode,
    PollardType
} from "../types";
import { createHead, getHead } from "./head";
import { createManifest, openManifest } from "./manifest";
import { HeliaController } from "./utils";

// class TimestampConsensusController {} // TODO: Implement TimestampConsensusController

export async function createDenkmitDatabase(name: string, options: DenkmitDatabaseOptions): Promise<DenkmitDatabaseInterface> {
    const heliaController = new HeliaController(options.ipfs, options.identity);

    const manifestInput: ManifestInput = {
        version: MANIFEST_VERSION,
        name,
        type: "denkmit-database-key-value",
        pollardOrder: 3,
        consensusController: "timestamp",
        accessController: "writeAll",
        creatorId: options.identity.id,
    };

    const manifest = await createManifest(manifestInput, heliaController);

    const mdb: DenkmitDatabaseInput = {
        manifest,
        heliaController,
        storage: options.storage,
    };

    return new DenkmitDatabase(mdb);
}

export async function openDenkmitDatabase(id: string, options: DenkmitDatabaseOptions): Promise<DenkmitDatabaseInterface> {
    if (!id.startsWith(DENKMITDB_PREFIX)) throw new Error("Invalid id");

    const cid = id.substring(DENKMITDB_PREFIX.length);

    const heliaController = new HeliaController(options.ipfs, options.identity);

    const manifest = await openManifest(cid, heliaController);

    return new DenkmitDatabase({ manifest, heliaController, storage: options.storage });
}

export class DenkmitDatabase implements DenkmitDatabaseInterface {
    readonly manifest: ManifestInterface;
    readonly pollardOrder: number = 3;
    readonly maxPollardLength: number;
    readonly layers: PollardInterface[][];
    readonly heliaController: HeliaController;
    readonly storage: Keyv;
    private orderedEntriesMap: OrderedMap<number, { cid: CID; key: string }>;

    constructor(mdb: DenkmitDatabaseInput) {
        this.manifest = mdb.manifest;
        this.layers = [];
        this.orderedEntriesMap = new OrderedMap([], (x: number, y: number) => x - y, true);
        this.storage = mdb.storage || new Keyv();
        this.maxPollardLength = 2 ** this.pollardOrder;
        this.heliaController = mdb.heliaController;
    }

    get id(): string {
        return `${DENKMITDB_PREFIX}${this.manifest.id}`;
    }

    // TODO: async open(cid: CID): Promise<void> {}

    async set(key: string, value: object): Promise<void> {
        const entry = await createEntry(key, value, this.heliaController);
        await this.updateLocalStorageAndMap(entry.timestamp, CID.parse(entry.id), key, value);
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

    async* iterator(): AsyncGenerator<[key: string, value: object]> {
        for (const orderedEntriesMapElement of this.orderedEntriesMap) {
            const { key } = orderedEntriesMapElement[1];
            const value = await this.get(key);
            if (value) yield [key, value];
        }
    }

    async close(): Promise<void> {
        await this.storage.clear();
        this.layers.length = 0;
        this.orderedEntriesMap.clear();
        await this.heliaController.close();
    }

    async getManifest(): Promise<ManifestInterface> {
        return this.manifest;
    }

    getLayers(): PollardInterface[][] {
        return this.layers;
    }

    async getCID(): Promise<CID> {
        const lastLayer = this.layers.at(-1);
        if (!lastLayer) throw new Error("No layers");
        return await lastLayer[0].getCID();
    }

    async createHead(): Promise<HeadInterface> {
        const headInput: HeadInput = {
            version: HEAD_VERSION,
            manifest: this.manifest.id,
            root: (await this.getCID()).toString(),
            timestamp: Date.now(),
            creatorId: this.heliaController.identity.id,
            layersCount: this.layers.length,
            size: this.orderedEntriesMap.size(),
        };

        return await createHead(headInput, this.heliaController);
    }

    async getHead(cid: CID): Promise<HeadInterface> {
        return await getHead(cid, this.heliaController);
    }

    async compare(head: HeadInterface): Promise<{ isEqual: boolean; difference: [LeafType[], LeafType[]] }> {
        const layersCount = Math.max(this.layers.length, head.layersCount);
        const order = layersCount - 1;

        const difference = await this.compareNodes(layersCount, CID.parse(head.root), { layerIndex: order, position: 0 });

        difference[0] = difference[0].filter((x) => x[0] !== LeafTypes.Empty);
        difference[1] = difference[1].filter((x) => x[0] !== LeafTypes.Empty);

        const isEqual = difference[0].length === 0 && difference[1].length === 0;

        return { isEqual, difference };
    }

    async merge(head: HeadInterface): Promise<void> {
        const { isEqual, difference } = await this.compare(head);
        if (isEqual) return;

        let smallestTimestamp = Number.MAX_SAFE_INTEGER;

        for (const leaf of difference[1]) {
            if (leaf[0] !== LeafTypes.SortedEntry) continue;
            const timestamp = await this.extracted(leaf);
            if (timestamp < smallestTimestamp) smallestTimestamp = timestamp;
        }

        await this.updateLayers(smallestTimestamp);
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

        thisPollard = thisPollard || (await createEmptyPollard(this.pollardOrder));

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

    private async extracted(leaf: LeafType) {
        const cid = CID.decode(leaf[1]);
        if (!leaf[2]) throw new Error("Missing sort fields");
        if (!leaf[3]) throw new Error("Missing key");
        const timestamp = leaf[2][0];
        const key = leaf[3];
        await this.updateLocalStorageAndMap(timestamp, cid, key);
        return timestamp;
    }

    async updateLayers(sortKey: number): Promise<void> {
        const it = this.orderedEntriesMap.reverseUpperBound(sortKey);
        if (it.index % this.maxPollardLength === 7) it.next();
        const indexStart = it.index - (it.index % this.maxPollardLength);
        const [startKey] = this.orderedEntriesMap.getElementByPos(indexStart);
        const startPosition = this.calculatePositionInLayer(indexStart);

        let pollard = await createEmptyPollard(this.pollardOrder);
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

        pollard = await createEmptyPollard(this.pollardOrder);
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

    private calculatePositionInLayer(entryPosition: number, layerIndex: number = 1): number {
        return Math.floor(entryPosition / this.maxPollardLength ** layerIndex);
    }

    private async handlePollardCreation(pollard: PollardInterface, layerIndex: number, position: number) {
        if (!pollard.isFree()) {
            await this.handlePollardUpdate(pollard, layerIndex, position);
            pollard = await createEmptyPollard(this.pollardOrder);
            position++;
        }
        return { pollard, position };
    }

    private async handlePollardUpdate(pollard: PollardInterface, layerIndex: number, position: number) {
        await pollard.updateLayers();
        await this.heliaController.add(pollard.toJSON());
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

    async load(head: HeadInterface): Promise<void> {
        const pollardCid = CID.parse(head.root);
        let leaves: LeafType[] = [createLeaf(LeafTypes.Pollard, pollardCid.bytes)];

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
                            await this.extracted(leaf);
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
        if (!pollardInput) return;
        return await createPollard(pollardInput, { cid, noUpdate: true });
    }
}
