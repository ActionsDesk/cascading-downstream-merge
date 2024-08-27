
/**
 * @description This class contains the main "Cascading Auto-Merge" code.
 *  Note: All the utility functions are kept within this class,
 *        rather than putting it into the 'utility.ts' file.
 *        That way all required components can be found in one place.
 *
 */

let success = true
/**
 * @function cascadingBranchMerge
 * @description Merge all 'Release' branches by ascending order of their semantic version
 *              Multiple GitHub API calls are being processed as a single transaction!
 *              (despite the definition 'transaction', rollback is not automatic)
 *
 * @param prefixes
 * @param refBranch
 * @param {string} headBranch eg. feature/abc123
 * @param {string} baseBranch eg. release/2022.05.04
 * @param repository
 * @param octokit
 * @param mergeOctokit
 * @param pullNumber
 * @param actor
 */
async function cascadingBranchMerge (
  prefixes,
  refBranch,
  headBranch,
  baseBranch,
  repository,
  octokit,
  mergeOctokit,
  pullNumber,
  actor
) {
  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner: repository.owner,
    repo: repository.repo,
    per_page: 50
  },
  response => response.data
  )
  console.log(`Found ${branches.length} branches on repo ${repository.repo}.`)

  let mergeListHead = []
  let mergeListBase = []
  const mergeLists = []
  let mergeList = []

  prefixes.forEach(function (prefix) {
    if (headBranch.startsWith(prefix)) {
      mergeListHead = getBranchMergeOrder(prefix, headBranch, branches)
    }

    if (baseBranch.startsWith(prefix)) {
      mergeListBase = getBranchMergeOrder(prefix, baseBranch, branches)
      mergeListBase.push(refBranch)
    }
  })
  console.log('mergeListHead:', mergeListHead)
  console.log('mergeListBase:', mergeListBase)

  mergeLists[0] = mergeListHead
  mergeLists[1] = mergeListBase

  for (let a = 0; a < 2; a++) {
    mergeList = mergeLists[a]

    for (let i = 0; i < mergeList.length - 1; i++) {
      let res

      // -----------------------------------------------------------------------------------------------------------------
      // CREATE a PR for the next subsequent merge
      // -----------------------------------------------------------------------------------------------------------------
      try {
        res = await octokit.rest.pulls.create(
          {
            owner: repository.owner,
            repo: repository.repo,
            base: mergeList[i + 1],
            head: mergeList[i],
            title: `Automatic merge from ${mergeList[i]} -> ${mergeList[i + 1]}`,
            body: 'This PR was created automatically by the cascading downstream merge action.'
          }
        )
      } catch (error) { // could not create the PR
        const errorResponseData = error.response.data
        if (error.status === 422) {
          console.info('Got a 422 error', error)
          if (errorResponseData.errors[0].message.startsWith('No commits between')) {
            await octokit.rest.issues.createComment({
              owner: repository.owner,
              repo: repository.repo,
              issue_number: pullNumber,
              body: `Skipping creation of cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"
              There are no commits between these branches. Continuing auto-merge action...`
            })
            continue
          } else if (errorResponseData.errors[0].message.startsWith('A pull request already exists')) {
            await octokit.rest.issues.createComment({
              owner: repository.owner,
              repo: repository.repo,
              issue_number: pullNumber,
              body: `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"
              but there is already a pull request open. Can't continue auto-merge action.`
            })
            success = false
            break
          }
        } else {
          const issueNumber = (await octokit.rest.issues.create(
            {
              owner: repository.owner,
              repo: repository.repo,
              assignees: [actor],
              title: ':heavy_exclamation_mark: Problem with cascading Auto-Merge',
              body: `Unknown issue when creating a PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"
              Please try to resolve the issue. **Cascading Auto-Merge has been stopped!**
              error: "${JSON.stringify(errorResponseData)}"`
            }
          )).data.number
          await octokit.rest.issues.createComment({
            owner: repository.owner,
            repo: repository.repo,
            issue_number: pullNumber,
            body: `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__" but encountered an issue: "${JSON.stringify(errorResponseData)}".
            Created an issue #${issueNumber}. Can't continue auto-merge action.`
          })
          // stop the cascading auto-merge
          console.error(error)
          success = false
          break
        }
      }

      await octokit.rest.issues.createComment({
        owner: repository.owner,
        repo: repository.repo,
        issue_number: pullNumber,
        body: `Created cascading Auto-Merge PR #${res.data.number} to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"`
      })

      // -----------------------------------------------------------------------------------------------------------------
      // MERGE the PR
      // -----------------------------------------------------------------------------------------------------------------
      try {
        await mergeOctokit.rest.pulls.merge({
          owner: repository.owner,
          repo: repository.repo,
          pull_number: res.data.number
        })
      } catch (error) {
        const errorResponseData = error.response.data

        if (error.status === 405) {
          console.info('got a 405 error', error)
          // put a comment in the original PR, noting that the cascading failed
          const issueNumber = (await octokit.rest.issues.create(
            {
              owner: repository.owner,
              repo: repository.repo,
              assignees: [actor],
              title: ':heavy_exclamation_mark: Problem with cascading Auto-Merge. Ran into a merge conflict.',
              body: `Issue with cascading auto-merge, please try to resolve the merge conflicts - PR #${res.data.number}.
              **Cascading Auto-Merge has been stopped!**
              Originating PR #${pullNumber}`
            }
          )).data.number
          await octokit.rest.issues.createComment({
            owner: repository.owner,
            repo: repository.repo,
            issue_number: pullNumber,
            body: `:heavy_exclamation_mark: Could not auto merge PR #${res.data.number} due to merge conflicts.
            Created an issue #${issueNumber}. Can't continue auto-merge action.`
          })
          success = false
          break
        } else {
          console.error(error)
          const issueNumber = (await octokit.rest.issues.create(
            {
              owner: repository.owner,
              repo: repository.repo,
              assignees: [actor],
              title: ':heavy_exclamation_mark: Problem with cascading Auto-Merge.',
              body: `Issue with auto-merging a PR.
              Please try to resolve the Issue. **Cascading Auto-Merge has been stopped!**
              Originating PR #${pullNumber}
              ${JSON.stringify(errorResponseData)}`
            }
          )).data.number
          await octokit.rest.issues.createComment({
            owner: repository.owner,
            repo: repository.repo,
            issue_number: pullNumber,
            body: `:heavy_exclamation_mark: Tried merge PR #${res.data.number} to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__" but encountered an issue: "${JSON.stringify(errorResponseData)}".
            Created an issue #${issueNumber}. Can't continue auto-merge action.`
          })
          success = false
          break
        }
      }
    }
  }
  if (success) {
    await octokit.rest.issues.createComment({
      owner: repository.owner,
      repo: repository.repo,
      issue_number: pullNumber,
      body: ':white_check_mark: Auto-merge was successful.'
    })
  } else {
    await octokit.rest.issues.createComment({
      owner: repository.owner,
      repo: repository.repo,
      issue_number: pullNumber,
      body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
    })
  }
}

