import { OrderedMap } from "js-sdsl";
import { CID } from "multiformats/cid";
import { SortedItemsStoreInterface, SortedItemType } from "src/types";


export class SortedItemsStore implements SortedItemsStoreInterface {
    private sortedMap: OrderedMap<number, Omit<SortedItemType, "sortField" | "index">>;
    private keyMap: Map<string, Omit<SortedItemType, "key" | "index">>;

    constructor() {
        this.sortedMap = new OrderedMap([], (x: number, y: number) => x - y, true);
        this.keyMap = new Map();
    }

    async set(sortField: number, key: string, cid: CID): Promise<void> {
        this.keyMap.set(key, { sortField, cid });
        this.sortedMap.setElement(sortField, { cid, key });
    }

    async getByKey(key: string): Promise<SortedItemType | undefined> {
        const res = this.keyMap.get(key);
        if (!res) return undefined;
        const entry = this.sortedMap.find(res.sortField);
        return { ...res, key, index: entry.index };
    }

    async *iterator(): AsyncGenerator<SortedItemType> {
        let index = 0;
        for (const [sortField, entry] of this.sortedMap) {
            yield { ...entry, sortField, index };
            index++;
        }
    }

    async find(sortField: number): Promise<SortedItemType> {
        const { pointer, index } = this.sortedMap.find(sortField);
        return { ...pointer[1], sortField, index };
    }

    async findPrevious(sortField: number): Promise<SortedItemType> {
        const { pointer, index } = this.sortedMap.reverseUpperBound(sortField);
        return { ...pointer[1], sortField, index };
    }

    async getByIndex(index: number): Promise<SortedItemType> {
        const entry = this.sortedMap.getElementByPos(index);
        return { ...entry[1], sortField: entry[0], index };
    }


    async *iteratorFrom(sortField: number): AsyncGenerator<SortedItemType> {
        const it = this.sortedMap.find(sortField);
        const end = this.sortedMap.end();
        while (!it.equals(end)) {
            yield {
                ...it.pointer[1],
                sortField: it.pointer[0],
                index: it.index
            };
            it.next();
        }
    }

    get size(): number {
        return this.sortedMap.size();
    }

    async clear(): Promise<void> {
        this.sortedMap.clear();
        this.keyMap.clear();
    }
}