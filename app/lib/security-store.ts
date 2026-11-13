import {get, list, put} from "@vercel/blob";
import {mkdir, readFile, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
export class SecurityStoreUnavailable extends Error {}
function directory() {
  const dir = !process.env.VERCEL && (process.env.AQUA_SECURITY_DIR || process.env.AQUA_AUDIT_DIR);
  if (!dir) throw new SecurityStoreUnavailable("Persistent security storage is unavailable");
  return path.resolve(dir);
}
// Uncached, durable authorization state; never an in-memory revocation list.
export async function readSecurity<T>(key: string): Promise<T | null> {
  const name = `security-v2/${key}.json`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await get(name, {access:"private", useCache:false, abortSignal:AbortSignal.timeout(12000)});
    if (!result) return null;
    if (result.statusCode !== 200) throw new SecurityStoreUnavailable();
    return new Response(result.stream).json();
  }
  try { return JSON.parse(await readFile(path.join(directory(), name), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function writeSecurity(key: string, value: unknown, overwrite = false) {
  const name = `security-v2/${key}.json`, body = JSON.stringify(value);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(name, body, {access:"private", addRandomSuffix:false, allowOverwrite:overwrite, contentType:"application/json", abortSignal:AbortSignal.timeout(12000)});
  } else {
    const file = path.join(directory(), name);
    await mkdir(path.dirname(file), {recursive:true});
    await writeFile(file, body, {flag:overwrite?"w":"wx"});
  }
  if (JSON.stringify(await readSecurity(key)) !== body) throw new SecurityStoreUnavailable("Security write could not be confirmed");
}
export async function accountNames() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const names: string[] = []; let cursor: string | undefined;
    do {
      const page = await list({prefix:"security-v2/accounts/", limit:1000, cursor, abortSignal:AbortSignal.timeout(12000)});
      names.push(...page.blobs.map(b=>b.pathname.slice("security-v2/accounts/".length).replace(/\.json$/, "")));
      if (page.hasMore && (!page.cursor || page.cursor === cursor)) throw new SecurityStoreUnavailable();
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return names;
  }
  try { return (await readdir(path.join(directory(), "security-v2/accounts"))).filter(n=>n.endsWith(".json")).map(n=>n.slice(0,-5)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
