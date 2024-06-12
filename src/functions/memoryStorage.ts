/**
 * @namespace Storage-Memory
 * @memberof module:Storage
 * @description
 * MemoryStorage stores data in memory.
 */


/**
 * @class MemoryStorage
 * @memberof module:Storage.Storage-Memory
 * 
 */

class MemoryStorage {
    private memory: { key: number, value: unknown }[] = []

    /**
     * Puts data to memory.
     * @function
     * @param {number} key The key of the data to put.
     * @param {*} value The data to store.
     * @return {number} The index of the data in memory.
     * @memberof module:Storage.Storage-Memory
     * @instance
     * @throws {Error} If the key already exists.
     */
    async put(key: number, value: unknown): Promise<number> {
        const index = this.binarySearch(key);
        if (index === -1) {
            throw new Error('Key already exists');
        }
        this.memory.splice(index, 0, { key, value });

        return index;
    }

    /**
     * Searches for data in memory.
     * @function
     * @param {number} target The key to search for.
     * @param {boolean} exactly Whether to search for an exact match.
     * @return {number} The index of the data in memory. -1 if not found.
     * @memberof module:Storage.Storage-Memory
     * @instance
     * @private
     */
    binarySearch(target: number, exactly: boolean = false): number {
        let left = 0;
        let right = this.memory.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this.memory[mid].key === target) {
                return exactly ? mid : -1;
            }

            if (this.memory[mid].key < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return exactly ? -1 : left;
    }

    /**
     * Deletes data from memory.
     * @function
     * @param {number} key The key of the data to delete.
     * @return {number} The index of the data in memory.
     * @memberof module:Storage.Storage-Memory
     * @instance
     */
    async delete(key: number): Promise<number> {
        const index = this.binarySearch(key, true);
        if (index >= 0) {
            this.memory.splice(index, 1);
        }
        return index;
    }

    /**
     * Finds data in memory.
     * @function
     * @param {number} key The key of the data to find.
     * @return {number} The index of the data in memory.
     * @memberof module:Storage.Storage-Memory
     * @instance
     */
    async find(key: number): Promise<number> {
        return this.binarySearch(key, true);
    }

    /**
     * Gets data from memory.
     * @function
     * @param {number} key The hash of the data to get.
     * @memberof module:Storage.Storage-Memory
     * @instance
     */
    async get(key: number): Promise<unknown> {
        return this.memory.find((record) => record.key === key)?.value;
    }

    /**
     * Gets data from memory by index.
     * @function
     * @param {number} index The index of the data to get.
     * @memberof module:Storage.Storage-Memory
     * @instance
     */
    async getByIndex(index: number): Promise<unknown> {
        return this.memory[index]?.value;
    }

    /**
     * Iterates over records stored in memory.
     * @function
     * @param {number} startIndex The index to start iterating from.
     * @yields [string, T] The next key/value pair from memory.
     * @memberof module:Storage.Storage-Memory
     * @instance
     */
    async * iterator(startIndex: number = 0): AsyncGenerator<[number, unknown]> {
        for (let i = startIndex; i < this.memory.length; i++) {
            const { key, value } = this.memory[i];
            yield [key, value];
        }
    }

    /**
     * Merges data from another source into memory.
     * @function
     * @param {module:Storage} other Another storage instance.
     * @return {number} The index of the first record merged.
     * @memberof module:Storage.Storage-Memory
     * @instance
     */
    async merge(other: MemoryStorage): Promise<number> {
        let minIndex = this.memory.length;
        if (other) {
            for await (const [key, value] of other.iterator()) {
                const index = await this.put(key, value)
                minIndex = Math.min(minIndex, index)
            }
        }

        return minIndex;
    }

    /**
    * Clears the contents of memory.
    * @function
    * @memberof module:Storage.Storage-Memory
    * @instance
    */
    async clear(): Promise<void> {
        this.memory = []
    }

    async close(): Promise<void> {
        this.memory = []
    }

}
