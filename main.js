#!/usr/bin/env node
import { promises as fs } from "fs";
import assert from "assert";

const dateCutoff = new Date(2025,11-1,0).getTime();

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

const urlRegex = /^https:\/\/github.com\/([a-zA-Z0-9-]{3,39})\/([A-Za-z0-9_.-]{2,100})\/issues\/(\d+)$/;
const headlineRegex = /[A-Z]{2}\n([a-zA-Z0-9 ().,-]{3,39})\n#(\d+)\n\$([0-9,]+)\n([\][a-zA-Z0-9 ().,_:\/+<>`"=?\p{Emoji_Presentation}#'&-]+)$/u;
const redundantRegex = /submitted a.+pull request.+that claims the bounty. You can.+visit your .+board.+to reward\.|The user @[a-zA-Z0-9-]{3,39} is already attempting to complete issue #\d+ and claim the bounty\. We recommend checking in on @[a-zA-Z0-9-]{3,39}'s progress, and potentially collaborating, before starting a new solution\.|@[a-zA-Z0-9-]{3,39}: Reminder that in 7 days the bounty will become up for grabs, so please submit a pull request before then|The bounty is up for grabs! Everyone is welcome to `\/attempt #\d+`|team prefers to assign a single contributor to the issue rather than let anyone attempt it right away. We recommend waiting for a confirmation from a member before getting started\.|@[a-zA-Z0-9-]{3,39}: Another person is already attempting this issue\. Please don't start working on this issue unless you were explicitly asked to do so\.|Note: The user @[a-zA-Z0-9-]{3,39} is already attempting to complete issue #\d+ and claim the bounty\. If you attempt to complete the same issue, there is a chance that @[a-zA-Z0-9-]{3,39} will complete the issue first, and be awarded the bounty\. We recommend discussing with @[a-zA-Z0-9-]{3,39} and potentially collaborating on the same solution versus creating an alternate solution\./;
const attemptRegex = / @([a-zA-Z0-9-]{3,39}) \|| @([a-zA-Z0-9-]{3,39})<\/td>\n/g;
const pullRequestRegex = /\| #(\d+) \| \[Reward\]\(|pull\/\d+">#(\d+)<\/a><\/td>\n/g;
const allIssueNumberLikeRegex = /#(\d+)/g;
const attemptCommentRegex = /^\/attempt #(\d+)$/;

const now = new Date().getTime();
const results = [];
if (!Array.isArray(bountiesJSON)) throw new Error;
for (const bountyJSON of bountiesJSON) {
    const [url, headline] = bountyJSON;
    if (bountyJSON.length !== 2 || typeof url !== "string" || typeof headline !== "string") throw new Error;
    if (url.startsWith("https://algora.io")) continue; // https://algora.io/twentyhq glitch

    const urlParsed = urlRegex.exec(url);
    if (urlParsed.length !== 4) throw new Error;
    const [urlAgain, ownerUsername, repo, issueNumStr] = urlParsed;
    if (urlAgain !== url) throw new Error;
    const issueNum = +issueNumStr;
    if (`${issueNum}` !== issueNumStr) throw new Error;

    const headlineParsed = headlineRegex.exec(headline);
    if (headlineParsed.length !== 5) throw new Error;
    const [headlineAgain, ownerName, issueNumStr2, priceStr, description] = headlineParsed;
    if (headlineAgain !== headline || issueNumStr2 !== issueNumStr) throw new Error;
    if (description.includes("\n")) throw new Error;
    const price = +(priceStr.replaceAll(",", ""));
    if (price.toLocaleString("en-US") !== priceStr) throw new Error;

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

    let createdAt;
    const pullRequests = [];
    const attempts = [];
    const attemptComments = [];
    for (const comment of commentsJSON) {
        const { body, user } = comment;
        const attemptCommentParse = attemptCommentRegex.exec(body);
        // Parse user comments because bot comment updates are broken at
        // https://github.com/ClaperCo/Claper/issues/143#issuecomment-2966237986
        if (attemptCommentParse) {
            // Weird wrong issue number at https://github.com/projectdiscovery/nuclei/issues/6403#issuecomment-3892433467
            if (attemptCommentParse[1] === issueNumStr) {
                attemptComments.push(user);
            }
        }
        if (!user.login.toLowerCase().includes("algora")) continue;
        if ((user.id !== 121443259 || user.type !== "Bot") && (user.id !== 136125894 || user.type !== "User")) throw new Error;
        if (redundantRegex.test(body)) continue; // Redundant
        if (createdAt) {
            // Redirects inside transferred issues like https://github.com/tscircuit/3d-viewer/issues/534
            if (pullRequests.length || attempts.length) throw new Error;
        }
        createdAt = new Date(comment.created_at).getTime();
        for (const [attemptRaw, attemptUsername, attemptUsernameAlt] of body.matchAll(attemptRegex)) {
            attempts.push(attemptUsername ?? attemptUsernameAlt);
        }
        attempts.sort();
        for (const [pullRequestRaw, pullRequestId, pullRequestIdAlt] of body.matchAll(pullRequestRegex)) {
            pullRequests.push(+(pullRequestId ?? pullRequestIdAlt));
        }
        pullRequests.sort();
        const checkNumbers = [];
        for (const [checkRaw, checkNumStr] of body.matchAll(allIssueNumberLikeRegex)) {
            const checkNum = +checkNumStr;
            if (checkNum === issueNum) continue;
            checkNumbers.push(checkNum);
        }
        checkNumbers.sort();
        assert.deepStrictEqual(pullRequests, checkNumbers);
        if (pullRequests.length > attempts.length) throw new Error;
    }
    if (!createdAt) {
        // Bot prevented from comments at https://github.com/rafael-fuente/diffractsim/issues/69
        continue;
    }
    if (createdAt < dateCutoff) continue; // Stale
    for (const attemptComment of attemptComments) {
        if (!attempts.includes(attemptComment)) {
            attempts.push(attemptComment);
        }
    }

    let openPullRequests = 0;
    for (const pullRequestId of pullRequests) {
        const pullRequestJSON = JSON.parse(await cacheFetch(basePath + `pull${pullRequestId}.json`, `https://api.github.com/repos/${ownerUsername}/${repo}/pulls/${pullRequestId}`));
        if (pullRequestJSON.state === "open") {
            ++openPullRequests;
        }
    }

    let sortKey = 1; // Most important at bottom, as terminal scrolls higher lines away
    sortKey *= 1 / (attempts.length + 1); // Avoid saturated markets
    sortKey *= 1 / (now - createdAt); // Avoid stale issues from tightwads

    results.push([sortKey, price, attempts.length, pullRequests.length, openPullRequests, createdAt, description, url]);
}

results.sort((x, y) => x[0] - y[0]);

const output = ["price, attempts.length, pullRequests.length, openPullRequests, createdAt, description, url"];
for (const result of results) {
    output.push(`${result[1]},${result[2]},${result[3]},${result[4]},${new Date(result[5]).toISOString()},"${result[6].replaceAll('"', '""')}",${result[7]}`)
}

await fs.writeFile("bounties.csv", output.join("\n"));
