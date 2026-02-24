#!/usr/bin/env node
import { promises as fs } from "fs";
import { cacheFetch } from "./lib/net.mjs"
import { analyzeBountiesJSON, renderResult } from "./lib/bounties.mjs"

await fs.mkdir("cache", { recursive: true });
const bountiesJSON = await (async () => {
    try {
        return JSON.parse(await fs.readFile("bounties.json", "utf-8"))
    } catch (e) {
        console.error('Open https://algora.io/bounties then DevTools [...$$("#bounties-container a")].map(x=>[x.href,x.innerText]) and "Copy Object" into bounties.json');
        throw e;
    }
})();

await (async () => {
    const bountiesMTime = (await fs.stat("bounties.json")).mtimeMs;
    let eventsMTime = 0;
    try {
        eventsMTime = (await fs.stat("cache/events.json")).mtimeMs;
    } catch (e) {}
    if (eventsMTime <= new Date().getTime() - 1000*60*60*24) {
        try {
            await fs.unlink("cache/events.json");
        } catch (e) {}
    }
    const eventsJSON = JSON.parse(await cacheFetch("cache/events.json", "https://api.github.com/users/algora-pbc/events"));
    const lastCreatedAt = eventsJSON[0]?.created_at;
    if (lastCreatedAt && new Date(lastCreatedAt).getTime() > bountiesMTime) {
        console.error("Please update bounties.json");
        throw new Error;
    }
})();

const results = await analyzeBountiesJSON(bountiesJSON);
results.sort((x, y) => x[0] - y[0]); // [0] = sortKey

const output = ["price, attempts.length, pullRequests.length, openPullRequests, createdAt, description, url"];
for (const result of results) {
    output.push(renderResult(result));
}
output.push("");

await fs.writeFile("bounties.csv", output.join("\n"));
