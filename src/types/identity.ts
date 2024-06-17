import * as jose from "jose";
import { CidString, DenkmitHeliaInterface } from "./utils";

export type KeyPair = Partial<jose.GenerateKeyPairResult>;

export const IDENTITY_VERSION = 1;
export type IdentityVersionType = typeof IDENTITY_VERSION;

export enum IdentityTypes {
    publicKey = 0,
}

export type IdentityAlgorithms = "ES256" | "ES384" | "ES512" | "RS256" | "RS384" | "RS512" | "PS256" | "PS384" | "PS512" | "EdDSA" | "RS1";

export type IdentityType = {
    readonly version: IdentityVersionType;
    readonly name: string;
    readonly type: IdentityTypes;
    readonly alg:  IdentityAlgorithms;
    readonly publicKey: string;
    id: CidString;
};

export type IdentityInput = Omit<IdentityType, "id">;

export type IdentityJWS = jose.FlattenedJWS;

export interface IdentityInterface extends IdentityType {
    verify(jws: jose.FlattenedJWS): Promise<Uint8Array | undefined>;
    sign(data: Uint8Array): Promise<jose.FlattenedJWS>;
    encrypt(data: Uint8Array): Promise<jose.FlattenedJWE>;
    decrypt(jwe: jose.FlattenedJWE): Promise<Uint8Array | boolean>;
}

export type IdentityConfig = {
    helia: DenkmitHeliaInterface;
    alg?: IdentityAlgorithms;
    name?: string;
    passphrase?: string;
};

export declare function createIdentity(config: IdentityConfig): Promise<IdentityInterface>;
