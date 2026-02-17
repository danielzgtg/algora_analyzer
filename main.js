#!/usr/bin/env node
import { promises as fs } from "fs";

await fs.mkdir("cache", { recursive: true });
const bountiesJSON = await (async () => {
    try {
        return JSON.parse(await fs.readFile("bounties.json", "utf-8"))
    } catch (e) {
        console.error('Open https://algora.io/bounties then DevTools [...$$("#bounties-container a")].map(x=>[x.href,x.innerText]) and "Copy Object" into bounties.json');
        throw e;
    }
})();

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

async function cacheFetch(path, url) {
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

const urlRegex = /^https:\/\/github.com\/([a-zA-Z0-9-]{3,39})\/([A-Za-z0-9_.-]{2,100})\/issues\/(\d+)$/;
const headlineRegex = /[A-Z]{2}\n([a-zA-Z0-9 ().,-]{3,39})\n#(\d+)\n\$([0-9,]+)\n([\][a-zA-Z0-9 ().,_:\/+<>`"=?\p{Emoji_Presentation}#'&-]+)$/u;

if (!Array.isArray(bountiesJSON)) throw Error;
for (const bountyJSON of bountiesJSON) {
    const [url, headline] = bountyJSON;
    if (bountyJSON.length !== 2 || typeof url !== "string" || typeof headline !== "string") throw Error;
    if (url.startsWith("https://algora.io")) continue; // https://algora.io/twentyhq glitch

    const urlParsed = urlRegex.exec(url);
    if (urlParsed.length !== 4) throw Error;
    const [urlAgain, ownerUsername, repo, issueNumStr] = urlParsed;
    if (urlAgain !== url) throw Error;
    const issueNum = +issueNumStr;
    if (`${issueNum}` !== issueNumStr) throw Error;

    const headlineParsed = headlineRegex.exec(headline);
    if (headlineParsed.length !== 5) throw Error;
    const [headlineAgain, ownerName, issueNumStr2, priceStr, description] = headlineParsed;
    if (headlineAgain !== headline || issueNumStr2 !== issueNumStr) throw Error;
    const price = +(priceStr.replaceAll(",", ""));
    if (price.toLocaleString("en-US") !== priceStr) throw Error;

    const basePath = `cache/${ownerUsername}/${repo}/${issueNumStr}/`;
    await fs.mkdir(basePath, { recursive: true });

    const issueURL = `https://api.github.com/repos/${ownerUsername}/${repo}/issues/${issueNumStr}`;
    const issueJSON = JSON.parse(await cacheFetch(basePath + "issue.json", issueURL));
    if (issueJSON.url !== issueURL) {
        continue; // Redirect
    }

    const commentsJSON = [];
    let commentsPages = 0;
    for (;;) {
        ++commentsPages;
        const commentsPage = JSON.parse(await cacheFetch(basePath + `comments${commentsPages}.json`, `https://api.github.com/repos/${ownerUsername}/${repo}/issues/${issueNumStr}/comments?per_page=100&page=${commentsPages}`));
        commentsJSON.push(...commentsPage);
        if (commentsPage.length !== 100) break;
    }
}

