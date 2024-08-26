
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
 * @param headBranch
 * @param baseBranch
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
  let branchList = []
  // create a list from the 'branches' array, containing only branch names
  branches.forEach(function (branch) {
    branchList.push(branch.name)
  })

  // filter the branch names that start with the required prefix
  branchList = branchList.filter(b => b.startsWith(prefix))

  console.log('getBranchMergeOrder - branchList: ', branchList)

  branchList.sort((a, b) => isBiggerThan(semanticVersionToArray(a), semanticVersionToArray(b)) ? 1 : -1);

  // return only the versions that are 'younger' than the PR version
  if (branchList.length !== 0) {
    while (branchList[0] !== headBranch) {
      branchList.shift()
    }
  }

  return branchList
}

/**
* @function isBiggerThan
* @description Compare the semantic versions v1 > v2 ?
*
* @param {number[]} v1
* @param {number[]} v2
* @returns {boolean} Returns true if v1 is greater than v2, otherwise false
*/
function isBiggerThan(v1, v2) {
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const val1 = v1[i] || 0;
    const val2 = v2[i] || 0;
    if (val1 !== val2) {
      return val1 > val2;
    }
  }
  return false;
}
/**
* @function semanticVersionToArray
* @description Translate the 'string' type version to a 'number' type array
*  Example
*     input: "release/1.1-rc.1"
*    output: [1,1,-1,1]
*
* @param vStr
*/
function semanticVersionToArray (vStr) {
  // creating a 'lookup' table for the semantic versioning, to translate the 'release-name' to a number
  // Use negative numbers to always come before 'final' releases
  const preRelease = new Map()
  preRelease.set('alpha', -3)
  preRelease.set('beta', -2)
  preRelease.set('rc', -1)

  // 1.1.rc.1
  // "release/1.1-rc.1"  -->  ['1','1','rc','1']
  const avTemp = vStr.split('/')[1].split(/_|\.|-/)

  return avTemp.map((v) => {
    if (preRelease.has(v)) {
      return preRelease.get(v)
    }

    if (isNaN(v)) {
      return 0
    }

    return parseInt(v, 10);
  })
}

module.exports = {
  cascadingBranchMerge
}
