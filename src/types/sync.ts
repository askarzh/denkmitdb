import { Message } from "@libp2p/interface";
import { HeadInterface } from "./head";
import { HeliaControllerInterface } from "./utils";

export interface SyncControllerInterface { 
    start(newHead: (message: CustomEvent<Message>) => Promise<void>): Promise<void>;
    sendHead(head: HeadInterface): Promise<void>;
    addTask(task: () => Promise<void>): Promise<void>;
    addRepetitiveTask(task: () => Promise<void>, interval: number): Promise<void>;
    close(): Promise<void>;
}

export declare function createSyncController(name: string, heliaController: HeliaControllerInterface): Promise<SyncControllerInterface>;
