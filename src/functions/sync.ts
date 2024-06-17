import type { Message } from '@libp2p/interface';
import delay from "delay";
import PQueue from "p-queue";
import { HeadInterface } from "src/types";
import { HeliaController } from "./utils";
import { CID } from 'multiformats/cid';


/**
 * Represents a SyncController that handles synchronization operations.
 */
export class SyncController {
    heliaController: HeliaController;
    name: string;
    queue: PQueue = new PQueue({ concurrency: 1 });
    schdeduleQueue: PQueue = new PQueue({ concurrency: 1 });
    newHead?: (data: Uint8Array) => Promise<void>;

    constructor(heliaController: HeliaController, name: string) {
        this.heliaController = heliaController;
        this.name = name;
    }

    newMessage(message: CustomEvent<Message>): void {
        const data = message.detail.data;
        console.log("Hmmm", this.newHead)
        if (this.newHead)
            this.newHead(data);
    }

    async start(newHead: (message: CustomEvent<Message>) => Promise<void>) {
        // console.log("start", { newHead });
        // this.newHead = newHead;
        // console.log("start",  this.newHead );

        this.heliaController.helia.libp2p.services.pubsub.addEventListener("message", newHead);
        this.heliaController.helia.libp2p.services.pubsub.addEventListener("subscription-change", async (data) => { console.log("subscription-change", { data }) });
        this.heliaController.helia.libp2p.services.pubsub.subscribe(this.name);
    }

    async sendHead(head: HeadInterface) {
        const cid = CID.parse(head.id);
        this.heliaController.helia.libp2p.services.pubsub.publish(this.name, cid.bytes);
    }

    async addTask(task: () => Promise<void>) {
        this.queue.add(task);
    }

    async addRepetitiveTask(task: () => Promise<void>, interval: number) {
        console.log("addRepetitiveTask", { interval });
        this.schdeduleQueue.add(() => delay(interval));
        this.schdeduleQueue.add(() => this.addTask(task));
        this.schdeduleQueue.add(() => this.addRepetitiveTask(task, interval));
    }

    async close() {
        this.queue.clear();
        this.schdeduleQueue.clear();
        this.heliaController.helia.libp2p.services.pubsub.unsubscribe(this.name);
        this.heliaController.helia.libp2p.services.pubsub.removeEventListener("message");

    }

}

/**
 * Creates a sync controller with the specified name and Helia controller.
 * @param name - The name of the sync controller.
 * @param heliaController - The Helia controller to associate with the sync controller.
 * @returns A promise that resolves to the created SyncController instance.
 */
export async function createSyncController(name: string, heliaController: HeliaController): Promise<SyncController> {
    return new SyncController(heliaController, name);
}