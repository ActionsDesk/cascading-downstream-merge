
/**
 * @description This class contains the main "Cascading Auto-Merge" code.
 *  Note: All the utility functions are kept within this class,
 *        rather than putting it into the 'utility.ts' file.
 *        That way all required components can be found in one place.
 *        If we decide to contribute this code back 'upstream',
 *        we can make a decision than on how to structure/refactor the code.
 *
 * TODO: This contains some 'boilerplate' code that can be optimized
 *       possible functions: 'create-PR', 'create-Issue', 'create-Comment', 'merge-PR'
 */

let repository
let originalPullRequestActor
let originalPullRequestNumber
let octokit
let mergeOctokit
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
      try 
      {
        res = await createPullRequest(
          mergeList[i + 1], 
          mergeList[i], 
          'Cascading Auto-Merge: merge [' + mergeList[i] + '] into [' + mergeList[i + 1] + ']'
        )
      } 
      catch (error) 
      { // could not create the PR
        console.info("got an ERROR while trying to create a pr:", error)
        const errorResponseData = error.response.data
        if (error.status === 422) // check for Unprocessable Entity (No commits betwee / already PR open)
        {
          if ( errorResponseData.errors[0].message.startsWith('No commits between'))
          {
            await addCommentToOriginalPullRequest(
              `I Tried to create a cascading PR to merge ${mergeList[i]} into ${mergeList[i + 1]} but there are no commits between these branches. No action needed. continueing the cascading merge.`
            )
            continue
          }
          else if (errorResponseData.errors[0].message.startsWith('A pull request already exists')) 
          {
            await addCommentToOriginalPullRequest(
              `I Tried to create a cascading PR to merge ${mergeList[i]} into ${mergeList[i + 1]} but there is already a pull request open.`
            )
            break
          }
        } 
        else 
        {
          await addCommentToOriginalPullRequest(
            `Tried to create a cascading PR but encountered an issue: ${JSON.stringify(errorResponseData)}`
          )
          // create an Issue in the Repo. that the cascading failed
          await createIssue(
            'Problem with cascading Auto-Merge',
            `Issue with cascading auto-merge, please try to resolve the Issue, if necessary. **Cascading Auto-Merge has been stopped!** ${JSON.stringify(errorResponseData)}`
          )
          // stop the cascading auto-merge
          break
        }
      }

      addCommentToOriginalPullRequest(
        'Created cascading Auto-Merge pull request #' + res.data.number
      )

      // -----------------------------------------------------------------------------------------------------------------
      // MERGE the PR
      // -----------------------------------------------------------------------------------------------------------------
      try 
      {
        await mergePullRequest(res.data.number)
      } 
      catch (error) 
      {
        console.info("got an ERROR while trying to create a pr:", error)
        const errorResponseData = error.response.data

        if (error.status === 405) 
        {
          // put a comment in the original PR, noting that the cascading failed
          await addCommentToOriginalPullRequest('Could not auto merge PR #' + res.data.number + ' Ran into a merge conflict.')
          await createIssue(
            'Problem with cascading Auto-Merge. Ran into a merge conflict.', 
            'Issue with cascading auto-merge, please try to resolve the merge conflict issue. **Cascading Auto-Merge has been stopped!** - PR #' + res.data.number
          )
          // stop the cascading auto-merge
          break
        } 
        else 
        {
          await createIssue(
            'Problem with cascading Auto-Merge.', 
            `Issue with a PR created by cascading auto-merge, please try to resolve the Issue. **Cascading Auto-Merge has been stopped!** ${JSON.stringify(errorResponseData)}`
          )
          break
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Create the last commit, into a specified 'refBranch' (default), if provided.
  // ---------------------------------------------------------------------------
  let ref
  if (refBranch.length > 0) {
    try {
      ref = await createPullRequest(
        refBranch, 
        headBranch, 
        'Cascading Auto-Merge: merge [' + headBranch + '] into [' + refBranch + ']'
      )

      await addCommentToOriginalPullRequest(
        'Created cascading Auto-Merge FINAL pull request #' + ref.data.number
      )

      // MERGE the PR
      await mergePullRequest(ref.data.number)

    } catch (error) { // could not create the PR
      console.info("got an ERROR while trying to create and merge final pr:", error)
      if (error.status === 405) {
        // put a comment in the original PR, noting that merging failed
        await addCommentToOriginalPullRequest(
          'Could not auto merge PR #' + ref.data.number + ' Ran into a merge conflict.'
        )
        // create an Issue to notify Repo users
        await createIssue(
          'Problem with cascading Auto-Merge. Ran into a merge conflict.',
          'Issue with cascading auto-merge, please try to resolve the Issue, if necessary. **Cascading Auto-Merge has been stopped!** - PR #' + ref.data.number
        )

      } else {
        // create a comment in the HEAD Branch PR
        await addCommentToOriginalPullRequest(
          'Issue with cascading auto-merge, please try to resolve the merge conflict issue. **Cascading Auto-Merge has been stopped!** - PR #' + ref.data.number
        )
      }
    }
  }
}


function createPullRequest (base, head, title) {
  return octokit.rest.pulls.create({
    owner: repository.owner,
    repo: repository.repo,
    base: base,
    head: head,
    title: title,
    body: 'This PR was created automatically by the cascading downstream merge action.'
  })
}

function addCommentToOriginalPullRequest (body) {
  return octokit.rest.issues.createComment({
    owner: repository.owner,
    repo: repository.repo,
    issue_number: originalPullRequestNumber,
    body: body
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
    title: title,
    body: body
  })
}

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


function swap (arr, index1, index2) {
  const temp = arr[index1]
  arr[index1] = arr[index2]
  arr[index2] = temp
}


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
