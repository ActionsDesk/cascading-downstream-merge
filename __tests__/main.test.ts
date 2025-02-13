import { jest } from '@jest/globals'
import * as core from '../__fixtures__/@actions/core.js'
import * as github from '../__fixtures__/@actions/github.js'
import * as octokit from '../__fixtures__/@octokit/rest.js'
import type { cascadingBranchMerge } from '../src/cascading-branch-merge.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('@octokit/rest', async () => {
  class Octokit {
    constructor() {
      return octokit
    }
  }

  return {
    Octokit
  }
})

const cascadingBranchMergeMock = jest.fn<typeof cascadingBranchMerge>()

jest.unstable_mockModule('../src/cascading-branch-merge.js', async () => ({
  cascadingBranchMerge: cascadingBranchMergeMock
}))

const main = await import('../src/main.js')

describe('main', () => {
  beforeEach(() => {
    core.getInput
      .mockReset()
      .mockReturnValueOnce('MY_EXAMPLE_TOKEN') // github_token
      .mockReturnValueOnce('MY_MERGE_TOKEN') // merge_token
      .mockReturnValueOnce('release/,hotfix/,feature/') // prefixes
      .mockReturnValueOnce('development') // ref_branch
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Calls cascading branch merge if the PR was merged', async () => {
    await main.run()

    expect(core.getInput).toHaveBeenCalledTimes(4)
    expect(cascadingBranchMergeMock).toHaveBeenCalledTimes(1)
  })

  it('Does not create the merge Octokit instance', async () => {
    core.getInput
      .mockReset()
      .mockReturnValueOnce('MY_EXAMPLE_TOKEN') // github_token
      .mockReturnValueOnce('') // merge_token
      .mockReturnValueOnce('release/,hotfix/,feature/') // prefixes
      .mockReturnValueOnce('development') // ref_branch

    await main.run()

    expect(core.getInput).toHaveBeenCalledTimes(4)
    expect(cascadingBranchMergeMock).toHaveBeenCalledTimes(1)
  })

  it('Does nothing if the PR was not merged', async () => {
    github.context.payload.pull_request.merged = false

    await main.run()

    expect(core.getInput).toHaveBeenCalledTimes(4)
    expect(cascadingBranchMergeMock).not.toHaveBeenCalled()
  })
})