/**
* @function getRepoBranchMergeOrder
* @description
*  Filter repository branches based on a 'prefix/' and return an ordered list.
*  This function requires that the branches use semantic versioning
*  Example:
*    release/1.0.1-rc.1
*
* @param prefix
* @param headBranch
* @param branches
*/
function getBranchMergeOrder (prefix, headBranch, branches) {
  // create a list from the 'branches' array, containing only branch names with prefix
  const branchList = branches
    .map(branch => branch.name)
    .filter(branch => branch.startsWith(prefix))

  console.log('getBranchMergeOrder - branchList: ', branchList)

  // sort based on branch ordering algorithm (https://confluence.atlassian.com/bitbucketserver/cascading-merge-776639993.html)
  const orderedBranchList = bitbucketBranchOrderingAlgorithm(branchList, headBranch)

  console.log('getBranchMergeOrder - orderedBranchList: ', orderedBranchList)

  const headIndex = orderedBranchList.indexOf(headBranch)

  // this shouldn't happen, but best to avoid any merges if it does
  if (headIndex === -1) {
    return []
  }

  // return only the versions that are 'younger' than the PR version
  return orderedBranchList.slice(headIndex)
}

/**
 * @function bitbucketBranchOrderingAlgorithm
 * @description Algorithm copied from the {@link https://confluence.atlassian.com/bitbucketserver/cascading-merge-776639993.html bitbucket documentation} 
 * 
 * 1. Branches are selected and ordered on the basis of the name of the
 *    branch that started the cascade (i.e. the target of the pull
 *    request for the merge).
 * 
 * 2. Branch names are split into tokens using any of these characters:
 *    underscore '_', hyphen '-', plus'+', or period '.'.
 * 
 * 3. Only branches matching the name of the pull request target are
 *    added into the merge path. Matching means that every token before
 *    the first numeric token must be equal to the corresponding tokens
 *    of the target branch's name.
 * 
 * 4. Branches are ordered by number, if a given token is numeric. When
 *    comparing a numeric token with an ASCII token, the numeric is
 *    ranked higher (that is, it is considered as being a newer
 *    version).
 * 
 * 5. If both tokens are non-numeric, a simple ASCII comparison is used
 * 
 * 6. In the unlikely case of the above algorithm resulting in equality
 *    of 2 branch names, a simple string comparison is performed on the
 *    whole branch name.
 * 
 * @param {string[]} branchList
 * @param {string} targetBranch
 * @returns The ordered branches for the cascade merge
 */
function bitbucketBranchOrderingAlgorithm(branchList, targetBranch) {
  const branchPrefix = targetBranch.slice(0, targetBranch.match(/\d/)?.index);
  if (!branchPrefix) {
    return [];
  }

  return branchList
    // condition #1 and #3 - filtering
    .filter(b => b.startsWith(branchPrefix))
    // condition #2 - tokenize from / - + _ .
    .map(b => ({
      original: b,
      tokenized: b.split(/[\/\-\+\_\.]/)
    }))
    // condition #4 and #5 and #6 - comparisons
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.tokenized.length, b.tokenized.length); i++) {
        // skip if equivalent
        if (a.tokenized[i] === b.tokenized[i]) {
          continue
        }

        // handle release/2023 vs release/2023.05
        if (i >= a.tokenized.length) {
          return -1
        } else if (i >= b.tokenized.length) {
          return 1
        }

        // actual comparison starts here
        const numberA = parseInt(a.tokenized[i], 10)
        const numberB = parseInt(b.tokenized[i], 10)

        // condition #4
        if (!isNaN(numberA)) {
          if (!isNaN(numberB)) { // both numbers
            return numberA - numberB
          } else { // a is number, b is string
            return -1
          }
        } else if (!isNaN(numberB)) { // a is string, b is number
          return 1
        }

        // condition #5 - both strings
        return a.tokenized[i] > b.tokenized[i] ? 1 : -1
      }

      // condition #6
      return a.original > b.original ? 1 : -1
    })
    .map(b => b.original)
}

module.exports = {
  cascadingBranchMerge
}
