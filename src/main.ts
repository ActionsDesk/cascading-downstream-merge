import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/rest'
import { cascadingBranchMerge } from './cascading-branch-merge.js'

export async function run() {
  const githubToken = core.getInput('github_token', { required: true })
  const mergeToken = core.getInput('merge_token')
  const prefixes = core.getInput('prefixes', { required: true }).split(/,\s?/)
  const refBranch = core.getInput('ref_branch', { required: true })

  core.info(`Prefixes: ${prefixes}`)
  core.info(`Ref Branch: ${refBranch}`)

  if (
    github.context.payload.pull_request &&
    github.context.payload.pull_request.merged
  ) {
    const octokit = new Octokit({
      auth: githubToken,
      baseUrl: github.context.apiUrl
    })
    const mergeOctokit =
      mergeToken !== ''
        ? new Octokit({ auth: mergeToken, baseUrl: github.context.apiUrl })
        : octokit

    core.info(`PR Number: ${github.context.payload.pull_request.number}`)
    core.info(`Head Branch: ${github.context.payload.pull_request.head.ref}`)
    core.info(`Base Branch: ${github.context.payload.pull_request.base.ref}`)

    cascadingBranchMerge(
      prefixes,
      refBranch,
      github.context.payload.pull_request.head.ref,
      github.context.payload.pull_request.base.ref,
      github.context.repo.owner,
      github.context.repo.repo,
      octokit,
      mergeOctokit,
      github.context.payload.pull_request.number,
      github.context.actor
    )
  }
}
