import assert from "assert";

const redundantRegex = /submitted a.+pull request.+that claims the bounty. You can.+visit your .+board.+to reward\.|The user @[a-zA-Z0-9-]{3,39} is already attempting to complete issue #\d+ and claim the bounty\. We recommend checking in on @[a-zA-Z0-9-]{3,39}'s progress, and potentially collaborating, before starting a new solution\.|@[a-zA-Z0-9-]{3,39}: Reminder that in 7 days the bounty will become up for grabs, so please submit a pull request before then|The bounty is up for grabs! Everyone is welcome to `\/attempt #\d+`|team prefers to assign a single contributor to the issue rather than let anyone attempt it right away. We recommend waiting for a confirmation from a member before getting started\.|@[a-zA-Z0-9-]{3,39}: Another person is already attempting this issue\. Please don't start working on this issue unless you were explicitly asked to do so\.|Note: The user @[a-zA-Z0-9-]{3,39} is already attempting to complete issue #\d+ and claim the bounty\. If you attempt to complete the same issue, there is a chance that @[a-zA-Z0-9-]{3,39} will complete the issue first, and be awarded the bounty\. We recommend discussing with @[a-zA-Z0-9-]{3,39} and potentially collaborating on the same solution versus creating an alternate solution\./;
const attemptRegex = / @([a-zA-Z0-9-]{3,39}) \|| @([a-zA-Z0-9-]{3,39})<\/td>\n/g;
const pullRequestRegex = /\| #(\d+) \| \[Reward\]\(|pull\/\d+">#(\d+)<\/a><\/td>\n/g;
const allIssueNumberLikeRegex = /#(\d+)/g;
const attemptCommentRegex = /^\/attempt #(\d+)$/;

export function parseComment(comment, issueNum, createdAtPtr, attemptComments, attempts, pullRequests) {
    const { body, user } = comment;
    const attemptCommentParse = attemptCommentRegex.exec(body);
    // Parse user comments because bot comment updates are broken at
    // https://github.com/ClaperCo/Claper/issues/143#issuecomment-2966237986
    if (attemptCommentParse) {
        // Weird wrong issue number at https://github.com/projectdiscovery/nuclei/issues/6403#issuecomment-3892433467
        if (+attemptCommentParse[1] === issueNum) {
            attemptComments.push(user.login);
        }
    }
    if (!user.login.toLowerCase().includes("algora")) return;
    if ((user.id !== 121443259 || user.type !== "Bot") && (user.id !== 136125894 || user.type !== "User")) throw new Error;
    if (redundantRegex.test(body)) return; // Redundant
    if (createdAtPtr[0]) {
        // Redirects inside transferred issues like https://github.com/tscircuit/3d-viewer/issues/534
        if (pullRequests.length || attempts.length) throw new Error;
    }
    createdAtPtr[0] = new Date(comment.created_at).getTime();
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
        if (checkNum === issueNum) return;
        checkNumbers.push(checkNum);
    }
    checkNumbers.sort();
    assert.deepStrictEqual(pullRequests, checkNumbers);
    if (pullRequests.length > attempts.length) throw new Error;
}
