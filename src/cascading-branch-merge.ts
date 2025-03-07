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
 * @param headBranch The head branch to merge from (e.g. feature/abc123).
 * @param baseBranch The base branch to merge into (e.g. release/2022.05.04).
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
  const branchList = bitbucketBranchOrderingAlgorithm(
    branches
      .filter((branch) => branch.name.startsWith(prefix))
      .map((branch) => branch.name),
    headBranch
  )

  core.info(`[getBranchMergeOrder] branchList: ${branchList}`)

  // Return only the versions that are 'younger' than the PR version.
  const headIndex = branchList.indexOf(headBranch)

  return branchList.slice(headIndex)
}

/**
 * Bitbucket branch ordering algorithm.
 *
 * See: https://confluence.atlassian.com/bitbucketserver/cascading-merge-776639993.html
 *
 * @param branchList The list of branches to order.
 * @param targetBranch The target branch to merge into.
 * @returns The ordered branches for the cascade merge.
 */
function bitbucketBranchOrderingAlgorithm(
  branchList: string[],
  targetBranch: string
): string[] {
  const branchPrefix = targetBranch.slice(0, targetBranch.match(/\d/)?.index)

  /* istanbul ignore next */
  if (!branchPrefix) return []

  return (
    branchList
      // - Branches are selected and ordered on the basis of the name of the
      //   branch that started the cascade (i.e. the target of the pull request
      //   for the merge).
      // - Only branches matching the name of the pull request target are added
      //   into the merge path. Matching means that every token before the first
      //   numeric token must be equal to the corresponding tokens of the target
      //   branch's name.
      .filter((b) => b.startsWith(branchPrefix))

      // - Branch names are split into tokens using any of these characters:
      //   underscore '_', hyphen  '-', plus '+', or period '.'.
      .map((b) => ({
        original: b,
        tokenized: b.split(/[/\-+_.]/)
      }))

      .sort((a, b) => {
        for (
          let i = 0;
          i < Math.max(a.tokenized.length, b.tokenized.length);
          i++
        ) {
          // Skip if equivalent.
          if (a.tokenized[i] === b.tokenized[i]) continue

          // The a version should come first.
          if (i >= a.tokenized.length) return -1
          // The b version should come first.
          else if (i >= b.tokenized.length) return 1

          // actual comparison starts here
          const numberA = parseInt(a.tokenized[i], 10)
          const numberB = parseInt(b.tokenized[i], 10)

          // - Branches are ordered by number, if a given token is numeric. When
          //   comparing a numeric token with an ASCII token, the numeric is
          //   ranked higher (that is, it is considered as being a newer
          //   version).
          if (!isNaN(numberA))
            if (!isNaN(numberB))
              // Both are numbers. Compare directly.
              return numberA - numberB
            else
              // Only a is number, so it comes first.
              return -1
          else if (!isNaN(numberB))
            // Only b is number, so it comes first.
            return 1

          // - If both tokens are non-numeric, a simple ASCII comparison is
          //   used.
          /* istanbul ignore next */
          return a.tokenized[i] > b.tokenized[i] ? 1 : -1
        }

        // - In the unlikely case of the above algorithm resulting in equality
        //   of 2 branch names, a simple string comparison is performed on the
        //   whole branch name.
        /* istanbul ignore next */
        return a.original > b.original ? 1 : -1
      })

      // Convert back to list of strings.
      .map((b) => b.original)
  )
}
