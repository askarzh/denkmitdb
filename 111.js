import { CID } from "multiformats/cid";
import * as json from "multiformats/codecs/json";
import { sha256 } from "multiformats/hashes/sha2";
import { identity } from "multiformats/hashes/identity";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { faker } from "@faker-js/faker";

import * as Block from 'multiformats/block'
import * as codec from '@ipld/dag-cbor'

import { createHash } from "crypto";


const hashSha256 = createHash('sha256');



const NL1 = 1000000;

const elements1 = Array.from({ length: NL1 }, () => uint8ArrayFromString(faker.hacker.phrase()));


console.time("Execution Time Multiformats SHA256");

for (const e of elements1) {
    const leaf = await sha256.digest(e);
}

console.timeEnd("Execution Time Multiformats SHA256");


console.time("Execution Time Node.js SHA256");
for (const e of elements1) {
    const leaf = hashSha256.update(e).copy().digest();
}
console.timeEnd("Execution Time Node.js SHA256");

process.exit(0);

const a = { hello: "world", t: { b: 10 } };

console.log(a);

const bytes = json.encode(a);

const hash = await sha256.digest(bytes);
console.log(hash);
const hashStr = uint8ArrayToString(hash.bytes, "hex");
console.log(hashStr);

const hash2 = hashSha256.update(bytes);
const hash21 = hash2.digest();
console.log(hash21);
process.exit(0);

async function solveHashWithLeadingZeros(data) {
	let nonce = 0;

	data = { ...data, nonce };

	while (true) {
		const encoded = json.encode(data);
		const hash = await sha256.digest(encoded);
		if (hash.digest[0] == 0x00 && hash.digest[1] == 0x00 && hash.digest[2] == 0x00) {
			return data;
		}

		data.nonce++;
	}
}

console.log("Solving hash with leading zeros", new Date().toISOString());
const a1 = await solveHashWithLeadingZeros(a);
const bytes1 = json.encode(a1);
const hash1 = await sha256.digest(bytes1);
console.log(hash1);
const hashStr1 = uint8ArrayToString(hash1.bytes, "hex");
console.log(hashStr1);
console.log(a1, new Date().toISOString());

const cid = CID.create(1, json.code, hash);

console.log(cid);

const username = { username: "Askar" };
const usernameBytes = json.encode(username);
const idHash256 = await sha256.digest(usernameBytes);
console.log(idHash256);
const idHashIdentity = identity.digest(usernameBytes);
console.log(idHashIdentity);
