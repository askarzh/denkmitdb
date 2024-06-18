import { CID } from "multiformats/cid";
import { HEAD_VERSION, HeadInput, HeadInterface, HeadType, HeadVersionType, HeliaControllerInterface, OwnedDataType } from "src/types";

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

export async function createHead(head: HeadInput, heliaController: HeliaControllerInterface): Promise<HeadInterface> {
    const identity = heliaController.identity;
    const data: HeadInput = {
        version: HEAD_VERSION,
        manifest: head.manifest,
        root: head.root,
        timestamp: head.timestamp,
        creatorId: head.creatorId,
        layersCount: head.layersCount,
        size: head.size,
    };

    const dataToSign: OwnedDataType<HeadInput> = { data, identity }
    const cid = await heliaController.addSigned(dataToSign);

    return new Head({ ...data, id: cid.toString() });
}

export async function fetchHead(cid: CID, heliaController: HeliaControllerInterface): Promise<HeadInterface> {
    const result = await heliaController.getSigned<HeadInput>(cid);
    if (!result || !result.data) throw new Error("Head not found");
    const head: HeadType = { ...result.data, id: cid.toString() };
    return new Head(head);
}