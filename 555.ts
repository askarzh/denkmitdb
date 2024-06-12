import * as dagCborCodec from "@ipld/dag-cbor";
import * as json from "multiformats/codecs/json";

let identity = {
  type: 0,
  codec: dagCborCodec.code,
  alg: "ES384",
  publicKey: "",
  ui: new Uint8Array(10),
};

const js1 = json.encode(identity);
console.log(js1);

const dg1 = dagCborCodec.encode(identity);
console.log(dg1);