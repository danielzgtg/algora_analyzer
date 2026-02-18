import { promises as fs } from "fs";

const bearerToken = await (async () => {
    try {
        return "Bearer " + (await fs.readFile("bearer_token.txt", "ascii")).trim();
    } catch (e) {
        console.log(e)
        return "";
    }
})();
const fetchOptions = {
    headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    },
};
if (bearerToken.length) {
    fetchOptions.headers.Authorization = bearerToken;
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
    await new Promise(r => setTimeout(r, 100));
    const response = await fetch(url, fetchOptions);
    if ((+response.headers.get(["x-ratelimit-remaining"]) || 0) < 10) {
        console.log("rate limited");
        await new Promise(r => setTimeout(r, 1000 * 60 * 60));
    }
    console.log(response);
    const fetched = await response.text();
    await fs.writeFile(path, fetched);
    return fetched;
}
