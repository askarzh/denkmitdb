import { HeliaStorage } from "src/functions";

export const MANIFEST_VERSION = 1;
export type ManifestVersionType = typeof MANIFEST_VERSION;

export type ManifestType = {
	readonly version: ManifestVersionType;
	readonly name: string;
	readonly type: string;
	readonly pollardOrder: number;
	readonly consensusController: string;
	readonly accessController: string;
	readonly creatorId: string;
	readonly meta?: Record<string, unknown>;
	readonly id: string; // "/denkdb/cidaddress"
};

export type ManifestInput = Omit<ManifestType, "id">;

export interface ManifestInterface extends ManifestType {
	verify(): Promise<boolean>;
}

export declare function createManifest(manifestInput: ManifestInput, heliaStorage: HeliaStorage): Promise<ManifestInterface>;
export declare function openManifest(id: string, heliaStorage: HeliaStorage): Promise<ManifestInterface>;
