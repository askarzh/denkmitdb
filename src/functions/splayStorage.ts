import SplayTree from "splaytree";

type Key = number | any;
type Value = any;

type Node<Key, Value> = {
  key: Key;
  data: any;
  left: Node<Key, Value> | null;
  right: Node<Key, Value> | null;
  next: Node<Key, Value> | null;
};

export class SplayTreeStorage {
  private tree: SplayTree;

  constructor() {
    this.tree = new SplayTree();
  }

  /**
   * Puts data to memory.
   * @function
   * @param {number} key The key of the data to put.
   * @param {*} value The data to store.
   * @instance
   */
  async put(key: Key, value: Value): Promise<void> {
    this.tree.insert(key, value);
  }

  /**
   * Deletes data from memory.
   * @function
   * @param {number} key The key of the data to delete.
   * @return {number} The index of the data in memory.
   * @memberof module:Storage.Storage-Memory
   * @instance
   */
  async delete(key: number): Promise<void> {
    this.tree.remove(key);
  }

  /**
   * Finds data in memory.
   * @function
   * @param {number} key The key of the data to find.
   * @return {number} The index of the data in memory.
   * @instance
   */
  private async find(key: Key): Promise<Node<Key, Value> | null> {
    return this.tree.find(key);
  }

  /**
   * Gets data from memory.
   * @function
   * @param {number} key The hash of the data to get.
   * @memberof module:Storage.Storage-Memory
   * @instance
   */
  async get(key: Key): Promise<Value> {
    return this.tree.find(key)?.data;
  }

  /**
   * Iterates over records stored in memory.
   * @function
   * @param {number} startIndex The index to start iterating from.
   * @yields [string, T] The next key/value pair from memory.
   * @memberof module:Storage.Storage-Memory
   * @instance
   */
  async *iterator(startKey?: Key): AsyncGenerator<[Key, Value]> {
    let node = startKey ? this.tree.find(startKey) : this.tree.minNode();
    while (node) {
      yield [node.key, node.data];
      node = this.tree.next(node);
    }
  }

  async keys(): Promise<Key[]> {
    return this.tree.keys();
  }

  async values(): Promise<Value[]> {
    return this.tree.values();
  }

  async load(keys: Key[], values: Value[]): Promise<void> {
    this.tree.load(keys, values, true);
  }

  /**
   * Merges data from another source into memory.
   * @function
   * @param {module:Storage} other Another storage instance.
   * @return {number} The index of the first record merged.
   * @memberof module:Storage.Storage-Memory
   * @instance
   */
  async merge(other: SplayTreeStorage): Promise<void> {
    const keys = await other.keys();
    const values = await other.values();

    this.tree.load(keys, values);
  }

  /**
   * Clears the contents of memory.
   * @function
   * @memberof module:Storage.Storage-Memory
   * @instance
   */
  async clear(): Promise<void> {
    this.tree.clear();
  }

  async close(): Promise<void> {
    this.clear();
  }
}
