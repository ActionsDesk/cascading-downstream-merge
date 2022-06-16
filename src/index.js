const { cascadingBranchMerge } = require('./cascading-branch-merge')

const core = require('@actions/core')
const github = require('@actions/github')

/**
 * @description Entrypoint
 */
async function exec () {
  const prefixes = core.getInput('prefixes')
  const refBranch = core.getInput('refBranch')
  const githubToken = core.getInput('GITHUB_TOKEN')
  const mergeToken = core.getInput('MERGE_TOKEN')

  const octokit = github.getOctokit(githubToken)

  let mergeOctokit
  if (mergeToken) {
    console.log('Got a merge token. Creating seperate octokit object.')
    mergeOctokit = github.getOctokit(mergeToken)
  } else {
    mergeOctokit = octokit
  }

  const context = github.context
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const pullNumber = context.payload.pull_request.number
  const headBranch = context.payload.pull_request.head.ref
  const baseBranch = context.payload.pull_request.base.ref
  const actor = context.actor

  const prefixArray = prefixes.split(',')

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
    owner,
    repo
  }
  if (context.payload.pull_request.merged) {
    cascadingBranchMerge(
      prefixArray,
      refBranch,
      headBranch,
      baseBranch,
      repository,
      octokit,
      mergeOctokit,
      pullNumber,
      actor
    )
  } else {
    console.log('PR was not merged. Skipping cascade.')
  }
}

// Entrypoint
exec()
