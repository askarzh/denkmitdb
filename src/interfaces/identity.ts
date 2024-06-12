import * as jose from "jose";
import type { Helia } from "@helia/interface";
import { DataType, idCID } from ".";

export type KeyPair = Partial<jose.GenerateKeyPairResult>;

export enum IdentityTypes {
  publicKey = 0,
}

export type IdentityInput = DataType & {
  name: string;
  type: IdentityTypes;
  alg: string;
  publicKey: string;
};

export type IdentityType = idCID & IdentityInput;

export type IdentityJWS = jose.FlattenedJWS;

export interface IdentityInterface extends IdentityType {
  verify(jws: jose.FlattenedJWS): Promise<Uint8Array | undefined>;
  sign(data: Uint8Array): Promise<jose.FlattenedJWS>;
  encrypt(data: Uint8Array): Promise<jose.FlattenedJWE>;
  decrypt(jwe: jose.FlattenedJWE): Promise<Uint8Array | boolean>;
}

export declare function createIdentity(
  helia: Helia,
  name?: string,
  passphrase?: string
): Promise<IdentityInterface>;
