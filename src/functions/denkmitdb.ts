import Keyv from "keyv";
import { CID } from "multiformats/cid";
import { createEmptyPollard, createEntry, createIdentity, createLeaf, createPollard, fetchEntry } from ".";
import {
    DENKMITDB_PREFIX,
    DenkmitDatabaseInput,
    DenkmitDatabaseInterface,
    DenkmitDatabaseOptions,
    HEAD_VERSION,
    HeadInput,
    HeadInterface, HeliaControllerInterface, IdentityInterface, LeafType,
    LeafTypes,
    MANIFEST_VERSION,
    ManifestInput,
    ManifestInterface,
    PollardInterface,
    PollardLocation,
    PollardNode,
    PollardType,
    SyncControllerInterface
} from "../types";
import type { Message } from '@libp2p/interface';

import { createHead, fetchHead } from "./head";
import { createManifest, fetchManifest } from "./manifest";
import { HeliaController } from "./utils/helia";
import { createSyncController } from "./sync";
import { SortedItemsStore } from "./utils/sortedItems";

// class TimestampConsensusController {} // TODO: Implement TimestampConsensusController

export async function createDenkmitDatabase<T>(name: string, options: DenkmitDatabaseOptions<T>): Promise<DenkmitDatabaseInterface<T>> {
    const identity = options.identity ?? await createIdentity({ helia: options.helia });
    const heliaController = new HeliaController(options.helia, identity);

    const manifestInput: ManifestInput = {
        version: MANIFEST_VERSION,
        name,
        type: "denkmit-database-key-value",
        pollardOrder: 3,
        consensusController: "timestamp",
        accessController: "writeAll",
        creatorId: identity.id,
    };
    const manifest = await createManifest(manifestInput, heliaController);
    const syncController = options.syncController ?? await createSyncController(manifest.name, heliaController);

    const mdb: DenkmitDatabaseInput<T> = {
        manifest,
        heliaController,
        identity,
        keyValueStorage: options.keyValueStorage,
        syncController,
    };
    const dmdb = new DenkmitDatabase<T>(mdb);
    dmdb.setupSync();

    return dmdb;
}

export async function openDenkmitDatabase<T>(id: string, options: DenkmitDatabaseOptions<T>): Promise<DenkmitDatabaseInterface<T>> {
    if (!id.startsWith(DENKMITDB_PREFIX)) throw new Error("Invalid id");

    const cid = id.substring(DENKMITDB_PREFIX.length);
    const identity = options.identity ?? await createIdentity({ helia: options.helia });
    const heliaController = new HeliaController(options.helia, identity);
    const manifest = await fetchManifest(cid, heliaController);
    const syncController = await createSyncController(manifest.name, heliaController);

    const mdb: DenkmitDatabaseInput<T> = {
        manifest,
        heliaController,
        identity,
        keyValueStorage: options.keyValueStorage,
        syncController,
    };

    const dmdb = new DenkmitDatabase<T>(mdb);
    dmdb.setupSync();

    return dmdb;
}

export class DenkmitDatabase<T> implements DenkmitDatabaseInterface<T> {
    readonly manifest: ManifestInterface;
    readonly maxPollardLength: number;
    readonly layers: PollardInterface[][];
    readonly heliaController: HeliaControllerInterface;
    readonly keyValueStorage: Keyv<T, Record<string, T>>;
    private sortedItemsStore: SortedItemsStore;
    private readonly syncController: SyncControllerInterface;
    private head?: HeadInterface;

    constructor(mdb: DenkmitDatabaseInput<T>) {
        this.manifest = mdb.manifest;
        this.layers = [];
        this.keyValueStorage = mdb.keyValueStorage ?? new Keyv<T, Record<string, T>>;
        this.sortedItemsStore = new SortedItemsStore();
        this.maxPollardLength = 2 ** mdb.manifest.pollardOrder;
        this.heliaController = mdb.heliaController;
        this.syncController = mdb.syncController;
    }

    get identity(): IdentityInterface {
        return this.heliaController.identity;
    }

    get pollardOrder(): number {
        return this.manifest.pollardOrder;
    }

    get id(): string {
        return `${DENKMITDB_PREFIX}${this.manifest.id}`;
    }

