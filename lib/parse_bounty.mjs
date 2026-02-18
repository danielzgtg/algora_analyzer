const urlRegex = /^https:\/\/github.com\/([a-zA-Z0-9-]{3,39})\/([A-Za-z0-9_.-]{2,100})\/issues\/(\d+)$/;
const headlineRegex = /[A-Z]{2}\n([a-zA-Z0-9 ().,-]{3,39})\n#(\d+)\n\$([0-9,]+)\n([\][a-zA-Z0-9 ().,_:\/+<>`"=?\p{Emoji_Presentation}#'&-]+)$/u;

export function parseBounty(bountyJSON) {
    const [url, headline] = bountyJSON;
    if (bountyJSON.length !== 2 || typeof url !== "string" || typeof headline !== "string") throw new Error;
    if (url.startsWith("https://algora.io")) return {}; // https://algora.io/twentyhq glitch

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

    return { ownerUsername, repo, issueNum, price, description, url };
}
