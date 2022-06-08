jest.mock('@actions/github')
const { RequestError } = require("@octokit/request-error");
const github = require('@actions/github')

github.getOctokit = jest.fn().mockImplementation(() => {
  return {
    rest: {
      repos: {
        listBranches: jest.fn().mockReturnValue({
          data: [
            {name: 'release/1.0'},
            {name: 'release/1.2'},
            {name: 'release/1.3'},
            {name: 'main'}
          ]
        })
      },
      pulls: {
        create: jest.fn().mockReturnValue({
          data: {number: 13}
        }),
        merge: jest.fn().mockReturnValue({})
      },
      issues: {
        createComment: jest.fn().mockReturnValue({})
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
    octokit = new github.getOctokit('token')
    exampleRepo = {
      owner: 'ActionsDesk',
      repo: 'hello-world'
    }
  })

  test('Happy path simple cascade', async () => {

    await automerge.cascadingBranchMerge(
      ['release/'],
      'main',
      'my-feature',
      'release/1.0',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )

    expect.assertions(6)

    expect(octokit.rest.repos.listBranches).toHaveBeenCalledWith(
      {
        "owner": "ActionsDesk",
        "repo": "hello-world",
        "per_page": 100
      }
    );
    
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        "owner": "ActionsDesk",
        "repo": "hello-world",
        "base": "release/1.2",
        "head": "release/1.0",
        "title": expect.anything(),
        "body": expect.anything()
      }
    );
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      {
        "owner": "ActionsDesk",
        "repo": "hello-world",
        "base": "main",
        "head": "my-feature",
        "title": expect.anything(),
        "body": expect.anything()
      }
    );
    expect(octokit.rest.pulls.create).toHaveBeenCalledTimes(3)

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        "owner": "ActionsDesk",
        "repo": "hello-world",
        "issue_number": 12,
        "body": expect.anything()
      }
    );
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(3)
    
  })

  test('Check no commits between opens issue', async () => {

    const error = new RequestError( 'Validation Failed', 422, {
      request: {
        method: "POST",
        url: "https://api.github.com/foo",
        body: {
          bar: "baz",
        },
        headers: {
          authorization: "token secret123",
        },
      },
      response: {
        status: 422,
        url: "https://api.github.com/foo",
        headers: {
          "x-github-request-id": "1:2:3:4",
        },
        data: {
          message: "Validation Failed",
          errors: [
            {
                "resource": "PullRequest",
                "code": "custom",
                "message": "No commits between main and main"
            }
        ],
        }
      },
    });
    
    
    octokit.rest.pulls.create.mockImplementation(() => {
      throw error;
    });

    await automerge.cascadingBranchMerge(
      ['release/'],
      'main',
      'my-feature',
      'release/1.2',
      exampleRepo,
      octokit,
      octokit,
      12,
      'handle'
    )
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      {
        "owner": "ActionsDesk",
        "repo": "hello-world",
        "issue_number": 12,
        "body": expect.stringMatching(/.*there are no commits between.*/)
      }
    );

  })
})