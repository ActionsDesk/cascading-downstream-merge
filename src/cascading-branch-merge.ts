import * as core from '@actions/core'
import type { Octokit } from '@octokit/rest'
import { Endpoints } from '@octokit/types'

type GetRepositoryBranchesResponse =
  Endpoints['GET /repos/{owner}/{repo}/branches']['response']['data']

/**
 * Merges all release branches by ascending order of their semantic version.
 *
 * @param prefixes The prefixes to filter branches by.
 * @param refBranch The branch to merge into the head branch.
 * @param headBranch The head branch to merge from.
 * @param baseBranch The base branch to merge into.
 * @param owner The owner of the repository.
 * @param repo The repository name.
 * @param octokit The octokit instance.
 * @param mergeOctokit The octokit instance to merge with.
 * @param pullNumber The pull request number.
 * @param actor The actor of the pull request.
 */
export async function cascadingBranchMerge(
  prefixes: string[],
  refBranch: string,
  headBranch: string,
  baseBranch: string,
  owner: string,
  repo: string,
  octokit: InstanceType<typeof Octokit>,
  mergeOctokit: InstanceType<typeof Octokit>,
  pullNumber: number,
  actor: string
) {
  let success = true

  // Get all branches in the repository.
  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo
  })
  core.info(`Branches: #${branches.length}`)

  let mergeListHead: string[] = []
  let mergeListBase: string[] = []
  const mergeLists = []
  let mergeList = []

  prefixes.forEach(function (prefix) {
    if (headBranch.startsWith(prefix))
      mergeListHead = getBranchMergeOrder(prefix, headBranch, branches)

    if (baseBranch.startsWith(prefix)) {
      mergeListBase = getBranchMergeOrder(prefix, baseBranch, branches)
      mergeListBase.push(refBranch)
    }
  })

  core.info(`Merge List Head: ${mergeListHead}`)
  core.info(`Merge List Base: ${mergeListBase}`)

  mergeLists[0] = mergeListHead
  mergeLists[1] = mergeListBase

  for (let a = 0; a < 2; a++) {
    mergeList = mergeLists[a]

    for (let i = 0; i < mergeList.length - 1; i++) {
      let res: Endpoints['POST /repos/{owner}/{repo}/pulls']['response']

      // Create a PR for the next merge.
      try {
        res = await octokit.rest.pulls.create({
          owner,
          repo,
          base: mergeList[i + 1],
          head: mergeList[i],
          title: `Automatic merge from ${mergeList[i]} -> ${mergeList[i + 1]}`,
          body: 'This PR was created automatically by the cascading downstream merge action.'
        })
      } catch (error: any) {
        core.error(error)

        const message = error.response.data.errors[0].message

        if (error.status === 422) {
          if (message.startsWith('No commits between')) {
            await octokit.rest.issues.createComment({
              owner,
              repo,
              issue_number: pullNumber,
              body: `Skipping creation of cascading PR to merge __${mergeList[i]}__ into __${mergeList[i + 1]}__\n\nThere are no commits between these branches.\n\nContinuing auto-merge action...`
            })

            continue
          } else if (message.startsWith('A pull request already exists')) {
            await octokit.rest.issues.createComment({
              owner,
              repo,
              issue_number: pullNumber,
              body: `:heavy_exclamation_mark: Tried to create a cascading PR to merge __${mergeList[i]}__ into __${mergeList[i + 1]}__ but there is already a pull request open.\n\nCan't continue auto-merge action.`
            })

            success = false
            break
          }
        } else {
          const issue = await octokit.rest.issues.create({
            owner,
            repo,
            assignees: [actor],
            title: ':heavy_exclamation_mark: Cascading Auto-Merge Failure',
            body: `Unknown issue when creating a PR to merge __${mergeList[i]}__ into __${mergeList[i + 1]}__\n\nPlease try to resolve the issue.\n\n**Cascading Auto-Merge has been stopped!**\n\nError: "${JSON.stringify(error.response.data)}"`
          })

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullNumber,
            body: `:heavy_exclamation_mark: Tried to create a cascading PR to merge __${mergeList[i]}__ into __${mergeList[i + 1]}__ but encountered an issue.\n\nError: "${JSON.stringify(error.response.data)}"\n\nCreated an issue #${issue.data.number}.\n\nCan't continue auto-merge action.`
          })

          success = false
          break
        }
      }

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: `Created cascading Auto-Merge PR #${res!.data.number} to merge __${mergeList[i]}__ into __${mergeList[i + 1]}__`
      })

      // Merge the PR
      try {
        await mergeOctokit.rest.pulls.merge({
          owner,
          repo,
          pull_number: res!.data.number
        })
      } catch (error: any) {
        core.error(error)

        if (error.status === 405) {
          // Comment on the original PR, noting that the cascading failed
          const issue = await octokit.rest.issues.create({
            owner,
            repo,
            assignees: [actor],
            title:
              ':heavy_exclamation_mark: Merge Conflict with Cascading Auto-Merge',
            body: `Issue with cascading auto-merge, please try to resolve the merge conflicts.\n\nPR #${res!.data.number}.\n\n**Cascading Auto-Merge has been stopped!**\n\nOriginating PR #${pullNumber}`
          })

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullNumber,
            body: `:heavy_exclamation_mark: Could not auto merge PR #${res!.data.number} due to merge conflicts.\n\nCreated an issue #${issue.data.number}.\n\nCan't continue auto-merge action.`
          })

          success = false
          break
        } else {
          const issue = await octokit.rest.issues.create({
            owner,
            repo,
            assignees: [actor],
            title:
              ':heavy_exclamation_mark: Problem with Cascading Auto-Merge.',
            body: `Issue with auto-merging a PR.\n\nPlease try to resolve the Issue.\n\n**Cascading Auto-Merge has been stopped!**\n\nOriginating PR #${pullNumber}\n\nError: ${JSON.stringify(error.response.data)}`
          })

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullNumber,
            body: `:heavy_exclamation_mark: Tried merge PR #${res!.data.number} to merge __${mergeList[i]}__ into __${mergeList[i + 1]}__ but encountered an issue.\n\nError: "${JSON.stringify(error.response.data)}".\n\nCreated an issue #${issue.data.number}.\n\nCan't continue auto-merge action.`
          })

          success = false
          break
        }
      }
    }
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body: success
      ? ':white_check_mark: Auto-merge was successful.'
      : ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
  })
}

