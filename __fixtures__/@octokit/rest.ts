import { jest } from '@jest/globals'
import { Endpoints } from '@octokit/types'

export const graphql = jest.fn()
export const paginate = jest.fn()
export const rest = {
  issues: {
    createComment:
      jest.fn<
        () => Promise<
          Endpoints['POST /repos/{owner}/{repo}/issues/{issue_number}/comments']['response']
        >
      >(),
    create:
      jest.fn<
        () => Promise<
          Endpoints['POST /repos/{owner}/{repo}/issues']['response']
        >
      >()
  },
  pulls: {
    create:
      jest.fn<
        () => Promise<Endpoints['POST /repos/{owner}/{repo}/pulls']['response']>
      >(),
    merge:
      jest.fn<
        () => Promise<
          Endpoints['PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge']['response']
        >
      >()
  },
  repos: {
    listBranches:
      jest.fn<
        () => Promise<
          Endpoints['GET /repos/{owner}/{repo}/branches']['response']['data']
        >
      >()
  }
}
