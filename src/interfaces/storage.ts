export type Key = number | any;
export type Value = any;

export interface Storage {
    setItem(key: Key, value: Value): Promise<void>;
    getItem(key: Key): Promise<Value>;
    removeItem(key: Key): Promise<void>;
    clear(): Promise<void>;
    close(): Promise<void>;
    }