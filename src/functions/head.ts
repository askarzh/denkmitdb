import { he } from "@faker-js/faker";
import { CID } from "multiformats/cid";
import { HeadVersionType, HeadInput, HEAD_VERSION, HeadInterface, HeadType } from "src/types";
import { HeliaController } from "./utils";

export class Head implements HeadInterface {
    version: HeadVersionType;
    manifest: string;
    root: string;
    timestamp: number;
    layersCount: number;
    size: number;
    creatorId: string;
    id: string;

    constructor(head: HeadType) {
        this.version = HEAD_VERSION;
        this.manifest = head.manifest;
        this.root = head.root;
        this.timestamp = head.timestamp;
        this.layersCount = head.layersCount;
        this.size = head.size;
        this.creatorId = head.creatorId;
        this.id = head.id;
    }
}

export async function createHead(head: HeadInput, heliaController:HeliaController): Promise<HeadInterface> {
    const headInput: HeadInput = {
        version: HEAD_VERSION,
        manifest: head.manifest,
        root: head.root,
        timestamp: head.timestamp,
        creatorId: head.creatorId,
        layersCount: head.layersCount,
        size: head.size,
    };

    const cid = await heliaController.addSigned(head);

    return new Head({
        ...headInput,
        id: cid.toString(),
    });
}

export async function getHead(cid: CID, heliaController: HeliaController): Promise<HeadInterface> {
    const result = await heliaController.getSigned(cid);
    if(!result) throw new Error("Head not found");
    const head: HeadType = {...result as HeadInput, id: cid.toString()};
    return new Head(head);
}