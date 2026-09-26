import { verifyTikTokControlledAccount } from "../src/services/tiktok-controlled-verification.js";

const args = new Map<string,string>();
for (let i=2;i<process.argv.length;i+=1) {
  const [key,value] = process.argv[i].includes("=") ? process.argv[i].split(/=(.*)/s,2) : [process.argv[i], process.argv[i+1]];
  if (key && value) args.set(key.replace(/^--/, ""), value);
}
if (args.get("confirm-self-only") !== "true") {
  throw new Error("Refusing controlled verification: pass --confirm-self-only=true");
}
const accountId=args.get("account-id");
const outputPath=args.get("output");
const prompt=args.get("prompt");
if(!accountId || !outputPath || !prompt) throw new Error("Required: --account-id --output --prompt");
const result = await verifyTikTokControlledAccount({accountId, outputPath, prompt});
console.log(JSON.stringify(result));
