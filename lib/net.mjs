import { promises as fs } from "fs";

const bearerToken = await (async () => {
    try {
        return "Bearer " + (await fs.readFile("bearer_token.txt", "ascii")).trim();
    } catch (e) {
        console.log("Found no GitHub token to use");
        return "";
    }
})();
const fetchOptions = {
    headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "https://github.com/danielzgtg/algora_analyzer",
    },
};
if (bearerToken.length) {
    fetchOptions.headers.Authorization = bearerToken;
}

async function fetchLoop(url) {
    for (let i = 0; i < 14; ++i) {
        await new Promise(r => setTimeout(r, 100 + 1000 * (2 ** i - 1)));
        try {
            const response = await fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(10000) });
            if ((+response.headers.get(["x-ratelimit-remaining"]) || 0) < 10) {
                console.log("rate limited");
                await new Promise(r => setTimeout(r, 1000 * 60 * 60));
            }
            console.log(response);
            if (response.status === 503 || response.status === 502) continue;
            if (response.status === 200 || response.status == 404) return response;
        } catch (e) {
            if (e.name !== "TimeoutError") throw e;
            console.log("Timeout");
        }
    }
    throw new Error;
}

export async function cacheFetch(path, url) {
    let existing = false;
    try {
        await fs.access(path, fs.constants.R_OK);
        existing = true;
    } catch (e) {}
    if (existing) {
        return await fs.readFile(path, "utf-8");
    }
    console.log("Will fetch: " + url);
    const fetched = await (await fetchLoop(url)).text();
    await fs.writeFile(path, fetched);
    return fetched;
}
