
/**
 * @description This class contains the main "Cascading Auto-Merge" code.
 *  Note: All the utility functions are kept within this class,
 *        rather than putting it into the 'utility.ts' file.
 *        That way all required components can be found in one place.
 *
 */

let repository
let originalPullRequestActor
let originalPullRequestNumber
let octokit
let mergeOctokit
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
 * @param repositoryObject
 * @param octokitObject
 * @param mergeOctokitObject
 * @param pullNumber
 * @param actor
 */
async function cascadingBranchMerge (
  prefixes,
  refBranch,
  headBranch,
  baseBranch,
  repositoryObject,
  octokitObject,
  mergeOctokitObject,
  pullNumber,
  actor
) {
  repository = repositoryObject
  originalPullRequestActor = actor
  originalPullRequestNumber = pullNumber
  octokit = octokitObject
  mergeOctokit = mergeOctokitObject

  const branches = (await octokit.rest.repos.listBranches({
    owner: repository.owner,
    repo: repository.repo,
    per_page: 100
  })).data
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
        res = await createPullRequest(
          mergeList[i + 1],
          mergeList[i],
          `Automatic merge from ${mergeList[i]} -> ${mergeList[i + 1]}`
        )
      } catch (error) { // could not create the PR
        const errorResponseData = error.response.data
        if (error.status === 422) {
          console.info('Got a 422 error', error)
          if (errorResponseData.errors[0].message.startsWith('No commits between')) {
            await addCommentToOriginalPullRequest(
              `Skipping creation of cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"
              There are no commits between these branches. Continuing auto-merge action...`
            )
            continue
          } else if (errorResponseData.errors[0].message.startsWith('A pull request already exists')) {
            await addCommentToOriginalPullRequest(
              `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"
              but there is already a pull request open. Can't continue auto-merge action.`
            )
            success = false
            break
          }
        } else {
          const issueNumber = (await createIssue(
            ':heavy_exclamation_mark: Problem with cascading Auto-Merge',
            `Unknown issue when creating a PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"
            Please try to resolve the issue. **Cascading Auto-Merge has been stopped!**
            error: "${JSON.stringify(errorResponseData)}"`
          )).data.number
          await addCommentToOriginalPullRequest(
            `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__" but encountered an issue: "${JSON.stringify(errorResponseData)}".
            Created an issue #${issueNumber}. Can't continue auto-merge action.`
          )
          // stop the cascading auto-merge
          console.error(error)
          success = false
          break
        }
      }

      await addCommentToOriginalPullRequest(
        `Created cascading Auto-Merge PR #${res.data.number} to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__"`
      )

      // -----------------------------------------------------------------------------------------------------------------
      // MERGE the PR
      // -----------------------------------------------------------------------------------------------------------------
      try {
        await mergePullRequest(res.data.number)
      } catch (error) {
        const errorResponseData = error.response.data

        if (error.status === 405) {
          console.info('got a 405 error', error)
          // put a comment in the original PR, noting that the cascading failed
          const issueNumber = (await createIssue(
            ':heavy_exclamation_mark: Problem with cascading Auto-Merge. Ran into a merge conflict.',
            `Issue with cascading auto-merge, please try to resolve the merge conflicts - PR #${res.data.number}.
            **Cascading Auto-Merge has been stopped!**
            Originating PR #${originalPullRequestNumber}`
          )).data.number
          await addCommentToOriginalPullRequest(
            `:heavy_exclamation_mark: Could not auto merge PR #${res.data.number} due to merge conflicts.
            Created an issue #${issueNumber}. Can't continue auto-merge action.`
          )
          success = false
          break
        } else {
          console.error(error)
          const issueNumber = (await createIssue(
            ':heavy_exclamation_mark: Problem with cascading Auto-Merge.',
            `Issue with auto-merging a PR.
            Please try to resolve the Issue. **Cascading Auto-Merge has been stopped!**
            Originating PR #${originalPullRequestNumber}
            ${JSON.stringify(errorResponseData)}`
          )).data.number
          await addCommentToOriginalPullRequest(
            `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${mergeList[i]}__" into "__${mergeList[i + 1]}__" but encountered an issue: "${JSON.stringify(errorResponseData)}".
            Created an issue #${issueNumber}. Can't continue auto-merge action.`
          )
          success = false
          break
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The final merge in the automatic cascade will be to the 'refBranch' if provided.
  // ---------------------------------------------------------------------------
  // let ref
  // if (refBranch) {
  //   try {
  //     ref = await createPullRequest(
  //       refBranch,
  //       headBranch,
  //       `Automatic Merge: ${headBranch} -> ${refBranch}`
  //     )
  //   } catch (error) {
  //     const errorResponseData = error.response.data
  //     if (error.status === 422) {
  //       console.info('Got a 422 error', error)
  //       if (errorResponseData.errors[0].message.startsWith('No commits between')) {
  //         await addCommentToOriginalPullRequest(
  //           `Skipping creation of cascading PR to merge "__${headBranch}__" into "__${refBranch}__"
  //           There are no commits between these branches. Continuing auto-merge action...`
  //         )
  //         await addCommentToOriginalPullRequest(':white_check_mark: Auto-merge was successful.')
  //         return // success
  //       } else if (errorResponseData.errors[0].message.startsWith('A pull request already exists')) {
  //         await addCommentToOriginalPullRequest(
  //           `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${headBranch}__" into "__${refBranch}__"
  //           but there is already a pull request open. Can't continue auto-merge action.`
  //         )
  //         success = false
  //         await addCommentToOriginalPullRequest(':bangbang: Auto-merge action did not complete successfully. Please review issues.')
  //         return
  //       } else {
  //         const issueNumber = (await createIssue(
  //           ':heavy_exclamation_mark: Problem with cascading Auto-Merge',
  //           `Unknown issue when creating a PR to merge "__${headBranch}__" into refBranch "__${refBranch}__"
  //           Please try to resolve the issue. **Cascading Auto-Merge has been stopped!**
  //           error: "${JSON.stringify(errorResponseData)}"`
  //         )).data.number
  //         await addCommentToOriginalPullRequest(
  //           `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${headBranch}__" into refBranch "__${refBranch}__" but encountered an issue: "${JSON.stringify(errorResponseData)}".
  //           Created an issue #${issueNumber}. Can't continue auto-merge action.`
  //         )
  //         // stop the cascading auto-merge
  //         console.error(error)
  //         success = false
  //         await addCommentToOriginalPullRequest(':bangbang: Auto-merge action did not complete successfully. Please review issues.')
  //         return // with error
  //       }
  //     }
  //   }
  //   try {
  //     await addCommentToOriginalPullRequest(
  //       `Created cascading Auto-Merge PR #${ref.data.number} to merge "__${headBranch}__" into the refBranch "__${refBranch}__"`
  //     )

  //     // MERGE the PR
  //     await mergePullRequest(ref.data.number)
  //   } catch (error) { // could not create the PR
  //     const errorResponseData = error.response.data
  //     if (error.status === 405) {
  //       console.info('got a 405 error:', error)
  //       const issueNumber = (await createIssue(
  //         ':heavy_exclamation_mark: Problem with cascading Auto-Merge. Ran into a merge conflict.',
  //         `Issue with cascading auto-merge, please try to resolve the merge conflicts - PR #${ref.data.number}.
  //         **Cascading Auto-Merge has been stopped!**
  //         Originating PR #${originalPullRequestNumber}`
  //       )).data.number
  //       await addCommentToOriginalPullRequest(
  //         `:heavy_exclamation_mark: Could not auto merge PR #${ref.data.number} due to merge conflicts.
  //         Created an issue #${issueNumber}. Can't continue auto-merge action.`
  //       )
  //       success = false
  //     } else {
  //       console.error(error)
  //       const issueNumber = await createIssue(
  //         ':heavy_exclamation_mark: Problem with cascading Auto-Merge.',
  //         `Issue with auto-merging a PR.
  //         Please try to resolve the Issue. **Cascading Auto-Merge has been stopped!**
  //         Originating PR #${originalPullRequestNumber}
  //         ${JSON.stringify(errorResponseData)}`
  //       )
  //       await addCommentToOriginalPullRequest(
  //         `:heavy_exclamation_mark: Tried to create a cascading PR to merge "__${headBranch}__" into "__${refBranch}__" but encountered an issue: "${JSON.stringify(errorResponseData)}".
  //         Created an issue #${issueNumber}. Can't continue auto-merge action.`
  //       )
  //       success = false
  //     }
  //   }
  // }
  if (success) {
    await addCommentToOriginalPullRequest(':white_check_mark: Auto-merge was successful.')
  } else {
    await addCommentToOriginalPullRequest(':bangbang: Auto-merge action did not complete successfully. Please review issues.')
  }
}

function createPullRequest (base, head, title) {
  return octokit.rest.pulls.create({
    owner: repository.owner,
    repo: repository.repo,
    base,
    head,
    title,
    body: 'This PR was created automatically by the cascading downstream merge action.'
  })
}

function addCommentToOriginalPullRequest (body) {
  return octokit.rest.issues.createComment({
    owner: repository.owner,
    repo: repository.repo,
    issue_number: originalPullRequestNumber,
    body
  })
}

function mergePullRequest (pullRequestNumber) {
  return mergeOctokit.rest.pulls.merge({
    owner: repository.owner,
    repo: repository.repo,
    pull_number: pullRequestNumber
  })
}

function createIssue (title, body) {
  return octokit.rest.issues.create({
    owner: repository.owner,
    repo: repository.repo,
    assignees: [originalPullRequestActor],
    title,
    body
  })
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

  const len = branchList.length

  console.log('getBranchMergeOrder - branchList: ', branchList)
  // Bubble Sort - I know... but it's fine for our purpose
  for (let j = 0; j < len - 1; j++) {
    for (let i = 0; i < len - 1; i++) {
      const res = isBiggerThan(semanticVersionToArray(branchList[i]), semanticVersionToArray(branchList[i + 1]))

      if (res) {
        swap(branchList, i, i + 1)
      }
    }
  }

  // return only the versions that are 'younger' than the PR version
  while (branchList[0] !== headBranch) {
    branchList.shift()
  }

  return branchList
}

/**
* @function swap
* @description Simple support utility for sorting arrays
*
* @param arr
* @param first_Index
* @param second_Index
*/
function swap (arr, index1, index2) {
  const temp = arr[index1]
  arr[index1] = arr[index2]
  arr[index2] = temp
}

/**
* @function isBiggerThan
* @description Compare the semantic versions v1 > v2 ?
*
* @param v1
* @param v2
*/
function isBiggerThan (v1, v2) {
  for (let i = 0; i < 5; i++) {
    if (v1[i] === v2[i]) {
      continue
    } else if (v1[i] > v2[i]) {
      return true
    } else {
      return false
    }
  }
  return false
}
/**
* @function semanticVersionToArray
* @description Translate the 'string' type version to a normalized (5 digits) 'number' type array
*  Example
*     input: "release/1.1-rc.1"
*    output: [1,1,0,3,1]
*
* @param vStr
*/
function semanticVersionToArray (vStr) {
  // creating a 'lookup' table for the semantic versioning, to translate the 'release-name' to a number
  const preRelease = new Map()
  preRelease.set('alpha', 1)
  preRelease.set('beta', 2)
  preRelease.set('rc', 3)

  const av = []
  // 1.1.rc.1
  // "release/1.1-rc.1"  -->  ['1','1-rc','1']
  const avTemp = vStr.split('/')[1].split(/_|\./)

  avTemp.forEach(function (v, index) {
    // if version contains a 'pre-release' tag
    if (v.includes('-')) {
      const vTemp = v.split('-')
      if (index === 1) {
        // short version number - 1.1-rc
        av.splice(index, 1, parseInt(vTemp[0], 10))
        av.splice(index + 1, 1, 0)
        av.splice(index + 2, 0, preRelease.get(vTemp[1]))
      } else {
        // full version number - 1.1.0-rc
        av.splice(index, 1, parseInt(vTemp[0], 10))
        av.splice(index + 1, 0, preRelease.get(vTemp[1]))
      }
    } else {
      av.push(parseInt(v))
    }
  })

  // make sure we get the standard length (5), fill with 0
  if (av.length < 4) { av[3] = 0 }
  if (av.length < 5) { av[4] = 0 }
  // [1,1,0,3,1]
  return av
}

module.exports = {
  cascadingBranchMerge
}