/**
 * Filters repository branches that start with a specific prefix, followed by a
 * forward slash (e.g. `release/`) and return an ordered list.
 *
 * Ordering is done by comparing the semantic version of the branches.
 *
 * @param prefix The prefix to filter branches by.
 * @param headBranch The head branch to merge from.
 * @param branches The list of branches in the repository.
 * @returns The ordered list of branches.
 */
export function getBranchMergeOrder(
  prefix: string,
  headBranch: string,
  branches: GetRepositoryBranchesResponse
): string[] {
  const branchList = branches
    .filter((branch) => branch.name.startsWith(prefix))
    .map((branch) => branch.name)

  core.info(`[getBranchMergeOrder] branchList: ${branchList}`)

  branchList.sort((a, b) =>
    isBiggerThan(semanticVersionToArray(a), semanticVersionToArray(b))
  )

  // Return only the versions that are 'younger' than the PR version.
  if (branchList.length !== 0)
    while (branchList[0] !== headBranch) branchList.shift()

  return branchList
}

/**
 * Compares the semantic versions of two branches.
 *
 * @param v1 The first version.
 * @param v2 The second version.
 * @returns A negative value if v1 is before (smaller than) v2, a positive value
 *          if v1 is after (bigger than) v2, or 0 if they are equal.
 */
export function isBiggerThan(v1: number[], v2: number[]): number {
  // Semantic versions have 5 "parts": major, minor, patch, pre-release, build.
  // Each should be compared in order.
  for (let i = 0; i < 5; i++) {
    if (v1[i] === v2[i])
      continue // This part is equal
    else if (v1[i] > v2[i])
      return 1 // v1 is bigger
    else return -1 // v2 is bigger
  }

  /* istanbul ignore next */
  return 0
}

/**
 * Translates the version string to an array of numbers, dropping any
 * non-numeric parts.
 *
 * E.g., "release/1.1-rc.1" -> [1,1,0,3,1]
 *
 * @param vStr The version string.
 * @returns The version as an array of numbers.
 */
export function semanticVersionToArray(vStr: string): number[] {
  // Creating a 'lookup' map of semantic version prerelease prefixes.
  const preRelease = {
    alpha: 1,
    beta: 2,
    rc: 3
  }

  const av: number[] = []

  // 1.1.rc.1
  // "release/1.1-rc.1"  -->  ['1','1-rc','1']
  const avTemp = vStr.split('/')[1].split(/_|\./)

  /* istanbul ignore next */
  avTemp.forEach(function (v, index) {
    // Check if the version contains a prerelease tag.
    if (v.includes('-')) {
      const vTemp = v.split('-')

      if (index === 1) {
        // Short version - 1.1-rc
        av.splice(index, 1, parseInt(vTemp[0], 10))
        av.splice(index + 1, 1, 0)
        av.splice(index + 2, 0, preRelease[vTemp[1] as keyof typeof preRelease])
      } else {
        // Full version - 1.1.0-rc
        av.splice(index, 1, parseInt(vTemp[0], 10))
        av.splice(index + 1, 0, preRelease[vTemp[1] as keyof typeof preRelease])
      }
    } else {
      av.push(parseInt(v))
    }
  })

  // Make sure the length is 5. This can be shorter if there is no prerelease or
  // build number in the version.
  if (av.length < 3) av[2] = 0 // No patch
  if (av.length < 4) av[3] = 0 // No prerelease
  if (av.length < 5) av[4] = 0 // No build number

  return av
}
