
async function getPullRequest(pull_number, owner, repo, octokit) {
    const pr = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
    });

    return pr;
}
  
function checkMergability(a, b) {
  return a+b;
}

module.exports = {
    getPullRequest,
    checkMergability
}