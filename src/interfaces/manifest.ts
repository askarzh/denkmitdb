import { DataType } from "./dataTypes";

const MANIFEST_VERSION = 1;
export type ManifestVersionType = typeof MANIFEST_VERSION;

export type ManifestType = DataType & {
	version: ManifestVersionType;
	database: string;
	type: string;
	consensusController: string;
	accessController: string;
	creatorId: string;
};

export interface ManifestInterface extends ManifestType {
	verify(): Promise<boolean>;
}
