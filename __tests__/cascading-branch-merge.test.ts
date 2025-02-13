import { jest } from '@jest/globals'
import { RequestError } from '@octokit/request-error'
import { Endpoints } from '@octokit/types'
import * as core from '../__fixtures__/@actions/core.js'
import * as github from '../__fixtures__/@actions/github.js'
import * as octokit from '../__fixtures__/@octokit/rest.js'

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

const automerge = await import('../src/cascading-branch-merge.js')

const { Octokit } = await import('@octokit/rest')
const mocktokit = jest.mocked(new Octokit())

describe('Cascading Branch Merge', () => {
  beforeEach(() => {
    mocktokit.paginate.mockReturnValue([
      { name: 'release/1.0' },
      { name: 'release/1.2' },
      { name: 'release/1.3' },
      { name: 'develop' }
    ] as any)

    mocktokit.rest.pulls.create.mockResolvedValue({
      data: { number: 13 }
    } as Endpoints['POST /repos/{owner}/{repo}/pulls']['response'])

    mocktokit.rest.issues.create.mockResolvedValue({
      data: { number: 40 }
    } as Endpoints['POST /repos/{owner}/{repo}/issues']['response'])
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Performs a simple cascade', async () => {
    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      github.context.actor
    )

    expect(mocktokit.paginate).toHaveBeenCalledWith(
      mocktokit.rest.repos.listBranches,
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo
      }
    )

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(3)
    expect(mocktokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base: 'release/1.2',
      head: 'release/1.0',
      title: expect.anything(),
      body: expect.anything()
    })
    expect(mocktokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base: 'release/1.3',
      head: 'release/1.2',
      title: expect.anything(),
      body: expect.anything()
    })
    expect(mocktokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base: 'develop',
      head: 'release/1.3',
      title: expect.anything(),
      body: expect.anything()
    })

    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledTimes(4)
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':white_check_mark: Auto-merge was successful.'
    })

    expect(mocktokit.rest.issues.create).not.toHaveBeenCalled()
  })

  it('Fixing a conflict continues the cascade', async () => {
    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'release/1.2',
      'release/1.3',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      github.context.actor
    )

    expect(mocktokit.paginate).toHaveBeenCalledWith(
      mocktokit.rest.repos.listBranches,
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo
      }
    )

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(2)
    expect(mocktokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base: 'release/1.3',
      head: 'release/1.2',
      title: expect.anything(),
      body: expect.anything()
    })
    expect(mocktokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base: 'develop',
      head: 'release/1.3',
      title: expect.anything(),
      body: expect.anything()
    })

    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledTimes(3)
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':white_check_mark: Auto-merge was successful.'
    })

    expect(mocktokit.rest.issues.create).not.toHaveBeenCalled()
  })

  it('Adds a comment if there are no commits for a PR', async () => {
    const error = new RequestError('Validation Failed', 422, {
      request: {
        method: 'POST',
        url: 'https://api.github.com/foo',
        body: {
          bar: 'baz'
        },
        headers: {
          authorization: 'token secret123'
        }
      },
      response: {
        status: 422,
        url: 'https://api.github.com/foo',
        headers: {
          'x-github-request-id': '1:2:3:4'
        },
        data: {
          message: 'Validation Failed',
          errors: [
            {
              message: 'No commits between develop and develop'
            }
          ]
        }
      }
    })

    mocktokit.rest.pulls.create
      .mockReset()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        data: { number: 13 }
      } as Endpoints['POST /repos/{owner}/{repo}/pulls']['response'])

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.2',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      github.context.actor
    )

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(2)
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: expect.stringMatching(/.*There are no commits between.*/)
    })
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: expect.stringMatching(/.*Created cascading Auto-Merge.*/)
    })
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':white_check_mark: Auto-merge was successful.'
    })

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(2)

    expect(mocktokit.rest.issues.create).not.toHaveBeenCalled()
  })

  it('Breaks if a PR already exists', async () => {
    const error = new RequestError('Validation Failed', 422, {
      request: {
        method: 'POST',
        url: 'https://api.github.com/foo',
        body: {
          bar: 'baz'
        },
        headers: {
          authorization: 'token secret123'
        }
      },
      response: {
        status: 422,
        url: 'https://api.github.com/foo',
        headers: {
          'x-github-request-id': '1:2:3:4'
        },
        data: {
          message: 'Validation Failed',
          errors: [
            {
              message: 'A pull request already exists'
            }
          ]
        }
      }
    })

    mocktokit.rest.pulls.create.mockRejectedValue(error)

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      github.context.actor
    )

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(1)

    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: expect.stringMatching(/.*already a pull request open/)
    })
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
    })

    expect(mocktokit.rest.issues.create).not.toHaveBeenCalled()
  })

  it('Opens an issue if an unhandled error occurs', async () => {
    const error = new RequestError('Validation Failed', 500, {
      request: {
        method: 'POST',
        url: 'https://api.github.com/foo',
        body: {
          bar: 'baz'
        },
        headers: {
          authorization: 'token secret123'
        }
      },
      response: {
        status: 500,
        url: 'https://api.github.com/foo',
        headers: {
          'x-github-request-id': '1:2:3:4'
        },
        data: {
          message: 'Some Unhandled Error',
          errors: [
            {
              message: 'Unhandled Exception'
            }
          ]
        }
      }
    })

    mocktokit.rest.pulls.create.mockRejectedValue(error)

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      'handle'
    )

    expect(mocktokit.rest.issues.create).toHaveBeenCalledTimes(1)
    expect(mocktokit.rest.issues.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      assignees: ['handle'],
      title: expect.any(String),
      body: expect.stringMatching(/^Unknown issue when creating.*/)
    })

    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: expect.stringMatching(/.*encountered an issue.*/)
    })
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
    })

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(1)
  })

  it('Adds a comment and breaks if a merge conflict exists', async () => {
    const error = new RequestError('Validation Failed', 405, {
      request: {
        method: 'POST',
        url: 'https://api.github.com/merge',
        body: {
          bar: 'baz'
        },
        headers: {
          authorization: 'token secret123'
        }
      },
      response: {
        status: 405,
        url: 'https://api.github.com/merge',
        headers: {
          'x-github-request-id': '1:2:3:4'
        },
        data: {
          message: 'Merge conflict',
          errors: [
            {
              message: 'Merge conflict'
            }
          ]
        }
      }
    })

    mocktokit.rest.pulls.merge.mockRejectedValue(error)

    mocktokit.rest.pulls.create.mockResolvedValue({
      data: { number: 13 }
    } as Endpoints['POST /repos/{owner}/{repo}/pulls']['response'])

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.2',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      'handle'
    )

    expect(mocktokit.rest.issues.create).toHaveBeenCalledTimes(1)
    expect(mocktokit.rest.issues.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      assignees: ['handle'],
      title: expect.any(String),
      body: expect.stringMatching(/.*PR #13.*/)
    })

    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: expect.stringMatching(
        /.*Could not auto merge PR #13 due to merge conflicts.*/
      )
    })
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
    })

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(1)

    expect(mocktokit.rest.pulls.merge).toHaveBeenCalledTimes(1)
  })

  it('Breaks if an unhandled error occurs merging a PR', async () => {
    const error = new RequestError('Validation Failed', 500, {
      request: {
        method: 'POST',
        url: 'https://api.github.com/foo',
        body: {
          bar: 'baz'
        },
        headers: {
          authorization: 'token secret123'
        }
      },
      response: {
        status: 500,
        url: 'https://api.github.com/foo',
        headers: {
          'x-github-request-id': '1:2:3:4'
        },
        data: {
          message: 'Some Unhandled Error',
          errors: [
            {
              message: 'Unhandled Exception'
            }
          ]
        }
      }
    })

    mocktokit.rest.pulls.merge.mockRejectedValue(error)

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      github.context.repo.owner,
      github.context.repo.repo,
      mocktokit,
      mocktokit,
      12,
      'handle'
    )

    expect(mocktokit.rest.issues.create).toHaveBeenCalledTimes(1)
    expect(mocktokit.rest.issues.create).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      assignees: ['handle'],
      title: expect.any(String),
      body: expect.stringMatching(/^Issue with auto-merging a PR*/)
    })

    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: expect.any(String)
    })
    expect(mocktokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: 12,
      body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
    })

    expect(mocktokit.rest.pulls.create).toHaveBeenCalledTimes(1)
  })

  it('getBranchMergeOrder returns ordered branches ignoring non-matching prefix', () => {
    const response = automerge.getBranchMergeOrder(
      'release/',
      'release/2022.02',
      [
        { name: 'release/2022.02' } as any,
        { name: 'feature/10.2' } as any,
        { name: 'release/2022.01' } as any,
        { name: 'release/2022.02.4' } as any,
        { name: 'release/2022.05' } as any,
        { name: 'release/2023.05' } as any,
        { name: 'release-123' } as any
      ]
    )

    expect(response).toEqual([
      'release/2022.02',
      'release/2022.02.4',
      'release/2022.05',
      'release/2023.05'
    ])
  })

  it('getBranchMergeOrder no prefix matches returns an empty list', () => {
    const response = automerge.getBranchMergeOrder('release/', 'develop', [
      { name: 'feature/10.2' } as any,
      { name: 'develop' } as any
    ])

    expect(response).toEqual([])
  })

  it('getBranchMergeOrder returns ordered branches with semantic year branch name with underscore', () => {
    const response = automerge.getBranchMergeOrder(
      'release/',
      'release/2022_06',
      [
        { name: 'release/2022_02' } as any,
        { name: 'release/2022_02_4' } as any,
        { name: 'release/2022_05' } as any,
        { name: 'release/2022_07' } as any,
        { name: 'release/2022_06' } as any,
        { name: 'release/2023_05' } as any
      ]
    )

    expect(response).toEqual([
      'release/2022_06',
      'release/2022_07',
      'release/2023_05'
    ])
  })

  it('getBranchMergeOrder returns ordered branches with semantic year branch name with underscore or periods', () => {
    const response = automerge.getBranchMergeOrder(
      'release/',
      'release/2022_06',
      [
        { name: 'release/2023_05' } as any,
        { name: 'release/2022_05' } as any,
        { name: 'release/2022_07' } as any,
        { name: 'release/2022_02_4' } as any,
        { name: 'release/2022_02' } as any,
        { name: 'release/2022_06' } as any,
        { name: 'release/2022.08' } as any
      ]
    )

    expect(response).toEqual([
      'release/2022_06',
      'release/2022_07',
      'release/2022.08',
      'release/2023_05'
    ])
  })
  it('getBranchMergeOrder returns ordered branches with semantic year branch name with underscore and periods', () => {
    const response = automerge.getBranchMergeOrder(
      'release/',
      'release/2022_04.2',
      [
        { name: 'release/2022_05.2' } as any,
        { name: 'release/2022_07' } as any,
        { name: 'release/2022_04.4' } as any,
        { name: 'release/2022_03.2' } as any,
        { name: 'release/2022_04.3.1' } as any,
        { name: 'release/2022_04.2' } as any,
        { name: 'release/2022_06' } as any,
        { name: 'release/2022_08' } as any
      ]
    )

    expect(response).toEqual([
      'release/2022_04.2',
      'release/2022_04.3.1',
      'release/2022_04.4',
      'release/2022_05.2',
      'release/2022_06',
      'release/2022_07',
      'release/2022_08'
    ])
  })
})