    async set(key: string, value: T): Promise<void> {
        const entry = await createEntry<T>(key, value, this.heliaController);
        await this.sortedItemsStore.set(entry.timestamp, key, CID.parse(entry.id));
        await this.keyValueStorage.set(key, value);
        await this.createTaskUpdateLayers(entry.timestamp);
    }

    async get(key: string): Promise<T | undefined> {
        const value = await this.keyValueStorage.get(key);
        if (value) return value;
        const item = await this.sortedItemsStore.getByKey(key);
        if (!item) return;
        const entry = await fetchEntry<T>(item.cid, this.heliaController);
        if (!entry) return;
        await this.keyValueStorage.set(key, entry.value);
        return entry.value;
    }

    async* iterator(): AsyncGenerator<[key: string, value: T]> {
        for await (const { key } of this.sortedItemsStore.iterator()) {
            const value = await this.get(key);
            if (value) yield [key, value];
        }
    }

    async close(): Promise<void> {
        await this.syncController.close();
        await this.keyValueStorage.clear();
        this.layers.length = 0;
        this.sortedItemsStore.clear();
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

    async createOnlyNewHead(): Promise<HeadInterface | undefined> {
        if (this.size === 0) return undefined;
        const cid = await this.getCID();
        const root = cid.toString();

        if (this.head && this.head.root === root) return undefined;

        const headInput: HeadInput = {
            version: HEAD_VERSION,
            manifest: this.manifest.id,
            root,
            timestamp: Date.now(),
            creatorId: this.identity.id,
            layersCount: this.layers.length,
            size: this.size,
        };

        this.head = await createHead(headInput, this.heliaController);

        return this.head;
    }

    async createHead(): Promise<HeadInterface> {
        return await this.createOnlyNewHead() || this.head!;
    }

    async fetchHead(cid: CID): Promise<HeadInterface> {
        return await fetchHead(cid, this.heliaController);
    }

    get size(): number {
        return this.sortedItemsStore.size;
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

        await this.createTaskUpdateLayers(smallestTimestamp);
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
        await this.sortedItemsStore.set(timestamp, key, cid);
        return timestamp;
    }

    async createTaskUpdateLayers(sortKey: number): Promise<void> {
        this.syncController.addTask(async () => {
            await this.updateLayers(sortKey);
        });
    }

    async updateLayers(sortKey: number): Promise<void> {
        let index = 0;
        if (sortKey > 0) {
            const it = await this.sortedItemsStore.find(sortKey);
            index = it.index;
        }
        const startIndex = Math.floor(index / this.maxPollardLength) * this.maxPollardLength;
        const startItem = await this.sortedItemsStore.getByIndex(startIndex);
        const startSortField = startItem.sortField;
        const startPosition = this.calculatePositionInLayer(startIndex);

        let pollard = await createEmptyPollard(this.pollardOrder);
        let layerIndex = 0;

        let position = startPosition;

        for await (const item of this.sortedItemsStore.iteratorFrom(startSortField)) {
            const { cid, key } = item;
            ({ pollard, position } = await this.handlePollardCreation(pollard, layerIndex, position));
            pollard.append(LeafTypes.SortedEntry, cid, { sortFields: [item.sortField], key });
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
            node.position >= Math.ceil(this.size / 2 ** (this.pollardOrder * (node.layerIndex + 1)))
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
        await this.createTaskUpdateLayers(0);
    }

    private async getPollard(cid: CID): Promise<PollardInterface | undefined> {
        const pollardInput = await this.heliaController.get<PollardType>(cid);
        if (!pollardInput) return;
        return await createPollard(pollardInput, { cid, noUpdate: true });
    }

    async syncNewHead(message: CustomEvent<Message>): Promise<void> {
        console.log("syncNewHead", message);
        const cid = CID.decode(message.detail.data);
        console.log({ cid })
        this.syncController.addTask(async () => {
            const head = await this.fetchHead(cid);

            if (this.size === 0) {
                await this.load(head);
            } else {
                await this.merge(head);
            }
        });
    }

    async sendHead(): Promise<void> {
        const head = await this.createOnlyNewHead();
        if (head)
            await this.syncController.sendHead(head);
    }

    async setupSync(): Promise<void> {
        await this.syncController.start(async (message: CustomEvent<Message>) => await this.syncNewHead(message));
        await this.syncController.addRepetitiveTask(async () => {
            const head = await this.createOnlyNewHead();
            console.log({ head })
            if (head)
                await this.syncController.sendHead(head);
        }, 30000);
    }
}
