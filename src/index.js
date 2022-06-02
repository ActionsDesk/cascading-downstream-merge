const { cascadingBranchMerge } = require('./cascading-branch-merge')

const core = require('@actions/core');
const github = require('@actions/github');

/**
 * @description Entrypoint
 */
 async function exec() {

    try {
        const prefixes = core.getInput("prefixes")
        const refBranch = core.getInput("refBranch")
        const token = core.getInput("GITHUB_TOKEN")
        const octokit = github.getOctokit(token)
        const context = github.context
        const owner = github.context.repo.owner
        const repo = github.context.repo.repo
        const pullNumber = context.payload.pull_request.number
        const headBranch = context.payload.pull_request.head.ref
        const baseBranch = context.payload.pull_request.base.ref
        const actor = context.payload.actor

        const prefixArray = prefixes.split(",")

        console.log('GITHUB_TOKEN: ' + token)
        console.log('owner: ' + owner)
        console.log('repo: ' + repo)
        console.log('actor: ' + actor)
        console.log('prefixes: ' + prefixes)
        console.log('prefixArray: ', prefixArray)
        console.log('refBranch: ' + refBranch)
        console.log('pullNumber: ' + pullNumber)
        console.log('headBranch: ' + headBranch)
        console.log('baseBranch: ' + baseBranch)

        console.log(context)

        const repository = {
            "owner": owner,
            "repo": repo
        }
        if(context.payload.pull_request.merged) {
            cascadingBranchMerge(
                prefixArray,
                refBranch,
                headBranch,
                baseBranch,
                repository,
                octokit,
                pullNumber,
                actor
            )
        }
        else {
            console.log("PR was not merged. Skipping cascade.")
        }
        
    } catch (e) {
        console.log(e)
    }
}

// Entrypoint
exec()