import type { Message } from '@libp2p/interface';
import delay from "delay";
import PQueue from "p-queue";
import { HeadInterface, HeliaControllerInterface } from "src/types";
import { CID } from 'multiformats/cid';
import { SyncControllerInterface } from 'src/types';


/**
 * Represents a SyncController that handles synchronization operations.
 */
export class SyncController implements SyncControllerInterface {
    heliaController: HeliaControllerInterface;
    name: string;
    queue: PQueue = new PQueue({ concurrency: 1 });
    schdeduleQueue: PQueue = new PQueue({ concurrency: 1 });
    newHead?: (data: Uint8Array) => Promise<void>;

    constructor(heliaController: HeliaControllerInterface, name: string) {
        this.heliaController = heliaController;
        this.name = name;
    }

    newMessage(message: CustomEvent<Message>): void {
        const data = message.detail.data;
        console.log("Hmmm", this.newHead)
        if (this.newHead)
            this.newHead(data);
    }

    async start(newHead: (message: CustomEvent<Message>) => Promise<void>): Promise<void> {
        // console.log("start", { newHead });
        // this.newHead = newHead;
        // console.log("start",  this.newHead );

        this.heliaController.libp2p.services.pubsub.addEventListener("message", newHead);
        this.heliaController.libp2p.services.pubsub.addEventListener("subscription-change", async (data) => { console.log("subscription-change", { data }) });
        this.heliaController.libp2p.services.pubsub.subscribe(this.name);
    }

    async sendHead(head: HeadInterface): Promise<void> {
        const cid = CID.parse(head.id);
        this.heliaController.libp2p.services.pubsub.publish(this.name, cid.bytes);
    }

    async addTask(task: () => Promise<void>): Promise<void> {
        this.queue.add(task);
    }

    async addRepetitiveTask(task: () => Promise<void>, interval: number): Promise<void> {
        console.log("addRepetitiveTask", { interval });
        this.schdeduleQueue.add(() => delay(interval));
        this.schdeduleQueue.add(() => this.addTask(task));
        this.schdeduleQueue.add(() => this.addRepetitiveTask(task, interval));
    }

    async close(): Promise<void> {
        this.queue.clear();
        this.schdeduleQueue.clear();
        this.heliaController.libp2p.services.pubsub.unsubscribe(this.name);
        this.heliaController.libp2p.services.pubsub.removeEventListener("message");

    }

}

/**
 * Creates a sync controller with the specified name and Helia controller.
 * @param name - The name of the sync controller.
 * @param heliaController - The Helia controller to associate with the sync controller.
 * @returns A promise that resolves to the created SyncController instance.
 */
export async function createSyncController(name: string, heliaController: HeliaControllerInterface): Promise<SyncControllerInterface> {
    return new SyncController(heliaController, name);
}