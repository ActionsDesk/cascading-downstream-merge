jest.mock('@actions/github')
const { RequestError } = require('@octokit/request-error')
const github = require('@actions/github')

github.getOctokit = jest.fn().mockImplementation(() => {
  return {
    paginate: jest.fn().mockReturnValue(
      [
        { name: 'release/1.0' },
        { name: 'release/1.2' },
        { name: 'release/1.3' },
        { name: 'develop' }
      ]
    ),
    rest: {
      repos: {
        listBranches: jest.fn()
      },
      pulls: {
        create: jest.fn().mockReturnValue({
          data: { number: 13 }
        }),
        merge: jest.fn().mockReturnValue({})
      },
      issues: {
        createComment: jest.fn().mockReturnValue({}),
        create: jest.fn().mockReturnValue({ data: { number: 40 } })
      }
    }
  }
})

describe('Cascade branch merge test', () => {
  let octokit
  let exampleRepo
  let automerge
  beforeEach(() => {
    automerge = require('../src/cascading-branch-merge.js')
    octokit = github.getOctokit('token')
    exampleRepo = {
      owner: 'ActionsDesk',
      repo: 'hello-world'
    }
  })

  test('Happy path simple cascade', async () => {
    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(8)

    expect(octokit.paginate).toHaveBeenCalledWith(
      octokit.rest.repos.listBranches,
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        per_page: 100
      },
      expect.anything()
    )

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        base: 'release/1.2',
        head: 'release/1.0',
        title: expect.anything(),
        body: expect.anything()
      }
    )

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        base: 'release/1.3',
        head: 'release/1.2',
        title: expect.anything(),
        body: expect.anything()
      }
    )

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        base: 'develop',
        head: 'release/1.3',
        title: expect.anything(),
        body: expect.anything()
      }
    )
    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(3)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':white_check_mark: Auto-merge was successful.'
      }
    )
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(4)

    expect(octokit.rest.issues.create).not.toHaveBeenCalled()
  })

  test('Fix conflict continues cascade', async () => {
    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'release/1.2',
      'release/1.3',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(7)

    expect(octokit.paginate).toHaveBeenCalledWith(
      octokit.rest.repos.listBranches,
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        per_page: 100
      },
      expect.anything()
    )

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        base: 'release/1.3',
        head: 'release/1.2',
        title: expect.anything(),
        body: expect.anything()
      }
    )

    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        base: 'develop',
        head: 'release/1.3',
        title: expect.anything(),
        body: expect.anything()
      }
    )
    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(2)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':white_check_mark: Auto-merge was successful.'
      }
    )
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(3)

    expect(octokit.rest.issues.create).not.toHaveBeenCalled()
  })

  test('Check create PR no commits between adds comment and continues', async () => {
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

    octokit.rest.pulls.create.mockRejectedValueOnce(error).mockReturnValueOnce({
      data: { number: 13 }
    })

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.2',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(6)

    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(2)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: expect.stringMatching(/.*There are no commits between.*/)
      }
    )

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: expect.stringMatching(/.*Created cascading Auto-Merge.*/)
      }
    )
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':white_check_mark: Auto-merge was successful.'
      }
    )

    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(2)

    expect(octokit.rest.issues.create).not.toHaveBeenCalled()
  })

  test('Check create PR already exists adds a comment and breaks', async () => {
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

    octokit.rest.pulls.create.mockRejectedValue(error)

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(4)

    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(1)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: expect.stringMatching(/.*already a pull request open/)
      }
    )

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
      }
    )

    expect(octokit.rest.issues.create).not.toHaveBeenCalled()
  })

  test('Check create PR unhandled error adds a comment, opens an issue, breaks', async () => {
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

    octokit.rest.pulls.create.mockRejectedValue(error)

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(5)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: expect.stringMatching(/.*encountered an issue.*/)
      }
    )

    expect(octokit.rest.issues.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        assignees: ['handle'],
        title: ':heavy_exclamation_mark: Problem with cascading Auto-Merge',
        body: expect.stringMatching(/^Unknown issue when creating.*/)
      }
    )

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
      }
    )

    expect(octokit.rest.issues.create).toHaveBeenCalledTimes(1)

    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(1)
  })

  test('Check merge PR conflict opens issues, adds comment, and breaks', async () => {
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

    octokit.rest.pulls.merge.mockRejectedValue(error)

    octokit.rest.pulls.create.mockReturnValue({ data: { number: 13 } })

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.2',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(6)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: expect.stringMatching(/.*Could not auto merge PR #13 due to merge conflicts.*/)
      }
    )

    expect(octokit.rest.issues.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        assignees: ['handle'],
        title: ':heavy_exclamation_mark: Problem with cascading Auto-Merge. Ran into a merge conflict.',
        body: expect.stringMatching(/.*PR #13.*/)
      }
    )

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
      }
    )

    expect(octokit.rest.issues.create).toHaveBeenCalledTimes(1)

    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(1)

    expect(octokit.rest.pulls.merge).toHaveBeenCalledTimes(1)
  })

  test('Check merge PR unhandled error adds a comment, opens an issue, breaks', async () => {
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

    octokit.rest.pulls.merge.mockRejectedValue(error)

    await automerge.cascadingBranchMerge(
      ['release/'],
      'develop',
      'my-feature',
      'release/1.0',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(5)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: expect.stringMatching(/.*Tried merge PR #13.*/)
      }
    )

    expect(octokit.rest.issues.create).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        assignees: ['handle'],
        title: ':heavy_exclamation_mark: Problem with cascading Auto-Merge.',
        body: expect.stringMatching(/^Issue with auto-merging a PR.*/)
      }
    )

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        owner: 'ActionsDesk',
        repo: 'hello-world',
        issue_number: 12,
        body: ':bangbang: Auto-merge action did not complete successfully. Please review issues.'
      }
    )

    expect(octokit.rest.issues.create).toHaveBeenCalledTimes(1)

    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(1)
  })

  test('getBranchMergeOrder returns ordered branches with semantic year branch name', async () => {
    const getBranchMergeOrder = automerge.__get__('getBranchMergeOrder')
    const response = await getBranchMergeOrder(
      'release/',
      'release/2022.02',
      [
        { name: 'release/2022.02' },
        { name: 'feature/10.2' },
        { name: 'release/2022.01' },
        { name: 'release/2022.02.4' },
        { name: 'release/2022.05' },
        { name: 'release/2023.05' },
        { name: 'release-123' }
      ]
    )
    expect.assertions(1)

    expect(response).toEqual([
      'release/2022.02',
      'release/2022.02.4',
      'release/2022.05',
      'release/2023.05'
    ])
  })

  test('getBranchMergeOrder no prefix matches returns an empty list', async () => {
    const getBranchMergeOrder = automerge.__get__('getBranchMergeOrder')
    const response = await getBranchMergeOrder(
      'release/',
      'develop',
      [
        { name: 'feature/10.2' },
        { name: 'develop' }
      ]
    )
    expect.assertions(1)

    expect(response).toEqual([])
  })

  test('getBranchMergeOrder returns ordered branches with semantic year branch name with underscore', async () => {
    const getBranchMergeOrder = automerge.__get__('getBranchMergeOrder')
    const response = await getBranchMergeOrder(
      'release/',
      'release/2022_06',
      [
        { name: 'release/2022_02' },
        { name: 'release/2022_02_4' },
        { name: 'release/2022_05' },
        { name: 'release/2022_07' },
        { name: 'release/2022_06' },
        { name: 'release/2023_05' }
      ]
    )
    expect.assertions(1)

    expect(response).toEqual([
      'release/2022_06',
      'release/2022_07',
      'release/2023_05'
    ])
  })

  test('getBranchMergeOrder returns ordered branches with semantic year branch name with underscore or periods', async () => {
    const getBranchMergeOrder = automerge.__get__('getBranchMergeOrder')
    const response = await getBranchMergeOrder(
      'release/',
      'release/2022_06',
      [
        { name: 'release/2023_05' },
        { name: 'release/2022_05' },
        { name: 'release/2022_07' },
        { name: 'release/2022_02_4' },
        { name: 'release/2022_02' },
        { name: 'release/2022_06' },
        { name: 'release/2022.08' }
      ]
    )
    expect.assertions(1)

    expect(response).toEqual([
      'release/2022_06',
      'release/2022_07',
      'release/2022.08',
      'release/2023_05'
    ])
  })
  test('getBranchMergeOrder returns ordered branches with semantic year branch name with underscore and periods', async () => {
    const getBranchMergeOrder = automerge.__get__('getBranchMergeOrder')
    const response = await getBranchMergeOrder(
      'release/',
      'release/2022_04.2',
      [
        { name: 'release/2022_05.2' },
        { name: 'release/2022_07' },
        { name: 'release/2022_04.4' },
        { name: 'release/2022_03.2' },
        { name: 'release/2022_04.3.1' },
        { name: 'release/2022_04.2' },
        { name: 'release/2022_06' },
        { name: 'release/2022_08' }
      ]
    )
    expect.assertions(1)

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
