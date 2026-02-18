import { promises as fs } from "fs";
import { cacheFetch } from "./net.mjs";
import { parseBounty } from "./parse_bounty.mjs";
import { parseComment } from "./parse_comment.mjs";

const now = new Date().getTime();
const dateCutoff = new Date(2025, 11-1, 0).getTime();

export async function analyzeBountiesJSON(bountiesJSON) {
    if (now + 1000*60*60*24 < new Date().getTime()) throw new Error("Short-lived script only");
    const results = [];
    if (!Array.isArray(bountiesJSON)) throw new Error;

    for (const bountyJSON of bountiesJSON) {
        const { ownerUsername, repo, issueNum, price, description, url } = parseBounty(bountyJSON);
        if (!ownerUsername) continue;

        const basePath = `cache/${ownerUsername}/${repo}/${issueNum}/`;
        await fs.mkdir(basePath, { recursive: true });

        const issueURL = `https://api.github.com/repos/${ownerUsername}/${repo}/issues/${issueNum}`;
        const issueJSON = JSON.parse(await cacheFetch(basePath + "issue.json", issueURL));
        if (issueJSON.url !== issueURL) {
            continue; // Redirect
        }

        const commentsJSON = [];
        let commentsPages = 0;
        for (;;) {
            ++commentsPages;
            const commentsPage = JSON.parse(await cacheFetch(basePath + `comments${commentsPages}.json`, `https://api.github.com/repos/${ownerUsername}/${repo}/issues/${issueNum}/comments?per_page=100&page=${commentsPages}`));
            commentsJSON.push(...commentsPage);
            if (commentsPage.length !== 100) break;
        }

        const createdAtPtr = [0];
        const attemptComments = [];
        const attempts = [];
        const pullRequests = [];
        for (const comment of commentsJSON) {
            parseComment(comment, issueNum, createdAtPtr, attemptComments, attempts, pullRequests);
        }
        if (!createdAtPtr[0]) {
            // Bot prevented from comments at https://github.com/rafael-fuente/diffractsim/issues/69
            continue;
        }
        if (createdAtPtr[0] < dateCutoff) continue; // Stale
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
        sortKey *= 1 / (now - createdAtPtr[0]); // Avoid stale issues from tightwads

        const result = [/* sortKey */ 0, price, attempts.length, pullRequests.length, openPullRequests, createdAtPtr[0], description, url]
        results.push(result);
    }

    return results;
}

export function renderResult(result) {
    return `${result[1]},${result[2]},${result[3]},${result[4]},${new Date(result[5]).toISOString()},"${result[6].replaceAll('"', '""')}",${result[7]}`;
}
